import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Edit2, Trash2, Shield, User, X, Mail, Phone, ChevronRight, Grid3X3, ChevronDown
} from 'lucide-react';
import { useStore } from '../store/index.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

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
  const [isMatrixEdit, setIsMatrixEdit] = useState(false);

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
        const res = await fetch('/CustomerPulse/api/accounts?limit=1000', {
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

  const [contactError, setContactError] = useState('');

  const validateContactForm = () => {
    setContactError('');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\+\d\s\-\(\)\.]{7,25}$/;

    if (!accountId) {
      setContactError('Please select a Client Account.');
      return false;
    }
    if (!name.trim()) {
      setContactError('Contact Name is required.');
      return false;
    }
    if (name.trim().length < 2) {
      setContactError('Contact Name must be at least 2 characters.');
      return false;
    }
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setContactError('Please enter a valid Contact Email address.');
      return false;
    }
    if (phone.trim() && !phoneRegex.test(phone.trim())) {
      setContactError('Please enter a valid Phone number format.');
      return false;
    }
    return true;
  };

  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!validateContactForm()) return;

    const success = await addContact({
      accountId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      designation: designation.trim() || 'Staff Member',
      hierarchyTag,
      influenceTag,
      projectName: projectName.trim(),
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
      setContactError(errorMsg);
    }
  };

  const handleEditContact = async (e) => {
    e.preventDefault();
    if (!validateContactForm()) return;

    const success = await updateContact(contactId, {
      accountId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      designation: designation.trim() || 'Staff Member',
      hierarchyTag,
      influenceTag,
      projectName: projectName.trim(),
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
      setContactError(errorMsg);
    }
  };

  const openEditModal = (c, fromMatrix = false) => {
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
    setIsMatrixEdit(fromMatrix);
    setIsEditContactOpen(true);
  };

  const handleDeleteContact = async (c) => {
    const id = c.contactId || c.id;
    if (confirm(`Are you sure you want to delete contact ${c.name}?`)) {
      await deleteContact(id, selectedAccountId);
    }
  };

  const scrollToContact = (c) => {
    const id = c.contactId || c.id;
    const el = document.getElementById(`contact-card-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a temporary highlight effect ("pop up")
      el.classList.add('ring-2', 'ring-primary', 'scale-[1.02]', 'bg-white');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'scale-[1.02]', 'bg-white');
      }, 1500);
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

    const filteredContacts = contacts.filter(c => {
    if (selectedAccountId && c.accountId !== selectedAccountId && c.account_id !== selectedAccountId) {
      return false;
    }
    if (!search || !search.trim()) return true;

    const account = localAccounts.find(a => (a.accountId || a.id) === (c.accountId || c.account_id));
    const fullSearchableText = [
      c.name,
      c.email,
      c.designation,
      c.phone,
      c.hierarchyTag,
      c.influenceTag,
      c.projectName,
      c.projectIndustry,
      c.projectType,
      c.ownerName,
      c.keyContactOwner,
      c.notes,
      account?.companyName,
      account?.industry,
      account?.accountName
    ].filter(Boolean).join(' ').toLowerCase();

    const searchWords = search.toLowerCase().trim().split(/\s+/);
    return searchWords.every(word => fullSearchableText.includes(word));
  });

  // Group contacts for the relationship matrix mapping
  const getMatrixContacts = (hierarchy, influence) => {
    return filteredContacts.filter(c => c.hierarchyTag === hierarchy && c.influenceTag === influence);
  };

  return (
    <div className="p-3 sm:p-5 md:p-6 select-none flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-64px)]">

      {/* ── LEFT COLUMN (70%) — Matrix ── */}
      <div className="flex flex-col overflow-hidden w-full lg:w-[68%] shrink-0">
        {/* Matrix panel header */}
        <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-black tracking-wide">Stakeholder Influence Board</h2>
          </div>
          {/* Account Filter */}
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-white border border-slate-200 text-xs rounded-xl p-2.5 text-slate-800 focus:outline-none cursor-pointer"
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

        {/* Scrollable matrix body */}
        <div className="flex-1 overflow-auto p-4">
          <div style={{ minWidth: '620px' }}>
            {/* Header row */}
            <div className="grid gap-4 mb-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {influenceTags.map(inf => (
                <div key={inf} className="bg-primary/5 border border-primary/15 rounded-xl p-2.5 text-center text-[10px] font-extrabold uppercase text-slate-300 tracking-wide">
                  {inf}
                </div>
              ))}
            </div>

            {/* Data columns */}
            <div className="grid gap-4 h-[calc(100%-48px)] min-h-[500px]" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {influenceTags.map(inf => {
                const cellContacts = filteredContacts.filter(c => c.influenceTag === inf);
                return (
                  <div
                    key={inf}
                    className={`rounded-xl border p-2 flex flex-col gap-2 transition-colors duration-200 overflow-y-auto ${
                      cellContacts.length > 0
                        ? 'bg-primary/5 border-primary/30'
                        : 'bg-transparent border-slate-200/50 hover:bg-slate-800/10'
                    }`}
                  >
                    {cellContacts.map(c => {
                      const accRef = localAccounts.find(a => (a.accountId || a.id) === (c.accountId || c.account_id));
                      return (
                        <div
                          key={c.contactId || c.id}
                          onClick={() => scrollToContact(c)}
                          className="bg-white border border-slate-200 p-2 rounded-xl hover:border-primary cursor-pointer flex-shrink-0 shadow-sm"
                          title={`${c.name} - ${c.designation} (${accRef?.companyName || 'External'})`}
                        >
                          <div className="font-bold text-black text-xs truncate">{c.name}</div>
                          <div className="text-primary text-[10px] uppercase font-bold truncate mt-0.5">{c.designation || 'Staff'}</div>
                          <div className="text-slate-400 text-[10px] truncate mt-1">{accRef?.companyName || 'CRM Account'}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN (30%) — Stakeholder Directory ── */}
      <div className="flex flex-col overflow-hidden w-full lg:w-[32%] shrink-0">
        {/* Directory header */}
        <div className="border-b border-slate-200/60 px-4 py-4 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-black tracking-wide">Stakeholder Directory</h2>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search stakeholders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border border-slate-200 focus:border-primary/50 text-xs rounded-xl py-2.5 pl-9 pr-4 text-black focus:outline-none transition-colors w-full"
            />
          </div>
        </div>

        {/* Scrollable cards list */}
        <div className="flex-1 overflow-y-auto p-3">
          {contactsLoading ? (
            <div className="h-24 flex items-center justify-center">
              <LoadingSpinner size="md" text="Loading contacts..." />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No contacts recorded. Register contacts to populate directory.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredContacts.map(c => {
                const account = localAccounts.find(a => a.accountId === c.accountId || a.id === c.accountId);
                return (
                  <div 
                    key={c.contactId || c.id} 
                    id={`contact-card-${c.contactId || c.id}`}
                    className="bg-white border border-slate-200 hover:border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all duration-300 transform"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-end">
                        {canEdit ? (
                          <div className="relative group inline-block">
                            <select
                              value={c.influenceTag || 'Observer'}
                              onChange={async (e) => {
                                const newTag = e.target.value;
                                await updateContact(c.contactId || c.id, { ...c, influenceTag: newTag });
                                fetchContacts(selectedAccountId);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] font-extrabold bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded pl-2 pr-5 py-0.5 uppercase tracking-wider focus:outline-none cursor-pointer appearance-none hover:bg-blue-500/20 transition-colors relative z-10"
                            >
                              <option className="bg-white text-black font-semibold" value="Decision Maker">Decision Maker</option>
                              <option className="bg-white text-black font-semibold" value="Influencer">Influencer</option>
                              <option className="bg-white text-black font-semibold" value="Champion">Champion</option>
                              <option className="bg-white text-black font-semibold" value="Gatekeeper">Gatekeeper</option>
                              <option className="bg-white text-black font-semibold" value="Observer">Observer</option>
                            </select>
                            <ChevronDown className="w-3 h-3 text-blue-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none z-20" />
                            <div className="absolute right-0 top-full mt-2 w-max max-w-[160px] bg-white border border-slate-200 text-slate-300 text-[10px] text-center p-2 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                              {c.influenceTag === 'Decision Maker' ? 'Final sign-off authority for budget, contracts, and renewals' :
                               c.influenceTag === 'Influencer' ? 'Shapes technical standards and vendor evaluations' :
                               c.influenceTag === 'Champion' ? 'Advocates for our platform and drives internal adoption' :
                               c.influenceTag === 'Gatekeeper' ? 'Controls access to information or decision makers' :
                               'Kept in the loop but not actively involved'}
                            </div>
                          </div>
                        ) : (
                          <div className="relative group inline-block">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/25 block">
                              {c.influenceTag}
                            </span>
                            <div className="absolute right-0 top-full mt-2 w-max max-w-[160px] bg-white border border-slate-200 text-slate-300 text-[10px] text-center p-2 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                              {c.influenceTag === 'Decision Maker' ? 'Final sign-off authority for budget, contracts, and renewals' :
                               c.influenceTag === 'Influencer' ? 'Shapes technical standards and vendor evaluations' :
                               c.influenceTag === 'Champion' ? 'Advocates for our platform and drives internal adoption' :
                               c.influenceTag === 'Gatekeeper' ? 'Controls access to information or decision makers' :
                               'Kept in the loop but not actively involved'}
                            </div>
                          </div>
                        )}
                      </div>

                      <h3 className="text-xs font-bold text-black pt-1">{c.name}</h3>
                      <p className="text-[10px] text-primary font-medium">{c.designation}</p>
                      {account ? (
                        <span
                          onClick={() => navigate(`/accounts/${account.accountId || account.id}`, { state: { from: location.pathname + location.search } })}
                          className="text-[10px] text-slate-400 block font-semibold hover:text-primary cursor-pointer transition-colors"
                        >
                          {account.companyName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 block font-semibold">Corporate Client</span>
                      )}
                      {c.projectName && (
                        <div className="mt-1 space-y-0.5">
                          <span className="text-[9px] uppercase font-bold text-slate-500 block">Project</span>
                          <span className="text-[10px] text-emerald-400 font-semibold block truncate">
                            📁 {c.projectName} {c.projectType && `[${c.projectType}]`}
                          </span>
                        </div>
                      )}
                      <div className="mt-1 space-y-0.5">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Key Contact Owner</span>
                        <span className="text-[10px] text-slate-300 font-semibold block truncate">
                          👤 {c.ownerName || 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-200/60 pt-2 text-slate-400 text-[10px]">
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                      {c.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                    </div>


                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODALS INTERFACE CODES (Add Stakeholder, Edit Stakeholder) 
          ======================================================== */}


      {/* Add Contact Modal */}
      {isAddContactOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200/80">
              <h3 className="font-bold text-black text-base">Add Account Stakeholder</h3>
              <button 
                onClick={() => setIsAddContactOpen(false)} 
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-black hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Form Container */}
            <form onSubmit={handleCreateContact} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Client & Project Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200/60 pb-1 mb-2">Project Details</h4>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Account Company</label>
                    <select 
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none cursor-pointer"
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
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. Acme Migration Platform"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Description</label>
                    <textarea 
                      value={projectIndustry}
                      onChange={(e) => setProjectIndustry(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none focus:border-primary/50 min-h-[72px]"
                      placeholder="e.g. Migration of critical database services"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Type</label>
                    <select 
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none cursor-pointer"
                    >
                      {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                {/* Right Column: Stakeholder Contact Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200/60 pb-1 mb-2">Stakeholder Profile</h4>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Contact Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required 
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none focus:border-primary/50"
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
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="alice@domain.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Phone Number</label>
                    <input 
                      type="text" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. +91 9747106044"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Role Designation</label>
                    <input 
                      type="text" 
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none focus:border-primary/50"
                      placeholder="e.g. VP Operations"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Hierarchy Tag</label>
                      <select 
                        value={hierarchyTag}
                        onChange={(e) => setHierarchyTag(e.target.value)}
                        className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none cursor-pointer"
                      >
                        {hierarchyTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Influence Tag</label>
                      <select 
                        value={influenceTag}
                        onChange={(e) => setInfluenceTag(e.target.value)}
                        className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none cursor-pointer"
                      >
                        {influenceTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Key Contact Owner</label>
                    <select 
                      value={ownerId}
                      onChange={(e) => {
                        const selId = e.target.value;
                        const selStaff = staffList.find(s => s.uid === selId);
                        setOwnerId(selId);
                        setOwnerName(selStaff ? selStaff.name : '');
                      }}
                      className="w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Key Contact Owner</option>
                      {staffList.map(staff => (
                        <option key={staff.uid} value={staff.uid}>{staff.name} ({staff.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-4 border-t border-slate-200/80 gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddContactOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200/80">
              <h3 className="font-bold text-black text-base">
                {canEdit ? 'Edit Stakeholder Profile' : 'Stakeholder Profile'}
              </h3>
              <button 
                onClick={() => setIsEditContactOpen(false)} 
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-black hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Form Container */}
            <form onSubmit={handleEditContact} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Client & Project Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200/60 pb-1 mb-2">Project Details</h4>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Name Details</label>
                    <input 
                      type="text" 
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                      placeholder="e.g. Acme Migration Platform"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Description</label>
                    <textarea 
                      value={projectIndustry}
                      onChange={(e) => setProjectIndustry(e.target.value)}
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'} min-h-[72px]`}
                      placeholder="e.g. Migration of critical database services"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Type</label>
                    <select 
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value)}
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                {/* Right Column: Stakeholder Contact Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200/60 pb-1 mb-2">Stakeholder Profile</h4>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Contact Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required 
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Corporate Email</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Phone Number</label>
                    <input 
                      type="text" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Role Designation</label>
                    <input 
                      type="text" 
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'focus:border-primary/50'}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-semibold">Hierarchy Tag</label>
                      <select 
                        value={hierarchyTag}
                        onChange={(e) => setHierarchyTag(e.target.value)}
                        disabled={!canEdit || isMatrixEdit}
                        className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
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
                        className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {influenceTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Key Contact Owner</label>
                    <select 
                      value={ownerId}
                      onChange={(e) => {
                        const selId = e.target.value;
                        const selStaff = staffList.find(s => s.uid === selId);
                        setOwnerId(selId);
                        setOwnerName(selStaff ? selStaff.name : '');
                      }}
                      disabled={!canEdit || isMatrixEdit}
                      className={`w-full bg-white border border-slate-200 text-xs text-black rounded-lg p-2 focus:outline-none ${(!canEdit || isMatrixEdit) ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <option value="">Select Key Contact Owner</option>
                      {staffList.map(staff => (
                        <option key={staff.uid} value={staff.uid}>{staff.name} ({staff.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-4 border-t border-slate-200/80 gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditContactOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
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
