import { useState, useRef, useEffect } from "react";
import { ClientMilestone } from "@/api/entities";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const STEPS = ["Personal Info", "Address", "Bank Info", "Sign & Submit"];
const YEARS = [2025, 2024, 2023];

// ── Nominatim Address Autocomplete ────────────────────────────────────────────
function AddressAutocomplete({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  function handleChange(e) {
    onChange(e.target.value);
    clearTimeout(timer.current);
    if (e.target.value.length < 4) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&q=${encodeURIComponent(e.target.value)}&limit=5`,
          { headers: { "Accept-Language": "en", "User-Agent": "TaximizerPro/1.0" } }
        );
        const data = await r.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {}
    }, 400);
  }

  function pick(item) {
    const a = item.address || {};
    const street = [a.house_number, a.road || a.pedestrian].filter(Boolean).join(" ");
    onSelect({
      address: street || item.display_name.split(",")[0],
      city: a.city || a.town || a.village || a.county || "",
      state: a.state ? (a.state.length === 2 ? a.state : stateAbbr(a.state)) : "",
      zip: a.postcode || "",
    });
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={handleChange} placeholder="Start typing address..."
        className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors" />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0D1628] border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl">
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={() => pick(s)}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-amber-400/10 hover:text-white transition-colors border-b border-white/5 last:border-0 truncate">
              {s.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function stateAbbr(name) {
  const map = { "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY" };
  return map[name] || name;
}

// ── Signature Pad ─────────────────────────────────────────────────────────────
function SignaturePad({ onSave, onClear, hasSig }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function start(e) { e.preventDefault(); lastPos.current = getPos(e, canvasRef.current); setDrawing(true); }

  function move(e) {
    e.preventDefault();
    if (!drawing) return;
    const c = canvasRef.current, ctx = c.getContext("2d");
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

  function end(e) { e.preventDefault(); setDrawing(false); }

  function clear() {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasData(false);
    if (onClear) onClear();
  }

  function confirmSig() {
    if (!hasData) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className="space-y-3">
      {/* Canvas */}
      <div className="relative border-2 border-dashed border-white/20 rounded-xl overflow-hidden bg-white touch-none" style={{ height: 150 }}>
        <canvas
          ref={canvasRef} width={580} height={150}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          className="w-full h-full cursor-crosshair"
        />
        {!hasData && !hasSig && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-300 text-sm">Sign here</span>
          </div>
        )}
        {/* Signature baseline */}
        <div className="absolute bottom-6 left-8 right-8 border-b border-slate-300 pointer-events-none" />
        <div className="absolute bottom-1.5 left-8 text-xs text-slate-400 pointer-events-none">X</div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-center">
        <button type="button" onClick={clear}
          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-colors">
          Clear
        </button>
        <button type="button" onClick={confirmSig} disabled={!hasData}
          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
            hasData
              ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E] shadow-md shadow-amber-400/20"
              : "bg-white/5 text-slate-500 cursor-not-allowed"
          }`}>
          {hasData ? "✓ Use This Signature" : "Draw signature above"}
        </button>
      </div>

      {hasSig && (
        <div className="flex items-center gap-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-3 py-2">
          <span className="text-emerald-400 text-sm">✓</span>
          <span className="text-xs text-emerald-400 font-semibold">Signature captured — ready to file</span>
        </div>
      )}
    </div>
  );
}

// ── Input Helper ──────────────────────────────────────────────────────────────
function Input({ label, name, value, onChange, type = "text", placeholder = "", required = false, maxLength }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-amber-400 ml-1">*</span>}
      </label>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
        required={required} maxLength={maxLength}
        className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NewClient() {
  const navigate = useNavigate();
  const { data: user } = useUser();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sigDataUrl, setSigDataUrl] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    first_name: "", middle_init: "", last_name: "",
    ssn: "", email: "", phone: "",
    address: "", apt: "", city: "", state: "", zip: "",
    routing: "", account: "",
    years: [2025, 2024, 2023],
  });

  function update(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function toggleYear(y) {
    setForm(f => ({
      ...f,
      years: f.years.includes(y) ? f.years.filter(x => x !== y) : [...f.years, y],
    }));
  }

  function formatSSN(raw) {
    const d = raw.replace(/\D/g, "").slice(0, 9);
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0,3)}-${d.slice(3)}`;
    return `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`;
  }

  function canAdvance() {
    if (step === 0) return form.first_name && form.last_name && form.ssn.length === 11;
    if (step === 1) return form.address && form.city && form.state && form.zip;
    if (step === 2) return true; // bank optional
    if (step === 3) return !!sigDataUrl; // must sign before submitting
    return true;
  }

  // ── Final submission — signature already captured ─────────────────────────
  async function submit() {
    if (!sigDataUrl) return;
    setSaving(true);
    setError("");
    try {
      const clientName = `${form.first_name}${form.middle_init ? " " + form.middle_init : ""} ${form.last_name}`.trim();
      const clientId = `client_${Date.now()}`;
      const fullAddress = `${form.address}${form.apt ? " " + form.apt : ""}`.trim();

      const notesPayload = JSON.stringify({
        ssn: form.ssn.replace(/-/g, ""),
        email: form.email,
        phone: form.phone,
        address: fullAddress,
        city: form.city,
        state: form.state,
        zip: form.zip,
        routing: form.routing,
        account: form.account,
        client_signature: sigDataUrl,
        signed_at: new Date().toISOString(),
        signed_by: "new_client_form",
      });

      for (const yr of form.years) {
        await ClientMilestone.create({
          client_id: clientId,
          client_name: clientName,
          tax_year: yr,
          milestone: "Ready for Signature",  // already signed
          status: "approved",
          assigned_agent: user?.email,
          notes: notesPayload,
        });
      }

      setDone({ clientId, clientName });
    } catch (e) {
      setError("Failed to save client. Please try again.");
    }
    setSaving(false);
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) return (
    <div className="min-h-screen bg-[#080F1E] text-white flex items-center justify-center p-6">
      <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-8 max-w-md w-full text-center space-y-5">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-black text-white">Client Added & Signed!</h2>
        <p className="text-slate-400 text-sm">
          <span className="text-white font-semibold">{done.clientName}</span> has been added, signature is on file, and their returns are ready to generate.
        </p>
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4 text-left space-y-2">
          <div className="text-xs font-bold text-amber-400 mb-1">Next steps:</div>
          <div className="text-xs text-slate-400 flex items-center gap-2"><span className="text-amber-400">→</span> Open client record</div>
          <div className="text-xs text-slate-400 flex items-center gap-2"><span className="text-amber-400">→</span> Click "Generate 1040s" — signature auto-stamps in</div>
        </div>
        <div className="flex gap-3 pt-1">
          <Link
            to={createPageUrl("ClientDetail") + "?id=" + done.clientId}
            className="flex-1 bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-black py-3 rounded-xl text-sm transition-colors"
          >
            Open Client →
          </Link>
          <button
            onClick={() => { setDone(null); setStep(0); setSigDataUrl(null); setForm({ first_name:"",middle_init:"",last_name:"",ssn:"",email:"",phone:"",address:"",apt:"",city:"",state:"",zip:"",routing:"",account:"",years:[2025,2024,2023] }); }}
            className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl text-sm transition-colors border border-white/10"
          >
            Add Another
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#080F1E]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Clients")} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-xs">T</div>
            <span className="font-black text-sm">New Client</span>
          </div>
        </div>
      </nav>

      {/* Step indicator */}
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-black flex-shrink-0 transition-all ${
                i < step ? "bg-emerald-400 text-[#080F1E]" :
                i === step ? "bg-amber-400 text-[#080F1E]" :
                "bg-white/10 text-slate-500"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-xs font-semibold hidden sm:block transition-colors ${i === step ? "text-white" : "text-slate-600"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-1 ${i < step ? "bg-emerald-400/40" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        <div className="space-y-5">

          {/* ── STEP 0: Personal Info ────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-white">Personal Info</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Input label="First Name" name="first_name" value={form.first_name} onChange={update} required placeholder="John" />
                </div>
                <div className="col-span-1">
                  <Input label="M.I." name="middle_init" value={form.middle_init} onChange={update} placeholder="J" maxLength={1} />
                </div>
                <div className="col-span-1">
                  <Input label="Last Name" name="last_name" value={form.last_name} onChange={update} required placeholder="Smith" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">SSN <span className="text-amber-400">*</span></label>
                <input
                  type="text" name="ssn" value={form.ssn}
                  onChange={e => setForm(f => ({ ...f, ssn: formatSSN(e.target.value) }))}
                  placeholder="333-33-3333" maxLength={11}
                  className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors font-mono tracking-widest"
                />
              </div>
              <Input label="Email" name="email" value={form.email} onChange={update} type="email" placeholder="john@email.com" />
              <Input label="Phone" name="phone" value={form.phone} onChange={update} type="tel" placeholder="(555) 000-0000" />
              {/* Tax years */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Tax Years to File</label>
                <div className="flex gap-2">
                  {YEARS.map(y => (
                    <button key={y} type="button" onClick={() => toggleYear(y)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                        form.years.includes(y)
                          ? "bg-amber-400 border-amber-400 text-[#080F1E]"
                          : "bg-[#0A1628] border-white/10 text-slate-400 hover:border-amber-400/30"
                      }`}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: Address ──────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-white">Address</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Street Address <span className="text-amber-400">*</span></label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={v => setForm(f => ({ ...f, address: v }))}
                  onSelect={vals => setForm(f => ({ ...f, ...vals }))}
                />
              </div>
              <Input label="Apt / Unit (optional)" name="apt" value={form.apt || ""} onChange={update} placeholder="Optional" />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Input label="City" name="city" value={form.city} onChange={update} required />
                </div>
                <div>
                  <Input label="State" name="state" value={form.state} onChange={update} required maxLength={2} placeholder="NY" />
                </div>
                <div>
                  <Input label="ZIP" name="zip" value={form.zip} onChange={update} required maxLength={5} placeholder="10001" />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Bank Info ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-white">Bank Info <span className="text-slate-500 text-sm font-normal">(optional)</span></h2>
              <p className="text-sm text-slate-400">For direct deposit of refund. Leave blank if not applicable.</p>
              <Input label="Routing Number" name="routing" value={form.routing} onChange={update} placeholder="021000021" maxLength={9} />
              <Input label="Account Number" name="account" value={form.account} onChange={update} placeholder="Account number" />
            </div>
          )}

          {/* ── STEP 3: Sign & Submit ────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-white">Sign & Submit</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Have <span className="text-white font-semibold">{form.first_name} {form.last_name}</span> sign below to authorize their tax return. The signature will be auto-stamped into all selected 1040 forms.
                </p>
              </div>

              {/* Authorization notice */}
              <div className="bg-[#0D1628] border border-white/5 rounded-xl p-4 space-y-2 text-xs text-slate-400">
                <div className="font-bold text-white text-sm">By signing, the client authorizes:</div>
                <div className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span><span>Preparation and e-filing of IRS Form 1040 ({form.years.join(", ")})</span></div>
                <div className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span><span>Direct deposit of any refund to the registered bank account</span></div>
                <div className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span><span>Their preparer to act on their behalf with the IRS</span></div>
              </div>

              {/* Review summary */}
              <div className="bg-[#0D1628] border border-white/5 rounded-xl p-4 grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500">Name: </span><span className="text-white font-semibold">{form.first_name} {form.middle_init} {form.last_name}</span></div>
                <div><span className="text-slate-500">SSN: </span><span className="text-white font-mono">***-**-{form.ssn.slice(-4)}</span></div>
                <div><span className="text-slate-500">Address: </span><span className="text-white">{form.address}{form.apt ? ` ${form.apt}` : ""}, {form.city} {form.state}</span></div>
                <div><span className="text-slate-500">Years: </span><span className="text-amber-400 font-bold">{form.years.sort((a,b)=>b-a).join(", ")}</span></div>
              </div>

              {/* Signature pad */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Client Signature <span className="text-amber-400">*</span></label>
                <SignaturePad
                  onSave={url => setSigDataUrl(url)}
                  onClear={() => setSigDataUrl(null)}
                  hasSig={!!sigDataUrl}
                />
              </div>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {error && (
            <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-3 text-sm text-red-400">
              ⚠️ {error}
            </div>
          )}

          {/* ── Navigation ───────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2 pb-10">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="px-5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-semibold text-sm transition-colors border border-white/10">
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" disabled={!canAdvance()} onClick={() => setStep(s => s + 1)}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${
                  canAdvance()
                    ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E]"
                    : "bg-white/10 text-slate-500 cursor-not-allowed"
                }`}>
                Continue →
              </button>
            ) : (
              <button type="button" disabled={!canAdvance() || saving}
                onClick={submit}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${
                  canAdvance() && !saving
                    ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E] shadow-lg shadow-amber-400/20"
                    : "bg-white/10 text-slate-500 cursor-not-allowed"
                }`}>
                {saving ? "Saving..." : "✓ Submit & Save Client"}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
