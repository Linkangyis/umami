"""Rebuild local drill-down maps. Requires Python 3 and shapely (no app dependency)."""

import json
from pathlib import Path
from urllib.request import urlopen

from shapely.geometry import MultiPolygon, mapping, shape
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'maps'
COMMIT = '9380cca83db5f9aef52d5e762765100745f84b27'  # Natural Earth v5.1.1
BASE = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson/'


def load(name):
    with urlopen(BASE + name, timeout=120) as response:
        return json.load(response)['features']


def feature(item, code):
    props = item['properties']
    geometry = shape(item['geometry']).simplify(0.02, preserve_topology=True)
    # D3's spherical projection expects clockwise exteriors, unlike RFC 7946.
    geometry = (orient(geometry, sign=-1) if geometry.geom_type == 'Polygon'
                else MultiPolygon([orient(polygon, sign=-1) for polygon in geometry.geoms]))
    return {
        'type': 'Feature',
        'id': code,
        'properties': {'code': code, 'name': props.get('name') or props.get('NAME_EN'),
                       'name_zh': props.get('name_zh') or props.get('NAME_ZH')},
        'geometry': mapping(geometry),
    }


def write(name, features):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = {'type': 'FeatureCollection', 'features': features}
    path = OUTPUT / name
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{name}: {len(features)} features, {path.stat().st_size:,} bytes')


def main():
    region_codes = json.loads((ROOT / 'public' / 'iso-3166-2.json').read_text(encoding='utf-8'))
    subdivisions = load('ne_10m_admin_1_states_provinces.geojson')
    for code in ('US', 'CN'):
        selected = [feature(item, item['properties']['iso_3166_2']) for item in subdivisions
                    if item['properties']['iso_a2'] == code
                    and item['properties']['iso_3166_2'] in region_codes]
        write(f'{code.lower()}-regions.json', selected)
    countries = load('ne_10m_admin_0_countries.geojson')
    europe = [feature(item, item['properties']['ISO_A2_EH']) for item in countries
              if item['properties']['CONTINENT'] == 'Europe' or item['properties']['ISO_A2_EH'] == 'CY']
    write('europe-countries.json', europe)
    index = {}
    for key, filename in [('US', 'us-regions.json'), ('CN', 'cn-regions.json'), ('Europe', 'europe-countries.json')]:
        features = json.loads((OUTPUT / filename).read_text(encoding='utf-8'))['features']
        index[key] = [item['properties'] for item in features]
    (OUTPUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    main()
