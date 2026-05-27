import { useState, useEffect } from "react";
import { TaxClient } from "@/api/entities";
import { useParams, useNavigate, Link } from "react-router-dom";

const MILESTONES = [
  "New Client",
  "Documents Collected",
  "Forms Generated",
  "Client Signed",
  "Submitted to IRS",
  "Funded",
  "Complete"
];

const BACKEND_URL = "https://superagent-0baff5aa.base44.app/functions/fillTaxForm";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => { loadClient(); }, [id]);

  async function loadClient() {
    try {
      const data = await TaxClient.get(id);
      setClient(data);
      setEditForm(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function updateMilestone(step) {
    try {
      await TaxClient.update(id, { current_step: step });
      setClient(prev => ({ ...prev, current_step: step }));
    } catch (e) { console.error(e); }
  }

  async function generateForms() {
    setGenerating(true);
    setGenResult(null);
    try {
      const years = (client.tax_year || "2023").split(",").map(y => y.trim());
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: client.first_name,
          middle_init: client.middle_init,
          last_name: client.last_name,
          ssn: (client.ssn || "").replace(/\D/g, ""),
          address: client.address,
          city: client.city,
          state: client.state,
          zip: client.zip,
          bank_routing: client.bank_routing,
          bank_account: client.bank_account,
          email: client.email,
          tax_years: years,
          signature_url: client.signature_url || null,
        })
      });
      const result = await res.json();
      setGenResult(result);
      if (result.success) {
        await TaxClient.update(id, { current_step: 3, filing_status: "filed" });
        setClient(prev => ({ ...prev, current_step: 3, filing_status: "filed" }));
      }
    } catch (e) {
      setGenResult({ success: false, error: e.message });
    }
    setGenerating(false);
  }

  async function saveEdit() {
    try {
      await TaxClient.update(id, editForm);
      setClient(editForm);
      setEditMode(false);
    } catch (e) { console.error(e); }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-500">Client not found.</p>
    </div>
  );

  const currentStep = Math.round(client.current_step || 1);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/clients")} className="text-slate-400 hover:text-slate-700 text-sm">← Back</button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{client.full_name}</h1>
            <p className="text-xs text-slate-500">{client.email} · {client.tax_year}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditMode(!editMode)}
            className="border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50">
            {editMode ? "Cancel" : "Edit"}
          </button>
          <button onClick={generateForms} disabled={generating}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-colors">
            {generating ? "Generating..." : "Generate Forms"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Milestone Tracker */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Progress</h2>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {MILESTONES.map((m, i) => {
              const done = currentStep > i + 1;
              const active = currentStep === i + 1;
              return (
                <button key={i} onClick={() => updateMilestone(i + 1)}
                  className={`flex flex-col items-center min-w-[80px] p-2 rounded-lg transition-all
                    ${active ? "bg-blue-50 border-2 border-blue-500" : done ? "bg-emerald-50 border border-emerald-200" : "border border-slate-200 hover:bg-slate-50"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
                    ${active ? "bg-blue-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                    {done ? "✓" : i + 1}
                  </div>
                  <p className={`text-xs text-center leading-tight ${active ? "text-blue-700 font-medium" : done ? "text-emerald-700" : "text-slate-500"}`}>
                    {m}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gen Result */}
        {genResult && (
          <div className={`rounded-xl p-4 border ${genResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            {genResult.success ? (
              <div>
                <p className="font-semibold text-emerald-800 text-sm">✅ Forms generated successfully!</p>
                {genResult.folder_url && (
                  <a href={genResult.folder_url} target="_blank" rel="noreferrer" className="text-blue-700 text-sm underline">
                    View in Google Drive →
                  </a>
                )}
              </div>
            ) : (
              <p className="text-red-700 text-sm">❌ Error: {genResult.error || "Unknown error"}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Personal Information</h3>
            {editMode ? (
              <div className="space-y-3">
                {[["first_name","First Name"],["middle_init","M.I."],["last_name","Last Name"],["dob","DOB"],["ssn","SSN"],["email","Email"],["phone","Phone"]].map(([f, l]) => (
                  <div key={f}>
                    <label className="text-xs text-slate-500">{l}</label>
                    <input className="w-full border border-slate-200 rounded px-2 py-1 text-sm mt-0.5"
                      value={editForm[f] || ""} onChange={e => setEditForm(p => ({...p, [f]: e.target.value}))} />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="space-y-2">
                {[["Name", client.full_name],["DOB", client.dob],["SSN", client.ssn ? "•••-••-" + (client.ssn || "").slice(-4) : "—"],["Email", client.email],["Phone", client.phone]].map(([l,v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <dt className="text-slate-500">{l}</dt>
                    <dd className="text-slate-900 font-medium text-right">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Address</h3>
            {editMode ? (
              <div className="space-y-3">
                {[["address","Street"],["city","City"],["state","State"],["zip","ZIP"]].map(([f,l]) => (
                  <div key={f}>
                    <label className="text-xs text-slate-500">{l}</label>
                    <input className="w-full border border-slate-200 rounded px-2 py-1 text-sm mt-0.5"
                      value={editForm[f] || ""} onChange={e => setEditForm(p => ({...p, [f]: e.target.value}))} />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="space-y-2">
                {[["Address", client.address],["City", client.city],["State", client.state],["ZIP", client.zip]].map(([l,v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <dt className="text-slate-500">{l}</dt>
                    <dd className="text-slate-900 font-medium">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Banking */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Bank Information</h3>
            {editMode ? (
              <div className="space-y-3">
                {[["bank_routing","Routing #"],["bank_account","Account #"],["refund_amount","Refund Amount"]].map(([f,l]) => (
                  <div key={f}>
                    <label className="text-xs text-slate-500">{l}</label>
                    <input className="w-full border border-slate-200 rounded px-2 py-1 text-sm mt-0.5"
                      value={editForm[f] || ""} onChange={e => setEditForm(p => ({...p, [f]: e.target.value}))} />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="space-y-2">
                {[["Routing", client.bank_routing ? "•••" + (client.bank_routing || "").slice(-4) : "—"],
                  ["Account", client.bank_account ? "•••" + (client.bank_account || "").slice(-4) : "—"],
                  ["Refund", client.refund_amount ? `$${parseFloat(client.refund_amount).toLocaleString()}` : "—"]].map(([l,v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <dt className="text-slate-500">{l}</dt>
                    <dd className="text-slate-900 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Filing */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Filing Details</h3>
            <dl className="space-y-2">
              {[["Tax Year(s)", client.tax_year],["Status", client.filing_status || "pending"],["IRS Status", client.irs_status || "pending"],["Signature", client.signature_url ? "✅ Signed" : "⚠️ Pending"]].map(([l,v]) => (
                <div key={l} className="flex justify-between text-sm">
                  <dt className="text-slate-500">{l}</dt>
                  <dd className="text-slate-900 font-medium">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {editMode && (
          <div className="flex justify-end">
            <button onClick={saveEdit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-6 py-2 rounded-lg transition-colors">
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
