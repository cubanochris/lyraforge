@echo off
echo.
echo  AI Script Generator — Starting up...
echo.

:: Check if node_modules exists
if not exist "node_modules\" (
  echo  Installing dependencies...
  npm install
  echo.
)

:: Check if .env has been configured
findstr /C:"your_api_key_here" .env >nul 2>&1
if %errorlevel%==0 (
  echo  WARNING: You haven't set your ANTHROPIC_API_KEY in .env yet!
  echo  Open .env and replace "your_api_key_here" with your actual key.
  echo  Get your key at: https://console.anthropic.com
  echo.
  pause
  exit /b 1
)

:: Start the server
echo  Starting server on http://localhost:3001
echo  Press Ctrl+C to stop
echo.
npm run dev
