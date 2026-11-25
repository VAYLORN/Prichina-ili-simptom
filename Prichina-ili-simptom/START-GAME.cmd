@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Причина или симптом? — сервер игры
if not exist "node\node.exe" goto :unzip
if not exist "server\index.mjs" goto :unzip

rem The game is already running: just open the host panel again.
"node\node.exe" server\running.mjs
if not errorlevel 1 exit /b 0

echo.
if exist "data\operator-pin.txt" (
  echo   PIN ведущего:
  type "data\operator-pin.txt"
  echo.
)
echo.
echo   Не закрывайте это окно во время игры: это сервер.
echo   Закрыли окно — игра остановилась, всё сохранено. Запустите START-GAME.cmd снова.
if not defined OPEN_BROWSER set OPEN_BROWSER=1
"node\node.exe" server\index.mjs
echo.
echo   Сервер остановлен.
pause
exit /b 0

:unzip
echo.
echo   Сначала распакуйте архив целиком:
echo   правой кнопкой по архиву — «Извлечь все», затем откройте
echo   распакованную папку и запустите START-GAME.cmd оттуда.
echo.
pause
exit /b 1
