import { useState, useEffect, useRef } from "react";
import { Client, TaxReturn } from "@/api/entities";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_STEPS = ["new", "in_progress", "ready", "filed", "complete"];
const STATUS_LABELS = {
  new: "New", in_progress: "In Progress", ready: "Ready to File",
  filed: "Filed", complete: "Complete"
};
const STATUS_COLORS = {
  new: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  in_progress: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  ready: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  filed: "text-green-400 bg-green-500/10 border-green-500/20",
  complete: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};
const TAX_YEARS = ["2025", "2024", "2023"];

export default function ClientDetail() {
  const [params] = useSearchParams();
  const clientId = params.get("id");
  const sigRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  const [client, setClient] = useState(null);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genYear, setGenYear] = useState("2024");
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [sigEmpty, setSigEmpty] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    async function load() {
      const [c, r] = await Promise.all([
        Client.filter({ id: clientId }),
        TaxReturn.filter({ client_id: clientId }),
      ]);
      if (c[0]) { setClient(c[0]); setEditForm(c[0]); }
      setReturns(r.sort((a, b) => (b.tax_year || 0) - (a.tax_year || 0)));
      setLoading(false);
    }
    load();
  }, [clientId]);

  // Canvas signature drawing
  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e, sigRef.current);
  }

  function draw(e) {
    e.preventDefault();
    if (!isDrawing.current || !sigRef.current) return;
    const ctx = sigRef.current.getContext("2d");
    const pos = getPos(e, sigRef.current);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
    setSigEmpty(false);
  }

  function endDraw() { isDrawing.current = false; }

  function clearSig() {
    const ctx = sigRef.current.getContext("2d");
    ctx.clearRect(0, 0, sigRef.current.width, sigRef.current.height);
    setSigEmpty(true);
  }

  async function handleGenerate() {
    if (!client) return;
    setGenerating(true);
    setGenError(null);
    setGenResult(null);

    let sigB64 = null;
    if (!sigEmpty && sigRef.current) {
      sigB64 = sigRef.current.toDataURL("image/png").split(",")[1];
    }

    try {
      const resp = await fetch("https://superagent-0baff5aa.base44.app/functions/fillTaxForm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: genYear,
          first_name: client.first_name,
          last_name: client.last_name,
          middle_init: client.middle_init || "",
          ssn: client.ssn,
          address: client.address,
          apt: client.apt || "",
          city: client.city,
          state: client.state,
          zip: client.zip,
          bank_routing: client.bank_routing || "",
          bank_account: client.bank_account || "",
          signature_base64: sigB64,
          send_email_to: client.email || null,
        }),
      });

      const data = await resp.json();
      if (data.success) {
        setGenResult(data);
        const existing = returns.find(r => r.tax_year === parseInt(genYear));
        if (existing) {
          await TaxReturn.update(existing.id, { status: "ready", pdf_url: data.drive_link, signature_date: new Date().toISOString() });
        } else {
          await TaxReturn.create({
            client_id: clientId,
            client_name: `${client.first_name} ${client.last_name}`,
            tax_year: parseInt(genYear),
            status: "ready",
            pdf_url: data.drive_link,
            signature_date: new Date().toISOString(),
          });
        }
        const r = await TaxReturn.filter({ client_id: clientId });
        setReturns(r.sort((a, b) => (b.tax_year || 0) - (a.tax_year || 0)));
      } else {
        setGenError(data.error || "Unknown error");
      }
    } catch (err) {
      setGenError(err.message);
    }
    setGenerating(false);
  }

  async function updateStatus(returnId, status) {
    await TaxReturn.update(returnId, { status });
    setReturns(prev => prev.map(r => r.id === returnId ? { ...r, status } : r));
  }

  async function saveEdit() {
    await Client.update(clientId, editForm);
    setClient(editForm);
    setEditing(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!client) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center text-slate-500">Client not found</div>
  );

  const latestReturn = returns[0];
  const currentStepIdx = latestReturn ? STATUS_STEPS.indexOf(latestReturn.status) : -1;

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Clients")} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-400/15 border border-amber-400/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                {client.first_name?.[0]}{client.last_name?.[0]}
              </div>
              <div>
                <h1 className="text-lg font-bold">{client.first_name} {client.last_name}</h1>
                <p className="text-xs text-slate-500">{client.email || "No email"} · SSN •••-••-{(client.ssn || "").slice(-4)}</p>
              </div>
            </div>
          </div>
          <button onClick={() => setEditing(!editing)}
            className="text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-4 py-2 rounded-lg transition-all">
            {editing ? "Cancel" : "✏️ Edit"}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Progress Bar */}
        {latestReturn && (
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Filing Progress — {latestReturn.tax_year}</h2>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[latestReturn.status] || ""}`}>
                {STATUS_LABELS[latestReturn.status]}
              </span>
            </div>
            <div className="flex gap-1">
              {STATUS_STEPS.map((s, i) => (
                <div key={s} className={`h-2 flex-1 rounded-full transition-all ${i <= currentStepIdx ? "bg-amber-400" : "bg-white/10"}`} />
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {STATUS_STEPS.map((s, i) => (
                <span key={s} className={`text-xs ${i <= currentStepIdx ? "text-amber-400" : "text-slate-600"}`}>{STATUS_LABELS[s]}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client Info Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Client Info</h3>
              {editing ? (
                <div className="space-y-3">
                  {[["First Name","first_name"],["Last Name","last_name"],["Email","email"],["Phone","phone"],["Address","address"],["Apt","apt"],["City","city"],["State","state"],["ZIP","zip"]].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-slate-500 mb-1 block">{label}</label>
                      <input value={editForm[key] || ""} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50" />
                    </div>
                  ))}
                  <button onClick={saveEdit} className="w-full mt-2 bg-amber-400 text-[#0A1628] font-semibold text-sm py-2 rounded-lg hover:bg-amber-300 transition-colors">
                    Save Changes
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    ["Full Name", `${client.first_name} ${client.middle_init || ""} ${client.last_name}`.trim()],
                    ["SSN", `•••-••-${(client.ssn || "").slice(-4)}`],
                    ["DOB", client.dob || "—"],
                    ["Filing", (client.filing_status || "single").toUpperCase()],
                    ["Email", client.email || "—"],
                    ["Phone", client.phone || "—"],
                    ["Address", [client.address, client.apt, client.city, client.state, client.zip].filter(Boolean).join(", ") || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-start gap-2">
                      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
                      <span className="text-xs text-slate-200 text-right">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Direct Deposit</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Routing</span>
                  <span className="text-xs text-slate-200 font-mono">{client.bank_routing || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Account</span>
                  <span className="text-xs text-slate-200 font-mono">{client.bank_account ? `•••${client.bank_account.slice(-4)}` : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right — Generate + Returns */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">Generate IRS Form 1040</h3>

              <div className="flex gap-2 mb-5">
                {TAX_YEARS.map(y => (
                  <button key={y} onClick={() => setGenYear(y)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${genYear === y ? "bg-amber-400 border-amber-400 text-[#0A1628]" : "bg-white/5 border-white/10 text-slate-400 hover:border-amber-400/30"}`}>
                    {y}
                  </button>
                ))}
              </div>

              {/* Signature Canvas */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client Signature</label>
                  {!sigEmpty && (
                    <button onClick={clearSig} className="text-xs text-slate-500 hover:text-red-400 transition-colors">✕ Clear</button>
                  )}
                </div>
                <div className="border border-white/15 rounded-xl overflow-hidden bg-white relative" style={{ height: 110 }}>
                  <canvas
                    ref={sigRef}
                    width={700}
                    height={110}
                    className="w-full h-full cursor-crosshair touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                  {sigEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-slate-400 text-sm">✍️ Sign here</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1.5">Draw signature above using mouse or touch</p>
              </div>

              <button onClick={handleGenerate} disabled={generating}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A1628] font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                {generating
                  ? <><div className="w-4 h-4 border-2 border-[#0A1628]/30 border-t-[#0A1628] rounded-full animate-spin" /> Generating {genYear} Form...</>
                  : <>📄 Generate {genYear} Form 1040</>}
              </button>

              {genResult && (
                <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-xl">✅</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">Form generated successfully!</p>
                    <p className="text-xs text-slate-400 mt-1">Saved to: {genResult.folder}</p>
                    <a href={genResult.drive_link} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-amber-400 hover:text-amber-300 font-medium">
                      Open in Google Drive →
                    </a>
                  </div>
                </div>
              )}

              {genError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
                  ⚠️ {genError}
                </div>
              )}
            </div>

            {/* Returns History */}
            <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Returns History</h3>
              </div>
              {returns.length === 0 ? (
                <div className="py-10 text-center text-slate-600 text-sm">No returns yet</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {returns.map(ret => (
                    <div key={ret.id} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-semibold">Form 1040 — {ret.tax_year}</div>
                          <div className="text-xs text-slate-500">{ret.signature_date ? `Signed ${new Date(ret.signature_date).toLocaleDateString()}` : "Unsigned"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select value={ret.status} onChange={e => updateStatus(ret.id, e.target.value)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border bg-transparent cursor-pointer focus:outline-none ${STATUS_COLORS[ret.status] || "text-slate-400 border-slate-600"}`}>
                          {STATUS_STEPS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                        {ret.pdf_url && (
                          <a href={ret.pdf_url} target="_blank" rel="noreferrer"
                            className="text-xs text-amber-400 hover:text-amber-300 border border-amber-400/20 px-3 py-1.5 rounded-lg transition-all">
                            View →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
