#!/bin/bash
# iOS Preflight Check Script
# Ensures iOS development environment is ready before running expo run:ios

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== iOS Development Environment Check ===${NC}"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: iOS development requires macOS${NC}"
    echo "For non-Mac platforms, use 'npx expo run:android' or build with EAS:"
    echo "  eas build --profile preview --platform ios"
    exit 1
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: Xcode is not installed${NC}"
    echo ""
    echo "To fix this:"
    echo "  1. Install Xcode from the Mac App Store"
    echo "  2. Open Xcode and accept the license agreement"
    echo "  3. Run: sudo xcode-select --switch /Applications/Xcode.app"
    exit 1
fi

# Check if Xcode command line tools are set up
if ! xcode-select -p &> /dev/null; then
    echo -e "${YELLOW}Warning: Xcode command line tools not configured${NC}"
    echo "Running: sudo xcode-select --switch /Applications/Xcode.app"
    sudo xcode-select --switch /Applications/Xcode.app
fi

# Check if xcrun simctl works
if ! xcrun simctl list &> /dev/null; then
    echo -e "${RED}Error: Unable to access iOS Simulator${NC}"
    echo ""
    echo "To fix this:"
    echo "  1. Open Xcode"
    echo "  2. Go to Xcode > Settings > Platforms"
    echo "  3. Download an iOS Simulator runtime"
    exit 1
fi

# Check for iOS runtimes
IOS_RUNTIMES=$(xcrun simctl list runtimes 2>/dev/null | grep -c "iOS" || echo "0")
if [ "$IOS_RUNTIMES" -eq 0 ]; then
    echo -e "${RED}Error: No iOS Simulator runtimes installed${NC}"
    echo ""
    echo "To fix this:"
    echo "  1. Open Xcode"
    echo "  2. Go to Xcode > Settings > Platforms"
    echo "  3. Click + and download an iOS runtime"
    echo ""
    echo "Or install via command line:"
    echo "  xcodebuild -downloadPlatform iOS"
    exit 1
fi

# Check for available iOS devices
IOS_DEVICES=$(xcrun simctl list devices available 2>/dev/null | grep -E "(iPhone|iPad)" | grep -v "unavailable" || echo "")
if [ -z "$IOS_DEVICES" ]; then
    echo -e "${YELLOW}Warning: No iOS simulator devices found${NC}"
    echo "Attempting to create an iPhone simulator..."

    # Get the latest iOS runtime
    LATEST_RUNTIME=$(xcrun simctl list runtimes 2>/dev/null | grep "iOS" | tail -1 | sed -E 's/.*\((.*)\).*/\1/')

    if [ -n "$LATEST_RUNTIME" ]; then
        # Create an iPhone 16 Pro simulator
        xcrun simctl create "iPhone 16 Pro" "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro" "$LATEST_RUNTIME" || true
        echo -e "${GREEN}Created iPhone 16 Pro simulator${NC}"
    else
        echo -e "${RED}Could not determine iOS runtime. Please create a simulator manually in Xcode.${NC}"
        exit 1
    fi
fi

# Check if any simulator is booted
BOOTED_DEVICES=$(xcrun simctl list devices booted 2>/dev/null | grep -E "(iPhone|iPad)" || echo "")
if [ -z "$BOOTED_DEVICES" ]; then
    echo -e "${YELLOW}No iOS simulator is running. Booting one...${NC}"

    # Find an iPhone simulator to boot (prefer iPhone 16 Pro or latest)
    DEVICE_UDID=$(xcrun simctl list devices available 2>/dev/null | grep -E "iPhone 16 Pro[^M]" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/' || echo "")

    if [ -z "$DEVICE_UDID" ]; then
        # Fallback to any iPhone
        DEVICE_UDID=$(xcrun simctl list devices available 2>/dev/null | grep "iPhone" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/' || echo "")
    fi

    if [ -n "$DEVICE_UDID" ]; then
        echo "Booting simulator: $DEVICE_UDID"
        xcrun simctl boot "$DEVICE_UDID" 2>/dev/null || true

        # Open Simulator app
        open -a Simulator

        # Wait a moment for the simulator to start
        echo "Waiting for simulator to start..."
        sleep 3

        echo -e "${GREEN}Simulator started successfully${NC}"
    else
        echo -e "${RED}Could not find an iOS simulator to boot${NC}"
        echo "Please open Xcode and create a simulator device"
        exit 1
    fi
else
    echo -e "${GREEN}iOS simulator is already running${NC}"
fi

echo ""
echo -e "${GREEN}=== iOS environment ready! ===${NC}"
echo ""
