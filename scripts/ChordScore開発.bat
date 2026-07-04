@echo off
chcp 65001 >nul

REM ==========================================
REM GuitarChordScore 開発環境 起動バッチ
REM ==========================================

REM プロジェクトフォルダへ移動
cd /d "%~dp0.."

echo.
echo ==========================================
echo   GuitarChordScore 開発環境を起動しています...
echo ==========================================
echo.

REM ------------------------------------------
REM 開発サーバー起動
REM ------------------------------------------
start "ChordScore Server" cmd /k ^
"py -3.11 server.py 2>nul || python server.py"

REM 少し待機
timeout /t 2 /nobreak >nul

REM ------------------------------------------
REM VS Code起動
REM ------------------------------------------
start "" "C:\Users\yasut\AppData\Local\Programs\Microsoft VS Code\Code.exe" "%CD%"

REM ------------------------------------------
REM Chromeで開発ページを開く
REM ------------------------------------------

start "" chrome "https://claude.ai/new"

timeout /t 1 /nobreak >nul

start "" chrome "https://chatgpt.com/"
REM ------------------------------------------
REM このバッチは終了
REM ------------------------------------------
exit