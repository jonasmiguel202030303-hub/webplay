<?php
/**
 * WEBPLAY - Proxy API (aceita ?url=)
 */
set_time_limit(120);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
if (empty($url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Parâmetro url obrigatório']);
    exit;
}

// Validar URL
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['error' => 'URL inválida']);
    exit;
}

// Primeira tentativa: seguindo redirects
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => ['Accept: application/json, text/plain, */*'],
    CURLOPT_ENCODING       => '',
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

// Se falhou seguindo redirect, tenta SEM seguir (alguns IPTV panels redirecionam HTTP→HTTPS mas a API só funciona em HTTP)
if ($response === false || $httpCode !== 200) {
    $ch2 = curl_init();
    curl_setopt_array($ch2, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER     => ['Accept: application/json, text/plain, */*'],
        CURLOPT_ENCODING       => '',
    ]);
    $response2 = curl_exec($ch2);
    $httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
    $err2 = curl_error($ch2);
    curl_close($ch2);

    // Se a segunda tentativa retornou conteúdo válido (200 ou 301/302 com body JSON)
    if ($response2 !== false && $httpCode2 === 200) {
        $response = $response2;
        $httpCode = $httpCode2;
        $err = $err2;
    }
    // Alguns servidores retornam JSON no body mesmo com redirect (301/302)
    elseif ($response2 !== false && ($httpCode2 === 301 || $httpCode2 === 302)) {
        $testJson = json_decode($response2, true);
        if ($testJson !== null && isset($testJson['user_info'])) {
            $response = $response2;
            $httpCode = 200;
            $err = '';
        }
    }
}

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Conexão falhou: ' . $err]);
    exit;
}
// Aceitar respostas JSON válidas mesmo com códigos HTTP não-200 (ex: 401 com auth:0)
if ($httpCode !== 200) {
    $testJson = json_decode($response, true);
    if ($testJson !== null && (isset($testJson['user_info']) || is_array($testJson))) {
        // Resposta JSON válida - repassar para o JS processar
        header('Cache-Control: public, max-age=300');
        echo $response;
        exit;
    }
    http_response_code(502);
    echo json_encode(['error' => 'Servidor retornou: ' . $httpCode]);
    exit;
}

// Cache header
header('Cache-Control: public, max-age=300');
echo $response;
