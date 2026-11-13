import { redisStore } from './broker.ts';
import { getWorldFloodZone, recordApiStatus } from './worldFlood.ts';
import type {
  MapPoiItem,
  NominatimSearchSuggestion,
  PoiCategory,
  SpatialFloodSample,
} from '../types.ts';

const OSM_USER_AGENT = 'AlertNet-FloodResponse/1.0 (disaster-response-map@alertnet.local)';
let overpassBackoffUntil = 0;

async function fetchJsonTimeout<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<{ data: T | null; httpStatus: number | null; error: string | null }> {
  const { timeoutMs = 4500, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        'User-Agent': OSM_USER_AGENT,
        Accept: 'application/json',
        ...(rest.headers || {}),
      },
    });
    if (!res.ok) {
      return { data: null, httpStatus: res.status, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const json = (await res.json()) as T;
    return { data: json, httpStatus: res.status, error: null };
  } catch (err: any) {
    const msg =
      err?.name === 'AbortError'
        ? `Timed out after ${timeoutMs}ms`
        : err?.cause?.code || err?.message || 'Network request failed';
    return { data: null, httpStatus: null, error: String(msg) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. OPENSTREETMAP NOMINATIM AUTOCOMPLETE SEARCH (+ PHOTON FALLBACK)
// ---------------------------------------------------------------------------
interface NominatimRawItem {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
  category?: string;
  class?: string;
  type?: string;
  address?: Record<string, string>;
}

interface PhotonRawPayload {
  features?: Array<{
    geometry: { coordinates: [number, number] };
    properties: {
      osm_id?: number;
      osm_type?: string;
      osm_key?: string;
      osm_value?: string;
      name?: string;
      street?: string;
      locality?: string;
      district?: string;
      city?: string;
      county?: string;
      state?: string;
      country?: string;
      extent?: [number, number, number, number];
    };
  }>;
}

export async function searchNominatimAutocomplete(
  query: string
): Promise<{ suggestions: NominatimSearchSuggestion[]; source: string }> {
  const clean = query.trim();
  if (!clean) return { suggestions: [], source: 'empty' };

  const cacheKey = `osm:autocomplete:${clean.toLowerCase()}`;
  const cached = redisStore.getCache<NominatimSearchSuggestion[]>(cacheKey);
  if (cached) {
    return { suggestions: cached, source: 'cache' };
  }

  // Coordinate input shortcut: "17.4968, 78.3614"
  const coordMatch = clean.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = Math.max(-85, Math.min(85, Number(coordMatch[1])));
    const lng = Math.max(-180, Math.min(180, Number(coordMatch[2])));
    const item: NominatimSearchSuggestion = {
      id: `coord-${lat}-${lng}`,
      name: `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
      type: 'coordinates',
      category: 'place',
    };
    return { suggestions: [item], source: 'coordinates' };
  }

  const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    clean
  )}&format=jsonv2&addressdetails=1&limit=8`;
  const nom = await fetchJsonTimeout<NominatimRawItem[]>(nomUrl, { timeoutMs: 4500 });

  if (nom.data && Array.isArray(nom.data)) {
    recordApiStatus({
      id: 'osm-nominatim',
      provider: 'OpenStreetMap Nominatim Geocoding',
      endpoint: 'https://nominatim.openstreetmap.org/search',
      httpStatus: nom.httpStatus,
      status: 'live',
      lastUpdatedAt: new Date().toISOString(),
      dataTimestamp: new Date().toISOString(),
      dataSource: 'OpenStreetMap Nominatim v2',
      errorMessage: null,
      locationLabel: clean,
    });

    if (nom.data.length > 0) {
      const suggestions: NominatimSearchSuggestion[] = nom.data.map((r) => ({
        id: `nom-${r.place_id}`,
        name: r.name || r.display_name.split(',')[0].trim(),
        displayName: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
        boundingBox:
          r.boundingbox && r.boundingbox.length === 4
            ? [
                Number(r.boundingbox[0]),
                Number(r.boundingbox[1]),
                Number(r.boundingbox[2]),
                Number(r.boundingbox[3]),
              ]
            : undefined,
        type: r.type || 'place',
        category: r.category || r.class || 'place',
      }));
      redisStore.setCache(cacheKey, suggestions, 600_000);
      return { suggestions, source: 'OpenStreetMap Nominatim' };
    }
  } else {
    recordApiStatus({
      id: 'osm-nominatim',
      provider: 'OpenStreetMap Nominatim Geocoding',
      endpoint: 'https://nominatim.openstreetmap.org/search',
      httpStatus: nom.httpStatus,
      status: 'error',
      lastUpdatedAt: new Date().toISOString(),
      dataTimestamp: null,
      dataSource: 'Unavailable',
      errorMessage: nom.error || 'Nominatim lookup failed',
      locationLabel: clean,
    });
  }

  // Fallback to Photon (OpenStreetMap-backed search) if Nominatim returned 0 or errored
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=8`;
  const pho = await fetchJsonTimeout<PhotonRawPayload>(photonUrl, { timeoutMs: 4000 });
  if (pho.data?.features?.length) {
    const suggestions: NominatimSearchSuggestion[] = pho.data.features.map((f, idx) => {
      const p = f.properties;
      const parts = [p.name, p.street, p.locality || p.district, p.city || p.county, p.state, p.country]
        .filter(Boolean)
        .join(', ');
      return {
        id: `pho-${p.osm_id || idx}`,
        name: p.name || parts.split(',')[0] || clean,
        displayName: parts || clean,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        type: p.osm_value || 'place',
        category: p.osm_key || 'place',
      };
    });
    redisStore.setCache(cacheKey, suggestions, 600_000);
    return { suggestions, source: 'OpenStreetMap Photon' };
  }

  return { suggestions: [], source: 'unavailable' };
}

// ---------------------------------------------------------------------------
// 2. VIEWPORT BOUNDING-BOX POI RETRIEVAL (OVERPASS + BOUNDED OSM NOMINATIM)
// ---------------------------------------------------------------------------
function clampViewport(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}): { south: number; west: number; north: number; east: number } {
  const cLat = (bounds.south + bounds.north) / 2;
  const cLng = (bounds.west + bounds.east) / 2;
  const halfLat = Math.min(0.085, Math.max(0.012, Math.abs(bounds.north - bounds.south) / 2));
  const halfLng = Math.min(0.11, Math.max(0.015, Math.abs(bounds.east - bounds.west) / 2));
  return {
    south: Number((cLat - halfLat).toFixed(4)),
    north: Number((cLat + halfLat).toFixed(4)),
    west: Number((cLng - halfLng).toFixed(4)),
    east: Number((cLng + halfLng).toFixed(4)),
  };
}

function classifyOsmTags(
  osmClass: string,
  osmType: string,
  name: string
): { category: Exclude<PoiCategory, 'all'>; subType: string } | null {
  const c = osmClass.toLowerCase();
  const t = osmType.toLowerCase();
  const n = name.toLowerCase();

  if (t === 'hospital' || t === 'clinic' || t === 'doctors' || t === 'pharmacy' || n.includes('hospital')) {
    return {
      category: 'hospitals',
      subType: t === 'clinic' ? 'Medical Clinic' : t === 'pharmacy' ? 'Pharmacy' : 'Hospital & Medical Centre',
    };
  }
  if (t === 'school' || t === 'college' || t === 'university' || t === 'kindergarten') {
    return {
      category: 'schools',
      subType: t === 'college' || t === 'university' ? 'College / University' : 'School',
    };
  }
  if (t === 'police' || t === 'fire_station' || t === 'townhall' || c === 'office') {
    return {
      category: 'emergency',
      subType:
        t === 'police'
          ? 'Police Station'
          : t === 'fire_station'
          ? 'Fire Station'
          : 'Government / Civic Building',
    };
  }
  if (
    t === 'mall' ||
    t === 'supermarket' ||
    t === 'department_store' ||
    t === 'marketplace' ||
    t === 'restaurant' ||
    t === 'cafe' ||
    t === 'hotel' ||
    c === 'shop'
  ) {
    return {
      category: 'shopping',
      subType:
        t === 'mall'
          ? 'Shopping Mall'
          : t === 'supermarket' || c === 'shop'
          ? 'Shop / Supermarket'
          : t === 'hotel'
          ? 'Hotel'
          : 'Restaurant / Dining',
    };
  }
  if (
    t === 'bus_stop' ||
    t === 'bus_station' ||
    t === 'station' ||
    t === 'subway_entrance' ||
    c === 'railway'
  ) {
    return {
      category: 'transport',
      subType: c === 'railway' || t === 'station' ? 'Railway / Metro Station' : 'Bus Stop / Transit',
    };
  }
  if (
    t === 'bridge' ||
    t === 'dam' ||
    c === 'bridge' ||
    c === 'highway' ||
    c === 'waterway' ||
    t === 'residential' ||
    t === 'suburb' ||
    t === 'neighbourhood'
  ) {
    return {
      category: 'roads_bridges',
      subType:
        t === 'dam'
          ? 'Barrage / Dam'
          : n.includes('bridge') || n.includes('flyover') || t === 'bridge'
          ? 'Bridge / Flyover'
          : c === 'waterway'
          ? 'River / Waterway'
          : c === 'highway'
          ? 'Road / Highway'
          : 'Residential Area / Locality',
    };
  }
  return null;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function tryOverpassPois(
  box: { south: number; west: number; north: number; east: number },
  category: PoiCategory
): Promise<MapPoiItem[] | null> {
  const b = `${box.south},${box.west},${box.north},${box.east}`;
  const clauses: string[] = [];

  if (category === 'all' || category === 'hospitals') {
    clauses.push(`nwr["amenity"~"hospital|clinic"](${b});`);
  }
  if (category === 'all' || category === 'schools') {
    clauses.push(`nwr["amenity"~"school|college|university"](${b});`);
  }
  if (category === 'all' || category === 'emergency') {
    clauses.push(`nwr["amenity"~"police|fire_station|townhall"](${b});`);
    clauses.push(`nwr["office"="government"](${b});`);
  }
  if (category === 'all' || category === 'shopping') {
    clauses.push(`nwr["shop"~"mall|supermarket|department_store"](${b});`);
    clauses.push(`nwr["amenity"~"restaurant|hotel|marketplace"](${b});`);
  }
  if (category === 'all' || category === 'transport') {
    clauses.push(`node["highway"="bus_stop"](${b});`);
    clauses.push(`nwr["amenity"="bus_station"](${b});`);
    clauses.push(`nwr["railway"="station"](${b});`);
  }
  if (category === 'all' || category === 'roads_bridges') {
    clauses.push(`way["bridge"="yes"](${b});`);
    clauses.push(`way["highway"~"trunk|primary"](${b});`);
    clauses.push(`nwr["place"~"suburb|neighbourhood"](${b});`);
  }

  const query = `[out:json][timeout:4];(${clauses.join('')});out center 45;`;
  const endpoint = 'https://overpass-api.de/api/interpreter';
  const attempt = await fetchJsonTimeout<{ elements?: OverpassElement[] }>(endpoint, {
    method: 'POST',
    timeoutMs: 2200,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!attempt.data?.elements) {
    overpassBackoffUntil = Date.now() + 60_000;
    recordApiStatus({
      id: 'osm-overpass',
      provider: 'OpenStreetMap Overpass API',
      endpoint,
      httpStatus: attempt.httpStatus,
      status: 'unavailable',
      lastUpdatedAt: new Date().toISOString(),
      dataTimestamp: null,
      dataSource: 'Bounded Nominatim/Photon OSM Fallback Active',
      errorMessage: `${attempt.error || 'Overpass unreachable'} — using bounded OpenStreetMap POI query`,
    });
    return null;
  }

  recordApiStatus({
    id: 'osm-overpass',
    provider: 'OpenStreetMap Overpass API',
    endpoint,
    httpStatus: attempt.httpStatus,
    status: 'live',
    lastUpdatedAt: new Date().toISOString(),
    dataTimestamp: new Date().toISOString(),
    dataSource: 'Live OpenStreetMap Overpass API',
    errorMessage: null,
  });

  const out: MapPoiItem[] = [];
  for (const el of attempt.data.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || tags.operator;
    if (lat === undefined || lng === undefined || !name) continue;

    const osmClass = tags.amenity
      ? 'amenity'
      : tags.shop
      ? 'shop'
      : tags.railway
      ? 'railway'
      : tags.bridge
      ? 'bridge'
      : tags.highway
      ? 'highway'
      : tags.office
      ? 'office'
      : 'place';
    const osmType =
      tags.amenity ||
      tags.shop ||
      tags.railway ||
      (tags.bridge ? 'bridge' : undefined) ||
      tags.highway ||
      tags.office ||
      tags.place ||
      'place';

    const classified = classifyOsmTags(osmClass, osmType, name);
    if (!classified) continue;

    const address =
      [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city']]
        .filter(Boolean)
        .join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    out.push({
      id: `ov-${el.type}-${el.id}`,
      name,
      category: classified.category,
      subType: classified.subType,
      address,
      lat,
      lng,
      osmType: el.type,
      osmId: el.id,
      source: 'OpenStreetMap Overpass',
    });
  }
  return out;
}

interface QuerySpec {
  q: string;
  category: Exclude<PoiCategory, 'all'>;
  subType: string;
  limit: number;
}

const CATEGORY_QUERY_SPECS: Record<Exclude<PoiCategory, 'all'>, QuerySpec[]> = {
  hospitals: [
    { q: '[hospital]', category: 'hospitals', subType: 'Hospital', limit: 10 },
    { q: '[clinic]', category: 'hospitals', subType: 'Medical Clinic', limit: 6 },
  ],
  schools: [
    { q: '[school]', category: 'schools', subType: 'School', limit: 10 },
    { q: '[college]', category: 'schools', subType: 'College / University', limit: 6 },
  ],
  emergency: [
    { q: '[police]', category: 'emergency', subType: 'Police Station', limit: 6 },
    { q: '[fire_station]', category: 'emergency', subType: 'Fire Station', limit: 5 },
    { q: 'government office', category: 'emergency', subType: 'Government Building', limit: 5 },
  ],
  shopping: [
    { q: '[mall]', category: 'shopping', subType: 'Shopping Mall', limit: 6 },
    { q: '[supermarket]', category: 'shopping', subType: 'Shop / Supermarket', limit: 7 },
    { q: '[restaurant]', category: 'shopping', subType: 'Restaurant', limit: 6 },
    { q: '[hotel]', category: 'shopping', subType: 'Hotel', limit: 5 },
  ],
  transport: [
    { q: '[station]', category: 'transport', subType: 'Railway / Metro Station', limit: 6 },
    { q: '[bus_stop]', category: 'transport', subType: 'Bus Stop', limit: 8 },
  ],
  roads_bridges: [
    { q: 'flyover', category: 'roads_bridges', subType: 'Bridge / Flyover', limit: 6 },
    { q: 'bridge', category: 'roads_bridges', subType: 'Bridge', limit: 6 },
    { q: 'barrage', category: 'roads_bridges', subType: 'Barrage / River Crossing', limit: 3 },
    { q: 'highway', category: 'roads_bridges', subType: 'Highway / Main Road', limit: 6 },
    { q: '[suburb]', category: 'roads_bridges', subType: 'Locality / Residential Area', limit: 6 },
  ],
};

export async function fetchViewportPois(params: {
  south: number;
  west: number;
  north: number;
  east: number;
  category: PoiCategory;
}): Promise<{ pois: MapPoiItem[]; source: string; cached: boolean }> {
  const box = clampViewport(params);
  const cacheKey = `osm:pois:${params.category}:${box.south.toFixed(3)}:${box.west.toFixed(
    3
  )}:${box.north.toFixed(3)}:${box.east.toFixed(3)}`;

  const cached = redisStore.getCache<{ pois: MapPoiItem[]; source: string }>(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // 1. Try Overpass API directly when reachable (skip during 60s backoff after timeout)
  if (Date.now() > overpassBackoffUntil) {
    const overpassItems = await tryOverpassPois(box, params.category);
    if (overpassItems && overpassItems.length > 0) {
      const deduped = dedupePois(overpassItems).slice(0, 45);
      redisStore.setCache(cacheKey, { pois: deduped, source: 'OpenStreetMap Overpass' }, 300_000);
      return { pois: deduped, source: 'OpenStreetMap Overpass', cached: false };
    }
  }

  // 2. Bounded OpenStreetMap Nominatim viewbox queries (works reliably when Overpass is blocked)
  const specs: QuerySpec[] =
    params.category === 'all'
      ? [
          { q: '[hospital]', category: 'hospitals', subType: 'Hospital', limit: 6 },
          { q: '[school]', category: 'schools', subType: 'School', limit: 6 },
          { q: '[police]', category: 'emergency', subType: 'Police Station', limit: 4 },
          { q: '[fire_station]', category: 'emergency', subType: 'Fire Station', limit: 3 },
          { q: '[mall]', category: 'shopping', subType: 'Shopping Mall', limit: 4 },
          { q: '[supermarket]', category: 'shopping', subType: 'Supermarket', limit: 4 },
          { q: '[restaurant]', category: 'shopping', subType: 'Restaurant', limit: 4 },
          { q: '[hotel]', category: 'shopping', subType: 'Hotel', limit: 3 },
          { q: '[station]', category: 'transport', subType: 'Railway / Metro Station', limit: 4 },
          { q: '[bus_stop]', category: 'transport', subType: 'Bus Stop', limit: 4 },
          { q: 'flyover', category: 'roads_bridges', subType: 'Bridge / Flyover', limit: 4 },
          { q: '[suburb]', category: 'roads_bridges', subType: 'Residential Locality', limit: 4 },
        ]
      : CATEGORY_QUERY_SPECS[params.category];

  const viewbox = `${box.west},${box.north},${box.east},${box.south}`;
  const collected: MapPoiItem[] = [];

  // Process in small batches of 3; short-circuit to Photon if Nominatim rate-limits (HTTP 429)
  let rateLimited = false;
  for (let i = 0; i < specs.length && !rateLimited; i += 3) {
    const batch = specs.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (spec) => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          spec.q
        )}&viewbox=${viewbox}&bounded=1&format=jsonv2&addressdetails=1&limit=${spec.limit}`;
        const res = await fetchJsonTimeout<NominatimRawItem[]>(url, { timeoutMs: 4200 });
        if (res.httpStatus === 429) {
          rateLimited = true;
          return [] as MapPoiItem[];
        }
        if (!res.data || !Array.isArray(res.data)) return [] as MapPoiItem[];
        return res.data
          .map((item): MapPoiItem | null => {
            const lat = Number(item.lat);
            const lng = Number(item.lon);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
            const rawName = item.name || item.display_name.split(',')[0].trim();
            if (!rawName || rawName.length < 2) return null;
            const classified = classifyOsmTags(
              item.category || item.class || '',
              item.type || '',
              rawName
            );
            return {
              id: `osm-${item.osm_type || 'n'}-${item.osm_id || item.place_id}`,
              name: rawName,
              category: classified?.category || spec.category,
              subType: classified?.subType || spec.subType,
              address: item.display_name,
              lat,
              lng,
              osmType: item.osm_type,
              osmId: item.osm_id,
              source: 'OpenStreetMap Nominatim (Bounded OSM)',
            };
          })
          .filter((x): x is MapPoiItem => x !== null);
      })
    );
    for (const group of results) collected.push(...group);
  }

  let filtered =
    params.category === 'all'
      ? dedupePois(collected).slice(0, 44)
      : dedupePois(collected)
          .filter((p) => p.category === params.category)
          .slice(0, 30);

  let source = 'OpenStreetMap Nominatim (Bounded OSM POIs)';

  // 3. Photon OSM fallback if Nominatim yielded 0 or rate-limited
  if (filtered.length < 6) {
    const cLat = (box.south + box.north) / 2;
    const cLng = (box.west + box.east) / 2;
    const photonSpecs = specs;
    const photonCollected: MapPoiItem[] = [...filtered];
    await Promise.all(
      photonSpecs.map(async (spec) => {
        const cleanQ = spec.q.replace(/[\[\]]/g, '').replace(/_/g, ' ');
        const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
          cleanQ
        )}&lat=${cLat.toFixed(4)}&lon=${cLng.toFixed(4)}&limit=${Math.max(8, spec.limit)}`;
        const pho = await fetchJsonTimeout<PhotonRawPayload>(pUrl, { timeoutMs: 3800 });
        if (!pho.data?.features) return;
        for (const f of pho.data.features) {
          const [lng, lat] = f.geometry.coordinates;
          if (lat < box.south || lat > box.north || lng < box.west || lng > box.east) continue;
          const p = f.properties;
          const name = p.name || p.street;
          if (!name) continue;
          const classified = classifyOsmTags(p.osm_key || '', p.osm_value || '', name);
          const cat = classified?.category || spec.category;
          if (params.category !== 'all' && cat !== params.category) continue;
          const address =
            [p.name, p.street, p.locality || p.district, p.city || p.county, p.state]
              .filter(Boolean)
              .join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          photonCollected.push({
            id: `pho-${p.osm_type || 'n'}-${p.osm_id || `${lat}-${lng}`}`,
            name,
            category: cat,
            subType: classified?.subType || spec.subType,
            address,
            lat,
            lng,
            osmType: p.osm_type,
            osmId: p.osm_id,
            source: 'OpenStreetMap Photon (OSM)',
          });
        }
      })
    );
    const dedupedPhoton = dedupePois(photonCollected);
    if (dedupedPhoton.length > filtered.length) {
      filtered =
        params.category === 'all'
          ? dedupedPhoton.slice(0, 44)
          : dedupedPhoton.filter((p) => p.category === params.category).slice(0, 30);
      if (collected.length === 0) {
        source = 'OpenStreetMap Photon (OSM POIs)';
      }
    }
  }

  if (filtered.length > 0) {
    redisStore.setCache(cacheKey, { pois: filtered, source }, 300_000);
  }
  return { pois: filtered, source, cached: false };
}

function dedupePois(items: MapPoiItem[]): MapPoiItem[] {
  const seen = new Set<string>();
  const out: MapPoiItem[] = [];
  for (const item of items) {
    const key = item.osmId
      ? `${item.osmType || 'n'}-${item.osmId}`
      : `${item.name.toLowerCase()}-${item.lat.toFixed(4)}-${item.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. SPATIAL MULTI-BASIN FLOOD, RAINFALL & RIVER DISCHARGE OVERLAY
// ---------------------------------------------------------------------------
export async function fetchSpatialFloodOverlay(params: {
  centerLat: number;
  centerLng: number;
  centerLabel: string;
  south?: number;
  west?: number;
  north?: number;
  east?: number;
}): Promise<{ samples: SpatialFloodSample[]; cached: boolean }> {
  const latStep = params.north && params.south
    ? Math.min(0.045, Math.max(0.018, (params.north - params.south) * 0.28))
    : 0.028;
  const lngStep = params.east && params.west
    ? Math.min(0.055, Math.max(0.022, (params.east - params.west) * 0.28))
    : 0.032;

  const cacheKey = `osm:flood-overlay:${params.centerLat.toFixed(2)}:${params.centerLng.toFixed(
    2
  )}:${latStep.toFixed(2)}`;
  const cached = redisStore.getCache<SpatialFloodSample[]>(cacheKey);
  if (cached) {
    return { samples: cached, cached: true };
  }

  const points = [
    { id: 'center', label: `${params.centerLabel} Core`, lat: params.centerLat, lng: params.centerLng, r: 1600 },
    { id: 'nw', label: `${params.centerLabel} North-West`, lat: params.centerLat + latStep, lng: params.centerLng - lngStep, r: 1400 },
    { id: 'ne', label: `${params.centerLabel} North-East`, lat: params.centerLat + latStep, lng: params.centerLng + lngStep, r: 1400 },
    { id: 'sw', label: `${params.centerLabel} South-West`, lat: params.centerLat - latStep, lng: params.centerLng - lngStep, r: 1400 },
    { id: 'se', label: `${params.centerLabel} South-East`, lat: params.centerLat - latStep, lng: params.centerLng + lngStep, r: 1400 },
  ];

  const zones = await Promise.all(
    points.map((pt) =>
      getWorldFloodZone({
        id: `spatial-${pt.id}-${pt.lat.toFixed(2)}-${pt.lng.toFixed(2)}`,
        name: pt.label,
        lat: pt.lat,
        lng: pt.lng,
        radiusMeters: pt.r,
      })
    )
  );

  const samples: SpatialFloodSample[] = zones.map((z, i) => ({
    id: points[i].id,
    label: points[i].label,
    lat: points[i].lat,
    lng: points[i].lng,
    radiusMeters: points[i].r,
    riskScore: z.riskScore,
    riskLevel: z.riskLevel,
    rainfallMm: z.rainfallIntensityMmHr,
    forecast24hMm: z.historicalRainfall24hMm,
    precipProbabilityPct: z.precipitationProbabilityPct ?? null,
    riverDischargeM3s: z.riverDischargeM3s ?? null,
    riverDischargeMeanM3s: z.riverDischargeMeanM3s ?? null,
    observationTimestamp: z.observationTimestamp ?? null,
    dataSource: z.dataSource,
  }));

  redisStore.setCache(cacheKey, samples, 180_000);
  return { samples, cached: false };
}
