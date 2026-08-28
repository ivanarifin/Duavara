import * as RNFS from 'react-native-fs';
import Sound from 'react-native-sound';
import { withStorageLock } from '@/services/storageLock';

export interface RecitationTrack {
  editionId: string;
  reciterName: string;
  audioUrl: string;
  ayahNumber: number;
}

export type QuranAudioState =
  | 'loading'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'released';

export type QuranAudioStateListener = (
  state: QuranAudioState,
  error?: Error,
) => void;

const EDITION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AUDIO_EXTENSION_PATTERN = /\.([a-z0-9]{2,5})$/i;

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : fallback);
}

export function validateEditionId(editionId: string): void {
  if (
    typeof editionId !== 'string' ||
    !EDITION_ID_PATTERN.test(editionId) ||
    editionId.length > 128
  ) {
    throw new Error(
      'Quran audio edition ID must contain only letters, numbers, dots, underscores, or hyphens',
    );
  }
}

export function validateAudioUrl(audioUrl: string): void {
  if (typeof audioUrl !== 'string' || audioUrl.trim() !== audioUrl) {
    throw new Error('Quran audio URL must be an HTTPS URL');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(audioUrl);
  } catch {
    throw new Error('Quran audio URL must be a valid HTTPS URL');
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('Quran audio URL must be an HTTPS URL without credentials');
  }
}

function validateTrack(track: RecitationTrack): void {
  if (track === null || typeof track !== 'object') {
    throw new Error('Quran audio track is required');
  }

  validateEditionId(track.editionId);
  validateAudioUrl(track.audioUrl);

  if (typeof track.reciterName !== 'string' || !track.reciterName.trim()) {
    throw new Error('Quran audio reciter name is required');
  }

  if (!Number.isInteger(track.ayahNumber) || track.ayahNumber < 1) {
    throw new Error('Quran audio ayah number must be a positive integer');
  }
}

function getDownloadExtension(audioUrl: string): string {
  const pathname = new URL(audioUrl).pathname;
  const extension = pathname.match(AUDIO_EXTENSION_PATTERN)?.[1].toLowerCase();
  return extension ? `.${extension}` : '.audio';
}

function getDownloadPath(track: RecitationTrack): string {
  if (
    typeof RNFS.DocumentDirectoryPath !== 'string' ||
    !RNFS.DocumentDirectoryPath
  ) {
    throw new Error('Quran audio downloads are not supported on this device');
  }

  return `${RNFS.DocumentDirectoryPath}/quran-${track.editionId}-${
    track.ayahNumber
  }${getDownloadExtension(track.audioUrl)}`;
}

const DOWNLOADED_AUDIO_FILE_PATTERN =
  /^quran-[A-Za-z0-9._-]+-\d+\.(?:[a-z0-9]{2,5}|audio)$/i;

export async function isAudioDownloaded(
  track: RecitationTrack,
): Promise<boolean> {
  try {
    validateTrack(track);
    return await RNFS.exists(getDownloadPath(track));
  } catch {
    return false;
  }
}

export async function clearDownloadedAudio(
  expectedEpoch?: number,
): Promise<void> {
  await withStorageLock(
    async () => {
      if (
        typeof RNFS.DocumentDirectoryPath !== 'string' ||
        !RNFS.DocumentDirectoryPath ||
        typeof RNFS.readDir !== 'function'
      ) {
        return;
      }

      const entries = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      const downloadedFiles = entries.filter(
        entry =>
          entry.isFile() && DOWNLOADED_AUDIO_FILE_PATTERN.test(entry.name),
      );
      const failures: unknown[] = [];
      await Promise.all(
        downloadedFiles.map(async entry => {
          try {
            await RNFS.unlink(entry.path);
          } catch (error) {
            failures.push(error);
          }
        }),
      );
      if (failures.length) {
        throw toError(
          failures[0],
          'Quran audio downloads could not be cleared',
        );
      }
    },
    expectedEpoch,
    expectedEpoch !== undefined,
  );
}

export class QuranAudioPlayer {
  private sound: Sound | null = null;
  private stateListener: QuranAudioStateListener | undefined;
  private pendingReject: ((error: Error) => void) | null = null;
  private operation = 0;

  private notify(state: QuranAudioState, error?: Error): void {
    this.stateListener?.(state, error);
  }

  private discardCurrentSound(notify: boolean): void {
    this.operation += 1;
    this.pendingReject?.(new Error('Quran audio operation was cancelled'));
    this.pendingReject = null;
    const sound = this.sound;
    this.sound = null;

    if (sound) {
      sound.release();
    }

    if (notify) {
      this.notify('released');
      this.stateListener = undefined;
    }
  }

  async stream(
    track: RecitationTrack,
    onState?: QuranAudioStateListener,
  ): Promise<void> {
    validateTrack(track);
    this.discardCurrentSound(false);
    this.stateListener = onState;
    const operation = this.operation;
    this.notify('loading');

    const sourcePromise = isAudioDownloaded(track).then(downloaded =>
      downloaded ? getDownloadPath(track) : track.audioUrl,
    );

    return new Promise<void>((resolve, reject) => {
      let sound: Sound | null = null;
      this.pendingReject = reject;

      const handleLoad = (loadError: unknown): void => {
        if (operation !== this.operation || !sound) {
          sound?.release();
          return;
        }

        if (loadError) {
          sound.release();
          const error = toError(loadError, 'Quran audio failed to load');
          this.notify('error', error);
          this.pendingReject = null;
          reject(error);
          return;
        }

        this.sound = sound;
        try {
          sound.play(success => {
            if (operation !== this.operation || this.sound !== sound) return;
            if (success) {
              this.notify('stopped');
            } else {
              this.notify('error', new Error('Quran audio playback failed'));
            }
          });
          this.notify('playing');
          this.pendingReject = null;
          resolve();
        } catch (error) {
          sound.release();
          this.sound = null;
          const playbackError = toError(error, 'Quran audio playback failed');
          this.notify('error', playbackError);
          this.pendingReject = null;
          reject(playbackError);
        }
      };

      sourcePromise
        .then(source => {
          if (operation !== this.operation) return;
          try {
            sound = new Sound(source, '', error => {
              // Deferring handles test doubles and native implementations that invoke synchronously.
              Promise.resolve().then(() => handleLoad(error));
            });
          } catch (error) {
            const loadError = toError(error, 'Quran audio failed to load');
            this.notify('error', loadError);
            this.pendingReject = null;
            reject(loadError);
          }
        })
        .catch(error => {
          const loadError = toError(error, 'Quran audio failed to load');
          this.notify('error', loadError);
          this.pendingReject = null;
          reject(loadError);
        });
    });
  }

  play(): void {
    if (!this.sound) {
      throw new Error('No Quran audio track is loaded');
    }

    const operation = this.operation;
    this.sound.play(success => {
      if (operation !== this.operation || !this.sound) return;
      if (success) {
        this.notify('stopped');
      } else {
        this.notify('error', new Error('Quran audio playback failed'));
      }
    });
    this.notify('playing');
  }

  pause(): void {
    if (!this.sound) return;
    this.sound.pause();
    this.notify('paused');
  }

  stop(): void {
    if (!this.sound) return;
    this.sound.stop();
    this.notify('stopped');
  }

  release(): void {
    this.discardCurrentSound(true);
  }

  async downloadAudio(track: RecitationTrack): Promise<string> {
    validateTrack(track);
    const destination = getDownloadPath(track);

    return withStorageLock(async () => {
      try {
        const result = await RNFS.downloadFile({
          fromUrl: track.audioUrl,
          toFile: destination,
        }).promise;

        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new Error(
            `Quran audio download failed (HTTP ${result.statusCode})`,
          );
        }

        return destination;
      } catch (error) {
        try {
          await RNFS.unlink(destination);
        } catch {
          // A failed native download may not have created a partial file.
        }
        throw toError(error, 'Quran audio download failed');
      }
    });
  }
}
