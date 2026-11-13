import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CloudRain,
  Droplets,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sprout,
  Thermometer,
  Waves,
  Wifi,
  WifiOff,
  Wind,
  X,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import { translateRiskLevel, translateSOSCategory, translateSOSStatus } from '../../i18n/translations.ts';
import { ApiMonitoringPanel } from '../ApiMonitoringPanel.tsx';
import { FloodVectorMap } from '../FloodVectorMap.tsx';
import { WorldFloodGlobe } from '../WorldFloodGlobe.tsx';
import type { RiskLevel } from '../../types.ts';

function riskTheme(level: RiskLevel) {
  switch (level) {
    case 'CRITICAL':
      return {
        bannerBg: 'bg-red-600 text-white border-red-700',
        ringStroke: '#DC2626',
        textColor: 'text-red-700',
        surfaceBg: 'bg-red-50 border-red-200',
      };
    case 'HIGH':
      return {
        bannerBg: 'bg-orange-600 text-white border-orange-700',
        ringStroke: '#EA580C',
        textColor: 'text-orange-700',
        surfaceBg: 'bg-orange-50 border-orange-200',
      };
    case 'MEDIUM':
    case 'MODERATE':
      return {
        bannerBg: 'bg-amber-500 text-slate-950 border-amber-600',
        ringStroke: '#D97706',
        textColor: 'text-amber-700',
        surfaceBg: 'bg-amber-50 border-amber-200',
      };
    case 'UNAVAILABLE':
      return {
        bannerBg: 'bg-slate-700 text-white border-slate-800',
        ringStroke: '#64748B',
        textColor: 'text-slate-600',
        surfaceBg: 'bg-slate-100 border-slate-300',
      };
    default:
      return {
        bannerBg: 'bg-emerald-600 text-white border-emerald-700',
        ringStroke: '#16A34A',
        textColor: 'text-emerald-700',
        surfaceBg: 'bg-emerald-50 border-emerald-200',
      };
  }
}

export const HomeDashboard: React.FC = () => {
  const {
    t,
    language,
    activeZone,
    locations,
    facilities,
    rescueTeams,
    incidents,
    recentChat,
    syncedAt,
    isOnline,
    queuedSos,
    syncingSos,
    flushOfflineSos,
    refreshDashboard,
    setActiveTab,
    setSelectedLocality,
    liveGps,
    user,
    worldCities,
    globalLocationLoading,
    selectGlobalPlace,
  } = useAlertNet();

  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!activeZone) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading live Open-Meteo & GloFAS flood telemetry...
      </div>
    );
  }

  const theme = riskTheme(activeZone.riskLevel);
  const score = activeZone.riskScore;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset =
    score !== null ? circumference - (score / 100) * circumference : circumference;

  const nearbyShelters = facilities.filter(
    (f) => f.type === 'shelter' || f.type === 'relief_centre'
  );

  const feedLabel =
    activeZone.dataSource === 'live_api'
      ? 'Live Open-Meteo Weather & GloFAS Hydrology Feed'
      : activeZone.dataSource === 'partial_live_api'
      ? 'Live Open-Meteo Weather (GloFAS Grid Unavailable for Coastal/Unmapped Cell)'
      : 'Upstream Weather Telemetry Unavailable';

  return (
    <div className="space-y-6">
      {/* FIRST ROW: Large Live Flood Alert Banner */}
      <section
        className={`rounded-xl border p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${theme.bannerBg}`}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide opacity-90">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{feedLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {activeZone.name}, {activeZone.district}
              {activeZone.country ? `, ${activeZone.country}` : ''} ({activeZone.lat.toFixed(3)}°,{' '}
              {activeZone.lng.toFixed(3)}°)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {activeZone.alertTitle}
          </h2>
          <p className="text-sm sm:text-base opacity-95 max-w-3xl leading-relaxed">
            {activeZone.alertMessage}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="px-4 py-2.5 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            {t('viewDetails')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sos')}
            className="px-4 py-2.5 rounded-lg bg-slate-950/90 text-white text-sm font-semibold hover:bg-slate-950 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Siren className="w-4 h-4" />
            {t('navSos')}
          </button>
        </div>
      </section>

      {/* SECOND ROW: Flood Risk Score Card + 3D Global Flood Globe */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Flood Risk Score Card */}
        <div className="xl:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">{t('floodRiskScore')}</h3>
              <span className={`text-xs font-semibold ${theme.textColor}`}>
                {translateRiskLevel(language, activeZone.riskLevel)}
              </span>
            </div>

            <div className="my-5 flex items-center gap-6">
              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                  <circle
                    cx="64"
                    cy="64"
                    r={radius}
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="12"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r={radius}
                    fill="none"
                    stroke={theme.ringStroke}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold font-mono-tabular text-slate-900">
                    {score !== null ? score : 'N/A'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {score !== null ? '/ 100' : 'UNAVAIL'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">{t('currentFloodRisk')}</div>
                  <div className={`font-bold ${theme.textColor}`}>
                    {translateRiskLevel(language, activeZone.riskLevel)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Waves className="w-3.5 h-3.5 text-blue-700" />
                    {t('riverDischarge')}
                  </div>
                  <div className="font-semibold font-mono-tabular text-slate-900">
                    {activeZone.riverDischargeM3s !== null &&
                    activeZone.riverDischargeM3s !== undefined ? (
                      <>
                        {activeZone.riverDischargeM3s} m³/s{' '}
                        {activeZone.riverDischargeMeanM3s !== null &&
                          activeZone.riverDischargeMeanM3s !== undefined && (
                            <span className="text-xs font-normal text-slate-500">
                              (avg {activeZone.riverDischargeMeanM3s} m³/s)
                            </span>
                          )}
                      </>
                    ) : (
                      <span className="text-xs text-amber-700 font-semibold">DATA UNAVAILABLE</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div>
              <div className="text-slate-500">Observed Precip.</div>
              <div className="font-bold font-mono-tabular text-slate-900 mt-0.5">
                {activeZone.rainfallIntensityMmHr !== null
                  ? `${activeZone.rainfallIntensityMmHr} mm`
                  : 'DATA UNAVAILABLE'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t('precipProbability')}</div>
              <div className="font-bold font-mono-tabular text-slate-900 mt-0.5">
                {activeZone.precipitationProbabilityPct !== null &&
                activeZone.precipitationProbabilityPct !== undefined
                  ? `${activeZone.precipitationProbabilityPct}%`
                  : 'DATA UNAVAILABLE'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t('expectedRainfall')}</div>
              <div className="font-bold font-mono-tabular text-slate-900 mt-0.5">
                {activeZone.historicalRainfall24hMm !== null
                  ? `${activeZone.historicalRainfall24hMm} mm (Forecast)`
                  : 'DATA UNAVAILABLE'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Observation Time</div>
              <div className="font-semibold font-mono-tabular text-slate-700 mt-0.5">
                {activeZone.observationTimestamp ||
                  new Date(activeZone.lastUpdated).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive 3D Global Flood Risk Globe + Worldwide Location Search */}
        <div className="xl:col-span-8">
          <WorldFloodGlobe
            cities={worldCities}
            activeZone={activeZone}
            loadingLocation={globalLocationLoading}
            onSelectGlobalPlace={selectGlobalPlace}
          />
        </div>
      </section>

      {/* LOCAL STREET & SHELTER FLOOD MAP PREVIEW */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{t('navMap')}</h3>
            <p className="text-xs text-slate-500">
              Click any flood zone, shelter, hospital, or rescue unit to inspect · Drag to pan
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap"
          >
            Full Map <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="min-h-[320px]">
          <FloodVectorMap
            locations={locations}
            facilities={facilities}
            rescueTeams={rescueTeams}
            incidents={incidents}
            activeZone={activeZone}
            liveGps={liveGps}
            registeredLocation={
              user
                ? {
                    lat: user.registeredLat,
                    lng: user.registeredLng,
                    label: user.locality,
                  }
                : null
            }
            compact
            onSelectZone={(name) => setSelectedLocality(name)}
          />
        </div>
      </section>

      {/* THIRD ROW: AI Safety Suggestions + Live Weather (Observed vs Forecast) + Offline Status */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Safety Suggestions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-base font-bold text-slate-900">{t('aiSafetySuggestions')}</h3>
              <ShieldCheck className="w-4 h-4 text-blue-700" />
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Based on {activeZone.name} · {translateRiskLevel(language, activeZone.riskLevel)}
            </p>
            <ul className="space-y-2.5 text-sm text-slate-700">
              {activeZone.safetyRecommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="font-mono-tabular text-xs font-bold text-blue-700 mt-0.5">
                    0{idx + 1}.
                  </span>
                  <span className="leading-snug">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('assistant')}
            className="mt-4 w-full py-2 px-3 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-semibold transition-colors"
          >
            Ask AlertNet AI Safety Assistant
          </button>
        </div>

        {/* Live Weather Card (Distinguishing Observed vs Forecast) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{t('liveWeather')}</h3>
                <div className="text-[11px] text-slate-500">
                  Observed: {activeZone.observationTimestamp || 'DATA UNAVAILABLE'} ({activeZone.timezone || 'UTC'})
                </div>
              </div>
              <CloudRain className="w-4 h-4 text-blue-600" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#F4F8FD]">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-orange-600" />
                  {t('temperature')}
                </div>
                <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                  {activeZone.temperatureC !== null ? `${activeZone.temperatureC}°C` : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F4F8FD]">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-blue-600" />
                  {t('humidity')}
                </div>
                <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                  {activeZone.humidityPct !== null ? `${activeZone.humidityPct}%` : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F4F8FD]">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-blue-700" />
                  Current Rain / Prob.
                </div>
                <div className="text-base font-bold font-mono-tabular text-slate-900 mt-1">
                  {activeZone.rainfallIntensityMmHr !== null
                    ? `${activeZone.rainfallIntensityMmHr} mm · ${
                        activeZone.precipitationProbabilityPct ?? 'N/A'
                      }%`
                    : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F4F8FD]">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Wind className="w-3.5 h-3.5 text-slate-600" />
                  {t('windSpeed')}
                </div>
                <div className="text-base font-bold font-mono-tabular text-slate-900 mt-1">
                  {activeZone.windSpeedKmh !== null
                    ? `${activeZone.windSpeedKmh} km/h`
                    : 'DATA UNAVAILABLE'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1.5">
                Hourly Forecast ({t('forecast24h')})
              </div>
              {activeZone.forecast24h.length > 0 ? (
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {activeZone.forecast24h.slice(0, 5).map((h) => (
                    <div
                      key={h.time}
                      className="rounded-lg bg-slate-50 border border-slate-100 py-1.5 px-1"
                    >
                      <div className="text-[11px] font-medium text-slate-500">{h.time}</div>
                      <div className="text-xs font-bold font-mono-tabular text-slate-900 mt-0.5">
                        {h.tempC !== null ? `${h.tempC}°` : 'N/A'}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-blue-700">
                        {h.rainfallMm ?? 0}mm · {h.precipitationProbabilityPct ?? 0}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-amber-700">Hourly forecast DATA UNAVAILABLE</div>
              )}
            </div>

            {activeZone.dailyForecast && activeZone.dailyForecast.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-1">
                  Daily Rain Forecast (mm / max prob.)
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                  {activeZone.dailyForecast.slice(0, 3).map((d) => (
                    <div
                      key={d.date}
                      className="rounded bg-[#F4F8FD] border border-slate-200/60 py-1 px-1.5 font-mono-tabular"
                    >
                      <div className="text-slate-500">{d.date.slice(5)}</div>
                      <div className="font-bold text-slate-900">
                        {d.precipitationSumMm ?? 0}mm ({d.precipitationProbabilityMaxPct ?? 0}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Offline & Sync Status Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-base font-bold text-slate-900">{t('offlineStatus')}</h3>
              {isOnline ? (
                <Wifi className="w-4 h-4 text-emerald-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-600" />
              )}
            </div>

            <div
              className={`p-3.5 rounded-lg border text-sm font-semibold ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {isOnline ? t('connectedOnline') : t('offlineMode')}
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>{t('lastSuccessfulSync')}</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {syncedAt ? new Date(syncedAt).toLocaleTimeString() : 'Pending'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Offline SOS Queue</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {queuedSos.length} pending
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Monitored Area</span>
                <span className="font-semibold text-slate-900">{activeZone.name}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Telemetry Source</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {activeZone.dataSource}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void refreshDashboard();
                void flushOfflineSos();
              }}
              disabled={syncingSos}
              className="flex-1 py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingSos ? 'animate-spin' : ''}`} />
              {t('syncNow')}
            </button>
          </div>
        </div>
      </section>

      {/* FOURTH ROW: Quick Access Cards (SOS, AI Assistant, Community Chat, Smart Agriculture) */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-3">{t('quickAccess')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('sos')}
            className="text-left p-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <Siren className="w-6 h-6" />
              <ArrowRight className="w-4 h-4 opacity-80" />
            </div>
            <div className="mt-3 font-bold text-base">{t('quickSosTitle')}</div>
            <div className="mt-1 text-xs text-red-100 leading-relaxed">{t('quickSosDesc')}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assistant')}
            className="text-left p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-blue-700">
              <Bot className="w-6 h-6" />
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="mt-3 font-bold text-base text-slate-900">{t('quickAiTitle')}</div>
            <div className="mt-1 text-xs text-slate-600 leading-relaxed">{t('quickAiDesc')}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="text-left p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-blue-700">
              <MessageSquare className="w-6 h-6" />
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="mt-3 font-bold text-base text-slate-900">{t('quickChatTitle')}</div>
            <div className="mt-1 text-xs text-slate-600 leading-relaxed">{t('quickChatDesc')}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agriculture')}
            className="text-left p-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-emerald-700">
              <Sprout className="w-6 h-6" />
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="mt-3 font-bold text-base text-slate-900">{t('quickAgriTitle')}</div>
            <div className="mt-1 text-xs text-slate-600 leading-relaxed">{t('quickAgriDesc')}</div>
          </button>
        </div>
      </section>

      {/* BOTTOM ROW: Recent Flood Reports, Nearby Shelters, Latest Community Updates */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Flood Reports */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900">{t('recentFloodReports')}</h3>
            <button
              type="button"
              onClick={() => setActiveTab('sos')}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              All ({incidents.length})
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {incidents.slice(0, 3).map((inc) => (
              <div key={inc.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-900">
                    {translateSOSCategory(language, inc.primaryCategory)}
                  </span>
                  <span
                    className={`font-semibold ${
                      inc.aiClassification === 'Critical'
                        ? 'text-red-700'
                        : inc.aiClassification === 'Urgent'
                        ? 'text-orange-700'
                        : 'text-blue-700'
                    }`}
                  >
                    {inc.aiClassification}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {inc.locality} · {translateSOSStatus(language, inc.status)} · {inc.reportCount}{' '}
                  report(s)
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Nearby Emergency Shelters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900">{t('nearbyShelters')}</h3>
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              Directions
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {nearbyShelters.slice(0, 3).map((sh) => (
              <div key={sh.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {sh.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                      {sh.locality} · {sh.availableBeds} beds available · {sh.contact}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latest Community Updates */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900">{t('latestCommunityUpdates')}</h3>
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              Open Chat
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentChat.slice(-3).reverse().map((msg) => (
              <div key={msg.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">{msg.senderName}</span>
                  <span className="text-slate-500">{msg.locality}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparent Live API Monitoring Status Table */}
      <ApiMonitoringPanel />

      {/* Alert Details Modal */}
      {detailsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5 text-red-700">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-900">{activeZone.alertTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-700 leading-relaxed">{activeZone.alertMessage}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#F4F8FD] text-xs">
              <div>
                <div className="text-slate-500">Risk Score</div>
                <div className="font-bold font-mono-tabular text-slate-900">
                  {activeZone.riskScore !== null ? `${activeZone.riskScore} / 100` : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">River Discharge (GloFAS)</div>
                <div className="font-bold font-mono-tabular text-slate-900">
                  {activeZone.riverDischargeM3s !== null &&
                  activeZone.riverDischargeM3s !== undefined
                    ? `${activeZone.riverDischargeM3s} m³/s (max ${activeZone.riverDischargeMaxM3s ?? 'N/A'})`
                    : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Soil Moisture (0–1cm)</div>
                <div className="font-bold font-mono-tabular text-slate-900">
                  {activeZone.soilMoisturePct !== null
                    ? `${activeZone.soilMoisturePct}%`
                    : 'DATA UNAVAILABLE'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Precipitation Prob.</div>
                <div className="font-bold font-mono-tabular text-slate-900">
                  {activeZone.precipitationProbabilityPct !== null &&
                  activeZone.precipitationProbabilityPct !== undefined
                    ? `${activeZone.precipitationProbabilityPct}%`
                    : 'DATA UNAVAILABLE'}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-bold text-slate-800 mb-2">Mandatory Safety Actions</div>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {activeZone.safetyRecommendations.map((r, i) => (
                  <li key={i}>
                    {i + 1}. {r}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  setActiveTab('map');
                }}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
              >
                {t('findSafeRoute')}
              </button>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
