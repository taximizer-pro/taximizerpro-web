import { useState, useEffect } from "react";
import { StaffMember } from "@/api/entities";

const ROLE_COLORS = {
  "Super Admin": "bg-purple-100 text-purple-800",
  "Admin": "bg-blue-100 text-blue-800",
  "Manager": "bg-teal-100 text-teal-800",
  "Agent": "bg-slate-100 text-slate-700",
};

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", role: "Agent" });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStaff(); }, []);

  async function loadStaff() {
    try {
      const data = await StaffMember.list();
      setStaff(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function sendInvite() {
    try {
      const colors = ["blue","green","purple","teal","orange","red","indigo","pink"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      await StaffMember.create({
        ...inviteForm,
        status: "invited",
        avatar_color: color,
        invited_by: "taximizerpro@gmail.com",
      });
      setInviteForm({ email: "", full_name: "", role: "Agent" });
      setShowInvite(false);
      loadStaff();
    } catch (e) { console.error(e); }
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
          <h1 className="text-lg font-bold text-slate-900">Staff</h1>
          <p className="text-xs text-slate-500">{staff.length} team members</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          + Invite Staff
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {/* Hardcoded admins always visible */}
        {[
          { full_name: "Italy", email: "taximizerpro@gmail.com", role: "Super Admin", status: "active" },
          { full_name: "Mike Hennigan", email: "Mike.hennigan44@gmail.com", role: "Admin", status: "active" },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center`}>
                <span className="text-white text-sm font-semibold">{m.full_name[0]}</span>
              </div>
              <div>
                <p className="font-medium text-slate-900 text-sm">{m.full_name}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[m.role]}`}>{m.role}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
            </div>
          </div>
        ))}

        {/* Dynamic staff */}
        {staff.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-${m.avatar_color || "slate"}-500 flex items-center justify-center`}>
                <span className="text-white text-sm font-semibold">{(m.full_name || m.email)?.[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="font-medium text-slate-900 text-sm">{m.full_name || m.email}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[m.role] || ROLE_COLORS.Agent}`}>{m.role}</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {m.status}
              </span>
            </div>
          </div>
        ))}

        {staff.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            No staff members yet. Invite your first team member above.
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Invite Staff Member</h2>
            <div>
              <label className="text-xs font-medium text-slate-600">Full Name</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inviteForm.full_name} onChange={e => setInviteForm(p => ({...p, full_name: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inviteForm.email} onChange={e => setInviteForm(p => ({...p, email: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Role</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inviteForm.role} onChange={e => setInviteForm(p => ({...p, role: e.target.value}))}>
                <option>Manager</option>
                <option>Agent</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowInvite(false)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
              <button onClick={sendInvite} className="bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-800">Send Invite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
