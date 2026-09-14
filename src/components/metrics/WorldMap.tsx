import {
  Box,
  Button,
  Column,
  type ColumnProps,
  FloatingTooltip,
  Row,
  Switch,
  Text,
  useTheme,
} from '@umami/react-zen';
import { colord } from 'colord';
import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import {
  useCountryNames,
  useLocale,
  useMessages,
  useNavigation,
  useRegionNames,
  useShare,
  useWebsiteMetricsQuery,
} from '@/components/hooks';
import { getThemeColors } from '@/lib/colors';
import { ISO_COUNTRIES } from '@/lib/constants';
import { formatLongNumber } from '@/lib/format';
import {
  MAP_GEOGRAPHIES,
  MAP_SCOPES,
  MAP_SETTINGS,
  type MapScope,
  mapLocationParams,
  mapMetricRows,
  mapScopeCodes,
} from '@/lib/map';
import styles from './WorldMap.module.css';

export interface WorldMapProps extends ColumnProps {
  websiteId?: string;
  data?: { x: string; y: number }[];
  regionData?: { x: string; y: number; country?: string }[];
}

export function WorldMap({ websiteId, data, regionData, ...props }: WorldMapProps) {
  const { theme } = useTheme();
  const { colors } = getThemeColors(theme);
  const { locale } = useLocale();
  const { t, labels } = useMessages();
  const { countryNames } = useCountryNames(locale);
  const { getRegionName } = useRegionNames(locale);
  const { query, router, replaceParams } = useNavigation();
  const share = useShare();
  const allowFilter = !!websiteId && share?.parameters?.allowFilter !== false && !data;
  const [scope, setScope] = useState<MapScope>(
    MAP_SCOPES.includes(query.mapScope as MapScope) ? (query.mapScope as MapScope) : 'world',
  );
  const [euOnly, setEuOnly] = useState(query.mapEuOnly === 'true');
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [sortByName, setSortByName] = useState(false);
  const [showTable, setShowTable] = useState(true);
  useEffect(() => {
    setScope(
      MAP_SCOPES.includes(query.mapScope as MapScope) ? (query.mapScope as MapScope) : 'world',
    );
    setEuOnly(query.mapEuOnly === 'true');
    setZoom(1);
  }, [query.mapScope, query.mapEuOnly]);
  const isRegion = scope === 'US' || scope === 'CN';
  const settings = MAP_SETTINGS[scope];
  const zh = locale.startsWith('zh');
  const scopeLabels = {
    world: zh ? '世界' : 'World',
    US: zh ? '美国 · 州' : 'US · States',
    CN: zh ? '中国 · 省级地区' : 'China · Regions',
    Europe: zh ? '欧洲' : 'Europe',
  };
  const canDrillRegions = !!websiteId || !!regionData;
  const {
    data: countries,
    isFetching: loadingCountries,
    error: countryError,
  } = useWebsiteMetricsQuery(
    websiteId,
    { type: 'country', limit: 500 },
    { enabled: !!websiteId && !data },
  );
  const {
    data: regions,
    isFetching: loadingRegions,
    error: regionError,
  } = useWebsiteMetricsQuery(
    websiteId,
    { type: 'region', limit: 10000 },
    { enabled: !!websiteId && !regionData && isRegion },
  );
  const rows = useMemo(
    () => mapMetricRows(isRegion ? regionData || regions : data || countries, scope, euOnly),
    [isRegion, regionData, regions, data, countries, scope, euOnly],
  );
  const metricLookup = useMemo(() => new Map(rows.map(row => [row.x, row.y])), [rows]);
  const allowed = mapScopeCodes(scope, euOnly);
  const maxVisitors = Math.max(1, ...rows.map(row => row.y));
  const loading = isRegion ? loadingRegions : loadingCountries;
  const error = isRegion ? regionError : countryError;
  const name = (code: string) => {
    if (isRegion) {
      const region = MAP_GEOGRAPHIES[scope].find(item => item.code === code);
      return (zh && region?.name_zh) || getRegionName(code) || region?.name || code;
    }
    return (
      countryNames[code] || MAP_GEOGRAPHIES.Europe.find(item => item.code === code)?.name || code
    );
  };
  // Keep all subdivisions mounted, including zero-count rows, so choosing a state
  // cannot collapse the scrolled list when the filtered result has only one row.
  const tableRows = (
    isRegion && (regionData || regions)
      ? MAP_GEOGRAPHIES[scope].map(region => ({
          x: region.code,
          y: metricLookup.get(region.code) || 0,
        }))
      : [...rows]
  ).sort((a, b) => (sortByName ? name(a.x).localeCompare(name(b.x), locale) : b.y - a.y));
  const selectScope = (value: MapScope, onlyEu = euOnly) => {
    setScope(value);
    setZoom(1);
    setTooltip(null);
    setHovered(null);
    if (allowFilter)
      router.push(replaceParams(mapLocationParams(query, value, onlyEu)), { scroll: false });
  };
  const selectLocation = (code: string) => {
    if (scope === 'world' && (code === 'US' || code === 'CN') && canDrillRegions) selectScope(code);
    else if (allowFilter)
      router.push(replaceParams(mapLocationParams(query, scope, euOnly, code)), { scroll: false });
  };
  const hover = (code: string) => {
    if (!code || code === 'AQ') return;
    setHovered(code);
    setTooltip(
      `${name(code)}: ${formatLongNumber(metricLookup.get(code) || 0)} ${t(labels.visitors)}`,
    );
  };
  const color = (code: string) => {
    const count = metricLookup.get(code);
    if (!count) return colors.map.fillColor;
    return colord(colors.map.baseColor)
      [theme === 'light' ? 'lighten' : 'darken'](0.4 * (1 - Math.sqrt(count / maxVisitors)))
      .toHex();
  };
  return (
    <Column {...props} padding="4" gap="3" minWidth="0" data-test="geography-map">
      <Row gap="2" alignItems="center" wrap="wrap">
        {MAP_SCOPES.map(value => (
          <Button
            key={value}
            size="sm"
            variant={scope === value ? 'primary' : 'quiet'}
            onClick={() => selectScope(value)}
            isDisabled={(value === 'US' || value === 'CN') && !canDrillRegions}
            data-test={`map-scope-${value}`}
          >
            {scopeLabels[value]}
          </Button>
        ))}
        {scope === 'Europe' && (
          <Switch
            isSelected={euOnly}
            onChange={value => {
              setEuOnly(value);
              selectScope('Europe', value);
            }}
          >
            {zh ? '仅欧盟（27 国）' : 'EU members only (27)'}
          </Switch>
        )}
      </Row>
      <div className={styles.caption}>
        {zh
          ? '点击美国或中国下钻；点击区域可筛选访问数据。'
          : 'Select the US or China to drill down; select a location to filter traffic.'}
      </div>
      {error && (
        <Text role="alert">
          {zh ? '地域数据加载失败，请刷新重试。' : 'Location data could not load. Please refresh.'}
        </Text>
      )}
      <div className={styles.layout} aria-busy={loading}>
        <div className={styles.map}>
          <ComposableMap
            data-test="map-canvas"
            key={scope}
            width={800}
            height={500}
            projection={settings.projection}
            projectionConfig={{ center: settings.center, scale: settings.scale }}
            aria-label={scopeLabels[scope]}
          >
            <ZoomableGroup
              center={settings.center}
              zoom={zoom}
              minZoom={1}
              maxZoom={5}
              onMoveEnd={({ zoom }) => setZoom(zoom)}
            >
              <Geographies geography={`${process.env.basePath || ''}${settings.file}`}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const code = scope === 'world' ? ISO_COUNTRIES[geo.id] : geo.properties.code;
                    if (!code || code === 'AQ' || (allowed && !allowed.includes(code))) return null;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={hovered === code ? colors.map.hoverColor : color(code)}
                        stroke={colors.map.strokeColor}
                        strokeWidth={0.4 / zoom}
                        role="button"
                        tabIndex={0}
                        aria-label={`${name(code)}: ${formatLongNumber(metricLookup.get(code) || 0)}`}
                        data-test={`map-area-${code}`}
                        style={{
                          default: { outline: 'none' },
                          hover: {
                            outline: 'none',
                            cursor: 'pointer',
                            fill: colors.map.hoverColor,
                          },
                          pressed: { outline: 'none' },
                        }}
                        onMouseOver={() => hover(code)}
                        onMouseOut={() => {
                          setTooltip(null);
                          setHovered(null);
                        }}
                        onFocus={() => hover(code)}
                        onBlur={() => {
                          setTooltip(null);
                          setHovered(null);
                        }}
                        onClick={() => selectLocation(code)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectLocation(code);
                          }
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
          <div className={styles.zoom}>
            <Button
              size="sm"
              aria-label={zh ? '缩小' : 'Zoom out'}
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            >
              −
            </Button>
            <Button
              size="sm"
              aria-label={zh ? '重置缩放' : 'Reset zoom'}
              onClick={() => setZoom(1)}
            >
              1:1
            </Button>
            <Button
              size="sm"
              aria-label={zh ? '放大' : 'Zoom in'}
              onClick={() => setZoom(Math.min(5, zoom + 0.5))}
            >
              +
            </Button>
          </div>
        </div>
        <Column gap="2">
          <Row>
            <Button
              variant="quiet"
              size="sm"
              aria-expanded={showTable}
              onClick={() => setShowTable(!showTable)}
            >
              {zh
                ? showTable
                  ? '收起地域明细'
                  : '展开地域明细'
                : showTable
                  ? 'Hide location details'
                  : 'Show location details'}
            </Button>
          </Row>
          <div className={styles.tableWrap} data-test="map-region-scroll" hidden={!showTable}>
            <table className={styles.table} data-test="map-region-table">
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button" onClick={() => setSortByName(true)}>
                      {isRegion ? t(labels.region) : t(labels.country)}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" onClick={() => setSortByName(false)}>
                      {t(labels.visitors)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={2}>{zh ? '加载中…' : 'Loading…'}</td>
                  </tr>
                ) : tableRows.length ? (
                  tableRows.map(row => (
                    <tr
                      key={row.x}
                      data-active={hovered === row.x || query.region === `eq.${row.x}`}
                      onMouseOver={() => setHovered(row.x)}
                      onMouseOut={() => setHovered(null)}
                    >
                      <td>
                        <button type="button" onClick={() => selectLocation(row.x)}>
                          {name(row.x)}
                        </button>
                      </td>
                      <td>{formatLongNumber(row.y)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2}>
                      {zh
                        ? '所选日期和筛选条件下暂无数据'
                        : 'No data for the selected dates and filters'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Column>
      </div>
      <div className={styles.caption}>
        {scope !== 'world' && (
          <>
            <a
              href="https://www.naturalearthdata.com/about/terms-of-use/"
              target="_blank"
              rel="noreferrer"
            >
              Natural Earth
            </a>{' '}
            · {zh ? '数据中的行政边界' : 'Administrative boundaries from the source dataset'}.{' '}
          </>
        )}
        {scope === 'Europe' &&
          (zh
            ? '欧洲视图包含国家及地区，并纳入欧盟成员塞浦路斯；欧盟开关仅保留 27 个成员国。'
            : 'Europe includes countries and territories, plus EU member Cyprus; the EU toggle keeps only the 27 members.')}
      </div>
      {tooltip && (
        <FloatingTooltip>
          <Box
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: 'white' }}
            padding
            borderRadius="md"
          >
            {tooltip}
          </Box>
        </FloatingTooltip>
      )}
    </Column>
  );
}
