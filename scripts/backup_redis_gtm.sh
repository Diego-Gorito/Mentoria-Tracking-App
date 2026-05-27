#!/usr/bin/env bash
# =============================================================================
# backup_redis_gtm.sh — Snapshot Redis keys gtm:* → MinIO (daily 03h BRT)
# =============================================================================
#
# Propósito:
#   Mitigação R7 do ADR-0008a §6.1 — preserva audit log + installations do
#   mock storage Redis em backup MinIO 30d retention (LGPD-relevant).
#
# Story:    docs/stories/F-S08.md (AC-1..8)
# ADR:      docs/adr-0008a-mock-storage-mvp-addendum.md §6.1 R7
# Runbook:  docs/runbook-ops.md (procedimento restore + smoke manual)
#
# Estratégia (AC-3 Opção B — key-by-key DUMP em JSONL):
#   1. SCAN keys gtm:*
#   2. Para cada key: DUMP (binário) + base64-encode + TTL → linha JSONL
#   3. tar.gz do JSONL → upload MinIO datado → prune >RETENTION_DAYS
#
#   Vantagens vs RDB full (Opção A):
#     - Não captura metabase:* / track:dedup:* (filter strict at-source)
#     - Restore key-by-key sem flushdb destrutivo no prod
#     - Idempotente: re-running OK
#
# Env vars (defaults entre parênteses):
#   REDIS_HOST       (redis)              hostname Redis interno Easypanel
#   REDIS_PORT       (6379)               porta Redis
#   REDIS_PASSWORD   (vazio)              senha Redis se configurada (AUTH)
#   MINIO_ENDPOINT   (mandatory)          URL S3-compatible (ex: https://s3.colegiomentoria.com.br)
#   MINIO_ACCESS_KEY (mandatory pra mc)   chave acesso MinIO
#   MINIO_SECRET_KEY (mandatory pra mc)   chave secret MinIO
#   MINIO_BUCKET     (tracking-backups)   bucket alvo
#   MINIO_PREFIX     (redis)              prefix dentro do bucket
#   RETENTION_DAYS   (30)                 dias pra reter snapshots
#
# Exit codes:
#   0 — sucesso (upload OK, prune OK)
#   1 — falha Redis (offline, AUTH errado, SCAN failed)
#   2 — falha MinIO (upload, alias, network)
#   3 — env var obrigatória ausente
#
# Logs: JSON estruturado em stdout (Easypanel captura 7d).
#
# Usage:
#   ./backup_redis_gtm.sh           # roda 1 ciclo
#   ./backup_redis_gtm.sh --help    # mostra essa doc
# =============================================================================

set -euo pipefail

# ---------- Help flag ----------
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,52p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

# ---------- Helpers ----------
log() {
  # JSON estruturado: {"ts":"...","level":"...","msg":"...","ctx":{...}}
  local level="$1"; shift
  local msg="$1"; shift
  local ctx="${1:-{\}}"
  printf '{"ts":"%s","level":"%s","msg":"%s","ctx":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$msg" "$ctx"
}

die() {
  local code="$1"; shift
  log "error" "$1" "${2:-{\}}"
  exit "$code"
}

# ---------- Env validation (AC-1, AC-4) ----------
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
MINIO_BUCKET="${MINIO_BUCKET:-tracking-backups}"
MINIO_PREFIX="${MINIO_PREFIX:-redis}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

[[ -z "${MINIO_ENDPOINT:-}" ]] && die 3 "MINIO_ENDPOINT obrigatório" '{"hint":"set in Easypanel env tab"}'

# Redis-cli auth flag opcional
REDIS_AUTH_ARGS=()
[[ -n "$REDIS_PASSWORD" ]] && REDIS_AUTH_ARGS=("-a" "$REDIS_PASSWORD" "--no-auth-warning")

DATE_STAMP="$(date -u +%Y-%m-%d)"
JSONL="/tmp/gtm-snapshot-${DATE_STAMP}.jsonl"
TARBALL="/tmp/gtm-snapshot-${DATE_STAMP}.tar.gz"
REMOTE_PATH="minio/${MINIO_BUCKET}/${MINIO_PREFIX}/gtm-snapshot-${DATE_STAMP}.tar.gz"

log "info" "starting backup" "{\"date\":\"$DATE_STAMP\",\"host\":\"$REDIS_HOST\",\"prefix\":\"$MINIO_PREFIX\"}"

# ---------- 1. SCAN gtm:* keys (AC-3) ----------
KEYS_FILE="/tmp/gtm-keys-${DATE_STAMP}.txt"
if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${REDIS_AUTH_ARGS[@]}" \
     --scan --pattern 'gtm:*' > "$KEYS_FILE" 2>/dev/null; then
  die 1 "redis SCAN failed" "{\"host\":\"$REDIS_HOST\",\"port\":$REDIS_PORT}"
fi

KEY_COUNT=$(wc -l < "$KEYS_FILE" | tr -d ' ')
log "info" "scan complete" "{\"keys\":$KEY_COUNT}"

# ---------- 2. DUMP each key → JSONL ----------
: > "$JSONL"
while IFS= read -r key; do
  [[ -z "$key" ]] && continue
  # DUMP retorna binário; base64-encode pra storage texto seguro.
  # TTL em ms (PTTL); -1 = no expiry, -2 = no key (race condition, skip).
  ttl=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${REDIS_AUTH_ARGS[@]}" PTTL "$key" 2>/dev/null || echo "-1")
  [[ "$ttl" == "-2" ]] && continue  # key vanished mid-scan
  dump_b64=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${REDIS_AUTH_ARGS[@]}" --no-raw DUMP "$key" 2>/dev/null \
             | base64 | tr -d '\n')
  [[ -z "$dump_b64" ]] && continue
  # Escape key (gtm:* keys são alfanuméricas + : + sha1 hex; sem aspas/backslash, OK pra JSON simples)
  printf '{"key":"%s","ttl":%s,"dump_b64":"%s"}\n' "$key" "$ttl" "$dump_b64" >> "$JSONL"
done < "$KEYS_FILE"

rm -f "$KEYS_FILE"

# ---------- 3. Tar.gz + sanity size (AC-6) ----------
tar -czf "$TARBALL" -C /tmp "$(basename "$JSONL")"
rm -f "$JSONL"

SIZE=$(stat -f%z "$TARBALL" 2>/dev/null || stat -c%s "$TARBALL")
if (( SIZE < 100 )); then
  log "warn" "snapshot suspiciously small" "{\"size\":$SIZE,\"keys\":$KEY_COUNT}"
fi

# ---------- 4. Upload MinIO (AC-4) ----------
if command -v mc >/dev/null 2>&1; then
  if ! mc alias set minio "$MINIO_ENDPOINT" "${MINIO_ACCESS_KEY:-}" "${MINIO_SECRET_KEY:-}" --quiet >/dev/null 2>&1; then
    die 2 "mc alias set failed" "{\"endpoint\":\"$MINIO_ENDPOINT\"}"
  fi
  mc mb -p "minio/${MINIO_BUCKET}" >/dev/null 2>&1 || true
  if ! mc cp "$TARBALL" "$REMOTE_PATH" --quiet >/dev/null 2>&1; then
    die 2 "mc cp failed" "{\"remote\":\"$REMOTE_PATH\"}"
  fi
elif command -v aws >/dev/null 2>&1; then
  # Fallback aws-cli S3-compatible
  if ! aws --endpoint-url "$MINIO_ENDPOINT" s3 cp "$TARBALL" \
       "s3://${MINIO_BUCKET}/${MINIO_PREFIX}/gtm-snapshot-${DATE_STAMP}.tar.gz" >/dev/null 2>&1; then
    die 2 "aws s3 cp failed" "{\"endpoint\":\"$MINIO_ENDPOINT\"}"
  fi
else
  die 2 "nenhum cliente S3 disponível (mc ou aws)" '{"install":"apk add mc OR aws-cli"}'
fi

log "info" "upload OK" "{\"remote\":\"$REMOTE_PATH\",\"size\":$SIZE,\"keys\":$KEY_COUNT}"

# ---------- 5. Retention prune (AC-5) ----------
if command -v mc >/dev/null 2>&1; then
  # mc rm --older-than aceita "30d" formato
  mc rm --recursive --force --older-than "${RETENTION_DAYS}d" \
     "minio/${MINIO_BUCKET}/${MINIO_PREFIX}/" --quiet >/dev/null 2>&1 || true
else
  # Fallback: lista + filtra por data no nome do arquivo (gtm-snapshot-YYYY-MM-DD.tar.gz)
  CUTOFF_TS=$(( $(date +%s) - RETENTION_DAYS * 86400 ))
  CUTOFF_DATE=$(date -u -r "$CUTOFF_TS" +%Y-%m-%d 2>/dev/null \
                || date -u -d "@$CUTOFF_TS" +%Y-%m-%d 2>/dev/null \
                || echo "1970-01-01")
  aws --endpoint-url "$MINIO_ENDPOINT" s3 ls "s3://${MINIO_BUCKET}/${MINIO_PREFIX}/" 2>/dev/null \
    | awk -v cutoff="$CUTOFF_DATE" '{
        for (i=1;i<=NF;i++) if ($i ~ /^gtm-snapshot-[0-9]{4}-[0-9]{2}-[0-9]{2}\.tar\.gz$/) {
          d=substr($i,14,10); if (d < cutoff) print $i
        }
      }' \
    | while IFS= read -r oldkey; do
        aws --endpoint-url "$MINIO_ENDPOINT" s3 rm \
          "s3://${MINIO_BUCKET}/${MINIO_PREFIX}/$oldkey" >/dev/null 2>&1 || true
      done
fi

# ---------- 6. Cleanup local ----------
rm -f "$TARBALL"

log "info" "backup complete" "{\"date\":\"$DATE_STAMP\",\"keys\":$KEY_COUNT,\"size\":$SIZE,\"retention_days\":$RETENTION_DAYS}"
exit 0
