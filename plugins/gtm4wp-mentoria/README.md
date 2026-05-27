# plugins/gtm4wp-mentoria

Plugin híbrido GTM4WP + bootstrap PHP custom — fork MÍNIMO embarcado
(ADR-0008 §3.2 Opção C).

## Estrutura

```
plugins/gtm4wp-mentoria/
├── gtm4wp/                          ← upstream vendored (gitignored, baixado via fetch)
│   └── gtm4wp.php                   ← plugin upstream principal
├── mentoria-gtm-bootstrap.php       ← bootstrap custom (~50 LoC, GPL-2.0+)
├── mentoria-config.json.template    ← template com placeholders {{container_id}} etc.
├── mentoria-config.json             ← gerado per-install pelo build-plugin.ts (temp)
└── README.md
```

- `gtm4wp/` é o plugin upstream de [duracelltomi/gtm4wp](https://github.com/duracelltomi/gtm4wp)
  pinned em **v1.18** (release 2025). NÃO commitado — recriar local via
  `scripts/fetch-gtm4wp.sh`.
- `mentoria-gtm-bootstrap.php` é nosso único arquivo custom — registra
  `register_activation_hook` que lê `mentoria-config.json` e popula
  `gtm4wp-options` (container_id + Consent Mode v2 + header-footer).
- `mentoria-config.json.template` traz placeholders Jinja-style
  (`{{container_id}}`, `{{brand_slug}}`, `{{plugin_version}}`) substituídos
  per-install pelo `scripts/build-plugin.ts`.

## Como rodar local

```bash
# 1. Baixa GTM4WP upstream pinned (cria plugins/gtm4wp-mentoria/gtm4wp/)
bash scripts/fetch-gtm4wp.sh

# 2. Smoke do build (substitui placeholders, copia pra /tmp/build-<uuid>/)
npx tsx scripts/build-plugin.ts \
  --container_id=GTM-WVWQVMP \
  --brand_slug=zerohum \
  --plugin_version=gtm4wp-1.18+bootstrap-v1

# Output esperado:
#   pluginPath: /tmp/gtm4wp-mentoria-build-<uuid>/
#   inspect: ls -la /tmp/gtm4wp-mentoria-build-<uuid>/
```

## Como o deploy real usa

`workers/api/deployJob.ts` invoca:

```ts
const { pluginPath, cleanup } = await buildPlugin({
  container_id: installation.gtm_container_id,
  brand_slug:   installation.brand_slug,
  plugin_version: installation.plugin_version,
});
try {
  await provider.deployPlugin({ domain, slug: 'gtm4wp-mentoria', pluginPath });
} finally {
  await cleanup();
}
```

## Upstream fetch — manutenção

- Source: `https://github.com/duracelltomi/gtm4wp/archive/refs/tags/<TAG>.tar.gz`
- Atualizar `GTM4WP_VERSION` em `scripts/fetch-gtm4wp.sh` quando bump.
- Bump procedure (security patch upstream) está documentado no F-S15 runbook.
- Licença GTM4WP: GPL-2.0+ → compat com nosso bootstrap (mesma licença).
