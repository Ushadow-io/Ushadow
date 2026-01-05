# Design-v2 Frontend Migration Guide

## Overview

This guide explains how to migrate to the Chronicle design-v2 frontend, which features:

- **Gradient backgrounds** with decorative blur elements
- **Modern glassmorphism** effects (backdrop blur)
- **Dark mode by default** with improved theming
- **Simplified architecture** (removed global RecordingContext)
- **Header record button** with live waveform visualization
- **Enhanced accessibility** with better focus states
- **Polished UI components** with smooth animations

---

## Visual Design Changes

### 1. Gradient Backgrounds

**Before (Plain background):**
```tsx
<div className="min-h-screen bg-white dark:bg-neutral-900">
  {/* Content */}
</div>
```

**After (Gradient with decorative elements):**
```tsx
<div className="min-h-screen bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
  {/* Decorative background blur circles */}
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-400/20 dark:bg-primary-500/10 rounded-full blur-3xl"></div>
    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-300/20 dark:bg-primary-600/10 rounded-full blur-3xl"></div>
  </div>

  {/* Content with z-10 to appear above decorations */}
  <div className="relative z-10">
    {/* Your content */}
  </div>
</div>
```

**Key Elements:**
- `bg-gradient-to-br` - Bottom-right diagonal gradient
- `from-neutral-50 via-primary-50/30 to-neutral-100` - Light mode gradient stops
- `dark:from-neutral-950 dark:via-neutral-900` - Dark mode gradient
- Blur circles positioned with `absolute` and negative values (`-top-40`)
- `blur-3xl` - Extra large blur for soft glow effect
- `/20`, `/10` opacity for subtle effect
- `pointer-events-none` - Decorations don't intercept clicks

### 2. Glassmorphism Cards

**Before (Solid background):**
```tsx
<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
  {/* Card content */}
</div>
```

**After (Glass effect with backdrop blur):**
```tsx
<div className="card shadow-xl backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90 p-8 space-y-6 animate-slide-up">
  {/* Card content */}
</div>
```

**Changes:**
- `backdrop-blur-sm` - Blurs content behind the card
- `bg-white/90` - 90% opacity (allows slight transparency)
- `animate-slide-up` - Entrance animation
- Larger shadow (`shadow-xl` vs `shadow`)

### 3. Enhanced Logo/Brand

**Before (Simple):**
```tsx
<div className="flex items-center space-x-2">
  <Brain className="h-8 w-8 text-primary-600" />
  <h1 className="text-xl font-bold">Chronicle</h1>
</div>
```

**After (Gradient container with hover effect):**
```tsx
<div className="flex items-center space-x-3">
  <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md">
    <Brain className="h-6 w-6 text-white" />
  </div>
  <div>
    <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
      Chronicle
    </h1>
    <p className="text-xs text-neutral-500 dark:text-neutral-400">AI Memory System</p>
  </div>
</div>
```

**For logo with hover:**
```tsx
<div className="mx-auto h-20 w-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg mb-6 transform transition-transform hover:scale-105">
  <Brain className="h-10 w-10 text-white" />
</div>
```

### 4. Button Enhancements

**Before:**
```tsx
<button className="btn-primary">
  Sign in
</button>
```

**After (With transform effects):**
```tsx
<button className="btn-primary w-full py-3 text-base font-semibold shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]">
  Sign in
</button>
```

**Loading state with spinner:**
```tsx
<button disabled={isLoading} className="btn-primary ...">
  {isLoading ? (
    <div className="flex items-center justify-center space-x-2">
      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
      <span>Signing in...</span>
    </div>
  ) : (
    'Sign in'
  )}
</button>
```

---

## Architecture Changes

### Remove RecordingContext (Simplified State Management)

**Before (Global Context):**

`src/contexts/RecordingContext.tsx` - **DELETE THIS FILE**

```tsx
// ❌ Old approach - Remove
import { RecordingProvider } from './contexts/RecordingContext'

<RecordingProvider>
  <Router>
    <Routes>...</Routes>
  </Router>
</RecordingProvider>
```

**After (Local Hook State):**

`src/App.tsx`:
```tsx
// ✅ New approach - No provider needed
<ThemeProvider>
  <AuthProvider>
    <Router>
      <Routes>...</Routes>
    </Router>
  </AuthProvider>
</ThemeProvider>
```

### Updated useSimpleAudioRecording Hook

**Key Changes:**
1. Recording state is now LOCAL to the hook (not global context)
2. Types moved to the hook file
3. Simplified implementation

**Before (Using context):**
```tsx
import { useRecording, RecordingMode } from '../contexts/RecordingContext'

const recording = useRecording()
const { isRecording, currentStep, startRecording, stopRecording } = recording
```

**After (Using hook directly):**
```tsx
import { useSimpleAudioRecording, RecordingMode } from '../hooks/useSimpleAudioRecording'

const recording = useSimpleAudioRecording()
// Everything is in the hook return value
```

**Updated hook signature:**
```typescript
// src/hooks/useSimpleAudioRecording.ts
export type RecordingStep = 'idle' | 'mic' | 'websocket' | 'audio-start' | 'streaming' | 'stopping' | 'error'
export type RecordingMode = 'batch' | 'streaming'

export interface SimpleAudioRecordingReturn {
  isRecording: boolean
  currentStep: RecordingStep
  duration: number
  error: string | null
  debugStats: DebugStats
  analyser: AnalyserNode | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  resetError: () => void
}

export const useSimpleAudioRecording = (): SimpleAudioRecordingReturn => {
  // All state is local useState hooks
  const [isRecording, setIsRecording] = useState(false)
  const [currentStep, setCurrentStep] = useState<RecordingStep>('idle')
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // ... etc
}
```

---

## CSS/Styling Updates

### Update index.css

Add these utility classes to `src/index.css`:

```css
@layer utilities {
  /* Animation utilities */
  .animate-fade-in {
    animation: fadeIn 0.3s ease-in-out;
  }

  .animate-slide-up {
    animation: slideUp 0.3s ease-out;
  }

  .animate-slide-down {
    animation: slideDown 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slideDown {
    from {
      transform: translateY(-10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* Backdrop blur utilities */
  .backdrop-blur-xs {
    backdrop-filter: blur(2px);
  }

  .backdrop-blur-sm {
    backdrop-filter: blur(4px);
  }

  .backdrop-blur-md {
    backdrop-filter: blur(8px);
  }

  .backdrop-blur-lg {
    backdrop-filter: blur(16px);
  }
}
```

---

## Theme Updates

### Set Dark Mode as Default

**Before (Light mode default):**
```tsx
// src/contexts/ThemeContext.tsx
const [isDark, setIsDark] = useState(() => {
  const saved = localStorage.getItem('theme')
  return saved === 'dark'  // ❌ Defaults to false (light)
})
```

**After (Dark mode default):**
```tsx
// src/contexts/ThemeContext.tsx
const [isDark, setIsDark] = useState(() => {
  const saved = localStorage.getItem('theme')
  // Default to dark mode if no preference is saved
  return saved ? saved === 'dark' : true  // ✅ Defaults to true (dark)
})
```

---

## HeaderRecordButton Component

### Add Header Record Button

Create `src/components/header/HeaderRecordButton.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Mic, Square } from 'lucide-react'
import { useSimpleAudioRecording } from '../../hooks/useSimpleAudioRecording'

export default function HeaderRecordButton() {
  const recording = useSimpleAudioRecording()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  // Waveform visualization
  useEffect(() => {
    if (!recording.isRecording || !recording.analyser || !canvasRef.current) {
      // Clear animation when not recording
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      // Clear canvas
      if (canvasRef.current) {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
      }
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const analyser = recording.analyser
    analyser.fftSize = 32 // Smaller for compact visualization
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = canvas.width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8

        // Gradient color based on intensity
        const intensity = dataArray[i] / 255
        const r = Math.floor(59 + intensity * 40)
        const g = Math.floor(130 + intensity * 70)
        const b = Math.floor(246 - intensity * 50)

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight)

        x += barWidth
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [recording.isRecording, recording.analyser])

  const handleClick = async () => {
    if (recording.isRecording) {
      recording.stopRecording()
    } else {
      await recording.startRecording()
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`
        relative h-10 px-4 rounded-lg font-medium transition-all duration-200
        flex items-center space-x-2
        ${recording.isRecording
          ? 'bg-error-600 hover:bg-error-700 text-white shadow-lg shadow-error-500/30'
          : 'bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        transform hover:scale-105 active:scale-95
      `}
      disabled={recording.currentStep !== 'idle' && recording.currentStep !== 'streaming'}
    >
      {recording.isRecording ? (
        <>
          <Square className="h-4 w-4 fill-current" />
          <span className="text-sm font-semibold">Stop</span>
          {/* Live waveform */}
          <canvas
            ref={canvasRef}
            width={80}
            height={24}
            className="ml-2"
          />
        </>
      ) : (
        <>
          <Mic className="h-4 w-4" />
          <span className="text-sm font-semibold">Record</span>
        </>
      )}
    </button>
  )
}
```

**Key Features:**
- Live waveform visualization using Canvas API
- Color gradient based on audio intensity
- Transform animations on hover/active
- Clean canvas on unmount
- Integrated with useSimpleAudioRecording hook

### Add to Layout

**In `src/components/layout/Layout.tsx`:**
```tsx
import HeaderRecordButton from '../header/HeaderRecordButton'

// In the header section:
<div className="flex items-center space-x-1">
  {/* Record Button */}
  <HeaderRecordButton />

  {/* Divider */}
  <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-700 mx-2"></div>

  {/* Other header actions... */}
</div>
```

---

## Enhanced Header Design

**Update Layout header:**

```tsx
<header className="sticky top-0 z-sticky bg-white/80 dark:bg-neutral-800/80 backdrop-blur-lg border-b border-neutral-200 dark:border-neutral-700 shadow-sm">
  <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex justify-between items-center h-16">
      {/* Logo & Brand */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md">
          <Brain className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
            Chronicle
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">AI Memory System</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex-1 max-w-xl mx-8 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search conversations, memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-700/50 border border-transparent rounded-lg text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center space-x-1">
        <HeaderRecordButton />

        <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-700 mx-2"></div>

        {/* Notifications */}
        <button className="btn-ghost p-2.5 rounded-lg relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-500 rounded-full"></span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2.5 rounded-lg"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* User Menu */}
        {/* ... existing user menu code ... */}
      </div>
    </div>
  </div>
</header>
```

**Key Changes:**
- `bg-white/80` with `backdrop-blur-lg` for glass effect
- Gradient logo background
- Improved search bar styling
- Better spacing and typography

---

## Step-by-Step Migration Checklist

### Phase 1: Cleanup (Breaking Changes)

- [ ] **Delete** `src/contexts/RecordingContext.tsx`
- [ ] **Remove** `<RecordingProvider>` from `App.tsx`
- [ ] **Remove** imports of `useRecording` from all components
- [ ] **Update** all components to use `useSimpleAudioRecording()` directly

### Phase 2: Visual Updates

- [ ] **Update** `src/contexts/ThemeContext.tsx` - Set dark mode default
- [ ] **Update** `src/index.css` - Add animation utilities
- [ ] **Update** `src/pages/LoginPage.tsx` - Add gradient background
- [ ] **Update** `src/components/layout/Layout.tsx` - Enhance header
- [ ] **Create** `src/components/header/HeaderRecordButton.tsx`

### Phase 3: Component Polish

- [ ] Add glassmorphism to cards (`backdrop-blur-sm`, `bg-white/90`)
- [ ] Add hover effects to buttons (`hover:scale-105`, `active:scale-95`)
- [ ] Add entrance animations (`animate-fade-in`, `animate-slide-up`)
- [ ] Update logo to use gradient container
- [ ] Add decorative blur circles to backgrounds

### Phase 4: Testing

- [ ] Test recording functionality (start/stop)
- [ ] Test theme toggle (light/dark)
- [ ] Test animations on page load
- [ ] Test responsive design (mobile/tablet/desktop)
- [ ] Test accessibility (keyboard navigation, focus states)
- [ ] Verify waveform visualization works

---

## Common Issues and Solutions

### Issue 1: RecordingContext Not Found

**Error:**
```
Cannot find module './contexts/RecordingContext'
```

**Solution:**
1. Remove all imports of `RecordingContext`
2. Replace `useRecording()` with `useSimpleAudioRecording()`
3. Delete the context file

**Before:**
```tsx
import { useRecording } from '../contexts/RecordingContext'
const { isRecording } = useRecording()
```

**After:**
```tsx
import { useSimpleAudioRecording } from '../hooks/useSimpleAudioRecording'
const recording = useSimpleAudioRecording()
const { isRecording } = recording
```

### Issue 2: Backdrop Blur Not Working

**Symptom:** Glassmorphism effects don't appear

**Causes:**
1. CSS not loaded
2. Browser doesn't support backdrop-filter
3. Missing opacity on background

**Solution:**
```css
/* Ensure this is in index.css */
.backdrop-blur-sm {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px); /* Safari support */
}
```

```tsx
/* Must have semi-transparent background */
<div className="backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90">
  {/* Content */}
</div>
```

### Issue 3: Waveform Not Appearing

**Symptom:** HeaderRecordButton shows but no waveform

**Causes:**
1. `analyser` not exposed from hook
2. Canvas ref not attached
3. Animation not starting

**Solution:**

Check `useSimpleAudioRecording` returns `analyser`:
```typescript
export interface SimpleAudioRecordingReturn {
  // ... other properties
  analyser: AnalyserNode | null  // ✅ Must be exposed
}
```

Create analyser when starting recording:
```typescript
// In useSimpleAudioRecording hook
const audioContext = new AudioContext()
const analyser = audioContext.createAnalyser()
const source = audioContext.createMediaStreamSource(stream)
source.connect(analyser)
// Store in state so HeaderRecordButton can access it
```

### Issue 4: Dark Mode Not Default

**Symptom:** App loads in light mode

**Solution:**

Update `ThemeContext.tsx`:
```tsx
const [isDark, setIsDark] = useState(() => {
  const saved = localStorage.getItem('theme')
  return saved ? saved === 'dark' : true  // ✅ Default to true
})
```

Clear localStorage to reset:
```javascript
localStorage.removeItem('theme')
window.location.reload()
```

### Issue 5: Animations Not Smooth

**Symptom:** Elements jump or animations look choppy

**Solution:**

Ensure Tailwind transition utilities are applied:
```tsx
<button className="transform transition-all duration-200 hover:scale-105 active:scale-95">
  {/* Content */}
</button>
```

Check index.css has smooth scrolling:
```css
html {
  scroll-behavior: smooth;
}
```

---

## Before/After Examples

### LoginPage Complete Example

**Before (Old design):**
```tsx
export default function LoginPage() {
  // ... state and handlers ...

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="text-center">
          <Brain className="h-12 w-12 text-primary-600 mx-auto" />
          <h2 className="text-2xl font-bold">Chronicle</h2>
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
          <form onSubmit={handleSubmit}>
            <input type="email" className="input" />
            <input type="password" className="input" />
            <button className="btn-primary">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

**After (Design-v2):**
```tsx
export default function LoginPage() {
  // ... state and handlers ...

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-400/20 dark:bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-300/20 dark:bg-primary-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Logo & Header */}
        <div className="text-center animate-fade-in">
          <div className="mx-auto h-20 w-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg mb-6 transform transition-transform hover:scale-105">
            <Brain className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
            Chronicle
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 font-medium">
            AI-Powered Personal Audio System
          </p>
        </div>

        {/* Login Form */}
        <div className="card shadow-xl backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90 p-8 space-y-6 animate-slide-up">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Email address</label>
              <input type="email" className="input" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Password</label>
              <div className="relative">
                <input type="password" className="input pr-10" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Eye className="h-5 w-5 text-neutral-400" />
                </button>
              </div>
            </div>

            <button className="btn-primary w-full py-3 shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]">
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

---

## Performance Considerations

### Backdrop Blur Performance

Backdrop blur can be expensive on lower-end devices. Consider:

```tsx
/* Use sparingly - only on key UI elements */
<div className="backdrop-blur-sm">  {/* Light blur */}

/* Avoid on large surfaces or many elements */
<div className="backdrop-blur-lg">  {/* Heavy blur - use carefully */}
```

### Canvas Animation Optimization

```typescript
// In HeaderRecordButton.tsx

// ✅ Good - Small FFT size for header button
analyser.fftSize = 32

// ❌ Avoid - Large FFT size is overkill
analyser.fftSize = 2048

// ✅ Good - Cancel animation on unmount
return () => {
  if (animationRef.current) {
    cancelAnimationFrame(animationRef.current)
  }
}
```

### Animation Performance

```tsx
/* ✅ Use transform (GPU-accelerated) */
<button className="transform hover:scale-105">

/* ❌ Avoid animating width/height (causes reflow) */
<button className="hover:w-full">
```

---

## Summary

### What Changed

**Removed:**
- ❌ Global RecordingContext
- ❌ Plain backgrounds
- ❌ Simple solid cards
- ❌ Light mode default

**Added:**
- ✅ Local hook state for recording
- ✅ Gradient backgrounds with blur decorations
- ✅ Glassmorphism (backdrop blur)
- ✅ HeaderRecordButton with live waveform
- ✅ Dark mode as default
- ✅ Smooth animations
- ✅ Enhanced typography and spacing
- ✅ Better accessibility (focus states)

### Key Takeaways

1. **Architecture is simpler** - No global recording context needed
2. **Visual design is richer** - Gradients, blur effects, animations
3. **Components are more polished** - Better hover states, transitions
4. **Dark mode first** - Designed primarily for dark theme
5. **Accessibility improved** - Better focus indicators, ARIA labels

---

## Additional Resources

### Tailwind CSS Classes Reference

**Gradients:**
- `bg-gradient-to-br` - Bottom-right diagonal
- `from-color via-color to-color` - Gradient stops
- `dark:from-color` - Dark mode gradient

**Blur Effects:**
- `blur-3xl` - Extra large blur (64px)
- `backdrop-blur-sm` - Backdrop blur (4px)
- `bg-color/90` - 90% opacity

**Transforms:**
- `transform` - Enable transforms
- `scale-105` - 105% scale (5% larger)
- `hover:scale-105` - Scale on hover
- `transition-transform` - Smooth transitions

**Animations:**
- `animate-fade-in` - Custom fade in
- `animate-slide-up` - Custom slide up
- `duration-200` - 200ms transition

### Browser Compatibility

**Backdrop Filter:**
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (with `-webkit-` prefix)
- Mobile: ✅ Full support

**Canvas API:**
- All modern browsers: ✅ Full support

**CSS Gradients:**
- All modern browsers: ✅ Full support

---

## Conclusion

The design-v2 frontend represents a significant visual and architectural improvement:

- **Cleaner architecture** with simplified state management
- **Modern visual design** with gradients and glassmorphism
- **Better user experience** with smooth animations and transitions
- **Improved accessibility** with better focus states
- **Performance optimized** with GPU-accelerated transforms

Follow this guide step-by-step to successfully migrate your frontend to the latest design standards.
