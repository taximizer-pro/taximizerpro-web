import { useState, useEffect } from "react";
import { TaxClient } from "@/api/entities";
import { Link } from "react-router-dom";

const MILESTONE_LABELS = [
  "New Client",
  "Documents Collected",
  "Forms Generated",
  "Client Signed",
  "Submitted to IRS",
  "Funded",
  "Complete"
];

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-blue-100 text-blue-800",
  filed: "bg-green-100 text-green-800",
  complete: "bg-emerald-100 text-emerald-800",
  funded: "bg-purple-100 text-purple-800",
};

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const all = await TaxClient.list();
      setClients(all);

      const total = all.length;
      const funded = all.filter(c => c.filing_status === "funded" || c.irs_status === "funded").length;
      const filed = all.filter(c => c.filing_status === "filed").length;
      const pending = all.filter(c => c.filing_status === "pending" || !c.filing_status).length;
      const totalRefunds = all.reduce((sum, c) => sum + (parseFloat(c.refund_amount) || 0), 0);

      setStats({ total, funded, filed, pending, totalRefunds });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const milestoneCount = (step) => clients.filter(c => Math.round(c.current_step || 1) === step).length;

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">TaximizerPro</h1>
            <p className="text-xs text-slate-500">Admin Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/clients/new" className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + New Client
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Clients", value: stats.total, icon: "👥", color: "blue" },
            { label: "Pending", value: stats.pending, icon: "⏳", color: "amber" },
            { label: "Filed", value: stats.filed, icon: "✅", color: "green" },
            { label: "Pipeline Value", value: `$${(stats.totalRefunds || 0).toLocaleString()}`, icon: "💰", color: "purple" },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{s.icon}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{s.value}</div>
              <div className="text-sm text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Milestone Pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-5">Client Pipeline</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {MILESTONE_LABELS.map((label, i) => (
              <div key={i} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-2">
                  <span className="text-sm font-bold text-blue-700">{milestoneCount(i + 1)}</span>
                </div>
                <p className="text-xs text-slate-600 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent Clients</h2>
            <Link to="/clients" className="text-sm text-blue-700 hover:underline font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {clients.slice(0, 8).map(client => (
              <Link to={`/clients/${client.id}`} key={client.id}
                className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-semibold text-blue-700">
                      {(client.first_name?.[0] || "") + (client.last_name?.[0] || "")}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{client.full_name}</p>
                    <p className="text-xs text-slate-500">{client.email} · {client.tax_year}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[client.filing_status] || STATUS_COLORS.pending}`}>
                    {client.filing_status || "pending"}
                  </span>
                  <span className="text-xs text-slate-400">Step {Math.round(client.current_step || 1)}/7</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
