import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, CheckCircle2, Clock, AlertTriangle,
  Users, Mail, Video, FileText, XCircle
} from 'lucide-react';

function ChannelStatusBadge({ status, liveVerified }) {
  const s = String(status || 'Not Eligible');
  if (s === 'Authorized' && liveVerified) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" />
        Live Verified
      </span>
    );
  }
  if (s === 'Authorized' && !liveVerified) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-700 border border-amber-500/30">
        <Clock className="w-3 h-3" />
        Awaiting Live IT Verification
      </span>
    );
  }
  if (s.toLowerCase().includes('pending')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-700 border border-amber-500/30">
        <Clock className="w-3 h-3" />
        {s}
      </span>
    );
  }
  if (s.toLowerCase().includes('fail') || s.toLowerCase().includes('revok')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/10 text-rose-700 border border-rose-500/30">
        <XCircle className="w-3 h-3" />
        {s}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
      {s}
    </span>
  );
}

export default function MicrosoftAccessGovernancePanel({ token }) {
  const [organizers, setOrganizers] = useState([]);
  const [statusData, setStatusData] = useState(null);
  const [googleStatus, setGoogleStatus] = useState(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadData = useCallback(async () => {
    const authToken = token || localStorage.getItem('cp_token');
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const [orgRes, statusRes, googleRes] = await Promise.all([
        fetch('/CustomerPulse/api/integrations/teams/authorized-organizers', {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch('/CustomerPulse/api/integrations/teams/status', {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch('/CustomerPulse/api/integrations/google/status', {
          headers: { Authorization: `Bearer ${authToken}` },
        }).catch(() => null),
      ]);
      if (orgRes.ok) {
        const orgJson = await orgRes.json();
        setOrganizers(Array.isArray(orgJson.organizers) ? orgJson.organizers : (Array.isArray(orgJson) ? orgJson : []));
      } else {
        const errBody = await orgRes.json().catch(() => ({}));
        setError(errBody.error || `Failed to load organizers (HTTP ${orgRes.status})`);
      }
      if (statusRes.ok) {
        const stJson = await statusRes.json();
        setStatusData(stJson);
      }
      if (googleRes && googleRes.ok) {
        const gJson = await googleRes.json();
        setGoogleStatus(gJson);
      }
    } catch (err) {
      setError(err.message || 'Failed to load Microsoft 365 organizer governance data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecalculate = async () => {
    const authToken = token || localStorage.getItem('cp_token');
    if (!authToken || recalculating) return;
    setRecalculating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/CustomerPulse/api/integrations/teams/recalculate-organizers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setNotice('Owner eligibility and Teams/Outlook authorization queues recalculated.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to recalculate organizers');
    } finally {
      setRecalculating(false);
    }
  };

  const handleConnectGoogle = async () => {
    const authToken = token || localStorage.getItem('cp_token');
    if (!authToken || connectingGoogle) return;
    setConnectingGoogle(true);
    setError(null);
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`/CustomerPulse/api/integrations/google/connect?origin=${origin}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json().catch(() => ({}));
      const targetUrl = json.url || json.authUrl;
      if (!res.ok || !targetUrl) throw new Error(json.error || 'Failed to initiate Google OAuth');
      window.location.href = targetUrl;
    } catch (err) {
      setError(err.message || 'Failed to connect Google');
      setConnectingGoogle(false);
    }
  };

  const liveTeamsCount = organizers.filter(o => o.livePolicyVerified === true).length;
  const liveOutlookCount = organizers.filter(o => o.outlookLiveVerified === true).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-black flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Microsoft 365 Teams & Outlook Organizer Governance
          </h2>
          <p className="text-xs font-bold text-slate-600 mt-0.5">
            Automatically identified Account Owners & Key Contact Owners. Live Graph sync activates per employee only after IT verification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="px-3.5 py-1.5 rounded-lg bg-[#223670] hover:bg-[#1a2955] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating...' : 'Recalculate Organizers'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Telemetry Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
            <span>Eligible Owners</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-black text-black mt-1">{organizers.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
            <span>Teams Live Verified</span>
            <Video className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-black mt-1">{liveTeamsCount} / {organizers.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
            <span>Outlook Live Verified</span>
            <Mail className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-black mt-1">{liveOutlookCount} / {organizers.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
            <span>Meetings / Transcripts</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-black mt-1">
            {statusData?.meetingsDiscoveredCount ?? 0} / {statusData?.transcriptsRetrievedCount ?? 0}
          </p>
        </div>
      </div>

      {/* Organizers Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-3">Emp ID</th>
                <th className="py-3 px-3">Ownership</th>
                <th className="py-3 px-3 text-center">Accounts / Contacts</th>
                <th className="py-3 px-3">Teams Status</th>
                <th className="py-3 px-3">Outlook Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading && organizers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-semibold">
                    Loading eligible organizers...
                  </td>
                </tr>
              ) : organizers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-semibold">
                    No eligible Account Owners or Key Contact Owners found yet.
                  </td>
                </tr>
              ) : (
                organizers.map((org) => {
                  const ownershipLabel =
                    org.isAccountOwner && org.isKeyContactOwner
                      ? 'Account & Contact Owner'
                      : org.isAccountOwner
                        ? 'Account Owner'
                        : org.isKeyContactOwner
                          ? 'Key Contact Owner'
                          : 'None';
                  return (
                    <tr key={org.organizerKey || org.email} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-black">{org.name || '—'}</div>
                        <div className="text-[11px] text-slate-500">{org.email || '—'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                        {org.employeeId || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        {ownershipLabel}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        {org.ownedAccountsCount ?? (org.ownedAccountIds || []).length} / {org.ownedContactsCount ?? (org.ownedContactIds || []).length}
                      </td>
                      <td className="py-2.5 px-3">
                        <ChannelStatusBadge
                          status={org.teamsStatus || org.eligibilityStatus}
                          liveVerified={org.livePolicyVerified === true}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <ChannelStatusBadge
                          status={org.outlookStatus}
                          liveVerified={org.outlookLiveVerified === true}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Google Contacts & Calendar (Celebrations Birthday Enrichment) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-black">
            Google Contacts & Calendar (Celebrations Birthday Enrichment)
          </h3>
          <p className="text-xs font-semibold text-slate-600 mt-0.5">
            {googleStatus?.connected
              ? 'Connected — Automatic customer birthday & anniversary enrichment from Google Contacts/Calendar is active.'
              : 'Not connected or token expired — Click Connect / Reconnect Google to enable automatic birthday enrichment in Celebrations.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
            googleStatus?.connected
              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
          }`}>
            {googleStatus?.connected ? 'Connected' : 'Reconnect Needed'}
          </span>
          <button
            type="button"
            onClick={handleConnectGoogle}
            disabled={connectingGoogle}
            className="px-3.5 py-1.5 rounded-lg bg-[#223670] hover:bg-[#1a2955] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {connectingGoogle ? 'Redirecting...' : (googleStatus?.connected ? 'Reconnect Google' : 'Connect Google')}
          </button>
        </div>
      </div>
    </div>
  );
}
