import { useState, useEffect } from "react";
import { StaffMember } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const ROLES = ["admin","manager","agent"];
const ROLE_COLORS = {
  super_admin: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  admin:       "text-blue-400 bg-blue-400/10 border-blue-400/20",
  manager:     "text-purple-400 bg-purple-400/10 border-purple-400/20",
  agent:       "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};
const AVATAR_COLORS = ["#F59E0B","#3B82F6","#8B5CF6","#10B981","#EF4444","#F97316","#06B6D4","#EC4899"];

export default function Staff() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: "", full_name: "", role: "agent" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    const [sm, all] = await Promise.all([
      StaffMember.filter({ email: user.email }),
      StaffMember.list()
    ]);
    setMyStaff(sm[0] || null);
    setStaff(all);
    setLoading(false);
  }

  const role = myStaff?.role;
  const isAdmin = ["super_admin","admin"].includes(role);

  async function addStaff() {
    if (!invite.email || !invite.full_name) return;
    setSaving(true);
    try {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      await StaffMember.create({
        email: invite.email.toLowerCase().trim(),
        full_name: invite.full_name.trim(),
        role: invite.role,
        status: "invited",
        invited_by: user.email,
        avatar_color: color,
        is_online: false,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setShowInvite(false); setInvite({ email:"", full_name:"", role:"agent" }); }, 2000);
      await load();
    } catch(e) { console.error(e); }
    setSaving(false);
  }

  async function removeStaff(id) {
    if (!confirm("Remove this staff member?")) return;
    await StaffMember.delete(id);
    await load();
  }

  const onlineCount = staff.filter(s=>s.is_online).length;

  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      <nav className="sticky top-0 z-50 bg-[#080F1E]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-xs">T</div>
            <div>
              <span className="font-black text-base">Staff</span>
              <span className="text-xs text-emerald-400 ml-2">● {onlineCount} online</span>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowInvite(true)} className="bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-bold px-4 py-2 rounded-xl text-sm transition-colors">
              + Add Staff
            </button>
          )}
        </div>
      </nav>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D1628] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">Add Staff Member</h3>
              <button onClick={() => setShowInvite(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
            </div>
            {saved ? (
              <div className="py-6 text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-emerald-400 font-semibold">Staff member added!</div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Full Name</label>
                    <input type="text" value={invite.full_name} onChange={e=>setInvite(i=>({...i,full_name:e.target.value}))} placeholder="Mike Hennigan"
                      className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
                    <input type="email" value={invite.email} onChange={e=>setInvite(i=>({...i,email:e.target.value}))} placeholder="mike@example.com"
                      className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Role</label>
                    <select value={invite.role} onChange={e=>setInvite(i=>({...i,role:e.target.value}))}
                      className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400/60">
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={addStaff} disabled={!invite.email || !invite.full_name || saving}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${invite.email && invite.full_name && !saving ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E]" : "bg-white/10 text-slate-500 cursor-not-allowed"}`}>
                  {saving ? "Adding..." : "Add Staff Member"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {["super_admin","admin","manager","agent"].map(r => {
            const count = staff.filter(s=>s.role===r).length;
            return (
              <div key={r} className={`border rounded-xl p-4 ${ROLE_COLORS[r]}`}>
                <div className="text-2xl font-black">{count}</div>
                <div className="text-xs font-medium mt-0.5 capitalize">{r.replace("_"," ")}</div>
              </div>
            );
          })}
        </div>

        {/* Staff list */}
        {loading ? (
          <div className="bg-[#0D1628] border border-white/5 rounded-2xl py-12 text-center text-slate-500 text-sm">Loading...</div>
        ) : (
          <div className="bg-[#0D1628] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h2 className="font-bold text-white">Team Members <span className="text-slate-500 font-normal text-sm">({staff.length})</span></h2>
            </div>
            <div className="divide-y divide-white/5">
              {staff.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                    style={{background: s.avatar_color || "#374151"}}>
                    {(s.full_name || s.email || "?")[0].toUpperCase()}
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0D1628] ${s.is_online ? "bg-emerald-400" : "bg-slate-600"}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{s.full_name || "—"}</div>
                    <div className="text-xs text-slate-500">{s.email}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${ROLE_COLORS[s.role] || "text-slate-400 bg-slate-700/50 border-slate-600/50"}`}>
                    {s.role?.replace("_"," ")}
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg ${s.status === "active" ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-700/50 text-slate-500"}`}>
                    {s.status || "invited"}
                  </span>
                  {isAdmin && s.role !== "super_admin" && s.email !== user?.email && (
                    <button onClick={() => removeStaff(s.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
