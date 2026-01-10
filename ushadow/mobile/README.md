# Ushadow Mobile App

React Native mobile app for streaming audio to your Ushadow/Chronicle backend.

## Quick Start Options

### Option 1: Expo Go (Simplest - Limited Features)
**Best for:** Quick testing, no native BLE needed

```bash
cd ushadow/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go app. Note: BLE features won't work in Expo Go.

### Option 2: Development Build (Recommended for Development)
**Best for:** Full features, active development

```bash
# Install dependencies
npm install

# Build and run on connected device
npx expo run:ios      # For iOS (requires Mac + Xcode)
npx expo run:android  # For Android (requires Android Studio)
```

### Option 3: EAS Build (Easiest Distribution)
**Best for:** Sharing with others without app store

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for internal distribution
eas build --profile preview --platform android  # APK for sideloading
eas build --profile preview --platform ios      # Requires Apple Developer account
```

---

## Detailed Setup Instructions

### Prerequisites

1. **Node.js 18+** - [nodejs.org](https://nodejs.org)
2. **Expo CLI** - `npm install -g expo-cli`
3. **For iOS:** Mac with Xcode 15+ and CocoaPods
4. **For Android:** Android Studio with SDK 34+

### Android Setup

#### Development (Recommended)
```bash
# Connect your Android device via USB
# Enable Developer Options > USB Debugging on device

npm install
npx expo run:android
```

#### Distribution via APK
```bash
# Create installable APK (no Play Store needed)
eas build --profile preview --platform android

# Download the .apk file from the build URL
# Transfer to device and install (enable "Unknown Sources" in settings)
```

#### Distribution via Internal Testing (Play Console)
1. Create a Google Play Console account ($25 one-time)
2. Upload to Internal Testing track
3. Add up to 100 testers by email
4. Testers install via Play Store link (not public)

### iOS Setup

#### Development (Recommended)
```bash
# Connect your iOS device via USB
# Trust your computer on the device

npm install
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npx expo run:ios --device
```

#### Distribution via TestFlight (Easiest for iOS)
1. Apple Developer account ($99/year required)
2. Build with EAS:
   ```bash
   eas build --profile preview --platform ios
   ```
3. Submit to TestFlight via EAS or manually upload to App Store Connect
4. Add testers by email (up to 10,000 external testers)

#### Distribution via Ad-Hoc (No TestFlight)
1. Collect device UDIDs from testers
2. Register devices in Apple Developer portal
3. Build with ad-hoc profile:
   ```bash
   eas build --profile production --platform ios
   ```
4. Distribute .ipa file directly

---

## Connecting to Your UNode

1. **Start streaming service** on your UNode/server
2. **Open the app** and go to Home tab
3. **Scan QR code** or manually enter the connection URL
4. **Tap Connect** to start streaming audio

### Manual Connection
If QR scanning doesn't work:
1. Go to UNode Details page
2. Tap "Edit URLs"
3. Enter your server URLs:
   - **API URL:** `https://your-server.ts.net` (main backend)
   - **Chronicle API URL:** `https://your-server.ts.net/chronicle/api` (optional, for conversations/memories)

---

## Distribution Comparison

| Method | Cost | Setup Time | iOS | Android | Users |
|--------|------|------------|-----|---------|-------|
| Expo Go | Free | 5 min | Yes | Yes | Dev only, no BLE |
| Dev Build | Free | 30 min | Yes | Yes | 1 device |
| EAS Preview | Free* | 15 min | Yes** | Yes | Unlimited |
| TestFlight | $99/yr | 1 hour | Yes | N/A | 10,000 |
| Play Internal | $25 once | 1 hour | N/A | Yes | 100 |
| APK Sideload | Free | 15 min | N/A | Yes | Unlimited |

\* Free tier: 30 builds/month
\*\* Requires Apple Developer account for iOS

---

## Troubleshooting

### "Executable was signed with invalid entitlements" (iOS)
Your device needs to be registered. Use EAS device registration:
```bash
eas device:create
```

### BLE not working
- BLE requires a development build, not Expo Go
- Ensure Bluetooth permissions are granted
- On iOS, add bluetooth-peripheral background mode

### Connection failed
- Check your server is running and accessible
- Verify URLs don't have trailing slashes
- Try both `ws://` and `wss://` for stream URL

### Android: "SDK location not found"
When running `npx expo run:android`, you may see:
```
SDK location not found. Define a valid SDK location with an ANDROID_HOME
environment variable or by setting the sdk.dir path in your project's
local.properties file
```

**Cause:** The Android build system (Gradle) can't find your Android SDK installation.

**Fix:** Create `android/local.properties` with your SDK path:
```bash
# On macOS (typical Android Studio installation):
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

# On Linux:
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties

# On Windows (Git Bash):
echo "sdk.dir=C:\\Users\\YourUsername\\AppData\\Local\\Android\\Sdk" > android/local.properties
```

**Permanent fix:** Add to your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

**Note:** `local.properties` is gitignored because it contains machine-specific paths.

### Build fails
```bash
# Clean and rebuild
rm -rf node_modules
npm install
npx expo prebuild --clean
npx expo run:ios  # or android
```

---

## Project Structure

```
ushadow/mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── index.tsx      # Home/streaming tab
│   │   ├── conversations.tsx
│   │   └── memories.tsx
│   ├── components/        # Reusable components
│   ├── services/          # API clients
│   └── utils/             # Storage utilities
├── patches/               # BLE library patches
└── package.json
```

---

## Development Commands

```bash
npm start          # Start Expo dev server
npm run ios        # Build and run on iOS
npm run android    # Build and run on Android
npm run lint       # Run ESLint
```
