#!/bin/bash
# Verify the DMG contains the latest code by checking JS bundle hash

echo "🔍 Verifying DMG code matches latest build..."
echo ""

# Get the latest built frontend JS hash
DIST_JS=$(ls -1 dist/assets/index-*.js 2>/dev/null | head -1)
if [ -z "$DIST_JS" ]; then
    echo "❌ No built frontend found in dist/assets/"
    echo "Run: npm run build"
    exit 1
fi

DIST_HASH=$(basename "$DIST_JS" | sed 's/index-\(.*\)\.js/\1/')
echo "Latest build hash: $DIST_HASH"
echo "  File: $DIST_JS"
echo ""

# Find the DMG
DMG_PATH=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)
if [ -z "$DMG_PATH" ]; then
    echo "❌ No DMG found in src-tauri/target/release/bundle/dmg/"
    echo "Run: make build-dmg"
    exit 1
fi

echo "DMG found: $DMG_PATH"
echo ""

# Mount the DMG and check the JS bundle
echo "Mounting DMG..."
MOUNT_POINT=$(hdiutil attach "$DMG_PATH" | grep Volumes | sed 's/.*\/Volumes/\/Volumes/')

if [ -z "$MOUNT_POINT" ]; then
    echo "❌ Failed to mount DMG"
    exit 1
fi

echo "Mounted at: $MOUNT_POINT"
echo ""

# Check the JS bundle inside the app
APP_JS=$(find "$MOUNT_POINT" -name "index-*.js" 2>/dev/null | head -1)

if [ -z "$APP_JS" ]; then
    echo "❌ No JS bundle found in DMG"
    hdiutil detach "$MOUNT_POINT" 2>/dev/null
    exit 1
fi

APP_HASH=$(basename "$APP_JS" | sed 's/index-\(.*\)\.js/\1/')
echo "DMG bundle hash: $APP_HASH"
echo "  File: $(basename "$APP_JS")"
echo ""

# Compare
if [ "$DIST_HASH" = "$APP_HASH" ]; then
    echo "✅ SUCCESS: DMG contains latest code!"
    echo ""
    echo "The DMG has the same JS bundle as your latest build."
else
    echo "❌ MISMATCH: DMG has old code!"
    echo ""
    echo "The DMG was built with an older version."
    echo "To fix: make build-dmg"
fi

# Cleanup
hdiutil detach "$MOUNT_POINT" 2>/dev/null
echo ""
echo "DMG unmounted."
