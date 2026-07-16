import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Edit2, Trash2, Shield, User, X, Mail, Phone, ChevronRight, Grid3X3
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Contacts() {
  const navigate = useNavigate();
  const { 
    user,
    token,
    contacts, 
    contactsLoading, 
    fetchContacts, 
    addContact,
    updateContact,
    deleteContact,
    staffList,
    fetchStaff
  } = useStore();

  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [localAccounts, setLocalAccounts] = useState([]);

  // Modals state
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);

  // Form fields
  const [contactId, setContactId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [hierarchyTag, setHierarchyTag] = useState('Staff');
  const [influenceTag, setInfluenceTag] = useState('Observer');
  const [projectName, setProjectName] = useState('');
  const [projectIndustry, setProjectIndustry] = useState('');
  const [projectType, setProjectType] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const hierarchyTags = ['CXO', 'VP', 'Director', 'Manager', 'Staff'];
  const influenceTags = ['Decision Maker', 'Influencer', 'Champion', 'Gatekeeper', 'Observer'];
  const projectTypes = [
    'Development',
    'Support & Maintenance',
    'Testing & QA',
    'Consulting',
    'R&D',
    'Implementation'
  ];

  const canEdit = ['Admin', 'Sales Manager', 'Employee'].includes(user?.role);

  // Load all contacts when selection changes
  useEffect(() => {
    fetchContacts(selectedAccountId);
    fetchStaff();
  }, [selectedAccountId]);

  // Load accounts locally to list in dropdown/matrix mappings
  useEffect(() => {
    const loadAccounts = async () => {
      if (!token) return;
      try {
        const res = await fetch('http://localhost:5000/api/accounts?limit=1000', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          setLocalAccounts(data.accounts || []);
        }
      } catch (err) {
        console.error('Error loading accounts for contacts dropdown:', err);
      }
    };
    loadAccounts();
  }, [token]);

  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!accountId) {
      alert('Please select an account for the contact.');
      return;
    }
    const success = await addContact({
      accountId,
      name,
      email,
      phone,
      designation,
      hierarchyTag,
      influenceTag,
      projectName,
      projectIndustry,
      projectType: projectType || 'Development',
      ownerId,
      ownerName
    });
    if (success) {
      setIsAddContactOpen(false);
      resetForm();
    } else {
      const errorMsg = useStore.getState().contactsError || "Failed to create contact. Please try again.";
      alert(errorMsg);
    }
  };

  const handleEditContact = async (e) => {
    e.preventDefault();
    const success = await updateContact(contactId, {
      accountId,
      name,
      email,
      phone,
      designation,
      hierarchyTag,
      influenceTag,
      projectName,
      projectIndustry,
      projectType: projectType || 'Development',
      ownerId,
      ownerName
    });
    if (success) {
      setIsEditContactOpen(false);
      resetForm();
      fetchContacts(selectedAccountId);
    } else {
      const errorMsg = useStore.getState().contactsError || "Failed to update contact. Please try again.";
      alert(errorMsg);
    }
  };

  const openEditModal = (c) => {
    setContactId(c.contactId || c.id);
    setAccountId(c.accountId);
    setName(c.name);
    setEmail(c.email);
    setPhone(c.phone || '');
    setDesignation(c.designation);
    setHierarchyTag(c.hierarchyTag);
    setInfluenceTag(c.influenceTag);
    setProjectName(c.projectName || '');
    setProjectIndustry(c.projectIndustry || '');
    setProjectType(c.projectType || 'Development');
    setOwnerId(c.ownerId || '');
    setOwnerName(c.ownerName || '');
    setIsEditContactOpen(true);
  };

  const handleDeleteContact = async (c) => {
    const id = c.contactId || c.id;
    if (confirm(`Are you sure you want to delete contact ${c.name}?`)) {
      await deleteContact(id, selectedAccountId);
    }
  };

  const resetForm = () => {
    setContactId('');
    setAccountId('');
    setName('');
    setEmail('');
    setPhone('');
    setDesignation('');
    setHierarchyTag('Staff');
    setInfluenceTag('Observer');
    setProjectName('');
    setProjectIndustry('');
    setProjectType('');
    setOwnerId('');
    setOwnerName('');
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.designation.toLowerCase().includes(search.toLowerCase())
  );

  // Group contacts for the relationship matrix mapping
  const getMatrixContacts = (hierarchy, influence) => {
    return filteredContacts.filter(c => c.hierarchyTag === hierarchy && c.influenceTag === influence);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 select-none">
      
      {/* 1. Matrix Visualizer */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-white tracking-wide">Stakeholder Influence vs Hierarchy Matrix</h2>
          </div>
          
          {/* Account Filter */}
          <select 
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-dark-900/60 border border-slate-800 text-xs rounded-xl p-2.5 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">
              {['CEO', 'Admin'].includes(user?.userType || user?.role) ? 'All Accounts' : 'All Assigned Projects'}
            </option>
            {localAccounts.map(acc => (
              <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>
                {acc.companyName}
              </option>
            ))}
          </select>
        </div>

        {/* Matrix Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px] grid grid-cols-6 gap-2">
            
            {/* Empty top corner */}
            <div className="p-2 flex items-center justify-center text-xs text-slate-500 font-bold uppercase tracking-wider">
              Hierarchy \ Influence
            </div>

            {/* Influence headers */}
            {influenceTags.map(inf => (
              <div key={inf} className="bg-primary/5 border border-primary/15 rounded-xl p-2.5 text-center text-xs font-extrabold uppercase text-slate-300 tracking-wide">
                {inf}
              </div>
            ))}

            {/* Matrix rows based on hierarchy */}
            {hierarchyTags.map(hier => (
              <React.Fragment key={hier}>
                {/* Y-axis label */}
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-2 flex items-center justify-center text-center text-xs font-bold text-slate-400">
                  {hier}
                </div>

                {/* Grid cells mapping */}
                {influenceTags.map(inf => {
                  const cellContacts = getMatrixContacts(hier, inf);
                  return (
                    <div 
                      key={`${hier}-${inf}`} 
                      className={`min-h-16 rounded-xl border p-2 flex flex-col gap-1.5 transition-colors duration-200 ${
                        cellContacts.length > 0 
                          ? 'bg-primary/5 border-primary/30' 
                          : 'bg-transparent border-slate-800/50 hover:bg-slate-800/10'
                      }`}
                    >
                      {cellContacts.map(c => {
                        const accRef = localAccounts.find(a => a.accountId === c.accountId || a.id === c.accountId);
                        return (
                          <div 
                            key={c.contactId || c.id} 
                            onClick={() => openEditModal(c)}
                            className="bg-dark-900 border border-slate-800 p-1.5 rounded-lg text-xs hover:border-primary cursor-pointer"
                            title={`${c.name} - ${c.designation} (${accRef?.companyName || 'External'})`}
                          >
                            <div className="font-bold text-white truncate">{c.name}</div>
                            <div className="text-slate-400 text-xs truncate">{accRef?.companyName || 'CRM Account'}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Contacts List Data Panel */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-white tracking-wide">Stakeholder Directory</h2>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search stakeholders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-xs rounded-xl py-2.5 pl-9 pr-4 text-white focus:outline-none transition-colors w-full"
              />
            </div>
            
            {/* Add Stakeholder */}
            {['Admin', 'Sales Manager', 'Employee'].includes(user?.role) && (
              <button 
                onClick={() => setIsAddContactOpen(true)}
                className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 text-white active:scale-98 transition-all w-full sm:w-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Stakeholder
              </button>
            )}
          </div>
        </div>

        {/* Directory Cards list */}
        {contactsLoading ? (
          <div className="h-24 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No contacts recorded. Register contacts to populate directory.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredContacts.map(c => {
              const account = localAccounts.find(a => a.accountId === c.accountId || a.id === c.accountId);
              return (
                <div key={c.contactId || c.id} className="bg-dark-900/40 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all duration-200">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {c.hierarchyTag}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/25">
                        {c.influenceTag}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white pt-1">{c.name}</h3>
                    <p className="text-xs text-primary font-medium">{c.designation}</p>
                    {account ? (
                      <span 
                        onClick={() => navigate(`/accounts/${account.accountId || account.id}`)}
                        className="text-xs text-slate-400 block font-semibold hover:text-primary cursor-pointer transition-colors"
                      >
                        {account.companyName}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 block font-semibold">Corporate Client</span>
                    )}
                    {c.projectName && (
                      <div className="mt-2 space-y-1">
                        <span className="text-xs uppercase font-bold text-slate-500 block">Project & Details</span>
                        <span className="text-xs text-emerald-400 font-semibold block truncate">
                          📁 {c.projectName} {c.projectType && `[${c.projectType}]`} {c.projectIndustry && `— ${c.projectIndustry}`}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 space-y-1">
                      <span className="text-xs uppercase font-bold text-slate-500 block">Stakeholder Owner</span>
                      <span className="text-xs text-slate-300 font-semibold block truncate">
                        👤 {c.ownerName || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-800/60 pt-3 text-slate-400 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{c.email}</span>
                    </div>
                    {c.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                    )}
                  </div>

                  {['Admin', 'Sales Manager'].includes(user?.role) && (
                    <div className="flex items-center justify-end gap-2 border-t border-slate-800/40 pt-3">
                      <button 
                        onClick={() => openEditModal(c)}
                        className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-300 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteContact(c)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 p-2 rounded-lg text-rose-400 hover:text-rose-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================
          MODALS INTERFACE CODES (Add Stakeholder, Edit Stakeholder) 
          ======================================================== */}

      {/* Add Contact Modal */}
      {isAddContactOpen && (
        <div className="fixed inset-0 bg-dark-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-2xl w-full rounded-2xl border border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-800/80">
              <h3 className="font-bold text-white text-base">Add Account Stakeholder</h3>
              <button 
                onClick={() => setIsAddContactOpen(false)} 
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Form Container */}
            <form onSubmit={handleCreateContact} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Client & Project Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/60 pb-1 mb-2">Project Details</h4>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Account Company</label>
                    <select 
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      required
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Client Account</option>
                      {localAccounts.map(acc => (
                        <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>
                          {acc.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Name Details</label>
                    <input 
                      type="text" 
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. Acme Migration Platform"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Description</label>
                    <textarea 
                      value={projectIndustry}
                      onChange={(e) => setProjectIndustry(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50 min-h-[72px]"
                      placeholder="e.g. Migration of critical database services"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Type</label>
                    <select 
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                    >
                      {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                {/* Right Column: Stakeholder Contact Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/60 pb-1 mb-2">Stakeholder Profile</h4>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Contact Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required 
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. Alice Smith"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Corporate Email</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="alice@domain.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Phone Number</label>
                    <input 
                      type="text" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. +91 9747106044"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Role Designation</label>
                    <input 
                      type="text" 
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. VP Operations"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Hierarchy Tag</label>
                      <select 
                        value={hierarchyTag}
                        onChange={(e) => setHierarchyTag(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                      >
                        {hierarchyTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Influence Tag</label>
                      <select 
                        value={influenceTag}
                        onChange={(e) => setInfluenceTag(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                      >
                        {influenceTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Stakeholder Owner</label>
                    <select 
                      value={ownerId}
                      onChange={(e) => {
                        const selId = e.target.value;
                        const selStaff = staffList.find(s => s.uid === selId);
                        setOwnerId(selId);
                        setOwnerName(selStaff ? selStaff.name : '');
                      }}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Stakeholder Owner</option>
                      {staffList.map(staff => (
                        <option key={staff.uid} value={staff.uid}>{staff.name} ({staff.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-4 border-t border-slate-800/80 gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddContactOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 rounded-xl bg-primary hover:bg-blue-600 text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                >
                  Save Stakeholder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {isEditContactOpen && (
        <div className="fixed inset-0 bg-dark-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-2xl w-full rounded-2xl border border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-800/80">
              <h3 className="font-bold text-white text-base">
                {canEdit ? 'Edit Stakeholder Profile' : 'Stakeholder Profile'}
              </h3>
              <button 
                onClick={() => setIsEditContactOpen(false)} 
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Form Container */}
            <form onSubmit={handleEditContact} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Client & Project Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/60 pb-1 mb-2">Project Details</h4>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Name Details</label>
                    <input 
                      type="text" 
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                      placeholder="e.g. Acme Migration Platform"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Description</label>
                    <textarea 
                      value={projectIndustry}
                      onChange={(e) => setProjectIndustry(e.target.value)}
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'} min-h-[72px]`}
                      placeholder="e.g. Migration of critical database services"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Type</label>
                    <select 
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value)}
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                {/* Right Column: Stakeholder Contact Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/60 pb-1 mb-2">Stakeholder Profile</h4>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Contact Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required 
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Corporate Email</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Phone Number</label>
                    <input 
                      type="text" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Role Designation</label>
                    <input 
                      type="text" 
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Hierarchy Tag</label>
                      <select 
                        value={hierarchyTag}
                        onChange={(e) => setHierarchyTag(e.target.value)}
                        disabled={!canEdit}
                        className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {hierarchyTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Influence Tag</label>
                      <select 
                        value={influenceTag}
                        onChange={(e) => setInfluenceTag(e.target.value)}
                        disabled={!canEdit}
                        className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {influenceTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Stakeholder Owner</label>
                    <select 
                      value={ownerId}
                      onChange={(e) => {
                        const selId = e.target.value;
                        const selStaff = staffList.find(s => s.uid === selId);
                        setOwnerId(selId);
                        setOwnerName(selStaff ? selStaff.name : '');
                      }}
                      disabled={!canEdit}
                      className={`w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <option value="">Select Stakeholder Owner</option>
                      {staffList.map(staff => (
                        <option key={staff.uid} value={staff.uid}>{staff.name} ({staff.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-4 border-t border-slate-800/80 gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditContactOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                {canEdit && (
                  <button 
                    type="submit" 
                    className="px-6 py-2 rounded-xl bg-primary hover:bg-blue-600 text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                  >
                    Save Updates
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
