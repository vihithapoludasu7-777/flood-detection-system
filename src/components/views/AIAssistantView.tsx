import React, { useState } from 'react';
import { Bot, Send, ShieldAlert, Siren, User } from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  modelUsed?: string;
  time: string;
}

const QUICK_QUESTIONS = [
  'What should I do during a flood?',
  'Is my area safe right now?',
  'Where is the nearest shelter?',
  'What should I carry during evacuation?',
  'What should I do if water enters my house?',
  'How can I protect children and elderly people?',
  'What should I do if I am trapped?',
  'How do I contact rescue services?',
];

export const AIAssistantView: React.FC = () => {
  const { t, language, activeZone, setActiveTab } = useAlertNet();
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hello, I am AlertNet AI Assistant monitoring ${
        activeZone?.name || 'your selected area'
      } (${activeZone?.riskLevel || 'UNAVAILABLE'} risk · ${
        activeZone?.riskScore !== null && activeZone?.riskScore !== undefined
          ? `${activeZone.riskScore}/100`
          : 'DATA UNAVAILABLE'
      }). Select a quick emergency question below or ask me anything in English, Telugu, or Hindi.`,
      modelUsed: 'alertnet-context',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const askQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: AssistantMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          language,
          locality: activeZone?.name || 'Hyderabad',
          lat: activeZone?.lat,
          lng: activeZone?.lng,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.reply || 'Please follow emergency evacuation advisories and use SOS if trapped.',
          modelUsed: data.modelUsed,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          text: 'Network offline: Move to higher ground immediately, never walk or drive through floodwater, switch off main power, and call 112 / 1070 or queue an Emergency SOS in AlertNet.',
          modelUsed: 'offline-safety-fallback',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Chat Workspace */}
      <div className="xl:col-span-8 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col h-[620px]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">AlertNet AI Assistant</h2>
              <p className="text-xs text-slate-500">
                Context: {activeZone?.name} · {activeZone?.riskLevel} (
                {activeZone?.riskScore !== null && activeZone?.riskScore !== undefined
                  ? `${activeZone.riskScore}/100`
                  : 'DATA UNAVAILABLE'}
                ) · Language: {language.toUpperCase()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('sos')}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Siren className="w-3.5 h-3.5" />
            Emergency SOS
          </button>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F8FBFF]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div
                className={`max-w-[82%] rounded-xl p-3.5 text-sm whitespace-pre-line leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-2xs'
                }`}
              >
                <div>{m.text}</div>
                <div
                  className={`mt-1.5 text-[11px] font-mono-tabular ${
                    m.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {m.time}
                  {m.modelUsed ? ` · ${m.modelUsed}` : ''}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-slate-500 pl-11">
              Generating step-by-step safety guidance...
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void askQuestion(input);
          }}
          className="p-4 border-t border-slate-200 bg-white flex items-center gap-2.5 rounded-b-xl"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('askAssistantPlaceholder')}
            className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            {t('send')}
          </button>
        </form>
      </div>

      {/* Quick Emergency Action Prompts */}
      <div className="xl:col-span-4 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            Quick Emergency Questions
          </div>
          <div className="space-y-2">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void askQuestion(q)}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-[#F4F8FD] hover:bg-blue-50 border border-slate-200 text-xs font-semibold text-slate-800 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-950 space-y-1.5">
          <div className="font-bold">Official Emergency Helplines</div>
          <div className="font-mono-tabular">National Emergency: 112 · Disaster Control: 1070</div>
          <div className="font-mono-tabular">Ambulance: 108 · Fire & Rescue: 101</div>
        </div>
      </div>
    </div>
  );
};
