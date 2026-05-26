import { useState, useEffect, useRef } from "react";
import { Message, Presence, Notification, StaffMember } from "@/api/entities";
import { useUser } from "@/hooks/useUser";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const ROLE_COLOR = {
  super_admin: "text-amber-400",
  admin:       "text-blue-400",
  manager:     "text-purple-400",
  agent:       "text-green-400",
};

const CHANNELS = [
  { key: "general",       label: "# general",       icon: "💬" },
  { key: "announcements", label: "# announcements",  icon: "📢" },
  { key: "tax-tips",      label: "# tax-tips",       icon: "💡" },
];

function Avatar({ name, color, size = "sm" }) {
  const sz = size === "lg" ? "w-10 h-10 text-sm" : "w-7 h-7 text-xs";
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ background: color || "#374151" }}>
      {initials}
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Messenger() {
  const { data: user } = useUser();
  const [channel, setChannel] = useState("general");
  const [messages, setMessages] = useState([]);
  const [presence, setPresence] = useState([]);
  const [staff, setStaff] = useState([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [dmTarget, setDmTarget] = useState(null);
  const bottomRef = useRef(null);
  const pingRef = useRef(null);

  const activeChannel = dmTarget ? `dm:${dmTarget.email}` : channel;
  const myStaff = staff.find(s => s.email === user?.email);
  const myColor = myStaff?.avatar_color || "#F59E0B";

  // Ping presence every 30s
  useEffect(() => {
    if (!user?.email) return;
    async function ping() {
      const existing = await Presence.filter({ user_email: user.email });
      const data = {
        user_email: user.email,
        user_name: user.full_name || user.email,
        role: user.role || "agent",
        last_ping: new Date().toISOString(),
        current_page: "Messenger",
      };
      if (existing.length > 0) await Presence.update(existing[0].id, data);
      else await Presence.create(data);
    }
    ping();
    pingRef.current = setInterval(ping, 30000);
    return () => clearInterval(pingRef.current);
  }, [user?.email]);

  // Load staff + presence
  useEffect(() => {
    StaffMember.list().then(setStaff);
    Presence.list().then(setPresence);
  }, []);

  // Load messages for channel
  useEffect(() => {
    Message.filter({ channel: activeChannel }).then(msgs => {
      setMessages(msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
      // Mark all as read
      msgs.forEach(m => {
        if (!m.read_by?.includes(user?.email)) {
          Message.update(m.id, { read_by: [...(m.read_by || []), user?.email] });
        }
      });
    });
    const iv = setInterval(() => {
      Message.filter({ channel: activeChannel }).then(msgs => {
        setMessages(msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
      });
    }, 5000);
    return () => clearInterval(iv);
  }, [activeChannel, user?.email]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const msg = await Message.create({
        sender_email: user?.email,
        sender_name: user?.full_name || user?.email,
        sender_role: user?.role || myStaff?.role || "agent",
        channel: activeChannel,
        body: body.trim(),
        read_by: [user?.email],
        is_pinned: false,
      });
      setMessages(prev => [...prev, msg]);
      setBody("");

      // If DM, notify recipient
      if (dmTarget) {
        await Notification.create({
          recipient_email: dmTarget.email,
          type: "new_message",
          title: `DM from ${user?.full_name || user?.email}`,
          body: body.trim().slice(0, 80),
          read: false,
          actor_name: user?.full_name || user?.email,
          actor_email: user?.email,
          link: "Messenger",
        });
      }
    } catch (err) { console.error(err); }
    setSending(false);
  }

  const onlineUsers = presence.filter(p => {
    const age = Date.now() - new Date(p.last_ping || 0).getTime();
    return age < 90000; // online if pinged in last 90s
  });

  const unread = (ch) => {
    return messages.filter(m => m.channel === ch && !m.read_by?.includes(user?.email)).length;
  };

  const grouped = messages.reduce((acc, msg) => {
    const day = new Date(msg.created_date).toDateString();
    if (!acc[day]) acc[day] = [];
    acc[day].push(msg);
    return acc;
  }, {});

  return (
    <div className="h-screen bg-[#0A1628] text-white flex flex-col">
      {/* Top nav */}
      <div className="border-b border-white/10 bg-[#0D1F3C] flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-base font-bold">Team Messenger</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400">{onlineUsers.length} online</span>
                {onlineUsers.slice(0, 3).map(u => (
                  <span key={u.user_email} className="text-xs text-slate-500">· {u.user_name?.split(" ")[0]}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onlineUsers.map(u => {
              const member = staff.find(s => s.email === u.user_email);
              return (
                <div key={u.user_email} title={`${u.user_name} — ${u.current_page}`} className="relative">
                  <Avatar name={u.user_name} color={member?.avatar_color} />
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-[#0D1F3C]" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r border-white/10 bg-[#0D1F3C]/50 flex flex-col flex-shrink-0">
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2">Channels</p>
            {CHANNELS.map(ch => {
              const u = unread(ch.key);
              return (
                <button key={ch.key} onClick={() => { setChannel(ch.key); setDmTarget(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 flex items-center justify-between ${
                    !dmTarget && channel === ch.key ? "bg-amber-400/15 text-amber-400 font-semibold"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}>
                  <span>{ch.icon} {ch.label.slice(2)}</span>
                  {u > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{u}</span>}
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-white/10 flex-1 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2">Direct Messages</p>
            {staff.filter(s => s.email !== user?.email).map(s => {
              const isOnline = onlineUsers.some(o => o.user_email === s.email);
              const dmKey = `dm:${s.email}`;
              const u = unread(dmKey);
              return (
                <button key={s.id} onClick={() => setDmTarget(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 flex items-center gap-2 ${
                    dmTarget?.email === s.email ? "bg-amber-400/15 text-amber-400"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}>
                  <div className="relative flex-shrink-0">
                    <Avatar name={s.full_name} color={s.avatar_color} />
                    {isOnline && <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-emerald-400 rounded-full" />}
                  </div>
                  <span className="truncate flex-1">{s.full_name?.split(" ")[0] || s.email}</span>
                  {u > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{u}</span>}
                </button>
              );
            })}
          </div>

          {/* My status */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar name={user?.full_name} color={myColor} />
                <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-[#0D1F3C]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{user?.full_name || user?.email?.split("@")[0]}</div>
                <div className={`text-xs ${ROLE_COLOR[myStaff?.role] || "text-slate-500"}`}>{myStaff?.role || "staff"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Channel header */}
          <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
            <div>
              <div className="font-semibold text-sm">
                {dmTarget ? `💬 ${dmTarget.full_name}` : CHANNELS.find(c => c.key === channel)?.label}
              </div>
              {dmTarget && (
                <div className="text-xs text-slate-500">
                  {onlineUsers.some(o => o.user_email === dmTarget.email)
                    ? "🟢 Online now"
                    : `Last seen ${timeAgo(presence.find(p => p.user_email === dmTarget.email)?.last_ping)}`}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
            {Object.entries(grouped).map(([day, msgs]) => (
              <div key={day}>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-slate-600 flex-shrink-0">{day === new Date().toDateString() ? "Today" : day}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                {msgs.map((msg, i) => {
                  const prev = msgs[i - 1];
                  const sameAuthor = prev && prev.sender_email === msg.sender_email &&
                    (new Date(msg.created_date) - new Date(prev.created_date)) < 300000;
                  const member = staff.find(s => s.email === msg.sender_email);
                  const isMe = msg.sender_email === user?.email;

                  return (
                    <div key={msg.id} className={`flex gap-3 ${sameAuthor ? "mt-0.5 pl-10" : "mt-3"} ${isMe ? "flex-row-reverse" : ""}`}>
                      {!sameAuthor && !isMe && <Avatar name={msg.sender_name} color={member?.avatar_color} />}
                      <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                        {!sameAuthor && (
                          <div className={`flex items-center gap-2 mb-1 ${isMe ? "flex-row-reverse" : ""}`}>
                            <span className={`text-xs font-semibold ${ROLE_COLOR[msg.sender_role] || "text-slate-300"}`}>{msg.sender_name}</span>
                            <span className="text-xs text-slate-600">{timeAgo(msg.created_date)}</span>
                          </div>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                          isMe
                            ? "bg-amber-400 text-[#0A1628] rounded-tr-sm"
                            : "bg-white/10 text-white rounded-tl-sm"
                        }`}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <p className="text-4xl mb-3">💬</p>
                <p className="text-slate-500 text-sm">No messages yet. Start the conversation!</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-6 py-4 border-t border-white/10">
            <form onSubmit={send} className="flex gap-3">
              <div className="relative flex-shrink-0">
                <Avatar name={user?.full_name} color={myColor} />
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(e)}
                  placeholder={dmTarget ? `Message ${dmTarget.full_name}...` : `Message ${channel}...`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all"
                />
                <button type="submit" disabled={!body.trim() || sending}
                  className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#0A1628] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                  {sending ? "..." : "↑"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
