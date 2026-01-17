/**
 * Test for usePhoneAudioRecorder audio level state updates
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { usePhoneAudioRecorder } from '../usePhoneAudioRecorder';

// Mock react-native-audio-record
jest.mock('react-native-audio-record', () => {
  const mockHandlers: { [key: string]: Function } = {};

  return {
    __esModule: true,
    default: {
      init: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      on: jest.fn((event: string, handler: Function) => {
        mockHandlers[event] = handler;
      }),
      removeListener: jest.fn(),
      // Helper to trigger data events from tests
      __triggerData: (data: string) => {
        if (mockHandlers['data']) {
          mockHandlers['data'](data);
        }
      },
    },
  };
});

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  },
}));

// Mock react-native Alert
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
}));

describe('usePhoneAudioRecorder audio level updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should update audioLevel state when audio data is received', async () => {
    const AudioRecord = require('react-native-audio-record').default;
    const { result } = renderHook(() => usePhoneAudioRecorder());

    // Start recording
    await act(async () => {
      await result.current.startRecording(() => {});
    });

    // Verify initial state
    expect(result.current.audioLevel).toBe(0);
    expect(result.current.isRecording).toBe(true);

    // Simulate audio data with some level
    // Create PCM data that should result in non-zero audio level
    const pcmData = new Array(2048).fill(0);
    for (let i = 0; i < pcmData.length; i += 2) {
      // 16-bit samples: value between -32768 and 32767
      const sample = Math.floor(Math.random() * 10000) - 5000;
      pcmData[i] = sample & 0xff;
      pcmData[i + 1] = (sample >> 8) & 0xff;
    }
    const base64Data = Buffer.from(pcmData).toString('base64');

    // Trigger audio data event
    act(() => {
      AudioRecord.__triggerData(base64Data);
    });

    // Advance timers to trigger sync interval (should run every 50ms)
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // The audio level should now be updated in state
    await waitFor(() => {
      expect(result.current.audioLevel).toBeGreaterThan(0);
    }, { timeout: 1000 });

    // Stop recording
    await act(async () => {
      await result.current.stopRecording();
    });

    // Audio level should reset to 0
    expect(result.current.audioLevel).toBe(0);
  });

  it('should continuously update audioLevel as new chunks arrive', async () => {
    const AudioRecord = require('react-native-audio-record').default;
    const { result } = renderHook(() => usePhoneAudioRecorder());

    await act(async () => {
      await result.current.startRecording(() => {});
    });

    const audioLevels: number[] = [];

    // Send 5 chunks with different levels
    for (let chunk = 0; chunk < 5; chunk++) {
      const pcmData = new Array(2048).fill(0);
      const magnitude = (chunk + 1) * 2000; // Increasing levels

      for (let i = 0; i < pcmData.length; i += 2) {
        const sample = Math.floor(Math.random() * magnitude) - (magnitude / 2);
        pcmData[i] = sample & 0xff;
        pcmData[i + 1] = (sample >> 8) & 0xff;
      }

      const base64Data = Buffer.from(pcmData).toString('base64');

      act(() => {
        AudioRecord.__triggerData(base64Data);
        jest.advanceTimersByTime(100); // Advance sync interval
      });

      audioLevels.push(result.current.audioLevel);
    }

    // Audio levels should change over time
    const uniqueLevels = new Set(audioLevels.filter(l => l > 0));
    expect(uniqueLevels.size).toBeGreaterThan(1);

    await act(async () => {
      await result.current.stopRecording();
    });
  });

  it('should handle cleanup properly without breaking state updates', async () => {
    const AudioRecord = require('react-native-audio-record').default;
    const { result, rerender } = renderHook(() => usePhoneAudioRecorder());

    // Start recording
    await act(async () => {
      await result.current.startRecording(() => {});
    });

    // Trigger audio data
    const pcmData = new Array(2048).fill(0).map((_, i) =>
      i % 2 === 0 ? 100 : 0
    );
    const base64Data = Buffer.from(pcmData).toString('base64');

    act(() => {
      AudioRecord.__triggerData(base64Data);
      jest.advanceTimersByTime(100);
    });

    // Force re-render (simulates component updates)
    rerender();

    // Audio level should still be accessible after re-render
    await waitFor(() => {
      expect(result.current.audioLevel).toBeGreaterThan(0);
    });

    await act(async () => {
      await result.current.stopRecording();
    });
  });
});
