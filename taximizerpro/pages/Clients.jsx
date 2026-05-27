import { useState, useEffect } from "react";
import { TaxClient } from "@/api/entities";
import { Link } from "react-router-dom";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-blue-100 text-blue-800",
  filed: "bg-green-100 text-green-800",
  complete: "bg-emerald-100 text-emerald-800",
  funded: "bg-purple-100 text-purple-800",
};

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { applyFilters(); }, [clients, search, statusFilter]);

  async function loadClients() {
    try {
      const data = await TaxClient.list();
      setClients(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function applyFilters() {
    let result = [...clients];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        (c.full_name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter(c => c.filing_status === statusFilter);
    }
    setFiltered(result);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Clients</h1>
          <p className="text-xs text-slate-500">{clients.length} total clients</p>
        </div>
        <Link to="/clients/new"
          className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Client
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="filed">Filed</option>
            <option value="funded">Funded</option>
            <option value="complete">Complete</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">Tax Year(s)</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden lg:table-cell">Step</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(client => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-blue-700">
                          {(client.first_name?.[0] || "") + (client.last_name?.[0] || "")}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{client.full_name}</p>
                        <p className="text-xs text-slate-400">{client.city}, {client.state}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-slate-700">{client.email}</p>
                    <p className="text-xs text-slate-400">{client.phone}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-700">{client.tax_year || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[client.filing_status] || STATUS_COLORS.pending}`}>
                      {client.filing_status || "pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full"
                          style={{ width: `${((Math.round(client.current_step || 1)) / 7) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-slate-500">{Math.round(client.current_step || 1)}/7</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/clients/${client.id}`}
                      className="text-blue-700 hover:text-blue-900 text-xs font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No clients found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
