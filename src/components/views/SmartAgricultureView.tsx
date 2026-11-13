import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  Bug,
  CloudRain,
  Droplets,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import type { AgricultureInput, AgricultureRecommendation } from '../../types.ts';

export const SmartAgricultureView: React.FC = () => {
  const { activeZone, locations, language } = useAlertNet();

  const [form, setForm] = useState<AgricultureInput>({
    location: activeZone?.name || 'Hyderabad',
    landAreaAcres: 4,
    soilType: 'Black Cotton',
    irrigationAvailable: 'Borewell',
    currentCrop: 'Paddy',
    sowingSeason: 'Kharif',
    pestSymptoms: '',
  });

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<AgricultureRecommendation | null>(null);
  const [analyzedZone, setAnalyzedZone] = useState(activeZone);

  const selectedFormZone =
    locations.find((l) => l.name.toLowerCase() === form.location.toLowerCase()) ||
    (activeZone?.name.toLowerCase() === form.location.toLowerCase() ? activeZone : undefined);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/agriculture/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: form,
          language,
          lat: selectedFormZone?.lat,
          lng: selectedFormZone?.lng,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
        setAnalyzedZone(data.zone);
      }
    } finally {
      setLoading(false);
    }
  };

  const zone = analyzedZone || activeZone;

  return (
    <div className="space-y-6">
      {/* Farm Profile Form + Live Agri Telemetry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleAnalyze}
          className="xl:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4"
        >
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sprout className="w-5 h-5 text-emerald-600" />
              Smart Agriculture – AI Farming Assistant
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your field profile for weather-aware crop, IPM pest, and flood-protection guidance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                {activeZone &&
                  !locations.some((l) => l.name.toLowerCase() === activeZone.name.toLowerCase()) && (
                    <option value={activeZone.name}>
                      {activeZone.name} ({activeZone.riskLevel})
                    </option>
                  )}
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.name}>
                    {loc.name} ({loc.riskLevel})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Land Area (Acres)
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={form.landAreaAcres}
                onChange={(e) => setForm({ ...form, landAreaAcres: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Soil Type</label>
              <select
                value={form.soilType}
                onChange={(e) =>
                  setForm({ ...form, soilType: e.target.value as AgricultureInput['soilType'] })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="Black Cotton">Black Cotton</option>
                <option value="Red Sandy Loam">Red Sandy Loam</option>
                <option value="Alluvial">Alluvial</option>
                <option value="Clay Loam">Clay Loam</option>
                <option value="Laterite">Laterite</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Available Irrigation
              </label>
              <select
                value={form.irrigationAvailable}
                onChange={(e) =>
                  setForm({
                    ...form,
                    irrigationAvailable: e.target.value as AgricultureInput['irrigationAvailable'],
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="Borewell">Borewell</option>
                <option value="Canal">Canal</option>
                <option value="Rainfed">Rainfed</option>
                <option value="Drip">Drip</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Current Crop</label>
              <input
                type="text"
                value={form.currentCrop}
                onChange={(e) => setForm({ ...form, currentCrop: e.target.value })}
                placeholder="e.g. Paddy, Maize, Cotton"
                className="w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sowing Season</label>
              <select
                value={form.sowingSeason}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sowingSeason: e.target.value as AgricultureInput['sowingSeason'],
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="Kharif">Kharif (Monsoon)</option>
                <option value="Rabi">Rabi (Winter)</option>
                <option value="Zaid">Zaid (Summer)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observed Pest / Disease Symptoms (Optional)
            </label>
            <textarea
              rows={2}
              value={form.pestSymptoms}
              onChange={(e) => setForm({ ...form, pestSymptoms: e.target.value })}
              placeholder="e.g. Yellowing leaf tips, brown spots, stem borer holes..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? 'Analyzing Soil, Weather & Flood Risk...' : 'Generate AI Farming Advisory'}
          </button>
        </form>

        {/* Farming Environmental Dashboard */}
        <div className="xl:col-span-7 space-y-5">
          {zone && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Field Weather & Flood Telemetry ({zone.name})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live Open-Meteo agromet & GloFAS hydrological feed ({zone.dataSource})
                  </p>
                </div>
                <span
                  className={`text-xs font-bold ${
                    zone.riskLevel === 'CRITICAL' || zone.riskLevel === 'HIGH'
                      ? 'text-red-700'
                      : zone.riskLevel === 'MEDIUM' || zone.riskLevel === 'MODERATE'
                      ? 'text-amber-700'
                      : zone.riskLevel === 'UNAVAILABLE'
                      ? 'text-slate-600'
                      : 'text-emerald-700'
                  }`}
                >
                  Flood Risk: {zone.riskLevel} (
                  {zone.riskScore !== null ? `${zone.riskScore}/100` : 'DATA UNAVAILABLE'})
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#F4F8FD]">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-blue-700" /> Soil Moisture
                  </div>
                  <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-1">
                    {zone.soilMoisturePct !== null ? `${zone.soilMoisturePct}%` : 'N/A'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#F4F8FD]">
                  <div className="text-slate-500 flex items-center gap-1">
                    <CloudRain className="w-3.5 h-3.5 text-blue-700" /> 24h Rain Forecast
                  </div>
                  <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-1">
                    {zone.historicalRainfall24hMm !== null
                      ? `${zone.historicalRainfall24hMm} mm`
                      : 'N/A'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#F4F8FD]">
                  <div className="text-slate-500">Humidity</div>
                  <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-1">
                    {zone.humidityPct !== null ? `${zone.humidityPct}%` : 'N/A'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#F4F8FD]">
                  <div className="text-slate-500">River Discharge</div>
                  <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-1">
                    {zone.riverDischargeM3s !== null && zone.riverDischargeM3s !== undefined
                      ? `${zone.riverDischargeM3s} m³/s`
                      : 'UNAVAIL'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!plan ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              Submit your farm profile on the left to view AI crop suitability, weather-based schedules,
              IPM-first pest safety guidance, and verified agricultural expert advisories.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Agricultural Flood Protection Banner */}
              <div
                className={`rounded-xl border p-5 ${
                  plan.floodAlertForFarm.active
                    ? 'bg-orange-50 border-orange-200 text-orange-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-base">
                  <AlertTriangle className="w-5 h-5" />
                  Agricultural Flood Protection ({plan.floodAlertForFarm.severity})
                </div>
                <p className="text-sm mt-1.5 leading-relaxed">{plan.floodAlertForFarm.summary}</p>
                <ul className="mt-3 space-y-1 text-xs">
                  {plan.floodAlertForFarm.actions.map((act, i) => (
                    <li key={i}>
                      {i + 1}. {act}
                    </li>
                  ))}
                </ul>
              </div>

              {/* AI-Generated Recommendations Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900">
                    AI-Generated Crop & Weather Plan
                  </h3>
                  <span className="text-xs text-blue-700 font-semibold">
                    AI Generated ({plan.generatedBy}) · Not a substitute for local KVK inspection
                  </span>
                </div>

                {/* Crop Suitability */}
                <div className="space-y-2.5">
                  {plan.cropRecommendations.map((c) => (
                    <div
                      key={c.crop}
                      className="p-3.5 rounded-lg bg-[#F4F8FD] border border-slate-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-sm text-slate-900">{c.crop}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{c.reason}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular text-sm font-bold text-emerald-700">
                          {c.suitabilityScore}% Match
                        </div>
                        <div className="text-[11px] text-slate-500">Water: {c.waterRequirement}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Weather-based schedule */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                  <div className="p-3 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-800">Best Sowing Window</div>
                    <p className="text-slate-600 mt-1">{plan.weatherFarmingPlan.bestSowingWindow}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-800">Irrigation Schedule</div>
                    <p className="text-slate-600 mt-1">{plan.weatherFarmingPlan.irrigationSchedule}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-800">Harvesting Advice</div>
                    <p className="text-slate-600 mt-1">{plan.weatherFarmingPlan.harvestingAdvice}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-800">Field Drainage Measures</div>
                    <ul className="text-slate-600 mt-1 space-y-1">
                      {plan.weatherFarmingPlan.drainageMeasures.map((d, i) => (
                        <li key={i}>• {d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* IPM-First Pest & Disease Management */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-base text-slate-900">
                  <Bug className="w-5 h-5 text-amber-600" />
                  Integrated Pest & Disease Management (IPM First)
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  Risk Assessment: {plan.pestManagement.identifiedRisk}
                </p>
                <ol className="space-y-1.5 text-sm text-slate-700">
                  {plan.pestManagement.ipmSteps.map((step, i) => (
                    <li key={i}>
                      {i + 1}. {step}
                    </li>
                  ))}
                </ol>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                  <div>
                    <strong>Registered Product Safety:</strong> {plan.pestManagement.registeredProductGuidance}
                  </div>
                  <div>
                    <strong>Protective Equipment (PPE):</strong> {plan.pestManagement.ppeAndSafety}
                  </div>
                  <div>
                    <strong>Pre-Harvest Waiting Period:</strong> {plan.pestManagement.waitingPeriodNote}
                  </div>
                </div>
              </div>

              {/* Verified Agricultural Expert Advisories (Distinct from AI output) */}
              <div className="bg-emerald-50/70 rounded-xl border border-emerald-200 p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-base text-emerald-950">
                  <BookOpenCheck className="w-5 h-5 text-emerald-700" />
                  Verified Agricultural Expert Advisories (Official Reference)
                </div>
                <div className="space-y-3">
                  {plan.verifiedExpertAdvisories.map((adv, idx) => (
                    <div key={idx} className="bg-white rounded-lg border border-emerald-200 p-3.5 text-xs">
                      <div className="flex items-center justify-between text-emerald-800 font-bold">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> {adv.source}
                        </span>
                        <span className="font-mono-tabular">{adv.publishedDate}</span>
                      </div>
                      <div className="font-semibold text-slate-900 mt-1">{adv.title}</div>
                      <p className="text-slate-600 mt-1 leading-relaxed">{adv.guidance}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
