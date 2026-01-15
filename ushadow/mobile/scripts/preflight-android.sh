#!/bin/bash
# Android Preflight Check Script
# Ensures Android development environment is ready before running expo run:android
# Note: We don't use 'set -e' here to ensure error messages are displayed properly

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Android Development Environment Check                         ║${NC}"
echo -e "${BLUE}║  Tip: Always use 'npm run android' to get these checks         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for Java - need to verify it actually works, not just that the command exists
# Android builds require Java because the Android build system (Gradle) runs on the JVM
JAVA_CHECK=$(java -version 2>&1)
if echo "$JAVA_CHECK" | grep -qi "Unable to locate\|not found\|No Java\|error"; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ERROR: Java JDK is not installed                              ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Why is Java needed?${NC}"
    echo "  Android apps are built using Gradle, which requires Java to run."
    echo "  React Native/Expo uses Gradle under the hood to compile your app."
    echo ""
    echo -e "${YELLOW}How to fix:${NC}"
    echo ""
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${GREEN}Option 1 - Homebrew (recommended):${NC}"
        echo ""
        echo "  Step 1: Install OpenJDK 17"
        echo -e "    ${BLUE}brew install openjdk@17${NC}"
        echo ""
        echo "  Step 2: Link it so the system can find it"
        echo -e "    ${BLUE}sudo ln -sfn \$(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk${NC}"
        echo ""
        echo "  Step 3: Restart your terminal, then run:"
        echo -e "    ${BLUE}npm run android${NC}"
        echo ""
        echo -e "${GREEN}Option 2 - Download installer:${NC}"
        echo "  https://adoptium.net/temurin/releases/?version=17"
        echo "  Download the .pkg file for macOS and run the installer."
    else
        echo -e "${GREEN}Ubuntu/Debian:${NC}"
        echo -e "  ${BLUE}sudo apt install openjdk-17-jdk${NC}"
        echo ""
        echo -e "${GREEN}Or download from:${NC}"
        echo "  https://adoptium.net/temurin/releases/?version=17"
    fi
    echo ""
    echo -e "${YELLOW}After installing Java, restart your terminal and run: npm run android${NC}"
    echo ""
    exit 1
fi

# Check Java version
JAVA_VERSION=$(echo "$JAVA_CHECK" | head -1 | cut -d'"' -f2 | cut -d'.' -f1 2>/dev/null || echo "0")
echo -e "${GREEN}Java found: $(echo "$JAVA_CHECK" | head -1)${NC}"

if [ "$JAVA_VERSION" -lt 11 ] 2>/dev/null; then
    echo -e "${YELLOW}Warning: Java version $JAVA_VERSION detected. Java 17 is recommended for React Native.${NC}"
fi

# Check for ANDROID_HOME or ANDROID_SDK_ROOT
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    # Try common locations
    if [ -d "$HOME/Library/Android/sdk" ]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
        echo -e "${YELLOW}ANDROID_HOME not set, using: $ANDROID_HOME${NC}"
    elif [ -d "$HOME/Android/Sdk" ]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
        echo -e "${YELLOW}ANDROID_HOME not set, using: $ANDROID_HOME${NC}"
    else
        echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ERROR: Android SDK not found                                  ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}Why is the Android SDK needed?${NC}"
        echo "  The Android SDK contains tools to compile and package your app"
        echo "  for Android devices. It's installed alongside Android Studio."
        echo ""
        echo -e "${YELLOW}How to fix:${NC}"
        echo ""
        echo -e "${GREEN}Step 1: Install Android Studio${NC}"
        echo "  Download from: https://developer.android.com/studio"
        echo "  Run the installer and complete the setup wizard."
        echo ""
        echo -e "${GREEN}Step 2: Add environment variables${NC}"
        echo "  Add these lines to your shell profile (~/.zshrc or ~/.bashrc):"
        echo ""
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo -e "    ${BLUE}export ANDROID_HOME=\$HOME/Library/Android/sdk${NC}"
        else
            echo -e "    ${BLUE}export ANDROID_HOME=\$HOME/Android/Sdk${NC}"
        fi
        echo -e "    ${BLUE}export PATH=\$PATH:\$ANDROID_HOME/emulator${NC}"
        echo -e "    ${BLUE}export PATH=\$PATH:\$ANDROID_HOME/platform-tools${NC}"
        echo ""
        echo -e "${GREEN}Step 3: Reload your shell${NC}"
        echo -e "  ${BLUE}source ~/.zshrc${NC}  (or restart your terminal)"
        echo ""
        echo -e "${YELLOW}Then run: npm run android${NC}"
        echo ""
        exit 1
    fi
else
    ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
fi

echo -e "${GREEN}Android SDK: $ANDROID_HOME${NC}"

# Check for platform-tools (adb)
if [ ! -f "$ANDROID_HOME/platform-tools/adb" ]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ERROR: Android platform-tools (adb) not found                 ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Why are platform-tools needed?${NC}"
    echo "  Platform-tools include 'adb' (Android Debug Bridge), which is used"
    echo "  to communicate with your Android device or emulator."
    echo ""
    echo -e "${YELLOW}How to fix:${NC}"
    echo "  1. Open Android Studio"
    echo "  2. Go to Tools > SDK Manager > SDK Tools tab"
    echo "  3. Check 'Android SDK Platform-Tools' and click Apply"
    echo ""
    exit 1
fi

# Add platform-tools to PATH if not already there
export PATH="$PATH:$ANDROID_HOME/platform-tools"

# Check for connected devices or running emulators
echo ""
echo "Checking for Android devices..."

DEVICES=$("$ANDROID_HOME/platform-tools/adb" devices 2>/dev/null | grep -v "List" | grep -v "^$" || echo "")

if [ -z "$DEVICES" ]; then
    echo -e "${YELLOW}No Android devices connected${NC}"
    echo ""

    # Check if any emulator is available
    if [ -d "$ANDROID_HOME/emulator" ] && [ -f "$ANDROID_HOME/emulator/emulator" ]; then
        AVDS=$("$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null || echo "")

        if [ -n "$AVDS" ]; then
            echo "Available emulators:"
            echo "$AVDS" | while read avd; do echo "  - $avd"; done
            echo ""

            # Try to start the first available emulator
            FIRST_AVD=$(echo "$AVDS" | head -1)
            echo -e "${BLUE}Starting emulator: $FIRST_AVD${NC}"
            "$ANDROID_HOME/emulator/emulator" -avd "$FIRST_AVD" -no-snapshot-load &

            echo "Waiting for emulator to boot..."
            # Wait for device to be ready (max 60 seconds)
            for i in {1..30}; do
                sleep 2
                BOOT_STATUS=$("$ANDROID_HOME/platform-tools/adb" shell getprop sys.boot_completed 2>/dev/null || echo "")
                if [ "$BOOT_STATUS" = "1" ]; then
                    echo -e "${GREEN}Emulator is ready!${NC}"
                    break
                fi
                echo "  Still booting... ($i/30)"
            done
        else
            echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║  ERROR: No Android emulators configured                        ║${NC}"
            echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
            echo ""
            echo -e "${YELLOW}You need either an emulator or a physical device to run the app.${NC}"
            echo ""
            echo -e "${GREEN}Option 1 - Create an emulator:${NC}"
            echo "  1. Open Android Studio"
            echo "  2. Go to Tools > Device Manager"
            echo "  3. Click 'Create Device' and follow the wizard"
            echo "  4. Download a system image when prompted (e.g., API 34)"
            echo ""
            echo -e "${GREEN}Option 2 - Connect a physical device via USB:${NC}"
            echo "  1. On your phone: Settings > About Phone"
            echo "     Tap 'Build Number' 7 times to enable Developer Options"
            echo "  2. Go to Settings > Developer Options"
            echo "     Enable 'USB Debugging'"
            echo "  3. Connect your phone via USB cable"
            echo "  4. Accept the debugging prompt on your phone"
            echo ""
            exit 1
        fi
    else
        echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ERROR: Android Emulator not installed                         ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}How to fix:${NC}"
        echo "  1. Open Android Studio"
        echo "  2. Go to Tools > SDK Manager > SDK Tools tab"
        echo "  3. Check 'Android Emulator' and click Apply"
        echo "  4. Then go to Tools > Device Manager to create a virtual device"
        echo ""
        echo "Or connect a physical Android device via USB (see above)"
        exit 1
    fi
else
    echo -e "${GREEN}Connected devices:${NC}"
    echo "$DEVICES" | while read device; do
        if [ -n "$device" ]; then
            echo "  - $device"
        fi
    done
fi

echo ""
echo -e "${GREEN}=== Android environment ready! ===${NC}"
echo ""
