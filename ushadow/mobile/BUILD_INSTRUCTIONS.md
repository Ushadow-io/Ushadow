# App Store Build & Submission Instructions

## Prerequisites
✅ Apple Developer Account (Team ID: 6SJ7NH4HSZ)
✅ EAS CLI installed
✅ App created in App Store Connect

## Step 1: Update eas.json
Edit `eas.json` and replace `YOUR_APP_STORE_CONNECT_APP_ID` with your actual App Store Connect App ID:
- Go to https://appstoreconnect.apple.com
- Navigate to My Apps → Ushadow
- Copy the App ID (10-digit number)

## Step 2: Build and Submit (Recommended)

**Option A: Build and auto-submit in one command:**
```bash
cd /Users/stu/repos/worktrees/ushadow/red/ushadow/mobile
eas build --platform ios --profile production --auto-submit
```

**Option B: Build first, then submit separately:**
```bash
# Build
eas build --platform ios --profile production

# Then submit after build completes
eas submit --platform ios --profile production
```

**Option C: Submit a previously built .ipa:**
```bash
eas submit --platform ios --path path/to/your-app.ipa
```

EAS will:
- ✅ Upload your code to EAS
- ✅ Build the app with production profile
- ✅ Auto-increment build number
- ✅ Create an `.ipa` file
- ✅ Automatically upload to App Store Connect
- ✅ Process the build for TestFlight/Review

## Demo Mode Verification
Make sure demo mode works:
1. Open app
2. Enable demo mode in Settings
3. Test all features (Conversations, Memories, Chat)
4. All should show mock data without backend connection

## What's Included in This Build
✅ Chat feature with streaming fallback
✅ Demo mode for App Store reviewers
✅ OpenMemory integration
✅ Chronicle conversations
✅ OMI device support
✅ QR code scanning for setup

## Version
- Version: 1.0.0
- Build: Auto-incremented by EAS

