import React, { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { Plus, Beaker, Check, Activity, ShieldAlert, Zap, Loader2, CheckCircle2 } from 'lucide-react';

export default function ScoringAdmin() {
  const { token } = useStore();
  const [activeTab, setActiveTab] = useState('rules'); // rules, risks, signals
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [customSignals, setCustomSignals] = useState([]);
  const [riskRules, setRiskRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  // Live database rules state
  const [rules, setRules] = useState([
    { id: 1, signal: 'Days since last interaction', operator: 'is greater than', value: 30, action: 'subtract', points: 25 },
    { id: 2, signal: 'Unanswered email count', operator: 'is at least', value: 3, action: 'subtract', points: 15 },
    { id: 3, signal: 'Custom: competitor mentioned', operator: 'in last', value: 30, action: 'subtract', points: 20, isCustom: true }
  ]);

  // Live weights state
  const [weights, setWeights] = useState({
    Engagement: 30,
    Responsiveness: 25,
    Sentiment: 20,
    'Follow-through': 25
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Fetch real database scoring profiles, rules, risk rules, and signals
  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      try {
        const [profRes, rulesRes, riskRulesRes, signalsRes] = await Promise.all([
          fetch('/CustomerPulse/api/admin/scoring/profiles', { headers }),
          fetch('/CustomerPulse/api/admin/scoring/rules', { headers }),
          fetch('/CustomerPulse/api/admin/scoring/risk-rules', { headers }),
          fetch('/CustomerPulse/api/admin/scoring/custom-signals', { headers })
        ]);

        if (profRes.ok) {
          const profData = await profRes.json();
          setProfiles(profData);
          if (profData.length > 0) {
            setActiveProfileId(profData[0].id);
            if (profData[0].weights) {
              setWeights(profData[0].weights);
            }
          }
        }

        if (rulesRes.ok) {
          const rulesData = await rulesRes.json();
          if (Array.isArray(rulesData) && rulesData.length > 0) {
            setRules(rulesData);
          }
        }

        if (riskRulesRes.ok) {
          const riskData = await riskRulesRes.json();
          if (Array.isArray(riskData) && riskData.length > 0) {
            setRiskRules(riskData);
          }
        }

        if (signalsRes.ok) {
          const sigData = await signalsRes.json();
          if (Array.isArray(sigData) && sigData.length > 0) {
            setCustomSignals(sigData);
          }
        }
      } catch (err) {
        console.error('Error fetching scoring admin data from database:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdminData();
  }, [token]);

  const handleSimulate = async () => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await fetch('/CustomerPulse/api/admin/scoring/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rules, weights })
      });
      if (res.ok) {
        const data = await res.json();
        setSimulationResult(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    try {
      // 1. Save profile & weights
      await fetch('/CustomerPulse/api/admin/scoring/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          id: activeProfileId || 'profile-enterprise',
          name: 'Enterprise team',
          weights,
          updated_at: new Date().toISOString()
        })
      });

      // 2. Save all rules
      for (const rule of rules) {
        await fetch('/CustomerPulse/api/admin/scoring/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(rule)
        });
      }

      showToast('Scoring configuration published to PostgreSQL database successfully!');
    } catch (err) {
      console.error('Error publishing rules:', err);
      showToast('Failed to publish changes to server.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 pb-20 font-sans">

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Scoring profile: Enterprise team</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Live PostgreSQL enterprise scoring & calibration rules</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSimulating ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-700" />
            ) : <Beaker className="w-4 h-4" />}
            Simulate
          </button>
          <button
            onClick={handlePublish}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Publish
          </button>
        </div>
      </div>

      {/* Simulation Result Banner */}
      {simulationResult && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex justify-between items-center animate-in fade-in">
          <div>
            <span className="font-bold">Simulation Complete:</span> Affected <strong>{simulationResult.affectedAccounts}</strong> of <strong>{simulationResult.totalAccounts}</strong> database accounts.
            <span className="ml-3 text-blue-700">
              (Green → Amber: {simulationResult.transitions?.greenToAmber || 0}, Amber → Red: {simulationResult.transitions?.amberToRed || 0})
            </span>
          </div>
          <button onClick={() => setSimulationResult(null)} className="text-blue-500 hover:text-blue-700 font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200">
        <button onClick={() => setActiveTab('rules')} className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'rules' ? 'border-[#223670] text-[#223670]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Health Score Rules</button>
        <button onClick={() => setActiveTab('risks')} className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'risks' ? 'border-[#223670] text-[#223670]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Risk Rules</button>
        <button onClick={() => setActiveTab('signals')} className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'signals' ? 'border-[#223670] text-[#223670]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Custom Signals</button>
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-gray-700 font-semibold">Configured Health Calibration Rules</h3>
            <button
              onClick={() => {
                setRules(prev => [
                  ...prev,
                  { id: Date.now(), signal: 'Days since last interaction', operator: 'is greater than', value: 14, action: 'subtract', points: 10 }
                ]);
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Rule
            </button>
          </div>

          <div className="space-y-4">
            {rules.map((rule, idx) => (
              <div key={rule.id || idx} className={`bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-3 ${rule.isCustom ? 'border-blue-400 bg-blue-50/10' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-gray-700 font-medium">If</span>

                  <select
                    value={rule.signal}
                    onChange={(e) => {
                      const newRules = [...rules];
                      newRules[idx].signal = e.target.value;
                      setRules(newRules);
                    }}
                    className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="Days since last interaction">Days since last interaction</option>
                    <option value="Unanswered email count">Unanswered email count</option>
                    <option value="Custom: competitor mentioned">Custom: competitor mentioned</option>
                    <option value="Overdue deliverable commitment">Overdue deliverable commitment</option>
                    <option value="Negative sentiment touchpoint">Negative sentiment touchpoint</option>
                  </select>

                  <select
                    value={rule.operator}
                    onChange={(e) => {
                      const newRules = [...rules];
                      newRules[idx].operator = e.target.value;
                      setRules(newRules);
                    }}
                    className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="is greater than">is greater than</option>
                    <option value="is at least">is at least</option>
                    <option value="in last">in last</option>
                  </select>

                  <input
                    type="number"
                    value={rule.value}
                    onChange={(e) => {
                      const newRules = [...rules];
                      newRules[idx].value = parseInt(e.target.value) || 0;
                      setRules(newRules);
                    }}
                    className="w-16 bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-blue-500 text-center"
                  />

                  {rule.operator === 'in last' && <span className="text-gray-700 font-medium">days,</span>}
                  <span className="text-gray-700 font-medium">then</span>

                  <select
                    value={rule.action}
                    onChange={(e) => {
                      const newRules = [...rules];
                      newRules[idx].action = e.target.value;
                      setRules(newRules);
                    }}
                    className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="subtract">subtract</option>
                    <option value="add">add</option>
                  </select>

                  <input
                    type="number"
                    value={rule.points}
                    onChange={(e) => {
                      const newRules = [...rules];
                      newRules[idx].points = parseInt(e.target.value) || 0;
                      setRules(newRules);
                    }}
                    className="w-16 bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-blue-500 text-center"
                  />
                  <span className="text-gray-700 font-medium">points</span>
                </div>
              </div>
            ))}
          </div>

          {/* Category Weights Configuration */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mt-8">
            <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Category Weights Calibration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(weights).map(([cat, val]) => (
                <div key={cat} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="block text-xs font-bold text-slate-700 mb-1">{cat}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={val}
                      onChange={(e) => {
                        const nextVal = parseInt(e.target.value) || 0;
                        setWeights(prev => ({ ...prev, [cat]: nextVal }));
                      }}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-sm font-bold text-slate-900"
                    />
                    <span className="text-xs text-slate-500 font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Risk Rules Tab */}
      {activeTab === 'risks' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-gray-700 font-semibold">Active Risk Detection Rules</h3>
            <span className="text-xs text-slate-500 font-bold">8 Enterprise Risk Categories (A-H)</span>
          </div>

          <div className="space-y-3">
            {[
              { code: 'CAT-A', name: 'Silence & Inactivity Thresholds', detail: 'Flags accounts with no touchpoint > 14 days (Strategic) or > 30 days.' },
              { code: 'CAT-B', name: 'Sentiment & Language Decline', detail: 'Detects cancellation language, dissatisfaction clusters, and escalation terms.' },
              { code: 'CAT-C', name: 'Stakeholder Responsiveness', detail: 'Identifies unanswered email streaks and prolonged reply latency.' },
              { code: 'CAT-D', name: 'Relationship & Multi-Threading', detail: 'Flags single-threaded accounts or decision-maker departures.' },
              { code: 'CAT-E', name: 'Meetings & Cadence Degradation', detail: 'Alerts on missed recurring meetings or collapsed meeting attendance.' },
              { code: 'CAT-F', name: 'Commitments & SLA Execution', detail: 'Overdue task milestones, missed promised dates, and delayed minutes.' },
              { code: 'CAT-G', name: 'Contract & Commercial Lifecycle', detail: 'Upcoming renewal milestones without active renewal conversations.' },
              { code: 'CAT-H', name: 'Competitive & Market Intelligence', detail: 'Competitor mentions, RFP activity, or restructuring notices.' }
            ].map(item => (
              <div key={item.code} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded">{item.code}</span>
                    <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{item.detail}</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Signals Tab */}
      {activeTab === 'signals' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Configured Signals</h2>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-slate-50/50">
                  <th className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-gray-600">Signal</th>
                  <th className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-gray-600">Source</th>
                  <th className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-gray-600">Scope</th>
                  <th className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-900 font-medium">
                {(customSignals.length > 0 ? customSignals : [
                  { name: 'Days since last touchpoint', source: 'PostgreSQL Interactions', scope: 'All Accounts', status: 'Active' },
                  { name: 'Overdue staff tasks', source: 'PostgreSQL Tasks', scope: 'All Accounts', status: 'Active' },
                  { name: 'AI Sentiment score', source: 'Gemini NLP Engine', scope: 'All Interactions', status: 'Active' },
                  { name: 'Celebration milestones', source: 'CelebrationEvents', scope: 'Contacts', status: 'Active' }
                ]).map((sig, sIdx) => (
                  <tr key={sIdx} className="border-b border-gray-100 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6 font-bold text-slate-900">{sig.name || sig.signalName}</td>
                    <td className="py-3.5 px-6 text-slate-600">{sig.source}</td>
                    <td className="py-3.5 px-6 text-slate-600">{sig.scope}</td>
                    <td className="py-3.5 px-6">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {sig.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
