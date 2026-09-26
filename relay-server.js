const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 9000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'AnyConnect Relay Signaling Server', time: Date.now() }));
});

const wss = new WebSocket.Server({ server });

// Map: peerId -> { ws, role: 'host' | 'client', targetId: string }
const peers = new Map();

wss.on('connection', (ws) => {
    let currentId = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        const type = data.type;

        if (type === 'REGISTER_HOST') {
            currentId = data.id;
            peers.set(currentId, { ws, role: 'host', password: data.password || '' });
            ws.send(JSON.stringify({ type: 'REGISTERED', id: currentId }));
            console.log(`[RELAY] Host registered: ${currentId}`);
            return;
        }

        if (type === 'CONNECT_TARGET') {
            const targetId = data.targetId;
            const target = peers.get(targetId);
            if (!target) {
                ws.send(JSON.stringify({ type: 'CONNECT_ERROR', message: 'Computador remoto offline ou ID inválido' }));
                return;
            }
            if (target.password && target.password !== data.password) {
                ws.send(JSON.stringify({ type: 'CONNECT_ERROR', message: 'Senha incorreta para acesso remoto' }));
                return;
            }

            // Link them
            currentId = 'client_' + Math.random().toString(36).substring(2, 9);
            peers.set(currentId, { ws, role: 'client', targetId });
            
            // Notify host and client
            target.ws.send(JSON.stringify({ type: 'CLIENT_ATTACHED', clientId: currentId }));
            ws.send(JSON.stringify({ type: 'CONNECTED_SUCCESS', targetId }));
            console.log(`[RELAY] Client ${currentId} connected to Host ${targetId}`);
            return;
        }

        if (type === 'INPUT') {
            const peer = peers.get(currentId);
            if (peer && peer.role === 'client' && peer.targetId) {
                const target = peers.get(peer.targetId);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                    target.ws.send(JSON.stringify({ type: 'REMOTE_INPUT', payload: data.payload }));
                }
            }
            return;
        }

        if (type === 'CONFIG') {
            const peer = peers.get(currentId);
            if (peer && peer.role === 'client' && peer.targetId) {
                const target = peers.get(peer.targetId);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                    target.ws.send(JSON.stringify({ type: 'REMOTE_CONFIG', payload: data.payload }));
                }
            }
            return;
        }
    });

    ws.on('close', () => {
        if (currentId && peers.has(currentId)) {
            const p = peers.get(currentId);
            if (p.role === 'host') {
                // notify any clients connected to this host
                for (const [cId, client] of peers.entries()) {
                    if (client.targetId === currentId) {
                        try {
                            client.ws.send(JSON.stringify({ type: 'HOST_DISCONNECTED', message: 'O computador host foi desconectado' }));
                        } catch(e) {}
                    }
                }
            }
            peers.delete(currentId);
            console.log(`[RELAY] Disconnected: ${currentId}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`[RELAY] Servidor de Sinalização e Conexão rodando na porta ${PORT}`);
});
