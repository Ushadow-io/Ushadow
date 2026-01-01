#!/bin/bash
# =============================================================================
# Ushadow UNode Bootstrap Script
# =============================================================================
# This script prepares a machine to join a Ushadow cluster by installing:
#   - Docker (container runtime)
#   - Tailscale (secure networking)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ushadow-io/unode-bootstrap/main/bootstrap.sh | bash
#
# After running this script, use the join command from your Ushadow dashboard
# to connect this node to your cluster.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif [ -f /etc/debian_version ]; then
        OS="debian"
    elif [ -f /etc/redhat-release ]; then
        OS="rhel"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        OS="unknown"
    fi
    echo "$OS"
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

# Install Docker
install_docker() {
    log_info "Checking Docker installation..."

    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1)
        log_success "Docker already installed (version $DOCKER_VERSION)"
        return 0
    fi

    log_info "Installing Docker..."

    OS=$(detect_os)

    case $OS in
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

        macos)
            if command -v brew &> /dev/null; then
                brew install --cask docker
                log_warn "Docker Desktop installed. Please start Docker Desktop manually."
            else
                log_error "Please install Docker Desktop from https://docker.com/products/docker-desktop"
                exit 1
            fi
            ;;

        *)
            log_warn "Unknown OS. Attempting generic Docker install..."
            curl -fsSL https://get.docker.com | $SUDO sh
            ;;
    esac

    # Start and enable Docker
    if [ "$OS" != "macos" ]; then
        $SUDO systemctl start docker 2>/dev/null || true
        $SUDO systemctl enable docker 2>/dev/null || true

        # Add current user to docker group
        if [ -n "$SUDO_USER" ]; then
            $SUDO usermod -aG docker "$SUDO_USER"
            log_info "Added $SUDO_USER to docker group (re-login required)"
        elif [ -n "$USER" ] && [ "$USER" != "root" ]; then
            $SUDO usermod -aG docker "$USER"
            log_info "Added $USER to docker group (re-login required)"
        fi
    fi

    log_success "Docker installed successfully"
}

# Install Tailscale
install_tailscale() {
    log_info "Checking Tailscale installation..."

    if command -v tailscale &> /dev/null; then
        TS_VERSION=$(tailscale version 2>/dev/null | head -1)
        log_success "Tailscale already installed (version $TS_VERSION)"
        return 0
    fi

    log_info "Installing Tailscale..."

    OS=$(detect_os)

    case $OS in
        macos)
            if command -v brew &> /dev/null; then
                brew install tailscale
            else
                log_error "Please install Tailscale from https://tailscale.com/download/mac"
                exit 1
            fi
            ;;

        *)
            # Use Tailscale's universal installer
            curl -fsSL https://tailscale.com/install.sh | $SUDO sh
            ;;
    esac

    log_success "Tailscale installed successfully"
}

# Start Tailscale and authenticate
setup_tailscale() {
    log_info "Setting up Tailscale..."

    OS=$(detect_os)

    if [ "$OS" != "macos" ]; then
        # Start tailscaled
        $SUDO systemctl start tailscaled 2>/dev/null || true
        $SUDO systemctl enable tailscaled 2>/dev/null || true
    fi

    # Check if already authenticated
    STATUS=$($SUDO tailscale status 2>&1 || true)

    if echo "$STATUS" | grep -q "Logged out" || echo "$STATUS" | grep -q "not logged in"; then
        log_info "Starting Tailscale authentication..."
        echo ""
        echo "=========================================="
        echo "  Tailscale Authentication Required"
        echo "=========================================="
        echo ""
        echo "A browser window will open for authentication."
        echo "If it doesn't open, follow the URL printed below."
        echo ""

        $SUDO tailscale up

        log_success "Tailscale connected!"
    else
        log_success "Tailscale already authenticated"
    fi

    # Show Tailscale IP
    TS_IP=$($SUDO tailscale ip -4 2>/dev/null || echo "unknown")
    log_info "Tailscale IP: $TS_IP"
}

# Main
main() {
    echo ""
    echo "=========================================="
    echo "  Ushadow UNode Bootstrap"
    echo "=========================================="
    echo ""

    check_sudo

    log_info "Detected OS: $(detect_os)"
    echo ""

    # Step 1: Install Docker
    echo "--- Step 1/3: Docker ---"
    install_docker
    echo ""

    # Step 2: Install Tailscale
    echo "--- Step 2/3: Tailscale ---"
    install_tailscale
    echo ""

    # Step 3: Setup Tailscale
    echo "--- Step 3/3: Connect Tailscale ---"
    setup_tailscale
    echo ""

    echo "=========================================="
    echo "  Bootstrap Complete!"
    echo "=========================================="
    echo ""

    # Show system info
    TS_IP=$($SUDO tailscale ip -4 2>/dev/null || echo "unknown")
    HOSTNAME=$(hostname)
    echo "System Info:"
    echo "  Hostname:     $HOSTNAME"
    echo "  Tailscale IP: $TS_IP"
    echo "  Docker:       $(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1 || echo 'not running')"
    echo ""

    # Interactive setup dialog
    setup_dialog
}

# Interactive dialog for next steps
setup_dialog() {
    echo "=========================================="
    echo "  What would you like to do?"
    echo "=========================================="
    echo ""
    echo "  1) Join an existing cluster (I have an invite code)"
    echo "  2) Start a new Ushadow server (become a leader node)"
    echo "  3) Exit (I'll set up later)"
    echo ""

    read -p "Enter choice [1-3]: " choice

    case $choice in
        1)
            join_existing_cluster
            ;;
        2)
            start_new_server
            ;;
        3)
            echo ""
            log_info "You can run this script again or manually set up later."
            echo ""
            echo "To join a cluster later, get the join command from your Ushadow dashboard:"
            echo "  Cluster > Add Node > Copy the join command"
            echo ""
            ;;
        *)
            log_warn "Invalid choice. Exiting."
            ;;
    esac
}

# Join an existing cluster with invite code
join_existing_cluster() {
    echo ""
    echo "=========================================="
    echo "  Join Existing Cluster"
    echo "=========================================="
    echo ""
    echo "Paste your join command or invite URL below."
    echo "(Get this from: Ushadow Dashboard > Cluster > Add Node)"
    echo ""

    read -p "Join command or URL: " join_input

    if [ -z "$join_input" ]; then
        log_error "No input provided."
        return 1
    fi

    # Check if it's a curl command or just a URL
    if echo "$join_input" | grep -q "^curl"; then
        # It's already a curl command, execute it
        log_info "Executing join command..."
        eval "$join_input"
    elif echo "$join_input" | grep -q "^https\?://"; then
        # It's a URL, fetch and execute
        log_info "Fetching join script from URL..."
        curl -sL "$join_input" | sh
    else
        log_error "Invalid input. Please paste the full curl command or URL."
        return 1
    fi
}

# Start a new Ushadow server
start_new_server() {
    echo ""
    echo "=========================================="
    echo "  Start New Ushadow Server"
    echo "=========================================="
    echo ""

    # Default install location
    INSTALL_DIR="${HOME}/ushadow"

    read -p "Install directory [$INSTALL_DIR]: " custom_dir
    if [ -n "$custom_dir" ]; then
        INSTALL_DIR="$custom_dir"
    fi

    # Check if directory exists
    if [ -d "$INSTALL_DIR" ]; then
        log_warn "Directory $INSTALL_DIR already exists."
        read -p "Use existing installation? [Y/n]: " use_existing
        if [ "$use_existing" = "n" ] || [ "$use_existing" = "N" ]; then
            log_error "Aborting. Please choose a different directory or remove the existing one."
            return 1
        fi
    else
        log_info "Cloning Ushadow repository..."
        git clone https://github.com/Ushadow-io/Ushadow.git "$INSTALL_DIR"
        if [ $? -ne 0 ]; then
            log_error "Failed to clone repository."
            return 1
        fi
    fi

    cd "$INSTALL_DIR" || { log_error "Failed to enter $INSTALL_DIR"; return 1; }

    # Run go.sh
    if [ -f "go.sh" ]; then
        log_info "Starting Ushadow server..."
        chmod +x go.sh
        ./go.sh
    else
        log_error "go.sh not found in $INSTALL_DIR"
        return 1
    fi
}

main "$@"
