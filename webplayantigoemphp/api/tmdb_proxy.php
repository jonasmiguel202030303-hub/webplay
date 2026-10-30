<?php
/**
 * TMDB API Proxy — evita CORS e protege a chave
 * Uso: /api/tmdb_proxy.php?endpoint=movie/123&language=pt-BR
 *      /api/tmdb_proxy.php?endpoint=search/movie&query=Matrix&language=pt-BR
 */
set_time_limit(30);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlNmQ3ODQ4MDA1Y2I3Y2Q4MGY0NGY3MzNiMGFhN2MyZCIsIm5iZiI6MTc0MjU0MTY1OTk5LCJzdWIiOiI2N2RkMWJjYzI5ODA1Y2I3Y2Q4MGY0NGY3MzNiMGFhN2MyZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.dsJvcptTJB5kAQ012DLLHpQNlMObcDwh_bTTP6MZ0Uk';
$TMDB_API_KEY = 'e6d7848005cb7cd80f44f733b0aa7c2d';

$endpoint = isset($_GET['endpoint']) ? trim($_GET['endpoint']) : '';
if (empty($endpoint)) {
    http_response_code(400);
    echo json_encode(['error' => 'Parâmetro endpoint obrigatório']);
    exit;
}

// Build TMDB URL — use api_key param (more reliable) + fallback to Bearer
$params = $_GET;
unset($params['endpoint']);
$params['api_key'] = $TMDB_API_KEY;
$qs = http_build_query($params);
$url = 'https://api.themoviedb.org/3/' . $endpoint . '?' . $qs;

// Simple file cache (24h)
$cacheDir = __DIR__ . '/../data/tmdb_cache_files';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
$cacheKey = md5($url);
$cacheFile = $cacheDir . '/' . $cacheKey . '.json';
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 86400) {
    echo file_get_contents($cacheFile);
    exit;
}

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $TMDB_TOKEN,
        'Accept: application/json',
    ],
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && $response) {
    @file_put_contents($cacheFile, $response);
    echo $response;
} else {
    http_response_code($httpCode ?: 500);
    echo json_encode(['error' => 'TMDB request failed', 'status' => $httpCode]);
}
