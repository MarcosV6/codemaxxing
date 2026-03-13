@echo off
:: codemaxxing — Windows installer
:: Usage (Run as Administrator): curl -fsSL -o %TEMP%\install-codemaxxing.bat https://raw.githubusercontent.com/MarcosV6/codemaxxing/main/install.bat && %TEMP%\install-codemaxxing.bat

echo.
echo   codemaxxing - your code. your model. no excuses.
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js found
    node --version
) else (
    echo [!!] Node.js not found.
    echo.
    echo Please install Node.js first:
    echo   1. Go to https://nodejs.org
    echo   2. Download the LTS version
    echo   3. Run the installer (click Next through everything)
    echo   4. Restart this terminal and run this script again
    echo.
    pause
    exit /b 1
)

:: Install codemaxxing
echo.
echo Installing codemaxxing...
call npm install -g codemaxxing

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] codemaxxing installed successfully!
    echo.
    echo Next steps:
    echo   1. Start a local LLM server (LM Studio, Ollama, etc.)
    echo   2. Open a new terminal and run: codemaxxing
    echo.
) else (
    echo.
    echo [ERROR] Installation failed. Try running as Administrator.
)

pause
