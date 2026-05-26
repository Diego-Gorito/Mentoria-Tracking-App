# Runbook Ops — Tracking-API (Feature F: Auto-Provisioner GTM)

**Data:** 2026-05-25
**Autor:** Dex (revisão Quinn pós-Sprint 1)
**Refs:** [`adr-0008a-mock-storage-mvp-addendum.md`](./adr-0008a-mock-storage-mvp-addendum.md) §6.1 R7 · [`stories/F-S08.md`](./stories/F-S08.md) · CLAUDE.md "Backups MinIO"

Este runbook cobre operações de backup/restore do mock storage Redis (`gtm:*` keys) do auto-provisioner GTM. Aplicar quando houver desastre no volume `redis-data` (KV8) ou perda do container Redis.

---

## Snapshot Redis `gtm:*` (daily 03h BRT)

**Propósito:** preservar audit log + installations em backup S3-compatible (MinIO bucket `tracking-backups/redis/`) com retenção 30 dias, alinhada ao pg backup existente. Mitigação direta do risco R7 do ADR-0008a §6.1 (LGPD-relevant — `gtm:audit:*` lists não podem desaparecer em desastre).

**Arquitetura:**

```
[cron 03h BRT KV8] ──► [container backup] ──► scripts/backup_redis_gtm.sh
                                                  │
                                                  ├─► redis-cli SCAN gtm:* + DUMP key-by-key
                                                  ├─► tar.gz /tmp/gtm-snapshot-YYYY-MM-DD.tar.gz
                                                  └─► mc cp → minio/tracking-backups/redis/
                                                              └─► retention 30d (mc rm --older-than)
```

**Estratégia escolhida (AC-3 Opção B — JSONL key-by-key):**
- Filtra **apenas** `gtm:*` no SCAN (não captura `metabase:*` nem `track:dedup:*`).
- Cada linha JSONL = `{key, ttl, dump_b64}` permitindo restore key-by-key sem `flushdb` destrutivo.
- Tar.gz compacta tipicamente ~3-5KB/install + audit (cabe folga no MinIO).

**Script local:** [`scripts/backup_redis_gtm.sh`](../scripts/backup_redis_gtm.sh) (executável, `bash -n` clean).

---

## Compose snippet (aplicar em `Mentoria-Tracking/infra/easypanel/tracking-backup-compose.yml`)

**ATENÇÃO:** este repo (`Mentoria-Tracking-App`) **NÃO contém** `infra/easypanel/`. O compose `tracking-backup` vive no repo irmão `/Volumes/SSD 2T/Dev/Mentoria-Tracking/infra/easypanel/tracking-backup-compose.yml`. Felix deve **copiar este snippet** pra lá (adicionar como novo `service:` no mesmo arquivo, ou criar `redis-snapshot-compose.yml` separado se preferir isolamento).

Snippet a adicionar em `services:` do compose existente (mantém pg_dump intacto — AC-DoD "sem regressão pg backup"):

```yaml
  redis-snapshot:
    image: redis:7-alpine
    restart: unless-stopped
    environment:
      REDIS_HOST: "redis"
      REDIS_PORT: "6379"
      # REDIS_PASSWORD: "${REDIS_PASSWORD}"  # descomentar se Redis AUTH ativado
      MINIO_ENDPOINT: "https://s3.colegiomentoria.com.br"
      MINIO_ACCESS_KEY: "${MINIO_ACCESS_KEY}"  # Easypanel Env tab
      MINIO_SECRET_KEY: "${MINIO_SECRET_KEY}"  # Easypanel Env tab
      MINIO_BUCKET: "tracking-backups"
      MINIO_PREFIX: "redis"
      RETENTION_DAYS: "30"
      TZ: "America/Sao_Paulo"
    networks:
      - easypanel  # mesma network do service redis (resolve hostname "redis")
    entrypoint:
      - /bin/sh
      - -c
      - |
        set -e
        echo "[setup] Installing dependencies..."
        apk add --no-cache curl ca-certificates bash tzdata coreutils >/dev/null
        cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime
        echo "America/Sao_Paulo" > /etc/timezone

        echo "[setup] Downloading mc..."
        curl -sSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
        chmod +x /usr/local/bin/mc

        echo "[setup] Fetching backup_redis_gtm.sh from Mentoria-Tracking-App raw..."
        # Opção A: baixar do repo (precisa repo público OU embeddar inline aqui)
        # Opção B (recomendada pra MVP): copiar/colar conteúdo do script inline aqui
        #   via heredoc (mesmo pattern do pg_dump backup.sh existente — linhas 60-109)
        #   com $$ escape pra docker-compose interpolation.
        cat > /backup_redis_gtm.sh <<'SCRIPT'
        # COLAR AQUI o conteúdo de scripts/backup_redis_gtm.sh
        # IMPORTANTE: trocar todo "$VAR" por "$$VAR" pra escape docker-compose.
        SCRIPT
        chmod +x /backup_redis_gtm.sh

        echo "[setup] Installing cron entry (03h BRT daily)..."
        echo "0 3 * * * /backup_redis_gtm.sh >> /var/log/redis-snapshot.log 2>&1" > /etc/crontabs/root
        touch /var/log/redis-snapshot.log

        echo "[setup] Done. Starting crond in foreground..."
        tail -F /var/log/redis-snapshot.log &
        exec crond -f -l 2

networks:
  easypanel:
    external: true
```

**Nota docker-compose interpolation (per pattern Felix 24/05 BusyBox awk fix):** no heredoc dentro do YAML, todos `$VAR` viram `$$VAR` (compose substitui `${VAR}` ANTES de passar pro shell; `$$` no YAML vira `$` literal). Felix já domina esse pattern do `backup.sh` pg_dump.

**Alternativa systemd timer (Tech Notes story):** se compose-based ficar complicado, Felix pode criar `/etc/systemd/system/redis-snapshot.{service,timer}` no host KV8 direto chamando o script. Trade-off aceito pelo ADR.

---

## Smoke manual pós-deploy (AC-8)

Após Felix aplicar o snippet no Easypanel e fazer deploy:

```bash
# 1. Entrar no container redis-snapshot via Easypanel terminal
docker exec -it <redis-snapshot-container-id> /bin/sh

# 2. Rodar 1 ciclo manual (sem esperar 03h)
/backup_redis_gtm.sh

# 3. Verificar logs estruturados (JSON, último deve ser "backup complete")
tail -20 /var/log/redis-snapshot.log

# 4. Confirmar upload via Easypanel MinIO UI OU mc:
mc ls minio/tracking-backups/redis/
# Expected: gtm-snapshot-YYYY-MM-DD.tar.gz com size > 100 bytes

# 5. Validar size (AC-6)
mc stat minio/tracking-backups/redis/gtm-snapshot-$(date -u +%Y-%m-%d).tar.gz
```

Critério aceitação: arquivo dated existe, size > 100 bytes, log JSON `{"level":"info","msg":"backup complete"}` aparece.

---

## Restore `gtm:*` snapshot (procedimento AC-7)

**Quando usar:** volume `redis-data` corrompido, container Redis perdeu state, ou Diego pediu rollback após install ruim. **Cuidado:** NUNCA restore direto no Redis prod sem dry-run em container temp (risk de sobrescrever installations corretas).

### Passo 1 — Download snapshot do MinIO

```bash
# Listar snapshots disponíveis (ordenados por data no nome)
mc ls minio/tracking-backups/redis/ | sort -k 6

# Baixar o snapshot desejado (substitua YYYY-MM-DD)
mc cp minio/tracking-backups/redis/gtm-snapshot-YYYY-MM-DD.tar.gz /tmp/
tar -xzf /tmp/gtm-snapshot-YYYY-MM-DD.tar.gz -C /tmp/
# Resultado: /tmp/gtm-snapshot-YYYY-MM-DD.jsonl (1 linha por key gtm:*)
```

### Passo 2 — Spin up Redis temp container (isolado do prod)

```bash
docker run -d --name redis-restore -v /tmp:/tmp redis:7-alpine
# Verifica que tá vazio:
docker exec redis-restore redis-cli KEYS '*'
# Expected: (empty array)
```

### Passo 3 — Restore JSONL → Redis temp (loop key-by-key)

```bash
# Loop manual: cada linha JSONL → RESTORE no Redis temp
while IFS= read -r line; do
  key=$(echo "$line" | jq -r '.key')
  ttl=$(echo "$line" | jq -r '.ttl')
  # ttl=-1 (no expire) vira 0 pro RESTORE (TTL=0 = sem expiry)
  [[ "$ttl" == "-1" ]] && ttl=0
  dump_b64=$(echo "$line" | jq -r '.dump_b64')
  # Pipe binário pro RESTORE via redis-cli stdin
  echo "$dump_b64" | base64 -d \
    | docker exec -i redis-restore redis-cli -x RESTORE "$key" "$ttl"
done < /tmp/gtm-snapshot-YYYY-MM-DD.jsonl
```

### Passo 4 — Verify keys restored

```bash
docker exec redis-restore redis-cli --scan --pattern 'gtm:*' | wc -l
# Expected: count > 0 (compare com original)

# Inspecionar 1 install pra confirmar payload OK
docker exec redis-restore redis-cli HGETALL gtm:install:<sha1-domain>
# Expected: campos provider, account_id, container_id, encrypted_token, etc.
```

### Passo 5 — Re-import seletivo pro Redis prod (decisão manual Diego)

**ATENÇÃO:** Diego decide quais keys merge. NUNCA `FLUSHDB` no prod. Loop pra cada key específica:

```bash
# Para 1 key específica (substitua <key-name>):
docker exec redis-restore redis-cli DUMP <key-name> | \
  docker exec -i redis-cli-prod-container redis-cli -x RESTORE <key-name> 0 REPLACE

# REPLACE flag sobrescreve se já existir no prod. Use com cuidado.
```

### Passo 6 — Cleanup

```bash
docker stop redis-restore && docker rm redis-restore
rm /tmp/gtm-snapshot-YYYY-MM-DD.{tar.gz,jsonl}
```

---

## Troubleshooting

| Sintoma | Causa provável | Mitigação |
|---|---|---|
| `redis SCAN failed` no log | Redis offline OU AUTH errado | Próxima execução cron 24h depois retenta. Aceita perda de 1 dia (edge case 1 story). Validar `docker logs redis` + `REDIS_PASSWORD` env. |
| `mc cp failed` (MinIO offline) | Network ou bucket policy | Snapshot fica em `/tmp/gtm-snapshot-*.tar.gz` por 7d até container restart. Retry manual: `/backup_redis_gtm.sh` direto no container. |
| Snapshot size < 100 bytes (warn) | Redis vazio (estado válido pré-onboarding) | Log warning mas upload continua. Verificar se há installs reais (`gtm:install:*`) — se zero, ignorar. |
| Disk full em /tmp | KV8 volume cheio (tarball + extras) | Monitorar Easypanel disk metric. Aumentar plano OU reduzir RETENTION_DAYS. |
| Restore falha "BUSYKEY" | Key já existe no Redis temp (re-run) | `docker exec redis-restore redis-cli FLUSHDB` antes de re-rodar passo 3. |
| Restore falha "DUMP payload version or checksum" | Versão Redis prod ≠ versão container restore | Use mesma image `redis:7-alpine` no temp container (vendor-pin). |
| CDN cache em algum lugar? | N/A | Backup MinIO não passa por CDN — direct S3 API. |

---

## Dependências e docs relacionadas

- ADR mitigação backup: [`adr-0008a-mock-storage-mvp-addendum.md`](./adr-0008a-mock-storage-mvp-addendum.md) §6.1 R7
- Story origem: [`stories/F-S08.md`](./stories/F-S08.md) — AC-1..8 + DoD
- CLAUDE.md seção "Backups MinIO" — stack overview + retention policy 30d alinhada pg
- Compose existente (repo irmão): `/Volumes/SSD 2T/Dev/Mentoria-Tracking/infra/easypanel/tracking-backup-compose.yml` — pattern pg_dump replicado aqui
- Script: [`../scripts/backup_redis_gtm.sh`](../scripts/backup_redis_gtm.sh) — implementação Opção B (JSONL key-by-key)

**Próxima revisão:** após Sprint 1 smoke staging (Quinn gate). Atualizar com lições aprendidas reais (latency cron, size típica snapshot, restore time pós-disaster).
