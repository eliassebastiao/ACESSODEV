let ws = null;
let myId = '';
let targetId = '';
let canvas = document.getElementById('remoteCanvas');
let ctx = canvas.getContext('2d');
let frameImg = new Image();
let frameCount = 0;
let lastFpsTime = Date.now();
let isControlling = false;

function pollServerStatus() {
    fetch('/api/status')
        .then(r => r.json())
        .then(data => {
            if (data.session) {
                if (data.session.id) {
                    myId = data.session.id;
                    document.getElementById('myIdDisplay').innerText = myId.slice(0,3) + ' ' + myId.slice(3);
                }
                if (data.session.password) {
                    document.getElementById('myPassword').value = data.session.password;
                }
                if (data.session.publicUrl) {
                    const pubInput = document.getElementById('publicUrlInput');
                    if (pubInput) pubInput.value = data.session.publicUrl;
                }
            }
        })
        .catch(() => {});
}

setInterval(pollServerStatus, 3000);
pollServerStatus();

function copyPublicUrl() {
    const url = document.getElementById('publicUrlInput').value;
    navigator.clipboard.writeText(url);
    const btn = document.getElementById('copyUrlBtn');
    btn.innerText = 'Copiado!';
    setTimeout(() => { btn.innerText = 'Copiar Link'; }, 2000);
}

function copyMyId() {
    navigator.clipboard.writeText(myId);
    const btn = document.getElementById('copyIdBtn');
    btn.innerText = 'Copiado!';
    setTimeout(() => { btn.innerText = 'Copiar'; }, 2000);
}

function initSignaling() {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${loc.host || '127.0.0.1:8080'}/ws`;
    
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        // Se for o cliente/operador abrindo a página para controlar, não deve sobrescrever o host principal
        // Só registra como host auxiliar caso não seja cliente ativo
        const clientTempId = 'client_' + Math.random().toString(36).substring(2, 9);
        ws.send(JSON.stringify({
            type: 'REGISTER_OPERATOR',
            id: clientTempId
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
        setTimeout(initSignaling, 2000);
    };
}

function handleMessage(data) {
    if (data.type === 'REGISTERED') {
        document.getElementById('hostStatusBadge').style.color = '#10b981';
        document.getElementById('hostStatusText').innerText = 'Online e Pronto';
    } else if (data.type === 'CONNECTED_SUCCESS') {
        startControlSession(data.targetId);
    } else if (data.type === 'CONNECT_ERROR') {
        document.getElementById('connectFeedback').innerText = data.message;
    } else if (data.type === 'HOST_DISCONNECTED') {
        alert(data.message || 'Sessão finalizada');
        disconnectViewer();
    } else if (data.type === 'CLIENT_ATTACHED') {
        document.getElementById('hostStatusBadge').style.color = '#38bdf8';
        document.getElementById('hostStatusText').innerText = 'Sessão Ativa';
    }
}
function renderFrameBuffer(buffer) {
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    frameImg.onload = () => {
        if (canvas.width !== frameImg.width || canvas.height !== frameImg.height) {
            canvas.width = frameImg.width;
            canvas.height = frameImg.height;
        }
        ctx.drawImage(frameImg, 0, 0);
        URL.revokeObjectURL(url);

        frameCount++;
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
            document.getElementById('fpsDisplay').innerText = `FPS: ${frameCount} | ${canvas.width}x${canvas.height}`;
            frameCount = 0;
            lastFpsTime = now;
        }
    };
    frameImg.src = url;
}

function connectToRemote() {
    const rawTarget = document.getElementById('targetIdInput').value.replace(/\s+/g, '');
    const pass = document.getElementById('targetPasswordInput').value;
    const feedback = document.getElementById('connectFeedback');
    feedback.innerText = '';

    if (rawTarget.length < 5) {
        feedback.innerText = 'Digite um ID válido de 6 dígitos';
        return;
    }

    targetId = rawTarget;
    feedback.style.color = '#38bdf8';
    feedback.innerText = 'Conectando ao computador remoto...';

    ws.send(JSON.stringify({
        type: 'CONNECT_TARGET',
        targetId: targetId,
        password: pass
    }));
}

function startControlSession(tId) {
    document.getElementById('lobbyContainer').style.display = 'none';
    document.getElementById('viewerContainer').style.display = 'flex';
    document.getElementById('remoteTargetName').innerText = 'ID #' + tId;
    isControlling = true;
    canvas.focus();
    setupInputListeners();
}

function disconnectViewer() {
    isControlling = false;
    document.getElementById('viewerContainer').style.display = 'none';
    document.getElementById('lobbyContainer').style.display = 'flex';
    document.getElementById('connectFeedback').innerText = '';
}

function toggleFullScreen() {
    const el = document.getElementById('viewerContainer');
    if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
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
        if (['Tab', 'Alt', 'F5', 'Control'].includes(e.key)) {
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

