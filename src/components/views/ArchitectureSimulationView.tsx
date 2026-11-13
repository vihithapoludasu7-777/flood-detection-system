import React, { useEffect, useState } from 'react';
import { Activity, Cpu, Database, Play, Server, Zap } from 'lucide-react';
import type { ArchitectureMetrics } from '../../types.ts';

export const ArchitectureSimulationView: React.FC = () => {
  const [metrics, setMetrics] = useState<ArchitectureMetrics | null>(null);
  const [servedBy, setServedBy] = useState<string>('instance-1');
  const [simResidents, setSimResidents] = useState(100000);
  const [simSosBurst, setSimSosBurst] = useState(250);
  const [running, setRunning] = useState(false);

  const loadMetrics = async () => {
    const res = await fetch('/api/architecture/metrics');
    const inst = res.headers.get('x-alertnet-instance');
    if (inst) setServedBy(inst);
    if (res.ok) {
      const data = await res.json();
      setMetrics(data.metrics);
    }
  };

  useEffect(() => {
    void loadMetrics();
    const timer = setInterval(() => void loadMetrics(), 2500);
    return () => clearInterval(timer);
  }, []);

  const runSimulation = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residents: simResidents, sosBurst: simSosBurst }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
      }
    } finally {
      setRunning(false);
    }
  };

  if (!metrics) {
    return <div className="p-8 text-center text-slate-500">Loading architecture metrics...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header & Simulation Runner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-700" />
            Distributed Architecture & 100,000-Resident Load Simulation
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Dual stateless Express instances load-balanced on port 3000 · Custom RabbitMQ topic broker
            with exponential backoff & DLQ · Redis distributed locks, rate limiting & idempotency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs">
            <label className="text-slate-500 mr-1.5">Simulated Residents:</label>
            <input
              type="number"
              min={10000}
              max={250000}
              step={10000}
              value={simResidents}
              onChange={(e) => setSimResidents(Number(e.target.value))}
              className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono-tabular font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={() => void runSimulation()}
            disabled={running || metrics.simulationStats.isRunning}
            className="px-4 py-2.5 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Play className="w-4 h-4" />
            {running || metrics.simulationStats.isRunning
              ? 'Running Fanout Simulation...'
              : 'Run 100k Resident + SOS Simulation'}
          </button>
        </div>
      </div>

      {/* Dual Stateless Instances & External Integrations Honesty Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-700" />
              Active Stateless Application Instances ({metrics.instances.length})
            </h3>
            <span className="text-xs font-mono-tabular text-slate-500">
              Latest poll served by {servedBy}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics.instances.map((inst) => (
              <div key={inst.id} className="p-3.5 rounded-lg bg-[#F4F8FD] border border-slate-200 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>{inst.id}</span>
                  <span className="text-emerald-700">Active (:{inst.port})</span>
                </div>
                <div className="mt-2 font-mono-tabular text-slate-600 space-y-0.5">
                  <div>Requests handled: {inst.requestsHandled.toLocaleString()}</div>
                  <div>Uptime: {inst.uptimeSec}s</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono-tabular">
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-slate-500 font-sans">Redis Keys</div>
              <div className="font-bold text-slate-900 mt-0.5">{metrics.redis.keysCached}</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-slate-500 font-sans">Idempotency Hits</div>
              <div className="font-bold text-slate-900 mt-0.5">{metrics.redis.idempotencyHits}</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-slate-500 font-sans">MQ Published</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {metrics.rabbitmq.totalPublished.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-slate-500 font-sans">MQ Retries / DLQ</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {metrics.rabbitmq.totalRetries.toLocaleString()} / {metrics.rabbitmq.dlqCount}
              </div>
            </div>
          </div>
        </div>

        {/* External Integrations Status (Honest Demo Mode vs Configured) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-700" />
            Integration & Transport Status
          </h3>
          <div className="divide-y divide-slate-100 text-xs">
            {[
              {
                label: 'Web Push (VAPID Service Worker)',
                active: metrics.integrations.webPushVapid,
                activeText: 'Live VAPID Active',
                inactiveText: 'Unconfigured',
              },
              {
                label: 'Gemini AI (`gemini-4-hydrogen`)',
                active: metrics.integrations.geminiAI,
                activeText: 'Live Server API Key Configured',
                inactiveText: 'Deterministic Safety Fallback Mode',
              },
              {
                label: 'Email Transport (Nodemailer SMTP)',
                active: metrics.integrations.smtpEmail,
                activeText: 'Live SMTP Connected',
                inactiveText: 'Demo Audit Mode (SMTP_HOST unset)',
              },
              {
                label: 'SMS Gateway (Twilio REST)',
                active: metrics.integrations.twilioSms,
                activeText: 'Live Twilio Connected',
                inactiveText: 'Demo Audit Mode (TWILIO_* unset)',
              },
              {
                label: 'Google Maps Platform API Key',
                active: metrics.integrations.googleMapsClientKey,
                activeText: 'Google Maps Key Configured',
                inactiveText: 'Interactive Vector Flood Map Mode',
              },
              {
                label: 'PostgreSQL / Redis / RabbitMQ',
                active: metrics.integrations.postgresConfigured,
                activeText: 'External Cluster Configured',
                inactiveText: 'Built-in Durable Store + Custom Brokers Active',
              },
            ].map((row) => (
              <div key={row.label} className="py-2.5 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{row.label}</span>
                <span
                  className={`font-semibold ${
                    row.active ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {row.active ? row.activeText : row.inactiveText}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CLEARLY SEPARATED: Live Emergency Activity vs Simulation Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Production Activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              Actual Live Emergency Activity
            </h3>
            <span className="text-xs font-semibold text-emerald-700">Real Users & Live SOS</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#F4F8FD]">
              <div className="text-slate-500">Registered Users</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                {metrics.liveStats.registeredUsers}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F4F8FD]">
              <div className="text-slate-500">Live SOS Received</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                {metrics.liveStats.sosReceived}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F4F8FD]">
              <div className="text-slate-500">SOS Acknowledged</div>
              <div className="text-xl font-bold font-mono-tabular text-emerald-700 mt-1">
                {metrics.liveStats.sosAcknowledged}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F4F8FD]">
              <div className="text-slate-500">Live Push/SMTP Sent</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                {metrics.liveStats.notificationsDelivered}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F4F8FD]">
              <div className="text-slate-500">Demo Audited Alerts</div>
              <div className="text-xl font-bold font-mono-tabular text-blue-700 mt-1">
                {metrics.liveStats.notificationsDemoSimulated}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F4F8FD]">
              <div className="text-slate-500">Avg SOS Latency</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                {metrics.liveStats.avgSosLatencyMs} ms
              </div>
            </div>
          </div>
        </div>

        {/* Load Test Simulation Statistics */}
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-700" />
              High-Scale Load Simulation Metrics
            </h3>
            <span className="text-xs font-semibold text-blue-700">
              {metrics.simulationStats.lastRunAt ? 'Simulated Stress Test' : 'Ready to Run'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-blue-50/70">
              <div className="text-slate-600">Simulated Residents</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                {metrics.simulationStats.simulatedResidents.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50/70">
              <div className="text-slate-600">Alerts Generated (3ch)</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                {metrics.simulationStats.alertsGenerated.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50/70">
              <div className="text-slate-600">Successful Deliveries</div>
              <div className="text-xl font-bold font-mono-tabular text-emerald-700 mt-1">
                {metrics.simulationStats.successfulDeliveries.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50/70">
              <div className="text-slate-600">Failed / DLQ</div>
              <div className="text-xl font-bold font-mono-tabular text-red-700 mt-1">
                {metrics.simulationStats.failedDeliveries.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50/70">
              <div className="text-slate-600">Backoff Retries</div>
              <div className="text-xl font-bold font-mono-tabular text-amber-700 mt-1">
                {metrics.simulationStats.retryCount.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50/70">
              <div className="text-slate-600">SOS Received / Acked</div>
              <div className="text-xl font-bold font-mono-tabular text-emerald-700 mt-1">
                {metrics.simulationStats.sosReceived} / {metrics.simulationStats.sosAcknowledged}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 font-mono-tabular">
            <span>Queue Depth: {metrics.simulationStats.queueDepth.toLocaleString()}</span>
            <span>Avg Processing Latency: {metrics.simulationStats.avgLatencyMs} ms</span>
          </div>
        </div>
      </div>
    </div>
  );
};
