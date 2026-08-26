@echo off
setlocal
title Prototipo - Operacoes e Garantias

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "VITE_JS=%~dp0node_modules\vite\bin\vite.js"

if not exist "%NODE_EXE%" goto node_missing
if not exist "%VITE_JS%" goto dependencies_missing

echo.
echo Iniciando o prototipo em http://127.0.0.1:4173/
echo Para encerrar, pressione Ctrl+C nesta janela.
echo.

if /I "%~1"=="--no-browser" goto start_server
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173/'"

:start_server
"%NODE_EXE%" "%VITE_JS%" --configLoader runner --host 127.0.0.1 --port 4173
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo O servidor foi encerrado com o codigo %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%

:node_missing
echo.
echo O runtime Node.js do Codex nao foi encontrado neste computador.
echo Instale o Node.js LTS e execute: npm install ^&^& npm run dev
echo.
pause
exit /b 1

:dependencies_missing
echo.
echo As dependencias do projeto nao foram encontradas.
echo Instale o Node.js LTS e execute: npm install
echo.
pause
exit /b 1
