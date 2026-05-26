import { useState, useEffect } from "react";
import { StaffMember, Notification } from "@/api/entities";
import { useUser } from "@/hooks/useUser";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const ROLE_META = {
  super_admin: { label:"Super Admin", badge:"text-amber-400 bg-amber-400/10 border-amber-400/20", icon:"👑" },
  admin:       { label:"Admin",       badge:"text-blue-400 bg-blue-400/10 border-blue-400/20",   icon:"⚡" },
  manager:     { label:"Manager",     badge:"text-purple-400 bg-purple-400/10 border-purple-400/20", icon:"🎯" },
  agent:       { label:"Agent",       badge:"text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon:"👤" },
  client:      { label:"Client",      badge:"text-slate-400 bg-slate-400/10 border-slate-400/20", icon:"🧑" },
};

// Default permission sets per role
const ROLE_DEFAULTS = {
  super_admin: { can_view_clients:true, can_edit_clients:true, can_generate_forms:true, can_view_financials:true, can_approve_milestones:true, can_message:true, can_view_team:true },
  admin:       { can_view_clients:true, can_edit_clients:true, can_generate_forms:true, can_view_financials:true, can_approve_milestones:true, can_message:true, can_view_team:true },
  manager:     { can_view_clients:true, can_edit_clients:false, can_generate_forms:true, can_view_financials:false, can_approve_milestones:true, can_message:true, can_view_team:true },
  agent:       { can_view_clients:true, can_edit_clients:false, can_generate_forms:true, can_view_financials:false, can_approve_milestones:false, can_message:true, can_view_team:false },
  client:      { can_view_clients:false, can_edit_clients:false, can_generate_forms:false, can_view_financials:false, can_approve_milestones:false, can_message:false, can_view_team:false },
};

const PERM_LABELS = {
  can_view_clients:     "View Clients",
  can_edit_clients:     "Edit Clients",
  can_generate_forms:   "Generate Forms",
  can_view_financials:  "View Financials",
  can_approve_milestones:"Approve Milestones",
  can_message:          "Team Messenger",
  can_view_team:        "View Team",
};

const AVATAR_COLORS = ["#F59E0B","#3B82F6","#8B5CF6","#10B981","#EF4444","#F97316","#EC4899","#06B6D4"];

function Avatar({ name, color }) {
  const initials = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
      style={{ background: color||"#374151" }}>{initials}</div>
  );
}

export default function Staff() {
  const { data: user } = useUser();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email:"", full_name:"", role:"agent" });
  const [saving, setSaving] = useState(false);
  const [editPerms, setEditPerms] = useState(null); // member being edited

  const isSuperAdmin = user?.email === "taximizerpro@gmail.com";
  const isAdmin = isSuperAdmin;

  useEffect(() => { StaffMember.list().then(s=>{ setStaff(s); setLoading(false); }); }, []);

  async function handleInvite(e) {
    e.preventDefault(); setSaving(true);
    const color = AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
    const perms = ROLE_DEFAULTS[inviteForm.role] || ROLE_DEFAULTS.agent;
    const m = await StaffMember.create({ ...inviteForm, status:"pending", avatar_color:color, invited_by:user?.email, assigned_client_ids:[], is_online:false, permissions:perms });
    await Notification.create({ recipient_email:"taximizerpro@gmail.com", type:"new_client", title:`New staff invited: ${inviteForm.full_name}`, body:`${inviteForm.email} added as ${inviteForm.role}`, read:false, actor_email:user?.email, actor_name:user?.full_name||user?.email });
    setStaff(s=>[...s,m]); setShowInvite(false); setInviteForm({ email:"", full_name:"", role:"agent" });
    setSaving(false);
  }

  async function updateRole(member, newRole) {
    const perms = ROLE_DEFAULTS[newRole];
    await StaffMember.update(member.id, { role:newRole, permissions:perms });
    setStaff(s=>s.map(m=>m.id===member.id?{...m,role:newRole,permissions:perms}:m));
  }

  async function savePerms(member, perms) {
    await StaffMember.update(member.id, { permissions:perms });
    setStaff(s=>s.map(m=>m.id===member.id?{...m,permissions:perms}:m));
    setEditPerms(null);
  }

  async function toggleStatus(member) {
    const ns = member.status==="active"?"inactive":"active";
    await StaffMember.update(member.id, { status:ns });
    setStaff(s=>s.map(m=>m.id===member.id?{...m,status:ns}:m));
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold">Team & Access Control</h1>
              <p className="text-xs text-slate-500">{staff.length} members · Manage roles & permissions</p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={()=>setShowInvite(true)} className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-xl transition-colors">
              + Invite Member
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">

        {/* Legend */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-4 flex flex-wrap gap-3">
          {Object.entries(ROLE_META).map(([r,m])=>(
            <span key={r} className={`text-xs font-medium px-3 py-1.5 rounded-full border ${m.badge}`}>{m.icon} {m.label}</span>
          ))}
        </div>

        {/* Member list */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
            <div className="divide-y divide-white/5">
              {staff.map(member=>{
                const rm = ROLE_META[member.role]||ROLE_META.agent;
                const canEdit = isAdmin && member.email !== "taximizerpro@gmail.com";
                return (
                  <div key={member.id} className="px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Avatar name={member.full_name} color={member.avatar_color} />
                          {member.is_online && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0D1F3C]" />}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{member.full_name||"Unnamed"}</div>
                          <div className="text-xs text-slate-500">{member.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${rm.badge}`}>{rm.label}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${member.status==="active"?"bg-emerald-500/15 text-emerald-400":member.status==="pending"?"bg-yellow-500/15 text-yellow-400":"bg-slate-500/15 text-slate-400"}`}>
                          {member.status}
                        </span>
                        {canEdit && (
                          <>
                            <select value={member.role} onChange={e=>updateRole(member,e.target.value)}
                              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/40 transition-all">
                              <option value="admin">Admin</option>
                              <option value="manager">Manager</option>
                              <option value="agent">Agent</option>
                              <option value="client">Client</option>
                            </select>
                            <button onClick={()=>setEditPerms(member)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors">
                              Permissions
                            </button>
                            <button onClick={()=>toggleStatus(member)}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${member.status==="active"?"border-red-500/30 text-red-400 hover:bg-red-500/10":"border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"}`}>
                              {member.status==="active"?"Deactivate":"Activate"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Permissions preview */}
                    {member.permissions && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pl-13">
                        {Object.entries(member.permissions).filter(([,v])=>v).map(([k])=>(
                          <span key={k} className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-md">{PERM_LABELS[k]||k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border border-white/15 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-5">Invite Team Member</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              {[["Full Name","full_name","text","Jane Smith"],["Email","email","email","jane@email.com"]].map(([l,k,t,ph])=>(
                <div key={k}>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{l}</label>
                  <input type={t} value={inviteForm[k]} onChange={e=>setInviteForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Role</label>
                <select value={inviteForm.role} onChange={e=>setInviteForm(f=>({...f,role:e.target.value}))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="agent">Agent</option>
                  <option value="client">Client</option>
                </select>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-xs text-blue-300">📧 Default permissions for this role will be applied. You can customize them after inviting.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={()=>setShowInvite(false)} className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A1628] font-semibold text-sm px-4 py-2.5 rounded-xl">
                  {saving?"Inviting...":"Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Editor Modal */}
      {editPerms && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border border-white/15 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-1">Permissions</h2>
            <p className="text-xs text-slate-400 mb-5">{editPerms.full_name} · {ROLE_META[editPerms.role]?.label}</p>
            <div className="space-y-3">
              {Object.entries(PERM_LABELS).map(([key, label])=>{
                const current = editPerms.permissions?.[key] ?? ROLE_DEFAULTS[editPerms.role]?.[key] ?? false;
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-300">{label}</span>
                    <button
                      onClick={()=>setEditPerms(p=>({...p,permissions:{...(p.permissions||{}), [key]:!current}}))}
                      className={`w-10 h-6 rounded-full transition-colors relative ${current?"bg-amber-400":"bg-white/20"}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${current?"translate-x-5":"translate-x-1"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={()=>setEditPerms(null)} className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={()=>savePerms(editPerms, editPerms.permissions||ROLE_DEFAULTS[editPerms.role])}
                className="flex-1 bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2.5 rounded-xl">
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
