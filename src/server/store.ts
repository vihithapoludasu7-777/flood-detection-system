import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type {
  ChatMessage,
  EmergencyAnnouncement,
  LocationZone,
  MapFacility,
  NotificationDeliveryRecord,
  RescueTeam,
  SOSIncident,
  UserProfile,
} from '../types.ts';

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

export interface StoredPushSub {
  id: string;
  userId: string;
  locality: string;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  createdAt: string;
}

export interface AlertNetDatabase {
  users: StoredUser[];
  locations: LocationZone[];
  facilities: MapFacility[];
  rescueTeams: RescueTeam[];
  incidents: SOSIncident[];
  announcements: EmergencyAnnouncement[];
  deliveryLogs: NotificationDeliveryRecord[];
  chatMessages: ChatMessage[];
  pushSubscriptions: StoredPushSub[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'alertnet-db.json');

function buildForecast(baseTemp: number, baseRain: number): LocationZone['forecast24h'] {
  const hours = ['Now', '+3h', '+6h', '+9h', '+12h', '+15h', '+18h', '+21h', '+24h'];
  return hours.map((time, idx) => {
    const rainFactor = idx <= 3 ? 1.15 - idx * 0.1 : Math.max(0.15, 0.8 - (idx - 3) * 0.12);
    const rainfallMm = Math.max(0, Math.round(baseRain * rainFactor * 10) / 10);
    return {
      time,
      tempC: Math.round((baseTemp - (rainfallMm > 15 ? 1.5 : 0) + (idx % 3 === 0 ? 1 : 0)) * 10) / 10,
      rainfallMm,
      humidityPct: Math.min(98, Math.round(74 + Math.min(22, rainfallMm * 0.6))),
      windKmh: Math.round(14 + rainfallMm * 0.45),
      condition:
        rainfallMm >= 30
          ? 'Heavy Downpour'
          : rainfallMm >= 12
          ? 'Moderate Rain'
          : rainfallMm >= 2
          ? 'Light Showers'
          : 'Overcast',
    };
  });
}

function createInitialData(): AlertNetDatabase {
  const now = new Date().toISOString();
  const defaultHash = bcrypt.hashSync('alertnet123', 8);

  const users: StoredUser[] = [
    {
      id: 'usr-citizen-1',
      fullName: 'Ananya Reddy',
      email: 'citizen@alertnet.in',
      mobile: '+91 98480 11223',
      passwordHash: defaultHash,
      role: 'citizen',
      state: 'Telangana',
      district: 'Medchal-Malkajgiri',
      locality: 'Kukatpally',
      registeredLat: 17.4849,
      registeredLng: 78.4138,
      locationPermissionGranted: true,
      notificationPrefs: {
        email: true,
        sms: true,
        push: true,
        minSeverity: 'HIGH',
        agriculturalFloodAlerts: false,
      },
      createdAt: now,
    },
    {
      id: 'usr-farmer-1',
      fullName: 'Ramesh Naik',
      email: 'farmer@alertnet.in',
      mobile: '+91 98491 44556',
      passwordHash: defaultHash,
      role: 'farmer',
      state: 'Telangana',
      district: 'Rangareddy',
      locality: 'Miyapur',
      registeredLat: 17.4968,
      registeredLng: 78.3614,
      locationPermissionGranted: true,
      notificationPrefs: {
        email: true,
        sms: true,
        push: true,
        minSeverity: 'MODERATE',
        agriculturalFloodAlerts: true,
      },
      createdAt: now,
    },
    {
      id: 'usr-rescue-1',
      fullName: 'Capt. Vikram Rao (NDRF Unit-04)',
      email: 'rescue@alertnet.in',
      mobile: '+91 90001 77889',
      passwordHash: defaultHash,
      role: 'rescue',
      state: 'Telangana',
      district: 'Hyderabad',
      locality: 'Kukatpally',
      registeredLat: 17.4882,
      registeredLng: 78.4045,
      locationPermissionGranted: true,
      notificationPrefs: {
        email: true,
        sms: true,
        push: true,
        minSeverity: 'MODERATE',
        agriculturalFloodAlerts: false,
      },
      createdAt: now,
    },
    {
      id: 'usr-admin-1',
      fullName: 'Dr. Kavitha Sharma (SDMA Control)',
      email: 'admin@alertnet.in',
      mobile: '+91 94400 99001',
      passwordHash: defaultHash,
      role: 'admin',
      state: 'Telangana',
      district: 'Hyderabad',
      locality: 'Hyderabad Central',
      registeredLat: 17.4239,
      registeredLng: 78.4738,
      locationPermissionGranted: true,
      notificationPrefs: {
        email: true,
        sms: true,
        push: true,
        minSeverity: 'MODERATE',
        agriculturalFloodAlerts: false,
      },
      createdAt: now,
    },
  ];

  const locations: LocationZone[] = [
    {
      id: 'loc-kukatpally',
      name: 'Kukatpally',
      district: 'Medchal-Malkajgiri',
      state: 'Telangana',
      lat: 17.4849,
      lng: 78.4138,
      radiusMeters: 3500,
      riskScore: 88,
      riskLevel: 'CRITICAL',
      rainfallIntensityMmHr: 46.5,
      historicalRainfall24hMm: 142,
      temperatureC: 25.4,
      humidityPct: 94,
      windSpeedKmh: 28,
      waterLevelM: 4.35,
      dangerWaterLevelM: 4.0,
      soilMoisturePct: 91,
      drainageCapacityPct: 28,
      historicalFloodCount: 7,
      alertTitle: 'CRITICAL FLOOD WARNING – KUKATPALLY',
      alertMessage:
        'Heavy rainfall detected (46.5 mm/hr). Kukatpally Nala water levels exceeded 4.0m danger mark. Avoid low-lying areas and move to safer ground.',
      safetyRecommendations: [
        'Move immediately to upper floors or JNTU Safe Relief Camp.',
        'Do not walk or drive across Kukatpally Y-Junction or submerged underpasses.',
        'Switch off main electrical breakers if water approaches ground-floor outlets.',
        'Keep emergency kit, medicines, drinking water, and charged power bank ready.',
      ],
      lastUpdated: now,
      dataSource: 'simulated_sensor_network',
      forecast24h: buildForecast(25.4, 46.5),
      predictions: [
        {
          horizonHours: 1,
          expectedSeverity: 'CRITICAL',
          riskPercentage: 91,
          confidencePercentage: 92,
          predictedWaterRiseCm: 28,
          estimatedWindow: 'Next 60 mins',
          reasons: [
            'Sustained 46.5 mm/hr cloudburst over Kukatpally catchment',
            'Stormwater drainage operating at 28% effective capacity',
            'Nala water level already +0.35m above danger mark',
          ],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 3,
          expectedSeverity: 'CRITICAL',
          riskPercentage: 86,
          confidencePercentage: 88,
          predictedWaterRiseCm: 42,
          estimatedWindow: '1–3 hours',
          reasons: [
            'Upstream inflow from Miyapur lake spillway',
            'Soil saturation at 91% preventing ground absorption',
          ],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 6,
          expectedSeverity: 'HIGH',
          riskPercentage: 74,
          confidencePercentage: 82,
          predictedWaterRiseCm: 18,
          estimatedWindow: '3–6 hours',
          reasons: [
            'Rain cell gradually drifting southeast toward Musi basin',
            'Recession delayed by clogged secondary culverts',
          ],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 24,
          expectedSeverity: 'MODERATE',
          riskPercentage: 48,
          confidencePercentage: 75,
          predictedWaterRiseCm: -35,
          estimatedWindow: '6–24 hours',
          reasons: [
            'Forecast rainfall intensity drops below 10 mm/hr after +12h',
            'GHMC pumping teams clearing primary trunk drains',
          ],
          dataSource: 'simulated_sensor_network',
        },
      ],
    },
    {
      id: 'loc-miyapur',
      name: 'Miyapur',
      district: 'Rangareddy',
      state: 'Telangana',
      lat: 17.4968,
      lng: 78.3614,
      radiusMeters: 3200,
      riskScore: 73,
      riskLevel: 'HIGH',
      rainfallIntensityMmHr: 32.0,
      historicalRainfall24hMm: 108,
      temperatureC: 26.1,
      humidityPct: 89,
      windSpeedKmh: 24,
      waterLevelM: 3.65,
      dangerWaterLevelM: 3.8,
      soilMoisturePct: 86,
      drainageCapacityPct: 44,
      historicalFloodCount: 4,
      alertTitle: 'HIGH FLOOD ALERT – MIYAPUR',
      alertMessage:
        'Rapid water rise near Miyapur Lake and Bollaram Road. Farmers advised to protect stored seed stock and clear field drainage bunds.',
      safetyRecommendations: [
        'Avoid NH-65 low-lying service lanes near Miyapur Metro.',
        'Farmers: move harvested grain, seeds, and fertilizers to elevated dry platforms.',
        'Monitor SMS and push alerts for possible spillway release.',
      ],
      lastUpdated: now,
      dataSource: 'simulated_sensor_network',
      forecast24h: buildForecast(26.1, 32.0),
      predictions: [
        {
          horizonHours: 1,
          expectedSeverity: 'HIGH',
          riskPercentage: 76,
          confidencePercentage: 89,
          predictedWaterRiseCm: 19,
          estimatedWindow: 'Next 60 mins',
          reasons: ['Miyapur Lake approaching 95% FTL capacity', '32 mm/hr active rainfall'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 3,
          expectedSeverity: 'HIGH',
          riskPercentage: 79,
          confidencePercentage: 85,
          predictedWaterRiseCm: 26,
          estimatedWindow: '1–3 hours',
          reasons: ['Potential lake weir overflow into low agricultural fields'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 6,
          expectedSeverity: 'MODERATE',
          riskPercentage: 58,
          confidencePercentage: 80,
          predictedWaterRiseCm: 8,
          estimatedWindow: '3–6 hours',
          reasons: ['Rain intensity easing to 15 mm/hr'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 24,
          expectedSeverity: 'LOW',
          riskPercentage: 29,
          confidencePercentage: 74,
          predictedWaterRiseCm: -25,
          estimatedWindow: '6–24 hours',
          reasons: ['Clearer skies projected overnight'],
          dataSource: 'simulated_sensor_network',
        },
      ],
    },
    {
      id: 'loc-begumpet',
      name: 'Begumpet',
      district: 'Hyderabad',
      state: 'Telangana',
      lat: 17.4447,
      lng: 78.4664,
      radiusMeters: 3000,
      riskScore: 54,
      riskLevel: 'MODERATE',
      rainfallIntensityMmHr: 19.4,
      historicalRainfall24hMm: 74,
      temperatureC: 26.8,
      humidityPct: 84,
      windSpeedKmh: 19,
      waterLevelM: 2.9,
      dangerWaterLevelM: 3.6,
      soilMoisturePct: 75,
      drainageCapacityPct: 62,
      historicalFloodCount: 5,
      alertTitle: 'MODERATE FLOOD WATCH – BEGUMPET',
      alertMessage:
        'Moderate waterlogging near Begumpet Nala and Prakash Nagar flyover ramps. Exercise caution during evening commute.',
      safetyRecommendations: [
        'Use elevated flyover routes; avoid Prakash Nagar culvert.',
        'Check vehicle drainage clearance and avoid standing water.',
      ],
      lastUpdated: now,
      dataSource: 'simulated_sensor_network',
      forecast24h: buildForecast(26.8, 19.4),
      predictions: [
        {
          horizonHours: 1,
          expectedSeverity: 'MODERATE',
          riskPercentage: 56,
          confidencePercentage: 86,
          predictedWaterRiseCm: 10,
          estimatedWindow: 'Next 60 mins',
          reasons: ['Steady 19.4 mm/hr rainfall', 'Hussain Sagar surplus inflow'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 3,
          expectedSeverity: 'MODERATE',
          riskPercentage: 61,
          confidencePercentage: 82,
          predictedWaterRiseCm: 14,
          estimatedWindow: '1–3 hours',
          reasons: ['Downstream runoff from Kukatpally corridor'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 6,
          expectedSeverity: 'MODERATE',
          riskPercentage: 45,
          confidencePercentage: 78,
          predictedWaterRiseCm: 2,
          estimatedWindow: '3–6 hours',
          reasons: ['Drainage holding steady at 62% capacity'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 24,
          expectedSeverity: 'LOW',
          riskPercentage: 22,
          confidencePercentage: 76,
          predictedWaterRiseCm: -18,
          estimatedWindow: '6–24 hours',
          reasons: ['Gradual drying trend over next 18 hours'],
          dataSource: 'simulated_sensor_network',
        },
      ],
    },
    {
      id: 'loc-gachibowli',
      name: 'Gachibowli',
      district: 'Rangareddy',
      state: 'Telangana',
      lat: 17.4401,
      lng: 78.3489,
      radiusMeters: 3400,
      riskScore: 24,
      riskLevel: 'LOW',
      rainfallIntensityMmHr: 6.2,
      historicalRainfall24hMm: 28,
      temperatureC: 27.6,
      humidityPct: 76,
      windSpeedKmh: 15,
      waterLevelM: 1.65,
      dangerWaterLevelM: 3.4,
      soilMoisturePct: 58,
      drainageCapacityPct: 86,
      historicalFloodCount: 1,
      alertTitle: 'NORMAL CONDITIONS – GACHIBOWLI',
      alertMessage:
        'Light passing showers. Drainage and road corridors are currently clear and safe for travel.',
      safetyRecommendations: [
        'Conditions safe; keep location alerts active if travelling toward Kukatpally.',
        'Emergency shelters on standby for neighboring high-risk zones.',
      ],
      lastUpdated: now,
      dataSource: 'simulated_sensor_network',
      forecast24h: buildForecast(27.6, 6.2),
      predictions: [
        {
          horizonHours: 1,
          expectedSeverity: 'LOW',
          riskPercentage: 24,
          confidencePercentage: 91,
          predictedWaterRiseCm: 3,
          estimatedWindow: 'Next 60 mins',
          reasons: ['Light rain (6.2 mm/hr) easily absorbed by 86% drainage capacity'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 3,
          expectedSeverity: 'LOW',
          riskPercentage: 28,
          confidencePercentage: 87,
          predictedWaterRiseCm: 4,
          estimatedWindow: '1–3 hours',
          reasons: ['Elevated terrain reduces water accumulation'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 6,
          expectedSeverity: 'LOW',
          riskPercentage: 20,
          confidencePercentage: 84,
          predictedWaterRiseCm: 0,
          estimatedWindow: '3–6 hours',
          reasons: ['Minimal upstream inflow'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 24,
          expectedSeverity: 'LOW',
          riskPercentage: 14,
          confidencePercentage: 81,
          predictedWaterRiseCm: -8,
          estimatedWindow: '6–24 hours',
          reasons: ['Dry weather expected tomorrow'],
          dataSource: 'simulated_sensor_network',
        },
      ],
    },
    {
      id: 'loc-lbnagar',
      name: 'LB Nagar',
      district: 'Rangareddy',
      state: 'Telangana',
      lat: 17.3457,
      lng: 78.5522,
      radiusMeters: 3200,
      riskScore: 67,
      riskLevel: 'HIGH',
      rainfallIntensityMmHr: 29.5,
      historicalRainfall24hMm: 98,
      temperatureC: 25.9,
      humidityPct: 90,
      windSpeedKmh: 22,
      waterLevelM: 3.55,
      dangerWaterLevelM: 3.7,
      soilMoisturePct: 84,
      drainageCapacityPct: 48,
      historicalFloodCount: 5,
      alertTitle: 'HIGH FLOOD ALERT – LB NAGAR',
      alertMessage:
        'Musi downstream runoff rising rapidly. Avoid Saroornagar Tank bund roads and low residential basements.',
      safetyRecommendations: [
        'Move vehicles out of basement parking in low-lying colonies.',
        'Avoid Saroornagar Lake perimeter road.',
      ],
      lastUpdated: now,
      dataSource: 'simulated_sensor_network',
      forecast24h: buildForecast(25.9, 29.5),
      predictions: [
        {
          horizonHours: 1,
          expectedSeverity: 'HIGH',
          riskPercentage: 70,
          confidencePercentage: 88,
          predictedWaterRiseCm: 16,
          estimatedWindow: 'Next 60 mins',
          reasons: ['Saroornagar surplus discharge + 29.5 mm/hr rainfall'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 3,
          expectedSeverity: 'HIGH',
          riskPercentage: 74,
          confidencePercentage: 84,
          predictedWaterRiseCm: 22,
          estimatedWindow: '1–3 hours',
          reasons: ['Musi corridor convergence peak'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 6,
          expectedSeverity: 'MODERATE',
          riskPercentage: 52,
          confidencePercentage: 79,
          predictedWaterRiseCm: 5,
          estimatedWindow: '3–6 hours',
          reasons: ['Outflow pumps active'],
          dataSource: 'simulated_sensor_network',
        },
        {
          horizonHours: 24,
          expectedSeverity: 'LOW',
          riskPercentage: 25,
          confidencePercentage: 74,
          predictedWaterRiseCm: -20,
          estimatedWindow: '6–24 hours',
          reasons: ['Storm cell clearing'],
          dataSource: 'simulated_sensor_network',
        },
      ],
    },
  ];

  const facilities: MapFacility[] = [
    {
      id: 'fac-1',
      type: 'shelter',
      name: 'JNTU Hyderabad Safe Relief Shelter',
      locality: 'Kukatpally',
      lat: 17.4933,
      lng: 78.3914,
      capacity: 450,
      availableBeds: 168,
      contact: '+91 40 2315 8661',
    },
    {
      id: 'fac-2',
      type: 'hospital',
      name: 'Remedy Multi-Specialty Emergency Hospital',
      locality: 'Kukatpally',
      lat: 17.4865,
      lng: 78.4071,
      capacity: 180,
      availableBeds: 34,
      contact: '+91 40 2305 1111',
    },
    {
      id: 'fac-3',
      type: 'rescue_station',
      name: 'NDRF / GHMC DRF Forward Station KPHB',
      locality: 'Kukatpally',
      lat: 17.4892,
      lng: 78.3995,
      contact: '1070 / 040-21111111',
    },
    {
      id: 'fac-4',
      type: 'relief_centre',
      name: 'Miyapur Community Relief & Ration Depot',
      locality: 'Miyapur',
      lat: 17.4981,
      lng: 78.3568,
      capacity: 300,
      availableBeds: 210,
      contact: '+91 40 2304 5522',
    },
    {
      id: 'fac-5',
      type: 'shelter',
      name: 'Gachibowli Indoor Stadium Emergency Shelter',
      locality: 'Gachibowli',
      lat: 17.4452,
      lng: 78.3471,
      capacity: 1200,
      availableBeds: 940,
      contact: '+91 40 2300 4410',
    },
    {
      id: 'fac-6',
      type: 'hospital',
      name: 'KIMS Emergency Trauma Centre',
      locality: 'Begumpet',
      lat: 17.4368,
      lng: 78.4835,
      capacity: 320,
      availableBeds: 62,
      contact: '+91 40 4488 5000',
    },
    {
      id: 'fac-7',
      type: 'waterlogging',
      name: 'Kukatpally Y-Junction Underpass Waterlogging (1.2m)',
      locality: 'Kukatpally',
      lat: 17.4822,
      lng: 78.4148,
      severity: 'CRITICAL',
      reportedAt: now,
    },
    {
      id: 'fac-8',
      type: 'waterlogging',
      name: 'Miyapur X-Roads Low Carriageway Flooding (0.6m)',
      locality: 'Miyapur',
      lat: 17.4951,
      lng: 78.3635,
      severity: 'HIGH',
      reportedAt: now,
    },
  ];

  const rescueTeams: RescueTeam[] = [
    {
      id: 'team-1',
      name: 'NDRF Alpha Boat Unit-04',
      unitCode: 'DRF-KPHB-04',
      locality: 'Kukatpally',
      lat: 17.4875,
      lng: 78.4095,
      status: 'Dispatched',
      assignedIncidentId: 'sos-inc-101',
      personnelCount: 8,
      equipment: '2 Inflatable Rescue Boats, Medical Trauma Kit, Rope Winch',
      lastHeartbeat: now,
    },
    {
      id: 'team-2',
      name: 'GHMC Rapid Response Team-09',
      unitCode: 'DRF-MYP-09',
      locality: 'Miyapur',
      lat: 17.4945,
      lng: 78.368,
      status: 'Available',
      personnelCount: 6,
      equipment: 'High-Capacity Dewatering Pump, 4x4 Rescue Truck',
      lastHeartbeat: now,
    },
    {
      id: 'team-3',
      name: 'Telangana SDRF Medical Evacuation-02',
      unitCode: 'SDRF-MED-02',
      locality: 'Begumpet',
      lat: 17.448,
      lng: 78.458,
      status: 'Available',
      personnelCount: 5,
      equipment: 'Amphibious Ambulance, Oxygen & Defibrillator Unit',
      lastHeartbeat: now,
    },
  ];

  const incidents: SOSIncident[] = [
    {
      id: 'sos-inc-101',
      clusterKey: '17.484_78.414',
      locality: 'Kukatpally',
      lat: 17.4842,
      lng: 78.4145,
      primaryCategory: 'people_trapped',
      status: 'Team on the Way',
      aiClassification: 'Critical',
      aiReasoning:
        'Multiple citizens including elderly residents trapped on first floor with rapidly rising 1.2m water near Kukatpally Nala.',
      assignedTeamId: 'team-1',
      assignedTeamName: 'NDRF Alpha Boat Unit-04',
      reportCount: 2,
      reports: [
        {
          id: 'rep-1',
          idempotencyKey: 'seed-rep-1',
          userId: 'usr-citizen-1',
          reporterName: 'Srinivas Rao',
          reporterMobile: '+91 98480 33112',
          category: 'people_trapped',
          description: 'Water entered ground floor up to 4 feet at Vivekananda Nagar Lane 3. 2 elderly people on 1st floor need evacuation.',
          lat: 17.4842,
          lng: 78.4145,
          locality: 'Kukatpally',
          createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
        },
        {
          id: 'rep-2',
          idempotencyKey: 'seed-rep-2',
          userId: 'usr-citizen-2',
          reporterName: 'Lakshmi Devi',
          reporterMobile: '+91 98495 22019',
          category: 'house_flooding',
          description: 'Adjacent building power cut off, water rising fast near Lane 3.',
          lat: 17.4845,
          lng: 78.4149,
          locality: 'Kukatpally',
          createdAt: new Date(Date.now() - 14 * 60000).toISOString(),
        },
      ],
      createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
      acknowledgedAt: new Date(Date.now() - 17 * 60000).toISOString(),
      processingInstanceId: 'instance-1',
      processingLatencyMs: 38,
    },
    {
      id: 'sos-inc-102',
      clusterKey: '17.496_78.362',
      locality: 'Miyapur',
      lat: 17.4962,
      lng: 78.3622,
      primaryCategory: 'food_water_required',
      status: 'Under Review',
      aiClassification: 'Urgent',
      aiReasoning:
        '35 residents sheltered at local school building require clean drinking water and dry food packets.',
      reportCount: 1,
      reports: [
        {
          id: 'rep-3',
          idempotencyKey: 'seed-rep-3',
          userId: 'usr-farmer-1',
          reporterName: 'Ramesh Naik',
          reporterMobile: '+91 98491 44556',
          category: 'food_water_required',
          description: '12 families moved to ZPHS school terrace near Miyapur Lake. Need clean drinking water and baby food.',
          lat: 17.4962,
          lng: 78.3622,
          locality: 'Miyapur',
          createdAt: new Date(Date.now() - 32 * 60000).toISOString(),
        },
      ],
      createdAt: new Date(Date.now() - 32 * 60000).toISOString(),
      updatedAt: new Date(Date.now() - 25 * 60000).toISOString(),
      acknowledgedAt: new Date(Date.now() - 31 * 60000).toISOString(),
      processingInstanceId: 'instance-2',
      processingLatencyMs: 42,
    },
  ];

  const announcements: EmergencyAnnouncement[] = [
    {
      id: 'ann-1',
      title: 'CRITICAL FLOOD WARNING – KUKATPALLY',
      message:
        'GHMC & SDMA Emergency Notice: Heavy rainfall and Kukatpally Nala overflow detected. Avoid Y-Junction underpass. JNTU Relief Camp is open with 168 beds and medical aid.',
      locality: 'Kukatpally',
      severity: 'CRITICAL',
      publishedBy: 'Dr. Kavitha Sharma (SDMA Control)',
      publishedAt: new Date(Date.now() - 25 * 60000).toISOString(),
      geofencedRecipients: 1420,
    },
  ];

  const chatMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      roomId: 'room-kukatpally',
      locality: 'Kukatpally',
      category: 'Road Conditions',
      userId: 'usr-rescue-1',
      senderName: 'Capt. Vikram Rao (NDRF Unit-04)',
      senderRole: 'rescue',
      text: 'Kukatpally Y-Junction underpass is closed due to 1.2m waterlogging. Please divert via JNTU Metro elevated corridor.',
      isAnnouncement: true,
      reportedCount: 0,
      createdAt: new Date(Date.now() - 22 * 60000).toISOString(),
    },
    {
      id: 'msg-2',
      roomId: 'room-kukatpally',
      locality: 'Kukatpally',
      category: 'Shelter Information',
      userId: 'usr-citizen-1',
      senderName: 'Ananya Reddy',
      senderRole: 'citizen',
      text: 'JNTU Auditorium Gate 2 is open and distributing hot meals and dry blankets. Power backup is working.',
      reportedCount: 0,
      createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
    },
    {
      id: 'msg-3',
      roomId: 'room-miyapur',
      locality: 'Miyapur',
      category: 'Emergency Help',
      userId: 'usr-farmer-1',
      senderName: 'Ramesh Naik',
      senderRole: 'farmer',
      text: 'Spillway flow increasing near Miyapur Lake east bund. Livestock owners please shift cattle toward higher ground near Temple Road.',
      reportedCount: 0,
      createdAt: new Date(Date.now() - 9 * 60000).toISOString(),
    },
    {
      id: 'msg-4',
      roomId: 'room-hyderabad',
      locality: 'Hyderabad Emergency Network',
      category: 'Food and Medical Help',
      userId: 'usr-admin-1',
      senderName: 'Dr. Kavitha Sharma (SDMA Control)',
      senderRole: 'admin',
      text: 'Mobile medical vans stationed at Remedy Hospital Kukatpally and Gachibowli Indoor Stadium. Call 1070 or use AlertNet SOS for immediate dispatch.',
      isAnnouncement: true,
      reportedCount: 0,
      createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    },
  ];

  const deliveryLogs: NotificationDeliveryRecord[] = [
    {
      id: 'del-1',
      alertId: 'ann-1',
      userId: 'usr-citizen-1',
      recipientLabel: 'Ananya Reddy (citizen@alertnet.in)',
      locality: 'Kukatpally',
      channel: 'email',
      status: 'demo_simulated',
      attempts: 1,
      messagePreview: 'ALERTNET – CRITICAL FLOOD WARNING! Your registered area, Kukatpally, is under critical flood alert.',
      workerInstance: 'instance-1',
      createdAt: new Date(Date.now() - 24 * 60000).toISOString(),
      updatedAt: new Date(Date.now() - 24 * 60000).toISOString(),
    },
    {
      id: 'del-2',
      alertId: 'ann-1',
      userId: 'usr-citizen-1',
      recipientLabel: '+91 98480 11223',
      locality: 'Kukatpally',
      channel: 'sms',
      status: 'demo_simulated',
      attempts: 1,
      messagePreview: 'ALERTNET CRITICAL: Kukatpally flood alert. Move to higher ground. Use SOS in AlertNet app.',
      workerInstance: 'instance-2',
      createdAt: new Date(Date.now() - 24 * 60000).toISOString(),
      updatedAt: new Date(Date.now() - 24 * 60000).toISOString(),
    },
  ];

  return {
    users,
    locations,
    facilities,
    rescueTeams,
    incidents,
    announcements,
    deliveryLogs,
    chatMessages,
    pushSubscriptions: [],
  };
}

class PersistentStore {
  private data: AlertNetDatabase;
  private writePending = false;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw) as AlertNetDatabase;
      } catch {
        this.data = createInitialData();
        this.saveSync();
      }
    } else {
      this.data = createInitialData();
      this.saveSync();
    }
  }

  get state(): AlertNetDatabase {
    return this.data;
  }

  save(): void {
    if (this.writePending) return;
    this.writePending = true;
    setTimeout(() => {
      this.writePending = false;
      this.saveSync();
    }, 150);
  }

  saveSync(): void {
    try {
      const tmp = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('Failed to persist AlertNet DB:', err);
    }
  }
}

export const dbStore = new PersistentStore();
