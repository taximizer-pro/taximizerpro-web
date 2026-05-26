import { useState, useEffect, useRef } from "react";
import { Client, TaxReturn, StaffMember, Notification, Presence } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const STATUS_COLORS = {
  new:         "bg-blue-500/15 text-blue-400",
  in_progress: "bg-yellow-500/15 text-yellow-400",
  ready:       "bg-purple-500/15 text-purple-400",
  filed:       "bg-green-500/15 text-green-400",
  complete:    "bg-emerald-500/15 text-emerald-400",
};
const STATUS_LABELS = {
  new: "New", in_progress: "In Progress", ready: "Ready", filed: "Filed", complete: "Complete",
};
const ROLE_COLOR = {
  super_admin: "#F59E0B", admin: "#3B82F6", manager: "#8B5CF6", agent: "#10B981",
};
const NOTIF_ICON = {
  milestone_approval: "✅", new_message: "💬", staff_online: "🟢",
  client_assigned: "📋", milestone_rejected: "⚠️", new_client: "👤",
};

function Avatar({ name, color, size = "sm" }) {
  const sz = size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ background: color || "#374151" }}>
      {initials}
    </div>
  );
}

export default function Dashboard() {
  const { data: user } = useUser();
  const [clients, setClients]   = useState([]);
  const [returns, setReturns]   = useState([]);
  const [staff, setStaff]       = useState([]);
  const [notifs, setNotifs]     = useState([]);
  const [presence, setPresence] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);
  const pingRef  = useRef(null);

  const myStaff     = staff.find(s => s.email === user?.email);
  const isSuperAdmin = user?.email === "taximizerpro@gmail.com";
  const isAdmin      = isSuperAdmin || myStaff?.role === "admin";

  // Ping presence
  useEffect(() => {
    if (!user?.email) return;
    async function ping() {
      const existing = await Presence.filter({ user_email: user.email });
      const data = { user_email: user.email, user_name: user.full_name || user.email, role: myStaff?.role || "agent", last_ping: new Date().toISOString(), current_page: "Dashboard" };
      if (existing.length > 0) await Presence.update(existing[0].id, data);
      else await Presence.create(data);
    }
    ping();
    pingRef.current = setInterval(ping, 30000);
    return () => clearInterval(pingRef.current);
  }, [user?.email, myStaff?.role]);

  useEffect(() => {
    async function load() {
      const [c, r, s, n, p] = await Promise.all([
        Client.list(), TaxReturn.list(), StaffMember.list(),
        Notification.filter({ recipient_email: user?.email }),
        Presence.list(),
      ]);
      setClients(c); setReturns(r); setStaff(s); setNotifs(n); setPresence(p);
      setLoading(false);
    }
    if (user) load();
    const iv = setInterval(() => {
      if (!user) return;
      Promise.all([Client.list(), StaffMember.list(), Notification.filter({ recipient_email: user?.email }), Presence.list()])
        .then(([c, s, n, p]) => { setClients(c); setStaff(s); setNotifs(n); setPresence(p); });
    }, 15000);
    return () => clearInterval(iv);
  }, [user]);

  // Close notif panel on outside click
  useEffect(() => {
    function handler(e) { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markRead(notif) {
    await Notification.update(notif.id, { read: true });
    setNotifs(n => n.map(x => x.id === notif.id ? { ...x, read: true } : x));
  }

  async function markAllRead() {
    await Promise.all(notifs.filter(n => !n.read).map(n => Notification.update(n.id, { read: true })));
    setNotifs(n => n.map(x => ({ ...x, read: true })));
  }

  const unread   = notifs.filter(n => !n.read).length;
  const filed    = returns.filter(r => ["filed","complete"].includes(r.status)).length;
  const pending  = returns.filter(r => ["new","in_progress","ready"].includes(r.status)).length;
  const onlineUsers = presence.filter(p => Date.now() - new Date(p.last_ping || 0).getTime() < 90000);

  const recentClients = [...clients]
    .sort((a,b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 8);

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Top Nav */}
      <div className="border-b border-white/10 bg-[#0D1F3C] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#0A1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Taximizer Pro</h1>
              <p className="text-xs text-amber-400/80 font-medium tracking-widest uppercase">Tax Platform</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: "Clients",   page: "Clients",   icon: "👥" },
              { label: "Tracker",   page: "Tracker",   icon: "📊" },
              { label: "Messages",  page: "Messenger", icon: "💬" },
              ...(isAdmin ? [{ label: "Team", page: "Staff", icon: "⚡" }] : []),
            ].map(item => (
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <span>{item.icon}</span> {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Online avatars */}
            <div className="hidden sm:flex items-center gap-1">
              {onlineUsers.slice(0,4).map(u => {
                const member = staff.find(s => s.email === u.user_email);
                return (
                  <div key={u.user_email} title={`${u.user_name} · ${u.current_page}`} className="relative">
                    <Avatar name={u.user_name} color={member?.avatar_color || ROLE_COLOR[u.role]} />
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-[#0D1F3C]" />
                  </div>
                );
              })}
              {onlineUsers.length > 4 && (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-slate-400">
                  +{onlineUsers.length - 4}
                </div>
              )}
            </div>

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button onClick={() => setShowNotifs(v => !v)}
                className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-11 w-80 bg-[#0D1F3C] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                      <button onClick={markAllRead} className="text-xs text-amber-400 hover:text-amber-300">Mark all read</button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-500">All caught up! 🎉</div>
                    ) : notifs.slice().reverse().map(n => (
                      <button key={n.id} onClick={() => markRead(n)}
                        className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors flex gap-3 ${n.read ? "opacity-60" : ""}`}>
                        <span className="text-xl flex-shrink-0 mt-0.5">{NOTIF_ICON[n.type] || "🔔"}</span>
                        <div>
                          <div className="text-xs font-semibold text-white">{n.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{n.body?.slice(0, 60)}</div>
                        </div>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-1.5 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <Link to={createPageUrl("NewClient")}
                className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
                + New Client
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Clients", value: clients.length, icon: "👥", color: "blue" },
            { label: "Tax Returns",   value: returns.length, icon: "📄", color: "purple" },
            { label: "Filed",         value: filed,           icon: "✅", color: "emerald" },
            { label: "Pending",       value: pending,         icon: "⏳", color: "amber" },
          ].map(stat => (
            <div key={stat.label}
              className="bg-[#0D1F3C] border border-white/10 hover:border-amber-400/20 rounded-2xl p-5 transition-colors">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-slate-300">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Online Now */}
        {onlineUsers.length > 0 && (
          <div className="bg-[#0D1F3C] border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">{onlineUsers.length} Online Now</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {onlineUsers.map(u => {
                const member = staff.find(s => s.email === u.user_email);
                return (
                  <div key={u.user_email} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                    <div className="relative">
                      <Avatar name={u.user_name} color={member?.avatar_color} />
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-[#0D1F3C]" />
                    </div>
                    <div>
                      <div className="text-xs font-medium">{u.user_name?.split(" ")[0]}</div>
                      <div className="text-xs text-slate-500">{u.current_page}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Team Messenger", icon: "💬", page: "Messenger", color: "from-blue-500/20 to-blue-600/10 border-blue-500/20" },
            { label: "Client Tracker", icon: "📊", page: "Tracker",   color: "from-purple-500/20 to-purple-600/10 border-purple-500/20" },
            ...(isAdmin ? [
              { label: "Team Management", icon: "⚡", page: "Staff",     color: "from-amber-500/20 to-amber-600/10 border-amber-500/20" },
              { label: "New Client",      icon: "➕", page: "NewClient", color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20" },
            ] : [
              { label: "All Clients", icon: "👥", page: "Clients", color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20" },
            ]),
          ].map(item => (
            <Link key={item.page} to={createPageUrl(item.page)}
              className={`bg-gradient-to-br ${item.color} border rounded-2xl p-5 hover:scale-105 transition-all`}>
              <div className="text-3xl mb-2">{item.icon}</div>
              <div className="text-sm font-semibold">{item.label}</div>
            </Link>
          ))}
        </div>

        {/* Recent Clients */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recent Clients</h2>
            <Link to={createPageUrl("Clients")} className="text-sm text-amber-400 hover:text-amber-300 font-medium">View All →</Link>
          </div>
          {recentClients.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-slate-500 text-sm">No clients yet</p>
              {isAdmin && <Link to={createPageUrl("NewClient")} className="mt-3 inline-block text-amber-400 text-sm font-medium hover:text-amber-300">Add first client →</Link>}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentClients.map(cl => {
                const clientReturns = returns.filter(r => r.client_id === cl.id);
                const latest = clientReturns.sort((a,b)=>(b.tax_year||0)-(a.tax_year||0))[0];
                return (
                  <Link key={cl.id} to={createPageUrl("ClientDetail") + `?id=${cl.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-xs">
                        {cl.first_name?.[0]}{cl.last_name?.[0]}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{cl.first_name} {cl.last_name}</div>
                        <div className="text-xs text-slate-500">{cl.email || "No email"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {latest && <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[latest.status]}`}>{STATUS_LABELS[latest.status]}</span>}
                      <svg className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Super Admin: Team Summary */}
        {isSuperAdmin && (
          <div className="bg-[#0D1F3C] border border-amber-400/15 rounded-2xl p-6">
            <h2 className="text-xs font-semibold text-amber-400/70 uppercase tracking-widest mb-4">👑 Team Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {["super_admin","admin","manager","agent"].map(role => {
                const count = staff.filter(s => s.role === role).length;
                const online = onlineUsers.filter(o => staff.find(s => s.email === o.user_email && s.role === role)).length;
                const labels = { super_admin:"Super Admins", admin:"Admins", manager:"Managers", agent:"Agents" };
                return (
                  <div key={role} className="bg-white/5 rounded-xl p-4">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-xs text-slate-400 mt-1">{labels[role]}</div>
                    {online > 0 && <div className="text-xs text-emerald-400 mt-1">🟢 {online} online</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
