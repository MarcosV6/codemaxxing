@echo off
:: codemaxxing — Windows installer
:: Installs Node.js (if needed) and codemaxxing

echo.
echo   codemaxxing - your code. your model. no excuses.
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js found
    node --version
    goto install_codemaxxing
)

echo [..] Node.js not found. Installing via winget...
echo.

:: Try winget (built into Windows 10/11)
where winget >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo [OK] Node.js installed! Refreshing PATH...
        echo.
        :: Refresh PATH to pick up Node.js without reopening terminal
        for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSPATH=%%b"
        for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USRPATH=%%b"
        set "PATH=%SYSPATH%;%USRPATH%"
        :: Check if npm is now available
        where npm >nul 2>nul
        if %ERRORLEVEL% EQU 0 (
            goto install_codemaxxing
        ) else (
            echo.
            echo ** Node.js installed but PATH needs a refresh. **
            echo    Close this terminal, open a new one, and run:
            echo    npm install -g codemaxxing
            echo.
            pause
            exit /b 0
        )
    )
)

:: Fallback: download installer directly
echo [..] winget not available. Downloading Node.js installer...
curl -fsSL -o %TEMP%\node-install.msi https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
if %ERRORLEVEL% EQU 0 (
    echo [..] Running Node.js installer...
    msiexec /i %TEMP%\node-install.msi /qn
    echo.
    echo [OK] Node.js installed!
    echo.
    echo ** IMPORTANT: Close this terminal and open a new one, then run: **
    echo    npm install -g codemaxxing
    echo.
    pause
    exit /b 0
) else (
    echo [ERROR] Could not download Node.js.
    echo   Please install manually from https://nodejs.org
    pause
    exit /b 1
)

:install_codemaxxing
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
