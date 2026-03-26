# Apple App Store Submission - Demo Mode Guide

## Overview

This guide explains how to use the built-in demo mode for Apple App Store submission and review.

## What is Demo Mode?

Demo mode allows Apple reviewers to test the Ushadow Mobile app without needing:
- A live server connection
- Real user credentials
- OMI device hardware
- Active backend services

When demo mode is enabled, the app uses realistic mock data for all features including memories, conversations, and streaming controls.

## How to Enable Demo Mode

### For Users (Including Apple Reviewers)

1. **Launch the app** - The app will show a login screen if not authenticated
2. **Click "Try Demo Mode"** button on the login screen
3. **The app logs in automatically** with demo credentials
4. **A blue banner appears** at the top showing "Demo Mode - Using Sample Data"

### For Developers

Demo mode is automatically enabled when the user clicks the "Try Demo Mode" button. No additional configuration needed.

## What Works in Demo Mode

✅ **Full UI/UX Testing**
- All screens and navigation
- UI components and interactions
- Visual design and themes

✅ **Memories Tab**
- View 4 sample memories with realistic content
- Search functionality
- Memory categories and timestamps

✅ **Conversations Tab**
- View 2 sample conversations
- Conversation details and messages
- Conversation metadata

✅ **Home/Streaming Tab**
- Source selection UI (Phone/OMI)
- Destination selection UI (UNode)
- Stream control buttons
- Waveform visualization (UI only)

✅ **Authentication**
- Demo user profile (demo@ushadow.io)
- Authentication state management
- Logout/Exit demo functionality

## What Doesn't Work in Demo Mode

⚠️ **Real-time Features**
- Actual audio streaming (UI shows but doesn't stream)
- Live Bluetooth device scanning
- Real server connections
- WebSocket connections

⚠️ **Data Persistence**
- Creating new memories (mock only, not saved)
- Deleting memories (mock only, not actually deleted)
- Modifying settings

## Apple App Store Submission Instructions

### App Review Information

In App Store Connect, under "App Review Information", provide:

**Demo Account:**
```
Username: (Not needed - use demo mode)
Password: (Not needed - use demo mode)
```

**Notes for Reviewer:**
```
This app includes a built-in Demo Mode for testing without server connectivity:

1. Launch the app
2. On the login screen, tap "Try Demo Mode"
3. The app will automatically log in with sample data
4. A blue banner confirms demo mode is active

Demo mode provides realistic sample data for all features:
- Memories: 4 sample memories with search
- Conversations: 2 sample conversations
- Streaming: Full UI (actual streaming requires hardware)

To exit demo mode, tap the "Exit Demo" button in the top section.

Note: Actual audio streaming requires proprietary OMI hardware and
a running Ushadow server. Demo mode demonstrates the full UI/UX.
```

### Privacy Policy

Ensure your privacy policy mentions:
- Demo mode does not collect or transmit data
- Demo mode data is stored locally and temporarily
- Exiting demo mode clears all demo data

### App Description

Consider adding to your App Store description:
```
Try It Now: The app includes a demo mode so you can explore all
features without setting up a server or connecting hardware.
```

## Technical Implementation

### Architecture

The demo mode system consists of:

1. **Demo Mode Storage** (`app/utils/demoModeStorage.ts`)
   - Stores demo mode state in AsyncStorage
   - Checked by auth and API layers

2. **Mock Data** (`app/utils/mockData.ts`)
   - Realistic sample memories, conversations, users
   - Network delay simulation for realistic feel

3. **Demo API Service** (`app/services/demoApiService.ts`)
   - Mock implementations of all API calls
   - Returns mock data with simulated delays

4. **API Wrappers** (`app/services/*ApiWrapper.ts`)
   - Check demo mode state
   - Route to real or demo API accordingly

5. **Auth Storage Integration** (`app/utils/authStorage.ts`)
   - Returns demo credentials when in demo mode
   - Ensures consistent demo user identity

### Demo Mode Indicator

The app shows a prominent blue banner when demo mode is active:
- Located at top of home screen
- Shows "Demo Mode - Using Sample Data"
- Cannot be missed by reviewers

### Exit Demo Mode

Users can exit demo mode by:
1. Tapping "Exit Demo" button (replaces "Logout" in demo mode)
2. Automatically clears demo mode flag
3. Returns to login screen

## Testing Demo Mode

### Before Submission

Test the following scenarios:

1. **Fresh Install**
   ```
   - Install app
   - Launch app
   - Tap "Try Demo Mode"
   - Verify demo banner appears
   - Verify demo user email shows
   ```

2. **Feature Testing**
   ```
   - Navigate to Memories tab
   - Verify 4 memories appear
   - Test search functionality
   - Navigate to Conversations tab
   - Verify 2 conversations appear
   - Navigate to Home tab
   - Verify streaming UI is available
   ```

3. **Exit Demo Mode**
   ```
   - Tap "Exit Demo" button
   - Verify returns to login screen
   - Verify demo mode banner gone
   ```

### Known Limitations for Reviewers

If Apple reviewers ask about these, explain:

1. **Streaming doesn't produce audio**
   - Requires physical OMI device hardware
   - Demo shows full UI/UX only

2. **Bluetooth scanning shows no devices**
   - Requires OMI device hardware
   - Demo shows UI only

3. **Can't create real memories**
   - Requires server connection
   - Demo demonstrates UI flow

## Updating Demo Data

To update mock data for future submissions:

Edit `app/utils/mockData.ts`:

```typescript
export const MOCK_MEMORIES = [
  {
    id: '1',
    timestamp: new Date().toISOString(),
    title: 'Your Title',
    content: 'Your content',
    tags: ['tag1', 'tag2'],
    duration: 1800,
  },
  // Add more...
];
```

## Support for Reviewers

If Apple reviewers have issues:

1. **App won't launch demo mode**
   - Verify "Try Demo Mode" button is visible
   - Check logs for errors
   - Ensure fresh install

2. **Features don't show data**
   - Verify demo mode banner is visible
   - Check that wrapper services are being used
   - Verify mock data is not empty

3. **App crashes in demo mode**
   - Check error logs
   - Verify all API imports use wrapper services
   - Test on physical device, not just simulator

## Version History

- **v1.0.0** - Initial demo mode implementation
  - Basic demo mode with memories and conversations
  - Demo mode indicator banner
  - Mock data for all features

---

## Questions?

For issues related to demo mode during App Store review:
- Check console logs for `[DemoAPI]` messages
- Verify demo mode flag: AsyncStorage key `@ushadow:demo_mode`
- Contact developer support with review issue details
