<?php
// LumenJS: the page search engines and link previews get (WhatsApp, Facebook, LinkedIn, X, Telegram, Google, Bing...).
// Written by `lm build` when the project has no seo.php of its own. On Roxyon hosting the router sends known crawlers
// here (Domains.SiteOptions.seo_prerender); visitors get index.html. Settings: seo.json next to this file (made by the
// build from config.json's project_info, the views and the project's own src/seo.json). A route can read its item
// from Roxyon Base with the site's publishable key (public read rules only), cached a few minutes.
declare(strict_types=1);

$cfg = json_decode((string) @file_get_contents(__DIR__ . '/seo.json'), true);
$cfg = is_array($cfg) ? $cfg : [];
$host = preg_replace('/[^a-z0-9.:-]/', '', strtolower((string) ($_SERVER['HTTP_HOST'] ?? 'localhost')));
$site = rtrim((string) ($cfg['site'] ?? ''), '/') ?: 'https://' . $host;
$abs = fn (string $u): string => $u === '' ? '' : (preg_match('#^https?://#i', $u) ? $u : $site . '/' . ltrim($u, '/'));
$name = (string) ($cfg['name'] ?? $host);
$route = trim((string) ($_GET['__nodes'] ?? ''), '/');
$parts = $route === '' ? [] : explode('/', $route);

/** The route pattern that matches ("product/:id" style), with its params. */
$match = null;
$params = [];
foreach ((array) ($cfg['routes'] ?? []) as $pattern => $r) {
    $pp = trim((string) $pattern, '/');
    $segs = $pp === '' ? [] : explode('/', $pp);
    if (count($segs) !== count($parts)) {
        continue;
    }
    $ok = true;
    $p = [];
    foreach ($segs as $i => $s) {
        if ($s !== '' && $s[0] === ':') {
            $p[substr($s, 1)] = rawurldecode($parts[$i]);
        } elseif (strcasecmp($s, $parts[$i]) !== 0) {
            $ok = false;
            break;
        }
    }
    if ($ok) {
        $match = is_array($r) ? $r : [];
        $params = $p;
        break;
    }
}

function seo_tmp(): string
{
    $d = dirname(__DIR__) . '/tmp/lm-seo';
    if (!is_dir($d)) {
        @mkdir($d, 0700, true);
    }
    return is_dir($d) && is_writable($d) ? $d : sys_get_temp_dir();
}

function seo_http(string $method, string $url, array $headers, string $origin, ?string $body = null): ?array
{
    $headers[] = 'Origin: ' . $origin;
    $headers[] = 'X-BEA-Installation-ID: lm-seo';
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? '', 'timeout' => 4, 'ignore_errors' => true]]);
    $out = @file_get_contents($url, false, $ctx);
    $d = $out === false ? null : json_decode($out, true);
    return is_array($d) ? $d : null;
}

/** One record for a route that names a Base class: {key, class, field?, base?}; null when not found or not public. */
function seo_record(array $b, string $value, string $origin): ?array
{
    $key = (string) ($b['key'] ?? '');
    $class = preg_replace('/[^A-Za-z0-9_]/', '', (string) ($b['class'] ?? ''));
    $field = preg_replace('/[^A-Za-z0-9_]/', '', (string) ($b['field'] ?? 'objectId'));
    $api = rtrim((string) ($b['base'] ?? 'https://www.beaapis.com/2'), '/');
    if ($key === '' || $class === '' || !preg_match('/^[\p{L}\p{N}_.\- ]{1,120}$/u', $value)) {
        return null;
    }
    $f = seo_tmp() . '/r-' . md5($class . '|' . $field . '|' . $value) . '.json';
    if (is_file($f) && filemtime($f) > time() - 300) {
        $c = json_decode((string) @file_get_contents($f), true);
        return is_array($c) && $c ? $c : null;
    }
    $tf = seo_tmp() . '/token-' . md5($key) . '.json';
    $row = null;
    foreach ([false, true] as $fresh) {
        $tok = null;
        if (!$fresh && is_file($tf)) {
            $t = json_decode((string) @file_get_contents($tf), true);
            if (is_array($t) && ($t['until'] ?? 0) > time()) {
                $tok = (string) ($t['token'] ?? '');
            }
        }
        if (!$tok) {
            $d = seo_http('POST', $api . '/auth/public', ['Content-Type: application/json'], $origin, (string) json_encode(['key' => $key]));
            if (empty($d['access_token'])) {
                break;
            }
            $tok = (string) $d['access_token'];
            @file_put_contents($tf, json_encode(['token' => $tok, 'until' => time() + min(3600, (int) ($d['expires_in'] ?? 3600)) - 60]), LOCK_EX);
            @chmod($tf, 0600);
        }
        $q = http_build_query(['limit' => 1, 'media' => 'images', 'where' => json_encode([$field => $value])]);
        $d = seo_http('GET', $api . '/records/' . $class . '?' . $q, ['Authorization: Bearer ' . $tok], $origin);
        if (is_array($d) && !empty($d['ok'])) {
            $row = $d['results'][0] ?? null;
            break;
        }
    }
    @file_put_contents($f, json_encode($row ?: []), LOCK_EX);
    return is_array($row) && $row ? $row : null;
}

/** A record's first photo (product photos first), at 1200 px. */
function seo_photo(array $row): string
{
    $all = [];
    foreach ((array) ($row['images'] ?? []) as $g) {
        foreach ((array) $g as $p) {
            if (is_array($p) && !empty($p['dir']) && !empty($p['image'])) {
                $all[] = $p;
            }
        }
    }
    if (!$all) {
        return '';
    }
    usort($all, fn ($a, $b) => (int) !preg_match('/^product/i', (string) ($a['title'] ?? '')) <=> (int) !preg_match('/^product/i', (string) ($b['title'] ?? '')));
    return $all[0]['dir'] . preg_replace('/(\.[a-z0-9]+)$/i', '(1200xa)$1', (string) $all[0]['image']);
}

$fill = function (string $tpl, array $vars): string {
    return trim(preg_replace_callback('/\{(\w+)\}/', fn ($m) => (string) ($vars[$m[1]] ?? ''), $tpl));
};
$text = fn ($v): string => trim(preg_replace('/\s+/', ' ', strip_tags(html_entity_decode(is_array($v) ? (string) ($v['en'] ?? reset($v) ?: '') : (string) $v))));

$title = (string) ($cfg['title'] ?? $name);
$desc = (string) ($cfg['description'] ?? '');
$image = $abs((string) ($cfg['image'] ?? ''));
$type = 'website';
$status = 200;
$body = '';
if ($match !== null) {
    $vars = $params;
    if (!empty($match['base']) && is_array($match['base'])) {
        $param = (string) ($match['base']['param'] ?? (array_key_first($params) ?? ''));
        $row = $param !== '' && isset($params[$param]) ? seo_record($match['base'], (string) $params[$param], $site) : null;
        if ($row === null) {
            $status = 404;
        } else {
            foreach ($row as $k => $v) {
                if (is_scalar($v) || (is_array($v) && isset($v['en']))) {
                    $vars[$k] = $text($v);
                }
            }
            $photo = seo_photo($row);
            if ($photo !== '') {
                $image = $photo;
            }
        }
    }
    if ($status === 200) {
        $title = $fill((string) ($match['title'] ?? $title), $vars) ?: $title;
        $desc = mb_substr($fill((string) ($match['description'] ?? $desc), $vars) ?: $desc, 0, 300);
        if (!empty($match['image']) && !preg_match('/\{/', (string) $match['image'])) {
            $image = $abs((string) $match['image']);
        }
        $type = (string) ($match['type'] ?? $type);
        $body = $fill((string) ($match['body'] ?? ''), $vars);
    }
} elseif ($route !== '') {
    $status = 404;
}
$url = $site . '/' . ($route === '' ? '' : implode('/', array_map('rawurlencode', $parts)));
http_response_code($status);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=300');
$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
$lang = preg_replace('/[^a-z-]/', '', strtolower((string) ($cfg['lang'] ?? 'en'))) ?: 'en';
$links = array_filter(array_keys((array) ($cfg['routes'] ?? [])), fn ($p) => strpos((string) $p, ':') === false);
?><!DOCTYPE html>
<html lang="<?= $h($lang) ?>"<?= in_array($lang, ['ar', 'fa', 'he', 'ur'], true) ? ' dir="rtl"' : '' ?>>
<head>
<meta charset="utf-8">
<title><?= $h($title) ?></title>
<meta name="description" content="<?= $h($desc) ?>">
<link rel="canonical" href="<?= $h($url) ?>">
<meta property="og:site_name" content="<?= $h($name) ?>">
<meta property="og:type" content="<?= $h($type) ?>">
<meta property="og:url" content="<?= $h($url) ?>">
<meta property="og:title" content="<?= $h($title) ?>">
<meta property="og:description" content="<?= $h($desc) ?>">
<?php if ($image !== ''): ?><meta property="og:image" content="<?= $h($image) ?>">
<?php endif; ?>
<meta name="twitter:card" content="<?= $image !== '' ? 'summary_large_image' : 'summary' ?>">
<script type="application/ld+json"><?= json_encode(['@context' => 'https://schema.org', '@type' => $type === 'product' ? 'Product' : 'WebPage', 'name' => $title, 'description' => $desc, 'url' => $url] + ($image !== '' ? ['image' => $image] : []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
</head>
<body>
<h1><?= $h($title) ?></h1>
<?php if ($desc !== ''): ?><p><?= $h($desc) ?></p>
<?php endif; ?><?php if ($body !== ''): ?><p><?= $h($body) ?></p>
<?php endif; ?><?php if ($image !== ''): ?><p><img src="<?= $h($image) ?>" alt="<?= $h($title) ?>"></p>
<?php endif; ?>
<nav><?php foreach ($links as $p): ?><a href="<?= $h($site . '/' . ltrim((string) $p, '/')) ?>"><?= $h(((array) $cfg['routes'][$p])['label'] ?? ($p === '' ? $name : ucwords(str_replace(['-', '_'], ' ', (string) $p)))) ?></a> <?php endforeach; ?></nav>
</body>
</html>
