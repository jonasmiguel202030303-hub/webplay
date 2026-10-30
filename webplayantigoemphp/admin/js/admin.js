/* ============================
   WEBPLAY 2.0 — Admin Panel JS
   ============================ */

const ADMIN_API = '../api/admin_api.php';

// ========= AUTH =========
function getToken() { return localStorage.getItem('webplay_admin_token') || ''; }
function setToken(token) { localStorage.setItem('webplay_admin_token', token); }
function clearToken() { localStorage.removeItem('webplay_admin_token'); }

async function apiCall(action, data = null, method = 'GET') {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + getToken()
        }
    };
    let url = `${ADMIN_API}?action=${action}`;
    if (method === 'POST' && data) {
        opts.body = JSON.stringify(data);
    }
    if (method === 'GET' && data) {
        Object.keys(data).forEach(k => url += `&${k}=${encodeURIComponent(data[k])}`);
    }
    const r = await fetch(url, opts);
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'Erro desconhecido');
    return json;
}

// ========= LOGIN =========
function toggleLoginPass() {
    const inp = document.getElementById('loginPass');
    const icon = document.querySelector('.nf-admin-toggle-pw i');
    if (inp.type === 'password') {
        inp.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        inp.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const errDiv = document.getElementById('loginError');
    const errText = document.getElementById('loginErrorText');
    
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loading').style.display = '';
    btn.disabled = true;
    errDiv.style.display = 'none';

    try {
        const result = await apiCall('login', {
            username: document.getElementById('loginUser').value.trim(),
            password: document.getElementById('loginPass').value
        }, 'POST');
        
        setToken(result.token);
        localStorage.setItem('webplay_admin_user', result.username);
        showPanel();
    } catch (err) {
        errText.textContent = err.message || 'Falha no login';
        errDiv.style.display = 'flex';
    } finally {
        btn.querySelector('.btn-text').style.display = '';
        btn.querySelector('.btn-loading').style.display = 'none';
        btn.disabled = false;
    }
});

function showPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'flex';
    document.getElementById('adminName').textContent = localStorage.getItem('webplay_admin_user') || 'Admin';
    // Auto-detect URLs
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/admin\/.*$/, '/');
    const el1 = document.getElementById('infoUrlWebplay');
    const el2 = document.getElementById('infoUrlAdmin');
    if (el1) { el1.textContent = baseUrl; el1.href = baseUrl; }
    if (el2) { el2.textContent = baseUrl + 'admin/'; el2.href = baseUrl + 'admin/'; }
    loadDashboard();
}

function adminLogout() {
    clearToken();
    localStorage.removeItem('webplay_admin_user');
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
}

// Auto-login se token válido
async function checkAuth() {
    if (!getToken()) return;
    try {
        await apiCall('dashboard');
        showPanel();
    } catch {
        clearToken();
    }
}

// ========= NAVIGATION =========
function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    
    const navItem = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');
    
    closeSidebar();
    
    // Carregar dados da página
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'servers': loadServers(); break;
        case 'users': loadUsers(); break;
        case 'apps': loadApps(); break;
        case 'logs': loadLogs(); break;
        case 'branding': loadBranding(); break;
    }
}

// ========= SIDEBAR MOBILE =========
function toggleSidebar() {
    document.getElementById('adminSidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
    document.getElementById('adminSidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
}

// ========= TOAST =========
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(16px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
}

// ========= DASHBOARD =========
async function loadDashboard() {
    try {
        const data = await apiCall('dashboard');
        document.getElementById('statServers').textContent = data.stats.total_servers || 0;
        document.getElementById('statServersOn').textContent = data.stats.enabled_servers || 0;
        const statUsersEl = document.getElementById('statUsers');
        if (statUsersEl) statUsersEl.textContent = data.stats.total_users || 0;
        const statLogsEl = document.getElementById('statLogs');
        if (statLogsEl) statLogsEl.textContent = (data.recent_logs || []).length || 0;
        const statAppsEl = document.getElementById('statApps');
        if (statAppsEl) statAppsEl.textContent = data.stats.total_apps || 0;
        
        renderDashLogs(data.recent_logs || []);
    } catch (err) {
        if (err.message.includes('autorizado') || err.message.includes('Token')) {
            adminLogout();
        }
    }
}

function renderDashLogs(logs) {
    const tbody = document.getElementById('dashLogs');
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhuma atividade registrada</td></tr>';
        return;
    }
    tbody.innerHTML = logs.slice(0, 10).map(log => `
        <tr>
            <td><span class="log-action ${getLogClass(log.action)}">${getLogIcon(log.action)} ${esc(log.action)}</span></td>
            <td>${esc(log.details)}</td>
            <td><code>${esc(log.ip)}</code></td>
            <td>${esc(log.date)}</td>
        </tr>
    `).join('');
}

function getLogClass(action) {
    if (action.includes('success') || action.includes('added')) return 'success';
    if (action.includes('failed') || action.includes('deleted')) return 'failed';
    if (action.includes('changed') || action.includes('edited')) return 'warn';
    return 'info';
}

function getLogIcon(action) {
    if (action.includes('login')) return '<i class="fas fa-sign-in-alt"></i>';
    if (action.includes('server')) return '<i class="fas fa-server"></i>';
    if (action.includes('user')) return '<i class="fas fa-user"></i>';
    if (action.includes('password') || action.includes('username')) return '<i class="fas fa-key"></i>';
    return '<i class="fas fa-info-circle"></i>';
}

// ========= SERVERS =========
let _servers = [];

async function loadServers() {
    const container = document.getElementById('serversList');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Carregando servidores...</div>';
    try {
        const data = await apiCall('get_servers');
        _servers = data.servers || [];
        renderServers();
    } catch (err) {
        container.innerHTML = `<div class="empty-state-admin"><div class="empty-state-icon" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.15)"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i></div><h4>Erro ao carregar</h4><p>${esc(err.message)}</p></div>`;
    }
}

function renderServers() {
    const container = document.getElementById('serversList');
    if (!_servers.length) {
        container.innerHTML = `
            <div class="empty-state-admin">
                <div class="empty-state-icon"><i class="fas fa-server"></i></div>
                <h4>Nenhum servidor cadastrado</h4>
                <p>Adicione seu primeiro servidor DNS para começar a gerenciar seus serviços</p>
                <button class="btn-primary" onclick="openServerModal()"><i class="fas fa-plus"></i> Adicionar Servidor</button>
            </div>`;
        return;
    }
    container.innerHTML = _servers.map(s => `
        <div class="server-card" id="srv-${s.id}">
            <div class="server-icon"><i class="fas fa-server"></i></div>
            <div class="server-info">
                <div class="server-name">
                    <span class="status-dot ${s.enabled ? 'on' : 'off'}"></span>
                    ${esc(s.name)}
                </div>
                <div class="server-url">${esc(s.url)}</div>
            </div>
            <div class="server-actions">
                <button class="btn-icon" title="Testar" onclick="testServer('${s.id}')">
                    <i class="fas fa-wifi"></i>
                </button>
                <button class="btn-icon" title="Editar" onclick="editServer('${s.id}')">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-icon btn-icon-delete" title="Remover" onclick="deleteServer('${s.id}', '${esc(s.name)}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openServerModal(server = null) {
    document.getElementById('serverId').value = server ? server.id : '';
    document.getElementById('serverName').value = server ? server.name : '';
    document.getElementById('serverUrl').value = server ? server.url : '';
    document.getElementById('serverEnabled').checked = server ? server.enabled : true;
    document.getElementById('serverModalTitle').innerHTML = server
        ? '<i class="fas fa-server"></i> Editar Servidor'
        : '<i class="fas fa-server"></i> Adicionar Servidor';
    document.getElementById('testResult').style.display = 'none';
    document.getElementById('serverModal').style.display = 'flex';
}

function closeServerModal() {
    document.getElementById('serverModal').style.display = 'none';
}

function editServer(id) {
    const s = _servers.find(x => x.id === id);
    if (s) openServerModal(s);
}

async function saveServer(e) {
    e.preventDefault();
    const id = document.getElementById('serverId').value;
    const data = {
        url: document.getElementById('serverUrl').value.trim(),
        name: document.getElementById('serverName').value.trim(),
        enabled: document.getElementById('serverEnabled').checked
    };

    try {
        if (id) {
            data.id = id;
            await apiCall('edit_server', data, 'POST');
            showToast('Servidor atualizado!', 'success');
        } else {
            await apiCall('add_server', data, 'POST');
            showToast('Servidor adicionado!', 'success');
        }
        closeServerModal();
        loadServers();
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function deleteServer(id, name) {
    openConfirm(
        'Remover Servidor',
        `Tem certeza que deseja remover o servidor "${name}"?`,
        async () => {
            try {
                await apiCall('delete_server', { id }, 'POST');
                showToast('Servidor removido!', 'success');
                loadServers();
                loadDashboard();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    );
}

async function testServer(id) {
    const s = _servers.find(x => x.id === id);
    if (!s) return;
    
    const card = document.getElementById('srv-' + id);
    const testBtn = card.querySelector('.btn-icon-test');
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        const result = await apiCall('test_server', { url: s.url }, 'POST');
        if (result.online) {
            showToast(`${s.name}: Online (${result.response_time})`, 'success');
        } else {
            showToast(`${s.name}: Offline (HTTP ${result.http_code})`, 'error');
        }
    } catch (err) {
        showToast(`${s.name}: Erro - ${err.message}`, 'error');
    } finally {
        testBtn.innerHTML = '<i class="fas fa-wifi"></i>';
    }
}

async function testServerUrl() {
    const url = document.getElementById('serverUrl').value.trim();
    const resultDiv = document.getElementById('testResult');
    
    if (!url) {
        showToast('Informe a URL do servidor', 'error');
        return;
    }
    
    resultDiv.style.display = 'flex';
    resultDiv.className = 'test-result test-loading';
    resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando conexão...';
    
    try {
        const result = await apiCall('test_server', { url }, 'POST');
        if (result.online) {
            resultDiv.className = 'test-result test-ok';
            resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> Servidor online! Resposta em ${result.response_time}`;
        } else {
            resultDiv.className = 'test-result test-fail';
            resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> Servidor offline (HTTP ${result.http_code})`;
        }
    } catch (err) {
        resultDiv.className = 'test-result test-fail';
        resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> Erro: ${esc(err.message)}`;
    }
}

// ========= USERS =========
let _users = [];

async function loadUsers() {
    const container = document.getElementById('usersList');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Carregando usuários...</div>';
    try {
        const data = await apiCall('get_users');
        _users = data.users || [];
        renderUsers();
    } catch (err) {
        container.innerHTML = `<div class="empty-state-admin"><div class="empty-state-icon" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.15)"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i></div><h4>Erro ao carregar</h4><p>${esc(err.message)}</p></div>`;
    }
}

function renderUsers() {
    const container = document.getElementById('usersList');
    if (!_users.length) {
        container.innerHTML = `
            <div class="empty-state-admin">
                <div class="empty-state-icon"><i class="fas fa-users"></i></div>
                <h4>Nenhum usuário cadastrado</h4>
                <p>Adicione usuários para permitir acesso ao sistema</p>
                <button class="btn-primary" onclick="openUserModal()"><i class="fas fa-plus"></i> Adicionar Usuário</button>
            </div>`;
        return;
    }
    container.innerHTML = _users.map(u => `
        <div class="user-card">
            <div class="user-icon"><i class="fas fa-user"></i></div>
            <div class="user-info">
                <div class="user-name">
                    <span class="status-dot ${u.enabled ? 'on' : 'off'}"></span>
                    ${esc(u.username)}
                </div>
                <div class="user-detail">${u.server ? esc(u.server) : 'Todos os servidores'}</div>
            </div>
            <div class="user-actions">
                <button class="btn-icon" title="Editar" onclick="editUser('${u.id}')">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-icon btn-icon-delete" title="Remover" onclick="deleteUser('${u.id}', '${esc(u.username)}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function openUserModal(user = null) {
    document.getElementById('userId').value = user ? user.id : '';
    document.getElementById('userUsername').value = user ? user.username : '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = !user;
    document.getElementById('userPassword').placeholder = user ? 'Deixe vazio para manter' : 'Senha do usuário';
    document.getElementById('userServer').value = user ? (user.server || '') : '';
    document.getElementById('userEnabled').checked = user ? user.enabled : true;
    document.getElementById('userModalTitle').innerHTML = user
        ? '<i class="fas fa-user-pen"></i> Editar Usuário'
        : '<i class="fas fa-user-plus"></i> Adicionar Usuário';
    document.getElementById('userModal').style.display = 'flex';
}

function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
}

function editUser(id) {
    const u = _users.find(x => x.id === id);
    if (u) openUserModal(u);
}

async function saveUser(e) {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const data = {
        username: document.getElementById('userUsername').value.trim(),
        password: document.getElementById('userPassword').value,
        server: document.getElementById('userServer').value.trim(),
        enabled: document.getElementById('userEnabled').checked
    };

    try {
        if (id) {
            data.id = id;
            await apiCall('edit_user', data, 'POST');
            showToast('Usuário atualizado!', 'success');
        } else {
            if (!data.password) {
                showToast('Senha é obrigatória para novos usuários', 'error');
                return;
            }
            await apiCall('add_user', data, 'POST');
            showToast('Usuário adicionado!', 'success');
        }
        closeUserModal();
        loadUsers();
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function deleteUser(id, name) {
    openConfirm(
        'Remover Usuário',
        `Tem certeza que deseja remover o usuário "${name}"?`,
        async () => {
            try {
                await apiCall('delete_user', { id }, 'POST');
                showToast('Usuário removido!', 'success');
                loadUsers();
                loadDashboard();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    );
}

// ========= APPS / APP STORE =========
let _apps = [];

async function loadApps() {
    const container = document.getElementById('appsGrid');
    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Carregando apps...</div>';
    
    // Set API endpoint URL
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/admin\/.*$/, '/');
    const apiEl = document.getElementById('apiEndpointUrl');
    if (apiEl) apiEl.textContent = baseUrl + 'api/admin_api.php?action=app_config';
    const storeEl = document.getElementById('publicStoreUrl');
    if (storeEl) { storeEl.textContent = baseUrl + 'apps.html'; storeEl.href = baseUrl + 'apps.html'; }
    
    try {
        const data = await apiCall('get_apps');
        _apps = data.apps || [];
        renderApps();
    } catch (err) {
        container.innerHTML = `<div class="empty-state-admin"><div class="empty-state-icon" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.15)"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i></div><h4>Erro ao carregar</h4><p>${esc(err.message)}</p></div>`;
    }
}

function getPlatformInfo(platform) {
    const map = {
        'android': { icon: 'fa-android', label: 'Android', cls: 'platform-android' },
        'android-tv': { icon: 'fa-tv', label: 'Android TV', cls: 'platform-android-tv' },
        'firestick': { icon: 'fa-fire', label: 'Fire Stick', cls: 'platform-firestick' },
        'windows': { icon: 'fa-windows', label: 'Windows', cls: 'platform-windows' },
        'ios': { icon: 'fa-apple', label: 'iOS', cls: 'platform-ios' },
        'other': { icon: 'fa-box', label: 'Outro', cls: 'platform-other' }
    };
    return map[platform] || map['other'];
}

function formatFileSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

function renderApps() {
    const container = document.getElementById('appsGrid');
    if (!_apps.length) {
        container.innerHTML = `
            <div class="empty-state-admin" style="grid-column:1/-1">
                <div class="empty-state-icon"><i class="fas fa-store"></i></div>
                <h4>Nenhum app publicado</h4>
                <p>Publique seu primeiro aplicativo para que os usuários possam baixar</p>
                <button class="btn-primary" onclick="openAppModal()"><i class="fas fa-plus"></i> Publicar App</button>
            </div>`;
        return;
    }
    container.innerHTML = _apps.map(app => {
        const pi = getPlatformInfo(app.platform);
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/admin\/.*$/, '/');
        const downloadUrl = baseUrl + 'uploads/apps/' + (app.filename || '');
        const iconHtml = app.icon
            ? `<img src="${esc(app.icon)}" onerror="this.outerHTML='<i class=\\'fas fa-mobile-alt\\'></i>'">`
            : `<i class="fas fa-mobile-alt"></i>`;
        return `
        <div class="app-card" id="app-${app.id}">
            <div class="app-card-header">
                <div class="app-card-icon">${iconHtml}</div>
                <div class="app-card-title">
                    <h4>${esc(app.name)}</h4>
                    <div class="app-meta">
                        <span class="app-platform-badge ${pi.cls}"><i class="fab ${pi.icon}"></i> ${pi.label}</span>
                        ${app.version ? `<span class="app-version">v${esc(app.version)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="app-card-body">
                ${app.description ? `<p>${esc(app.description)}</p>` : '<p style="font-style:italic;opacity:.4">Sem descrição</p>'}
                <div class="app-file-info">
                    <i class="fas fa-file-archive"></i>
                    <span>${esc(app.original_name || app.filename || '—')}</span>
                    <span class="app-file-size">${formatFileSize(app.file_size)}</span>
                </div>
            </div>
            <div class="app-download-count"><i class="fas fa-download"></i> ${app.downloads || 0} downloads</div>
            <div class="app-card-actions">
                <a href="${esc(downloadUrl)}" class="btn-download-app" download><i class="fas fa-download"></i> Download</a>
                <button class="btn-copy-link" onclick="copyAppLink('${esc(downloadUrl)}')"><i class="fas fa-link"></i> Link</button>
                <button class="btn-delete-app" onclick="deleteApp('${app.id}', '${esc(app.name)}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function openAppModal() {
    document.getElementById('appId').value = '';
    document.getElementById('appName').value = '';
    document.getElementById('appVersion').value = '';
    document.getElementById('appPlatform').value = 'android';
    document.getElementById('appDescription').value = '';
    document.getElementById('appIcon').value = '';
    document.getElementById('appFile').value = '';
    document.getElementById('uploadContent').style.display = '';
    document.getElementById('uploadFileInfo').style.display = 'none';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('appModalTitle').innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Publicar App';
    document.getElementById('appModal').style.display = 'flex';
}

function closeAppModal() {
    document.getElementById('appModal').style.display = 'none';
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('uploadContent').style.display = 'none';
    document.getElementById('uploadFileInfo').style.display = 'flex';
    document.getElementById('ufiName').textContent = file.name;
    document.getElementById('ufiSize').textContent = formatFileSize(file.size);
}

function clearFileSelect() {
    document.getElementById('appFile').value = '';
    document.getElementById('uploadContent').style.display = '';
    document.getElementById('uploadFileInfo').style.display = 'none';
}

async function saveApp(e) {
    e.preventDefault();
    const fileInput = document.getElementById('appFile');
    const file = fileInput.files[0];
    const appId = document.getElementById('appId').value;
    
    if (!file && !appId) {
        showToast('Selecione um arquivo para publicar', 'error');
        return;
    }
    
    const btn = document.getElementById('btnSaveApp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
    
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('uploadProgressFill');
    const progressText = document.getElementById('uploadProgressText');
    
    if (file) {
        progressDiv.style.display = 'flex';
    }
    
    const formData = new FormData();
    formData.append('action', 'upload_app');
    formData.append('name', document.getElementById('appName').value.trim());
    formData.append('version', document.getElementById('appVersion').value.trim());
    formData.append('platform', document.getElementById('appPlatform').value);
    formData.append('description', document.getElementById('appDescription').value.trim());
    formData.append('icon', document.getElementById('appIcon').value.trim());
    if (file) formData.append('app_file', file);
    if (appId) formData.append('id', appId);
    
    try {
        const xhr = new XMLHttpRequest();
        const result = await new Promise((resolve, reject) => {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = pct + '%';
                }
            };
            xhr.onload = () => {
                try {
                    const json = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) resolve(json);
                    else reject(new Error(json.error || 'Erro no upload'));
                } catch { reject(new Error('Resposta inválida do servidor')); }
            };
            xhr.onerror = () => reject(new Error('Erro de rede'));
            xhr.open('POST', ADMIN_API + '?action=upload_app');
            xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
            xhr.send(formData);
        });
        
        showToast('App publicado com sucesso!', 'success');
        closeAppModal();
        loadApps();
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Publicar App';
        progressDiv.style.display = 'none';
        progressFill.style.width = '0';
    }
}

function deleteApp(id, name) {
    openConfirm(
        'Excluir App',
        `Tem certeza que deseja excluir "${name}"? O arquivo APK será removido permanentemente.`,
        async () => {
            try {
                await apiCall('delete_app', { id }, 'POST');
                showToast('App excluído com sucesso!', 'success');
                loadApps();
                loadDashboard();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    );
}

function copyAppLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link de download copiado!', 'success');
    }).catch(() => {
        // Fallback
        const inp = document.createElement('input');
        inp.value = url;
        document.body.appendChild(inp);
        inp.select();
        document.execCommand('copy');
        inp.remove();
        showToast('Link copiado!', 'success');
    });
}

function copyApiUrl() {
    const url = document.getElementById('apiEndpointUrl').textContent;
    navigator.clipboard.writeText(url).then(() => showToast('URL da API copiada!', 'success')).catch(() => showToast('Erro ao copiar', 'error'));
}

function copyStoreUrl() {
    const url = document.getElementById('publicStoreUrl').href;
    navigator.clipboard.writeText(url).then(() => showToast('Link da loja copiado!', 'success')).catch(() => showToast('Erro ao copiar', 'error'));
}

function toggleApiDocs() {
    const docs = document.getElementById('apiDocs');
    docs.style.display = docs.style.display === 'none' ? 'block' : 'none';
}

// Drag & drop for upload area
document.addEventListener('DOMContentLoaded', () => {
    const area = document.getElementById('uploadArea');
    if (!area) return;
    ['dragenter','dragover'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.add('drag-over'); }));
    ['dragleave','drop'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.remove('drag-over'); }));
    area.addEventListener('drop', e => {
        const files = e.dataTransfer?.files;
        if (files?.length) {
            document.getElementById('appFile').files = files;
            handleFileSelect(document.getElementById('appFile'));
        }
    });
});

// ========= LOGS =========
async function loadLogs(page = 1) {
    const tbody = document.getElementById('logsBody');
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    try {
        const data = await apiCall('get_logs', { page });
        const logs = data.logs || [];
        
        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum log encontrado</td></tr>';
        } else {
            tbody.innerHTML = logs.map(log => `
                <tr>
                    <td><span class="log-action ${getLogClass(log.action)}">${getLogIcon(log.action)} ${esc(log.action)}</span></td>
                    <td>${esc(log.details)}</td>
                    <td><code>${esc(log.ip)}</code></td>
                    <td>${esc(log.date)}</td>
                </tr>
            `).join('');
        }
        
        // Pagination
        const pagination = document.getElementById('logsPagination');
        if (data.pages > 1) {
            let html = '';
            for (let i = 1; i <= data.pages; i++) {
                html += `<button class="${i === page ? 'active' : ''}" onclick="loadLogs(${i})">${i}</button>`;
            }
            pagination.innerHTML = html;
        } else {
            pagination.innerHTML = '';
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Erro: ${esc(err.message)}</td></tr>`;
    }
}

// ========= BRANDING / PERSONALIZAÇÃO — Pro =========
async function loadBranding() {
    try {
        const data = await apiCall('get_branding');
        const b = data.branding || {};
        document.getElementById('brandingName').value = b.app_name || 'WebPlay';
        document.getElementById('brandingLogoUrl').value = b.logo_url || '';
        document.getElementById('brandingPrimary').value = b.primary_color || '#7c3aed';
        document.getElementById('brandingPrimaryHex').value = (b.primary_color || '#7c3aed').replace('#','');
        document.getElementById('brandingSecondary').value = b.secondary_color || '#a855f7';
        document.getElementById('brandingSecondaryHex').value = (b.secondary_color || '#a855f7').replace('#','');
        document.getElementById('brandingAccent').value = b.accent_color || '#5b21b6';
        document.getElementById('brandingAccentHex').value = (b.accent_color || '#5b21b6').replace('#','');
        
        // Advanced background colors
        setColorField('brandingBgPrimary', b.bg_primary || '#050509');
        setColorField('brandingBgSecondary', b.bg_secondary || '#0a0a10');
        setColorField('brandingBgCard', b.bg_card || '#0f0f17');
        setColorField('brandingTextColor', b.text_color || '#f0f0f5');
        setColorField('brandingTextSecondary', b.text_secondary || '#a0a0b0');
        setColorField('brandingBorderColor', b.border_color || '#1a1a2e');
        
        // WhatsApp settings
        const waEnabled = document.getElementById('whatsappEnabled');
        if (waEnabled) waEnabled.checked = b.whatsapp_enabled || false;
        const waNumber = document.getElementById('whatsappNumber');
        if (waNumber) {
            // Strip country code 55 for display, then format
            let num = (b.whatsapp_number || '').replace(/\D/g, '');
            if (num.startsWith('55') && num.length > 2) num = num.substring(2);
            waNumber.value = num;
            formatWhatsappNumber(waNumber);
        }
        const waMessage = document.getElementById('whatsappMessage');
        if (waMessage) waMessage.value = b.whatsapp_message || 'Olá! Preciso de ajuda';

        // Signup (Criar Conta) settings
        const signupEnabled = document.getElementById('signupEnabled');
        if (signupEnabled) signupEnabled.checked = b.signup_enabled || false;
        const signupMessage = document.getElementById('signupMessage');
        if (signupMessage) signupMessage.value = b.signup_message || 'Olá! Quero criar uma conta';
        const checkoutUrl = document.getElementById('checkoutUrl');
        if (checkoutUrl) checkoutUrl.value = b.checkout_url || '';

        // Update card toggle visual states
        toggleCardState('whatsapp');
        toggleCardState('signup');

        // Intro settings
        const introEnabled = document.getElementById('introEnabled');
        if (introEnabled) introEnabled.checked = b.intro_enabled || false;
        const introDuration = document.getElementById('introDuration');
        if (introDuration) introDuration.value = b.intro_duration || '3';
        const introStyle = document.getElementById('introStyle');
        if (introStyle) introStyle.value = b.intro_style || 'netflix';
        
        // Display mode
        const displayMode = b.display_mode || 'carousel';
        const modeCarousel = document.getElementById('displayModeCarousel');
        const modeGrid = document.getElementById('displayModeGrid');
        if (modeCarousel) modeCarousel.checked = displayMode === 'carousel';
        if (modeGrid) modeGrid.checked = displayMode === 'grid';
        
        updateBrandingPreview();
        updateActivePreset();
    } catch (err) {
        showToast('Erro ao carregar personalização: ' + err.message, 'error');
    }
}

function setColorField(id, value) {
    const picker = document.getElementById(id);
    const hex = document.getElementById(id + 'Hex');
    if (picker) picker.value = value;
    if (hex) hex.value = value.replace('#', '');
}

async function saveBranding() {
    const data = {
        app_name: document.getElementById('brandingName').value.trim(),
        logo_url: document.getElementById('brandingLogoUrl').value.trim(),
        primary_color: document.getElementById('brandingPrimary').value,
        secondary_color: document.getElementById('brandingSecondary').value,
        accent_color: document.getElementById('brandingAccent').value,
        // Advanced background colors
        bg_primary: document.getElementById('brandingBgPrimary')?.value || '#050509',
        bg_secondary: document.getElementById('brandingBgSecondary')?.value || '#0a0a10',
        bg_card: document.getElementById('brandingBgCard')?.value || '#0f0f17',
        text_color: document.getElementById('brandingTextColor')?.value || '#f0f0f5',
        text_secondary: document.getElementById('brandingTextSecondary')?.value || '#a0a0b0',
        border_color: document.getElementById('brandingBorderColor')?.value || '#1a1a2e',
        // WhatsApp
        whatsapp_enabled: document.getElementById('whatsappEnabled')?.checked || false,
        whatsapp_number: getWhatsappFullNumber(),
        whatsapp_message: document.getElementById('whatsappMessage')?.value.trim() || 'Olá! Preciso de ajuda',
        // Signup (Criar Conta)
        signup_enabled: document.getElementById('signupEnabled')?.checked || false,
        signup_message: document.getElementById('signupMessage')?.value.trim() || 'Olá! Quero criar uma conta',
        // Checkout URL (trial modal)
        checkout_url: document.getElementById('checkoutUrl')?.value.trim() || '',
        // Intro
        intro_enabled: document.getElementById('introEnabled')?.checked || false,
        intro_duration: parseInt(document.getElementById('introDuration')?.value) || 3,
        intro_style: document.getElementById('introStyle')?.value || 'netflix',
        // Display mode
        display_mode: document.querySelector('input[name="displayMode"]:checked')?.value || 'carousel'
    };
    if (!data.app_name) {
        showToast('Nome do aplicativo é obrigatório', 'error');
        return;
    }
    try {
        const result = await apiCall('save_branding', data, 'POST');
        let iconMsg = '';
        if (result.icons_method === 'auto_generated') iconMsg = ' Ícones PWA gerados automaticamente ✓';
        else if (result.icons_method === 'logo_url') iconMsg = ' Ícones PWA atualizados do URL ✓';
        else if (result.icons_method === 'gd_unavailable') iconMsg = ' (GD não disponível no servidor)';
        else if (result.icons_generated === false) iconMsg = ' ⚠ Ícones não puderam ser gerados';
        showToast('Personalização salva!' + iconMsg, 'success');
        applyBrandingToAdmin(data);
        // Atualizar preview (logo_url é aplicado pelo updateBrandingPreview)
        updateBrandingPreview();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function resetAdvancedColors() {
    setColorField('brandingBgPrimary', '#050509');
    setColorField('brandingBgSecondary', '#0a0a10');
    setColorField('brandingBgCard', '#0f0f17');
    setColorField('brandingTextColor', '#f0f0f5');
    setColorField('brandingTextSecondary', '#a0a0b0');
    setColorField('brandingBorderColor', '#1a1a2e');
    showToast('Cores de fundo restauradas ao padrão', 'info');
}

// ========= TOGGLE CARD STATE (WhatsApp / Criar Conta) =========
function toggleCardState(type) {
    const checkbox = document.getElementById(type === 'whatsapp' ? 'whatsappEnabled' : 'signupEnabled');
    const badge = document.getElementById(type === 'whatsapp' ? 'whatsappBadge' : 'signupBadge');
    const fields = document.getElementById(type === 'whatsapp' ? 'whatsappFields' : 'signupFields');
    const card = document.getElementById(type === 'whatsapp' ? 'whatsappCard' : 'signupCard');
    if (!checkbox || !badge || !fields) return;
    const isOn = checkbox.checked;
    badge.textContent = isOn ? 'Ativado' : 'Desativado';
    badge.className = 'status-badge ' + (isOn ? 'status-on' : 'status-off');
    if (isOn) {
        fields.classList.add('active');
        card.style.borderColor = 'rgba(34,197,94,0.2)';
    } else {
        fields.classList.remove('active');
        fields.style.opacity = '0.4';
        fields.style.pointerEvents = 'none';
        card.style.borderColor = '';
    }
}

function formatWhatsappNumber(input) {
    let v = input.value.replace(/\D/g, '');
    // Remove country code 55 if user typed it
    if (v.startsWith('55') && v.length > 2) v = v.substring(2);
    if (v.length > 11) v = v.substring(0, 11);
    // Format: XX 9 XXXX-XXXX
    let formatted = '';
    if (v.length > 0) formatted = v.substring(0, 2);
    if (v.length > 2) formatted += ' ' + v.substring(2, 3);
    if (v.length > 3) formatted += ' ' + v.substring(3, 7);
    if (v.length > 7) formatted += '-' + v.substring(7, 11);
    input.value = formatted;
}

function getWhatsappFullNumber() {
    const input = document.getElementById('whatsappNumber');
    if (!input) return '';
    return '55' + input.value.replace(/\D/g, '');
}

function applyBgPreset(bgP, bgS, bgC, txt, txtS, brd) {
    setColorField('brandingBgPrimary', bgP);
    setColorField('brandingBgSecondary', bgS);
    setColorField('brandingBgCard', bgC);
    setColorField('brandingTextColor', txt);
    setColorField('brandingTextSecondary', txtS);
    setColorField('brandingBorderColor', brd);
    showToast('Tema de fundo aplicado! Lembre-se de salvar.', 'success');
}

function previewIntro() {
    const name = document.getElementById('brandingName').value || 'WebPlay';
    const logoUrl = document.getElementById('brandingLogoUrl').value.trim();
    const primary = document.getElementById('brandingPrimary').value;
    const duration = parseInt(document.getElementById('introDuration').value) || 3;
    const style = document.getElementById('introStyle').value || 'netflix';
    
    // Create preview overlay
    const overlay = document.createElement('div');
    overlay.className = 'intro-preview-overlay style-' + style;
    overlay.innerHTML = `
        <div class="intro-content">
            <div class="intro-logo" style="background:linear-gradient(135deg, ${primary}, ${primary}80)">
                ${logoUrl ? `<img src="${logoUrl}" alt="">` : '<i class="fas fa-play"></i>'}
            </div>
            <h1 class="intro-name">${esc(name)}</h1>
        </div>
        <button class="intro-skip" onclick="this.parentElement.remove()">
            <i class="fas fa-forward"></i> Pular
        </button>
    `;
    document.body.appendChild(overlay);
    
    // Auto-remove after duration
    setTimeout(() => overlay.remove(), duration * 1000);
}

function updateBrandingPreview() {
    const name = document.getElementById('brandingName').value || 'WebPlay';
    const primary = document.getElementById('brandingPrimary').value;
    const secondary = document.getElementById('brandingSecondary').value;
    const accent = document.getElementById('brandingAccent').value;
    const logoUrl = document.getElementById('brandingLogoUrl').value.trim();

    // Preview Name
    const previewName = document.getElementById('previewName');
    if (previewName) previewName.textContent = name;

    // App icon
    const icon = document.getElementById('previewIcon');
    if (icon) {
        if (logoUrl) {
            icon.style.background = 'transparent';
            icon.style.boxShadow = 'none';
            icon.innerHTML = `<img src="${logoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.remove();this.parentElement.style.background='linear-gradient(135deg, ${accent}, ${primary})';this.parentElement.innerHTML='<i class=\\'fas fa-play\\'></i>'">`;
        } else {
            icon.style.background = `linear-gradient(135deg, ${accent}, ${primary})`;
            icon.style.boxShadow = `0 8px 24px ${primary}40`;
            icon.innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    // Login mock
    const loginLogo = document.getElementById('previewLoginLogo');
    const loginTitle = document.getElementById('previewLoginTitle');
    const loginBtn = document.getElementById('previewLoginBtn');
    if (loginLogo) {
        if (logoUrl) {
            loginLogo.style.background = 'transparent';
            loginLogo.innerHTML = `<img src="${logoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.remove();this.parentElement.style.background='linear-gradient(135deg, ${accent}, ${primary})';this.parentElement.innerHTML='<i class=\\'fas fa-play\\'></i>'">`;
        } else {
            loginLogo.style.background = `linear-gradient(135deg, ${accent}, ${primary})`;
            loginLogo.innerHTML = '<i class="fas fa-play"></i>';
        }
    }
    if (loginTitle) loginTitle.textContent = name;
    if (loginBtn) loginBtn.style.background = `linear-gradient(135deg, ${accent}, ${primary}, ${secondary})`;

    // PWA Banner
    const pwaIcon = document.getElementById('previewPwaIcon');
    const pwaTitle = document.getElementById('previewPwaTitle');
    const pwaBanner = document.getElementById('previewPwaBanner');
    // Se tiver logo URL personalizado, troca o ícone
    if (pwaIcon && logoUrl) {
        // Substitui SVG por img
        const img = document.createElement('img');
        img.src = logoUrl;
        img.className = 'preview-pwa-icon';
        img.id = 'previewPwaIcon';
        img.width = 42;
        img.height = 42;
        img.onerror = function() { this.style.display = 'none'; };
        pwaIcon.replaceWith(img);
    }
    if (pwaTitle) pwaTitle.textContent = 'Instalar ' + name;
    if (pwaBanner) pwaBanner.style.background = `linear-gradient(135deg, ${accent}, ${primary})`;

    // Gradient bar
    const gradBar = document.getElementById('themeGradientBar');
    if (gradBar) {
        gradBar.style.background = `linear-gradient(90deg, ${accent} 0%, ${primary} 50%, ${secondary} 100%)`;
        gradBar.style.boxShadow = `0 2px 16px ${primary}40`;
    }

    // Palette strips
    const stripAccent = document.getElementById('stripAccent');
    const stripPrimary = document.getElementById('stripPrimary');
    const stripSecondary = document.getElementById('stripSecondary');
    const stripLight = document.getElementById('stripLight');
    if (stripAccent) { stripAccent.style.background = accent; stripAccent.querySelector('span').textContent = accent; }
    if (stripPrimary) { stripPrimary.style.background = primary; stripPrimary.querySelector('span').textContent = primary; }
    if (stripSecondary) { stripSecondary.style.background = secondary; stripSecondary.querySelector('span').textContent = secondary; }
    if (stripLight) { stripLight.style.background = secondary; stripLight.querySelector('span').textContent = 'Light'; }

    // Swatch rings
    const swP = document.getElementById('swatchPrimary');
    const swS = document.getElementById('swatchSecondary');
    const swA = document.getElementById('swatchAccent');
    if (swP) swP.style.setProperty('--swatch-color', primary);
    if (swS) swS.style.setProperty('--swatch-color', secondary);
    if (swA) swA.style.setProperty('--swatch-color', accent);
}

function updateActivePreset() {
    const primary = document.getElementById('brandingPrimary').value.toLowerCase();
    const secondary = document.getElementById('brandingSecondary').value.toLowerCase();
    const accent = document.getElementById('brandingAccent').value.toLowerCase();
    document.querySelectorAll('.preset-card').forEach(btn => {
        const match = btn.dataset.p.toLowerCase() === primary &&
                      btn.dataset.s.toLowerCase() === secondary &&
                      btn.dataset.a.toLowerCase() === accent;
        btn.classList.toggle('active', match);
    });
}

function resetBrandingColors() {
    document.getElementById('brandingPrimary').value = '#7c3aed';
    document.getElementById('brandingPrimaryHex').value = '7c3aed';
    document.getElementById('brandingSecondary').value = '#a855f7';
    document.getElementById('brandingSecondaryHex').value = 'a855f7';
    document.getElementById('brandingAccent').value = '#5b21b6';
    document.getElementById('brandingAccentHex').value = '5b21b6';
    updateBrandingPreview();
    updateActivePreset();
    showToast('Cores restauradas ao padrão', 'info');
}

function applyBrandingToAdmin(b) {
    document.querySelectorAll('.brand-name-sidebar').forEach(el => el.textContent = b.app_name);
    document.querySelectorAll('.brand-name-topbar').forEach(el => el.textContent = b.app_name);
    document.querySelectorAll('.brand-name-info').forEach(el => el.textContent = b.app_name);
    document.title = b.app_name + ' — Painel Administrativo';
    const root = document.documentElement;
    root.style.setProperty('--accent', b.primary_color);
    root.style.setProperty('--accent-glow', b.primary_color + '40');
    root.style.setProperty('--gradient', `linear-gradient(135deg,${b.accent_color} 0%,${b.primary_color} 100%)`);
    root.style.setProperty('--btn-gradient', `linear-gradient(135deg,${b.accent_color} 0%,${b.primary_color} 50%,${b.secondary_color} 100%)`);
}

function setupBrandingListeners() {
    // Sincronizar color picker <-> hex input (sem #)
    ['Primary', 'Secondary', 'Accent'].forEach(key => {
        const picker = document.getElementById('branding' + key);
        const hex = document.getElementById('branding' + key + 'Hex');
        if (picker && hex) {
            picker.addEventListener('input', () => {
                hex.value = picker.value.replace('#','');
                updateBrandingPreview();
                updateActivePreset();
            });
            hex.addEventListener('input', () => {
                let v = hex.value.replace('#','');
                if (/^[0-9a-fA-F]{6}$/.test(v)) {
                    picker.value = '#' + v;
                    updateBrandingPreview();
                    updateActivePreset();
                }
            });
        }
    });
    // Nome + Logo preview
    const nameInput = document.getElementById('brandingName');
    if (nameInput) nameInput.addEventListener('input', updateBrandingPreview);
    const logoInput = document.getElementById('brandingLogoUrl');
    if (logoInput) logoInput.addEventListener('input', updateBrandingPreview);
    // Presets (novo formato preset-card)
    document.querySelectorAll('.preset-card').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('brandingPrimary').value = btn.dataset.p;
            document.getElementById('brandingPrimaryHex').value = btn.dataset.p.replace('#','');
            document.getElementById('brandingSecondary').value = btn.dataset.s;
            document.getElementById('brandingSecondaryHex').value = btn.dataset.s.replace('#','');
            document.getElementById('brandingAccent').value = btn.dataset.a;
            document.getElementById('brandingAccentHex').value = btn.dataset.a.replace('#','');
            updateBrandingPreview();
            updateActivePreset();
        });
    });
}

// ========= SETTINGS =========
async function changePassword(e) {
    e.preventDefault();
    const curPass = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;
    
    if (newPass !== confirmPass) {
        showToast('As senhas não conferem', 'error');
        return;
    }
    
    try {
        const result = await apiCall('change_password', {
            current_password: curPass,
            new_password: newPass
        }, 'POST');
        
        setToken(result.token);
        showToast('Senha alterada com sucesso!', 'success');
        document.getElementById('changePassForm').reset();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function changeUsername(e) {
    e.preventDefault();
    const newUser = document.getElementById('newUsername').value.trim();
    
    try {
        await apiCall('change_username', { new_username: newUser }, 'POST');
        localStorage.setItem('webplay_admin_user', newUser);
        document.getElementById('adminName').textContent = newUser;
        showToast('Usuário alterado com sucesso!', 'success');
        document.getElementById('changeUserForm').reset();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ========= CONFIRM DIALOG =========
let _confirmCallback = null;

function openConfirm(title, text, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    _confirmCallback = callback;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
    _confirmCallback = null;
}

function confirmAction() {
    if (_confirmCallback) _confirmCallback();
    closeConfirm();
}

// ========= INIT =========
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupBrandingListeners();
    // Carregar branding no admin ao iniciar
    (async function() {
        try {
            const r = await fetch('../api/admin_api.php?action=public_branding');
            if (!r.ok) return;
            const b = await r.json();
            applyBrandingToAdmin(b);
        } catch {}
    })();
    
    // Fechar modais com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeServerModal();
            closeUserModal();
            closeAppModal();
            closeConfirm();
        }
    });
    
    // Fechar modais clicando fora
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
});
