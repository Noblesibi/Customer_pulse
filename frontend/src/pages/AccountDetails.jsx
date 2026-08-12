import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Edit2, Trash2, Globe, Building2, ShieldAlert, UserPlus, Send, X,
  MessageSquare, Mail, Calendar, Clock, Users, AtSign, CheckSquare, Square, Mic, Video,
  CheckCheck, Phone, Paperclip, Upload, FileText, Loader2, ArrowLeft, BrainCircuit, ChevronLeft
} from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDate, formatTime, formatDateTime, getCurrentKolkataDate, getCurrentKolkataTime } from '../utils/dateFormat.js';

export default function AccountDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    user,
    token,
    updateAccount,
    fetchHealthExplanation,

    contacts,
    fetchContacts,
    updateContact,
    deleteContact,

    interactions,
    fetchInteractions,
    addInteraction,

    risks,
    fetchRisks,

    activeAccountSummary,
    fetchAccountSummary,
    summaryLoading,

    staffList,
    fetchStaff,

    repliesByInteraction,
    fetchReplies,
    replyToInteraction
  } = useStore();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  // Owner searchable dropdown state
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [stakeholderSearch, setStakeholderSearch] = useState({});
  const [showStakeholderDropdown, setShowStakeholderDropdown] = useState({});

  // Modals state
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);
  const [isHealthExplanationOpen, setIsHealthExplanationOpen] = useState(false);
  const [explanationData, setExplanationData] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // Permission: only Admin role OR user whose name starts with 'Nazneen'
  const canEditOwners = user?.role === 'Admin' || user?.name?.toLowerCase().startsWith('nazneen');

  // Log Interaction Form States
  const [interactionSource, setInteractionSource] = useState('Outlook Mail');
  const [interactionText, setInteractionText] = useState('');
  const [interactionDate, setInteractionDate] = useState(getCurrentKolkataDate());
  const [interactionTime, setInteractionTime] = useState(getCurrentKolkataTime());
  const [interactionContactId, setInteractionContactId] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [attachmentsList, setAttachmentsList] = useState([]);
  const [uploading, setUploading] = useState(false);

  const resetInteractionForm = () => {
    setInteractionSource('Outlook Mail');
    setInteractionText('');
    setInteractionDate(getCurrentKolkataDate());
    setInteractionTime(getCurrentKolkataTime());
    setInteractionContactId('');
    setSelectedMentions([]);
    setMentionSearch('');
    setTaskDueDate('');
    setTaskPriority('Medium');
    setAttachmentsList([]);
  };

  const loadAccountData = async () => {
    if (!id || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`/CustomerPulse/api/accounts/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
      }
      await Promise.all([
        fetchContacts(id),
        fetchInteractions(id),
        fetchRisks(id),
        fetchStaff(),
        fetchAccountSummary(id)
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountData();
  }, [id, token]);

  const handleShowHealthExplanation = async () => {
    setIsHealthExplanationOpen(true);
    setExplanationLoading(true);
    setExplanationData(null);
    const data = await fetchHealthExplanation(id);
    setExplanationData(data);
    setExplanationLoading(false);
  };

  const getHealthPillColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
    if (score >= 75) return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
    return 'bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse';
  };

  const channels = [
    { id: 'Outlook Mail', label: 'Outlook Mail', icon: Mail, color: 'text-blue-400' },
    { id: 'Teams Chat', label: 'Teams Chat', icon: MessageSquare, color: 'text-purple-400' },
    { id: 'Phone', label: 'Phone', icon: Phone, color: 'text-emerald-400' },
    { id: 'Face to Face', label: 'Face to Face', icon: Users, color: 'text-amber-400' },
    { id: 'Teams Meeting', label: 'Teams Meeting', icon: Video, color: 'text-rose-400' },
  ];

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);

    for (const file of files) {
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });

        const res = await fetch('/CustomerPulse/api/interactions/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            base64
          })
        });

        if (res.ok) {
          const data = await res.json();
          setAttachmentsList(prev => [...prev, data]);
        } else {
          const err = await res.json();
          alert(`Failed to upload ${file.name}: ${err.error || 'Server error'}`);
        }
      } catch (err) {
        console.error(err);
        alert(`Error uploading file ${file.name}`);
      }
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleRemoveAttachment = (index) => {
    setAttachmentsList(prev => prev.filter((_, i) => i !== index));
  };

  const getMentionSearchQuery = (text) => {
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex === -1) return '';
    const partAfterAt = text.slice(lastAtIndex + 1);
    return partAfterAt;
  };

  const insertMention = (staffMember) => {
    const lastAtIndex = mentionSearch.lastIndexOf('@');
    if (lastAtIndex === -1) return;
    const beforeAt = mentionSearch.slice(0, lastAtIndex);
    const newText = beforeAt + `@${staffMember.name} `;
    setMentionSearch(newText);

    const parsed = [];
    staffList.forEach(s => {
      if (newText.includes(`@${s.name}`)) {
        parsed.push({ uid: s.uid, name: s.name });
      }
    });
    setSelectedMentions(parsed);
    setShowMentionDropdown(false);
  };

  const handleMentionSearchChange = (val) => {
    setMentionSearch(val);
    const parsed = [];
    staffList.forEach(s => {
      if (val.includes(`@${s.name}`)) {
        parsed.push({ uid: s.uid, name: s.name });
      }
    });
    setSelectedMentions(parsed);
  };

  const toggleMention = (staffMember) => {
    setSelectedMentions(prev => {
      const exists = prev.find(m => m.uid === staffMember.uid);
      let updated;
      if (exists) {
        updated = prev.filter(m => m.uid !== staffMember.uid);
      } else {
        updated = [...prev, { uid: staffMember.uid, name: staffMember.name }];
      }

      let text = mentionSearch;
      if (exists) {
        text = text.replace(`@${staffMember.name}`, '').replace(/\s+/g, ' ').trim();
      } else {
        text = `@${staffMember.name} ${text}`.replace(/\s+/g, ' ').trim();
      }
      setMentionSearch(text);
      return updated;
    });
  };

  const handleLogInteraction = async (e) => {
    e.preventDefault();

    const targetContactId = interactionContactId || (contacts[0]?.contactId);

    if (!targetContactId) {
      alert('Please add at least one contact to this account before logging an interaction.');
      return;
    }
    if (!interactionText.trim()) {
      alert('Please enter the interaction notes/message text.');
      return;
    }

    let taskText = mentionSearch.trim();
    selectedMentions.forEach(m => {
      taskText = taskText.replace(`@${m.name}`, '');
    });
    taskText = taskText.replace(/\s+/g, ' ').trim();

    const derivedSubject = interactionText.trim().split('\n')[0].slice(0, 50) || 'Interaction Note';
    const res = await addInteraction({
      accountId: id,
      contactId: targetContactId,
      source: interactionSource,
      subject: derivedSubject,
      messageText: interactionText,
      date: interactionDate,
      time: interactionTime,
      attachments: attachmentsList,
      actionMentions: selectedMentions.map(m => ({
        uid: m.uid,
        name: m.name,
        task: taskText,
        dueDate: taskDueDate || null,
        priority: taskPriority
      }))
    });

    if (res) {
      loadAccountData();
      setIsLogInteractionOpen(false);
      resetInteractionForm();
    }
  };

  if (loading || !account) {
    return (
      <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full mx-auto py-4 px-4 h-auto">
      {/* 1. Header Toolbar */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/accounts')}
            className="flex items-center gap-1.5 cursor-pointer text-black hover:bg-dark-700 transition-colors font-bold text-base px-3.5 py-1.5 rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white tracking-wide">{account.companyName}</h1>
              <span
                onClick={handleShowHealthExplanation}
                className={`px-3.5 py-1.5 text-xs font-black rounded-full border cursor-help hover:scale-105 transition-transform duration-150 ${getHealthPillColor(account.healthScore)}`}
              >
                {account.healthScore}% {account.status}
              </span>
            </div>
            <div className="flex items-center gap-5 text-sm text-slate-400 mt-2 font-bold">
              <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-primary" /> {account.industry}</span>
              <span className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-primary" /> {account.region}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {['Admin', 'Sales Manager', 'Executive'].includes(user?.role) && (
            <button
              onClick={() => navigate(`/accounts/${id}/edit`)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-2 cursor-pointer transition-all"
            >
              <Edit2 className="w-4 h-4" />
              Edit Account
            </button>
          )}
          <button
            onClick={() => setIsLogInteractionOpen(true)}
            className="bg-primary hover:bg-blue-600 px-5 py-3 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-primary/20"
          >
            <MessageSquare className="w-4 h-4" />
            Log Interaction
          </button>
        </div>
      </div>

      {/* 2. Grid Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Hand side info panel: Corporate details & AI summary */}
        <div className="lg:col-span-5 space-y-6">

          {/* Corporate details Card */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 space-y-5 overflow-visible relative z-30">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-850 pb-2">Corporate Profile</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 overflow-visible">
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-850 flex flex-col gap-1.5">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">CEO / Executive Head</span>
                <span className="text-sm text-slate-200 font-bold">{account.ceoName || 'Not Specified'}</span>
              </div>
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-850 flex flex-col gap-1.5">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">General Email</span>
                <span className="text-sm text-slate-200 font-bold truncate" title={account.email}>{account.email || 'Not Specified'}</span>
              </div>
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-850 flex flex-col gap-1.5">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Phone Number</span>
                <span className="text-sm text-slate-200 font-bold">{account.phone || 'Not Specified'}</span>
              </div>
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-850 flex flex-col gap-1.5">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">NeST BU</span>
                <span className="text-sm text-slate-200 font-bold">{account.domain || 'Not Specified'}</span>
              </div>

              {/* Owner selection dropdown */}
              <div className="sm:col-span-2 lg:col-span-1 p-4 bg-slate-905/40 rounded-xl border border-slate-800 flex flex-col gap-3 overflow-visible relative z-30">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Account Owner</span>
                  <span className="text-slate-200 font-bold text-sm">{account.ownerName || 'Unassigned'}</span>
                </div>
                {canEditOwners ? (
                  <div className="relative z-40">
                    <input
                      type="text"
                      value={ownerSearch}
                      placeholder="Type @name to search..."
                      onFocus={() => { setOwnerSearch(''); setShowOwnerDropdown(true); }}
                      onChange={(e) => setOwnerSearch(e.target.value)}
                      onBlur={() => setTimeout(() => setShowOwnerDropdown(false), 180)}
                      className="w-full bg-dark-700/50 border border-slate-700 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450 font-semibold"
                    />
                    {showOwnerDropdown && (() => {
                      const q = ownerSearch.replace(/^@/, '').toLowerCase();
                      const filtered = staffList.filter(s =>
                        s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
                      );
                      if (!filtered.length) return null;
                      return (
                        <div className="absolute z-[100] w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                          <button
                            type="button"
                            onMouseDown={async () => {
                              setAccount(prev => ({ ...prev, ownerId: '', ownerName: 'Unassigned' }));
                              await updateAccount(id, { ownerId: '', ownerName: '' });
                              setOwnerSearch('');
                              setShowOwnerDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-400 font-semibold"
                          >
                            Unassigned
                          </button>
                          {filtered.map(s => (
                            <button
                              key={s.uid}
                              type="button"
                              onMouseDown={async () => {
                                setAccount(prev => ({ ...prev, ownerId: s.uid, ownerName: s.name }));
                                await updateAccount(id, { ownerId: s.uid, ownerName: s.name });
                                setOwnerSearch(s.name);
                                setShowOwnerDropdown(false);
                              }}
                              className="w-full flex flex-col items-start px-3 py-2.5 text-xs"
                            >
                              <span className="font-bold text-black">{s.name}</span>
                              <span className="text-slate-500 font-semibold">{s.position || s.jobRole || s.role}{s.department ? ` · ${s.department}` : ''}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            </div>
          </div>


        </div>

        {/* Right Hand side content panel: Contacts & Interactions */}
        <div className="lg:col-span-7 space-y-6">

          {/* Key Contacts */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 space-y-5 overflow-visible relative z-30">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-850 pb-2">Key Contacts Mapped</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 overflow-visible relative z-30">
              {contacts.length === 0 ? (
                <span className="text-sm text-slate-500 col-span-2 py-8 text-center font-bold">No contacts currently mapped to this client account.</span>
              ) : (
                contacts.map(c => (
                  <div key={c.contactId} className="bg-dark-900/60 p-5 rounded-2xl border border-slate-800 relative flex flex-col justify-between hover:border-slate-700/80 transition-all shadow-md overflow-visible z-30">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-base font-black text-white truncate" title={c.name}>{c.name}</h4>
                        <span className="text-[10px] font-black bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded uppercase tracking-wider whitespace-nowrap">
                          {c.hierarchyTag}
                        </span>
                      </div>
                      <p className="text-xs text-primary font-black mt-1 uppercase tracking-wider">{c.designation}</p>

                      <div className="mt-3.5 space-y-1.5 text-xs text-slate-350">
                        <p className="flex items-center gap-1.5 font-bold truncate" title={c.email}><Mail className="w-3.5 h-3.5 text-slate-500" /> {c.email}</p>
                        {c.phone && <p className="flex items-center gap-1.5 font-bold"><Phone className="w-3.5 h-3.5 text-slate-500" /> {c.phone}</p>}
                      </div>

                      {c.projectName && (
                        <div className="mt-3.5 text-xs flex items-center gap-1.5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850 truncate font-bold text-slate-200">
                          <span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Project:</span>
                          <span className="truncate">{c.projectName}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-3.5 border-t border-slate-800/40">
                      <span className="text-[10px] font-extrabold bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded px-2 py-0.5 uppercase tracking-wider">
                        {c.influenceTag}
                      </span>
                      {['Admin', 'Sales Manager', 'Executive'].includes(user?.role) && (
                        <button
                          onClick={async () => {
                            if (confirm(`Remove contact ${c.name}?`)) {
                              await deleteContact(c.contactId, id);
                            }
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/5 transition-colors cursor-pointer"
                          title="Remove Contact"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Contact Owner Select */}
                    <div className="mt-4 pt-3.5 border-t border-slate-800/30 relative z-30 flex flex-col gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Stakeholder Owner</span>
                        <span className="text-slate-200 font-bold text-sm">
                          {c.ownerName || (c.ownerId ? staffList.find(s => s.uid === c.ownerId)?.name : null) || 'Unassigned'}
                        </span>
                      </div>
                      {canEditOwners ? (
                        <div className="relative z-40">
                          <input
                            type="text"
                            value={stakeholderSearch[c.contactId] ?? ''}
                            placeholder="Type @name to search..."
                            onFocus={() => {
                              setStakeholderSearch(prev => ({ ...prev, [c.contactId]: '' }));
                              setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: true }));
                            }}
                            onChange={(e) => setStakeholderSearch(prev => ({ ...prev, [c.contactId]: e.target.value }))}
                            onBlur={() => setTimeout(() => setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false })), 180)}
                            className="w-full bg-dark-700/50 border border-slate-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450 font-semibold"
                          />
                          {showStakeholderDropdown[c.contactId] && (() => {
                            const q = (stakeholderSearch[c.contactId] || '').replace(/^@/, '').toLowerCase();
                            const filtered = staffList.filter(s =>
                              s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
                            );
                            if (!filtered.length) return null;
                            return (
                              <div className="absolute z-[100] w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto">
                                <button
                                  type="button"
                                  onMouseDown={async () => {
                                    await updateContact(c.contactId, { ownerId: '', ownerName: '' });
                                    fetchContacts(id);
                                    setStakeholderSearch(prev => ({ ...prev, [c.contactId]: '' }));
                                    setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false }));
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-400 font-semibold"
                                >
                                  Unassigned
                                </button>
                                {filtered.map(s => (
                                  <button
                                    key={s.uid}
                                    type="button"
                                    onMouseDown={async () => {
                                      await updateContact(c.contactId, { ownerId: s.uid, ownerName: s.name });
                                      fetchContacts(id);
                                      setStakeholderSearch(prev => ({ ...prev, [c.contactId]: s.name }));
                                      setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false }));
                                    }}
                                    className="w-full flex flex-col items-start px-3 py-2.5 text-xs"
                                  >
                                    <span className="font-bold text-black">{s.name}</span>
                                    <span className="text-slate-500 font-semibold">{s.position || s.jobRole || s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Interaction Timeline */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 space-y-5 relative z-10">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-850 pb-2">Interaction Timeline</h3>

            <div className="space-y-5 max-h-[600px] overflow-y-auto pr-1">
              {interactions.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 font-bold">No interaction records logged yet against this client account.</div>
              ) : (
                [...interactions]
                  .sort((a, b) => {
                    const timeA = a.timestamp ? new Date(a.timestamp) : (a.date && a.time ? new Date(`${a.date}T${a.time}:00`) : new Date(0));
                    const timeB = b.timestamp ? new Date(b.timestamp) : (b.date && b.time ? new Date(`${b.date}T${b.time}:00`) : new Date(0));
                    return timeB - timeA;
                  })
                  .map(item => {
                    const replies = repliesByInteraction[item.interactionId] || item.replies || [];
                    return (
                      <div key={item.interactionId} className="bg-dark-900/60 p-5 rounded-2xl border border-slate-800/80 space-y-3 relative shadow-md">
                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="bg-slate-800 text-slate-205 border border-slate-700 px-3 py-1 rounded-full text-[10px] tracking-wide uppercase">
                            {item.source}
                          </span>
                          <span className="text-slate-400 font-bold">
                            {formatDateTime(item.date, item.time, item.timestamp)}
                          </span>
                        </div>

                        {(() => {
                          const title = (item.messageText && item.messageText.trim())
                            ? item.messageText.trim().split('\n')[0]
                            : (item.subject || 'Interaction Note');
                          const hasMore = item.messageText && item.messageText.trim().split('\n').length > 1;
                          return (
                            <div className="space-y-1.5 mt-1">
                              <p className="text-sm font-extrabold text-slate-100 leading-relaxed">{title}</p>
                              {hasMore && (
                                <details className="group text-xs text-slate-500 cursor-pointer">
                                  <summary className="hover:text-primary transition-colors focus:outline-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-1 select-none font-bold">
                                    <span>View full notes</span>
                                  </summary>
                                  <p className="text-slate-300 mt-2 pl-3 border-l-2 border-slate-750 leading-relaxed whitespace-pre-wrap font-semibold text-xs">
                                    {item.messageText}
                                  </p>
                                </details>
                              )}
                            </div>
                          );
                        })()}

                        {/* @Mention Tags */}
                        {item.actionMentions && item.actionMentions.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-800/40 w-full mt-3">
                            <div className="flex flex-col gap-2">
                              {item.actionMentions.map(m => {
                                const notif = item.notifications?.find(n => n.toUserId === m.uid && n.type === 'Task Assigned');
                                let displayMessage = m.task;
                                if (!displayMessage) {
                                  const match = notif?.message?.match(/:\s*"([^"]+)"/);
                                  displayMessage = match ? match[1] : (notif ? notif.message : item.messageText);
                                }

                                const currentStatus = m.status || 'Pending';
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const taskDue = m.dueDate ? new Date(m.dueDate) : null;
                                if (taskDue) {
                                  taskDue.setHours(0, 0, 0, 0);
                                }
                                const isTaskOverdue = taskDue && taskDue < today && currentStatus !== 'Completed';
                                const isStatusUnchanged = currentStatus === 'Pending' || currentStatus === 'Task Assigned';
                                const showAsOverdued = isTaskOverdue && isStatusUnchanged;

                                let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                                if (displayStatus === 'Accept/Decline') displayStatus = 'Accept';
                                if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                                if (showAsOverdued) {
                                  displayStatus = 'Overdued';
                                }

                                let statusText = displayStatus;
                                let statusColor = 'text-slate-500';
                                let StatusIcon = Clock;

                                if (displayStatus === 'Completed') {
                                  statusText = 'Completed';
                                  statusColor = 'text-emerald-400';
                                  StatusIcon = CheckCheck;
                                } else if (displayStatus === 'Forwarded') {
                                  const forwardedTo = m.forwardedToName;
                                  statusText = forwardedTo ? `Forwarded to @${forwardedTo}` : 'Forwarded';
                                  statusColor = 'text-sky-400';
                                  StatusIcon = Send;
                                } else if (displayStatus === 'Accept') {
                                  statusText = 'Accepted';
                                  statusColor = 'text-amber-400';
                                  StatusIcon = CheckSquare;
                                } else if (displayStatus === 'Decline') {
                                  statusText = 'Declined';
                                  statusColor = 'text-rose-400';
                                  StatusIcon = X;
                                } else if (displayStatus === 'Overdued') {
                                  statusText = 'Overdue';
                                  statusColor = 'text-rose-500 font-extrabold animate-pulse';
                                  StatusIcon = ShieldAlert;
                                } else {
                                  statusText = 'Pending';
                                  statusColor = 'text-slate-500';
                                  StatusIcon = Clock;
                                }

                                return (
                                  <div key={m.uid} className="bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-1.5 w-full text-xs leading-relaxed">
                                    <div className="flex items-center justify-between">
                                      <span className="flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary font-black rounded-full px-2.5 py-0.5">
                                        <AtSign className="w-3 h-3" />{m.name}
                                      </span>
                                      <span className={`font-black flex items-center gap-1 ${statusColor}`}>
                                        <StatusIcon className="w-4 h-4" />
                                        {statusText}
                                      </span>
                                    </div>
                                    <p className="text-slate-350 pl-1 font-bold">
                                      <span className="text-slate-500 font-extrabold">Task: </span>
                                      "{displayMessage}"
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800/40 text-[10px] font-black uppercase tracking-wider">
                          <span className={`px-2 py-0.5 rounded border ${item.sentiment === 'Positive' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            item.sentiment === 'Negative' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                              'bg-slate-800 border-slate-700 text-slate-350'
                            }`}>
                            {item.sentiment} Sentiment
                          </span>
                          {item.riskDetected && (
                            <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                              Risk: {item.riskCategory}
                            </span>
                          )}
                          <button
                            onClick={() => fetchReplies(item.interactionId)}
                            className="ml-auto text-slate-400 hover:text-primary font-black underline cursor-pointer"
                          >
                            {replies.length > 0 ? `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` : 'Load replies'}
                          </button>
                        </div>

                        {/* Replies feed */}
                        {replies.length > 0 && (
                          <div className="border-t border-slate-800/60 pt-2.5 space-y-2 ml-2 mt-2.5">
                            {replies.map(r => (
                              <div key={r.replyId} className="flex items-start gap-2.5 text-xs">
                                <span className="text-slate-600 mt-0.5">└─</span>
                                <div className="flex-1 leading-relaxed">
                                  <span className="text-primary font-black">{r.authorName}</span>
                                  <span className="text-slate-300 ml-2 font-bold">{r.text}</span>
                                  <span className="text-slate-500 ml-2 font-bold text-[10px]">
                                    {formatDateTime(r.timestamp)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          MODALS INTERFACE
          ======================================================== */}

      {/* Modal: Log Interaction Activity */}
      {isLogInteractionOpen && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-700/80 flex flex-col shadow-2xl max-h-[92vh] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-dark-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <CheckSquare className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Log Interaction</h3>
                  <p className="text-xs text-slate-500">Record an interaction for this account</p>
                </div>
              </div>
              <button onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogInteraction} className="overflow-y-auto flex-1">
              <div className="p-6 space-y-5">
                {/* Interaction Type selection */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" /> Channel / Interaction Type
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {channels.map(ch => {
                      const Icon = ch.icon;
                      const isActive = interactionSource === ch.id;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setInteractionSource(ch.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all duration-150 ${isActive
                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                            : 'bg-dark-900/60 border-slate-700 text-slate-350 hover:border-slate-550'
                            }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : ch.color}`} />
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Client contact selection */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Client Contact
                  </label>
                  <select
                    value={interactionContactId}
                    onChange={(e) => setInteractionContactId(e.target.value)}
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                  >
                    <option value="">{contacts.length === 0 ? 'No contacts found' : 'Select Contact'}</option>
                    {contacts.map(c => (
                      <option key={c.contactId} value={c.contactId}>
                        {c.name} — {c.designation || c.hierarchyTag}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Time selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Date
                    </label>
                    <input
                      type="date"
                      value={interactionDate}
                      onChange={(e) => setInteractionDate(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Time
                    </label>
                    <input
                      type="time"
                      value={interactionTime}
                      onChange={(e) => setInteractionTime(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Interaction message content */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider">Notes / Message Content *</label>
                  <textarea
                    value={interactionText}
                    onChange={(e) => setInteractionText(e.target.value)}
                    rows={5}
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                    placeholder="Enter interaction log text..."
                  />
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" /> Attachments
                  </label>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-900 border border-slate-700/80 hover:border-slate-500 rounded-xl text-xs font-semibold text-slate-350 hover:bg-dark-700 cursor-pointer active:scale-98 transition-all w-fit">
                        <Upload className="w-4 h-4" />
                        <span>Choose Files</span>
                        <input
                          type="file"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                          disabled={uploading}
                        />
                      </label>
                      {uploading && (
                        <span className="text-xs text-slate-550 animate-pulse flex items-center gap-1.5 font-bold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          Uploading...
                        </span>
                      )}
                    </div>

                    {attachmentsList.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-dark-900/60 border border-slate-800 rounded-2xl">
                        {attachmentsList.map((file, idx) => (
                          <div key={idx} className="relative group bg-slate-905 border border-slate-800 rounded-xl p-2.5 flex items-center gap-3 overflow-hidden shadow-sm">
                            <div className="shrink-0 w-8 h-8 rounded-lg bg-dark-800 border border-slate-800 flex items-center justify-center overflow-hidden">
                              {file.type.startsWith('image/') ? (
                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                              ) : file.type.startsWith('video/') ? (
                                <Video className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <FileText className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-200 truncate pr-4">{file.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Task assignments / Mentions */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <AtSign className="w-3 h-3" /> Assign Task
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={mentionSearch}
                      onFocus={() => setShowMentionDropdown(true)}
                      onChange={(e) => handleMentionSearchChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                      placeholder="Type @name to assign task..."
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                    />
                    {showMentionDropdown && (() => {
                      const query = getMentionSearchQuery(mentionSearch);
                      const filteredStaff = staffList.filter(s =>
                        s.name.toLowerCase().includes(query.toLowerCase()) ||
                        s.email.toLowerCase().includes(query.toLowerCase())
                      );
                      if (filteredStaff.length === 0 || !mentionSearch.includes('@')) return null;
                      return (
                        <div className="absolute z-15 w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-36 overflow-y-auto">
                          {filteredStaff.map(s => {
                            const isSelected = selectedMentions.some(m => m.uid === s.uid);
                            return (
                              <button
                                key={s.uid}
                                type="button"
                                onMouseDown={() => insertMention(s)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors text-slate-700 ${isSelected ? 'bg-primary/5 text-primary' : ''
                                  }`}
                              >
                                <div className="flex flex-col items-start text-left">
                                  <span className="font-bold text-black">{s.name}</span>
                                  <span className="text-xs text-slate-500 font-semibold">{s.role}</span>
                                </div>
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  {selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedMentions.map(m => (
                        <span key={m.uid} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold rounded-full px-2 py-0.5">
                          @{m.name}
                          <button type="button" onClick={() => toggleMention(m)} className="hover:text-red-500 ml-0.5 cursor-pointer">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {selectedMentions.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-850">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Date</label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Priority</label>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-dark-900/40">
                <button
                  type="button"
                  onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2.5 flex items-center gap-2 transition-all shadow-lg shadow-primary/20 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Save &amp; Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Health Score Explanation Breakdown */}
      {isHealthExplanationOpen && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-700/80 flex flex-col shadow-2xl max-h-[92vh] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-white text-sm">Health Score Breakdown</h3>
                  <p className="text-xs text-slate-500">Pillar calculations contributing to client health status</p>
                </div>
              </div>
              <button
                onClick={() => { setIsHealthExplanationOpen(false); setExplanationData(null); }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {explanationLoading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="text-xs text-slate-400">Analyzing database logs and metrics...</span>
                </div>
              ) : !explanationData ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Failed to load health score metrics.
                </div>
              ) : (
                <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
                  {/* Summary Banner */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex items-center gap-6">
                    <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                      <span className="text-xl font-black text-white">{explanationData.healthScore}%</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">Status: <span className={
                        explanationData.healthScore >= 90 ? 'text-emerald-400' :
                          explanationData.healthScore >= 75 ? 'text-blue-400' :
                            explanationData.healthScore >= 50 ? 'text-amber-400' :
                              'text-rose-400'
                      }>{explanationData.status}</span></h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        The score is derived from a weighted calculation across four primary health categories (25% weight each).
                      </p>
                    </div>
                  </div>

                  {/* 4 Pillars Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Pillar 1 */}
                    <div className="bg-dark-900/60 border border-slate-800 rounded-xl p-4.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">1. Engagement Frequency</span>
                        <span className="text-xs font-black text-primary">{explanationData.engagementScore}/100</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Based on the total number of logged interactions within the last 30 days.
                      </p>
                      <div className="text-xs p-2 bg-slate-900/40 rounded border border-slate-850 flex justify-between font-medium">
                        <span className="text-slate-500">Recent Touchpoints:</span>
                        <span className="text-slate-200">{explanationData.engagementCount} interactions</span>
                      </div>
                    </div>

                    {/* Pillar 2 */}
                    <div className="bg-dark-900/60 border border-slate-800 rounded-xl p-4.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">2. Relationship Depth</span>
                        <span className="text-xs font-black text-primary">{explanationData.relationshipScore}/100</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Based on mapping senior executives (VP/CXO) and key decision makers.
                      </p>
                      <div className="text-xs p-2 bg-slate-900/40 rounded border border-slate-850 space-y-1 font-medium">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Mapped Contacts:</span>
                          <span className="text-slate-200">{explanationData.contactsCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">CXO/VP Present:</span>
                          <span className={explanationData.hasCXOorVP ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {explanationData.hasCXOorVP ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Decision Maker Mapped:</span>
                          <span className={explanationData.hasDecisionMaker ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {explanationData.hasDecisionMaker ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pillar 3 */}
                    <div className="bg-dark-900/60 border border-slate-800 rounded-xl p-4.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">3. Sentiment Trend</span>
                        <span className="text-xs font-black text-primary">{Math.round(explanationData.sentimentScore)}/100</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Average sentiment of up to the last 5 logged communications.
                      </p>
                      <div className="text-xs p-2 bg-slate-900/40 rounded border border-slate-850 space-y-1 font-medium max-h-24 overflow-y-auto">
                        {explanationData.recentInteractionsSentiments.length === 0 ? (
                          <span className="text-slate-500 block">No interaction data available.</span>
                        ) : (
                          explanationData.recentInteractionsSentiments.map((s, idx) => (
                            <div key={s.interactionId || idx} className="flex justify-between gap-2 truncate">
                              <span className="text-slate-500 truncate">{s.subject || 'Interaction'}</span>
                              <span className={
                                s.sentiment === 'Positive' ? 'text-emerald-400' :
                                  s.sentiment === 'Negative' ? 'text-rose-400' : 'text-slate-400'
                              }>{s.sentiment}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Pillar 4 */}
                    <div className="bg-dark-900/60 border border-slate-800 rounded-xl p-4.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">4. Risk Signals</span>
                        <span className="text-xs font-black text-primary">{explanationData.riskScore}/100</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Points are deducted for open active risk issues logged against the account.
                      </p>
                      <div className="text-xs p-2 bg-slate-900/40 rounded border border-slate-850 space-y-1 font-medium max-h-24 overflow-y-auto">
                        {explanationData.activeRisks.length === 0 ? (
                          <span className="text-emerald-400 font-bold block">✓ No active risks detected</span>
                        ) : (
                          explanationData.activeRisks.map(r => (
                            <div key={r.riskId} className="border-b border-slate-850/50 pb-1 last:border-0 last:pb-0">
                              <div className="flex justify-between">
                                <span className="text-slate-300 font-bold">{r.category}</span>
                                <span className={r.severity === 'High' ? 'text-rose-400' : 'text-amber-400'}>{r.severity}</span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">{r.description}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => { setIsHealthExplanationOpen(false); setExplanationData(null); }}
                className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2 transition-colors cursor-pointer"
              >
                Close breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
