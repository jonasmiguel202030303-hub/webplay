<?php
/**
 * WEBPLAY - Stream Proxy v8
 * Streams m3u8, ts, mp4/mkv with Range support
 * Single GET approach (no HEAD) for maximum compatibility
 */
error_reporting(0);
set_time_limit(0);
ini_set('memory_limit', '64M');

while (ob_get_level()) ob_end_clean();

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS, HEAD');
header('Access-Control-Allow-Headers: Range, Content-Type, Origin');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
if ($url === '') {
    http_response_code(400);
    die('URL obrigatoria');
}

// PHP auto-decodes $_GET — do NOT urldecode again
// Just fix any double-slash issues
$url = preg_replace('#([^:])//+#', '$1/', $url);

if (strpos($url, 'http://') !== 0 && strpos($url, 'https://') !== 0) {
    http_response_code(400);
    die('URL invalida');
}

$path = parse_url($url, PHP_URL_PATH) ?: '';
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

// ========== M3U8 MANIFEST ==========
if ($ext === 'm3u8') {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => 'WEBPLAY/2.0',
    ]);
    $data = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($data === false || $code >= 400) {
        http_response_code(502);
        die('Erro manifest');
    }

    $parsed = parse_url($url);
    $root = $parsed['scheme'] . '://' . $parsed['host'];
    if (isset($parsed['port'])) $root .= ':' . $parsed['port'];
    $base = dirname($url);

    $lines = explode("\n", $data);
    $out = [];

    foreach ($lines as $line) {
        $t = trim($line);
        if ($t === '') { $out[] = ''; continue; }

        if ($t[0] !== '#') {
            if (strpos($t, 'http') === 0) $segUrl = $t;
            elseif ($t[0] === '/') $segUrl = $root . $t;
            else $segUrl = $base . '/' . $t;
            $out[] = 'stream_proxy.php?url=' . urlencode($segUrl);
            continue;
        }

        if (strpos($t, 'URI="') !== false) {
            if (preg_match('/URI="([^"]+)"/', $t, $m)) {
                $uri = $m[1];
                if (strpos($uri, 'http') === 0) $resolved = $uri;
                elseif ($uri[0] === '/') $resolved = $root . $uri;
                else $resolved = $base . '/' . $uri;
                $t = str_replace('URI="' . $m[1] . '"', 'URI="stream_proxy.php?url=' . urlencode($resolved) . '"', $t);
            }
        }
        $out[] = $t;
    }

    header('Content-Type: application/vnd.apple.mpegurl');
    header('Cache-Control: no-cache, no-store');
    echo implode("\n", $out);
    exit;
}

// ========== TS — Detectar se é segmento HLS ou live stream contínuo ==========
$isLiveTs = ($ext === 'ts' && preg_match('#/live/#i', $url));
$isVodTs  = ($ext === 'ts' && preg_match('#/(movie|series)/#i', $url));

// VOD/Series .ts → skip to streaming handler at bottom (same as mp4)
// Only buffer short HLS segments here
if ($ext === 'ts' && !$isLiveTs && !$isVodTs) {
    // Segmento HLS curto — buffered
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => 'WEBPLAY/2.0',
        CURLOPT_ENCODING       => '',
    ]);
    $data = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($data === false || $code >= 400) {
        http_response_code(502);
        die('Erro segmento');
    }

    header('Content-Type: video/mp2t');
    header('Content-Length: ' . strlen($data));
    header('Cache-Control: no-cache');
    echo $data;
    exit;
}

// ========== AAC / KEY (small, buffered) ==========
if (in_array($ext, ['aac', 'key'])) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => 'WEBPLAY/2.0',
        CURLOPT_ENCODING       => '',
    ]);
    $data = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($data === false || $code >= 400) {
        http_response_code(502);
        die('Erro segmento');
    }

    $types = ['aac' => 'audio/aac', 'key' => 'application/octet-stream'];
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . strlen($data));
    header('Cache-Control: no-cache');
    echo $data;
    exit;
}

// ========== LIVE TS STREAM (contínuo) ==========
if ($isLiveTs) {
    header('Content-Type: video/mp2t');
    header('Cache-Control: no-cache, no-store');
    header('X-Content-Type-Options: nosniff');

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT        => 0,
        CURLOPT_BUFFERSIZE     => 131072,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HEADER         => false,
        CURLOPT_USERAGENT      => 'WEBPLAY/2.0',
        CURLOPT_HTTPHEADER     => ['Accept: */*', 'Connection: keep-alive'],
        CURLOPT_WRITEFUNCTION  => function($ch, $data) {
            echo $data;
            if (ob_get_level()) ob_flush();
            flush();
            return strlen($data);
        },
    ]);
    curl_exec($ch);
    curl_close($ch);
    exit;
}

// ========== MP4 / MKV / AVI / etc — STREAM WITH RANGE ==========

$videoTypes = [
    'mp4' => 'video/mp4', 'mkv' => 'video/x-matroska',
    'avi' => 'video/x-msvideo', 'mov' => 'video/quicktime',
    'wmv' => 'video/x-ms-wmv', 'flv' => 'video/x-flv',
    'webm' => 'video/webm', 'ts' => 'video/mp2t',
];
$contentType = $videoTypes[$ext] ?? 'video/mp4';

// Build upstream request headers (User-Agent set via CURLOPT_USERAGENT separately)
$reqHeaders = [
    'Accept: */*',
    'Connection: keep-alive',
];

$range = isset($_SERVER['HTTP_RANGE']) ? $_SERVER['HTTP_RANGE'] : '';
if ($range !== '') {
    $reqHeaders[] = 'Range: ' . $range;
}

// Single GET request — stream response directly, forward all relevant headers
$responseHeaders = [];
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_USERAGENT      => 'WEBPLAY/2.0',
    CURLOPT_HTTPHEADER     => $reqHeaders,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_TIMEOUT        => 0,
    CURLOPT_BUFFERSIZE     => 131072,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADER         => false,
    // Capture response headers to forward them
    CURLOPT_HEADERFUNCTION => function($ch, $header) use (&$responseHeaders, $contentType) {
        $len = strlen($header);

        // Forward HTTP status
        if (strpos($header, 'HTTP/') === 0) {
            preg_match('/HTTP\/[\d.]+ (\d+)/', $header, $m);
            if (isset($m[1])) {
                $code = (int)$m[1];
                http_response_code($code);
            }
            return $len;
        }

        $parts = explode(':', $header, 2);
        if (count($parts) !== 2) return $len;

        $name = strtolower(trim($parts[0]));
        $value = trim($parts[1]);

        // Forward important headers
        if ($name === 'content-length') {
            header('Content-Length: ' . $value);
        } elseif ($name === 'content-range') {
            header('Content-Range: ' . $value);
        } elseif ($name === 'accept-ranges') {
            header('Accept-Ranges: ' . $value);
        }

        return $len;
    },
    // Stream body chunks directly to client
    CURLOPT_WRITEFUNCTION => function($ch, $data) {
        echo $data;
        if (ob_get_level()) ob_flush();
        flush();
        return strlen($data);
    },
]);

// Set our content-type and accept-ranges before streaming starts
header('Content-Type: ' . $contentType);
header('Accept-Ranges: bytes');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');

$ok = curl_exec($ch);
$err = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($ok === false && $httpCode === 0) {
    http_response_code(502);
    echo 'Erro conexao: ' . $err;
}
exit;
