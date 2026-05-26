import { useState, useEffect } from "react";
import { StaffMember, Notification } from "@/api/entities";
import { useUser } from "@/hooks/useUser";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const ROLE_META = {
  super_admin: { label: "Super Admin", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: "👑" },
  admin:       { label: "Admin",       color: "text-blue-400 bg-blue-400/10 border-blue-400/20",   icon: "⚡" },
  manager:     { label: "Manager",     color: "text-purple-400 bg-purple-400/10 border-purple-400/20", icon: "🎯" },
  agent:       { label: "Agent",       color: "text-green-400 bg-green-400/10 border-green-400/20", icon: "👤" },
};

const STATUS_COLOR = {
  active:   "bg-emerald-500/15 text-emerald-400",
  inactive: "bg-slate-500/15 text-slate-400",
  pending:  "bg-yellow-500/15 text-yellow-400",
};

const AVATAR_COLORS = ["#F59E0B","#3B82F6","#8B5CF6","#10B981","#EF4444","#F97316","#EC4899","#06B6D4"];

function Avatar({ name, color, size = "sm" }) {
  const sz = size === "lg" ? "w-12 h-12 text-base" : "w-8 h-8 text-xs";
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ background: color || "#374151" }}>
      {initials}
    </div>
  );
}

export default function Staff() {
  const { data: user } = useUser();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", role: "agent" });
  const [inviting, setSaving] = useState(false);
  const [editMember, setEditMember] = useState(null);

  const isSuperAdmin = user?.email === "taximizerpro@gmail.com";
  const isAdmin = isSuperAdmin || user?.role === "admin";

  useEffect(() => {
    StaffMember.list().then(s => { setStaff(s); setLoading(false); });
  }, []);

  async function handleInvite(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const newMember = await StaffMember.create({
        ...inviteForm,
        status: "pending",
        avatar_color: color,
        invited_by: user?.email,
        assigned_client_ids: [],
        is_online: false,
      });
      // Notify super admin
      await Notification.create({
        recipient_email: "taximizerpro@gmail.com",
        type: "new_client",
        title: `New staff invited: ${inviteForm.full_name}`,
        body: `${inviteForm.email} was invited as ${inviteForm.role} by ${user?.email}`,
        read: false,
        actor_name: user?.full_name || user?.email,
        actor_email: user?.email,
      });
      setStaff(s => [...s, newMember]);
      setShowInvite(false);
      setInviteForm({ email: "", full_name: "", role: "agent" });
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  }

  async function updateRole(member, newRole) {
    await StaffMember.update(member.id, { role: newRole });
    setStaff(s => s.map(m => m.id === member.id ? { ...m, role: newRole } : m));
  }

  async function updateStatus(member, newStatus) {
    await StaffMember.update(member.id, { status: newStatus });
    setStaff(s => s.map(m => m.id === member.id ? { ...m, status: newStatus } : m));
  }

  const grouped = {
    super_admin: staff.filter(s => s.role === "super_admin"),
    admin:       staff.filter(s => s.role === "admin"),
    manager:     staff.filter(s => s.role === "manager"),
    agent:       staff.filter(s => s.role === "agent"),
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold">Team Management</h1>
              <p className="text-xs text-slate-500">{staff.length} staff members · {staff.filter(s=>s.is_online).length} online now</p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowInvite(true)}
              className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-xl transition-colors">
              + Invite Staff
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0D1F3C] border border-white/15 rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-lg font-bold mb-5">Invite Staff Member</h2>
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input value={inviteForm.full_name} onChange={e => setInviteForm(f=>({...f,full_name:e.target.value}))} required
                    placeholder="Jane Smith"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={inviteForm.email} onChange={e => setInviteForm(f=>({...f,email:e.target.value}))} required
                    placeholder="jane@email.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Role</label>
                  <select value={inviteForm.role} onChange={e => setInviteForm(f=>({...f,role:e.target.value}))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                    {isSuperAdmin && <option value="admin">Admin</option>}
                    <option value="manager">Manager</option>
                    <option value="agent">Agent</option>
                  </select>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-xs text-blue-300">📧 They'll receive a login email. Once they sign up, their status activates automatically.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={inviting}
                    className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A1628] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
                    {inviting ? "Inviting..." : "Send Invite"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Staff by role group */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          Object.entries(grouped).map(([role, members]) => members.length === 0 ? null : (
            <div key={role} className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                <span className="text-lg">{ROLE_META[role].icon}</span>
                <h2 className="font-semibold">{ROLE_META[role].label}s</h2>
                <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{members.length}</span>
              </div>
              <div className="divide-y divide-white/5">
                {members.map(member => (
                  <div key={member.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar name={member.full_name} color={member.avatar_color} />
                        {member.is_online && (
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0D1F3C]" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{member.full_name || "Unnamed"}</div>
                        <div className="text-xs text-slate-500">{member.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${ROLE_META[member.role]?.color}`}>
                        {ROLE_META[member.role]?.label}
                      </span>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[member.status]}`}>
                        {member.status}
                      </span>
                      {/* Super admin can edit anyone; admin can edit manager/agent */}
                      {isAdmin && member.email !== "taximizerpro@gmail.com" && (isSuperAdmin || (member.role !== "super_admin" && member.role !== "admin")) && (
                        <div className="flex gap-2">
                          <select value={member.role} onChange={e => updateRole(member, e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/40 transition-all">
                            {isSuperAdmin && <option value="admin">Admin</option>}
                            <option value="manager">Manager</option>
                            <option value="agent">Agent</option>
                          </select>
                          <button onClick={() => updateStatus(member, member.status === "active" ? "inactive" : "active")}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                              member.status === "active"
                                ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                                : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            }`}>
                            {member.status === "active" ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
