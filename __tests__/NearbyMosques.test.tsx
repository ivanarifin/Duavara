import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { NearbyMosques } from '@/components/NearbyMosques';
import { MosqueLookupError } from '@/services/mosques';
import type { Mosque } from '@/services/mosques';

type MosqueLookupOptions = {
  radiusMeters?: number;
  signal?: AbortSignal;
};

type MosqueMocks = {
  getNearbyMosques: jest.Mock;
};

type FavoriteMocks = {
  getFavorites: jest.Mock;
  saveFavorites: jest.Mock;
  toggleFavorite: jest.Mock;
};

jest.mock('@/services/mosques', () => {
  const actual = jest.requireActual('@/services/mosques');
  const mocks: MosqueMocks = {
    getNearbyMosques: jest.fn(),
  };

  return {
    ...actual,
    getNearbyMosques: mocks.getNearbyMosques,
    __mocks: mocks,
  };
});

jest.mock('@/services/mosqueFavorites', () => {
  class mockMosqueFavoritesStorageError extends Error {}
  const mocks: FavoriteMocks = {
    getFavorites: jest.fn(),
    saveFavorites: jest.fn(),
    toggleFavorite: jest.fn(),
  };

  return {
    MosqueFavoritesStorageError: mockMosqueFavoritesStorageError,
    buildMosqueDirectionsUrl: jest.fn(),
    getFavorites: mocks.getFavorites,
    saveFavorites: mocks.saveFavorites,
    toggleFavorite: mocks.toggleFavorite,
    __mocks: mocks,
  };
});

const mosqueMocks = jest.requireMock('@/services/mosques')
  .__mocks as MosqueMocks;
const favoriteMocks = jest.requireMock('@/services/mosqueFavorites')
  .__mocks as FavoriteMocks;

const firstCoordinates = { latitude: -6.2, longitude: 106.816666 };
const secondCoordinates = { latitude: -6.914744, longitude: 107.60981 };

function mosque(id: string, name: string): Mosque {
  return {
    id,
    name,
    latitude: firstCoordinates.latitude,
    longitude: firstCoordinates.longitude,
    distanceMeters: 250,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function renderNearbyMosques(
  coordinates = firstCoordinates,
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <NearbyMosques coordinates={coordinates} />,
    );
    await flushMicrotasks();
  });
  return renderer;
}

function renderedTree(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function findByAccessibilityLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const control = renderer.root.findAll(
    node => node.props.accessibilityLabel === label,
  )[0];
  if (!control) throw new Error(`No control found for ${label}`);
  return control;
}

beforeEach(() => {
  jest.resetAllMocks();
  favoriteMocks.getFavorites.mockResolvedValue([]);
  favoriteMocks.saveFavorites.mockResolvedValue([]);
  favoriteMocks.toggleFavorite.mockResolvedValue([]);
});

describe('NearbyMosques lookup reliability', () => {
  test('aborts the active lookup when coordinates change and does not render stale results', async () => {
    const firstLookup = deferred<Mosque[]>();
    const secondLookup = deferred<Mosque[]>();
    mosqueMocks.getNearbyMosques
      .mockReturnValueOnce(firstLookup.promise)
      .mockReturnValueOnce(secondLookup.promise);

    const renderer = await renderNearbyMosques();
    const firstOptions = mosqueMocks.getNearbyMosques.mock
      .calls[0][1] as MosqueLookupOptions;

    await ReactTestRenderer.act(async () => {
      renderer.update(<NearbyMosques coordinates={secondCoordinates} />);
      await flushMicrotasks();
    });
    const secondOptions = mosqueMocks.getNearbyMosques.mock
      .calls[1][1] as MosqueLookupOptions;

    await ReactTestRenderer.act(async () => {
      firstLookup.resolve([mosque('stale', 'Stale Mosque')]);
      secondLookup.resolve([mosque('fresh', 'Fresh Mosque')]);
      await flushMicrotasks();
    });

    expect(renderedTree(renderer)).not.toContain('Stale Mosque');
    expect(renderedTree(renderer)).toContain('Fresh Mosque');
    expect(firstOptions.signal?.aborted).toBe(true);
    expect(secondOptions.signal?.aborted).toBe(false);
  });

  test('aborts the active lookup when unmounted', async () => {
    const lookup = deferred<Mosque[]>();
    mosqueMocks.getNearbyMosques.mockReturnValueOnce(lookup.promise);

    const renderer = await renderNearbyMosques();
    const options = mosqueMocks.getNearbyMosques.mock
      .calls[0][1] as MosqueLookupOptions;

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
      await flushMicrotasks();
    });

    expect(options.signal?.aborted).toBe(true);
  });

  test('shows a 429 lookup failure as an accessible alert and retries successfully', async () => {
    mosqueMocks.getNearbyMosques
      .mockRejectedValueOnce(
        new MosqueLookupError('Overpass request failed (HTTP 429)', 429),
      )
      .mockResolvedValueOnce([mosque('retry-success', 'Recovered Mosque')]);

    const renderer = await renderNearbyMosques();

    const alert = renderer.root.findAll(
      node => node.props.accessibilityRole === 'alert',
    )[0];
    expect(alert).toBeDefined();
    expect(renderedTree(renderer)).toContain(
      'The mosque directory is busy. Try again in a moment.',
    );

    const retry = findByAccessibilityLabel(
      renderer,
      'Try finding mosques again',
    );
    await ReactTestRenderer.act(async () => {
      await retry.props.onPress();
      await flushMicrotasks();
    });

    expect(renderedTree(renderer)).toContain('Recovered Mosque');
  });

  test('keeps prior results visible while manually refreshing', async () => {
    const refresh = deferred<Mosque[]>();
    mosqueMocks.getNearbyMosques
      .mockResolvedValueOnce([mosque('existing', 'Existing Mosque')])
      .mockReturnValueOnce(refresh.promise);

    const renderer = await renderNearbyMosques();
    expect(renderedTree(renderer)).toContain('Existing Mosque');

    const findMosques = findByAccessibilityLabel(
      renderer,
      'Find mosques near me',
    );
    await ReactTestRenderer.act(async () => {
      findMosques.props.onPress();
      await flushMicrotasks();
    });

    expect(renderedTree(renderer)).toContain('Refreshing nearby results…');
    expect(renderedTree(renderer)).toContain('Existing Mosque');

    await ReactTestRenderer.act(async () => {
      refresh.resolve([mosque('replacement', 'Replacement Mosque')]);
      await flushMicrotasks();
    });

    expect(renderedTree(renderer)).toContain('Replacement Mosque');
  });
});
