# ⚡ AcessoDesk Ultra (ACESSODEV)

> **Aplicativo Open Source de Acesso e Controle Remoto Total de Computadores via Internet e Rede Local.**  
> Alternativa moderna, veloz e sem limites estilo AnyDesk / TeamViewer, com túnel seguro e emulação direta de hardware.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6.svg)](https://microsoft.com/windows)
[![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare-Tunnel%20Integrated-F38020.svg)](https://cloudflare.com)

---

## 🌟 Principais Recursos

- 🖱️ **Controle Total de Mouse**: Movimentação com sincronização de coordenadas proporcional, clique esquerdo, clique direito, clique do meio e roda de rolagem (*scroll*).
- ⌨️ **Controle Total de Teclado**: Envio de eventos nativos (*Windows Virtual Keys*), suportando teclas de função, atalhos do sistema e digitação fluida.
- 🚀 **Motor Nativo de Alta Performance (`ScreenHostEngine.exe`)**:
  - Captura direta via GDI com streaming TCP contínuo.
  - Renderização em tempo real do cursor do mouse do host.
  - Suporte a 20, 30 e até 60 FPS com ajuste de qualidade JPEG dinâmico.
- 🌐 **Acesso Mundial Instantâneo (Pela Internet / 4G / 5G)**:
  - Túnel Cloudflare integrado automaticamente.
  - Não exige abertura de portas no roteador, nem IP estático, nem configurações de firewall.
- 🤖 **Compatível com Agentes de IA Autônomos**:
  - Acompanha o manual [`Agente.md`](./Agente.md).
  - API de status `/api/status` e arquivo de sincronização `session_info.json` para descoberta de credenciais em linha de comando.
- 🔒 **Sessão Segura com ID & Senha**: ID numérico de 6 dígitos gerado a cada inicialização com autenticação protegida.

---

## 📋 Pré-requisitos

- **Sistema Operacional**: Windows 10 ou 11 (64-bit)
- **Node.js**: Versão 18.x ou superior ([Download Node.js](https://nodejs.org/))
- **Git**: Para clonar o repositório ([Download Git](https://git-scm.com/))

---

## ⚠️ Segurança

Este projeto dá **controle total do computador** a quem tiver o link e a senha.
Leia antes de usar em qualquer máquina real.

### Proteções já implementadas

| Proteção | Comportamento |
|---|---|
| Senha forte por omissão | Gerada aleatoriamente a cada arranque (10 caracteres). Não é mais `1234`. |
| Proteção contra força bruta | 5 tentativas erradas → bloqueio de 60 segundos para a origem. |
| Resposta genérica | ID errado e senha errada devolvem a mesma mensagem, para não revelar o ID válido. |
| Comparação em tempo constante | Impede ataques de temporização sobre a senha. |
| Senha não é exposta pela internet | `/api/status` só devolve a senha em pedidos feitos de `localhost`. |
| Capturas de ecrã protegidas | `/api/screenshot` exige um token. |
| Encerramento por inatividade | Sessões abertas encerram ao fim de 12 horas. |

### O que NÃO é protegido — leia com atenção

- **O link `https://xxxx.trycloudflare.com` é público.** Qualquer pessoa com o link
  vê o formulário de login. A única barreira é o par **ID + senha**.
- **Não existe autenticação de dois fatores, nem verificação de identidade.**
- **O túnel é HTTP dentro de HTTPS.** O conteúdo é cifrado em trânsito, mas o
  link em si não é secreto — trate-o como público.
- **O `Input` do host não é isolado.** Quem se ligar pode injetar comandos no
  motor de emulação (`KEYDOWN`, `MOUSE_*`) e assim ultrapassar a palavra-passe
  depois de autenticado.

### Recomendações

1. **Defina a sua própria senha** antes de qualquer uso real:
   ```powershell
   $env:ACCESS_PASSWORD = "uma senha forte e única"
   npm start
   ```
2. **Não reutilize senhas** de outros serviços.
3. **Desligue o túnel quando não precisar** — basta encerrar o processo.
4. **Use apenas em máquinas e redes de confiança.** Este software é para
   administração do próprio equipamento.

---

## ⚠️ IMPORTANTE: Sessão Gráfica do Windows (Tela Preta)

A captura de tela do Windows **só funciona dentro de uma sessão gráfica interativa**.

Se você iniciar o aplicativo por um meio que **não** tem acesso ao seu desktop
(como um serviço do Windows, sessão 0, SSH, ou um terminal isolado), a captura
vai retornar **sempre uma imagem preta** — mesmo que o servidor e a rede
estejam 100% funcionando.

### 🚨 Solução: use o `INSTALAR.bat`

Clique com o **botão direito** em `INSTALAR.bat` e escolha
**"Executar como administrador"**. Ele registra o aplicativo como uma
**tarefa agendada do Windows** que roda dentro da sua sessão gráfica a cada
login, garantindo que a captura funcione sempre.

Depois de instalado, o app inicia automaticamente junto com o Windows.
Para iniciar manualmente a qualquer momento, use `INICIAR_SILENCIOSO.bat`.

### 🔍 Como verificar se está tudo certo

Acesse `http://localhost:8080/api/status` e veja o campo `desktop`:

| Valor | Significado |
|---|---|
| `"OK"` | ✅ Tudo certo — a captura funciona |
| `"ABSENT"` | ❌ Sem sessão gráfica — a tela vai ficar preta |

Se aparecer `"ABSENT"`, execute o `INSTALAR.bat` como administrador.

Você também pode testar a captura diretamente abrindo
`http://localhost:8080/api/screenshot` no navegador — se aparecer a sua tela,
está tudo funcionando.

### Para Desinstalar
```powershell
schtasks /delete /tn "AcessoDeskUltra" /f
```

---

## 🚀 Instalação Rápida (Clone & Run)

### 1. Clonar o repositório:
```bash
git clone https://github.com/eliassebastiao/ACESSODEV.git
cd ACESSODEV
```

### 2. Instalar as dependências:
```bash
npm install
```

### 3. Iniciar o aplicativo:

**Instalação Recomendada (sessão gráfica garantida):**
- Clique com o **botão direito** em `INSTALAR.bat` → **"Executar como administrador"**.
- O app passa a iniciar automaticamente a cada login do Windows.

**Execução manual:**
- **Via NPM / Node**:
  ```bash
  npm start
  ```
- **Via Executável do Windows**:
  Dê duplo clique em `AcessoDesk.exe`
- **Via Batch Script**:
  Dê duplo clique em `INICIAR_ACESSODESK.bat`

---

## 🖥️ Como Usar

### No Computador que será Acessado (Host):
1. Inicie o aplicativo com `npm start` (ou `INICIAR_ACESSODESK.bat`).
2. O painel abrirá automaticamente em `http://localhost:8080`.
3. Veja o seu **ID de Conexão Rápida** (Ex: `620 042`) e a **Senha** (padrão: `1234`).
4. Se o operador estiver na mesma rede, passe o ID. Se estiver fora de casa/internet, passe também o link exibido em **"🌐 Link de Acesso Mundial"**.

### No Computador que vai Controlar (Operador / Cliente):
1. Acesse o painel pelo navegador (seja localmente ou pelo link mundial `https://xxxx.trycloudflare.com`).
2. No painel da direita (**"Controlar Outro PC"**):
   - Digite o **ID do Computador Remoto**.
   - Digite a **Senha de Acesso**.
3. Clique em **"Conectar e Assumir Controle"**.
4. A tela do computador remoto aparecerá instantaneamente com controle total!

---

## 🤖 Guia para Agentes de Inteligência Artificial

Consulte o arquivo dedicado: **[`Agente.md`](./Agente.md)**.

Ele detalha como agentes podem:
- Verificar o status via `GET http://localhost:8080/api/status`.
- Iniciar o servidor de forma silenciosa em segundo plano.
- Extrair o ID, Senha e URL Mundial a partir do `session_info.json`.

---

## 🛠️ Compilação dos Binários C# (Opcional)

Os binários compilados já estão inclusos no repositório. Caso queira recompilar a partir do código fonte:

```bash
# Compilar o motor de captura e input
npm run build:engine

# Compilar o inicializador Windows
npm run build:launcher
```

*(Utiliza o compilador nativo `csc.exe` já presente no Windows em `Microsoft.NET`)*.

---

## 📂 Estrutura do Projeto

```
ACESSODEV/
├── public/                 # Interface Web do Host e do Operador
│   ├── index.html          # Dashboard e Canvas de Streaming
│   ├── style.css           # Estilos e responsividade
│   └── app.js              # Lógica de conexão WebSockets e envio de inputs
├── ScreenHostEngine.cs     # Código-fonte C# do motor de captura & emulação de teclado/mouse
├── ScreenHostEngine.exe    # Binário compilado do motor de captura
├── Launcher.cs             # Código-fonte C# do lançador Windows
├── AcessoDesk.exe          # Executável do aplicativo
├── server.js               # Servidor Node.js (WebSockets, HTTP e Túnel Cloudflare)
├── relay-server.js         # Servidor de sinalização standalone
├── INSTALAR.bat            # Instalador: cria tarefa agendada na sessão gráfica
├── INICIAR_SILENCIOSO.bat  # Inicializador automático (usado pela tarefa agendada)
├── INICIAR_ACESSODESK.bat  # Inicializador manual em 1 clique
├── session_info.json       # Estado atual da sessão (ID, Senha, Link Mundial)
├── Agente.md               # Manual de automação para Agentes de IA
├── LICENSE                 # Licença MIT
└── README.md               # Documentação principal
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [`LICENSE`](./LICENSE) para mais informações.

Desenvolvido por **Elias Sebastião** — Contribuições e pull requests são bem-vindos!

