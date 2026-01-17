/**
 * Sound utility hook for playing notification sounds using Web Audio API.
 * Creates call-like sound effects for environment/instance operations.
 */

type SoundType = 'create' | 'delete'

interface SoundOptions {
  volume?: number // 0-1, default 0.3
}

// Audio context singleton (created on first use)
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioContext
}

/**
 * Play a rising tone sequence - like a successful connection/creation call sound
 */
function playCreateSound(options: SoundOptions = {}): void {
  const ctx = getAudioContext()
  const volume = options.volume ?? 0.3
  const now = ctx.currentTime

  // Create a pleasant rising two-tone sequence (like a call connect sound)
  const frequencies = [523.25, 659.25] // C5, E5
  const duration = 0.12

  frequencies.forEach((freq, index) => {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(freq, now + index * duration)

    // Envelope: quick attack, sustain, quick release
    const startTime = now + index * duration
    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02)
    gainNode.gain.setValueAtTime(volume, startTime + duration - 0.03)
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

    oscillator.start(startTime)
    oscillator.stop(startTime + duration)
  })
}

/**
 * Play a descending tone - like a disconnect/deletion call sound
 */
function playDeleteSound(options: SoundOptions = {}): void {
  const ctx = getAudioContext()
  const volume = options.volume ?? 0.25
  const now = ctx.currentTime

  // Single descending tone (like a call end/disconnect sound)
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.type = 'sine'

  // Descending frequency sweep
  oscillator.frequency.setValueAtTime(440, now) // A4
  oscillator.frequency.exponentialRampToValueAtTime(330, now + 0.15) // E4

  // Envelope
  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(volume, now + 0.02)
  gainNode.gain.setValueAtTime(volume, now + 0.1)
  gainNode.gain.linearRampToValueAtTime(0, now + 0.18)

  oscillator.start(now)
  oscillator.stop(now + 0.2)
}

/**
 * Play a sound effect
 * @param type - The type of sound to play ('create' or 'delete')
 * @param options - Optional configuration (volume, etc.)
 */
export function playSound(type: SoundType, options: SoundOptions = {}): void {
  // Don't play sounds if the page isn't visible or audio context isn't available
  if (document.hidden) return

  try {
    switch (type) {
      case 'create':
        playCreateSound(options)
        break
      case 'delete':
        playDeleteSound(options)
        break
    }
  } catch (error) {
    // Silently fail if audio isn't available
    console.debug('Sound playback failed:', error)
  }
}

/**
 * React hook that provides sound playback functions
 */
export function useSound() {
  return {
    playCreateSound: (options?: SoundOptions) => playSound('create', options),
    playDeleteSound: (options?: SoundOptions) => playSound('delete', options),
  }
}

export default useSound
