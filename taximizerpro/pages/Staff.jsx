import { useState, useEffect } from "react";
import { StaffMember } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const STAFF_ROLES = ["admin","manager","agent"];
const ALL_ROLES   = ["super_admin","admin","manager","agent","client"];

const ROLE_COLORS = {
  super_admin: "text-amber-700 bg-amber-50 border-amber-200",
  admin:       "text-blue-700 bg-blue-50 border-blue-200",
  manager:     "text-purple-700 bg-purple-50 border-purple-200",
  agent:       "text-emerald-700 bg-emerald-50 border-emerald-200",
  client:      "text-slate-600 bg-slate-100 border-slate-200",
};

// Default permissions per role
const DEFAULT_PERMISSIONS = {
  super_admin: { view_all: true,  download: true,  message: true,  edit_clients: true,  manage_staff: true,  view_financials: true },
  admin:       { view_all: true,  download: true,  message: true,  edit_clients: true,  manage_staff: true,  view_financials: true },
  manager:     { view_all: true,  download: true,  message: true,  edit_clients: true,  manage_staff: false, view_financials: false },
  agent:       { view_all: false, download: false, message: true,  edit_clients: false, manage_staff: false, view_financials: false },
  client:      { view_all: false, download: false, message: true,  edit_clients: false, manage_staff: false, view_financials: false },
};

const PERMISSION_LABELS = {
  view_all:        "View All Records",
  download:        "Download Files",
  message:         "Send Messages",
  edit_clients:    "Edit Client Data",
  manage_staff:    "Manage Staff",
  view_financials: "View Financial Data",
};

const AVATAR_COLORS = ["#F59E0B","#3B82F6","#8B5CF6","#10B981","#EF4444","#F97316","#06B6D4","#EC4899"];

export default function Staff() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff]         = useState(null);
  const [staff, setStaff]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showInvite, setShowInvite]   = useState(false);
  const [showPerms, setShowPerms]     = useState(null); // staff member id
  const [invite, setInvite]           = useState({ email:"", full_name:"", role:"agent" });
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [roleFilter, setRoleFilter]   = useState("all");

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const [sm, all] = await Promise.all([
      StaffMember.filter({ email: user.email }),
      StaffMember.list(),
    ]);
    setMyStaff(sm[0] || null);
    setStaff(all);
    setLoading(false);
  }

  const role    = myStaff?.role;
  const isAdmin = ["super_admin","admin"].includes(role);

  async function addMember() {
    if (!invite.email || !invite.full_name) return;
    setSaving(true);
    try {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      await StaffMember.create({
        email:       invite.email.toLowerCase().trim(),
        full_name:   invite.full_name.trim(),
        role:        invite.role,
        status:      "invited",
        invited_by:  user.email,
        avatar_color: color,
        is_online:   false,
        permissions: DEFAULT_PERMISSIONS[invite.role] || DEFAULT_PERMISSIONS.agent,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setShowInvite(false); setInvite({ email:"", full_name:"", role:"agent" }); }, 1800);
      await load();
    } catch(e) { console.error(e); }
    setSaving(false);
  }

  async function updateRole(id, newRole) {
    await StaffMember.update(id, { role: newRole, permissions: DEFAULT_PERMISSIONS[newRole] });
    await load();
  }

  async function updatePermission(member, key, val) {
    const perms = { ...(member.permissions || DEFAULT_PERMISSIONS[member.role] || {}), [key]: val };
    await StaffMember.update(member.id, { permissions: perms });
    await load();
  }

  async function removeMember(id) {
    if (!confirm("Remove this person?")) return;
    await StaffMember.delete(id);
    await load();
  }

  const filtered  = roleFilter === "all" ? staff : staff.filter(s=>s.role===roleFilter);
  const onlineCount = staff.filter(s=>s.is_online).length;
  const permsMember = showPerms ? staff.find(s=>s.id===showPerms) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <img src="https://media.base44.com/images/public/6a14ef767988d1ef0baff5aa/883f43554_generated_image.png" alt="TaximizerPro" class="h-8 w-auto" />
            <span className="font-black text-sm">Team & Permissions</span>
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full font-semibold">● {onlineCount} online</span>
          </div>
          {isAdmin && (
            <button onClick={()=>setShowInvite(true)} className="bg-amber-400 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors shadow-sm">
              + Add Member
            </button>
          )}
        </div>
      </nav>

      {/* Permissions Modal */}
      {showPerms && permsMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Permissions</h3>
                <p className="text-sm text-slate-400">{permsMember.full_name || permsMember.email}</p>
              </div>
              <button onClick={()=>setShowPerms(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Role selector */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Role</label>
              <div className="flex flex-wrap gap-2">
                {(permsMember.role === "super_admin" ? ALL_ROLES : STAFF_ROLES.concat(["client"])).map(r => (
                  <button key={r} onClick={()=>updateRole(permsMember.id, r)}
                    disabled={permsMember.role==="super_admin"}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      permsMember.role===r ? "bg-amber-400 border-amber-400 text-white" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-amber-300"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}>
                    {r.replace("_"," ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Permission toggles */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Individual Permissions</label>
              <div className="space-y-2">
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                  const perms = permsMember.permissions || DEFAULT_PERMISSIONS[permsMember.role] || {};
                  const enabled = perms[key] ?? false;
                  return (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-sm text-slate-700">{label}</span>
                      <button
                        onClick={()=>updatePermission(permsMember, key, !enabled)}
                        disabled={permsMember.role==="super_admin"}
                        className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-amber-400" : "bg-slate-200"} disabled:opacity-50`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : ""}`}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
              💡 Clients can view their files but <strong>cannot download</strong> by default. Toggle "Download Files" to grant access.
            </div>

            <button onClick={()=>setShowPerms(null)} className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-white rounded-xl font-black text-sm transition-colors shadow-sm">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800">Add Team Member</h3>
              <button onClick={()=>setShowInvite(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            {saved ? (
              <div className="py-8 text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-emerald-600 font-semibold">Member added!</div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {[["Full Name","full_name","text","Mike Hennigan"],["Email","email","email","mike@example.com"]].map(([lbl,name,type,ph])=>(
                    <div key={name}>
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">{lbl}</label>
                      <input type={type} value={invite[name]} onChange={e=>setInvite(i=>({...i,[name]:e.target.value}))} placeholder={ph}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-amber-400 placeholder-slate-400"/>
                    </div>
                  ))}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">Role</label>
                    <select value={invite.role} onChange={e=>setInvite(i=>({...i,role:e.target.value}))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-amber-400">
                      {STAFF_ROLES.concat(["client"]).map(r=>(
                        <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1).replace("_"," ")}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                    <strong>Client default:</strong> Can view files, send messages. Cannot download. You can adjust permissions after adding.
                  </div>
                </div>
                <button onClick={addMember} disabled={!invite.email||!invite.full_name||saving}
                  className={`w-full py-3 rounded-xl font-black text-sm transition-all shadow-sm ${invite.email&&invite.full_name&&!saving ? "bg-amber-400 hover:bg-amber-500 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                  {saving ? "Adding..." : "Add Member"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Role stats */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {ALL_ROLES.map(r => (
            <button key={r} onClick={()=>setRoleFilter(roleFilter===r?"all":r)}
              className={`border rounded-xl p-3 text-center transition-all ${
                roleFilter===r ? "ring-2 ring-amber-400 " : ""
              } ${ROLE_COLORS[r]}`}>
              <div className="text-xl font-black">{staff.filter(s=>s.role===r).length}</div>
              <div className="text-xs font-semibold mt-0.5 capitalize">{r.replace("_"," ")}</div>
            </button>
          ))}
        </div>

        {/* Staff table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">
              {roleFilter==="all" ? "All Members" : roleFilter.replace("_"," ")}
              <span className="text-slate-400 font-normal text-sm ml-2">({filtered.length})</span>
            </h2>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No members in this category</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                    style={{background: s.avatar_color || "#94a3b8"}}>
                    {(s.full_name||s.email||"?")[0].toUpperCase()}
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${s.is_online ? "bg-emerald-400" : "bg-slate-300"}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{s.full_name || "—"}</div>
                    <div className="text-xs text-slate-400">{s.email}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize hidden sm:block ${ROLE_COLORS[s.role]||"bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {s.role?.replace("_"," ")}
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg hidden sm:block ${s.status==="active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                    {s.status || "invited"}
                  </span>
                  {isAdmin && (
                    <button onClick={()=>setShowPerms(s.id)}
                      className="p-2 hover:bg-amber-50 hover:text-amber-600 text-slate-400 rounded-xl transition-colors" title="Manage permissions">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    </button>
                  )}
                  {isAdmin && s.role!=="super_admin" && s.email!==user?.email && (
                    <button onClick={()=>removeMember(s.id)} className="p-2 hover:bg-red-50 hover:text-red-500 text-slate-300 rounded-xl transition-colors" title="Remove">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Permissions legend */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">Default Permission Levels</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 pr-4 text-slate-400 font-semibold">Permission</th>
                  {ALL_ROLES.map(r=>(
                    <th key={r} className={`text-center py-2 px-2 font-semibold capitalize ${ROLE_COLORS[r].split(" ")[0]}`}>{r.replace("_"," ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(PERMISSION_LABELS).map(([key,label])=>(
                  <tr key={key} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-600 font-medium">{label}</td>
                    {ALL_ROLES.map(r=>(
                      <td key={r} className="text-center py-2 px-2">
                        {DEFAULT_PERMISSIONS[r]?.[key] ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
