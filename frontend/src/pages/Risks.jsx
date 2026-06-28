import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, ShieldCheck, Check, Sparkles, Filter, Building2, Clock, X
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Risks() {
  const navigate = useNavigate();
  const { 
    user,
    risks, 
    risksLoading, 
    fetchRisks, 
    resolveRisk 
  } = useStore();

  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [resolutionComments, setResolutionComments] = useState('');

  useEffect(() => {
    fetchRisks();
  }, []);

  const handleResolveRisk = async (e) => {
    e.preventDefault();
    if (!resolutionComments.trim()) {
      alert("Please enter resolution mitigation comments.");
      return;
    }
    const id = selectedRisk.riskId || selectedRisk.id;
    const success = await resolveRisk(id, resolutionComments);
    if (success) {
      setSelectedRisk(null);
      setResolutionComments('');
      fetchRisks();
    }
  };

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 'High': return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      case 'Medium': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      default: return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
    }
  };

  const filteredRisks = risks.filter(r => {
    const matchSev = severityFilter ? r.severity === severityFilter : true;
    const matchStatus = statusFilter ? r.status === statusFilter : true;
    return matchSev && matchStatus;
  });

  return (
    <div className="space-y-8 select-none">
      
      {/* 1. Header with Filters */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Risk Center Control Panel</h2>
          <p className="text-xs text-slate-400 mt-1">Monitor, evaluate and mitigate active client alerts</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Filter Status */}
          <div className="flex bg-dark-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button 
              onClick={() => setStatusFilter('Open')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'Open' ? 'bg-primary text-white shadow' : 'text-slate-400'
              }`}
            >
              Active Alerts
            </button>
            <button 
              onClick={() => setStatusFilter('Resolved')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'Resolved' ? 'bg-primary text-white shadow' : 'text-slate-400'
              }`}
            >
              Mitigated Log
            </button>
          </div>

          {/* Filter Severity */}
          <select 
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-dark-900/60 border border-slate-800 text-xs rounded-xl p-2.5 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">All Severities</option>
            <option value="High">High Severity</option>
            <option value="Medium">Medium Severity</option>
            <option value="Low">Low Severity</option>
          </select>
        </div>
      </div>

      {/* 2. Risks Grid */}
      {risksLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredRisks.length === 0 ? (
        <div className="glass p-12 text-center text-xs text-slate-500 rounded-2xl border border-slate-800/80">
          No alarms found matching parameters. System is safe!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRisks.map(risk => (
            <div key={risk.riskId || risk.id} className="glass rounded-2xl border border-slate-800 hover:border-slate-700/80 p-5 flex flex-col justify-between space-y-4 transition-all duration-200">
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getSeverityColor(risk.severity)}`}>
                    {risk.severity} Alert
                  </span>
                  
                  {risk.status === 'Open' ? (
                    <span className="flex items-center gap-1 text-xs text-rose-400 font-bold uppercase animate-pulse">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold uppercase">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Mitigated
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-white pt-1">{risk.category}</h3>
                
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span 
                    onClick={() => navigate(`/accounts/${risk.accountId}`)}
                    className="hover:underline hover:text-primary cursor-pointer transition-colors"
                  >
                    {risk.companyName}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-dark-900/40 p-3 rounded-lg border border-slate-800/50">
                  {risk.description}
                </p>
              </div>

              {risk.status === 'Open' ? (
                ['Admin', 'Sales Manager', 'Executive'].includes(user?.role) ? (
                  <button 
                    onClick={() => setSelectedRisk(risk)}
                    className="w-full bg-slate-800 hover:bg-slate-700 active:scale-98 border border-slate-700/60 rounded-xl py-2.5 text-xs text-white font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    Resolve Alarm
                  </button>
                ) : (
                  <div className="text-xs text-slate-500 italic text-center">
                    Requires Admin/Manager role to resolve
                  </div>
                )
              ) : (
                <div className="border-t border-slate-800/40 pt-3 flex items-start gap-1.5 text-xs text-slate-500 italic leading-relaxed">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Mitigated by corporate managers</span>
                </div>
              )}

            </div>
          ))}
        </div>
      )}

      {/* ========================================================
          RESOLVE RISK MODAL POPUP
          ======================================================== */}
      {selectedRisk && (
        <div className="fixed inset-0 bg-dark-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-sm w-full rounded-2xl p-6 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Mitigate Risk Alert</h3>
              <button onClick={() => setSelectedRisk(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-3.5 mb-4 text-xs">
              <div className="bg-dark-900/60 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-semibold block">Client Company:</span>
                <span className="text-white font-bold">{selectedRisk.companyName}</span>
              </div>
              <div className="bg-dark-900/60 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-semibold block">Detected Risk Description:</span>
                <span className="text-white">{selectedRisk.description}</span>
              </div>
            </div>

            <form onSubmit={handleResolveRisk} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Mitigation Resolution comments</label>
                <textarea 
                  value={resolutionComments}
                  onChange={(e) => setResolutionComments(e.target.value)}
                  required 
                  rows={4}
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                  placeholder="Record resolution steps (e.g. Scheduled emergency alignment session with VP Engineering and contract terms modified)."
                />
              </div>

              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-xs text-white font-bold rounded-lg py-2.5 shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-1.5 transition-all">
                <ShieldCheck className="w-4 h-4" />
                Resolve and Close Alert
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
