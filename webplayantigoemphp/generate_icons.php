<?php
/**
 * Gerador de Ícones WebPlay
 * Cria ícones PNG com gradiente azul e play button
 */

// Tamanhos necessários
$sizes = [192, 512, 180, 32, 64];

foreach ($sizes as $size) {
    // Criar imagem
    $img = imagecreatetruecolor($size, $size);
    
    // Habilitar alpha blending
    imagealphablending($img, true);
    imagesavealpha($img, true);
    
    // Cores do gradiente (azul WebPlay)
    $blue1 = imagecolorallocate($img, 29, 78, 216);   // #1d4ed8
    $blue2 = imagecolorallocate($img, 37, 99, 235);   // #2563eb
    $blue3 = imagecolorallocate($img, 59, 130, 246); // #3b82f6
    $white = imagecolorallocate($img, 255, 255, 255);
    $shadow = imagecolorallocatealpha($img, 0, 0, 0, 80);
    
    // Preencher com gradiente diagonal (simulado)
    for ($y = 0; $y < $size; $y++) {
        for ($x = 0; $x < $size; $x++) {
            $ratio = ($x + $y) / ($size * 2);
            $r = (int)(29 + ($ratio * (59 - 29)));
            $g = (int)(78 + ($ratio * (130 - 78)));
            $b = (int)(216 + ($ratio * (246 - 216)));
            $color = imagecolorallocate($img, $r, $g, $b);
            imagesetpixel($img, $x, $y, $color);
        }
    }
    
    // Círculo interno (sombra)
    $cx = $size / 2;
    $cy = $size / 2;
    $radius = $size * 0.35;
    imagefilledellipse($img, (int)$cx, (int)$cy, (int)($radius * 2), (int)($radius * 2), $shadow);
    
    // Triângulo de play (branco)
    $playSize = $size * 0.18;
    $offsetX = $size * 0.03;
    
    $points = [
        (int)($cx - $playSize + $offsetX), (int)($cy - $playSize),
        (int)($cx + $playSize + $offsetX), (int)$cy,
        (int)($cx - $playSize + $offsetX), (int)($cy + $playSize)
    ];
    imagefilledpolygon($img, $points, 3, $white);
    
    // Salvar
    $filename = "icons/icon-{$size}.png";
    imagepng($img, $filename);
    imagedestroy($img);
    
    echo "Criado: $filename\n";
}

// Criar favicon.ico também
echo "\nPronto! Ícones gerados em /icons/\n";
?>
