import express, { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbStore } from './store.ts';
import { haversineMeters, mqBroker, redisStore, vapidKeys } from './broker.ts';
import {
  GLOBAL_MONITORED_CITIES,
  MONITORED_REGIONAL_PLACES,
  getApiMonitorStatuses,
  getWorldFloodZone,
  resolvePlaceCoordinates,
  searchWorldPlaces,
} from './worldFlood.ts';
import {
  chatSafetyAssistant,
  classifySOSWithAI,
  generateSmartAgriculturePlan,
} from './gemini.ts';
import {
  fetchSpatialFloodOverlay,
  fetchViewportPois,
  searchNominatimAutocomplete,
} from './osmMap.ts';
import type {
  AIClassification,
  AgricultureInput,
  ChatCategory,
  ChatMessage,
  Language,
  LocationZone,
  PoiCategory,
  RiskLevel,
  SOSCategory,
  SOSIncident,
  SOSReportItem,
  SOSStatus,
  UserProfile,
  UserRole,
} from '../types.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'alertnet-dev-jwt-secret-change-in-production';

interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

interface AuthedRequest extends Request {
  auth?: AuthPayload;
}

function sanitizeUser(u: (typeof dbStore.state.users)[number]): UserProfile {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      req.auth = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      // ignore invalid optional token
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    req.auth = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

export function createApiRouter(
  instanceId: string,
  broadcastWs: (event: string, data: unknown) => void
) {
  const router = express.Router();

  router.use((req, res, next) => {
    mqBroker.recordInstanceRequest(instanceId);
    res.setHeader('X-AlertNet-Instance', instanceId);
    next();
  });

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      instanceId,
      timestamp: new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // AUTHENTICATION & PROFILE
  // ---------------------------------------------------------------------------
  router.post('/auth/register', async (req, res) => {
    const {
      fullName,
      email,
      mobile,
      password,
      role = 'citizen',
      state = 'Telangana',
      district = 'Hyderabad',
      locality = 'Kukatpally',
      lat,
      lng,
      locationPermissionGranted = false,
    } = req.body || {};

    if (!fullName || !email || !mobile || !password) {
      res.status(400).json({ error: 'Full name, email, mobile number, and password are required.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (dbStore.state.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const matchedZone =
      dbStore.state.locations.find((z) => z.name.toLowerCase() === String(locality).toLowerCase()) ||
      dbStore.state.locations[0];

    const passwordHash = await bcrypt.hash(String(password), 8);
    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      mobile: String(mobile).trim(),
      passwordHash,
      role: (['citizen', 'farmer', 'rescue', 'admin'].includes(role) ? role : 'citizen') as UserRole,
      state: String(state),
      district: String(district),
      locality: matchedZone.name,
      registeredLat: typeof lat === 'number' ? lat : matchedZone.lat,
      registeredLng: typeof lng === 'number' ? lng : matchedZone.lng,
      locationPermissionGranted: Boolean(locationPermissionGranted),
      notificationPrefs: {
        email: true,
        sms: true,
        push: true,
        minSeverity: 'HIGH' as const,
        agriculturalFloodAlerts: role === 'farmer',
      },
      createdAt: new Date().toISOString(),
    };

    dbStore.state.users.push(newUser);
    dbStore.saveSync();

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ token, user: sanitizeUser(newUser), instanceId });
  });

  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = dbStore.state.users.find(
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
    );
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: sanitizeUser(user), instanceId });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = dbStore.state.users.find((u) => u.id === req.auth?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: sanitizeUser(user), instanceId });
  });

  router.put('/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = dbStore.state.users.find((u) => u.id === req.auth?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const {
      fullName,
      mobile,
      state,
      district,
      locality,
      registeredLat,
      registeredLng,
      locationPermissionGranted,
      notificationPrefs,
    } = req.body || {};

    if (fullName) user.fullName = String(fullName);
    if (mobile) user.mobile = String(mobile);
    if (state) user.state = String(state);
    if (district) user.district = String(district);
    if (locality) {
      user.locality = String(locality);
      const zone = dbStore.state.locations.find(
        (z) => z.name.toLowerCase() === String(locality).toLowerCase()
      );
      if (zone && typeof registeredLat !== 'number') {
        user.registeredLat = zone.lat;
        user.registeredLng = zone.lng;
      }
    }
    if (typeof registeredLat === 'number') user.registeredLat = registeredLat;
    if (typeof registeredLng === 'number') user.registeredLng = registeredLng;
    if (typeof locationPermissionGranted === 'boolean') {
      user.locationPermissionGranted = locationPermissionGranted;
    }
    if (notificationPrefs && typeof notificationPrefs === 'object') {
      user.notificationPrefs = { ...user.notificationPrefs, ...notificationPrefs };
    }

    dbStore.saveSync();
    res.json({ user: sanitizeUser(user), instanceId });
  });

  async function getCachedOrLiveZone(params: {
    id?: string;
    name: string;
    region?: string;
    state?: string;
    country?: string;
    lat: number;
    lng: number;
    radiusMeters?: number;
    historicalFloodCount?: number;
  }): Promise<{ zone: LocationZone; cached: boolean }> {
    const cacheKey = `live-zone:${params.lat.toFixed(2)}:${params.lng.toFixed(2)}`;
    const cached = redisStore.getCache<LocationZone>(cacheKey);
    if (cached) {
      return {
        zone: {
          ...cached,
          name: params.name,
          district: params.region || cached.district,
          state: params.state || cached.state,
          country: params.country || cached.country,
        },
        cached: true,
      };
    }
    const zone = await getWorldFloodZone(params);
    // Cache only for 2 minutes when live/partial, 20 seconds when unavailable so transient errors recover quickly
    redisStore.setCache(cacheKey, zone, zone.dataSource === 'unavailable' ? 20_000 : 120_000);
    return { zone, cached: false };
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD & GEOSPATIAL DATA (LIVE OPEN-METEO + GLOFAS)
  // ---------------------------------------------------------------------------
  router.get('/dashboard', async (req, res) => {
    const locality = String(req.query.locality || 'Hyderabad').trim();
    const qLat = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
    const qLng = req.query.lng !== undefined ? Number(req.query.lng) : NaN;

    let targetPlace = await resolvePlaceCoordinates(locality);
    if (!Number.isNaN(qLat) && !Number.isNaN(qLng)) {
      targetPlace = {
        id: `custom-${qLat.toFixed(2)}-${qLng.toFixed(2)}`,
        name: locality,
        district: targetPlace?.district || 'Selected Location',
        state: targetPlace?.state || 'World',
        country: targetPlace?.country || 'World',
        lat: qLat,
        lng: qLng,
        radiusMeters: 6000,
        historicalFloodCount: 0,
      };
    }

    if (!targetPlace) {
      res.status(404).json({
        error: `Could not geocode location "${locality}". Try searching a valid city name.`,
        apiStatuses: getApiMonitorStatuses(),
        instanceId,
      });
      return;
    }

    const [{ zone: activeZone, cached }, regionalZones] = await Promise.all([
      getCachedOrLiveZone({
        id: targetPlace.id,
        name: targetPlace.name,
        region: targetPlace.district,
        state: targetPlace.state,
        country: targetPlace.country,
        lat: targetPlace.lat,
        lng: targetPlace.lng,
        radiusMeters: targetPlace.radiusMeters,
        historicalFloodCount: targetPlace.historicalFloodCount,
      }),
      Promise.all(
        MONITORED_REGIONAL_PLACES.map(async (p) => {
          const r = await getCachedOrLiveZone({
            id: p.id,
            name: p.name,
            region: p.district,
            state: p.state,
            country: p.country,
            lat: p.lat,
            lng: p.lng,
            radiusMeters: p.radiusMeters,
            historicalFloodCount: p.historicalFloodCount,
          });
          return r.zone;
        })
      ),
    ]);

    const locations = regionalZones.some((z) => z.name.toLowerCase() === activeZone.name.toLowerCase())
      ? regionalZones
      : [activeZone, ...regionalZones];

    res.json({
      activeZone,
      locations,
      facilities: dbStore.state.facilities,
      rescueTeams: dbStore.state.rescueTeams,
      incidents: dbStore.state.incidents,
      announcements: dbStore.state.announcements.slice(0, 10),
      recentChat: dbStore.state.chatMessages.filter((m) => !m.flaggedHidden).slice(-6),
      apiStatuses: getApiMonitorStatuses(),
      syncedAt: new Date().toISOString(),
      cachedByRedis: cached,
      instanceId,
    });
  });

  // ---------------------------------------------------------------------------
  // API MONITORING STATUS ENDPOINT
  // ---------------------------------------------------------------------------
  router.get('/monitoring/status', (_req, res) => {
    res.json({
      statuses: getApiMonitorStatuses(),
      checkedAt: new Date().toISOString(),
      instanceId,
    });
  });

  // ---------------------------------------------------------------------------
  // GLOBAL FLOOD GLOBE & WORLDWIDE GEOCODING + FORECAST
  // ---------------------------------------------------------------------------
  router.get('/world/cities', (_req, res) => {
    const cities = GLOBAL_MONITORED_CITIES.map((c) => {
      const cached = redisStore.getCache<LocationZone>(
        `live-zone:${c.lat.toFixed(2)}:${c.lng.toFixed(2)}`
      );
      if (cached) {
        return {
          ...c,
          riskScore: cached.riskScore,
          riskLevel: cached.riskLevel,
        };
      }
      return c;
    });
    res.json({ cities, instanceId });
  });

  router.get('/world/search', async (req, res) => {
    const q = String(req.query.q || '');
    const results = await searchWorldPlaces(q);
    res.json({ results, apiStatuses: getApiMonitorStatuses(), instanceId });
  });

  router.get('/world/forecast', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const name = String(req.query.name || 'Selected Location');
    const region = String(req.query.region || 'Global Region');
    const country = String(req.query.country || 'World');

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
      return;
    }

    const { zone, cached } = await getCachedOrLiveZone({
      name,
      region,
      state: region,
      country,
      lat,
      lng,
    });

    res.json({
      zone,
      apiStatuses: getApiMonitorStatuses(),
      cachedByRedis: cached,
      instanceId,
    });
  });

  // ---------------------------------------------------------------------------
  // WEB PUSH SUBSCRIPTIONS
  // ---------------------------------------------------------------------------
  router.get('/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  router.post('/push/subscribe', optionalAuth, (req: AuthedRequest, res) => {
    const { subscription, locality = 'Kukatpally' } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: 'Invalid PushSubscription object.' });
      return;
    }

    const existing = dbStore.state.pushSubscriptions.find(
      (s) => s.subscription.endpoint === subscription.endpoint
    );
    if (existing) {
      existing.locality = locality;
      existing.userId = req.auth?.userId || existing.userId;
    } else {
      dbStore.state.pushSubscriptions.push({
        id: `psub-${Date.now()}`,
        userId: req.auth?.userId || 'anonymous',
        locality,
        subscription,
        createdAt: new Date().toISOString(),
      });
    }
    dbStore.saveSync();
    res.status(201).json({ subscribed: true, locality, instanceId });
  });

  router.post('/push/test', optionalAuth, (req: AuthedRequest, res) => {
    const { locality = 'Kukatpally' } = req.body || {};
    const zone =
      dbStore.state.locations.find((l) => l.name.toLowerCase() === String(locality).toLowerCase()) ||
      dbStore.state.locations[0];

    const result = mqBroker.triggerGeofencedAlertBroadcast({
      zone,
      title: `ALERTNET – ${zone.riskLevel} FLOOD WARNING (${zone.name})`,
      message: `Your registered area, ${zone.name}, is under ${zone.riskLevel.toLowerCase()} flood alert. 1. Avoid flooded roads. 2. Move to higher ground. 3. Contact rescue through SOS.`,
      publishedBy: 'User Push Self-Test',
    });
    res.json({ ...result, instanceId });
  });

  // ---------------------------------------------------------------------------
  // EMERGENCY SOS SYSTEM (Idempotent, Rate-Limited, Geo-Clustered, Durable)
  // ---------------------------------------------------------------------------
  router.get('/sos', (_req, res) => {
    res.json({ incidents: dbStore.state.incidents, instanceId });
  });

  router.post('/sos', optionalAuth, async (req: AuthedRequest, res) => {
    const startedAt = Date.now();
    const {
      idempotencyKey,
      category,
      description,
      lat,
      lng,
      locality = 'Kukatpally',
      reporterName,
      reporterMobile,
      syncedFromOffline = false,
    } = req.body || {};

    if (!category || !description) {
      res.status(400).json({ error: 'Emergency category and description are required.' });
      return;
    }

    const rateKey = `rl:sos:${req.auth?.userId || req.ip || 'anon'}`;
    const rl = redisStore.checkRateLimit(rateKey, 10, 60_000);
    if (!rl.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded for SOS submissions. Existing SOS reports are already active.',
      });
      return;
    }

    const idemKey = String(
      idempotencyKey || `sos-${req.auth?.userId || 'anon'}-${category}-${description.slice(0, 24)}`
    );
    const existingIdem = redisStore.getIdempotent<{ incident: SOSIncident; deduplicated: boolean }>(
      `idem:sos:${idemKey}`
    );
    if (existingIdem) {
      res.status(200).json({ ...existingIdem, idempotentReplay: true, instanceId });
      return;
    }

    const resolvedPlace = await resolvePlaceCoordinates(String(locality));
    const safeLat =
      typeof lat === 'number' && !Number.isNaN(lat)
        ? lat
        : resolvedPlace?.lat ?? dbStore.state.locations[0].lat;
    const safeLng =
      typeof lng === 'number' && !Number.isNaN(lng)
        ? lng
        : resolvedPlace?.lng ?? dbStore.state.locations[0].lng;
    const effectiveLocality = resolvedPlace?.name || String(locality);

    const { zone: liveZone } = await getCachedOrLiveZone({
      name: effectiveLocality,
      region: resolvedPlace?.district || effectiveLocality,
      state: resolvedPlace?.state || 'India',
      country: resolvedPlace?.country || 'India',
      lat: safeLat,
      lng: safeLng,
    });

    const user = req.auth?.userId
      ? dbStore.state.users.find((u) => u.id === req.auth?.userId)
      : undefined;

    const reportItem: SOSReportItem = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      idempotencyKey: idemKey,
      userId: user?.id || 'guest',
      reporterName: String(reporterName || user?.fullName || 'Anonymous Citizen'),
      reporterMobile: String(reporterMobile || user?.mobile || 'Not provided'),
      category: category as SOSCategory,
      description: String(description).trim(),
      lat: safeLat,
      lng: safeLng,
      locality: effectiveLocality,
      createdAt: new Date().toISOString(),
      syncedFromOffline: Boolean(syncedFromOffline),
    };

    const aiResult = await classifySOSWithAI({
      category: reportItem.category,
      description: reportItem.description,
      locality: effectiveLocality,
      zoneRiskScore: liveZone.riskScore ?? undefined,
    });

    // Distributed lock for duplicate geo-clustering without losing individual reports
    const lockKey = `lock:sos-cluster:${effectiveLocality}`;
    redisStore.acquireLock(lockKey, instanceId, 3000);

    try {
      const existingIncident = dbStore.state.incidents.find(
        (inc) =>
          inc.status !== 'Resolved' &&
          haversineMeters(inc.lat, inc.lng, safeLat, safeLng) <= 350
      );

      let incident: SOSIncident;
      let groupedIntoExisting = false;

      if (existingIncident) {
        groupedIntoExisting = true;
        existingIncident.reports.unshift(reportItem);
        existingIncident.reportCount = existingIncident.reports.length;
        existingIncident.updatedAt = new Date().toISOString();
        if (aiResult.classification === 'Critical') {
          existingIncident.aiClassification = 'Critical';
          existingIncident.aiReasoning = aiResult.reasoning;
        }
        incident = existingIncident;
      } else {
        const availableTeam =
          dbStore.state.rescueTeams.find(
            (t) => t.status === 'Available' && t.locality === effectiveLocality
          ) || dbStore.state.rescueTeams.find((t) => t.status === 'Available');

        const latencyMs = Math.max(8, Date.now() - startedAt);
        incident = {
          id: `sos-inc-${Date.now().toString().slice(-5)}`,
          clusterKey: `${safeLat.toFixed(3)}_${safeLng.toFixed(3)}`,
          locality: effectiveLocality,
          lat: safeLat,
          lng: safeLng,
          primaryCategory: reportItem.category,
          status: availableTeam ? 'Rescue Team Assigned' : 'Received',
          aiClassification: aiResult.classification,
          aiReasoning: aiResult.reasoning,
          assignedTeamId: availableTeam?.id,
          assignedTeamName: availableTeam?.name,
          reportCount: 1,
          reports: [reportItem],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          acknowledgedAt: new Date().toISOString(),
          processingInstanceId: instanceId,
          processingLatencyMs: latencyMs,
        };

        if (availableTeam) {
          availableTeam.status = 'Dispatched';
          availableTeam.assignedIncidentId = incident.id;
        }
        dbStore.state.incidents.unshift(incident);
      }

      // Durable write BEFORE returning acknowledgement
      dbStore.saveSync();
      mqBroker.publishToExchange('sos', `sos.${aiResult.classification.toLowerCase()}`, {
        incidentId: incident.id,
        reportId: reportItem.id,
        locality: incident.locality,
      });

      const responsePayload = {
        incident,
        groupedIntoExisting,
        aiSource: aiResult.source,
        acknowledged: true,
        instanceId,
      };
      redisStore.setIdempotent(`idem:sos:${idemKey}`, responsePayload, 3600_000);
      broadcastWs('sos:updated', incident);
      res.status(201).json(responsePayload);
    } finally {
      redisStore.releaseLock(lockKey, instanceId);
    }
  });

  router.patch('/sos/:id', optionalAuth, (req: AuthedRequest, res) => {
    const incident = dbStore.state.incidents.find((i) => i.id === req.params.id);
    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    const { status, assignedTeamId, aiClassification, adminOverrideNote } = req.body || {};
    if (status) {
      incident.status = status as SOSStatus;
      if (status === 'Resolved' && incident.assignedTeamId) {
        const team = dbStore.state.rescueTeams.find((t) => t.id === incident.assignedTeamId);
        if (team) {
          team.status = 'Available';
          team.assignedIncidentId = undefined;
        }
      }
    }
    if (assignedTeamId) {
      const team = dbStore.state.rescueTeams.find((t) => t.id === assignedTeamId);
      if (team) {
        incident.assignedTeamId = team.id;
        incident.assignedTeamName = team.name;
        if (incident.status === 'Received' || incident.status === 'Under Review') {
          incident.status = 'Rescue Team Assigned';
        }
        team.status = 'Dispatched';
        team.assignedIncidentId = incident.id;
      }
    }
    if (aiClassification) {
      incident.aiClassification = aiClassification as AIClassification;
      incident.overriddenByAdmin = true;
      incident.adminOverrideNote =
        adminOverrideNote || `Severity overridden by ${req.auth?.email || 'Administrator'}`;
    }
    incident.updatedAt = new Date().toISOString();
    dbStore.saveSync();
    broadcastWs('sos:updated', incident);
    res.json({ incident, rescueTeams: dbStore.state.rescueTeams, instanceId });
  });

  // ---------------------------------------------------------------------------
  // RESCUE TEAM LIVE LOCATION
  // ---------------------------------------------------------------------------
  router.post('/rescue/location', optionalAuth, (req, res) => {
    const { teamId, lat, lng, status } = req.body || {};
    const team = dbStore.state.rescueTeams.find((t) => t.id === teamId);
    if (!team) {
      res.status(404).json({ error: 'Rescue team not found' });
      return;
    }
    if (typeof lat === 'number') team.lat = lat;
    if (typeof lng === 'number') team.lng = lng;
    if (status) team.status = status;
    team.lastHeartbeat = new Date().toISOString();
    dbStore.saveSync();
    broadcastWs('rescue:location', team);
    res.json({ team, instanceId });
  });

  // ---------------------------------------------------------------------------
  // LIVE FLOOD MAP: OSM AUTOCOMPLETE, VIEWPORT POIS & SPATIAL FLOOD OVERLAY
  // ---------------------------------------------------------------------------
  router.get('/map/autocomplete', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ suggestions: [], source: 'empty', instanceId });
      return;
    }
    const result = await searchNominatimAutocomplete(q);
    res.json({
      ...result,
      apiStatuses: getApiMonitorStatuses(),
      instanceId,
    });
  });

  const VALID_POI_CATEGORIES: PoiCategory[] = [
    'all',
    'hospitals',
    'schools',
    'emergency',
    'shopping',
    'transport',
    'roads_bridges',
  ];

  router.get('/map/pois', async (req, res) => {
    const south = Number(req.query.south);
    const west = Number(req.query.west);
    const north = Number(req.query.north);
    const east = Number(req.query.east);
    const rawCategory = String(req.query.category || 'all') as PoiCategory;
    const category: PoiCategory = VALID_POI_CATEGORIES.includes(rawCategory) ? rawCategory : 'all';

    if (
      !Number.isFinite(south) ||
      !Number.isFinite(west) ||
      !Number.isFinite(north) ||
      !Number.isFinite(east)
    ) {
      res.status(400).json({
        error: 'Valid viewport bounds (south, west, north, east) are required.',
      });
      return;
    }

    const result = await fetchViewportPois({ south, west, north, east, category });
    res.json({
      ...result,
      category,
      apiStatuses: getApiMonitorStatuses(),
      instanceId,
    });
  });

  router.get('/map/flood-overlay', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const label = String(req.query.label || 'Selected Location').trim();
    const south = req.query.south !== undefined ? Number(req.query.south) : undefined;
    const west = req.query.west !== undefined ? Number(req.query.west) : undefined;
    const north = req.query.north !== undefined ? Number(req.query.north) : undefined;
    const east = req.query.east !== undefined ? Number(req.query.east) : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
      return;
    }

    const result = await fetchSpatialFloodOverlay({
      centerLat: lat,
      centerLng: lng,
      centerLabel: label,
      south: Number.isFinite(south) ? south : undefined,
      west: Number.isFinite(west) ? west : undefined,
      north: Number.isFinite(north) ? north : undefined,
      east: Number.isFinite(east) ? east : undefined,
    });

    res.json({
      ...result,
      apiStatuses: getApiMonitorStatuses(),
      instanceId,
    });
  });

  // ---------------------------------------------------------------------------
  // WATERLOGGING / FACILITY REPORTING ON MAP
  // ---------------------------------------------------------------------------
  router.post('/map/waterlogging', optionalAuth, (req, res) => {
    const { name, locality = 'Kukatpally', lat, lng, severity = 'HIGH' } = req.body || {};
    if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Location description and coordinates are required.' });
      return;
    }
    const item = {
      id: `fac-wl-${Date.now()}`,
      type: 'waterlogging' as const,
      name: String(name),
      locality: String(locality),
      lat,
      lng,
      severity: severity as RiskLevel,
      reportedAt: new Date().toISOString(),
    };
    dbStore.state.facilities.push(item);
    dbStore.saveSync();
    broadcastWs('map:facility', item);
    res.status(201).json({ facility: item, instanceId });
  });

  // ---------------------------------------------------------------------------
  // AI SAFETY ASSISTANT & SMART AGRICULTURE (LIVE WEATHER + GLOFAS CONTEXT)
  // ---------------------------------------------------------------------------
  router.post('/assistant/chat', async (req, res) => {
    const {
      question,
      language = 'en',
      locality = 'Hyderabad',
      lat,
      lng,
      history = [],
    } = req.body || {};
    if (!question) {
      res.status(400).json({ error: 'Question is required.' });
      return;
    }

    const resolved = await resolvePlaceCoordinates(String(locality));
    const useLat = typeof lat === 'number' && !Number.isNaN(lat) ? lat : resolved?.lat ?? 17.385;
    const useLng = typeof lng === 'number' && !Number.isNaN(lng) ? lng : resolved?.lng ?? 78.4867;
    const { zone } = await getCachedOrLiveZone({
      name: resolved?.name || String(locality),
      region: resolved?.district || 'Region',
      state: resolved?.state || 'India',
      country: resolved?.country || 'India',
      lat: useLat,
      lng: useLng,
    });

    const result = await chatSafetyAssistant({
      question: String(question),
      language: (['en', 'te', 'hi'].includes(language) ? language : 'en') as Language,
      zone,
      history,
    });
    res.json({
      ...result,
      locality: zone.name,
      riskLevel: zone.riskLevel,
      apiStatuses: getApiMonitorStatuses(),
      instanceId,
    });
  });

  router.post('/agriculture/analyze', async (req, res) => {
    const { input, language = 'en', lat, lng } = req.body || {};
    if (!input?.location || !input?.soilType || !input?.currentCrop) {
      res.status(400).json({ error: 'Location, soil type, and current crop are required.' });
      return;
    }

    const resolved = await resolvePlaceCoordinates(String(input.location));
    const useLat = typeof lat === 'number' && !Number.isNaN(lat) ? lat : resolved?.lat ?? 17.385;
    const useLng = typeof lng === 'number' && !Number.isNaN(lng) ? lng : resolved?.lng ?? 78.4867;
    const { zone } = await getCachedOrLiveZone({
      name: resolved?.name || String(input.location),
      region: resolved?.district || 'Region',
      state: resolved?.state || 'India',
      country: resolved?.country || 'India',
      lat: useLat,
      lng: useLng,
    });

    const plan = await generateSmartAgriculturePlan({
      input: input as AgricultureInput,
      zone,
      language: (['en', 'te', 'hi'].includes(language) ? language : 'en') as Language,
    });
    res.json({ plan, zone, apiStatuses: getApiMonitorStatuses(), instanceId });
  });

  // ---------------------------------------------------------------------------
  // COMMUNITY CHAT (Rate-limited, Locality Rooms, Moderation)
  // ---------------------------------------------------------------------------
  router.get('/chat/messages', (req, res) => {
    const roomId = req.query.roomId ? String(req.query.roomId) : null;
    const category = req.query.category ? String(req.query.category) : null;
    let messages = dbStore.state.chatMessages.filter((m) => !m.flaggedHidden);
    if (roomId && roomId !== 'all') {
      messages = messages.filter((m) => m.roomId === roomId);
    }
    if (category && category !== 'All') {
      messages = messages.filter((m) => m.category === category);
    }
    res.json({ messages: messages.slice(-60), instanceId });
  });

  router.post('/chat/messages', optionalAuth, (req: AuthedRequest, res) => {
    const {
      roomId = 'room-kukatpally',
      locality = 'Kukatpally',
      category = 'Emergency Help',
      text,
      senderName,
      senderRole,
      sharedLocation,
      photoDataUrl,
    } = req.body || {};

    if (!text || !String(text).trim()) {
      res.status(400).json({ error: 'Message text is required.' });
      return;
    }

    const rl = redisStore.checkRateLimit(`rl:chat:${req.auth?.userId || req.ip || 'anon'}`, 12, 30_000);
    if (!rl.allowed) {
      res.status(429).json({ error: 'Spam protection: please wait a few seconds before sending more messages.' });
      return;
    }

    const user = req.auth?.userId
      ? dbStore.state.users.find((u) => u.id === req.auth?.userId)
      : undefined;

    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      roomId: String(roomId),
      locality: String(locality),
      category: category as ChatCategory,
      userId: user?.id || 'guest',
      senderName: String(senderName || user?.fullName || 'Local Resident'),
      senderRole: (senderRole || user?.role || 'citizen') as UserRole,
      text: String(text).trim().slice(0, 600),
      sharedLocation:
        sharedLocation && typeof sharedLocation.lat === 'number'
          ? {
              lat: sharedLocation.lat,
              lng: sharedLocation.lng,
              label: String(sharedLocation.label || locality),
            }
          : undefined,
      photoDataUrl: typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image/') ? photoDataUrl : undefined,
      isAnnouncement: user?.role === 'admin' || user?.role === 'rescue',
      reportedCount: 0,
      createdAt: new Date().toISOString(),
    };

    dbStore.state.chatMessages.push(msg);
    if (dbStore.state.chatMessages.length > 250) {
      dbStore.state.chatMessages = dbStore.state.chatMessages.slice(-250);
    }
    dbStore.saveSync();
    broadcastWs('chat:message', msg);
    res.status(201).json({ message: msg, instanceId });
  });

  router.post('/chat/messages/:id/report', (req, res) => {
    const msg = dbStore.state.chatMessages.find((m) => m.id === req.params.id);
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    msg.reportedCount++;
    if (msg.reportedCount >= 2) {
      msg.flaggedHidden = true;
    }
    dbStore.saveSync();
    broadcastWs('chat:moderated', { id: msg.id, flaggedHidden: msg.flaggedHidden });
    res.json({ reportedCount: msg.reportedCount, flaggedHidden: Boolean(msg.flaggedHidden), instanceId });
  });

  // ---------------------------------------------------------------------------
  // ADMIN ALERTS, USERS, DLQ & SIMULATION
  // ---------------------------------------------------------------------------
  router.post('/admin/alerts/broadcast', optionalAuth, async (req: AuthedRequest, res) => {
    const {
      locality = 'Hyderabad',
      severity = 'HIGH',
      title,
      message,
      simulateTransientFailure = false,
      lat,
      lng,
    } = req.body || {};

    const resolved = await resolvePlaceCoordinates(String(locality));
    const useLat = typeof lat === 'number' && !Number.isNaN(lat) ? lat : resolved?.lat;
    const useLng = typeof lng === 'number' && !Number.isNaN(lng) ? lng : resolved?.lng;

    if (useLat === undefined || useLng === undefined) {
      res.status(404).json({ error: `Target locality "${locality}" could not be geocoded.` });
      return;
    }

    const { zone } = await getCachedOrLiveZone({
      id: resolved?.id,
      name: resolved?.name || String(locality),
      region: resolved?.district || String(locality),
      state: resolved?.state || 'India',
      country: resolved?.country || 'India',
      lat: useLat,
      lng: useLng,
    });

    zone.riskLevel = severity as RiskLevel;
    zone.riskScore =
      severity === 'CRITICAL' ? 91 : severity === 'HIGH' ? 76 : severity === 'MEDIUM' || severity === 'MODERATE' ? 48 : 20;
    zone.alertTitle = String(title || `${severity} FLOOD WARNING – ${zone.name.toUpperCase()}`);
    zone.alertMessage = String(message || zone.alertMessage);
    zone.lastUpdated = new Date().toISOString();

    const result = mqBroker.triggerGeofencedAlertBroadcast({
      zone,
      title: zone.alertTitle,
      message: zone.alertMessage,
      publishedBy: req.auth?.email || 'SDMA Administrator',
      simulateTransientFailure: Boolean(simulateTransientFailure),
    });

    res.status(201).json({ ...result, zone, instanceId });
  });

  router.get('/admin/overview', (_req, res) => {
    res.json({
      users: dbStore.state.users.map(sanitizeUser),
      deliveryLogs: dbStore.state.deliveryLogs.slice(0, 60),
      dlq: mqBroker.getDlqItems(),
      announcements: dbStore.state.announcements,
      apiStatuses: getApiMonitorStatuses(),
      instanceId,
    });
  });

  router.post('/admin/dlq/:id/replay', (req, res) => {
    const ok = mqBroker.replayDlqItem(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'DLQ item not found' });
      return;
    }
    res.json({ replayed: true, instanceId });
  });

  router.get('/architecture/metrics', (_req, res) => {
    res.json({ metrics: mqBroker.getArchitectureMetrics(), instanceId });
  });

  router.post('/simulation/run', async (req, res) => {
    const residents = Math.min(250000, Math.max(10000, Number(req.body?.residents || 100000)));
    const sosBurst = Math.min(1000, Math.max(25, Number(req.body?.sosBurst || 250)));
    const stats = await mqBroker.runHighScaleSimulation(residents, sosBurst);
    res.json({ simulationStats: stats, metrics: mqBroker.getArchitectureMetrics(), instanceId });
  });

  return router;
}
