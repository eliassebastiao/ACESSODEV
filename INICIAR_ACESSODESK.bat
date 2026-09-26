@echo off
title AcessoDesk Ultra - Inicializador Rapido
cd /d "%~dp0"

echo ===================================================
echo     INICIANDO ACESSODESK ULTRA (ACESSO REMOTO)
echo ===================================================
echo.
echo [1/2] Iniciando servico de streaming e controle...
start /b "" node server.js

echo [2/2] Abrindo interface no navegador...
timeout /t 2 /nobreak >nul
start http://localhost:8080

echo.
echo ===================================================
echo  AcessoDesk Ultra esta em execucao!
echo  Para fechar o servico, encerre esta janela.
echo ===================================================
echo.
pause
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im ScreenHostEngine.exe >nul 2>&1
