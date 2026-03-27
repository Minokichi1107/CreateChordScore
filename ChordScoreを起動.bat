@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo  ChordPlayer を起動しています...
echo  URL: http://localhost:8766/chord_player.html
echo.

:: Python 3.11 を優先、なければ python コマンドで試す
py -3.11 server.py 2>nul
if errorlevel 1 (
    python server.py 2>nul
    if errorlevel 1 (
        echo.
        echo  [エラー] Python が見つかりません。
        echo  Python 3.11 がインストールされているか確認してください。
        pause
        exit /b 1
    )
)
pause
