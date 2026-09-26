# 🤖 Guia de Operação para o Agente de IA (Agente.md)

Este documento foi criado especificamente para que **Agentes Autônomos de IA** possam verificar o estado, iniciar o servidor de acesso remoto e obter a sessão, senha e o link público de acesso mundial deste computador de forma 100% autônoma.

---

## ⚡ Acesso Mundial (Pela Internet) Já Integrado e Automático!
O repositório já inclui o **Cloudflare Tunnel (`cloudflared.exe`) nativamente**.
Ao iniciar o servidor, ele **abre automaticamente uma rota pública criptografada na internet** e grava a URL mundial em `session_info.json`.

Você não precisa abrir portas no roteador, não precisa de IP fixo e funciona em 4G, 5G, Wi-Fi ou qualquer rede externa!

---

## 1. Como Saber se o Servidor já está Aberto

O agente pode verificar o status do servidor através de uma chamada HTTP local ou checando processos no sistema.

### Opção A: Via Endpoint HTTP Local
Execute uma requisição GET em `http://localhost:8080/api/status`.
- **Exemplo de Retorno JSON**:
```json
{
  "ok": true,
  "session": {
    "id": "620042",
    "password": "1234",
    "status": "ready",
    "startedAt": "2026-09-26T16:21:16.883Z",
    "port": 8080,
    "publicUrl": "https://describing-direction-educators-anderson.trycloudflare.com",
    "tunnelStatus": "online"
  },
  "engineReady": true,
  "peersCount": 1,
  "uptime": 120.5
}
```

### Opção B: Lendo o Arquivo de Sessão (`session_info.json`)
Sempre que o servidor sobe, ele grava e atualiza automaticamente o arquivo:
`c:\Users\HP\Desktop\ACESSODEV\session_info.json`

O agente pode simplesmente ler esse arquivo JSON para extrair o `id`, `password` e o `publicUrl` (link mundial).

---

## 2. Como o Agente Deve Iniciar o Servidor

Caso o servidor não esteja aberto, o agente deve executar o seguinte comando em segundo plano no diretório do projeto:

```powershell
cd c:\Users\HP\Desktop\ACESSODEV
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden
```
*(Ou iniciar via `INICIAR_ACESSODESK.bat`)*

Aguarde cerca de 3 a 4 segundos para que o motor de captura (`ScreenHostEngine.exe`) e o túnel mundial da Cloudflare conectem.

---

## 3. Como Obter a Sessão, Senha e Link Mundial no Terminal

O agente pode ler tudo com um comando direto em linha única:

### Via PowerShell:
```powershell
Get-Content -Raw "c:\Users\HP\Desktop\ACESSODEV\session_info.json" | ConvertFrom-Json | Select-Object id, password, publicUrl, status
```

### Via Node.js:
```powershell
node -e "const s = require('./session_info.json'); console.log('LINK:', s.publicUrl, '| ID:', s.id, '| SENHA:', s.password);"
```

---

## 4. Como Acessar este PC a Partir de Qualquer Lugar do Mundo

1. Abra o navegador em qualquer dispositivo (celular, notebook de trabalho, servidor remoto).
2. Acesse a URL que está em `publicUrl` (ex: `https://xxxx.trycloudflare.com`).
3. Digite o **ID** e a **Senha** do PC e clique em **"Conectar e Assumir Controle"**.
4. O controle de tela, mouse e teclado funcionará com 100% de precisão e fluidez via Internet.
