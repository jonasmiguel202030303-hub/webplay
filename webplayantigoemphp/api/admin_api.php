<?php
/**
 * WEBPLAY 2.0 — Admin API
 * Gerencia: login admin, servidores DNS, usuários
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// === Arquivo de dados ===
define('DATA_DIR', __DIR__ . '/../data');
define('ADMIN_FILE', DATA_DIR . '/admin.json');
define('SERVERS_FILE', DATA_DIR . '/servers.json');
define('USERS_FILE', DATA_DIR . '/users.json');
define('LOGS_FILE', DATA_DIR . '/logs.json');
define('BRANDING_FILE', DATA_DIR . '/branding.json');
define('APPS_FILE', DATA_DIR . '/apps.json');
define('UPLOADS_DIR', __DIR__ . '/../uploads/apps');

// Criar pasta data se não existir
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// === Funções auxiliares ===
function loadJson($file, $default = []) {
    if (!file_exists($file)) return $default;
    $data = json_decode(file_get_contents($file), true);
    return $data !== null ? $data : $default;
}

function saveJson($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function getAdmin() {
    $default = [
        'username' => 'admin',
        'password' => password_hash('admin', PASSWORD_DEFAULT),
        'created_at' => date('Y-m-d H:i:s'),
        'last_login' => null
    ];
    $data = loadJson(ADMIN_FILE, null);
    if ($data === null) {
        saveJson(ADMIN_FILE, $default);
        return $default;
    }
    return $data;
}

function addLog($action, $details = '') {
    $logs = loadJson(LOGS_FILE, []);
    array_unshift($logs, [
        'action' => $action,
        'details' => $details,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'date' => date('Y-m-d H:i:s')
    ]);
    // Manter apenas os últimos 200 logs
    $logs = array_slice($logs, 0, 200);
    saveJson(LOGS_FILE, $logs);
}

function requireAuth() {
    $headers = getallheaders();
    $token = isset($headers['Authorization']) ? str_replace('Bearer ', '', $headers['Authorization']) : '';
    if (empty($token)) {
        $token = $_GET['token'] ?? '';
    }
    if (empty($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Não autorizado']);
        exit;
    }
    // Verificar token (token = hash do password + secret)
    $admin = getAdmin();
    $validToken = md5($admin['password'] . '_sagplay_admin_2026');
    if ($token !== $validToken) {
        http_response_code(401);
        echo json_encode(['error' => 'Token inválido']);
        exit;
    }
}

function generateToken() {
    $admin = getAdmin();
    return md5($admin['password'] . '_sagplay_admin_2026');
}

// === Roteamento ===
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Ler body JSON para POST
$input = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?? [];
}

switch ($action) {
    // =====================
    // LOGIN
    // =====================
    case 'login':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        
        $admin = getAdmin();
        
        if ($username !== $admin['username']) {
            addLog('login_failed', "Tentativa com usuário: $username");
            http_response_code(401);
            echo json_encode(['error' => 'Credenciais inválidas']);
            exit;
        }
        
        if (!password_verify($password, $admin['password'])) {
            addLog('login_failed', "Senha incorreta para: $username");
            http_response_code(401);
            echo json_encode(['error' => 'Credenciais inválidas']);
            exit;
        }
        
        // Atualizar último login
        $admin['last_login'] = date('Y-m-d H:i:s');
        saveJson(ADMIN_FILE, $admin);
        addLog('login_success', "Admin logou com sucesso");
        
        echo json_encode([
            'success' => true,
            'token' => generateToken(),
            'username' => $admin['username'],
            'last_login' => $admin['last_login']
        ]);
        break;

    // =====================
    // ALTERAR SENHA ADMIN
    // =====================
    case 'change_password':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $currentPassword = $input['current_password'] ?? '';
        $newPassword = $input['new_password'] ?? '';
        
        if (strlen($newPassword) < 4) {
            http_response_code(400);
            echo json_encode(['error' => 'A nova senha deve ter pelo menos 4 caracteres']);
            exit;
        }
        
        $admin = getAdmin();
        if (!password_verify($currentPassword, $admin['password'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Senha atual incorreta']);
            exit;
        }
        
        $admin['password'] = password_hash($newPassword, PASSWORD_DEFAULT);
        saveJson(ADMIN_FILE, $admin);
        addLog('password_changed', 'Senha do admin alterada');
        
        echo json_encode([
            'success' => true,
            'token' => generateToken(),
            'message' => 'Senha alterada com sucesso'
        ]);
        break;

    // =====================
    // ALTERAR USUÁRIO ADMIN
    // =====================
    case 'change_username':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $newUsername = trim($input['new_username'] ?? '');
        if (strlen($newUsername) < 3) {
            http_response_code(400);
            echo json_encode(['error' => 'O usuário deve ter pelo menos 3 caracteres']);
            exit;
        }
        
        $admin = getAdmin();
        $admin['username'] = $newUsername;
        saveJson(ADMIN_FILE, $admin);
        addLog('username_changed', "Usuário alterado para: $newUsername");
        
        echo json_encode(['success' => true, 'message' => 'Usuário alterado com sucesso']);
        break;

    // =====================
    // LISTAR SERVIDORES DNS
    // =====================
    case 'get_servers':
        requireAuth();
        $servers = loadJson(SERVERS_FILE, []);
        echo json_encode(['success' => true, 'servers' => $servers]);
        break;

    // =====================
    // ADICIONAR SERVIDOR DNS
    // =====================
    case 'add_server':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $url = trim($input['url'] ?? '');
        $name = trim($input['name'] ?? '');
        $enabled = $input['enabled'] ?? true;
        
        if (empty($url)) {
            http_response_code(400);
            echo json_encode(['error' => 'URL do servidor é obrigatória']);
            exit;
        }
        
        // Limpar URL
        $url = rtrim($url, '/');
        if (!preg_match('/^https?:\/\//', $url)) {
            $url = 'http://' . $url;
        }
        
        if (empty($name)) {
            $name = parse_url($url, PHP_URL_HOST) ?: $url;
        }
        
        $servers = loadJson(SERVERS_FILE, []);
        
        // Verificar duplicata
        foreach ($servers as $s) {
            if ($s['url'] === $url) {
                http_response_code(400);
                echo json_encode(['error' => 'Este servidor já está cadastrado']);
                exit;
            }
        }
        
        $newServer = [
            'id' => uniqid('srv_'),
            'url' => $url,
            'name' => $name,
            'enabled' => (bool)$enabled,
            'created_at' => date('Y-m-d H:i:s')
        ];
        
        $servers[] = $newServer;
        saveJson(SERVERS_FILE, $servers);
        addLog('server_added', "Servidor adicionado: $name ($url)");
        
        echo json_encode(['success' => true, 'server' => $newServer, 'message' => 'Servidor adicionado com sucesso']);
        break;

    // =====================
    // EDITAR SERVIDOR DNS
    // =====================
    case 'edit_server':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $id = $input['id'] ?? '';
        $url = trim($input['url'] ?? '');
        $name = trim($input['name'] ?? '');
        $enabled = $input['enabled'] ?? true;
        
        $servers = loadJson(SERVERS_FILE, []);
        $found = false;
        
        foreach ($servers as &$s) {
            if ($s['id'] === $id) {
                if (!empty($url)) {
                    $url = rtrim($url, '/');
                    if (!preg_match('/^https?:\/\//', $url)) $url = 'http://' . $url;
                    $s['url'] = $url;
                }
                if (!empty($name)) $s['name'] = $name;
                $s['enabled'] = (bool)$enabled;
                $found = true;
                break;
            }
        }
        unset($s);
        
        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Servidor não encontrado']);
            exit;
        }
        
        saveJson(SERVERS_FILE, $servers);
        addLog('server_edited', "Servidor editado: $name");
        
        echo json_encode(['success' => true, 'message' => 'Servidor atualizado com sucesso']);
        break;

    // =====================
    // REMOVER SERVIDOR DNS
    // =====================
    case 'delete_server':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $id = $input['id'] ?? '';
        $servers = loadJson(SERVERS_FILE, []);
        $newServers = array_values(array_filter($servers, function($s) use ($id) { return $s['id'] !== $id; }));
        
        if (count($newServers) === count($servers)) {
            http_response_code(404);
            echo json_encode(['error' => 'Servidor não encontrado']);
            exit;
        }
        
        saveJson(SERVERS_FILE, $newServers);
        addLog('server_deleted', "Servidor removido: ID $id");
        
        echo json_encode(['success' => true, 'message' => 'Servidor removido com sucesso']);
        break;

    // =====================
    // TESTAR SERVIDOR DNS
    // =====================
    case 'test_server':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $url = trim($input['url'] ?? '');
        if (empty($url)) {
            http_response_code(400);
            echo json_encode(['error' => 'URL obrigatória']);
            exit;
        }
        
        $url = rtrim($url, '/');
        if (!preg_match('/^https?:\/\//', $url)) $url = 'http://' . $url;
        
        $testUrl = $url . '/player_api.php?username=test&password=test';
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $testUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0'
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $totalTime = round(curl_getinfo($ch, CURLINFO_TOTAL_TIME) * 1000);
        curl_close($ch);
        
        $online = ($response !== false && $httpCode > 0 && $httpCode < 500);
        
        echo json_encode([
            'success' => true,
            'online' => $online,
            'http_code' => $httpCode,
            'response_time' => $totalTime . 'ms',
            'error' => $error ?: null
        ]);
        break;

    // =====================
    // LISTAR USUÁRIOS (do webplay)
    // =====================
    case 'get_users':
        requireAuth();
        $users = loadJson(USERS_FILE, []);
        // Não retornar senhas em texto
        $safeUsers = array_map(function($u) {
            return [
                'id' => $u['id'],
                'username' => $u['username'],
                'server' => $u['server'] ?? '',
                'enabled' => $u['enabled'] ?? true,
                'notes' => $u['notes'] ?? '',
                'created_at' => $u['created_at'] ?? '',
                'last_access' => $u['last_access'] ?? ''
            ];
        }, $users);
        echo json_encode(['success' => true, 'users' => $safeUsers]);
        break;

    // =====================
    // ADICIONAR USUÁRIO
    // =====================
    case 'add_user':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        $server = trim($input['server'] ?? '');
        $notes = trim($input['notes'] ?? '');
        
        if (empty($username) || empty($password)) {
            http_response_code(400);
            echo json_encode(['error' => 'Usuário e senha são obrigatórios']);
            exit;
        }
        
        $users = loadJson(USERS_FILE, []);
        
        $newUser = [
            'id' => uniqid('usr_'),
            'username' => $username,
            'password' => $password,
            'server' => $server,
            'enabled' => true,
            'notes' => $notes,
            'created_at' => date('Y-m-d H:i:s'),
            'last_access' => ''
        ];
        
        $users[] = $newUser;
        saveJson(USERS_FILE, $users);
        addLog('user_added', "Usuário adicionado: $username");
        
        echo json_encode(['success' => true, 'message' => 'Usuário adicionado com sucesso']);
        break;

    // =====================
    // EDITAR USUÁRIO
    // =====================
    case 'edit_user':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $id = $input['id'] ?? '';
        $users = loadJson(USERS_FILE, []);
        $found = false;
        
        foreach ($users as &$u) {
            if ($u['id'] === $id) {
                if (isset($input['username'])) $u['username'] = trim($input['username']);
                if (isset($input['password']) && !empty($input['password'])) $u['password'] = $input['password'];
                if (isset($input['server'])) $u['server'] = trim($input['server']);
                if (isset($input['enabled'])) $u['enabled'] = (bool)$input['enabled'];
                if (isset($input['notes'])) $u['notes'] = trim($input['notes']);
                $found = true;
                break;
            }
        }
        unset($u);
        
        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Usuário não encontrado']);
            exit;
        }
        
        saveJson(USERS_FILE, $users);
        addLog('user_edited', "Usuário editado: " . ($input['username'] ?? $id));
        
        echo json_encode(['success' => true, 'message' => 'Usuário atualizado com sucesso']);
        break;

    // =====================
    // REMOVER USUÁRIO
    // =====================
    case 'delete_user':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $id = $input['id'] ?? '';
        $users = loadJson(USERS_FILE, []);
        $newUsers = array_values(array_filter($users, function($u) use ($id) { return $u['id'] !== $id; }));
        
        if (count($newUsers) === count($users)) {
            http_response_code(404);
            echo json_encode(['error' => 'Usuário não encontrado']);
            exit;
        }
        
        saveJson(USERS_FILE, $newUsers);
        addLog('user_deleted', "Usuário removido: ID $id");
        
        echo json_encode(['success' => true, 'message' => 'Usuário removido com sucesso']);
        break;

    // =====================
    // DASHBOARD STATS
    // =====================
    case 'dashboard':
        requireAuth();
        $servers = loadJson(SERVERS_FILE, []);
        $users = loadJson(USERS_FILE, []);
        $logs = loadJson(LOGS_FILE, []);
        $apps = loadJson(APPS_FILE, []);
        
        $enabledServers = count(array_filter($servers, function($s) { return $s['enabled'] ?? true; }));
        $enabledUsers = count(array_filter($users, function($u) { return $u['enabled'] ?? true; }));
        
        echo json_encode([
            'success' => true,
            'stats' => [
                'total_servers' => count($servers),
                'enabled_servers' => $enabledServers,
                'total_users' => count($users),
                'enabled_users' => $enabledUsers,
                'total_logs' => count($logs),
                'total_apps' => count($apps)
            ],
            'recent_logs' => array_slice($logs, 0, 20)
        ]);
        break;

    // =====================
    // OBTER LOGS
    // =====================
    case 'get_logs':
        requireAuth();
        $logs = loadJson(LOGS_FILE, []);
        $page = intval($_GET['page'] ?? 1);
        $perPage = 30;
        $offset = ($page - 1) * $perPage;
        
        echo json_encode([
            'success' => true,
            'logs' => array_slice($logs, $offset, $perPage),
            'total' => count($logs),
            'page' => $page,
            'pages' => ceil(count($logs) / $perPage)
        ]);
        break;

    // =====================
    // OBTER BRANDING (admin)
    // =====================
    case 'get_branding':
        requireAuth();
        $branding = loadJson(BRANDING_FILE, [
            'app_name' => 'WebPlay',
            'primary_color' => '#7c3aed',
            'secondary_color' => '#a855f7',
            'accent_color' => '#5b21b6',
            'bg_primary' => '#050509',
            'bg_secondary' => '#0a0a10',
            'bg_card' => '#0f0f17',
            'text_color' => '#f0f0f5',
            'text_secondary' => '#a0a0b0',
            'border_color' => '#1a1a2e',
            'whatsapp_enabled' => false,
            'whatsapp_number' => '',
            'whatsapp_message' => '',
            'intro_enabled' => false,
            'intro_duration' => 3,
            'intro_style' => 'netflix',
            'signup_enabled' => false,
            'signup_message' => 'Olá! Quero criar uma conta',
            'checkout_url' => '',
            'display_mode' => 'carousel'
        ]);
        echo json_encode(['success' => true, 'branding' => $branding]);
        break;

    // =====================
    // SALVAR BRANDING
    // =====================
    case 'save_branding':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $appName = trim($input['app_name'] ?? '');
        $logoUrl = trim($input['logo_url'] ?? '');
        $primaryColor = trim($input['primary_color'] ?? '#7c3aed');
        $secondaryColor = trim($input['secondary_color'] ?? '#a855f7');
        $accentColor = trim($input['accent_color'] ?? '#5b21b6');
        
        // Cores avançadas de fundo
        $bgPrimary = trim($input['bg_primary'] ?? '#050509');
        $bgSecondary = trim($input['bg_secondary'] ?? '#0a0a10');
        $bgCard = trim($input['bg_card'] ?? '#0f0f17');
        $textColor = trim($input['text_color'] ?? '#f0f0f5');
        $textSecondary = trim($input['text_secondary'] ?? '#a0a0b0');
        $borderColor = trim($input['border_color'] ?? '#1a1a2e');
        
        // WhatsApp
        $whatsappEnabled = filter_var($input['whatsapp_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $whatsappNumber = trim($input['whatsapp_number'] ?? '');
        $whatsappMessage = trim($input['whatsapp_message'] ?? '');
        
        // Intro
        $introEnabled = filter_var($input['intro_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $introDuration = intval($input['intro_duration'] ?? 3);
        $introStyle = trim($input['intro_style'] ?? 'netflix');
        
        // Signup (Criar Conta)
        $signupEnabled = filter_var($input['signup_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $signupMessage = trim($input['signup_message'] ?? 'Olá! Quero criar uma conta');
        
        // Display Mode
        $displayMode = trim($input['display_mode'] ?? 'carousel');
        
        // Checkout URL (para modal de trial)
        $checkoutUrl = trim($input['checkout_url'] ?? '');
        
        if (empty($appName)) {
            http_response_code(400);
            echo json_encode(['error' => 'Nome do aplicativo é obrigatório']);
            exit;
        }
        
        $branding = [
            'app_name' => $appName,
            'logo_url' => $logoUrl,
            'primary_color' => $primaryColor,
            'secondary_color' => $secondaryColor,
            'accent_color' => $accentColor,
            // Cores avançadas
            'bg_primary' => $bgPrimary,
            'bg_secondary' => $bgSecondary,
            'bg_card' => $bgCard,
            'text_color' => $textColor,
            'text_secondary' => $textSecondary,
            'border_color' => $borderColor,
            // WhatsApp
            'whatsapp_enabled' => $whatsappEnabled,
            'whatsapp_number' => $whatsappNumber,
            'whatsapp_message' => $whatsappMessage,
            // Intro
            'intro_enabled' => $introEnabled,
            'intro_duration' => $introDuration,
            'intro_style' => $introStyle,
            // Signup (Criar Conta)
            'signup_enabled' => $signupEnabled,
            'signup_message' => $signupMessage,
            // Checkout URL (trial)
            'checkout_url' => $checkoutUrl,
            // Display Mode
            'display_mode' => $displayMode,
            'updated_at' => date('Y-m-d H:i:s')
        ];
        
        saveJson(BRANDING_FILE, $branding);
        
        // Auto-generate PWA icons
        $iconsDir = __DIR__ . '/../icons';
        if (!is_dir($iconsDir)) @mkdir($iconsDir, 0755, true);
        
        $iconsGenerated = false;
        $iconsMethod = 'none';
        
        if (!function_exists('imagecreatetruecolor')) {
            // GD not available
            $iconsMethod = 'gd_unavailable';
        } elseif (!empty($logoUrl)) {
            // Try to download logo and resize as PWA icons
            $imgData = @file_get_contents($logoUrl);
            if ($imgData !== false) {
                $img = @imagecreatefromstring($imgData);
                if ($img) {
                    foreach ([192, 512] as $sz) {
                        $dst = imagecreatetruecolor($sz, $sz);
                        imagealphablending($dst, false);
                        imagesavealpha($dst, true);
                        imagecopyresampled($dst, $img, 0, 0, 0, 0, $sz, $sz, imagesx($img), imagesy($img));
                        if (@imagepng($dst, $iconsDir . '/icon-' . $sz . '.png')) $iconsGenerated = true;
                        imagedestroy($dst);
                    }
                    imagedestroy($img);
                    $iconsMethod = $iconsGenerated ? 'logo_url' : 'logo_url_failed';
                } else {
                    $iconsMethod = 'logo_url_invalid';
                }
            } else {
                $iconsMethod = 'logo_url_download_failed';
            }
        }
        
        // Fallback: auto-generate icon from primary color + play triangle
        if (!$iconsGenerated && function_exists('imagecreatetruecolor')) {
            // Parse primary color
            $hex = ltrim($primaryColor, '#');
            $pr = hexdec(substr($hex, 0, 2));
            $pg = hexdec(substr($hex, 2, 2));
            $pb = hexdec(substr($hex, 4, 2));
            // Parse accent (darker shade for gradient bottom)
            $ahex = ltrim($accentColor, '#');
            $ar = hexdec(substr($ahex, 0, 2));
            $ag = hexdec(substr($ahex, 2, 2));
            $ab = hexdec(substr($ahex, 4, 2));

            foreach ([192, 512] as $sz) {
                // Render at 4x then downscale for smooth anti-aliasing
                $big = $sz * 4;
                $img = imagecreatetruecolor($big, $big);
                if (!$img) continue;

                // Full square — the OS handles rounding/masking automatically
                // Vertical gradient: primary (top) → accent/darker (bottom)
                for ($y = 0; $y < $big; $y++) {
                    $t = $y / $big;
                    $cr = intval($pr + ($ar - $pr) * $t);
                    $cg = intval($pg + ($ag - $pg) * $t);
                    $cb = intval($pb + ($ab - $pb) * $t);
                    $lineCol = imagecolorallocate($img, max(0, min(255, $cr)), max(0, min(255, $cg)), max(0, min(255, $cb)));
                    imageline($img, 0, $y, $big - 1, $y, $lineCol);
                }

                // Subtle light overlay at top for depth (gloss effect)
                for ($y = 0; $y < intval($big * 0.45); $y++) {
                    $alpha = intval(115 - (115 - 127) * ($y / ($big * 0.45)));
                    if ($alpha > 127) $alpha = 127;
                    if ($alpha < 100) $alpha = 100;
                    $gloss = imagecolorallocatealpha($img, 255, 255, 255, $alpha);
                    imageline($img, 0, $y, $big - 1, $y, $gloss);
                }

                // White play triangle — clean, well-proportioned
                $white = imagecolorallocate($img, 255, 255, 255);
                $cx = $big / 2;
                $cy = $big / 2;
                $triH = $big * 0.26; // half-height
                $triW = $big * 0.28; // half-width
                $offX = $big * 0.035; // optical center offset

                $pts = [
                    intval($cx - $triW * 0.55 + $offX), intval($cy - $triH),
                    intval($cx - $triW * 0.55 + $offX), intval($cy + $triH),
                    intval($cx + $triW * 0.85 + $offX), intval($cy)
                ];
                if (PHP_MAJOR_VERSION >= 8) {
                    @imagefilledpolygon($img, $pts, $white);
                } else {
                    @imagefilledpolygon($img, $pts, 3, $white);
                }

                // Downscale 4x → target size (smooth resampling)
                $final = imagecreatetruecolor($sz, $sz);
                imagecopyresampled($final, $img, 0, 0, 0, 0, $sz, $sz, $big, $big);

                if (@imagepng($final, $iconsDir . '/icon-' . $sz . '.png')) $iconsGenerated = true;
                imagedestroy($img);
                imagedestroy($final);
            }
            if ($iconsGenerated) $iconsMethod = 'auto_generated';
        }
        
        addLog('branding_changed', "Personalização atualizada: $appName | icons: $iconsMethod");
        
        echo json_encode([
            'success' => true,
            'branding' => $branding,
            'message' => 'Personalização salva com sucesso',
            'icons_generated' => $iconsGenerated,
            'icons_method' => $iconsMethod
        ]);
        break;

    // =====================
    // TMDB POSTERS (proxy para filmes lançamento — estilo Netflix)
    // =====================
    case 'tmdb_backdrops':
        $tmdbKey = 'e6d7848005cb7cd80f44f733b0aa7c2d';
        $cacheFile = DATA_DIR . '/tmdb_cache.json';
        $cacheTTL = 3600;
        
        if (file_exists($cacheFile)) {
            $cacheAge = time() - filemtime($cacheFile);
            if ($cacheAge < $cacheTTL) {
                $cached = file_get_contents($cacheFile);
                if ($cached) {
                    header('Cache-Control: public, max-age=600');
                    echo $cached;
                    exit;
                }
            }
        }
        
        $ctx = stream_context_create(['http' => ['timeout' => 8, 'header' => 'Accept: application/json']]);
        $allMovies = [];
        
        // Buscar 2 páginas para ter bastante poster
        foreach ([1, 2] as $page) {
            $url = 'https://api.themoviedb.org/3/movie/popular?api_key=' . $tmdbKey . '&language=pt-BR&page=' . $page;
            $resp = @file_get_contents($url, false, $ctx);
            if ($resp) {
                $data = json_decode($resp, true);
                $allMovies = array_merge($allMovies, $data['results'] ?? []);
            }
        }
        
        // Fallback trending se popular falhar
        if (empty($allMovies)) {
            $resp = @file_get_contents('https://api.themoviedb.org/3/trending/movie/week?api_key=' . $tmdbKey . '&language=pt-BR', false, $ctx);
            if ($resp) { $data = json_decode($resp, true); $allMovies = $data['results'] ?? []; }
        }
        
        $posters = [];
        foreach ($allMovies as $movie) {
            $poster = $movie['poster_path'] ?? '';
            if (!$poster) continue;
            $posters[] = [
                'title' => $movie['title'] ?? '',
                'poster' => 'https://image.tmdb.org/t/p/w342' . $poster,
                'vote' => $movie['vote_average'] ?? 0,
                'year' => substr($movie['release_date'] ?? '', 0, 4)
            ];
            if (count($posters) >= 30) break;
        }
        
        $output = json_encode(['posters' => $posters]);
        @file_put_contents($cacheFile, $output);
        header('Cache-Control: public, max-age=600');
        echo $output;
        exit;

    // =====================
    // BRANDING PÚBLICO (para o player carregar)
    // =====================
    case 'public_branding':
        $branding = loadJson(BRANDING_FILE, [
            'app_name' => 'WebPlay',
            'logo_url' => '',
            'primary_color' => '#7c3aed',
            'secondary_color' => '#a855f7',
            'accent_color' => '#5b21b6',
            'bg_primary' => '#050509',
            'bg_secondary' => '#0a0a10',
            'bg_card' => '#0f0f17',
            'text_color' => '#f0f0f5',
            'text_secondary' => '#a0a0b0',
            'border_color' => '#1a1a2e',
            'whatsapp_enabled' => false,
            'whatsapp_number' => '',
            'whatsapp_message' => '',
            'intro_enabled' => false,
            'intro_duration' => 3,
            'intro_style' => 'netflix',
            'signup_enabled' => false,
            'signup_message' => 'Olá! Quero criar uma conta',
            'checkout_url' => '',
            'display_mode' => 'carousel'
        ]);
        header('Cache-Control: public, max-age=60');
        echo json_encode($branding);
        break;

    // =====================
    // FAVICON (sem cache para refletir branding sempre atualizado)
    // =====================
    case 'favicon':
        $iconFile = __DIR__ . '/../icons/icon-192.png';
        if (!file_exists($iconFile)) {
            http_response_code(404); exit;
        }
        $branding = loadJson(BRANDING_FILE, ['updated_at' => '']);
        $etag = md5($branding['updated_at'] ?? filemtime($iconFile));
        header('Content-Type: image/png');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
        header('ETag: "' . $etag . '"');
        readfile($iconFile);
        exit;

    // =====================
    // MANIFEST DINÂMICO (PWA)
    // =====================
    case 'manifest':
        $branding = loadJson(BRANDING_FILE, [
            'app_name' => 'WebPlay',
            'primary_color' => '#7c3aed'
        ]);
        $appName = $branding['app_name'] ?? 'WebPlay';
        $themeColor = $branding['primary_color'] ?? '#7c3aed';
        
        header('Content-Type: application/manifest+json');
        header('Cache-Control: public, max-age=30');
        
        $manifest = [
            'name' => $appName,
            'short_name' => $appName,
            'description' => $appName . ' - Seu player IPTV',
            'start_url' => '../index.html',
            'display' => 'standalone',
            'background_color' => '#050509',
            'theme_color' => $themeColor,
            'orientation' => 'any',
            'icons' => [
                [
                    'src' => '../icons/icon-192.png?v=' . urlencode($branding['updated_at'] ?? date('Y-m-d H:i:s')),
                    'sizes' => '192x192',
                    'type' => 'image/png',
                    'purpose' => 'any maskable'
                ],
                [
                    'src' => '../icons/icon-512.png?v=' . urlencode($branding['updated_at'] ?? date('Y-m-d H:i:s')),
                    'sizes' => '512x512',
                    'type' => 'image/png',
                    'purpose' => 'any maskable'
                ]
            ]
        ];
        echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;

    // =====================
    // EXPORTAR SERVIDORES (para o app.js carregá-los)
    // =====================
    case 'public_servers':
        // Este endpoint é público — retorna apenas servidores habilitados
        $servers = loadJson(SERVERS_FILE, []);
        $enabled = array_values(array_filter($servers, function($s) { return $s['enabled'] ?? true; }));
        $result = array_map(function($s) {
            return ['url' => $s['url'], 'name' => $s['name']];
        }, $enabled);
        
        // Permitir cache
        header('Cache-Control: public, max-age=60');
        echo json_encode(['servers' => $result]);
        break;

    // =====================
    // APP STORE — Upload / Publicar App
    // =====================
    case 'upload_app':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        // This endpoint uses multipart/form-data, not JSON body
        $appName = trim($_POST['name'] ?? '');
        $appVersion = trim($_POST['version'] ?? '');
        $appPlatform = trim($_POST['platform'] ?? 'android');
        $appDescription = trim($_POST['description'] ?? '');
        $appIcon = trim($_POST['icon'] ?? '');
        $appId = trim($_POST['id'] ?? '');
        
        if (empty($appName)) {
            http_response_code(400);
            echo json_encode(['error' => 'Nome do app é obrigatório']);
            exit;
        }
        
        // Create uploads dir if needed
        if (!is_dir(UPLOADS_DIR)) {
            mkdir(UPLOADS_DIR, 0755, true);
        }
        
        $apps = loadJson(APPS_FILE, []);
        
        // Handle file upload
        $filename = '';
        $originalName = '';
        $fileSize = 0;
        
        if (isset($_FILES['app_file']) && $_FILES['app_file']['error'] === UPLOAD_ERR_OK) {
            $uploadedFile = $_FILES['app_file'];
            $originalName = $uploadedFile['name'];
            $fileSize = $uploadedFile['size'];
            
            // Max 500MB
            if ($fileSize > 500 * 1024 * 1024) {
                http_response_code(400);
                echo json_encode(['error' => 'Arquivo muito grande. Máximo: 500MB']);
                exit;
            }
            
            // Allowed extensions
            $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $allowedExts = ['apk', 'xapk', 'exe', 'msi', 'zip', 'ipa', 'dmg', 'aab'];
            if (!in_array($ext, $allowedExts)) {
                http_response_code(400);
                echo json_encode(['error' => 'Tipo de arquivo não permitido. Use: ' . implode(', ', $allowedExts)]);
                exit;
            }
            
            // Generate unique filename
            $filename = uniqid('app_') . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName);
            $destPath = UPLOADS_DIR . '/' . $filename;
            
            // If editing, delete old file
            if (!empty($appId)) {
                foreach ($apps as $existingApp) {
                    if ($existingApp['id'] === $appId && !empty($existingApp['filename'])) {
                        $oldFile = UPLOADS_DIR . '/' . $existingApp['filename'];
                        if (file_exists($oldFile)) unlink($oldFile);
                        break;
                    }
                }
            }
            
            if (!move_uploaded_file($uploadedFile['tmp_name'], $destPath)) {
                http_response_code(500);
                echo json_encode(['error' => 'Erro ao salvar arquivo no servidor']);
                exit;
            }
        }
        
        if (!empty($appId)) {
            // Update existing app
            $found = false;
            foreach ($apps as &$a) {
                if ($a['id'] === $appId) {
                    $a['name'] = $appName;
                    $a['version'] = $appVersion;
                    $a['platform'] = $appPlatform;
                    $a['description'] = $appDescription;
                    $a['icon'] = $appIcon;
                    if (!empty($filename)) {
                        $a['filename'] = $filename;
                        $a['original_name'] = $originalName;
                        $a['file_size'] = $fileSize;
                    }
                    $a['updated_at'] = date('Y-m-d H:i:s');
                    $found = true;
                    break;
                }
            }
            unset($a);
            
            if (!$found) {
                http_response_code(404);
                echo json_encode(['error' => 'App não encontrado']);
                exit;
            }
            
            saveJson(APPS_FILE, $apps);
            addLog('app_updated', "App atualizado: $appName v$appVersion");
            echo json_encode(['success' => true, 'message' => 'App atualizado com sucesso']);
        } else {
            // New app
            if (empty($filename)) {
                http_response_code(400);
                echo json_encode(['error' => 'Arquivo é obrigatório para novos apps']);
                exit;
            }
            
            $newApp = [
                'id' => uniqid('app_'),
                'name' => $appName,
                'version' => $appVersion,
                'platform' => $appPlatform,
                'description' => $appDescription,
                'icon' => $appIcon,
                'filename' => $filename,
                'original_name' => $originalName,
                'file_size' => $fileSize,
                'downloads' => 0,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s')
            ];
            
            $apps[] = $newApp;
            saveJson(APPS_FILE, $apps);
            addLog('app_published', "App publicado: $appName v$appVersion ($appPlatform)");
            echo json_encode(['success' => true, 'app' => $newApp, 'message' => 'App publicado com sucesso']);
        }
        break;

    // =====================
    // APP STORE — Listar Apps (admin)
    // =====================
    case 'get_apps':
        requireAuth();
        $apps = loadJson(APPS_FILE, []);
        echo json_encode(['success' => true, 'apps' => $apps]);
        break;

    // =====================
    // APP STORE — Excluir App
    // =====================
    case 'delete_app':
        requireAuth();
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método não permitido']); exit; }
        
        $id = $input['id'] ?? '';
        $apps = loadJson(APPS_FILE, []);
        $deletedApp = null;
        
        foreach ($apps as $a) {
            if ($a['id'] === $id) { $deletedApp = $a; break; }
        }
        
        if (!$deletedApp) {
            http_response_code(404);
            echo json_encode(['error' => 'App não encontrado']);
            exit;
        }
        
        // Delete file
        if (!empty($deletedApp['filename'])) {
            $filePath = UPLOADS_DIR . '/' . $deletedApp['filename'];
            if (file_exists($filePath)) unlink($filePath);
        }
        
        $newApps = array_values(array_filter($apps, function($a) use ($id) { return $a['id'] !== $id; }));
        saveJson(APPS_FILE, $newApps);
        addLog('app_deleted', "App excluído: " . ($deletedApp['name'] ?? $id));
        
        echo json_encode(['success' => true, 'message' => 'App excluído com sucesso']);
        break;

    // =====================
    // APP STORE — Track Download
    // =====================
    case 'track_download':
        $appId = $_GET['app_id'] ?? ($input['app_id'] ?? '');
        if (empty($appId)) {
            http_response_code(400);
            echo json_encode(['error' => 'app_id obrigatório']);
            exit;
        }
        
        $apps = loadJson(APPS_FILE, []);
        foreach ($apps as &$a) {
            if ($a['id'] === $appId) {
                $a['downloads'] = ($a['downloads'] ?? 0) + 1;
                break;
            }
        }
        unset($a);
        saveJson(APPS_FILE, $apps);
        echo json_encode(['success' => true]);
        break;

    // =====================
    // APPS PÚBLICOS (para a loja pública)
    // =====================
    case 'public_apps':
        $apps = loadJson(APPS_FILE, []);
        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
            . '://' . $_SERVER['HTTP_HOST']
            . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';
        
        $publicApps = array_map(function($a) use ($baseUrl) {
            return [
                'id' => $a['id'],
                'name' => $a['name'],
                'version' => $a['version'] ?? '',
                'platform' => $a['platform'] ?? 'android',
                'description' => $a['description'] ?? '',
                'icon' => $a['icon'] ?? '',
                'file_size' => $a['file_size'] ?? 0,
                'original_name' => $a['original_name'] ?? '',
                'downloads' => $a['downloads'] ?? 0,
                'download_url' => $baseUrl . 'uploads/apps/' . ($a['filename'] ?? ''),
                'created_at' => $a['created_at'] ?? '',
                'updated_at' => $a['updated_at'] ?? ''
            ];
        }, $apps);
        
        header('Cache-Control: public, max-age=30');
        echo json_encode(['success' => true, 'apps' => $publicApps]);
        break;

    // =====================
    // APP CONFIG — API completa para app Android próprio
    // =====================
    case 'app_config':
        $branding = loadJson(BRANDING_FILE, [
            'app_name' => 'WebPlay',
            'primary_color' => '#7c3aed',
            'secondary_color' => '#a855f7',
            'accent_color' => '#5b21b6'
        ]);
        
        $servers = loadJson(SERVERS_FILE, []);
        $enabledServers = array_values(array_filter($servers, function($s) { return $s['enabled'] ?? true; }));
        $serverList = array_map(function($s) { return ['url' => $s['url'], 'name' => $s['name']]; }, $enabledServers);
        
        $apps = loadJson(APPS_FILE, []);
        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
            . '://' . $_SERVER['HTTP_HOST']
            . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';
        
        $appList = array_map(function($a) use ($baseUrl) {
            return [
                'name' => $a['name'],
                'version' => $a['version'] ?? '',
                'platform' => $a['platform'] ?? 'android',
                'download_url' => $baseUrl . 'uploads/apps/' . ($a['filename'] ?? '')
            ];
        }, $apps);
        
        header('Cache-Control: public, max-age=60');
        echo json_encode([
            'app_name' => $branding['app_name'] ?? 'WebPlay',
            'primary_color' => $branding['primary_color'] ?? '#7c3aed',
            'secondary_color' => $branding['secondary_color'] ?? '#a855f7',
            'accent_color' => $branding['accent_color'] ?? '#5b21b6',
            'servers' => $serverList,
            'apps' => $appList,
            'webplay_url' => $baseUrl,
            'api_version' => '2.0'
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Ação não reconhecida: ' . $action]);
        break;
}
