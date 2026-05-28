import { useState, useEffect, useRef } from "react";
import { TaxClient } from "@/api/entities";
import { useParams, useNavigate } from "react-router-dom";


const MILESTONES = [
  "New Client",
  "Documents Collected",
  "Forms Generated",
  "Client Signed",
  "Submitted to IRS",
  "Funded",
  "Complete"
];

// ── Inline Signature Pad ──────────────────────────────────────────────────────
function SignaturePad({ clientName, onSave, onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e) { e.preventDefault(); lastPos.current = getPos(e); setDrawing(true); }

  function draw(e) {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHasData(true);
  }

  function endDraw(e) { e.preventDefault(); setDrawing(false); }

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasData(false);
  }

  function save() {
    if (!hasData) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Client Signature</h3>
            {clientName && <p className="text-sm text-slate-500 mt-0.5">{clientName}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">✕</button>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
          ✍️ Have the client sign below using finger or mouse. This signature will be placed on all generated tax forms.
        </div>

        {/* Canvas */}
        <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white touch-none" style={{ height: 160 }}>
          <canvas
            ref={canvasRef}
            width={580}
            height={160}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
            className="w-full h-full cursor-crosshair"
          />
          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-slate-300 text-sm font-medium">Sign here</span>
            </div>
          )}
          <div className="absolute bottom-6 left-8 right-8 border-b border-slate-300 pointer-events-none" />
          <div className="absolute bottom-2 left-8 text-xs text-slate-400 pointer-events-none">X</div>
        </div>

        <div className="flex gap-3">
          <button onClick={clearPad} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold">
            Clear
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold">
            Cancel
          </button>
          <button
            disabled={!hasData}
            onClick={save}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${hasData ? "bg-blue-700 hover:bg-blue-800 text-white shadow" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
          >
            ✓ Confirm & Generate Forms
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showSigPad, setShowSigPad] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

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

  // Called when admin confirms signature — runs generation immediately
  async function handleSignatureAndGenerate(signatureDataUrl) {
    setShowSigPad(false);
    setGenerating(true);
    setGenResult(null);
    setStatusMsg("Saving signature...");

    try {
      // 1. Save signature to entity
      await TaxClient.update(id, {
        signature_url: signatureDataUrl,
        current_step: 4
      });
      setClient(prev => ({ ...prev, signature_url: signatureDataUrl, current_step: 4 }));

      // Call Base44 backend function
      setStatusMsg("Generating tax forms...");
      const res = await fetch("/api/functions/generateTaxForms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id })
      });

      const result = await res.json();

      if (result.ok) {
        await TaxClient.update(id, { filing_status: "filed", current_step: 5 });
        setClient(prev => ({ ...prev, filing_status: "filed", current_step: 5 }));
        setGenResult({ success: true, links: result.links, folder_url: result.folderUrl });
        setStatusMsg("");
      } else {
        setGenResult({ success: false, error: result.error || "Generation failed" });
        setStatusMsg("");
      }
    } catch (e) {
      setGenResult({ success: false, error: e.message });
      setStatusMsg("");
    }
    setGenerating(false);
  }

  // Generate without signature (admin override)
  async function generateWithoutSignature() {
    setGenerating(true);
    setGenResult(null);
    setStatusMsg("Generating tax forms...");

    try {
      const res = await fetch("/api/functions/generateTaxForms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id })
      });

      const result = await res.json();
      if (result.ok) {
        await TaxClient.update(id, { filing_status: "filed", current_step: 3 });
        setClient(prev => ({ ...prev, filing_status: "filed", current_step: 3 }));
        setGenResult({ success: true, links: result.links, folder_url: result.folderUrl });
      } else {
        setGenResult({ success: false, error: result.error || "Generation failed" });
      }
    } catch (e) {
      setGenResult({ success: false, error: e.message });
    }
    setStatusMsg("");
    setGenerating(false);
  }

  async function saveEdit() {
    try {
      await TaxClient.update(id, editForm);
      setClient(editForm);
      setEditMode(false);
    } catch (e) { console.error(e); }
  }

  // Build shareable client signature link
  function getSignatureLink() {
    const base = window.location.origin;
    const name = encodeURIComponent(client?.full_name || client?.first_name || "Client");
    return `${base}/SignaturePage?id=${id}&name=${name}`;
  }

  async function copySignatureLink() {
    try {
      await navigator.clipboard.writeText(getSignatureLink());
      setStatusMsg("Link copied to clipboard!");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch { setStatusMsg("Copy failed — see console"); }
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

      {/* Signature Pad Modal */}
      {showSigPad && (
        <SignaturePad
          clientName={client.full_name || `${client.first_name} ${client.last_name}`}
          onSave={handleSignatureAndGenerate}
          onClose={() => setShowSigPad(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/clients")} className="text-slate-400 hover:text-slate-700 text-sm">← Back</button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{client.full_name || `${client.first_name} ${client.last_name}`}</h1>
            <p className="text-xs text-slate-500">{client.email} · Tax Year: {client.tax_year}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={copySignatureLink}
            className="border border-slate-200 text-slate-700 text-xs font-medium px-3 py-2 rounded-lg hover:bg-slate-50">
            📋 Copy Client Signature Link
          </button>
          <button onClick={() => setEditMode(!editMode)}
            className="border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50">
            {editMode ? "Cancel" : "Edit"}
          </button>
          {editMode && (
            <button onClick={saveEdit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              Save
            </button>
          )}
          <button onClick={() => setShowSigPad(true)} disabled={generating}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-colors">
            ✍️ Sign & Generate
          </button>
          <button onClick={generateWithoutSignature} disabled={generating}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-colors">
            {generating ? (statusMsg || "Working...") : "Generate (No Sig)"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Status message */}
        {statusMsg && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 font-medium">
            ⏳ {statusMsg}
          </div>
        )}

        {/* Generation Result */}
        {genResult && (
          <div className={`rounded-xl p-4 border ${genResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            {genResult.success ? (
              <div className="space-y-2">
                <p className="font-semibold text-emerald-800 text-sm">✅ Forms generated successfully!</p>
                {genResult.folder_url && (
                  <a href={genResult.folder_url} target="_blank" rel="noreferrer"
                    className="text-blue-700 text-sm underline block">
                    📁 View folder in Google Drive →
                  </a>
                )}
                {genResult.links && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(genResult.links).map(([yr, link]) => (
                      <a key={yr} href={link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-50">
                        📄 {yr} 1040
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-700 text-sm">❌ {genResult.error || "Unknown error"}</p>
            )}
          </div>
        )}

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
                {[["Name", client.full_name || `${client.first_name} ${client.last_name}`],["DOB", client.dob],["SSN", client.ssn ? "•••-••-" + (client.ssn||"").slice(-4) : "—"],["Email", client.email],["Phone", client.phone]].map(([l,v]) => (
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
                {[["address","Street"],["apt","Apt"],["city","City"],["state","State"],["zip","ZIP"]].map(([f,l]) => (
                  <div key={f}>
                    <label className="text-xs text-slate-500">{l}</label>
                    <input className="w-full border border-slate-200 rounded px-2 py-1 text-sm mt-0.5"
                      value={editForm[f] || ""} onChange={e => setEditForm(p => ({...p, [f]: e.target.value}))} />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="space-y-2">
                {[["Street", client.address],["Apt", client.apt],["City", client.city],["State", client.state],["ZIP", client.zip]].map(([l,v]) => (
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
                {[["Routing", client.bank_routing ? "•••"+client.bank_routing.slice(-4) : "—"],["Account", client.bank_account ? "•••"+client.bank_account.slice(-4) : "—"],["Refund", client.refund_amount ? `$${client.refund_amount}` : "—"]].map(([l,v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <dt className="text-slate-500">{l}</dt>
                    <dd className="text-slate-900 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Signature Status */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Signature</h3>
            {client.signature_url && client.signature_url.startsWith("data:image") ? (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                  <img src={client.signature_url} alt="Signature" className="max-h-16 object-contain" />
                </div>
                <p className="text-xs text-emerald-600 font-medium">✅ Signature on file</p>
                <button onClick={() => setShowSigPad(true)}
                  className="text-xs text-blue-600 underline">
                  Re-capture signature
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">No signature captured yet.</p>
                <button onClick={() => setShowSigPad(true)}
                  className="w-full py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-100">
                  ✍️ Capture Signature In-Person
                </button>
                <button onClick={copySignatureLink}
                  className="w-full py-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100">
                  📋 Send Signature Link to Client
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tax Filing Info */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Filing Information</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {[["Tax Year(s)", client.tax_year], ["Status", client.filing_status || "pending"], ["IRS Status", client.irs_status || "pending"]].map(([l,v]) => (
              <div key={l}>
                <p className="text-slate-500 text-xs mb-1">{l}</p>
                <p className={`font-semibold ${v === "filed" ? "text-emerald-600" : "text-slate-800"}`}>{v || "—"}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
