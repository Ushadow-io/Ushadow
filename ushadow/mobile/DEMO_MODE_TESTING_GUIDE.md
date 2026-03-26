# Demo Mode Testing Guide

## What's Been Implemented

### ✅ Core Features Working in Demo Mode

1. **Authentication**
   - "Try Demo Mode" button on login screen
   - Instant login with demo credentials (demo@ushadow.io)
   - Green banner showing "Demo Mode - Using Sample Data"

2. **Memories Tab**
   - 4 sample memories with realistic content
   - Search functionality works with mock data
   - Memory creation (mock only)
   - Memory deletion (mock only)

3. **Conversations Tab**
   - 2 sample conversations with messages
   - Conversation details and summaries
   - Audio player shows "Audio playback not available in demo mode"

4. **Bluetooth Device Scanning**
   - Shows 1 mock OMI device
   - Scan button works (2-second simulation)
   - Can save demo device

5. **UNode Connection**
   - Auth verification returns success
   - No real server connection attempted

## Testing Steps

### 1. Fresh Start (Important!)

Clear the app data to ensure clean testing:

```bash
# iOS Simulator
xcrun simctl uninstall booted io.ushadow.mobile

# Or manually: Device Settings > Apps > Ushadow > Clear Data/Storage
```

### 2. Enable Demo Mode

1. Launch the app
2. You should see the login screen
3. Click **"Try Demo Mode"** button (below the "Sign In" button)
4. App should automatically log in
5. **Verify:** Green banner appears saying "Demo Mode - Using Sample Data"
6. **Verify:** Auth section shows "Signed in as demo@ushadow.io"

**Console logs to expect:**
```
[Login] Enabling demo mode
[DemoMode] Demo mode enabled
[DemoMode] isDemoMode check - stored value: true, result: true
[AuthStorage] Demo mode active - returning mock token
```

### 3. Test Home Tab

1. Stay on Home tab
2. **Verify:** Demo mode banner visible at top
3. **Verify:** "Exit Demo" button (not "Logout")
4. **Verify:** Source/Destination selectors visible
5. **Verify:** Streaming controls visible

**What works:**
- ✅ UI displays correctly
- ✅ Can select sources/destinations

**What's UI-only:**
- ⚠️ Actual audio streaming won't work (requires hardware)
- ⚠️ Waveform won't animate (no real audio data)

### 4. Test Memories Tab

1. Navigate to **Memories** tab
2. **Verify:** 4 memories appear immediately
3. **Verify:** Each memory shows:
   - Title
   - Content snippet
   - Tags
   - Timestamp

**Expected memories:**
- "Team Meeting Discussion" (30 mins ago)
- "Coffee Shop Conversation" (2 hours ago)
- "Product Design Review" (1 day ago)
- "Podcast Recording Session" (2 days ago)

4. Test search:
   - Type "meeting" → Should show only "Team Meeting Discussion"
   - Type "design" → Should show only "Product Design Review"
   - Clear search → Should show all 4 memories

**Console logs to expect:**
```
[MemoriesAPIWrapper] fetchMemories - Demo mode: true
[MemoriesAPIWrapper] Using demo API for fetchMemories
[DemoAPI] Fetching memories (demo mode)
```

### 5. Test Conversations Tab

1. Navigate to **Conversations** tab
2. **Verify:** 2 conversations appear immediately
3. **Verify:** Each shows:
   - Conversation title (first message)
   - Timestamp
   - Participant info

**Expected conversations:**
- Recent: "Can you help me summarize..." (15 mins ago)
- Older: "What did I discuss about the startup..." (3 hours ago)

4. Tap on a conversation to expand
5. **Verify:** Messages appear
6. **Verify:** Audio player shows green info box: "Audio playback not available in demo mode"

**Console logs to expect:**
```
[ChronicleAPIWrapper] fetchConversations - Demo mode: true
[ChronicleAPIWrapper] Using demo API for fetchConversations
[DemoAPI] Fetching conversations (demo mode)
[AudioPlayer] Demo mode - audio playback not available
```

### 6. Test Bluetooth Device Scanning

1. Go back to **Home** tab
2. Look for "Add OMI Device" or device scanner option
3. Open the device scanner
4. **Verify:** Shows "Demo OMI Device" in the list
5. **Verify:** RSSI: -60
6. Tap "Scan" button
7. **Verify:** Shows scanning animation for 2 seconds
8. **Verify:** No errors about Bluetooth permissions

**Console logs to expect:**
```
[OmiDeviceScanner] Demo mode active - using mock devices
[OmiDeviceScanner] Demo mode - simulating scan
```

### 7. Exit Demo Mode

1. Tap **"Exit Demo"** button (where Logout usually is)
2. **Verify:** Returns to login screen
3. **Verify:** Demo banner is gone
4. **Verify:** No demo data visible

**Console logs to expect:**
```
[DemoMode] Demo mode disabled
```

## Troubleshooting

### Issue: Demo mode button clicked but no data appears

**Check console for:**
```
[DemoMode] isDemoMode check - stored value: null, result: false
```

**Solution:**
- Demo mode flag not being saved
- Check AsyncStorage permissions
- Try clearing app data and retry

### Issue: Memories/Conversations tabs are empty

**Check console for:**
```
[MemoriesAPIWrapper] fetchMemories - Demo mode: false
[MemoriesAPIWrapper] Using real API for fetchMemories
```

**Solution:**
- Demo mode is not being detected by wrappers
- Check that demo mode was enabled successfully
- Look for `[DemoMode] isDemoMode check` logs

### Issue: API errors in console

**If you see real API requests like:**
```
[MemoriesAPI] GET https://...
Failed to fetch: 401
```

**Solution:**
- API wrappers are not being used
- Check imports in tab files:
  - Should be: `from '../services/memoriesApiWrapper'`
  - Not: `from '../services/memoriesApi'`

### Issue: Bluetooth scanner crashes

**Check console for:**
```
[OmiDeviceScanner] Demo mode active - using mock devices
```

**If missing:**
- Demo mode detection failed in scanner
- Check component imports

### Issue: Audio player crashes or shows error

**Should see:**
```
[AudioPlayer] Demo mode - audio playback not available
```

**If shows error instead:**
- Demo mode detection failed
- Check AudioPlayer imports

## Expected Behavior Summary

| Feature | Demo Mode Behavior |
|---------|-------------------|
| Login | ✅ One-click demo login |
| Auth | ✅ Shows demo@ushadow.io |
| Memories | ✅ Shows 4 sample memories |
| Conversations | ✅ Shows 2 sample conversations |
| Audio Playback | ℹ️ Shows info message (no playback) |
| Bluetooth Scan | ✅ Shows 1 mock device |
| UNode Connection | ✅ Shows success (no real connection) |
| Audio Streaming | ℹ️ UI only (no actual streaming) |

## For Apple Reviewers

Apple reviewers should experience:
1. **No crashes** - All screens load successfully
2. **Sample data** - All tabs show meaningful content
3. **Clear indicators** - Demo mode banner always visible
4. **Graceful limitations** - Features that require hardware show helpful messages
5. **Easy exit** - Can exit demo mode anytime

## Next Steps After Testing

If all tests pass:
1. ✅ Update `APPLE_STORE_DEMO_MODE.md` with any findings
2. ✅ Take screenshots of each tab for App Store submission
3. ✅ Prepare reviewer notes with demo mode instructions
4. ✅ Submit to App Store Connect

If issues found:
1. Share console logs showing the issue
2. Note which specific feature is failing
3. Check if it's a critical blocker or minor UI issue
