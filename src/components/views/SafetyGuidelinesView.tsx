import React from 'react';
import {
  Baby,
  CheckCircle2,
  Droplets,
  HeartPulse,
  Home,
  PawPrint,
  ShieldAlert,
  Utensils,
  ZapOff,
} from 'lucide-react';

interface GuidelineCard {
  id: string;
  title: string;
  icon: React.ReactNode;
  accent: string;
  steps: string[];
  illustration: React.ReactNode;
}

const GUIDELINES: GuidelineCard[] = [
  {
    id: 'before',
    title: 'Before a Flood',
    icon: <Home className="w-5 h-5 text-blue-700" />,
    accent: 'border-blue-200',
    steps: [
      'Pack a waterproof grab-bag with IDs, medicines, 3 days of drinking water, dry food, torch, and power bank.',
      'Enable AlertNet Web Push & SMS alerts for your residential locality.',
      'Elevate electrical appliances, gas cylinders, and seed bags above historic water levels.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#EFF6FF" />
        <path d="M24 44 L48 24 L72 44 V60 H24 Z" fill="#1D4ED8" opacity="0.85" />
        <rect x="80" y="34" width="24" height="26" rx="4" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="2" />
        <path d="M88 44 H96 M92 40 V48" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'during',
    title: 'During a Flood',
    icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
    accent: 'border-red-200',
    steps: [
      'Move immediately to higher ground or upper floors; do not wait for water to rise further.',
      'NEVER walk, swim, or drive through moving floodwater or submerged underpasses.',
      'Use AlertNet Emergency SOS if stranded and follow Live Flood Map safe evacuation routes.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#FEF2F2" />
        <path d="M10 52 Q30 42 50 52 T90 52 T110 52" fill="none" stroke="#3B82F6" strokeWidth="4" />
        <path d="M10 62 Q30 52 50 62 T90 62 T110 62" fill="none" stroke="#1D4ED8" strokeWidth="4" />
        <polygon points="60,12 80,44 40,44" fill="#DC2626" />
        <text x="60" y="38" textAnchor="middle" fill="#FFF" fontSize="16" fontWeight="bold">!</text>
      </svg>
    ),
  },
  {
    id: 'after',
    title: 'After a Flood',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    accent: 'border-emerald-200',
    steps: [
      'Return home only after authorities declare the zone safe.',
      'Inspect walls, foundations, and septic lines for structural damage before re-entering.',
      'Disinfect surfaces with clean water and report downed power lines or stagnant sewage.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#ECFDF5" />
        <circle cx="60" cy="36" r="20" fill="#16A34A" />
        <path d="M51 36 L57 42 L70 29" fill="none" stroke="#FFF" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'electrical',
    title: 'Electrical Safety',
    icon: <ZapOff className="w-5 h-5 text-orange-600" />,
    accent: 'border-orange-200',
    steps: [
      'Turn off the main circuit breaker immediately if water nears outlets or wiring.',
      'Never touch electrical switches, appliances, or inverters while standing on wet floors.',
      'Stay at least 10 meters away from fallen overhead cables or submerged transformers.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#FFF7ED" />
        <polygon points="65,14 45,40 59,40 53,58 76,32 62,32" fill="#EA580C" />
        <line x1="34" y1="16" x2="86" y2="56" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'water',
    title: 'Drinking Water Safety',
    icon: <Droplets className="w-5 h-5 text-blue-600" />,
    accent: 'border-blue-200',
    steps: [
      'Drink only sealed bottled water or water boiled at a rolling boil for at least 1 minute.',
      'Never use floodwater for brushing teeth, washing utensils, or preparing infant formula.',
      'Use chlorine tablets (ORS / Halazone) according to official public health instructions.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#EFF6FF" />
        <path d="M60 14 C60 14 42 36 42 46 A18 18 0 0 0 78 46 C78 36 60 14 60 14 Z" fill="#2563EB" />
      </svg>
    ),
  },
  {
    id: 'food',
    title: 'Food Safety',
    icon: <Utensils className="w-5 h-5 text-amber-600" />,
    accent: 'border-amber-200',
    steps: [
      'Discard any perishable food, vegetables, or open containers touched by floodwater.',
      'Keep dry rations in airtight, elevated waterproof containers.',
      'If power has been out for >4 hours, discard refrigerated dairy, meat, and cooked meals.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#FFFBEB" />
        <circle cx="60" cy="36" r="18" fill="#FFFFFF" stroke="#D97706" strokeWidth="3" />
        <circle cx="60" cy="36" r="10" fill="#FDE68A" />
      </svg>
    ),
  },
  {
    id: 'firstaid',
    title: 'First Aid',
    icon: <HeartPulse className="w-5 h-5 text-red-600" />,
    accent: 'border-red-200',
    steps: [
      'Clean cuts or scrapes immediately with clean boiled water and antiseptic to prevent infection.',
      'Watch for fever, vomiting, or skin rashes and seek medical help at relief camps.',
      'Keep ORS packets, bandages, fever medication, and chronic prescriptions dry.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#FEF2F2" />
        <rect x="42" y="18" width="36" height="36" rx="8" fill="#DC2626" />
        <path d="M60 26 V46 M50 36 H70" stroke="#FFF" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'vulnerable',
    title: 'Children & Elderly Safety',
    icon: <Baby className="w-5 h-5 text-blue-700" />,
    accent: 'border-blue-200',
    steps: [
      'Evacuate infants, pregnant women, elderly, and differently-abled residents first.',
      'Place ID wristbands or waterproof contact cards in children’s pockets.',
      'Keep mobility aids, hearing-aid batteries, and pediatric medicines accessible.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#EFF6FF" />
        <circle cx="48" cy="28" r="9" fill="#1D4ED8" />
        <path d="M34 56 C34 44 62 44 62 56" fill="#1D4ED8" />
        <circle cx="76" cy="34" r="7" fill="#3B82F6" />
        <path d="M66 56 C66 47 86 47 86 56" fill="#3B82F6" />
      </svg>
    ),
  },
  {
    id: 'livestock',
    title: 'Animal & Livestock Protection',
    icon: <PawPrint className="w-5 h-5 text-emerald-700" />,
    accent: 'border-emerald-200',
    steps: [
      'Untie cattle and livestock early so they are not trapped inside flooded sheds.',
      'Move animals to high, dry community pastures with elevated dry fodder and clean water.',
      'Tag livestock with owner phone numbers and keep veterinary first-aid supplies dry.',
    ],
    illustration: (
      <svg viewBox="0 0 120 72" className="w-full h-16">
        <rect width="120" height="72" rx="8" fill="#ECFDF5" />
        <circle cx="60" cy="42" r="11" fill="#15803D" />
        <circle cx="45" cy="28" r="5" fill="#15803D" />
        <circle cx="56" cy="22" r="5" fill="#15803D" />
        <circle cx="67" cy="22" r="5" fill="#15803D" />
        <circle cx="76" cy="28" r="5" fill="#15803D" />
      </svg>
    ),
  },
];

export const SafetyGuidelinesView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
        <h2 className="text-xl font-bold text-slate-900">
          Flood Safety & Survival Guidelines
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Clear, illustrated life-saving protocols for households, children, elderly residents, and livestock.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {GUIDELINES.map((g) => (
          <div
            key={g.id}
            className={`bg-white rounded-xl border ${g.accent} p-5 shadow-2xs flex flex-col justify-between space-y-4`}
          >
            <div className="space-y-3">
              {g.illustration}
              <div className="flex items-center gap-2">
                {g.icon}
                <h3 className="text-base font-bold text-slate-900">{g.title}</h3>
              </div>
              <ol className="space-y-2 text-sm text-slate-700">
                {g.steps.map((step, i) => (
                  <li key={i} className="leading-snug">
                    <span className="font-mono-tabular text-xs font-bold text-blue-700 mr-1.5">
                      0{i + 1}.
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
