# nar8 - Routine Planner & Optimiser

**Status:** DRAFT
**Version:** 0.2
**Date:** 2026-02-28

---

## 1. Executive Summary

nar8 is a routine planner and optimiser. Users narrate their activities in real time (via phone microphone or Omi necklace), and the system builds a structured timeline of events. An LLM analyses the routine against stated goals, identifies inefficiencies, and suggests improvements. Over multiple recordings, nar8 performs trend analysis to track progress and surface patterns.

### Architecture Strategy: Core + Skin

Rather than forking ushadow/mobile into a separate app, we take a **"core in ushadow, skin for nar8"** approach:

1. **Timeline, routine, and analysis features are built as core ushadow capabilities** — available in the ushadow dashboard and mobile app
2. **The ushadow mobile app is componentised** into a shared library (`@ushadow/mobile-core`) so features can be consumed by multiple apps
3. **nar8 is a thin, purpose-built mobile app** with its own UI/flow/branding, importing shared components from the library
4. This pattern is reusable — future apps and services follow the same model

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
TimelineEvent {
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

When the user starts a routine recording, the system can monitor progress against the goal time:

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
│   Routine    │────<│  RoutineSession  │────<│ TimelineEvent │
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

## 5. Architecture: Core + Skin

### 5.1 Strategy Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        APPS (Skins)                              │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │  ushadow mobile │  │   nar8 app      │  │  future app    │  │
│  │                 │  │                 │  │                │  │
│  │ Full dashboard  │  │ Routine-focused │  │ Other vertical │  │
│  │ All tabs        │  │ Record → Review │  │ ...            │  │
│  │ Power-user UI   │  │ Minimal, clean  │  │                │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │                    │                    │            │
├───────────┴────────────────────┴────────────────────┴────────────┤
│                                                                  │
│                   @ushadow/mobile-core                           │
│                   (Shared Component Library)                     │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  audio/  │ │  ble/    │ │  auth/   │ │ session/ │           │
│  │          │ │          │ │          │ │          │           │
│  │ Streamer │ │ Scanner  │ │ Keycloak │ │ Tracking │           │
│  │ Recorder │ │ Device   │ │ Token    │ │ Storage  │           │
│  │ Wyoming  │ │ Listener │ │ Storage  │ │ Types    │           │
│  │ MultiDst │ │ Context  │ │ Monitor  │ │          │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │timeline/ │ │  chat/   │ │  data/   │ │  core/   │           │
│  │          │ │          │ │          │ │          │           │
│  │ Extract  │ │ Message  │ │ Chroncle │ │ Feature  │           │
│  │ View     │ │ Voice    │ │ Mycelia  │ │  Flags   │           │
│  │ Compare  │ │ Input    │ │ Memory   │ │ Lifecycl │           │
│  │ Chart    │ │ API      │ │ Feed     │ │ Logger   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                   ushadow Backend (FastAPI)                      │
│                                                                  │
│  Existing routes           New core routes (not nar8-namespaced) │
│  /api/chronicle            /api/routines                         │
│  /api/chat                 /api/timeline                         │
│  /api/auth                 /api/schedule                         │
│  /api/settings             /api/transport                        │
│  /ws/audio/relay                                                 │
│                                                                  │
│  Existing services         New core services                     │
│  LLMClient                 TimelineExtractor                     │
│  AudioRelay                RoutineService                        │
│  ProviderRegistry          RoutineAnalyser                       │
│  FeatureFlags              ScheduleMonitor                       │
│                            TransportService                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 What Goes Where

#### Built into ushadow core (backend + mobile-core library)

These are **general-purpose capabilities** that ushadow gains, accessible from any app:

| Feature | Why Core | Backend | Mobile |
|---------|----------|---------|--------|
| **Timeline extraction** | Any conversation can become a timeline — not routine-specific | `TimelineExtractor` service | `timeline/` components |
| **Routine CRUD** | Routines are a data type the platform manages | `RoutineService`, `/api/routines` | `routine/` hooks + types |
| **Session recording with context** | Extends existing streaming sessions with purpose/goal metadata | Extend `StreamingSession` model | Extend `useSessionTracking` |
| **Feedback collection** | Generic post-session feedback — useful for any recording type | `FeedbackService`, `/api/feedback` | `feedback/` components |
| **Location tracking** | Generic capability — useful for conversations, sessions, routines | `/api/sessions/{id}/location` | `useLocationTracking` hook |
| **LLM analysis** | Extends existing LLM client with structured analysis patterns | Extend `LLMClient` | Analysis display components |
| **Schedule monitoring** | Could apply to any timed goal, not just routines | `ScheduleMonitor` service | `schedule/` components |
| **Transport integration** | Location-aware travel estimation — platform capability | `TransportService` | Transport display components |

#### Built as nar8-specific (thin app layer)

These are **nar8 UI/UX decisions** that compose core components differently:

| Feature | Why Skin | What It Imports |
|---------|----------|-----------------|
| **nar8 tab layout** | 3 tabs: Routines / Active / Coach — not ushadow's 5-tab layout | Core components, own `_layout.tsx` |
| **Routine-first home screen** | List of routines with quick-record — not a general dashboard | `routine/` hooks, own screen |
| **Simplified recording overlay** | Full-screen focused recording with live activity indicator | `audio/`, `session/`, `timeline/` from core |
| **Post-recording flow** | Recording → Feedback → Timeline review — opinionated wizard | `feedback/`, `timeline/` from core |
| **Coaching chat context** | Chat pre-loaded with routine data and optimisation context | `chat/` from core, own system prompt |
| **nar8 branding + theme** | Own colours, logo, app name | Core theme system, own overrides |
| **nar8 notifications** | Routine-specific notification copy and timing | Core `ScheduleMonitor`, own templates |

### 5.3 How ushadow App Uses Timeline Features

In the ushadow mobile app, timeline features appear naturally alongside existing capabilities:

```
ushadow App (updated tabs)
├── Home (existing — streaming + connection)
│   └── Recording now shows: "Record as routine?" option
├── Chat (existing)
│   └── Can ask about routine analysis
├── Feed (existing)
├── History (existing conversations tab)
│   └── NEW: Conversations now show extracted timeline
│   └── NEW: "View as Timeline" toggle on any conversation
├── Memories (existing)
└── NEW: Routines (new tab or section within Home)
    ├── Routine list
    ├── Routine detail → sessions → timelines
    └── Analysis dashboard
```

The ushadow web dashboard also gains:
- Routine management page
- Timeline visualisation for any conversation
- Analysis/trends dashboard

---

## 6. Componentisation Plan: @ushadow/mobile-core

### 6.1 Package Structure

The shared library lives within the monorepo as a local package. Apps import from it directly — no npm publishing needed initially.

```
ushadow/
├── packages/
│   └── mobile-core/                    # @ushadow/mobile-core
│       ├── package.json
│       ├── tsconfig.json
│       ├── index.ts                    # Public API barrel export
│       │
│       ├── audio/                      # Audio streaming
│       │   ├── index.ts
│       │   ├── hooks/
│       │   │   ├── useAudioStreamer.ts        ← from app/hooks/
│       │   │   ├── usePhoneAudioRecorder.ts   ← from app/hooks/
│       │   │   ├── useAudioManager.ts         ← from app/hooks/
│       │   │   ├── useStreaming.ts             ← from app/hooks/
│       │   │   ├── useMultiDestinationStreamer.ts ← from app/hooks/
│       │   │   └── useSpeechToText.ts         ← from app/hooks/
│       │   ├── components/
│       │   │   ├── SourceSelector.tsx          ← from app/components/streaming/
│       │   │   ├── StreamingButton.tsx         ← from app/components/streaming/
│       │   │   ├── CompactStreamingButton.tsx  ← from app/components/streaming/
│       │   │   ├── StreamingDisplay.tsx        ← from app/components/streaming/
│       │   │   ├── AudioDestinationSelector.tsx ← from app/components/streaming/
│       │   │   └── AudioPlayer.tsx             ← from app/components/
│       │   └── types/
│       │       └── audio.ts
│       │
│       ├── ble/                        # Bluetooth / Omi device
│       │   ├── index.ts
│       │   ├── hooks/
│       │   │   ├── useDeviceScanning.ts       ← from app/hooks/
│       │   │   ├── useDeviceConnection.ts     ← from app/hooks/
│       │   │   └── useAudioListener.ts        ← from app/hooks/
│       │   ├── components/
│       │   │   ├── DeviceScanner.tsx           ← from app/components/ (OmiDeviceScanner)
│       │   │   ├── DeviceCard.tsx              ← from app/components/ (OmiDeviceCard)
│       │   │   └── DeviceSection.tsx           ← from app/components/ (OmiDeviceSection)
│       │   ├── contexts/
│       │   │   ├── BluetoothContext.tsx        ← from app/contexts/
│       │   │   └── OmiConnectionContext.tsx    ← from app/contexts/
│       │   └── types/
│       │       └── ble.ts
│       │
│       ├── auth/                       # Authentication
│       │   ├── index.ts
│       │   ├── keycloakAuth.ts                ← from app/services/
│       │   ├── authStorage.ts                 ← from app/_utils/
│       │   ├── useTokenMonitor.ts             ← from app/hooks/
│       │   └── types.ts
│       │
│       ├── session/                    # Session tracking
│       │   ├── index.ts
│       │   ├── hooks/
│       │   │   └── useSessionTracking.ts      ← from app/hooks/
│       │   ├── utils/
│       │   │   └── sessionStorage.ts          ← from app/_utils/
│       │   └── types/
│       │       └── streamingSession.ts        ← from app/types/
│       │
│       ├── data/                       # Backend API clients
│       │   ├── index.ts
│       │   ├── chronicleApi.ts                ← from app/services/
│       │   ├── myceliaApi.ts                  ← from app/services/
│       │   ├── memoriesApi.ts                 ← from app/services/
│       │   ├── chatApi.ts                     ← from app/services/
│       │   ├── feedApi.ts                     ← from app/services/
│       │   ├── audioProviderApi.ts            ← from app/services/
│       │   └── routineApi.ts                  # NEW — routine CRUD + analysis
│       │
│       ├── timeline/                   # NEW — Timeline feature
│       │   ├── index.ts
│       │   ├── components/
│       │   │   ├── TimelineView.tsx            # Visual timeline
│       │   │   ├── TimelineEvent.tsx           # Single event card
│       │   │   ├── TimelineComparison.tsx      # Side-by-side sessions
│       │   │   └── DurationBar.tsx             # Duration visualisation
│       │   ├── hooks/
│       │   │   └── useTimeline.ts             # Fetch + manage timeline data
│       │   └── types/
│       │       └── timeline.ts                # TimelineEvent, etc.
│       │
│       ├── routine/                    # NEW — Routine management
│       │   ├── index.ts
│       │   ├── components/
│       │   │   ├── RoutineCard.tsx             # Routine list item
│       │   │   ├── RoutineCreator.tsx          # Create/edit form
│       │   │   └── GoalSelector.tsx            # Goal type picker
│       │   ├── hooks/
│       │   │   ├── useRoutines.ts             # CRUD operations
│       │   │   └── useRoutineRecording.ts     # Recording lifecycle
│       │   └── types/
│       │       └── routine.ts                 # Routine, RoutineSession, etc.
│       │
│       ├── feedback/                   # NEW — Post-session feedback
│       │   ├── index.ts
│       │   ├── components/
│       │   │   ├── FeedbackWizard.tsx          # Multi-step feedback flow
│       │   │   ├── RatingSelector.tsx          # Star rating
│       │   │   ├── MoodSelector.tsx            # Mood picker
│       │   │   └── BlockerSelector.tsx         # Blocker multi-select
│       │   ├── hooks/
│       │   │   └── useFeedback.ts             # Submit + retrieve feedback
│       │   └── types/
│       │       └── feedback.ts
│       │
│       ├── analysis/                   # NEW — Trend analysis + suggestions
│       │   ├── index.ts
│       │   ├── components/
│       │   │   ├── TrendChart.tsx              # Duration over time
│       │   │   ├── SuggestionCard.tsx          # LLM suggestion display
│       │   │   ├── ActivityBreakdown.tsx       # Category pie/bar chart
│       │   │   └── ProgressSummary.tsx         # Key metrics
│       │   ├── hooks/
│       │   │   ├── useAnalysis.ts             # Fetch analysis data
│       │   │   └── useSuggestions.ts          # Fetch LLM suggestions
│       │   └── types/
│       │       └── analysis.ts
│       │
│       ├── schedule/                   # NEW — Schedule monitoring
│       │   ├── index.ts
│       │   ├── components/
│       │   │   ├── ScheduleBar.tsx             # Progress vs expected
│       │   │   └── AlertBanner.tsx             # Behind-schedule warning
│       │   ├── hooks/
│       │   │   └── useScheduleMonitor.ts      # Real-time schedule check
│       │   └── types/
│       │       └── schedule.ts
│       │
│       ├── location/                   # NEW — GPS tracking
│       │   ├── index.ts
│       │   ├── hooks/
│       │   │   └── useLocationTracking.ts     # Periodic GPS sampling
│       │   └── types/
│       │       └── location.ts
│       │
│       ├── chat/                       # Chat components
│       │   ├── index.ts
│       │   ├── components/
│       │   │   ├── MessageBubble.tsx           ← extract from chat.tsx
│       │   │   └── VoiceChatInput.tsx          ← from app/components/chat/
│       │   └── types/
│       │       └── chat.ts
│       │
│       └── core/                       # Cross-cutting utilities
│           ├── index.ts
│           ├── hooks/
│           │   ├── useAppLifecycle.ts          ← from app/hooks/
│           │   ├── useConnectionLog.ts         ← from app/hooks/
│           │   ├── useConnectionHealth.ts      ← from app/hooks/
│           │   └── useFeatureFlags.ts          ← from app/hooks/
│           ├── contexts/
│           │   └── FeatureFlagContext.tsx       ← from app/contexts/
│           ├── services/
│           │   ├── featureFlagService.ts       ← from app/services/
│           │   └── persistentLogger.ts         ← from app/services/
│           ├── utils/
│           │   ├── unodeStorage.ts             ← from app/_utils/
│           │   └── omiDeviceStorage.ts         ← from app/_utils/
│           └── theme/
│               ├── ThemeProvider.tsx            # NEW — injectable theme
│               ├── defaultTheme.ts             ← from app/theme.ts
│               └── types.ts                    # Theme type definition
```

### 6.2 Import Pattern

Apps consume the library via path aliases:

```typescript
// In nar8 app:
import { useAudioStreamer, StreamingButton } from '@ushadow/mobile-core/audio';
import { useRoutines, RoutineCard } from '@ushadow/mobile-core/routine';
import { TimelineView } from '@ushadow/mobile-core/timeline';
import { FeedbackWizard } from '@ushadow/mobile-core/feedback';
import { useKeycloakAuth } from '@ushadow/mobile-core/auth';

// In ushadow app (same imports):
import { TimelineView } from '@ushadow/mobile-core/timeline';
import { useRoutines } from '@ushadow/mobile-core/routine';
```

### 6.3 Theme Injection

The theme system becomes injectable so each app provides its own brand:

```typescript
// @ushadow/mobile-core/core/theme/types.ts
export interface AppTheme {
  colors: {
    primary: ColorScale;
    accent: ColorScale;
    background: string;
    backgroundCard: string;
    text: string;
    textMuted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  spacing: SpacingScale;
  borderRadius: RadiusScale;
  fontSize: FontScale;
  gradients: Record<string, string[]>;
}

// In ushadow app:
<ThemeProvider theme={ushadowTheme}>
  <App />
</ThemeProvider>

// In nar8 app:
<ThemeProvider theme={nar8Theme}>
  <App />
</ThemeProvider>
```

### 6.4 Config Injection

Similarly, the config system becomes injectable:

```typescript
// @ushadow/mobile-core/core/config/types.ts
export interface AppConfig {
  appName: string;
  defaultBaseUrl: string;
  bundleId: string;
  features: {
    routines: boolean;
    timeline: boolean;
    feed: boolean;
    memories: boolean;
    chat: boolean;
  };
}

// In nar8:
const nar8Config: AppConfig = {
  appName: 'nar8',
  defaultBaseUrl: 'https://api.nar8.io',
  bundleId: 'io.nar8.app',
  features: {
    routines: true,
    timeline: true,
    feed: false,       // nar8 doesn't show feeds
    memories: false,   // nar8 doesn't show general memories
    chat: true,        // coaching chat only
  },
};
```

---

## 7. Backend: Core Services (Not nar8-Namespaced)

Since timeline/routine features are core ushadow capabilities, the API routes are **not** namespaced under `/api/nar8/`. They live alongside existing routes.

### 7.1 New API Routes

```
# Routine Management
POST   /api/routines                          # Create routine
GET    /api/routines                          # List user's routines
GET    /api/routines/{id}                     # Get routine details
PUT    /api/routines/{id}                     # Update routine
DELETE /api/routines/{id}                     # Archive routine

# Session Management (extends existing session concept)
POST   /api/routines/{id}/sessions            # Start recording session
PUT    /api/sessions/{id}/end                 # End recording session
GET    /api/sessions/{id}                     # Get session + timeline
GET    /api/routines/{id}/sessions            # List sessions for routine

# Timeline (works on any conversation, not just routines)
POST   /api/timeline/extract                  # Extract timeline from any conversation
GET    /api/sessions/{id}/timeline            # Get timeline for a session
GET    /api/conversations/{id}/timeline       # Get timeline for any conversation

# Feedback (generic post-session feedback)
POST   /api/sessions/{id}/feedback            # Submit feedback
GET    /api/sessions/{id}/feedback            # Get feedback for session

# Analysis
GET    /api/routines/{id}/analysis            # Get routine analysis
GET    /api/routines/{id}/trends              # Trend data for charts
GET    /api/routines/{id}/suggestions         # LLM optimisation suggestions

# Schedule & Transport
GET    /api/routines/{id}/schedule            # Current schedule state
POST   /api/routines/{id}/schedule/check      # Check if on track
GET    /api/transport/estimate                # Travel time estimate

# Location (extends existing sessions)
POST   /api/sessions/{id}/location            # Append GPS point
```

### 7.2 New Backend Services

```
ushadow/backend/src/
├── services/
│   ├── timeline_extractor.py      # NEW — LLM-powered transcript → timeline
│   ├── routine_service.py         # NEW — Routine CRUD + session lifecycle
│   ├── routine_analyser.py        # NEW — Cross-session trend analysis
│   ├── schedule_monitor.py        # NEW — Real-time schedule tracking
│   ├── transport_service.py       # NEW — Public transport API client
│   ├── feedback_service.py        # NEW — Post-session feedback storage
│   └── llm_client.py             # EXISTING — extended with analysis prompts
├── routers/
│   ├── routines.py               # NEW
│   ├── timeline.py               # NEW
│   ├── schedule.py               # NEW
│   ├── transport.py              # NEW
│   └── feedback.py               # NEW
├── models/
│   ├── routine.py                # NEW — Routine, RoutineSession Beanie docs
│   ├── timeline.py               # NEW — TimelineEvent model
│   ├── feedback.py               # NEW — RoutineFeedback model
│   └── transport.py              # NEW — TransportLeg model
```

### 7.3 Integration with main.py

```python
# In main.py — added alongside existing router includes:
from src.routers import routines, timeline, schedule, transport, feedback

app.include_router(routines.router, prefix="/api/routines", tags=["routines"])
app.include_router(timeline.router, prefix="/api/timeline", tags=["timeline"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"])
app.include_router(transport.router, prefix="/api/transport", tags=["transport"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
```

---

## 8. LLM Prompts (Key Templates)

### 8.1 Activity Extraction

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

### 8.2 Optimisation Analysis

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

### 8.3 General Timeline Extraction (non-routine)

```
Analyse this conversation transcript and extract a timeline of events or
topics discussed. For each segment, provide:
- topic: short description
- category: one of [discussion, decision, action_item, question, tangent, other]
- start_time: ISO timestamp
- end_time: ISO timestamp
- key_points: bullet list of main points
- participants: who was speaking (if identifiable)

Transcript:
{transcript}
```

---

## 9. Screen Maps

### 9.1 ushadow App (Updated)

```
ushadow App
├── Home (existing + extended)
│   ├── Streaming controls (existing)
│   ├── "Record as Routine" toggle          # NEW
│   └── Active routine indicator             # NEW
├── Chat (existing)
├── Feed (existing)
├── History (existing conversations tab, extended)
│   ├── Conversation list (existing)
│   ├── [Conversation] → detail
│   │   └── "View Timeline" button           # NEW
│   │       └── TimelineView component       # NEW
│   └── Routines section                     # NEW
│       ├── Routine list
│       └── [Routine] → detail + sessions
├── Memories (existing)
└── Sessions (existing, extended)
    └── Sessions now link to timeline if available  # NEW
```

### 9.2 nar8 App (Standalone)

```
nar8 App
├── Routines (home tab)
│   ├── [+] New Routine → RoutineCreator
│   └── [Routine Card] → Routine Detail
│       ├── Start Recording → Recording Screen
│       │   └── Recording Ends → Feedback → Timeline Review
│       ├── Session History
│       │   └── [Session] → TimelineView
│       ├── Analysis
│       │   ├── TrendChart
│       │   ├── ActivityBreakdown
│       │   └── SuggestionCards
│       └── Settings (goal, location, schedule)
├── Active (recording tab — only visible during recording)
│   ├── Live waveform (StreamingDisplay)
│   ├── Current activity indicator
│   ├── Elapsed time + ScheduleBar
│   └── End Recording button
└── Coach (chat tab)
    └── LLM chat pre-loaded with routine context
```

---

## 10. Implementation Phases

### Phase 0: Componentise (prerequisite)
- [ ] Create `packages/mobile-core/` structure
- [ ] Extract `audio/` module (hooks + components) from ushadow mobile
- [ ] Extract `ble/` module
- [ ] Extract `auth/` module
- [ ] Extract `session/` module
- [ ] Extract `data/` module (API clients)
- [ ] Extract `chat/` module
- [ ] Extract `core/` module (feature flags, lifecycle, logging, utils)
- [ ] Make `theme/` injectable via ThemeProvider
- [ ] Make `config` injectable via ConfigProvider
- [ ] Update ushadow mobile to import from `@ushadow/mobile-core`
- [ ] Verify ushadow mobile still works identically after extraction

### Phase 1: Core Features in ushadow (MVP)
- [ ] Backend: Routine + Session + TimelineEvent + Feedback Beanie models
- [ ] Backend: `TimelineExtractor` service (LLM-powered)
- [ ] Backend: `RoutineService` (CRUD + session lifecycle)
- [ ] Backend: `FeedbackService`
- [ ] Backend: `/api/routines`, `/api/timeline`, `/api/feedback` routers
- [ ] Mobile-core: `timeline/` module (TimelineView, TimelineEvent, hooks)
- [ ] Mobile-core: `routine/` module (RoutineCard, RoutineCreator, hooks)
- [ ] Mobile-core: `feedback/` module (FeedbackWizard, hooks)
- [ ] Mobile-core: `data/routineApi.ts` client
- [ ] ushadow mobile: Add timeline view to conversation detail
- [ ] ushadow mobile: Add routine section to History tab
- [ ] ushadow mobile: "Record as routine" option on home screen

### Phase 2: nar8 App Shell
- [ ] Create `apps/nar8/` as a new Expo app
- [ ] nar8 theme + branding
- [ ] nar8 3-tab layout (Routines / Active / Coach)
- [ ] nar8 home screen (routine list with quick-record)
- [ ] nar8 recording screen (compose core audio + routine + schedule components)
- [ ] nar8 post-recording flow (feedback → timeline review)
- [ ] nar8 app config (EAS, bundle ID, permissions)
- [ ] nar8 coaching chat (core chat with routine system prompt)

### Phase 3: Intelligence
- [ ] Backend: `RoutineAnalyser` service (cross-session trends)
- [ ] Backend: LLM optimisation suggestion generation
- [ ] Mobile-core: `analysis/` module (TrendChart, SuggestionCard, etc.)
- [ ] Activity normalisation and canonical mapping
- [ ] Sentiment analysis from narration tone
- [ ] ushadow: Analysis dashboard for routines
- [ ] nar8: Analysis tab within routine detail

### Phase 4: Proactive Features
- [ ] Mobile-core: `location/` module (useLocationTracking hook)
- [ ] Mobile-core: `schedule/` module (ScheduleBar, AlertBanner, hooks)
- [ ] Backend: `ScheduleMonitor` service
- [ ] Backend: `TransportService` (public transport API client)
- [ ] Push notifications when behind schedule
- [ ] "Leave by" time calculation
- [ ] Live Activity widget updates for schedule status

### Phase 5: Polish & Advanced
- [ ] Routine sharing (anonymised)
- [ ] Calendar integration
- [ ] Apple Watch companion
- [ ] Habit streak tracking
- [ ] Multi-routine chaining (morning → commute → arrival)
- [ ] Web dashboard: routine management + analysis pages

---

## 11. Technical Notes

### 11.1 New Dependencies (Mobile)
- `expo-location` — GPS tracking during recording
- `expo-notifications` — schedule-aware push notifications
- `victory-native` or `react-native-chart-kit` — trend visualisation
- `expo-calendar` — calendar integration (Phase 5)

### 11.2 New Dependencies (Backend)
- Transport APIs: Google Directions API, or OpenTripPlanner / Transitland
- No new LLM dependencies — uses existing LiteLLM + provider system

### 11.3 Data Storage
- Routines, sessions, events, feedback → MongoDB (existing infrastructure)
- Audio + transcripts → Chronicle (existing)
- Location data → stored with session in MongoDB (array of `{lat, lng, timestamp}`)

### 11.4 Monorepo Structure (Updated)

```
ushadow/
├── packages/
│   └── mobile-core/          # @ushadow/mobile-core shared library
├── apps/
│   └── nar8/                 # nar8 standalone app
├── ushadow/
│   ├── mobile/               # ushadow mobile app (now imports from mobile-core)
│   ├── backend/              # ushadow backend (extended with routine/timeline services)
│   ├── frontend/             # ushadow web dashboard
│   └── launcher/             # Desktop launcher
├── backend/                  # (existing structure)
├── chronicle/                # Chronicle submodule
├── mycelia/                  # Mycelia submodule
└── ...
```

### 11.5 App Identities

| Property | ushadow | nar8 |
|----------|---------|------|
| Bundle ID | `io.ushadow.app` | `io.nar8.app` |
| EAS Project | ushadow | nar8 (new) |
| Backend | Full ushadow backend | Same backend |
| Auth realm | ushadow Keycloak | Same realm |
| Tabs | 5 (Home, Chat, Feed, History, Memories) | 3 (Routines, Active, Coach) |
| Features | Everything | Routines + Timeline + Coaching |

### 11.6 Migration Path for Componentisation

The extraction follows a **strangler fig** pattern — no big bang:

1. Create `packages/mobile-core/` with empty modules
2. Move one module at a time (start with `audio/`)
3. Replace imports in ushadow mobile to use `@ushadow/mobile-core/audio`
4. Verify everything still works
5. Repeat for next module
6. Once all modules extracted, ushadow mobile's `app/` contains only screens and layouts

This approach means ushadow mobile never breaks during the componentisation process.
