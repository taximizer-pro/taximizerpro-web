import { useState, useRef, useEffect } from "react";
import { ClientMilestone } from "@/api/entities";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

const STEPS = ["Personal Info", "Address", "Bank Info", "Signature & File"];
const YEARS = [2025, 2024, 2023];

// Nominatim address autocomplete (OpenStreetMap — no API key needed)
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
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&q=${encodeURIComponent(e.target.value)}&limit=5`, {
          headers: { 'Accept-Language': 'en', 'User-Agent': 'TaximizerPro/1.0' }
        });
        const data = await r.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {}
    }, 400);
  }

  function pick(item) {
    const a = item.address || {};
    const houseNum = a.house_number || "";
    const road = a.road || a.pedestrian || "";
    const street = [houseNum, road].filter(Boolean).join(" ");
    onSelect({
      address: street || item.display_name.split(",")[0],
      city:  a.city || a.town || a.village || a.county || "",
      state: a.state ? a.state.length === 2 ? a.state : stateAbbr(a.state) : "",
      zip:   a.postcode || "",
    });
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={handleChange} placeholder="Start typing address..."
        className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"/>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0D1628] border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl">
          {suggestions.map((s,i) => (
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
  const map = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"};
  return map[name] || name;
}

// Signature pad
function SignaturePad({ onSave }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const lastPos = useRef(null);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function start(e) {
    e.preventDefault();
    const pos = getPos(e, canvasRef.current);
    lastPos.current = pos;
    setDrawing(true);
  }

  function move(e) {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHasData(true);
  }

  function end(e) { e.preventDefault(); setDrawing(false); }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasData(false);
  }

  function save() {
    if (!hasData) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-white/20 rounded-xl bg-white overflow-hidden touch-none" style={{height: 120}}>
        <canvas ref={canvasRef} width={560} height={120}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          className="w-full h-full cursor-crosshair"/>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 bg-white/5 rounded-lg">Clear</button>
        {hasData && <button type="button" onClick={save} className="text-xs text-amber-400 hover:text-amber-300 transition-colors px-3 py-1.5 bg-amber-400/10 rounded-lg font-semibold">✓ Use This Signature</button>}
      </div>
    </div>
  );
}

function Input({ label, name, value, onChange, type="text", placeholder="", required=false, pattern, maxLength }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-amber-400 ml-1">*</span>}</label>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
        required={required} pattern={pattern} maxLength={maxLength}
        className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"/>
    </div>
  );
}

export default function NewClient() {
  const navigate = useNavigate();
  const { data: user } = useUser();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sigDataUrl, setSigDataUrl] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    first_name: "", middle_init: "", last_name: "",
    ssn: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "",
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
      years: f.years.includes(y) ? f.years.filter(x=>x!==y) : [...f.years, y]
    }));
  }

  function formatSSN(raw) {
    const digits = raw.replace(/\D/g,"").slice(0,9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`;
  }

  function handleSSN(e) {
    setForm(f => ({ ...f, ssn: formatSSN(e.target.value) }));
  }

  function canAdvance() {
    if (step === 0) return form.first_name && form.last_name && form.ssn.length === 11;
    if (step === 1) return form.address && form.city && form.state && form.zip;
    if (step === 2) return true; // bank optional
    return true;
  }

  async function submit() {
    setGenerating(true);
    setError("");
    try {
      // Create a milestone for each selected year
      const clientName = `${form.first_name}${form.middle_init ? ' '+form.middle_init : ''} ${form.last_name}`.trim();
      const clientId = `client_${Date.now()}`;

      for (const yr of form.years) {
        await ClientMilestone.create({
          client_id: clientId,
          client_name: clientName,
          tax_year: yr,
          milestone: "Documents Received",
          status: "pending",
          assigned_agent: user?.email,
          notes: JSON.stringify({
            ssn: form.ssn.replace(/-/g,""),
            email: form.email,
            phone: form.phone,
            address: form.address + (form.apt ? " " + form.apt : ""),
            city: form.city,
            state: form.state,
            zip: form.zip,
            routing: form.routing,
            account: form.account,
          })
        });
      }

      setDone({ clientId, clientName });
    } catch(e) {
      setError("Failed to save client. Please try again.");
    }
    setGenerating(false);
  }

  if (done) return (
    <div className="min-h-screen bg-[#080F1E] text-white flex items-center justify-center p-6">
      <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-black">Client Added!</h2>
        <p className="text-slate-400 text-sm">{done.clientName} has been added and their tax returns are being tracked.</p>
        <div className="flex gap-3 pt-2">
          <Link to={createPageUrl("Clients")} className="flex-1 bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-bold py-3 rounded-xl text-sm transition-colors">View Clients</Link>
          <button onClick={() => { setDone(null); setStep(0); setForm({first_name:"",middle_init:"",last_name:"",ssn:"",email:"",phone:"",address:"",city:"",state:"",zip:"",routing:"",account:"",years:[2025,2024,2023]}); setSigDataUrl(null); }}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl text-sm transition-colors">Add Another</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080F1E] text-white">
      <nav className="sticky top-0 z-50 bg-[#080F1E]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Clients")} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-xs">T</div>
            <span className="font-black text-base">New Client</span>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? "bg-emerald-400 text-[#080F1E]" :
                i === step ? "bg-amber-400 text-[#080F1E]" :
                "bg-white/10 text-slate-500"
              }`}>{i < step ? "✓" : i+1}</div>
              <span className={`text-xs font-medium ${i === step ? "text-white" : "text-slate-500"}`}>{s}</span>
              {i < STEPS.length-1 && <div className={`w-6 h-px ${i < step ? "bg-emerald-400/50" : "bg-white/10"}`}/>}
            </div>
          ))}
        </div>

        <div className="bg-[#0D1628] border border-white/5 rounded-2xl p-6 space-y-5">
          {/* Step 0: Personal */}
          {step === 0 && (
            <>
              <h2 className="font-bold text-lg">Personal Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name" name="first_name" value={form.first_name} onChange={update} required />
                <Input label="Middle Initial" name="middle_init" value={form.middle_init} onChange={update} maxLength={2} placeholder="J" />
              </div>
              <Input label="Last Name" name="last_name" value={form.last_name} onChange={update} required />
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">SSN <span className="text-amber-400">*</span></label>
                <input type="text" value={form.ssn} onChange={handleSSN} placeholder="333-33-3333" maxLength={11}
                  className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 font-mono tracking-wider"/>
                <p className="text-xs text-slate-600 mt-1">Auto-formatted as XXX-XX-XXXX</p>
              </div>
              <Input label="Email" name="email" value={form.email} onChange={update} type="email" placeholder="client@email.com" />
              <Input label="Phone" name="phone" value={form.phone} onChange={update} placeholder="(555) 000-0000" />
            </>
          )}

          {/* Step 1: Address */}
          {step === 1 && (
            <>
              <h2 className="font-bold text-lg">Address</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Street Address <span className="text-amber-400">*</span></label>
                <AddressAutocomplete value={form.address} onChange={v => setForm(f=>({...f,address:v}))}
                  onSelect={({address,city,state,zip}) => setForm(f=>({...f,address,city,state,zip}))} />
                <p className="text-xs text-slate-600 mt-1">Start typing — we'll suggest verified addresses</p>
              </div>
              <Input label="Apt / Unit (optional)" name="apt" value={form.apt||""} onChange={update} placeholder="Apt 4B" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="City" name="city" value={form.city} onChange={update} required />
                <Input label="State" name="state" value={form.state} onChange={update} placeholder="NY" maxLength={2} required />
              </div>
              <Input label="ZIP Code" name="zip" value={form.zip} onChange={update} required />
            </>
          )}

          {/* Step 2: Bank */}
          {step === 2 && (
            <>
              <h2 className="font-bold text-lg">Bank Information <span className="text-slate-500 text-sm font-normal">(optional)</span></h2>
              <p className="text-xs text-slate-500">Used to populate the refund direct deposit section on 1040 forms.</p>
              <Input label="Routing Number" name="routing" value={form.routing} onChange={update} placeholder="021000021" maxLength={9} />
              <Input label="Account Number" name="account" value={form.account} onChange={update} placeholder="123456789" />
            </>
          )}

          {/* Step 3: Signature + Years */}
          {step === 3 && (
            <>
              <h2 className="font-bold text-lg">Signature & Tax Years</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Select Tax Years</label>
                <div className="flex gap-3">
                  {YEARS.map(y => (
                    <button key={y} type="button" onClick={() => toggleYear(y)}
                      className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${
                        form.years.includes(y) ? "bg-amber-400 border-amber-400 text-[#080F1E]" : "bg-white/5 border-white/10 text-slate-400 hover:border-amber-400/30"
                      }`}>{y}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Client Signature</label>
                {sigDataUrl ? (
                  <div className="space-y-2">
                    <div className="border border-emerald-400/30 rounded-xl bg-white p-2" style={{height:80}}>
                      <img src={sigDataUrl} className="h-full object-contain" alt="signature"/>
                    </div>
                    <button type="button" onClick={() => setSigDataUrl(null)} className="text-xs text-slate-400 hover:text-white transition-colors">Re-sign</button>
                  </div>
                ) : (
                  <SignaturePad onSave={setSigDataUrl} />
                )}
                <p className="text-xs text-slate-500 mt-1">Draw signature above — it will appear on 1040 forms</p>
              </div>
              {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-3">{error}</p>}
            </>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s=>s-1)}
                className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl text-sm transition-colors">
                Back
              </button>
            )}
            <button type="button" disabled={!canAdvance() || generating}
              onClick={step < STEPS.length-1 ? () => setStep(s=>s+1) : submit}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                canAdvance() && !generating
                  ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E]"
                  : "bg-white/10 text-slate-500 cursor-not-allowed"
              }`}>
              {generating ? "Saving..." : step < STEPS.length-1 ? "Continue →" : "Add Client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
