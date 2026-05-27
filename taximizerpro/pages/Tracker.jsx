import { useState, useEffect } from "react";
import { ClientMilestone } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const MILESTONES = ["Documents Received","Under Review","Ready for Signature","Filed","Refund Pending","Funded","Complete"];
const MILESTONE_ICONS = {"Documents Received":"📥","Under Review":"🔍","Ready for Signature":"✍️","Filed":"📤","Refund Pending":"⏳","Funded":"💰","Complete":"✅"};

const STATUS_STYLE = {
  approved: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  pending:  "bg-amber-400/10 text-amber-400 border-amber-400/20",
  rejected: "bg-red-400/10 text-red-400 border-red-400/20",
};

export default function Tracker() {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [msFilter, setMsFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    ClientMilestone.list().then(ms => { setMilestones(ms); setLoading(false); });
  }, []);

  // Group by client+year, keep latest milestone per group
  const groups = {};
  milestones.forEach(m => {
    const key = `${m.client_id}_${m.tax_year}`;
    if (!groups[key] || MILESTONES.indexOf(m.milestone) > MILESTONES.indexOf(groups[key].milestone)) {
      groups[key] = m;
    }
  });

  let rows = Object.values(groups);
  if (search) rows = rows.filter(r => r.client_name?.toLowerCase().includes(search.toLowerCase()));
  if (msFilter !== "all") rows = rows.filter(r => r.milestone === msFilter);
  if (yearFilter !== "all") rows = rows.filter(r => String(r.tax_year) === yearFilter);
  rows.sort((a,b) => MILESTONES.indexOf(a.milestone) - MILESTONES.indexOf(b.milestone));

  const years = [...new Set(milestones.map(m=>m.tax_year))].sort((a,b)=>b-a);

  // Stats per milestone
  const msCounts = {};
  MILESTONES.forEach(ms => { msCounts[ms] = Object.values(groups).filter(g=>g.milestone===ms).length; });

  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      <nav className="sticky top-0 z-50 bg-[#080F1E]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-xs">T</div>
            <span className="font-black text-base">Tracker</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Pipeline overview */}
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {MILESTONES.map(ms => (
              <button key={ms} onClick={() => setMsFilter(f => f === ms ? "all" : ms)}
                className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all min-w-[100px] ${
                  msFilter === ms ? "bg-amber-400/10 border-amber-400/30 text-amber-400" : "bg-[#0D1628] border-white/5 text-slate-400 hover:border-amber-400/20"
                }`}>
                <span className="text-xl">{MILESTONE_ICONS[ms]}</span>
                <span className="text-lg font-black text-white">{msCounts[ms] || 0}</span>
                <span className="text-[10px] font-medium text-center leading-tight">{ms}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text" placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}
              className="w-full bg-[#0D1628] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50"/>
          </div>
          <div className="flex gap-2">
            {["all",...years].map(y => (
              <button key={y} onClick={() => setYearFilter(String(y))}
                className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                  yearFilter === String(y) ? "bg-amber-400 border-amber-400 text-[#080F1E]" : "bg-[#0D1628] border-white/10 text-slate-400 hover:border-amber-400/30"
                }`}>{y === "all" ? "All Years" : y}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#0D1628] border border-white/5 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 border-b border-white/5">
            <div className="col-span-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Client</div>
            <div className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Year</div>
            <div className="col-span-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Stage</div>
            <div className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">No results</div>
          ) : rows.map(r => (
            <Link key={`${r.client_id}_${r.tax_year}`} to={createPageUrl("ClientDetail")+"?id="+r.client_id}
              className="grid grid-cols-12 items-center px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors group">
              <div className="col-span-4 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-xs flex-shrink-0">
                  {(r.client_name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white truncate">{r.client_name}</span>
              </div>
              <div className="col-span-2 text-sm text-slate-400">{r.tax_year}</div>
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{MILESTONE_ICONS[r.milestone]}</span>
                  <span className="text-sm text-slate-300 truncate">{r.milestone}</span>
                </div>
              </div>
              <div className="col-span-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_STYLE[r.status] || "bg-slate-700/50 text-slate-400 border-slate-600/50"}`}>
                  {r.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
