import { useState, useEffect } from "react";
import { Client, TaxReturn, User } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const STATUS_COLORS = {
  new: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-yellow-500/15 text-yellow-400",
  ready: "bg-purple-500/15 text-purple-400",
  filed: "bg-green-500/15 text-green-400",
  complete: "bg-emerald-500/15 text-emerald-400",
};
const STATUS_LABELS = {
  new: "New", in_progress: "In Progress", ready: "Ready",
  filed: "Filed", complete: "Complete",
};

export default function Dashboard() {
  const { data: user } = useUser();
  const [clients, setClients] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user?.email === "taximizerpro@gmail.com";
  const isAdmin = isSuperAdmin || user?.role === "admin";

  useEffect(() => {
    async function load() {
      const [c, r] = await Promise.all([Client.list(), TaxReturn.list()]);
      // Admins see only their assigned clients, super admin sees all
      const filteredClients = isSuperAdmin ? c : c.filter(cl => cl.assigned_to === user?.email);
      setClients(filteredClients);
      setReturns(r.filter(ret => filteredClients.some(cl => cl.id === ret.client_id)));
      setLoading(false);
    }
    if (user) load();
    const iv = setInterval(() => { if (user) load(); }, 30000);
    return () => clearInterval(iv);
  }, [user]);

  const filed = returns.filter(r => ["filed", "complete"].includes(r.status)).length;
  const pending = returns.filter(r => ["new", "in_progress", "ready"].includes(r.status)).length;

  const recentClients = [...clients]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 8);

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Top Nav */}
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#0A1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Taximizer Pro</h1>
              <p className="text-xs text-amber-400/80 font-medium tracking-widest uppercase">Automated Tax Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </div>
            {/* Role badge */}
            {isSuperAdmin && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/20">
                Super Admin
              </span>
            )}
            {!isSuperAdmin && isAdmin && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                Admin
              </span>
            )}
            <Link to={createPageUrl("Clients")} className="text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-all">
              Clients
            </Link>
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
            { label: "Total Clients", value: clients.length, sub: "Active accounts", icon: "👥", color: "blue" },
            { label: "Tax Returns", value: returns.length, sub: "All years", icon: "📄", color: "purple" },
            { label: "Filed", value: filed, sub: "Completed", icon: "✅", color: "emerald" },
            { label: "Pending", value: pending, sub: "Need action", icon: "⏳", color: "amber" },
          ].map(stat => (
            <div key={stat.label}
              className={`bg-[#0D1F3C] border rounded-2xl p-5 hover:border-amber-400/20 transition-colors ${
                stat.color === "blue" ? "border-blue-500/15" :
                stat.color === "purple" ? "border-purple-500/15" :
                stat.color === "emerald" ? "border-emerald-500/15" :
                "border-amber-500/15"
              }`}>
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-slate-300">{stat.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Filing Pipeline */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">Filing Pipeline</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "new", label: "New", icon: "🆕" },
              { key: "in_progress", label: "In Progress", icon: "✏️" },
              { key: "ready", label: "Ready", icon: "📋" },
              { key: "filed", label: "Filed", icon: "✅" },
            ].map(stage => {
              const count = returns.filter(r => r.status === stage.key).length;
              const pct = returns.length ? Math.round((count / returns.length) * 100) : 0;
              return (
                <div key={stage.key} className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-lg">{stage.icon}</span>
                    <span className="text-2xl font-bold">{count}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-300 mb-2">{stage.label}</div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-amber-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recent Clients</h2>
            <Link to={createPageUrl("Clients")} className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors">
              View All →
            </Link>
          </div>

          {recentClients.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-slate-500 text-sm">No clients yet</p>
              {isAdmin && (
                <Link to={createPageUrl("NewClient")} className="mt-3 inline-block text-amber-400 text-sm font-medium hover:text-amber-300">
                  Add your first client →
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentClients.map(cl => {
                const clientReturns = returns.filter(r => r.client_id === cl.id);
                const latest = clientReturns.sort((a, b) => (b.tax_year || 0) - (a.tax_year || 0))[0];
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
                      {latest && (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[latest.status]}`}>
                          {STATUS_LABELS[latest.status]}
                        </span>
                      )}
                      {isSuperAdmin && cl.assigned_to && (
                        <span className="text-xs text-slate-600 hidden sm:block">{cl.assigned_to.split("@")[0]}</span>
                      )}
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

        {/* Super Admin Only — Team Overview */}
        {isSuperAdmin && (
          <div className="bg-[#0D1F3C] border border-amber-400/15 rounded-2xl p-6">
            <h2 className="text-xs font-semibold text-amber-400/70 uppercase tracking-widest mb-4">⚡ Admin Team Overview</h2>
            <div className="grid grid-cols-2 gap-4">
              {["taximizerpro@gmail.com", "mike.hennigan44@gmail.com"].map(email => {
                const adminClients = clients.filter(c => c.assigned_to === email || (email === "taximizerpro@gmail.com" && !c.assigned_to));
                return (
                  <div key={email} className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-xs font-bold">
                        {email[0].toUpperCase()}
                      </div>
                      <span className="text-xs text-slate-300 font-medium">{email.split("@")[0]}</span>
                      {email === "taximizerpro@gmail.com" && (
                        <span className="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Super Admin</span>
                      )}
                    </div>
                    <div className="text-2xl font-bold">{adminClients.length}</div>
                    <div className="text-xs text-slate-500">clients assigned</div>
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
