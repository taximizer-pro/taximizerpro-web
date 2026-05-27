import { useState, useEffect } from "react";
import { TaxClient } from "@/api/entities";
import { Link } from "react-router-dom";

const MILESTONES = [
  { label: "New Client", color: "slate" },
  { label: "Docs Collected", color: "blue" },
  { label: "Forms Generated", color: "indigo" },
  { label: "Client Signed", color: "violet" },
  { label: "Submitted to IRS", color: "amber" },
  { label: "Funded", color: "emerald" },
  { label: "Complete", color: "green" },
];

export default function Tracker() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    try {
      const data = await TaxClient.list();
      setClients(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function moveStep(client, direction) {
    const newStep = Math.max(1, Math.min(7, Math.round(client.current_step || 1) + direction));
    try {
      await TaxClient.update(client.id, { current_step: newStep });
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, current_step: newStep } : c));
    } catch (e) { console.error(e); }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  const byStep = MILESTONES.map((m, i) => ({
    ...m,
    step: i + 1,
    clients: clients.filter(c => Math.round(c.current_step || 1) === i + 1)
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Client Tracker</h1>
        <p className="text-xs text-slate-500">Drag clients through the pipeline</p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-4 p-6 min-w-max">
          {byStep.map((col) => (
            <div key={col.step} className="w-64 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                  <p className="text-xs text-slate-400">{col.clients.length} clients</p>
                </div>
                <div className={`w-6 h-6 rounded-full bg-${col.color}-100 flex items-center justify-center`}>
                  <span className={`text-xs font-bold text-${col.color}-700`}>{col.step}</span>
                </div>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {col.clients.map(client => (
                  <div key={client.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-blue-700">
                          {(client.first_name?.[0] || "") + (client.last_name?.[0] || "")}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{client.full_name}</p>
                        <p className="text-xs text-slate-400">{client.tax_year}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Link to={`/clients/${client.id}`} className="text-xs text-blue-700 hover:underline">View</Link>
                      <div className="flex gap-1">
                        <button onClick={() => moveStep(client, -1)}
                          disabled={Math.round(client.current_step || 1) === 1}
                          className="w-5 h-5 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-xs flex items-center justify-center">
                          ←
                        </button>
                        <button onClick={() => moveStep(client, 1)}
                          disabled={Math.round(client.current_step || 1) === 7}
                          className="w-5 h-5 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-xs flex items-center justify-center">
                          →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {col.clients.length === 0 && (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-300">No clients</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
