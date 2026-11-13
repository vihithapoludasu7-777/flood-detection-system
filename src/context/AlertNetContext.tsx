import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TRANSLATIONS } from '../i18n/translations.ts';
import { useOfflineSOSQueue, type OfflineSOSPayload } from '../hooks/useOfflineSOSQueue.ts';
import type {
  ApiEndpointStatus,
  ChatMessage,
  EmergencyAnnouncement,
  Language,
  LocationZone,
  MapFacility,
  RescueTeam,
  SOSIncident,
  UserProfile,
  WorldCityPin,
} from '../types.ts';

export type NavTab =
  | 'home'
  | 'map'
  | 'prediction'
  | 'sos'
  | 'assistant'
  | 'chat'
  | 'agriculture'
  | 'guidelines'
  | 'profile'
  | 'admin'
  | 'architecture';

interface AlertNetContextValue {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  selectedLocality: string;
  setSelectedLocality: (loc: string) => void;
  user: UserProfile | null;
  token: string | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  activeZone: LocationZone | null;
  locations: LocationZone[];
  facilities: MapFacility[];
  rescueTeams: RescueTeam[];
  incidents: SOSIncident[];
  announcements: EmergencyAnnouncement[];
  recentChat: ChatMessage[];
  apiStatuses: ApiEndpointStatus[];
  syncedAt: string | null;
  lastServedInstance: string;
  refreshDashboard: () => Promise<void>;
  refreshMonitoring: () => Promise<void>;
  isOnline: boolean;
  queuedSos: OfflineSOSPayload[];
  syncingSos: boolean;
  enqueueOfflineSOS: (item: OfflineSOSPayload) => void;
  flushOfflineSos: () => Promise<number>;
  pushSupported: boolean;
  pushSubscribed: boolean;
  subscribeToPush: () => Promise<{ ok: boolean; message: string }>;
  liveGps: { lat: number; lng: number } | null;
  isSharingLocation: boolean;
  toggleLocationSharing: () => void;
  useMyCurrentLocation: () => void;
  worldCities: WorldCityPin[];
  globalLocationLoading: boolean;
  selectGlobalPlace: (place: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lng: number;
  }) => Promise<void>;
}

const AlertNetContext = createContext<AlertNetContextValue | null>(null);

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const AlertNetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('alertnet_lang');
    return saved === 'te' || saved === 'hi' ? saved : 'en';
  });
  const [selectedLocality, setSelectedLocality] = useState<string>(
    () => localStorage.getItem('alertnet_locality') || 'Hyderabad'
  );
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('alertnet_token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeZone, setActiveZone] = useState<LocationZone | null>(null);
  const [locations, setLocations] = useState<LocationZone[]>([]);
  const [facilities, setFacilities] = useState<MapFacility[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>([]);
  const [incidents, setIncidents] = useState<SOSIncident[]>([]);
  const [announcements, setAnnouncements] = useState<EmergencyAnnouncement[]>([]);
  const [recentChat, setRecentChat] = useState<ChatMessage[]>([]);
  const [apiStatuses, setApiStatuses] = useState<ApiEndpointStatus[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [lastServedInstance, setLastServedInstance] = useState<string>('instance-1');

  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [liveGps, setLiveGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsOverride, setGpsOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [worldCities, setWorldCities] = useState<WorldCityPin[]>([]);
  const [globalLocationLoading, setGlobalLocationLoading] = useState(false);
  const customWorldZoneRef = useRef<LocationZone | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const t = useCallback(
    (key: string) => TRANSLATIONS[language][key] || TRANSLATIONS.en[key] || key,
    [language]
  );

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('alertnet_lang', lang);
  }, []);

  const handleSetLocality = useCallback((loc: string) => {
    customWorldZoneRef.current = null;
    setGpsOverride(null);
    setSelectedLocality(loc);
    localStorage.setItem('alertnet_locality', loc);
  }, []);

  const refreshMonitoring = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring/status');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.statuses)) {
        setApiStatuses(data.statuses);
      }
    } catch {
      // ignore offline monitor poll
    }
  }, []);

  const selectGlobalPlace = useCallback(
    async (place: {
      name: string;
      region: string;
      country: string;
      lat: number;
      lng: number;
    }) => {
      setGlobalLocationLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(place.lat),
          lng: String(place.lng),
          name: place.name,
          region: place.region,
          country: place.country,
        });
        const res = await fetch(`/api/world/forecast?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.zone) {
            customWorldZoneRef.current = data.zone;
            setActiveZone(data.zone);
            setSyncedAt(new Date().toISOString());
            if (Array.isArray(data.apiStatuses)) {
              setApiStatuses(data.apiStatuses);
            }
            setWorldCities((prev) =>
              prev.map((c) =>
                Math.abs(c.lat - data.zone.lat) < 0.25 && Math.abs(c.lng - data.zone.lng) < 0.25
                  ? { ...c, riskScore: data.zone.riskScore, riskLevel: data.zone.riskLevel }
                  : c
              )
            );
          }
        }
      } finally {
        setGlobalLocationLoading(false);
      }
    },
    []
  );

  const refreshDashboard = useCallback(async () => {
    try {
      const params = new URLSearchParams({ locality: selectedLocality });
      if (gpsOverride && !customWorldZoneRef.current) {
        params.set('lat', String(gpsOverride.lat));
        params.set('lng', String(gpsOverride.lng));
      }
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      const inst = res.headers.get('x-alertnet-instance');
      if (inst) setLastServedInstance(inst);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (errData && Array.isArray(errData.apiStatuses)) {
          setApiStatuses(errData.apiStatuses);
        }
        return;
      }
      const data = await res.json();
      setActiveZone((prev) => customWorldZoneRef.current || data.activeZone || prev);
      setLocations(data.locations || []);
      setFacilities(data.facilities || []);
      setRescueTeams(data.rescueTeams || []);
      setIncidents(data.incidents || []);
      setAnnouncements(data.announcements || []);
      setRecentChat(data.recentChat || []);
      if (Array.isArray(data.apiStatuses)) {
        setApiStatuses(data.apiStatuses);
      }
      setSyncedAt(data.syncedAt || new Date().toISOString());
      try {
        localStorage.setItem('alertnet_cached_dashboard', JSON.stringify(data));
      } catch {
        // ignore storage quota
      }
    } catch {
      // Load cached snapshot if offline
      try {
        const cached = localStorage.getItem('alertnet_cached_dashboard');
        if (cached) {
          const data = JSON.parse(cached);
          setActiveZone(data.activeZone);
          setLocations(data.locations || []);
          setFacilities(data.facilities || []);
          setRescueTeams(data.rescueTeams || []);
          setIncidents(data.incidents || []);
          setAnnouncements(data.announcements || []);
          setRecentChat(data.recentChat || []);
          if (Array.isArray(data.apiStatuses)) {
            setApiStatuses(data.apiStatuses);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [selectedLocality, gpsOverride]);

  const { isOnline, queuedReports, syncing, enqueueOfflineSOS, flushQueue } = useOfflineSOSQueue(
    token,
    () => {
      void refreshDashboard();
    }
  );

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    fetch('/api/world/cities')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.cities) setWorldCities(data.cities);
      })
      .catch(() => undefined);
  }, []);

  // Restore authenticated user session if token exists
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    setAuthLoading(true);
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          if (data.user.locality && !localStorage.getItem('alertnet_locality')) {
            setSelectedLocality(data.user.locality);
          }
        } else {
          localStorage.removeItem('alertnet_token');
          setToken(null);
        }
      })
      .catch(() => undefined)
      .finally(() => setAuthLoading(false));
  }, [token]);

  // Real-time WebSocket synchronization
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.event === 'sos:updated') {
              const updated = msg.data as SOSIncident;
              setIncidents((prev) => {
                const idx = prev.findIndex((i) => i.id === updated.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = updated;
                  return copy;
                }
                return [updated, ...prev];
              });
            } else if (msg.event === 'rescue:location') {
              const team = msg.data as RescueTeam;
              setRescueTeams((prev) => prev.map((t) => (t.id === team.id ? team : t)));
            } else if (msg.event === 'alert:broadcast') {
              const ann = msg.data as EmergencyAnnouncement;
              setAnnouncements((prev) => [ann, ...prev.filter((a) => a.id !== ann.id)]);
              void refreshDashboard();
            } else if (msg.event === 'map:facility') {
              const fac = msg.data as MapFacility;
              setFacilities((prev) => [...prev.filter((f) => f.id !== fac.id), fac]);
            } else if (msg.event === 'chat:message') {
              const chatMsg = msg.data as ChatMessage;
              setRecentChat((prev) => [...prev.slice(-5), chatMsg]);
            }
          } catch {
            // ignore malformed ws message
          }
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {
        // ignore ws errors
      }
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [refreshDashboard]);

  // Check existing service worker push subscription
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushSubscribed(Boolean(sub)))
        .catch(() => undefined);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Login failed' };
      localStorage.setItem('alertnet_token', data.token);
      setToken(data.token);
      setUser(data.user);
      if (data.user?.locality) handleSetLocality(data.user.locality);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while signing in.' };
    }
  };

  const register = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Registration failed' };
      localStorage.setItem('alertnet_token', data.token);
      setToken(data.token);
      setUser(data.user);
      if (data.user?.locality) handleSetLocality(data.user.locality);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while registering.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('alertnet_token');
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (payload: Record<string, unknown>) => {
    if (!token) return { ok: false, error: 'Please sign in first.' };
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Update failed' };
      setUser(data.user);
      if (data.user?.locality) handleSetLocality(data.user.locality);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while updating profile.' };
    }
  };

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, message: 'Web Push is not supported in this browser.' };
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, message: 'Notification permission denied by browser.' };
      }
      const keyRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscription: sub.toJSON(), locality: selectedLocality }),
      });
      if (!res.ok) return { ok: false, message: 'Failed to register subscription on server.' };
      setPushSubscribed(true);
      return {
        ok: true,
        message: 'Web Push enabled! You will receive critical alerts even when the browser is closed.',
      };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Push subscription failed.' };
    }
  };

  const toggleLocationSharing = () => {
    if (isSharingLocation) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setIsSharingLocation(false);
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    setIsSharingLocation(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setIsSharingLocation(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  };

  const useMyCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setLiveGps({ lat, lng });
        customWorldZoneRef.current = null;
        setGpsOverride({ lat, lng });
        void selectGlobalPlace({
          name: `My GPS (${lat.toFixed(2)}, ${lng.toFixed(2)})`,
          region: 'Live GPS Coordinates',
          country: 'Permitted Location',
          lat,
          lng,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, [selectGlobalPlace]);

  return (
    <AlertNetContext.Provider
      value={{
        activeTab,
        setActiveTab,
        language,
        setLanguage: handleSetLanguage,
        t,
        selectedLocality,
        setSelectedLocality: handleSetLocality,
        user,
        token,
        authLoading,
        login,
        register,
        logout,
        updateProfile,
        activeZone,
        locations,
        facilities,
        rescueTeams,
        incidents,
        announcements,
        recentChat,
        apiStatuses,
        syncedAt,
        lastServedInstance,
        refreshDashboard,
        refreshMonitoring,
        isOnline,
        queuedSos: queuedReports,
        syncingSos: syncing,
        enqueueOfflineSOS,
        flushOfflineSos: flushQueue,
        pushSupported: typeof window !== 'undefined' && 'PushManager' in window,
        pushSubscribed,
        subscribeToPush,
        liveGps,
        isSharingLocation,
        toggleLocationSharing,
        useMyCurrentLocation,
        worldCities,
        globalLocationLoading,
        selectGlobalPlace,
      }}
    >
      {children}
    </AlertNetContext.Provider>
  );
};

export function useAlertNet() {
  const ctx = useContext(AlertNetContext);
  if (!ctx) throw new Error('useAlertNet must be used inside AlertNetProvider');
  return ctx;
}
