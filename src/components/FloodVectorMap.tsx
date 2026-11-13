import React, { useMemo, useState } from 'react';
import {
  Compass,
  Hospital,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route,
  ShieldCheck,
  Siren,
  Waves,
} from 'lucide-react';
import type { LocationZone, MapFacility, RescueTeam, RiskLevel, SOSIncident } from '../types.ts';

interface FloodVectorMapProps {
  locations: LocationZone[];
  facilities: MapFacility[];
  rescueTeams: RescueTeam[];
  incidents: SOSIncident[];
  activeZone: LocationZone | null;
  liveGps: { lat: number; lng: number } | null;
  registeredLocation?: { lat: number; lng: number; label: string } | null;
  compact?: boolean;
  onSelectZone?: (zoneName: string) => void;
  showSafeRouteExternal?: boolean;
}

const HYDERABAD_BOUNDS = {
  minLat: 17.32,
  maxLat: 17.53,
  minLng: 78.32,
  maxLng: 78.58,
};

function isInsideHyderabad(lat: number, lng: number): boolean {
  return lat >= 17.25 && lat <= 17.6 && lng >= 78.25 && lng <= 78.65;
}

const RISK_COLORS: Record<RiskLevel, { fill: string; stroke: string; label: string }> = {
  CRITICAL: { fill: 'rgba(220, 38, 38, 0.24)', stroke: '#DC2626', label: 'Critical' },
  HIGH: { fill: 'rgba(234, 88, 12, 0.22)', stroke: '#EA580C', label: 'High' },
  MEDIUM: { fill: 'rgba(217, 119, 6, 0.20)', stroke: '#D97706', label: 'Medium Risk' },
  MODERATE: { fill: 'rgba(217, 119, 6, 0.20)', stroke: '#D97706', label: 'Medium Risk' },
  LOW: { fill: 'rgba(22, 163, 74, 0.16)', stroke: '#16A34A', label: 'Low Risk' },
  UNAVAILABLE: { fill: 'rgba(100, 116, 139, 0.18)', stroke: '#64748B', label: 'Data Unavailable' },
};

export const FloodVectorMap: React.FC<FloodVectorMapProps> = ({
  locations,
  facilities,
  rescueTeams,
  incidents,
  activeZone,
  liveGps,
  registeredLocation,
  compact = false,
  onSelectZone,
  showSafeRouteExternal = false,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState<{
    title: string;
    subtitle: string;
    detail: string;
    badge: string;
  } | null>(null);
  const [safeRouteActive, setSafeRouteActive] = useState(showSafeRouteExternal);
  const [visibleLayers, setVisibleLayers] = useState({
    zones: true,
    shelters: true,
    hospitals: true,
    rescue: true,
    waterlogging: true,
  });

  const inHyderabad = activeZone
    ? isInsideHyderabad(activeZone.lat, activeZone.lng)
    : true;

  const bounds = useMemo(() => {
    if (!activeZone || inHyderabad) {
      return HYDERABAD_BOUNDS;
    }
    return {
      minLat: activeZone.lat - 0.105,
      maxLat: activeZone.lat + 0.105,
      minLng: activeZone.lng - 0.13,
      maxLng: activeZone.lng + 0.13,
    };
  }, [activeZone, inHyderabad]);

  const project = (lat: number, lng: number, width = 960, height = 560) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width;
    const y = height - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * height;
    return { x, y };
  };

  const inBounds = (lat: number, lng: number) =>
    lat >= bounds.minLat - 0.04 &&
    lat <= bounds.maxLat + 0.04 &&
    lng >= bounds.minLng - 0.04 &&
    lng <= bounds.maxLng + 0.04;

  const visibleLocations = useMemo(() => {
    const list = locations.filter((l) => inBounds(l.lat, l.lng));
    if (activeZone && !list.some((l) => l.name === activeZone.name)) {
      list.unshift(activeZone);
    }
    return list;
  }, [locations, activeZone, bounds]);

  const originLatLng = useMemo(() => {
    if (liveGps && inBounds(liveGps.lat, liveGps.lng)) {
      return { lat: liveGps.lat, lng: liveGps.lng, label: 'Current GPS' };
    }
    if (activeZone) return { lat: activeZone.lat, lng: activeZone.lng, label: activeZone.name };
    if (registeredLocation) return registeredLocation;
    return { lat: 17.385, lng: 78.4867, label: 'Hyderabad' };
  }, [liveGps, registeredLocation, activeZone, bounds]);

  const safeRoute = useMemo(() => {
    if (!safeRouteActive) return null;
    const shelters = facilities.filter(
      (f) => (f.type === 'shelter' || f.type === 'relief_centre') && inBounds(f.lat, f.lng)
    );
    if (!shelters.length) return null;

    let best = shelters[0];
    let bestDist = Infinity;
    for (const s of shelters) {
      const d = Math.hypot(s.lat - originLatLng.lat, s.lng - originLatLng.lng);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }

    const start = project(originLatLng.lat, originLatLng.lng);
    const end = project(best.lat, best.lng);

    const hazards = facilities.filter((f) => f.type === 'waterlogging' && inBounds(f.lat, f.lng));
    let detourX = (start.x + end.x) / 2;
    let detourY = (start.y + end.y) / 2;
    let avoidedHazard: string | null = null;

    for (const h of hazards) {
      const hp = project(h.lat, h.lng);
      const distToMid = Math.hypot(hp.x - detourX, hp.y - detourY);
      if (distToMid < 95) {
        detourX -= 48;
        detourY -= 54;
        avoidedHazard = h.name;
      }
    }

    const km = Math.max(0.8, Math.round(bestDist * 111 * 1.28 * 10) / 10);
    const mins = Math.max(4, Math.round(km * 3.8));

    return {
      destination: best,
      points: `${start.x},${start.y} ${detourX},${detourY} ${end.x},${end.y}`,
      km,
      mins,
      avoidedHazard,
    };
  }, [safeRouteActive, facilities, originLatLng, bounds]);

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (compact) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => Math.min(2.6, Math.max(0.85, Number((z + delta).toFixed(2)))));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-[#EAF2FB] rounded-xl border border-slate-200 overflow-hidden select-none">
      {/* Map Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white/95 border-b border-slate-200 z-10">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-800 mr-1 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-blue-700" />
            Geospatial Flood Map
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">
            {activeZone
              ? `${activeZone.name} (${activeZone.lat.toFixed(3)}°, ${activeZone.lng.toFixed(3)}°) · ${
                  activeZone.dataSource === 'live_api'
                    ? 'Live Open-Meteo & GloFAS Feed'
                    : activeZone.dataSource === 'partial_live_api'
                    ? 'Live Open-Meteo Weather (GloFAS Unmapped)'
                    : 'Upstream Weather Unavailable'
                }`
              : 'Loading coordinates...'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSafeRouteActive((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              safeRouteActive
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-blue-700 text-white hover:bg-blue-800'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            {safeRouteActive ? 'Safe Route Active' : 'Find Safe Route'}
          </button>
        </div>
      </div>

      {/* Layer Toggles */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-slate-50/90 border-b border-slate-200 text-xs z-10">
          {(
            [
              ['zones', 'Flood Risk Zones'],
              ['shelters', 'Shelters & Relief'],
              ['hospitals', 'Hospitals'],
              ['rescue', 'Rescue Units & SOS'],
              ['waterlogging', 'Waterlogging Hazards'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setVisibleLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={`px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap ${
                visibleLayers[key]
                  ? 'bg-white border-blue-300 text-blue-800 shadow-2xs'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Interactive SVG Map Viewport */}
      <div
        className={`relative flex-1 ${compact ? 'min-h-[300px]' : 'min-h-[460px]'} cursor-grab active:cursor-grabbing overflow-hidden`}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          setDragging(true);
          setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }}
        onMouseMove={(e) => {
          if (!dragging) return;
          setPan({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y });
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <svg
          viewBox="0 0 960 560"
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 150ms ease-out',
          }}
        >
          {/* Base Map Land & Coordinate Grid */}
          <rect width="960" height="560" fill="#EFF6FF" />
          <g stroke="#DCE7F5" strokeWidth="1">
            {Array.from({ length: 16 }).map((_, i) => (
              <line key={`vg-${i}`} x1={i * 64} y1={0} x2={i * 64} y2={560} />
            ))}
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`hg-${i}`} x1={0} y1={i * 60} x2={960} y2={i * 60} />
            ))}
          </g>

          {/* Local Hyderabad Lakes (only shown when viewing Hyderabad bounds) */}
          {inHyderabad && (
            <g>
              <path
                d="M 120 110 Q 250 140 340 165 T 550 230 T 760 390 L 940 430"
                fill="none"
                stroke="#93C5FD"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.7"
              />
              <ellipse cx="535" cy="238" rx="44" ry="26" fill="#BFDBFE" stroke="#60A5FA" strokeWidth="2" />
              <text x="535" y="242" textAnchor="middle" fontSize="10" fill="#1E40AF" fontWeight="600">
                Hussain Sagar
              </text>
              <ellipse cx="155" cy="82" rx="28" ry="18" fill="#BFDBFE" stroke="#60A5FA" strokeWidth="1.5" />
              <text x="155" y="86" textAnchor="middle" fontSize="9" fill="#1E40AF" fontWeight="600">
                Miyapur Lake
              </text>
            </g>
          )}

          {/* Arterial Road Corridors */}
          <path
            d="M 40 70 L 360 155 L 540 215 L 860 465"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="7"
          />
          <path
            d="M 40 70 L 360 155 L 540 215 L 860 465"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          <path
            d="M 90 360 Q 240 240 380 180 T 760 130"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="6"
          />
          <path
            d="M 90 360 Q 240 240 380 180 T 760 130"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />

          {/* Colored Flood Risk Zones */}
          {visibleLayers.zones &&
            visibleLocations.map((loc) => {
              const p = project(loc.lat, loc.lng);
              const style = RISK_COLORS[loc.riskLevel] || RISK_COLORS.UNAVAILABLE;
              const radius = Math.max(46, Math.min(82, loc.radiusMeters / 48));
              const isSelected = activeZone?.name === loc.name;
              const scoreText = loc.riskScore !== null ? `${loc.riskScore}` : 'N/A';
              return (
                <g
                  key={`${loc.id}-${loc.name}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectZone?.(loc.name);
                    setSelectedItem({
                      title: `${loc.name} · ${style.label}`,
                      subtitle: `Risk Score ${
                        loc.riskScore !== null ? `${loc.riskScore}/100` : 'DATA UNAVAILABLE'
                      } · Rain ${
                        loc.rainfallIntensityMmHr !== null ? `${loc.rainfallIntensityMmHr} mm/h` : 'N/A'
                      } · GloFAS ${
                        loc.riverDischargeM3s !== null && loc.riverDischargeM3s !== undefined
                          ? `${loc.riverDischargeM3s} m³/s`
                          : 'DATA UNAVAILABLE'
                      }`,
                      detail: loc.alertMessage,
                      badge: loc.riskLevel,
                    });
                  }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={radius}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={isSelected ? 3 : 1.75}
                    strokeDasharray={isSelected ? 'none' : '5 3'}
                  />
                  <rect
                    x={p.x - 62}
                    y={p.y + radius - 14}
                    width="124"
                    height="20"
                    rx="4"
                    fill="#FFFFFF"
                    stroke={style.stroke}
                    strokeWidth="1"
                  />
                  <text
                    x={p.x}
                    y={p.y + radius}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#0F172A"
                  >
                    {loc.name.slice(0, 14)} ({scoreText})
                  </text>
                </g>
              );
            })}

          {/* Safe Evacuation Route Avoiding Flooded Roads */}
          {safeRoute && (
            <g>
              <polyline
                points={safeRoute.points}
                fill="none"
                stroke="#16A34A"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10 6"
              />
            </g>
          )}

          {/* Facilities within active bounds */}
          {facilities
            .filter((fac) => inBounds(fac.lat, fac.lng))
            .map((fac) => {
              if (
                (fac.type === 'shelter' || fac.type === 'relief_centre') &&
                !visibleLayers.shelters
              )
                return null;
              if (fac.type === 'hospital' && !visibleLayers.hospitals) return null;
              if (fac.type === 'rescue_station' && !visibleLayers.rescue) return null;
              if (fac.type === 'waterlogging' && !visibleLayers.waterlogging) return null;

              const p = project(fac.lat, fac.lng);
              const color =
                fac.type === 'shelter' || fac.type === 'relief_centre'
                  ? '#16A34A'
                  : fac.type === 'hospital'
                  ? '#2563EB'
                  : fac.type === 'rescue_station'
                  ? '#0F172A'
                  : '#DC2626';

              const tag =
                fac.type === 'shelter'
                  ? 'S'
                  : fac.type === 'relief_centre'
                  ? 'R'
                  : fac.type === 'hospital'
                  ? 'H'
                  : fac.type === 'rescue_station'
                  ? 'HQ'
                  : '!';

              return (
                <g
                  key={fac.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem({
                      title: fac.name,
                      subtitle: `${fac.type.replace(/_/g, ' ').toUpperCase()} · ${fac.locality}`,
                      detail: fac.availableBeds
                        ? `Available capacity: ${fac.availableBeds}/${fac.capacity} beds · Contact: ${fac.contact}`
                        : fac.contact
                        ? `Emergency Contact: ${fac.contact}`
                        : 'Active hazard reported — avoid road segment.',
                      badge: fac.severity || 'SAFE NODE',
                    });
                  }}
                >
                  <circle cx={p.x} cy={p.y} r="11" fill={color} stroke="#FFFFFF" strokeWidth="2.5" />
                  <text
                    x={p.x}
                    y={p.y + 3.5}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="800"
                    fill="#FFFFFF"
                  >
                    {tag}
                  </text>
                </g>
              );
            })}

          {/* Active SOS Incidents within bounds */}
          {visibleLayers.rescue &&
            incidents
              .filter((inc) => inc.status !== 'Resolved' && inBounds(inc.lat, inc.lng))
              .map((inc) => {
                const p = project(inc.lat, inc.lng);
                return (
                  <g
                    key={inc.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItem({
                        title: `SOS Incident ${inc.id} (${inc.aiClassification})`,
                        subtitle: `${inc.locality} · Status: ${inc.status}`,
                        detail: `${inc.reportCount} citizen report(s). Assigned: ${inc.assignedTeamName || 'Dispatching'}`,
                        badge: inc.aiClassification.toUpperCase(),
                      });
                    }}
                  >
                    <polygon
                      points={`${p.x},${p.y - 13} ${p.x + 12},${p.y + 9} ${p.x - 12},${p.y + 9}`}
                      fill="#DC2626"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x={p.x}
                      y={p.y + 6}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="800"
                      fill="#FFFFFF"
                    >
                      SOS
                    </text>
                  </g>
                );
              })}

          {/* Live Rescue Teams within bounds */}
          {visibleLayers.rescue &&
            rescueTeams
              .filter((team) => inBounds(team.lat, team.lng))
              .map((team) => {
                const p = project(team.lat, team.lng);
                return (
                  <g
                    key={team.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItem({
                        title: team.name,
                        subtitle: `${team.unitCode} · ${team.status}`,
                        detail: `${team.personnelCount} personnel · ${team.equipment}`,
                        badge: team.status.toUpperCase(),
                      });
                    }}
                  >
                    <rect
                      x={p.x - 12}
                      y={p.y - 12}
                      width="24"
                      height="24"
                      rx="6"
                      fill="#1D4ED8"
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />
                    <text
                      x={p.x}
                      y={p.y + 3.5}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="800"
                      fill="#FFFFFF"
                    >
                      DRF
                    </text>
                  </g>
                );
              })}

          {/* User Registered / Live GPS / Selected City Center Marker */}
          {(() => {
            const up = project(originLatLng.lat, originLatLng.lng);
            return (
              <g>
                <circle cx={up.x} cy={up.y} r="14" fill="rgba(37,99,235,0.22)" />
                <circle cx={up.x} cy={up.y} r="7" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2.5" />
                <text
                  x={up.x}
                  y={up.y - 14}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#1E3A8A"
                >
                  {originLatLng.label}
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Zoom Controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.25).toFixed(2))))}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700"
            title="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.25).toFixed(2))))}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700"
            title="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700"
            title="Reset map view"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        </div>

        {/* Safe Route Card Overlay */}
        {safeRouteActive && (
          <div className="absolute left-3 top-3 max-w-xs bg-white border border-emerald-200 rounded-lg p-3 shadow-md text-xs">
            {safeRoute ? (
              <>
                <div className="flex items-center justify-between gap-2 font-semibold text-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" />
                    Safe Evacuation Corridor
                  </span>
                  <span className="font-mono-tabular">
                    {safeRoute.km} km · ~{safeRoute.mins} min
                  </span>
                </div>
                <p className="mt-1 text-slate-700">
                  Destination: <strong className="text-slate-900">{safeRoute.destination.name}</strong>
                </p>
                <p className="mt-0.5 text-slate-500">
                  {safeRoute.avoidedHazard
                    ? `Detouring around ${safeRoute.avoidedHazard}.`
                    : 'Routing along elevated arterial roads clear of waterlogging.'}
                </p>
              </>
            ) : (
              <div className="text-slate-700">
                No local shelter coordinates mapped for <strong>{activeZone?.name}</strong>. Use municipal emergency helpline 112 / 1070 for nearest relief center.
              </div>
            )}
          </div>
        )}

        {/* Selected Node Inspector */}
        {selectedItem && (
          <div className="absolute left-3 bottom-3 right-3 sm:right-auto sm:max-w-sm bg-white border border-slate-200 rounded-lg p-3 shadow-md text-xs z-20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{selectedItem.title}</div>
                <div className="text-slate-500 mt-0.5">{selectedItem.subtitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-700 font-semibold px-1"
              >
                ×
              </button>
            </div>
            <p className="mt-1.5 text-slate-700 leading-relaxed">{selectedItem.detail}</p>
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-white border-t border-slate-200 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Critical
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" /> High
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Medium
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Low Risk / Shelter
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> Unavailable
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-slate-500">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> S/R Shelter
          </span>
          <span className="inline-flex items-center gap-1">
            <Hospital className="w-3.5 h-3.5 text-blue-600" /> H Hospital
          </span>
          <span className="inline-flex items-center gap-1">
            <Siren className="w-3.5 h-3.5 text-red-600" /> SOS Incident
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-blue-700" /> DRF Rescue Unit
          </span>
          <span className="inline-flex items-center gap-1">
            <Waves className="w-3.5 h-3.5 text-red-600" /> Waterlogging
          </span>
        </div>
      </div>
    </div>
  );
};
