<?php
/**
 * Plugin Name: GTM4WP Mentoria Bootstrap
 * Description: Instala o GTM container do tenant — funciona standalone (render inline) OU como pré-config do GTM4WP upstream se ele existir.
 * Version: 1.1.0
 * License: GPL-2.0+
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * Story:    F-S13 (build pipeline plugin híbrido) + F-S14 #5 (self-contained render)
 * ADR ref:  docs/adr-0008-auto-provisioner-gtm-architecture.md §3.2 Opção C
 *
 * ## Modos de operação (F-S14 #5 — task #68)
 *
 * O plugin agora é AUTOSSUFICIENTE. Detecta em runtime se o GTM4WP upstream
 * (duracelltomi-google-tag-manager / gtm4wp) está ATIVO:
 *
 *   - GTM4WP ATIVO  → só pré-configura `gtm4wp-options[gtm-code]` e deixa o
 *     GTM4WP renderizar o snippet (mantém features de dataLayer enrichment
 *     do WooCommerce/CF7/etc). NÃO renderiza inline pra evitar duplo GTM.
 *
 *   - GTM4WP AUSENTE/INATIVO → renderiza o snippet GTM canônico inline via
 *     wp_head + wp_body_open. Garante que a tag DISPARA em QUALQUER WordPress,
 *     sem dependência de plugin upstream. Consent/LGPD é gerenciado DENTRO do
 *     container GTM (master V2 tem Consent Mode v2 + banner LGPD tags).
 *
 * Smoke F-S14: ifrn.com.br tinha GTM4WP ativo (modo 1). colegiomentoria.com.br
 * e zerohumnatal.com.br NÃO tinham (modo 2) — tag não renderizava. Esse fix
 * fecha o gap: ambos os modos funcionam.
 *
 * ## Container ID em runtime
 *
 * O activation hook roda 1× e salva o container_id em:
 *   - `gtm4wp-options[gtm-code]` (compat com GTM4WP upstream)
 *   - `mentoria_gtm_container_id` (option dedicada — fonte de verdade do render inline)
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lê config.json do mesmo dir do plugin. Retorna array ou null.
 */
function mentoria_gtm_read_config() {
    $config_path = __DIR__ . '/mentoria-config.json';
    if (!file_exists($config_path)) {
        return null;
    }
    $raw = file_get_contents($config_path);
    if ($raw === false) {
        return null;
    }
    $config = json_decode($raw, true);
    if (!is_array($config) || empty($config['container_id'])) {
        return null;
    }
    return $config;
}

/**
 * Activation: persiste container_id + pré-config GTM4WP + ativa upstream se uploaded.
 */
register_activation_hook(__FILE__, function () {
    $config = mentoria_gtm_read_config();
    if ($config === null) {
        error_log('[mentoria-gtm-bootstrap] config inválida ou ausente na ativação');
        return;
    }

    $container_id = $config['container_id'];

    // Fonte de verdade dedicada pro render inline (independe do GTM4WP).
    update_option('mentoria_gtm_container_id', $container_id);

    // Compat GTM4WP: pré-popula opções oficiais (option key confirmada em
    // github.com/duracelltomi/gtm4wp v1.18 admin/admin.php).
    $existing = get_option('gtm4wp-options', []);
    if (!is_array($existing)) {
        $existing = [];
    }
    $merged = array_merge($existing, [
        'gtm-code'        => $container_id,
        'consent-mode-v2' => true,
        'gtm-include'     => 'header-footer',
    ]);
    update_option('gtm4wp-options', $merged);

    // Metadata pra audit/drift (F-S06 + F-S15).
    update_option('mentoria_gtm_brand_slug', $config['brand_slug'] ?? null);
    update_option('mentoria_gtm_plugin_version', $config['plugin_version'] ?? null);

    // Best-effort: ativa GTM4WP upstream se uploaded mas inactive (ADR-0008 §3.4).
    if (function_exists('is_plugin_active') && function_exists('activate_plugin')) {
        if (!is_plugin_active('gtm4wp/gtm4wp.php') && file_exists(WP_PLUGIN_DIR . '/gtm4wp/gtm4wp.php')) {
            include_once ABSPATH . 'wp-admin/includes/plugin.php';
            activate_plugin('gtm4wp/gtm4wp.php');
        }
    }
});

/**
 * Detecta se o GTM4WP upstream está ATIVO (vai renderizar o snippet ele mesmo).
 * Checa a slug oficial + a presença da função de output do GTM4WP.
 */
function mentoria_gtm_upstream_active() {
    if (function_exists('is_plugin_active') && is_plugin_active('gtm4wp/gtm4wp.php')) {
        return true;
    }
    // Fallback: GTM4WP define essa constante quando carregado.
    if (defined('GTM4WP_VERSION')) {
        return true;
    }
    return false;
}

/**
 * Resolve o container_id em runtime. Prioridade:
 *   1. option dedicada `mentoria_gtm_container_id`
 *   2. gtm4wp-options[gtm-code] (compat)
 *   3. config.json (fallback se options não persistiram)
 */
function mentoria_gtm_container_id() {
    $id = get_option('mentoria_gtm_container_id', '');
    if (!empty($id)) {
        return $id;
    }
    $gtm4wp = get_option('gtm4wp-options', []);
    if (is_array($gtm4wp) && !empty($gtm4wp['gtm-code'])) {
        return $gtm4wp['gtm-code'];
    }
    $config = mentoria_gtm_read_config();
    if ($config !== null) {
        return $config['container_id'];
    }
    return '';
}

/**
 * Render inline do snippet GTM — SÓ quando GTM4WP upstream NÃO está ativo.
 * Garante que a tag dispara em qualquer WordPress (modo standalone).
 */

// <head> — snippet JS do GTM (priority 1 pra carregar cedo).
add_action('wp_head', function () {
    if (mentoria_gtm_upstream_active()) {
        return; // GTM4WP vai renderizar — evita duplo GTM.
    }
    $container_id = mentoria_gtm_container_id();
    if (empty($container_id)) {
        return;
    }
    $cid = esc_js($container_id);
    echo "<!-- Google Tag Manager (Mentoria Tracking standalone) -->\n";
    echo "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n";
    echo "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n";
    echo "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n";
    echo "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n";
    echo "})(window,document,'script','dataLayer','{$cid}');</script>\n";
    echo "<!-- End Google Tag Manager -->\n";
}, 1);

// <body> — noscript fallback do GTM (logo após abertura do body).
add_action('wp_body_open', function () {
    if (mentoria_gtm_upstream_active()) {
        return;
    }
    $container_id = mentoria_gtm_container_id();
    if (empty($container_id)) {
        return;
    }
    $cid = esc_attr($container_id);
    echo "<!-- Google Tag Manager (noscript) -->\n";
    echo "<noscript><iframe src=\"https://www.googletagmanager.com/ns.html?id={$cid}\"\n";
    echo "height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe></noscript>\n";
    echo "<!-- End Google Tag Manager (noscript) -->\n";
}, 1);

// Fallback pra temas antigos sem wp_body_open: injeta o noscript via filtro
// de conteúdo? Não — wp_body_open existe desde WP 5.2 (2019). Temas modernos
// têm. Se faltar, o snippet <head> ainda dispara o GTM (noscript é só fallback
// pra usuários sem JS, edge case raro).
