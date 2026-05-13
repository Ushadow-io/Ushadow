# Fastlane Migration to ushadow-sdk

## What Changed?

The Fastlane setup has been **extracted from `ushadow/mobile/` to the centralized SDK** at `mycelia/myceliasdk/`. This makes it reusable across projects and easier to maintain.

### Before ❌
```
ushadow/mobile/
├── fastlane/
│   ├── Fastfile
│   └── Appfile
├── Gemfile
└── Makefile (with local fastlane-setup, fastlane-beta, etc.)
```

### After ✅
```
ushadow/mobile/
└── Makefile (delegates to SDK)

mycelia/myceliasdk/
├── Gemfile
├── Makefile.fastlane
├── FASTLANE.md
├── fastlane/
│   ├── Fastfile
│   └── Appfile
└── scripts/
    ├── fastlane-setup.sh
    ├── fastlane-beta.sh
    ├── fastlane-build.sh
    └── fastlane-submit.sh
```

## What Works the Same? ✅

All the **Makefile commands work exactly the same**:

```bash
cd ushadow/mobile

# These still work:
make env-setup           # Configure Apple ID
make fastlane-setup      # Install Fastlane
make fastlane-beta       # Build and upload to TestFlight
make fastlane-build      # Build only
make fastlane-submit     # Submit only
```

No changes needed to your workflow!

## Behind the Scenes

The mobile `Makefile` now delegates to scripts in the SDK:

```makefile
fastlane-beta:
	@bash ../../../mycelia/myceliasdk/scripts/fastlane-beta.sh
```

These scripts:
1. Run from the SDK directory (where Gemfile lives)
2. Use environment variables to locate your iOS project
3. Execute the same Fastlane commands as before

## Benefits of This Change

### ✅ Centralization
- One source of truth for Fastlane configuration
- Easier to update/improve for all projects

### ✅ Reusability
- Other projects can use the same setup
- Consistent iOS deployment across projects

### ✅ Maintainability
- Less duplication
- Changes benefit all projects using it

### ✅ Flexibility
- Scripts can be called from anywhere
- Works with different project structures

## Do I Need to Do Anything?

**No!** Your workflow doesn't change. The same commands work:

```bash
cd ushadow/mobile
make fastlane-setup      # One-time setup
make fastlane-beta       # Deploy to TestFlight
```

But if you want to use the SDK directly:

```bash
cd mycelia/myceliasdk
make -f Makefile.fastlane fastlane-beta
```

## What About the Old Files?

The old files in `ushadow/mobile/fastlane/` are no longer used. You can keep them for reference or delete them.

Current setup uses:
- ✅ `mycelia/myceliasdk/fastlane/Fastfile` (ACTIVE)
- ✅ `mycelia/myceliasdk/fastlane/Appfile` (ACTIVE)
- ✅ `mycelia/myceliasdk/Gemfile` (ACTIVE)
- ❌ `ushadow/mobile/fastlane/` (DEPRECATED)
- ❌ `ushadow/mobile/Gemfile` (DEPRECATED)

You can safely delete the old files or keep them for reference.

## Environment Variables

Configuration still goes in `ushadow/mobile/.env.local`:

```bash
# Your Apple ID
FASTLANE_APPLE_ID="your-apple-id@example.com"

# Skip waiting for build
FASTLANE_SKIP_WAITING_FOR_BUILD_PROCESSING=true

# API Key (optional)
APP_STORE_CONNECT_API_KEY_KEY_ID="YOUR_KEY_ID"
APP_STORE_CONNECT_API_KEY_ISSUER_ID="YOUR_ISSUER_ID"
APP_STORE_CONNECT_API_KEY_KEY_FILEPATH="/path/to/key.p8"
```

The setup automatically finds this file regardless of where fastlane runs.

## Troubleshooting

### Scripts not found?

```bash
# Make sure scripts are executable
chmod +x mycelia/myceliasdk/scripts/*.sh

# Or run them directly with bash
bash ../../../mycelia/myceliasdk/scripts/fastlane-beta.sh
```

### "Permission denied"

Scripts should be executable. If not:

```bash
chmod +x mycelia/myceliasdk/scripts/fastlane-*.sh
```

### Paths not found?

The setup automatically finds iOS project paths. If it fails:

```bash
# Ensure you're in a valid project directory or
# Set FASTLANE_PROJECT_PATH explicitly:
export FASTLANE_PROJECT_PATH=/path/to/ushadow/mobile
make -f Makefile.fastlane fastlane-beta
```

## More Information

- Read `mycelia/myceliasdk/FASTLANE.md` for detailed documentation
- Original guide still applies: `ushadow/mobile/FASTLANE_SETUP.md`

---

## Summary

✅ **Same commands, cleaner architecture**

Your `make fastlane-beta` still works exactly the same. The setup is now in the SDK for better organization and reusability.
