import { useState, useEffect, useRef } from "react";
import { Client, TaxReturn, StaffMember, Notification, Presence } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

// ── Role helpers ────────────────────────────────────────────
const ROLE_RANK = { super_admin: 5, admin: 4, manager: 3, agent: 2, client: 1 };
const ROLE_META = {
  super_admin: { label: "Super Admin", color: "#F59E0B", badge: "bg-amber-400/15 text-amber-400 border-amber-400/20" },
  admin:       { label: "Admin",       color: "#3B82F6", badge: "bg-blue-400/15 text-blue-400 border-blue-400/20" },
  manager:     { label: "Manager",     color: "#8B5CF6", badge: "bg-purple-400/15 text-purple-400 border-purple-400/20" },
  agent:       { label: "Agent",       color: "#10B981", badge: "bg-emerald-400/15 text-emerald-400 border-emerald-400/20" },
  client:      { label: "Client",      color: "#64748B", badge: "bg-slate-400/15 text-slate-400 border-slate-400/20" },
};
const NOTIF_ICON = {
  milestone_approval:"✅", new_message:"💬", staff_online:"🟢",
  client_assigned:"📋", milestone_rejected:"⚠️", new_client:"👤",
};
const STATUS_COLORS = {
  new:"bg-blue-500/15 text-blue-400", in_progress:"bg-yellow-500/15 text-yellow-400",
  ready:"bg-purple-500/15 text-purple-400", filed:"bg-green-500/15 text-green-400", complete:"bg-emerald-500/15 text-emerald-400",
};

function Avatar({ name, color, online }) {
  const initials = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <div className="relative">
      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
        style={{ background: color || "#374151" }}>{initials}</div>
      {online && <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-[#0D1F3C]" />}
    </div>
  );
}

export default function Dashboard() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff] = useState(null);
  const [clients, setClients] = useState([]);
  const [returns, setReturns] = useState([]);
  const [staff, setStaff] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [presence, setPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);
  const pingRef = useRef(null);

  // Role checks
  const role = myStaff?.role || "client";
  const perms = myStaff?.permissions || {};
  const isStaff = ["super_admin","admin","manager","agent"].includes(role);
  const isSuperAdmin = role === "super_admin";
  const isAdmin = ["super_admin","admin"].includes(role);
  const canManageTeam = isAdmin || perms.can_view_team;
  const canViewClients = isAdmin || perms.can_view_clients;
  const canMessage = isAdmin || perms.can_message;

  // Ping presence
  useEffect(() => {
    if (!user?.email) return;
    const ping = async () => {
      const ex = await Presence.filter({ user_email: user.email });
      const d = { user_email: user.email, user_name: user.full_name||user.email, role, last_ping: new Date().toISOString(), current_page: "Dashboard" };
      ex.length ? await Presence.update(ex[0].id, d) : await Presence.create(d);
    };
    ping();
    pingRef.current = setInterval(ping, 30000);
    return () => clearInterval(pingRef.current);
  }, [user?.email, role]);

  useEffect(() => {
    if (!user?.email) return;
    async function load() {
      const [sm] = await StaffMember.filter({ email: user.email });
      setMyStaff(sm || null);
      const isC = sm?.role === "client" || !sm;
      const [c, r, s, n, p] = await Promise.all([
        isC ? Client.filter({ email: user.email }) : Client.list(),
        isC ? TaxReturn.filter({ client_id: sm?.id }) : TaxReturn.list(),
        StaffMember.list(),
        Notification.filter({ recipient_email: user.email }),
        Presence.list(),
      ]);
      setClients(c); setReturns(r); setStaff(s); setNotifs(n); setPresence(p);
      setLoading(false);
    }
    load();
    const iv = setInterval(() => {
      if (!user?.email) return;
      Promise.all([Notification.filter({ recipient_email: user.email }), Presence.list()])
        .then(([n,p]) => { setNotifs(n); setPresence(p); });
    }, 15000);
    return () => clearInterval(iv);
  }, [user?.email]);

  useEffect(() => {
    const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const markAllRead = async () => {
    await Promise.all(notifs.filter(n=>!n.read).map(n=>Notification.update(n.id,{read:true})));
    setNotifs(n => n.map(x=>({...x,read:true})));
  };

  const unread = notifs.filter(n=>!n.read).length;
  const onlineUsers = presence.filter(p => Date.now()-new Date(p.last_ping||0).getTime() < 90000);

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── CLIENT VIEW ──────────────────────────────────────────
  if (role === "client" || (!isStaff && !isSuperAdmin)) {
    const myClient = clients[0];
    const myReturns = returns.sort((a,b)=>(b.tax_year||0)-(a.tax_year||0));
    return (
      <div className="min-h-screen bg-[#0A1628] text-white">
        <div className="border-b border-white/10 bg-[#0D1F3C] sticky top-0 z-30">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center">
                <span className="text-[#0A1628] font-bold text-sm">T</span>
              </div>
              <div>
                <h1 className="text-sm font-bold">Taximizer Pro</h1>
                <p className="text-xs text-amber-400/70">Client Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div ref={notifRef} className="relative">
                <button onClick={()=>setShowNotifs(v=>!v)}
                  className="relative w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unread>0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">{unread}</span>}
                </button>
                {showNotifs && (
                  <div className="absolute right-0 top-11 w-72 bg-[#0D1F3C] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
                      <span className="text-sm font-semibold">Notifications</span>
                      {unread>0 && <button onClick={markAllRead} className="text-xs text-amber-400">Mark all read</button>}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifs.length===0 ? <div className="py-8 text-center text-sm text-slate-500">All caught up 🎉</div>
                        : notifs.slice().reverse().map(n=>(
                        <div key={n.id} className={`px-4 py-3 border-b border-white/5 flex gap-3 ${n.read?"opacity-50":""}`}>
                          <span className="text-lg">{NOTIF_ICON[n.type]||"🔔"}</span>
                          <div><div className="text-xs font-semibold">{n.title}</div><div className="text-xs text-slate-400">{n.body?.slice(0,60)}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-400">{user?.full_name||user?.email}</div>
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Welcome */}
          <div className="bg-gradient-to-br from-amber-400/15 to-amber-600/5 border border-amber-400/20 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-1">Welcome back{myClient ? `, ${myClient.first_name}` : ""}! 👋</h2>
            <p className="text-sm text-slate-400">Your tax filings are in good hands. Check your status below.</p>
          </div>
          {/* Returns */}
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="text-sm font-semibold">Your Tax Returns</h3>
            </div>
            {myReturns.length===0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No tax returns on file yet. Your preparer will add them shortly.</div>
            ) : myReturns.map(r => (
              <div key={r.id} className="px-6 py-5 border-b border-white/5 last:border-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">{r.tax_year} Tax Return</div>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[r.status]||"bg-slate-500/15 text-slate-400"}`}>
                    {r.status==="in_progress"?"In Progress":(r.status||"").charAt(0).toUpperCase()+(r.status||"").slice(1)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="flex gap-1 mb-2">
                  {["new","in_progress","ready","filed","complete"].map((s,i)=>{
                    const idx = ["new","in_progress","ready","filed","complete"].indexOf(r.status);
                    return <div key={s} className={`h-1.5 flex-1 rounded-full ${i<=idx?"bg-amber-400":"bg-white/10"}`} />;
                  })}
                </div>
                {r.pdf_url && (
                  <a href={r.pdf_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 mt-2 text-xs text-amber-400 hover:text-amber-300 font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    View Form 1040
                  </a>
                )}
              </div>
            ))}
          </div>
          {/* Contact card */}
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-400 flex items-center justify-center text-[#0A1628] font-bold text-lg flex-shrink-0">EB</div>
            <div>
              <div className="font-semibold text-sm">Eugene Bisignano</div>
              <div className="text-xs text-slate-400">Your Tax Preparer · Taximizer Pro</div>
              <div className="text-xs text-amber-400 mt-1">taximizerpro@gmail.com</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STAFF / ADMIN VIEW ───────────────────────────────────
  const filed   = returns.filter(r=>["filed","complete"].includes(r.status)).length;
  const pending = returns.filter(r=>["new","in_progress","ready"].includes(r.status)).length;
  const recent  = [...clients].sort((a,b)=>new Date(b.created_date)-new Date(a.created_date)).slice(0,8);

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
              <h1 className="text-base font-bold">Taximizer Pro</h1>
              <p className="text-xs text-amber-400/70 uppercase tracking-widest font-medium">{ROLE_META[role]?.label}</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: "Clients",  page: "Clients",   icon: "👥", show: canViewClients },
              { label: "Tracker",  page: "Tracker",   icon: "📊", show: true },
              { label: "Messages", page: "Messenger", icon: "💬", show: canMessage },
              { label: "Team",     page: "Staff",     icon: "⚡", show: canManageTeam },
            ].filter(i=>i.show).map(item=>(
              <Link key={item.page} to={createPageUrl(item.page)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Online */}
            <div className="hidden sm:flex items-center -space-x-1">
              {onlineUsers.slice(0,4).map(u=>{
                const m = staff.find(s=>s.email===u.user_email);
                return <Avatar key={u.user_email} name={u.user_name} color={m?.avatar_color||ROLE_META[u.role]?.color} online />;
              })}
              {onlineUsers.length>4 && <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-slate-400 border-2 border-[#0D1F3C]">+{onlineUsers.length-4}</div>}
            </div>
            {/* Bell */}
            <div ref={notifRef} className="relative">
              <button onClick={()=>setShowNotifs(v=>!v)}
                className="relative w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread>0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">{unread>9?"9+":unread}</span>}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-11 w-80 bg-[#0D1F3C] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex justify-between">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread>0 && <button onClick={markAllRead} className="text-xs text-amber-400">Mark all read</button>}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length===0 ? <div className="py-8 text-center text-sm text-slate-500">All caught up 🎉</div>
                      : notifs.slice().reverse().map(n=>(
                      <button key={n.id} onClick={async()=>{await Notification.update(n.id,{read:true});setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x));}}
                        className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 flex gap-3 ${n.read?"opacity-50":""}`}>
                        <span className="text-xl">{NOTIF_ICON[n.type]||"🔔"}</span>
                        <div><div className="text-xs font-semibold">{n.title}</div><div className="text-xs text-slate-400">{n.body?.slice(0,60)}</div></div>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {isAdmin && (
              <Link to={createPageUrl("NewClient")} className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
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
            { label:"Total Clients", value:clients.length, icon:"👥" },
            { label:"Tax Returns",   value:returns.length, icon:"📄" },
            { label:"Filed",         value:filed,           icon:"✅" },
            { label:"Pending",       value:pending,         icon:"⏳" },
          ].map(s=>(
            <div key={s.label} className="bg-[#0D1F3C] border border-white/10 hover:border-amber-400/20 rounded-2xl p-5 transition-colors">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-3xl font-bold">{s.value}</div>
              <div className="text-sm text-slate-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Online now */}
        {onlineUsers.length>0 && (
          <div className="bg-[#0D1F3C] border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">{onlineUsers.length} Online Now</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {onlineUsers.map(u=>{
                const m = staff.find(s=>s.email===u.user_email);
                return (
                  <div key={u.user_email} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                    <Avatar name={u.user_name} color={m?.avatar_color} online />
                    <div><div className="text-xs font-medium">{u.user_name?.split(" ")[0]}</div><div className="text-xs text-slate-500">{u.current_page}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            canViewClients && { label:"Clients", icon:"👥", page:"Clients", cls:"from-blue-500/20 to-blue-600/10 border-blue-500/20" },
            { label:"Tracker", icon:"📊", page:"Tracker", cls:"from-purple-500/20 to-purple-600/10 border-purple-500/20" },
            canMessage && { label:"Messenger", icon:"💬", page:"Messenger", cls:"from-emerald-500/20 to-emerald-600/10 border-emerald-500/20" },
            canManageTeam && { label:"Team", icon:"⚡", page:"Staff", cls:"from-amber-500/20 to-amber-600/10 border-amber-500/20" },
          ].filter(Boolean).slice(0,4).map(item=>(
            <Link key={item.page} to={createPageUrl(item.page)}
              className={`bg-gradient-to-br ${item.cls} border rounded-2xl p-5 hover:scale-[1.02] transition-all`}>
              <div className="text-3xl mb-2">{item.icon}</div>
              <div className="text-sm font-semibold">{item.label}</div>
            </Link>
          ))}
        </div>

        {/* Recent clients */}
        {canViewClients && (
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recent Clients</h2>
              <Link to={createPageUrl("Clients")} className="text-sm text-amber-400 font-medium hover:text-amber-300">View All →</Link>
            </div>
            {recent.length===0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No clients yet</div>
            ) : (
              <div className="divide-y divide-white/5">
                {recent.map(cl=>{
                  const cr = returns.filter(r=>r.client_id===cl.id);
                  const lat = cr.sort((a,b)=>(b.tax_year||0)-(a.tax_year||0))[0];
                  return (
                    <Link key={cl.id} to={createPageUrl("ClientDetail")+`?id=${cl.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-xs">
                          {cl.first_name?.[0]}{cl.last_name?.[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{cl.first_name} {cl.last_name}</div>
                          <div className="text-xs text-slate-500">{cl.email||"No email"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {lat && <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[lat.status]||""}`}>{lat.status}</span>}
                        <svg className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Super admin team summary */}
        {isSuperAdmin && (
          <div className="bg-[#0D1F3C] border border-amber-400/15 rounded-2xl p-6">
            <h2 className="text-xs font-semibold text-amber-400/70 uppercase tracking-widest mb-4">👑 Team Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {["super_admin","admin","manager","agent","client"].map(r=>{
                const count = staff.filter(s=>s.role===r).length;
                const online = onlineUsers.filter(o=>staff.find(s=>s.email===o.user_email&&s.role===r)).length;
                return (
                  <div key={r} className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold">{count}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{ROLE_META[r].label}s</div>
                    {online>0 && <div className="text-xs text-emerald-400 mt-1">🟢 {online}</div>}
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
