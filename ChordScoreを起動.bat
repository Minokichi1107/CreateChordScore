@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo  ChordScore Editor を起動しています...
echo  URL: http://localhost:8767/index.html
echo.
py -3.11 server.py 2>nul
if errorlevel 1 python server.py
pause
