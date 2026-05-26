
import { useState, useEffect } from "react";
import { Client, TaxReturn } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_COLORS = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  in_progress: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  ready: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  filed: "bg-green-500/15 text-green-400 border-green-500/20",
  complete: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [c, r] = await Promise.all([Client.list(), TaxReturn.list()]);
      setClients(c);
      setReturns(r);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = clients.filter(c => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || (c.email || "").toLowerCase().includes(search.toLowerCase());
    if (filter === "all") return matchSearch;
    const clientReturns = returns.filter(r => r.client_id === c.id);
    return matchSearch && clientReturns.some(r => r.status === filter);
  });

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Clients</h1>
              <p className="text-xs text-slate-500">{clients.length} total accounts</p>
            </div>
          </div>
          <Link
            to={createPageUrl("NewClient")}
            className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + New Client
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0D1F3C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition-colors"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all","new","in_progress","filed","complete"].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                  filter === s
                    ? "bg-amber-400 border-amber-400 text-[#0A1628]"
                    : "bg-[#0D1F3C] border-white/10 text-slate-400 hover:border-amber-400/30"
                }`}
              >
                {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 px-6 py-3 border-b border-white/10">
            <div className="col-span-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</div>
            <div className="col-span-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">Contact</div>
            <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:block">Returns</div>
            <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</div>
            <div className="col-span-1" />
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-500 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-500 text-sm">No clients found</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map(client => {
                const clientReturns = returns.filter(r => r.client_id === client.id);
                const latest = clientReturns.sort((a,b)=>(b.tax_year||0)-(a.tax_year||0))[0];
                return (
                  <Link
                    key={client.id}
                    to={createPageUrl("ClientDetail") + `?id=${client.id}`}
                    className="grid grid-cols-12 items-center px-6 py-4 hover:bg-white/5 transition-colors group"
                  >
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-xs flex-shrink-0">
                        {(client.first_name?.[0]||"")}{(client.last_name?.[0]||"")}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{client.first_name} {client.last_name}</div>
                        <div className="text-xs text-slate-500">SSN: •••-••-{(client.ssn||"????").slice(-4)}</div>
                      </div>
                    </div>
                    <div className="col-span-3 hidden md:block">
                      <div className="text-sm text-slate-300">{client.email || "—"}</div>
                      <div className="text-xs text-slate-500">{client.phone || "—"}</div>
                    </div>
                    <div className="col-span-2 hidden lg:block">
                      <div className="text-sm text-white">{clientReturns.length}</div>
                      <div className="text-xs text-slate-500">{clientReturns.map(r=>r.tax_year).join(", ") || "None"}</div>
                    </div>
                    <div className="col-span-2">
                      {latest ? (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[latest.status] || "bg-slate-700/50 text-slate-400 border-slate-600"}`}>
                          {latest.status === "in_progress" ? "In Progress" : (latest.status||"").charAt(0).toUpperCase()+(latest.status||"").slice(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">No returns</span>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-end">
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
