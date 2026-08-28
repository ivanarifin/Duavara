import {
  getNearbyMosques,
  MAX_NEARBY_MOSQUES,
  MAX_RADIUS_METERS,
  OSM_ATTRIBUTION,
  OVERPASS_ENDPOINT,
} from '@/services/mosques';

type MockResponse = {
  ok: boolean;
  status: number;
  json: jest.Mock;
};

function response(body: unknown, ok = true, status = 200): MockResponse {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

function fetchMock(body: unknown, ok = true, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue(response(body, ok, status));
}

describe('nearby mosque lookup', () => {
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
        { fetchImpl, timeoutMs: 10 },
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
  test('builds an encoded Overpass query with bounded coordinates and radius', async () => {
    const fetchImpl = fetchMock({ elements: [] });

    await getNearbyMosques(
      { latitude: 35.681236, longitude: 139.767125 },
      { radiusMeters: MAX_RADIUS_METERS, fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(`${OVERPASS_ENDPOINT}?data=`)).toBe(true);
    expect(init.method).toBe('GET');
    const query = new URL(url).searchParams.get('data');
    expect(query).toContain('[out:json]');
    expect(query).toContain(
      'nwr["amenity"="place_of_worship"]["religion"="muslim"]',
    );
    expect(query).toContain('(around:5000,35.681236,139.767125)');
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

  test('rejects malformed responses and HTTP errors', async () => {
    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        { fetchImpl: fetchMock({ elements: [{ type: 'node' }] }) },
      ),
    ).rejects.toThrow('malformed mosque data');

    await expect(
      getNearbyMosques(
        { latitude: 0, longitude: 0 },
        { fetchImpl: fetchMock({ error: 'overloaded' }, false, 503) },
      ),
    ).rejects.toThrow('HTTP 503');
  });

  test('times out an injected fetch', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(() => new Promise<never>(() => undefined));

    const lookup = getNearbyMosques(
      { latitude: 0, longitude: 0 },
      { fetchImpl, timeoutMs: 10 },
    );
    jest.advanceTimersByTime(10);

    await expect(lookup).rejects.toThrow('timed out after 10ms');
    jest.useRealTimers();
  });
});
