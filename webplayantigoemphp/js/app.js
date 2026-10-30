/* ============================
   WEBPLAY 2.0 — App Completo
   ============================ */

const CONFIG = {
    SERVERS: [
        { url: 'http://lumotv.site', name: 'WEBPLAY' },
        { url: 'http://kl47.eu', name: 'kl47.eu' }
    ],
    SERVER: 'http://lumotv.site',
    PROXY_API: 'api/proxy.php?url=',
    PROXY_STREAM: 'api/stream_proxy.php?url=',
    PAGE_SIZE: 60,
    CACHE_TTL: 20 * 60 * 1000
};

/* ---- LOAD ADMIN SERVERS (substitui hardcoded pelos do painel) ---- */
let _adminServersReady = false;
const _adminServersPromise = (async function loadAdminServers() {
    try {
        const r = await fetch('api/admin_api.php?action=public_servers');
        if (!r.ok) { _adminServersReady = true; return; }
        const data = await r.json();
        if (data.servers && data.servers.length) {
            // Usar SOMENTE os servidores do painel admin como lista principal
            const adminList = data.servers.map(s => ({ url: s.url.replace(/\/$/, ''), name: s.name }));
            // Mesclar: admin primeiro, depois hardcoded que não existem no admin
            const adminUrls = new Set(adminList.map(s => s.url));
            const merged = [...adminList];
            CONFIG.SERVERS.forEach(s => {
                const clean = s.url.replace(/\/$/, '');
                if (!adminUrls.has(clean)) {
                    merged.push({ url: s.url, name: s.name });
                }
            });
            CONFIG.SERVERS = merged;
        }
    } catch {}
    _adminServersReady = true;
    // Atualizar select de servidores se já existir na DOM
    const sel = document.getElementById('serverSelect');
    if (sel) {
        const existing = new Set([...sel.options].map(o => o.value));
        CONFIG.SERVERS.forEach(s => {
            if (!existing.has(s.url)) {
                const opt = document.createElement('option');
                opt.value = s.url;
                opt.textContent = s.name;
                sel.appendChild(opt);
            }
        });
    }
})();

/* Esperar servidores admin carregarem (max 8s) */
async function waitAdminServers() {
    if (_adminServersReady) return;
    const timeout = new Promise(r => setTimeout(r, 8000));
    await Promise.race([_adminServersPromise, timeout]);
}

/* ---- TURBO CACHE ---- */
const Cache = {
    _m: new Map(),
    get(k) {
        // Memory first
        const mem = this._m.get(k);
        if (mem && Date.now() < mem.exp) return mem.data;
        if (mem) this._m.delete(k);
        // Session fallback
        try {
            const raw = sessionStorage.getItem('tc_' + k);
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (Date.now() > item.exp) { sessionStorage.removeItem('tc_' + k); return null; }
            this._m.set(k, item);
            return item.data;
        } catch { return null; }
    },
    set(k, data, ttl = CONFIG.CACHE_TTL) {
        const item = { data, exp: Date.now() + ttl };
        this._m.set(k, item);
        try { sessionStorage.setItem('tc_' + k, JSON.stringify(item)); } catch { /* quota */ }
    },
    clear() {
        this._m.clear();
        Object.keys(sessionStorage).filter(k => k.startsWith('tc_')).forEach(k => sessionStorage.removeItem(k));
    }
};

/* ---- CREDENTIALS ---- */
function getCred() {
    try {
        const s = sessionStorage.getItem('lumotv_cred');
        if (s) {
            const p = JSON.parse(s);
            if (!p.allowed_formats) { sessionStorage.removeItem('lumotv_cred'); localStorage.removeItem('lumotv_cred'); return null; }
            if (p.server) CONFIG.SERVER = p.server;
            return p;
        }
        const l = localStorage.getItem('lumotv_cred');
        if (l) {
            const p = JSON.parse(l);
            if (!p.allowed_formats) { localStorage.removeItem('lumotv_cred'); return null; }
            if (p.server) CONFIG.SERVER = p.server;
            return p;
        }
    } catch {}
    return null;
}
function saveCred(user, pass, remember, server, serverInfo, userInfo) {
    const o = { username: user, password: pass, server: server || CONFIG.SERVER };
    if (serverInfo) {
        o.allowed_formats = serverInfo.allowed_output_formats || ['m3u8'];
        o.server_protocol = serverInfo.server_protocol || 'http';
    }
    // Salvar dados do usuário para detecção imediata de trial sem nova chamada API
    if (userInfo) {
        o.is_trial    = userInfo.is_trial;
        o.exp_date    = userInfo.exp_date;
        o.user_status = userInfo.status;
        o.max_connections = userInfo.max_connections;
        
        // DEBUG: Ver dados do servidor
        console.log('🔍 DEBUG userInfo:', JSON.stringify(userInfo));
        console.log('🔍 DEBUG is_trial:', userInfo.is_trial, typeof userInfo.is_trial);
        console.log('🔍 DEBUG status:', userInfo.status);
        console.log('🔍 DEBUG exp_date:', userInfo.exp_date);
        
        // AUTO-DETECTAR TRIAL: Se exp_date é ≤ 24 horas, considerar como teste (Sigma IPTV não envia is_trial)
        const isTrueIsTrial = userInfo.is_trial === 1 || userInfo.is_trial === '1' || userInfo.is_trial === true;
        if (userInfo.exp_date && !isTrueIsTrial && userInfo.status !== 'Trial') {
            const horasRestantes = (Number(userInfo.exp_date) * 1000 - Date.now()) / 3600000;
            console.log('🔍 DEBUG horasRestantes:', horasRestantes);
            if (horasRestantes > 0 && horasRestantes <= 24) {
                o.is_trial = 1;
                o.user_status = 'Trial';
                console.log('✅ AUTO-DETECTADO COMO TRIAL! Horas restantes:', horasRestantes.toFixed(2));
            }
        }
    }
    CONFIG.SERVER = o.server;
    sessionStorage.setItem('lumotv_cred', JSON.stringify(o));
    if (remember) localStorage.setItem('lumotv_cred', JSON.stringify(o));
    else localStorage.removeItem('lumotv_cred');
}
function clearCred() {
    sessionStorage.removeItem('lumotv_cred');
    localStorage.removeItem('lumotv_cred');
    Cache.clear();
}

/* ---- PARENTAL CONTROL ---- */
function getParental() {
    try { return JSON.parse(localStorage.getItem('lumotv_parental') || '{}'); }
    catch { return {}; }
}
function saveParental(p) { localStorage.setItem('lumotv_parental', JSON.stringify(p)); }
function getPin() { return getParental().pin || '0000'; }
function setPin(newPin) { const p = getParental(); p.pin = newPin; saveParental(p); }
function isParentalOn() { return getParental().enabled === true; }
function setParentalOn(v) { const p = getParental(); p.enabled = v; saveParental(p); }
function getBlockedCats(type) { return getParental()['blocked_' + type] || []; }
function setBlockedCats(type, cats) { const p = getParental(); p['blocked_' + type] = cats; saveParental(p); }
function isCatBlocked(type, catId) {
    if (!isParentalOn()) return false;
    return getBlockedCats(type).includes(String(catId));
}

/* ---- DISPLAY MODE (Grid vs Carousel) ---- */
function getDisplayMode() {
    // Primeiro verifica preferência do usuário (localStorage), depois fallback para branding
    const userPref = localStorage.getItem('lumotv_display_mode');
    if (userPref) return userPref;
    return (window.BRANDING && window.BRANDING.display_mode) || 'carousel';
}
function setDisplayMode(mode) {
    localStorage.setItem('lumotv_display_mode', mode);
}

/* ---- INTRO ANIMATION ---- */
function isIntroEnabled() {
    return window.BRANDING && window.BRANDING.intro_enabled === true;
}
function getIntroDuration() {
    return (window.BRANDING && parseInt(window.BRANDING.intro_duration)) || 3;
}
function getIntroStyle() {
    return (window.BRANDING && window.BRANDING.intro_style) || 'netflix';
}
function playIntro(callback) {
    if (!isIntroEnabled()) {
        callback();
        return;
    }
    const overlay = document.getElementById('introOverlay');
    if (!overlay) {
        callback();
        return;
    }
    const duration = getIntroDuration();
    const style = getIntroStyle();
    overlay.className = 'intro-overlay intro-' + style;
    
    // Generate floating particles
    const particlesEl = overlay.querySelector('.intro-bg-particles');
    if (particlesEl) {
        particlesEl.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div');
            p.className = 'intro-particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (3 + Math.random() * 5) + 's';
            p.style.animationDelay = Math.random() * 3 + 's';
            p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
            p.style.opacity = (0.2 + Math.random() * 0.5);
            particlesEl.appendChild(p);
        }
    }
    
    overlay.classList.add('active');
    
    // Try to play startup sound (soft cinematic whoosh)
    try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.8);
        osc.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 1.5);
        gain.gain.setValueAtTime(0, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, ac.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0.04, ac.currentTime + 0.8);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 1.8);
        osc.connect(gain).connect(ac.destination);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + 2);
    } catch {}
    
    let introDone = false;
    function finishIntro() {
        if (introDone) return;
        introDone = true;
        overlay.classList.remove('active');
        setTimeout(() => { callback(); }, 500);
    }
    
    // Auto-close after duration
    setTimeout(finishIntro, duration * 1000);
    
    // Skip button
    const skipBtn = overlay.querySelector('.intro-skip');
    if (skipBtn) {
        skipBtn.onclick = () => finishIntro();
    }
}

/* ---- PROFILE SYSTEM ---- */
// Avatares usando imagens reais
const PROFILE_AVATAR_CATEGORIES = [
    { id: 'people', name: 'Pessoas', icon: 'fa-user', avatars: Array.from({length: 10}, (_, i) => ({ id: `people-${i+1}`, src: `avatars/people/people-${i+1}.jpg` })) },
    { id: 'robots', name: 'Robôs', icon: 'fa-robot', avatars: Array.from({length: 8}, (_, i) => ({ id: `robot-${i+1}`, src: `avatars/robots/robot-${i+1}.jpg` })) },
    { id: 'pets', name: 'Pets', icon: 'fa-paw', avatars: Array.from({length: 9}, (_, i) => ({ id: `pet-${i+1}`, src: `avatars/pets/pet-${i+1}.jpg` })) },
    { id: 'smiley', name: 'Emojis', icon: 'fa-smile', avatars: [
        ...Array.from({length: 5}, (_, i) => ({ id: `avatar-0${i+1}`, src: `avatars/smiley/avatar-0${i+1}.jpg` })),
        ...Array.from({length: 5}, (_, i) => ({ id: `smiley-${i+1}`, src: `avatars/smiley/smiley-${i+1}.jpg` }))
    ]}
];

// Fallback icons for legacy profiles
const PROFILE_AVATARS = [
    { id: 'bear', icon: 'fa-paw', color: '#ef4444' },
    { id: 'cat', icon: 'fa-cat', color: '#f97316' },
    { id: 'dog', icon: 'fa-dog', color: '#eab308' },
    { id: 'fish', icon: 'fa-fish', color: '#22c55e' },
    { id: 'bird', icon: 'fa-dove', color: '#06b6d4' },
    { id: 'spider', icon: 'fa-spider', color: '#8b5cf6' },
    { id: 'dragon', icon: 'fa-dragon', color: '#ec4899' },
    { id: 'hippo', icon: 'fa-hippo', color: '#14b8a6' },
    { id: 'frog', icon: 'fa-frog', color: '#84cc16' },
    { id: 'crow', icon: 'fa-crow', color: '#6366f1' },
    { id: 'otter', icon: 'fa-otter', color: '#a855f7' },
    { id: 'horse', icon: 'fa-horse', color: '#f43f5e' }
];

function getProfiles() {
    try { 
        const profiles = JSON.parse(localStorage.getItem('lumotv_profiles') || '[]');
        if (!profiles.length) {
            // Create default profile
            const defaultProfile = { id: 'default', name: 'Principal', avatar: 'bear', isKids: false };
            localStorage.setItem('lumotv_profiles', JSON.stringify([defaultProfile]));
            return [defaultProfile];
        }
        return profiles;
    } catch { 
        const defaultProfile = { id: 'default', name: 'Principal', avatar: 'bear', isKids: false };
        localStorage.setItem('lumotv_profiles', JSON.stringify([defaultProfile]));
        return [defaultProfile];
    }
}

function saveProfiles(profiles) {
    localStorage.setItem('lumotv_profiles', JSON.stringify(profiles));
}

function getCurrentProfile() {
    const profiles = getProfiles();
    const currentId = localStorage.getItem('lumotv_current_profile') || 'default';
    return profiles.find(p => p.id === currentId) || profiles[0];
}

function setCurrentProfile(profileId) {
    localStorage.setItem('lumotv_current_profile', profileId);
}

function createProfile(name, avatar, isKids = false) {
    const profiles = getProfiles();
    if (profiles.length >= 5) return null; // Max 5 profiles
    const id = 'profile_' + Date.now();
    const newProfile = { id, name, avatar, isKids };
    profiles.push(newProfile);
    saveProfiles(profiles);
    return newProfile;
}

function deleteProfile(profileId) {
    if (profileId === 'default') return false; // Can't delete default
    let profiles = getProfiles();
    profiles = profiles.filter(p => p.id !== profileId);
    saveProfiles(profiles);
    // Clean up profile data
    localStorage.removeItem('lumotv_fav_' + profileId);
    localStorage.removeItem('lumotv_hist_' + profileId);
    localStorage.removeItem('lumotv_progress_' + profileId);
    // Switch to default if deleted current
    if (localStorage.getItem('lumotv_current_profile') === profileId) {
        setCurrentProfile('default');
    }
    return true;
}

function updateProfile(profileId, updates) {
    const profiles = getProfiles();
    const idx = profiles.findIndex(p => p.id === profileId);
    if (idx === -1) return false;
    profiles[idx] = { ...profiles[idx], ...updates };
    saveProfiles(profiles);
    return true;
}

function getProfileAvatar(avatarId) {
    // Check if it's an image avatar
    for (const cat of PROFILE_AVATAR_CATEGORIES) {
        const found = cat.avatars.find(a => a.id === avatarId);
        if (found) return { type: 'image', src: found.src, id: found.id };
    }
    // Fallback to icon avatars
    const iconAv = PROFILE_AVATARS.find(a => a.id === avatarId) || PROFILE_AVATARS[0];
    return { type: 'icon', icon: iconAv.icon, color: iconAv.color, id: iconAv.id };
}

function getProfileStorageKey(key) {
    const profile = getCurrentProfile();
    return key + '_' + profile.id;
}

/* ---- KIDS PROFILE FILTER ---- */
const KIDS_KEYWORDS = [
    'infan', 'kids', 'child', 'crianc', 'criança', 'cartoon', 'desenho', 'animacao', 'animação',
    'disney', 'nickelodeon', 'nick', 'cartoon network', 'discovery kids', 'baby', 'gloob',
    'junior', 'jr', 'tooncast', 'boomerang', 'nat geo kids', 'nat kids', 'zoomoo',
    'animação', 'tv kids', 'mundo kids', 'family', 'familiar', 'infantis'
];

function isKidsProfile() {
    const profile = getCurrentProfile();
    return profile && profile.isKids === true;
}

function isKidsCategory(categoryName) {
    if (!categoryName) return false;
    const lower = categoryName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return KIDS_KEYWORDS.some(kw => lower.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

function filterKidsContent(items) {
    if (!isKidsProfile()) return items;
    return items.filter(item => {
        const catName = item.category_name || '';
        const name = item.name || '';
        return isKidsCategory(catName) || isKidsCategory(name);
    });
}

/* ---- FAVORITES (per profile) ---- */
function getFav() {
    const key = getProfileStorageKey('lumotv_fav');
    try { return JSON.parse(localStorage.getItem(key) || '{"live":[],"vod":[],"series":[]}'); }
    catch { return { live: [], vod: [], series: [] }; }
}
function saveFav(f) { 
    const key = getProfileStorageKey('lumotv_fav');
    localStorage.setItem(key, JSON.stringify(f)); 
}
function isFav(type, id) { return getFav()[type]?.some(f => f.id == id) || false; }
function toggleFav(type, id, name, extra) {
    const f = getFav();
    if (!f[type]) f[type] = [];
    const idx = f[type].findIndex(x => x.id == id);
    if (idx >= 0) { f[type].splice(idx, 1); saveFav(f); return false; }
    f[type].push({ id, name, ...extra });
    saveFav(f);
    return true;
}

/* ---- HISTORY (per profile) ---- */
function getHist() { 
    const key = getProfileStorageKey('lumotv_hist');
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } 
}
function addHist(item) {
    const key = getProfileStorageKey('lumotv_hist');
    let h = getHist().filter(x => x.id !== item.id);
    h.unshift({ ...item, ts: Date.now() });
    if (h.length > 30) h = h.slice(0, 30);
    localStorage.setItem(key, JSON.stringify(h));
}

/* ---- PROGRESS (continue watching, per profile) ---- */
function getProgress() { 
    const key = getProfileStorageKey('lumotv_progress');
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } 
}
function saveProgress(id, currentTime, duration) {
    if (!id || !duration || duration < 30) return;
    const key = getProfileStorageKey('lumotv_progress');
    const p = getProgress();
    // Remove if watched >= 95%
    if (currentTime / duration >= 0.95) { delete p[id]; }
    else if (currentTime > 10) { p[id] = { t: Math.floor(currentTime), d: Math.floor(duration), ts: Date.now() }; }
    localStorage.setItem(key, JSON.stringify(p));
}
function getProgressFor(id) { return getProgress()[id] || null; }
function clearProgress(id) { 
    const key = getProfileStorageKey('lumotv_progress');
    const p = getProgress(); 
    delete p[id]; 
    localStorage.setItem(key, JSON.stringify(p)); 
}
function fmtTime(s) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; }

/* ---- API ---- */
const API = {
    _base(c) { return `${CONFIG.SERVER}/player_api.php?username=${c.username}&password=${c.password}`; },
    async _get(url) {
        const cached = Cache.get(url);
        if (cached) return cached;
        const r = await fetch(CONFIG.PROXY_API + encodeURIComponent(url));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d && !Array.isArray(d) && d.error) throw new Error(d.error);
        Cache.set(url, d);
        return d;
    },
    async auth(user, pass) {
        const url = `${CONFIG.SERVER}/player_api.php?username=${user}&password=${pass}`;
        const r = await fetch(CONFIG.PROXY_API + encodeURIComponent(url));
        if (!r.ok) throw new Error('Erro de conexão');
        const d = await r.json();
        if (!d.user_info) throw new Error('Credenciais inválidas');
        if (d.user_info.auth === 0) throw new Error('Conta não autorizada');
        return d;
    },
    liveCats(c) { return this._get(this._base(c) + '&action=get_live_categories'); },
    liveStreams(c) { return this._get(this._base(c) + '&action=get_live_streams'); },
    vodCats(c) { return this._get(this._base(c) + '&action=get_vod_categories'); },
    vodStreams(c) { return this._get(this._base(c) + '&action=get_vod_streams'); },
    seriesCats(c) { return this._get(this._base(c) + '&action=get_series_categories'); },
    series(c) { return this._get(this._base(c) + '&action=get_series'); },
    seriesInfo(c, id) { return this._get(this._base(c) + '&action=get_series_info&series_id=' + id); },
    vodInfo(c, id) { return this._get(this._base(c) + '&action=get_vod_info&vod_id=' + id); },
    shortEpg(c, id) { return this._get(this._base(c) + '&action=get_short_epg&stream_id=' + id); },
    liveUrl(c, id) {
        const fmts = c.allowed_formats || ['m3u8'];
        const fmt = fmts.includes('m3u8') ? 'm3u8' : fmts[0];
        return CONFIG.PROXY_STREAM + encodeURIComponent(`${CONFIG.SERVER}/live/${c.username}/${c.password}/${id}.${fmt}`);
    },
    liveUrlTs(c, id) { return CONFIG.PROXY_STREAM + encodeURIComponent(`${CONFIG.SERVER}/live/${c.username}/${c.password}/${id}.ts`); },
    vodUrl(c, id, ext) {
        // VOD always uses original container_extension (mkv, mp4, avi etc)
        return CONFIG.PROXY_STREAM + encodeURIComponent(`${CONFIG.SERVER}/movie/${c.username}/${c.password}/${id}.${ext || 'mp4'}`);
    },
    epUrl(c, id, ext) {
        // Series episodes always use original container_extension
        return CONFIG.PROXY_STREAM + encodeURIComponent(`${CONFIG.SERVER}/series/${c.username}/${c.password}/${id}.${ext || 'mp4'}`);
    }
};

/* ---- UTILS ---- */
const esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';

// Decodificar base64 com suporte a UTF-8
const decodeB64 = (str) => {
    if (!str || typeof str !== 'string') return str || '';
    // Verificar se parece base64 válido (só contém chars válidos de base64)
    const b64regex = /^[A-Za-z0-9+/\r\n]+=*$/;
    const cleaned = str.replace(/\s/g, '');
    if (!b64regex.test(cleaned) || cleaned.length < 4) return str;
    try {
        // Corrigir padding se necessário
        let padded = cleaned;
        while (padded.length % 4 !== 0) padded += '=';
        const binaryString = atob(padded);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const decoded = new TextDecoder('utf-8').decode(bytes);
        // Se o resultado decodificado tem chars de controle estranhos, provavelmente não era base64
        if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) return str;
        return decoded;
    } catch {
        return str;
    }
};

function toast(msg, type = 'info') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
    document.body.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateY(16px)'; setTimeout(() => d.remove(), 300); }, 3000);
}

/* ---- PWA ---- */
let deferredPrompt = null;
function initPWA() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    const banner = document.getElementById('installBanner');
    const sidebarBtn = document.getElementById('btnSidebarInstall');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isStandalone) { if (sidebarBtn) sidebarBtn.style.display = 'none'; if (banner) banner.style.display = 'none'; return; }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Show sidebar install button always (not just on beforeinstallprompt)
    function showSidebarInstall() {
        if (sidebarBtn) {
            sidebarBtn.style.display = 'flex';
            sidebarBtn.onclick = async () => {
                if (isIOS) {
                    toast('Toque em Compartilhar → Adicionar à Tela de Início', 'info');
                    return;
                }
                if (!deferredPrompt) { toast('Use o menu do navegador (⋮) → Instalar app', 'info'); return; }
                deferredPrompt.prompt();
                const r = await deferredPrompt.userChoice;
                if (r.outcome === 'accepted') {
                    sidebarBtn.style.display = 'none';
                    if (banner) banner.style.display = 'none';
                    toast('App instalado com sucesso!', 'success');
                }
                deferredPrompt = null;
            };
        }
    }

    // Always show sidebar install button
    showSidebarInstall();

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        if (banner && !localStorage.getItem('lumotv_install_no')) banner.style.display = 'block';
        showSidebarInstall();
    });

    // Show banner proactively for first-time users (even without beforeinstallprompt)
    if (banner && !localStorage.getItem('lumotv_install_no')) {
        // Delay showing banner so it doesn't block initial experience
        setTimeout(() => {
            if (!isStandalone && banner.style.display === 'none') {
                banner.style.display = 'block';
            }
        }, 3000);
    }

    if (banner) {
        const installBtn = document.getElementById('btnInstallApp');
        const closeBtn = document.getElementById('btnCloseInstall');
        if (isIOS && installBtn) {
            installBtn.innerHTML = '<i class="fas fa-share-from-square"></i> Como instalar';
            installBtn.onclick = () => toast('Toque em Compartilhar → Adicionar à Tela de Início', 'info');
        } else if (installBtn) {
            installBtn.onclick = async () => {
                if (!deferredPrompt) {
                    toast('Use o menu do navegador (⋮) → Instalar app', 'info');
                    return;
                }
                deferredPrompt.prompt();
                const r = await deferredPrompt.userChoice;
                if (r.outcome === 'accepted') { banner.style.display = 'none'; toast('App instalado!', 'success'); }
                deferredPrompt = null;
            };
        }
        if (closeBtn) closeBtn.onclick = () => { banner.style.display = 'none'; localStorage.setItem('lumotv_install_no', '1'); };
    }
    window.addEventListener('appinstalled', () => { if (banner) banner.style.display = 'none'; if (sidebarBtn) sidebarBtn.style.display = 'none'; });
}

/* ============================
   LOGIN PAGE
   ============================ */
function initLogin() {
    initPWA();

    // Tocar som de startup
    tryStartupSound();
    document.addEventListener('click', tryStartupSound, true);
    document.addEventListener('touchstart', tryStartupSound, true);
    document.addEventListener('keydown', tryStartupSound, true);

    const form = document.getElementById('loginForm');
    if (!form) return;
    const c = getCred();
    if (c) { window.location.href = 'player.html'; return; }
    const btn = document.getElementById('btnConnect');
    const errBox = document.getElementById('errorMessage');
    const errText = document.getElementById('errorText');
    const user = document.getElementById('username');
    const pass = document.getElementById('password');
    const rem = document.getElementById('rememberMe');
    const btnText = btn?.querySelector('.btn-text');
    const btnLoad = btn?.querySelector('.btn-loading');
    document.getElementById('togglePassword')?.addEventListener('click', function () {
        const show = pass.type === 'password';
        pass.type = show ? 'text' : 'password';
        this.querySelector('i').className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (errBox) errBox.style.display = 'none';
        btn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnLoad) btnLoad.style.display = 'inline-flex';
        // Esperar servidores do admin carregarem
        await waitAdminServers();
        const u = user.value.trim();
        const p = pass.value.trim();
        let authenticated = false;
        let results = null;

        // console.log('[WEBPLAY] Tentando login...');

        // Tentar todos os servidores em PARALELO (muito mais rápido)
        try {
            results = await Promise.allSettled(
                CONFIG.SERVERS.map(async (srv) => {
                    const url = `${srv.url}/player_api.php?username=${u}&password=${p}`;
                    const proxyUrl = CONFIG.PROXY_API + encodeURIComponent(url);
                    // console.log('[WEBPLAY] Testando servidor:', srv.name);
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 25000);
                    try {
                        const r = await fetch(proxyUrl, { signal: controller.signal });
                        clearTimeout(timeout);
                        if (!r.ok) {
                            throw new Error('HTTP ' + r.status);
                        }
                        const text = await r.text();
                        let d;
                        try { d = JSON.parse(text); } catch { 
                            throw new Error('Resposta inválida'); 
                        }
                        if (d.error) {
                            throw new Error(d.error);
                        }
                        if (!d.user_info) {
                            throw new Error('Sem user_info');
                        }
                        if (d.user_info.auth === 0) {
                            // Detectar motivo específico para mensagem clara no login
                            const st = String(d.user_info.status || '').toLowerCase();
                            if (st === 'disabled' || st === 'banned') {
                                throw new Error('__CONTA_BLOQUEADA__');
                            } else if (st === 'expired') {
                                const expTs = d.user_info.exp_date || '';
                                throw new Error('__CONTA_EXPIRADA__:' + expTs);
                            }
                            throw new Error('__NAO_AUTORIZADO__');
                        }
                        // Login bem-sucedido
                        return { server: srv, data: d };
                    } catch (err) {
                        clearTimeout(timeout);
                        throw err;
                    }
                })
            );
            
            // Login tentado
            
            // Pegar o primeiro que deu certo
            const success = results.find(r => r.status === 'fulfilled');
            if (success) {
                const { server, data } = success.value;
                // Use the ORIGINAL server URL for streams (HTTP)
                // HTTPS often fails for streams even when API says server_protocol:https
                const baseUrl = server.url;
                // Save server_info for allowed_formats (used only for live streams)
                CONFIG.SERVER = baseUrl;
                saveCred(u, p, rem?.checked, baseUrl, data.server_info, data.user_info);
                // Login bem-sucedido
                authenticated = true;
                window.location.href = 'player.html';
                return;
            }
        } catch (outerErr) {
            // Erro ao processar login
        }

        if (!authenticated) {
            // Checar motivo da falha para mensagem específica
            const allTimeout   = results && results.every(r => r.status === 'rejected' && /timeout|abort|timed/i.test(r.reason?.message || ''));
            const anyBlocked   = results && results.some(r => r.status === 'rejected' && r.reason?.message === '__CONTA_BLOQUEADA__');
            const anyExpired   = results && results.some(r => r.status === 'rejected' && (r.reason?.message || '').startsWith('__CONTA_EXPIRADA__'));
            const anyNoAuth    = results && results.some(r => r.status === 'rejected' && r.reason?.message === '__NAO_AUTORIZADO__');
            const errIcon = errBox?.querySelector('i');
            if (allTimeout) {
                if (errIcon) errIcon.className = 'fas fa-wifi';
                if (errText) errText.textContent = 'Servidores indisponíveis (timeout). Verifique sua conexão ou tente novamente.';
            } else if (anyBlocked) {
                if (errIcon) errIcon.className = 'fas fa-lock';
                if (errText) errText.innerHTML = '<strong>Conta bloqueada.</strong> Entre em contato com o suporte para reativar o acesso.';
            } else if (anyExpired) {
                // Extrair exp_date do erro
                const expResult = results.find(r => r.status === 'rejected' && (r.reason?.message || '').startsWith('__CONTA_EXPIRADA__'));
                const expTs = expResult ? (expResult.reason.message.split(':')[1] || '') : '';
                // Mostrar modal de conta expirada
                _showExpiredModal(expTs);
                if (errIcon) errIcon.className = 'fas fa-calendar-xmark';
                if (errText) errText.innerHTML = '<strong>Conta expirada.</strong> Renove sua assinatura para continuar assistindo.';
            } else if (anyNoAuth) {
                if (errIcon) errIcon.className = 'fas fa-ban';
                if (errText) errText.textContent = 'Acesso negado pelo servidor. Verifique suas credenciais.';
                _showWrongCredModal();
            } else {
                if (errIcon) errIcon.className = 'fas fa-exclamation-circle';
                if (errText) errText.textContent = 'Usuário ou senha inválidos. Verifique seus dados.';
                _showWrongCredModal();
            }
            if (errBox) errBox.style.display = 'flex';
        }
        btn.disabled = false;
        if (btnText) btnText.style.display = 'inline';
        if (btnLoad) btnLoad.style.display = 'none';
    });

    /** Modal de credenciais inválidas */
    function _showWrongCredModal() {
        const overlay = document.getElementById('wrongCredModalOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        const closeX = document.getElementById('wrongCredModalClose');
        const closeBtn = document.getElementById('wrongCredCloseBtn');
        const closeFn = () => { overlay.style.display = 'none'; };
        if (closeX) closeX.onclick = closeFn;
        if (closeBtn) closeBtn.onclick = closeFn;
        overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
    }

    /** Modal de conta expirada na página de login */
    function _showExpiredModal(expTimestamp) {
        const overlay = document.getElementById('expiredModalOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';

        // Exibir data de expiração
        const dateEl = document.getElementById('expiredModalDate');
        if (dateEl && expTimestamp) {
            try {
                const ts = parseInt(expTimestamp);
                if (!isNaN(ts) && ts > 0) {
                    const d = new Date(ts * 1000);
                    const opts = { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
                    dateEl.innerHTML = '<i class="fas fa-clock"></i> Expirou em: ' + d.toLocaleDateString('pt-BR', opts);
                } else {
                    dateEl.innerHTML = '<i class="fas fa-clock"></i> Expirou em: ' + expTimestamp;
                }
            } catch { dateEl.textContent = ''; }
        }

        // Botão renovar — tenta pegar checkout_url do branding
        const btnRenew = document.getElementById('expiredModalRenew');
        if (btnRenew) {
            fetch('api/admin_api.php?action=public_branding').then(r => r.json()).then(br => {
                if (br.checkout_url) {
                    btnRenew.onclick = () => window.open(br.checkout_url, '_blank');
                } else if (br.whatsapp_enabled && br.whatsapp_number) {
                    const num = br.whatsapp_number.replace(/\\D/g, '');
                    const msg = encodeURIComponent('Olá! Minha conta expirou e quero renovar.');
                    btnRenew.innerHTML = '<i class="fab fa-whatsapp"></i> Falar com Suporte';
                    btnRenew.onclick = () => window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
                } else {
                    btnRenew.style.display = 'none';
                }
            }).catch(() => { btnRenew.style.display = 'none'; });
        }

        // Fechar modal
        const closeX = document.getElementById('expiredModalClose');
        const closeBtn = document.getElementById('expiredModalCloseBtn');
        const closeFn = () => { overlay.style.display = 'none'; };
        if (closeX) closeX.onclick = closeFn;
        if (closeBtn) closeBtn.onclick = closeFn;
        overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
    }
}

/* ============================
   PROFILE UI INITIALIZATION
   ============================ */
function initProfileUI() {
    const $$ = id => document.getElementById(id);
    
    // Render profile switcher in sidebar
    function renderProfileSwitcher() {
        const profile = getCurrentProfile();
        const avatar = getProfileAvatar(profile.avatar);
        const avatarEl = $$('profileAvatarSmall');
        const nameEl = $$('profileNameSmall');
        
        if (avatarEl) {
            if (avatar.type === 'image') {
                avatarEl.innerHTML = `<img src="${avatar.src}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-user" style="display:none"></i>`;
                avatarEl.style.background = 'transparent';
            } else {
                avatarEl.innerHTML = `<i class="fas ${avatar.icon}"></i>`;
                avatarEl.style.background = avatar.color;
            }
        }
        if (nameEl) {
            nameEl.textContent = profile.name;
        }
        
        // Render dropdown
        const listEl = $$('profileList');
        if (listEl) {
            const profiles = getProfiles();
            listEl.innerHTML = profiles.map(p => {
                const av = getProfileAvatar(p.avatar);
                const isActive = p.id === profile.id;
                const avatarHtml = av.type === 'image' 
                    ? `<img src="${av.src}" alt="" onerror="this.style.display='none'">` 
                    : `<i class="fas ${av.icon}"></i>`;
                const bgStyle = av.type === 'image' ? 'background:transparent' : `background:${av.color}`;
                return `<div class="profile-dropdown-item ${isActive ? 'active' : ''}" data-profile-id="${p.id}">
                    <div class="profile-avatar-small" style="${bgStyle}">
                        ${avatarHtml}
                    </div>
                    <span class="profile-name-small">${p.name}</span>
                    ${p.isKids ? '<span class="kids-badge"><i class="fas fa-child"></i></span>' : ''}
                </div>`;
            }).join('');
            
            // Add "Add Profile" button to dropdown
            if (profiles.length < 5) {
                listEl.innerHTML += `<div class="profile-dropdown-item add-profile" id="btnAddProfileDropdown">
                    <div class="profile-avatar-small add-avatar"><i class="fas fa-plus"></i></div>
                    <span class="profile-name-small">Adicionar Perfil</span>
                </div>`;
            }
            
            // Click handlers for profile items - go to profile selector screen
            listEl.querySelectorAll('.profile-dropdown-item:not(.add-profile)').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeProfileDropdown();
                    // Go to profile selector screen (Netflix style)
                    sessionStorage.removeItem('lumotv_profile_selected');
                    $$('appContainer').style.display = 'none';
                    const _bnH1 = document.getElementById('mobileBottomNav'); if (_bnH1) _bnH1.classList.remove('visible');
                    showProfileSelector();
                });
            });
            
            // Add profile button in dropdown
            const addDropBtn = $$('btnAddProfileDropdown');
            if (addDropBtn) {
                addDropBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeProfileDropdown();
                    showProfileManager();
                });
            }
        }
    }
    
    // Toggle profile dropdown
    const profileCurrent = $$('profileCurrent');
    const profileSwitcher = $$('profileSwitcher');
    const profileDropdown = $$('profileDropdown');
    
    function closeProfileDropdown() {
        profileSwitcher?.classList.remove('open');
    }
    
    function positionDropdown() {
        if (!profileCurrent || !profileDropdown) return;
        const rect = profileCurrent.getBoundingClientRect();
        profileDropdown.style.left = rect.left + 'px';
        profileDropdown.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        profileDropdown.style.width = Math.max(rect.width, 220) + 'px';
    }
    
    if (profileCurrent) {
        profileCurrent.addEventListener('click', (e) => {
            e.stopPropagation();
            positionDropdown();
            profileSwitcher?.classList.toggle('open');
        });
    }
    
    window.addEventListener('resize', () => {
        if (profileSwitcher?.classList.contains('open')) positionDropdown();
    });
    
    document.addEventListener('click', () => closeProfileDropdown());
    profileDropdown?.addEventListener('click', e => e.stopPropagation());
    
    // Manage profiles button in sidebar - go to profile selector
    $$('btnManageProfiles')?.addEventListener('click', () => {
        closeProfileDropdown();
        sessionStorage.removeItem('lumotv_profile_selected');
        $$('appContainer').style.display = 'none';
        const _bnH2 = document.getElementById('mobileBottomNav'); if (_bnH2) _bnH2.classList.remove('visible');
        showProfileSelector();
    });
    
    // Switch Profile button in sidebar
    const btnSwitchProfile = $$('btnSwitchProfile');
    if (btnSwitchProfile) {
        btnSwitchProfile.onclick = () => {
            closeProfileDropdown();
            sessionStorage.removeItem('lumotv_profile_selected');
            $$('appContainer').style.display = 'none';
            const _bnH3 = document.getElementById('mobileBottomNav'); if (_bnH3) _bnH3.classList.remove('visible');
            showProfileSelector();
        };
    }
    
    // Profile manager modal
    let editingProfileId = null;
    let selectedAvatar = 'bear';
    
    function showProfileManager(profileId = null) {
        editingProfileId = profileId;
        const modal = $$('profileManageModal');
        if (!modal) return;
        
        const nameInput = $$('profileNameInput');
        const isKidsInput = $$('profileIsKids');
        const deleteBtn = $$('btnDeleteProfile');
        const avatarGrid = $$('profileAvatarGrid');
        
        // Render avatar categories with images
        if (avatarGrid) {
            let selectedCat = 'people';
            
            avatarGrid.innerHTML = `
                <div class="avatar-category-tabs">
                    ${PROFILE_AVATAR_CATEGORIES.map(cat => 
                        `<button type="button" class="avatar-cat-tab ${cat.id === selectedCat ? 'active' : ''}" data-cat="${cat.id}">
                            <i class="fas ${cat.icon}"></i> ${cat.name}
                        </button>`
                    ).join('')}
                </div>
                <div class="avatar-category-grid" id="avatarCategoryGrid"></div>
            `;
            
            const gridEl = avatarGrid.querySelector('#avatarCategoryGrid');
            
            function renderAvatarCategory(catId) {
                const cat = PROFILE_AVATAR_CATEGORIES.find(c => c.id === catId);
                if (!cat || !gridEl) return;
                
                gridEl.innerHTML = cat.avatars.map(av => 
                    `<div class="profile-avatar-option img-avatar ${av.id === selectedAvatar ? 'selected' : ''}" data-avatar="${av.id}">
                        <img src="${av.src}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
                    </div>`
                ).join('');
                
                gridEl.querySelectorAll('.profile-avatar-option').forEach(opt => {
                    opt.addEventListener('click', () => {
                        avatarGrid.querySelectorAll('.profile-avatar-option').forEach(o => o.classList.remove('selected'));
                        opt.classList.add('selected');
                        selectedAvatar = opt.dataset.avatar;
                    });
                });
            }
            
            avatarGrid.querySelectorAll('.avatar-cat-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    avatarGrid.querySelectorAll('.avatar-cat-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    renderAvatarCategory(tab.dataset.cat);
                });
            });
            
            renderAvatarCategory(selectedCat);
        }
        
        const modalTitle = $$('profileManageTitle');
        const saveBtn = $$('btnSaveProfile');
        const headerIcon = modal.querySelector('.profile-manage-header-icon i');
        const kidsCard = $$('kidsToggleCard');
        
        if (profileId) {
            // Editing existing profile
            const profile = getProfiles().find(p => p.id === profileId);
            if (profile) {
                if (nameInput) nameInput.value = profile.name;
                if (isKidsInput) isKidsInput.checked = profile.isKids || false;
                selectedAvatar = profile.avatar || 'people-1';
                if (deleteBtn) deleteBtn.style.display = profileId !== 'default' ? '' : 'none';
                if (modalTitle) modalTitle.textContent = 'Editar Perfil';
                if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Salvar Alterações';
                if (headerIcon) headerIcon.className = 'fas fa-user-pen';
            }
        } else {
            // New profile
            if (nameInput) nameInput.value = '';
            if (isKidsInput) isKidsInput.checked = false;
            const randomIdx = Math.floor(Math.random() * 25) + 1;
            selectedAvatar = `people-${randomIdx}`;
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (modalTitle) modalTitle.textContent = 'Novo Perfil';
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Perfil';
            if (headerIcon) headerIcon.className = 'fas fa-user-plus';
        }
        
        // Update kids toggle visual
        if (kidsCard && isKidsInput) {
            kidsCard.classList.toggle('active', isKidsInput.checked);
        }
        
        // Update selected avatar after render
        setTimeout(() => {
            avatarGrid?.querySelectorAll('.profile-avatar-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.avatar === selectedAvatar);
            });
        }, 50);
        
        modal.style.display = 'flex';
        // Focus name input
        setTimeout(() => nameInput?.focus(), 150);
    }
    
    function closeProfileManager() {
        const modal = $$('profileManageModal');
        if (modal) modal.style.display = 'none';
        editingProfileId = null;
        showProfileSelector();
    }
    
    // ---- Bind modal buttons using direct onclick ----
    const closeManageBtn = $$('btnCloseProfileManage');
    if (closeManageBtn) closeManageBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); closeProfileManager(); };
    
    const saveProfileBtn = $$('btnSaveProfile');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = $$('profileNameInput')?.value.trim();
            const isKids = $$('profileIsKids')?.checked || false;
            
            if (!name) {
                $$('profileNameInput')?.focus();
                toast('Digite um nome para o perfil', 'error');
                return;
            }
            
            if (editingProfileId) {
                updateProfile(editingProfileId, { name, avatar: selectedAvatar, isKids });
                toast('Perfil atualizado!', 'success');
            } else {
                const newProfile = createProfile(name, selectedAvatar, isKids);
                if (!newProfile) {
                    toast('Máximo de 5 perfis atingido', 'error');
                    return;
                }
                toast('Perfil criado!', 'success');
            }
            
            localStorage.setItem('lumotv_first_profile_setup', '1');
            closeProfileManager();
            renderProfileSwitcher();
        };
    }
    
    const deleteProfileBtn = $$('btnDeleteProfile');
    if (deleteProfileBtn) {
        deleteProfileBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editingProfileId && editingProfileId !== 'default') {
                if (confirm('Tem certeza que deseja excluir este perfil?\nTodos os favoritos e histórico serão perdidos.')) {
                    deleteProfile(editingProfileId);
                    toast('Perfil excluído', 'info');
                    closeProfileManager();
                    renderProfileSwitcher();
                    // If deleted current profile, reload
                    if (getCurrentProfile().id === 'default' && editingProfileId !== 'default') {
                        window.location.reload();
                    }
                }
            }
        };
    }
    
    // Kids toggle card click
    const kidsToggleCard = $$('kidsToggleCard');
    const kidsCheckbox = $$('profileIsKids');
    if (kidsToggleCard && kidsCheckbox) {
        kidsToggleCard.addEventListener('click', (e) => {
            if (e.target.closest('.switch-toggle')) return; // Let toggle handle itself
            kidsCheckbox.checked = !kidsCheckbox.checked;
            kidsToggleCard.classList.toggle('active', kidsCheckbox.checked);
        });
        kidsCheckbox.addEventListener('change', () => {
            kidsToggleCard.classList.toggle('active', kidsCheckbox.checked);
        });
    }
    
    // Profile click sound (Netflix style)
    function playProfileClickSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch(e) {}
    }
    
    // ======== Profile Selector Screen (Netflix style) ========
    function showProfileSelector() {
        const screen = $$('profileSelectorScreen');
        const grid = $$('profileSelectorGrid');
        
        if (!screen || !grid) return;
        
        const profiles = getProfiles();
        const isEditMode = screen.classList.contains('edit-mode');
        
        grid.innerHTML = '';
        
        // Build profile cards
        profiles.forEach(p => {
            const av = getProfileAvatar(p.avatar);
            const avatarHtml = av.type === 'image' 
                ? `<img src="${av.src}" alt="" onerror="this.style.display='none'">` 
                : `<i class="fas ${av.icon}"></i>`;
            const bgStyle = av.type === 'image' ? 'background:transparent' : `background:${av.color}`;
            
            const item = document.createElement('div');
            item.className = `profile-selector-item ${p.isKids ? 'kids' : ''}`;
            item.dataset.profileId = p.id;
            item.innerHTML = `
                <div class="profile-selector-avatar" style="${bgStyle}">
                    ${avatarHtml}
                    ${p.isKids ? '<span class="kids-avatar-badge">KIDS</span>' : ''}
                </div>
                <div class="profile-name">${p.name}</div>
                <button type="button" class="profile-edit-btn" data-edit-id="${p.id}"><i class="fas fa-pen"></i></button>
            `;
            
            // Click to select profile
            item.addEventListener('click', (e) => {
                if (e.target.closest('.profile-edit-btn')) return;
                
                playProfileClickSound();
                item.classList.add('selected');
                setCurrentProfile(p.id);
                sessionStorage.setItem('lumotv_profile_selected', '1');
                
                setTimeout(() => {
                    screen.style.opacity = '0';
                    screen.style.transition = 'opacity 0.4s ease';
                    
                    setTimeout(() => {
                        screen.style.display = 'none';
                        screen.style.opacity = '1';
                        screen.classList.remove('edit-mode');
                        const appContainer = $$('appContainer');
                        if (appContainer) {
                            appContainer.style.display = 'flex';
                            appContainer.style.opacity = '0';
                            appContainer.style.transition = 'opacity 0.3s ease';
                            setTimeout(() => { appContainer.style.opacity = '1'; }, 50);
                        }
                        // Mostrar bottom nav mobile
                        const _bn = document.getElementById('mobileBottomNav');
                        if (_bn) _bn.classList.add('visible');
                        renderProfileSwitcher();
                        // Force reload content for kids filter
                        if (typeof window._forceReloadContent === 'function') window._forceReloadContent();
                    }, 400);
                }, 300);
            });
            
            // Edit button
            const editBtn = item.querySelector('.profile-edit-btn');
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showProfileManager(p.id);
            });
            
            grid.appendChild(item);
        });
        
        // Add Profile card (max 5)
        if (profiles.length < 5) {
            const addCard = document.createElement('div');
            addCard.className = 'profile-selector-item add-profile-card';
            addCard.innerHTML = `
                <div class="profile-selector-avatar add-avatar">
                    <i class="fas fa-plus"></i>
                </div>
                <div class="profile-name">Adicionar Perfil</div>
            `;
            addCard.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showProfileManager(null);
            });
            grid.appendChild(addCard);
        }
        
        // ---- Bind action buttons directly ----
        const manageBtn = $$('btnManageProfilesSelector');
        if (manageBtn) {
            manageBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                screen.classList.toggle('edit-mode');
                // Update button text
                const isEdit = screen.classList.contains('edit-mode');
                manageBtn.innerHTML = isEdit 
                    ? '<i class="fas fa-check"></i> Concluído' 
                    : '<i class="fas fa-pen-to-square"></i> Gerenciar Perfis';
            };
        }
        
        const logoutBtn = $$('btnLogoutSelector');
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearCred();
                localStorage.removeItem('lumotv_profile_selected');
                sessionStorage.removeItem('lumotv_profile_selected');
                window.location.href = 'index.html';
            };
        }
        
        screen.style.display = 'flex';
        screen.style.opacity = '1';
    }
    
    // Initialize
    renderProfileSwitcher();
    
    // Splash + Profile Selector Flow
    const shownSelector = sessionStorage.getItem('lumotv_profile_selected');
    
    setTimeout(() => {
        $$('splashScreen')?.remove();
        
        if (!shownSelector) {
            showProfileSelector();
        } else {
            $$('profileSelectorScreen').style.display = 'none';
            $$('appContainer').style.display = 'flex';
            // Mostrar bottom nav mobile
            const _bn2 = document.getElementById('mobileBottomNav');
            if (_bn2) _bn2.classList.add('visible');
        }
    }, 3000);
}

/* ============================
   STARTUP SOUND — toca ao entrar/recarregar
   ============================ */
function playStartupSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;

        // Master gain
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.18, now);
        master.gain.linearRampToValueAtTime(0, now + 1.2);
        master.connect(ctx.destination);

        // Note 1 — C5
        const o1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        o1.type = 'sine';
        o1.frequency.setValueAtTime(523.25, now);
        g1.gain.setValueAtTime(0.6, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        o1.connect(g1); g1.connect(master);
        o1.start(now); o1.stop(now + 0.6);

        // Note 2 — E5
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(659.25, now + 0.15);
        g2.gain.setValueAtTime(0.5, now + 0.15);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
        o2.connect(g2); g2.connect(master);
        o2.start(now + 0.15); o2.stop(now + 0.75);

        // Note 3 — G5 (resolve)
        const o3 = ctx.createOscillator();
        const g3 = ctx.createGain();
        o3.type = 'sine';
        o3.frequency.setValueAtTime(783.99, now + 0.3);
        g3.gain.setValueAtTime(0.55, now + 0.3);
        g3.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        o3.connect(g3); g3.connect(master);
        o3.start(now + 0.3); o3.stop(now + 1.1);

        // Shimmer — oitava alta sutil
        const o4 = ctx.createOscillator();
        const g4 = ctx.createGain();
        o4.type = 'triangle';
        o4.frequency.setValueAtTime(1567.98, now + 0.35);
        g4.gain.setValueAtTime(0.12, now + 0.35);
        g4.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        o4.connect(g4); g4.connect(master);
        o4.start(now + 0.35); o4.stop(now + 1.0);

        // Cleanup
        setTimeout(() => { try { ctx.close(); } catch {} }, 2000);
        return true;
    } catch { return false; }
}

// Tenta tocar imediatamente; se bloqueado, toca no primeiro toque/clique
let _startupSoundPlayed = false;
function tryStartupSound() {
    if (_startupSoundPlayed) return;
    if (playStartupSound()) {
        _startupSoundPlayed = true;
        document.removeEventListener('click', tryStartupSound, true);
        document.removeEventListener('touchstart', tryStartupSound, true);
        document.removeEventListener('keydown', tryStartupSound, true);
    }
}

/* ============================
   PLAYER PAGE
   ============================ */
function initPlayer() {
    initPWA();
    const cred = getCred();
    if (!cred) { window.location.href = 'index.html'; return; }

    // Tocar som de startup
    tryStartupSound();
    document.addEventListener('click', tryStartupSound, true);
    document.addEventListener('touchstart', tryStartupSound, true);
    document.addEventListener('keydown', tryStartupSound, true);

    // === RESET: forçar dashboard na abertura (evita modal restaurado pelo iOS/mobile) ===
    const _chModal = document.getElementById('channelModal');
    if (_chModal) { _chModal.style.display = 'none'; _chModal.classList.remove('ch-modal-open'); }
    const _playerOv = document.getElementById('playerOverlay');
    if (_playerOv) { _playerOv.remove(); }
    document.body.style.overflow = '';
    document.body.classList.remove('channel-modal-open');
    // Parar qualquer vídeo que o navegador possa ter restaurado
    document.querySelectorAll('video').forEach(v => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} });

    // Initialize profile UI
    initProfileUI();

    // State
    const S = {
        sec: 'home',
        liveCats: [], live: [],
        vodCats: [], vod: [],
        serCats: [], ser: [],
        fLive: [], fVod: [], fSer: [],
        liveCat: 'all', vodCat: 'all', serCat: 'all',
        liveQ: '', vodQ: '', serQ: '',
        liveN: 0, vodN: 0, serN: 0,
        hls: null, playing: false
    };

    // DOM
    const $$ = id => document.getElementById(id);
    const sections = document.querySelectorAll('.content-section');
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const sidebar = $$('navSidebar');
    const overlay = $$('sidebarOverlay');

    // Mobile sidebar
    $$('btnMobileMenu')?.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('open'); });
    overlay?.addEventListener('click', closeSidebar);
    function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }

    // Navigation
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item[data-section]');
    const topnavLinks = document.querySelectorAll('.nf-nav-link[data-section]');
    function nav(sec, force) {
        if (S.sec === sec && !force) return; // already on this section
        const prevSec = S.sec;
        S.sec = sec;
        // Animate out previous section, then show new
        const prevEl = document.getElementById('section-' + prevSec);
        const nextEl = document.getElementById('section-' + sec);
        if (prevEl && prevEl.classList.contains('active')) {
            prevEl.classList.remove('active');
            prevEl.classList.add('section-exiting');
            setTimeout(() => { prevEl.classList.remove('section-exiting'); }, 250);
        } else {
            sections.forEach(s => { if (s.id !== 'section-' + sec) s.classList.remove('active'); });
        }
        setTimeout(() => {
            if (nextEl) nextEl.classList.add('active');
        }, prevEl ? 100 : 0);
        navItems.forEach(n => n.classList.toggle('active', n.dataset.section === sec));
        bottomNavItems.forEach(b => b.classList.toggle('active', b.dataset.section === sec));
        topnavLinks.forEach(l => l.classList.toggle('active', l.dataset.section === sec));
        closeSidebar();
        if (sec !== 'live' && typeof tvStopPreview === 'function') { try { tvStopPreview(); } catch {} }
        const loaders = { home: loadHome, live: loadLive, movies: loadMovies, series: loadSeries, radio: loadRadio, favorites: loadFav, epg: loadEpg, settings: loadSettings };
        loaders[sec]?.();
        document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    navItems.forEach(n => n.addEventListener('click', () => nav(n.dataset.section)));
    // Bottom nav bar mobile - mesma navegação
    bottomNavItems.forEach(b => b.addEventListener('click', () => nav(b.dataset.section)));
    // Top nav Netflix links
    topnavLinks.forEach(l => l.addEventListener('click', () => nav(l.dataset.section)));

    // === NETFLIX TOPNAV: Scroll effect ===
    const mainContent = document.querySelector('.main-content');
    const nfTopnav = $$('nfTopnav');
    if (mainContent && nfTopnav) {
        mainContent.addEventListener('scroll', () => {
            nfTopnav.classList.toggle('scrolled', mainContent.scrollTop > 50);
        });
    }

    // === NETFLIX TOPNAV: Avatar dropdown ===
    const nfAvatarBtn = $$('nfAvatarBtn');
    const nfAvatarDrop = $$('nfAvatarDropdown');
    if (nfAvatarBtn && nfAvatarDrop) {
        nfAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            nfAvatarDrop.classList.toggle('open');
        });
        document.addEventListener('click', () => nfAvatarDrop.classList.remove('open'));
        nfAvatarDrop.addEventListener('click', (e) => e.stopPropagation());
    }
    // Avatar dropdown buttons
    $$('btnTopnavSwitchProfile')?.addEventListener('click', () => {
        nfAvatarDrop?.classList.remove('open');
        $$('btnSwitchProfile')?.click();
    });
    $$('btnTopnavSettings')?.addEventListener('click', () => { nfAvatarDrop?.classList.remove('open'); nav('settings'); });
    $$('btnTopnavEpg')?.addEventListener('click', () => { nfAvatarDrop?.classList.remove('open'); nav('epg'); });
    $$('btnTopnavRefresh')?.addEventListener('click', () => {
        nfAvatarDrop?.classList.remove('open');
        $$('btnRefreshData')?.click();
    });
    $$('btnTopnavLogout')?.addEventListener('click', () => { clearCred(); window.location.href = 'index.html'; });

    // Topnav notification
    $$('btnTopnavNotif')?.addEventListener('click', () => $$('btnNotifSidebar')?.click());

    // Topnav install button (synced with sidebar install)
    if ($$('btnTopnavInstall')) {
        $$('btnTopnavInstall').addEventListener('click', () => $$('btnSidebarInstall')?.click());
    }

    // Refresh
    $$('btnRefreshData')?.addEventListener('click', () => { Cache.clear(); toast('Dados atualizados!', 'success'); nav(S.sec, true); });
    $$('btnLogout')?.addEventListener('click', () => { clearCred(); window.location.href = 'index.html'; });

    // Force reload all content (when switching profiles for kids filter)
    // Note: actual function body set after loader vars are declared
    window._forceReloadContent = null;

    // === MODAL TRIAL: verificar IMEDIATAMENTE a partir dos dados salvos no login ===
    (function checkTrialFromCred() {
        console.log('🔍 checkTrialFromCred - cred:', JSON.stringify(cred));
        console.log('🔍 checkTrialFromCred - is_trial:', cred.is_trial, 'user_status:', cred.user_status, 'exp_date:', cred.exp_date);
        
        let isTrial = cred.is_trial === '1' || cred.is_trial === 1
            || cred.user_status === 'Trial'
            || String(cred.is_trial) === '1';
        
        console.log('🔍 checkTrialFromCred - isTrial inicial:', isTrial);
        
        // AUTO-DETECTAR TRIAL: Se exp_date é ≤ 24 horas, considerar como teste (backup para painéis que não enviam is_trial)
        if (!isTrial && cred.exp_date) {
            const horasRestantes = (Number(cred.exp_date) * 1000 - Date.now()) / 3600000;
            console.log('🔍 checkTrialFromCred - horasRestantes:', horasRestantes);
            if (horasRestantes > 0 && horasRestantes <= 24) {
                isTrial = true;
                console.log('✅ AUTO-DETECTADO COMO TRIAL no player!');
            }
        }
        
        console.log('🔍 checkTrialFromCred - isTrial FINAL:', isTrial);
        
        if (!isTrial) return;
        const trialModal = $$('trialModal');
        console.log('🔍 trialModal element:', trialModal);
        if (!trialModal) {
            console.log('❌ trialModal NÃO ENCONTRADO!');
            return;
        }

        // Calcular horas/minutos restantes
        const hoursEl   = $$('trialHoursLeft');
        const expDateEl = $$('trialExpireDate');
        if (cred.exp_date) {
            const expMs   = Number(cred.exp_date) * 1000;
            const diffMs  = expMs - Date.now();
            console.log('🔍 expMs:', expMs, 'diffMs:', diffMs, 'horas restantes:', (diffMs/3600000).toFixed(2));
            if (diffMs > 0) {
                const totalMins = Math.floor(diffMs / 60000);
                const hours     = Math.floor(totalMins / 60);
                const mins      = totalMins % 60;
                let hoursStr = '';
                if (hours > 0 && mins > 0) hoursStr = `${hours}h ${mins}min`;
                else if (hours > 0)        hoursStr = `${hours} hora${hours > 1 ? 's' : ''}`;
                else                        hoursStr = `${mins} minuto${mins !== 1 ? 's' : ''}`;
                if (hoursEl)   hoursEl.textContent = hoursStr;
                if (expDateEl) expDateEl.textContent = new Date(expMs).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            } else {
                if (hoursEl)   hoursEl.textContent = '0 minutos';
                if (expDateEl) expDateEl.textContent = new Date(Number(cred.exp_date) * 1000).toLocaleDateString('pt-BR');
            }
        }

        // Botão X e botão fechar
        const btnClose = $$('trialBtnClose');
        const btnX     = $$('trialBtnX');
        const closeModal = () => { trialModal.style.display = 'none'; };
        if (btnClose) btnClose.onclick = closeModal;
        if (btnX)     btnX.onclick     = closeModal;
        trialModal.onclick = e => { if (e.target === trialModal) closeModal(); };

        // Botão Assinar Agora — carrega branding async
        const btnRenew = $$('trialBtnRenew');
        if (btnRenew) {
            fetch('api/admin_api.php?action=public_branding')
                .then(r => r.json())
                .then(br => {
                    if (br.checkout_url) {
                        btnRenew.onclick = () => window.open(br.checkout_url, '_blank');
                        btnRenew.style.display = 'inline-flex';
                    } else if (br.whatsapp_enabled && br.whatsapp_number) {
                        const msg = encodeURIComponent(`Olá! Sou usuário de teste e gostaria de assinar. Usuário: ${cred.username}`);
                        btnRenew.onclick = () => window.open(`https://wa.me/${br.whatsapp_number.replace(/\D/g,'')}?text=${msg}`, '_blank');
                        btnRenew.style.display = 'inline-flex';
                    } else {
                        btnRenew.style.display = 'none';
                    }
                })
                .catch(() => { btnRenew.style.display = 'none'; });
        }

        setTimeout(() => { 
            console.log('🔍 Tentando mostrar trialModal...');
            trialModal.style.display = 'flex'; 
            console.log('✅ trialModal.style.display =', trialModal.style.display);
        }, 800);

        // === Re-exibir modal a cada 1 hora enquanto estiver no dashboard ===
        function _trialCalcHours() {
            if (!cred.exp_date) return;
            const expMs  = Number(cred.exp_date) * 1000;
            const diffMs = expMs - Date.now();
            const hoursEl2   = $$('trialHoursLeft');
            const expDateEl2 = $$('trialExpireDate');
            if (diffMs <= 0) {
                if (hoursEl2)   hoursEl2.textContent   = 'Expirado';
                return false; // parar intervalo
            }
            const totalMins2 = Math.floor(diffMs / 60000);
            const h2 = Math.floor(totalMins2 / 60);
            const m2 = totalMins2 % 60;
            let hs = '';
            if (h2 > 0 && m2 > 0) hs = `${h2}h ${m2}min`;
            else if (h2 > 0)      hs = `${h2} hora${h2 > 1 ? 's' : ''}`;
            else                   hs = `${m2} minuto${m2 !== 1 ? 's' : ''}`;
            if (hoursEl2)   hoursEl2.textContent   = hs;
            if (expDateEl2) expDateEl2.textContent = new Date(expMs).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            return true;
        }
        const _trialIntv = setInterval(() => {
            const ok = _trialCalcHours();
            if (ok === false) { clearInterval(_trialIntv); return; }
            // Re-abrir o modal apenas se nenhum outro modal estiver aberto
            const anyOpen = document.querySelector('.modal-overlay[style*="flex"], .nf-modal-overlay[style*="flex"]');
            if (!anyOpen || anyOpen.id === 'trialModal') {
                trialModal.style.display = 'flex';
            }
        }, 60 * 60 * 1000); // 1 hora
    })();

    // User info
    (async () => {
        try {
            const d = await API.auth(cred.username, cred.password);
            const u = d.user_info;
            // Populate settings account card
            const setName = $$('settingsUserName');
            const setExp = $$('settingsUserExpiry');
            const setCon = $$('settingsUserConnections');
            const setStat = $$('settingsUserStatus');
            if (setName) setName.textContent = u.username || '-';
            if (setExp && u.exp_date) setExp.textContent = new Date(u.exp_date * 1000).toLocaleDateString('pt-BR');
            if (setCon) setCon.textContent = u.max_connections || '-';
            if (setStat) {
                const active = u.status === 'Active';
                setStat.textContent = active ? 'Ativo' : (u.status || '-');
                setStat.classList.toggle('status-active', active);
                setStat.classList.toggle('status-inactive', !active);
            }

            // === AVISO CONTA TRIAL/TESTE ===
            // (modal já exibido instantaneamente acima via checkTrialFromCred)
            // Atualiza as horas restantes com dados frescos da API
            const isTrial = u.is_trial === '1' || u.is_trial === 1 || u.status === 'Trial' || String(u.is_trial) === '1';
            if (isTrial && cred.exp_date) {
                const hoursEl = $$('trialHoursLeft');
                if (hoursEl) {
                    const expMs  = Number(u.exp_date) * 1000;
                    const diffMs = expMs - Date.now();
                    if (diffMs > 0) {
                        const totalMins = Math.floor(diffMs / 60000);
                        const hours = Math.floor(totalMins / 60);
                        const mins  = totalMins % 60;
                        let hoursStr = '';
                        if (hours > 0 && mins > 0) hoursStr = `${hours}h ${mins}min`;
                        else if (hours > 0)        hoursStr = `${hours} hora${hours > 1 ? 's' : ''}`;
                        else                        hoursStr = `${mins} minuto${mins !== 1 ? 's' : ''}`;
                        hoursEl.textContent = hoursStr;
                    }
                }
            }

            // === AVISO DE VENCIMENTO (3 dias ou menos) ===
            if (u.exp_date) {
                const expMs = u.exp_date * 1000;
                const now = Date.now();
                const diffDays = Math.ceil((expMs - now) / (1000 * 60 * 60 * 24));
                if (diffDays <= 3 && diffDays >= 0) {
                    // Mostrar apenas 1x por sessão (ou 1x por dia)
                    const dismissKey = 'wp_expiry_dismiss_' + (cred?.username || '');
                    const lastDismiss = localStorage.getItem(dismissKey);
                    const today = new Date().toDateString();
                    if (lastDismiss !== today) {
                        const expiryModal = $$('expiryModal');
                        if (expiryModal) {
                            const daysEl = $$('expiryDaysLeft');
                            const dateEl = $$('expiryDateStr');
                            const titleEl = $$('expiryModalTitle');
                            if (daysEl) daysEl.textContent = diffDays;
                            if (dateEl) dateEl.textContent = new Date(expMs).toLocaleDateString('pt-BR');
                            if (titleEl) {
                                if (diffDays === 0) titleEl.textContent = 'Sua assinatura vence hoje!';
                                else if (diffDays === 1) titleEl.textContent = 'Sua assinatura vence amanhã!';
                                else titleEl.textContent = `Sua assinatura vence em ${diffDays} dias!`;
                            }
                            // Botão renovar via WhatsApp
                            const btnRenew = $$('expiryBtnRenew');
                            if (btnRenew) {
                                try {
                                    const br = await fetch('api/admin_api.php?action=public_branding').then(r => r.json());
                                    if (br.whatsapp_enabled && br.whatsapp_number) {
                                        const msg = encodeURIComponent(`Olá! Minha assinatura vence em ${diffDays} dia(s) e gostaria de renovar. Usuário: ${cred.username}`);
                                        btnRenew.onclick = () => window.open(`https://wa.me/${br.whatsapp_number.replace(/\D/g,'')}?text=${msg}`, '_blank');
                                        btnRenew.style.display = 'inline-flex';
                                    } else {
                                        btnRenew.style.display = 'none';
                                    }
                                } catch { btnRenew.style.display = 'none'; }
                            }
                            // Botão fechar
                            const btnClose = $$('expiryBtnClose');
                            if (btnClose) btnClose.onclick = () => {
                                localStorage.setItem(dismissKey, today);
                                expiryModal.style.display = 'none';
                            };
                            expiryModal.onclick = e => { if (e.target === expiryModal) { localStorage.setItem(dismissKey, today); expiryModal.style.display = 'none'; } };
                            // Mostrar modal com pequeno delay para não bloquear o carregamento
                            setTimeout(() => { expiryModal.style.display = 'flex'; }, 2000);
                        }
                    }
                }
            }
        } catch {}
    })();

    /* --- NOTIFICATION SYSTEM --- */
    const NOTIF_KEY = 'webplay_notif_seen_' + (cred?.username || '');
    const NOTIF_MAX = 30; // max items per type

    function getSeenNotifs() {
        try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}'); } catch { return {}; }
    }
    function saveSeenNotifs(data) {
        localStorage.setItem(NOTIF_KEY, JSON.stringify(data));
    }

    let _notifData = { live: [], vod: [], series: [] };
    let _notifNewCount = 0;
    let _notifCurrentTab = 'all';

    function updateNotifBadges(count) {
        _notifNewCount = count;
        const bMobile = $$('notifBadgeMobile');
        const bSidebar = $$('notifBadgeSidebar');
        if (bMobile) { bMobile.style.display = count > 0 ? 'flex' : 'none'; bMobile.textContent = count > 99 ? '99+' : count; }
        if (bSidebar) { bSidebar.style.display = count > 0 ? 'flex' : 'none'; bSidebar.textContent = count > 99 ? '99+' : count; }
    }

    async function loadNotifications() {
        try {
            const [live, vod, ser] = await Promise.all([
                API.liveStreams(cred).catch(() => []),
                API.vodStreams(cred).catch(() => []),
                API.series(cred).catch(() => [])
            ]);

            // Sort by added timestamp (most recent first)
            const sortByAdded = (a, b) => {
                const ta = Number(a.added || a.last_modified || 0);
                const tb = Number(b.added || b.last_modified || 0);
                return tb - ta;
            };

            _notifData.live = (live || []).slice().sort(sortByAdded).slice(0, NOTIF_MAX);
            _notifData.vod = (vod || []).slice().sort(sortByAdded).slice(0, NOTIF_MAX);
            _notifData.series = (ser || []).slice().sort(sortByAdded).slice(0, NOTIF_MAX);

            // Count new (unseen)
            const seen = getSeenNotifs();
            let newCount = 0;
            _notifData.live.forEach(i => { if (!seen['l_' + i.stream_id]) newCount++; });
            _notifData.vod.forEach(i => { if (!seen['v_' + i.stream_id]) newCount++; });
            _notifData.series.forEach(i => { if (!seen['s_' + i.series_id]) newCount++; });

            updateNotifBadges(newCount);
        } catch (e) {
            // Erro ao carregar notificações
        }
    }

    function formatNotifTime(ts) {
        if (!ts) return '';
        const d = new Date(Number(ts) * 1000);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'Agora';
        if (diff < 3600) return Math.floor(diff / 60) + ' min';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd';
        return d.toLocaleDateString('pt-BR');
    }

    function renderNotifItems(type) {
        const seen = getSeenNotifs();
        let items = [];
        if (type === 'all' || type === 'live') {
            _notifData.live.forEach(i => items.push({ type: 'live', id: 'l_' + i.stream_id, name: i.name, cat: i.category_name || 'Canal', time: i.added, icon: 'fa-satellite-dish', isNew: !seen['l_' + i.stream_id] }));
        }
        if (type === 'all' || type === 'vod') {
            _notifData.vod.forEach(i => items.push({ type: 'vod', id: 'v_' + i.stream_id, name: i.name, cat: i.category_name || 'Filme', time: i.added, icon: 'fa-film', isNew: !seen['v_' + i.stream_id] }));
        }
        if (type === 'all' || type === 'series') {
            _notifData.series.forEach(i => items.push({ type: 'series', id: 's_' + i.series_id, name: i.name, cat: i.category_name || 'Série', time: i.last_modified, icon: 'fa-tv', isNew: !seen['s_' + i.series_id] }));
        }

        // Sort: new first, then by time
        items.sort((a, b) => {
            if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
            return Number(b.time || 0) - Number(a.time || 0);
        });

        if (!items.length) {
            return `<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação</p><span>Os conteúdos mais recentes aparecerão aqui</span></div>`;
        }

        let html = '<div class="notif-list">';
        if (type === 'all') {
            // Group by type
            const groups = [
                { key: 'live', label: 'Canais', icon: 'fa-satellite-dish' },
                { key: 'vod', label: 'Filmes', icon: 'fa-film' },
                { key: 'series', label: 'Séries', icon: 'fa-tv' }
            ];
            groups.forEach(g => {
                const gi = items.filter(i => i.type === g.key);
                if (gi.length) {
                    html += `<div class="notif-section-title"><i class="fas ${g.icon}"></i> ${g.label} (${gi.length})</div>`;
                    gi.slice(0, 10).forEach(i => { html += renderSingleNotif(i); });
                }
            });
        } else {
            items.forEach(i => { html += renderSingleNotif(i); });
        }
        html += '</div>';
        return html;
    }

    function renderSingleNotif(i) {
        const typeClass = i.type === 'live' ? 'notif-live' : i.type === 'vod' ? 'notif-vod' : 'notif-series';
        return `<div class="notif-item${i.isNew ? ' notif-new' : ''}">
            <div class="notif-icon ${typeClass}"><i class="fas ${i.icon}"></i></div>
            <div class="notif-info">
                <div class="notif-name">${esc(i.name)}</div>
                <div class="notif-category"><i class="fas fa-tag"></i> ${esc(i.cat)}</div>
            </div>
            <div class="notif-time">${formatNotifTime(i.time)}</div>
        </div>`;
    }

    function openNotifModal() {
        const modal = document.getElementById('notifModal');
        if (!modal) return;
        modal.style.display = 'flex';
        _notifCurrentTab = 'all';
        document.querySelectorAll('.notif-tab').forEach(t => t.classList.toggle('active', t.dataset.notifTab === 'all'));
        const body = document.getElementById('notifModalBody');
        if (body) body.innerHTML = renderNotifItems('all');
    }

    function closeNotifModal() {
        const modal = document.getElementById('notifModal');
        if (modal) modal.style.display = 'none';
    }

    function clearNotifications() {
        // Mark all as seen
        const seen = getSeenNotifs();
        _notifData.live.forEach(i => { seen['l_' + i.stream_id] = 1; });
        _notifData.vod.forEach(i => { seen['v_' + i.stream_id] = 1; });
        _notifData.series.forEach(i => { seen['s_' + i.series_id] = 1; });
        saveSeenNotifs(seen);
        // Clear all notification data
        _notifData = { live: [], vod: [], series: [] };
        updateNotifBadges(0);
        // Show empty state
        const body = document.getElementById('notifModalBody');
        if (body) body.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação</p><span>Os conteúdos mais recentes aparecerão aqui</span></div>';
    }

    // Bell click - open notification modal
    document.addEventListener('click', function(e) {
        if (e.target.closest('#btnNotifMobile') || e.target.closest('#btnNotifSidebar') || e.target.closest('.nav-notif-item')) {
            e.preventDefault();
            e.stopPropagation();
            openNotifModal();
        }
    });

    // All notification modal interactions - delegated on the modal itself
    const notifModalEl = document.getElementById('notifModal');
    if (notifModalEl) {
        notifModalEl.addEventListener('click', function(e) {
            // Close button
            if (e.target.closest('#notifModalClose')) {
                closeNotifModal();
                return;
            }
            // Clear notifications button
            if (e.target.closest('#btnClearNotif') || e.target.closest('.btn-clear-notif')) {
                e.preventDefault();
                e.stopPropagation();
                clearNotifications();
                return;
            }
            // Tab switching
            const tab = e.target.closest('.notif-tab');
            if (tab && tab.dataset.notifTab) {
                document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                _notifCurrentTab = tab.dataset.notifTab;
                const body = document.getElementById('notifModalBody');
                if (body) body.innerHTML = renderNotifItems(_notifCurrentTab);
                return;
            }
            // Click on overlay (outside modal-content) to close
            if (e.target === notifModalEl) {
                closeNotifModal();
            }
        });
    }

    // Tab switching (is now handled above via delegation)

    // Load notifications after a short delay
    setTimeout(loadNotifications, 3000);

    /* --- PARENTAL PIN MODAL --- */
    let pinResolve = null;
    function askPin() {
        return new Promise(resolve => {
            pinResolve = resolve;
            const modal = $$('pinModal');
            modal.style.display = 'flex';
            pinValue = '';
            updatePinDots();
            $$('pinError').style.display = 'none';
        });
    }
    let pinValue = '';
    function updatePinDots() {
        const dots = document.querySelectorAll('#pinDots span');
        dots.forEach((d, i) => d.classList.toggle('filled', i < pinValue.length));
    }
    $$('pinKeypad')?.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const num = btn.dataset.num;
        if (num === 'clear') { $$('pinModal').style.display = 'none'; if (pinResolve) pinResolve(false); return; }
        if (num === 'back') { pinValue = pinValue.slice(0, -1); updatePinDots(); $$('pinError').style.display = 'none'; return; }
        if (pinValue.length >= 4) return;
        pinValue += num;
        updatePinDots();
        if (pinValue.length === 4) {
            setTimeout(() => {
                if (pinValue === getPin()) {
                    $$('pinModal').style.display = 'none';
                    if (pinResolve) pinResolve(true);
                } else {
                    $$('pinError').style.display = 'block';
                    pinValue = '';
                    updatePinDots();
                }
            }, 200);
        }
    });

    /* ============ HOME ============ */

    // Skeleton HTML for home loading state
    function getHomeSkeleton() {
        const cards = (n, type) => Array.from({length: n}, () => `<div class="skeleton-card-${type}"></div>`).join('');
        return `<div class="skeleton-home">
            <div class="skeleton-block"><div class="skeleton-block-title"></div><div class="skeleton-row">${cards(8,'channel')}</div></div>
            <div class="skeleton-block"><div class="skeleton-block-title"></div><div class="skeleton-row">${cards(7,'poster')}</div></div>
            <div class="skeleton-block"><div class="skeleton-block-title"></div><div class="skeleton-row">${cards(7,'poster')}</div></div>
        </div>`;
    }

    async function loadHome() {
        const c = $$('homeContent');
        c.innerHTML = getHomeSkeleton();
        // Show skeleton hero too
        const heroEl = $$('nfHero');
        if (heroEl) { heroEl.style.display = 'block'; heroEl.innerHTML = '<div class="skeleton-hero"></div>'; }
        try {
            const [live, vod, ser] = await Promise.all([API.liveStreams(cred), API.vodStreams(cred), API.series(cred)]);
            S.live = live || []; S.vod = vod || []; S.ser = ser || [];
            const homeLive = filterKidsContent(S.live);
            const homeVod = filterKidsContent(S.vod);
            const homeSer = filterKidsContent(S.ser);

            // === HERO BANNER ===
            const heroEl = $$('nfHero');
            if (heroEl && homeVod.length) {
                // Restore hero HTML after skeleton
                heroEl.innerHTML = `<div class="nf-hero-bg" id="nfHeroBg"></div>
                    <div class="nf-hero-gradient"></div>
                    <div class="nf-hero-content">
                        <span class="nf-hero-badge"><i class="fas fa-fire"></i> EM DESTAQUE</span>
                        <h1 class="nf-hero-title" id="nfHeroTitle"></h1>
                        <div class="nf-hero-meta" id="nfHeroMeta"></div>
                        <p class="nf-hero-desc" id="nfHeroDesc"></p>
                        <div class="nf-hero-actions">
                            <button class="nf-hero-btn nf-hero-btn-play" id="nfHeroPlay"><i class="fas fa-play"></i> Assistir</button>
                            <button class="nf-hero-btn nf-hero-btn-info" id="nfHeroInfo"><i class="fas fa-info-circle"></i> Mais Informações</button>
                        </div>
                    </div>
                    <div class="nf-hero-dots" id="nfHeroDots"></div>`;
                // Pick 5 random movies for hero rotation
                const heroPool = homeVod.filter(m => m.stream_icon);
                if (heroPool.length) {
                    const shuffled = heroPool.sort(() => Math.random() - .5).slice(0, Math.min(5, heroPool.length));
                    let heroIdx = 0;
                    const heroBg = $$('nfHeroBg');
                    const heroTitle = $$('nfHeroTitle');
                    const heroMeta = $$('nfHeroMeta');
                    const heroDesc = $$('nfHeroDesc');
                    const heroPlay = $$('nfHeroPlay');
                    const heroInfo = $$('nfHeroInfo');
                    const heroDots = $$('nfHeroDots');
                    // Render dots
                    if (heroDots && shuffled.length > 1) {
                        heroDots.innerHTML = shuffled.map((_, i) => `<div class="nf-hero-dot${i === 0 ? ' active' : ''}" data-i="${i}"></div>`).join('');
                        heroDots.querySelectorAll('.nf-hero-dot').forEach(d => d.addEventListener('click', () => { heroIdx = +d.dataset.i; showHero(heroIdx); }));
                    }
                    function buildHeroMeta(item) {
                        let m = '';
                        if (item.rating) m += `<span class="nf-meta-rating"><i class="fas fa-star"></i> ${item.rating}</span>`;
                        if (item.year || item.release_date) m += `<span class="nf-meta-year">${item.year || String(item.release_date).slice(0,4)}</span>`;
                        if (item.duration || item.runtime) m += `<span class="nf-meta-dot">•</span><span class="nf-meta-duration"><i class="fas fa-clock"></i> ${item.duration || item.runtime}</span>`;
                        m += `<span class="nf-meta-hd">HD</span>`;
                        if (item.genre || item.category_name) m += `<span class="nf-meta-dot">•</span><span class="nf-meta-genre">${item.genre || item.category_name}</span>`;
                        return m;
                    }
                    function showHero(idx) {
                        const item = shuffled[idx];
                        if (!item) return;
                        // Fade out
                        if (heroBg) { heroBg.classList.add('hero-fade-out'); heroBg.classList.remove('hero-fade-in'); }
                        const content = heroEl.querySelector('.nf-hero-content');
                        if (content) { content.style.opacity = '0'; content.style.transform = 'translateY(15px)'; }
                        setTimeout(() => {
                            if (heroBg) heroBg.style.backgroundImage = `url('${item._tmdbBackdrop || item.stream_icon}')`;
                            if (heroTitle) heroTitle.textContent = item.name || 'Filme em Destaque';
                            if (heroMeta) heroMeta.innerHTML = buildHeroMeta(item);
                            if (heroDesc) heroDesc.textContent = item.plot || item.description || 'Assista agora este conteúdo incrível.';
                            if (heroPlay) heroPlay.onclick = () => window._movieModal(item.stream_id);
                            if (heroInfo) heroInfo.onclick = () => window._movieModal(item.stream_id);
                            // Fade in
                            if (heroBg) { heroBg.classList.remove('hero-fade-out'); heroBg.classList.add('hero-fade-in'); }
                            if (content) { content.classList.remove('hero-content-enter'); void content.offsetWidth; content.classList.add('hero-content-enter'); content.style.opacity = ''; content.style.transform = ''; }
                            // Update dots
                            heroDots?.querySelectorAll('.nf-hero-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
                        }, 400);
                        // Fetch TMDB backdrop to upgrade
                        tmdbGetMovieBackdrop(item).then(url => {
                            if (url && heroBg && item === shuffled[heroIdx]) {
                                const img = new Image();
                                img.onload = () => { heroBg.style.backgroundImage = `url('${url}')`; };
                                img.src = url;
                                if (item.plot && heroDesc) heroDesc.textContent = item.plot;
                                if (heroMeta) heroMeta.innerHTML = buildHeroMeta(item);
                            }
                        });
                    }
                    // Show first hero immediately
                    showHero(0);
                    heroEl.style.display = 'block';
                    // Auto-rotate every 8 seconds
                    if (window._heroInterval) clearInterval(window._heroInterval);
                    if (shuffled.length > 1) {
                        window._heroInterval = setInterval(() => {
                            heroIdx = (heroIdx + 1) % shuffled.length;
                            showHero(heroIdx);
                        }, 8000);
                    }
                }
            }

            let html = '';

            // ---- BLOCO 1: Continuar Assistindo ----
            const hist = getHist();
            if (hist.length) {
                html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-history"></i> Continuar Assistindo</h3><span class="home-block-clear" onclick="window._clearHist()"><i class="fas fa-trash"></i> Limpar</span></div><div class="horizontal-list">`;
                hist.slice(0, 15).forEach(h => {
                    // Buscar poster do catálogo se não estiver no histórico
                    let poster = h.poster || h.icon || '';
                    if (!poster) {
                        if (h.type === 'live') {
                            const _ch = S.live.find(c => c.stream_id == h.stream_id);
                            if (_ch) poster = _ch.stream_icon || '';
                        } else if (h.type === 'vod') {
                            const _m = S.vod.find(v => v.stream_id == h.stream_id);
                            if (_m) poster = _m.stream_icon || '';
                        } else if (h.type === 'series') {
                            const sName = (h.name || '').split(' - ')[0].trim();
                            const _sr = S.ser.find(s => s.name === sName);
                            if (_sr) poster = _sr.cover || '';
                        }
                    }
                    const prog = getProgressFor(h.id);
                    const pct = prog ? Math.round((prog.t / prog.d) * 100) : 0;
                    const timeStr = prog ? fmtTime(prog.t) + ' / ' + fmtTime(prog.d) : '';
                    const iconClass = h.type === 'live' ? 'fa-tv' : h.type === 'series' ? 'fa-tv' : 'fa-film';
                    if (h.type === 'live') {
                        // Canal: mesmo estilo do bloco "Canais Populares" (logo contida centralizada)
                        html += `<div class="h-poster nf-poster h-poster-continue" onclick="window._histPlay('${esc(JSON.stringify(h).replace(/'/g,"\\'"))}')">
                            <div class="hp-img hp-img-channel">${poster ? `<img src="${esc(poster)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>'}<div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div></div>
                            ${prog ? `<div class="h-card-progress"><div class="h-card-progress-bar" style="width:${pct}%"></div></div>` : ''}
                            <div class="hp-info"><div class="hp-title">${esc(h.name)}</div><div class="hp-sub">Canal${timeStr ? ' · ' + timeStr : ''}</div></div>
                        </div>`;
                    } else {
                        html += `<div class="h-poster h-poster-continue" onclick="window._histPlay('${esc(JSON.stringify(h).replace(/'/g,"\\'"))}')">
                            <div class="hp-img">${poster ? `<img src="${esc(poster)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas ${iconClass}\\'></i>'">` : `<i class="fas ${iconClass}"></i>`}</div>
                            ${prog ? `<div class="h-card-progress"><div class="h-card-progress-bar" style="width:${pct}%"></div></div>` : ''}
                            <div class="hp-info"><div class="hp-title">${esc(h.name)}</div><div class="hp-sub">${h.type === 'vod' ? 'Filme' : 'Série'}${timeStr ? ' · ' + timeStr : ''}</div></div>
                        </div>`;
                    }
                });
                html += '</div></div>';
            }

            // ---- BLOCO 2: Canais Populares ----
            html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-satellite-dish"></i> Canais Populares</h3><span class="home-block-see-all" onclick="window._navSec('live')">Ver todos <i class="fas fa-chevron-right"></i></span></div><div class="horizontal-list">`;
            homeLive.slice(0, 25).forEach(ch => {
                const logoImg = ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>';
                html += `<div class="h-poster nf-poster" onclick="window._playLive(${ch.stream_id})">
                    <div class="hp-img hp-img-channel">${logoImg}<div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div></div>
                    <div class="hp-info"><div class="hp-title">${esc(ch.name)}</div><div class="hp-sub">${esc(ch.category_name || '')}</div></div>
                </div>`;
            });
            html += '</div></div>';

            // ---- BLOCO 3: Top 10 Filmes (com números grandes) ----
            const curYear = String(new Date().getFullYear());
            const recentMovies = homeVod.filter(m => {
                const y = m.year || m.release_date || m.added || '';
                return String(y).includes(curYear);
            });
            const moviesToShow = recentMovies.length >= 5 ? recentMovies.slice(-30).reverse() : homeVod.slice(-30).reverse();
            html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-fire"></i> Top 10 Filmes</h3><span class="home-block-see-all" onclick="window._navSec('movies')">Ver todos <i class="fas fa-chevron-right"></i></span></div><div class="horizontal-list">`;
            moviesToShow.slice(0, 10).forEach((m, i) => {
                const ratingBadge = m.rating ? `<div class="nf-poster-rating"><i class="fas fa-star"></i> ${parseFloat(m.rating).toFixed(1)}</div>` : '';
                html += `<div class="h-poster nf-poster top10-poster" onclick="window._movieModal(${m.stream_id})">
                    <div class="hp-img"><span class="top10-number">${i+1}</span>${m.stream_icon ? `<img src="${esc(m.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-film\\'></i>'">` : '<i class="fas fa-film"></i>'}${ratingBadge}<div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div></div>
                    <div class="hp-info"><div class="hp-title">${esc(m.name)}</div></div>
                </div>`;
            });
            html += '</div></div>';

            // ---- BLOCO 4: Filmes Populares (resto) ----
            if (moviesToShow.length > 10) {
                html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-film"></i> Filmes Populares</h3><span class="home-block-see-all" onclick="window._navSec('movies')">Ver todos <i class="fas fa-chevron-right"></i></span></div><div class="horizontal-list">`;
                moviesToShow.slice(10, 25).forEach(m => {
                    const ratingBadge = m.rating ? `<div class="nf-poster-rating"><i class="fas fa-star"></i> ${parseFloat(m.rating).toFixed(1)}</div>` : '';
                    html += `<div class="h-poster nf-poster" onclick="window._movieModal(${m.stream_id})">
                        <div class="hp-img">${m.stream_icon ? `<img src="${esc(m.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-film\\'></i>'">` : '<i class="fas fa-film"></i>'}${ratingBadge}<div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div></div>
                        <div class="hp-info"><div class="hp-title">${esc(m.name)}</div></div>
                    </div>`;
                });
                html += '</div></div>';
            }

            // ---- BLOCO 5: Top 10 Séries (com números grandes) ----
            const recentSeries = homeSer.filter(s => {
                const y = s.year || s.release_date || s.last_modified || '';
                return String(y).includes(curYear);
            });
            const seriesToShow = recentSeries.length >= 5 ? recentSeries.slice(-30).reverse() : homeSer.slice(-30).reverse();
            html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-fire"></i> Top 10 Séries</h3><span class="home-block-see-all" onclick="window._navSec('series')">Ver todos <i class="fas fa-chevron-right"></i></span></div><div class="horizontal-list">`;
            seriesToShow.slice(0, 10).forEach((s, i) => {
                const ratingBadge = s.rating ? `<div class="nf-poster-rating"><i class="fas fa-star"></i> ${parseFloat(s.rating).toFixed(1)}</div>` : '';
                html += `<div class="h-poster nf-poster top10-poster" onclick="window._seriesModal(${s.series_id})">
                    <div class="hp-img"><span class="top10-number">${i+1}</span>${s.cover ? `<img src="${esc(s.cover)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>'}${ratingBadge}<div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div></div>
                    <div class="hp-info"><div class="hp-title">${esc(s.name)}</div></div>
                </div>`;
            });
            html += '</div></div>';

            // ---- BLOCO 6: Séries Populares (resto) ----
            if (seriesToShow.length > 10) {
                html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-tv"></i> Séries Populares</h3><span class="home-block-see-all" onclick="window._navSec('series')">Ver todos <i class="fas fa-chevron-right"></i></span></div><div class="horizontal-list">`;
                seriesToShow.slice(10, 25).forEach(s => {
                    const ratingBadge = s.rating ? `<div class="nf-poster-rating"><i class="fas fa-star"></i> ${parseFloat(s.rating).toFixed(1)}</div>` : '';
                    html += `<div class="h-poster nf-poster" onclick="window._seriesModal(${s.series_id})">
                        <div class="hp-img">${s.cover ? `<img src="${esc(s.cover)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>'}${ratingBadge}<div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div></div>
                        <div class="hp-info"><div class="hp-title">${esc(s.name)}</div></div>
                    </div>`;
                });
                html += '</div></div>';
            }

            // ---- BLOCO 5: Rádio Populares ----
            const homeRadio = homeLive.filter(ch => /r[aá]dio/i.test(ch.category_name || '') || /r[aá]dio/i.test(ch.name || ''));
            if (homeRadio.length > 0) {
                html += `<div class="home-block"><div class="home-block-header"><h3><i class="fas fa-broadcast-tower"></i> Rádio Populares</h3><span class="home-block-see-all" onclick="window._navSec('radio')">Ver todos <i class="fas fa-chevron-right"></i></span></div><div class="horizontal-list">`;
                homeRadio.slice(0, 25).forEach(ch => {
                    const logo = ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-broadcast-tower" style="display:none"></i>` : '<i class="fas fa-broadcast-tower"></i>';
                    html += `<div class="h-card h-card-radio" onclick="window._playLive(${ch.stream_id})">
                        <div class="h-card-logo">${logo}</div>
                        <div class="h-card-name">${esc(ch.name)}</div>
                        <span class="h-card-radio-badge"><i class="fas fa-music"></i> RÁDIO</span>
                    </div>`;
                });
                html += '</div></div>';
            }

            c.innerHTML = html;
            // Initialize home carousel arrows
            initHomeCarouselArrows();
        } catch (e) {
            c.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p><span>${esc(e.message)}</span></div>`;
        }
    }

    // Navigation helper for home "Ver todos"
    window._navSec = (sec) => nav(sec);
    // Clear history
    window._clearHist = () => {
        const key = 'wp_history' + (window._currentProfileId || '');
        localStorage.removeItem(key);
        toast('Histórico limpo!', 'success');
        loadHome();
    };

    // Home carousel arrows for horizontal-list blocks
    function initHomeCarouselArrows() {
        const blocks = document.querySelectorAll('#homeContent .home-block');
        blocks.forEach(block => {
            const list = block.querySelector('.horizontal-list');
            if (!list) return;
            // Create arrows
            const arrowL = document.createElement('button');
            arrowL.className = 'home-carousel-arrow hca-left hca-hidden';
            arrowL.innerHTML = '<i class="fas fa-chevron-left"></i>';
            const arrowR = document.createElement('button');
            arrowR.className = 'home-carousel-arrow hca-right';
            arrowR.innerHTML = '<i class="fas fa-chevron-right"></i>';
            block.appendChild(arrowL);
            block.appendChild(arrowR);
            const scrollAmt = 320;
            arrowL.addEventListener('click', () => list.scrollBy({ left: -scrollAmt, behavior: 'smooth' }));
            arrowR.addEventListener('click', () => list.scrollBy({ left: scrollAmt, behavior: 'smooth' }));
            const updateArrows = () => {
                arrowL.classList.toggle('hca-hidden', list.scrollLeft <= 10);
                arrowR.classList.toggle('hca-hidden', list.scrollLeft + list.clientWidth >= list.scrollWidth - 10);
            };
            list.addEventListener('scroll', updateArrows);
            setTimeout(updateArrows, 100);
        });
    }

    /* ============ LIVE — CAROUSEL BY CATEGORY + TV LAYOUT (desktop) ============ */
    let _liveLoaded = false;
    const _isDesktop = () => window.innerWidth > 900 && !/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    async function loadLive() {
        if (_liveLoaded) { renderLiveView(); return; }
        const container = $$('liveCarousels');
        container.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando canais...</div>';
        $$('liveExpandedWrap').style.display = 'none';
        try {
            const [cats, streams] = await Promise.all([API.liveCats(cred), API.liveStreams(cred)]);
            S.liveCats = cats || []; S.live = streams || [];
            // Mapear nomes de categorias aos streams
            const catNameMap = {};
            S.liveCats.forEach(c => { catNameMap[c.category_id] = c.category_name; });
            S.live.forEach(ch => { if (!ch.category_name && ch.category_id) ch.category_name = catNameMap[ch.category_id] || 'Outros'; });
            _liveLoaded = true;
            renderLiveView();
        } catch { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar canais</p></div>'; }
    }

    function renderLiveView(query) {
        if (_isDesktop()) {
            renderTvLayout(query);
        } else {
            $$('tvLayout').style.display = 'none';
            $$('liveCarousels').classList.remove('tv-hidden');
            $$('liveExpandedWrap').classList.remove('tv-hidden');
            renderLiveCarousels(query);
        }
    }

    /* --- TV Layout Desktop --- */
    let _tvPreviewHls = null;
    let _tvCurrentCh = null;
    let _tvSelectedCat = 'all';

    function renderTvLayout(query) {
        const tvLayout = $$('tvLayout');
        tvLayout.style.display = '';
        $$('liveCarousels').classList.add('tv-hidden');
        $$('liveExpandedWrap').classList.add('tv-hidden');

        let allItems = [...S.live];
        allItems = filterKidsContent(allItems);
        if (isParentalOn()) allItems = allItems.filter(i => !isCatBlocked('live', i.category_id));
        if (query) { const q = query.toLowerCase(); allItems = allItems.filter(i => (i.name || '').toLowerCase().includes(q)); }
        $$('liveCount').textContent = allItems.length + ' canais';

        // Build category map
        const catMap = {};
        allItems.forEach(ch => {
            const cid = ch.category_id || 'other';
            if (!catMap[cid]) catMap[cid] = { name: ch.category_name || 'Outros', items: [] };
            catMap[cid].items.push(ch);
        });

        // Render categories
        const catList = $$('tvCatList');
        catList.innerHTML = '';
        $$('tvCatTotalCount').textContent = allItems.length;

        // "Todos" item
        const allItem = document.createElement('div');
        allItem.className = 'tv-cat-item' + (_tvSelectedCat === 'all' ? ' active' : '');
        allItem.innerHTML = `<span class="tv-cat-item-name">Todos</span><span class="tv-cat-item-count">${allItems.length}</span>`;
        allItem.onclick = () => { _tvSelectedCat = 'all'; renderTvLayout(query); };
        catList.appendChild(allItem);

        // "Favoritos" item
        const favItems = allItems.filter(ch => isFav('live', ch.stream_id));
        const favItem = document.createElement('div');
        favItem.className = 'tv-cat-item' + (_tvSelectedCat === 'fav' ? ' active' : '');
        favItem.innerHTML = `<span class="tv-cat-item-name">Favoritos</span><span class="tv-cat-item-count">${favItems.length}</span>`;
        favItem.onclick = () => { _tvSelectedCat = 'fav'; renderTvLayout(query); };
        catList.appendChild(favItem);

        // Category items
        const catIds = Object.keys(catMap);
        catIds.forEach(cid => {
            const cat = catMap[cid];
            const item = document.createElement('div');
            item.className = 'tv-cat-item' + (_tvSelectedCat === cid ? ' active' : '');
            item.innerHTML = `<span class="tv-cat-item-name">${esc(cat.name)}</span><span class="tv-cat-item-count">${cat.items.length}</span>`;
            item.onclick = () => { _tvSelectedCat = cid; $$('tvCatTitle').textContent = cat.name; $$('tvCatTotalCount').textContent = cat.items.length; renderTvChannelList(cat.items, query); };
            catList.appendChild(item);
        });

        // Update title
        if (_tvSelectedCat === 'all') {
            $$('tvCatTitle').textContent = 'Todos';
            $$('tvCatTotalCount').textContent = allItems.length;
            renderTvChannelList(allItems, query);
        } else if (_tvSelectedCat === 'fav') {
            $$('tvCatTitle').textContent = 'Favoritos';
            $$('tvCatTotalCount').textContent = favItems.length;
            renderTvChannelList(favItems, query);
        } else if (catMap[_tvSelectedCat]) {
            $$('tvCatTitle').textContent = catMap[_tvSelectedCat].name;
            $$('tvCatTotalCount').textContent = catMap[_tvSelectedCat].items.length;
            renderTvChannelList(catMap[_tvSelectedCat].items, query);
        } else {
            _tvSelectedCat = 'all';
            $$('tvCatTitle').textContent = 'Todos';
            $$('tvCatTotalCount').textContent = allItems.length;
            renderTvChannelList(allItems, query);
        }
    }

    function renderTvChannelList(channels, query) {
        const list = $$('tvChannelList');
        list.innerHTML = '';
        if (!channels.length) {
            list.innerHTML = '<div class="tv-epg-empty">Nenhum canal encontrado</div>';
            return;
        }
        channels.forEach((ch, idx) => {
            const item = document.createElement('div');
            item.className = 'tv-ch-item' + (_tvCurrentCh && _tvCurrentCh.stream_id == ch.stream_id ? ' active' : '');
            const logoHtml = ch.stream_icon
                ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-tv" style="display:none"></i>`
                : '<i class="fas fa-tv"></i>';
            item.innerHTML = `<span class="tv-ch-num">${idx + 1}</span><div class="tv-ch-logo">${logoHtml}</div><span class="tv-ch-name">${esc(ch.name)}</span>`;
            // Single click: preview
            item.onclick = () => tvSelectChannel(ch, item);
            // Double click: open fullscreen player
            item.ondblclick = () => {
                addHist({ id: 'l_' + ch.stream_id, name: ch.name, type: 'live', stream_id: ch.stream_id, poster: ch.stream_icon || '' });
                tvStopPreview();
                openPlayerUI(ch.name, API.liveUrl(cred, ch.stream_id), 'live', ch.stream_id);
            };
            list.appendChild(item);
        });
        // Auto-select first channel if none selected
        if (!_tvCurrentCh && channels.length) {
            const first = list.querySelector('.tv-ch-item');
            if (first) tvSelectChannel(channels[0], first);
        }
    }

    function tvSelectChannel(ch, itemEl) {
        _tvCurrentCh = ch;
        // Update active states
        $$('tvChannelList').querySelectorAll('.tv-ch-item').forEach(el => el.classList.remove('active'));
        if (itemEl) itemEl.classList.add('active');
        // Update preview info
        $$('tvPreviewNum').textContent = '';
        $$('tvPreviewName').textContent = ch.name;
        const logoEl = $$('tvPreviewLogo');
        if (ch.stream_icon) { logoEl.src = ch.stream_icon; logoEl.style.display = ''; logoEl.onerror = () => { logoEl.style.display = 'none'; }; }
        else { logoEl.style.display = 'none'; }
        // Start video preview
        tvStartPreview(ch);
        // Load EPG
        tvLoadEpg(ch);
    }

    function tvStopPreview() {
        if (_tvPreviewHls) { try { _tvPreviewHls.destroy(); } catch {} _tvPreviewHls = null; }
        const video = $$('tvPreviewVideo');
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    }

    function tvStartPreview(ch) {
        tvStopPreview();
        const video = $$('tvPreviewVideo');
        const loader = $$('tvPreviewLoader');
        if (!video) return;

        video.muted = false;
        const url = API.liveUrl(cred, ch.stream_id);
        const isTsDirect = url.includes('.ts');

        video.addEventListener('waiting', () => { if (loader) loader.style.display = 'flex'; }, { once: false });
        video.addEventListener('playing', () => { if (loader) loader.style.display = 'none'; }, { once: false });
        video.addEventListener('canplay', () => { if (!video.paused && loader) loader.style.display = 'none'; }, { once: false });

        if (isTsDirect) {
            video.src = url;
            video.play().catch(() => {});
        } else {
            let _failed = false;
            const _tsUrl = url.replace('.m3u8', '.ts');
            function _tryTS() {
                if (_failed) return; _failed = true;
                if (_tvPreviewHls) { try { _tvPreviewHls.destroy(); } catch {} _tvPreviewHls = null; }
                video.src = _tsUrl;
                video.play().catch(() => {});
            }
            if (Hls.isSupported()) {
                const hls = new Hls({ maxBufferLength: 15, maxMaxBufferLength: 30, enableWorker: true, lowLatencyMode: true, xhrSetup: x => { x.timeout = 15000; } });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
                hls.on(Hls.Events.ERROR, (_, d) => {
                    if (d.fatal) {
                        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.destroy(); _tryTS(); }
                        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                        else { hls.destroy(); _tryTS(); }
                    }
                });
                _tvPreviewHls = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.onerror = () => _tryTS();
                video.play().catch(() => {});
            } else {
                _tryTS();
            }
        }

        // === TV Preview Controls ===
        const btnPP = $$('tvCtrlPlayPause');
        if (btnPP) {
            btnPP.onclick = () => {
                if (video.paused) { video.play(); btnPP.innerHTML = '<i class="fas fa-pause"></i>'; }
                else { video.pause(); btnPP.innerHTML = '<i class="fas fa-play"></i>'; }
            };
            video.addEventListener('play', () => { btnPP.innerHTML = '<i class="fas fa-pause"></i>'; });
            video.addEventListener('pause', () => { btnPP.innerHTML = '<i class="fas fa-play"></i>'; });
        }
        const btnMute = $$('tvCtrlMute');
        if (btnMute) {
            // Start unmuted
            video.muted = false;
            let savedVol = parseFloat(localStorage.getItem('lumotv_vol') ?? '1');
            video.volume = savedVol;
            btnMute.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            btnMute.onclick = () => {
                video.muted = !video.muted;
                btnMute.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            };
        }
        const btnExpand = $$('tvCtrlExpand');
        if (btnExpand) {
            btnExpand.onclick = () => {
                tvStopPreview();
                openPlayerUI(ch.name, API.liveUrl(cred, ch.stream_id), 'live', ch.stream_id);
            };
        }
    }

    async function tvLoadEpg(ch) {
        const list = $$('tvEpgList');
        list.innerHTML = '<div class="tv-epg-empty"><i class="fas fa-spinner fa-spin"></i> Carregando programação...</div>';
        try {
            const data = await API.shortEpg(cred, ch.stream_id);
            const progs = data?.epg_listings || [];
            if (!progs.length) { list.innerHTML = '<div class="tv-epg-empty">Sem programação disponível</div>'; return; }
            const now = Math.floor(Date.now() / 1000);
            list.innerHTML = '';
            progs.forEach(p => {
                let title = 'Sem título'; try { title = decodeB64(p.title); } catch { title = p.title || 'Sem título'; }
                const sd = new Date(+p.start_timestamp * 1000);
                const ed = new Date(+p.stop_timestamp * 1000);
                const fmt = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const isNow = +p.start_timestamp <= now && +p.stop_timestamp > now;
                const item = document.createElement('div');
                item.className = 'tv-epg-item' + (isNow ? ' now' : '');
                item.innerHTML = `<span class="tv-epg-dot"></span><span class="tv-epg-title">${esc(title)}</span><span class="tv-epg-time">${fmt(sd)} : ${fmt(ed)}</span>`;
                list.appendChild(item);
            });
        } catch { list.innerHTML = '<div class="tv-epg-empty">Erro ao carregar programação</div>'; }
    }

    /* --- Mobile: Carrossel (mantém comportamento original) --- */
    function renderLiveCarousels(query) {
        const container = $$('liveCarousels');
        container.innerHTML = '';
        $$('liveExpandedWrap').style.display = 'none';
        container.style.display = '';
        let allItems = [...S.live];
        allItems = filterKidsContent(allItems);
        if (isParentalOn()) allItems = allItems.filter(i => !isCatBlocked('live', i.category_id));
        if (query) { const q = query.toLowerCase(); allItems = allItems.filter(i => (i.name || '').toLowerCase().includes(q)); }
        $$('liveCount').textContent = allItems.length + ' canais';
        const catMap = {};
        allItems.forEach(ch => {
            const cid = ch.category_id || 'other';
            if (!catMap[cid]) catMap[cid] = { name: ch.category_name || 'Outros', items: [] };
            catMap[cid].items.push(ch);
        });
        const catIds = Object.keys(catMap);
        if (!catIds.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-satellite-dish"></i><p>Nenhum canal encontrado</p></div>'; return; }
        catIds.forEach(cid => {
            const cat = catMap[cid];
            const block = document.createElement('div');
            block.className = 'cat-carousel-block';
            block.innerHTML = `<div class="cat-carousel-header">
                <h3><i class="fas fa-satellite-dish"></i> ${esc(cat.name)} <span class="cat-carousel-count">${cat.items.length}</span></h3>
                <button class="cat-carousel-viewall" data-catid="${cid}">Ver todos <i class="fas fa-chevron-right"></i></button>
            </div><div class="cat-carousel-track"></div>`;
            const track = block.querySelector('.cat-carousel-track');
            cat.items.slice(0, 20).forEach(ch => {
                const card = document.createElement('div');
                card.className = 'h-card';
                const logo = ch.stream_icon
                    ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-tv" style="display:none"></i>`
                    : '<i class="fas fa-tv"></i>';
                card.innerHTML = `<div class="h-card-logo">${logo}</div><div class="h-card-name">${esc(ch.name)}</div><div class="h-card-sub">${esc(ch.category_name || '')}</div>`;
                card.addEventListener('touchstart', (e) => { card._tx = e.touches[0].clientX; card._ty = e.touches[0].clientY; card._tapped = true; }, {passive:true});
                card.addEventListener('touchmove', (e) => { if (!card._tapped) return; const dx = e.touches[0].clientX - card._tx, dy = e.touches[0].clientY - card._ty; if (Math.abs(dx) > 8 || Math.abs(dy) > 8) card._tapped = false; }, {passive:true});
                card.addEventListener('touchend', (e) => { if (card._tapped) { e.preventDefault(); card._tapped = false; playLive(ch); } }, {passive:false});
                card.onclick = (e) => { e.preventDefault(); e.stopPropagation(); playLive(ch); };
                track.appendChild(card);
            });
            block.querySelector('.cat-carousel-viewall').onclick = () => expandLiveCategory(cid, cat.name, allItems.filter(i => (i.category_id || 'other') == cid));
            container.appendChild(block);
        });
    }
    function expandLiveCategory(catId, catName, items) {
        $$('liveCarousels').style.display = 'none';
        const wrap = $$('liveExpandedWrap');
        wrap.style.display = 'block';
        $$('liveExpandedTitle').textContent = catName;
        $$('liveExpandedCount').textContent = items.length + ' canais';
        const grid = $$('liveExpandedGrid');
        grid.innerHTML = '';
        items.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            const logoHtml = ch.stream_icon
                ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-tv" style="display:none"></i>`
                : '<i class="fas fa-tv"></i>';
            card.innerHTML = `<div class="ch-logo">${logoHtml}</div>
                <div class="ch-info"><div class="ch-name">${esc(ch.name)}</div><div class="ch-cat">${esc(ch.category_name || '')}</div></div>
                <button class="btn-fav ${isFav('live', ch.stream_id) ? 'is-fav' : ''}"><i class="fas fa-heart"></i></button>`;
            card.addEventListener('touchstart', (e) => { if (e.target.closest('.btn-fav')) return; card._tx = e.touches[0].clientX; card._ty = e.touches[0].clientY; card._tapped = true; }, {passive:true});
            card.addEventListener('touchmove', (e) => { if (!card._tapped) return; const dx = e.touches[0].clientX - card._tx, dy = e.touches[0].clientY - card._ty; if (Math.abs(dx) > 8 || Math.abs(dy) > 8) card._tapped = false; }, {passive:true});
            card.addEventListener('touchend', (e) => { if (card._tapped && !e.target.closest('.btn-fav')) { e.preventDefault(); card._tapped = false; playLive(ch); } }, {passive:false});
            card.onclick = (e) => { if (e.target.closest('.btn-fav')) return; e.preventDefault(); playLive(ch); };
            card.querySelector('.btn-fav').onclick = e => { e.stopPropagation(); const a = toggleFav('live', ch.stream_id, ch.name, { category_name: ch.category_name, stream_icon: ch.stream_icon }); e.currentTarget.classList.toggle('is-fav', a); toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info'); };
            grid.appendChild(card);
        });
    }
    $$('liveExpandedBack')?.addEventListener('click', () => renderLiveView($$('liveSearch')?.value || ''));
    $$('liveSearch')?.addEventListener('input', e => { renderLiveView(e.target.value); });

    /* ============ RÁDIO ============ */
    let _radioLoaded = false;
    async function loadRadio() {
        const container = $$('radioGrid');
        if (!S.live || !S.live.length) {
            container.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando rádios...</div>';
            try {
                const [cats, streams] = await Promise.all([API.liveCats(cred), API.liveStreams(cred)]);
                S.liveCats = cats || []; S.live = streams || [];
                const catNameMap = {};
                S.liveCats.forEach(c => { catNameMap[c.category_id] = c.category_name; });
                S.live.forEach(ch => { if (!ch.category_name && ch.category_id) ch.category_name = catNameMap[ch.category_id] || 'Outros'; });
            } catch { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar rádios</p></div>'; return; }
        }
        renderRadioGrid();
        _radioLoaded = true;
    }

    function renderRadioGrid(query) {
        const container = $$('radioGrid');
        let radios = S.live.filter(ch => /r[aá]dio/i.test(ch.category_name || '') || /r[aá]dio/i.test(ch.name || ''));
        radios = filterKidsContent(radios);
        if (query) { const q = query.toLowerCase(); radios = radios.filter(ch => (ch.name || '').toLowerCase().includes(q)); }
        $$('radioCount').textContent = radios.length + ' rádios';
        if (!radios.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-broadcast-tower"></i><p>Nenhuma rádio encontrada</p></div>'; return; }
        // Group by category
        const catMap = {};
        radios.forEach(ch => {
            const cid = ch.category_id || 'other';
            if (!catMap[cid]) catMap[cid] = { name: ch.category_name || 'Rádio', items: [] };
            catMap[cid].items.push(ch);
        });
        const catIds = Object.keys(catMap);
        let html = '<div class="radio-stations-grid">';
        catIds.forEach(cid => {
            const cat = catMap[cid];
            cat.items.forEach(ch => {
                const logo = ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-broadcast-tower" style="display:none"></i>` : '<i class="fas fa-broadcast-tower"></i>';
                html += `<div class="radio-card" onclick="window._playLive(${ch.stream_id})">
                    <div class="radio-card-logo">${logo}</div>
                    <div class="radio-card-info">
                        <div class="radio-card-name">${esc(ch.name)}</div>
                        <div class="radio-card-cat">${esc(ch.category_name || '')}</div>
                    </div>
                    <div class="radio-card-badge"><i class="fas fa-music"></i> RÁDIO</div>
                    <div class="radio-card-play"><i class="fas fa-play"></i></div>
                </div>`;
            });
        });
        html += '</div>';
        container.innerHTML = html;
    }
    $$('radioSearch')?.addEventListener('input', e => renderRadioGrid(e.target.value));

    /* ============ BRAND SERVICES (Netflix, Disney+, etc.) ============ */
    const BRAND_SERVICES = [
        { key:'netflix',     label:'Netflix',       color:'#E50914', icon:'https://cdn.simpleicons.org/netflix/E50914',              matchNames:['netflix'] },
        { key:'prime',       label:'Prime Video',   color:'#00A8E1', icon:'https://cdn.simpleicons.org/primevideo/00A8E1',           matchNames:['prime','amazon','prime video','amazon prime'] },
        { key:'disney',      label:'Disney+',       color:'#113CCF', icon:'https://cdn.simpleicons.org/disneyplus/113CCF',           matchNames:['disney','disney+','disney plus'] },
        { key:'hbo',         label:'HBO Max',       color:'#5822B4', icon:'https://cdn.simpleicons.org/hbo/B17DFF',                  matchNames:['hbo','hbo max','max'] },
        { key:'apple',       label:'Apple TV+',     color:'#FFFFFF', icon:'https://cdn.simpleicons.org/appletv/FFFFFF',              matchNames:['apple','apple tv','apple tv+','appletv'] },
        { key:'globoplay',   label:'Globoplay',     color:'#F72E2F', icon:'https://cdn.simpleicons.org/globo/F72E2F',                matchNames:['globoplay','globo play'] },
        { key:'paramount',   label:'Paramount+',    color:'#0064FF', icon:'https://cdn.simpleicons.org/paramountplus/0064FF',        matchNames:['paramount','paramount+','paramount plus'] },
        { key:'star',        label:'Star+',         color:'#C2A551', icon:'https://cdn.simpleicons.org/starplus/C2A551',             matchNames:['star+','star plus','starz','lionsgate','lionsgate+'] },
        { key:'crunchyroll', label:'Crunchyroll',   color:'#F47521', icon:'https://cdn.simpleicons.org/crunchyroll/F47521',          matchNames:['crunchyroll','funimation','anime'] },
        { key:'discovery',   label:'Discovery+',    color:'#1244BB', icon:'https://cdn.simpleicons.org/discovery/1244BB',            matchNames:['discovery','discovery+','discovery plus'] }
    ];

    function _normalizeStr(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();
    }

    /** Retorna array de category_ids que batem com o serviço */
    function _matchServiceCats(serviceKey, type) {
        const svc = BRAND_SERVICES.find(b => b.key === serviceKey);
        if (!svc) return [];
        const cats = type === 'vod' ? (S.vodCats || []) : (S.serCats || []);
        const matched = [];
        cats.forEach(c => {
            const norm = _normalizeStr(c.category_name);
            if (svc.matchNames.some(mn => norm.includes(_normalizeStr(mn)))) {
                matched.push(c.category_id);
            }
        });
        return matched;
    }

    /** Renderiza a row de brand icons */
    function renderBrandServicesRow(type) {
        const containerId = type === 'vod' ? 'moviesBrandRow' : 'seriesBrandRow';
        const container = $$(containerId);
        if (!container) return;
        container.innerHTML = '';
        const cats = type === 'vod' ? (S.vodCats || []) : (S.serCats || []);
        if (!cats.length) return;

        BRAND_SERVICES.forEach(svc => {
            const matchedIds = _matchServiceCats(svc.key, type);
            const card = document.createElement('div');
            card.className = 'brand-service-card' + (matchedIds.length === 0 ? ' unavailable' : '');
            const fallbackLetter = svc.label.charAt(0);
            const fallbackColor = svc.color || '#7c3aed';
            card.innerHTML = `<img src="${esc(svc.icon)}" alt="${esc(svc.label)}" loading="lazy" onerror="this.outerHTML='<span class=brand-icon-fallback style=color:${fallbackColor}>${fallbackLetter}</span>'"><span class="brand-label">${esc(svc.label)}</span>`;
            if (matchedIds.length > 0) {
                card.onclick = () => _onBrandServiceClick(type, svc, matchedIds);
            }
            container.appendChild(card);
        });
    }

    /** Ao clicar num ícone de serviço: junta itens de todas as categorias que combinam e abre grid expandido */
    function _onBrandServiceClick(type, svc, matchedCatIds) {
        // Marcar card ativo
        const containerId = type === 'vod' ? 'moviesBrandRow' : 'seriesBrandRow';
        const container = $$(containerId);
        container.querySelectorAll('.brand-service-card').forEach(c => c.classList.remove('active'));
        const clickedCard = [...container.querySelectorAll('.brand-service-card')].find(c => c.querySelector('.brand-label')?.textContent === svc.label);
        if (clickedCard) clickedCard.classList.add('active');

        // Juntar todos itens das categorias que batem
        const allItems = type === 'vod' ? (S.vod || []) : (S.ser || []);
        const filtered = filterKidsContent(allItems).filter(item => matchedCatIds.includes(item.category_id));

        if (!filtered.length) {
            toast(`Coleção ${svc.label} não possui conteúdo disponível`, 'info');
            return;
        }

        if (type === 'vod') {
            expandMoviesCategory('brand_' + svc.key, svc.label, filtered);
        } else {
            expandSeriesCategory('brand_' + svc.key, svc.label, filtered);
        }
    }

    /* ============ MOVIES — CAROUSEL BY CATEGORY ============ */
    let _moviesLoaded = false;
    async function loadMovies() {
        if (_moviesLoaded) { return; }
        const container = $$('moviesCarousels');
        container.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando filmes...</div>';
        $$('moviesExpandedWrap').style.display = 'none';
        try {
            const [cats, streams] = await Promise.all([API.vodCats(cred), API.vodStreams(cred)]);
            S.vodCats = cats || []; S.vod = streams || [];
            // Mapear nomes de categorias aos filmes
            const catNameMap = {};
            S.vodCats.forEach(c => { catNameMap[c.category_id] = c.category_name; });
            S.vod.forEach(m => { if (!m.category_name && m.category_id) m.category_name = catNameMap[m.category_id] || 'Outros'; });
            _moviesLoaded = true;
            renderBrandServicesRow('vod');
            renderMoviesCarousels();
        } catch (e) { container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar filmes</p><span>${esc(e.message)}</span></div>`; }
    }
    function renderMoviesCarousels(query) {
        const container = $$('moviesCarousels');
        container.innerHTML = '';
        $$('moviesExpandedWrap').style.display = 'none';
        container.style.display = '';
        // Limpar active dos brand cards ao voltar
        $$('moviesBrandRow')?.querySelectorAll('.brand-service-card').forEach(c => c.classList.remove('active'));
        let allItems = [...S.vod];
        allItems = filterKidsContent(allItems);
        if (isParentalOn()) allItems = allItems.filter(i => !isCatBlocked('vod', i.category_id));
        if (query) { const q = query.toLowerCase(); allItems = allItems.filter(i => (i.name || '').toLowerCase().includes(q)); }
        $$('moviesCount').textContent = allItems.length + ' filmes';
        const catMap = {};
        allItems.forEach(m => {
            const cid = m.category_id || 'other';
            if (!catMap[cid]) catMap[cid] = { name: m.category_name || 'Outros', items: [] };
            catMap[cid].items.push(m);
        });
        const catIds = Object.keys(catMap);
        if (!catIds.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Nenhum filme encontrado</p></div>'; return; }
        
        // Check display mode
        const displayMode = getDisplayMode();
        
        if (displayMode === 'grid') {
            // Grid mode with accordion categories
            container.classList.add('grid-mode');
            catIds.forEach((cid, idx) => {
                const cat = catMap[cid];
                const block = document.createElement('div');
                block.className = 'cat-accordion-block';
                block.innerHTML = `<div class="cat-accordion-header ${idx === 0 ? 'expanded' : ''}" data-catid="${cid}">
                    <h3><i class="fas fa-film"></i> ${esc(cat.name)} <span class="cat-accordion-count">${cat.items.length}</span></h3>
                    <i class="fas fa-chevron-down cat-accordion-arrow"></i>
                </div>
                <div class="cat-accordion-content ${idx === 0 ? 'expanded' : ''}" style="${idx === 0 ? '' : 'display:none'}">
                    <div class="cat-grid poster-grid"></div>
                </div>`;
                const grid = block.querySelector('.cat-grid');
                cat.items.forEach(m => {
                    const card = document.createElement('div');
                    card.className = 'poster-card';
                    card.innerHTML = `<div class="poster-img">
                            ${m.stream_icon ? `<img src="${esc(m.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-film\\'></i>'">` : '<i class="fas fa-film"></i>'}
                            ${m.rating ? `<div class="poster-rating"><i class="fas fa-star"></i> ${esc(String(m.rating))}</div>` : ''}
                            <button class="poster-fav ${isFav('vod', m.stream_id) ? 'is-fav' : ''}" onclick="event.stopPropagation()"><i class="fas fa-heart"></i></button>
                            <div class="poster-overlay"><div class="poster-play-icon"><i class="fas fa-play"></i></div></div>
                        </div>
                        <div class="poster-info"><div class="poster-title">${esc(m.name)}</div>${m.year ? `<div class="poster-year">${esc(m.year)}</div>` : ''}</div>`;
                    card.onclick = () => openMovieModal(m);
                    card.querySelector('.poster-fav').onclick = e => { e.stopPropagation(); const a = toggleFav('vod', m.stream_id, m.name, { stream_icon: m.stream_icon, year: m.year, container_extension: m.container_extension }); e.currentTarget.classList.toggle('is-fav', a); toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info'); };
                    grid.appendChild(card);
                });
                block.querySelector('.cat-accordion-header').onclick = function() {
                    const content = this.nextElementSibling;
                    const isExpanded = this.classList.contains('expanded');
                    this.classList.toggle('expanded', !isExpanded);
                    content.classList.toggle('expanded', !isExpanded);
                    content.style.display = isExpanded ? 'none' : '';
                };
                container.appendChild(block);
            });
        } else {
            // Carousel mode (default)
            container.classList.remove('grid-mode');
            catIds.forEach(cid => {
                const cat = catMap[cid];
                const block = document.createElement('div');
                block.className = 'cat-carousel-block';
                block.innerHTML = `<div class="cat-carousel-header">
                    <h3><i class="fas fa-film"></i> ${esc(cat.name)} <span class="cat-carousel-count">${cat.items.length}</span></h3>
                    <button class="cat-carousel-viewall" data-catid="${cid}">Ver todos <i class="fas fa-chevron-right"></i></button>
                </div><div class="cat-carousel-track poster-track"></div>`;
                const track = block.querySelector('.cat-carousel-track');
                cat.items.slice(0, 20).forEach(m => {
                    const card = document.createElement('div');
                    card.className = 'h-poster nf-poster';
                    const ratingBadge = m.rating ? `<div class="nf-poster-rating"><i class="fas fa-star"></i> ${parseFloat(m.rating).toFixed(1)}</div>` : '';
                    const yearBadge = m.year ? `<div class="nf-poster-year">${m.year}</div>` : '';
                    card.innerHTML = `<div class="hp-img">
                        ${m.stream_icon ? `<img src="${esc(m.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-film\\'></i>'">` : '<i class="fas fa-film"></i>'}
                        ${ratingBadge}
                        <div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div>
                    </div>
                    <div class="hp-info"><div class="hp-title">${esc(m.name)}</div>${yearBadge}</div>`;
                    card.onclick = () => openMovieModal(m);
                    track.appendChild(card);
                });
                block.querySelector('.cat-carousel-viewall').onclick = () => expandMoviesCategory(cid, cat.name, allItems.filter(i => (i.category_id || 'other') == cid));
                container.appendChild(block);
            });
        }
    }
    function expandMoviesCategory(catId, catName, items) {
        $$('moviesCarousels').style.display = 'none';
        const wrap = $$('moviesExpandedWrap');
        wrap.style.display = 'block';
        $$('moviesExpandedTitle').textContent = catName;
        $$('moviesExpandedCount').textContent = items.length + ' filmes';
        const grid = $$('moviesExpandedGrid');
        grid.innerHTML = '';
        items.forEach(m => {
            const card = document.createElement('div');
            card.className = 'poster-card';
            card.innerHTML = `<div class="poster-img">
                    ${m.stream_icon ? `<img src="${esc(m.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-film\\'></i>'">` : '<i class="fas fa-film"></i>'}
                    ${m.rating ? `<div class="poster-rating"><i class="fas fa-star"></i> ${esc(String(m.rating))}</div>` : ''}
                    <button class="poster-fav ${isFav('vod', m.stream_id) ? 'is-fav' : ''}" onclick="event.stopPropagation()"><i class="fas fa-heart"></i></button>
                    <div class="poster-overlay"><div class="poster-play-icon"><i class="fas fa-play"></i></div></div>
                </div>
                <div class="poster-info"><div class="poster-title">${esc(m.name)}</div>${m.year ? `<div class="poster-year">${esc(m.year)}</div>` : ''}</div>`;
            card.onclick = () => openMovieModal(m);
            card.querySelector('.poster-fav').onclick = e => { e.stopPropagation(); const a = toggleFav('vod', m.stream_id, m.name, { stream_icon: m.stream_icon, year: m.year, container_extension: m.container_extension }); e.currentTarget.classList.toggle('is-fav', a); toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info'); };
            grid.appendChild(card);
        });
    }
    $$('moviesExpandedBack')?.addEventListener('click', () => renderMoviesCarousels($$('moviesSearch')?.value || ''));
    $$('moviesSearch')?.addEventListener('input', e => { renderMoviesCarousels(e.target.value); });

    /* ============ SERIES — CAROUSEL BY CATEGORY ============ */
    let _seriesLoaded = false;
    
    // Now set up force reload function (after loader vars exist)
    window._forceReloadContent = function() {
        _liveLoaded = false;
        _moviesLoaded = false;
        _seriesLoaded = false;
        _tvCurrentCh = null;
        _tvSelectedCat = 'all';
        tvStopPreview();
        nav('home');
    };
    async function loadSeries() {
        if (_seriesLoaded) { return; }
        const container = $$('seriesCarousels');
        container.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando séries...</div>';
        $$('seriesExpandedWrap').style.display = 'none';
        try {
            let cats = [];
            try { cats = await API.seriesCats(cred); } catch {}
            S.serCats = Array.isArray(cats) ? cats : [];
            let ser = S.ser && S.ser.length ? S.ser : null;
            if (!ser) {
                try { ser = await API.series(cred); } catch (e1) {
                    // Tentando novamente em 2s
                    await new Promise(r => setTimeout(r, 2000));
                    try { ser = await API.series(cred); } catch (e2) { }
                }
            }
            S.ser = Array.isArray(ser) ? ser : [];
            // Mapear nomes de categorias às séries
            const catNameMap = {};
            S.serCats.forEach(c => { catNameMap[c.category_id] = c.category_name; });
            S.ser.forEach(s => { if (!s.category_name && s.category_id) s.category_name = catNameMap[s.category_id] || 'Outros'; });
            _seriesLoaded = true;
            renderBrandServicesRow('series');
            renderSeriesCarousels();
        } catch (e) { container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar séries</p><span>${esc(e.message)}</span></div>`; }
    }
    function renderSeriesCarousels(query) {
        const container = $$('seriesCarousels');
        container.innerHTML = '';
        $$('seriesExpandedWrap').style.display = 'none';
        container.style.display = '';
        // Limpar active dos brand cards ao voltar
        $$('seriesBrandRow')?.querySelectorAll('.brand-service-card').forEach(c => c.classList.remove('active'));
        let allItems = [...S.ser];
        allItems = filterKidsContent(allItems);
        if (isParentalOn()) allItems = allItems.filter(i => !isCatBlocked('series', i.category_id));
        if (query) { const q = query.toLowerCase(); allItems = allItems.filter(i => (i.name || '').toLowerCase().includes(q)); }
        $$('seriesCount').textContent = allItems.length + ' séries';
        const catMap = {};
        allItems.forEach(s => {
            const cid = s.category_id || 'other';
            if (!catMap[cid]) catMap[cid] = { name: s.category_name || 'Outros', items: [] };
            catMap[cid].items.push(s);
        });
        const catIds = Object.keys(catMap);
        if (!catIds.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-tv"></i><p>Nenhuma série encontrada</p></div>'; return; }
        
        // Check display mode
        const displayMode = getDisplayMode();
        
        if (displayMode === 'grid') {
            // Grid mode with accordion categories
            container.classList.add('grid-mode');
            catIds.forEach((cid, idx) => {
                const cat = catMap[cid];
                const block = document.createElement('div');
                block.className = 'cat-accordion-block';
                block.innerHTML = `<div class="cat-accordion-header ${idx === 0 ? 'expanded' : ''}" data-catid="${cid}">
                    <h3><i class="fas fa-tv"></i> ${esc(cat.name)} <span class="cat-accordion-count">${cat.items.length}</span></h3>
                    <i class="fas fa-chevron-down cat-accordion-arrow"></i>
                </div>
                <div class="cat-accordion-content ${idx === 0 ? 'expanded' : ''}" style="${idx === 0 ? '' : 'display:none'}">
                    <div class="cat-grid poster-grid"></div>
                </div>`;
                const grid = block.querySelector('.cat-grid');
                cat.items.forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'poster-card';
                    card.innerHTML = `<div class="poster-img">
                            ${s.cover ? `<img src="${esc(s.cover)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>'}
                            ${s.rating ? `<div class="poster-rating"><i class="fas fa-star"></i> ${esc(String(s.rating))}</div>` : ''}
                            <button class="poster-fav ${isFav('series', s.series_id) ? 'is-fav' : ''}" onclick="event.stopPropagation()"><i class="fas fa-heart"></i></button>
                            <div class="poster-overlay"><div class="poster-play-icon"><i class="fas fa-play"></i></div></div>
                        </div>
                        <div class="poster-info"><div class="poster-title">${esc(s.name)}</div>${s.year ? `<div class="poster-year">${esc(s.year)}</div>` : ''}</div>`;
                    card.onclick = () => openSeriesModal(s);
                    card.querySelector('.poster-fav').onclick = e => { e.stopPropagation(); const a = toggleFav('series', s.series_id, s.name, { cover: s.cover, year: s.year }); e.currentTarget.classList.toggle('is-fav', a); toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info'); };
                    grid.appendChild(card);
                });
                block.querySelector('.cat-accordion-header').onclick = function() {
                    const content = this.nextElementSibling;
                    const isExpanded = this.classList.contains('expanded');
                    this.classList.toggle('expanded', !isExpanded);
                    content.classList.toggle('expanded', !isExpanded);
                    content.style.display = isExpanded ? 'none' : '';
                };
                container.appendChild(block);
            });
        } else {
            // Carousel mode (default)
            container.classList.remove('grid-mode');
            catIds.forEach(cid => {
                const cat = catMap[cid];
                const block = document.createElement('div');
                block.className = 'cat-carousel-block';
                block.innerHTML = `<div class="cat-carousel-header">
                    <h3><i class="fas fa-tv"></i> ${esc(cat.name)} <span class="cat-carousel-count">${cat.items.length}</span></h3>
                    <button class="cat-carousel-viewall" data-catid="${cid}">Ver todos <i class="fas fa-chevron-right"></i></button>
                </div><div class="cat-carousel-track poster-track"></div>`;
                const track = block.querySelector('.cat-carousel-track');
                cat.items.slice(0, 20).forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'h-poster nf-poster';
                    const ratingBadge = s.rating ? `<div class="nf-poster-rating"><i class="fas fa-star"></i> ${parseFloat(s.rating).toFixed(1)}</div>` : '';
                    const yearBadge = s.year ? `<div class="nf-poster-year">${s.year}</div>` : '';
                    card.innerHTML = `<div class="hp-img">
                        ${s.cover ? `<img src="${esc(s.cover)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>'}
                        ${ratingBadge}
                        <div class="nf-poster-hover-overlay"><i class="fas fa-play-circle"></i></div>
                    </div>
                    <div class="hp-info"><div class="hp-title">${esc(s.name)}</div>${yearBadge}</div>`;
                    card.onclick = () => openSeriesModal(s);
                    track.appendChild(card);
                });
                block.querySelector('.cat-carousel-viewall').onclick = () => expandSeriesCategory(cid, cat.name, allItems.filter(i => (i.category_id || 'other') == cid));
                container.appendChild(block);
            });
        }
    }
    function expandSeriesCategory(catId, catName, items) {
        $$('seriesCarousels').style.display = 'none';
        const wrap = $$('seriesExpandedWrap');
        wrap.style.display = 'block';
        $$('seriesExpandedTitle').textContent = catName;
        $$('seriesExpandedCount').textContent = items.length + ' séries';
        const grid = $$('seriesExpandedGrid');
        grid.innerHTML = '';
        items.forEach(s => {
            const card = document.createElement('div');
            card.className = 'poster-card';
            card.innerHTML = `<div class="poster-img">
                    ${s.cover ? `<img src="${esc(s.cover)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>'}
                    ${s.rating ? `<div class="poster-rating"><i class="fas fa-star"></i> ${esc(String(s.rating))}</div>` : ''}
                    <button class="poster-fav ${isFav('series', s.series_id) ? 'is-fav' : ''}" onclick="event.stopPropagation()"><i class="fas fa-heart"></i></button>
                    <div class="poster-overlay"><div class="poster-play-icon"><i class="fas fa-play"></i></div></div>
                </div>
                <div class="poster-info"><div class="poster-title">${esc(s.name)}</div>${s.year ? `<div class="poster-year">${esc(s.year)}</div>` : ''}</div>`;
            card.onclick = () => openSeriesModal(s);
            card.querySelector('.poster-fav').onclick = e => { e.stopPropagation(); const a = toggleFav('series', s.series_id, s.name, { cover: s.cover, year: s.year }); e.currentTarget.classList.toggle('is-fav', a); toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info'); };
            grid.appendChild(card);
        });
    }
    $$('seriesExpandedBack')?.addEventListener('click', () => renderSeriesCarousels($$('seriesSearch')?.value || ''));
    $$('seriesSearch')?.addEventListener('input', e => { renderSeriesCarousels(e.target.value); });

    /* ---- RENDER CATEGORIES (kept for compatibility) ---- */
    function renderCats(containerId, cats, stateKey, filterFn) {
        const bar = $$(containerId);
        if (!bar) return;

        // Wrap bar in navigation container if not already wrapped
        let wrap = bar.parentElement;
        if (!wrap || !wrap.classList.contains('categories-wrap')) {
            wrap = document.createElement('div');
            wrap.className = 'categories-wrap';
            bar.parentNode.insertBefore(wrap, bar);
            wrap.appendChild(bar);
            // Create arrow buttons
            const arrL = document.createElement('button');
            arrL.className = 'cat-arrow arr-left';
            arrL.innerHTML = '<i class="fas fa-chevron-left"></i>';
            const arrR = document.createElement('button');
            arrR.className = 'cat-arrow arr-right';
            arrR.innerHTML = '<i class="fas fa-chevron-right"></i>';
            wrap.appendChild(arrL);
            wrap.appendChild(arrR);
        }

        let html = '<div class="category-chip active" data-cat="all">Todos</div>';
        cats.forEach(c => { html += `<div class="category-chip" data-cat="${c.category_id}">${esc(c.category_name)}</div>`; });
        bar.innerHTML = html;

        // Flag compartilhada com initCatBarNav para distinguir tap vs drag
        bar._wasDragged = false;

        bar.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                // Se foi drag/swipe, ignora o click
                if (bar._wasDragged) { bar._wasDragged = false; return; }
                bar.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                S[stateKey] = chip.dataset.cat;
                filterFn();
            });
        });

        // Setup arrows + mouse drag for desktop
        initCatBarNav(bar, wrap);
    }

    /* ---- CATEGORY BAR: arrows + mouse drag ---- */
    function initCatBarNav(bar, wrap) {
        const arrL = wrap.querySelector('.cat-arrow.arr-left');
        const arrR = wrap.querySelector('.cat-arrow.arr-right');
        if (!arrL || !arrR) return;

        const scrollAmt = 200;

        function updateArrows() {
            const canScrollLeft = bar.scrollLeft > 2;
            const canScrollRight = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2;
            arrL.classList.toggle('visible', canScrollLeft);
            arrR.classList.toggle('visible', canScrollRight);
            wrap.classList.toggle('has-left', canScrollLeft);
            wrap.classList.toggle('has-right', canScrollRight);
        }

        arrL.onclick = () => { bar.scrollBy({ left: -scrollAmt, behavior: 'smooth' }); };
        arrR.onclick = () => { bar.scrollBy({ left: scrollAmt, behavior: 'smooth' }); };
        bar.addEventListener('scroll', updateArrows, { passive: true });
        setTimeout(updateArrows, 60);
        // Also update on window resize
        const ro = new ResizeObserver(() => updateArrows());
        ro.observe(bar);

        // Touch: detectar swipe vs tap (mobile)
        let touchStartX = 0;
        bar.addEventListener('touchstart', e => {
            touchStartX = e.touches[0].pageX;
            bar._wasDragged = false;
        }, { passive: true });
        bar.addEventListener('touchmove', e => {
            const dx = Math.abs(e.touches[0].pageX - touchStartX);
            // Apenas marca como drag se moveu mais de 15px (swipe real)
            if (dx > 15) bar._wasDragged = true;
        }, { passive: true });
        // NÃO usar preventDefault no touchend — permite click nativo funcionar

        // Mouse drag-to-scroll (desktop only)
        let isDragging = false, startX = 0, scrollStart = 0;
        bar.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            isDragging = true;
            bar._wasDragged = false;
            startX = e.pageX;
            scrollStart = bar.scrollLeft;
            bar.style.cursor = 'grabbing';
            bar.style.userSelect = 'none';
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const dx = e.pageX - startX;
            if (Math.abs(dx) > 5) bar._wasDragged = true;
            bar.scrollLeft = scrollStart - dx;
        });
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            bar.style.cursor = 'grab';
            bar.style.userSelect = '';
            // Reset drag flag após breve delay para o click processar primeiro
            if (bar._wasDragged) setTimeout(() => { bar._wasDragged = false; }, 50);
        });
    }

    /* ============ TMDB API HELPER ============ */
    const TMDB_IMG = 'https://image.tmdb.org/t/p/';
    const _tmdbCache = {};

    async function tmdbFetch(endpoint, params = {}) {
        params.language = params.language || 'pt-BR';
        const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const url = `/api/tmdb_proxy.php?endpoint=${encodeURIComponent(endpoint)}&${qs}`;
        const cacheKey = endpoint + '|' + qs;
        if (_tmdbCache[cacheKey]) return _tmdbCache[cacheKey];
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            const data = await r.json();
            _tmdbCache[cacheKey] = data;
            return data;
        } catch { return null; }
    }

    // Get TMDB backdrop for a movie (by tmdb_id or by search)
    async function tmdbGetMovieBackdrop(item) {
        // If we already cached the backdrop URL
        if (item._tmdbBackdrop) return item._tmdbBackdrop;

        let data = null;
        // Try by tmdb_id first
        if (item.tmdb_id) {
            data = await tmdbFetch(`movie/${item.tmdb_id}`);
        }
        // Fallback: search by name
        if (!data?.backdrop_path && item.name) {
            const search = await tmdbFetch('search/movie', { query: item.name.replace(/\s*\(.*?\)\s*/g, '').trim() });
            if (search?.results?.length) {
                // Try to match by year if available
                const yr = item.year || (item.release_date ? String(item.release_date).slice(0,4) : '');
                const match = yr ? search.results.find(r => r.release_date && r.release_date.startsWith(yr)) : null;
                data = match || search.results[0];
                if (data?.id && !item.tmdb_id) item.tmdb_id = data.id;
            }
        }
        if (data?.backdrop_path) {
            item._tmdbBackdrop = TMDB_IMG + 'w1280' + data.backdrop_path;
            // Also grab extra info if available
            if (data.overview && !item.plot) item.plot = data.overview;
            if (data.vote_average && (!item.rating || parseFloat(item.rating) === 0)) item.rating = String(data.vote_average);
            if (data.release_date && !item.year) item.year = data.release_date.slice(0,4);
            if (data.genres?.length && !item.genre) item.genre = data.genres.map(g => g.name).join(', ');
            return item._tmdbBackdrop;
        }
        // Fallback: poster from TMDB
        if (data?.poster_path) {
            item._tmdbBackdrop = TMDB_IMG + 'w780' + data.poster_path;
            return item._tmdbBackdrop;
        }
        return null;
    }

    // Get TMDB backdrop for a series (by name search as TV)
    async function tmdbGetSeriesBackdrop(item) {
        if (item._tmdbBackdrop) return item._tmdbBackdrop;

        let data = null;
        if (item.tmdb_id) {
            data = await tmdbFetch(`tv/${item.tmdb_id}`);
        }
        if (!data?.backdrop_path && item.name) {
            const search = await tmdbFetch('search/tv', { query: item.name.replace(/\s*\(.*?\)\s*/g, '').trim() });
            if (search?.results?.length) {
                const yr = item.year || '';
                const match = yr ? search.results.find(r => r.first_air_date && r.first_air_date.startsWith(yr)) : null;
                data = match || search.results[0];
                if (data?.id && !item.tmdb_id) item.tmdb_id = data.id;
            }
        }
        if (data?.backdrop_path) {
            item._tmdbBackdrop = TMDB_IMG + 'w1280' + data.backdrop_path;
            if (data.overview && !item.plot) item.plot = data.overview;
            if (data.vote_average && (!item.rating || parseFloat(item.rating) === 0)) item.rating = String(data.vote_average);
            if (data.first_air_date && !item.year) item.year = data.first_air_date.slice(0,4);
            if (data.genres?.length && !item.genre) item.genre = data.genres.map(g => g.name).join(', ');
            return item._tmdbBackdrop;
        }
        if (data?.poster_path) {
            item._tmdbBackdrop = TMDB_IMG + 'w780' + data.poster_path;
            return item._tmdbBackdrop;
        }
        return null;
    }

    /* ============ MOVIE MODAL — Netflix Premium ============ */
    function buildNfRatingBadges(item) {
        let html = '';
        if (item.rating && parseFloat(item.rating) > 0) {
            const r = parseFloat(item.rating);
            const pct = Math.round((r / 10) * 100);
            html += `<span class="nfm-rating-badge"><span class="nfm-tmdb">TMDB</span> <span class="nfm-score">${r.toFixed(1)}</span></span>`;
            html += `<span class="nfm-star-badge"><i class="fas fa-star"></i> ${r.toFixed(1)} <span class="nfm-bar"><span class="nfm-bar-fill" style="width:${pct}%"></span></span></span>`;
        }
        return html;
    }

    function buildNfMeta(item) {
        let html = '';
        // Relevance/match percentage (based on rating)
        if (item.rating && parseFloat(item.rating) > 0) {
            const pct = Math.min(99, Math.round(parseFloat(item.rating) * 10));
            html += `<span class="nfm-match">${pct}% relevante</span>`;
        }
        if (item.year || item.release_date) html += `<span class="nfm-year">${item.year || String(item.release_date).slice(0,4)}</span>`;
        // Maturity rating badge
        const age = item.age_rating || item.mpaa_rating || item.content_rating || '';
        if (age) {
            const cls = /18/i.test(age) ? 'nfm-m18' : /16/i.test(age) ? 'nfm-m16' : /14/i.test(age) ? 'nfm-m14' : '';
            html += `<span class="nfm-maturity ${cls}">${esc(age)}</span>`;
        }
        if (item.duration || item.runtime) html += `<span class="nfm-duration">${item.duration || item.runtime}</span>`;
        html += `<span class="nfm-hd">HD</span>`;
        if (item.genre || item.category_name) {
            const genres = (item.genre || item.category_name).split(/[,\/]/).map(g => g.trim()).filter(Boolean);
            html += genres.map(g => `<span class="nfm-genre">${esc(g)}</span>`).join('<span class="nfm-dot">•</span>');
        }
        // TMDB rating badge
        if (item.rating && parseFloat(item.rating) > 0) {
            const r = parseFloat(item.rating);
            const pct = Math.round((r / 10) * 100);
            html += `<span class="nfm-rating-badge"><span class="nfm-tmdb">TMDB</span> <span class="nfm-score">${r.toFixed(1)}</span></span>`;
            html += `<span class="nfm-star-badge"><i class="fas fa-star"></i> ${r.toFixed(1)} <span class="nfm-bar"><span class="nfm-bar-fill" style="width:${pct}%"></span></span></span>`;
        }
        return html;
    }

    function _getMovieProgress(streamId) {
        const prog = getProgressFor('v_' + streamId) || getProgressFor(streamId);
        if (prog && prog.t > 0 && prog.d > 0) {
            return { t: prog.t, d: prog.d, pct: Math.round((prog.t / prog.d) * 100) };
        }
        return null;
    }

    async function openMovieModal(m) {
        const modal = $$('movieModal');
        const bd = $$('movieModalBackdrop');
        const fallbackImg = m.stream_icon || '';
        bd.style.backgroundImage = fallbackImg ? `url('${fallbackImg}')` : 'none';
        bd.style.backgroundColor = fallbackImg ? 'transparent' : '#111';

        // Reset trailer
        const trailerWrap = $$('movieTrailerWrap');
        const trailerFrame = $$('movieTrailerFrame');
        const trailerBtn = $$('movieModalTrailerBtn');
        const trailerLabel = $$('movieTrailerLabel');
        const muteBtn = $$('movieTrailerMute');
        if (trailerWrap) trailerWrap.style.display = 'none';
        if (trailerFrame) trailerFrame.src = '';
        if (trailerBtn) trailerBtn.style.display = 'none';
        if (trailerLabel) trailerLabel.style.display = 'none';

        // Reset sections
        const moreSection = $$('movieModalMore');
        const castSection = $$('movieModalCastSection');
        const aboutSection = $$('movieModalAbout');
        if (moreSection) moreSection.style.display = 'none';
        if (castSection) castSection.style.display = 'none';
        if (aboutSection) { aboutSection.style.display = 'none'; aboutSection.classList.remove('open'); }

        // Logo title on backdrop (hidden - title shows in body instead)
        const logoTitle = $$('movieModalLogoTitle');
        if (logoTitle) logoTitle.textContent = '';

        // Title
        const modalTitle = $$('movieModalTitle');
        modalTitle.textContent = m.name || '';
        modalTitle.style.display = '';

        // Meta row
        $$('movieModalMeta').innerHTML = buildNfMeta(m);

        // Description
        $$('movieModalDesc').textContent = m.plot || m.description || 'Carregando descrição...';

        // Tags
        const tagsEl = $$('movieModalTags');
        if (tagsEl) tagsEl.innerHTML = '';

        // Info grid (will be populated after info loads)
        const infoGrid = $$('movieModalInfoGrid');
        if (infoGrid) infoGrid.innerHTML = '';

        // Progress bar (continuar assistindo)
        const progressWrap = $$('movieModalProgressWrap');
        const progressFill = $$('movieModalProgressFill');
        const progressText = $$('movieModalProgressText');
        const prog = _getMovieProgress(m.stream_id);
        if (prog && progressWrap) {
            progressWrap.style.display = 'flex';
            progressFill.style.width = prog.pct + '%';
            progressText.textContent = `${fmtTime(prog.t)} / ${fmtTime(prog.d)}`;
        } else if (progressWrap) {
            progressWrap.style.display = 'none';
        }

        // Resume button
        const resumeBtn = $$('movieModalResume');
        if (resumeBtn) {
            if (prog && prog.pct > 2 && prog.pct < 95) {
                resumeBtn.style.display = 'inline-flex';
                resumeBtn.innerHTML = `<i class="fas fa-redo"></i> Continuar de ${fmtTime(prog.t)}`;
                resumeBtn.onclick = () => { closeModal('movieModal'); playVod(m); };
            } else {
                resumeBtn.style.display = 'none';
            }
        }

        // Play button
        $$('movieModalPlay').onclick = () => { closeModal('movieModal'); playVod(m); };

        // Fav button (circle style)
        const btnF = $$('movieModalFav');
        const favd = isFav('vod', m.stream_id);
        btnF.className = `nf-circle-btn${favd ? ' is-fav' : ''}`;
        btnF.innerHTML = favd ? `<i class="fas fa-check"></i>` : `<i class="fas fa-plus"></i>`;
        btnF.onclick = () => {
            const a = toggleFav('vod', m.stream_id, m.name, { stream_icon: m.stream_icon, year: m.year, container_extension: m.container_extension });
            btnF.className = `nf-circle-btn${a ? ' is-fav' : ''}`;
            btnF.innerHTML = a ? `<i class="fas fa-check"></i>` : `<i class="fas fa-plus"></i>`;
            toast(a ? 'Adicionado à Minha Lista' : 'Removido da Minha Lista', a ? 'success' : 'info');
        };

        // Rate button
        const rateBtn = $$('movieModalRate');
        if (rateBtn) {
            const rated = localStorage.getItem('wp_rated_' + m.stream_id);
            rateBtn.className = `nf-circle-btn${rated ? ' is-liked' : ''}`;
            rateBtn.onclick = () => {
                const isRated = localStorage.getItem('wp_rated_' + m.stream_id);
                if (isRated) {
                    localStorage.removeItem('wp_rated_' + m.stream_id);
                    rateBtn.className = 'nf-circle-btn';
                    toast('Classificação removida', 'info');
                } else {
                    localStorage.setItem('wp_rated_' + m.stream_id, '1');
                    rateBtn.className = 'nf-circle-btn is-liked';
                    toast('Você gostou deste filme 👍', 'success');
                }
            };
        }

        // Share button
        const shareBtn = $$('movieModalShare');
        if (shareBtn) shareBtn.onclick = () => {
            const text = `🎬 ${m.name || 'Filme'} - Assista agora!`;
            if (navigator.share) { navigator.share({ title: m.name, text }); }
            else { navigator.clipboard?.writeText(text); toast('Copiado!', 'success'); }
        };

        // Show modal
        modal.style.display = 'flex';

        // Close handlers
        $$('movieModalClose').onclick = () => { if (trailerFrame) trailerFrame.src = ''; closeModal('movieModal'); };
        modal.onclick = e => { if (e.target === modal) { if (trailerFrame) trailerFrame.src = ''; closeModal('movieModal'); } };

        // About toggle
        const aboutToggle = $$('movieModalAboutToggle');
        if (aboutToggle) aboutToggle.onclick = () => aboutSection.classList.toggle('open');

        // Fetch detailed info
        if (!m._infoLoaded) {
            try {
                const info = await API.vodInfo(cred, m.stream_id);
                const vi = info?.info || info?.movie_data || {};
                if (vi.plot || vi.description) { m.plot = vi.plot || vi.description; $$('movieModalDesc').textContent = m.plot; }
                else if (!m.plot) $$('movieModalDesc').textContent = 'Sem descrição disponível.';
                if (vi.genre && !m.genre) m.genre = vi.genre;
                if (vi.duration && !m.duration) m.duration = vi.duration;
                if (vi.director) m.director = vi.director;
                if (vi.cast) m.cast = vi.cast;
                if (vi.actors) m.actors = vi.actors;
                if (vi.rating) m.rating = vi.rating;
                if (vi.tmdb_id) m.tmdb_id = vi.tmdb_id;
                if (vi.country) m.country = vi.country;
                if (vi.releasedate) m.releasedate = vi.releasedate;
                if (vi.age_rating || vi.mpaa_rating) m.age_rating = vi.age_rating || vi.mpaa_rating;
                m._infoLoaded = true;

                // Update meta row + desc
                $$('movieModalMeta').innerHTML = buildNfMeta(m);

                // Build genre tags
                if (tagsEl && m.genre) {
                    const genres = m.genre.split(/[,\/]/).map(g => g.trim()).filter(Boolean);
                    tagsEl.innerHTML = genres.map(g => `<span class="nf-modal-tag">${esc(g)}</span>`).join('');
                }

                // Build info grid
                if (infoGrid) {
                    let ig = '';
                    if (m.director) ig += `<div><strong>Direção:</strong> ${esc(m.director)}</div>`;
                    if (m.cast) ig += `<div><strong>Elenco:</strong> ${esc(m.cast.substring(0,150))}${m.cast.length > 150 ? '...' : ''}</div>`;
                    if (m.country) ig += `<div><strong>País:</strong> ${esc(m.country)}</div>`;
                    if (m.duration || vi.duration) ig += `<div><strong>Duração:</strong> ${esc(m.duration || vi.duration)}</div>`;
                    infoGrid.innerHTML = ig;
                }

                // Fetch TMDB backdrop + cast + trailer + recs (async, non-blocking)
                tmdbGetMovieBackdrop(m).then(async url => {
                    if (url && modal.style.display !== 'none') {
                        const img = new Image();
                        img.onload = () => { bd.style.backgroundImage = `url('${url}')`; bd.style.backgroundColor = 'transparent'; };
                        img.src = url;
                        $$('movieModalMeta').innerHTML = buildNfMeta(m);
                        if (m.plot) $$('movieModalDesc').textContent = m.plot;
                    }

                    if (!m.tmdb_id) return;

                    // Fetch TMDB trailer
                    if (trailerBtn && trailerWrap && trailerFrame) {
                        try {
                            const videos = await tmdbFetch(`movie/${m.tmdb_id}/videos`);
                            const yt = videos?.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
                            if (yt) {
                                m._trailerKey = yt.key;
                                trailerBtn.style.display = 'flex';
                                if (trailerLabel) trailerLabel.style.display = '';
                                let trailerPlaying = false;
                                trailerBtn.onclick = () => {
                                    if (trailerPlaying) {
                                        trailerFrame.src = '';
                                        trailerWrap.style.display = 'none';
                                        trailerBtn.innerHTML = '<i class="fas fa-play"></i>';
                                        trailerPlaying = false;
                                    } else {
                                        trailerFrame.src = `https://www.youtube-nocookie.com/embed/${yt.key}?autoplay=1&rel=0&modestbranding=1`;
                                        trailerWrap.style.display = 'block';
                                        trailerBtn.innerHTML = '<i class="fas fa-times"></i>';
                                        trailerPlaying = true;
                                    }
                                };
                            }
                        } catch {}
                    }

                    // Fetch TMDB cast with profile photos
                    if (castSection) {
                        try {
                            const credits = await tmdbFetch(`movie/${m.tmdb_id}/credits`);
                            const castList = credits?.cast?.slice(0, 15) || [];
                            if (castList.length) {
                                const castGrid = $$('movieModalCastGrid');
                                castGrid.innerHTML = castList.map(c => {
                                    const photo = c.profile_path ? TMDB_IMG + 'w185' + c.profile_path : '';
                                    return `<div class="nf-cast-card">
                                        <div class="nf-cast-card-img">${photo ? `<img src="${photo}" loading="lazy" alt="">` : `<i class="fas fa-user"></i>`}</div>
                                        <div class="nf-cast-card-name">${esc(c.name || '')}</div>
                                        <div class="nf-cast-card-char">${esc(c.character || '')}</div>
                                    </div>`;
                                }).join('');
                                m._tmdbCast = castGrid.innerHTML;
                                castSection.style.display = 'block';
                            }
                        } catch {}
                    }

                    // "Mais como este" — only from local catalog (S.vod) matching genre
                    if (moreSection) {
                        try {
                            const moreGrid = $$('movieModalMoreGrid');
                            const mGenres = (m.genre || m.category_name || '').toLowerCase().split(/[,\/]/).map(g => g.trim()).filter(Boolean);
                            let similar = S.vod.filter(v => v.stream_id !== m.stream_id && (v.stream_icon || v.cover));
                            if (mGenres.length) {
                                const scored = similar.map(v => {
                                    const vg = (v.genre || v.category_name || '').toLowerCase();
                                    const score = mGenres.filter(g => vg.includes(g)).length;
                                    return { v, score };
                                }).filter(s => s.score > 0);
                                scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);
                                similar = scored.map(s => s.v);
                            } else {
                                similar.sort(() => Math.random() - 0.5);
                            }
                            const picks = similar.slice(0, 12);
                            if (picks.length) {
                                moreGrid.innerHTML = picks.map(r => {
                                    const posterUrl = r.stream_icon || r.cover || '';
                                    return `<div class="nf-more-card" onclick="window._movieModal(${r.stream_id})">
                                        ${posterUrl ? `<img src="${esc(posterUrl)}" loading="lazy" alt="">` : `<div class="nf-more-card-fallback"><i class="fas fa-film"></i></div>`}
                                        <div class="nf-more-card-info">
                                            <div class="nf-more-card-title">${esc(r.name || '')}</div>
                                            <div class="nf-more-card-year">${r.releasedate ? r.releasedate.slice(0,4) : (r.year || '')}${r.rating ? ' · ★ ' + parseFloat(r.rating).toFixed(1) : ''}</div>
                                        </div>
                                    </div>`;
                                }).join('');
                                moreSection.style.display = 'block';
                            }
                        } catch {}
                    }

                    // Build "About this movie" section
                    if (aboutSection) {
                        let about = '<div class="nf-modal-about-content-inner">';
                        about += `<p><strong>${esc(m.name || '')}</strong></p>`;
                        if (m.plot) about += `<p>${esc(m.plot)}</p>`;
                        if (m.director) about += `<p><strong>Direção:</strong> ${esc(m.director)}</p>`;
                        if (m.cast) about += `<p><strong>Elenco:</strong> ${esc(m.cast)}</p>`;
                        if (m.genre) about += `<p><strong>Gênero:</strong> ${esc(m.genre)}</p>`;
                        if (m.country) about += `<p><strong>País:</strong> ${esc(m.country)}</p>`;
                        if (m.releasedate) about += `<p><strong>Lançamento:</strong> ${esc(m.releasedate)}</p>`;
                        if (m.age_rating) about += `<p><strong>Classificação:</strong> ${esc(m.age_rating)}</p>`;
                        if (m.duration) about += `<p><strong>Duração:</strong> ${esc(m.duration)}</p>`;
                        about += '</div>';
                        $$('movieModalAboutContent').innerHTML = about;
                        aboutSection.style.display = 'block';
                    }
                });
            } catch { if (!m.plot) $$('movieModalDesc').textContent = 'Sem descrição disponível.'; }
        } else {
            // Already loaded — repopulate from cache
            if (m._tmdbBackdrop) { bd.style.backgroundImage = `url('${m._tmdbBackdrop}')`; bd.style.backgroundColor = 'transparent'; }

            // Tags
            if (tagsEl && m.genre) {
                const genres = m.genre.split(/[,\/]/).map(g => g.trim()).filter(Boolean);
                tagsEl.innerHTML = genres.map(g => `<span class="nf-modal-tag">${esc(g)}</span>`).join('');
            }

            // Info grid
            if (infoGrid) {
                let ig = '';
                if (m.director) ig += `<div><strong>Direção:</strong> ${esc(m.director)}</div>`;
                if (m.cast) ig += `<div><strong>Elenco:</strong> ${esc(m.cast.substring(0,150))}${m.cast.length > 150 ? '...' : ''}</div>`;
                if (m.country) ig += `<div><strong>País:</strong> ${esc(m.country)}</div>`;
                infoGrid.innerHTML = ig;
            }

            // Trailer button if cached
            if (m._trailerKey && trailerBtn) {
                trailerBtn.style.display = 'flex';
                if (trailerLabel) trailerLabel.style.display = '';
                let trailerPlaying = false;
                trailerBtn.onclick = () => {
                    if (trailerPlaying) { trailerFrame.src = ''; trailerWrap.style.display = 'none'; trailerBtn.innerHTML = '<i class="fas fa-play"></i>'; trailerPlaying = false; }
                    else { trailerFrame.src = `https://www.youtube-nocookie.com/embed/${m._trailerKey}?autoplay=1&rel=0&modestbranding=1`; trailerWrap.style.display = 'block'; trailerBtn.innerHTML = '<i class="fas fa-times"></i>'; trailerPlaying = true; }
                };
            }

            // Cast from cache
            if (m._tmdbCast && castSection) {
                const castGrid = $$('movieModalCastGrid');
                castGrid.innerHTML = m._tmdbCast;
                castSection.style.display = 'block';
            }

            // About
            if (aboutSection && (m.director || m.cast || m.genre)) {
                let about = '<div class="nf-modal-about-content-inner">';
                about += `<p><strong>${esc(m.name || '')}</strong></p>`;
                if (m.plot) about += `<p>${esc(m.plot)}</p>`;
                if (m.director) about += `<p><strong>Direção:</strong> ${esc(m.director)}</p>`;
                if (m.cast) about += `<p><strong>Elenco:</strong> ${esc(m.cast)}</p>`;
                if (m.genre) about += `<p><strong>Gênero:</strong> ${esc(m.genre)}</p>`;
                about += '</div>';
                $$('movieModalAboutContent').innerHTML = about;
                aboutSection.style.display = 'block';
            }

            // More Like This — from local catalog
            if (moreSection) {
                const mGenres = (m.genre || m.category_name || '').toLowerCase().split(/[,\/]/).map(g => g.trim()).filter(Boolean);
                let similar = S.vod.filter(v => v.stream_id !== m.stream_id && (v.stream_icon || v.cover));
                if (mGenres.length) {
                    const scored = similar.map(v => {
                        const vg = (v.genre || v.category_name || '').toLowerCase();
                        const score = mGenres.filter(g => vg.includes(g)).length;
                        return { v, score };
                    }).filter(s => s.score > 0);
                    scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);
                    similar = scored.map(s => s.v);
                } else { similar.sort(() => Math.random() - 0.5); }
                const picks = similar.slice(0, 12);
                if (picks.length) {
                    $$('movieModalMoreGrid').innerHTML = picks.map(r => {
                        const posterUrl = r.stream_icon || r.cover || '';
                        return `<div class="nf-more-card" onclick="window._movieModal(${r.stream_id})">
                            ${posterUrl ? `<img src="${esc(posterUrl)}" loading="lazy" alt="">` : `<div class="nf-more-card-fallback"><i class="fas fa-film"></i></div>`}
                            <div class="nf-more-card-info">
                                <div class="nf-more-card-title">${esc(r.name || '')}</div>
                                <div class="nf-more-card-year">${r.releasedate ? r.releasedate.slice(0,4) : (r.year || '')}${r.rating ? ' · ★ ' + parseFloat(r.rating).toFixed(1) : ''}</div>
                            </div>
                        </div>`;
                    }).join('');
                    moreSection.style.display = 'block';
                }
            }
        }
    }
    window._movieModal = id => {
        const m = S.vod.find(v => v.stream_id == id);
        if (!m) return;
        const modal = $$('movieModal');
        if (modal && modal.style.display !== 'none') {
            // Modal já aberto (ex: navegação "Mais como este") — fecha e reabre
            closeModal('movieModal');
            setTimeout(() => openMovieModal(m), 380);
        } else {
            openMovieModal(m);
        }
    };

    /* ============ SERIES MODAL — Netflix Style ============ */
    async function openSeriesModal(s) {
        const modal = $$('seriesModal');
        const bd = $$('seriesModalBackdrop');
        const fallbackImg = s.cover || '';
        bd.style.backgroundImage = fallbackImg ? `url('${fallbackImg}')` : 'none';
        bd.style.backgroundColor = fallbackImg ? 'transparent' : '#111';
        $$('seriesModalTitle').textContent = s.name || '';
        $$('seriesModalMeta').innerHTML = buildNfMeta(s);
        $$('seriesModalDesc').textContent = s.plot || s.description || 'Sem descrição.';
        $$('seriesModalExtra').innerHTML = '';
        const btnF = $$('seriesModalFav');
        btnF.className = `nf-modal-btn-fav ${isFav('series', s.series_id) ? 'is-fav' : ''}`;
        btnF.innerHTML = `<i class="fas fa-heart"></i>`;
        btnF.onclick = () => { const a = toggleFav('series', s.series_id, s.name, { cover: s.cover, year: s.year }); btnF.className = `nf-modal-btn-fav ${a ? 'is-fav' : ''}`; toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info'); };
        // Fetch TMDB backdrop asynchronously
        if (s._tmdbBackdrop) {
            bd.style.backgroundImage = `url('${s._tmdbBackdrop}')`;
        } else {
            tmdbGetSeriesBackdrop(s).then(tmdbUrl => {
                if (tmdbUrl && modal.style.display !== 'none') {
                    const img = new Image();
                    img.onload = () => {
                        bd.style.backgroundImage = `url('${tmdbUrl}')`;
                        bd.style.backgroundColor = 'transparent';
                    };
                    img.src = tmdbUrl;
                    if (s.plot) $$('seriesModalDesc').textContent = s.plot;
                    $$('seriesModalMeta').innerHTML = buildNfMeta(s);
                }
            });
        }
        const tabs = $$('seasonsTabs');
        const epList = $$('episodesList');
        tabs.innerHTML = '<div class="loading-placeholder-sm"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
        epList.innerHTML = '';
        modal.style.display = 'flex';
        $$('seriesModalClose').onclick = () => closeModal('seriesModal');
        modal.onclick = e => { if (e.target === modal) closeModal('seriesModal'); };
        try {
            const info = await API.seriesInfo(cred, s.series_id);
            const eps = info.episodes || {};
            const seasons = Object.keys(eps).sort((a, b) => +a - +b);
            if (!seasons.length) { tabs.innerHTML = ''; epList.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>Nenhum episódio</p></div>'; return; }
            if (info.info?.plot) $$('seriesModalDesc').textContent = info.info.plot;
            if (info.info?.rating) s.rating = info.info.rating;
            if (info.info?.genre) s.genre = info.info.genre;
            if (info.info?.director) s.director = info.info.director;
            if (info.info?.cast) s.cast = info.info.cast;
            $$('seriesModalMeta').innerHTML = buildNfMeta(s);
            let extra = buildNfRatingBadges(s);
            if (s.director) extra += `<p style="margin-top:10px"><strong>Direção:</strong> ${esc(s.director)}</p>`;
            if (s.cast) extra += `<p><strong>Elenco:</strong> ${esc(s.cast.substring(0,120))}${s.cast.length > 120 ? '...' : ''}</p>`;
            $$('seriesModalExtra').innerHTML = extra;
            const seriesPlot = info.info?.plot || s.plot || s.description || '';
            tabs.innerHTML = seasons.map((n, i) => `<div class="season-tab ${i === 0 ? 'active' : ''}" data-s="${n}">Temporada ${n}</div>`).join('');
            function cleanEpTitle(raw, seriesName) {
                if (!raw) return '';
                let t = raw;
                // Remove S01E01, S1E1, S01 E01, etc.
                t = t.replace(/\bS\d{1,3}\s*E\d{1,4}\b/gi, '');
                // Remove series name from beginning
                if (seriesName) {
                    const sn = seriesName.toLowerCase().trim();
                    if (t.toLowerCase().trim().startsWith(sn)) t = t.substring(sn.length);
                }
                // Clean leading/trailing dashes, dots, spaces
                t = t.replace(/^[\s\-–—.:_|]+/, '').replace(/[\s\-–—.:_|]+$/, '').trim();
                return t;
            }
            function renderEps(sn) {
                const list = eps[sn] || [];
                if (!list.length) { epList.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>Nenhum episódio</p></div>'; return; }
                // Check which ep user last watched (for "Continue from Ep X")
                const hist = getHist();
                const lastWatched = hist.find(h => h.seriesId === s.series_id || (h.name && h.name.includes(s.name)));
                epList.innerHTML = list.map((ep, idx) => {
                    const rawTitle = ep.title || '';
                    const cleaned = cleanEpTitle(rawTitle, s.name);
                    const epNum = ep.episode_num || (idx + 1);
                    const title = cleaned || `Episódio ${epNum}`;
                    const thumb = ep.info?.movie_image || ep.info?.cover_big || ep.info?.cover || '';
                    const plot = ep.info?.plot || ep.info?.description || ep.description || ep.plot || seriesPlot || '';
                    const dur = ep.info?.duration || ep.info?.duration_secs ? (Math.round((ep.info?.duration_secs||0)/60) + ' min') : ep.info?.duration || '';
                    const rating = ep.info?.rating || ep.info?.rating_5based || '';
                    // Progress for this episode
                    const prog = getProgressFor(ep.id);
                    const pct = prog ? Math.round((prog.t / prog.d) * 100) : 0;
                    const isLastWatched = lastWatched && lastWatched.epId === ep.id;
                    return `<div class="episode-row-nf ${isLastWatched ? 'ep-last-watched' : ''}" data-epid="${ep.id}" data-ext="${ep.container_extension || 'mp4'}">
                        <div class="ep-row-num">${epNum}</div>
                        <div class="ep-row-thumb">
                            ${thumb ? `<img src="${esc(thumb)}" loading="lazy" onerror="this.style.display='none'">` : ''}
                            <div class="ep-row-thumb-play"><i class="fas fa-play"></i></div>
                        </div>
                        <div class="ep-row-info">
                            <div class="ep-row-title">${esc(title)}</div>
                            <div class="ep-row-meta">
                                ${dur ? `<span>${esc(dur)}</span>` : ''}
                                ${rating ? `<span>★ ${esc(String(rating))}</span>` : ''}
                            </div>
                            ${plot ? `<div class="ep-row-plot">${esc(plot.substring(0, 150))}${plot.length > 150 ? '...' : ''}</div>` : ''}
                            ${pct > 0 ? `<div class="ep-row-progress"><div class="ep-row-progress-bar" style="width:${pct}%"></div></div>` : ''}
                        </div>
                    </div>`;
                }).join('');
                epList.querySelectorAll('.episode-row-nf').forEach(el => {
                    el.onclick = () => { closeModal('seriesModal'); playEp(el.dataset.epid, el.dataset.ext, s.name + ' - ' + el.querySelector('.ep-row-title').textContent, s.cover || ''); };
                });
            }
            renderEps(seasons[0]);
            tabs.querySelectorAll('.season-tab').forEach(t => {
                t.onclick = () => { tabs.querySelectorAll('.season-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); renderEps(t.dataset.s); };
            });
        } catch (e) { tabs.innerHTML = ''; epList.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro</p><span>${esc(e.message)}</span></div>`; }
    }
    window._seriesModal = id => { const s = S.ser.find(x => x.series_id == id); if (s) openSeriesModal(s); };

    function closeModal(id) {
        const el = $$(id);
        if (!el || el.style.display === 'none') return;
        el.classList.add('nf-closing');
        let done = false;
        const onEnd = () => {
            if (done) return;
            done = true;
            el.classList.remove('nf-closing');
            el.style.display = 'none';
            el.removeEventListener('animationend', onEnd);
        };
        el.addEventListener('animationend', onEnd);
        // Fallback if animation doesn't fire
        setTimeout(() => {
            if (!done) {
                done = true;
                el.removeEventListener('animationend', onEnd);
                el.classList.remove('nf-closing');
                el.style.display = 'none';
            }
        }, 400);
    }
    window.closeModal = closeModal; // expose globally for keyboard handler

    /* ============ FAVORITES ============ */
    function loadFav() {
        renderFavTab($$('favoritesGrid').dataset.tab || 'live');
    }
    function renderFavTab(tab) {
        const grid = $$('favoritesGrid');
        grid.dataset.tab = tab;
        document.querySelectorAll('.fav-tab').forEach(t => t.classList.toggle('active', t.dataset.type === tab));
        const f = getFav();
        const items = f[tab] || [];
        if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>Nenhum favorito</p></div>'; grid.className = 'items-grid'; return; }
        if (tab === 'live') {
            grid.className = 'items-grid channel-grid';
            grid.innerHTML = items.map(ch => {
                const logo = ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><i class="fas fa-tv" style="display:none"></i>` : '<i class="fas fa-tv"></i>';
                return `<div class="channel-card" onclick="window._playLive(${ch.id})"><div class="ch-logo">${logo}</div><div class="ch-info"><div class="ch-name">${esc(ch.name)}</div><div class="ch-cat">${esc(ch.category_name || '')}</div></div></div>`;
            }).join('');
        } else {
            grid.className = 'items-grid poster-grid';
            const isVod = tab === 'vod';
            grid.innerHTML = items.map(item => {
                const img = item.stream_icon || item.cover;
                const icon = isVod ? 'fa-film' : 'fa-tv';
                return `<div class="poster-card" onclick="window.${isVod ? '_movieModal' : '_seriesModal'}(${item.id})">
                    <div class="poster-img">${img ? `<img src="${esc(img)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas ${icon}\\'></i>'">` : `<i class="fas ${icon}"></i>`}</div>
                    <div class="poster-info"><div class="poster-title">${esc(item.name)}</div></div></div>`;
            }).join('');
        }
    }
    document.querySelectorAll('.fav-tab').forEach(t => { t.onclick = () => renderFavTab(t.dataset.type); });

    /* ============ EPG ============ */
    let epgLoaded = false;
    async function loadEpg() {
        const c = $$('epgChannelList');
        if (epgLoaded) return; // Don't reload if already loaded
        c.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando guia...</div>';
        try {
            if (!S.live.length) S.live = await API.liveStreams(cred);
            const channels = S.live; // ALL channels
            // Render all channel rows first (instant)
            c.innerHTML = channels.map(ch => {
                const logo = ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">` : '<i class="fas fa-tv"></i>';
                return `<div class="epg-row" onclick="window._playLive(${ch.stream_id})">
                    <div class="epg-ch-logo">${logo}</div>
                    <div class="epg-ch-name">${esc(ch.name)}</div>
                    <div class="epg-programs" id="epg-p-${ch.stream_id}"><span class="epg-loading-dot">...</span></div>
                </div>`;
            }).join('');
            epgLoaded = true;
            // Load EPG data in batches of 12 (non-blocking)
            async function loadEpgBatches() {
                for (let i = 0; i < channels.length; i += 12) {
                    const batch = channels.slice(i, i + 12);
                    await Promise.allSettled(batch.map(async ch => {
                        const el = $$('epg-p-' + ch.stream_id);
                        if (!el) return;
                        try {
                            const epg = await API.shortEpg(cred, ch.stream_id);
                            const progs = epg?.epg_listings || [];
                            if (!progs.length) { el.innerHTML = '<span style="font-size:10px;color:var(--text-muted)">Sem programação</span>'; return; }
                            const now = Math.floor(Date.now() / 1000);
                            el.innerHTML = progs.slice(0, 4).map(p => {
                                const s = +p.start_timestamp || 0, e = +p.stop_timestamp || 0;
                                const isNow = now >= s && now <= e;
                                let title = 'Sem título'; try { title = decodeB64(p.title); } catch {}
                                const time = new Date(s * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                return `<div class="epg-program ${isNow ? 'now' : ''}"><div class="epg-time">${time}</div><div class="epg-title">${esc(title)}</div></div>`;
                            }).join('');
                        } catch { el.innerHTML = '<span style="font-size:10px;color:var(--text-muted)">—</span>'; }
                    }));
                }
            }
            loadEpgBatches(); // runs in background, no await
        } catch (e) { c.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro</p><span>${esc(e.message)}</span></div>`; }
    }
    $$('epgSearch')?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.epg-row').forEach(r => { r.style.display = (r.querySelector('.epg-ch-name')?.textContent.toLowerCase().includes(q)) ? 'flex' : 'none'; });
    });

    /* ============ SETTINGS ============ */
    async function loadSettings() {
        // Display Mode
        const currentMode = getDisplayMode();
        const carouselRadio = $$('displayModeCarousel');
        const gridRadio = $$('displayModeGrid');
        if (carouselRadio) carouselRadio.checked = currentMode === 'carousel';
        if (gridRadio) gridRadio.checked = currentMode === 'grid';
        
        // Event listeners for display mode change
        [carouselRadio, gridRadio].forEach(radio => {
            if (radio) {
                radio.onchange = () => {
                    const mode = radio.value;
                    setDisplayMode(mode);
                    toast(`Modo ${mode === 'carousel' ? 'Carrossel' : 'Grade'} ativado. Recarregue a página para aplicar.`, 'success');
                };
            }
        });
        
        // Toggle Parental
        const tog = $$('parentalToggle');
        const statusText = $$('parentalStatusText');
        tog.checked = isParentalOn();
        statusText.textContent = tog.checked ? 'Ativado' : 'Desativado';
        tog.onchange = async () => {
            if (tog.checked && isParentalOn()) { /* already on */ }
            else if (tog.checked) {
                // Turning on — no pin needed
                setParentalOn(true);
                statusText.textContent = 'Ativado';
                toast('Controle parental ativado', 'success');
            } else {
                // Turning off — ask pin
                const ok = await askPin();
                if (ok) { setParentalOn(false); statusText.textContent = 'Desativado'; toast('Controle parental desativado', 'info'); }
                else { tog.checked = true; }
            }
        };
        // Change PIN
        $$('btnChangePin').onclick = () => {
            const cur = $$('pinCurrent').value;
            const nw = $$('pinNew').value;
            if (cur !== getPin()) { toast('PIN atual incorreto', 'error'); return; }
            if (nw.length !== 4 || !/^\d{4}$/.test(nw)) { toast('Novo PIN deve ter 4 dígitos', 'error'); return; }
            setPin(nw);
            $$('pinCurrent').value = '';
            $$('pinNew').value = '';
            toast('PIN alterado com sucesso!', 'success');
        };
        // Clear cache
        $$('btnClearCache').onclick = () => { Cache.clear(); toast('Cache limpo!', 'success'); };
        // Load categories for blocking
        try {
            const [lc, vc, sc] = await Promise.all([API.liveCats(cred), API.vodCats(cred), API.seriesCats(cred)]);
            renderBlockedCats('blockedLiveCats', lc || [], 'live');
            renderBlockedCats('blockedVodCats', vc || [], 'vod');
            renderBlockedCats('blockedSeriesCats', sc || [], 'series');
        } catch {}
    }
    function renderBlockedCats(containerId, cats, type) {
        const el = $$(containerId);
        const blocked = getBlockedCats(type);
        el.innerHTML = cats.map(c => {
            const isBlocked = blocked.includes(String(c.category_id));
            return `<div class="blocked-cat-chip ${isBlocked ? 'blocked' : ''}" data-cid="${c.category_id}">
                <i class="fas ${isBlocked ? 'fa-lock' : 'fa-unlock'} chip-icon"></i>
                <span>${esc(c.category_name)}</span></div>`;
        }).join('');
        el.querySelectorAll('.blocked-cat-chip').forEach(chip => {
            chip.onclick = async () => {
                // Need PIN to change
                if (isParentalOn()) {
                    const ok = await askPin();
                    if (!ok) return;
                }
                const cid = String(chip.dataset.cid);
                let list = getBlockedCats(type);
                if (list.includes(cid)) {
                    list = list.filter(x => x !== cid);
                    chip.classList.remove('blocked');
                    chip.querySelector('.chip-icon').className = 'fas fa-unlock chip-icon';
                } else {
                    list.push(cid);
                    chip.classList.add('blocked');
                    chip.querySelector('.chip-icon').className = 'fas fa-lock chip-icon';
                }
                setBlockedCats(type, list);
                toast('Categorias atualizadas', 'success');
            };
        });
    }

    /* ============ PLAYER ============ */
    function openPlayerUI(name, url, type, id) {
        stopPlayer();
        const saved = getProgressFor(id);
        const ov = document.createElement('div');
        ov.className = 'player-overlay';
        ov.id = 'playerOverlay';
        ov.innerHTML = `<div class="player-topbar">
                <button class="btn-back" id="btnBack"><i class="fas fa-arrow-left"></i> Voltar</button>
                <div class="player-ch-name">${esc(name)}</div>
                <div class="player-actions">
                    <button class="btn-cast" id="btnCast" title="Transmitir para TV"><i class="fas fa-tv"></i></button>
                    <button class="btn-fav-player ${isFav(type, id) ? 'is-fav' : ''}" id="btnFavP"><i class="fas fa-heart"></i></button>
                    <button id="btnFS"><i class="fas fa-expand"></i></button>
                </div>
            </div>
            <div class="player-wrapper">
                <div class="player-loader" id="playerLoader"><div class="loader-spinner"><div></div><div></div><div></div><div></div></div><span class="loader-text">Carregando...</span></div>
                <video id="videoPlayer" autoplay playsinline webkit-playsinline></video>
            </div>
            ${type === 'series' ? '<button class="btn-skip-intro" id="btnSkipIntro" style="display:none"><i class="fas fa-forward"></i> Pular Abertura</button>' : ''}
            <div class="player-controls" id="playerControls">
                ${type !== 'live' ? `<div class="seek-bar-wrap" id="seekBarWrap">
                    <div class="seek-bar-bg">
                        <div class="seek-bar-buffered" id="seekBuffered"></div>
                        <div class="seek-bar-fill" id="seekFill"></div>
                    </div>
                    <input type="range" class="seek-bar-input" id="seekInput" min="0" max="1000" value="0">
                </div>` : ''}
                <div class="player-ctrl-row">
                    <div class="ctrl-left">
                        ${type !== 'live' ? `<span class="ctrl-time" id="ctrlTimeCurrent">0:00</span>
                        <span class="ctrl-sep">/</span>
                        <span class="ctrl-time" id="ctrlTimeDuration">0:00</span>` : `<span class="ctrl-live-badge"><span class="ctrl-live-dot"></span> AO VIVO</span>`}
                    </div>
                    <div class="ctrl-center">
                        ${type !== 'live' ? '<button class="ctrl-btn" id="btnRew"><i class="fas fa-backward"></i> 10s</button>' : ''}
                        <button class="ctrl-btn ctrl-btn-play" id="btnPlayPause"><i class="fas fa-pause"></i></button>
                        ${type !== 'live' ? '<button class="ctrl-btn" id="btnFwd">10s <i class="fas fa-forward"></i></button>' : ''}
                    </div>
                    <div class="ctrl-right">
                        <div class="vol-wrap" id="volWrap">
                            <button class="ctrl-btn ctrl-btn-vol" id="btnMute"><i class="fas fa-volume-up"></i></button>
                            <div class="vol-slider-wrap" id="volSliderWrap">
                                <div class="vol-slider-track">
                                    <div class="vol-slider-fill" id="volFill" style="width:100%"></div>
                                </div>
                                <input type="range" class="vol-slider-input" id="volInput" min="0" max="100" value="100">
                            </div>
                        </div>
                        ${type !== 'live' ? '<button class="ctrl-btn ctrl-btn-sm" id="btnSpeed">1x</button>' : ''}
                        ${type === 'live' ? '<button class="ctrl-btn ctrl-btn-sm" id="btnQuality" title="Qualidade"><i class="fas fa-cog"></i> Auto</button>' : ''}
                        ${type === 'live' ? '<button class="ctrl-btn ctrl-btn-epg" id="btnEpgPlayer"><i class="fas fa-calendar-alt"></i> EPG</button>' : ''}
                    </div>
                </div>
            </div>
            ${type === 'live' ? '<div class="player-epg-panel" id="playerEpgPanel" style="display:none"><div class="player-epg-header"><h4><i class="fas fa-calendar-alt"></i> Programa\u00e7\u00e3o</h4><button class="player-epg-close" id="btnEpgClose"><i class="fas fa-times"></i></button></div><div class="player-epg-list" id="playerEpgList"><div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando...</div></div></div>' : ''}
            <div class="now-bar ${type !== 'live' ? 'now-bar-vod' : ''}">
                <div class="now-info"><h4>${esc(name)}</h4><p>${type === 'live' ? 'Ao Vivo' : type === 'vod' ? 'Filme' : 'Série'}</p></div>
                <div class="now-status"><span class="now-dot"></span> Reproduzindo</div>
            </div>
            ${saved ? `<div class="resume-dialog" id="resumeDialog">
                <div class="resume-content">
                    <p>Continuar de <strong>${fmtTime(saved.t)}</strong>?</p>
                    <div class="resume-progress-bar"><div class="resume-progress-fill" style="width:${Math.round((saved.t / saved.d) * 100)}%"></div></div>
                    <div class="resume-btns">
                        <button class="resume-btn resume-btn-yes" id="btnResume"><i class="fas fa-play"></i> Continuar</button>
                        <button class="resume-btn resume-btn-no" id="btnRestart"><i class="fas fa-redo"></i> Recomeçar</button>
                    </div>
                </div>
            </div>` : ''}`;
        document.body.appendChild(ov);
        const video = $$('videoPlayer');
        const loader = $$('playerLoader');

        // Show/hide loader on buffering
        video.addEventListener('waiting', () => { if (loader) loader.style.display = 'flex'; });
        video.addEventListener('seeking', () => { if (loader) loader.style.display = 'flex'; });
        video.addEventListener('playing', () => { if (loader) loader.style.display = 'none'; });
        video.addEventListener('seeked', () => { if (!video.paused && loader) loader.style.display = 'none'; });
        video.addEventListener('canplay', () => { if (!video.paused && loader) loader.style.display = 'none'; });

        const isTsDirect = type === 'live' && url.includes('.ts');
        const isHLS = type === 'live' && !isTsDirect;
        if (isTsDirect) {
            // Direct TS stream — server only supports ts format
            console.log('[Player] TS direto - inciando reproducção');
            video.src = url;
            video.play().catch(() => {});
            video.onerror = () => toast('Erro na reprodução do canal', 'error');
        } else if (isHLS) {
            let _hlsFailed = false;
            const _tsUrl = url.replace('.m3u8', '.ts');
            function _tryTS() {
                if (_hlsFailed) return;
                _hlsFailed = true;
                // M3u8 falhou, tentando .ts direto
                if (S.hls) { try { S.hls.destroy(); } catch {} S.hls = null; }
                video.src = _tsUrl;
                video.play().catch(() => {});
                video.onerror = () => toast('Erro na reprodução do canal', 'error');
            }
            if (Hls.isSupported()) {
                const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, enableWorker: true, lowLatencyMode: true, xhrSetup: x => { x.timeout = 20000; } });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
                hls.on(Hls.Events.ERROR, (_, d) => {
                    if (d.fatal) {
                        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            // Fallback para .ts se m3u8 falhar
                            hls.destroy();
                            _tryTS();
                        }
                        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                        else { hls.destroy(); _tryTS(); }
                    }
                });
                S.hls = hls;
                // HLS Quality selector
                const btnQuality = $$('btnQuality');
                if (btnQuality) {
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        const levels = hls.levels;
                        if (!levels || levels.length <= 1) { btnQuality.style.display = 'none'; return; }
                        let qIdx = -1; // -1 = Auto
                        btnQuality.onclick = () => {
                            qIdx++;
                            if (qIdx >= levels.length) qIdx = -1;
                            hls.currentLevel = qIdx;
                            if (qIdx === -1) {
                                btnQuality.innerHTML = '<i class="fas fa-cog"></i> Auto';
                            } else {
                                const h = levels[qIdx].height;
                                const label = h >= 1080 ? 'FHD' : h >= 720 ? 'HD' : h >= 480 ? 'SD' : h + 'p';
                                btnQuality.innerHTML = '<i class="fas fa-cog"></i> ' + label;
                            }
                        };
                    });
                }
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.onerror = () => _tryTS();
                video.play().catch(() => {});
            } else {
                // Navegador sem HLS, tentar .ts direto
                _tryTS();
            }
        } else {
            // VOD/Series — direct mp4/mkv playback through proxy
            video.src = url;
            video.play().catch(() => {});
            video.onerror = () => toast('Erro ao carregar vídeo', 'error');
        }
        S.playing = true;
        S._playerId = id;
        S._playerType = type;

        // Resume dialog
        if (saved) {
            video.pause();
            const dialog = $$('resumeDialog');
            $$('btnResume').onclick = () => {
                dialog.remove();
                video.currentTime = saved.t;
                video.play().catch(() => {});
            };
            $$('btnRestart').onclick = () => {
                dialog.remove();
                clearProgress(id);
                video.currentTime = 0;
                video.play().catch(() => {});
            };
            // Auto-dismiss after 8 seconds (resume by default)
            setTimeout(() => {
                if (dialog.parentNode) {
                    dialog.remove();
                    video.currentTime = saved.t;
                    video.play().catch(() => {});
                }
            }, 8000);
        }

        // Progress saving (every 5 seconds for VOD/Series)
        if (type !== 'live') {
            let progInterval = setInterval(() => {
                if (!S.playing || !video.duration) return;
                saveProgress(id, video.currentTime, video.duration);
            }, 5000);
            video.addEventListener('pause', () => {
                if (video.duration) saveProgress(id, video.currentTime, video.duration);
            });
            S._progInterval = progInterval;
        }

        // Skip Intro button (series only)
        if (type === 'series') {
            const btnSkip = $$('btnSkipIntro');
            let skipShown = false, skipHideTimer = null;
            const checkSkip = () => {
                if (!btnSkip) return;
                const t = video.currentTime;
                if (t >= 10 && t <= 120 && !skipShown) {
                    skipShown = true;
                    btnSkip.style.display = 'flex';
                    skipHideTimer = setTimeout(() => { btnSkip.style.display = 'none'; }, 8000);
                }
            };
            video.addEventListener('timeupdate', checkSkip);
            btnSkip?.addEventListener('click', () => {
                video.currentTime = Math.min(video.currentTime + 80, video.duration - 10);
                btnSkip.style.display = 'none';
                clearTimeout(skipHideTimer);
            });
        }

        // ===== PLAY/PAUSE FOR ALL TYPES =====
        const btnPlayPause = $$('btnPlayPause');
        if (btnPlayPause) {
            btnPlayPause.onclick = () => {
                if (video.paused) { video.play(); btnPlayPause.innerHTML = '<i class="fas fa-pause"></i>'; }
                else { video.pause(); btnPlayPause.innerHTML = '<i class="fas fa-play"></i>'; }
            };
            video.addEventListener('play', () => { btnPlayPause.innerHTML = '<i class="fas fa-pause"></i>'; });
            video.addEventListener('pause', () => { btnPlayPause.innerHTML = '<i class="fas fa-play"></i>'; });
        }

        // ===== VOLUME CONTROL =====
        const btnMute = $$('btnMute');
        const volInput = $$('volInput');
        const volFill = $$('volFill');
        let savedVol = parseFloat(localStorage.getItem('lumotv_vol') ?? '1');
        video.volume = savedVol;
        if (volInput) volInput.value = savedVol * 100;
        if (volFill) volFill.style.width = (savedVol * 100) + '%';
        function updateVolIcon() {
            if (!btnMute) return;
            const v = video.muted ? 0 : video.volume;
            if (v === 0) btnMute.innerHTML = '<i class="fas fa-volume-mute"></i>';
            else if (v < 0.4) btnMute.innerHTML = '<i class="fas fa-volume-down"></i>';
            else btnMute.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
        updateVolIcon();
        if (btnMute) {
            btnMute.onclick = () => {
                video.muted = !video.muted;
                if (!video.muted && video.volume === 0) { video.volume = 0.5; if (volInput) volInput.value = 50; if (volFill) volFill.style.width = '50%'; }
                if (volInput) volInput.value = video.muted ? 0 : video.volume * 100;
                if (volFill) volFill.style.width = (video.muted ? 0 : video.volume * 100) + '%';
                updateVolIcon();
            };
        }
        if (volInput) {
            volInput.addEventListener('input', () => {
                const val = volInput.value / 100;
                video.volume = val;
                video.muted = val === 0;
                if (volFill) volFill.style.width = volInput.value + '%';
                localStorage.setItem('lumotv_vol', val);
                updateVolIcon();
            });
        }
        video.addEventListener('volumechange', () => {
            const v = video.muted ? 0 : video.volume;
            if (volInput && !volInput.matches(':active')) volInput.value = v * 100;
            if (volFill) volFill.style.width = (v * 100) + '%';
            updateVolIcon();
        });

        // ===== PLAYER CONTROLS (seek bar, rew, fwd, speed) — VOD/SERIES ONLY =====
        if (type !== 'live') {
            const seekInput = $$('seekInput');
            const seekFill = $$('seekFill');
            const seekBuffered = $$('seekBuffered');
            const timeCur = $$('ctrlTimeCurrent');
            const timeDur = $$('ctrlTimeDuration');
            const btnRew = $$('btnRew');
            const btnFwd = $$('btnFwd');
            const btnSpeed = $$('btnSpeed');
            let seeking = false;
            const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
            let speedIdx = 2;

            function updateSeek() {
                if (seeking || !video.duration) return;
                const pct = (video.currentTime / video.duration) * 1000;
                seekInput.value = pct;
                seekFill.style.width = (pct / 10) + '%';
                timeCur.textContent = fmtTime(video.currentTime);
            }

            video.addEventListener('timeupdate', updateSeek);
            video.addEventListener('loadedmetadata', () => {
                timeDur.textContent = fmtTime(video.duration);
            });
            video.addEventListener('durationchange', () => {
                if (video.duration && isFinite(video.duration)) timeDur.textContent = fmtTime(video.duration);
            });
            video.addEventListener('progress', () => {
                if (!video.duration || !video.buffered.length) return;
                const end = video.buffered.end(video.buffered.length - 1);
                seekBuffered.style.width = ((end / video.duration) * 100) + '%';
            });

            seekInput.addEventListener('input', () => {
                seeking = true;
                const pct = seekInput.value / 1000;
                seekFill.style.width = (pct * 100) + '%';
                if (video.duration) timeCur.textContent = fmtTime(pct * video.duration);
            });
            seekInput.addEventListener('change', () => {
                if (video.duration) video.currentTime = (seekInput.value / 1000) * video.duration;
                seeking = false;
            });

            btnRew.onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); };
            btnFwd.onclick = () => { if (video.duration) video.currentTime = Math.min(video.duration, video.currentTime + 10); };

            btnSpeed.onclick = () => {
                speedIdx = (speedIdx + 1) % speeds.length;
                video.playbackRate = speeds[speedIdx];
                btnSpeed.textContent = speeds[speedIdx] + 'x';
            };
        }

        // ===== EPG PANEL FOR LIVE CHANNELS =====
        if (type === 'live') {
            const btnEpg = $$('btnEpgPlayer');
            const epgPanel = $$('playerEpgPanel');
            const epgList = $$('playerEpgList');
            const btnEpgClose = $$('btnEpgClose');
            let epgLoaded = false;

            if (btnEpg && epgPanel) {
                btnEpg.onclick = async () => {
                    if (epgPanel.style.display === 'none' || !epgPanel.style.display) {
                        epgPanel.style.display = 'flex';
                        if (!epgLoaded) {
                            epgLoaded = true;
                            try {
                                const data = await API.shortEpg(cred, id);
                                const programmes = data?.epg_listings || [];
                                if (!programmes.length) {
                                    epgList.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fas fa-calendar-alt"></i><p>Sem programa\u00e7\u00e3o dispon\u00edvel</p></div>';
                                } else {
                                    const now = Math.floor(Date.now() / 1000);
                                    epgList.innerHTML = programmes.map(p => {
                                        const title = p.title ? decodeB64(p.title) : 'Sem t\u00edtulo';
                                        const desc = p.description ? decodeB64(p.description) : '';
                                        const start = p.start || p.start_timestamp || '';
                                        const end = p.end || p.stop_timestamp || '';
                                        let timeStr = '';
                                        if (p.start_timestamp && p.stop_timestamp) {
                                            const sd = new Date(+p.start_timestamp * 1000);
                                            const ed = new Date(+p.stop_timestamp * 1000);
                                            timeStr = sd.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) + ' - ' + ed.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
                                        } else if (start) {
                                            timeStr = start.substring(0, 16).replace(' ', ' \u00e0s ');
                                        }
                                        const isNow = p.start_timestamp && p.stop_timestamp && +p.start_timestamp <= now && +p.stop_timestamp > now;
                                        return `<div class="player-epg-item ${isNow ? 'epg-now' : ''}">
                                            <div class="epg-item-time">${esc(timeStr)}</div>
                                            <div class="epg-item-info">
                                                <div class="epg-item-title">${isNow ? '<span class="epg-now-badge">AGORA</span> ' : ''}${esc(title)}</div>
                                                ${desc ? '<div class="epg-item-desc">' + esc(desc.substring(0, 150)) + (desc.length > 150 ? '...' : '') + '</div>' : ''}
                                            </div>
                                        </div>`;
                                    }).join('');
                                }
                            } catch { epgList.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar EPG</p></div>'; }
                        }
                    } else {
                        epgPanel.style.display = 'none';
                    }
                };
                btnEpgClose.onclick = () => { epgPanel.style.display = 'none'; };
            }
        }

        // Controls events on controls bar
        const controls = $$('playerControls');
        if (controls) {
            controls.addEventListener('mousemove', e => e.stopPropagation());
            controls.addEventListener('touchstart', e => e.stopPropagation());
        }
        // AUTO FULLSCREEN on open
        setTimeout(() => {
            try {
                // Lock orientation to landscape before fullscreen
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
                if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
                else if (ov.webkitRequestFullscreen) ov.webkitRequestFullscreen();
                else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
                else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
            } catch {}
        }, 300);
        // Controls auto-hide
        let ht;
        function showCtrl() {
            const topbar = ov.querySelector('.player-topbar');
            const nowbar = ov.querySelector('.now-bar');
            const ctrlbar = ov.querySelector('.player-controls');
            if (topbar) topbar.style.opacity = '1';
            if (nowbar) nowbar.style.opacity = '1';
            if (ctrlbar) ctrlbar.style.opacity = '1';
            clearTimeout(ht);
            ht = setTimeout(() => {
                if (S.playing) {
                    if (topbar) topbar.style.opacity = '0';
                    if (nowbar) nowbar.style.opacity = '0';
                    if (ctrlbar) ctrlbar.style.opacity = '0';
                }
            }, 4000);
        }
        ov.addEventListener('mousemove', showCtrl);
        ov.addEventListener('touchstart', showCtrl);
        showCtrl();
        $$('btnBack').onclick = closePlayer;
        $$('btnFS').onclick = () => {
            try {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                } else if (ov.requestFullscreen) {
                    ov.requestFullscreen().catch(() => {});
                } else if (ov.webkitRequestFullscreen) {
                    ov.webkitRequestFullscreen();
                } else if (video.webkitEnterFullscreen) {
                    video.webkitEnterFullscreen();
                }
            } catch {}
        };
        $$('btnFavP').onclick = e => { const a = toggleFav(type, id, name); e.currentTarget.classList.toggle('is-fav', a); };

        // ===== CAST / TRANSMITIR PARA TV =====
        const btnCast = $$('btnCast');
        if (btnCast) {
            let castActive = false;
            if (video.remote) {
                video.remote.watchAvailability(available => {
                    btnCast.style.opacity = available ? '1' : '0.5';
                }).catch(() => {});
                video.remote.addEventListener('connecting', () => {
                    btnCast.classList.add('cast-connecting');
                    btnCast.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    toast('Conectando à TV...', 'info');
                });
                video.remote.addEventListener('connect', () => {
                    castActive = true;
                    btnCast.classList.remove('cast-connecting');
                    btnCast.classList.add('cast-active');
                    btnCast.innerHTML = '<i class="fas fa-tv"></i>';
                    toast('Transmitindo para TV', 'success');
                });
                video.remote.addEventListener('disconnect', () => {
                    castActive = false;
                    btnCast.classList.remove('cast-active', 'cast-connecting');
                    btnCast.innerHTML = '<i class="fas fa-tv"></i>';
                    toast('Transmissão encerrada', 'info');
                });
            }
            btnCast.onclick = async () => {
                if (video.remote) {
                    try {
                        await video.remote.prompt();
                        return;
                    } catch (e) { /* user cancelled or not supported */ }
                }
                if (window.PresentationRequest) {
                    try {
                        const presReq = new PresentationRequest([url]);
                        const conn = await presReq.start();
                        castActive = true;
                        btnCast.classList.add('cast-active');
                        toast('Transmitindo via apresentação', 'success');
                        conn.addEventListener('close', () => {
                            castActive = false;
                            btnCast.classList.remove('cast-active');
                            toast('Apresentação encerrada', 'info');
                        });
                        return;
                    } catch { }
                }
                if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
                    try {
                        if (document.pictureInPictureElement) {
                            await document.exitPictureInPicture();
                            btnCast.classList.remove('cast-active');
                        } else {
                            await video.requestPictureInPicture();
                            btnCast.classList.add('cast-active');
                            toast('Picture-in-Picture ativado', 'success');
                            video.addEventListener('leavepictureinpicture', () => { btnCast.classList.remove('cast-active'); }, { once: true });
                        }
                        return;
                    } catch { }
                }
                toast('Nenhum dispositivo encontrado. Verifique se Chromecast/AirPlay está na mesma rede Wi-Fi.', 'error');
            };
        }
        const escH = e => {
            if (e.key === 'Escape') { if (document.fullscreenElement) document.exitFullscreen(); closePlayer(); document.removeEventListener('keydown', escH); }
            if (e.key === 'ArrowUp') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); }
            if (e.key === 'm' || e.key === 'M') { video.muted = !video.muted; }
            if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
            if (e.key === 'ArrowLeft' && type !== 'live') { video.currentTime = Math.max(0, video.currentTime - 10); }
            if (e.key === 'ArrowRight' && type !== 'live') { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); }
        };
        document.addEventListener('keydown', escH);
        // Exit fullscreen → close player (and restore TV preview if applicable)
        const fsEventName = 'onfullscreenchange' in document ? 'fullscreenchange' : 'webkitfullscreenchange';
        document.addEventListener(fsEventName, function fsHandler() {
            if (!(document.fullscreenElement || document.webkitFullscreenElement) && S.playing) {
                const tvLayout = $$('tvLayout');
                const isDesktopTv = tvLayout && tvLayout.style.display !== 'none' && type === 'live' && _tvCurrentCh;
                closePlayer();
                document.removeEventListener(fsEventName, fsHandler);
                // Restart the TV preview for the channel that was playing
                if (isDesktopTv && _tvCurrentCh) {
                    setTimeout(() => tvStartPreview(_tvCurrentCh), 200);
                }
            }
        });
    }
    function stopPlayer() {
        if (S.hls) { S.hls.destroy(); S.hls = null; }
        if (S._progInterval) { clearInterval(S._progInterval); S._progInterval = null; }
        const v = document.getElementById('videoPlayer');
        if (v && v.duration && S._playerId) {
            saveProgress(S._playerId, v.currentTime, v.duration);
        }
        if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
        S.playing = false;
        S._playerId = null;
        S._playerType = null;
    }
    function closePlayer() { stopPlayer(); document.getElementById('playerOverlay')?.remove(); }

    function playLive(ch) {
        addHist({ id: 'l_' + ch.stream_id, name: ch.name, type: 'live', stream_id: ch.stream_id, poster: ch.stream_icon || '' });
        // Mobile: mostra modal com info/guia/lista. Desktop: abre fullscreen direto
        const isMobile = window.innerWidth <= 900 || /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            openChannelModal(ch);
        } else {
            openPlayerUI(ch.name, API.liveUrl(cred, ch.stream_id), 'live', ch.stream_id);
        }
    }
    window._playLive = id => {
        const ch = S.live.find(c => c.stream_id == id);
        if (ch) playLive(ch);
        else {
            // Fallback — create minimal ch object
            const isMobile = window.innerWidth <= 900 || /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (isMobile) {
                openChannelModal({ stream_id: id, name: 'Canal ' + id, category_name: '', stream_icon: '', category_id: '' });
            } else {
                openPlayerUI('Canal ' + id, API.liveUrl(cred, id), 'live', id);
            }
        }
    };

    /* ============ CHANNEL MODAL ============ */
    let _chModalHls = null;
    let _chModalCh = null;

    function openChannelModal(ch) {
        _chModalCh = ch;
        const modal = $$('channelModal');
        if (!modal) { openPlayerUI(ch.name, API.liveUrl(cred, ch.stream_id), 'live', ch.stream_id); return; }

        // Stop any existing player/modal
        closeChannelModal(true);

        modal.style.display = 'flex';
        modal.classList.add('ch-modal-open');
        document.body.classList.add('channel-modal-open');
        document.body.style.overflow = 'hidden';

        // Set channel info
        const logoEl = $$('chModalLogo');
        if (ch.stream_icon) {
            logoEl.innerHTML = `<img src="${esc(ch.stream_icon)}" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">`;
        } else {
            logoEl.innerHTML = '<i class="fas fa-tv"></i>';
        }
        $$('chModalName').textContent = ch.name || '—';
        $$('chModalCat').textContent = ch.category_name || 'Ao Vivo';

        // Fav button
        const favBtn = $$('chModalFav');
        const isFaved = isFav('live', ch.stream_id);
        favBtn.classList.toggle('is-fav', isFaved);
        favBtn.innerHTML = isFaved ? '<i class="fas fa-heart"></i>' : '<i class="fas fa-plus"></i>';
        favBtn.onclick = (e) => {
            e.stopPropagation();
            const a = toggleFav('live', ch.stream_id, ch.name, { category_name: ch.category_name, stream_icon: ch.stream_icon });
            favBtn.classList.toggle('is-fav', a);
            favBtn.innerHTML = a ? '<i class="fas fa-heart"></i>' : '<i class="fas fa-plus"></i>';
            toast(a ? 'Favorito adicionado' : 'Favorito removido', a ? 'success' : 'info');
        };

        // Reset tabs
        modal.querySelectorAll('.ch-modal-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.ch-modal-tab-content').forEach(t => t.classList.remove('active'));
        modal.querySelector('.ch-modal-tab[data-tab="info"]').classList.add('active');
        $$('chTabInfo').classList.add('active');

        // Start video playback
        chModalStartVideo(ch);

        // Load info tab (current EPG)
        chModalLoadInfo(ch);

        // Tab clicks
        modal.querySelectorAll('.ch-modal-tab').forEach(tab => {
            tab.onclick = (e) => {
                e.stopPropagation();
                modal.querySelectorAll('.ch-modal-tab').forEach(t => t.classList.remove('active'));
                modal.querySelectorAll('.ch-modal-tab-content').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                if (tabId === 'info') $$('chTabInfo').classList.add('active');
                else if (tabId === 'epg') { $$('chTabEpg').classList.add('active'); chModalLoadEpg(ch); }
                else if (tabId === 'channels') { $$('chTabChannels').classList.add('active'); chModalLoadChannels(ch); }
            };
        });

        // Close button — onclick + touchend fallback for iOS
        const closeBtn = $$('chModalClose');
        if (closeBtn) {
            closeBtn.onclick = (e) => { e.stopPropagation(); closeChannelModal(); };
            closeBtn.ontouchend = (e) => { e.preventDefault(); e.stopPropagation(); closeChannelModal(); };
        }

        // Click outside to close (mas NÃO em filhos)
        modal.onclick = e => { if (e.target === modal || e.target.classList.contains('modal-overlay')) closeChannelModal(); };

        // Update EPG mobile section
        updateEpgMobile(ch);
    }

    function chModalStartVideo(ch) {
        const video = $$('chModalVideo');
        const loader = $$('chModalLoader');
        if (!video) return;

        const url = API.liveUrl(cred, ch.stream_id);
        const isTsDirect = url.includes('.ts');

        video.addEventListener('waiting', () => { if (loader) loader.style.display = 'flex'; });
        video.addEventListener('playing', () => { if (loader) loader.style.display = 'none'; });
        video.addEventListener('canplay', () => { if (!video.paused && loader) loader.style.display = 'none'; });

        if (isTsDirect) {
            video.src = url;
            video.play().catch(() => {});
        } else {
            let _failed = false;
            const _tsUrl = url.replace('.m3u8', '.ts');
            function _tryTS() {
                if (_failed) return; _failed = true;
                if (_chModalHls) { try { _chModalHls.destroy(); } catch {} _chModalHls = null; }
                video.src = _tsUrl;
                video.play().catch(() => {});
            }
            if (Hls.isSupported()) {
                const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, enableWorker: true, lowLatencyMode: true, xhrSetup: x => { x.timeout = 20000; } });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
                hls.on(Hls.Events.ERROR, (_, d) => {
                    if (d.fatal) {
                        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.destroy(); _tryTS(); }
                        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                        else { hls.destroy(); _tryTS(); }
                    }
                });
                _chModalHls = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.onerror = () => _tryTS();
                video.play().catch(() => {});
            } else {
                _tryTS();
            }
        }

        // Play/Pause
        const btnPP = $$('chModalPlayPause');
        if (btnPP) {
            const ppHandler = (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (video.paused) { video.play(); btnPP.innerHTML = '<i class="fas fa-pause"></i>'; }
                else { video.pause(); btnPP.innerHTML = '<i class="fas fa-play"></i>'; }
            };
            btnPP.onclick = ppHandler;
            btnPP.ontouchend = (e) => { e.preventDefault(); ppHandler(e); };
            video.addEventListener('play', () => { btnPP.innerHTML = '<i class="fas fa-pause"></i>'; });
            video.addEventListener('pause', () => { btnPP.innerHTML = '<i class="fas fa-play"></i>'; });
        }

        // Mute
        const btnMute = $$('chModalMute');
        if (btnMute) {
            let vol = parseFloat(localStorage.getItem('lumotv_vol') ?? '1');
            video.volume = vol;
            const muteHandler = (e) => {
                e.stopPropagation();
                e.preventDefault();
                video.muted = !video.muted;
                btnMute.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            };
            btnMute.onclick = muteHandler;
            btnMute.ontouchend = (e) => { e.preventDefault(); muteHandler(e); };
        }

        // Fullscreen / Expand button
        const btnFS = $$('chModalFullscreen');
        if (btnFS) {
            const fsHandler = (e) => {
                e.stopPropagation();
                e.preventDefault();
                // Use only the player container for fullscreen
                const playerContainer = $$('chModalPlayer');
                try {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                        if (screen.orientation && screen.orientation.unlock) {
                            screen.orientation.unlock().catch(() => {});
                        }
                    } else {
                        // Lock orientation to landscape before fullscreen
                        if (screen.orientation && screen.orientation.lock) {
                            screen.orientation.lock('landscape').catch(() => {});
                        }
                        if (playerContainer && playerContainer.requestFullscreen) {
                            playerContainer.requestFullscreen().catch(() => {});
                        } else if (playerContainer && playerContainer.webkitRequestFullscreen) {
                            playerContainer.webkitRequestFullscreen();
                        } else if (video.requestFullscreen) {
                            video.requestFullscreen().catch(() => {});
                        } else if (video.webkitEnterFullscreen) {
                            // iOS Safari fallback — only works on video element
                            video.webkitEnterFullscreen();
                        } else if (video.webkitRequestFullscreen) {
                            video.webkitRequestFullscreen();
                        }
                    }
                } catch {}
            };
            btnFS.onclick = fsHandler;
            btnFS.ontouchend = (e) => { e.preventDefault(); fsHandler(e); };

            // Update icon on fullscreen change
            const fsChange = () => {
                if (document.fullscreenElement) {
                    btnFS.innerHTML = '<i class="fas fa-compress"></i>';
                } else {
                    btnFS.innerHTML = '<i class="fas fa-expand"></i>';
                }
            };
            document.addEventListener('fullscreenchange', fsChange);
            document.addEventListener('webkitfullscreenchange', fsChange);
        }
    }

    async function chModalLoadInfo(ch) {
        const titleEl = $$('chModalNowTitle');
        const descEl = $$('chModalNowDesc');
        const timeEl = $$('chModalNowTime');
        titleEl.textContent = 'Carregando programação...';
        descEl.textContent = '';
        timeEl.textContent = '';
        try {
            const data = await API.shortEpg(cred, ch.stream_id);
            const progs = data?.epg_listings || [];
            if (!progs.length) {
                titleEl.textContent = ch.name;
                descEl.textContent = 'Programação não disponível para este canal.';
                return;
            }
            const now = Math.floor(Date.now() / 1000);
            const current = progs.find(p => +p.start_timestamp <= now && +p.stop_timestamp > now);
            if (current) {
                let title = 'Sem título'; try { title = decodeB64(current.title); } catch {}
                let desc = ''; try { desc = decodeB64(current.description); } catch {}
                const sd = new Date(+current.start_timestamp * 1000);
                const ed = new Date(+current.stop_timestamp * 1000);
                const fmt = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                titleEl.textContent = title;
                descEl.textContent = desc || '';
                timeEl.innerHTML = `<i class="fas fa-clock"></i> ${fmt(sd)} — ${fmt(ed)}`;
            } else {
                let title = 'Sem título'; try { title = decodeB64(progs[0].title); } catch {}
                titleEl.textContent = title;
                descEl.textContent = 'Próximo programa';
            }
        } catch {
            titleEl.textContent = ch.name;
            descEl.textContent = 'Erro ao carregar programação.';
        }
    }

    // Update EPG mobile section (below player on mobile)
    async function updateEpgMobile(ch) {
        const timeEl = $$('chModalEpgMobileTime');
        const titleEl = $$('chModalEpgMobileTitle');
        if (!timeEl || !titleEl) return;
        
        try {
            const data = await API.shortEpg(cred, ch.stream_id);
            const progs = data?.epg_listings || [];
            const now = Math.floor(Date.now() / 1000);
            const current = progs.find(p => +p.start_timestamp <= now && +p.stop_timestamp > now);
            
            if (current) {
                const start = new Date(+current.start_timestamp * 1000);
                const end = new Date(+current.stop_timestamp * 1000);
                const timeStr = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + 
                               end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                timeEl.textContent = timeStr;
                titleEl.textContent = decodeB64(current.title) || 'Sem informação';
            } else {
                timeEl.textContent = '--:--';
                titleEl.textContent = 'Sem programação';
            }
        } catch {
            timeEl.textContent = '--:--';
            titleEl.textContent = 'Sem programação';
        }
    }

    let _chEpgLoaded = false;
    let _chEpgAllProgs = [];
    let _chEpgPage = 0;
    const _EPG_DAYS_PER_PAGE = 2;

    async function chModalLoadEpg(ch) {
        _chEpgLoaded = false;  // Reset flag para novo canal
        _chEpgAllProgs = [];
        _chEpgPage = 0;
        const list = $$('chModalEpgList');
        list.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando guia...</div>';
        try {
            const data = await API.shortEpg(cred, ch.stream_id);
            const progs = data?.epg_listings || [];
            if (!progs.length) {
                list.innerHTML = '<div class="ch-modal-epg-empty">Sem programação disponível</div>';
                $$('chModalEpgPrev').style.display = 'none';
                $$('chModalEpgNext').style.display = 'none';
                return;
            }
            _chEpgAllProgs = progs;
            
            // Remover handlers antigos
            const prevBtn = $$('chModalEpgPrev');
            const nextBtn = $$('chModalEpgNext');
            if (prevBtn) {
                const newPrevBtn = prevBtn.cloneNode(true);
                prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
            }
            if (nextBtn) {
                const newNextBtn = nextBtn.cloneNode(true);
                nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            }
            
            _renderEpgPage();
            
            // Definir novos handlers
            $$('chModalEpgPrev').onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (_chEpgPage > 0) { _chEpgPage--; _renderEpgPage(); }
            };
            $$('chModalEpgNext').onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const totalDates = _getEpgDateKeys().length;
                const maxPage = Math.max(0, Math.ceil(totalDates / _EPG_DAYS_PER_PAGE) - 1);
                if (_chEpgPage < maxPage) { _chEpgPage++; _renderEpgPage(); }
            };
        } catch {
            list.innerHTML = '<div class="ch-modal-epg-empty">Erro ao carregar guia de TV</div>';
            $$('chModalEpgPrev').style.display = 'none';
            $$('chModalEpgNext').style.display = 'none';
        }
    }

    function _getEpgDateKeys() {
        const groups = {};
        _chEpgAllProgs.forEach(p => {
            const d = new Date((+p.start_timestamp || 0) * 1000);
            const key = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        return Object.keys(groups).map(k => ({ dateStr: k, progs: groups[k] }));
    }

    function _renderEpgPage() {
        const list = $$('chModalEpgList');
        const allDates = _getEpgDateKeys();
        const totalPages = Math.ceil(allDates.length / _EPG_DAYS_PER_PAGE);
        const start = _chEpgPage * _EPG_DAYS_PER_PAGE;
        const pageDates = allDates.slice(start, start + _EPG_DAYS_PER_PAGE);
        const now = Math.floor(Date.now() / 1000);

        // Show/hide nav buttons
        $$('chModalEpgPrev').style.display = _chEpgPage > 0 ? '' : 'none';
        $$('chModalEpgNext').style.display = _chEpgPage < totalPages - 1 ? '' : 'none';

        if (!pageDates.length) {
            list.innerHTML = '<div class="ch-modal-epg-empty">Sem programação neste período</div>';
            return;
        }

        list.innerHTML = '';
        pageDates.forEach(({ dateStr, progs }) => {
            const dateRow = document.createElement('div');
            dateRow.className = 'ch-modal-epg-date';
            dateRow.innerHTML = `<span>${dateStr}</span><i class="fas fa-chevron-down"></i>`;

            const progsWrap = document.createElement('div');
            progsWrap.className = 'ch-modal-epg-progs';
            progsWrap.style.display = 'none';

            progs.forEach(p => {
                let title = 'Sem título'; try { title = decodeB64(p.title); } catch {}
                let desc = ''; try { desc = decodeB64(p.description); } catch {}
                const isCurrent = +p.start_timestamp <= now && +p.stop_timestamp > now;
                const sd = new Date(+p.start_timestamp * 1000);
                const timeStr = sd.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const item = document.createElement('div');
                item.className = 'ch-modal-epg-item' + (isCurrent ? ' epg-current' : '');
                item.innerHTML = `<span class="ch-modal-epg-time">${timeStr}</span>
                    <div>
                        <div class="ch-modal-epg-title">${isCurrent ? '<span class="ch-modal-epg-now-badge">AGORA</span>' : ''}${esc(title)}</div>
                        ${desc ? `<div class="ch-modal-epg-desc">${esc(desc.substring(0, 200))}</div>` : ''}
                    </div>`;
                progsWrap.appendChild(item);
            });

            // Check if any current program — auto-expand that date
            const hasCurrent = progs.some(p => +p.start_timestamp <= now && +p.stop_timestamp > now);
            if (hasCurrent) {
                progsWrap.style.display = '';
                dateRow.classList.add('expanded');
            }

            dateRow.onclick = () => {
                const visible = progsWrap.style.display !== 'none';
                progsWrap.style.display = visible ? 'none' : '';
                dateRow.classList.toggle('expanded', !visible);
            };

            list.appendChild(dateRow);
            list.appendChild(progsWrap);
        });
    }

    let _chChannelsLoaded = false;
    async function chModalLoadChannels(currentCh) {
        if (_chChannelsLoaded) return;
        _chChannelsLoaded = true;
        const list = $$('chModalChList');
        list.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando canais...</div>';
        try {
            if (!S.live.length) S.live = await API.liveStreams(cred);
            // Get channels in the same category
            const sameCat = currentCh.category_id
                ? S.live.filter(c => c.category_id == currentCh.category_id)
                : S.live.slice(0, 50);
            renderChModalList(sameCat, currentCh);
        } catch {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Erro ao carregar canais</div>';
        }
        // Search
        $$('chModalChSearch')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            let items = currentCh.category_id
                ? S.live.filter(c => c.category_id == currentCh.category_id)
                : S.live.slice(0, 100);
            if (q) items = items.filter(c => (c.name || '').toLowerCase().includes(q));
            renderChModalList(items, currentCh);
        });
    }

    function renderChModalList(channels, currentCh) {
        const list = $$('chModalChList');
        if (!channels.length) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Nenhum canal encontrado</div>';
            return;
        }
        const frag = document.createDocumentFragment();
        channels.forEach(ch => {
            const item = document.createElement('div');
            item.className = 'ch-modal-ch-item' + (ch.stream_id == currentCh.stream_id ? ' active' : '');
            const logo = ch.stream_icon
                ? `<img src="${esc(ch.stream_icon)}" loading="lazy" onerror="this.outerHTML='<i class=\\'fas fa-tv\\'></i>'">`
                : '<i class="fas fa-tv"></i>';
            item.innerHTML = `
                <div class="ch-modal-ch-item-logo">${logo}</div>
                <div class="ch-modal-ch-item-info">
                    <div class="ch-modal-ch-item-name">${esc(ch.name)}</div>
                    <div class="ch-modal-ch-item-cat">${esc(ch.category_name || '')}</div>
                </div>
                <div class="ch-modal-ch-item-play"><i class="fas fa-play"></i></div>`;
            item.onclick = () => {
                // Switch channel inside modal
                closeChannelModal(true);
                openChannelModal(ch);
                addHist({ id: 'l_' + ch.stream_id, name: ch.name, type: 'live', stream_id: ch.stream_id, poster: ch.stream_icon || '' });
            };
            frag.appendChild(item);
        });
        list.innerHTML = '';
        list.appendChild(frag);
    }

    function closeChannelModal(silent) {
        // Stop modal video
        if (_chModalHls) { try { _chModalHls.destroy(); } catch {} _chModalHls = null; }
        const video = $$('chModalVideo');
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
        _chEpgLoaded = false;
        _chEpgAllProgs = [];
        _chEpgPage = 0;
        _chChannelsLoaded = false;
        _chModalCh = null;
        // Exit fullscreen if active
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        if (!silent) {
            const modal = $$('channelModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('ch-modal-open');
            }
            document.body.classList.remove('channel-modal-open');
            document.body.style.overflow = '';
        }
    }
    function playVod(m) {
        const ext = m.container_extension || 'mp4';
        addHist({ id: 'v_' + m.stream_id, name: m.name, type: 'vod', stream_id: m.stream_id, container_extension: ext, poster: m.stream_icon || '' });
        playIntro(() => {
            openPlayerUI(m.name, API.vodUrl(cred, m.stream_id, ext), 'vod', m.stream_id);
        });
    }
    function playEp(epId, ext, name, poster) {
        addHist({ id: 'e_' + epId, name, type: 'series', episode_id: epId, poster: poster || '' });
        playIntro(() => {
            openPlayerUI(name, API.epUrl(cred, epId, ext || 'mp4'), 'series', epId);
        });
    }
    window._histPlay = json => {
        try {
            const h = JSON.parse(json);
            if (h.type === 'live') window._playLive(h.stream_id);
            else if (h.type === 'vod') { const m = S.vod.find(v => v.stream_id == h.stream_id); if (m) playVod(m); else openPlayerUI(h.name, API.vodUrl(cred, h.stream_id, h.container_extension || 'mp4'), 'vod', h.stream_id); }
            else if (h.type === 'series') openPlayerUI(h.name, API.epUrl(cred, h.episode_id, 'mp4'), 'series', h.episode_id);
        } catch {}
    };

    // ====== HISTORY API — Botão voltar do navegador / celular ======
    // Substitui a entrada atual para impedir que "voltar" vá para a tela de login
    history.replaceState({ wp: true }, '', window.location.href);
    // Empurra um estado extra como "buffer" — sempre terá algo pra voltar
    history.pushState({ wp: true }, '', window.location.href);

    window.addEventListener('popstate', () => {
        // 1. Se o player estiver aberto → fecha o player
        const playerOv = document.getElementById('playerOverlay');
        if (playerOv) {
            closePlayer();
            history.pushState({ wp: true }, '', window.location.href);
            return;
        }

        // 2. Se o modal de canal estiver aberto → fecha
        const chMod = document.getElementById('channelModal');
        if (chMod && chMod.style.display !== 'none' && chMod.classList.contains('ch-modal-open')) {
            closeChannelModal();
            history.pushState({ wp: true }, '', window.location.href);
            return;
        }

        // 3. Se modal de filme / série / pin estiver aberto → fecha
        for (const mid of ['movieModal', 'seriesModal', 'pinModal']) {
            const mel = document.getElementById(mid);
            if (mel && mel.style.display !== 'none') {
                const frame = mel.querySelector('iframe');
                if (frame) frame.src = '';
                closeModal(mid);
                history.pushState({ wp: true }, '', window.location.href);
                return;
            }
        }

        // 4. Se estiver em outra aba (não home) → voltar pra home
        if (S.sec !== 'home') {
            nav('home', true);
            history.pushState({ wp: true }, '', window.location.href);
            return;
        }

        // 5. Já está na home sem nada aberto → empurra estado pra não sair do app
        history.pushState({ wp: true }, '', window.location.href);
    });

    // Start
    nav('home', true);
}

/* ============================
   TV / SMART TV — D-PAD REMOTE NAVIGATION
   Samsung Tizen, LG webOS, Xbox, PlayStation, Fire TV
   ============================ */
(function initTVNav() {
    // Detect Smart TV by User-Agent
    if (/Tizen|WebOS|SMART-TV|SmartTV|Net[Cc]ast|BRAVIA|Xbox|PlayStation|AFTT|AFTM|CrKey|GoogleTV|AppleTV/i.test(navigator.userAgent)) {
        document.body.classList.add('tv-mode');
    }

    // All interactive selectors
    const SEL = [
        '.nav-item','.channel-card','.poster-card','.category-chip',
        '.h-card','.h-poster','.fav-tab','.season-tab','.episode-card-nf',
        '.epg-row','.blocked-cat-chip','.btn-load-more','.btn-play-modal',
        '.btn-fav-modal','.modal-close','.btn-connect','.btn-logout',
        '.btn-back','.btn-settings','.btn-menu','.install-btn','.ctrl-btn',
        '.pin-keypad button','.resume-btn','.cat-arrow.visible',
        '.carousel-arrow:not(.arr-hidden)','.btn-skip-intro','.btn-cast',
        '.checkbox-container','.toggle-password','.toggle-switch'
    ].join(',');

    // Auto-add tabindex="0" to non-natively-focusable elements
    // and remove tabindex from buttons inside poster-cards (prevent focus stealing on TVs)
    let _raf = null;
    function applyTabIndex() {
        document.querySelectorAll(SEL).forEach(el => {
            if (!el.matches('button,a,input,select,textarea') && !el.hasAttribute('tabindex')) {
                el.setAttribute('tabindex', '0');
            }
        });
        // Prevent poster-fav buttons from stealing focus in TV navigation
        if (document.body.classList.contains('tv-mode')) {
            document.querySelectorAll('.poster-card .poster-fav').forEach(btn => {
                btn.setAttribute('tabindex', '-1');
            });
        }
    }
    new MutationObserver(() => {
        if (_raf) return;
        _raf = requestAnimationFrame(() => { applyTabIndex(); _raf = null; });
    }).observe(document.documentElement, { childList: true, subtree: true });
    applyTabIndex();

    // Check if element is visible on screen
    function isVis(el) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    // Get all currently focusable elements in the visible context
    function getFocusable() {
        const extra = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
        return [...document.querySelectorAll(SEL + ',' + extra)].filter(el => {
            if (el.tabIndex < 0 || el.disabled) return false;
            if (!isVis(el)) return false;
            // Must be in active section
            const sec = el.closest('.content-section');
            if (sec && !sec.classList.contains('active')) return false;
            // Must be in visible modal or not in a modal
            const modal = el.closest('.modal-overlay');
            if (modal && modal.style.display !== 'flex') return false;
            // Player overlay has its own key handlers
            if (el.closest('.player-overlay')) return false;
            return true;
        });
    }

    // Spatial navigation: find nearest focusable element in a direction
    function findNext(cur, dir) {
        const list = getFocusable().filter(e => e !== cur);
        if (!list.length) return null;
        const cr = cur.getBoundingClientRect();
        const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
        let best = null, bestS = Infinity;
        for (const el of list) {
            const r = el.getBoundingClientRect();
            const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
            const dx = ex - cx, dy = ey - cy;
            // Must be in the correct direction
            let ok = false;
            switch (dir) {
                case 'up':    ok = dy < -5; break;
                case 'down':  ok = dy > 5; break;
                case 'left':  ok = dx < -5; break;
                case 'right': ok = dx > 5; break;
            }
            if (!ok) continue;
            // Score: prefer elements aligned on the perpendicular axis
            const isVert = (dir === 'up' || dir === 'down');
            const score = isVert
                ? (Math.abs(dy) + Math.abs(dx) * 4)
                : (Math.abs(dx) + Math.abs(dy) * 4);
            if (score < bestS) { bestS = score; best = el; }
        }
        return best;
    }

    // Focus element and auto-scroll into view
    function focusTo(el) {
        el.focus({ preventScroll: true });
        // Smooth scroll into view (vertical)
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        // Also handle horizontal scroll containers (categories, lists, episodes)
        const hScroll = el.closest('.categories-bar,.horizontal-list,.episodes-list,.seasons-tabs,.epg-programs');
        if (hScroll) {
            const er = el.getBoundingClientRect(), cr = hScroll.getBoundingClientRect();
            if (er.right > cr.right - 10) hScroll.scrollBy({ left: er.right - cr.right + 50, behavior: 'smooth' });
            if (er.left < cr.left + 10) hScroll.scrollBy({ left: er.left - cr.left - 50, behavior: 'smooth' });
        }
    }

    // ====== MAIN KEYDOWN HANDLER ======
    document.addEventListener('keydown', function (e) {
        // Skip when player overlay is active (it has its own keyboard controls)
        if (document.querySelector('.player-overlay')) return;

        // Enable tv-mode class on first arrow key use (for CSS fallback)
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
            if (!document.body.classList.contains('tv-mode')) document.body.classList.add('tv-mode');
        }

        const ae = document.activeElement;

        // Text inputs: allow Up/Down to navigate away, keep Left/Right for cursor
        if (ae && ae.matches('input[type="text"],input[type="password"],input[type="search"],textarea')) {
            if (e.key === 'Escape') { ae.blur(); e.preventDefault(); return; }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = findNext(ae, e.key === 'ArrowUp' ? 'up' : 'down');
                if (next) focusTo(next);
            }
            return; // Let Left/Right work for cursor, Enter for form submit
        }

        // Select elements: allow Up/Down for option change, Escape to blur
        if (ae && ae.matches('select')) {
            if (e.key === 'Escape') { ae.blur(); e.preventDefault(); }
            return; // Let native select handle its own keys
        }

        // Arrow keys → spatial navigation
        const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
        const dir = dirMap[e.key];
        if (dir) {
            e.preventDefault();
            // No element focused → focus first available
            if (!ae || ae === document.body || ae === document.documentElement) {
                const first = getFocusable()[0];
                if (first) focusTo(first);
                return;
            }
            const next = findNext(ae, dir);
            if (next) focusTo(next);
            return;
        }

        // Enter / Space = activate (click)
        if (e.key === 'Enter' || e.key === ' ') {
            if (!ae) return;
            // If focus is on a child inside a clickable card, click the card itself
            const parentCard = ae.closest('.poster-card,.h-poster,.h-card,.episode-card-nf,.channel-card');
            if (parentCard && ae !== parentCard) {
                e.preventDefault();
                parentCard.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true}));
                return;
            }
            // For non-native interactive elements (divs with tabindex), dispatch click
            if (!ae.matches('button,a,input,select,textarea')) {
                e.preventDefault();
                ae.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true}));
            }
            // For buttons/links inside modals or standalone, let native behavior handle
            // but also ensure poster-card level clicks work
            else if (parentCard) {
                e.preventDefault();
                parentCard.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true}));
            }
        }

        // Back / Return button (TV remotes: Escape, Samsung 10009, LG 461)
        const isBack = (e.key === 'Escape' || e.keyCode === 10009 || e.keyCode === 461);
        if (isBack) {
            // Close any open modal
            for (const id of ['movieModal', 'seriesModal', 'pinModal']) {
                const m = document.getElementById(id);
                if (m && m.style.display === 'flex') {
                    m.style.display = 'none';
                    e.preventDefault();
                    return;
                }
            }
            // Close mobile sidebar if open
            const sb = document.getElementById('navSidebar');
            if (sb && sb.classList.contains('open')) {
                sb.classList.remove('open');
                const ov = document.getElementById('sidebarOverlay');
                if (ov) ov.classList.remove('open');
                e.preventDefault();
            }
        }
    }, true); // Capture phase to run before other handlers
})();

/* ============================
   GAMEPAD API — Xbox, PlayStation, Fire TV
   ============================ */
(function initGamepad() {
    if (!navigator.getGamepads) return;
    let gpActive = false;
    const DEADZONE = 0.5;
    const REPEAT = 220; // ms between repeated presses
    let lastAxis = { ts: 0, dir: '' };
    let lastBtn = { ts: 0, idx: -1 };

    function pollGamepad() {
        const gps = navigator.getGamepads();
        if (!gps) { requestAnimationFrame(pollGamepad); return; }
        for (const gp of gps) {
            if (!gp || !gp.connected) continue;
            if (!gpActive) {
                gpActive = true;
                document.body.classList.add('tv-mode');
                // Gamepad detectado 
                // console.log('[WEBPLAY] Gamepad:', gp.id);
            }
            const now = Date.now();
            // D-pad via axes (left stick)
            const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
            let dir = '';
            if (ay < -DEADZONE) dir = 'up';
            else if (ay > DEADZONE) dir = 'down';
            else if (ax < -DEADZONE) dir = 'left';
            else if (ax > DEADZONE) dir = 'right';
            if (dir && (dir !== lastAxis.dir || now - lastAxis.ts > REPEAT)) {
                lastAxis = { ts: now, dir };
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Arrow' + dir.charAt(0).toUpperCase() + dir.slice(1), bubbles: true }));
            } else if (!dir) { lastAxis.dir = ''; }

            // D-pad via buttons (12=Up,13=Down,14=Left,15=Right)
            const dpadMap = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
            for (const [idx, key] of Object.entries(dpadMap)) {
                const btn = gp.buttons[+idx];
                if (btn && btn.pressed) {
                    if (+idx !== lastBtn.idx || now - lastBtn.ts > REPEAT) {
                        lastBtn = { ts: now, idx: +idx };
                        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
                    }
                }
            }
            // A button (0) = Enter, B button (1) = Escape
            if (gp.buttons[0]?.pressed && (lastBtn.idx !== 0 || now - lastBtn.ts > 300)) {
                lastBtn = { ts: now, idx: 0 };
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
            if (gp.buttons[1]?.pressed && (lastBtn.idx !== 1 || now - lastBtn.ts > 300)) {
                lastBtn = { ts: now, idx: 1 };
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
            // Reset button tracking when all released
            const anyPressed = gp.buttons.some(b => b.pressed);
            if (!anyPressed && Math.abs(ax) < DEADZONE && Math.abs(ay) < DEADZONE) {
                lastBtn.idx = -1;
            }
        }
        requestAnimationFrame(pollGamepad);
    }

    window.addEventListener('gamepadconnected', e => {
        // Gamepad conectado
        // console.log('[WEBPLAY] Gamepad conectado:', e.gamepad.id);
        document.body.classList.add('tv-mode');
        gpActive = true;
    });
    window.addEventListener('gamepaddisconnected', e => {
        // Gamepad desconectado
        // console.log('[WEBPLAY] Gamepad desconectado:', e.gamepad.id);
    });
    // Start polling loop
    requestAnimationFrame(pollGamepad);
})();

/* ============================
   SKELETON LOADERS — UX aprimorado
   ============================ */
function showSkeleton(container, type = 'cards', count = 12) {
    if (!container) return;
    let html = '';
    if (type === 'cards') {
        for (let i = 0; i < count; i++) {
            html += `<div class="channel-card skeleton-shimmer" style="pointer-events:none">
                <div class="ch-logo" style="background:rgba(255,255,255,.04);border-radius:12px"></div>
                <div class="ch-info"><div class="ch-name" style="width:${60 + Math.random()*30}%;height:14px;background:rgba(255,255,255,.06);border-radius:6px"></div>
                <div class="ch-cat" style="width:40%;height:10px;background:rgba(255,255,255,.04);border-radius:4px;margin-top:6px"></div></div>
            </div>`;
        }
    } else if (type === 'posters') {
        for (let i = 0; i < count; i++) {
            html += `<div class="poster-card skeleton-shimmer" style="pointer-events:none">
                <div class="poster-img" style="background:rgba(255,255,255,.04)"></div>
                <div class="poster-info"><div class="poster-title" style="width:${50 + Math.random()*40}%;height:12px;background:rgba(255,255,255,.06);border-radius:4px"></div></div>
            </div>`;
        }
    }
    container.innerHTML = html;
}

/* ======== BOOT ======== */
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('loginForm')) initLogin();
    else if (document.querySelector('.app-container')) initPlayer();
    
    // Image lazy load fade-in observer
    const imgObs = new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType === 1) {
                    const imgs = n.tagName === 'IMG' ? [n] : (n.querySelectorAll ? Array.from(n.querySelectorAll('img[loading="lazy"]')) : []);
                    imgs.forEach(img => {
                        if (img.complete) { img.classList.add('loaded'); }
                        else { img.addEventListener('load', () => img.classList.add('loaded'), { once: true }); }
                    });
                }
            });
        });
    });
    imgObs.observe(document.body, { childList: true, subtree: true });
    
    // Keyboard support: Escape closes modals
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['movieModal', 'seriesModal', 'channelModal', 'pinModal'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el.style.display !== 'none') {
                    const frame = el.querySelector('iframe');
                    if (frame) frame.src = '';
                    if (typeof closeModal === 'function') closeModal(id);
                    else el.style.display = 'none';
                }
            });
        }
    });
});

/* ======== iOS/Mobile: reset estado ao restaurar do bfcache ou voltar ao app ======== */
window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
        // Página restaurada do bfcache — fechar modais e voltar ao dashboard
        const chModal = document.getElementById('channelModal');
        if (chModal) { chModal.style.display = 'none'; chModal.classList.remove('ch-modal-open'); }
        const playerOv = document.getElementById('playerOverlay');
        if (playerOv) playerOv.remove();
        document.body.style.overflow = '';
        document.body.classList.remove('channel-modal-open');
        document.querySelectorAll('video').forEach(v => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} });
        // Garantir que o histórico do navegador mantenha o app ativo
        history.replaceState({ wp: true }, '', window.location.href);
        history.pushState({ wp: true }, '', window.location.href);
    }
});
