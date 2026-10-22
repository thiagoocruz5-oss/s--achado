@echo off
chcp 65001 >nul
title SÓ ACHADO - Publicar Atualizações na Vercel
echo ========================================================
echo   Enviando novos produtos para a Vercel (GitHub)...
echo ========================================================
cd /d "%~dp0"
git add -A
git commit -m "Atualizacao de produtos So Achado"
git push
echo.
echo ========================================================
echo   Pronto! Em ~15 segundos seu site na Vercel estará atualizado!
echo ========================================================
pause
