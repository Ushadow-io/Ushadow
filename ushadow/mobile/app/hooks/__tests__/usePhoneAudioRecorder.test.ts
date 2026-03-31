/**
 * Test for usePhoneAudioRecorder audio level state updates
 * Uses @siteed/expo-audio-studio mock
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { usePhoneAudioRecorder } from '../usePhoneAudioRecorder';

// Capture the onAudioStream callback so tests can trigger it
let capturedOnAudioStream: ((event: any) => void) | null = null;
let capturedAnalysisCallback: ((data: any) => void) | null = null;
let mockIsRecording = false;

jest.mock('@siteed/expo-audio-studio', () => ({
  useAudioRecorder: () => ({
    startRecording: jest.fn(async (config: any) => {
      capturedOnAudioStream = config.onAudioStream;
      mockIsRecording = true;
      return { recordingUri: 'mock-uri' };
    }),
    stopRecording: jest.fn(async () => {
      mockIsRecording = false;
      capturedOnAudioStream = null;
    }),
    get isRecording() { return mockIsRecording; },
    analysisData: null,
  }),
  ExpoAudioStreamModule: {
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  },
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
}));

describe('usePhoneAudioRecorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRecording = false;
    capturedOnAudioStream = null;
  });

  it('should start and stop recording', async () => {
    const { result } = renderHook(() => usePhoneAudioRecorder());

    expect(result.current.isRecording).toBe(false);

    await act(async () => {
      await result.current.startRecording(() => {});
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.audioLevel).toBe(0);
  });

  it('should forward PCM buffer via onAudioData callback', async () => {
    const receivedBuffers: Uint8Array[] = [];
    const { result } = renderHook(() => usePhoneAudioRecorder());

    await act(async () => {
      await result.current.startRecording((buf) => receivedBuffers.push(buf));
    });

    // Simulate base64 PCM data arriving from the native module
    const rawPcm = new Uint8Array([0x10, 0x00, 0x20, 0x00]); // 2 samples
    const base64Data = btoa(String.fromCharCode(...rawPcm));

    await act(async () => {
      capturedOnAudioStream?.({ data: base64Data });
    });

    expect(receivedBuffers.length).toBe(1);
    expect(receivedBuffers[0]).toEqual(rawPcm);

    await act(async () => {
      await result.current.stopRecording();
    });
  });

  it('should reset audioLevel to 0 on stop', async () => {
    const { result } = renderHook(() => usePhoneAudioRecorder());

    await act(async () => {
      await result.current.startRecording(() => {});
    });

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.audioLevel).toBe(0);
  });

  it('should throw and set error when permissions are denied', async () => {
    const { ExpoAudioStreamModule } = require('@siteed/expo-audio-studio');
    ExpoAudioStreamModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });

    const { result } = renderHook(() => usePhoneAudioRecorder());

    await act(async () => {
      await expect(result.current.startRecording(() => {})).rejects.toThrow('Microphone permission denied');
    });

    expect(result.current.error).toBe('Microphone permission denied');
    expect(result.current.isRecording).toBe(false);
  });
});
