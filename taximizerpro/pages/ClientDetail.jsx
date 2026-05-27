import { useState, useEffect, useRef } from "react";
import { ClientMilestone } from "@/api/entities";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

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

// Signature Pad
function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const lastPos = useRef(null);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function start(e) { e.preventDefault(); lastPos.current = getPos(e, canvasRef.current); setDrawing(true); }
  function move(e) {
    e.preventDefault();
    if (!drawing) return;
    const c = canvasRef.current, ctx = c.getContext("2d");
    const pos = getPos(e, c);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke();
    lastPos.current = pos; setHasData(true);
  }
  function end(e) { e.preventDefault(); setDrawing(false); }
  function clear() { canvasRef.current.getContext("2d").clearRect(0,0,600,150); setHasData(false); }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0D1628] border border-white/10 rounded-2xl p-6 w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white">Client Signature</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
        </div>
        <p className="text-sm text-slate-400">Have the client sign in the box below:</p>
        <div className="border-2 border-dashed border-white/20 rounded-xl bg-white touch-none" style={{height:150}}>
          <canvas ref={canvasRef} width={560} height={150}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            className="w-full h-full cursor-crosshair"/>
        </div>
        <div className="flex gap-3">
          <button onClick={clear} className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-sm transition-colors">Clear</button>
          <button disabled={!hasData} onClick={() => onSave(canvasRef.current.toDataURL("image/png"))}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${hasData ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E]" : "bg-white/10 text-slate-500 cursor-not-allowed"}`}>
            ✓ Confirm Signature
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { data: user } = useUser();
  const navigate = useNavigate();
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSig, setShowSig] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState("");
  const [activeYear, setActiveYear] = useState(null);
  const [updatingMs, setUpdatingMs] = useState(null);

  const clientId = new URLSearchParams(window.location.search).get("id");

  useEffect(() => {
    if (!clientId) return;
    ClientMilestone.filter({ client_id: clientId }).then(ms => {
      setMilestones(ms);
      if (ms.length > 0 && !activeYear) setActiveYear(ms[0].tax_year);
      setLoading(false);
    });
  }, [clientId]);

  const clientName = milestones[0]?.client_name || "Client";
  const clientData = milestones[0]?.notes ? (() => { try { return JSON.parse(milestones[0].notes); } catch { return {}; } })() : {};
  const years = [...new Set(milestones.map(m => m.tax_year))].sort((a,b)=>b-a);
  const yearMilestones = milestones.filter(m => m.tax_year === activeYear);
  const currentMilestone = yearMilestones.sort((a,b) => MILESTONES.indexOf(b.milestone) - MILESTONES.indexOf(a.milestone))[0];
  const currentMsIndex = MILESTONES.indexOf(currentMilestone?.milestone);

  async function advanceMilestone(yr) {
    if (!currentMilestone) return;
    const nextIdx = Math.min(currentMsIndex + 1, MILESTONES.length - 1);
    const nextMs = MILESTONES[nextIdx];
    setUpdatingMs(yr);
    try {
      await ClientMilestone.create({
        client_id: clientId,
        client_name: clientName,
        tax_year: yr,
        milestone: nextMs,
        status: "approved",
        assigned_agent: user?.email,
        notes: milestones[0]?.notes || ""
      });
      const ms = await ClientMilestone.filter({ client_id: clientId });
      setMilestones(ms);
    } catch(e) { console.error(e); }
    setUpdatingMs(null);
  }

  async function generateForms(sigDataUrl) {
    setShowSig(false);
    setGenerating(true);
    setGenError("");
    try {
      const nameParts = clientName.split(" ");
      const client = {
        first_name: nameParts[0] || "",
        middle_init: nameParts.length > 2 ? nameParts[1] : "",
        last_name: nameParts[nameParts.length-1] || "",
        ssn: clientData.ssn || "",
        address: clientData.address || "",
        city: clientData.city || "",
        state: clientData.state || "",
        zip: clientData.zip || "",
        routing: clientData.routing || "",
        account: clientData.account || "",
      };

      const resp = await fetch("https://superagent-0baff5aa.base44.app/functions/generateTaxForms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, years: years.map(String) })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Generation failed");
      setGenResult(data);
    } catch(e) {
      setGenError(e.message || "Generation failed. Please try again.");
    }
    setGenerating(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#080F1E] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      {showSig && <SignaturePad onSave={generateForms} onClose={() => setShowSig(false)} />}

      <nav className="sticky top-0 z-40 bg-[#080F1E]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Clients")} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/20 flex items-center justify-center text-amber-400 font-black text-sm flex-shrink-0">
              {clientName.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
            </div>
            <span className="font-bold text-white truncate">{clientName}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Year tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {years.map(y => (
            <button key={y} onClick={() => setActiveYear(y)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm border transition-all ${
                activeYear === y ? "bg-amber-400 border-amber-400 text-[#080F1E]" : "bg-[#0D1628] border-white/10 text-slate-400 hover:border-amber-400/30"
              }`}>{y} Tax Year</button>
          ))}
        </div>

        {/* Milestone tracker */}
        <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-white">Progress — {activeYear}</h2>
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
                <div key={ms} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isCurrent ? "bg-amber-400/10 border border-amber-400/20" : reached ? "opacity-70" : "opacity-30"}`}>
                  <span className="text-xl">{MILESTONE_ICONS[ms]}</span>
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${isCurrent ? "text-amber-400" : reached ? "text-white" : "text-slate-500"}`}>{ms}</div>
                  </div>
                  {reached && <span className={`text-xs font-bold ${isCurrent ? "text-amber-400" : "text-emerald-400"}`}>{isCurrent ? "CURRENT" : "✓"}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Generate Forms */}
        <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-5">
          <h2 className="font-bold text-white mb-3">Tax Forms</h2>
          {genResult ? (
            <div className="space-y-3">
              <div className="text-sm text-emerald-400 font-semibold">✅ Forms generated successfully!</div>
              {Object.entries(genResult.links || {}).map(([yr, link]) => (
                <a key={yr} href={link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-amber-400/10 border border-white/10 hover:border-amber-400/20 rounded-xl transition-all text-sm text-slate-300 hover:text-white">
                  📄 {yr} Form 1040
                  <svg className="w-4 h-4 ml-auto text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              ))}
              <button onClick={() => setGenResult(null)} className="text-xs text-slate-500 hover:text-white transition-colors mt-1">Regenerate</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Generate IRS 1040 forms for {years.join(", ")} and upload to Google Drive.</p>
              {genError && <p className="text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-3">{genError}</p>}
              <button onClick={() => setShowSig(true)} disabled={generating}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${generating ? "bg-white/10 text-slate-500 cursor-not-allowed" : "bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#080F1E]"}`}>
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#080F1E] border-t-transparent rounded-full animate-spin"/>
                    Generating Forms...
                  </span>
                ) : "✍️ Sign & Generate 1040s"}
              </button>
            </div>
          )}
        </div>

        {/* Client Info */}
        <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-5">
          <h2 className="font-bold text-white mb-4">Client Information</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              { label: "Full Name", value: clientName },
              { label: "SSN", value: clientData.ssn ? `•••-••-${String(clientData.ssn).slice(-4)}` : "—" },
              { label: "Email", value: clientData.email || "—" },
              { label: "Phone", value: clientData.phone || "—" },
              { label: "Address", value: clientData.address ? `${clientData.address}, ${clientData.city}, ${clientData.state} ${clientData.zip}` : "—" },
              { label: "Routing #", value: clientData.routing || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/[0.03] rounded-xl px-4 py-3">
                <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">{label}</div>
                <div className="text-white font-medium">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
