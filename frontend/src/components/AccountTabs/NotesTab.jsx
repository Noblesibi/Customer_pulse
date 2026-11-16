import React, { useState, useEffect } from 'react';
import { FileText, Plus, Send, Clock, User, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/index.js';
import { formatDate } from '../../utils/dateFormat.js';

export default function NotesTab({ account }) {
  const { token, user } = useStore();
  const accId = account?.accountId || account?.id;
  const accName = account?.companyName || account?.name || 'Account';

  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteSubject, setNewNoteSubject] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiRefining, setIsAiRefining] = useState(false);
  const [toast, setToast] = useState('');

  const showNotification = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const fetchNotes = async () => {
    if (!accId) return;
    try {
      const res = await fetch(`/CustomerPulse/api/interactions?accountId=${accId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        const accountNotes = (Array.isArray(data) ? data : []).filter(
          item => item.source === 'Note' || item.type === 'note' || (item.tags && item.tags.includes('note'))
        );
        accountNotes.sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
        setNotes(accountNotes);
      }
    } catch (err) {
      console.error('Error fetching account notes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [accId, token]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        accountId: accId,
        source: 'Note',
        type: 'note',
        subject: newNoteSubject.trim() || 'Internal Account Memo',
        messageText: newNoteText.trim(),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        loggedByUid: user?.uid || 'user',
        loggedByName: user?.name || 'Staff Member',
        sentiment: 'Neutral'
      };

      const res = await fetch('/CustomerPulse/api/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const created = await res.json();
        setNotes(prev => [created, ...prev]);
        setNewNoteText('');
        setNewNoteSubject('');
        showNotification('Note added to account records.');
      }
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAiRefine = async () => {
    if (!newNoteText.trim()) return;
    setIsAiRefining(true);
    try {
      const res = await fetch('/CustomerPulse/api/ai/sentiment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ text: newNoteText })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.executiveSummary) {
          setNewNoteText(prev => `${prev}\n\n[AI Summary]: ${data.executiveSummary}`);
          showNotification('AI analysis added to memo.');
        }
      }
    } catch (err) {
      console.warn('AI refinement error:', err);
    } finally {
      setIsAiRefining(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] w-full overflow-hidden bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] font-sans">
      
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-white">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
            <FileText className="w-5 h-5 text-blue-600" />
            Account Notes & Strategy Memos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Internal meeting memos, stakeholder context, and strategy logs for {accName}.
          </p>
        </div>
        <div className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          {notes.length} {notes.length === 1 ? 'Note' : 'Notes'}
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        
        {/* Create Note Form */}
        <form onSubmit={handleAddNote} className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600" /> Add New Internal Note
            </label>
            <button
              type="button"
              onClick={handleAiRefine}
              disabled={isAiRefining || !newNoteText.trim()}
              className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-40 transition-colors"
            >
              {isAiRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI Enhance
            </button>
          </div>
          <input
            type="text"
            placeholder="Subject or Title (e.g. Q4 Executive Alignment Notes)"
            value={newNoteSubject}
            onChange={(e) => setNewNoteSubject(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <textarea
            rows={3}
            placeholder="Write internal account notes, key takeaways, or context for team members..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !newNoteText.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Save Note
            </button>
          </div>
        </form>

        {/* Notes List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Logged Notes</h3>
          
          {isLoading ? (
            <div className="py-12 flex justify-center items-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No internal notes logged yet</p>
              <p className="text-xs text-slate-400 mt-0.5">Use the box above to record internal strategy notes for {accName}.</p>
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.interactionId || note.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <h4 className="text-sm font-bold text-slate-900 leading-snug">
                    {note.subject || 'Internal Account Memo'}
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 whitespace-nowrap">
                    <Clock className="w-3 h-3" />
                    {formatDate(note.timestamp || note.date)}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {note.messageText || note.notes || note.description}
                </p>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>Logged by {note.loggedByName || 'Staff Member'}</span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

    </div>
  );
}
