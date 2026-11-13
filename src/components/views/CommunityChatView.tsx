import React, { useEffect, useState } from 'react';
import {
  Camera,
  Flag,
  MapPin,
  MessageSquare,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useAlertNet } from '../../context/AlertNetContext.tsx';
import type { ChatCategory, ChatMessage } from '../../types.ts';

const ROOMS = [
  { id: 'room-kukatpally', label: 'Kukatpally Residents', locality: 'Kukatpally' },
  { id: 'room-miyapur', label: 'Miyapur Flood Updates', locality: 'Miyapur' },
  { id: 'room-hyderabad', label: 'Hyderabad Emergency Network', locality: 'Hyderabad Emergency Network' },
];

const CATEGORIES: Array<'All' | ChatCategory> = [
  'All',
  'Emergency Help',
  'Road Conditions',
  'Shelter Information',
  'Food and Medical Help',
];

export const CommunityChatView: React.FC = () => {
  const { user, token, activeZone, liveGps } = useAlertNet();

  const [activeRoom, setActiveRoom] = useState(() => {
    const loc = (user?.locality || activeZone?.name || '').toLowerCase();
    if (loc.includes('miyapur')) return ROOMS[1];
    if (loc.includes('kukatpally')) return ROOMS[0];
    return ROOMS[2];
  });
  const [activeCategory, setActiveCategory] = useState<'All' | ChatCategory>('All');
  const [postCategory, setPostCategory] = useState<ChatCategory>('Emergency Help');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [shareExactLoc, setShareExactLoc] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const loadMessages = async () => {
    const params = new URLSearchParams({ roomId: activeRoom.id });
    if (activeCategory !== 'All') params.set('category', activeCategory);
    const res = await fetch(`/api/chat/messages?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
    }
  };

  useEffect(() => {
    void loadMessages();
    const timer = setInterval(() => void loadMessages(), 5000);
    return () => clearInterval(timer);
  }, [activeRoom.id, activeCategory]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setErrorMsg(null);

    try {
      let sharedLocation: { lat: number; lng: number; label: string } | undefined;
      if (shareExactLoc) {
        if (liveGps) {
          sharedLocation = { ...liveGps, label: activeRoom.locality };
        } else if (activeZone) {
          sharedLocation = { lat: activeZone.lat, lng: activeZone.lng, label: activeZone.name };
        }
      }

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          roomId: activeRoom.id,
          locality: activeRoom.locality,
          category: postCategory,
          text: text.trim(),
          senderName: user?.fullName || 'Local Resident',
          senderRole: user?.role || 'citizen',
          sharedLocation,
          photoDataUrl: photoDataUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not send message.');
      } else {
        setText('');
        setPhotoDataUrl(null);
        setShareExactLoc(false);
        await loadMessages();
      }
    } finally {
      setSending(false);
    }
  };

  const handleReport = async (id: string) => {
    await fetch(`/api/chat/messages/${id}/report`, { method: 'POST' });
    await loadMessages();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Locality Chat Rooms */}
      <div className="xl:col-span-3 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2">
          <div className="text-xs font-bold text-slate-500 px-1">Locality Groups</div>
          {ROOMS.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoom(room)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeRoom.id === room.id
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {room.label}
            </button>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-950 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-blue-700" />
            Privacy & Moderation
          </div>
          <p className="leading-relaxed">
            Your precise coordinates are never shared unless you explicitly check &ldquo;Share my location&rdquo;.
            Spam rate-limiting and community flagging protect residents from misinformation.
          </p>
        </div>
      </div>

      {/* Right: Chat Feed & Composer */}
      <div className="xl:col-span-9 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col h-[640px]">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-700" />
              {activeRoom.label}
            </h2>
            <p className="text-xs text-slate-500">Real-time WebSocket locality feed</p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#F8FBFF]">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-12">
              No messages in this category yet. Share verified road, shelter, or help updates with your neighbors.
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`p-4 rounded-xl border ${
                  m.isAnnouncement
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-slate-200'
                } shadow-2xs`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{m.senderName}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-blue-700 font-semibold capitalize">{m.senderRole}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{m.category}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400">
                    <span className="font-mono-tabular">
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleReport(m.id)}
                      className="hover:text-red-600 inline-flex items-center gap-1"
                      title="Report misinformation or spam"
                    >
                      <Flag className="w-3 h-3" />
                      {m.reportedCount > 0 ? m.reportedCount : ''}
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-sm text-slate-800 leading-relaxed">{m.text}</p>

                {m.sharedLocation && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono-tabular text-blue-700">
                    <MapPin className="w-3.5 h-3.5" />
                    Shared GPS: {m.sharedLocation.lat.toFixed(4)}, {m.sharedLocation.lng.toFixed(4)} ({m.sharedLocation.label})
                  </div>
                )}

                {m.photoDataUrl && (
                  <img
                    src={m.photoDataUrl}
                    alt="Flooded road condition report"
                    className="mt-3 max-h-48 rounded-lg border border-slate-200 object-cover"
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white space-y-2.5 rounded-b-xl">
          {errorMsg && <div className="text-xs font-semibold text-red-700">{errorMsg}</div>}
          {photoDataUrl && (
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>Photo attached</span>
              <button
                type="button"
                onClick={() => setPhotoDataUrl(null)}
                className="text-red-600 font-semibold"
              >
                Remove
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value as ChatCategory)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-700"
              >
                <option value="Emergency Help">Emergency Help</option>
                <option value="Road Conditions">Road Conditions</option>
                <option value="Shelter Information">Shelter Information</option>
                <option value="Food and Medical Help">Food and Medical Help</option>
              </select>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer hover:bg-slate-100">
                <Camera className="w-3.5 h-3.5 text-blue-700" />
                Attach Road Photo
                <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareExactLoc}
                  onChange={(e) => setShareExactLoc(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Share my location
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message ${activeRoom.label}...`}
              className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
