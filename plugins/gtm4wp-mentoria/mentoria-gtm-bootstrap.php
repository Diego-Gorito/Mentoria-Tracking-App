<?php
/**
 * Plugin Name: GTM4WP Mentoria Bootstrap
 * Description: Pre-configures GTM4WP with brand-specific GTM container at activation, lendo mentoria-config.json (gerado por scripts/build-plugin.ts).
 * Version: 1.0.0
 * Depends: GTM4WP
 * License: GPL-2.0+
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * Story:    F-S13 (build pipeline plugin híbrido)
 * ADR ref:  docs/adr-0008-auto-provisioner-gtm-architecture.md §3.2 Opção C
 *           (fork mínimo embarcado — GTM4WP upstream intocado + bootstrap único).
 *
 * Semantics:
 *   1. Activation hook lê `mentoria-config.json` no mesmo dir do plugin.
 *   2. Popula `gtm4wp-options` com container_id + Consent Mode v2 + header/footer.
 *   3. Tenta ativar GTM4WP upstream se uploaded mas inactive (best-effort,
 *      fallback ativação manual fica documentado no F-S15 runbook).
 *   4. Registra brand_slug + plugin_version em options separadas pra audit
 *      (validator F-S06 detecta drift comparando vs tracking.gtm_installations).
 */

if (!defined('ABSPATH')) {
    exit;
}

register_activation_hook(__FILE__, function () {
    $config_path = __DIR__ . '/mentoria-config.json';
    if (!file_exists($config_path)) {
        error_log('[mentoria-gtm-bootstrap] mentoria-config.json não encontrado em ' . $config_path);
        return;
    }

    $raw = file_get_contents($config_path);
    if ($raw === false) {
        error_log('[mentoria-gtm-bootstrap] falha ao ler mentoria-config.json');
        return;
    }

    $config = json_decode($raw, true);
    if (!is_array($config) || empty($config['container_id'])) {
        error_log('[mentoria-gtm-bootstrap] config inválida (container_id ausente)');
        return;
    }

    // Pre-popula opções GTM4WP (option key `gtm4wp-options` é a oficial do plugin
    // upstream — confirmado em github.com/duracelltomi/gtm4wp v1.18 admin/admin.php).
    $existing = get_option('gtm4wp-options', []);
    if (!is_array($existing)) {
        $existing = [];
    }
    $merged = array_merge($existing, [
        'gtm-code'        => $config['container_id'],
        'consent-mode-v2' => true,
        'gtm-include'     => 'header-footer',
    ]);
    update_option('gtm4wp-options', $merged);

    // Metadata pra audit/drift (F-S06 + F-S15).
    update_option('mentoria_gtm_brand_slug', $config['brand_slug'] ?? null);
    update_option('mentoria_gtm_plugin_version', $config['plugin_version'] ?? null);

    // Ativa GTM4WP upstream se uploaded mas inactive (ADR-0008 §3.4 fallback C).
    if (function_exists('is_plugin_active') && function_exists('activate_plugin')) {
        if (!is_plugin_active('gtm4wp/gtm4wp.php') && file_exists(WP_PLUGIN_DIR . '/gtm4wp/gtm4wp.php')) {
            include_once ABSPATH . 'wp-admin/includes/plugin.php';
            activate_plugin('gtm4wp/gtm4wp.php');
        }
    }
});
