import React, { useEffect, useState } from 'react';
import {
  BellRing,
  LocateFixed,
  RefreshCw,
  Send,
  ShieldAlert,
  Siren,
  Users,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import { ApiMonitoringPanel } from '../ApiMonitoringPanel.tsx';
import type {
  AIClassification,
  NotificationDeliveryRecord,
  RiskLevel,
  SOSStatus,
  UserProfile,
} from '../../types.ts';

interface DLQItem {
  id: string;
  queue: string;
  routingKey: string;
  attempts: number;
  error: string;
  failedAt: string;
}

export const AdminRescueView: React.FC = () => {
  const { user, token, activeZone, locations, incidents, rescueTeams, refreshDashboard } =
    useAlertNet();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDeliveryRecord[]>([]);
  const [dlq, setDlq] = useState<DLQItem[]>([]);

  // Broadcast Form
  const [alertLocality, setAlertLocality] = useState(activeZone?.name || 'Hyderabad');
  const [alertSeverity, setAlertSeverity] = useState<RiskLevel>('HIGH');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState(
    'Heavy rainfall and rising water levels detected. 1. Avoid flooded roads. 2. Move to higher ground. 3. Keep emergency supplies ready. 4. Contact rescue through SOS.'
  );
  const [testRetryDlq, setTestRetryDlq] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  const loadAdminOverview = async () => {
    const res = await fetch('/api/admin/overview');
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
      setDeliveries(data.deliveryLogs || []);
      setDlq(data.dlq || []);
    }
  };

  useEffect(() => {
    void loadAdminOverview();
    const t = setInterval(() => void loadAdminOverview(), 4000);
    return () => clearInterval(t);
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/alerts/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locality: alertLocality,
        severity: alertSeverity,
        title: alertTitle || `${alertSeverity} FLOOD WARNING – ${alertLocality.toUpperCase()}`,
        message: alertMessage,
        simulateTransientFailure: testRetryDlq,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setBroadcastStatus(
        `Broadcast published to ${data.announcement.geofencedRecipients} geofenced user(s) across ${data.queuedCount} channel tasks (served by ${data.instanceId}).`
      );
      await refreshDashboard();
      await loadAdminOverview();
    }
  };

  const updateIncident = async (
    id: string,
    patch: { status?: SOSStatus; assignedTeamId?: string; aiClassification?: AIClassification }
  ) => {
    const res = await fetch(`/api/sos/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await refreshDashboard();
    }
  };

  const moveRescueUnit = async (teamId: string, lat: number, lng: number) => {
    await fetch('/api/rescue/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId,
        lat: lat + (Math.random() - 0.5) * 0.004,
        lng: lng + (Math.random() - 0.5) * 0.004,
        status: 'Dispatched',
      }),
    });
    await refreshDashboard();
  };

  const replayDlq = async (id: string) => {
    await fetch(`/api/admin/dlq/${id}/replay`, { method: 'POST' });
    await loadAdminOverview();
  };

  const unresolvedIncidents = incidents.filter((i) => i.status !== 'Resolved');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Admin & Rescue Team Command Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active Role: <strong className="capitalize">{user?.role || 'Guest Observer'}</strong> ·
            Manage geofenced emergency alerts, AI SOS overrides, rescue unit dispatch, and delivery queues.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono-tabular">
          <span>
            Unresolved SOS: <strong className="text-red-700">{unresolvedIncidents.length}</strong>
          </span>
          <span>
            Registered Users: <strong className="text-slate-900">{users.length}</strong>
          </span>
          <span>
            DLQ Failed: <strong className="text-orange-700">{dlq.length}</strong>
          </span>
        </div>
      </div>

      {/* Geofenced Emergency Broadcast + Rescue Team Live Location */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleBroadcast}
          className="xl:col-span-6 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BellRing className="w-4 h-4 text-red-600" />
              Publish Geofenced Emergency Alert
            </h3>
            <label className="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={testRetryDlq}
                onChange={(e) => setTestRetryDlq(e.target.checked)}
              />
              Test Transient Retry
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Area</label>
              <select
                value={alertLocality}
                onChange={(e) => setAlertLocality(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
              <select
                value={alertSeverity}
                onChange={(e) => setAlertSeverity(e.target.value as RiskLevel)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          <input
            type="text"
            value={alertTitle}
            onChange={(e) => setAlertTitle(e.target.value)}
            placeholder={`Optional custom title (default: ${alertSeverity} FLOOD WARNING – ${alertLocality.toUpperCase()})`}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
          />

          <textarea
            rows={3}
            value={alertMessage}
            onChange={(e) => setAlertMessage(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
          />

          {broadcastStatus && (
            <div className="text-xs font-semibold text-emerald-700">{broadcastStatus}</div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 inline-flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            Trigger Geofenced Email, SMS & Web Push Alert
          </button>
        </form>

        {/* Rescue Teams Live Position & Dispatch */}
        <div className="xl:col-span-6 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Siren className="w-4 h-4 text-blue-700" />
            Rescue Team Units & Live GPS Broadcast
          </h3>
          <div className="space-y-3">
            {rescueTeams.map((team) => (
              <div
                key={team.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 text-sm">{team.name}</div>
                  <div className="text-slate-600 mt-0.5">
                    {team.unitCode} · {team.locality} · Status: <strong>{team.status}</strong>
                  </div>
                  <div className="font-mono-tabular text-slate-500 mt-0.5">
                    GPS: {team.lat.toFixed(4)}, {team.lng.toFixed(4)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void moveRescueUnit(team.id, team.lat, team.lng)}
                  className="px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 inline-flex items-center gap-1.5"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  Broadcast Live GPS Step
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SOS Incident Triage, Team Assignment & AI Override */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            SOS Incident Queue & AI Classification Overrides
          </h3>
          <span className="text-xs text-slate-500">Zero-discard policy active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Incident</th>
                <th className="py-3 px-4">Reports & Details</th>
                <th className="py-3 px-4">AI Severity (Override)</th>
                <th className="py-3 px-4">Assign Rescue Team</th>
                <th className="py-3 px-4">Rescue Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 align-top">
                    <div className="font-mono-tabular font-bold text-slate-900">{inc.id}</div>
                    <div className="text-slate-500 mt-0.5">{inc.locality}</div>
                    <div className="text-slate-400 font-mono-tabular mt-0.5">
                      {inc.reportCount} report(s)
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top max-w-xs">
                    <div className="text-slate-800 font-medium">
                      {inc.reports[0]?.description}
                    </div>
                    <div className="text-slate-500 mt-1">AI: {inc.aiReasoning}</div>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <select
                      value={inc.aiClassification}
                      onChange={(e) =>
                        void updateIncident(inc.id, {
                          aiClassification: e.target.value as AIClassification,
                        })
                      }
                      className="px-2.5 py-1.5 rounded border border-slate-200 bg-white font-semibold"
                    >
                      <option value="Critical">Critical</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Informational">Informational</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <select
                      value={inc.assignedTeamId || ''}
                      onChange={(e) =>
                        void updateIncident(inc.id, { assignedTeamId: e.target.value })
                      }
                      className="px-2.5 py-1.5 rounded border border-slate-200 bg-white"
                    >
                      <option value="">Unassigned</option>
                      {rescueTeams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <select
                      value={inc.status}
                      onChange={(e) =>
                        void updateIncident(inc.id, { status: e.target.value as SOSStatus })
                      }
                      className="px-2.5 py-1.5 rounded border border-slate-200 bg-white font-semibold"
                    >
                      <option value="Received">Received</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Rescue Team Assigned">Rescue Team Assigned</option>
                      <option value="Team on the Way">Team on the Way</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notification Delivery Audit & DLQ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              Notification Delivery Tracking (SMS / Email / Web Push)
            </h3>
            <span className="text-xs text-slate-500">Latest {deliveries.length} tasks</span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-4">Recipient</th>
                  <th className="py-2.5 px-4">Channel</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Attempts</th>
                  <th className="py-2.5 px-4">Worker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.slice(0, 20).map((d) => (
                  <tr key={d.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{d.recipientLabel}</td>
                    <td className="py-2.5 px-4 uppercase font-mono-tabular">{d.channel}</td>
                    <td className="py-2.5 px-4 font-semibold">
                      <span
                        className={
                          d.status === 'delivered'
                            ? 'text-emerald-700'
                            : d.status === 'demo_simulated'
                            ? 'text-blue-700'
                            : d.status === 'retrying'
                            ? 'text-amber-700'
                            : d.status === 'dlq_failed'
                            ? 'text-red-700'
                            : 'text-slate-500'
                        }
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular">{d.attempts}</td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-500">
                      {d.workerInstance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Registered Users by Area</h3>
            <Users className="w-4 h-4 text-blue-700" />
          </div>
          <div className="divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto">
            {users.map((u) => (
              <div key={u.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{u.fullName}</div>
                  <div className="text-slate-500 capitalize">
                    {u.role} · {u.locality}
                  </div>
                </div>
                <span className="font-mono-tabular text-slate-400">{u.mobile}</span>
              </div>
            ))}
          </div>

          {dlq.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-red-700">Dead-Letter Queue ({dlq.length})</div>
              {dlq.map((item) => (
                <div key={item.id} className="p-2.5 rounded bg-red-50 border border-red-200 text-xs">
                  <div className="font-mono-tabular font-semibold">{item.queue}</div>
                  <div className="text-red-800 mt-0.5">{item.error}</div>
                  <button
                    type="button"
                    onClick={() => void replayDlq(item.id)}
                    className="mt-1.5 text-blue-700 font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Replay Message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Live API Monitoring Panel in Command Center */}
      <ApiMonitoringPanel />
    </div>
  );
};
