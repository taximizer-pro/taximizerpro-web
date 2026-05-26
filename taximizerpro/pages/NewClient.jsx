
import { useState } from "react";
import { Client } from "@/api/entities";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function InputField({ label, name, value, onChange, type="text", required, placeholder, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-amber-400">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 focus:bg-white/8 transition-all"
      />
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

export default function NewClient() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: "", last_name: "", middle_init: "",
    ssn: "", dob: "", email: "", phone: "",
    address: "", apt: "", city: "", state: "FL", zip: "",
    bank_routing: "", bank_account: "",
    filing_status: "single", occupation: "HELPER", notes: "",
  });

  const set = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

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
    { n: 1, label: "Personal Info" },
    { n: 2, label: "Address" },
    { n: 3, label: "Banking" },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0D1F3C]">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-4">
          <Link to={createPageUrl("Clients")} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">New Client</h1>
            <p className="text-xs text-slate-500">Enter client information below</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <button
                onClick={() => setStep(s.n)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  step === s.n
                    ? "bg-amber-400 text-[#0A1628]"
                    : step > s.n
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-white/5 text-slate-500 border border-white/10"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s.n ? "bg-[#0A1628]/20" : ""}`}>
                  {step > s.n ? "✓" : s.n}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && <div className="w-8 h-px bg-white/10" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-[#0D1F3C] border border-white/10 rounded-2xl p-6 space-y-5">
            {step === 1 && (
              <>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Personal Information</h2>
                <div className="grid grid-cols-3 gap-4">
                  <InputField label="First Name" name="first_name" value={form.first_name} onChange={set} required placeholder="John" />
                  <InputField label="M.I." name="middle_init" value={form.middle_init} onChange={set} placeholder="A" />
                  <InputField label="Last Name" name="last_name" value={form.last_name} onChange={set} required placeholder="Smith" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="SSN" name="ssn" value={form.ssn} onChange={set} required placeholder="123-45-6789" hint="9 digits, no dashes needed" />
                  <InputField label="Date of Birth" name="dob" value={form.dob} onChange={set} type="date" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Email" name="email" value={form.email} onChange={set} type="email" placeholder="client@email.com" />
                  <InputField label="Phone" name="phone" value={form.phone} onChange={set} placeholder="(305) 000-0000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Filing Status</label>
                  <select name="filing_status" value={form.filing_status} onChange={set}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                    <option value="single">Single</option>
                    <option value="mfj">Married Filing Jointly</option>
                    <option value="mfs">Married Filing Separately</option>
                    <option value="hoh">Head of Household</option>
                  </select>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Address</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <InputField label="Street Address" name="address" value={form.address} onChange={set} required placeholder="123 Main St" />
                  </div>
                  <InputField label="Apt / Unit" name="apt" value={form.apt} onChange={set} placeholder="4B" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <InputField label="City" name="city" value={form.city} onChange={set} required placeholder="Miami" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">State <span className="text-amber-400">*</span></label>
                    <select name="state" value={form.state} onChange={set}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400/60 transition-all">
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <InputField label="ZIP" name="zip" value={form.zip} onChange={set} required placeholder="33139" />
                </div>
                <div>
                  <InputField label="Notes" name="notes" value={form.notes} onChange={set} placeholder="Any special instructions..." />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Banking — Refund Deposit</h2>
                <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4 flex gap-3">
                  <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-amber-200/80">Bank information is used for direct deposit of IRS refunds. This data is stored securely and never shared.</p>
                </div>
                <InputField label="Routing Number" name="bank_routing" value={form.bank_routing} onChange={set} placeholder="9-digit routing number" hint="Found at the bottom left of a check" />
                <InputField label="Account Number" name="bank_account" value={form.bank_account} onChange={set} placeholder="Account number" />
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Account Type</label>
                  <div className="flex gap-3">
                    {["Checking","Savings"].map(t => (
                      <button key={t} type="button"
                        className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all bg-white/5 border-white/10 text-slate-400 hover:border-amber-400/30">
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={() => setStep(s => Math.max(1, s - 1))}
              className={`px-6 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:border-white/20 transition-all ${step === 1 ? "opacity-0 pointer-events-none" : ""}`}
            >
              ← Back
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                className="bg-amber-400 hover:bg-amber-300 text-[#0A1628] font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A1628] font-semibold text-sm px-8 py-2.5 rounded-xl transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-[#0A1628]/30 border-t-[#0A1628] rounded-full animate-spin" /> Saving...</>
                ) : "Save Client →"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
