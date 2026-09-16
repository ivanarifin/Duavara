import {
  clearNearbyMosqueCache,
  getNearbyMosques,
  MAX_NEARBY_MOSQUES,
  MAX_RADIUS_METERS,
  OSM_ATTRIBUTION,
  OVERPASS_ENDPOINT,
  OVERPASS_ENDPOINTS,
} from '@/services/mosques';

type MockResponse = {
  ok: boolean;
  status: number;
  json: jest.Mock;
  headers: { get: jest.Mock };
};

function response(
  body: unknown,
  ok = true,
  status = 200,
  retryAfter: string | null = null,
): MockResponse {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    headers: { get: jest.fn(() => retryAfter) },
  };
}

function fetchMock(body: unknown, ok = true, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue(response(body, ok, status));
}

describe('nearby mosque lookup', () => {
  beforeEach(() => {
    clearNearbyMosqueCache();
  });

  test('times out while parsing response JSON', async () => {
    jest.useFakeTimers();
    try {
      const json = jest.fn(() => new Promise<never>(() => undefined));
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json,
      } as unknown as Response);

      const lookup = getNearbyMosques(
        { latitude: 0, longitude: 0 },
        { fetchImpl, timeoutMs: 10, endpoints: [OVERPASS_ENDPOINT] },
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(json).toHaveBeenCalled();
      jest.advanceTimersByTime(10);

      await expect(lookup).rejects.toThrow(
        'Overpass request timed out after 10ms',
      );
    } finally {
      jest.useRealTimers();
    }
  });
  test('posts a bounded Overpass query with broader mosque tags', async () => {
    const fetchImpl = fetchMock({ elements: [] });

    await getNearbyMosques(
      { latitude: 35.681236, longitude: 139.767125 },
      { radiusMeters: MAX_RADIUS_METERS, fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(OVERPASS_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Duavara/1.0 (+https://github.com/ivanarifin/Duavara)',
    });
    const query = new URLSearchParams(String(init.body)).get('data');
    expect(query).toContain('[out:json][timeout:10]');
    expect(query).toContain('"religion"~"^(muslim|islam)$",i');
    expect(query).toContain('nwr["building"="mosque"]');
    expect(query).toContain('(around:5000,35.681236,139.767125)');
    expect(OVERPASS_ENDPOINTS).toContain(
      'https://overpass.private.coffee/api/interpreter',
    );
  });

  test('rejects invalid coordinates and radii before fetching', async () => {
    const fetchImpl = fetchMock({ elements: [] });

    await expect(
      getNearbyMosques({ latitude: 91, longitude: 0 }, { fetchImpl }),
    ).rejects.toThrow('within bounds');
    await expect(
      getNearbyMosques({ latitude: 0, longitude: 181 }, { fetchImpl }),
    ).rejects.toThrow('within bounds');
    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        { radiusMeters: MAX_RADIUS_METERS + 1, fetchImpl },
      ),
    ).rejects.toThrow('must not exceed 5000');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('normalizes OSM nodes, way/relation centers, sorts by distance, and dedupes', async () => {
    const fetchImpl = fetchMock({
      elements: [
        {
          type: 'way',
          id: 20,
          center: { lat: 0.02, lon: 0 },
          tags: {
            name: 'Far Mosque',
            'addr:street': 'Main Road',
            'addr:city': 'Springfield',
          },
        },
        {
          type: 'node',
          id: 10,
          lat: 0.001,
          lon: 0,
          tags: { name: 'Near Mosque', 'addr:full': '1 First Street' },
        },
        {
          type: 'relation',
          id: 30,
          center: { lat: 0.01, lon: 0 },
          tags: { 'name:en': 'Community Mosque' },
        },
        {
          type: 'node',
          id: 10,
          lat: 0.001,
          lon: 0,
          tags: { name: 'Duplicate Mosque' },
        },
      ],
    });

    const mosques = await getNearbyMosques(
      { latitude: 0, longitude: 0 },
      { radiusMeters: 5_000, fetchImpl },
    );

    expect(mosques.map(mosque => mosque.id)).toEqual([
      'node/10',
      'relation/30',
      'way/20',
    ]);
    expect(mosques[0]).toMatchObject({
      name: 'Near Mosque',
      latitude: 0.001,
      longitude: 0,
      address: '1 First Street',
    });
    expect(mosques[1]).toMatchObject({
      name: 'Community Mosque',
      latitude: 0.01,
      longitude: 0,
    });
    expect(mosques[2]).toMatchObject({
      name: 'Far Mosque',
      latitude: 0.02,
      longitude: 0,
      address: 'Main Road, Springfield',
    });
    expect(mosques[0].distanceMeters).toBeLessThan(
      mosques[1].distanceMeters ?? 0,
    );
    expect(mosques[1].distanceMeters).toBeLessThan(
      mosques[2].distanceMeters ?? 0,
    );
    expect(OSM_ATTRIBUTION).toBe('© OpenStreetMap contributors');
  });

  test('caps results after sorting by distance', async () => {
    const fetchImpl = fetchMock({
      elements: Array.from({ length: MAX_NEARBY_MOSQUES + 10 }, (_, index) => ({
        type: 'node',
        id: index + 1,
        lat: (index + 1) / 100_000,
        lon: 0,
        tags: { name: `Mosque ${index + 1}` },
      })),
    });

    const mosques = await getNearbyMosques(
      { latitude: 0, longitude: 0 },
      { fetchImpl },
    );

    expect(mosques).toHaveLength(MAX_NEARBY_MOSQUES);
    expect(mosques[0].name).toBe('Mosque 1');
    expect(mosques.at(-1)?.name).toBe(`Mosque ${MAX_NEARBY_MOSQUES}`);
  });

  test('skips malformed elements and stops on non-retryable HTTP errors', async () => {
    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        { fetchImpl: fetchMock({ elements: [{ type: 'node' }] }) },
      ),
    ).resolves.toEqual([]);

    const fetchImpl = fetchMock({ error: 'not found' }, false, 404);
    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        {
          fetchImpl,
          endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
        },
      ),
    ).rejects.toThrow('HTTP 404');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('falls back after an overloaded endpoint', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ error: 'overloaded' }, false, 503))
      .mockResolvedValueOnce(response({ elements: [] }));

    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        {
          fetchImpl,
          endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
          retryBaseDelayMs: 0,
          retryMaxDelayMs: 0,
        },
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://fallback.example/api');
  });

  test('falls back after a network failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('network offline'))
      .mockResolvedValueOnce(response({ elements: [] }));

    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        {
          fetchImpl,
          endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
          retryBaseDelayMs: 0,
          retryMaxDelayMs: 0,
        },
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://fallback.example/api');
  });

  test('fails over immediately when an endpoint rate limits the search', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ error: 'busy' }, false, 429, '60'))
      .mockResolvedValueOnce(response({ elements: [] }));

    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        {
          fetchImpl,
          endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
          retryBaseDelayMs: 250,
          retryMaxDelayMs: 2_000,
        },
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://fallback.example/api');
  });

  test('falls back when a rate-limited endpoint returns a non-JSON body', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: jest.fn(() => null) },
        json: jest.fn().mockRejectedValue(new Error('HTML response')),
      } as unknown as Response)
      .mockResolvedValueOnce(response({ elements: [] }));

    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        {
          fetchImpl,
          endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
          retryBaseDelayMs: 0,
          retryMaxDelayMs: 0,
        },
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('does not fetch or fall back after caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = fetchMock({ elements: [] });

    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        {
          fetchImpl,
          signal: controller.signal,
          endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
        },
      ),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('cancels an in-flight lookup without trying a fallback endpoint', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(() => new Promise<never>(() => undefined));
    const lookup = getNearbyMosques(
      { latitude: 0, longitude: 0 },
      {
        fetchImpl,
        signal: controller.signal,
        endpoints: [OVERPASS_ENDPOINT, 'https://fallback.example/api'],
      },
    );

    controller.abort();

    await expect(lookup).rejects.toMatchObject({ code: 'ABORTED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('does not share cached results between distinct coordinates', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ elements: [] }))
      .mockResolvedValueOnce(response({ elements: [] }));
    const options = { fetchImpl, cacheTtlMs: 60_000 };

    await getNearbyMosques(
      { latitude: -6.200001, longitude: 106.816666 },
      options,
    );
    await getNearbyMosques(
      { latitude: -6.200002, longitude: 106.816666 },
      options,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('returns cached results until the cache entry expires', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(
          response({
            elements: [
              {
                type: 'node',
                id: 1,
                lat: 0,
                lon: 0,
                tags: { name: 'Cached Mosque' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(response({ elements: [] }));
      const options = { fetchImpl, cacheTtlMs: 1_000 };

      const firstResults = await getNearbyMosques(
        { latitude: 0, longitude: 0 },
        options,
      );
      expect(firstResults).toHaveLength(1);
      firstResults[0].name = 'Mutated locally';
      const cachedResults = await getNearbyMosques(
        { latitude: 0, longitude: 0 },
        options,
      );
      expect(cachedResults).toHaveLength(1);
      expect(cachedResults[0].name).toBe('Cached Mosque');
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1_001);
      await expect(
        getNearbyMosques({ latitude: 0, longitude: 0 }, options),
      ).resolves.toEqual([]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('times out an injected fetch', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(() => new Promise<never>(() => undefined));

    const lookup = getNearbyMosques(
      { latitude: 0, longitude: 0 },
      { fetchImpl, timeoutMs: 10, endpoints: [OVERPASS_ENDPOINT] },
    );
    jest.advanceTimersByTime(10);

    await expect(lookup).rejects.toThrow('timed out after 10ms');
    jest.useRealTimers();
  });
});
