# nar8 - Routine Planner & Optimiser

**Status:** DRAFT
**Version:** 0.1
**Date:** 2026-02-28

---

## 1. Executive Summary

nar8 is a standalone mobile app for recording, analysing, and optimising daily routines. Users narrate their activities in real time (via phone microphone or Omi necklace), and the system builds a structured timeline of events. An LLM analyses the routine against stated goals, identifies inefficiencies, and suggests improvements. Over multiple recordings, nar8 performs trend analysis to track progress and surface patterns.

### Core Value Proposition

- **Record once, optimise forever** — narrate what you're doing; the app builds the timeline for you
- **Goal-oriented** — every routine has a defined endpoint (e.g. "arrive at college by 9am")
- **Data-driven improvement** — multiple recordings enable trend analysis and statistical optimisation
- **Location-aware** — integrates GPS + public transport data for travel-dependent routines
- **Proactive coaching** — notifications when you're behind schedule

---

## 2. User Personas

| Persona | Description | Primary Goal |
|---------|-------------|--------------|
| **Student** | University student with morning routine → commute → lectures | Get to campus on time consistently |
| **Professional** | WFH/office worker with morning prep + commute | Optimise morning to maximise sleep |
| **Parent** | Getting self + kids ready, school drop-off | Reduce chaos, leave on time |
| **Athlete** | Training prep → travel → session | Consistent pre-training routine |

---

## 3. Feature Specification

### 3.1 Routine Definition

A **Routine** is a named, repeatable sequence of activities with a defined goal.

```
Routine {
  id: UUID
  user_id: string
  name: string                    // e.g. "Morning → College"
  goal: string                    // e.g. "Arrive at lecture hall"
  goal_type: 'time' | 'location' | 'activity'
  goal_location?: LatLng          // If goal_type is 'location'
  goal_time?: string              // If goal_type is 'time' (HH:MM)
  start_location?: LatLng         // Where routine typically starts
  tags: string[]                  // e.g. ["morning", "weekday"]
  created_at: datetime
  updated_at: datetime
  archived: boolean
}
```

**User flow:**
1. User taps "New Routine"
2. Enters routine name
3. Defines the goal: "What's the endpoint?" (free text, parsed by LLM)
4. Optionally sets goal location (address / map pin) and target time
5. Routine is created and ready for recording

### 3.2 Recording a Routine Session

A **RoutineSession** is a single recording of a routine execution.

```
RoutineSession {
  id: UUID
  routine_id: UUID
  user_id: string
  started_at: datetime
  ended_at?: datetime
  status: 'recording' | 'processing' | 'complete' | 'abandoned'
  goal_reached: boolean
  audio_source: 'microphone' | 'omi'
  conversation_id?: string         // Link to Chronicle/Mycelia conversation
  location_track: LocationPoint[]  // GPS breadcrumbs
  weather?: WeatherData            // Optional: conditions during routine
}
```

**Recording flow:**
1. User selects a routine and taps "Start Recording"
2. App begins:
   - Audio capture (phone mic or Omi necklace via existing BLE streaming)
   - Location tracking (periodic GPS samples)
   - Streaming audio to backend for real-time transcription
3. User narrates naturally: *"OK getting out of bed now... brushing teeth... making coffee..."*
4. Real-time transcription generates transcript segments with timestamps
5. Recording ends when:
   - User declares goal reached: *"OK I'm at the lecture hall"*
   - LLM detects goal completion from context
   - User manually taps "End Recording"
   - User abandons (timeout / manual cancel)

### 3.3 Activity Timeline Generation

The LLM processes the transcript to produce a structured timeline:

```
RoutineEvent {
  id: UUID
  session_id: UUID
  activity: string              // e.g. "Brushing teeth"
  category: string              // e.g. "hygiene", "food", "transport"
  started_at: datetime
  ended_at: datetime
  duration_seconds: number
  location?: LatLng
  notes?: string                // Extracted context
  sentiment?: 'positive' | 'neutral' | 'negative' | 'frustrated'
  is_productive: boolean        // Contributing to goal?
  is_transition: boolean        // Moving between activities?
}
```

**Processing pipeline:**
1. Raw transcript arrives from Chronicle/Mycelia transcription
2. LLM prompt: "Given this transcript of a routine with goal '{goal}', extract a timeline of discrete activities with start/end times, categories, and sentiment"
3. Activities are normalised and categorised (so "brushing my teeth" and "doing my teeth" map to the same canonical activity)
4. Timeline is stored and linked to the session

### 3.4 Post-Recording Feedback

After each recording session, the user is prompted for structured feedback:

```
RoutineFeedback {
  id: UUID
  session_id: UUID
  overall_rating: 1-5            // How smoothly did it go?
  on_time: boolean               // Did you hit your goal time?
  blockers: string[]             // What slowed you down?
  blocker_details: string        // Free text elaboration
  mood: 'great' | 'ok' | 'stressed' | 'rushed'
  sleep_quality?: 1-5            // Optional: sleep rating
  external_factors?: string[]    // e.g. ["bad weather", "train delay", "couldn't find keys"]
  suggestions?: string           // User's own ideas for improvement
}
```

**Feedback flow:**
1. Recording ends → transition to Feedback screen
2. Quick-tap ratings (1-5 stars, mood selector)
3. "What slowed you down?" — multi-select common blockers + free text
4. "Anything else?" — open text field
5. Feedback stored with session for LLM analysis

### 3.5 Routine Analysis & Optimisation

The LLM analyses accumulated session data to provide insights:

#### Per-Session Analysis
- Timeline visualisation with durations
- Comparison to previous sessions ("You spent 5 min longer on breakfast today")
- Identification of time sinks and dead time
- Sentiment correlation ("You seem frustrated when rushing breakfast")

#### Cross-Session Trend Analysis
- Average duration per activity over time
- Variance analysis (consistency vs chaos)
- Blocker frequency ("You mention 'couldn't find keys' in 40% of sessions")
- Progress tracking ("Your average routine time has decreased from 85min to 72min")
- Day-of-week patterns ("Mondays average 10min longer")

#### Optimisation Suggestions
LLM-generated suggestions based on data:
- **Reordering:** "Try putting your bag together the night before — your 'gathering things' step averages 8min"
- **Parallelisation:** "You could eat breakfast while your hair dries — saving ~5min"
- **Elimination:** "The 'scrolling phone in bed' activity averages 12min and doesn't contribute to your goal"
- **Time boxing:** "Set a 3min timer for choosing an outfit — your current average is 7min"
- **Preparation:** "Frequent blocker: 'can't find keys'. Consider a dedicated key hook near the door"

### 3.6 Schedule Awareness & Notifications

When the user starts a routine recording, nar8 can monitor progress against the goal time:

```
ScheduleAlert {
  type: 'on_track' | 'slight_delay' | 'behind_schedule' | 'critical'
  message: string               // e.g. "You're 5 min behind — consider skipping the second coffee"
  suggested_action?: string
  triggered_at: datetime
}
```

**Notification triggers:**
- Elapsed time exceeds historical average for current progress point
- Remaining time is insufficient for remaining activities at average pace
- Transport data indicates changed travel time (e.g. bus delay)
- User is still on an activity they typically finish earlier

**Notification types:**
- Gentle nudge: "You usually finish breakfast by now"
- Actionable alert: "Bus in 12 min — you need to leave in 5 min"
- Critical: "You'll miss your 9am if you don't leave in the next 2 minutes"

### 3.7 Location & Transport Integration

For routines with a travel component:

```
TransportLeg {
  mode: 'walk' | 'bus' | 'train' | 'drive' | 'cycle'
  origin: LatLng
  destination: LatLng
  estimated_duration: number    // minutes
  real_time_duration?: number   // from transit API
  service_info?: string         // e.g. "Bus 42 from High Street"
  departure_time?: datetime
  delay_minutes?: number
}
```

**Features:**
- Start location auto-detected from GPS
- Goal location set during routine creation
- Public transport APIs queried for real-time travel estimates
- Travel time injected into schedule calculations
- "You need to leave by X:XX" computed dynamically
- Historical transport data used for planning (e.g. "the 8:15 bus is late 30% of the time, consider the 8:05")

---

## 4. Data Model Summary

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Routine    │────<│  RoutineSession  │────<│ RoutineEvent  │
│              │     │                  │     │               │
│ name         │     │ started_at       │     │ activity      │
│ goal         │     │ ended_at         │     │ category      │
│ goal_type    │     │ status           │     │ duration      │
│ goal_location│     │ goal_reached     │     │ sentiment     │
│ goal_time    │     │ conversation_id  │     │ location      │
└─────────────┘     │ location_track   │     └───────────────┘
                    └──────┬───────────┘
                           │
                    ┌──────┴───────────┐     ┌───────────────┐
                    │ RoutineFeedback  │     │ TransportLeg  │
                    │                  │     │               │
                    │ rating           │     │ mode          │
                    │ blockers         │     │ duration      │
                    │ mood             │     │ delay         │
                    │ sleep_quality    │     │ service_info  │
                    └──────────────────┘     └───────────────┘

                    ┌──────────────────┐
                    │ ScheduleAlert    │
                    │                  │
                    │ type             │
                    │ message          │
                    │ suggested_action │
                    └──────────────────┘
```

---

## 5. Leveraging the Existing Codebase

### 5.1 Platform Decision: Fork ushadow/mobile as nar8

The existing `ushadow/mobile` app (Expo/React Native) is the ideal foundation. It already has:

| Existing Capability | Location in Codebase | Reuse for nar8 |
|---------------------|---------------------|----------------|
| **Audio streaming (phone mic)** | `app/hooks/useStreaming.ts`, `usePhoneAudioRecorder.ts`, `useAudioStreamer.ts` | Core recording engine — stream narration to backend |
| **Omi BLE connection** | `app/contexts/OmiConnectionContext.tsx`, `app/hooks/useBluetoothManager.ts`, `app/hooks/useDeviceConnection.ts` | Alternative audio source — Omi necklace for hands-free narration |
| **Wyoming protocol WebSocket** | `app/hooks/useAudioStreamer.ts` (Wyoming event types, audio-start/chunk/stop) | Reuse the exact same streaming protocol to send audio |
| **Audio relay (multi-destination)** | `app/hooks/useMultiDestinationStreamer.ts`, backend `routers/audio_relay.py` | Fan audio to both transcription + routine analysis |
| **Session tracking** | `app/hooks/useSessionTracking.ts`, `app/types/streamingSession.ts` | Adapt for RoutineSession lifecycle |
| **Conversation/transcript retrieval** | `app/services/chronicleApi.ts`, `app/services/myceliaApi.ts` | Pull transcripts back for timeline generation |
| **Auth + UNode connectivity** | `app/_utils/authStorage.ts`, `app/_utils/unodeStorage.ts` | Same auth flow — nar8 connects to user's UNode |
| **Live Activity (iOS)** | `app/hooks/useLiveActivity.ts`, `targets/RecordingWidget/` | Show routine recording status on lock screen |
| **Background audio** | `app.config.js` UIBackgroundModes: ['audio'] | Keep recording when screen is off |
| **Theme system** | `app/theme.ts` | Rebrand with nar8 colours |
| **LLM client** | Backend `services/llm_client.py` (LiteLLM) | Use for activity extraction, analysis, suggestions |
| **Chat/streaming LLM** | Backend `routers/chat.py` | Adapt for routine coaching chat |
| **Capability-based providers** | Backend `services/capability_resolver.py`, `provider_registry.py` | Same LLM/transcription provider swapping |
| **Feature flags** | `app/contexts/FeatureFlagContext.tsx`, backend `services/feature_flags.py` | Gate nar8 features during rollout |

### 5.2 What Needs To Be Built New

| Component | Description | Build Location |
|-----------|-------------|----------------|
| **Routine CRUD screens** | Create/edit/list routines with goal definition | New mobile screens |
| **Recording overlay** | Enhanced recording UI with live timeline + location | New mobile component |
| **Timeline view** | Visual activity timeline with durations | New mobile component |
| **Feedback flow** | Post-recording feedback wizard | New mobile screens |
| **Analysis dashboard** | Trend charts, suggestions, comparisons | New mobile screens |
| **Notification engine** | Schedule-aware push notifications | New backend service + mobile handlers |
| **Routine analysis service** | LLM-powered timeline extraction + optimisation | New backend service |
| **Location tracking hook** | Periodic GPS sampling during recording | New mobile hook (expo-location) |
| **Transport data integration** | Public transport API client | New backend service |
| **Routine data models** | MongoDB collections for routines/sessions/events | New backend models |
| **Routine API endpoints** | CRUD + analysis + schedule APIs | New backend routers |

### 5.3 Architecture: Standalone App, Shared Backend

```
┌─────────────────────────────────┐
│         nar8 Mobile App         │
│     (Fork of ushadow/mobile)   │
│                                 │
│  ┌───────────┐ ┌─────────────┐ │
│  │ Routines  │ │ Recording   │ │
│  │ (new)     │ │ (reuse+ext) │ │
│  ├───────────┤ ├─────────────┤ │
│  │ Timeline  │ │ Feedback    │ │
│  │ (new)     │ │ (new)       │ │
│  ├───────────┤ ├─────────────┤ │
│  │ Analysis  │ │ Coaching    │ │
│  │ (new)     │ │ Chat (adapt)│ │
│  └───────────┘ └─────────────┘ │
│                                 │
│  Reused from ushadow/mobile:   │
│  • useStreaming / useAudioStr.  │
│  • Omi BLE connection           │
│  • Wyoming protocol             │
│  • Auth + UNode discovery       │
│  • Live Activity widget         │
│  • Session tracking (adapted)  │
└────────────┬────────────────────┘
             │ WebSocket (audio) + REST API
             │
┌────────────┴────────────────────┐
│      ushadow Backend            │
│      (Extended, not forked)     │
│                                 │
│  Existing:                      │
│  • Audio relay → Chronicle      │
│  • LLM client (LiteLLM)        │
│  • Auth / Keycloak              │
│  • Provider registry            │
│                                 │
│  New nar8 services:             │
│  • RoutineService               │
│  • TimelineExtractor            │
│  • RoutineAnalyser              │
│  • ScheduleMonitor              │
│  • TransportService             │
│                                 │
│  New nar8 routers:              │
│  • /api/nar8/routines           │
│  • /api/nar8/sessions           │
│  • /api/nar8/analysis           │
│  • /api/nar8/schedule           │
└────────────┬────────────────────┘
             │
      ┌──────┴──────────┐
      │                 │
   MongoDB           Chronicle/Mycelia
   (routines,        (transcription,
    sessions,         audio storage)
    events,
    feedback)
```

### 5.4 Recommended Approach: Chronicle vs Mycelia vs Direct

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Chronicle** | Mature transcription, speaker separation, audio storage | Heavier, more features than needed | Use if already deployed |
| **Mycelia** | Lighter weight, conversation-focused | Less mature | Good alternative |
| **Direct (new)** | Purpose-built for nar8, no dependencies | More work, duplicates transcription | Only if special requirements |

**Recommendation:** Use **Chronicle** for transcription and audio storage via the existing audio relay. The nar8 backend services then pull the transcript from Chronicle and run the routine-specific LLM analysis on top. This avoids reimplementing transcription and leverages the existing Deepgram/Whisper provider system.

The flow is:
1. nar8 mobile → audio relay → Chronicle (transcription happens)
2. nar8 backend polls/subscribes for transcript completion
3. nar8 `TimelineExtractor` service processes transcript → structured timeline
4. nar8 `RoutineAnalyser` service runs cross-session analysis

---

## 6. API Design

### 6.1 Routine Management

```
POST   /api/nar8/routines              # Create routine
GET    /api/nar8/routines              # List user's routines
GET    /api/nar8/routines/{id}         # Get routine details
PUT    /api/nar8/routines/{id}         # Update routine
DELETE /api/nar8/routines/{id}         # Archive routine
```

### 6.2 Session Management

```
POST   /api/nar8/routines/{id}/sessions            # Start recording
PUT    /api/nar8/sessions/{id}/end                  # End recording
GET    /api/nar8/sessions/{id}                      # Get session + timeline
GET    /api/nar8/routines/{id}/sessions             # List sessions for routine
POST   /api/nar8/sessions/{id}/feedback             # Submit feedback
POST   /api/nar8/sessions/{id}/location             # Append GPS point
```

### 6.3 Analysis

```
GET    /api/nar8/routines/{id}/analysis             # Get routine analysis
GET    /api/nar8/routines/{id}/trends               # Trend data for charts
GET    /api/nar8/routines/{id}/suggestions           # LLM optimisation suggestions
POST   /api/nar8/sessions/{id}/process              # Trigger timeline extraction
```

### 6.4 Schedule & Transport

```
GET    /api/nar8/routines/{id}/schedule              # Current schedule state
POST   /api/nar8/routines/{id}/schedule/check        # Check if on track
GET    /api/nar8/transport/estimate                   # Travel time estimate
```

---

## 7. LLM Prompts (Key Templates)

### 7.1 Activity Extraction

```
You are analysing a voice transcript of someone performing their daily routine.
The routine is called "{routine_name}" with the goal: "{goal}".

Extract a timeline of discrete activities from the transcript.
For each activity, provide:
- activity: short name (e.g. "Brushing teeth")
- category: one of [hygiene, food, clothing, organisation, transport, leisure, work, waiting, other]
- start_time: ISO timestamp
- end_time: ISO timestamp
- sentiment: positive/neutral/negative/frustrated
- is_productive: does this contribute to reaching the goal?
- notes: any relevant context from what was said

Normalise activity names so that "doing my teeth", "brushing teeth",
and "cleaning my teeth" all become "Brushing teeth".

Transcript:
{transcript}
```

### 7.2 Optimisation Analysis

```
You are a routine optimisation coach. Analyse these {n} recordings of
the routine "{routine_name}" (goal: "{goal}", target time: {target_time}).

Session data:
{sessions_json}

User feedback across sessions:
{feedback_json}

Provide:
1. Top 3 time-saving suggestions with estimated minutes saved
2. Activities that could be parallelised
3. Activities that could be eliminated or shortened
4. Recurring blockers and solutions
5. An optimised suggested order of activities
6. Encouragement on improvements already made

Be specific and reference actual data (e.g. "Your 'choosing outfit' step
averages 7.2 minutes across 8 sessions — try preparing clothes the night before").
```

---

## 8. Mobile App Screen Map

```
nar8 App
├── Home (Routines List)
│   ├── [+] New Routine → Routine Creator
│   └── [Routine Card] → Routine Detail
│       ├── Start Recording → Recording Screen
│       │   └── Recording Ends → Feedback Screen
│       ├── Session History
│       │   └── [Session] → Timeline View
│       ├── Analysis Dashboard
│       │   ├── Trend Charts
│       │   └── Suggestions
│       └── Settings (goal, location, schedule)
├── Active Recording (overlay / full screen)
│   ├── Live waveform
│   ├── Current activity indicator
│   ├── Elapsed time
│   ├── Schedule status bar
│   └── End Recording button
├── Coaching Chat
│   └── LLM conversation about routines
└── Settings
    ├── Audio source (Mic / Omi)
    ├── UNode connection
    ├── Notification preferences
    └── Transport settings
```

---

## 9. Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Fork ushadow/mobile → nar8 branding
- [ ] Routine CRUD (create, list, edit, delete)
- [ ] Basic recording using existing streaming infrastructure
- [ ] Transcript retrieval from Chronicle
- [ ] LLM timeline extraction (basic)
- [ ] Timeline view component
- [ ] Post-recording feedback form
- [ ] Backend: Routine + Session + Event models
- [ ] Backend: `/api/nar8/routines` and `/api/nar8/sessions` endpoints
- [ ] Backend: `TimelineExtractor` service

### Phase 2: Intelligence
- [ ] Cross-session trend analysis
- [ ] LLM optimisation suggestions
- [ ] Analysis dashboard with charts
- [ ] Activity normalisation and categorisation
- [ ] Sentiment analysis from narration
- [ ] Coaching chat (adapt existing chat)

### Phase 3: Proactive Features
- [ ] Location tracking during recording
- [ ] Public transport API integration
- [ ] Dynamic schedule monitoring
- [ ] Push notifications (behind schedule)
- [ ] "Leave by" time calculation
- [ ] Live Activity widget updates for schedule

### Phase 4: Polish & Advanced
- [ ] Routine sharing (anonymised)
- [ ] Calendar integration
- [ ] Apple Watch / wearable companion
- [ ] Habit streak tracking
- [ ] Export to calendar events
- [ ] Multi-routine chaining (morning → commute → work arrival)

---

## 10. Technical Notes

### 10.1 New Dependencies (Mobile)
- `expo-location` — GPS tracking during recording
- `expo-notifications` — schedule-aware push notifications
- `react-native-chart-kit` or `victory-native` — trend visualisation
- `expo-calendar` — calendar integration (Phase 4)

### 10.2 New Dependencies (Backend)
- Transport APIs: Google Directions API, or open-source alternatives (OpenTripPlanner, Transport API)
- No new LLM dependencies — uses existing LiteLLM + provider system

### 10.3 Data Storage
- Routines, sessions, events, feedback → MongoDB (existing ushadow infrastructure)
- Audio + transcripts → Chronicle (existing)
- Location data → stored with session in MongoDB (array of `{lat, lng, timestamp}`)

### 10.4 App Identity
- New bundle ID: `io.nar8.app` (iOS) / `io.nar8.app` (Android)
- New EAS project
- Shared backend — nar8 routes namespaced under `/api/nar8/`
- Same Keycloak auth realm — users authenticate the same way
