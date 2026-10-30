<?php
/**
 * Router para PHP built-in server
 * Serve arquivos estáticos corretamente e roteia PHP
 */

$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);

// Se é um diretório, tentar index.html ou index.php
$file = __DIR__ . $path;

if (is_dir($file)) {
    // Redirecionar para trailing slash se não tiver
    if (substr($path, -1) !== '/') {
        header('Location: ' . $path . '/');
        exit;
    }
    if (file_exists($file . 'index.html')) {
        $file .= 'index.html';
    } elseif (file_exists($file . 'index.php')) {
        $file .= 'index.php';
    }
}

// Se o arquivo existe, servir com Content-Type correto
if (is_file($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $mimeTypes = [
        'html' => 'text/html',
        'css'  => 'text/css',
        'js'   => 'application/javascript',
        'json' => 'application/json',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif'  => 'image/gif',
        'svg'  => 'image/svg+xml',
        'ico'  => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2'=> 'font/woff2',
        'ttf'  => 'font/ttf',
        'webp' => 'image/webp',
        'mp4'  => 'video/mp4',
        'webm' => 'video/webm',
        'xml'  => 'application/xml',
        'txt'  => 'text/plain',
    ];

    if ($ext === 'php') {
        // Deixar o PHP processar
        return false;
    }

    $mime = $mimeTypes[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}

// Fallback para PHP built-in
return false;
