import { useState, useEffect } from "react";
import { ClientMilestone, Client, StaffMember, Notification } from "@/api/entities";
import { useUser } from "@/hooks/useUser";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const MILESTONES = [
  { key: "intake",               label: "Intake",             icon: "📋", desc: "Client info collected" },
  { key: "documents_collected",  label: "Documents",          icon: "📁", desc: "All docs received" },
  { key: "data_entry",           label: "Data Entry",         icon: "⌨️", desc: "Form data entered" },
  { key: "review",               label: "Review",             icon: "🔍", desc: "Manager review" },
  { key: "client_approval",      label: "Client Approval",    icon: "✍️", desc: "Client signs off" },
  { key: "filed",                label: "Filed",              icon: "📤", desc: "Submitted to IRS" },
  { key: "refund_received",      label: "Refund",             icon: "💰", desc: "Refund received" },
];

const MILESTONE_KEYS = MILESTONES.map(m => m.key);

const STATUS_STYLE = {
  pending:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/15 text-red-400 border-red-500/20",
};

function MilestoneProgress({ currentMilestone, status }) {
  const idx = MILESTONE_KEYS.indexOf(currentMilestone);
  return (
    <div className="flex items-center gap-1">
      {MILESTONES.map((m, i) => (
        <div key={m.key} title={m.label}
          className={`h-1.5 flex-1 rounded-full transition-all ${
            i < idx ? "bg-emerald-500"
            : i === idx ? (status === "rejected" ? "bg-red-500" : status === "approved" ? "bg-emerald-500" : "bg-amber-400")
            : "bg-white/10"
          }`} />
      ))}
    </div>
  );
}

export default function Tracker() {
  const { data: user } = useUser();
  const [milestones, setMilestones] = useState([]);
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ client_id: "", tax_year: 2025, milestone: "intake", assigned_agent: "", assigned_manager: "" });
  const [saving, setSaving] = useState(false);
  const [actionTarget, setActionTarget] = useState(null); // { milestone, action }

  const isSuperAdmin = user?.email === "taximizerpro@gmail.com";
  const isAdmin = isSuperAdmin || user?.role === "admin";
  const isManager = isAdmin || user?.role === "manager";

  useEffect(() => {
    Promise.all([ClientMilestone.list(), Client.list(), StaffMember.list()]).then(([m, c, s]) => {
      setMilestones(m);
      setClients(c);
      setStaff(s);
      setLoading(false);
    });
    const iv = setInterval(() => ClientMilestone.list().then(setMilestones), 15000);
    return () => clearInterval(iv);
  }, []);

  async function addMilestone(e) {
    e.preventDefault();
    setSaving(true);
    const client = clients.find(c => c.id === addForm.client_id);
    try {
      const m = await ClientMilestone.create({
        ...addForm,
        client_name: client ? `${client.first_name} ${client.last_name}` : "",
        status: "pending",
      });
      setMilestones(prev => [...prev, m]);
      // Notify manager
      if (addForm.assigned_manager) {
        const mgr = staff.find(s => s.id === addForm.assigned_manager);
        if (mgr) await Notification.create({
          recipient_email: mgr.email,
          type: "client_assigned",
          title: "New tracker entry assigned",
          body: `${client?.first_name} ${client?.last_name} — ${addForm.tax_year} assigned to you`,
          read: false,
          actor_name: user?.full_name || user?.email,
          actor_email: user?.email,
        });
      }
      setShowAdd(false);
    } catch (err) { alert(err.message); }
    setSaving(false);
  }

  async function advanceMilestone(m) {
    const idx = MILESTONE_KEYS.indexOf(m.milestone);
    if (idx >= MILESTONE_KEYS.length - 1) return;
    const next = MILESTONE_KEYS[idx + 1];
    const updated = await ClientMilestone.update(m.id, {
      milestone: next,
      status: "pending",
      approved_by: user?.email,
      approved_at: new Date().toISOString(),
    });
    setMilestones(prev => prev.map(x => x.id === m.id ? updated : x));
    // Notify super admin
    await Notification.create({
      recipient_email: "taximizerpro@gmail.com",
      type: "milestone_approval",
      title: `${m.client_name} advanced to ${next}`,
      body: `Moved from ${m.milestone} → ${next} by ${user?.full_name || user?.email}`,
      read: false,
      actor_name: user?.full_name || user?.email,
      actor_email: user?.email,
    });
  }

  async function approveMilestone(m) {
    const updated = await ClientMilestone.update(m.id, {
      status: "approved",
      approved_by: user?.email,
      approved_at: new Date().toISOString(),
    });
    setMilestones(prev => prev.map(x => x.id === m.id ? updated : x));
  }

  async function rejectMilestone(m, notes) {
    const updated = await ClientMilestone.update(m.id, { status: "rejected", notes });
    setMilestones(prev => prev.map(x => x.id === m.id ? updated : x));
    // Notify assigned agent
    if (m.assigned_agent) {
      const agent = staff.find(s => s.id === m.assigned_agent);
      if (agent) await Notification.create({
        recipient_email: agent.email,
        type: "milestone_rejected",
        title: `${m.client_name} — milestone rejected`,
        body: notes || "Milestone was rejected. Please review.",
        read: false,
        actor_name: user?.full_name || user?.email,
        actor_email: user?.email,
      });
    }
  }

  const filtered = milestones.filter(m => {
    if (filter === "pending") return m.status === "pending";
    if (filter === "needs_approval") return m.status === "pending" && m.milestone !== "intake";
    if (filter === "complete") return m.milestone === "refund_received" && m.status === "approved";
    return true;
  });

  const needsApproval = milestones.filter(m => m.status === "pending" && isManager).length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Dashboard")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold">Client Tracker</h1>
              <p className="text-xs text-slate-500">Milestone-based progress · {milestones.length} active cases</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {needsApproval > 0 && (
              <button onClick={() => setFilter("needs_approval")}
                className="flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 text-amber-400 text-xs font-semibold px-3 py-2 rounded-xl animate-pulse">
                ⚡ {needsApproval} need approval
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowAdd(true)}
                className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-4 py-2 rounded-xl transition-colors">
                + Add to Tracker
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Milestone pipeline header */}
        <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Filing Pipeline</p>
          <div className="grid grid-cols-7 gap-2">
            {MILESTONES.map((m, i) => {
              const count = milestones.filter(x => x.milestone === m.key).length;
              return (
                <div key={m.key} className="text-center">
                  <div className="text-xl mb-1">{m.icon}</div>
                  <div className="text-xs font-medium text-white truncate">{m.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", label: "All Cases" },
            { key: "pending", label: "In Progress" },
            { key: "needs_approval", label: "Needs Approval" },
            { key: "complete", label: "Complete" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filter === f.key ? "bg-amber-400 text-[#0A1628]" : "bg-white/5 text-slate-400 hover:text-white border border-white/10"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Cases */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl py-16 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-slate-400">No cases in this view</p>
            {isAdmin && <button onClick={() => setShowAdd(true)} className="mt-3 text-amber-400 text-sm font-medium hover:text-amber-300">Add first case →</button>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(m => {
              const milestoneIdx = MILESTONE_KEYS.indexOf(m.milestone);
              const milestoneMeta = MILESTONES[milestoneIdx];
              const agent = staff.find(s => s.id === m.assigned_agent);
              const manager = staff.find(s => s.id === m.assigned_manager);
              const canApprove = isManager && m.status === "pending";
              const canAdvance = isAdmin && m.status === "approved" && milestoneIdx < MILESTONE_KEYS.length - 1;

              return (
                <div key={m.id} className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5 hover:border-amber-400/20 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{milestoneMeta?.icon}</span>
                      <div>
                        <div className="font-semibold">{m.client_name}</div>
                        <div className="text-xs text-slate-500">Tax Year {m.tax_year} · {milestoneMeta?.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLE[m.status]}`}>
                        {m.status}
                      </span>
                    </div>
                  </div>

                  <MilestoneProgress currentMilestone={m.milestone} status={m.status} />

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {agent && <span>👤 Agent: <span className="text-slate-300">{agent.full_name}</span></span>}
                      {manager && <span>🎯 Manager: <span className="text-slate-300">{manager.full_name}</span></span>}
                      {m.notes && <span className="text-red-400">⚠️ {m.notes.slice(0, 40)}...</span>}
                    </div>
                    <div className="flex gap-2">
                      {canApprove && (
                        <>
                          <button onClick={() => approveMilestone(m)}
                            className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            ✓ Approve
                          </button>
                          <button onClick={() => {
                            const notes = prompt("Rejection reason (optional):");
                            rejectMilestone(m, notes || "Needs correction");
                          }}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            ✗ Reject
                          </button>
                        </>
                      )}
                      {canAdvance && (
                        <button onClick={() => advanceMilestone(m)}
                          className="bg-amber-400/15 hover:bg-amber-400/25 text-amber-400 border border-amber-400/20 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                          → Advance Stage
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add to Tracker Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border border-white/15 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-5">Add to Tracker</h2>
            <form onSubmit={addMilestone} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Client</label>
                <select value={addForm.client_id} onChange={e => setAddForm(f=>({...f,client_id:e.target.value}))} required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Tax Year</label>
                  <select value={addForm.tax_year} onChange={e => setAddForm(f=>({...f,tax_year:parseInt(e.target.value)}))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                    <option value={2023}>2023</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Start Stage</label>
                  <select value={addForm.milestone} onChange={e => setAddForm(f=>({...f,milestone:e.target.value}))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                    {MILESTONES.map(m => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Assign Agent</label>
                <select value={addForm.assigned_agent} onChange={e => setAddForm(f=>({...f,assigned_agent:e.target.value}))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                  <option value="">No agent</option>
                  {staff.filter(s=>s.role==="agent"||s.role==="manager").map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Assign Manager</label>
                <select value={addForm.assigned_manager} onChange={e => setAddForm(f=>({...f,assigned_manager:e.target.value}))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                  <option value="">No manager</option>
                  {staff.filter(s=>s.role==="manager"||s.role==="admin"||s.role==="super_admin").map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A1628] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
                  {saving ? "Adding..." : "Add Case"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
