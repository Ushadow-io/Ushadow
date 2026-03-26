# EAS Build Guide

## Quick Reference

### Makefile Commands (Recommended)

```bash
# Build and submit to TestFlight (most common)
make build-and-submit

# Submit existing build to TestFlight
make submit-testflight

# Just build (no submit)
make build-ios

# Build for device testing (internal distribution)
make build-ios-preview

# List all builds
make build-list

# See all commands
make help
```

### NPM Script Commands (Alternative)

```bash
# Build for TestFlight (recommended for testing)
npm run build:ios:production

# Build and auto-submit to TestFlight
npm run build:ios:submit

# Build for device testing (internal distribution, requires UDID)
npm run build:ios:preview

# Submit existing build to TestFlight
npm run submit:ios

# List all builds
npm run build:list
```

## Build Profiles (eas.json)

- **development**: Dev client for simulator only
- **preview**: Internal distribution for physical devices (ad hoc)
- **production**: App Store/TestFlight distribution

## First-Time Setup

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to EAS**:
   ```bash
   eas login
   ```
   Use account: `thestumonkey`

3. **Verify project**:
   ```bash
   eas project:info
   ```
   Should show: `@thestumonkey/ushadow-mobile`

## Build Process

### For TestFlight

1. Build and submit:
   ```bash
   npm run build:ios:submit
   ```

2. Wait for build (~15-30 minutes)

3. Monitor at: https://expo.dev/accounts/thestumonkey/projects/ushadow-mobile/builds

4. After processing, build appears in App Store Connect → TestFlight

5. Add testers in App Store Connect

### For Device Testing (No TestFlight)

1. Build preview version:
   ```bash
   npm run build:ios:preview
   ```

2. Register device UDID (prompted during build if needed)

3. Download IPA and install via Finder or scan QR code

## Credentials

All credentials are managed by EAS:
- **Distribution Certificate**: Valid until Jan 2027
- **Provisioning Profile**: Valid until Jan 2027
- **Apple Team ID**: 6SJ7NH4HSZ

Stored securely on EAS servers, not in repository.

## Configuration Files

**Commit to version control:**
- ✅ `eas.json` - Build configuration
- ✅ `app.json` - App metadata
- ✅ `package.json` - Dependencies and scripts

**Never commit:**
- ❌ Certificates (.p12 files)
- ❌ Provisioning profiles (.mobileprovision)
- ❌ API keys or secrets

## Troubleshooting

### "EAS project not configured"
Run from the mobile directory:
```bash
cd ushadow/mobile
eas project:info
```

### Build fails with missing privacy strings
Add to `app.json` under `ios.infoPlist`:
```json
"NSPhotoLibraryUsageDescription": "Description here"
```

### Can't find existing builds
```bash
npm run build:list
# Or visit: https://expo.dev/accounts/thestumonkey/projects/ushadow-mobile/builds
```

## Resources

- **Build Dashboard**: https://expo.dev/accounts/thestumonkey/projects/ushadow-mobile
- **App Store Connect**: https://appstoreconnect.apple.com
- **EAS Docs**: https://docs.expo.dev/build/introduction/
