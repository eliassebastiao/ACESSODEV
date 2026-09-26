@echo off
chcp 65001 >nul
title AcessoDesk Ultra - Instalador
cd /d "%~dp0"

echo ===================================================
echo   ACESSODESK ULTRA - INSTALACAO PERMANENTE
echo ===================================================
echo.
echo Este instalador cria uma tarefa agendada do Windows
echo que inicia o AcessoDesk automaticamente no login,
echo DENTRO da sua sessao grafica interativa.
echo.
echo Isso e ESSENCIAL: sem sessao grafica, a captura de
echo tela do Windows devolve sempre uma imagem preta.
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado! Instale em https://nodejs.org
    pause
    exit /b 1
)

if not exist "ScreenHostEngine.exe" (
    echo [ERRO] ScreenHostEngine.exe nao encontrado!
    pause
    exit /b 1
)

echo [1/3] Verificando privilegios de administrador...
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo [!] Precisa executar como ADMINISTRADOR.
    echo     Clique com o botao direito neste arquivo e
    echo     escolha "Executar como administrador".
    echo.
    pause
    exit /b 1
)

echo [2/3] Registrando tarefa agendada na sessao interativa...
schtasks /create /tn "AcessoDeskUltra" /tr "\"%cd%INICIAR_SILENCIOSO.bat\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Falha ao criar a tarefa agendada.
    pause
    exit /b 1
)
echo       Tarefa "AcessoDeskUltra" criada com sucesso!

echo [3/3] Iniciando o aplicativo na sua sessao...
start "" /b cmd /c "cd /d \"%cd%\" && INICIAR_SILENCIOSO.bat"

echo.
echo ===================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo.
echo   O AcessoDesk agora inicia automaticamente
echo   sempre que voce ligar este computador.
echo.
echo   Para INICIAR AGORA, abra:
echo   %cd%INICIAR_SILENCIOSO.bat
echo.
echo   Para DESINSTALAR, execute:
echo   schtasks /delete /tn "AcessoDeskUltra" /f
echo ===================================================
echo.
pause
