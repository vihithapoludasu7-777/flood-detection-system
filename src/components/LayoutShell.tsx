import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  CloudLightning,
  Download,
  Home,
  LocateFixed,
  LogIn,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageSquare,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Siren,
  Sprout,
  User,
  X,
} from 'lucide-react';
import { useAlertNet, type NavTab } from '../context/AlertNetContext.tsx';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import type { Language } from '../types.ts';

export const LayoutShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    activeTab,
    setActiveTab,
    language,
    setLanguage,
    t,
    selectedLocality,
    setSelectedLocality,
    locations,
    user,
    logout,
    announcements,
    pushSubscribed,
    subscribeToPush,
    selectGlobalPlace,
    useMyCurrentLocation,
  } = useAlertNet();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [topQuery, setTopQuery] = useState('');
  const [topResults, setTopResults] = useState<
    Array<{ name: string; country: string; region: string; lat: number; lng: number }>
  >([]);
  const [topDropdown, setTopDropdown] = useState(false);

  const handleTopSearch = async (val: string) => {
    setTopQuery(val);
    if (val.trim().length < 2) {
      setTopResults([]);
      setTopDropdown(false);
      return;
    }
    const res = await fetch(`/api/world/search?q=${encodeURIComponent(val.trim())}`);
    if (res.ok) {
      const data = await res.json();
      setTopResults(data.results || []);
      setTopDropdown(true);
    }
  };

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'home', label: t('navHome'), icon: <Home className="w-4 h-4" /> },
    { id: 'map', label: t('navMap'), icon: <Map className="w-4 h-4" /> },
    { id: 'prediction', label: t('navPrediction'), icon: <CloudLightning className="w-4 h-4" /> },
    { id: 'sos', label: t('navSos'), icon: <Siren className="w-4 h-4 text-red-400" /> },
    { id: 'assistant', label: t('navAssistant'), icon: <Bot className="w-4 h-4" /> },
    { id: 'chat', label: t('navChat'), icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'agriculture', label: t('navAgriculture'), icon: <Sprout className="w-4 h-4" /> },
    { id: 'guidelines', label: t('navGuidelines'), icon: <BookOpen className="w-4 h-4" /> },
    { id: 'profile', label: t('navProfile'), icon: <User className="w-4 h-4" /> },
    { id: 'admin', label: t('navAdmin'), icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'architecture', label: t('navArchitecture'), icon: <Server className="w-4 h-4" /> },
  ];

  const handleSelectNav = (id: NavTab) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-slate-100">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display font-extrabold text-lg tracking-tight text-white leading-none">
              {t('brandName')}
            </div>
            <div className="text-[11px] text-blue-200 mt-1">{t('tagline')}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-slate-300 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNav(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom: Language Switcher, User Profile, Settings, Logout */}
      <div className="p-4 border-t border-white/10 space-y-3 bg-[#09182E]">
        <div>
          <div className="text-[11px] font-semibold text-blue-200 mb-1.5">
            {t('languageLabel')}
          </div>
          <div className="grid grid-cols-3 gap-1 bg-white/10 p-1 rounded-lg">
            {(
              [
                ['en', 'EN'],
                ['te', 'తెలుగు'],
                ['hi', 'हिन्दी'],
              ] as Array<[Language, string]>
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`py-1 rounded text-xs font-semibold transition-colors ${
                  language === code
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleSelectNav('profile')}
            className="flex items-center gap-2.5 text-left min-w-0 flex-1 hover:opacity-90"
          >
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user ? user.fullName.charAt(0).toUpperCase() : 'G'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {user ? user.fullName : 'Guest Resident'}
              </div>
              <div className="text-[11px] text-blue-200 capitalize truncate">
                {user ? user.role : 'Click to sign in'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectNav('profile')}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            title={t('settings')}
          >
            <Settings className="w-4 h-4" />
          </button>

          {user ? (
            <button
              type="button"
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              title={t('logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSelectNav('profile')}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              title={t('login')}
            >
              <LogIn className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F8FD] text-slate-900">
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Regional Location Selector */}
            <div className="flex items-center gap-1.5 bg-[#F4F8FD] border border-slate-200 rounded-lg px-2.5 py-1.5 shrink-0">
              <MapPin className="w-4 h-4 text-blue-700 shrink-0" />
              <select
                value={selectedLocality}
                onChange={(e) => setSelectedLocality(e.target.value)}
                aria-label="Select monitored location"
                className="bg-transparent text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none cursor-pointer"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.name}>
                    {loc.name}, {loc.district}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={useMyCurrentLocation}
                title="Use my current GPS location"
                className="p-1 rounded hover:bg-blue-100 text-blue-700 transition-colors"
              >
                <LocateFixed className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Global Place Search Bar */}
            <div className="relative hidden md:block w-72 lg:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={topQuery}
                onChange={(e) => void handleTopSearch(e.target.value)}
                onFocus={() => {
                  if (topResults.length > 0) setTopDropdown(true);
                }}
                placeholder="Search any place worldwide..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-[#F8FBFF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {topDropdown && topResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {topResults.map((r, i) => (
                    <button
                      key={`${r.name}-${i}`}
                      type="button"
                      onClick={() => {
                        setTopQuery(`${r.name}, ${r.country}`);
                        setTopDropdown(false);
                        void selectGlobalPlace(r);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-slate-900 truncate">
                        {r.name} · <span className="font-normal text-slate-500">{r.country}</span>
                      </span>
                      <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">
                        {r.lat.toFixed(1)}, {r.lng.toFixed(1)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* In-App PWA Install Button */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                {t('installApp')}
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setIosModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Install iOS
              </button>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {announcements.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center font-mono-tabular">
                    {announcements.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-lg p-4 z-40 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-sm font-bold text-slate-900">
                      Emergency Alerts ({announcements.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        void subscribeToPush();
                      }}
                      className="text-xs font-semibold text-blue-700 hover:underline"
                    >
                      {pushSubscribed ? 'Push Active' : 'Enable Push'}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {announcements.map((a) => (
                      <div key={a.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <div className="font-bold text-red-700">{a.title}</div>
                        <p className="text-slate-700 mt-1">{a.message}</p>
                        <div className="text-slate-400 mt-1 font-mono-tabular">
                          {a.locality} · {new Date(a.publishedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Button */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5 text-blue-700" />
              {user ? user.fullName.split(' ')[0] : t('login')}
            </button>

            {/* Primary Emergency SOS CTA */}
            <button
              type="button"
              onClick={() => setActiveTab('sos')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Siren className="w-4 h-4" />
              SOS
            </button>
          </div>
        </header>

        {/* Active Page Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>

      {/* iOS Install Modal */}
      {iosModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">Install AlertNet on iPhone / iPad</h3>
            <p className="text-sm text-slate-600">
              1. Tap the <strong>Share</strong> button in Safari.
              <br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setIosModalOpen(false)}
              className="w-full py-2 rounded-lg bg-slate-100 text-sm font-semibold text-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
