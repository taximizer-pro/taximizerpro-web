import { useState, useEffect } from "react";
import { ClientMilestone } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";
import { SignaturePad } from "./SignaturePage";

const MILESTONES = [
  "Documents Received",
  "Under Review",
  "Ready for Signature",
  "Filed",
  "Refund Pending",
  "Funded",
  "Complete",
];

const MILESTONE_ICONS = {
  "Documents Received": "📥",
  "Under Review": "🔍",
  "Ready for Signature": "✍️",
  "Filed": "📤",
  "Refund Pending": "⏳",
  "Funded": "💰",
  "Complete": "✅",
};

const STATUS_STYLE = {
  approved: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  pending:  "bg-amber-400/10 text-amber-400 border-amber-400/20",
  rejected: "bg-red-400/10 text-red-400 border-red-400/20",
};

export default function ClientDetail() {
  const { data: user } = useUser();
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSig, setShowSig] = useState(false);
  const [sigMode, setSigMode] = useState("admin"); // "admin" | "send"
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState("");
  const [activeYear, setActiveYear] = useState(null);
  const [updatingMs, setUpdatingMs] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sigStatus, setSigStatus] = useState(null); // null | "signed" | "pending"

  const clientId = new URLSearchParams(window.location.search).get("id");

  useEffect(() => {
    if (!clientId) return;
    ClientMilestone.filter({ client_id: clientId }).then(ms => {
      setMilestones(ms);
      if (ms.length > 0 && !activeYear) setActiveYear(ms[0].tax_year);
      // Check if signature already exists
      try {
        const notes = JSON.parse(ms[0]?.notes || "{}");
        if (notes.client_signature) setSigStatus("signed");
      } catch {}
      setLoading(false);
    });
  }, [clientId]);

  const clientName = milestones[0]?.client_name || "Client";
  const clientData = (() => { try { return JSON.parse(milestones[0]?.notes || "{}"); } catch { return {}; } })();
  const years = [...new Set(milestones.map(m => m.tax_year))].sort((a,b)=>b-a);
  const yearMilestones = milestones.filter(m => m.tax_year === activeYear);
  const currentMilestone = yearMilestones.sort((a,b) => MILESTONES.indexOf(b.milestone) - MILESTONES.indexOf(a.milestone))[0];
  const currentMsIndex = MILESTONES.indexOf(currentMilestone?.milestone);

  // Build shareable signature link for the client
  const signatureLink = `${window.location.origin}${createPageUrl("SignaturePage")}?id=${clientId}&name=${encodeURIComponent(clientName)}`;

  function copySignatureLink() {
    navigator.clipboard.writeText(signatureLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  async function advanceMilestone(yr) {
    if (!currentMilestone) return;
    const nextIdx = Math.min(currentMsIndex + 1, MILESTONES.length - 1);
    setUpdatingMs(yr);
    try {
      await ClientMilestone.create({
        client_id: clientId,
        client_name: clientName,
        tax_year: yr,
        milestone: MILESTONES[nextIdx],
        status: "approved",
        assigned_agent: user?.email,
        notes: milestones[0]?.notes || ""
      });
      const ms = await ClientMilestone.filter({ client_id: clientId });
      setMilestones(ms);
    } catch(e) { console.error(e); }
    setUpdatingMs(null);
  }

  async function saveAdminSignature(sigDataUrl) {
    setShowSig(false);
    // Save signature to notes then generate forms
    try {
      let notes = {};
      try { notes = JSON.parse(milestones[0]?.notes || "{}"); } catch {}
      notes.client_signature = sigDataUrl;
      notes.signed_at = new Date().toISOString();
      notes.signed_by = "admin_in_person";
      const notesStr = JSON.stringify(notes);
      await Promise.all(milestones.map(m => ClientMilestone.update(m.id, { notes: notesStr })));
      setSigStatus("signed");
      // Now generate forms
      await generateForms(sigDataUrl, notesStr);
    } catch(e) {
      setGenError("Signature saved but form generation failed: " + e.message);
    }
  }

  async function generateForms(sigDataUrl, updatedNotes) {
    setGenerating(true);
    setGenError("");
    try {
      const nameParts = clientName.trim().split(/\s+/);
      const client = {
        first_name: nameParts[0] || "",
        middle_init: nameParts.length > 2 ? nameParts[1] : "",
        last_name: nameParts[nameParts.length - 1] || "",
        ssn: clientData.ssn || "",
        address: clientData.address || "",
        city: clientData.city || "",
        state: clientData.state || "",
        zip: clientData.zip || "",
        routing: clientData.routing || clientData.bank_routing || "",
        account: clientData.account || clientData.bank_account || "",
      };

      const resp = await fetch("https://superagent-0baff5aa.base44.app/functions/generateTaxForms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, years: years.map(String) }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Generation failed");
      setGenResult(data);

      // Advance milestone to "Filed"
      await ClientMilestone.create({
        client_id: clientId,
        client_name: clientName,
        tax_year: activeYear,
        milestone: "Filed",
        status: "approved",
        assigned_agent: user?.email,
        notes: updatedNotes || milestones[0]?.notes || "",
      });
      const ms = await ClientMilestone.filter({ client_id: clientId });
      setMilestones(ms);
    } catch(e) {
      setGenError(e.message || "Form generation failed. Please try again.");
    }
    setGenerating(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Admin Signature Modal */}
      {showSig && (
        <SignaturePad
          onSave={saveAdminSignature}
          onClose={() => setShowSig(false)}
          clientName={clientName}
          label="Capture Client Signature"
        />
      )}

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Clients")} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/20 flex items-center justify-center text-amber-400 font-black text-sm flex-shrink-0">
              {clientName.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
            </div>
            <span className="font-bold text-slate-800 truncate">{clientName}</span>
          </div>
          {sigStatus === "signed" && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 flex-shrink-0">
              ✓ Signed
            </span>
          )}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Year tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {years.map(y => (
            <button key={y} onClick={() => setActiveYear(y)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm border transition-all ${
                activeYear === y ? "bg-amber-400 border-amber-400 text-[#080F1E]" : "bg-white border-slate-200 text-slate-400 hover:border-amber-400/30"
              }`}>{y} Tax Year</button>
          ))}
        </div>

        {/* ── SIGNATURE SECTION ─────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">✍️</span>
              <h2 className="font-bold text-slate-800">Signature</h2>
            </div>
            {sigStatus === "signed" && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                ✓ Signature on file
              </span>
            )}
          </div>

          {sigStatus === "signed" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                Signature captured {clientData.signed_at ? `on ${new Date(clientData.signed_at).toLocaleDateString()}` : ""}.
                {clientData.signed_by === "admin_in_person" ? " Signed in person." : " Signed via client portal."}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowSig(true)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-100 text-slate-300 rounded-xl text-sm font-semibold border border-slate-200 hover:border-slate-300 transition-all"
                >
                  🔄 Re-capture Signature
                </button>
                <button
                  onClick={() => { setGenerating(true); generateForms(clientData.client_signature); }}
                  disabled={generating}
                  className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-300 text-[#080F1E] rounded-xl text-sm font-black transition-all disabled:opacity-50"
                >
                  {generating ? "Generating..." : "📄 Generate 1040s"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">No signature on file yet. Choose how to collect it:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option A: Sign in person */}
                <button
                  onClick={() => setShowSig(true)}
                  className="flex flex-col items-start gap-2 p-4 bg-slate-800 hover:bg-slate-100 border border-slate-200 hover:border-amber-400/30 rounded-xl text-left transition-all group"
                >
                  <span className="text-2xl">📱</span>
                  <div>
                    <div className="font-bold text-slate-800 text-sm group-hover:text-amber-400 transition-colors">Sign In Person</div>
                    <div className="text-xs text-slate-500 mt-0.5">Hand device to client to sign now</div>
                  </div>
                </button>

                {/* Option B: Send link */}
                <button
                  onClick={copySignatureLink}
                  className="flex flex-col items-start gap-2 p-4 bg-slate-800 hover:bg-slate-100 border border-slate-200 hover:border-amber-400/30 rounded-xl text-left transition-all group"
                >
                  <span className="text-2xl">{linkCopied ? "✅" : "🔗"}</span>
                  <div>
                    <div className="font-bold text-slate-800 text-sm group-hover:text-amber-400 transition-colors">
                      {linkCopied ? "Link Copied!" : "Send Signature Link"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Copy link for client to sign remotely</div>
                  </div>
                </button>
              </div>

              {/* Show the link so admin can also text/email it */}
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
                <span className="text-xs text-slate-500 truncate flex-1">{signatureLink}</span>
                <button onClick={copySignatureLink} className="text-xs font-bold text-amber-400 hover:text-amber-300 flex-shrink-0 transition-colors">
                  {linkCopied ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── FORM GENERATION RESULT ───────────────────────── */}
        {genResult && (
          <div className="bg-emerald-400/5 border border-emerald-400/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <h3 className="font-bold text-emerald-400">Forms Generated</h3>
            </div>
            <p className="text-sm text-slate-400">Saved to Drive: <span className="text-white font-medium">{genResult.folder}</span></p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(genResult.links || {}).map(([yr, url]) => (
                <a key={yr} href={url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/20 rounded-xl text-xs font-bold text-emerald-400 transition-colors">
                  📄 {yr} 1040 →
                </a>
              ))}
            </div>
          </div>
        )}

        {genError && (
          <div className="bg-red-400/5 border border-red-400/20 rounded-2xl p-4 text-sm text-red-400">
            ⚠️ {genError}
          </div>
        )}

        {generating && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
            <div>
              <div className="text-sm font-bold text-slate-800">Generating 1040s...</div>
              <div className="text-xs text-slate-500 mt-0.5">Filling forms for all tax years and uploading to Drive</div>
            </div>
          </div>
        )}

        {/* ── MILESTONE TRACKER ────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-800">Progress — {activeYear}</h2>
            {currentMilestone && currentMsIndex < MILESTONES.length - 1 && (
              <button onClick={() => advanceMilestone(activeYear)} disabled={!!updatingMs}
                className="text-xs font-bold px-3 py-2 bg-amber-400 hover:bg-amber-300 text-[#080F1E] rounded-xl transition-colors disabled:opacity-50">
                {updatingMs ? "Updating..." : `→ ${MILESTONES[currentMsIndex+1]}`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {MILESTONES.map((ms, i) => {
              const reached = i <= currentMsIndex;
              const isCurrent = i === currentMsIndex;
              return (
                <div key={ms} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  isCurrent ? "bg-amber-400/10 border border-amber-400/20" : reached ? "opacity-70" : "opacity-30"
                }`}>
                  <span className="text-xl">{MILESTONE_ICONS[ms]}</span>
                  <span className={`text-sm font-medium ${isCurrent ? "text-amber-400" : reached ? "text-white" : "text-slate-500"}`}>{ms}</span>
                  {isCurrent && <span className="ml-auto text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Current</span>}
                  {reached && !isCurrent && <span className="ml-auto text-xs text-emerald-400">✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CLIENT INFO ──────────────────────────────────── */}
        {Object.keys(clientData).length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-slate-800">Client Info</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ["SSN", clientData.ssn ? "***-**-" + String(clientData.ssn).slice(-4) : "—"],
                ["Address", clientData.address || "—"],
                ["City", clientData.city || "—"],
                ["State", clientData.state || "—"],
                ["ZIP", clientData.zip || "—"],
                ["Routing", clientData.routing ? "****" + String(clientData.routing).slice(-4) : "—"],
                ["Account", clientData.account ? "****" + String(clientData.account).slice(-4) : "—"],
              ].map(([label, val]) => (
                <div key={label} className="space-y-0.5">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm text-white font-medium truncate">{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
