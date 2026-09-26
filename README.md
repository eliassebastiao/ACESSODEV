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
Você pode iniciar de qualquer uma das três formas:

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
├── INICIAR_ACESSODESK.bat  # Inicializador em 1 clique
├── session_info.json       # Estado atual da sessão (ID, Senha, Link Mundial)
├── Agente.md               # Manual de automação para Agentes de IA
├── LICENSE                 # Licença MIT
└── README.md               # Documentação principal
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [`LICENSE`](./LICENSE) para mais informações.

Desenvolvido por **Elias Sebastião** — Contribuições e pull requests são bem-vindos!

