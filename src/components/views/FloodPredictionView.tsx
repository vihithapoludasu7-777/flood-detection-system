import React, { useMemo, useState } from 'react';
import { Clock, Info, Layers, TrendingUp } from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import { translateRiskLevel } from '../../i18n/translations.ts';
import { FloodVectorMap } from '../FloodVectorMap.tsx';
import type { LocationZone } from '../../types.ts';

export const FloodPredictionView: React.FC = () => {
  const {
    language,
    locations,
    facilities,
    rescueTeams,
    incidents,
    activeZone,
    setSelectedLocality,
    liveGps,
  } = useAlertNet();

  const [horizon, setHorizon] = useState<1 | 3 | 6 | 24>(3);

  // Project zone risk scores onto selected forecast horizon for the interactive map
  const projectedLocations: LocationZone[] = useMemo(() => {
    const base = locations.some((l) => l.name === activeZone?.name)
      ? locations
      : activeZone
      ? [activeZone, ...locations]
      : locations;
    return base.map((loc) => {
      const pred = loc.predictions.find((p) => p.horizonHours === horizon);
      if (!pred) return loc;
      return {
        ...loc,
        riskScore: pred.riskPercentage,
        riskLevel: pred.expectedSeverity,
      };
    });
  }, [locations, activeZone, horizon]);

  const activePrediction = activeZone?.predictions.find((p) => p.horizonHours === horizon);

  return (
    <div className="space-y-6">
      {/* Live Data & Forecast Transparency Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-blue-950">
            <strong>
              Live Hydrological & Meteorological Risk Model ({activeZone?.dataSource || 'loading'}):
            </strong>{' '}
            Deterministic risk scores are computed strictly from Open-Meteo observed & forecast
            rainfall, precipitation probability, surface soil moisture (0–1 cm), and GloFAS river
            discharge (m³/s). When GloFAS or weather feeds are unmapped or unavailable, fields report{' '}
            <strong>DATA UNAVAILABLE</strong> without synthetic values.
          </div>
        </div>
      </div>

      {/* Time Horizon Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-700" />
            Flood Detection & Multi-Horizon Forecast
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Observed time: {activeZone?.observationTimestamp || 'DATA UNAVAILABLE'} · Compare live
            observations with +1h, +3h, +6h, and +24h forecast windows.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {([1, 3, 6, 24] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                horizon === h
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              +{h} {h === 1 ? 'Hour' : 'Hours'}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Forecast Map + Active Zone Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-7 min-h-[420px]">
          <FloodVectorMap
            locations={projectedLocations}
            facilities={facilities}
            rescueTeams={rescueTeams}
            incidents={incidents}
            activeZone={
              projectedLocations.find((l) => l.name === activeZone?.name) ||
              projectedLocations[0] ||
              null
            }
            liveGps={liveGps}
            onSelectZone={(name) => setSelectedLocality(name)}
          />
        </div>

        <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          {activeZone && activePrediction ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">
                    {activePrediction.isForecast ? 'Forecast Window' : 'Selected Area'} ·{' '}
                    {activePrediction.estimatedWindow}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">{activeZone.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold font-mono-tabular text-blue-700">
                    {activePrediction.riskPercentage !== null
                      ? `${activePrediction.riskPercentage}%`
                      : 'N/A'}
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    {activePrediction.confidencePercentage !== null
                      ? `Confidence ${activePrediction.confidencePercentage}%`
                      : 'DATA UNAVAILABLE'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#F4F8FD] text-xs">
                <div>
                  <div className="text-slate-500">Expected Severity</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {translateRiskLevel(language, activePrediction.expectedSeverity)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Forecast Rainfall / Prob.</div>
                  <div className="font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {activePrediction.forecastRainfallMm !== null &&
                    activePrediction.forecastRainfallMm !== undefined
                      ? `${activePrediction.forecastRainfallMm} mm (${
                          activePrediction.precipitationProbabilityPct ?? 0
                        }%)`
                      : 'DATA UNAVAILABLE'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">River Discharge (GloFAS)</div>
                  <div className="font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {activeZone.riverDischargeM3s !== null &&
                    activeZone.riverDischargeM3s !== undefined
                      ? `${activeZone.riverDischargeM3s} m³/s`
                      : 'DATA UNAVAILABLE'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Soil Moisture (0–1cm)</div>
                  <div className="font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {activeZone.soilMoisturePct !== null
                      ? `${activeZone.soilMoisturePct}%`
                      : 'DATA UNAVAILABLE'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-700" />
                  Observed & Forecast Risk Explanation
                </div>
                <ul className="space-y-2 text-sm text-slate-700">
                  {activePrediction.reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-blue-700 mt-0.5">
                        0{idx + 1}.
                      </span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> GloFAS Time:{' '}
                  {activeZone.glofasTimestamp || 'DATA UNAVAILABLE'}
                </span>
                <span>Source: {activePrediction.dataSource}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Select a zone on the map to inspect forecast.</div>
          )}
        </div>
      </div>

      {/* Daily Forecast Matrix (Next Days Rainfall & GloFAS Discharge) */}
      {activeZone?.dailyForecast && activeZone.dailyForecast.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              5-Day Daily Rainfall & GloFAS River Discharge Forecast — {activeZone.name}
            </h3>
            <span className="text-xs text-slate-500">Forecast Data</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-xs">
            {activeZone.dailyForecast.map((d) => (
              <div key={d.date} className="p-3.5 space-y-1">
                <div className="font-mono-tabular font-bold text-slate-900">{d.date}</div>
                <div className="text-slate-600">
                  Rain:{' '}
                  <strong className="font-mono-tabular text-slate-900">
                    {d.precipitationSumMm !== null ? `${d.precipitationSumMm} mm` : 'N/A'}
                  </strong>
                </div>
                <div className="text-slate-600">
                  Max Prob:{' '}
                  <strong className="font-mono-tabular text-blue-700">
                    {d.precipitationProbabilityMaxPct !== null
                      ? `${d.precipitationProbabilityMaxPct}%`
                      : 'N/A'}
                  </strong>
                </div>
                <div className="text-slate-600">
                  River:{' '}
                  <strong className="font-mono-tabular text-slate-900">
                    {d.riverDischargeM3s !== null ? `${d.riverDischargeM3s} m³/s` : 'UNAVAILABLE'}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regional Forecast Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Monitored Cities & Zones (+{horizon}h Forecast Horizon)
          </h3>
          <span className="text-xs text-slate-500">Live Open-Meteo & GloFAS Dataset</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Expected Severity</th>
                <th className="py-3 px-4 text-right">Risk %</th>
                <th className="py-3 px-4 text-right">Observed Temp</th>
                <th className="py-3 px-4 text-right">Obs. Precip (mm)</th>
                <th className="py-3 px-4 text-right">Precip Prob.</th>
                <th className="py-3 px-4 text-right">River Discharge</th>
                <th className="py-3 px-4 text-right">Soil Moisture</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((loc) => {
                const pred = loc.predictions.find((p) => p.horizonHours === horizon);
                if (!pred) return null;
                return (
                  <tr
                    key={`${loc.id}-${loc.name}`}
                    onClick={() => setSelectedLocality(loc.name)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {loc.name}
                      <div className="text-[11px] font-normal text-slate-500">{loc.state}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-xs">
                      <span
                        className={
                          pred.expectedSeverity === 'CRITICAL'
                            ? 'text-red-700'
                            : pred.expectedSeverity === 'HIGH'
                            ? 'text-orange-700'
                            : pred.expectedSeverity === 'MEDIUM' ||
                              pred.expectedSeverity === 'MODERATE'
                            ? 'text-amber-700'
                            : pred.expectedSeverity === 'UNAVAILABLE'
                            ? 'text-slate-500'
                            : 'text-emerald-700'
                        }
                      >
                        {translateRiskLevel(language, pred.expectedSeverity)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-bold text-slate-900">
                      {pred.riskPercentage !== null ? `${pred.riskPercentage}%` : 'UNAVAIL'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                      {loc.temperatureC !== null ? `${loc.temperatureC}°C` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                      {loc.rainfallIntensityMmHr !== null ? loc.rainfallIntensityMmHr : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                      {loc.precipitationProbabilityPct !== null &&
                      loc.precipitationProbabilityPct !== undefined
                        ? `${loc.precipitationProbabilityPct}%`
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                      {loc.riverDischargeM3s !== null && loc.riverDischargeM3s !== undefined
                        ? `${loc.riverDischargeM3s} m³/s`
                        : 'UNAVAILABLE'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                      {loc.soilMoisturePct !== null ? `${loc.soilMoisturePct}%` : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
