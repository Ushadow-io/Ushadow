# Testing Guide for Dual-Stream Audio Module

## Quick Test (No Backend Required)

A standalone test page has been created at `/dual-stream-test` that demonstrates all features without requiring backend integration.

### How to Access

1. **Start the dev server:**
   ```bash
   cd backends/advanced/webui
   npm run dev
   ```

2. **Login to Chronicle:**
   - Navigate to http://localhost:5173
   - Login with admin credentials

3. **Open test page:**
   - Look for "🧪 Dual-Stream Test" in the admin navigation (left sidebar)
   - Or navigate directly to http://localhost:5173/dual-stream-test

## Test Scenarios

### Scenario 1: Microphone Only (Basic Test)

**Purpose:** Verify microphone capture works

**Steps:**
1. Select "Microphone Only" mode
2. Click "Start Recording"
3. Allow microphone access when browser prompts
4. Speak into microphone
5. Verify:
   - ✅ Waveform shows activity when speaking
   - ✅ Stats update (chunks processed, duration)
   - ✅ Chunk log shows incoming data
   - ✅ No errors displayed
6. Click "Stop Recording"
7. Verify recording stops cleanly

**Expected Results:**
- Green waveform shows audio activity
- Stats show: Duration increasing, Chunks > 0, Data > 0KB
- Console shows "Audio chunk received" logs
- No errors

---

### Scenario 2: Dual-Stream with Browser Tab (Advanced Test)

**Purpose:** Verify tab audio capture and mixing

**Setup:**
1. Open YouTube video or music in another browser tab
2. Start playing audio

**Steps:**
1. Select "Dual-Stream" mode
2. Click "Start Recording"
3. Allow microphone access
4. Browser will prompt to share screen/tab:
   - Choose "Chrome Tab" or "Application Window"
   - Select the tab with playing audio
   - **Important:** Check "Share tab audio" (if available)
   - Click "Share"
5. Speak into microphone while tab plays audio
6. Verify:
   - ✅ Two waveforms appear (mic + meeting)
   - ✅ Both waveforms show activity
   - ✅ Stats show "microphone + display"
   - ✅ Volume controls for both streams work
   - ✅ Chunk log shows "streams: microphone+display"
7. Adjust volume sliders
8. Click "Stop Recording"

**Expected Results:**
- Blue waveform (microphone) shows when speaking
- Green waveform (meeting) shows tab audio
- Active streams: "🎤 🖥️ microphone + display"
- Volume controls affect respective streams
- Chunks indicate both streams: "streams: microphone+display"

---

### Scenario 3: Browser Meeting (Real-World Test)

**Purpose:** Test with actual meeting application

**Setup:**
1. Join a test meeting:
   - Google Meet: https://meet.google.com/new
   - Zoom (web): https://zoom.us/test
   - Or any browser-based meeting

**Steps:**
1. Join meeting (you can test alone)
2. In Chronicle, select "Dual-Stream" mode
3. Click "Start Recording"
4. When prompted, select the meeting tab
5. Ensure "Share tab audio" is checked
6. Test:
   - Speak into microphone → check mic waveform
   - Play meeting audio → check meeting waveform
   - Both at once → both waveforms active
7. Adjust volume balance as needed
8. Stop recording

**Expected Results:**
- Can capture your voice + meeting participants
- Clear separation in waveforms
- Volume controls allow balancing mic vs meeting audio

---

### Scenario 4: Permission Denial (Error Handling)

**Purpose:** Verify graceful error handling

**Steps:**
1. Select "Dual-Stream" mode
2. Click "Start Recording"
3. Click "Cancel" or "Deny" when browser asks for permissions
4. Verify:
   - ✅ Error message displayed (not crash)
   - ✅ Can retry recording
   - ✅ State returns to idle

**Expected Results:**
- Red error banner shows: "Permission denied" message
- No console errors (handled gracefully)
- Can click "Start Recording" again

---

### Scenario 5: Browser Compatibility Check

**Purpose:** Verify browser support detection

**What to Check:**
- Green checkmarks for:
  - ✅ Microphone Access
  - ✅ Display Media (if supported)
  - ✅ Web Audio API
  - ✅ Secure Context

**Browser-Specific:**
- **Chrome/Edge:** All green ✅
- **Firefox:** All green ✅
- **Safari:** May show warning for tab audio (macOS 13+ only)

---

## Troubleshooting

### "Secure Context required"
- **Cause:** Not using HTTPS or localhost
- **Fix:** Use `https://` or run on `localhost`

### "No audio track found"
- **Cause:** Selected tab has no audio, or didn't check "Share tab audio"
- **Fix:** Select a tab that's playing audio + enable audio sharing

### Waveform shows but no audio
- **Cause:** System volume muted or wrong input device
- **Fix:** Check system audio settings

### Only one waveform shows in dual-stream
- **Cause:** One stream failed to capture
- **Fix:** Check browser console for errors, retry

### Tab audio cuts out during recording
- **Cause:** User closed/switched the shared tab
- **Fix:** Keep shared tab open while recording

---

## Console Debug Output

When testing, open browser DevTools (F12) and check console for:

```
🎤 Step 1: Requesting microphone access...
✅ Microphone access granted

🖥️  Step 2: Requesting display media access...
✅ Display media access granted: { audioTracks: 1, label: "..." }

🎛️  Step 3: Setting up audio mixer...
✅ Added microphone stream to mixer (ID: microphone-...)
✅ Added display stream to mixer (ID: display-...)

🔧 Step 4: Setting up audio processor...
🎵 Processing audio chunk #1 { size: 8192, rmsLevel: "0.0234", ... }
🎵 Processing audio chunk #2 ...
🎵 Processing audio chunk #3 ...

🎉 Recording started successfully in dual-stream mode
```

If you see errors, they'll appear in red with clear messages.

---

## Performance Metrics

**What's Normal:**
- **Chunk rate:** ~24 chunks/second (at 4096 buffer size, 16kHz sample rate)
- **Data rate:** ~32 KB/second per stream (16kHz mono PCM)
- **CPU usage:** < 5% on modern hardware
- **Memory:** < 50 MB for audio processing

**What's Problematic:**
- Chunks arriving irregularly (stuttering)
- CPU usage > 20%
- Growing memory usage (leak)
- Dropouts in waveform

---

## Test Checklist

- [ ] Microphone-only mode works
- [ ] Dual-stream mode works with YouTube tab
- [ ] Dual-stream mode works with meeting app
- [ ] Waveforms show real-time audio
- [ ] Volume controls affect streams independently
- [ ] Stats update correctly (duration, chunks, bytes)
- [ ] Chunk log shows data flowing
- [ ] Error handling works (permission denial)
- [ ] Recording stops cleanly
- [ ] Browser compatibility check shows correct capabilities
- [ ] Works in Chrome/Edge
- [ ] Works in Firefox
- [ ] (Optional) Works in Safari (limited)

---

## Next Steps After Testing

Once basic tests pass:

1. **Integrate with Chronicle backend:**
   - See `INTEGRATION.md` for full integration guide
   - Use `ChronicleWebSocketAdapter` instead of mock callback

2. **Add to production UI:**
   - Replace `LiveRecord` page or add as new mode
   - Add user instructions
   - Polish UI components

3. **Extract to Ushadow:**
   - Copy module to Ushadow repo
   - Implement Ushadow-specific backend adapter
   - Customize UI for Ushadow branding

---

## Known Limitations

1. **Tab audio only works in browser:**
   - Desktop meeting apps (Zoom desktop, Teams desktop) won't work
   - Workaround: Use browser-based meetings or virtual audio device

2. **Safari support limited:**
   - Tab audio requires macOS 13+
   - Window audio not supported

3. **Some apps block audio sharing:**
   - Netflix, Spotify may block tab audio capture
   - Meetings usually allow it

4. **Performance varies by browser:**
   - Chrome/Edge: Best performance
   - Firefox: Good performance
   - Safari: Limited support

---

## Support

If you encounter issues:

1. Check browser console for detailed errors
2. Verify browser compatibility (check capabilities section on test page)
3. Try in Chrome/Edge if using another browser
4. Ensure using HTTPS or localhost
5. Review module documentation: `README.md`
