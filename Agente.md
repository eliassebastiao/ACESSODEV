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

> **Nota de segurança:** `/api/status` só devolve a senha quando o pedido vem de `localhost`.
> Via link público, a senha **não** é exposta. Para credenciais use o `session_info.json`
> ou `GET /api/credentials` a partir da própria máquina.

---

## 2. Como o Agente Deve Iniciar o Servidor

⚠️ **ATENÇÃO — CAUSA #1 DE TELA PRETA:** A captura de tela do Windows **exige uma sessão gráfica interativa**.
Se o processo for iniciado por um meio isolado do desktop (serviço do Windows, sessão 0, SSH, terminal
sem desktop), a captura retorna **sempre imagem preta**, mesmo com rede e servidor perfeitos.

### ✅ Início Recomendado (dentro da sessão gráfica)

```powershell
cd c:\Users\HP\Desktop\ACESSODEV
.\INICIAR_SILENCIOSO.bat
```

Se o agente **não** tem acesso ao desktop, deve instalar como tarefa agendada **uma única vez**
(usuário executa como administrador):

```powershell
schtasks /create /tn "AcessoDeskUltra" /tr "c:\Users\HP\Desktop\ACESSODEV\INICIAR_SILENCIOSO.bat" /sc onlogon /rl highest /f
```

Depois disso, o app sobe automaticamente em cada login do Windows, **sempre dentro da sessão gráfica**.

### 🔍 Como o Agente Verifica se a Captura Está Funcional

Consulte `http://localhost:8080/api/status` e leia o campo `desktop`:

| Valor | Significado | Ação |
|---|---|---|
| `"OK"` | ✅ Captura funcionando | Pode conectar normalmente |
| `"ABSENT"` | ❌ Sem sessão gráfica | **A tela PRETA é esperada** — reinstale via tarefa agendada |

Teste definitivo de captura (a partir da própria máquina, com token):
```
node -e "const s=require('./session_info.json');console.log('http://localhost:8080/api/screenshot?token='+s.id+s.password)"
```

---

## 3. Diagnóstico Completo da Tela Preta

Siga esta ordem de verificação:

| Passo | Comando / URL | Resultado esperado |
|---|---|---|
| 1 | `GET /api/status` | `"engineReady": true` |
| 2 | `GET /api/status` | `"desktop": "OK"` ⚠️ **se `ABSENT`, a tela PRETA é esperada** |
| 3 | `GET /api/status` | `"hasFrames": true` |
| 4 | `GET /api/screenshot` | Deve retornar um JPEG com a tela do desktop |
| 5 | `GET /api/status` | `"activeViewers": 1` após o operador conectar |

- **Se `desktop: ABSENT`** → a captura é preta por falta de sessão gráfica. Execute o `INSTALAR.bat` como administrador.
- **Se `desktop: OK` mas a tela continua preta** → provavelmente é **cache do navegador**. Peça ao operador para fazer `Ctrl+F5` (recarregamento forçado).
- **Se `desktop: OK` e `/api/screenshot` mostra a tela, mas o canvas continua preto** → o problema é no frontend do operador. Verifique se ele está usando a versão mais recente do `public/app.js`.

---

## 4. Como Obter a Sessão, Senha e Link Mundial no Terminal

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

## 5. Como Acessar este PC a Partir de Qualquer Lugar do Mundo

1. Abra o navegador em qualquer dispositivo (celular, notebook de trabalho, servidor remoto).
2. Acesse a URL que está em `publicUrl` (ex: `https://xxxx.trycloudflare.com`).
3. Digite o **ID** e a **Senha** do PC e clique em **"Conectar e Assumir Controle"**.
4. O controle de tela, mouse e teclado funcionará com 100% de precisão e fluidez via Internet.
