import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  EU_COUNTRIES,
  MAP_GEOGRAPHIES,
  mapLocationParams,
  mapMetricRows,
  mapScopeCodes,
} from './map';

test('bundled geographic boundaries cover all US states/DC, CN provinces and EU members', () => {
  expect(MAP_GEOGRAPHIES.US).toHaveLength(51);
  expect(MAP_GEOGRAPHIES.CN).toHaveLength(31);
  expect(new Set(EU_COUNTRIES).size).toBe(27);
  expect(mapScopeCodes('Europe', true)).not.toContain('GB');
  for (const code of EU_COUNTRIES) expect(mapScopeCodes('Europe')).toContain(code);
  for (const filename of ['us-regions', 'cn-regions', 'europe-countries']) {
    const collection = JSON.parse(readFileSync(`public/maps/${filename}.json`, 'utf8'));
    expect(new Set(collection.features.map(feature => feature.id)).size).toBe(
      collection.features.length,
    );
    for (const feature of collection.features) {
      expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
      expect(feature.geometry.coordinates.length).toBeGreaterThan(0);
    }
  }
});

test('drilldown replaces geographic filters while preserving date, device and path scope', () => {
  const query = {
    date: '30day',
    device: 'eq.desktop',
    path: 'eq./pricing',
    country: 'eq.DE',
    region2: 'eq.DE-BE',
    city: 'eq.Berlin',
  };
  expect(mapLocationParams(query, 'US', false, 'US-CA')).toEqual({
    date: '30day',
    device: 'eq.desktop',
    path: 'eq./pricing',
    mapScope: 'US',
    mapEuOnly: 'false',
    country: 'eq.US',
    region: 'eq.US-CA',
  });
  expect(mapLocationParams(query, 'world')).toEqual({
    date: '30day',
    device: 'eq.desktop',
    path: 'eq./pricing',
    mapScope: 'world',
    mapEuOnly: 'false',
  });
  expect(mapLocationParams(query, 'Europe', true).country.split(',')).toHaveLength(27);
});

test('maps only matching country regions and excludes non-EU countries when toggled', () => {
  expect(
    mapMetricRows(
      [
        { x: 'CA', country: 'US', y: 7 },
        { x: 'CA', country: 'XX', y: 9 },
        { x: 'CN-GD', y: 4 },
      ],
      'US',
    ),
  ).toEqual([{ x: 'US-CA', country: 'US', y: 7 }]);
  expect(
    mapMetricRows(
      [
        { x: 'GB', y: 20 },
        { x: 'DE', y: 5 },
        { x: 'CY', y: 2 },
        { x: 'MT', y: 1 },
      ],
      'Europe',
      true,
    ).map(row => row.x),
  ).toEqual(['DE', 'CY', 'MT']);
});
