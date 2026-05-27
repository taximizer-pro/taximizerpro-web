import { useState, useEffect, useRef } from "react";
import { StaffMember, ClientMilestone, Message } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const MILESTONES = ["Documents Received","Under Review","Ready for Signature","Filed","Refund Pending","Funded","Complete"];

const ROLE_COLORS = {
  super_admin: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  admin:       "text-blue-400 bg-blue-400/10 border-blue-400/20",
  manager:     "text-purple-400 bg-purple-400/10 border-purple-400/20",
  agent:       "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  client:      "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

function StatCard({ label, value, sub, color = "amber" }) {
  const colors = {
    amber: "from-amber-500/20 to-amber-600/5 border-amber-500/20 text-amber-400",
    blue:  "from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400",
    green: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400",
    purple:"from-purple-500/20 to-purple-600/5 border-purple-500/20 text-purple-400",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5`}>
      <div className="text-3xl font-black">{value}</div>
      <div className="text-sm font-semibold text-white/80 mt-1">{label}</div>
      {sub && <div className="text-xs text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [messages, setMessages] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [sm, ms, msgs, allStaff] = await Promise.all([
          StaffMember.filter({ email: user.email }),
          ClientMilestone.list(),
          Message.filter({ recipient_email: user.email }),
          StaffMember.list(),
        ]);
        setMyStaff(sm[0] || null);
        setMilestones(ms);
        setMessages(msgs);
        setStaff(allStaff);
        setUnread(msgs.filter(m => !m.read_by?.includes(user.email)).length);
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, [user]);

  const role = myStaff?.role || "client";
  const isAdmin = ["super_admin","admin"].includes(role);

  const total     = milestones.length;
  const filed     = milestones.filter(m => ["Filed","Refund Pending","Funded","Complete"].includes(m.milestone)).length;
  const pending   = milestones.filter(m => m.status === "pending").length;
  const funded    = milestones.filter(m => m.milestone === "Funded" || m.milestone === "Complete").length;
  const recentMs  = [...milestones].sort((a,b) => new Date(b.updated_date)-new Date(a.updated_date)).slice(0,8);
  const onlineStaff = staff.filter(s => s.is_online);

  if (loading) return (
    <div className="min-h-screen bg-[#080F1E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">Loading TaximizerPro...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 bg-[#080F1E]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-sm">T</div>
            <span className="font-black text-lg tracking-tight">Taximizer<span className="text-amber-400">Pro</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Link to={createPageUrl("Messenger")} className="relative p-2 hover:bg-white/5 rounded-xl transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">{unread}</span>}
            </Link>
            {isAdmin && (
              <Link to={createPageUrl("Staff")} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                </svg>
              </Link>
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-xs ml-1">
              {(user?.full_name || user?.email || "?")[0].toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">Welcome back{myStaff?.full_name ? `, ${myStaff.full_name.split(' ')[0]}` : ''} 👋</h1>
            <p className="text-slate-500 text-sm mt-1">
              {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              {myStaff?.role && (
                <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[myStaff.role]}`}>
                  {myStaff.role.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
                </span>
              )}
            </p>
          </div>
          {isAdmin && (
            <Link to={createPageUrl("NewClient")} className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-bold px-5 py-2.5 rounded-xl transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
              </svg>
              New Client
            </Link>
          )}
        </div>

        {/* Stats */}
        {isAdmin && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Filings" value={total} sub="All years" color="amber" />
            <StatCard label="Filed" value={filed} sub="Submitted to IRS" color="blue" />
            <StatCard label="Pending Review" value={pending} sub="Need attention" color="purple" />
            <StatCard label="Funded" value={funded} sub="Refunds received" color="green" />
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-[#0D1628] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="font-bold text-white">Recent Activity</h2>
              <Link to={createPageUrl("Tracker")} className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium">View All →</Link>
            </div>
            {recentMs.length === 0 ? (
              <div className="py-12 text-center text-slate-600 text-sm">No activity yet</div>
            ) : (
              <div className="divide-y divide-white/5">
                {recentMs.map(m => (
                  <div key={m.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      m.status === 'approved' ? 'bg-emerald-400' :
                      m.status === 'pending'  ? 'bg-amber-400' :
                      m.status === 'rejected' ? 'bg-red-400' : 'bg-slate-600'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{m.client_name}</div>
                      <div className="text-xs text-slate-500">{m.milestone} · {m.tax_year}</div>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                      m.status === 'approved' ? 'bg-emerald-400/10 text-emerald-400' :
                      m.status === 'pending'  ? 'bg-amber-400/10 text-amber-400' :
                      m.status === 'rejected' ? 'bg-red-400/10 text-red-400' : 'bg-slate-700 text-slate-400'
                    }`}>{m.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links + Online Staff */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-5 space-y-2">
              <h2 className="font-bold text-white mb-3">Quick Actions</h2>
              {[
                { label: "Client List", icon: "👥", page: "Clients" },
                { label: "Tracker", icon: "📊", page: "Tracker" },
                { label: "Messages", icon: "💬", page: "Messenger" },
                ...(isAdmin ? [{ label: "Staff", icon: "🧑‍💼", page: "Staff" }] : []),
              ].map(a => (
                <Link key={a.page} to={createPageUrl(a.page)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-sm text-slate-300 hover:text-white">
                  <span className="text-base">{a.icon}</span>
                  {a.label}
                  <svg className="w-4 h-4 ml-auto text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </Link>
              ))}
            </div>

            {/* Online Now */}
            {isAdmin && onlineStaff.length > 0 && (
              <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-5">
                <h2 className="font-bold text-white mb-3">Online Now <span className="text-emerald-400 text-xs ml-1">● {onlineStaff.length}</span></h2>
                <div className="space-y-2">
                  {onlineStaff.slice(0,5).map(s => (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <div className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{background: s.avatar_color || '#374151'}}>
                        {(s.full_name||s.email||"?")[0].toUpperCase()}
                        <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-[#0D1628]"/>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">{s.full_name || s.email}</div>
                        <div className="text-[10px] text-slate-500">{s.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
