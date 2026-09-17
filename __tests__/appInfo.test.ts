import { NativeModules } from 'react-native';
import { getAppInfo } from '@/services/appInfo';

describe('app info', () => {
  test('returns native app info and normalizes an unavailable build', async () => {
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.DuavaraAppInfo;
    modules.DuavaraAppInfo = {
      getAppInfo: jest.fn().mockResolvedValue({
        version: '1.2.3',
        build: ' ',
      }),
    };

    try {
      await expect(getAppInfo()).resolves.toEqual({
        version: '1.2.3',
        build: null,
      });
    } finally {
      modules.DuavaraAppInfo = original;
    }
  });

  test('returns unavailable app info when the native module is absent or malformed', async () => {
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.DuavaraAppInfo;

    try {
      modules.DuavaraAppInfo = {};
      await expect(getAppInfo()).resolves.toEqual({
        version: 'Unavailable',
        build: null,
      });

      modules.DuavaraAppInfo = {
        getAppInfo: jest.fn().mockResolvedValue({ version: ' ' }),
      };
      await expect(getAppInfo()).resolves.toEqual({
        version: 'Unavailable',
        build: null,
      });
    } finally {
      modules.DuavaraAppInfo = original;
    }
  });

  test('returns unavailable app info when the native request rejects', async () => {
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.DuavaraAppInfo;
    modules.DuavaraAppInfo = {
      getAppInfo: jest.fn().mockRejectedValue(new Error('native failure')),
    };

    try {
      await expect(getAppInfo()).resolves.toEqual({
        version: 'Unavailable',
        build: null,
      });
    } finally {
      modules.DuavaraAppInfo = original;
    }
  });
});
