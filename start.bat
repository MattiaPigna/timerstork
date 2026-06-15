@echo off
echo.
echo  Installazione dipendenze...
call npm install
echo.
echo  Avvio server StorkLeague...
echo.
node server.js
pause
