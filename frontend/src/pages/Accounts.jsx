import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Globe, Building2, ShieldAlert, UserPlus, Send, X, 
  MessageSquare, Mail, Calendar, Clock, Users, AtSign, CheckSquare, Square, Mic, Video
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Accounts() {
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

    contacts,
    fetchContacts,
    addContact,
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
    fetchStaff
  } = useStore();

  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected Account details drawer state
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Modals state
  const [isEditAccountOpen, setIsEditAccountOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);

  // Forms fields
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Technology');
  const [region, setRegion] = useState('North America');

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactDesignation, setContactDesignation] = useState('');
  const [contactHierarchy, setContactHierarchy] = useState('Staff');
  const [contactInfluence, setContactInfluence] = useState('Observer');

  const [interactionSource, setInteractionSource] = useState('Outlook');
  const [interactionText, setInteractionText] = useState('');
  const [interactionSubject, setInteractionSubject] = useState('');
  const [interactionDate, setInteractionDate] = useState(new Date().toISOString().split('T')[0]);
  const [interactionTime, setInteractionTime] = useState(new Date().toTimeString().slice(0, 5));
  const [interactionContactId, setInteractionContactId] = useState('');
  const [interactionAccountId, setInteractionAccountId] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);

  const [editAccountId, setEditAccountId] = useState('');

  const industries = ['Technology', 'Finance', 'Logistics', 'Healthcare', 'Manufacturing', 'Retail'];
  const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East'];

  // Load accounts and staff on mount
  useEffect(() => {
    const filters = {};
    if (industryFilter) filters.industry = industryFilter;
    if (regionFilter) filters.region = regionFilter;
    if (statusFilter) filters.status = statusFilter;

    fetchAccounts(currentPage, search, filters);
    fetchStaff();
  }, [currentPage, search, industryFilter, regionFilter, statusFilter]);

  // Load dependencies when account is selected
  useEffect(() => {
    if (selectedAccount) {
      const id = selectedAccount.accountId || selectedAccount.id;
      fetchContacts(id);
      fetchInteractions(id);
      fetchRisks(id);
      // Pre-select this account in log interaction form
      setInteractionAccountId(id);
      setInteractionContactId('');
    }
  }, [selectedAccount]);

  const handleEditAccount = async (e) => {
    e.preventDefault();
    const success = await updateAccount(editAccountId, { companyName, industry, region });
    if (success) {
      setIsEditAccountOpen(false);
      // Update selected reference if currently open
      if (selectedAccount && (selectedAccount.accountId === editAccountId || selectedAccount.id === editAccountId)) {
        setSelectedAccount(prev => ({ ...prev, companyName, industry, region }));
      }
      fetchAccounts(currentPage);
    }
  };

  const openEditModal = (acc) => {
    const id = acc.accountId || acc.id;
    setEditAccountId(id);
    setCompanyName(acc.companyName);
    setIndustry(acc.industry);
    setRegion(acc.region);
    setIsEditAccountOpen(true);
  };

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

  const handleCreateContact = async (e) => {
    e.preventDefault();
    const id = selectedAccount.accountId || selectedAccount.id;
    const success = await addContact({
      accountId: id,
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
      designation: contactDesignation,
      hierarchyTag: contactHierarchy,
      influenceTag: contactInfluence
    });

    if (success) {
      setIsAddContactOpen(false);
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setContactDesignation('');
      setContactHierarchy('Staff');
      setContactInfluence('Observer');
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

    const res = await addInteraction({
      accountId: targetAccountId,
      contactId: targetContactId,
      source: interactionSource,
      subject: interactionSubject,
      messageText: interactionText,
      date: interactionDate,
      time: interactionTime,
      actionMentions: selectedMentions
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
    setInteractionSubject('');
    setInteractionSource('Outlook');
    setInteractionDate(new Date().toISOString().split('T')[0]);
    setInteractionTime(new Date().toTimeString().slice(0, 5));
    setInteractionContactId('');
    setSelectedMentions([]);
    setMentionSearch('');
  };

  const toggleMention = (staffMember) => {
    setSelectedMentions(prev => {
      const exists = prev.find(m => m.uid === staffMember.uid);
      if (exists) return prev.filter(m => m.uid !== staffMember.uid);
      return [...prev, { uid: staffMember.uid, name: staffMember.name }];
    });
  };

  const triggerGenerateAISummary = () => {
    const id = selectedAccount.accountId || selectedAccount.id;
    fetchAccountSummary(id);
  };

  const channels = [
    { id: 'Outlook', label: 'Outlook', icon: Mail, color: 'text-blue-400' },
    { id: 'Teams', label: 'Teams', icon: MessageSquare, color: 'text-purple-400' },
    { id: 'Message', label: 'Message', icon: Mic, color: 'text-emerald-400' },
    { id: 'Meeting', label: 'Meeting', icon: Video, color: 'text-amber-400' },
    { id: 'Mail', label: 'Mail', icon: Mail, color: 'text-rose-400' },
  ];

  const getHealthPillColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
    if (score >= 75) return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
    return 'bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse';
  };

  return (
    <div className="flex gap-8 relative select-none h-[calc(100vh-10rem)]">
      
      {/* LEFT PANEL: ACCOUNTS TABLE LIST */}
      <div className={`flex-1 flex flex-col justify-between glass p-6 rounded-2xl border border-slate-800/80 transition-all duration-300 ${
        selectedAccount ? 'max-w-[50%]' : 'w-full'
      }`}>
        
        {/* Header Tools */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-wide">Client Portfolio</h2>
            {['Admin', 'Sales Manager'].includes(user?.role) && (
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
        <div className="flex-1 overflow-y-auto mb-4 border border-slate-800/60 rounded-xl">
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
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${getHealthPillColor(acc.healthScore)}`}>
                          {acc.healthScore}% - {acc.status}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        {['Admin', 'Sales Manager'].includes(user?.role) && (
                          <button 
                            onClick={() => openEditModal(acc)}
                            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-300 hover:text-white transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {user?.role === 'Admin' && (
                          <button 
                            onClick={() => handleDeleteAccount(acc)}
                            className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 p-2 rounded-lg text-rose-400 hover:text-rose-200 transition-colors"
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
        <div className="w-[50%] glass rounded-2xl border border-slate-800/80 p-6 flex flex-col justify-between overflow-y-auto relative animate-soft-pulse duration-1000">
          
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
                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${getHealthPillColor(selectedAccount.healthScore)}`}>
                  {selectedAccount.healthScore}% {selectedAccount.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-2.5">
                <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {selectedAccount.industry}</span>
                <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {selectedAccount.region}</span>
              </div>
            </div>


            {/* 3. Account Contacts (CRUD) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Key Contacts</h3>
                {['Admin', 'Sales Manager', 'Employee'].includes(user?.role) && (
                  <button 
                    onClick={() => setIsAddContactOpen(true)}
                    className="text-primary hover:underline text-xs font-semibold flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    New Contact
                  </button>
                )}
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
                          <span className="text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded">
                            {c.hierarchyTag}
                          </span>
                        </div>
                        <p className="text-[11px] text-primary font-medium mt-0.5">{c.designation}</p>
                        <p className="text-[10px] text-slate-400 mt-2 block truncate">{c.email}</p>
                        {c.phone && <p className="text-[10px] text-slate-500">{c.phone}</p>}
                      </div>
                      
                      <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-slate-800/40">
                        <span className="text-[9px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded px-1.5 py-0.5">
                          {c.influenceTag}
                        </span>
                        {['Admin', 'Sales Manager'].includes(user?.role) && (
                          <button 
                            onClick={() => deleteContact(c.contactId, selectedAccount.accountId || selectedAccount.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                  className="bg-primary/10 border border-primary/20 hover:bg-primary/20 rounded-lg text-xs font-bold text-white px-2.5 py-1.5 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  Log Activity
                </button>
              </div>

              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {interactions.length === 0 ? (
                  <span className="text-xs text-slate-500 block py-2">No activity logged yet.</span>
                ) : (
                  interactions.map(item => (
                    <div key={item.interactionId} className="bg-dark-900/60 p-4 rounded-xl border border-slate-800/80 space-y-2 relative">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="bg-slate-800 text-slate-300 font-bold border border-slate-700 px-2 py-0.5 rounded-full">
                          {item.source}
                        </span>
                        <span className="text-slate-500 font-medium">
                          {new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{item.messageText}</p>
                      
                      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800/40 text-[9px] font-bold">
                        <span className={`px-1.5 py-0.5 rounded border ${
                          item.sentiment === 'Positive' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                          item.sentiment === 'Negative' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                          'bg-slate-800 border-slate-700 text-slate-300'
                        }`}>
                          {item.sentiment} Sentiment
                        </span>
                        {item.riskDetected && (
                          <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 animate-pulse">
                            <ShieldAlert className="w-3 h-3 text-rose-500" />
                            Risk: {item.riskCategory}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      ) : null}

      {/* ========================================================
          MODALS INTERFACE CODES (Edit, Contacts etc) 
          ======================================================== */}

      {/* 2. Modal: Edit Account */}
      {isEditAccountOpen && (
        <div className="fixed inset-0 bg-dark-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-sm w-full rounded-2xl p-6 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Edit Client Account</h3>
              <button onClick={() => setIsEditAccountOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEditAccount} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Company Name</label>
                <input 
                  type="text" 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required 
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Industry</label>
                <select 
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Region</label>
                <select 
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  {regions.map(reg => <option key={reg} value={reg}>{reg}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-lg py-2.5 shadow-lg active:scale-98 transition-all">
                Save Updates
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Add Contact */}
      {isAddContactOpen && (
        <div className="fixed inset-0 bg-dark-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-sm w-full rounded-2xl p-6 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Add Account Stakeholder</h3>
              <button onClick={() => setIsAddContactOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateContact} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase font-semibold">Contact Name</label>
                <input 
                  type="text" 
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required 
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                  placeholder="e.g. Alice Smith"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase font-semibold">Corporate Email</label>
                <input 
                  type="email" 
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required 
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                  placeholder="alice@domain.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase font-semibold">Role Designation</label>
                <input 
                  type="text" 
                  value={contactDesignation}
                  onChange={(e) => setContactDesignation(e.target.value)}
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                  placeholder="e.g. Chief Technical Officer"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-400 uppercase font-semibold">Hierarchy Tag</label>
                  <select 
                    value={contactHierarchy}
                    onChange={(e) => setContactHierarchy(e.target.value)}
                    className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                  >
                    <option value="CXO">CXO</option>
                    <option value="VP">VP</option>
                    <option value="Director">Director</option>
                    <option value="Manager">Manager</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-400 uppercase font-semibold">Influence Tag</label>
                  <select 
                    value={contactInfluence}
                    onChange={(e) => setContactInfluence(e.target.value)}
                    className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                  >
                    <option value="Decision Maker">Decision Maker</option>
                    <option value="Influencer">Influencer</option>
                    <option value="Champion">Champion</option>
                    <option value="Gatekeeper">Gatekeeper</option>
                    <option value="Observer">Observer</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase font-semibold">Phone Number</label>
                <input 
                  type="text" 
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <button type="submit" className="w-full bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-lg py-2.5 mt-2 transition-all">
                Save Contact
              </button>
            </form>
          </div>
        </div>
      )}

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
                  <p className="text-[10px] text-slate-500">Record a client interaction for AI analysis & tracking</p>
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
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
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

                {/* Section 4: Subject */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Subject / Title</label>
                  <input
                    type="text"
                    value={interactionSubject}
                    onChange={(e) => setInteractionSubject(e.target.value)}
                    placeholder="e.g. Q3 QBR Follow-up, Deployment Concern Call..."
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                  />
                </div>

                {/* Section 5: Notes / Message */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Notes / Message Content *</label>
                  <textarea
                    value={interactionText}
                    onChange={(e) => setInteractionText(e.target.value)}
                    required
                    rows={5}
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                    placeholder="Paste email content, meeting notes, Teams chat log, call summary... Gemini AI will automatically parse sentiment, detect risks, and update the account health score."
                  />
                </div>

                {/* Section 6: Action Tracking / Internal Mentions */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <AtSign className="w-3 h-3" /> Action Tracking — Mention Internal Staff
                  </label>

                  {/* Selected Tags */}
                  {selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedMentions.map(m => (
                        <span
                          key={m.uid}
                          className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-[10px] font-semibold rounded-full px-2 py-0.5"
                        >
                          @{m.name}
                          <button type="button" onClick={() => toggleMention(m)} className="hover:text-white ml-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Mention Search & Dropdown */}
                  <div className="relative">
                    <input
                      type="text"
                      value={mentionSearch}
                      onFocus={() => setShowMentionDropdown(true)}
                      onChange={(e) => { setMentionSearch(e.target.value); setShowMentionDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                      placeholder="Search and tag internal team members..."
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                    />
                    {showMentionDropdown && (
                      <div className="absolute z-10 w-full top-full mt-1 bg-dark-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-36 overflow-y-auto">
                        {staffList
                          .filter(s => !mentionSearch || s.name.toLowerCase().includes(mentionSearch.toLowerCase()) || s.email.toLowerCase().includes(mentionSearch.toLowerCase()))
                          .map(s => {
                            const isSelected = selectedMentions.some(m => m.uid === s.uid);
                            return (
                              <button
                                key={s.uid}
                                type="button"
                                onMouseDown={() => { toggleMention(s); setMentionSearch(''); }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${
                                  isSelected ? 'text-primary' : 'text-slate-300'
                                }`}
                              >
                                <div className="flex flex-col items-start">
                                  <span className="font-semibold">{s.name}</span>
                                  <span className="text-[10px] text-slate-500">{s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                </div>
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-slate-600" />}
                              </button>
                            );
                          })}
                        {staffList.length === 0 && (
                          <p className="text-[10px] text-slate-500 px-3 py-2">No staff found. Add users in User Directory first.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-500 italic">AI will analyze this log for sentiment &amp; risk signals automatically.</p>
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
                    Save & Analyze
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
