import {
  QuranAudioPlayer,
  RecitationTrack,
  validateAudioUrl,
  validateEditionId,
} from '@/services/quranAudio';

type MockSound = {
  play: jest.Mock;
  pause: jest.Mock;
  stop: jest.Mock;
  release: jest.Mock;
};

const mockSoundInstances: MockSound[] = [];

jest.mock('react-native-sound', () => {
  const Sound = jest.fn();
  return { __esModule: true, default: Sound };
});

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/documents',
  downloadFile: jest.fn(),
  exists: jest.fn(),
  readDir: jest.fn(),
  unlink: jest.fn(),
}));

const mockSoundConstructor = jest.requireMock('react-native-sound')
  .default as jest.Mock;
const mockDownloadFile = jest.requireMock('react-native-fs')
  .downloadFile as jest.Mock;
const mockExists = jest.requireMock('react-native-fs').exists as jest.Mock;
const mockReadDir = jest.requireMock('react-native-fs').readDir as jest.Mock;
const mockUnlink = jest.requireMock('react-native-fs').unlink as jest.Mock;

const track: RecitationTrack = {
  editionId: 'ar.alafasy',
  reciterName: 'Mishary Rashid Alafasy',
  audioUrl: 'https://cdn.example.test/ayah-1.mp3?token=public',
  ayahNumber: 1,
};

function createSound(): MockSound {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSoundInstances.length = 0;
  mockSoundConstructor.mockImplementation(
    (_url: string, _basePath: string, onLoad: (error?: unknown) => void) => {
      const sound = createSound();
      mockSoundInstances.push(sound);
      onLoad();
      return sound;
    },
  );
  mockDownloadFile.mockReturnValue({
    promise: Promise.resolve({ statusCode: 200, bytesWritten: 10 }),
  });
  mockExists.mockResolvedValue(false);
  mockReadDir.mockResolvedValue([]);
  mockUnlink.mockResolvedValue(undefined);
});

describe('Quran audio validation', () => {
  test('accepts HTTPS URLs and safe edition IDs', () => {
    expect(() => validateAudioUrl(track.audioUrl)).not.toThrow();
    expect(() => validateEditionId(track.editionId)).not.toThrow();
  });

  test('rejects non-HTTPS, credential-bearing, malformed, and unsafe inputs', () => {
    for (const url of [
      'http://cdn.example.test/ayah.mp3',
      'file:///tmp/ayah.mp3',
      'data:text/plain,unsafe',
      'https://user:password@cdn.example.test/ayah.mp3',
      'https://',
      ' https://cdn.example.test/ayah.mp3',
    ]) {
      expect(() => validateAudioUrl(url)).toThrow(/HTTPS URL/);
    }

    for (const editionId of ['', '../ayah', 'edition/id', 'edition id']) {
      expect(() => validateEditionId(editionId)).toThrow(/edition ID/);
    }
  });
});

describe('QuranAudioPlayer', () => {
  test('checks the deterministic downloaded path safely', async () => {
    mockExists.mockResolvedValue(true);

    await expect(
      require('@/services/quranAudio').isAudioDownloaded(track),
    ).resolves.toBe(true);
    expect(mockExists).toHaveBeenCalledWith(
      '/documents/quran-ar.alafasy-1.mp3',
    );
  });

  test('loads remote audio, starts playback, reports state, and releases the previous sound', async () => {
    const states: string[] = [];
    const player = new QuranAudioPlayer();

    await player.stream(track, state => states.push(state));
    expect(mockSoundConstructor).toHaveBeenCalledWith(
      track.audioUrl,
      '',
      expect.any(Function),
    );
    expect(mockSoundInstances[0].play).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['loading', 'playing']);

    await player.stream({ ...track, ayahNumber: 2 });
    expect(mockSoundInstances[0].release).toHaveBeenCalledTimes(1);
    expect(mockSoundInstances[1].play).toHaveBeenCalledTimes(1);
  });

  test('prefers the downloaded local file for playback', async () => {
    mockExists.mockResolvedValue(true);

    await new QuranAudioPlayer().stream(track);

    expect(mockSoundConstructor).toHaveBeenCalledWith(
      '/documents/quran-ar.alafasy-1.mp3',
      '',
      expect.any(Function),
    );
  });

  test('supports play, pause, stop, release, and playback completion', async () => {
    const states: string[] = [];
    const player = new QuranAudioPlayer();

    await player.stream(track, state => states.push(state));
    const sound = mockSoundInstances[0];

    player.pause();
    player.stop();
    player.play();
    sound.play.mock.calls[1][0](true);
    player.release();

    expect(sound.pause).toHaveBeenCalledTimes(1);
    expect(sound.stop).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledTimes(2);
    expect(sound.release).toHaveBeenCalledTimes(1);
    expect(states).toEqual([
      'loading',
      'playing',
      'paused',
      'stopped',
      'playing',
      'stopped',
      'released',
    ]);
  });

  test('rejects invalid tracks before invoking native playback', async () => {
    const player = new QuranAudioPlayer();

    await expect(
      player.stream({ ...track, audioUrl: 'http://unsafe.test/ayah.mp3' }),
    ).rejects.toThrow('HTTPS URL');
    expect(mockSoundConstructor).not.toHaveBeenCalled();
  });

  test('propagates native load errors and releases the failed sound', async () => {
    const loadError = new Error('decode failed');
    mockSoundConstructor.mockImplementation(
      (_url: string, _basePath: string, onLoad: (error?: unknown) => void) => {
        const sound = createSound();
        mockSoundInstances.push(sound);
        onLoad(loadError);
        return sound;
      },
    );

    await expect(new QuranAudioPlayer().stream(track)).rejects.toThrow(
      'decode failed',
    );
    expect(mockSoundInstances[0].release).toHaveBeenCalledTimes(1);
  });

  test('downloads to the document directory and returns the saved path', async () => {
    const destination = await new QuranAudioPlayer().downloadAudio(track);

    expect(destination).toBe('/documents/quran-ar.alafasy-1.mp3');
    expect(mockDownloadFile).toHaveBeenCalledWith({
      fromUrl: track.audioUrl,
      toFile: destination,
    });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  test('clears only downloaded Quran audio files from the document directory', async () => {
    const { clearDownloadedAudio } = require('@/services/quranAudio');
    mockReadDir.mockResolvedValue([
      {
        name: 'quran-ar.alafasy-1.mp3',
        path: '/documents/quran-ar.alafasy-1.mp3',
        isFile: () => true,
      },
      {
        name: 'quran-en.sahih-2.audio',
        path: '/documents/quran-en.sahih-2.audio',
        isFile: () => true,
      },
      {
        name: 'quran-ar.alafasy-3.mp3',
        path: '/documents/quran-ar.alafasy-3.mp3',
        isFile: () => false,
      },
      {
        name: 'unrelated.mp3',
        path: '/documents/unrelated.mp3',
        isFile: () => true,
      },
    ]);

    await clearDownloadedAudio();

    expect(mockUnlink.mock.calls.map(([path]) => path)).toEqual([
      '/documents/quran-ar.alafasy-1.mp3',
      '/documents/quran-en.sahih-2.audio',
    ]);
  });

  test('rejects failed downloads and removes any partial file', async () => {
    mockDownloadFile.mockReturnValue({
      promise: Promise.resolve({ statusCode: 503, bytesWritten: 0 }),
    });

    await expect(new QuranAudioPlayer().downloadAudio(track)).rejects.toThrow(
      'HTTP 503',
    );
    expect(mockUnlink).toHaveBeenCalledWith(
      '/documents/quran-ar.alafasy-1.mp3',
    );
  });
});
