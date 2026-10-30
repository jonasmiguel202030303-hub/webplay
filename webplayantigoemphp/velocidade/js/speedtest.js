/* ============================
   WEBPLAY 2.0 — Speed Test Engine
   ============================ */

// ============ GAUGE SETUP ============

const CENTER_X = 150;
const CENTER_Y = 150;
const RADIUS = 110;
const START_ANGLE = -225;  // graus (parte inferior esquerda)
const END_ANGLE = 45;      // graus (parte inferior direita)
const TOTAL_SWEEP = END_ANGLE - START_ANGLE; // 270°

// Escala: 0 a 500 Mbps
const MAX_SPEED = 500;
const SCALE_STEPS = [0, 10, 25, 50, 100, 150, 200, 300, 400, 500];

function degToRad(deg) {
    return (deg * Math.PI) / 180;
}

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = degToRad(angleDeg);
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
    };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const sweep = endAngle - startAngle;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function valueToAngle(value) {
    const clamped = Math.min(Math.max(value, 0), MAX_SPEED);
    return START_ANGLE + (clamped / MAX_SPEED) * TOTAL_SWEEP;
}

// Desenhar gauge
function initGauge() {
    const bgArc = document.getElementById('bgArc');
    bgArc.setAttribute('d', describeArc(CENTER_X, CENTER_Y, RADIUS, START_ANGLE, END_ANGLE));

    // Ticks e Labels
    const ticksGroup = document.getElementById('scaleTicks');
    const labelsGroup = document.getElementById('scaleLabels');
    ticksGroup.innerHTML = '';
    labelsGroup.innerHTML = '';

    // Ticks menores (a cada 10 Mbps)
    for (let v = 0; v <= MAX_SPEED; v += 10) {
        const angle = valueToAngle(v);
        const isMajor = SCALE_STEPS.includes(v);
        const innerR = isMajor ? RADIUS - 14 : RADIUS - 8;
        const outerR = RADIUS - 2;

        const p1 = polarToCartesian(CENTER_X, CENTER_Y, innerR, angle);
        const p2 = polarToCartesian(CENTER_X, CENTER_Y, outerR, angle);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p1.x);
        line.setAttribute('y1', p1.y);
        line.setAttribute('x2', p2.x);
        line.setAttribute('y2', p2.y);
        if (isMajor) line.classList.add('major');
        ticksGroup.appendChild(line);

        // Label
        if (isMajor) {
            const labelR = RADIUS - 24;
            const lp = polarToCartesian(CENTER_X, CENTER_Y, labelR, angle);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', lp.x);
            text.setAttribute('y', lp.y + 3);
            text.textContent = v;
            labelsGroup.appendChild(text);
        }
    }

    // Arco ativo (inicialmente vazio)
    updateGauge(0);
}

function updateGauge(value) {
    const activeArc = document.getElementById('activeArc');
    const needle = document.getElementById('needle');
    const speedEl = document.getElementById('speedValue');

    const displayVal = Math.round(value * 10) / 10;
    speedEl.textContent = displayVal < 1 ? displayVal.toFixed(1) : Math.round(displayVal);

    const angle = valueToAngle(value);

    // Arco ativo
    if (value <= 0.5) {
        activeArc.setAttribute('d', '');
    } else {
        activeArc.setAttribute('d', describeArc(CENTER_X, CENTER_Y, RADIUS, START_ANGLE, angle));
    }

    // Ponteiro
    needle.setAttribute('transform', `rotate(${angle}, ${CENTER_X}, ${CENTER_Y})`);
}


// ============ SPEED TEST ============

let isTesting = false;
let animFrame = null;

// Detectar IP público
async function detectIP() {
    try {
        const res = await fetch('../../api/proxy.php?url=' + encodeURIComponent('https://ipapi.co/json/'), { cache: 'no-store' });
        const data = await res.json();
        document.getElementById('ipAddress').textContent = data.ip || 'Desconhecido';
        document.getElementById('ispInfo').textContent = `${data.org || ''} — ${data.city || ''}, ${data.region || ''}, ${data.country_name || ''}`;
    } catch (e) {
        try {
            const res2 = await fetch('../../api/proxy.php?url=' + encodeURIComponent('https://api.ipify.org?format=json'), { cache: 'no-store' });
            const data2 = await res2.json();
            document.getElementById('ipAddress').textContent = data2.ip || 'Desconhecido';
            document.getElementById('ispInfo').textContent = 'Provedor não identificado';
        } catch (e2) {
            document.getElementById('ipAddress').textContent = 'Não foi possível detectar';
            document.getElementById('ispInfo').textContent = 'Provedor não identificado';
        }
    }
}

// Medição de ping
async function measurePing() {
    const pings = [];
    const testUrl = 'https://www.google.com/generate_204';

    for (let i = 0; i < 10; i++) {
        try {
            const start = performance.now();
            await fetch(testUrl + '?t=' + Date.now() + Math.random(), {
                mode: 'no-cors',
                cache: 'no-store'
            });
            const end = performance.now();
            pings.push(end - start);
        } catch (e) {
            // ignorar falhas
        }
        await sleep(100);
    }

    if (pings.length === 0) return { ping: 0, jitter: 0 };

    // Remover outliers
    pings.sort((a, b) => a - b);
    const trimmed = pings.slice(1, -1);
    const avgPing = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

    // Calcular jitter
    let jitterSum = 0;
    for (let i = 1; i < trimmed.length; i++) {
        jitterSum += Math.abs(trimmed[i] - trimmed[i - 1]);
    }
    const jitter = trimmed.length > 1 ? jitterSum / (trimmed.length - 1) : 0;

    return {
        ping: Math.round(avgPing),
        jitter: Math.round(jitter * 10) / 10
    };
}

// Medição de download
async function measureDownload(onProgress) {
    const testFiles = [
        { url: 'https://speed.cloudflare.com/__down?bytes=26214400', size: 26214400 },
        { url: 'https://speed.cloudflare.com/__down?bytes=10485760', size: 10485760 },
        { url: 'https://speed.cloudflare.com/__down?bytes=5242880', size: 5242880 },
    ];

    let totalBytes = 0;
    const startTime = performance.now();
    const samples = [];
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;

    // Função para baixar um chunk
    async function downloadChunk(fileInfo) {
        try {
            const response = await fetch(fileInfo.url + '&r=' + Math.random(), {
                cache: 'no-store'
            });

            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                totalBytes += value.length;
                const now = performance.now();
                const elapsed = (now - lastSampleTime) / 1000;

                if (elapsed >= 0.2) {
                    const bytesInInterval = totalBytes - lastSampleBytes;
                    const speedMbps = (bytesInInterval * 8) / (elapsed * 1000000);
                    samples.push(speedMbps);
                    
                    // Média das últimas amostras
                    const recentSamples = samples.slice(-8);
                    const avgSpeed = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
                    onProgress(avgSpeed);
                    
                    lastSampleTime = now;
                    lastSampleBytes = totalBytes;
                }
            }
        } catch (e) {
            // ignorar
        }
    }

    // Teste progressivo: começa com arquivo menor, depois maior
    const duration = 12000; // 12 segundos
    const endTime = startTime + duration;

    // Rodar downloads em paralelo
    const promises = [];
    
    while (performance.now() < endTime && isTesting) {
        const elapsed = performance.now() - startTime;
        // Usar arquivos maiores conforme o teste progride
        const fileIdx = elapsed < 3000 ? 2 : elapsed < 7000 ? 1 : 0;
        
        if (promises.length < 4) {
            const p = downloadChunk(testFiles[fileIdx]);
            promises.push(p);
        }
        
        await Promise.race([
            Promise.any(promises),
            sleep(500)
        ]);
        
        // Limpar promises resolvidas
        const settled = await Promise.allSettled(promises.map(p => 
            Promise.race([p, new Promise((_, rej) => setTimeout(rej, 0))])
        ));
        
        // Manter rodando
        if (performance.now() >= endTime) break;
        
        // Nova rodada
        const newP = downloadChunk(testFiles[elapsed < 3000 ? 2 : 0]);
        promises.push(newP);
        
        await sleep(200);
    }

    await Promise.allSettled(promises);
    
    const totalTime = (performance.now() - startTime) / 1000;
    const overallSpeed = (totalBytes * 8) / (totalTime * 1000000);

    // Usar média ponderada das amostras (mais peso nas recentes)
    if (samples.length > 3) {
        const recent = samples.slice(Math.floor(samples.length / 3));
        const sorted = [...recent].sort((a, b) => a - b);
        const trimmed = sorted.slice(
            Math.floor(sorted.length * 0.1),
            Math.ceil(sorted.length * 0.9)
        );
        if (trimmed.length > 0) {
            return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        }
    }

    return overallSpeed;
}

// Medição de upload
async function measureUpload(onProgress) {
    const samples = [];
    let totalBytes = 0;
    const startTime = performance.now();
    const duration = 10000; // 10 segundos
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;

    const uploadUrl = 'https://speed.cloudflare.com/__up';

    async function uploadChunk(sizeBytes) {
        try {
            const data = new ArrayBuffer(sizeBytes);
            const view = new Uint8Array(data);
            // Preencher com dados aleatórios simples
            for (let i = 0; i < Math.min(1024, sizeBytes); i++) {
                view[i] = Math.random() * 256;
            }

            const sendStart = performance.now();
            
            await fetch(uploadUrl + '?r=' + Math.random(), {
                method: 'POST',
                body: data,
                cache: 'no-store'
            });

            const sendEnd = performance.now();
            const elapsed = (sendEnd - sendStart) / 1000;
            
            totalBytes += sizeBytes;
            
            if (elapsed > 0) {
                const speed = (sizeBytes * 8) / (elapsed * 1000000);
                samples.push(speed);
                
                const recentSamples = samples.slice(-6);
                const avgSpeed = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
                onProgress(avgSpeed);
            }
        } catch (e) {
            // ignorar
        }
    }

    while (performance.now() - startTime < duration && isTesting) {
        const elapsed = performance.now() - startTime;
        // Tamanho progressivo
        const chunkSize = elapsed < 3000 ? 524288 : elapsed < 6000 ? 1048576 : 2097152;
        
        // 2 uploads paralelos
        await Promise.all([
            uploadChunk(chunkSize),
            uploadChunk(chunkSize)
        ]);
    }

    if (samples.length > 3) {
        const recent = samples.slice(Math.floor(samples.length / 3));
        const sorted = [...recent].sort((a, b) => a - b);
        const trimmed = sorted.slice(
            Math.floor(sorted.length * 0.1),
            Math.ceil(sorted.length * 0.9)
        );
        if (trimmed.length > 0) {
            return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        }
    }

    const totalTime = (performance.now() - startTime) / 1000;
    return (totalBytes * 8) / (totalTime * 1000000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setStatus(text, className) {
    const el = document.getElementById('statusText');
    el.textContent = text;
    el.className = 'status-text' + (className ? ' ' + className : '');
}

function setCardActive(cardId) {
    document.querySelectorAll('.result-card').forEach(c => c.classList.remove('active'));
    if (cardId) {
        document.getElementById(cardId).classList.add('active');
    }
}

function setCardDone(cardId) {
    document.getElementById(cardId).classList.remove('active');
    document.getElementById(cardId).classList.add('done');
}

function formatSpeed(val) {
    if (val >= 100) return Math.round(val).toString();
    if (val >= 10) return val.toFixed(1);
    return val.toFixed(2);
}

// ============ TESTE PRINCIPAL ============

async function startTest() {
    if (isTesting) return;
    isTesting = true;

    const btn = document.getElementById('startBtn');
    const btnIcon = document.getElementById('btnIcon');
    const btnText = document.getElementById('btnText');

    btn.classList.add('testing');
    btn.disabled = true;
    btnIcon.className = 'fas fa-spinner fa-spin';
    btnText.textContent = 'TESTANDO';

    // Reset
    document.getElementById('downloadValue').textContent = '—';
    document.getElementById('uploadValue').textContent = '—';
    document.getElementById('pingValue').textContent = '—';
    document.getElementById('jitterValue').textContent = '—';
    document.querySelectorAll('.result-card').forEach(c => {
        c.classList.remove('active', 'done');
    });
    updateGauge(0);

    try {
        // === FASE 1: PING ===
        setStatus('Medindo latência...', 'testing');
        setCardActive('pingCard');
        
        const { ping, jitter } = await measurePing();
        
        document.getElementById('pingValue').textContent = ping;
        document.getElementById('jitterValue').textContent = jitter;
        setCardDone('pingCard');
        setCardDone('jitterCard');

        if (!isTesting) return;

        // === FASE 2: DOWNLOAD ===
        setStatus('Medindo velocidade de Download...', 'download');
        setCardActive('downloadCard');

        const downloadSpeed = await measureDownload((speed) => {
            if (!isTesting) return;
            updateGauge(speed);
        });

        const finalDown = Math.round(downloadSpeed * 100) / 100;
        document.getElementById('downloadValue').textContent = formatSpeed(finalDown);
        setCardDone('downloadCard');
        updateGauge(0);

        if (!isTesting) return;
        await sleep(500);

        // === FASE 3: UPLOAD ===
        setStatus('Medindo velocidade de Upload...', 'upload');
        setCardActive('uploadCard');

        const uploadSpeed = await measureUpload((speed) => {
            if (!isTesting) return;
            updateGauge(speed);
        });

        const finalUp = Math.round(uploadSpeed * 100) / 100;
        document.getElementById('uploadValue').textContent = formatSpeed(finalUp);
        setCardDone('uploadCard');

        // Mostrar resultado final no gauge
        updateGauge(finalDown);

        setStatus('✓ Teste concluído!', 'complete');

    } catch (err) {
        console.error('Erro no teste:', err);
        setStatus('Erro durante o teste. Tente novamente.', '');
    } finally {
        isTesting = false;
        btn.classList.remove('testing');
        btn.disabled = false;
        btnIcon.className = 'fas fa-redo';
        btnText.textContent = 'REPETIR';
    }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    initGauge();
    detectIP();
});
