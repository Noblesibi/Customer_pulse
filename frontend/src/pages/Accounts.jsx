import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Edit2, Trash2, Globe, Building2, ShieldAlert, UserPlus, Send, X, 
  MessageSquare, Mail, Calendar, Clock, Users, AtSign, CheckSquare, Square, Mic, Video,
  CheckCheck, Phone, Paperclip, Upload, FileText, Loader2
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Accounts() {
  const navigate = useNavigate();
  const { 
    user,
    accounts,
    totalAccounts,
    totalPages,
    currentPage,
    accountsLoading,
    fetchAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    fetchHealthExplanation,

    contacts,
    fetchContacts,
    addContact,
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
    fetchReplies
  } = useStore();

  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected Account details drawer state
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);

  // Modals state
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);

  const [interactionSource, setInteractionSource] = useState('Outlook Mail');
  const [interactionText, setInteractionText] = useState('');
  const [interactionDate, setInteractionDate] = useState(new Date().toISOString().split('T')[0]);
  const [interactionTime, setInteractionTime] = useState(new Date().toTimeString().slice(0, 5));
  const [interactionContactId, setInteractionContactId] = useState('');
  const [interactionAccountId, setInteractionAccountId] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [attachmentsList, setAttachmentsList] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    const token = useStore.getState().token;

    for (const file of files) {
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });

        const res = await fetch('http://localhost:5000/api/interactions/upload', {
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
  const [isHealthExplanationOpen, setIsHealthExplanationOpen] = useState(false);
  const [explanationAccountId, setExplanationAccountId] = useState('');
  const [explanationData, setExplanationData] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  const handleShowHealthExplanation = async (accountId) => {
    setExplanationAccountId(accountId);
    setIsHealthExplanationOpen(true);
    setExplanationLoading(true);
    setExplanationData(null);
    const data = await fetchHealthExplanation(accountId);
    setExplanationData(data);
    setExplanationLoading(false);
  };

  const industries = ['Technology', 'Finance', 'Logistics', 'Healthcare', 'Manufacturing', 'Retail'];
  const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East'];

  // Load staff once on mount (independent of filter changes)
  useEffect(() => {
    fetchStaff();
  }, []);

  // Load accounts when filters / page change
  useEffect(() => {
    const filters = {};
    if (industryFilter) filters.industry = industryFilter;
    if (regionFilter) filters.region = regionFilter;
    if (statusFilter) filters.status = statusFilter;

    fetchAccounts(currentPage, search, filters);
  }, [currentPage, search, industryFilter, regionFilter, statusFilter]);

  // Keep selectedAccount panel in sync whenever the accounts array refreshes
  useEffect(() => {
    if (selectedAccount) {
      const id = selectedAccount.accountId || selectedAccount.id;
      const fresh = accounts.find(a => (a.accountId || a.id) === id);
      if (fresh) setSelectedAccount(fresh);
    }
  }, [accounts]);

  // Load dependencies ONLY when the account ID changes (not on every property update)
  useEffect(() => {
    const id = selectedAccount ? (selectedAccount.accountId || selectedAccount.id) : null;
    if (id && id !== selectedAccountId) {
      setSelectedAccountId(id);
      fetchContacts(id);
      fetchInteractions(id);
      fetchRisks(id);
      setInteractionAccountId(id);
      setInteractionContactId('');
    }
    if (!selectedAccount) {
      setSelectedAccountId(null);
    }
  }, [selectedAccount]);



  const handleDeleteAccount = async (acc) => {
    const id = acc.accountId || acc.id;
    if (confirm(`Are you sure you want to permanently delete the account ${acc.companyName}?`)) {
      const success = await deleteAccount(id);
      if (success) {
        if (selectedAccount && (selectedAccount.accountId === id || selectedAccount.id === id)) {
          setSelectedAccount(null);
        }
        fetchAccounts(currentPage);
      }
    }
  };



  const handleLogInteraction = async (e) => {
    e.preventDefault();

    const targetAccountId = interactionAccountId || (selectedAccount?.accountId || selectedAccount?.id);
    const targetContactId = interactionContactId || (contacts[0]?.contactId);

    if (!targetAccountId) {
      alert('Please select an account.');
      return;
    }
    if (!targetContactId) {
      alert('Please add at least one contact to this account before logging an interaction.');
      return;
    }
    if (!interactionText.trim()) {
      alert('Please enter the interaction notes/message text.');
      return;
    }

    // Parse task text by stripping all @Name mentions from the text
    let taskText = mentionSearch.trim();
    selectedMentions.forEach(m => {
      taskText = taskText.replace(`@${m.name}`, '');
    });
    taskText = taskText.replace(/\s+/g, ' ').trim();

    const derivedSubject = interactionText.trim().split('\n')[0].slice(0, 50) || 'Interaction Note';
    const res = await addInteraction({
      accountId: targetAccountId,
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
      setIsLogInteractionOpen(false);
      resetInteractionForm();
      // Refresh interactions and account health info
      fetchInteractions(targetAccountId);
      fetchRisks(targetAccountId);
      // Reload parent accounts table for live health score
      fetchAccounts(currentPage);
      // Also update selectedAccount values
      if (res.health) {
        setSelectedAccount(prev => ({
          ...prev,
          healthScore: res.health.healthScore,
          status: res.health.status
        }));
      }
    }
  };

  const resetInteractionForm = () => {
    setInteractionText('');
    setInteractionSource('Outlook Mail');
    setInteractionDate(new Date().toISOString().split('T')[0]);
    setInteractionTime(new Date().toTimeString().slice(0, 5));
    setInteractionContactId('');
    setSelectedMentions([]);
    setMentionSearch('');
    setTaskDueDate('');
    setTaskPriority('Medium');
    setAttachmentsList([]);
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
    
    // Recalculate selectedMentions in real-time
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
    // Parse mentions in real-time
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
      
      // Update the mentionSearch text to match the selected mentions
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

  const triggerGenerateAISummary = () => {
    const id = selectedAccount.accountId || selectedAccount.id;
    fetchAccountSummary(id);
  };

  const channels = [
    { id: 'Outlook Mail', label: 'Outlook Mail', icon: Mail, color: 'text-blue-400' },
    { id: 'Teams Chat', label: 'Teams Chat', icon: MessageSquare, color: 'text-purple-400' },
    { id: 'Phone', label: 'Phone', icon: Phone, color: 'text-emerald-400' },
    { id: 'Face to Face', label: 'Face to Face', icon: Users, color: 'text-amber-400' },
    { id: 'Teams Meeting', label: 'Teams Meeting', icon: Video, color: 'text-rose-400' },
  ];

  const getHealthPillColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
    if (score >= 75) return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
    return 'bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse';
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 relative select-none h-auto lg:h-[calc(100vh-10rem)]">
      
      {/* LEFT PANEL: ACCOUNTS TABLE LIST */}
      <div className={`w-full lg:flex-1 flex flex-col justify-between glass p-4 md:p-6 rounded-2xl border border-slate-800/80 transition-all duration-300 ${
        selectedAccount ? 'lg:max-w-[50%]' : 'w-full'
      }`}>
        
        {/* Header Tools */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-wide">Client Portfolio</h2>
            {['Admin', 'Sales Manager', 'Executive'].includes(user?.role) && (
              <button 
                onClick={() => window.location.href = '/accounts/new'}
                className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white active:scale-98 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </button>
            )}
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search Box */}
            <div className="relative col-span-1 md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-xs rounded-xl py-2.5 pl-9 pr-4 text-white focus:outline-none transition-colors"
              />
            </div>

            {/* Filter: Industry */}
            <select 
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-xs rounded-xl p-2.5 text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="">All Industries</option>
              {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>

            {/* Filter: Region */}
            <select 
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-xs rounded-xl p-2.5 text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="">All Regions</option>
              {regions.map(reg => <option key={reg} value={reg}>{reg}</option>)}
            </select>

            {/* Filter: Status */}
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-xs rounded-xl p-2.5 text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="">All Health Statuses</option>
              <option value="Excellent">Excellent</option>
              <option value="Healthy">Healthy</option>
              <option value="Warning">Warning</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-y-auto mb-4 border border-slate-800/60 rounded-xl overflow-x-auto">
          {accountsLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No clients found matching the selected parameters
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-dark-900/40 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-4">Company</th>
                  <th className="p-4">Industry</th>
                  <th className="p-4">Region</th>
                  <th className="p-4 text-center">Health</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {accounts.map(acc => {
                  const id = acc.accountId || acc.id;
                  const isSelected = selectedAccount && (selectedAccount.accountId === id || selectedAccount.id === id);
                  return (
                    <tr 
                      key={id}
                      onClick={() => setSelectedAccount(acc)}
                      className={`hover:bg-slate-800/20 cursor-pointer transition-colors duration-150 ${
                        isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                      }`}
                    >
                      <td className="p-4 font-bold text-white">{acc.companyName}</td>
                      <td className="p-4 text-slate-300">{acc.industry}</td>
                      <td className="p-4 text-slate-300">{acc.region}</td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowHealthExplanation(id);
                          }}
                          className={`px-2.5 py-1 text-xs font-bold rounded-full border whitespace-nowrap cursor-help hover:scale-105 transition-transform duration-150 ${getHealthPillColor(acc.healthScore)}`}
                        >
                          {acc.healthScore}% - {acc.status}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {['Admin', 'Sales Manager', 'Executive'].includes(user?.role) && (
                          <button 
                            onClick={() => navigate(`/accounts/${id}/edit`)}
                            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-300 hover:text-white transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {['Admin', 'Executive'].includes(user?.role) && (
                          <button 
                            onClick={() => handleDeleteAccount(acc)}
                            className="inline-flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 p-2 rounded-lg text-rose-400 hover:text-rose-200 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Row */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs">
            <span className="text-slate-400">Showing page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => fetchAccounts(currentPage - 1, search)}
                className="bg-slate-800 border border-slate-700/60 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                Prev
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => fetchAccounts(currentPage + 1, search)}
                className="bg-slate-800 border border-slate-700/60 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: SELECTED ACCOUNT DRAWER DETAILS */}
      {selectedAccount ? (
        <div className="w-full lg:w-[50%] glass rounded-2xl border border-slate-800/80 p-4 md:p-6 flex flex-col justify-between overflow-y-auto relative animate-soft-pulse duration-1000">
          
          {/* Close Panel Button */}
          <button 
            onClick={() => setSelectedAccount(null)}
            className="absolute top-5 right-5 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="space-y-6">
            {/* 1. Account Identity Header */}
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white">{selectedAccount.companyName}</h2>
                <span 
                  onClick={() => handleShowHealthExplanation(selectedAccount.accountId || selectedAccount.id)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-full border cursor-help hover:scale-105 transition-transform duration-150 ${getHealthPillColor(selectedAccount.healthScore)}`}
                >
                  {selectedAccount.healthScore}% {selectedAccount.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-2.5">
                <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {selectedAccount.industry}</span>
                <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {selectedAccount.region}</span>
              </div>

              {/* Account Owner Selection */}
              <div className="mt-4 p-3 bg-slate-905/30 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Owner</span>
                  <span className="text-slate-200 font-semibold">{selectedAccount.ownerName || 'Unassigned'}</span>
                </div>
                {['Admin', 'Sales Manager', 'Executive'].includes(user?.role) ? (
                  <select
                    value={selectedAccount.ownerId || ''}
                    disabled={staffList.length === 0}
                    onChange={async (e) => {
                      const newOwnerId = e.target.value;
                      const selectedUser = staffList.find(s => s.uid === newOwnerId);
                      const newOwnerName = selectedUser ? selectedUser.name : 'Unknown User';
                      // Optimistic update so dropdown doesn't snap back
                      setSelectedAccount(prev => ({
                        ...prev,
                        ownerId: newOwnerId,
                        ownerName: newOwnerName
                      }));
                      const success = await updateAccount(selectedAccount.accountId || selectedAccount.id, {
                        ownerId: newOwnerId,
                        ownerName: newOwnerName
                      });
                      if (success) {
                        fetchAccounts(currentPage);
                      } else {
                        // Revert on failure
                        setSelectedAccount(prev => ({
                          ...prev,
                          ownerId: selectedAccount.ownerId,
                          ownerName: selectedAccount.ownerName
                        }));
                      }
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-primary text-xs cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(staff => (
                      <option key={staff.uid} value={staff.uid}>
                        {staff.name} ({staff.role})
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>


            {/* 3. Account Contacts (CRUD) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Key Contacts</h3>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {contacts.length === 0 ? (
                  <span className="text-xs text-slate-500 col-span-2 block py-2">No contact records mapped yet.</span>
                ) : (
                  contacts.map(c => (
                    <div key={c.contactId} className="bg-dark-900/60 p-3 rounded-xl border border-slate-800 relative group flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white">{c.name}</h4>
                          <span className="text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded">
                            {c.hierarchyTag}
                          </span>
                        </div>
                        <p className="text-xs text-primary font-medium mt-0.5">{c.designation}</p>
                        <p className="text-xs text-slate-400 mt-2 block truncate">{c.email}</p>
                        {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                        {c.projectName && (
                          <div className="mt-2 text-xs flex items-center gap-1 truncate">
                            <span className="text-slate-500 font-bold text-xs uppercase">Project:</span>
                            <span className="text-black font-semibold">{c.projectName}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-slate-800/40">
                        <span className="text-xs font-bold bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded px-1.5 py-0.5">
                          {c.influenceTag}
                        </span>
                        {['Admin', 'Sales Manager', 'Executive'].includes(user?.role) && (
                          <button 
                            onClick={() => deleteContact(c.contactId, selectedAccount.accountId || selectedAccount.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Contact Owner Select */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/30">
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-0.5">Stakeholder Owner</label>
                        {['Admin', 'Sales Manager', 'Employee', 'Executive'].includes(user?.role) ? (
                          <select
                            value={c.ownerId || ''}
                            disabled={staffList.length === 0}
                            onChange={async (e) => {
                              const newOwnerId = e.target.value;
                              const selectedUser = staffList.find(s => s.uid === newOwnerId);
                              const newOwnerName = selectedUser ? selectedUser.name : 'Unknown User';
                              // Optimistic local update via contacts state refresh
                              await updateContact(c.contactId, {
                                ownerId: newOwnerId,
                                ownerName: newOwnerName
                              });
                              // Refresh contacts from server to confirm persisted value
                              fetchContacts(selectedAccount.accountId || selectedAccount.id);
                            }}
                            className="w-full bg-slate-800 border border-slate-705 text-slate-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-primary cursor-pointer font-medium disabled:opacity-50"
                          >
                            <option value="">Unassigned</option>
                            {staffList.map(staff => (
                              <option key={staff.uid} value={staff.uid}>
                                {staff.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-300 font-semibold block">
                            👤 {c.ownerName || 'Unassigned'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 4. Timeline Feed */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Interaction Timeline</h3>
                <button 
                  onClick={() => setIsLogInteractionOpen(true)}
                  className="bg-primary/10 border border-primary/20 hover:bg-primary/20 rounded-lg text-xs font-bold text-black px-2.5 py-1.5 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  Log Activity
                </button>
              </div>

              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {interactions.length === 0 ? (
                  <span className="text-xs text-slate-500 block py-2">No activity logged yet.</span>
                ) : (
                  interactions.map(item => {
                    const replies = repliesByInteraction[item.interactionId] || [];
                    return (
                      <div key={item.interactionId} className="bg-dark-900/60 p-3 rounded-xl border border-slate-800/80 space-y-2 relative">
                        <div className="flex items-center justify-between text-xs">
                          <span className="bg-slate-800 text-slate-300 font-bold border border-slate-700 px-2 py-0.5 rounded-full">
                            {item.source}
                          </span>
                          <span className="text-slate-500 font-medium">
                            {new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        {(() => {
                          const title = (item.messageText && item.messageText.trim()) 
                            ? item.messageText.trim().split('\n')[0] 
                            : (item.subject || 'Interaction Note');
                          const hasMore = item.messageText && item.messageText.trim().split('\n').length > 1;
                          return (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-slate-200 leading-relaxed">{title}</p>
                              {hasMore && (
                                <details className="group text-xs text-slate-500 cursor-pointer">
                                  <summary className="hover:text-primary transition-colors focus:outline-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-1 select-none font-bold">
                                    <span>View notes</span>
                                  </summary>
                                  <p className="text-slate-400 mt-1 pl-2 border-l border-slate-800 leading-relaxed whitespace-pre-wrap">
                                    {item.messageText}
                                  </p>
                                </details>
                              )}
                            </div>
                          );
                        })()}

                        {/* @Mention Tags + Read Receipt */}
                        {item.actionMentions && item.actionMentions.length > 0 && (
                          <div className="space-y-1.5 pt-1 border-t border-slate-800/20 w-full">
                            <div className="flex flex-col gap-1.5">
                              {item.actionMentions.map(m => {
                                const notif = item.notifications?.find(n => n.toUserId === m.uid && n.type === 'Task Assigned');
                                // Determine display message showing only the actual task text
                                let displayMessage = m.task;
                                if (!displayMessage) {
                                  // Backward compatibility: Extract text inside quotes if present in notif.message
                                  const match = notif?.message?.match(/:\s*"([^"]+)"/);
                                  displayMessage = match ? match[1] : (notif ? notif.message : item.messageText);
                                }
                                return (
                                  <div key={m.uid} className="bg-slate-900/30 p-2 rounded-xl border border-slate-800/60 space-y-1 w-full text-xs leading-relaxed">
                                    <div className="flex items-center justify-between">
                                      <span className="flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary font-bold rounded-full px-2 py-0.5">
                                        <AtSign className="w-2.5 h-2.5" />{m.name}
                                      </span>
                                      <span className={`font-bold flex items-center gap-1 ${
                                        notif?.read ? 'text-emerald-400' : 'text-slate-500'
                                      }`}>
                                        {notif?.read ? (
                                          <>
                                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                                            Seen {notif.readAt ? `(${new Date(notif.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                                          </>
                                        ) : (
                                          <>
                                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                                            Pending
                                          </>
                                        )}
                                      </span>
                                    </div>
                                    <p className="text-slate-400 pl-1 font-medium">
                                      <span className="text-slate-500 font-bold">Task: </span>
                                      "{displayMessage}"
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800/40 text-xs font-bold">
                          <span className={`px-1.5 py-0.5 rounded border ${
                            item.sentiment === 'Positive' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            item.sentiment === 'Negative' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                            'bg-slate-800 border-slate-700 text-slate-300'
                          }`}>
                            {item.sentiment} Sentiment
                          </span>
                          {item.riskDetected && (
                            <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <ShieldAlert className="w-3 h-3 text-rose-500" />
                              Risk: {item.riskCategory}
                            </span>
                          )}
                          <button
                            onClick={() => fetchReplies(item.interactionId)}
                            className="ml-auto text-slate-500 hover:text-primary font-semibold text-xs underline cursor-pointer"
                          >
                            {replies.length > 0 ? `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` : 'Load replies'}
                          </button>
                        </div>

                        {/* Threaded replies */}
                        {replies.length > 0 && (
                          <div className="border-t border-slate-800/60 pt-2 space-y-1.5 ml-2">
                            {replies.map(r => (
                              <div key={r.replyId} className="flex items-start gap-2 text-xs">
                                <span className="text-slate-600 mt-0.5">└─</span>
                                <div className="flex-1">
                                  <span className="text-primary font-bold">{r.authorName}</span>
                                  <span className="text-slate-400 ml-1">{r.text}</span>
                                  <span className="text-slate-600 ml-2 text-xs">
                                    {new Date(r.timestamp).toLocaleString([], { timeStyle: 'short' })}
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
      ) : null}

      {/* ========================================================
          MODALS INTERFACE CODES (Edit, Contacts etc) 
          ======================================================== */}





      {/* 4. Modal: Log Interaction Activity — Rich Note-Keeping Panel */}
      {isLogInteractionOpen && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-700/80 flex flex-col shadow-2xl max-h-[92vh] overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <CheckSquare className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Log Activity</h3>
                  <p className="text-xs text-slate-500">Record a client interaction for AI analysis & tracking</p>
                </div>
              </div>
              <button onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogInteraction} className="overflow-y-auto flex-1">
              <div className="p-6 space-y-5">

                {/* Section 1: Channel Type */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                            isActive
                              ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                              : 'bg-dark-900/60 border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : ch.color}`} />
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Company & Contact */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" /> Company Account
                    </label>
                    <select
                      value={interactionAccountId}
                      onChange={(e) => {
                        setInteractionAccountId(e.target.value);
                        setInteractionContactId('');
                        // Load contacts for this account
                        fetchContacts(e.target.value);
                      }}
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    >
                      <option value="">Select Company</option>
                      {accounts.map(acc => (
                        <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>
                          {acc.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> Client Contact / Staff
                    </label>
                    <select
                      value={interactionContactId}
                      onChange={(e) => setInteractionContactId(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    >
                      <option value="">{contacts.length === 0 ? 'No contacts found' : 'Select Contact'}</option>
                      {contacts
                        .filter(c => !interactionAccountId || c.accountId === interactionAccountId)
                        .map(c => (
                          <option key={c.contactId} value={c.contactId}>
                            {c.name} — {c.designation || c.hierarchyTag}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Section 3: Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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



                {/* Section 5: Notes / Message */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Notes / Message Content *</label>
                  <textarea
                    value={interactionText}
                    onChange={(e) => setInteractionText(e.target.value)}
                    rows={5}
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                    placeholder="Paste email content, meeting notes, Teams chat log, call summary... Gemini AI will automatically parse sentiment, detect risks, and update the account health score."
                  />
                </div>

                {/* Section: Attachments */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" /> Attachments (Images, Videos, Docs, Files)
                  </label>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-900 border border-slate-700/80 hover:border-slate-500 rounded-xl text-xs font-semibold text-slate-350 hover:text-white cursor-pointer active:scale-98 transition-all w-fit">
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
                        <span className="text-xs text-slate-500 animate-pulse flex items-center gap-1.5 font-bold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          Uploading files to server...
                        </span>
                      )}
                    </div>

                    {/* Uploaded Attachments Preview List */}
                    {attachmentsList.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-dark-900/60 border border-slate-800 rounded-2xl">
                        {attachmentsList.map((file, idx) => (
                          <div key={idx} className="relative group bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 overflow-hidden shadow-sm">
                            <div className="shrink-0 w-10 h-10 rounded-lg bg-dark-800 border border-slate-800 flex items-center justify-center overflow-hidden">
                              {file.type.startsWith('image/') ? (
                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                              ) : file.type.startsWith('video/') ? (
                                <Video className="w-5 h-5 text-indigo-400" />
                              ) : (
                                <FileText className="w-5 h-5 text-amber-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-200 truncate pr-4">{file.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                {(file.size / 1024).toFixed(1)} KB · {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 6: Action Tracking / Internal Mentions */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <AtSign className="w-3 h-3" /> Assign Task
                  </label>

                  {/* Mention Search & Dropdown */}
                  <div className="relative">
                    <input
                      type="text"
                      value={mentionSearch}
                      onFocus={() => setShowMentionDropdown(true)}
                      onChange={(e) => handleMentionSearchChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                      placeholder="Type @name to assign task (e.g. @NDA Head take a look)..."
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
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors text-slate-700 ${
                                  isSelected ? 'bg-primary/5 text-primary' : ''
                                }`}
                              >
                                <div className="flex flex-col items-start text-left">
                                  <span className="font-bold" style={{ color: '#000000' }}>{s.name}</span>
                                  <span className="text-xs text-slate-500 font-semibold">{s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                </div>
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" style={{ color: 'var(--color-primary)' }} /> : <Square className="w-3.5 h-3.5 text-slate-400" style={{ color: '#94A3B8' }} />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Selected Tags Confirmation */}
                  {selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-xs text-slate-500 font-bold self-center">Assigned to:</span>
                      {selectedMentions.map(m => (
                        <span
                          key={m.uid}
                          className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold rounded-full px-2 py-0.5"
                        >
                          @{m.name}
                          <button type="button" onClick={() => toggleMention(m)} className="hover:text-white ml-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Task Metadata: Due Date & Priority */}
                {selectedMentions.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-850">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                        Task Due Date
                      </label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                        Task Priority
                      </label>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                      >
                        <option value="High">🔥 High</option>
                        <option value="Medium">⚡ Medium</option>
                        <option value="Low">💤 Low</option>
                      </select>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2.5 flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Save & Assign
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Health Score Explanation Breakdown */}
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
                className="text-slate-400 hover:text-white transition-colors"
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
                    {/* Pillar 1: Engagement Frequency */}
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

                    {/* Pillar 2: Relationship Depth */}
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

                    {/* Pillar 3: Sentiment Trend */}
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

                    {/* Pillar 4: Risk Signals */}
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
                className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2 transition-colors"
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
