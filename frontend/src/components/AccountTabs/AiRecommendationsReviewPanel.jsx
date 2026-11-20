import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, CheckCircle2, XCircle, Clock, Edit3, RefreshCw,
  FileText, AlertTriangle, CheckSquare, TrendingUp, MessageSquare, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatDate } from '../../utils/dateFormat.js';

const CATEGORY_META = {
  TASK: {
    label: 'AI Task',
    icon: CheckSquare,
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  RISK: {
    label: 'AI Risk',
    icon: AlertTriangle,
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  OPPORTUNITY: {
    label: 'AI Opportunity',
    icon: TrendingUp,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  ENGAGEMENT: {
    label: 'AI Engagement',
    icon: MessageSquare,
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

const STATUS_BADGE = {
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EDITED: 'bg-sky-50 text-sky-700 border-sky-200',
  REJECTED: 'bg-slate-100 text-slate-600 border-slate-200',
  DEFERRED: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function AiRecommendationsReviewPanel({ accountId, token, onReviewed }) {
  const [recommendations, setRecommendations] = useState([]);
  const [statusFilter, setStatusFilter] = useState('PENDING_REVIEW');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', description: '', priority: 'Medium', reviewNotes: '' });
  const [deferringId, setDeferringId] = useState(null);
  const [deferDate, setDeferDate] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const [feedbackToast, setFeedbackToast] = useState(null);

  const loadRecommendations = useCallback(async () => {
    if (!accountId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/CustomerPulse/api/ai/recommendations?accountId=${encodeURIComponent(accountId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
    } catch (err) {
      setError(err.message || 'Failed to load AI recommendations');
    } finally {
      setLoading(false);
    }
  }, [accountId, token]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const showToast = (msg) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const submitReviewAction = async (recId, payload, successMsg) => {
    if (!token || !recId) return;
    setBusyId(recId);
    setError(null);
    try {
      const res = await fetch(`/CustomerPulse/api/ai/recommendations/${encodeURIComponent(recId)}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      setEditingId(null);
      setDeferringId(null);
      await loadRecommendations();
      showToast(successMsg);
      if (onReviewed) onReviewed(payload.action);
    } catch (err) {
      setError(err.message || 'Failed to submit review decision');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (rec) => {
    setDeferringId(null);
    setEditingId(rec.recommendationId);
    setEditDraft({
      title: rec.title || '',
      description: rec.description || '',
      priority: rec.priority || 'Medium',
      reviewNotes: rec.reviewNotes || '',
    });
  };

  const pendingCount = recommendations.filter(r => r.status === 'PENDING_REVIEW').length;
  const visibleItems = statusFilter === 'ALL'
    ? recommendations
    : recommendations.filter(r => r.status === statusFilter);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#223670]" />
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            AI Recommendations Review Queue
          </h3>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {pendingCount} Pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#223670]"
          >
            <option value="PENDING_REVIEW">Pending Review ({pendingCount})</option>
            <option value="ALL">All ({recommendations.length})</option>
            <option value="APPROVED">Approved</option>
            <option value="EDITED">Edited</option>
            <option value="DEFERRED">Deferred</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button
            type="button"
            onClick={loadRecommendations}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh AI recommendations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        AI-detected tasks, risks, and opportunities from Outlook emails, Teams transcripts, and interactions are staged here for employee review before becoming active records.
      </p>

      {feedbackToast && (
        <div className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          {feedbackToast}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {error}
        </div>
      )}

      {loading && recommendations.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">Loading AI recommendations...</div>
      ) : visibleItems.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-slate-700">
            {statusFilter === 'PENDING_REVIEW'
              ? 'No AI recommendations awaiting review'
              : 'No AI recommendations match this filter'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            New suggestions from authorized emails and Teams meetings will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {visibleItems.map((rec) => {
            const cat = CATEGORY_META[rec.category] || CATEGORY_META.TASK;
            const CatIcon = cat.icon;
            const isBusy = busyId === rec.recommendationId;
            const isEditing = editingId === rec.recommendationId;
            const isDeferring = deferringId === rec.recommendationId;
            const isEvidenceOpen = Boolean(expandedEvidence[rec.recommendationId]);
            const canAct = ['PENDING_REVIEW', 'EDITED', 'DEFERRED'].includes(rec.status);

            return (
              <div
                key={rec.recommendationId}
                className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${cat.badge}`}>
                      <CatIcon className="w-3 h-3" />
                      {cat.label}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${STATUS_BADGE[rec.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {String(rec.status || 'PENDING_REVIEW').replace(/_/g, ' ')}
                    </span>
                  </div>
                  {rec.priority && (
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      {rec.priority}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                    <input
                      type="text"
                      value={editDraft.title}
                      onChange={(e) => setEditDraft(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Recommendation title"
                      className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-md px-2.5 py-1.5"
                    />
                    <textarea
                      rows={2}
                      value={editDraft.description}
                      onChange={(e) => setEditDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Description"
                      className="w-full text-xs text-slate-700 border border-slate-200 rounded-md px-2.5 py-1.5"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={editDraft.priority}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, priority: e.target.value }))}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                      <input
                        type="text"
                        value={editDraft.reviewNotes}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, reviewNotes: e.target.value }))}
                        placeholder="Review notes (optional)"
                        className="flex-1 text-xs border border-slate-200 rounded-md px-2 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => submitReviewAction(
                          rec.recommendationId,
                          {
                            action: 'EDIT',
                            edits: {
                              title: editDraft.title,
                              description: editDraft.description,
                              priority: editDraft.priority,
                            },
                            reviewNotes: editDraft.reviewNotes,
                          },
                          'Recommendation updated.'
                        )}
                        className="px-2.5 py-1 bg-[#223670] text-white text-[11px] font-bold rounded-md hover:bg-[#1a2955] disabled:opacity-50"
                      >
                        Save Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-semibold rounded-md hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h4 className="text-xs font-bold text-slate-900 leading-snug">{rec.title}</h4>
                    {rec.description && (
                      <p className="text-[11px] text-slate-600 leading-relaxed">{rec.description}</p>
                    )}
                  </>
                )}

                {/* Supporting Source Evidence */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setExpandedEvidence(prev => ({ ...prev, [rec.recommendationId]: !prev[rec.recommendationId] }))}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800"
                  >
                    <FileText className="w-3 h-3" />
                    Source Evidence ({rec.sourceType || 'INTERACTION'})
                    {isEvidenceOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {isEvidenceOpen && (
                    <div className="mt-1.5 p-2.5 bg-white border border-slate-200/80 rounded-lg text-[11px] text-slate-600 space-y-1">
                      {rec.evidenceExcerpt && (
                        <p className="italic text-slate-700">&ldquo;{rec.evidenceExcerpt}&rdquo;</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                        {rec.sourceTimestamp && <span>Source Date: {formatDate(rec.sourceTimestamp)}</span>}
                        {rec.meetingId && <span>Meeting: {rec.meetingId}</span>}
                        {rec.interactionId && <span>Interaction: {rec.interactionId}</span>}
                        {rec.internetMessageId && <span>Message ID: {rec.internetMessageId.slice(0, 24)}</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Defer Date Picker */}
                {isDeferring && (
                  <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-lg border border-purple-200">
                    <span className="text-[11px] font-semibold text-slate-600">Defer until:</span>
                    <input
                      type="date"
                      value={deferDate}
                      onChange={(e) => setDeferDate(e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-2 py-1"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => submitReviewAction(
                        rec.recommendationId,
                        {
                          action: 'DEFER',
                          deferredUntil: new Date(`${deferDate}T00:00:00.000Z`).toISOString(),
                          reviewNotes: `Deferred until ${deferDate}`,
                        },
                        `Recommendation deferred until ${deferDate}.`
                      )}
                      className="px-2.5 py-1 bg-purple-600 text-white text-[11px] font-bold rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                      Confirm Defer
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeferringId(null)}
                      className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Review Actions */}
                {canAct && !isEditing && !isDeferring && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => submitReviewAction(
                        rec.recommendationId,
                        { action: 'APPROVE' },
                        'Recommendation approved and applied.'
                      )}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => startEdit(rec)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold rounded-md transition-colors disabled:opacity-50"
                    >
                      <Edit3 className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setEditingId(null);
                        setDeferringId(rec.recommendationId);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold rounded-md transition-colors disabled:opacity-50"
                    >
                      <Clock className="w-3 h-3" />
                      Defer
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => submitReviewAction(
                        rec.recommendationId,
                        { action: 'REJECT', reviewNotes: 'Rejected by employee during review.' },
                        'Recommendation rejected.'
                      )}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold rounded-md transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                )}

                {/* Audit Trail */}
                {rec.reviewedAt && (
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                    Reviewed by {rec.reviewedByName || 'Employee'} on {formatDate(rec.reviewedAt)}
                    {rec.reviewNotes ? ` — "${rec.reviewNotes}"` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

