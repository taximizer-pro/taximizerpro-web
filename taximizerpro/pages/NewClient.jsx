import { useState, useRef, useEffect, useCallback } from "react";
import { Client } from "@/api/entities";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

// ── Free address autocomplete via Nominatim (OpenStreetMap) — no key required ──
function useAddressSearch(query, setForm) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!query || query.length < 5) { setSuggestions([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=6&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "TaximizerPro/1.0" } });
        const data = await res.json();
        setSuggestions(data.filter(d => d.address?.road));
        setOpen(true);
      } catch { setSuggestions([]); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function pick(item) {
    const a = item.address;
    const houseNum = a.house_number || "";
    const road = a.road || "";
    const city = a.city || a.town || a.village || a.county || "";
    const state = a.state_code?.toUpperCase() || a.state?.slice(0,2).toUpperCase() || "";
    const zip = a.postcode?.split("-")[0] || "";
    setForm(f => ({ ...f, address: `${houseNum} ${road}`.trim(), city, state, zip }));
    setSuggestions([]);
    setOpen(false);
  }

  return { suggestions, open, setOpen, pick };
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-amber-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ name, value, onChange, type = "text", placeholder, ...rest }) {
  return (
    <input
      type={type} name={name} value={value} onChange={onChange}
      placeholder={placeholder} {...rest}
      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all"
    />
  );
}

export default function NewClient() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: "", middle_init: "", last_name: "",
    ssn: "", dob: "", email: "", phone: "",
    address: "", apt: "", city: "", state: "FL", zip: "",
    bank_routing: "", bank_account: "",
    filing_status: "single",
  });

  const set = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const { suggestions, open, setOpen, pick } = useAddressSearch(form.address, setForm);

  function handleSSN(e) {
    let v = e.target.value.replace(/\D/g, "").slice(0, 9);
    if (v.length > 5) v = `${v.slice(0,3)}-${v.slice(3,5)}-${v.slice(5)}`;
    else if (v.length > 3) v = `${v.slice(0,3)}-${v.slice(3)}`;
    setForm(f => ({ ...f, ssn: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const client = await Client.create(form);
      navigate(createPageUrl("ClientDetail") + `?id=${client.id}`);
    } catch (err) {
      alert("Error saving client: " + err.message);
      setSaving(false);
    }
  }

  const steps = [
    { n: 1, label: "Personal" },
    { n: 2, label: "Address" },
    { n: 3, label: "Banking" },
  ];

  const canProceed = {
    1: form.first_name && form.last_name && form.ssn?.length >= 9,
    2: form.address && form.city && form.state && form.zip,
    3: true,
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-4">
          <Link to={createPageUrl("Clients")} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold">New Client</h1>
            <p className="text-xs text-slate-500">Complete all three steps to save</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Step Pills */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => step > s.n && setStep(s.n)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  step === s.n ? "bg-amber-400 text-[#0A1628]"
                  : step > s.n ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer"
                  : "bg-white/5 text-slate-500 border border-white/10 cursor-default"
                }`}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background:'rgba(255,255,255,0.1)'}}>
                  {step > s.n ? "✓" : s.n}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && <div className="w-6 h-px bg-white/10 flex-shrink-0" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-6 space-y-5">

            {/* ── STEP 1: PERSONAL ── */}
            {step === 1 && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Personal Information</p>
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-3">
                    <Field label="First Name" required>
                      <Input name="first_name" value={form.first_name} onChange={set} placeholder="John" required />
                    </Field>
                  </div>
                  <div className="col-span-1">
                    <Field label="M.I.">
                      <Input name="middle_init" value={form.middle_init} onChange={set} placeholder="A" maxLength={1} />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Last Name" required>
                      <Input name="last_name" value={form.last_name} onChange={set} placeholder="Smith" required />
                    </Field>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SSN" required hint="Auto-formats as you type">
                    <Input name="ssn" value={form.ssn} onChange={handleSSN} placeholder="123-45-6789" required />
                  </Field>
                  <Field label="Date of Birth">
                    <Input name="dob" value={form.dob} onChange={set} type="date" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Email">
                    <Input name="email" value={form.email} onChange={set} type="email" placeholder="client@email.com" />
                  </Field>
                  <Field label="Phone">
                    <Input name="phone" value={form.phone} onChange={set} placeholder="(305) 000-0000" />
                  </Field>
                </div>
                <Field label="Filing Status">
                  <select name="filing_status" value={form.filing_status} onChange={set}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                    <option value="single">Single</option>
                    <option value="mfj">Married Filing Jointly</option>
                    <option value="mfs">Married Filing Separately</option>
                    <option value="hoh">Head of Household</option>
                    <option value="qss">Qualifying Surviving Spouse</option>
                  </select>
                </Field>
              </>
            )}

            {/* ── STEP 2: ADDRESS ── */}
            {step === 2 && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Address</p>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex gap-2 items-start">
                  <span className="text-blue-400 mt-0.5">📍</span>
                  <p className="text-xs text-blue-300">Start typing a street address — suggestions will appear automatically. Free, no login required.</p>
                </div>

                {/* Address field with dropdown */}
                <div className="relative">
                  <Field label="Street Address" required>
                    <input
                      name="address"
                      value={form.address}
                      onChange={e => { set(e); }}
                      onFocus={() => suggestions.length > 0 && setOpen(true)}
                      placeholder="123 Main St"
                      autoComplete="off"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 transition-all"
                    />
                  </Field>
                  {open && suggestions.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-[#112040] border border-white/15 rounded-xl overflow-hidden shadow-2xl">
                      {suggestions.map((s, i) => {
                        const a = s.address;
                        const line1 = `${a.house_number || ""} ${a.road || ""}`.trim();
                        const line2 = [a.city || a.town || a.village, a.state_code?.toUpperCase(), a.postcode?.split("-")[0]].filter(Boolean).join(", ");
                        return (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={() => pick(s)}
                            className="w-full text-left px-4 py-3 hover:bg-amber-400/10 border-b border-white/5 last:border-0 transition-colors">
                            <div className="text-sm text-white">{line1}</div>
                            <div className="text-xs text-slate-400">{line2}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-1">
                    <Field label="Apt / Unit">
                      <Input name="apt" value={form.apt} onChange={set} placeholder="4B" />
                    </Field>
                  </div>
                  <div className="col-span-3">
                    <Field label="City" required>
                      <Input name="city" value={form.city} onChange={set} placeholder="Miami" required />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <Field label="State" required>
                      <select name="state" value={form.state} onChange={set}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="ZIP" required>
                      <Input name="zip" value={form.zip} onChange={set} placeholder="33139" required maxLength={10} />
                    </Field>
                  </div>
                </div>
              </>
            )}

            {/* ── STEP 3: BANKING ── */}
            {step === 3 && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Banking — Direct Deposit</p>
                <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4 flex gap-3">
                  <span className="text-xl flex-shrink-0">🔒</span>
                  <p className="text-sm text-amber-200/80">Used for IRS refund direct deposit. Stored securely and never shared.</p>
                </div>
                <Field label="Routing Number" hint="9-digit number at the bottom left of a check">
                  <Input name="bank_routing" value={form.bank_routing} onChange={set} placeholder="021000021" maxLength={9} />
                </Field>
                <Field label="Account Number">
                  <Input name="bank_account" value={form.bank_account} onChange={set} placeholder="Account number" />
                </Field>
              </>
            )}
          </div>

          {/* Nav buttons */}
          <div className="flex justify-between mt-6">
            <button type="button" onClick={() => setStep(s => Math.max(1, s - 1))}
              className={`px-6 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:border-white/20 transition-all ${step === 1 ? "invisible" : ""}`}>
              ← Back
            </button>

            {step < 3 ? (
              <button type="button" onClick={() => setStep(s => s + 1)}
                disabled={!canProceed[step]}
                className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-[#0A1628] font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
                Continue →
              </button>
            ) : (
              <button type="submit" disabled={saving}
                className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A1628] font-semibold text-sm px-8 py-2.5 rounded-xl transition-colors flex items-center gap-2">
                {saving
                  ? <><div className="w-4 h-4 border-2 border-[#0A1628]/30 border-t-[#0A1628] rounded-full animate-spin" /> Saving...</>
                  : "✓ Save Client"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
