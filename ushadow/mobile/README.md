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

## Build Configuration

### Setting a Default Server URL (Optional)

You can pre-configure a default server URL that will be filled in automatically when users first open the app. This is useful when distributing the app to your team.

**Option 1: Environment Variable (Recommended)**

Create a `.env` file in the `ushadow/mobile/` directory:

```bash
# Copy the example file
cp .env.example .env

# Edit with your server URL
echo 'EXPO_PUBLIC_DEFAULT_SERVER_URL=https://your-server.ts.net' > .env
```

Then build the app normally. The URL will be embedded at build time.

**Option 2: EAS Build Secrets**

For EAS builds, set the environment variable in your EAS secrets:

```bash
eas secret:create --name EXPO_PUBLIC_DEFAULT_SERVER_URL --value "https://your-server.ts.net"
```

**Note:** Users can always change the server URL during login, even if a default is set. The URL they use is saved for future logins.

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
