import { useState, useRef } from "react";
import { TaxClient } from "@/api/entities";
import { useNavigate } from "react-router-dom";
import SignaturePad from "react-signature-canvas";

const STEPS = ["Personal Info", "Address", "Financial", "Tax Years", "Sign & Submit"];

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function NewClient() {
  const navigate = useNavigate();
  const sigPad = useRef(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAsProspect, setSavedAsProspect] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [form, setForm] = useState({
    first_name: "", middle_init: "", last_name: "",
    dob: "", ssn: "", email: "", phone: "",
    address: "", apt: "", city: "", state: "", zip: "",
    bank_routing: "", bank_account: "",
    tax_year: [], filing_status: "pending",
    signature_url: "", notes: ""
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleYear = (year) => {
    setForm(prev => {
      const years = Array.isArray(prev.tax_year) ? prev.tax_year : (prev.tax_year ? prev.tax_year.split(",") : []);
      const next = years.includes(year) ? years.filter(y => y !== year) : [...years, year];
      return { ...prev, tax_year: next };
    });
  };

  async function searchAddress(q) {
    if (q.length < 4) return setAddressSuggestions([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&countrycodes=us`);
      const data = await res.json();
      setAddressSuggestions(data);
    } catch { setAddressSuggestions([]); }
  }

  function selectAddress(item) {
    const a = item.address || {};
    update("address", ((a.house_number || "") + " " + (a.road || "")).trim());
    update("city", a.city || a.town || a.village || a.county || "");
    update("state", a.state_code || a.state || "");
    update("zip", a.postcode || "");
    setAddressSuggestions([]);
  }

  function clearSig() { sigPad.current?.clear(); }

  function getSigData() {
    if (!sigPad.current || sigPad.current.isEmpty()) return null;
    return sigPad.current.toDataURL("image/png");
  }

  // ── Prospect: requires ONLY first name, last name, dob, ssn ─────────────────
  const canSaveProspect = () =>
    form.first_name.trim() && form.last_name.trim() && form.dob && form.ssn.length === 9;

  // ── Full submit: requires all fields + signature ─────────────────────────────
  const canProceed = () => {
    if (step === 0) return form.first_name.trim() && form.last_name.trim() && form.dob && form.ssn.length === 9;
    if (step === 1) return form.address.trim() && form.city.trim() && form.state && form.zip.trim();
    if (step === 2) return form.bank_routing.trim() && form.bank_account.trim();
    if (step === 3) return (Array.isArray(form.tax_year) ? form.tax_year : (form.tax_year?.split(",") || [])).filter(Boolean).length > 0;
    return true;
  };

  function buildPayload(isProspect = false) {
    const taxYearsStr = Array.isArray(form.tax_year) ? form.tax_year.join(",") : form.tax_year;
    const fullName = [form.first_name, form.middle_init, form.last_name].filter(Boolean).join(" ");
    const ssnClean = (form.ssn || "").replace(/\D/g, "");
    const aptRaw = (form.apt || "").trim();
    const BAD = new Set(["", "none", "null", "apt", "apt.", "#", "unit", "n/a", "na"]);
    const aptClean = BAD.has(aptRaw.toLowerCase()) ? "" : aptRaw;
    const fullAddress = aptClean ? `${form.address.trim()} ${aptClean}` : form.address.trim();

    return {
      ...form,
      address: fullAddress,
      apt: aptClean || null,
      ssn: ssnClean,
      full_name: fullName,
      tax_year: taxYearsStr,
      occupation: "HELPER",
      current_step: isProspect ? 0 : 1,
      irs_status: isProspect ? "prospect" : "pending",
      filing_status: isProspect ? "prospect" : "pending",
    };
  }

  // ── Save as Prospect ─────────────────────────────────────────────────────────
  async function handleSaveProspect() {
    setSaving(true);
    try {
      await TaxClient.create(buildPayload(true));
      setSavedAsProspect(true);
    } catch (e) {
      console.error(e);
      alert("Error saving prospect. Please try again.");
    }
    setSaving(false);
  }

  // ── Full Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const sigData = getSigData();
    if (!sigData) {
      alert("Please provide your signature before submitting.");
      return;
    }
    setSaving(true);
    try {
      await TaxClient.create({ ...buildPayload(false), signature_url: sigData });
      navigate("/clients");
    } catch (e) {
      console.error(e);
      alert("Error saving client. Please try again.");
    }
    setSaving(false);
  }

  // ── Prospect saved confirmation screen ───────────────────────────────────────
  if (savedAsProspect) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl">📋</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">Saved as Prospect</h2>
          <p className="text-sm text-slate-500">
            <strong className="text-slate-800">{form.first_name} {form.last_name}</strong> has been saved.
            An admin can open their record later to complete the remaining details and submit for filing.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate("/clients")}
              className="flex-1 bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors">
              View All Clients
            </button>
            <button
              onClick={() => { setForm({ first_name:"",middle_init:"",last_name:"",dob:"",ssn:"",email:"",phone:"",address:"",apt:"",city:"",state:"",zip:"",bank_routing:"",bank_account:"",tax_year:[],filing_status:"pending",signature_url:"",notes:"" }); setStep(0); setSavedAsProspect(false); }}
              className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-amber-400 transition-colors">
              Add Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">New Client</h1>
            <p className="text-xs text-slate-500">Complete all steps to file, or save as prospect anytime</p>
          </div>
          {/* Save as Prospect — available from step 0 once name/dob/ssn are filled */}
          {canSaveProspect() && step < 4 && (
            <button
              onClick={handleSaveProspect}
              disabled={saving}
              className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "💾 Save as Prospect"}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold
                ${i < step ? "bg-blue-700 text-white" : i === step ? "bg-blue-700 text-white ring-4 ring-blue-100" : "bg-slate-200 text-slate-500"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 sm:w-12 mx-1 ${i < step ? "bg-blue-700" : "bg-slate-200"}`}></div>
              )}
            </div>
          ))}
        </div>

        {/* Prospect info banner — shows on step 0 when minimum fields filled */}
        {step === 0 && canSaveProspect() && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-amber-500 text-lg mt-0.5">💡</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              Minimum info captured. You can <strong>save as prospect now</strong> and finish the rest later — or keep going to complete the full filing.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">{STEPS[step]}</h2>

          {/* Step 0: Personal Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name <span className="text-red-500">*</span></label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.first_name} onChange={e => update("first_name", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">M.I.</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={1} value={form.middle_init} onChange={e => update("middle_init", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Last Name <span className="text-red-500">*</span></label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.last_name} onChange={e => update("last_name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth <span className="text-red-500">*</span></label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.dob} onChange={e => update("dob", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SSN <span className="text-red-500">*</span></label>
                  <input placeholder="9 digits, no dashes"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.ssn} onChange={e => update("ssn", e.target.value.replace(/\D/g, "").slice(0, 9))} maxLength={9} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.email} onChange={e => update("email", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="tel" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.phone} onChange={e => update("phone", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Address */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-slate-600 mb-1">Street Address <span className="text-red-500">*</span></label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.address}
                  onChange={e => { update("address", e.target.value); searchAddress(e.target.value); }} />
                {addressSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {addressSuggestions.map((s, i) => (
                      <button key={i} onClick={() => selectAddress(s)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0">
                        {s.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Apt / Unit <span className="text-slate-400 font-normal">(optional)</span></label>
                <input placeholder="e.g. 4B" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.apt} onChange={e => update("apt", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City <span className="text-red-500">*</span></label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.city} onChange={e => update("city", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State <span className="text-red-500">*</span></label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.state} onChange={e => update("state", e.target.value)}>
                    <option value="">Select</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ZIP Code <span className="text-red-500">*</span></label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.zip} onChange={e => update("zip", e.target.value.replace(/\D/g,"").slice(0,5))} maxLength={5} />
              </div>
            </div>
          )}

          {/* Step 2: Financial */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bank Routing Number <span className="text-red-500">*</span></label>
                <input placeholder="9 digits"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.bank_routing} onChange={e => update("bank_routing", e.target.value.replace(/\D/g,"").slice(0,9))} maxLength={9} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bank Account Number <span className="text-red-500">*</span></label>
                <input placeholder="Account number"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.bank_account} onChange={e => update("bank_account", e.target.value)} />
              </div>
              <p className="text-xs text-slate-400">This information is used for direct deposit on the 1040.</p>
            </div>
          )}

          {/* Step 3: Tax Years */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Select all tax years to file for this client:</p>
              <div className="grid grid-cols-3 gap-3">
                {["2023","2024","2025"].map(year => {
                  const selected = (Array.isArray(form.tax_year) ? form.tax_year : (form.tax_year?.split(",") || [])).includes(year);
                  return (
                    <button key={year} onClick={() => toggleYear(year)}
                      className={`py-4 rounded-xl border-2 text-sm font-bold transition-all
                        ${selected ? "border-blue-700 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                      {year}
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea rows={3} placeholder="Any notes for this client…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={form.notes} onChange={e => update("notes", e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 4: Sign & Submit */}
          {step === 4 && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wide mb-3">Filing Summary</h3>
                <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="font-medium text-slate-800">{[form.first_name, form.middle_init, form.last_name].filter(Boolean).join(" ")}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">SSN</span><span className="font-medium text-slate-800">***-**-{form.ssn.slice(-4)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Address</span><span className="font-medium text-slate-800 text-right max-w-[55%]">{form.address}{form.apt ? ` ${form.apt}` : ""}, {form.city}, {form.state} {form.zip}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Bank Routing</span><span className="font-medium text-slate-800">{form.bank_routing}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Account</span><span className="font-medium text-slate-800">****{form.bank_account.slice(-4)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Tax Years</span><span className="font-medium text-slate-800">{Array.isArray(form.tax_year) ? form.tax_year.join(", ") : form.tax_year}</span></div>
              </div>

              {/* Signature */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Client Signature <span className="text-red-500">*</span></label>
                <div className="border-2 border-slate-200 rounded-xl overflow-hidden bg-white">
                  <SignaturePad ref={sigPad} canvasProps={{ className: "w-full", height: 140 }} penColor="#1e293b" />
                </div>
                <button onClick={clearSig} className="mt-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">Clear signature</button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                By signing above, the client authorizes the preparation and electronic filing of their federal tax return(s) for the selected year(s).
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            ← Back
          </button>

          <div className="flex gap-3">
            {/* Save as Prospect — shown on all steps before final if minimum met */}
            {step < 4 && canSaveProspect() && (
              <button
                onClick={handleSaveProspect}
                disabled={saving}
                className="px-4 py-2.5 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50">
                {saving ? "Saving…" : "Save as Prospect"}
              </button>
            )}

            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="px-5 py-2.5 text-sm font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-6 py-2.5 text-sm font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving ? (
                  <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> Saving…</>
                ) : "✅ Sign & Submit"}
              </button>
            )}
          </div>
        </div>

        {/* Bottom hint */}
        {step < 4 && !canSaveProspect() && (
          <p className="text-center text-xs text-slate-400 mt-4">
            Fill in name, date of birth &amp; SSN to unlock <strong>Save as Prospect</strong>
          </p>
        )}
      </div>
    </div>
  );
}
