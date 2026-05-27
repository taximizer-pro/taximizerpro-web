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
    const houseNum = a.house_number || "";
    const road = a.road || "";
    const streetAddr = (houseNum + " " + road).trim();
    update("address", streetAddr);
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

  async function handleSubmit() {
    const sigData = getSigData();
    if (!sigData) {
      alert("Please provide your signature before submitting.");
      return;
    }
    setSaving(true);
    try {
      const taxYearsStr = Array.isArray(form.tax_year) ? form.tax_year.join(",") : form.tax_year;
      const fullName = [form.first_name, form.middle_init, form.last_name].filter(Boolean).join(" ");

      // Build address — append apt directly if present
      // Only append apt if it's a real non-empty value
      const aptClean = (form.apt || "").trim().replace(/^(apt\.?|unit|#)\s*/i, "");
      const fullAddress = aptClean ? `${form.address} ${aptClean}`.trim() : form.address;

      // Format SSN as digits only
      const ssnClean = (form.ssn || "").replace(/\D/g, "");

      await TaxClient.create({
        ...form,
        address: fullAddress,
        apt: null,
        ssn: ssnClean,
        full_name: fullName,
        tax_year: taxYearsStr,
        signature_url: sigData,
        current_step: 1,
        occupation: "HELPER",
        irs_status: "pending",
      });

      navigate("/clients");
    } catch (e) {
      console.error(e);
      alert("Error saving client. Please try again.");
    }
    setSaving(false);
  }

  const canProceed = () => {
    if (step === 0) return form.first_name && form.last_name && form.dob && form.ssn;
    if (step === 1) return form.address && form.city && form.state && form.zip;
    if (step === 2) return form.bank_routing && form.bank_account;
    if (step === 3) return (Array.isArray(form.tax_year) ? form.tax_year : form.tax_year?.split(",") || []).length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">New Client</h1>
        <p className="text-xs text-slate-500">Complete all steps to create a client record</p>
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

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">{STEPS[step]}</h2>

          {/* Step 0: Personal Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name *</label>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Last Name *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.last_name} onChange={e => update("last_name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth *</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.dob} onChange={e => update("dob", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SSN *</label>
                  <input placeholder="9 digits, no dashes" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.ssn} onChange={e => update("ssn", e.target.value.replace(/\D/g, "").slice(0, 9))} maxLength={9} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                  <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.email} onChange={e => update("email", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Street Address *</label>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Apt / Unit (Optional)</label>
                <input placeholder="Optional" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.apt} onChange={e => update("apt", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">City *</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.city} onChange={e => update("city", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State *</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.state} onChange={e => update("state", e.target.value)}>
                    <option value="">--</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ZIP *</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.zip} onChange={e => update("zip", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Financial */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bank Routing Number *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.bank_routing} onChange={e => update("bank_routing", e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bank Account Number *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.bank_account} onChange={e => update("bank_account", e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Refund Amount (estimated)</label>
                <input type="number" placeholder="0.00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.refund_amount || ""} onChange={e => update("refund_amount", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.notes} onChange={e => update("notes", e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 3: Tax Years */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Select all applicable tax years:</p>
              <div className="grid grid-cols-3 gap-3">
                {["2023", "2024", "2025"].map(year => {
                  const years = Array.isArray(form.tax_year) ? form.tax_year : (form.tax_year ? form.tax_year.split(",") : []);
                  const selected = years.includes(year);
                  return (
                    <button key={year}
                      onClick={() => toggleYear(year)}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${selected ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 hover:border-slate-300 text-slate-700"}`}>
                      <div className="text-xl font-bold">{year}</div>
                      <div className="text-xs mt-1">{selected ? "✓ Selected" : "Click to select"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Sign */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                By signing below, you authorize TaximizerPro to prepare and file your tax return(s).
              </p>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-600">Signature *</label>
                  <button onClick={clearSig} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                </div>
                <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-white">
                  <SignaturePad
                    ref={sigPad}
                    canvasProps={{ className: "w-full", height: 160 }}
                    backgroundColor="white"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Sign with your mouse or touch</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                After submitting, your forms will be automatically generated and sent to your email.
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed">
              ← Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="px-6 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors">
                {saving ? "Submitting..." : "Submit Client"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
