<?php
// WEBPLAY - Teste de Proxy
// Acesse: https://seusite.com/api/test_proxy.php
// Isso mostra se o PHP e o cURL estao funcionando

header('Content-Type: text/plain; charset=utf-8');

echo "=== WEBPLAY - Teste de Proxy ===\n\n";
echo "PHP Version: " . phpversion() . "\n";
echo "cURL: " . (function_exists('curl_init') ? 'OK' : 'NAO DISPONIVEL') . "\n";
echo "allow_url_fopen: " . ini_get('allow_url_fopen') . "\n";
echo "memory_limit: " . ini_get('memory_limit') . "\n";
echo "max_execution_time: " . ini_get('max_execution_time') . "\n\n";

// Testar cURL fazendo uma requisicao simples
echo "--- Teste de conexao ---\n";
$testUrl = 'http://httpbin.org/get';
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $testUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$result = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

echo "URL: $testUrl\n";
echo "HTTP Code: $code\n";
echo "Erro: " . ($error ? $error : 'nenhum') . "\n";
echo "Resposta: " . ($result ? 'OK (' . strlen($result) . ' bytes)' : 'FALHOU') . "\n\n";

// Testar conexao com servidor IPTV
if (isset($_GET['server'])) {
    echo "--- Teste com servidor IPTV ---\n";
    $server = $_GET['server'];
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $server);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'WEBPLAY/1.0');
    $result = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    $ct = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    echo "URL: $server\n";
    echo "HTTP Code: $code\n";
    echo "Content-Type: $ct\n";
    echo "Erro: " . ($error ? $error : 'nenhum') . "\n";
    echo "Bytes: " . strlen($result) . "\n";
    echo "Primeiros 500 chars:\n" . substr($result, 0, 500) . "\n";
}

echo "\n--- Teste de stream_proxy.php ---\n";
echo "Verifique se stream_proxy.php esta no mesmo diretorio.\n";
echo "Arquivo existe: " . (file_exists(__DIR__ . '/stream_proxy.php') ? 'SIM' : 'NAO') . "\n";
echo "Tamanho: " . (file_exists(__DIR__ . '/stream_proxy.php') ? filesize(__DIR__ . '/stream_proxy.php') . ' bytes' : '-') . "\n";
