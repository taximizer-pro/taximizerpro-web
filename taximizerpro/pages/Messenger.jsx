import { useState, useEffect, useRef } from "react";
import { Message, Notification, StaffMember, Client, Presence } from "@/api/entities";
import { useUser } from "@/hooks/useUser";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// ── helpers ──────────────────────────────────────────────────────
const ROLE_META = {
  super_admin: { color: "#F59E0B", label: "Super Admin" },
  admin:       { color: "#3B82F6", label: "Admin" },
  manager:     { color: "#8B5CF6", label: "Manager" },
  agent:       { color: "#10B981", label: "Agent" },
  client:      { color: "#64748B", label: "Client" },
};

function Avatar({ name, color, size = "md", online = false }) {
  const sz = size === "lg" ? "w-11 h-11 text-sm" : size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-xs";
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="relative flex-shrink-0">
      <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white`}
        style={{ background: color || "#374151" }}>{initials}</div>
      {online && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0D1F3C]" />}
    </div>
  );
}

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = now - d;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 86400000 * 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── STAFF TEAM CHANNELS ───────────────────────────────────────────
const TEAM_CHANNELS = [
  { key: "team:general",       label: "general",       icon: "💬" },
  { key: "team:announcements", label: "announcements", icon: "📢" },
  { key: "team:tax-tips",      label: "tax-tips",      icon: "💡" },
];

// ════════════════════════════════════════════════════════════════════
// CLIENT VIEW — inbox/outbox only, no team channels
// ════════════════════════════════════════════════════════════════════
function ClientMessenger({ user }) {
  const [msgs, setMsgs] = useState([]);
  const [thread, setThread] = useState(null); // { contact, messages[] }
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState("inbox"); // inbox | sent
  const bottomRef = useRef(null);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [user?.email]);

  async function load() {
    if (!user?.email) return;
    // All messages where user is sender or recipient
    const [received, sent] = await Promise.all([
      Message.filter({ recipient_email: user.email, message_type: "client_direct" }),
      Message.filter({ sender_email: user.email, message_type: "client_direct" }),
    ]);
    const all = [...received, ...sent];
    // Mark received as read
    received.filter(m => !m.read_by?.includes(user.email)).forEach(m =>
      Message.update(m.id, { read_by: [...(m.read_by || []), user.email], status: "read" })
    );
    setMsgs(all.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
  }

  // Group into threads by thread_id
  const threads = Object.values(
    msgs.reduce((acc, m) => {
      const key = m.thread_id || m.id;
      if (!acc[key]) acc[key] = { thread_id: key, messages: [], subject: m.subject || "(no subject)", latest: m };
      acc[key].messages.push(m);
      if (new Date(m.created_date) > new Date(acc[key].latest.created_date)) acc[key].latest = m;
      return acc;
    }, {})
  ).sort((a, b) => new Date(b.latest.created_date) - new Date(a.latest.created_date));

  const inbox = threads.filter(t => t.messages.some(m => m.recipient_email === user.email));
  const sent  = threads.filter(t => t.messages.some(m => m.sender_email === user.email));
  const unread = inbox.filter(t => t.messages.some(m => m.recipient_email === user.email && !m.read_by?.includes(user.email))).length;
  const display = tab === "inbox" ? inbox : sent;

  async function sendMsg(e) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    const tid = thread ? thread.thread_id : `thread_${Date.now()}`;
    const msg = await Message.create({
      sender_email: user.email,
      sender_name: user.full_name || user.email,
      sender_role: "client",
      recipient_email: "taximizerpro@gmail.com",
      recipient_name: "Taximizer Pro",
      subject: subject || thread?.subject || "Message from client",
      body: body.trim(),
      thread_id: tid,
      message_type: "client_direct",
      read_by: [user.email],
      status: "sent",
    });
    await Notification.create({
      recipient_email: "taximizerpro@gmail.com",
      type: "new_message",
      title: `New message from ${user.full_name || user.email}`,
      body: body.trim().slice(0, 80),
      read: false,
      actor_name: user.full_name || user.email,
      actor_email: user.email,
      link: "Messenger",
    });
    setBody(""); setSubject(""); setComposing(false); setSending(false);
    await load();
    // Auto-open thread
    setThread({ thread_id: tid, subject: msg.subject, messages: [msg] });
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0D1F3C] sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <h1 className="text-base font-bold">Messages</h1>
              <p className="text-xs text-slate-500">Your conversations with Taximizer Pro</p>
            </div>
          </div>
          <button onClick={() => { setComposing(true); setThread(null); }}
            className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-xl transition-colors">
            ✏️ New Message
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {thread ? (
          // ── Thread View ──
          <div>
            <button onClick={() => setThread(null)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-5 transition-colors">
              ← Back to messages
            </button>
            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="font-semibold">{thread.subject}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Conversation with Taximizer Pro team</p>
              </div>
              <div className="p-6 space-y-4 min-h-64 max-h-96 overflow-y-auto">
                {(msgs.filter(m => m.thread_id === thread.thread_id)
                  .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))).map(m => {
                  const isMe = m.sender_email === user.email;
                  return (
                    <div key={m.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      <Avatar name={m.sender_name} color={isMe ? "#64748B" : "#F59E0B"} size="sm" />
                      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                        <div className={`px-4 py-3 rounded-2xl text-sm ${isMe ? "bg-amber-400 text-[#0A1628] rounded-tr-sm" : "bg-white/10 text-white rounded-tl-sm"}`}>
                          {m.body}
                        </div>
                        <span className="text-xs text-slate-600 mt-1">{timeLabel(m.created_date)}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {/* Reply box */}
              <div className="px-6 py-4 border-t border-white/10">
                <form onSubmit={sendMsg} className="flex gap-3">
                  <input value={body} onChange={e => setBody(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg(e)}
                    placeholder="Type your reply…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all" />
                  <button type="submit" disabled={!body.trim() || sending}
                    className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#0A1628] font-bold px-5 py-2.5 rounded-xl transition-colors">
                    {sending ? "…" : "↑"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : composing ? (
          // ── Compose ──
          <div>
            <button onClick={() => setComposing(false)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-5 transition-colors">← Back</button>
            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-6">
              <h2 className="font-bold mb-5">New Message</h2>
              <form onSubmit={sendMsg} className="space-y-4">
                <div className="bg-white/5 rounded-xl px-4 py-3 text-sm text-slate-400">
                  To: <span className="text-white font-medium">Taximizer Pro Team</span>
                </div>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all" />
                <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message…" rows={5} required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all resize-none" />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setComposing(false)} className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white">Cancel</button>
                  <button type="submit" disabled={!body.trim() || sending}
                    className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#0A1628] font-semibold text-sm py-2.5 rounded-xl transition-colors">
                    {sending ? "Sending…" : "Send Message"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          // ── Thread List ──
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2">
              {[{ key:"inbox",label:"Inbox",count:unread },{ key:"sent",label:"Sent" }].map(t=>(
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-colors ${tab===t.key?"bg-amber-400 text-[#0A1628]":"bg-white/5 text-slate-400 hover:text-white border border-white/10"}`}>
                  {t.label}
                  {t.count > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{t.count}</span>}
                </button>
              ))}
            </div>

            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
              {display.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-3xl mb-3">{tab==="inbox"?"📬":"📤"}</p>
                  <p className="text-slate-500 text-sm">{tab==="inbox"?"No messages yet":"Nothing sent yet"}</p>
                  <button onClick={()=>setComposing(true)} className="mt-3 text-amber-400 text-sm font-medium hover:text-amber-300">Send your first message →</button>
                </div>
              ) : display.map(t => {
                const latest = t.messages.sort((a,b)=>new Date(b.created_date)-new Date(a.created_date))[0];
                const isUnread = tab==="inbox" && t.messages.some(m=>m.recipient_email===user.email && !m.read_by?.includes(user.email));
                return (
                  <button key={t.thread_id} onClick={() => setThread(t)}
                    className="w-full text-left px-6 py-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors flex items-start gap-4">
                    <Avatar name="Taximizer Pro" color="#F59E0B" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm ${isUnread?"font-bold text-white":"font-medium text-slate-300"}`}>{t.subject}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0 ml-3">{timeLabel(latest?.created_date)}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{latest?.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-600">{t.messages.length} message{t.messages.length!==1?"s":""}</span>
                        {isUnread && <span className="w-2 h-2 bg-amber-400 rounded-full" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STAFF/ADMIN VIEW — client inbox + team channels
// ════════════════════════════════════════════════════════════════════
function StaffMessenger({ user, myStaff }) {
  const [mode, setMode] = useState("client_inbox"); // client_inbox | team
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [presence, setPresence] = useState([]);
  const [allMsgs, setAllMsgs] = useState([]);
  const [activeThread, setActiveThread] = useState(null); // client obj
  const [teamChannel, setTeamChannel] = useState("team:general");
  const [teamMsgs, setTeamMsgs] = useState([]);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef(null);
  const pingRef = useRef(null);

  const isSuperAdmin = user?.email === "taximizerpro@gmail.com";
  const isAdmin = isSuperAdmin || myStaff?.role === "admin";

  // Presence ping
  useEffect(() => {
    if (!user?.email) return;
    const ping = async () => {
      const ex = await Presence.filter({ user_email: user.email });
      const d = { user_email: user.email, user_name: user.full_name||user.email, role: myStaff?.role||"agent", last_ping: new Date().toISOString(), current_page: "Messenger" };
      ex.length ? await Presence.update(ex[0].id, d) : await Presence.create(d);
    };
    ping();
    pingRef.current = setInterval(ping, 30000);
    return () => clearInterval(pingRef.current);
  }, [user?.email]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 6000);
    return () => clearInterval(iv);
  }, []);

  async function loadAll() {
    const [c, s, p, m] = await Promise.all([Client.list(), StaffMember.list(), Presence.list(), Message.list()]);
    setClients(c); setStaff(s); setPresence(p); setAllMsgs(m);
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeThread, teamMsgs]);

  // Client inbox threads
  const clientThreads = Object.values(
    allMsgs.filter(m => m.message_type === "client_direct").reduce((acc, m) => {
      const cEmail = m.sender_role === "client" ? m.sender_email : m.recipient_email;
      if (!acc[cEmail]) acc[cEmail] = { client_email: cEmail, messages: [], latest: m, unread: 0 };
      acc[cEmail].messages.push(m);
      if (new Date(m.created_date) > new Date(acc[cEmail].latest.created_date)) acc[cEmail].latest = m;
      if (!m.read_by?.includes(user.email)) acc[cEmail].unread++;
      return acc;
    }, {})
  ).sort((a, b) => new Date(b.latest.created_date) - new Date(a.latest.created_date));

  const totalUnread = clientThreads.reduce((s, t) => s + t.unread, 0);

  function getClient(email) { return clients.find(c => c.email === email) || staff.find(s => s.email === email); }

  // Team channel messages
  const channelMsgs = allMsgs.filter(m => m.channel === teamChannel && m.message_type === "team")
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  const onlineUsers = presence.filter(p => Date.now() - new Date(p.last_ping||0).getTime() < 90000);

  async function sendToClient(e) {
    e.preventDefault();
    if (!body.trim() || !activeThread || sending) return;
    setSending(true);
    const tid = activeThread.thread_id || `thread_client_${activeThread.client_email}_${Date.now()}`;
    await Message.create({
      sender_email: user.email,
      sender_name: user.full_name || "Taximizer Pro",
      sender_role: myStaff?.role || "admin",
      recipient_email: activeThread.client_email,
      recipient_name: getClient(activeThread.client_email)?.first_name || activeThread.client_email,
      subject: subject || activeThread.messages?.[0]?.subject || "Message from your tax preparer",
      body: body.trim(),
      thread_id: activeThread.messages?.[0]?.thread_id || tid,
      message_type: "client_direct",
      read_by: [user.email],
      status: "sent",
    });
    await Notification.create({
      recipient_email: activeThread.client_email,
      type: "new_message",
      title: "New message from your tax preparer",
      body: body.trim().slice(0, 80),
      read: false,
      actor_name: user.full_name || "Taximizer Pro",
      actor_email: user.email,
      link: "Messenger",
    });
    setBody(""); setSending(false);
    await loadAll();
  }

  async function sendToChannel(e) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    await Message.create({
      sender_email: user.email,
      sender_name: user.full_name || user.email,
      sender_role: myStaff?.role || "admin",
      channel: teamChannel,
      body: body.trim(),
      message_type: "team",
      read_by: [user.email],
    });
    setBody(""); setSending(false);
    await loadAll();
  }

  async function composeToClient(e) {
    e.preventDefault();
    if (!composing?.email || !body.trim() || sending) return;
    setSending(true);
    const tid = `thread_${composing.email}_${Date.now()}`;
    await Message.create({
      sender_email: user.email,
      sender_name: user.full_name || "Taximizer Pro",
      sender_role: myStaff?.role || "admin",
      recipient_email: composing.email,
      recipient_name: composing.name,
      subject: subject || "Message from Taximizer Pro",
      body: body.trim(),
      thread_id: tid,
      message_type: "client_direct",
      read_by: [user.email],
      status: "sent",
    });
    await Notification.create({
      recipient_email: composing.email,
      type: "new_message",
      title: "New message from your tax preparer",
      body: body.trim().slice(0, 80),
      read: false,
      actor_name: user.full_name || "Taximizer Pro",
      actor_email: user.email,
    });
    setBody(""); setSubject(""); setComposing(false); setSending(false);
    await loadAll();
  }

  const filteredClients = clients.filter(c => {
    const n = `${c.first_name} ${c.last_name}`.toLowerCase();
    return n.includes(search.toLowerCase()) || (c.email||"").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="h-screen bg-[#0A1628] text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="border-b border-white/10 bg-[#0D1F3C] flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <h1 className="text-base font-bold">Messages</h1>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            <button onClick={() => setMode("client_inbox")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode==="client_inbox"?"bg-amber-400 text-[#0A1628]":"text-slate-400 hover:text-white"}`}>
              📬 Client Inbox
              {totalUnread > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5">{totalUnread}</span>}
            </button>
            <button onClick={() => setMode("team")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode==="team"?"bg-amber-400 text-[#0A1628]":"text-slate-400 hover:text-white"}`}>
              💬 Team
            </button>
          </div>
          <div className="flex items-center gap-2">
            {onlineUsers.slice(0,4).map(u=>{
              const m = staff.find(s=>s.email===u.user_email);
              return <Avatar key={u.user_email} name={u.user_name} color={m?.avatar_color} size="sm" online />;
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── CLIENT INBOX MODE ── */}
        {mode === "client_inbox" && (
          <>
            {/* Left: thread list */}
            <div className="w-72 border-r border-white/10 bg-[#0D1F3C]/40 flex flex-col flex-shrink-0">
              <div className="p-4 border-b border-white/10 space-y-3">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/50" />
                </div>
                <button onClick={() => setComposing({ email:"", name:"" })}
                  className="w-full bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-xs py-2 rounded-lg transition-colors">
                  ✏️ New Message
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Existing threads */}
                {clientThreads.length > 0 && (
                  <div className="p-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest px-2 mb-2">Recent</p>
                    {clientThreads.map(t => {
                      const c = getClient(t.client_email);
                      const isActive = activeThread?.client_email === t.client_email;
                      return (
                        <button key={t.client_email} onClick={() => { setActiveThread(t); setComposing(false); }}
                          className={`w-full text-left px-3 py-3 rounded-xl mb-0.5 transition-colors ${isActive?"bg-amber-400/15 border border-amber-400/20":"hover:bg-white/5"}`}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={c ? `${c.first_name} ${c.last_name}` : t.client_email} color="#64748B" size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs truncate ${t.unread>0?"font-bold text-white":"text-slate-300"}`}>
                                {c ? `${c.first_name} ${c.last_name}` : t.client_email}
                              </div>
                              <div className="text-xs text-slate-600 truncate">{t.latest?.body?.slice(0,30)}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs text-slate-600">{timeLabel(t.latest?.created_date)}</span>
                              {t.unread > 0 && <span className="w-4 h-4 bg-amber-400 rounded-full text-xs text-[#0A1628] font-bold flex items-center justify-center">{t.unread}</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* All clients (to start new thread) */}
                <div className="p-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest px-2 mb-2">All Clients</p>
                  {filteredClients.slice(0,20).map(c => (
                    <button key={c.id} onClick={() => { setComposing({ email: c.email, name: `${c.first_name} ${c.last_name}` }); setActiveThread(null); }}
                      className="w-full text-left px-3 py-2.5 rounded-lg mb-0.5 hover:bg-white/5 transition-colors flex items-center gap-2.5">
                      <Avatar name={`${c.first_name} ${c.last_name}`} color="#64748B" size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-300 truncate">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-slate-600 truncate">{c.email||"no email"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: thread or compose */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {composing ? (
                // New message compose
                <div className="flex-1 flex flex-col p-6">
                  <h2 className="font-bold mb-5">New Message to Client</h2>
                  <form onSubmit={composeToClient} className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">To</label>
                      <select value={composing.email} onChange={e => {
                        const c = clients.find(c=>c.email===e.target.value);
                        setComposing({ email:e.target.value, name: c?`${c.first_name} ${c.last_name}`:e.target.value });
                      }} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60">
                        <option value="">Select client…</option>
                        {clients.filter(c=>c.email).map(c=>(
                          <option key={c.id} value={c.email}>{c.first_name} {c.last_name} — {c.email}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Subject</label>
                      <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Your form is ready…"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Message</label>
                      <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your message…" rows={6} required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 resize-none" />
                    </div>
                    <div className="flex gap-3">
                      <button type="button" onClick={()=>setComposing(false)} className="px-6 py-2.5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white">Cancel</button>
                      <button type="submit" disabled={!body.trim()||!composing.email||sending}
                        className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#0A1628] font-semibold text-sm py-2.5 rounded-xl">
                        {sending?"Sending…":"Send Message"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : activeThread ? (
                // Conversation thread
                <>
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    {(() => { const c = getClient(activeThread.client_email); return (
                      <div className="flex items-center gap-3">
                        <Avatar name={c?`${c.first_name} ${c.last_name}`:activeThread.client_email} color="#64748B" />
                        <div>
                          <div className="font-semibold text-sm">{c?`${c.first_name} ${c.last_name}`:activeThread.client_email}</div>
                          <div className="text-xs text-slate-500">{activeThread.client_email} · {activeThread.messages?.length||0} messages</div>
                        </div>
                      </div>
                    )})()}
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {(allMsgs.filter(m=>m.message_type==="client_direct"&&(m.sender_email===activeThread.client_email||m.recipient_email===activeThread.client_email))
                      .sort((a,b)=>new Date(a.created_date)-new Date(b.created_date))).map(m=>{
                      const isMe = m.sender_email === user.email;
                      return (
                        <div key={m.id} className={`flex gap-3 ${isMe?"flex-row-reverse":""}`}>
                          <Avatar name={m.sender_name} color={isMe?ROLE_META[myStaff?.role]?.color||"#F59E0B":"#64748B"} size="sm" />
                          <div className={`max-w-[70%] flex flex-col ${isMe?"items-end":""}`}>
                            {!isMe && <div className="text-xs text-slate-500 mb-1">{m.sender_name}</div>}
                            <div className={`px-4 py-3 rounded-2xl text-sm ${isMe?"bg-amber-400 text-[#0A1628] rounded-tr-sm":"bg-white/10 text-white rounded-tl-sm"}`}>{m.body}</div>
                            <span className="text-xs text-slate-600 mt-1">{timeLabel(m.created_date)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  <div className="px-6 py-4 border-t border-white/10">
                    <form onSubmit={sendToClient} className="flex gap-3">
                      <input value={body} onChange={e=>setBody(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendToClient(e)}
                        placeholder={`Reply to ${getClient(activeThread.client_email)?.first_name||"client"}…`}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60" />
                      <button type="submit" disabled={!body.trim()||sending}
                        className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#0A1628] font-bold px-5 rounded-xl transition-colors">
                        {sending?"…":"↑"}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <p className="text-5xl mb-4">📬</p>
                    <p className="text-slate-400 font-medium">Select a client to message</p>
                    <p className="text-slate-600 text-sm mt-1">Or compose a new message</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TEAM CHANNEL MODE ── */}
        {mode === "team" && (
          <>
            {/* Sidebar */}
            <div className="w-52 border-r border-white/10 bg-[#0D1F3C]/40 flex flex-col flex-shrink-0">
              <div className="p-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2">Channels</p>
                {TEAM_CHANNELS.map(ch => (
                  <button key={ch.key} onClick={()=>setTeamChannel(ch.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${teamChannel===ch.key?"bg-amber-400/15 text-amber-400 font-semibold":"text-slate-400 hover:text-white hover:bg-white/5"}`}>
                    {ch.icon} #{ch.label}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-white/10">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2">Online</p>
                {onlineUsers.map(u=>{
                  const m = staff.find(s=>s.email===u.user_email);
                  return (
                    <div key={u.user_email} className="flex items-center gap-2 py-1">
                      <Avatar name={u.user_name} color={m?.avatar_color} size="sm" online />
                      <span className="text-xs text-slate-400 truncate">{u.user_name?.split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Channel messages */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-3 border-b border-white/10">
                <span className="font-semibold text-sm">#{TEAM_CHANNELS.find(c=>c.key===teamChannel)?.label}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {channelMsgs.map((m,i)=>{
                  const prev = channelMsgs[i-1];
                  const same = prev?.sender_email===m.sender_email && (new Date(m.created_date)-new Date(prev.created_date))<300000;
                  const isMe = m.sender_email===user.email;
                  const sm = staff.find(s=>s.email===m.sender_email);
                  return (
                    <div key={m.id} className={`flex gap-3 ${same?"pl-10 mt-0.5":"mt-3"} ${isMe?"flex-row-reverse":""}`}>
                      {!same && <Avatar name={m.sender_name} color={sm?.avatar_color} size="sm" />}
                      <div className={`max-w-[70%] flex flex-col ${isMe?"items-end":""}`}>
                        {!same && <div className="text-xs text-slate-500 mb-1">{isMe?"You":m.sender_name} · {timeLabel(m.created_date)}</div>}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe?"bg-amber-400 text-[#0A1628] rounded-tr-sm":"bg-white/10 text-white rounded-tl-sm"}`}>{m.body}</div>
                      </div>
                    </div>
                  );
                })}
                {channelMsgs.length===0 && <div className="flex-1 flex items-center justify-center py-20 text-slate-500 text-sm">No messages yet. Start the conversation!</div>}
                <div ref={bottomRef} />
              </div>
              <div className="px-6 py-4 border-t border-white/10">
                <form onSubmit={sendToChannel} className="flex gap-3">
                  <input value={body} onChange={e=>setBody(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendToChannel(e)}
                    placeholder={`Message #${TEAM_CHANNELS.find(c=>c.key===teamChannel)?.label}…`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60" />
                  <button type="submit" disabled={!body.trim()||sending}
                    className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#0A1628] font-bold px-5 rounded-xl">
                    {sending?"…":"↑"}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ROOT — route to correct view based on role
// ════════════════════════════════════════════════════════════════════
export default function Messenger() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    StaffMember.filter({ email: user.email }).then(([sm]) => {
      setMyStaff(sm || null);
      setLoading(false);
    });
  }, [user?.email]);

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isClient = !myStaff || myStaff.role === "client";
  return isClient
    ? <ClientMessenger user={user} />
    : <StaffMessenger user={user} myStaff={myStaff} />;
}
