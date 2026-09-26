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
    tunnelStatus: 'starting'
};

let tunnelProcess = null;

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

    console.log('[TUNNEL] Criando link público mundial via Cloudflare Tunnel...');
    hostSession.tunnelStatus = 'connecting';
    saveSession();

    try {
        tunnelProcess = spawn(cloudflaredExe, ['tunnel', '--url', `http://localhost:${PORT}`]);

        tunnelProcess.stderr.on('data', (data) => {
            const output = data.toString();
            const match = output.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
            if (match && !hostSession.publicUrl) {
                hostSession.publicUrl = match[0];
                hostSession.tunnelStatus = 'online';
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
            console.log('[TUNNEL] Conexão Cloudflare fechada. Reconectando em 5s...');
            hostSession.publicUrl = null;
            hostSession.tunnelStatus = 'disconnected';
            saveSession();
            setTimeout(startCloudflareTunnel, 5000);
        });
    } catch (e) {
        console.error('[TUNNEL] Erro ao iniciar:', e.message);
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
        peersCount: peers.size,
        uptime: process.uptime()
    });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const peers = new Map();
let engineProcess = null;
let engineSocket = null;
let engineReady = false;


function startEngine() {
    console.log('[ENGINE] Iniciando ScreenHostEngine nativo...');
    const exePath = path.join(__dirname, 'ScreenHostEngine.exe');
    engineProcess = spawn(exePath, [ENGINE_PORT.toString()]);

    engineProcess.stdout.on('data', (d) => {
        const str = d.toString().trim();
        console.log('[ENGINE OUT]', str);
        if (str.includes('ENGINE_READY')) {
            engineReady = true;
            hostSession.status = 'ready';
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

function broadcastFrame(frameBuffer) {
    for (const [id, peer] of peers.entries()) {
        if (peer.role === 'client' && peer.ws && peer.ws.readyState === WebSocket.OPEN) {
            try {
                peer.ws.send(frameBuffer, { binary: true });
            } catch (err) {}
        }
    }
}

function sendToEngine(cmd) {
    if (engineProcess && engineProcess.stdin && !engineProcess.stdin.destroyed) {
        engineProcess.stdin.write(cmd + '\n');
    }
}
wss.on('connection', (ws) => {
    let currentId = null;

    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        const type = data.type;

        if (type === 'GET_HOST_CONFIG') {
            ws.send(JSON.stringify({
                type: 'HOST_CONFIG',
                id: hostSession.id,
                password: hostSession.password
            }));
            return;
        }

        if (type === 'REGISTER_OPERATOR') {
            currentId = data.id || ('client_' + Math.random().toString(36).substring(2, 9));
            peers.set(currentId, { ws, role: 'operator' });
            ws.send(JSON.stringify({ type: 'REGISTERED', id: currentId }));
            return;
        }

        if (type === 'REGISTER_HOST') {
            currentId = data.id || hostSession.id;
            hostSession.id = currentId;
            if (data.password) hostSession.password = data.password;
            saveSession();

            peers.set(currentId, { ws, role: 'host', password: hostSession.password });
            ws.send(JSON.stringify({ type: 'REGISTERED', id: currentId }));
            console.log(`[APP] Host registrado no servidor com ID: ${currentId} | Senha: ${hostSession.password}`);
            return;
        }

        if (type === 'CONNECT_TARGET') {
            const targetId = (data.targetId || '').replace(/\s+/g, '');
            
            // Verifica se o ID bate com o host local do servidor
            const isLocalHost = (targetId === hostSession.id);
            const target = peers.get(targetId);

            if (!isLocalHost && !target) {
                ws.send(JSON.stringify({
                    type: 'CONNECT_ERROR',
                    message: 'Computador não encontrado ou offline. Verifique o ID.'
                }));
                return;
            }

            const expectedPass = isLocalHost ? hostSession.password : (target ? target.password : '');
            if (expectedPass && expectedPass !== data.password) {
                ws.send(JSON.stringify({
                    type: 'CONNECT_ERROR',
                    message: 'Senha incorreta para acesso remoto.'
                }));
                return;
            }

            currentId = 'client_' + Math.random().toString(36).substring(2, 9);
            peers.set(currentId, { ws, role: 'client', targetId: targetId });

            if (target && target.ws) {
                try {
                    target.ws.send(JSON.stringify({ type: 'CLIENT_ATTACHED', clientId: currentId }));
                } catch (e) {}
            }

            ws.send(JSON.stringify({ type: 'CONNECTED_SUCCESS', targetId: targetId }));
            console.log(`[APP] Conexão bem-sucedida! Cliente ${currentId} -> Host ${targetId}`);
            return;
        }

        if (type === 'INPUT') {
            if (data.payload) sendToEngine(data.payload);
            return;
        }

        if (type === 'CONFIG') {
            if (data.payload) sendToEngine(data.payload);
            return;
        }
    });

    ws.on('close', () => {
        if (currentId && peers.has(currentId)) {
            const p = peers.get(currentId);
            if (p.role === 'host') {
                for (const [cId, client] of peers.entries()) {
                    if (client.targetId === currentId) {
                        try {
                            client.ws.send(JSON.stringify({
                                type: 'HOST_DISCONNECTED',
                                message: 'O computador host encerrou a conexão.'
                            }));
                        } catch (e) {}
                    }
                }
            }
            peers.delete(currentId);
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

