@echo off
title AcessoDesk Ultra - Inicializador Silencioso
cd /d "%~dp0"

REM Garante que o Node existe antes de tentar executar
where node >nul 2>&1
if errorlevel 1 exit /b 1

REM Evita multiplas instancias simultaneas
tasklist /fi "imagename eq node.exe" | find /i "node.exe" >nul
if not errorlevel 1 (
    REM Ja existe um node rodando - nao inicia outro
    exit /b 0
)

start "" /b node server.js
exit /b 0
