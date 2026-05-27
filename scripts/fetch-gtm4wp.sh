#!/usr/bin/env bash
# scripts/fetch-gtm4wp.sh — baixa GTM4WP upstream pinned e extrai em
# plugins/gtm4wp-mentoria/gtm4wp/.
#
# Story:    F-S13 (build pipeline plugin híbrido)
# ADR ref:  docs/adr-0008-auto-provisioner-gtm-architecture.md §3.2 Opção C
#           (GTM4WP upstream vendored, NÃO commitado — gitignored).
#
# Uso:
#   bash scripts/fetch-gtm4wp.sh
#
# Idempotente: se gtm4wp/ já existe, faz nada. Use `--force` pra recriar.
#
# Source upstream: https://github.com/duracelltomi/gtm4wp
# Pinning v1.18 (latest stable em 25/05/2026 — bump procedure no F-S15 runbook).

set -euo pipefail

GTM4WP_VERSION="${GTM4WP_VERSION:-1.18}"
GTM4WP_TAG="v${GTM4WP_VERSION}"
ARCHIVE_URL="https://github.com/duracelltomi/gtm4wp/archive/refs/tags/${GTM4WP_TAG}.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_DIR="${REPO_ROOT}/plugins/gtm4wp-mentoria"
VENDOR_DIR="${PLUGIN_DIR}/gtm4wp"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      cat <<EOF
Usage: bash scripts/fetch-gtm4wp.sh [--force]

  --force   Recria gtm4wp/ mesmo se já existe.
  -h        Mostra esta ajuda.

Env vars:
  GTM4WP_VERSION   Override version (default: 1.18).
EOF
      exit 0
      ;;
    *)
      echo "[fetch-gtm4wp] arg desconhecido: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -d "${VENDOR_DIR}" && ${FORCE} -eq 0 ]]; then
  echo "[fetch-gtm4wp] ${VENDOR_DIR} já existe; pulando (use --force pra recriar)."
  exit 0
fi

if [[ ${FORCE} -eq 1 && -d "${VENDOR_DIR}" ]]; then
  echo "[fetch-gtm4wp] --force ativo, removendo ${VENDOR_DIR}"
  rm -rf "${VENDOR_DIR}"
fi

mkdir -p "${PLUGIN_DIR}"

TMP_DIR="$(mktemp -d -t gtm4wp-fetch-XXXXXX)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ARCHIVE_PATH="${TMP_DIR}/gtm4wp-${GTM4WP_VERSION}.tar.gz"

echo "[fetch-gtm4wp] baixando ${ARCHIVE_URL}"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "${ARCHIVE_URL}" -o "${ARCHIVE_PATH}"
elif command -v wget >/dev/null 2>&1; then
  wget -q "${ARCHIVE_URL}" -O "${ARCHIVE_PATH}"
else
  echo "[fetch-gtm4wp] curl OU wget necessário no PATH" >&2
  exit 1
fi

echo "[fetch-gtm4wp] extraindo em ${TMP_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

# GitHub archive vem como gtm4wp-<version>/ (sem o 'v' do tag).
EXTRACTED_DIR="${TMP_DIR}/gtm4wp-${GTM4WP_VERSION}"
if [[ ! -d "${EXTRACTED_DIR}" ]]; then
  echo "[fetch-gtm4wp] dir extraído não encontrado: ${EXTRACTED_DIR}" >&2
  ls -la "${TMP_DIR}" >&2
  exit 1
fi

# Sanity check — plugin upstream tem gtm4wp.php no root.
if [[ ! -f "${EXTRACTED_DIR}/gtm4wp.php" ]]; then
  echo "[fetch-gtm4wp] arquivo principal gtm4wp.php não encontrado no archive" >&2
  exit 1
fi

mv "${EXTRACTED_DIR}" "${VENDOR_DIR}"
echo "[fetch-gtm4wp] ok — ${VENDOR_DIR} populado (version=${GTM4WP_VERSION})"
