export type UserRole = 'citizen' | 'farmer' | 'rescue' | 'admin';
export type Language = 'en' | 'te' | 'hi';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNAVAILABLE';

export type SOSCategory =
  | 'people_trapped'
  | 'medical_emergency'
  | 'house_flooding'
  | 'food_water_required'
  | 'missing_person'
  | 'rescue_assistance';

export type SOSStatus =
  | 'Received'
  | 'Under Review'
  | 'Rescue Team Assigned'
  | 'Team on the Way'
  | 'Resolved';

export type AIClassification = 'Critical' | 'Urgent' | 'Informational';

export type ChatCategory =
  | 'Emergency Help'
  | 'Road Conditions'
  | 'Shelter Information'
  | 'Food and Medical Help';

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  minSeverity: 'HIGH' | 'CRITICAL' | 'MODERATE' | 'MEDIUM';
  agriculturalFloodAlerts: boolean;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  role: UserRole;
  state: string;
  district: string;
  locality: string;
  registeredLat: number;
  registeredLng: number;
  locationPermissionGranted: boolean;
  notificationPrefs: NotificationPreferences;
  createdAt: string;
}

export interface WeatherHour {
  time: string;
  timestamp?: string;
  tempC: number | null;
  rainfallMm: number | null;
  precipitationMm?: number | null;
  precipitationProbabilityPct?: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  condition: string;
  isForecast?: boolean;
}

export interface DailyForecast {
  date: string;
  precipitationSumMm: number | null;
  precipitationProbabilityMaxPct: number | null;
  riverDischargeM3s: number | null;
  riverDischargeMaxM3s: number | null;
  riverDischargeMeanM3s: number | null;
  isForecast: boolean;
}

export interface FloodPredictionWindow {
  horizonHours: 1 | 3 | 6 | 24;
  expectedSeverity: RiskLevel;
  riskPercentage: number | null;
  confidencePercentage: number | null;
  predictedWaterRiseCm: number | null;
  forecastRainfallMm?: number | null;
  precipitationProbabilityPct?: number | null;
  estimatedWindow: string;
  reasons: string[];
  dataSource: 'live_api' | 'partial_live_api' | 'unavailable' | 'simulated_sensor_network';
  isForecast?: boolean;
}

export interface ApiEndpointStatus {
  id: string;
  provider: string;
  endpoint: string;
  httpStatus: number | null;
  status: 'live' | 'unavailable' | 'error';
  lastUpdatedAt: string;
  dataTimestamp: string | null;
  dataSource: string;
  errorMessage: string | null;
  locationLabel?: string;
}

export interface LocationZone {
  id: string;
  name: string;
  district: string;
  state: string;
  country?: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  riskScore: number | null; // 0-100 or null when unavailable
  riskLevel: RiskLevel;
  rainfallIntensityMmHr: number | null;
  precipitationMm?: number | null;
  precipitationProbabilityPct?: number | null;
  historicalRainfall24hMm: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  waterLevelM: number | null;
  dangerWaterLevelM: number | null;
  riverDischargeM3s?: number | null;
  riverDischargeMaxM3s?: number | null;
  riverDischargeMeanM3s?: number | null;
  glofasNote?: string;
  soilMoisturePct: number | null;
  drainageCapacityPct: number | null;
  historicalFloodCount: number;
  alertTitle: string;
  alertMessage: string;
  safetyRecommendations: string[];
  lastUpdated: string;
  observationTimestamp?: string | null;
  glofasTimestamp?: string | null;
  timezone?: string;
  dataSource: 'live_api' | 'partial_live_api' | 'unavailable' | 'simulated_sensor_network';
  forecast24h: WeatherHour[];
  dailyForecast?: DailyForecast[];
  predictions: FloodPredictionWindow[];
}

export interface WorldCityPin {
  id: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  riskScore: number | null;
  riskLevel: RiskLevel;
}

export interface MapFacility {
  id: string;
  type: 'shelter' | 'hospital' | 'rescue_station' | 'relief_centre' | 'waterlogging';
  name: string;
  locality: string;
  lat: number;
  lng: number;
  capacity?: number;
  availableBeds?: number;
  contact?: string;
  severity?: RiskLevel;
  reportedAt?: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  unitCode: string;
  locality: string;
  lat: number;
  lng: number;
  status: 'Available' | 'Dispatched' | 'On Scene';
  assignedIncidentId?: string;
  personnelCount: number;
  equipment: string;
  lastHeartbeat: string;
}

export interface SOSReportItem {
  id: string;
  idempotencyKey: string;
  userId: string;
  reporterName: string;
  reporterMobile: string;
  category: SOSCategory;
  description: string;
  lat: number;
  lng: number;
  locality: string;
  createdAt: string;
  syncedFromOffline?: boolean;
}

export interface SOSIncident {
  id: string;
  clusterKey: string;
  locality: string;
  lat: number;
  lng: number;
  primaryCategory: SOSCategory;
  status: SOSStatus;
  aiClassification: AIClassification;
  aiReasoning: string;
  overriddenByAdmin?: boolean;
  adminOverrideNote?: string;
  assignedTeamId?: string;
  assignedTeamName?: string;
  reportCount: number;
  reports: SOSReportItem[];
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string;
  processingInstanceId: string;
  processingLatencyMs: number;
}

export interface NotificationDeliveryRecord {
  id: string;
  alertId: string;
  userId?: string;
  recipientLabel: string;
  locality: string;
  channel: 'email' | 'sms' | 'push';
  status: 'queued' | 'retrying' | 'delivered' | 'demo_simulated' | 'dlq_failed';
  attempts: number;
  messagePreview: string;
  errorReason?: string;
  workerInstance: string;
  createdAt: string;
  updatedAt: string;
  isSimulation?: boolean;
}

export interface EmergencyAnnouncement {
  id: string;
  title: string;
  message: string;
  locality: string;
  severity: RiskLevel;
  publishedBy: string;
  publishedAt: string;
  geofencedRecipients: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  locality: string;
  category: ChatCategory;
  userId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  sharedLocation?: { lat: number; lng: number; label: string };
  photoDataUrl?: string;
  isAnnouncement?: boolean;
  reportedCount: number;
  flaggedHidden?: boolean;
  createdAt: string;
}

export interface AgricultureInput {
  location: string;
  landAreaAcres: number;
  soilType: 'Alluvial' | 'Black Cotton' | 'Red Sandy Loam' | 'Clay Loam' | 'Laterite';
  irrigationAvailable: 'Canal' | 'Borewell' | 'Rainfed' | 'Drip';
  currentCrop: string;
  sowingSeason: 'Kharif' | 'Rabi' | 'Zaid';
  pestSymptoms?: string;
}

export interface AgricultureRecommendation {
  generatedBy: 'gemini-4-hydrogen' | 'rule-engine-fallback';
  generatedAt: string;
  floodAlertForFarm: {
    active: boolean;
    severity: RiskLevel;
    summary: string;
    actions: string[];
  };
  cropRecommendations: Array<{
    crop: string;
    suitabilityScore: number;
    reason: string;
    waterRequirement: string;
  }>;
  weatherFarmingPlan: {
    bestSowingWindow: string;
    irrigationSchedule: string;
    rainfallImpact: string;
    harvestingAdvice: string;
    drainageMeasures: string[];
  };
  pestManagement: {
    identifiedRisk: string;
    ipmSteps: string[];
    registeredProductGuidance: string;
    ppeAndSafety: string;
    waitingPeriodNote: string;
  };
  verifiedExpertAdvisories: Array<{
    source: string;
    title: string;
    guidance: string;
    publishedDate: string;
  }>;
}

export interface ArchitectureMetrics {
  instances: Array<{
    id: string;
    port: number;
    status: 'active';
    uptimeSec: number;
    requestsHandled: number;
    lastHeartbeat: string;
  }>;
  redis: {
    mode: 'in-memory-distributed-shim' | 'external-redis';
    keysCached: number;
    activeLocks: number;
    rateLimitChecks: number;
    idempotencyHits: number;
  };
  rabbitmq: {
    mode: 'in-process-topic-broker' | 'external-rabbitmq';
    exchange: string;
    queues: {
      sms: number;
      email: number;
      push: number;
      sos: number;
    };
    dlqCount: number;
    totalPublished: number;
    totalAcked: number;
    totalRetries: number;
  };
  integrations: {
    geminiAI: boolean;
    webPushVapid: boolean;
    smtpEmail: boolean;
    twilioSms: boolean;
    googleMapsClientKey: boolean;
    postgresConfigured: boolean;
  };
  liveStats: {
    registeredUsers: number;
    activeAlerts: number;
    sosReceived: number;
    sosAcknowledged: number;
    sosResolved: number;
    notificationsDelivered: number;
    notificationsDemoSimulated: number;
    notificationsFailedDlq: number;
    avgSosLatencyMs: number;
  };
  simulationStats: {
    isRunning: boolean;
    simulatedResidents: number;
    alertsGenerated: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    retryCount: number;
    sosReceived: number;
    sosAcknowledged: number;
    queueDepth: number;
    avgLatencyMs: number;
    lastRunAt: string | null;
  };
}

export type PoiCategory =
  | 'all'
  | 'hospitals'
  | 'schools'
  | 'emergency'
  | 'shopping'
  | 'transport'
  | 'roads_bridges';

export type MapLayerMode =
  | 'standard'
  | 'flood_risk'
  | 'rainfall'
  | 'river'
  | 'emergency';

export interface MapPoiItem {
  id: string;
  name: string;
  category: Exclude<PoiCategory, 'all'>;
  subType: string;
  address: string;
  lat: number;
  lng: number;
  osmType?: string;
  osmId?: string | number;
  source: string;
}

export interface NominatimSearchSuggestion {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  boundingBox?: [number, number, number, number];
  type: string;
  category: string;
}

export interface SpatialFloodSample {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  riskScore: number | null;
  riskLevel: RiskLevel;
  rainfallMm: number | null;
  forecast24hMm: number | null;
  precipProbabilityPct: number | null;
  riverDischargeM3s: number | null;
  riverDischargeMeanM3s: number | null;
  observationTimestamp: string | null;
  dataSource: string;
}

