import React, { useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  KeyRound,
  LocateFixed,
  LogOut,
  Mail,
  MessageSquareText,
  ServerCog,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import type { UserRole } from '../../types.ts';

export const ProfileAndSettingsView: React.FC = () => {
  const {
    user,
    locations,
    login,
    register,
    logout,
    updateProfile,
    pushSupported,
    pushSubscribed,
    subscribeToPush,
    selectedLocality,
  } = useAlertNet();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [subTab, setSubTab] = useState<'account' | 'notifications' | 'setup'>('account');
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('citizen@alertnet.in');
  const [loginPassword, setLoginPassword] = useState('alertnet123');

  // Register fields
  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    password: '',
    role: 'citizen' as UserRole,
    state: 'Telangana',
    district: 'Medchal-Malkajgiri',
    locality: 'Kukatpally',
    lat: 17.4849,
    lng: 78.4138,
    locationPermissionGranted: false,
  });

  // Editable preferences
  const [resLocality, setResLocality] = useState(user?.locality || selectedLocality);
  const [prefs, setPrefs] = useState(
    user?.notificationPrefs || {
      email: true,
      sms: true,
      push: true,
      minSeverity: 'HIGH' as const,
      agriculturalFloodAlerts: false,
    }
  );

  const captureRegLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRegForm((prev) => ({
          ...prev,
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          locationPermissionGranted: true,
        }));
        setStatusMsg('Current GPS location captured for residential alerting.');
      },
      () => {
        setRegForm((prev) => ({ ...prev, locationPermissionGranted: true }));
      }
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setAuthError(null);
    const res = await login(loginEmail, loginPassword);
    setBusy(false);
    if (!res.ok) setAuthError(res.error || 'Login failed');
    else setStatusMsg('Signed in successfully.');
  };

  const quickDemoLogin = async (email: string) => {
    setBusy(true);
    setAuthError(null);
    const res = await login(email, 'alertnet123');
    setBusy(false);
    if (!res.ok) setAuthError(res.error || 'Demo sign-in failed');
    else setStatusMsg(`Signed in as ${email}`);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setAuthError(null);
    const res = await register(regForm);
    setBusy(false);
    if (!res.ok) setAuthError(res.error || 'Registration failed');
    else setStatusMsg('Account created and residential geofence saved.');
  };

  const handleSavePrefs = async () => {
    setBusy(true);
    const res = await updateProfile({
      locality: resLocality,
      notificationPrefs: prefs,
    });
    setBusy(false);
    if (res.ok) setStatusMsg('Residential location and notification preferences saved.');
    else setAuthError(res.error || 'Failed to update profile.');
  };

  const handleEnablePush = async () => {
    setBusy(true);
    const res = await subscribeToPush();
    setBusy(false);
    setStatusMsg(res.message);
  };

  const handleSendTestPush = async () => {
    setBusy(true);
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locality: user?.locality || selectedLocality }),
    });
    setBusy(false);
    if (res.ok) {
      setStatusMsg(
        'Test emergency broadcast published to RabbitMQ Push, Email, and SMS workers.'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs inline-flex flex-wrap gap-1">
        {(
          [
            ['account', 'Account & Residential Location'],
            ['notifications', 'Emergency Alert Channels & Web Push'],
            ['setup', 'Deployment & Integration Setup Guide'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === key
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          {statusMsg}
        </div>
      )}

      {authError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs font-semibold text-red-800">
          {authError}
        </div>
      )}

      {subTab === 'account' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Signed-in Profile OR Auth Forms */}
          <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
            {user ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="text-xs font-semibold text-blue-700 uppercase">
                      Role: {user.role}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-0.5">{user.fullName}</h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {user.email} · {user.mobile}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Registered Residential Locality
                    </label>
                    <select
                      value={resLocality}
                      onChange={(e) => setResLocality(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.name}>
                          {loc.name} ({loc.district}, {loc.state})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Registered Geofence Coordinates
                    </label>
                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono-tabular text-xs text-slate-700">
                      {user.registeredLat.toFixed(4)}, {user.registeredLng.toFixed(4)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSavePrefs()}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50"
                >
                  Save Residential Location & Preferences
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      mode === 'login' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5 inline mr-1" /> Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      mode === 'register'
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5 inline mr-1" /> Register New Account
                  </button>
                </div>

                {mode === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
                    >
                      {busy ? 'Signing In...' : 'Sign In'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={regForm.fullName}
                          onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Role
                        </label>
                        <select
                          value={regForm.role}
                          onChange={(e) =>
                            setRegForm({ ...regForm, role: e.target.value as UserRole })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="citizen">Citizen</option>
                          <option value="farmer">Farmer</option>
                          <option value="rescue">Rescue Team</option>
                          <option value="admin">Government Administrator</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          required
                          value={regForm.email}
                          onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Mobile Number
                        </label>
                        <input
                          type="tel"
                          required
                          value={regForm.mobile}
                          onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value })}
                          placeholder="+91 98480..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={regForm.state}
                          onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          District
                        </label>
                        <input
                          type="text"
                          value={regForm.district}
                          onChange={(e) => setRegForm({ ...regForm, district: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Village / Locality
                        </label>
                        <select
                          value={regForm.locality}
                          onChange={(e) => setRegForm({ ...regForm, locality: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                        >
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.name}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Password
                        </label>
                        <input
                          type="password"
                          required
                          value={regForm.password}
                          onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#F4F8FD] border border-slate-200 text-xs">
                      <span>
                        GPS Permission:{' '}
                        {regForm.locationPermissionGranted
                          ? `${regForm.lat}, ${regForm.lng}`
                          : 'Optional — uses locality coordinates'}
                      </span>
                      <button
                        type="button"
                        onClick={captureRegLocation}
                        className="px-2.5 py-1.5 rounded bg-white border border-slate-300 font-semibold inline-flex items-center gap-1"
                      >
                        <LocateFixed className="w-3.5 h-3.5 text-blue-700" />
                        Capture GPS
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
                    >
                      {busy ? 'Creating Account...' : 'Create AlertNet Account'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Right: Quick Role Switcher for Demo / Testing */}
          <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 font-bold text-base text-slate-900">
              <UserCheck className="w-5 h-5 text-blue-700" />
              Role-Based Demo Accounts
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sign in instantly with any pre-configured AlertNet role (password:{' '}
              <code className="font-mono-tabular">alertnet123</code>) to inspect role-specific
              dashboards and permissions:
            </p>
            <div className="space-y-2.5">
              {[
                {
                  email: 'citizen@alertnet.in',
                  role: 'Citizen',
                  desc: 'Kukatpally resident · SOS, Safe Map, Community Chat & Web Push alerts',
                },
                {
                  email: 'farmer@alertnet.in',
                  role: 'Farmer',
                  desc: 'Miyapur grower · Agricultural flood warnings & AI crop/pest advisor',
                },
                {
                  email: 'rescue@alertnet.in',
                  role: 'Rescue Team',
                  desc: 'NDRF Unit-04 · Assigned incidents, live unit GPS & rescue status updates',
                },
                {
                  email: 'admin@alertnet.in',
                  role: 'Government Administrator',
                  desc: 'SDMA Control · Geofenced alert broadcasts, AI overrides, DLQ & 100k load test',
                },
              ].map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => void quickDemoLogin(acc.email)}
                  className="w-full text-left p-3.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                    <span>{acc.role}</span>
                    <span className="text-xs font-mono-tabular text-blue-700">{acc.email}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{acc.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BellRing className="w-5 h-5 text-blue-700" />
              Web Push Notifications (Offline & Background)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              AlertNet registers a Service Worker push subscription using VAPID keys so critical flood
              warnings arrive even when the website is closed or the browser is minimized.
            </p>
            <div className="p-3.5 rounded-lg bg-[#F4F8FD] border border-slate-200 text-xs flex items-center justify-between">
              <span>Browser Push Status</span>
              <span className="font-bold text-slate-900">
                {!pushSupported
                  ? 'Unsupported Browser'
                  : pushSubscribed
                  ? 'Subscribed (Active)'
                  : 'Not Subscribed'}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleEnablePush()}
                disabled={!pushSupported || busy}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
              >
                {pushSubscribed ? 'Refresh Push Subscription' : 'Enable Background Web Push'}
              </button>
              <button
                type="button"
                onClick={() => void handleSendTestPush()}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Trigger Test Emergency Broadcast
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Channel Preferences (Email, SMS & Web Push)
            </h3>
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <Mail className="w-4 h-4 text-blue-700" /> Email Emergency Alerts
                </span>
                <input
                  type="checkbox"
                  checked={prefs.email}
                  onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <MessageSquareText className="w-4 h-4 text-blue-700" /> SMS Emergency Alerts
                </span>
                <input
                  type="checkbox"
                  checked={prefs.sms}
                  onChange={(e) => setPrefs({ ...prefs, sms: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <BellRing className="w-4 h-4 text-blue-700" /> Web Push Notifications
                </span>
                <input
                  type="checkbox"
                  checked={prefs.push}
                  onChange={(e) => setPrefs({ ...prefs, push: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                <span className="font-medium text-slate-800">
                  Agricultural Flood Protection Alerts
                </span>
                <input
                  type="checkbox"
                  checked={prefs.agriculturalFloodAlerts}
                  onChange={(e) =>
                    setPrefs({ ...prefs, agriculturalFloodAlerts: e.target.checked })
                  }
                />
              </label>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => void handleSavePrefs()}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
              >
                Save Notification Preferences
              </button>
            )}
          </div>
        </div>
      )}

      {subTab === 'setup' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ServerCog className="w-5 h-5 text-blue-700" />
            AlertNet Full-Stack & Distributed Infrastructure Setup Guide
          </div>
          <p className="text-xs text-slate-600">
            Configure optional external production credentials in environment variables (see{' '}
            <code className="font-mono-tabular">.env.example</code>). Where external services are not
            configured, AlertNet runs in transparent Demo Mode without faking external deliveries.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {[
              {
                title: '1. Gemini AI Key (GEMINI_API_KEY)',
                body: 'Open AI Studio → Settings > Secrets (or visit aistudio.google.com/apikey) to create a key and attach it as GEMINI_API_KEY in server environment secrets. Never put this key in frontend code.',
              },
              {
                title: '2. Google Maps Platform (VITE_GOOGLE_MAPS_API_KEY)',
                body: 'Go to console.cloud.google.com → APIs & Services → Enable "Maps JavaScript API", "Places API (New)", and "Routes API" → Credentials → Create API Key → Restrict to your domain (HTTP referrers) → Add as VITE_GOOGLE_MAPS_API_KEY.',
              },
              {
                title: '3. Email Service (SMTP_HOST / SMTP_USER / SMTP_PASS)',
                body: 'Use Gmail App Passwords (myaccount.google.com/apppasswords with smtp.gmail.com:587), Resend (smtp.resend.com), or SendGrid (smtp.sendgrid.net). Without these, AlertNet logs emails transparently in Demo Audit Mode.',
              },
              {
                title: '4. SMS Gateway (TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE)',
                body: 'Create a free trial or paid account at console.twilio.com, copy your Account SID & Auth Token from the console dashboard, claim a Twilio phone number, and add them to environment secrets.',
              },
              {
                title: '5. Web Push Notifications (VAPID_PUBLIC_KEY / PRIVATE_KEY)',
                body: 'AlertNet automatically generates and saves VAPID keys in data/vapid-keys.json on first boot. For production clusters, run `npx web-push generate-vapid-keys` once and set both keys in environment variables.',
              },
              {
                title: '6. Global Weather & Flood Score (No Key Needed)',
                body: 'Worldwide location search and flood prediction scores on the 3D Globe use Open-Meteo Geocoding, Weather Forecast, and GloFAS River Discharge APIs—completely key-free.',
              },
              {
                title: '7. PostgreSQL, Redis & RabbitMQ',
                body: 'For production scale: provision Cloud SQL / Supabase (SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME), Upstash Redis (REDIS_URL), and CloudAMQP RabbitMQ (RABBITMQ_URL).',
              },
              {
                title: '8. Dual Stateless Backend Instances',
                body: 'Run `npm run dev` (starts Express gateway on port 3000 + two stateless worker instances on ports 3101 & 3102 with round-robin balancing and WebSockets on /ws).',
              },
            ].map((item) => (
              <div key={item.title} className="p-4 rounded-lg bg-[#F4F8FD] border border-slate-200">
                <div className="font-bold text-slate-900">{item.title}</div>
                <p className="text-slate-600 mt-1 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
