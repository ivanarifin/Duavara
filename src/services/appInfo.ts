import { NativeModules } from 'react-native';

export type AppInfo = {
  version: string;
  build: string | null;
};

type NativeAppInfoModule = {
  getAppInfo: () => Promise<unknown>;
};

function getNativeAppInfoModule(): NativeAppInfoModule | null {
  const candidate: unknown = NativeModules.DuavaraAppInfo;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const module = candidate as Partial<NativeAppInfoModule>;
  return typeof module.getAppInfo === 'function'
    ? (module as NativeAppInfoModule)
    : null;
}

function normalizeAppInfo(value: unknown): AppInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || !record.version.trim()) return null;
  return {
    version: record.version,
    build:
      typeof record.build === 'string' && record.build.trim()
        ? record.build
        : null,
  };
}

export async function getAppInfo(): Promise<AppInfo> {
  const module = getNativeAppInfoModule();
  if (!module) return { version: 'Unavailable', build: null };

  try {
    return normalizeAppInfo(await module.getAppInfo()) ?? {
      version: 'Unavailable',
      build: null,
    };
  } catch {
    return { version: 'Unavailable', build: null };
  }
}
