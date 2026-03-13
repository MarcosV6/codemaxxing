#!/usr/bin/env bash
# codemaxxing — one-line installer
# Usage: bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosV6/codemaxxing/main/install.sh)"

set -e

BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
RED='\033[31m'
RESET='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "   ___          _                               _             "
echo "  / __\___   __| | ___ _ __ ___   __ ___  _____(_)_ __   __ _ "
echo " / /  / _ \ / _\` |/ _ \ '_ \` _ \ / _\` \ \/ / \/ | '_ \ / _\` |"
echo "/ /__| (_) | (_| |  __/ | | | | | (_| |>  <> <| | | | | (_| |"
echo "\____/\___/ \__,_|\___|_| |_| |_|\__,_/_/\_/_/\_\_|_| |_|\__, |"
echo "                                                         |___/ "
echo -e "${RESET}"
echo -e "${BOLD}your code. your model. no excuses.${RESET}"
echo ""

# Check for Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✔${RESET} Node.js found: ${NODE_VERSION}"
else
    echo -e "${RED}✗${RESET} Node.js not found. Installing..."

    # Detect OS and install Node
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo "  Installing via Homebrew..."
            brew install node
        else
            echo -e "${RED}Error: Please install Node.js from https://nodejs.org${RESET}"
            echo "  Or install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        echo "  Installing via apt..."
        sudo apt update && sudo apt install -y nodejs npm
    elif [[ -f /etc/arch-release ]]; then
        # Arch
        echo "  Installing via pacman..."
        sudo pacman -S --noconfirm nodejs npm
    elif [[ -f /etc/fedora-release ]]; then
        # Fedora
        echo "  Installing via dnf..."
        sudo dnf install -y nodejs npm
    else
        echo -e "${RED}Error: Please install Node.js from https://nodejs.org${RESET}"
        exit 1
    fi

    if command -v node &> /dev/null; then
        echo -e "${GREEN}✔${RESET} Node.js installed: $(node --version)"
    else
        echo -e "${RED}Error: Node.js installation failed. Install manually from https://nodejs.org${RESET}"
        exit 1
    fi
fi

# Install codemaxxing
echo ""
echo "Installing codemaxxing..."
npm install -g codemaxxing

if command -v codemaxxing &> /dev/null; then
    echo ""
    echo -e "${GREEN}${BOLD}✔ codemaxxing installed successfully!${RESET}"
    echo ""
    echo "Next steps:"
    echo "  1. Start a local LLM server (LM Studio, Ollama, etc.)"
    echo "  2. Run: codemaxxing"
    echo ""
    echo "Or connect to a remote provider:"
    echo "  codemaxxing --base-url https://api.openai.com/v1 --api-key sk-... --model gpt-4o"
    echo ""
else
    echo -e "${RED}Installation may have failed. Try: npm install -g codemaxxing${RESET}"
fi
