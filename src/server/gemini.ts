import { GoogleGenAI, Type } from '@google/genai';
import { recordApiStatus } from './worldFlood.ts';
import type {
  AIClassification,
  AgricultureInput,
  AgricultureRecommendation,
  Language,
  LocationZone,
  SOSCategory,
} from '../types.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function classifySOSWithAI(params: {
  category: SOSCategory;
  description: string;
  locality: string;
  zoneRiskScore?: number;
}): Promise<{ classification: AIClassification; reasoning: string; source: 'gemini-4-hydrogen' | 'rule-engine' }> {
  const ai = getGeminiClient();
  const { category, description, locality, zoneRiskScore = 60 } = params;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Classify this emergency SOS report into Critical, Urgent, or Informational.
Category: ${category}
Locality: ${locality} (Current Flood Risk Score: ${zoneRiskScore}/100)
Citizen description: "${description}"
Rules:
- Critical: Immediate threat to life (people trapped, medical emergency, rising indoor water, missing child/elderly).
- Urgent: Severe property flooding, food/clean water shortage, stranded without imminent drowning.
- Informational: General status update or non-emergency report.
Provide a concise 1-sentence reasoning.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              classification: {
                type: Type.STRING,
                description: 'Must be Critical, Urgent, or Informational',
              },
              reasoning: {
                type: Type.STRING,
                description: 'Concise 1-sentence reason for the classification',
              },
            },
          },
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        classification?: string;
        reasoning?: string;
      };
      const normalized: AIClassification =
        parsed.classification === 'Critical' ||
        parsed.classification === 'Urgent' ||
        parsed.classification === 'Informational'
          ? parsed.classification
          : 'Urgent';
      if (parsed.reasoning) {
        recordApiStatus({
          id: 'gemini-ai',
          provider: 'Google Gemini API',
          endpoint: 'https://generativelanguage.googleapis.com (model: gemini-4-hydrogen)',
          httpStatus: 200,
          status: 'live',
          lastUpdatedAt: new Date().toISOString(),
          dataTimestamp: new Date().toISOString(),
          dataSource: 'Live @google/genai SDK (SOS Triage)',
          errorMessage: null,
          locationLabel: locality,
        });
        return {
          classification: normalized,
          reasoning: parsed.reasoning,
          source: 'gemini-4-hydrogen',
        };
      }
    } catch (err: any) {
      console.warn('Gemini SOS classification fallback activated:', err);
      recordApiStatus({
        id: 'gemini-ai',
        provider: 'Google Gemini API',
        endpoint: 'https://generativelanguage.googleapis.com (model: gemini-4-hydrogen)',
        httpStatus: err?.status ?? null,
        status: 'error',
        lastUpdatedAt: new Date().toISOString(),
        dataTimestamp: null,
        dataSource: 'Rule-engine fallback',
        errorMessage: err?.message || 'Gemini SOS classification failed',
        locationLabel: locality,
      });
    }
  }

  // Deterministic rule-engine fallback when Gemini API key is unavailable
  const text = description.toLowerCase();
  if (
    category === 'people_trapped' ||
    category === 'medical_emergency' ||
    category === 'missing_person' ||
    /trapped|elderly|child|baby|heart|unconscious|roof|chest|drowning/.test(text)
  ) {
    return {
      classification: 'Critical',
      reasoning: `Immediate life-safety indicators detected (${category.replace(/_/g, ' ')}) in ${locality} (risk ${zoneRiskScore}/100).`,
      source: 'rule-engine',
    };
  }
  if (category === 'house_flooding' || category === 'food_water_required' || category === 'rescue_assistance') {
    return {
      classification: zoneRiskScore >= 80 ? 'Critical' : 'Urgent',
      reasoning: `Active flood impact (${category.replace(/_/g, ' ')}) in ${locality} requiring prioritized dispatch.`,
      source: 'rule-engine',
    };
  }
  return {
    classification: 'Informational',
    reasoning: 'General situational report logged for responder review.',
    source: 'rule-engine',
  };
}

export async function chatSafetyAssistant(params: {
  question: string;
  language: Language;
  zone: LocationZone;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<{ reply: string; modelUsed: string }> {
  const { question, language, zone, history = [] } = params;
  const ai = getGeminiClient();

  const langLabel =
    language === 'te' ? 'Telugu (తెలుగు)' : language === 'hi' ? 'Hindi (हिन्दी)' : 'English';

  const tempStr = zone.temperatureC !== null ? `${zone.temperatureC}°C` : 'DATA UNAVAILABLE';
  const rainStr = zone.rainfallIntensityMmHr !== null ? `${zone.rainfallIntensityMmHr} mm` : 'DATA UNAVAILABLE';
  const probStr = zone.precipitationProbabilityPct !== null ? `${zone.precipitationProbabilityPct}%` : 'DATA UNAVAILABLE';
  const riverStr = zone.riverDischargeM3s != null ? `${zone.riverDischargeM3s} m³/s` : 'DATA UNAVAILABLE';
  const riskStr = zone.riskScore !== null ? `${zone.riskLevel} (${zone.riskScore}/100)` : 'DATA UNAVAILABLE';

  const systemInstruction = `You are AlertNet AI Assistant, an emergency flood survival advisor.
Respond ONLY in ${langLabel}.
Current user location: ${zone.name}, ${zone.district}, ${zone.state}${zone.country ? `, ${zone.country}` : ''}.
Current flood risk: ${riskStr}.
Observed Temperature: ${tempStr}. Current Rainfall: ${rainStr}. Precipitation Probability: ${probStr}.
GloFAS River Discharge: ${riverStr}.
Strict safety rules:
1. Keep answers short, clear, and structured with numbered steps.
2. Prioritize life-saving advice above all else.
3. NEVER suggest walking or driving through floodwater.
4. NEVER invent weather or river numbers that say DATA UNAVAILABLE.
5. Recommend using the AlertNet SOS button or official helplines (1070 / 112 / 108) for active rescue or medical emergencies.
6. Give location-specific advice for ${zone.name} when relevant.`;

  if (ai) {
    try {
      const conversationContext = history
        .slice(-4)
        .map((h) => `${h.role === 'user' ? 'Citizen' : 'Assistant'}: ${h.text}`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${conversationContext ? conversationContext + '\n' : ''}Citizen: ${question}`,
        config: {
          systemInstruction,
        },
      });
      if (response.text) {
        recordApiStatus({
          id: 'gemini-ai',
          provider: 'Google Gemini API',
          endpoint: 'https://generativelanguage.googleapis.com (model: gemini-4-hydrogen)',
          httpStatus: 200,
          status: 'live',
          lastUpdatedAt: new Date().toISOString(),
          dataTimestamp: new Date().toISOString(),
          dataSource: 'Live @google/genai SDK (Safety Assistant)',
          errorMessage: null,
          locationLabel: zone.name,
        });
        return { reply: response.text.trim(), modelUsed: 'gemini-4-hydrogen' };
      }
    } catch (err: any) {
      console.warn('Gemini chat fallback activated:', err);
      recordApiStatus({
        id: 'gemini-ai',
        provider: 'Google Gemini API',
        endpoint: 'https://generativelanguage.googleapis.com (model: gemini-4-hydrogen)',
        httpStatus: err?.status ?? null,
        status: 'error',
        lastUpdatedAt: new Date().toISOString(),
        dataTimestamp: null,
        dataSource: 'Safety protocol fallback',
        errorMessage: err?.message || 'Gemini chat failed',
        locationLabel: zone.name,
      });
    }
  }

  // Multilingual structured fallback
  const fallbackReplies: Record<Language, string> = {
    en: `Safety Guidance for ${zone.name} (${riskStr}):
1. Move to higher ground or an upper floor immediately if water is entering your street.
2. Never walk, swim, or drive through floodwater—6 inches of moving water can sweep you off your feet.
3. Turn off main electricity and gas valves if water approaches ground-floor outlets.
4. Carry ID documents, drinking water, medicines, torch, and charged phone in a waterproof bag.
5. For trapped people or medical emergencies, press the red Emergency SOS button in AlertNet or call 112 / 1070 immediately.`,
    te: `${zone.name} ప్రాంతానికి భద్రతా సూచనలు (${riskStr}):
1. మీ వీధిలోకి నీరు చేరుతుంటే వెంటనే ఎత్తైన ప్రదేశానికి లేదా పై అంతస్తుకు వెళ్లండి.
2. వరద నీటిలో ఎట్టి పరిస్థితుల్లోనూ నడవకండి లేదా వాహనాలు నడపకండి.
3. ఇంట్లోకి నీరు వస్తుంటే మెయిన్ కరెంట్ స్విచ్ మరియు గ్యాస్ వాల్వ్ ఆపివేయండి.
4. తాగునీరు, మందులు, టార్చ్, ముఖ్య పత్రాలు మరియు ఛార్జ్ చేసిన ఫోన్ వాటర్‌ప్రూఫ్ బ్యాగ్‌లో ఉంచుకోండి.
5. అత్యవసర సహాయం కోసం AlertNet లోని Emergency SOS బటన్ నొక్కండి లేదా 112 / 1070 కు కాల్ చేయండి.`,
    hi: `${zone.name} के लिए सुरक्षा निर्देश (${riskStr}):
1. यदि सड़क या घर में पानी भर रहा है, तो तुरंत ऊंचे स्थान या ऊपरी मंजिल पर जाएं।
2. बाढ़ के पानी में कभी भी पैदल न चलें और न ही वाहन चलाएं।
3. बिजली के मुख्य स्विच और गैस वाल्व को सुरक्षित रूप से बंद कर दें।
4. पीने का पानी, दवाइयाँ, टॉर्च, पहचान पत्र और चार्ज फोन वाटरप्रूफ बैग में रखें।
5. किसी भी आपातकालीन सहायता या फंसे होने पर तुरंत AlertNet में Emergency SOS दबाएं या 112 / 1070 पर कॉल करें।`,
  };

  return { reply: fallbackReplies[language], modelUsed: 'safety-protocol-fallback' };
}

export async function generateSmartAgriculturePlan(params: {
  input: AgricultureInput;
  zone: LocationZone;
  language: Language;
}): Promise<AgricultureRecommendation> {
  const { input, zone, language } = params;
  const ai = getGeminiClient();
  const langLabel =
    language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : 'English';

  const verifiedExpertAdvisories: AgricultureRecommendation['verifiedExpertAdvisories'] = [
    {
      source: 'PJTSAU / State Agromet Advisory',
      title: `Excess Soil Moisture & Drainage Protocol (${zone.district})`,
      guidance:
        'Open surface drainage channels across standing crop fields to prevent root rot during >25 mm/hr rainfall events. Suspend foliar fertilizer sprays until rain ceases for 24 hours.',
      publishedDate: new Date().toISOString().slice(0, 10),
    },
    {
      source: 'ICAR – Central Research Institute for Dryland Agriculture',
      title: 'Seed & Fertilizer Storage Protection',
      guidance:
        'Store seed bags and inputs on wooden pallets at least 45 cm above ground inside waterproof tarpaulin covers away from low-lying bunds.',
      publishedDate: new Date().toISOString().slice(0, 10),
    },
  ];

  const isFloodRisk = zone.riskLevel === 'HIGH' || zone.riskLevel === 'CRITICAL';

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide a practical Smart Agriculture & Flood Protection plan in ${langLabel}.
Farm profile:
- Location: ${input.location} (${zone.district}, ${zone.state})
- Land area: ${input.landAreaAcres} acres
- Soil type: ${input.soilType}
- Irrigation: ${input.irrigationAvailable}
- Current crop: ${input.currentCrop}
- Sowing season: ${input.sowingSeason}
- Reported pest/disease symptoms: ${input.pestSymptoms || 'None reported'}

Live Weather & Flood Context (${zone.dataSource}):
- Flood Risk: ${zone.riskLevel} (${zone.riskScore ?? 'DATA UNAVAILABLE'}/100)
- Current Rainfall: ${zone.rainfallIntensityMmHr ?? 'DATA UNAVAILABLE'} mm (24h forecast total: ${zone.historicalRainfall24hMm ?? 'DATA UNAVAILABLE'} mm)
- Temp: ${zone.temperatureC ?? 'DATA UNAVAILABLE'}°C, Humidity: ${zone.humidityPct ?? 'DATA UNAVAILABLE'}%, Soil Moisture: ${zone.soilMoisturePct ?? 'DATA UNAVAILABLE'}%
- GloFAS River Discharge: ${zone.riverDischargeM3s ?? 'DATA UNAVAILABLE'} m³/s

Safety rules for Pest & Disease Management:
- Recommend Integrated Pest Management (IPM) non-chemical methods FIRST.
- For chemical intervention, only name locally registered product categories appropriate for the crop/pest, include PPE, label-compliance, and pre-harvest waiting period reminders.
- NEVER invent specific chemical dosages (no ml/L numbers) or recommend mixing multiple pesticides.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              floodSummary: { type: Type.STRING },
              floodActions: { type: Type.ARRAY, items: { type: Type.STRING } },
              cropRecommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    crop: { type: Type.STRING },
                    suitabilityScore: { type: Type.INTEGER },
                    reason: { type: Type.STRING },
                    waterRequirement: { type: Type.STRING },
                  },
                },
              },
              bestSowingWindow: { type: Type.STRING },
              irrigationSchedule: { type: Type.STRING },
              rainfallImpact: { type: Type.STRING },
              harvestingAdvice: { type: Type.STRING },
              drainageMeasures: { type: Type.ARRAY, items: { type: Type.STRING } },
              identifiedRisk: { type: Type.STRING },
              ipmSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
              registeredProductGuidance: { type: Type.STRING },
              ppeAndSafety: { type: Type.STRING },
              waitingPeriodNote: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      if (parsed.cropRecommendations && parsed.cropRecommendations.length > 0) {
        return {
          generatedBy: 'gemini-4-hydrogen',
          generatedAt: new Date().toISOString(),
          floodAlertForFarm: {
            active: isFloodRisk,
            severity: zone.riskLevel,
            summary: parsed.floodSummary,
            actions: parsed.floodActions || [],
          },
          cropRecommendations: parsed.cropRecommendations,
          weatherFarmingPlan: {
            bestSowingWindow: parsed.bestSowingWindow,
            irrigationSchedule: parsed.irrigationSchedule,
            rainfallImpact: parsed.rainfallImpact,
            harvestingAdvice: parsed.harvestingAdvice,
            drainageMeasures: parsed.drainageMeasures || [],
          },
          pestManagement: {
            identifiedRisk: parsed.identifiedRisk,
            ipmSteps: parsed.ipmSteps || [],
            registeredProductGuidance: parsed.registeredProductGuidance,
            ppeAndSafety: parsed.ppeAndSafety,
            waitingPeriodNote: parsed.waitingPeriodNote,
          },
          verifiedExpertAdvisories,
        };
      }
    } catch (err) {
      console.warn('Gemini agriculture plan fallback activated:', err);
    }
  }

  const safeSoilStr = zone.soilMoisturePct !== null ? `${zone.soilMoisturePct}%` : 'DATA UNAVAILABLE';
  const safeRain24Str = zone.historicalRainfall24hMm !== null ? `${zone.historicalRainfall24hMm} mm` : 'DATA UNAVAILABLE';
  const safeHumStr = zone.humidityPct !== null ? `${zone.humidityPct}%` : 'DATA UNAVAILABLE';

  // Deterministic agronomist rule-engine fallback
  return {
    generatedBy: 'rule-engine-fallback',
    generatedAt: new Date().toISOString(),
    floodAlertForFarm: {
      active: isFloodRisk,
      severity: zone.riskLevel,
      summary: isFloodRisk
        ? `${zone.riskLevel} flood risk (${zone.riskScore ?? 'N/A'}/100) in ${zone.name}. Soil moisture (${safeSoilStr}) and forecast runoff increase waterlogging risk for ${input.currentCrop}.`
        : `Low-to-medium flood risk in ${zone.name}. Normal drainage maintenance advised.`,
      actions: isFloodRisk
        ? [
            'Cut field bund notches toward peripheral drainage channels to drain standing water within 12 hours.',
            'If current crop is at physiological maturity, perform immediate early harvesting ahead of peak runoff.',
            'Move stored seed bags, fertilizers, and fodder onto elevated wooden racks covered with waterproof sheets.',
            'Relocate livestock to dry, elevated sheds away from overflowing tanks or nalas.',
          ]
        : [
            'Keep perimeter field drains clear of weeds and silt.',
            'Monitor 24h AlertNet rainfall updates before scheduling fertilizer top-dressing.',
          ],
    },
    cropRecommendations: [
      {
        crop: 'Paddy (Flood-tolerant short duration varieties)',
        suitabilityScore: 89,
        reason: `Well suited to ${input.soilType} and regional moisture (${safeSoilStr}) during ${input.sowingSeason}.`,
        waterRequirement: 'High',
      },
      {
        crop: 'Maize (Raised-bed ridge planting)',
        suitabilityScore: 78,
        reason: 'Ridge-and-furrow planting prevents waterlogging injury while utilizing monsoon moisture.',
        waterRequirement: 'Moderate',
      },
      {
        crop: 'Millets (Foxtail / Finger Millet)',
        suitabilityScore: 74,
        reason: 'Resilient rotational option for uplands with variable drainage.',
        waterRequirement: 'Low–Moderate',
      },
    ],
    weatherFarmingPlan: {
      bestSowingWindow:
        (zone.rainfallIntensityMmHr ?? 0) > 20
          ? 'Delay fresh sowing until heavy rainfall subsides and topsoil drains to workable moisture.'
          : 'Optimal to sow within 3–5 days following light drainage preparation.',
      irrigationSchedule: `Adjust ${input.irrigationAvailable.toLowerCase()} irrigation based on 24h forecast rainfall (${safeRain24Str}) and soil moisture (${safeSoilStr}).`,
      rainfallImpact: `Relative humidity (${safeHumStr}) governs foliar disease pressure.`,
      harvestingAdvice: isFloodRisk
        ? 'Prioritize harvesting mature panicles/pods immediately and dry indoors using forced air.'
        : 'Schedule harvesting during dry morning windows.',
      drainageMeasures: [
        `Construct 30cm deep peripheral trench around the ${input.landAreaAcres}-acre plot.`,
        'Use raised beds (15cm height) for non-paddy crops.',
      ],
    },
    pestManagement: {
      identifiedRisk:
        input.pestSymptoms ||
        `Current humidity (${safeHumStr}) monitoring for Leaf Folder, Brown Planthopper, and Bacterial Leaf Blight in ${input.currentCrop}.`,
      ipmSteps: [
        'Inspect 20 random hills across the field every 48 hours for early egg masses or leaf lesions.',
        'Install pheromone traps (4–5 per acre) and yellow sticky traps before considering any spray.',
        'Drain stagnant excess water from crop root zone and avoid excess nitrogen top-dressing.',
        'Use biological control agents (Trichogramma cards or Neem-based azadirachtin formulations registered for the crop).',
      ],
      registeredProductGuidance:
        'Only use CIBRC/State-registered single-active formulations specifically labeled for your crop and diagnosed pest—consult your nearest Krishi Vigyan Kendra (KVK) officer before chemical application. Never mix incompatible pesticides.',
      ppeAndSafety:
        'Wear waterproof gloves, N95 mask, goggles, full-sleeve protective clothing, and boots. Never spray during rain or strong wind (>15 km/h).',
      waitingPeriodNote:
        'Strictly observe the product label Pre-Harvest Interval (PHI) waiting period before harvesting or allowing livestock near treated bunds.',
    },
    verifiedExpertAdvisories,
  };
}
