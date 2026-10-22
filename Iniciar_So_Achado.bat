@echo off
chcp 65001 >nul
title SÓ ACHADO - Painel e Site de Afiliados
echo ========================================================
echo   Iniciando o site SÓ ACHADO em http://127.0.0.1:3000
echo ========================================================
start "" "http://127.0.0.1:3000"
python "%~dp0server.py"
pause
