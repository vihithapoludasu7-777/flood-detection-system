import React, { useState } from 'react';
import {
  CheckCircle2,
  LocateFixed,
  MapPin,
  ShieldCheck,
  Siren,
  WifiOff,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import { translateSOSCategory, translateSOSStatus } from '../../i18n/translations.ts';
import type { SOSCategory, SOSIncident, SOSStatus } from '../../types.ts';

const CATEGORIES: SOSCategory[] = [
  'people_trapped',
  'medical_emergency',
  'house_flooding',
  'food_water_required',
  'missing_person',
  'rescue_assistance',
];

const STATUS_STEPS: SOSStatus[] = [
  'Received',
  'Under Review',
  'Rescue Team Assigned',
  'Team on the Way',
  'Resolved',
];

export const EmergencySOSView: React.FC = () => {
  const {
    t,
    language,
    user,
    token,
    activeZone,
    incidents,
    rescueTeams,
    isOnline,
    queuedSos,
    enqueueOfflineSOS,
    flushOfflineSos,
    refreshDashboard,
  } = useAlertNet();

  const [category, setCategory] = useState<SOSCategory>('people_trapped');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState(user?.fullName || '');
  const [reporterMobile, setReporterMobile] = useState(user?.mobile || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [ackResult, setAckResult] = useState<{
    incident: SOSIncident;
    groupedIntoExisting: boolean;
    aiSource: string;
  } | null>(null);
  const [offlineMsg, setOfflineMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const captureGPS = () => {
    setCapturingGps(true);
    setErrorMsg(null);
    if (!navigator.geolocation) {
      if (activeZone) setCoords({ lat: activeZone.lat, lng: activeZone.lng });
      setCapturingGps(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
        setCapturingGps(false);
      },
      () => {
        if (activeZone) {
          setCoords({ lat: activeZone.lat, lng: activeZone.lng });
        }
        setCapturingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleSubmitSOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('Please briefly describe your emergency situation.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setOfflineMsg(null);

    const lat = coords?.lat ?? activeZone?.lat ?? 17.385;
    const lng = coords?.lng ?? activeZone?.lng ?? 78.4867;
    const idempotencyKey = `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      idempotencyKey,
      category,
      description: description.trim(),
      lat,
      lng,
      locality: activeZone?.name || 'Hyderabad',
      reporterName: reporterName || user?.fullName || 'Citizen Reporter',
      reporterMobile: reporterMobile || user?.mobile || '+91 98480 00000',
      queuedAt: new Date().toISOString(),
    };

    if (!isOnline || simulateOffline) {
      enqueueOfflineSOS(payload);
      setOfflineMsg(
        `Offline Queue Saved (Key: ${idempotencyKey}). Your SOS will auto-submit immediately when connectivity is restored.`
      );
      setDescription('');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to submit SOS.');
      } else {
        setAckResult({
          incident: data.incident,
          groupedIntoExisting: Boolean(data.groupedIntoExisting),
          aiSource: data.aiSource,
        });
        setDescription('');
        await refreshDashboard();
      }
    } catch {
      enqueueOfflineSOS(payload);
      setOfflineMsg(
        'Connection interrupted — SOS saved to local offline queue and will auto-retry when online.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Offline Queued Banner */}
      {queuedSos.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-amber-900">
            <WifiOff className="w-5 h-5 text-amber-700" />
            <span>
              {queuedSos.length} SOS report(s) {t('queuedOfflineBanner')}
            </span>
          </div>
          {isOnline && (
            <button
              type="button"
              onClick={() => void flushOfflineSos()}
              className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800"
            >
              Submit Queued Reports Now
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* SOS Submission Form */}
        <form
          onSubmit={handleSubmitSOS}
          className="xl:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Siren className="w-5 h-5 text-red-600" />
                {t('navSos')}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Zero-loss idempotent submission · Geo-clusters duplicate nearby reports without discarding any request.
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={simulateOffline}
                onChange={(e) => setSimulateOffline(e.target.checked)}
                className="rounded border-slate-300"
              />
              Test Offline Queue
            </label>
          </div>

          {/* Emergency Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {t('emergencyType')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-colors ${
                    category === cat
                      ? 'bg-red-600 border-red-700 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {translateSOSCategory(language, cat)}
                </button>
              ))}
            </div>
          </div>

          {/* GPS Location Capture */}
          <div className="p-3.5 rounded-lg bg-[#F4F8FD] border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-700" />
                GPS Location ({activeZone?.name || 'Hyderabad'})
              </div>
              <div className="font-mono-tabular text-slate-600 mt-0.5">
                {coords
                  ? `${coords.lat}, ${coords.lng} (GPS locked)`
                  : activeZone
                  ? `${activeZone.lat.toFixed(4)}, ${activeZone.lng.toFixed(4)} (${activeZone.name} coordinates)`
                  : 'Waiting for location...'}
              </div>
            </div>
            <button
              type="button"
              onClick={captureGPS}
              disabled={capturingGps}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <LocateFixed className="w-3.5 h-3.5 text-blue-700" />
              {capturingGps ? t('capturingGps') : 'Capture My GPS'}
            </button>
          </div>

          {/* Reporter Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
              <input
                type="tel"
                value={reporterMobile}
                onChange={(e) => setReporterMobile(e.target.value)}
                placeholder="+91 98480..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Situation Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('describeSituation')}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Example: 4 family members including 1 child trapped on 2nd floor, water rising outside main gate..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </div>

          {errorMsg && <div className="text-xs font-semibold text-red-700">{errorMsg}</div>}
          {offlineMsg && <div className="text-xs font-semibold text-amber-800">{offlineMsg}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
          >
            <Siren className="w-5 h-5" />
            {submitting ? 'Submitting Durably...' : t('sendSosNow')}
          </button>
        </form>

        {/* Acknowledgement & Live Rescue Tracking */}
        <div className="xl:col-span-6 space-y-5">
          {ackResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <CheckCircle2 className="w-5 h-5" />
                {t('sosAcknowledged')} · {ackResult.incident.id}
              </div>
              <div className="text-xs text-emerald-900 leading-relaxed">
                {ackResult.groupedIntoExisting
                  ? `Grouped into active nearby incident (${ackResult.incident.reportCount} total reports preserved) to coordinate unified rescue dispatch.`
                  : `New emergency incident created on ${ackResult.incident.processingInstanceId} in ${ackResult.incident.processingLatencyMs} ms.`}
              </div>
              <div className="p-3 rounded-lg bg-white border border-emerald-200 text-xs space-y-1">
                <div>
                  <strong>AI Severity:</strong>{' '}
                  <span
                    className={
                      ackResult.incident.aiClassification === 'Critical'
                        ? 'text-red-700 font-bold'
                        : 'text-orange-700 font-bold'
                    }
                  >
                    {ackResult.incident.aiClassification}
                  </span>{' '}
                  <span className="text-slate-500">({ackResult.aiSource})</span>
                </div>
                <div className="text-slate-600">{ackResult.incident.aiReasoning}</div>
              </div>
            </div>
          )}

          {/* Active SOS Incidents Tracker */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Active SOS Incidents & Rescue Status
              </h3>
              <span className="text-xs font-mono-tabular text-slate-500">
                {incidents.length} total
              </span>
            </div>

            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {incidents.map((inc) => {
                const currentStepIdx = STATUS_STEPS.indexOf(inc.status);
                const team = rescueTeams.find((tm) => tm.id === inc.assignedTeamId);

                return (
                  <div
                    key={inc.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tabular text-xs font-bold text-slate-900">
                          {inc.id}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {translateSOSCategory(language, inc.primaryCategory)}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-500">{inc.locality}</span>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          inc.aiClassification === 'Critical'
                            ? 'text-red-700'
                            : inc.aiClassification === 'Urgent'
                            ? 'text-orange-700'
                            : 'text-blue-700'
                        }`}
                      >
                        AI: {inc.aiClassification}
                        {inc.overriddenByAdmin ? ' (Admin Verified)' : ''}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong>AI Classification Reason:</strong> {inc.aiReasoning}
                    </p>

                    {/* 5-step Rescue Progress */}
                    <div className="grid grid-cols-5 gap-1 pt-1">
                      {STATUS_STEPS.map((st, idx) => {
                        const active = idx <= currentStepIdx;
                        return (
                          <div key={st} className="text-center">
                            <div
                              className={`h-1.5 rounded-full ${
                                active ? 'bg-blue-700' : 'bg-slate-200'
                              }`}
                            />
                            <div
                              className={`mt-1 text-[10px] leading-tight ${
                                active ? 'font-bold text-blue-800' : 'text-slate-400'
                              }`}
                            >
                              {translateSOSStatus(language, st)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                        <span>
                          {t('assignedRescueTeam')}:{' '}
                          <strong>{inc.assignedTeamName || 'Awaiting Dispatch'}</strong>
                        </span>
                      </div>
                      {team && (
                        <span className="font-mono-tabular text-slate-500">
                          Live Unit GPS: {team.lat.toFixed(4)}, {team.lng.toFixed(4)}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono-tabular">
                      Clustered Reports: {inc.reportCount} · Processed by {inc.processingInstanceId} ({inc.processingLatencyMs}ms)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
