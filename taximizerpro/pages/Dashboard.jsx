
import { useState, useEffect } from "react";
import { Client, TaxReturn } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  ready: "bg-purple-100 text-purple-700",
  filed: "bg-green-100 text-green-700",
  complete: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABELS = {
  new: "New",
  in_progress: "In Progress",
  ready: "Ready to File",
  filed: "Filed",
  complete: "Complete",
};

const STAT_ICONS = {
  clients: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  returns: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  filed: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  pending: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [c, r] = await Promise.all([Client.list(), TaxReturn.list()]);
      setClients(c);
      setReturns(r);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(iv);
  }, []);

  const filed = returns.filter(r => ["filed","complete"].includes(r.status)).length;
  const pending = returns.filter(r => ["new","in_progress","ready"].includes(r.status)).length;

  const pipeline = [
    { key: "new", label: "New", icon: "🆕" },
    { key: "in_progress", label: "In Progress", icon: "✏️" },
    { key: "ready", label: "Ready", icon: "📋" },
    { key: "filed", label: "Filed", icon: "✅" },
  ];

  const recentClients = [...clients]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 8);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#0A1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Taximizer Pro</h1>
              <p className="text-xs text-amber-400/80 font-medium tracking-widest uppercase">Automated Tax Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </div>
            <Link
              to={createPageUrl("NewClient")}
              className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              + New Client
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Clients", value: clients.length, icon: "clients", color: "blue", change: "Active accounts" },
            { label: "Tax Returns", value: returns.length, icon: "returns", color: "purple", change: "All years" },
            { label: "Filed", value: filed, icon: "filed", color: "emerald", change: "Completed" },
            { label: "Pending", value: pending, icon: "pending", color: "amber", change: "Need action" },
          ].map(stat => (
            <div key={stat.label} className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5 hover:border-amber-400/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  stat.color === "blue" ? "bg-blue-500/15 text-blue-400" :
                  stat.color === "purple" ? "bg-purple-500/15 text-purple-400" :
                  stat.color === "emerald" ? "bg-emerald-500/15 text-emerald-400" :
                  "bg-amber-500/15 text-amber-400"
                }`}>
                  {STAT_ICONS[stat.icon]}
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-slate-300">{stat.label}</div>
              <div className="text-xs text-slate-500 mt-1">{stat.change}</div>
            </div>
          ))}
        </div>

        {/* Pipeline */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-5">Filing Pipeline</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {pipeline.map((stage, i) => {
              const count = returns.filter(r => r.status === stage.key).length;
              const pct = returns.length ? Math.round((count / returns.length) * 100) : 0;
              return (
                <div key={stage.key} className="relative bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg">{stage.icon}</span>
                    <span className="text-2xl font-bold text-white">{count}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-300 mb-2">{stage.label}</div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-amber-400 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">{pct}% of total</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between border-b border-white/10">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Recent Clients</h2>
            <Link to={createPageUrl("Clients")} className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors">
              View All →
            </Link>
          </div>
          {recentClients.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-slate-500 text-sm">No clients yet</p>
              <Link to={createPageUrl("NewClient")} className="mt-3 inline-block text-amber-400 text-sm font-medium hover:text-amber-300">
                Add your first client →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentClients.map(client => {
                const clientReturns = returns.filter(r => r.client_id === client.id);
                const latestReturn = clientReturns.sort((a,b) => (b.tax_year||0)-(a.tax_year||0))[0];
                return (
                  <Link
                    key={client.id}
                    to={createPageUrl("ClientDetail") + `?id=${client.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-amber-400/15 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                        {(client.first_name?.[0] || "")}{(client.last_name?.[0] || "")}
                      </div>
                      <div>
                        <div className="font-medium text-white text-sm">{client.first_name} {client.last_name}</div>
                        <div className="text-xs text-slate-500">{client.email || "No email"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {latestReturn && (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[latestReturn.status] || "bg-slate-700 text-slate-300"}`}>
                          {STATUS_LABELS[latestReturn.status] || latestReturn.status}
                        </span>
                      )}
                      <span className="text-xs text-slate-600">{clientReturns.length} return{clientReturns.length !== 1 ? "s" : ""}</span>
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
      </div>
    </div>
  );
}
