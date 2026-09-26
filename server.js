const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const net = require('net');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;
const ENGINE_PORT = 48002;
const SESSION_FILE = path.join(__dirname, 'session_info.json');

/* ------------------------------------------------------------------
   Seguranca
   ------------------------------------------------------------------ */

const MAX_ATTEMPTS = 5;          // tentativas erradas por origem
const LOCKOUT_MS = 60 * 1000;     // bloqueio de 60s apos exceder o limite
const VIEWER_TIMEOUT_MS = 12 * 60 * 60 * 1000; // encerra sessao ociosa em 12h

// Senha forte por omissao. O utilizador pode definir ACCESS_PASSWORD.
function generateStrongPassword() {
    // 16 bytes em base64url = 22 chars; cortamos a 10 para facilitar a digitacao
    return crypto.randomBytes(16).toString('base64url').slice(0, 10);
}

const DEFAULT_PASSWORD_IS_WEAK = !process.env.ACCESS_PASSWORD;

/* ------------------------------------------------------------------
   SESSAO
   ------------------------------------------------------------------ */

let hostSession = {
    id: crypto.randomInt(100000, 1000000).toString(),
    password: process.env.ACCESS_PASSWORD || generateStrongPassword(),
    status: 'starting',
    startedAt: new Date().toISOString(),
    port: PORT,
    publicUrl: null,
    tunnelStatus: 'starting',
    desktop: 'UNKNOWN',
    weakDefaultPassword: DEFAULT_PASSWORD_IS_WEAK
};

let tunnelProcess = null;
let tunnelAttempts = 0;
const MAX_TUNNEL_ATTEMPTS = 5;

function downloadCloudflaredIfMissing() {
    return new Promise((resolve) => {
        const cloudflaredExe = path.join(__dirname, 'cloudflared.exe');
        if (fs.existsSync(cloudflaredExe)) {
            return resolve(true);
        }

        console.log('[TUNNEL] Baixando cloudflared.exe oficial automaticamente...');
        const https = require('https');
        function getDownload(url, dest) {
            return new Promise((res, rej) => {
                https.get(url, (response) => {
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        return getDownload(response.headers.location, dest).then(res).catch(rej);
                    }
                    if (response.statusCode !== 200) {
                        return rej(new Error('Status ' + response.statusCode));
                    }
                    const f = fs.createWriteStream(dest);
                    response.pipe(f);
                    f.on('finish', () => f.close(() => res()));
                }).on('error', rej);
            });
        }

        getDownload('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', cloudflaredExe)
            .then(() => {
                console.log('[TUNNEL] cloudflared.exe baixado e pronto!');
                resolve(true);
            })
            .catch(err => {
                console.error('[TUNNEL] Falha no download automático do cloudflared:', err.message);
                resolve(false);
            });
    });
}

async function startCloudflareTunnel() {
    const cloudflaredExe = path.join(__dirname, 'cloudflared.exe');
    if (!fs.existsSync(cloudflaredExe)) {
        const ok = await downloadCloudflaredIfMissing();
        if (!ok || !fs.existsSync(cloudflaredExe)) {
            console.log('[TUNNEL] Operando em modo de rede local.');
            hostSession.tunnelStatus = 'missing_binary';
            saveSession();
            return;
        }
    }

    if (tunnelAttempts >= MAX_TUNNEL_ATTEMPTS) {
        console.log('[TUNNEL] Limite de tentativas de túnel atingido. Modo local.');
        hostSession.tunnelStatus = 'error';
        saveSession();
        return;
    }

    tunnelAttempts++;
    console.log(`[TUNNEL] Criando link público mundial via Cloudflare (${tunnelAttempts}/${MAX_TUNNEL_ATTEMPTS})...`);
    hostSession.tunnelStatus = 'connecting';
    saveSession();

    try {
        tunnelProcess = spawn(cloudflaredExe, ['tunnel', '--url', `http://localhost:${PORT}`]);

        const tunnelTimeout = setTimeout(() => {
            if (!hostSession.publicUrl && hostSession.tunnelStatus === 'connecting') {
                console.log('[TUNNEL] Timeout ao obter URL do Cloudflare.');
                hostSession.tunnelStatus = 'timeout';
                saveSession();
            }
        }, 30000);

        tunnelProcess.stderr.on('data', (data) => {
            const output = data.toString();
            const match = output.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
            if (match && !hostSession.publicUrl) {
                clearTimeout(tunnelTimeout);
                hostSession.publicUrl = match[0];
                hostSession.tunnelStatus = 'online';
                tunnelAttempts = 0;
                saveSession();

                console.log(`=======================================================`);
                console.log(`  🌐 ACESSO TOTAL PELA INTERNET LIBERADO!`);
                console.log(`  Link Mundial  : ${hostSession.publicUrl}`);
                console.log(`  ID da Sessão  : ${hostSession.id}`);
                console.log(`  Senha         : ${hostSession.password}`);
                console.log(`=======================================================`);
            }
        });

        tunnelProcess.on('exit', () => {
            clearTimeout(tunnelTimeout);
            hostSession.publicUrl = null;
            if (tunnelAttempts < MAX_TUNNEL_ATTEMPTS) {
                console.log('[TUNNEL] Reconectando túnel em 5s...');
                hostSession.tunnelStatus = 'disconnected';
                saveSession();
                setTimeout(startCloudflareTunnel, 5000);
            } else {
                hostSession.tunnelStatus = 'error';
                saveSession();
            }
        });
    } catch (e) {
        console.error('[TUNNEL] Erro:', e.message);
        hostSession.tunnelStatus = 'error';
        saveSession();
    }
}

function saveSession() {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(hostSession, null, 2), 'utf-8');
    } catch (e) {
        console.error('[SESSION] Erro:', e.message);
    }
}
saveSession();

const app = express();
// Sem cache nos ficheiros estaticos: evita que o browser sirva CSS/JS antigos
// depois de uma atualizacao, o que fazia a interface aparecer sem estilos.
app.use(express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
}));

// Comparacao em tempo constante evita revelar o tamanho/ordem da senha
function safeEquals(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

// Remove a senha do payload publico
function publicSession() {
    return {
        id: hostSession.id,
        status: hostSession.status,
        startedAt: hostSession.startedAt,
        port: hostSession.port,
        publicUrl: hostSession.publicUrl,
        tunnelStatus: hostSession.tunnelStatus,
        desktop: hostSession.desktop
    };
}

// So pedidos feitos directamente a maquina recebem a senha.
// Nao usar remoteAddress: o cloudflared liga via 127.0.0.1, o que tornaria
// qualquer pedido pelo tunel publico "local" e vazaria a senha.
function isLocalRequest(req) {
    const host = String(req.headers.host || '');
    return /^localhost(:\d+)?$/.test(host) ||
           /^127\.0\.0\.1(:\d+)?$/.test(host) ||
           /^\[::1\](:\d+)?$/.test(host);
}

app.get('/api/status', (req, res) => {
    const local = isLocalRequest(req);
    res.json({
        ok: true,
        session: local ? hostSession : publicSession(),
        engineReady,
        activeViewers: viewers.size,
        hasFrames: latestFrame !== null,
        frameSize: latestFrame ? latestFrame.length : 0,
        desktop: hostSession.desktop || 'UNKNOWN',
        captureWarning: (hostSession.desktop === 'ABSENT')
            ? 'SEM SESSAO GRAFICA: a captura retorna imagem preta. Execute INSTALAR.bat como administrador.'
            : null,
        uptime: process.uptime()
    });
});

// Credenciais completas — restrito a requisicoes locais
app.get('/api/credentials', (req, res) => {
    if (!isLocalRequest(req)) {
        return res.status(403).json({ error: 'Acesso restrito a requisicoes locais.' });
    }
    res.json({ id: hostSession.id, password: hostSession.password, publicUrl: hostSession.publicUrl });
});

// Screenshot exige token — evita expor a tela a quem apenas tenha o link
app.get('/api/screenshot', (req, res) => {
    const token = req.query.token;
    if (!token || !safeEquals(token, hostSession.id + hostSession.password)) {
        return res.status(403).json({ error: 'Token invalido.' });
    }
    if (latestFrame) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.end(latestFrame);
    }
    res.status(503).json({ error: 'Nenhum frame capturado ainda' });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const viewers = new Set();
let engineProcess = null;
let engineSocket = null;
let engineReady = false;


function startEngine() {
    console.log('[ENGINE] Iniciando ScreenHostEngine nativo...');
    const exePath = path.join(__dirname, 'ScreenHostEngine.exe');
    engineProcess = spawn(exePath, [ENGINE_PORT.toString()]);

    let desktopStatus = 'UNKNOWN';

    engineProcess.stdout.on('data', (d) => {
        const str = d.toString().trim();
        console.log('[ENGINE OUT]', str);

        if (str.includes('ENGINE_DESKTOP:OK')) {
            desktopStatus = 'OK';
            if (hostSession.desktop !== 'OK') {
                hostSession.desktop = 'OK';
                saveSession();
            }
        } else if (str.includes('ENGINE_DESKTOP:ABSENT')) {
            desktopStatus = 'ABSENT';
            hostSession.desktop = 'ABSENT';
            saveSession();
            console.log('=======================================================');
            console.log('  [!] AVISO GRAVE: SEM SESSAO GRAFICA INTERATIVA!');
            console.log('  A captura de tela vai devolver IMAGEM PRETA.');
            console.log('  SOLUCAO: execute INSTALAR.bat como ADMINISTRADOR');
            console.log('  para o app rodar dentro da sua sessao Windows.');
            console.log('=======================================================');
        }

        if (str.includes('ENGINE_READY')) {
            engineReady = true;
            hostSession.status = 'ready';
            if (hostSession.desktop === 'UNKNOWN') hostSession.desktop = desktopStatus;
            saveSession();
            connectEngineSocket();
        }
    });

    engineProcess.stderr.on('data', (d) => {
        console.error('[ENGINE ERR]', d.toString().trim());
    });

    engineProcess.on('exit', (code) => {
        console.log('[ENGINE] Encerrado com código', code);
        engineReady = false;
        hostSession.status = 'engine_restarting';
        saveSession();
        setTimeout(startEngine, 3000);
    });
}

function connectEngineSocket() {
    if (engineSocket) {
        try { engineSocket.destroy(); } catch (e) {}
    }

    console.log('[ENGINE] Conectando ao socket de streaming de tela...');
    engineSocket = net.connect(ENGINE_PORT, '127.0.0.1', () => {
        console.log('[ENGINE] Motor de captura conectado com sucesso!');
    });

    let expectedLen = 0;
    let buffer = Buffer.alloc(0);

    engineSocket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
            if (expectedLen === 0) {
                if (buffer.length < 4) break;
                expectedLen = buffer.readUInt32BE(0);
                buffer = buffer.slice(4);
            }
            if (buffer.length >= expectedLen) {
                const frame = buffer.slice(0, expectedLen);
                buffer = buffer.slice(expectedLen);
                expectedLen = 0;
                broadcastFrame(frame);
            } else {
                break;
            }
        }
    });

    engineSocket.on('error', (err) => {
        console.log('[ENGINE SOCKET ERR]', err.message);
        setTimeout(connectEngineSocket, 2000);
    });
}

// Cache do último frame capturado para entrega instantânea
let latestFrame = null;

const MAX_SEND_BUFFER = 2 * 1024 * 1024; // 2MB: descarta frames se o cliente estiver lento

function broadcastFrame(frameBuffer) {
    latestFrame = frameBuffer;
    if (viewers.size === 0) return;
    for (const ws of viewers) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
            // Backpressure: ignora o frame se o cliente não conseguiu consumir os anteriores
            if (ws.bufferedAmount > MAX_SEND_BUFFER) continue;
            ws.send(frameBuffer, { binary: true });
        } catch (err) {}
    }
}

function sendToEngine(cmd) {
    if (engineProcess && engineProcess.stdin && !engineProcess.stdin.destroyed) {
        engineProcess.stdin.write(cmd + '\n');
    }
}
/* ------------------------------------------------------------------
   Protecao contra forca bruta
   ------------------------------------------------------------------ */

// origem -> { fails, lockedUntil }
const attempts = new Map();

function getClientKey(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.socket.remoteAddress || 'desconhecido';
}

function isLocked(key) {
    const rec = attempts.get(key);
    if (!rec) return false;
    if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
    if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
        attempts.delete(key); // janela expirou, limpa
    }
    return false;
}

function registerFailure(key) {
    const rec = attempts.get(key) || { fails: 0, lockedUntil: 0 };
    rec.fails++;
    if (rec.fails >= MAX_ATTEMPTS) {
        rec.lockedUntil = Date.now() + LOCKOUT_MS;
        rec.fails = 0;
        console.log(`[SEGURANCA] Origem ${key} bloqueada por ${LOCKOUT_MS / 1000}s apos ${MAX_ATTEMPTS} tentativas.`);
    }
    attempts.set(key, rec);
}

function clearFailures(key) {
    attempts.delete(key);
}

wss.on('connection', (ws, req) => {
    let isAuthorizedViewer = false;
    let lastActivity = Date.now();
    const clientKey = getClientKey(req);

    ws.on('message', (message) => {
        lastActivity = Date.now();
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        const type = data.type;

        // Cliente solicita conexão para controlar este computador
        if (type === 'CONNECT_TARGET') {
            if (isLocked(clientKey)) {
                ws.send(JSON.stringify({
                    type: 'CONNECT_ERROR',
                    message: 'Demasiadas tentativas. Aguarde 60 segundos.'
                }));
                return;
            }

            const targetId = (data.targetId || '').replace(/\s+/g, '');
            const pass = data.password || '';

            // Resposta generica: nao revela qual campo falhou nem o ID correto
            if (!safeEquals(targetId, hostSession.id) ||
                (hostSession.password && !safeEquals(pass, hostSession.password))) {
                registerFailure(clientKey);
                ws.send(JSON.stringify({
                    type: 'CONNECT_ERROR',
                    message: 'ID ou senha inválidos.'
                }));
                return;
            }

            clearFailures(clientKey);

            // Autoriza este WebSocket a receber frames e enviar inputs
            isAuthorizedViewer = true;
            viewers.add(ws);

            ws.send(JSON.stringify({
                type: 'CONNECTED_SUCCESS',
                targetId: hostSession.id
            }));

            // Envia imediatamente o último frame se disponível para eliminar tela preta no primeiro instante
            if (latestFrame) {
                try {
                    ws.send(latestFrame, { binary: true });
                } catch (e) {}
            }

            console.log(`[APP] Operador conectado e autorizado! Total viewers: ${viewers.size}`);
            return;
        }

        // Comandos de input (mouse e teclado)
        if (type === 'INPUT' && isAuthorizedViewer) {
            if (data.payload) sendToEngine(data.payload);
            return;
        }

        // Alterações de FPS / Qualidade
        if (type === 'CONFIG' && isAuthorizedViewer) {
            if (data.payload) sendToEngine(data.payload);
            return;
        }
    });

    ws.on('close', () => {
        if (isAuthorizedViewer) {
            viewers.delete(ws);
            clearInterval(idleTimer);
            console.log(`[APP] Operador desconectado. Restantes: ${viewers.size}`);
        }
    });

    // Encerra sessoes esquecidas: evita que um link público fique aberto indefinidamente
    const idleTimer = setInterval(() => {
        if (Date.now() - lastActivity > VIEWER_TIMEOUT_MS) {
            console.log('[SEGURANCA] Sessao encerrada por inatividade.');
            try {
                ws.send(JSON.stringify({
                    type: 'HOST_DISCONNECTED',
                    message: 'Sessão encerrada por inatividade.'
                }));
            } catch (e) {}
            ws.close();
        }
    }, 60 * 1000);
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  ACESSODESK ULTRA INICIADO COM SUCESSO!`);
    console.log(`  Sessao ID     : ${hostSession.id}`);
    console.log(`  Senha         : ${hostSession.password}`);
    if (hostSession.weakDefaultPassword) {
        console.log(`  AVISO         : senha temporaria. Defina ACCESS_PASSWORD para uma senha sua.`);
    }
    console.log(`  Interface Web : http://localhost:${PORT}`);
    console.log(`  API Status    : http://localhost:${PORT}/api/status`);
    console.log(`=======================================================`);
    saveSession();
    startEngine();
    startCloudflareTunnel();
});

process.on('SIGINT', () => {
    if (engineProcess) engineProcess.kill();
    if (tunnelProcess) tunnelProcess.kill();
    process.exit(0);
});

