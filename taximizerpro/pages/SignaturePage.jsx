/**
 * SignaturePage.jsx — Client-facing signature page
 *
 * URL: /SignaturePage?id=<client_id>&name=<full_name>
 *
 * Client lands here from admin-shared link, signs, and their
 * signature_url is saved directly to their TaxClient record.
 * Admin then sees "✅ Signature on file" in ClientDetail and
 * can click Generate Forms.
 */

import { useState, useRef, useEffect } from "react";
import { TaxClient } from "@/api/entities";

export default function SignaturePage() {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("sign"); // sign | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const lastPos = useRef(null);

  const [clientName, setClientName] = useState("Client");
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setClientName(decodeURIComponent(params.get("name") || "Client"));
    setClientId(params.get("id") || "");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [step]);

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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasData(false);
  }

  async function submit() {
    if (!hasData || !clientId) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      await TaxClient.update(clientId, {
        signature_url: dataUrl,
        current_step: 4,
      });
      setStep("done");
    } catch (e) {
      setErrorMsg(e.message || "Something went wrong. Please try again.");
      setStep("error");
    }
    setSaving(false);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto text-4xl">✅</div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Signature Received</h2>
            <p className="text-slate-500 mt-2">Thank you, <span className="font-semibold text-slate-800">{clientName}</span>.</p>
            <p className="text-slate-500 mt-1 text-sm">Your tax preparer has been notified and will finalize your return shortly.</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 text-left space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-emerald-500">✓</span>
              <span className="text-sm text-slate-600">Signature captured securely</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-500">✓</span>
              <span className="text-sm text-slate-600">Return status updated</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-amber-500">⏳</span>
              <span className="text-sm text-slate-600">Forms being finalized by your preparer</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">You may close this window.</p>
          <div className="pt-2">
            <p className="text-xs text-slate-400 font-medium">TaximizerPro · Professional Tax Preparation</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-red-100 border border-red-200 flex items-center justify-center mx-auto text-4xl">❌</div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Something Went Wrong</h2>
            <p className="text-slate-500 mt-2 text-sm">{errorMsg}</p>
          </div>
          <button onClick={() => setStep("sign")}
            className="w-full py-3 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Sign ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-bold mb-4">
            TaximizerPro
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign Your Tax Return</h1>
          <p className="text-slate-500 mt-1">Hi <span className="font-semibold text-slate-800">{clientName}</span>, please sign below to authorize your return.</p>
        </div>

        {/* Instructions */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">✍️</span>
          <p className="text-sm text-amber-800">Use your finger or mouse to sign in the box below. By signing you authorize the preparation and filing of your federal tax return.</p>
        </div>

        {/* Canvas */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white touch-none" style={{ height: 180 }}>
            <canvas
              ref={canvasRef}
              width={580}
              height={180}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              className="w-full h-full cursor-crosshair"
            />
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-300 text-base font-medium">Sign here</span>
              </div>
            )}
            {/* Signature baseline */}
            <div className="absolute bottom-8 left-8 right-8 border-b border-slate-300 pointer-events-none" />
            <div className="absolute bottom-3 left-8 text-sm text-slate-400 pointer-events-none font-serif">X</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={clearPad}
            className="px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-semibold shadow-sm">
            Clear
          </button>
          <button
            disabled={!hasData || saving}
            onClick={submit}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all shadow ${
              hasData && !saving
                ? "bg-blue-700 hover:bg-blue-800 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : "✓ Submit Signature"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          Your signature is encrypted and stored securely. · TaximizerPro
        </p>
      </div>
    </div>
  );
}
