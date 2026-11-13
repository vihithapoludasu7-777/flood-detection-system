import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {
  MapFacility,
  MapLayerMode,
  MapPoiItem,
  PoiCategory,
  RescueTeam,
  SOSIncident,
  SpatialFloodSample,
} from '../types.ts';

export interface MapViewportBounds {
  south: number;
  west: number;
  north: number;
  east: number;
  centerLat: number;
  centerLng: number;
  zoom: number;
}

export interface MapFlyRequest {
  id: number;
  lat: number;
  lng: number;
  zoom?: number;
  boundingBox?: [number, number, number, number];
}

export interface MapZoomCommand {
  id: number;
  delta: 1 | -1;
}

interface LiveFloodLeafletMapProps {
  initialCenter: { lat: number; lng: number };
  searchedLocation: { lat: number; lng: number; name: string } | null;
  userGps: { lat: number; lng: number } | null;
  pois: MapPoiItem[];
  floodSamples: SpatialFloodSample[];
  facilities: MapFacility[];
  rescueTeams: RescueTeam[];
  incidents: SOSIncident[];
  activeCategory: PoiCategory;
  activeLayer: MapLayerMode;
  selectedItemId: string | null;
  flyRequest: MapFlyRequest | null;
  zoomCommand: MapZoomCommand | null;
  onBoundsChange: (bounds: MapViewportBounds) => void;
  onSelectPoi: (poi: MapPoiItem) => void;
  onSelectFloodSample: (sample: SpatialFloodSample) => void;
  onSelectFacility: (facility: MapFacility) => void;
  onSelectIncident: (incident: SOSIncident) => void;
  onSelectTeam: (team: RescueTeam) => void;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const POI_STYLE: Record<
  Exclude<PoiCategory, 'all'>,
  { bg: string; border: string; glyph: string }
> = {
  hospitals: { bg: '#E11D48', border: '#9F1239', glyph: 'H' },
  schools: { bg: '#4F46E5', border: '#3730A3', glyph: 'S' },
  emergency: { bg: '#0F172A', border: '#334155', glyph: 'E' },
  shopping: { bg: '#7C3AED', border: '#5B21B6', glyph: 'M' },
  transport: { bg: '#0284C7', border: '#0369A1', glyph: 'T' },
  roads_bridges: { bg: '#D97706', border: '#92400E', glyph: 'R' },
};

function getRiskPalette(level: SpatialFloodSample['riskLevel']): {
  stroke: string;
  fill: string;
  badgeBg: string;
  label: string;
} {
  if (level === 'CRITICAL' || level === 'HIGH') {
    return { stroke: '#DC2626', fill: '#EF4444', badgeBg: '#B91C1C', label: 'HIGH' };
  }
  if (level === 'MEDIUM' || level === 'MODERATE') {
    return { stroke: '#EA580C', fill: '#F97316', badgeBg: '#C2410C', label: 'MEDIUM' };
  }
  if (level === 'LOW') {
    return { stroke: '#16A34A', fill: '#22C55E', badgeBg: '#15803D', label: 'LOW' };
  }
  return { stroke: '#64748B', fill: '#94A3B8', badgeBg: '#475569', label: 'N/A' };
}

export const LiveFloodLeafletMap: React.FC<LiveFloodLeafletMapProps> = ({
  initialCenter,
  searchedLocation,
  userGps,
  pois,
  floodSamples,
  facilities,
  rescueTeams,
  incidents,
  activeCategory,
  activeLayer,
  selectedItemId,
  flyRequest,
  zoomCommand,
  onBoundsChange,
  onSelectPoi,
  onSelectFloodSample,
  onSelectFacility,
  onSelectIncident,
  onSelectTeam,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFlyIdRef = useRef<number>(0);
  const lastZoomIdRef = useRef<number>(0);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  const callbacksRef = useRef({
    onSelectPoi,
    onSelectFloodSample,
    onSelectFacility,
    onSelectIncident,
    onSelectTeam,
  });
  callbacksRef.current = {
    onSelectPoi,
    onSelectFloodSample,
    onSelectFacility,
    onSelectIncident,
    onSelectTeam,
  };

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    const markerGroup = L.layerGroup().addTo(map);
    overlayGroupRef.current = overlayGroup;
    layerGroupRef.current = markerGroup;
    mapRef.current = map;

    const emitBounds = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      onBoundsChangeRef.current({
        south: Number(b.getSouth().toFixed(5)),
        west: Number(b.getWest().toFixed(5)),
        north: Number(b.getNorth().toFixed(5)),
        east: Number(b.getEast().toFixed(5)),
        centerLat: Number(c.lat.toFixed(5)),
        centerLng: Number(c.lng.toFixed(5)),
        zoom: map.getZoom(),
      });
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleMoveEnd = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(emitBounds, 320);
    };

    map.on('moveend', handleMoveEnd);

    // Emit initial bounds right after map settles
    setTimeout(() => {
      map.invalidateSize({ animate: false });
      emitBounds();
    }, 120);

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      ro.disconnect();
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      overlayGroupRef.current = null;
    };
  }, [initialCenter.lat, initialCenter.lng]);

  // Handle imperative flyTo / fitBounds requests
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyRequest || flyRequest.id === lastFlyIdRef.current) return;
    lastFlyIdRef.current = flyRequest.id;

    if (flyRequest.boundingBox) {
      const [south, north, west, east] = flyRequest.boundingBox;
      const latSpan = Math.abs(north - south);
      const lngSpan = Math.abs(east - west);
      if (latSpan > 0.002 && latSpan < 0.4 && lngSpan > 0.002 && lngSpan < 0.4) {
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [40, 40], maxZoom: 15, animate: true }
        );
        return;
      }
    }
    map.flyTo([flyRequest.lat, flyRequest.lng], flyRequest.zoom ?? 14, {
      duration: 0.7,
    });
  }, [flyRequest]);

  // Handle imperative zoom in / zoom out commands
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomCommand || zoomCommand.id === lastZoomIdRef.current) return;
    lastZoomIdRef.current = zoomCommand.id;
    if (zoomCommand.delta > 0) map.zoomIn();
    else map.zoomOut();
  }, [zoomCommand]);

  // Re-render overlays & markers whenever state changes
  useEffect(() => {
    const markerGroup = layerGroupRef.current;
    const overlayGroup = overlayGroupRef.current;
    if (!markerGroup || !overlayGroup) return;

    markerGroup.clearLayers();
    overlayGroup.clearLayers();

    // 1. Monitoring Overlay Layers (Flood Risk, Rainfall, River)
    if (activeLayer === 'flood_risk') {
      floodSamples.forEach((sample) => {
        const pal = getRiskPalette(sample.riskLevel);
        const isSelected = selectedItemId === sample.id;

        const circle = L.circle([sample.lat, sample.lng], {
          radius: sample.radiusMeters,
          color: pal.stroke,
          weight: isSelected ? 3 : 1.8,
          dashArray: sample.riskLevel === 'UNAVAILABLE' ? '6 4' : undefined,
          fillColor: pal.fill,
          fillOpacity: isSelected ? 0.34 : 0.2,
        });
        circle.on('click', () => callbacksRef.current.onSelectFloodSample(sample));
        circle.addTo(overlayGroup);

        const scoreLabel =
          sample.riskScore !== null ? `${sample.riskScore}/100` : 'N/A';
        const icon = L.divIcon({
          className: '',
          iconSize: [108, 40],
          iconAnchor: [54, 20],
          html: `<div style="background:${pal.badgeBg};color:#fff;border:2px solid #fff;border-radius:8px;padding:3px 7px;box-shadow:0 3px 10px rgba(15,23,42,0.28);text-align:center;font-family:system-ui,sans-serif;cursor:pointer;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.03em;line-height:1.1;">${pal.label} · ${scoreLabel}</div>
            <div style="font-size:9px;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:94px;">${escapeHtml(sample.label)}</div>
          </div>`,
        });
        const badge = L.marker([sample.lat, sample.lng], { icon, zIndexOffset: 250 });
        badge.on('click', () => callbacksRef.current.onSelectFloodSample(sample));
        badge.addTo(overlayGroup);
      });
    } else if (activeLayer === 'rainfall') {
      floodSamples.forEach((sample) => {
        const rain = sample.rainfallMm ?? 0;
        const fc24 = sample.forecast24hMm ?? 0;
        const intense = rain >= 10 || fc24 >= 35;
        const moderate = rain >= 2 || fc24 >= 12;
        const color = intense ? '#1D4ED8' : moderate ? '#0284C7' : '#38BDF8';
        const isSelected = selectedItemId === sample.id;

        const circle = L.circle([sample.lat, sample.lng], {
          radius: sample.radiusMeters,
          color,
          weight: isSelected ? 3 : 1.6,
          fillColor: color,
          fillOpacity: intense ? 0.28 : moderate ? 0.2 : 0.13,
        });
        circle.on('click', () => callbacksRef.current.onSelectFloodSample(sample));
        circle.addTo(overlayGroup);

        const rainText =
          sample.rainfallMm !== null ? `${sample.rainfallMm.toFixed(1)} mm/hr` : 'N/A';
        const probText =
          sample.precipProbabilityPct !== null ? `${sample.precipProbabilityPct}%` : 'N/A';
        const icon = L.divIcon({
          className: '',
          iconSize: [116, 42],
          iconAnchor: [58, 21],
          html: `<div style="background:#0F172A;color:#fff;border:2px solid ${color};border-radius:8px;padding:3px 7px;box-shadow:0 3px 10px rgba(15,23,42,0.28);text-align:center;font-family:system-ui,sans-serif;cursor:pointer;">
            <div style="font-size:10px;font-weight:700;color:#7DD3FC;line-height:1.15;">Rain ${rainText} · ${probText}</div>
            <div style="font-size:9px;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;">24h: ${
              sample.forecast24hMm !== null ? `${sample.forecast24hMm.toFixed(1)} mm` : 'N/A'
            }</div>
          </div>`,
        });
        const badge = L.marker([sample.lat, sample.lng], { icon, zIndexOffset: 250 });
        badge.on('click', () => callbacksRef.current.onSelectFloodSample(sample));
        badge.addTo(overlayGroup);
      });
    } else if (activeLayer === 'river') {
      floodSamples.forEach((sample) => {
        const dis = sample.riverDischargeM3s;
        const mean = sample.riverDischargeMeanM3s;
        const ratio = dis !== null && mean && mean > 0 ? dis / mean : null;
        const color =
          dis === null
            ? '#64748B'
            : (ratio !== null && ratio >= 2.2) || dis >= 800
            ? '#DC2626'
            : (ratio !== null && ratio >= 1.4) || dis >= 250
            ? '#D97706'
            : '#0D9488';
        const isSelected = selectedItemId === sample.id;

        const circle = L.circle([sample.lat, sample.lng], {
          radius: sample.radiusMeters,
          color,
          weight: isSelected ? 3 : 1.6,
          dashArray: dis === null ? '6 4' : undefined,
          fillColor: color,
          fillOpacity: dis === null ? 0.1 : 0.2,
        });
        circle.on('click', () => callbacksRef.current.onSelectFloodSample(sample));
        circle.addTo(overlayGroup);

        const disLabel = dis !== null ? `${dis.toFixed(1)} m³/s` : 'UNAVAILABLE';
        const icon = L.divIcon({
          className: '',
          iconSize: [118, 40],
          iconAnchor: [59, 20],
          html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:8px;padding:3px 7px;box-shadow:0 3px 10px rgba(15,23,42,0.28);text-align:center;font-family:system-ui,sans-serif;cursor:pointer;">
            <div style="font-size:10px;font-weight:700;line-height:1.15;">River ${disLabel}</div>
            <div style="font-size:9px;opacity:0.92;">GloFAS Hydro Basin</div>
          </div>`,
        });
        const badge = L.marker([sample.lat, sample.lng], { icon, zIndexOffset: 250 });
        badge.on('click', () => callbacksRef.current.onSelectFloodSample(sample));
        badge.addTo(overlayGroup);
      });
    }

    // 2. OSM Points of Interest (shown on all non-emergency layers, or if category filtered)
    if (activeLayer !== 'emergency') {
      const visiblePois =
        activeCategory === 'all'
          ? pois
          : pois.filter((p) => p.category === activeCategory);

      visiblePois.forEach((poi) => {
        const style = POI_STYLE[poi.category];
        const isSelected = selectedItemId === poi.id;
        const size = isSelected ? 32 : 26;

        const icon = L.divIcon({
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${
            style.bg
          };border:${isSelected ? '3px solid #FACC15' : `2px solid #FFFFFF`};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:${
            isSelected ? 12 : 10
          }px;font-weight:800;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,0.35);cursor:pointer;">${
            style.glyph
          }</div>`,
        });

        const marker = L.marker([poi.lat, poi.lng], {
          icon,
          zIndexOffset: isSelected ? 500 : 120,
        });
        marker.bindTooltip(
          `<div style="font-family:system-ui,sans-serif;font-size:11px;"><strong>${escapeHtml(
            poi.name
          )}</strong><div style="color:#475569;font-size:10px;">${escapeHtml(
            poi.subType
          )}</div></div>`,
          { direction: 'top', offset: [0, -10] }
        );
        marker.on('click', () => callbacksRef.current.onSelectPoi(poi));
        marker.addTo(markerGroup);
      });
    }

    // 3. Emergency Locations (always show active SOS & waterlogging; show all shelters/rescue on emergency layer)
    const showAllEmergency = activeLayer === 'emergency';

    facilities.forEach((fac) => {
      if (!showAllEmergency && fac.type !== 'waterlogging') return;
      const isSelected = selectedItemId === fac.id;
      const bg =
        fac.type === 'shelter' || fac.type === 'relief_centre'
          ? '#059669'
          : fac.type === 'hospital'
          ? '#E11D48'
          : fac.type === 'rescue_station'
          ? '#1D4ED8'
          : '#DC2626';
      const glyph =
        fac.type === 'shelter'
          ? 'SH'
          : fac.type === 'relief_centre'
          ? 'RC'
          : fac.type === 'hospital'
          ? 'H+'
          : fac.type === 'rescue_station'
          ? 'DRF'
          : '!';

      const icon = L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:7px;background:${bg};border:${
          isSelected ? '3px solid #FACC15' : '2px solid #FFFFFF'
        };color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,0.35);cursor:pointer;">${glyph}</div>`,
      });
      const marker = L.marker([fac.lat, fac.lng], {
        icon,
        zIndexOffset: isSelected ? 520 : 280,
      });
      marker.bindTooltip(
        `<div style="font-family:system-ui,sans-serif;font-size:11px;"><strong>${escapeHtml(
          fac.name
        )}</strong><div style="color:#475569;font-size:10px;">${escapeHtml(
          fac.locality
        )}</div></div>`,
        { direction: 'top', offset: [0, -10] }
      );
      marker.on('click', () => callbacksRef.current.onSelectFacility(fac));
      marker.addTo(markerGroup);
    });

    if (showAllEmergency) {
      rescueTeams.forEach((team) => {
        const isSelected = selectedItemId === team.id;
        const icon = L.divIcon({
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div style="width:30px;height:30px;border-radius:8px;background:#0F172A;border:${
            isSelected ? '3px solid #FACC15' : '2px solid #38BDF8'
          };color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,0.4);cursor:pointer;">DRF</div>`,
        });
        const marker = L.marker([team.lat, team.lng], { icon, zIndexOffset: 300 });
        marker.bindTooltip(
          `<strong>${escapeHtml(team.name)}</strong> (${escapeHtml(team.status)})`,
          { direction: 'top', offset: [0, -10] }
        );
        marker.on('click', () => callbacksRef.current.onSelectTeam(team));
        marker.addTo(markerGroup);
      });
    }

    incidents
      .filter((inc) => inc.status !== 'Resolved')
      .forEach((inc) => {
        if (!showAllEmergency && activeLayer !== 'flood_risk') return;
        const isSelected = selectedItemId === inc.id;
        const icon = L.divIcon({
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div style="width:30px;height:30px;border-radius:9999px;background:#DC2626;border:${
            isSelected ? '3px solid #FACC15' : '2px solid #FFFFFF'
          };color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;font-family:system-ui,sans-serif;box-shadow:0 0 0 4px rgba(220,38,38,0.28);cursor:pointer;">SOS</div>`,
        });
        const marker = L.marker([inc.lat, inc.lng], { icon, zIndexOffset: 420 });
        marker.bindTooltip(
          `<strong>SOS: ${escapeHtml(inc.locality)}</strong> (${escapeHtml(
            inc.aiClassification
          )})`,
          { direction: 'top', offset: [0, -10] }
        );
        marker.on('click', () => callbacksRef.current.onSelectIncident(inc));
        marker.addTo(markerGroup);
      });

    // 4. Searched Location Pin
    if (searchedLocation) {
      const pinIcon = L.divIcon({
        className: '',
        iconSize: [34, 42],
        iconAnchor: [17, 38],
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:28px;height:28px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#1D4ED8;border:3px solid #FFFFFF;box-shadow:0 4px 12px rgba(29,78,216,0.45);display:flex;align-items:center;justify-content:center;">
            <div style="width:8px;height:8px;border-radius:9999px;background:#FFFFFF;transform:rotate(45deg);"></div>
          </div>
        </div>`,
      });
      const pin = L.marker([searchedLocation.lat, searchedLocation.lng], {
        icon: pinIcon,
        zIndexOffset: 650,
      });
      pin.bindTooltip(
        `<div style="font-family:system-ui,sans-serif;font-size:11px;"><strong>${escapeHtml(
          searchedLocation.name
        )}</strong><div style="color:#475569;font-size:10px;">Searched Location</div></div>`,
        { direction: 'top', offset: [0, -34] }
      );
      pin.addTo(markerGroup);
    }

    // 5. User Live GPS Position Marker
    if (userGps) {
      const gpsIcon = L.divIcon({
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:rgba(37,99,235,0.22);display:flex;align-items:center;justify-content:center;">
          <div style="width:12px;height:12px;border-radius:9999px;background:#2563EB;border:2.5px solid #FFFFFF;box-shadow:0 1px 6px rgba(37,99,235,0.6);"></div>
        </div>`,
      });
      const gpsMarker = L.marker([userGps.lat, userGps.lng], {
        icon: gpsIcon,
        zIndexOffset: 700,
      });
      gpsMarker.bindTooltip('My Current Location', { direction: 'top', offset: [0, -10] });
      gpsMarker.addTo(markerGroup);
    }
  }, [
    pois,
    floodSamples,
    facilities,
    rescueTeams,
    incidents,
    activeCategory,
    activeLayer,
    selectedItemId,
    searchedLocation,
    userGps,
  ]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[520px] bg-slate-100"
      aria-label="Interactive OpenStreetMap Flood Monitoring Map"
    />
  );
};
