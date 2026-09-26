const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const net = require('net');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;
const ENGINE_PORT = 48002;
const SESSION_FILE = path.join(__dirname, 'session_info.json');

let hostSession = {
    id: Math.floor(100000 + Math.random() * 900000).toString(),
    password: process.env.ACCESS_PASSWORD || '1234',
    status: 'starting',
    startedAt: new Date().toISOString(),
    port: PORT,
    publicUrl: null,
    tunnelStatus: 'starting',
    desktop: 'UNKNOWN'
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
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    res.json({
        ok: true,
        session: hostSession,
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

app.get('/api/screenshot', (req, res) => {
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
wss.on('connection', (ws) => {
    let isAuthorizedViewer = false;

    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        const type = data.type;

        // Cliente solicita conexão para controlar este computador
        if (type === 'CONNECT_TARGET') {
            const targetId = (data.targetId || '').replace(/\s+/g, '');
            const pass = data.password || '';

            // Validação direta contra a sessão deste Host
            if (targetId !== hostSession.id) {
                ws.send(JSON.stringify({
                    type: 'CONNECT_ERROR',
                    message: `ID incorreto. O ID deste computador é ${hostSession.id}`
                }));
                return;
            }

            if (hostSession.password && pass !== hostSession.password) {
                ws.send(JSON.stringify({
                    type: 'CONNECT_ERROR',
                    message: 'Senha incorreta para acesso remoto.'
                }));
                return;
            }

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
            console.log(`[APP] Operador desconectado. Restantes: ${viewers.size}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  ACESSODESK ULTRA INICIADO COM SUCESSO!`);
    console.log(`  Sessao ID     : ${hostSession.id}`);
    console.log(`  Senha Padrao  : ${hostSession.password}`);
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

