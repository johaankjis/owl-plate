# Marietta campus dataset — research provenance

Provenance for `data/campus/marietta.json`. Every coordinate, name, letter
code and building number below is traceable to a cited source. Nothing in the
dataset is estimated, interpolated or invented; where two sources disagreed
beyond noise, the disagreement is documented below.

Researched and compiled November 19, 2026.

## Source hierarchy

| Short | Source | What it provided |
|---|---|---|
| ICM | KSU Interactive Campus Map, <https://maps.kennesaw.edu/> (Marietta map; data files `maps.kennesaw.edu/xml/CL_kennesaw.xml` etc., retrieved 2026-11-19) | Building names, WGS84 pin coordinates (Google-point `GPNT` geojson elements), street addresses |
| PPM | KSU Marietta Parking Map, <https://campus.kennesaw.edu/offices-services/parking/docs/marietta-parking-map.pdf> ("Last updated 08/07/2026") | Official letter codes, grid cells and building numbers from the "Buildings and Services" and "Campus Housing" directories |
| ASFR | KSU Annual Security and Fire Safety Report 2026, <https://campus.kennesaw.edu/offices-services/public-safety-police/docs/final-2026-asfr.pdf> | Legally published Clery geography: official building names and street addresses for every Marietta campus building |
| OSM | OpenStreetMap (Overpass API + osm.org, retrieved 2026-11-19; campus ways from the 2013 SPSU mapping plus newer edits) | Independent coordinate cross-check; the OSM campus mapping independently preserves the official letter codes in way names (e.g. "H - Academic Building") |
| KSU news / housing / department pages | kennesaw.edu and campus.kennesaw.edu pages cited per record | Current names (renames), housing community status, official addresses |

### Why each record counts as verified

A record is `verified` only when both of the following hold:

1. **Identity** is established by at least two official KSU sources (letter
   code and/or building number from PPM, name and address from ASFR/ICM).
2. **Coordinates** come from the official KSU interactive map pin (ICM) and
   agree with an independent geographic source (OSM) within normal
   pin-placement noise, or, for the two 2026 buildings not yet on the ICM,
   from an authoritative address point corroborated by the PPM grid cell
   (see "Special cases").

Every one of the 43 records passed both tests, so the dataset contains no
`unverified` records and no null coordinates. The validation script keeps
enforcing the contract rule that a `verified` record must carry coordinates,
so any future record that cannot be resolved must either be entered as
`unverified` with `null` coordinates or be left out of selection.

## Method

1. **Interactive map data extraction.** `maps.kennesaw.edu` is a CTP Projects
   embed app. Its project file `any.xml` references data lists under
   `/xml/`; `CL_kennesaw.xml` contains all 301 building objects. Each building
   (`BLD`) on the "Marietta Interactive Campus Map" (`UMAP_20210716172213154`,
   95 linked buildings) links through the associations file to a Google-point
   element (`GPNT`) holding a WGS84 geojson coordinate, and an address
   element (`ADDR`). These pins are the primary coordinates.
2. **Parking map extraction.** The PPM PDF is a rotated, custom-font
   InDesign export. Text was extracted with pdf.js (positions in viewport
   space), then the "Buildings and Services" and "Campus Housing" directories
   were reconstructed by aligning the name, `GRID` and `BLDG#` columns. This
   produced the official letter/grid/number triple for every building.
3. **OSM cross-check.** Overpass queries over the campus bounding box
   returned the independently mapped campus, including the official letter
   codes in way names. Each dataset coordinate was compared with the
   matching OSM building centroid.
4. **Address geocoding for the two 2026 buildings.** The ArcGIS public World
   Geocoder `findAddressCandidates` (no key, `PointAddress` matches, score
   100) was first validated against known campus addresses (834 and 840
   Polytechnic Lane land within 6–10 m of the ICM pins for the Engineering
   Lab and Engineering Technology Center), then used for the Hornet Hub and
   Shore Innovation Center addresses published by KSU.

## Identity and coordinate cross-check table

Columns: official letter code and building number (PPM), dataset coordinate
(ICM pin unless noted), distance between the dataset coordinate and the
matching OSM building centroid.

| Building | Code | BLDG# | Coordinate (dataset) | vs OSM |
|---|---|---|---|---|
| Academic Building | H | 830 | 33.938224, -84.520565 | 14.9 m |
| Administration Building | B | 900 | 33.939728, -84.519720 | 7.5 m |
| Architecture Building | N | 640 | 33.936323, -84.518980 | 5.0 m |
| Atrium Building | J | 680 | 33.937548, -84.520201 | 12.1 m |
| Civil and Environmental Engineering | L | 655 | 33.935721, -84.520279 | 5.4 m |
| Crawford Lab Building | E | 846 | 33.939084, -84.521627 | 8.4 m |
| Design 1 Building | I1 | 824 | 33.938054, -84.521294 | 2.4 m |
| Design 2 Building | I2 | 820 | 33.937812, -84.521357 | 9.1 m |
| Heatherington Engineering Lab | G | 834 | 33.938466, -84.521224 | 6.4 m |
| Engineering Technology Center | Q | 840 | 33.938321, -84.522645 | 19.3 m |
| Hornet Hub | — | 836 | 33.938939, -84.523140 | footprint centroid (see below) |
| Lawrence V. Johnson Library | C | 910 | 33.939215, -84.520192 | 13.0 m |
| Mathematics Building | D | 850 | 33.939940, -84.520758 | 5.4 m |
| Robin and Doug Shore Innovation Center | — | 970 | 33.939934, -84.518824 | address point (see below) |
| W. Clair Harris Textile Center | M | 650 | 33.936802, -84.519854 | 11.8 m |
| Joe Mack Wilson Student Center | A | 860 | 33.940665, -84.520395 | 9.6 m |
| Event Center | S2 | 635 | 33.935836, -84.518353 | 2.7 m |
| Recreation and Wellness Center | S1 | 955 | 33.941248, -84.517667 | 4.9 m |
| Stingers Dining Hall | X | 806 | 33.937381, -84.522317 | 3.7 m |
| Hornet Village 100 | — | — | 33.936889, -84.522161 | 8.2 m |
| Hornet Village 200 | — | — | 33.936480, -84.521506 | 17.1 m |
| Howell Hall | — | — | 33.938134, -84.518943 | 3.0 m |
| Housing and Residence Life Office | — | — | 33.938406, -84.518098 | 1.1 m |
| University Commons 100–600 | — | — | see dataset (6 records) | 1.0–6.6 m |
| University Courtyard 1000/2000/3000 | — | — | see dataset (3 records) | 9.6–14.0 m |
| University Columns 1–10, Activity Center | — | — | see dataset (11 records) | 0.0–2.3 m |

ICM-vs-OSM agreement: 42 comparable records, mean 5.7 m, maximum 19.3 m —
consistent with pin-vs-centroid placement differences on large buildings.
This is positional agreement only: proximity does not guarantee the same H3
cell across a cell boundary. The registry computes the resolution-11 H3 cell
from each chosen dataset coordinate; it does not infer inclusion or coordinate
accuracy guarantees from these cross-check distances.

Official PPM grid cells (cross-check of location, not used as coordinates):
Academic M-9, Administration O-7, Architecture P-14, Atrium N-11, Civil and
Environmental Engineering N-16, Crawford K-8, Design 1 L-11, Design 2 L-11,
Heatherington Engineering Lab L-10, Engineering Technology Center I-10,
Hornet Hub I-9, Library N-8, Mathematics M-6, Shore Innovation Center P-6,
Textile N-13, Joe Mack Wilson Student Center M-5, Event Center Q-15,
Recreation and Wellness Center S-3, Stingers J-12; Campus Housing directory:
Courtyard T-8, Commons S-12, Columns Activity Center D-19, Columns E-17,
Howell P-10, Housing and Residence Life Office R-10, Hornet Village J-13 and
L-14.

## Special cases

### Hornet Hub (opened June 2026) — building 836

Not yet on the ICM (KSU has not added the 2026 buildings to the interactive
map), so evidence was triangulated:

- **Identity/address**: ASFR 2026 lists "Hornet Hub - 836 Polytechnic Lane";
  PPM lists it in Buildings and Services with grid I-9 and BLDG# 836 (a
  second directory row shows XXX for the same building); KSU news and the
  Planning, Design and Construction project page confirm the building and its
  purpose (12,000 sq ft competition-team facility).
- **Coordinate**: OSM way 1504299650 ("New Building - Needs Offical Name",
  mapped during construction) is the only building footprint in grid I-9, at
  the spot where the PPM places the Hornet Hub label. Footprint area
  1,477 m² (15,900 sq ft), the right order of magnitude for a 12,000 sq ft
  building. The dataset uses this footprint centroid: 33.938939, -84.523140.
- **Corroboration**: ArcGIS `PointAddress` for 836 Polytechnic Lane sits
  45 m south of the footprint (33.938492, -84.523), the expected road-side
  placement for an address point on Polytechnic Lane — the same offset
  pattern the validated 834/840 addresses show (points 6–14 m south of
  building centroids). The PPM grid I-9 and the PPM label position
  (≈ 33.9388, -84.5230 by alignment with 15 reference buildings) agree with
  the footprint within 15 m.

### Robin and Doug Shore Innovation Center (opened April 2026) — building 970

Also absent from the ICM. Evidence:

- **Identity/address**: PPM directory entry with grid P-6 and BLDG# 970; the
  Shore Entrepreneurship Center page gives the official address "Robin and
  Doug Shore Innovation Center, 970 Technology Way, Marietta, GA 30060";
  ASFR 2026 lists "Shore Innovation Center - 970 Technology Way"; KSU news
  (April 2026 ribbon-cutting) describes it as "rising prominently over
  Technology Way".
- **Coordinate**: ArcGIS `PointAddress` for 970 Technology Way
  (33.939934, -84.518824), the address point of the building. The PPM grid
  cell P-6, calibrated against 15 lettered reference buildings, maps to
  ≈ (33.9399, -84.5189) — 10 m from the geocoded point; the PPM map label
  position agrees within label-placement noise. No OSM footprint exists yet
  (the surrounding area was still open ground in OSM's 2013 campus survey).

### Renames and aliases (name chosen, alias documented)

- **Heatherington Engineering Lab (G)**: renamed from "Engineering Lab
  Building" in 2025 (KSU news, Dale and Ann Heatherington endowed chair).
  The PPM (08/07/2026) already uses the new name; the ICM pin and ASFR entry
  still use "Engineering Lab". Dataset uses the current PPM name.
- **Event Center (S2)**: the ASFR calls this building "Gymnasium - 635 Walter
  Kelly Road" and OSM names it "S2 - Gymnasium"; PPM and ICM call it
  "Event Center". All four refer to the same 635 Walter Kelly Road building.
- **Stingers Dining Hall (X)**: ASFR says "Stingers Restaurant"; PPM and ICM
  say "Stingers Dining Hall". Dataset follows PPM/ICM.
- **Architecture**: PPM/ICM say "Architecture"; ASFR says "Architecture
  Building". Dataset uses "Architecture Building" (ASFR is the most recent
  official full roster).
- **University Columns 1**: the ICM titles it "University Columns" (no
  number); ASFR and OSM confirm it as "University Columns 1" (721 Hexagon
  Way). The ICM's address for Columns 10 (721 Hexagon Way) is an apparent
  data-entry duplicate of Columns 1; ASFR gives Columns 10 as 757 Hexagon Way.
  Dataset uses the ASFR numbering. Housing records carry `building_number:
  null` because the PPM housing directory does not assign BLDG# numbers;
  street addresses are recorded here instead of in the JSON (the schema has
  no address field).

### Housing scope and status

The KSU Housing "Living Options" page lists current Marietta communities:
first-year — Hornet Village, Howell Hall; upper-class — University Columns,
University Commons, University Courtyard. The dataset includes each
residence building of those communities that has an ICM pin plus the Housing
and Residence Life Office (check-in hub, "R10" in older KSU maps and OSM)
and the University Columns Activity Center (listed under Campus Housing in
the PPM). Norton Hall (920 Hornet Loop) is NOT included: although it is a
former residence hall (code R2 in the current PPM), the housing page no
longer lists it and SPCEET publishes faculty offices there, so it is not a
current housing check-in option and was not requested. "The Market" (630
Cheshier Road, "Retail Eatery" in ASFR) is dining rather than housing and
was out of scope.

### Code and number decisions

- Codes and numbers come from the current PPM directory only. The Hornet Hub
  and Shore Innovation Center have no letter codes in the PPM, so their
  `building_code` is null (the task list also gave no letters for them).
- Housing `building_code` is null: current KSU documents assign no letters to
  housing buildings (older KSU maps and OSM use R1/R2/R10/R70x-style
  residence codes, but those are not in the current PPM directory and are
  therefore not asserted). Howell Hall's historical "R1" is noted here, not
  in the dataset.

## Checks

- `python3 data/campus/validate_marietta.py` — 1591 contract checks, 0
  failures (schema shape, id pattern and uniqueness, category/status
  enums, campus bbox sanity, verified ⇒ has coordinates, source shape and
  https URLs, no two buildings within 5 m, all 19 requested ids present).
- `python3 -m unittest discover -s data/campus -p 'test_*.py'` — 4 tests, all
  passing.

## Limitations and objections

- The two 2026 buildings rest on address-point/footprint evidence rather
  than an official KSU map pin; both carry 2–3 corroborating sources and
  are flagged in `sources` for exactly what they are. Expected accuracy
  is well inside one H3 res-11 cell.
- The ICM has not been updated with the 2026 buildings or the Heatherington
  rename; KSU's own sources are internally inconsistent for those names, and
  the dataset follows the most recent official document (PPM, 08/07/2026).
- ASFR address data was extracted from a PDF by text alignment; the Marietta
  roster matched the PPM and ICM for every cross-checked building, so
  transcription is not a concern, but the ASFR should be re-checked if the
  dataset is regenerated after the next report edition.
- OSM campus mapping is largely from 2013 (SPSU era); it independently
  preserves the official letter codes, which is why it works as a cross-check
  of both coordinates and code identity, but it does not know the 2026
  buildings.
- Census geocoder has no coverage for these campus addresses; ArcGIS was
  used instead and validated against known campus addresses first.
