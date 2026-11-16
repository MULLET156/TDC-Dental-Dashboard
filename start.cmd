@echo off
rem Starts the TDC Dental Dashboard by hand (Windows). Close this window to stop it.
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
if not exist certs\dev-cert.pem node scripts\make-dev-cert.js
node server.js
pause
