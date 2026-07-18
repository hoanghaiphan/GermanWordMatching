@echo off
cd /d "%~dp0"
echo Starting German Word Matching on http://localhost:8080 ...
start "" http://localhost:8080
node server.js 8080
if errorlevel 1 (
  echo.
  echo Node.js is required. Install from https://nodejs.org/ or run:
  echo   python -m http.server 8080
  pause
)
