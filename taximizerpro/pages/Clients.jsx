import { useState, useEffect } from "react";
import { ClientMilestone, StaffMember } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const STATUS_STYLE = {
  approved: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  pending:  "bg-amber-400/10 text-amber-400 border-amber-400/20",
  rejected: "bg-red-400/10 text-red-400 border-red-400/20",
  active:   "bg-blue-400/10 text-blue-400 border-blue-400/20",
};

export default function Clients() {
  const { data: user } = useUser();
  const [milestones, setMilestones] = useState([]);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ClientMilestone.list().then(ms => { setMilestones(ms); setLoading(false); });
  }, []);

  // Group by client
  const clientMap = {};
  milestones.forEach(m => {
    if (!clientMap[m.client_id]) clientMap[m.client_id] = { id: m.client_id, name: m.client_name, years: {}, latest: m };
    if (!clientMap[m.client_id].years[m.tax_year]) clientMap[m.client_id].years[m.tax_year] = [];
    clientMap[m.client_id].years[m.tax_year].push(m);
    if (new Date(m.updated_date) > new Date(clientMap[m.client_id].latest.updated_date)) {
      clientMap[m.client_id].latest = m;
    }
  });

  let clients = Object.values(clientMap);
  if (search) clients = clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));
  if (yearFilter !== "all") clients = clients.filter(c => c.years[yearFilter]);
  clients.sort((a,b) => new Date(b.latest.updated_date) - new Date(a.latest.updated_date));

  const years = [...new Set(milestones.map(m=>m.tax_year))].sort((a,b)=>b-a);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <img src="https://media.base44.com/images/public/6a14ef767988d1ef0baff5aa/883f43554_generated_image.png" alt="TaximizerPro" class="h-8 w-auto" />
            <span className="font-black text-base">Clients</span>
          </div>
          <div className="ml-auto">
            <Link to={createPageUrl("NewClient")} className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-bold px-4 py-2 rounded-xl transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
              </svg>
              New Client
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text" placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400/50"/>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {["all",...years].map(y => (
              <button key={y} onClick={() => setYearFilter(String(y))}
                className={`flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                  yearFilter === String(y) ? "bg-amber-400 border-amber-400 text-[#080F1E]" : "bg-white border-slate-200 text-slate-400 hover:border-amber-400/30"
                }`}>
                {y === "all" ? "All Years" : y}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="text-sm text-slate-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</div>

        {/* List */}
        <div className="space-y-2">
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center text-slate-500 text-sm">Loading...</div>
          ) : clients.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
              <div className="text-4xl mb-3">👥</div>
              <div className="text-slate-500 text-sm">No clients yet. Add your first one!</div>
            </div>
          ) : clients.map(c => {
            const yrs = Object.keys(c.years).sort((a,b)=>b-a);
            const latestMilestone = c.latest.milestone;
            return (
              <Link key={c.id} to={createPageUrl("ClientDetail")+"?id="+c.id}
                className="flex items-center gap-4 bg-white border border-slate-200 hover:border-amber-400/20 rounded-2xl px-5 py-4 transition-all group">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/20 flex items-center justify-center text-amber-400 font-black text-sm flex-shrink-0">
                  {(c.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {yrs.join(", ")} · {Object.values(c.years).flat().length} filing{Object.values(c.years).flat().length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  {yrs.slice(0,3).map(y => (
                    <span key={y} className="text-xs font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-400">{y}</span>
                  ))}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_STYLE[c.latest.status] || "bg-slate-700/50 text-slate-400 border-slate-600/50"}`}>
                  {latestMilestone}
                </span>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
