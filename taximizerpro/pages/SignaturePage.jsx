/**
 * SignaturePage.jsx
 * ─────────────────
 * Dual-mode signature page for TaximizerPro:
 *
 * CLIENT MODE  — accessed via share link: /SignaturePage?token=<id>&name=<name>
 *   • Client sees their name, signs, submits
 *   • Signature saved to ClientMilestone notes as base64 PNG
 *   • Milestone auto-advances to "Ready for Signature" → "Filed"
 *
 * ADMIN MODE  — accessed from ClientDetail panel
 *   • Same UI but inside admin dashboard
 *   • Admin captures in-person signature on device
 *   • Confirmation triggers form generation
 */

import { useState, useRef, useEffect } from "react";
import { ClientMilestone } from "@/api/entities";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// ── Reusable Signature Canvas ─────────────────────────────────────────────────
export function SignaturePad({ onSave, onClose, clientName, label = "Sign Here", compact = false }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const lastPos = useRef(null);

  useEffect(() => {
    // Ensure canvas is crisp on retina displays
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e) {
    e.preventDefault();
    lastPos.current = getPos(e, canvasRef.current);
    setDrawing(true);
  }

  function draw(e) {
    e.preventDefault();
    if (!drawing) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const pos = getPos(e, c);
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

  function endDraw(e) {
    e.preventDefault();
    setDrawing(false);
  }

  function clearPad() {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasData(false);
  }

  function save() {
    if (!hasData) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className={compact ? "" : "fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"}>
      <div className={`bg-[#0D1628] border border-white/10 rounded-2xl p-6 w-full ${compact ? "" : "max-w-lg"} space-y-5`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-white text-lg">{label}</h3>
            {clientName && <p className="text-sm text-slate-400 mt-0.5">{clientName}</p>}
          </div>
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">✕</button>
          )}
        </div>

        {/* Instructions */}
        <div className="flex items-center gap-2 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-lg">✍️</span>
          <p className="text-xs text-amber-200/80">Use your finger or mouse to sign in the box below. By signing you authorize the preparation of your tax return.</p>
        </div>

        {/* Canvas */}
        <div className="relative border-2 border-dashed border-white/20 rounded-xl overflow-hidden bg-white touch-none" style={{ height: 160 }}>
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
          {/* Signature line */}
          <div className="absolute bottom-6 left-8 right-8 border-b border-slate-300 pointer-events-none"/>
          <div className="absolute bottom-2 left-8 text-xs text-slate-400 pointer-events-none">X</div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={clearPad}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            disabled={!hasData}
            onClick={save}
            className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${
              hasData
                ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E] shadow-lg shadow-amber-400/20"
                : "bg-white/10 text-slate-500 cursor-not-allowed"
            }`}
          >
            ✓ Confirm Signature
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Full-Page Client Signature Experience ─────────────────────────────────────
export default function SignaturePage() {
  const [step, setStep] = useState("sign"); // sign | done | error
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setClientName(decodeURIComponent(params.get("name") || "Client"));
    setClientId(params.get("id") || "");
  }, []);

  async function handleSignature(dataUrl) {
    setSaving(true);
    try {
      if (!clientId) throw new Error("Missing client ID");

      // Load existing milestones for this client
      const milestones = await ClientMilestone.filter({ client_id: clientId });
      if (!milestones.length) throw new Error("Client not found");

      // Parse existing notes, attach signature
      let notes = {};
      try { notes = JSON.parse(milestones[0].notes || "{}"); } catch {}
      notes.client_signature = dataUrl;
      notes.signed_at = new Date().toISOString();
      const notesStr = JSON.stringify(notes);

      // Update all milestones with signature
      await Promise.all(
        milestones.map(m =>
          ClientMilestone.update(m.id, { notes: notesStr })
        )
      );

      // Advance latest milestone to "Ready for Signature" if not already past it
      const MILESTONES = [
        "Documents Received","Under Review","Ready for Signature",
        "Filed","Refund Pending","Funded","Complete"
      ];
      const latest = milestones.sort((a,b) =>
        MILESTONES.indexOf(b.milestone) - MILESTONES.indexOf(a.milestone)
      )[0];
      const idx = MILESTONES.indexOf(latest.milestone);
      if (idx < 2) {
        // Advance to "Ready for Signature"
        await ClientMilestone.create({
          client_id: clientId,
          client_name: clientName,
          tax_year: latest.tax_year,
          milestone: "Ready for Signature",
          status: "pending",
          notes: notesStr,
        });
      }

      setStep("done");
    } catch (e) {
      setErrorMsg(e.message || "Something went wrong. Please try again.");
      setStep("error");
    }
    setSaving(false);
  }

  // ── Done State ───────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen bg-[#080F1E] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto text-4xl">✅</div>
          <div>
            <h2 className="text-2xl font-black text-white">Signature Received</h2>
            <p className="text-slate-400 mt-2">Thank you, <span className="text-white font-semibold">{clientName}</span>. Your tax return is now being processed.</p>
          </div>
          <div className="bg-[#0D1628] border border-white/10 rounded-2xl p-5 text-left space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400">✓</span>
              <span className="text-sm text-slate-300">Signature captured securely</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400">✓</span>
              <span className="text-sm text-slate-300">Return status updated</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-amber-400">⏳</span>
              <span className="text-sm text-slate-300">Forms being finalized by your preparer</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">You may close this window. Your preparer will contact you when your return is filed.</p>
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen bg-[#080F1E] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-black text-white">Something went wrong</h2>
          <p className="text-slate-400 text-sm">{errorMsg}</p>
          <button onClick={() => setStep("sign")} className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-black rounded-xl transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Sign State ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080F1E] text-white flex flex-col">
      {/* Header */}
      <div className="bg-[#0D1628] border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-sm">T</div>
        <div>
          <div className="font-black text-white text-sm">TaximizerPro</div>
          <div className="text-xs text-slate-500">Secure Signature Portal</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          {/* Welcome */}
          <div>
            <h1 className="text-2xl font-black text-white">Hi, {clientName} 👋</h1>
            <p className="text-slate-400 mt-1 text-sm">Your tax preparer needs your signature to finalize and file your return.</p>
          </div>

          {/* What you're signing */}
          <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">What you're authorizing:</h3>
            <div className="space-y-2 text-sm text-slate-400">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>Preparation and filing of your Federal Income Tax Return (IRS Form 1040)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>Your preparer to submit on your behalf to the IRS</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>Direct deposit of your refund to your registered account</span>
              </div>
            </div>
          </div>

          {/* Signature pad — inline, no modal */}
          {saving ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/>
              <p className="text-slate-400 text-sm">Saving your signature...</p>
            </div>
          ) : (
            <SignaturePad
              onSave={handleSignature}
              clientName={`Authorizing return for: ${clientName}`}
              label="Your Signature"
              compact
            />
          )}

          <p className="text-xs text-slate-600 text-center">
            This is a legally binding electronic signature. By signing you confirm all information on your return is accurate.
          </p>
        </div>
      </div>
    </div>
  );
}
