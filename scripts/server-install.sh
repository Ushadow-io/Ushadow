#!/bin/bash
# =============================================================================
# Ushadow Server Install Script (macOS/Linux)
# =============================================================================
# This script sets up a Ushadow server by:
#   - Installing Git, Python, and Docker (if needed)
#   - Cloning the repository
#   - Running the setup
#
# Usage:
#   curl -fsSL https://ushadow.io/server-install.sh | bash
# =============================================================================

VERSION="1.0.0"

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}[$1/4]${NC} $2"
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif [ -f /etc/debian_version ]; then
        echo "debian"
    elif [ -f /etc/redhat-release ]; then
        echo "rhel"
    else
        echo "unknown"
    fi
}

# Check if running as root or with sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo &> /dev/null; then
            SUDO="sudo"
        else
            log_error "This script requires root privileges. Please run as root or install sudo."
            exit 1
        fi
    else
        SUDO=""
    fi
}

# Check if Homebrew is installed (macOS)
check_brew() {
    if [[ "$(detect_os)" == "macos" ]]; then
        if ! command -v brew &> /dev/null; then
            log_info "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

            # Add brew to PATH for Apple Silicon
            if [[ -f /opt/homebrew/bin/brew ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            fi
        fi
    fi
}

# Install Git
install_git() {
    log_step 1 "Checking Git installation..."

    if command -v git &> /dev/null; then
        GIT_VERSION=$(git --version 2>/dev/null)
        log_success "Git already installed ($GIT_VERSION)"
        return 0
    fi

    log_info "Installing Git..."
    OS=$(detect_os)

    case $OS in
        macos)
            check_brew
            brew install git
            ;;
        ubuntu|debian|raspbian)
            $SUDO apt-get update
            $SUDO apt-get install -y git
            ;;
        centos|rhel|fedora|rocky|almalinux)
            $SUDO yum install -y git
            ;;
        *)
            log_error "Please install Git manually: https://git-scm.com/downloads"
            exit 1
            ;;
    esac

    log_success "Git installed"
}

# Install Python
install_python() {
    log_step 2 "Checking Python installation..."

    # Check for python3
    if command -v python3 &> /dev/null; then
        PY_VERSION=$(python3 --version 2>&1)
        log_success "Python already installed ($PY_VERSION)"

        # Install pyyaml
        log_info "Installing Python dependencies..."
        python3 -m pip install --quiet pyyaml 2>/dev/null || true
        return 0
    fi

    log_info "Installing Python..."
    OS=$(detect_os)

    case $OS in
        macos)
            check_brew
            brew install python@3.12
            ;;
        ubuntu|debian|raspbian)
            $SUDO apt-get update
            $SUDO apt-get install -y python3 python3-pip python3-venv
            ;;
        centos|rhel|fedora|rocky|almalinux)
            $SUDO yum install -y python3 python3-pip
            ;;
        *)
            log_error "Please install Python 3 manually: https://python.org/downloads"
            exit 1
            ;;
    esac

    # Install pyyaml
    log_info "Installing Python dependencies..."
    python3 -m pip install --quiet pyyaml 2>/dev/null || true

    log_success "Python installed"
}

# Install Docker
install_docker() {
    log_step 3 "Checking Docker installation..."

    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1)
        log_success "Docker already installed (version $DOCKER_VERSION)"
        return 0
    fi

    log_info "Installing Docker..."
    OS=$(detect_os)

    case $OS in
        macos)
            check_brew
            brew install --cask docker
            log_info "Starting Docker Desktop..."
            open -a Docker
            log_info "Waiting for Docker to start (this may take 30-60 seconds)..."
            for i in {1..18}; do
                if docker info &>/dev/null; then
                    log_success "Docker is running"
                    break
                fi
                echo "    Still waiting... ($((i * 5)) seconds)"
                sleep 5
            done
            ;;
        ubuntu|debian|raspbian)
            # Remove old versions
            $SUDO apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

            # Install prerequisites
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg lsb-release

            # Add Docker's official GPG key
            $SUDO install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            $SUDO chmod a+r /etc/apt/keyrings/docker.gpg

            # Set up repository
            echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
                $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

            # Install Docker
            $SUDO apt-get update
            $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        centos|rhel|fedora|rocky|almalinux)
            # Remove old versions
            $SUDO yum remove -y docker docker-client docker-client-latest docker-common \
                docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

            # Install prerequisites
            $SUDO yum install -y yum-utils

            # Add Docker repo
            $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

            # Install Docker
            $SUDO yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        *)
            log_warn "Unknown OS. Attempting generic Docker install..."
            curl -fsSL https://get.docker.com | $SUDO sh
            ;;
    esac

    # Start and enable Docker (Linux only)
    if [ "$OS" != "macos" ]; then
        $SUDO systemctl start docker 2>/dev/null || true
        $SUDO systemctl enable docker 2>/dev/null || true

        # Add current user to docker group
        if [ -n "$SUDO_USER" ]; then
            $SUDO usermod -aG docker "$SUDO_USER"
            log_info "Added $SUDO_USER to docker group (re-login may be required)"
        elif [ -n "$USER" ] && [ "$USER" != "root" ]; then
            $SUDO usermod -aG docker "$USER"
            log_info "Added $USER to docker group (re-login may be required)"
        fi
    fi

    log_success "Docker installed"
}

# Clone and setup repository
setup_repository() {
    log_step 4 "Setting up Ushadow repository..."

    INSTALL_DIR="${HOME}/ushadow"
    REPO_URL="https://github.com/Ushadow-io/Ushadow.git"

    if [ -d "$INSTALL_DIR" ]; then
        log_info "Directory exists, pulling latest..."
        cd "$INSTALL_DIR"
        git pull || log_warn "Could not update repository"
        log_success "Repository updated"
    else
        log_info "Cloning repository to $INSTALL_DIR..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        log_success "Repository cloned"
    fi

    cd "$INSTALL_DIR"
}

# Check if Docker is running
wait_for_docker() {
    if ! docker info &>/dev/null; then
        log_warn "Docker is not running yet."

        OS=$(detect_os)
        if [ "$OS" == "macos" ]; then
            log_info "Starting Docker Desktop..."
            open -a Docker

            log_info "Waiting for Docker to start..."
            for i in {1..18}; do
                if docker info &>/dev/null; then
                    log_success "Docker is running"
                    return 0
                fi
                echo "    Still waiting... ($((i * 5)) seconds)"
                sleep 5
            done
        fi

        if ! docker info &>/dev/null; then
            log_error "Docker is not running. Please start Docker and run:"
            echo ""
            echo "    cd ~/ushadow && python3 setup/run.py --quick --prod --skip-admin"
            echo ""
            exit 1
        fi
    fi
}

# Main
main() {
    echo ""
    echo "=========================================="
    echo "  Ushadow Server Install v$VERSION"
    echo "=========================================="
    echo ""

    OS=$(detect_os)
    log_info "Detected OS: $OS"

    check_sudo

    # Step 1: Install Git
    install_git

    # Step 2: Install Python
    install_python

    # Step 3: Install Docker
    install_docker

    # Step 4: Clone repository
    setup_repository

    echo ""
    echo "=========================================="
    echo -e "  ${GREEN}Installation Complete!${NC}"
    echo "=========================================="
    echo ""

    # Wait for Docker if needed
    wait_for_docker

    # Run setup
    echo ""
    log_info "Starting Ushadow setup..."
    echo ""

    python3 setup/run.py --quick --prod --skip-admin
}

main "$@"
