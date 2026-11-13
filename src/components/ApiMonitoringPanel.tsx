import React, { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { useAlertNet } from '../context/AlertNetContext.tsx';

export const ApiMonitoringPanel: React.FC = () => {
  const { apiStatuses, refreshMonitoring } = useAlertNet();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshMonitoring();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-700" />
            Live API Integration & Data Feed Monitoring
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Transparent HTTP status, upstream provider endpoints, actual observation timestamps, and unavailable feed diagnostics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh API Status
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="py-3 px-4">API Provider</th>
              <th className="py-3 px-4">Endpoint</th>
              <th className="py-3 px-4">HTTP</th>
              <th className="py-3 px-4">Last Check</th>
              <th className="py-3 px-4">Actual Data Timestamp</th>
              <th className="py-3 px-4">Data Source</th>
              <th className="py-3 px-4">Status / Error Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {apiStatuses.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 px-4 text-slate-500 text-center">
                  Waiting for first live API telemetry check...
                </td>
              </tr>
            ) : (
              apiStatuses.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    <div>{item.provider}</div>
                    {item.locationLabel && (
                      <div className="text-[11px] font-normal text-slate-500">
                        {item.locationLabel}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-600 max-w-xs break-all">
                    {item.endpoint}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular font-bold whitespace-nowrap">
                    <span
                      className={
                        item.httpStatus && item.httpStatus >= 200 && item.httpStatus < 300
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }
                    >
                      {item.httpStatus ?? 'N/A'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                    {item.lastUpdatedAt
                      ? new Date(item.lastUpdatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                    {item.dataTimestamp || 'DATA UNAVAILABLE'}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                    {item.dataSource}
                  </td>
                  <td className="py-3 px-4 max-w-sm">
                    <div
                      className={`font-semibold ${
                        item.status === 'live'
                          ? 'text-emerald-700'
                          : item.status === 'unavailable'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {item.status === 'live'
                        ? 'LIVE'
                        : item.status === 'unavailable'
                        ? 'DATA UNAVAILABLE'
                        : 'ERROR'}
                    </div>
                    {item.errorMessage && (
                      <div className="text-slate-600 mt-0.5 leading-snug">{item.errorMessage}</div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
