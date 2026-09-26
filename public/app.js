let ws = null;
let myId = '';
let targetId = '';
let canvas = document.getElementById('remoteCanvas');
let ctx = canvas.getContext('2d');
let frameCount = 0;
let lastFpsTime = Date.now();
let isControlling = false;
let isDecoding = false;
let pendingBitmap = null;

const el = (id) => document.getElementById(id);

/* Estado do host no cabeçalho */
function setHostStatus(label, state) {
    el('hostStatusText').textContent = label;
    el('hostStatusBadge').dataset.state = state;
}

/* Feedback de conexão com tom semântico */
function setFeedback(message, tone) {
    const node = el('connectFeedback');
    node.textContent = message;
    if (tone) node.dataset.tone = tone;
    else delete node.dataset.tone;
}

/* Botão em estado de carregamento / desabilitado */
function setConnecting(isConnecting) {
    const btn = el('connectBtn');
    btn.disabled = isConnecting;
    btn.dataset.loading = String(isConnecting);
    btn.querySelector('.btn-label').textContent = isConnecting ? 'Conectando' : 'Assumir controle';
}

function pollServerStatus() {
    fetch('/api/status')
        .then(r => r.json())
        .then(data => {
            if (data.session) {
                if (data.session.id) {
                    myId = data.session.id;
                    el('myIdDisplay').textContent = myId;
                }
                // A senha so vem em requisicoes locais; nunca e enviada ao navegador remoto
                if (data.session.password) {
                    el('myPassword').value = data.session.password;
                }
                if (data.session.publicUrl) {
                    el('publicUrlInput').textContent = data.session.publicUrl;
                }
            }

            // Estados reais do host — sem metadados decorativos
            if (data.captureWarning) {
                setHostStatus('Captura indisponível', 'busy');
                el('desktopWarningText').textContent = data.captureWarning;
                el('desktopWarning').hidden = false;
            } else if (data.engineReady) {
                setHostStatus('Pronto para acesso', 'online');
                el('desktopWarning').hidden = true;
            } else {
                setHostStatus('Iniciando motor', 'busy');
            }
        })
        .catch(() => setHostStatus('Servidor sem resposta', 'idle'));
}

setInterval(pollServerStatus, 3000);
pollServerStatus();

/* Cópia com feedback temporário no próprio botão */
function copyWithFeedback(inputId, buttonId, value) {
    const restore = el(buttonId).textContent;
    navigator.clipboard.writeText(value).then(() => {
        el(buttonId).textContent = 'Copiado';
        setTimeout(() => { el(buttonId).textContent = restore; }, 1600);
    });
}

function copyPublicUrl() {
    copyWithFeedback('publicUrlInput', 'copyUrlBtn', el('publicUrlInput').textContent);
}

function copyMyId() {
    copyWithFeedback('myIdDisplay', 'copyIdBtn', myId);
}

function initSignaling() {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${loc.host || '127.0.0.1:8080'}/ws`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'REGISTER_OPERATOR',
            id: 'client_' + Math.random().toString(36).substring(2, 9)
        }));
    };

    ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
            handleMessage(JSON.parse(event.data));
        } else if (event.data instanceof ArrayBuffer) {
            renderFrameBuffer(event.data);
        } else if (event.data instanceof Blob) {
            event.data.arrayBuffer().then(buf => renderFrameBuffer(buf));
        }
    };

    ws.onclose = () => {
        if (isControlling) setHostStatus('Conexão perdida', 'busy');
        setTimeout(initSignaling, 2000);
    };
}

function handleMessage(data) {
    if (data.type === 'REGISTERED') {
        setHostStatus('Pronto para acesso', 'online');
    } else if (data.type === 'CONNECTED_SUCCESS') {
        setConnecting(false);
        startControlSession(data.targetId);
    } else if (data.type === 'CONNECT_ERROR') {
        setConnecting(false);
        setFeedback(data.message, 'error');
    } else if (data.type === 'HOST_DISCONNECTED') {
        setConnecting(false);
        setFeedback(data.message || 'O computador remoto encerrou a sessão.', 'error');
        disconnectViewer();
    } else if (data.type === 'CLIENT_ATTACHED') {
        setHostStatus('Sessão em andamento', 'busy');
    }
}
function renderFrameBuffer(buffer) {
    if (!buffer || buffer.byteLength === 0) return;

    // Mantém apenas o frame mais recente enquanto o navegador ainda decodifica
    if (isDecoding) {
        pendingBitmap = buffer;
        return;
    }

    decodeAndDraw(buffer);
}

async function decodeAndDraw(buffer) {
    isDecoding = true;
    try {
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);

        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        frameCount++;
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
            el('fpsDisplay').textContent = `${frameCount} fps · ${canvas.width}×${canvas.height}`;
            frameCount = 0;
            lastFpsTime = now;
        }
    } catch (e) {
        console.error('Erro ao decodificar frame JPEG:', e);
    } finally {
        isDecoding = false;
        if (pendingBitmap) {
            const next = pendingBitmap;
            pendingBitmap = null;
            decodeAndDraw(next);
        }
    }
}

function connectToRemote() {
    const rawTarget = el('targetIdInput').value.replace(/\s+/g, '');
    const pass = el('targetPasswordInput').value;

    // Estado vazio/erro antes de qualquer envio
    if (rawTarget.length < 5) {
        setFeedback('Informe o ID completo do computador remoto.', 'error');
        el('targetIdInput').focus();
        return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        setFeedback('Sem conexão com o servidor. Tentando reconectar…', 'error');
        return;
    }

    targetId = rawTarget;
    setConnecting(true);
    setFeedback('Conectando ao computador remoto…', 'progress');

    ws.send(JSON.stringify({
        type: 'CONNECT_TARGET',
        targetId: targetId,
        password: pass
    }));
}

function startControlSession(tId) {
    el('lobbyContainer').hidden = true;
    el('viewerContainer').hidden = false;
    el('remoteTargetName').textContent = 'ID ' + tId;
    isControlling = true;
    frameCount = 0;
    lastFpsTime = Date.now();
    canvas.focus();
    setupInputListeners();
}

function disconnectViewer() {
    isControlling = false;
    el('viewerContainer').hidden = true;
    el('lobbyContainer').hidden = false;
    setConnecting(false);
    setFeedback('Sessão encerrada.', 'ok');
}

function toggleFullScreen() {
    const target = el('viewerContainer');
    if (!document.fullscreenElement) {
        target.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

function changeQuality(val) {
    if (ws && isControlling) {
        ws.send(JSON.stringify({ type: 'CONFIG', payload: `QUALITY ${val}` }));
    }
}

function changeFps(val) {
    if (ws && isControlling) {
        ws.send(JSON.stringify({ type: 'CONFIG', payload: `FPS ${val}` }));
    }
}

let inputInitialized = false;
function setupInputListeners() {
    if (inputInitialized) return;
    inputInitialized = true;

    canvas.addEventListener('mousemove', (e) => {
        if (!isControlling) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = Math.round((e.clientX - rect.left) * scaleX);
        const clientY = Math.round((e.clientY - rect.top) * scaleY);
        sendInput(`MOVE ${clientX} ${clientY}`);
    });

    canvas.addEventListener('mousedown', (e) => {
        if (!isControlling) return;
        e.preventDefault();
        canvas.focus();
        sendInput(`DOWN ${e.button}`);
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!isControlling) return;
        e.preventDefault();
        sendInput(`UP ${e.button}`);
    });

    canvas.addEventListener('wheel', (e) => {
        if (!isControlling) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 120 : -120;
        sendInput(`WHEEL ${delta}`);
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
        if (!isControlling) return;
        // Previne navegação acidental mantendo teclas ativas para o host
        if (['F5'].includes(e.key)) {
            e.preventDefault();
        }
        sendInput(`KEYDOWN ${e.keyCode}`);
    });

    window.addEventListener('keyup', (e) => {
        if (!isControlling) return;
        sendInput(`KEYUP ${e.keyCode}`);
    });
}

function sendInput(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'INPUT', payload: payload }));
    }
}

window.onload = initSignaling;

