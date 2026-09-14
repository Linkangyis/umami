import geographyIndex from '../../public/maps/index.json';

export type MapScope = 'world' | 'US' | 'CN' | 'Europe';
export const MAP_SCOPES: MapScope[] = ['world', 'US', 'CN', 'Europe'];
// European Union member states, verified against EUR-Lex on 2026-09-14.
export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;
export const EUROPE_COUNTRIES = geographyIndex.Europe.map(item => item.code);
export const MAP_GEOGRAPHIES = geographyIndex;
export const MAP_SETTINGS = {
  world: { file: '/datamaps.world.json', projection: 'geoMercator', center: [0, 30], scale: 125 },
  US: { file: '/maps/us-regions.json', projection: 'geoAlbersUsa', center: [-96, 38], scale: 900 },
  CN: { file: '/maps/cn-regions.json', projection: 'geoMercator', center: [104, 36], scale: 600 },
  Europe: {
    file: '/maps/europe-countries.json',
    projection: 'geoMercator',
    center: [15, 55],
    scale: 380,
  },
} as const;

export function mapScopeCodes(scope: MapScope, euOnly = false): string[] | undefined {
  if (scope === 'world') return undefined;
  if (scope === 'Europe' && euOnly) return [...EU_COUNTRIES];
  return MAP_GEOGRAPHIES[scope].map(item => item.code);
}

export function mapLocationParams(
  query: Record<string, string>,
  scope: MapScope,
  euOnly = false,
  selected?: string,
): Record<string, string> {
  const result = Object.fromEntries(
    Object.entries(query).filter(([key]) => !/^(country|region|city)\d*$/.test(key)),
  );
  result.mapScope = scope;
  result.mapEuOnly = String(scope === 'Europe' && euOnly);
  if (scope === 'US' || scope === 'CN') {
    result.country = `eq.${scope}`;
    if (selected) result.region = `eq.${selected}`;
  } else if (selected) result.country = `eq.${selected}`;
  else if (scope === 'Europe') result.country = `eq.${mapScopeCodes(scope, euOnly).join(',')}`;
  return result;
}

export function mapMetricRows(
  data: { x: string; y: number; country?: string }[] = [],
  scope: MapScope,
  euOnly = false,
) {
  const allowed = mapScopeCodes(scope, euOnly);
  return data
    .map(row => ({
      ...row,
      x:
        (scope === 'US' || scope === 'CN') && !row.x.includes('-') && row.country
          ? `${row.country}-${row.x}`
          : row.x,
      y: Number(row.y) || 0,
    }))
    .filter(row => row.x !== 'AQ' && (!allowed || allowed.includes(row.x)))
    .sort((a, b) => b.y - a.y || a.x.localeCompare(b.x));
}
