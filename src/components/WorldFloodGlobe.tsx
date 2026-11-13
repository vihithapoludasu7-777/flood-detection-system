import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import { Globe, Loader2, MapPin, RotateCw, Search } from 'lucide-react';
import type { LocationZone, RiskLevel, WorldCityPin } from '../types.ts';

interface WorldSearchResult {
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
}

interface WorldFloodGlobeProps {
  cities: WorldCityPin[];
  activeZone: LocationZone | null;
  loadingLocation: boolean;
  onSelectGlobalPlace: (place: WorldSearchResult) => Promise<void>;
}

const PIN_COLOR: Record<RiskLevel, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#D97706',
  MODERATE: '#D97706',
  LOW: '#16A34A',
  UNAVAILABLE: '#64748B',
};

export const WorldFloodGlobe: React.FC<WorldFloodGlobeProps> = ({
  cities,
  activeZone,
  loadingLocation,
  onSelectGlobalPlace,
}) => {
  const [rotation, setRotation] = useState<[number, number, number]>([-78.4, -17.5, 0]);
  const [autoRotate, setAutoRotate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; rot: [number, number, number]; moved: boolean }>({
    x: 0,
    y: 0,
    rot: [-78.4, -17.5, 0],
    moved: false,
  });

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorldSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Build world land polygons once from world-atlas TopoJSON
  const worldGeo = useMemo(() => {
    const topo = worldAtlas as unknown as Parameters<typeof feature>[0] & {
      objects: { countries: Parameters<typeof feature>[1] };
    };
    return feature(topo, topo.objects.countries);
  }, []);

  // Center globe smoothly whenever activeZone changes
  useEffect(() => {
    if (!activeZone) return;
    setRotation([-activeZone.lng, -Math.max(-65, Math.min(65, activeZone.lat)), 0]);
  }, [activeZone?.lat, activeZone?.lng]);

  // Optional gentle spin
  useEffect(() => {
    if (!autoRotate || dragging) return;
    const timer = setInterval(() => {
      setRotation(([lon, lat, roll]) => [(lon + 0.45) % 360, lat, roll]);
    }, 50);
    return () => clearInterval(timer);
  }, [autoRotate, dragging]);

  // Debounced global search via Open-Meteo Geocoding backend
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/world/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setDropdownOpen(true);
        }
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const width = 460;
  const height = 400;
  const scale = 178;

  const projection = useMemo(
    () =>
      geoOrthographic()
        .scale(scale)
        .translate([width / 2, height / 2])
        .clipAngle(90)
        .rotate(rotation),
    [rotation]
  );

  const pathGen = useMemo(() => geoPath(projection), [projection]);
  const graticulePath = useMemo(() => pathGen(geoGraticule10()) || '', [pathGen]);
  const landPath = useMemo(() => pathGen(worldGeo as never) || '', [pathGen, worldGeo]);

  // Helper to check if a point is on the visible front hemisphere of the globe
  const isVisible = (lat: number, lng: number) => {
    const centerLon = -rotation[0];
    const centerLat = -rotation[1];
    const toRad = Math.PI / 180;
    const cosDist =
      Math.sin(centerLat * toRad) * Math.sin(lat * toRad) +
      Math.cos(centerLat * toRad) *
        Math.cos(lat * toRad) *
        Math.cos((lng - centerLon) * toRad);
    return cosDist > 0.05;
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current.moved) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    const coords = projection.invert?.([x, y]);
    if (!coords) return;
    const [lng, lat] = coords;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    void onSelectGlobalPlace({
      name: `Location (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`,
      country: 'Global Selection',
      region: 'Globe Coordinate Pin',
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
    });
  };

  const handleChooseResult = (r: WorldSearchResult) => {
    setQuery(`${r.name}, ${r.country}`);
    setDropdownOpen(false);
    setAutoRotate(false);
    void onSelectGlobalPlace(r);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between h-full">
      {/* Header & Global Location Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-700" />
              Global Flood Risk Globe
            </h3>
            <p className="text-xs text-slate-500">
              Drag to spin · Click any city pin or anywhere on Earth · Search any location worldwide
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 ${
              autoRotate
                ? 'bg-blue-700 border-blue-700 text-white'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <RotateCw className={`w-3 h-3 ${autoRotate ? 'animate-spin' : ''}`} />
            {autoRotate ? 'Spinning' : 'Spin'}
          </button>
        </div>

        {/* Worldwide Location Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setDropdownOpen(true);
            }}
            placeholder="Search any city or town worldwide (e.g. Tokyo, Miami, Dhaka, London)..."
            className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-[#F8FBFF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {(searching || loadingLocation) && (
            <Loader2 className="w-4 h-4 text-blue-700 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}

          {dropdownOpen && results.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
              {results.map((r, idx) => (
                <button
                  key={`${r.name}-${r.lat}-${idx}`}
                  type="button"
                  onClick={() => handleChooseResult(r)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{r.name}</div>
                    <div className="text-slate-500">
                      {r.region ? `${r.region}, ` : ''}
                      {r.country}
                    </div>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-slate-400">
                    {r.lat.toFixed(2)}, {r.lng.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3D Orthographic SVG Globe */}
      <div className="relative my-2 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-h-[340px] cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => {
            setDragging(true);
            setAutoRotate(false);
            dragRef.current = {
              x: e.clientX,
              y: e.clientY,
              rot: rotation,
              moved: false,
            };
          }}
          onMouseMove={(e) => {
            if (!dragging) return;
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
            setRotation([
              dragRef.current.rot[0] + dx * 0.38,
              Math.max(-75, Math.min(75, dragRef.current.rot[1] - dy * 0.38)),
              0,
            ]);
          }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onClick={handleSvgClick}
        >
          <defs>
            <radialGradient id="oceanGrad" cx="38%" cy="35%" r="68%">
              <stop offset="0%" stopColor="#EFF6FF" />
              <stop offset="65%" stopColor="#DBEAFE" />
              <stop offset="100%" stopColor="#BFDBFE" />
            </radialGradient>
          </defs>

          {/* Globe Ocean Sphere */}
          <circle
            cx={width / 2}
            cy={height / 2}
            r={scale}
            fill="url(#oceanGrad)"
            stroke="#93C5FD"
            strokeWidth="1.5"
          />

          {/* Graticules */}
          <path d={graticulePath} fill="none" stroke="#93C5FD" strokeWidth="0.5" opacity="0.55" />

          {/* Continents & Countries */}
          <path d={landPath} fill="#FFFFFF" stroke="#64748B" strokeWidth="0.7" />

          {/* Monitored Global City Pins */}
          {cities.map((city) => {
            if (!isVisible(city.lat, city.lng)) return null;
            const pt = projection([city.lng, city.lat]);
            if (!pt) return null;
            const isActive =
              activeZone &&
              Math.abs(activeZone.lat - city.lat) < 0.25 &&
              Math.abs(activeZone.lng - city.lng) < 0.25;

            return (
              <g
                key={city.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setAutoRotate(false);
                  void onSelectGlobalPlace({
                    name: city.name,
                    country: city.country,
                    region: city.region,
                    lat: city.lat,
                    lng: city.lng,
                  });
                }}
              >
                <circle
                  cx={pt[0]}
                  cy={pt[1]}
                  r={isActive ? 9 : 5.5}
                  fill={PIN_COLOR[city.riskLevel]}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                {isActive && (
                  <circle
                    cx={pt[0]}
                    cy={pt[1]}
                    r={14}
                    fill="none"
                    stroke={PIN_COLOR[city.riskLevel]}
                    strokeWidth="1.5"
                    opacity="0.7"
                  />
                )}
                <title>{`${city.name}, ${city.country} — Risk Score ${city.riskScore !== null ? `${city.riskScore}/100` : 'Click to inspect live score'}`}</title>
              </g>
            );
          })}

          {/* Custom Selected Location Pin (if searched outside preset cities) */}
          {activeZone &&
            isVisible(activeZone.lat, activeZone.lng) &&
            (() => {
              const pt = projection([activeZone.lng, activeZone.lat]);
              if (!pt) return null;
              return (
                <g pointerEvents="none">
                  <circle
                    cx={pt[0]}
                    cy={pt[1]}
                    r={8}
                    fill={PIN_COLOR[activeZone.riskLevel] || '#64748B'}
                    stroke="#0F172A"
                    strokeWidth="2"
                  />
                  <rect
                    x={pt[0] - 58}
                    y={pt[1] - 28}
                    width="116"
                    height="18"
                    rx="4"
                    fill="#0B1F3A"
                  />
                  <text
                    x={pt[0]}
                    y={pt[1] - 16}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {activeZone.name.slice(0, 13)} ({activeZone.riskScore ?? 'N/A'})
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      {/* Quick Global City Chips & Legend */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-500 font-medium mr-1">Quick Jump:</span>
          {cities.slice(0, 6).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setAutoRotate(false);
                void onSelectGlobalPlace({
                  name: c.name,
                  country: c.country,
                  region: c.region,
                  lat: c.lat,
                  lng: c.lng,
                });
              }}
              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-800 font-medium transition-colors"
            >
              <MapPin className="w-3 h-3 inline mr-0.5 text-blue-700" />
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1" /> High / Critical
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" /> Medium
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 mr-1" /> Low
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-slate-500 mr-1" /> Unchecked
            </span>
          </div>
          <span>
            {activeZone?.dataSource === 'live_api'
              ? 'Live Open-Meteo Weather & GloFAS Hydrology'
              : activeZone?.dataSource === 'partial_live_api'
              ? 'Live Open-Meteo Weather · GloFAS Unmapped'
              : 'Upstream Weather Feed Unavailable'}
          </span>
        </div>
      </div>
    </div>
  );
};
