#!/bin/bash
# Reset Ushadow Launcher to fresh user state
# This clears all persisted settings and state

echo "🧹 Resetting Ushadow Launcher to fresh user state..."
echo ""

# Kill the app if running (both dev and production)
echo "Stopping app if running..."
killall Ushadow 2>/dev/null || true
killall ushadow-launcher 2>/dev/null || true
pkill -f "tauri dev" 2>/dev/null || true
sleep 1

# Clear Zustand persisted state (localStorage)
# Tauri stores data differently for dev vs production builds

# Production build (installed DMG) - uses "Ushadow" (productName)
PROD_WEBKIT_DIR="$HOME/Library/WebKit/Ushadow"
if [ -d "$PROD_WEBKIT_DIR" ]; then
    echo "✓ Clearing production app data: $PROD_WEBKIT_DIR"
    rm -rf "$PROD_WEBKIT_DIR"
fi

# Dev build (tauri dev) - uses "ushadow-launcher" (package name)
DEV_WEBKIT_DIR="$HOME/Library/WebKit/ushadow-launcher"
if [ -d "$DEV_WEBKIT_DIR" ]; then
    echo "✓ Clearing dev build data: $DEV_WEBKIT_DIR"
    rm -rf "$DEV_WEBKIT_DIR"
fi

# Legacy paths (old app identifier) - just in case
LEGACY_WEBKIT_DIR="$HOME/Library/WebKit/com.ushadow.launcher"
if [ -d "$LEGACY_WEBKIT_DIR" ]; then
    echo "✓ Clearing legacy data: $LEGACY_WEBKIT_DIR"
    rm -rf "$LEGACY_WEBKIT_DIR"
fi

# Application Support (if it exists)
APP_SUPPORT_DIR="$HOME/Library/Application Support/com.ushadow.launcher"
if [ -d "$APP_SUPPORT_DIR" ]; then
    echo "✓ Clearing app support data: $APP_SUPPORT_DIR"
    rm -rf "$APP_SUPPORT_DIR"
fi

echo ""
echo "✅ Reset complete!"
echo ""
echo "Next launch will be like a fresh install:"
echo "  • No project root configured"
echo "  • Default settings restored"
echo "  • App mode reset to 'quick'"
echo ""
echo "Launch the app: open -a Ushadow"
