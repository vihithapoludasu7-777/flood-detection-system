import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Bus,
  CloudRain,
  Compass,
  Droplets,
  Expand,
  GraduationCap,
  HeartPulse,
  Layers,
  List,
  Loader2,
  LocateFixed,
  MapPin,
  Minimize2,
  Minus,
  Navigation,
  Phone,
  Plus,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Waves,
  X,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import {
  LiveFloodLeafletMap,
  type MapFlyRequest,
  type MapViewportBounds,
  type MapZoomCommand,
} from '../LiveFloodLeafletMap.tsx';
import type {
  MapFacility,
  MapLayerMode,
  MapPoiItem,
  NominatimSearchSuggestion,
  PoiCategory,
  RescueTeam,
  RiskLevel,
  SOSIncident,
  SpatialFloodSample,
} from '../../types.ts';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return 'N/A';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

type SelectedMapEntity =
  | { kind: 'poi'; item: MapPoiItem }
  | { kind: 'flood'; item: SpatialFloodSample }
  | { kind: 'facility'; item: MapFacility }
  | { kind: 'incident'; item: SOSIncident }
  | { kind: 'team'; item: RescueTeam }
  | { kind: 'searched'; lat: number; lng: number; name: string; address: string };

const CATEGORY_TABS: Array<{
  id: PoiCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'all', label: 'All Places', icon: Compass },
  { id: 'hospitals', label: 'Hospitals', icon: HeartPulse },
  { id: 'schools', label: 'Schools', icon: GraduationCap },
  { id: 'emergency', label: 'Emergency Services', icon: ShieldAlert },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { id: 'transport', label: 'Transport', icon: Bus },
  { id: 'roads_bridges', label: 'Roads and Bridges', icon: Route },
];

const LAYER_OPTIONS: Array<{
  id: MapLayerMode;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'standard', label: 'Standard Map', shortDesc: 'OSM streets & nearby places', icon: MapPin },
  { id: 'flood_risk', label: 'Live Flood Risk', shortDesc: 'Red / Orange / Green zones', icon: Waves },
  { id: 'rainfall', label: 'Rainfall Monitoring', shortDesc: 'Live rain & 24h forecast', icon: CloudRain },
  { id: 'river', label: 'River Monitoring', shortDesc: 'GloFAS river discharge', icon: Droplets },
  { id: 'emergency', label: 'Emergency Locations', shortDesc: 'Shelters, DRF & SOS', icon: Siren },
];

function getRiskColorClass(level: RiskLevel): string {
  if (level === 'CRITICAL' || level === 'HIGH') return 'text-red-700 bg-red-50 border-red-200';
  if (level === 'MEDIUM' || level === 'MODERATE')
    return 'text-orange-700 bg-orange-50 border-orange-200';
  if (level === 'LOW') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  return 'text-slate-600 bg-slate-100 border-slate-200';
}

export const LiveFloodMapView: React.FC = () => {
  const {
    t,
    facilities,
    rescueTeams,
    incidents,
    activeZone,
    liveGps,
    refreshDashboard,
  } = useAlertNet();

  const initialCenter = useMemo(
    () => ({
      lat: activeZone?.lat ?? 17.484,
      lng: activeZone?.lng ?? 78.399,
    }),
    // Only seed on initial mount; search & pan control movement afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Search & autocomplete state
  const [searchQuery, setSearchQuery] = useState(
    activeZone ? `${activeZone.name}, ${activeZone.state}` : 'Hyderabad, Telangana'
  );
  const [suggestions, setSuggestions] = useState<NominatimSearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  // Active searched place & user GPS
  const [searchedLocation, setSearchedLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
    address: string;
  }>({
    lat: initialCenter.lat,
    lng: initialCenter.lng,
    name: activeZone?.name || 'Hyderabad',
    address: activeZone
      ? `${activeZone.name}, ${activeZone.district}, ${activeZone.state}`
      : 'Hyderabad, Telangana, India',
  });
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(liveGps);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Map view state
  const [activeCategory, setActiveCategory] = useState<PoiCategory>('all');
  const [activeLayer, setActiveLayer] = useState<MapLayerMode>('standard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [panelTab, setPanelTab] = useState<'details' | 'nearby' | 'emergency'>('nearby');

  // Viewport & fetched data state
  const [viewportBounds, setViewportBounds] = useState<MapViewportBounds | null>(null);
  const [pois, setPois] = useState<MapPoiItem[]>([]);
  const [poiSource, setPoiSource] = useState<string>('OpenStreetMap');
  const [loadingPois, setLoadingPois] = useState(false);
  const [poiError, setPoiError] = useState<string | null>(null);

  const [floodSamples, setFloodSamples] = useState<SpatialFloodSample[]>([]);
  const [loadingFlood, setLoadingFlood] = useState(false);
  const [floodError, setFloodError] = useState<string | null>(null);

  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity | null>(null);

  // Waterlogging report form
  const [reportText, setReportText] = useState('');
  const [reportSeverity, setReportSeverity] = useState<RiskLevel>('HIGH');
  const [reporting, setReporting] = useState(false);
  const [reportBanner, setReportBanner] = useState<string | null>(null);

  // Imperative Leaflet controls
  const [flyRequest, setFlyRequest] = useState<MapFlyRequest | null>(null);
  const [zoomCommand, setZoomCommand] = useState<MapZoomCommand | null>(null);
  const flyCounterRef = useRef(1);
  const zoomCounterRef = useRef(1);
  const poiAbortRef = useRef<AbortController | null>(null);
  const floodAbortRef = useRef<AbortController | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const lastGlobalZoneRef = useRef<string | null>(
    activeZone ? `${activeZone.lat.toFixed(3)},${activeZone.lng.toFixed(3)}` : null
  );

  // Sync map when global top-bar city selector or world search updates activeZone
  useEffect(() => {
    if (!activeZone) return;
    const key = `${activeZone.lat.toFixed(3)},${activeZone.lng.toFixed(3)}`;
    if (lastGlobalZoneRef.current === key) return;
    lastGlobalZoneRef.current = key;

    const fullLabel = [activeZone.name, activeZone.district, activeZone.state]
      .filter(Boolean)
      .join(', ');
    setSearchQuery(fullLabel);
    setSearchedLocation({
      lat: activeZone.lat,
      lng: activeZone.lng,
      name: activeZone.name,
      address: fullLabel,
    });
    flyCounterRef.current += 1;
    setFlyRequest({
      id: flyCounterRef.current,
      lat: activeZone.lat,
      lng: activeZone.lng,
      zoom: 13,
    });
  }, [activeZone]);

  // Keep userGps synced if context liveGps updates
  useEffect(() => {
    if (liveGps) setUserGps(liveGps);
  }, [liveGps]);

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Debounced Nominatim Autocomplete
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!showSuggestions || trimmed.length < 2) {
      if (trimmed.length < 2) setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingPlaces(true);
      try {
        const res = await fetch(
          `/api/map/autocomplete?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') setSuggestions([]);
      } finally {
        setSearchingPlaces(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, showSuggestions]);

  // Fetch viewport POIs whenever viewport bounds or category change
  const loadPois = useCallback(
    async (bounds: MapViewportBounds, category: PoiCategory) => {
      if (poiAbortRef.current) poiAbortRef.current.abort();
      const controller = new AbortController();
      poiAbortRef.current = controller;

      setLoadingPois(true);
      setPoiError(null);
      try {
        const params = new URLSearchParams({
          south: String(bounds.south),
          west: String(bounds.west),
          north: String(bounds.north),
          east: String(bounds.east),
          category,
        });
        const res = await fetch(`/api/map/pois?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setPoiError(err?.error || 'Unable to load nearby OpenStreetMap places.');
          return;
        }
        const data = await res.json();
        setPois(Array.isArray(data.pois) ? data.pois : []);
        if (data.source) setPoiSource(data.source);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setPoiError('Network error loading OpenStreetMap places.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPois(false);
        }
      }
    },
    []
  );

  // Fetch spatial flood, rainfall & GloFAS river overlay for current center/bounds
  const loadFloodOverlay = useCallback(
    async (centerLat: number, centerLng: number, label: string, bounds?: MapViewportBounds | null) => {
      if (floodAbortRef.current) floodAbortRef.current.abort();
      const controller = new AbortController();
      floodAbortRef.current = controller;

      setLoadingFlood(true);
      setFloodError(null);
      try {
        const params = new URLSearchParams({
          lat: String(centerLat),
          lng: String(centerLng),
          label,
        });
        if (bounds) {
          params.set('south', String(bounds.south));
          params.set('west', String(bounds.west));
          params.set('north', String(bounds.north));
          params.set('east', String(bounds.east));
        }
        const res = await fetch(`/api/map/flood-overlay?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setFloodError('Live flood/weather overlay temporarily unavailable.');
          return;
        }
        const data = await res.json();
        if (Array.isArray(data.samples)) {
          setFloodSamples(data.samples);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setFloodError('Network error fetching Open-Meteo / GloFAS overlay.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingFlood(false);
        }
      }
    },
    []
  );

  // Handle viewport changes from Leaflet
  const handleBoundsChange = useCallback(
    (bounds: MapViewportBounds) => {
      setViewportBounds(bounds);
      void loadPois(bounds, activeCategory);
    },
    [activeCategory, loadPois]
  );

  // Re-fetch POIs when category changes
  useEffect(() => {
    if (viewportBounds) {
      void loadPois(viewportBounds, activeCategory);
    }
  }, [activeCategory, loadPois, viewportBounds]);

  // Initial flood overlay load for searchedLocation & when monitoring layer switches
  useEffect(() => {
    void loadFloodOverlay(
      searchedLocation.lat,
      searchedLocation.lng,
      searchedLocation.name,
      viewportBounds
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedLocation.lat, searchedLocation.lng, searchedLocation.name]);

  const handleSelectSuggestion = (s: NominatimSearchSuggestion) => {
    setShowSuggestions(false);
    setSearchQuery(s.displayName);
    setSearchedLocation({
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      address: s.displayName,
    });
    setSelectedEntity({
      kind: 'searched',
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      address: s.displayName,
    });
    setPanelTab('details');
    setShowSidePanel(true);

    flyCounterRef.current += 1;
    setFlyRequest({
      id: flyCounterRef.current,
      lat: s.lat,
      lng: s.lng,
      zoom: 14,
      boundingBox: s.boundingBox,
    });
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    if (suggestions.length > 0 && showSuggestions) {
      handleSelectSuggestion(suggestions[0]);
      return;
    }
    setSearchingPlaces(true);
    try {
      const res = await fetch(`/api/map/autocomplete?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        const list: NominatimSearchSuggestion[] = Array.isArray(data.suggestions)
          ? data.suggestions
          : [];
        if (list.length > 0) {
          handleSelectSuggestion(list[0]);
        } else {
          setPoiError(`No OpenStreetMap location matched "${trimmed}".`);
        }
      }
    } finally {
      setSearchingPlaces(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedEntity(null);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported in this browser.');
      return;
    }
    setLocatingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setUserGps({ lat, lng });
        setSearchedLocation({
          lat,
          lng,
          name: 'My Current Location',
          address: `GPS Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        });
        setSearchQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setSelectedEntity({
          kind: 'searched',
          lat,
          lng,
          name: 'My Current Location',
          address: `Live Browser GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
        setPanelTab('details');
        flyCounterRef.current += 1;
        setFlyRequest({
          id: flyCounterRef.current,
          lat,
          lng,
          zoom: 15,
        });
        setLocatingGps(false);
      },
      (err) => {
        setGpsError(err.message || 'Location permission was denied or timed out.');
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleReportWaterlogging = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    setReporting(true);
    setReportBanner(null);
    try {
      const targetLat = userGps ? userGps.lat : searchedLocation.lat;
      const targetLng = userGps ? userGps.lng : searchedLocation.lng;
      const res = await fetch('/api/map/waterlogging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: reportText.trim(),
          locality: searchedLocation.name,
          lat: targetLat,
          lng: targetLng,
          severity: reportSeverity,
        }),
      });
      if (res.ok) {
        setReportText('');
        setReportBanner('Waterlogging hazard pinned on map & broadcast to rescue teams.');
        setActiveLayer('emergency');
        await refreshDashboard();
      }
    } finally {
      setReporting(false);
    }
  };

  // Nearby POIs sorted by distance from searchedLocation
  const sortedPois = useMemo(() => {
    return [...pois]
      .filter((p) => activeCategory === 'all' || p.category === activeCategory)
      .map((p) => ({
        poi: p,
        distanceM: haversineMeters(searchedLocation.lat, searchedLocation.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [pois, activeCategory, searchedLocation.lat, searchedLocation.lng]);

  // Resolve nearest spatial flood sample for whatever entity is currently inspected
  const inspectedCoords = useMemo(() => {
    if (!selectedEntity) return { lat: searchedLocation.lat, lng: searchedLocation.lng };
    if (selectedEntity.kind === 'searched') {
      return { lat: selectedEntity.lat, lng: selectedEntity.lng };
    }
    return { lat: selectedEntity.item.lat, lng: selectedEntity.item.lng };
  }, [selectedEntity, searchedLocation.lat, searchedLocation.lng]);

  const nearestFloodSample = useMemo(() => {
    if (selectedEntity?.kind === 'flood') return selectedEntity.item;
    if (floodSamples.length === 0) return null;
    let best = floodSamples[0];
    let bestDist = haversineMeters(inspectedCoords.lat, inspectedCoords.lng, best.lat, best.lng);
    for (const s of floodSamples.slice(1)) {
      const d = haversineMeters(inspectedCoords.lat, inspectedCoords.lng, s.lat, s.lng);
      if (d < bestDist) {
        best = s;
        bestDist = d;
      }
    }
    return best;
  }, [selectedEntity, floodSamples, inspectedCoords.lat, inspectedCoords.lng]);

  // Nearest emergency services around the inspected coordinates
  const nearbyEmergencyServices = useMemo(() => {
    const osmEmergency = pois
      .filter((p) => p.category === 'hospitals' || p.category === 'emergency')
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.subType,
        lat: p.lat,
        lng: p.lng,
        distanceM: haversineMeters(inspectedCoords.lat, inspectedCoords.lng, p.lat, p.lng),
      }));

    const platformEmergency = facilities
      .filter((f) => f.type !== 'waterlogging')
      .map((f) => ({
        id: f.id,
        name: f.name,
        kind:
          f.type === 'shelter'
            ? 'Safe Shelter'
            : f.type === 'hospital'
            ? 'Hospital'
            : f.type === 'rescue_station'
            ? 'Rescue Station'
            : 'Relief Centre',
        lat: f.lat,
        lng: f.lng,
        distanceM: haversineMeters(inspectedCoords.lat, inspectedCoords.lng, f.lat, f.lng),
      }));

    return [...osmEmergency, ...platformEmergency]
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 4);
  }, [pois, facilities, inspectedCoords.lat, inspectedCoords.lng]);

  const selectedItemId = useMemo(() => {
    if (!selectedEntity || selectedEntity.kind === 'searched') return null;
    return selectedEntity.item.id;
  }, [selectedEntity]);

  const handleFocusPoi = (poi: MapPoiItem) => {
    setSelectedEntity({ kind: 'poi', item: poi });
    setPanelTab('details');
    setShowSidePanel(true);
    flyCounterRef.current += 1;
    setFlyRequest({
      id: flyCounterRef.current,
      lat: poi.lat,
      lng: poi.lng,
      zoom: 16,
    });
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-50 p-3 sm:p-4 flex flex-col gap-3 overflow-hidden'
          : 'space-y-4'
      }
    >
      {/* Top Search Bar, Controls & Category Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Google Maps-style Autocomplete Search Box */}
          <div ref={searchBoxRef} className="relative flex-1 min-w-[260px]">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="Search city, area, street, hospital, school, shop, landmark..."
                aria-label="Search map location"
                className="w-full pl-9 pr-20 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              {searchingPlaces && (
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin absolute right-14" />
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  title="Clear search"
                  aria-label="Clear search"
                  className="absolute right-9 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                title="Search location"
                className="absolute right-1.5 px-2.5 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
              >
                Go
              </button>
            </form>

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[1100] max-h-72 overflow-y-auto divide-y divide-slate-100">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(s)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 transition-colors flex items-start gap-2.5"
                  >
                    <MapPin className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1">{s.displayName}</div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase shrink-0">
                      {s.type.replace(/_/g, ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={locatingGps}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {locatingGps ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LocateFixed className="w-3.5 h-3.5" />
              )}
              My Current Location
            </button>

            <button
              type="button"
              onClick={() => setShowSidePanel((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                showSidePanel
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Nearby Places ({sortedPois.length})
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  Exit Full Screen
                </>
              ) : (
                <>
                  <Expand className="w-3.5 h-3.5" />
                  Full Screen
                </>
              )}
            </button>
          </div>
        </div>

        {/* Category Filter Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_TABS.map((cat) => {
              const Icon = cat.icon;
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-700 border-blue-700 text-white shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Active Layer Selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 mr-1">
              <Layers className="w-3.5 h-3.5" />
              Layer:
            </span>
            {LAYER_OPTIONS.map((layer) => {
              const Icon = layer.icon;
              const active = activeLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  title={layer.shortDesc}
                  onClick={() => setActiveLayer(layer.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {layer.label}
                </button>
              );
            })}
          </div>
        </div>

        {(gpsError || poiError || floodError) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
            <span>{gpsError || poiError || floodError}</span>
          </div>
        )}
      </div>

      {/* Map Canvas + Contextual Side Panel */}
      <div
        className={`grid grid-cols-1 ${
          showSidePanel ? 'xl:grid-cols-12' : ''
        } gap-4 items-stretch ${isFullscreen ? 'flex-1 min-h-0' : ''}`}
      >
        {/* Interactive OpenStreetMap Container */}
        <div
          className={`${
            showSidePanel ? 'xl:col-span-8' : 'col-span-1'
          } relative bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden ${
            isFullscreen ? 'h-full min-h-[420px]' : 'h-[600px] min-h-[540px]'
          }`}
        >
          <LiveFloodLeafletMap
            initialCenter={initialCenter}
            searchedLocation={searchedLocation}
            userGps={userGps}
            pois={pois}
            floodSamples={floodSamples}
            facilities={facilities}
            rescueTeams={rescueTeams}
            incidents={incidents}
            activeCategory={activeCategory}
            activeLayer={activeLayer}
            selectedItemId={selectedItemId}
            flyRequest={flyRequest}
            zoomCommand={zoomCommand}
            onBoundsChange={handleBoundsChange}
            onSelectPoi={(poi) => {
              setSelectedEntity({ kind: 'poi', item: poi });
              setPanelTab('details');
              setShowSidePanel(true);
            }}
            onSelectFloodSample={(sample) => {
              setSelectedEntity({ kind: 'flood', item: sample });
              setPanelTab('details');
              setShowSidePanel(true);
            }}
            onSelectFacility={(facility) => {
              setSelectedEntity({ kind: 'facility', item: facility });
              setPanelTab('details');
              setShowSidePanel(true);
            }}
            onSelectIncident={(incident) => {
              setSelectedEntity({ kind: 'incident', item: incident });
              setPanelTab('details');
              setShowSidePanel(true);
            }}
            onSelectTeam={(team) => {
              setSelectedEntity({ kind: 'team', item: team });
              setPanelTab('details');
              setShowSidePanel(true);
            }}
          />

          {/* Top-Left Live Status Bar */}
          <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-2 pointer-events-none">
            <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm text-xs flex items-center gap-2 pointer-events-auto">
              <span className="font-bold text-slate-900">{searchedLocation.name}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{poiSource}</span>
              {(loadingPois || loadingFlood) && (
                <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin ml-1" />
              )}
            </div>

            {nearestFloodSample && (
              <div
                className={`border rounded-lg px-2.5 py-1.5 shadow-sm text-xs font-semibold pointer-events-auto ${getRiskColorClass(
                  nearestFloodSample.riskLevel
                )}`}
              >
                Flood Risk:{' '}
                {nearestFloodSample.riskScore !== null
                  ? `${nearestFloodSample.riskLevel} (${nearestFloodSample.riskScore}/100)`
                  : 'DATA UNAVAILABLE'}
              </div>
            )}
          </div>

          {/* Bottom-Right Zoom & Re-Center Controls */}
          <div className="absolute bottom-8 right-3 z-[1000] flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                zoomCounterRef.current += 1;
                setZoomCommand({ id: zoomCounterRef.current, delta: 1 });
              }}
              title="Zoom in"
              aria-label="Zoom in"
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                zoomCounterRef.current += 1;
                setZoomCommand({ id: zoomCounterRef.current, delta: -1 });
              }}
              title="Zoom out"
              aria-label="Zoom out"
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 hover:bg-slate-50"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleLocateMe}
              title="My Current Location"
              aria-label="My Current Location"
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-blue-700 hover:bg-blue-50"
            >
              <LocateFixed className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Map'}
              aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen Map'}
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 hover:bg-slate-50"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Expand className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Bottom-Left Map Legend */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-[11px] max-w-[340px]">
            {activeLayer === 'flood_risk' && (
              <div className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                  High Risk
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600" />
                  Medium Risk
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  Low Risk / Safe
                </span>
              </div>
            )}
            {activeLayer === 'rainfall' && (
              <div className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-700" />
                  Heavy Rain (&ge;10mm/h)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  Light / Moderate
                </span>
              </div>
            )}
            {activeLayer === 'river' && (
              <div className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
                  Normal Flow
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                  Elevated Discharge
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                  High Discharge
                </span>
              </div>
            )}
            {(activeLayer === 'standard' || activeLayer === 'emergency') && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-slate-700">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />H Hospital
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />S School
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />E Police/Fire
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />T Transit
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />SH Shelter
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Panel: Details, Nearby Places, Emergency & Hazard Reporting */}
        {showSidePanel && (
          <div
            className={`xl:col-span-4 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden ${
              isFullscreen ? 'h-full min-h-[300px]' : 'h-[600px]'
            }`}
          >
            {/* Panel Tab Strip */}
            <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setPanelTab('details')}
                className={`py-2.5 px-2 border-b-2 transition-colors ${
                  panelTab === 'details'
                    ? 'border-blue-700 text-blue-800 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Location Details
              </button>
              <button
                type="button"
                onClick={() => setPanelTab('nearby')}
                className={`py-2.5 px-2 border-b-2 transition-colors ${
                  panelTab === 'nearby'
                    ? 'border-blue-700 text-blue-800 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Nearby ({sortedPois.length})
              </button>
              <button
                type="button"
                onClick={() => setPanelTab('emergency')}
                className={`py-2.5 px-2 border-b-2 transition-colors ${
                  panelTab === 'emergency'
                    ? 'border-blue-700 text-blue-800 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Hazards &amp; DRF
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {panelTab === 'details' && (
                <>
                  {!selectedEntity ? (
                    <div className="space-y-3 text-sm text-slate-600">
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="font-bold text-slate-900">{searchedLocation.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {searchedLocation.address}
                        </div>
                        <div className="text-xs text-slate-500 font-mono-tabular mt-1.5">
                          {searchedLocation.lat.toFixed(4)}, {searchedLocation.lng.toFixed(4)}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        Click any marker on the map or choose a place from the Nearby tab to inspect
                        its full address, distance, live flood risk, and nearest emergency services.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Header card */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-blue-700">
                              {selectedEntity.kind === 'poi'
                                ? selectedEntity.item.subType
                                : selectedEntity.kind === 'flood'
                                ? 'Flood & Hydrological Zone'
                                : selectedEntity.kind === 'facility'
                                ? selectedEntity.item.type.replace(/_/g, ' ')
                                : selectedEntity.kind === 'incident'
                                ? `SOS Incident · ${selectedEntity.item.aiClassification}`
                                : selectedEntity.kind === 'team'
                                ? `Rescue Unit · ${selectedEntity.item.status}`
                                : 'Searched Location'}
                            </div>
                            <h3 className="text-base font-bold text-slate-900 mt-0.5">
                              {selectedEntity.kind === 'searched'
                                ? selectedEntity.name
                                : selectedEntity.kind === 'flood'
                                ? selectedEntity.item.label
                                : selectedEntity.kind === 'incident'
                                ? `${selectedEntity.item.locality} Emergency`
                                : selectedEntity.item.name}
                            </h3>
                          </div>
                          {selectedEntity.kind !== 'searched' && (
                            <span className="text-xs font-mono-tabular font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded-md shrink-0">
                              {formatDistance(
                                haversineMeters(
                                  searchedLocation.lat,
                                  searchedLocation.lng,
                                  selectedEntity.item.lat,
                                  selectedEntity.item.lng
                                )
                              )}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {selectedEntity.kind === 'poi'
                            ? selectedEntity.item.address
                            : selectedEntity.kind === 'searched'
                            ? selectedEntity.address
                            : selectedEntity.kind === 'facility'
                            ? `${selectedEntity.item.locality}${
                                selectedEntity.item.contact
                                  ? ` · Helpline: ${selectedEntity.item.contact}`
                                  : ''
                              }`
                            : selectedEntity.kind === 'incident'
                            ? selectedEntity.item.aiReasoning
                            : selectedEntity.kind === 'team'
                            ? `${selectedEntity.item.locality} · ${selectedEntity.item.personnelCount} personnel · ${selectedEntity.item.equipment}`
                            : `Coordinates: ${selectedEntity.item.lat.toFixed(4)}, ${selectedEntity.item.lng.toFixed(4)}`}
                        </p>

                        <div className="text-[11px] font-mono-tabular text-slate-500 flex items-center justify-between pt-1 border-t border-slate-200/80">
                          <span>
                            {inspectedCoords.lat.toFixed(4)}, {inspectedCoords.lng.toFixed(4)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              flyCounterRef.current += 1;
                              setFlyRequest({
                                id: flyCounterRef.current,
                                lat: inspectedCoords.lat,
                                lng: inspectedCoords.lng,
                                zoom: 16,
                              });
                            }}
                            className="inline-flex items-center gap-1 text-blue-700 font-semibold hover:underline"
                          >
                            <Navigation className="w-3 h-3" />
                            Center Map
                          </button>
                        </div>
                      </div>

                      {/* Available Flood Risk Information */}
                      <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <Waves className="w-4 h-4 text-blue-700" />
                            Available Flood &amp; Weather Info
                          </span>
                          {loadingFlood && (
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                          )}
                        </div>

                        {nearestFloodSample ? (
                          <div className="space-y-2 text-xs">
                            <div
                              className={`px-2.5 py-2 rounded-lg border font-semibold flex items-center justify-between ${getRiskColorClass(
                                nearestFloodSample.riskLevel
                              )}`}
                            >
                              <span>Risk Level: {nearestFloodSample.riskLevel}</span>
                              <span className="font-mono-tabular">
                                {nearestFloodSample.riskScore !== null
                                  ? `${nearestFloodSample.riskScore}/100`
                                  : 'DATA UNAVAILABLE'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 font-mono-tabular">
                              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-500">Current Rain</div>
                                <div className="font-bold text-slate-900">
                                  {nearestFloodSample.rainfallMm !== null
                                    ? `${nearestFloodSample.rainfallMm.toFixed(1)} mm`
                                    : 'UNAVAILABLE'}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-500">24h Forecast</div>
                                <div className="font-bold text-slate-900">
                                  {nearestFloodSample.forecast24hMm !== null
                                    ? `${nearestFloodSample.forecast24hMm.toFixed(1)} mm`
                                    : 'UNAVAILABLE'}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-500">Rain Prob.</div>
                                <div className="font-bold text-slate-900">
                                  {nearestFloodSample.precipProbabilityPct !== null
                                    ? `${nearestFloodSample.precipProbabilityPct}%`
                                    : 'UNAVAILABLE'}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                <div className="text-[10px] text-slate-500">
                                  River (GloFAS)
                                </div>
                                <div className="font-bold text-slate-900">
                                  {nearestFloodSample.riverDischargeM3s !== null
                                    ? `${nearestFloodSample.riverDischargeM3s.toFixed(1)} m³/s`
                                    : 'UNAVAILABLE'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">DATA UNAVAILABLE</div>
                        )}
                      </div>

                      {/* Nearby Emergency Services */}
                      <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-700" />
                          Nearest Emergency Services
                        </div>
                        {nearbyEmergencyServices.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            Pan or switch to All Places / Hospitals / Emergency Services to discover
                            nearby responders.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 text-xs">
                            {nearbyEmergencyServices.map((svc) => (
                              <button
                                key={svc.id}
                                type="button"
                                onClick={() => {
                                  flyCounterRef.current += 1;
                                  setFlyRequest({
                                    id: flyCounterRef.current,
                                    lat: svc.lat,
                                    lng: svc.lng,
                                    zoom: 16,
                                  });
                                }}
                                className="w-full text-left py-2 flex items-center justify-between gap-2 hover:bg-slate-50 rounded px-1"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {svc.name}
                                  </div>
                                  <div className="text-[11px] text-slate-500">{svc.kind}</div>
                                </div>
                                <span className="font-mono-tabular text-blue-700 font-semibold shrink-0">
                                  {formatDistance(svc.distanceM)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {panelTab === 'nearby' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Sorted by distance from{' '}
                      <strong className="text-slate-800">{searchedLocation.name}</strong>
                    </span>
                    {loadingPois && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                  </div>

                  {sortedPois.length === 0 && !loadingPois ? (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                      No places found in this category within the current map view. Try zooming out,
                      panning, or selecting <strong>All Places</strong>.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sortedPois.map(({ poi, distanceM }) => {
                        const isSelected = selectedItemId === poi.id;
                        return (
                          <button
                            key={poi.id}
                            type="button"
                            onClick={() => handleFocusPoi(poi)}
                            className={`w-full text-left py-2.5 px-2 rounded-lg transition-colors flex items-start justify-between gap-2 ${
                              isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900 truncate">
                                {poi.name}
                              </div>
                              <div className="text-[11px] text-blue-700 font-medium mt-0.5">
                                {poi.subType}
                              </div>
                              <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {poi.address}
                              </div>
                            </div>
                            <span className="text-[11px] font-mono-tabular font-semibold text-slate-700 shrink-0 mt-0.5">
                              {formatDistance(distanceM)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {panelTab === 'emergency' && (
                <div className="space-y-4">
                  {/* Report Waterlogging Form */}
                  <form
                    onSubmit={handleReportWaterlogging}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                      <Droplets className="w-4 h-4 text-blue-700" />
                      Report Waterlogging on Road
                    </div>
                    <input
                      type="text"
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      placeholder={`e.g. ${searchedLocation.name} main road knee-deep water`}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={reportSeverity}
                        onChange={(e) => setReportSeverity(e.target.value as RiskLevel)}
                        className="px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="MODERATE">Moderate Waterlogging</option>
                        <option value="HIGH">High Road Flood</option>
                        <option value="CRITICAL">Road Impassable</option>
                      </select>
                      <button
                        type="submit"
                        disabled={reporting || !reportText.trim()}
                        className="flex-1 py-2 px-3 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
                      >
                        {reporting ? 'Pinning...' : 'Pin Hazard'}
                      </button>
                    </div>
                    {reportBanner && (
                      <p className="text-xs text-emerald-700 font-medium">{reportBanner}</p>
                    )}
                  </form>

                  {/* Rescue Units & Shelters Directory */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-slate-700" />
                      {t('shelters')}, DRF &amp; Reported Hazards (
                      {rescueTeams.length + facilities.length})
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      {rescueTeams.map((team) => (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => {
                            setActiveLayer('emergency');
                            setSelectedEntity({ kind: 'team', item: team });
                            setPanelTab('details');
                            flyCounterRef.current += 1;
                            setFlyRequest({
                              id: flyCounterRef.current,
                              lat: team.lat,
                              lng: team.lng,
                              zoom: 15,
                            });
                          }}
                          className="w-full text-left py-2.5 px-1 hover:bg-slate-50 rounded"
                        >
                          <div className="flex items-center justify-between font-semibold text-blue-800">
                            <span className="flex items-center gap-1.5">
                              <Siren className="w-3.5 h-3.5" />
                              {team.name}
                            </span>
                            <span className="font-mono-tabular">{team.status}</span>
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            {team.locality} · {team.personnelCount} personnel · {team.equipment}
                          </div>
                        </button>
                      ))}

                      {facilities.map((fac) => (
                        <button
                          key={fac.id}
                          type="button"
                          onClick={() => {
                            setActiveLayer('emergency');
                            setSelectedEntity({ kind: 'facility', item: fac });
                            setPanelTab('details');
                            flyCounterRef.current += 1;
                            setFlyRequest({
                              id: flyCounterRef.current,
                              lat: fac.lat,
                              lng: fac.lng,
                              zoom: 15,
                            });
                          }}
                          className="w-full text-left py-2.5 px-1 hover:bg-slate-50 rounded"
                        >
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {fac.type === 'shelter' || fac.type === 'relief_centre' ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}
                            {fac.name}
                          </div>
                          <div className="text-slate-500 mt-0.5 flex flex-wrap items-center gap-2 font-mono-tabular">
                            <span>{fac.locality}</span>
                            {fac.availableBeds !== undefined && (
                              <span>· {fac.availableBeds} beds open</span>
                            )}
                            {fac.contact && (
                              <span className="inline-flex items-center gap-1">
                                · <Phone className="w-3 h-3" /> {fac.contact}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
