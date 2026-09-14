# Regional map data

Local GeoJSON derives from Natural Earth **v5.1.1**, pinned to commit
`9380cca83db5f9aef52d5e762765100745f84b27`. Coordinates are simplified by 0.02
degrees with topology preservation per feature; polygons are not hand-drawn.

- [Admin 1 states and provinces](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/):
  `us-regions.json` contains 50 states and DC. `cn-regions.json` contains the 31
  province-level ISO subdivisions recognized by `public/iso-3166-2.json`.
  Non-ISO miscellaneous areas are omitted.
- [Maintainer's source repository](https://github.com/nvkelso/natural-earth-vector/tree/9380cca83db5f9aef52d5e762765100745f84b27/geojson):
  `europe-countries.json` selects Admin 0 features whose `CONTINENT` is Europe,
  plus Cyprus so the EU filter includes every member. Separately coded territories
  are included; grouping is not a claim about sovereignty or EU membership.
- [EU membership](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=legissum%3Amember_states):
  the 27-country membership list was verified on 2026-09-14. UK is excluded;
  Cyprus and Malta are included. Membership lives in `src/lib/map.ts`.

Natural Earth uses de facto administrative boundaries and releases its geographic
data into the [public domain](https://www.naturalearthdata.com/about/terms-of-use/),
including commercial redistribution. Names and boundaries reflect the source;
the maps serve analytics navigation, not boundary adjudication.

Reproduce with `python scripts/build-region-maps.py` (Python 3 with Shapely).
Only the build script downloads upstream files. The application loads the
checked-in same-origin assets and needs no external map service.
