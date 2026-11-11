import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ShieldAlert, Check, CheckSquare, Building2, Users, Search, X, ChevronDown, UserCheck } from 'lucide-react';
import { useStore } from '../store/index.js';
import SearchableSelect from '../components/SearchableSelect.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function AssignStaffTask() {
  const navigate = useNavigate();
  const location = useLocation(); // Single declaration for routing and state context

  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from, location.state?.tab ? { state: { tab: location.state.tab } } : undefined);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/staff-tasks');
    }
  };
  const {
    user,
    staffList,
    fetchStaff,
    createStaffTask,
    accounts,
    fetchAccounts,
    contacts,
    fetchContacts,
    generateTaskHeader
  } = useStore();

  const [accountId, setAccountId] = useState('');
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedToSearch, setAssignedToSearch] = useState('');
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchStaff();
    fetchAccounts(1, '', { limit: 10000 });
    fetchContacts();

    if (location.state?.preselectUid) {
      setAssignedTo(location.state.preselectUid);
      setAssignedToSearch(location.state.preselectName ? (location.state.preselectName.startsWith('@') ? location.state.preselectName : `@${location.state.preselectName}`) : '');
    }
    if (location.state?.preselectAccountId) {
      setAccountId(location.state.preselectAccountId);
    }
    if (location.state?.preselectContactId) {
      setContactId(location.state.preselectContactId);
    }
    if (location.state?.preselectTitle) {
      setTitle(location.state.preselectTitle);
    }
    if (location.state?.preselectDescription) {
      setDescription(location.state.preselectDescription);
    }
    if (location.state?.preselectPriority) {
      setPriority(location.state.preselectPriority);
    }
    if (location.state?.preselectDueDate) {
      setDueDate(location.state.preselectDueDate);
    }
  }, [location.state]);

  // Account matching fallback if accounts was still loading or passed by name
  useEffect(() => {
    if (accounts?.length) {
      const targetId = location.state?.preselectAccountId;
      const targetName = location.state?.preselectCompanyName;
      const currentMatched = accounts.some(a => String(a.accountId || a.id) === String(accountId));
      if (!currentMatched && (targetId || targetName)) {
        const match = accounts.find(a =>
          (targetId && (String(a.accountId) === String(targetId) || String(a.id) === String(targetId))) ||
          (targetName && (
            a.companyName?.toLowerCase().trim() === targetName.toLowerCase().trim() ||
            a.companyName?.toLowerCase().includes(targetName.toLowerCase().trim()) ||
            targetName.toLowerCase().includes(a.companyName?.toLowerCase().trim())
          ))
        );
        if (match) {
          setAccountId(match.accountId || match.id);
        }
      }
    }
  }, [accounts, accountId, location.state]);

  // Client Contact matching fallback if contacts loaded
  useEffect(() => {
    if (contacts?.length && !contactId) {
      const targetContactId = location.state?.preselectContactId;
      const targetContactName = location.state?.preselectContactName;
      if (targetContactId || targetContactName) {
        const match = contacts.find(c =>
          (targetContactId && (String(c.contactId) === String(targetContactId) || String(c.id) === String(targetContactId))) ||
          (targetContactName && c.name?.toLowerCase().includes(targetContactName.toLowerCase()))
        );
        if (match) {
          setContactId(match.contactId || match.id);
        }
      }
    }
  }, [contacts, contactId, location.state]);

  // If contact is selected and account is empty, auto-set account from contact
  useEffect(() => {
    if (!accountId && contactId && contacts?.length) {
      const matchedContact = contacts.find(c => String(c.contactId || c.id) === String(contactId));
      if (matchedContact?.accountId) {
        setAccountId(matchedContact.accountId);
      }
    }
  }, [contacts, contactId, accountId]);

  // Staff member auto-assignment: Account Owner vs Key Contact Owner logic
  useEffect(() => {
    if (staffList?.length && !assignedTo) {
      // 1. Try preselect from state first if explicitly provided
      const targetUid = location.state?.preselectUid;
      const targetName = location.state?.preselectName;
      if (targetUid || targetName) {
        const match = staffList.find(s =>
          (targetUid && String(s.uid) === String(targetUid)) ||
          (targetName && s.name?.toLowerCase().trim() === targetName.toLowerCase().replace(/^@/, '').trim())
        );
        if (match) {
          setAssignedTo(match.uid);
          setAssignedToSearch(`@${match.name}`);
          return;
        }
      }

      // 2. Intelligent Auto-Resolution from Account and Contacts
      if (accountId && accounts?.length) {
        const acc = accounts.find(a => String(a.accountId || a.id) === String(accountId));
        const accOwnerId = acc?.ownerId || acc?.assignedTo;
        const accOwnerName = acc?.ownerName || acc?.owner;
        const accOwnerEmail = acc?.ownerEmail;

        const accContacts = (contacts || []).filter(c =>
          String(c.accountId || c.account_id) === String(accountId)
        );

        const keyContactOwners = accContacts
          .map(c => ({
            ownerId: c.ownerId,
            ownerName: c.ownerName,
            ownerEmail: c.ownerEmail,
            contactName: c.name
          }))
          .filter(k => k.ownerId || k.ownerName || k.ownerEmail);

        const isUserMatch = (u, oId, oName, oEmail) => {
          if (!u) return false;
          const uId = String(u.uid || '');
          const uEmail = (u.email || '').toLowerCase().trim();
          const uName = (u.name || '').toLowerCase().trim();
          if (oId && String(oId) === uId) return true;
          if (oEmail && uEmail && oEmail.toLowerCase().trim() === uEmail) return true;
          if (oName && uName && oName.toLowerCase().trim() === uName) return true;
          return false;
        };

        const isAdminUser = (u) => {
          if (!u) return false;
          const role = String(u.role || u.userType || '').toLowerCase();
          const email = String(u.email || u.ownerEmail || '').toLowerCase();
          const uid = String(u.uid || u.ownerId || '');
          const name = String(u.name || u.ownerName || '').toLowerCase();
          return (
            role === 'admin' ||
            uid === 'mock-admin-uid' ||
            email.includes('admin@') ||
            name.includes('admin user')
          );
        };

        const isCurrentUserAdmin = isAdminUser(user);
        const isCurrentUserAccountOwner = !isCurrentUserAdmin && isUserMatch(user, accOwnerId, accOwnerName, accOwnerEmail);
        const isCurrentUserKeyContactOwner = !isCurrentUserAdmin && keyContactOwners.some(k => isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail));

        let chosen = null;
        if (isCurrentUserAdmin) {
          // When Admin clicks/creates -> DO NOT assign Admin! Choose Account Owner!
          let accOwnerCandidate = (accOwnerId || accOwnerName)
            ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail }
            : null;

          if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
            chosen = accOwnerCandidate;
          } else {
            chosen = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
          }
        } else if (isCurrentUserAccountOwner) {
          // When Account Owner clicks/creates -> choose Key Contact Owner(s)!
          chosen = keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail) && !isAdminUser(k))
            || keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail))
            || keyContactOwners[0];
        } else if (isCurrentUserKeyContactOwner) {
          // When Key Contact Owner clicks/creates -> choose Account Owner!
          chosen = (accOwnerId || accOwnerName) ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail } : null;
        } else {
          // Default / third party -> choose Account Owner first
          let accOwnerCandidate = (accOwnerId || accOwnerName)
            ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail }
            : null;
          if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
            chosen = accOwnerCandidate;
          } else {
            chosen = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
          }
        }

        if (chosen) {
          const match = staffList.find(s =>
            (chosen.ownerId && String(s.uid) === String(chosen.ownerId)) ||
            (chosen.ownerEmail && s.email && s.email.toLowerCase().trim() === chosen.ownerEmail.toLowerCase().trim()) ||
            (chosen.ownerName && s.name && s.name.toLowerCase().trim() === chosen.ownerName.toLowerCase().trim())
          );
          if (match) {
            if (!isCurrentUserAdmin || !isAdminUser(match)) {
              setAssignedTo(match.uid);
              setAssignedToSearch(`@${match.name}`);
            }
          } else if (chosen.ownerName) {
            if (!isCurrentUserAdmin || !isAdminUser(chosen)) {
              if (chosen.ownerId) setAssignedTo(chosen.ownerId);
              setAssignedToSearch(`@${chosen.ownerName}`);
            }
          }
        }

        // Safety fallback: If current user is Admin, ensure Admin is never assigned
        if (isCurrentUserAdmin && (!assignedTo || assignedTo === user?.uid || assignedTo === 'mock-admin-uid')) {
          const staffAccOwner = (staffList || []).find(s =>
            !isAdminUser(s) && (
              (accOwnerId && String(s.uid) === String(accOwnerId)) ||
              (accOwnerEmail && s.email && s.email.toLowerCase().trim() === accOwnerEmail.toLowerCase().trim()) ||
              (accOwnerName && s.name && s.name.toLowerCase().trim() === accOwnerName.toLowerCase().trim())
            )
          );
          if (staffAccOwner) {
            setAssignedTo(staffAccOwner.uid);
            setAssignedToSearch(`@${staffAccOwner.name}`);
          }
        }
      }
    }
  }, [staffList, assignedTo, location.state, accountId, accounts, contacts, user]);

  useEffect(() => {
    if (accountId) {
      fetchContacts(accountId);
    } else {
      fetchContacts();
    }
  }, [accountId]);

  const staffDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(e.target)) {
        setShowStaffDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectStaff = (staff) => {
    setAssignedTo(staff.uid);
    setAssignedToSearch(staff.name);
    setShowStaffDropdown(false);
  };

  const handleClearStaff = (e) => {
    e.stopPropagation();
    setAssignedTo('');
    setAssignedToSearch('');
    setShowStaffDropdown(true);
  };

  // Selected account and contact objects
  const selectedAccount = (accounts || []).find(a =>
    String(a.accountId || a.id) === String(accountId)
  );

  const selectedContact = (contacts || []).find(c =>
    String(c.contactId || c.id) === String(contactId)
  );

  // Contacts belonging to the selected account
  const accountContacts = (contacts || []).filter(c =>
    !accountId ||
    String(c.accountId || c.account_id) === String(accountId) ||
    (selectedAccount?.companyName && c.companyName?.toLowerCase().trim() === selectedAccount.companyName?.toLowerCase().trim())
  );

  const isAdminStaff = (s) => {
    if (!s) return false;
    const uid = String(s.uid || '');
    const email = String(s.email || '').toLowerCase();
    const name = String(s.name || '').toLowerCase();
    return uid === 'mock-admin-uid' || email.includes('admin@') || name.includes('admin user');
  };

  // Helper to reliably resolve a staff member for an owner (Account Owner / Contact Owner)
  // Always prioritizes the named employee over mock-admin-uid fallback
  const resolveOwnerStaff = (oId, oName, oEmail) => {
    if (!oId && !oName && !oEmail) return null;
    const targetName = (oName || '').toLowerCase().trim();
    const targetEmail = (oEmail || '').toLowerCase().trim();
    const targetId = (oId || '').trim();

    // 1. Match by email to real employee first
    if (targetEmail) {
      const matchEmail = (staffList || []).find(s => !isAdminStaff(s) && s.email && s.email.toLowerCase().trim() === targetEmail);
      if (matchEmail) return matchEmail;
    }

    // 2. Match by exact or partial name to real employee
    if (targetName) {
      const matchName = (staffList || []).find(s => !isAdminStaff(s) && s.name && s.name.toLowerCase().trim() === targetName);
      if (matchName) return matchName;

      const matchPartial = (staffList || []).find(s => !isAdminStaff(s) && s.name && (
        s.name.toLowerCase().includes(targetName) || targetName.includes(s.name.toLowerCase())
      ));
      if (matchPartial) return matchPartial;
    }

    // 3. Match by ID (only if not generic mock-admin-uid)
    if (targetId && targetId !== 'mock-admin-uid') {
      const matchId = (staffList || []).find(s => String(s.uid) === targetId);
      if (matchId) return matchId;
    }

    // 4. Fallback only if the owner is genuinely Admin User
    if (targetName.includes('admin') || targetEmail.includes('admin')) {
      const matchAdmin = (staffList || []).find(s => isAdminStaff(s));
      if (matchAdmin) return matchAdmin;
    }

    return null;
  };

  // Find Account Owner Staff
  const accOwnerStaff = selectedAccount ? resolveOwnerStaff(
    selectedAccount.ownerId,
    selectedAccount.ownerName,
    selectedAccount.ownerEmail
  ) : null;

  // Find Key Contact Owner(s)
  const primaryContactOwnerStaff = selectedContact ? resolveOwnerStaff(
    selectedContact.ownerId,
    selectedContact.ownerName,
    selectedContact.ownerEmail
  ) : null;

  const distinctContactOwners = [];
  accountContacts.forEach(c => {
    const ownerStaff = resolveOwnerStaff(c.ownerId, c.ownerName, c.ownerEmail);
    if (ownerStaff && !distinctContactOwners.some(existing => existing.uid === ownerStaff.uid)) {
      distinctContactOwners.push({
        ...ownerStaff,
        contactName: c.name
      });
    }
  });

  const selectedStaffObj = (staffList || []).find(s => s.uid === assignedTo);

  const cleanQuery = (() => {
    const raw = assignedToSearch.replace(/^@/, '').trim().toLowerCase();
    if (selectedStaffObj && raw === selectedStaffObj.name?.toLowerCase().trim()) {
      return '';
    }
    return raw;
  })();

  const filteredStaff = (staffList || []).filter(s => {
    if (!cleanQuery) return true;
    const name = (s.name || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    const role = (s.role || s.jobRole || s.position || '').toLowerCase();
    const dept = (s.department || '').toLowerCase();
    return (
      name.includes(cleanQuery) ||
      email.includes(cleanQuery) ||
      role.includes(cleanQuery) ||
      dept.includes(cleanQuery)
    );
  });

  const sortedStaff = [...filteredStaff].sort((a, b) => {
    const aIsContactOwner = (primaryContactOwnerStaff && a.uid === primaryContactOwnerStaff.uid) || distinctContactOwners.some(c => c.uid === a.uid);
    const bIsContactOwner = (primaryContactOwnerStaff && b.uid === primaryContactOwnerStaff.uid) || distinctContactOwners.some(c => c.uid === b.uid);
    if (aIsContactOwner && !bIsContactOwner) return -1;
    if (!aIsContactOwner && bIsContactOwner) return 1;

    const aIsAccOwner = accOwnerStaff && a.uid === accOwnerStaff.uid;
    const bIsAccOwner = accOwnerStaff && b.uid === accOwnerStaff.uid;
    if (aIsAccOwner && !bIsAccOwner) return -1;
    if (!aIsAccOwner && bIsAccOwner) return 1;

    return (a.name || '').localeCompare(b.name || '');
  });

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    // Fallback: If assignedTo is empty, try to match by name from assignedToSearch
    let targetAssigneeUid = assignedTo;
    if (!targetAssigneeUid && assignedToSearch.trim()) {
      const cleanSearch = assignedToSearch.trim().toLowerCase().replace(/^@/, '').trim();

      const matchedStaff = (staffList || []).find(
        s => s.name?.toLowerCase().trim() === cleanSearch ||
          s.email?.toLowerCase().trim() === cleanSearch ||
          s.name?.toLowerCase().includes(cleanSearch)
      );
      if (matchedStaff) {
        targetAssigneeUid = matchedStaff.uid;
      }
    }

    const selectedAccountObj = (accounts || []).find(a => (a.accountId || a.id) === accountId);
    const selectedContactObj = (contacts || []).find(c => (c.contactId || c.id) === contactId);

    if (!description.trim() || !targetAssigneeUid) {
      setFormError('Please fill in task description and select a valid staff member.');
      return;
    }

    if (dueDate) {
      const year = parseInt(dueDate.split('-')[0], 10);
      if (year > 2100) {
        setFormError('Please enter a valid due date (year must be 2100 or earlier).');
        return;
      }
    }

    let defaultTitle = 'Task Assignment';
    if (selectedAccountObj?.companyName && selectedContactObj?.name) {
      defaultTitle = `${selectedAccountObj.companyName} - ${selectedContactObj.name}`;
    } else if (selectedAccountObj?.companyName) {
      defaultTitle = selectedAccountObj.companyName;
    } else if (selectedContactObj?.name) {
      defaultTitle = selectedContactObj.name;
    }

    const generatedTitle = title.trim() || defaultTitle;

    setSubmitting(true);
    const selectedStaffObj = (staffList || []).find(s => s.uid === targetAssigneeUid);
    const payload = {
      title: generatedTitle,
      description: description.trim(),
      assignedToUid: targetAssigneeUid,
      assignedToName: selectedStaffObj?.name || (assignedToSearch.startsWith('@') ? assignedToSearch.slice(1).trim() : assignedToSearch.trim()) || 'Staff Member',
      priority,
      dueDate: dueDate || null,
      accountId: accountId || null,
      contactId: contactId || null
    };

    const result = await createStaffTask(payload);
    setSubmitting(false);

    if (result && (result.success || result.taskId || result.id)) {
      setFormSuccess('Task assigned successfully!');
      // Reset form
      setAccountId('');
      setContactId('');
      setTitle('');
      setDescription('');
      setAssignedTo('');
      setAssignedToSearch('');
      setPriority('Medium');
      setDueDate('');
      setTimeout(() => {
        handleBack();
      }, 1200);
    } else {
      setFormError(result?.error || 'Failed to create and assign task.');
    }
  };

  const handleDescriptionBlur = async () => {
    if (!description.trim() || title.trim()) return;
    try {
      const generated = await generateTaskHeader(description);
      if (generated && generated !== 'Task Assignment') {
        setTitle(generated);
      }
    } catch (e) {
      console.error('Error generating task title:', e);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 w-full flex-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="back-btn"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
          <span>Back</span>
        </button>
        <h2 className="text-base font-extrabold text-slate-900 tracking-wide uppercase">Assign Task</h2>
      </div>

      {/* Form Container */}
      <div className="w-full">
        <form onSubmit={handleCreateTask} className="space-y-6 text-xs font-semibold w-full">
          {formError && (
            <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {formSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          {/* Company Account & Client Contact Selection - Searchable & Scrollable */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <div className="space-y-2">
              <label className="text-slate-500 block uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-bold">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Account <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <SearchableSelect
                value={accountId}
                onChange={(val) => {
                  setAccountId(val);
                  setContactId('');
                  setAssignedTo('');
                  setAssignedToSearch('');
                }}
                options={accounts || []}
                getOptionValue={(a) => a.accountId || a.id}
                getOptionLabel={(a) => a.companyName || ''}
                getOptionSublabel={(a) => [a.domain, a.industry, a.region].filter(Boolean).join(' · ')}
                placeholder="Search & select account..."
                icon={Building2}
                emptyMessage="No accounts found"
              />
            </div>
            <div className="space-y-2">
              <label className="text-slate-500 block uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-bold">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Client Contact <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <SearchableSelect
                value={contactId}
                onChange={(val, contactObj) => {
                  setContactId(val);
                  if (contactObj?.accountId && !accountId) {
                    setAccountId(contactObj.accountId);
                  }
                  if (contactObj?.ownerId || contactObj?.ownerName) {
                    const staffMatch = staffList.find(s =>
                      (contactObj.ownerId && String(s.uid) === String(contactObj.ownerId)) ||
                      (contactObj.ownerName && s.name?.toLowerCase().trim() === contactObj.ownerName?.toLowerCase().trim())
                    );
                    if (staffMatch) {
                      setAssignedTo(staffMatch.uid);
                      setAssignedToSearch(staffMatch.name);
                    }
                  }
                }}
                options={accountContacts}
                getOptionValue={(c) => c.contactId || c.id}
                getOptionLabel={(c) => c.name || ''}
                getOptionSublabel={(c) => [c.designation, c.hierarchyTag, c.ownerName ? `Owner: ${c.ownerName}` : null, c.email].filter(Boolean).join(' — ')}
                placeholder={accountContacts.length === 0 ? "No contacts found" : "Search & select contact..."}
                icon={Users}
                emptyMessage="No contacts found"
              />
            </div>
          </div>

          {/* Task Title */}
          <div className="space-y-2 w-full">
            <label className="text-slate-500 block uppercase tracking-wider text-[10px]">
              Task Title <span className="text-slate-400 font-normal lowercase">(optional - auto-generated if left blank)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Schedule check-in or executive sync..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 text-xs font-semibold"
            />
          </div>

          {/* Assign to Staff Selection */}
          <div className="space-y-2 relative w-full" ref={staffDropdownRef}>
            <div className="flex items-center justify-between">
              <label className="text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-bold">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" /> Assign to Staff <span className="text-rose-500">*</span>
              </label>
              {selectedStaffObj && (
                <span className="text-[10px] text-primary font-bold">
                  Selected: {selectedStaffObj.name}
                </span>
              )}
            </div>

            {/* Quick Select suggested owners (Contact Owner & Account Owner) */}
            {(primaryContactOwnerStaff || accOwnerStaff || distinctContactOwners.length > 0) && (() => {
              const isSamePerson = accOwnerStaff && (
                (primaryContactOwnerStaff && accOwnerStaff.uid === primaryContactOwnerStaff.uid) ||
                (!primaryContactOwnerStaff && distinctContactOwners.length === 1 && accOwnerStaff.uid === distinctContactOwners[0].uid)
              );

              return (
                <div className="flex flex-wrap items-center gap-2 pt-0.5 pb-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quick Select:</span>

                  {/* CASE 1: Account Owner and Key Contact Owner are the SAME person */}
                  {isSamePerson && (
                    <button
                      type="button"
                      onClick={() => selectStaff(accOwnerStaff)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${assignedTo === accOwnerStaff.uid
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                        }`}
                      title="Account & Contact Owner"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      <span>Owner (Account & Contact): <strong>{accOwnerStaff.name}</strong></span>
                    </button>
                  )}

                  {/* CASE 2: Account Owner and Key Contact Owner are DIFFERENT people */}
                  {!isSamePerson && (
                    <>
                      {/* Key Contact Owner for currently selected contact */}
                      {primaryContactOwnerStaff && (
                        <button
                          type="button"
                          onClick={() => selectStaff(primaryContactOwnerStaff)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${assignedTo === primaryContactOwnerStaff.uid
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                            }`}
                          title={`Assigned owner for ${selectedContact?.name || 'Contact'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>Key Contact Owner ({selectedContact?.name}): <strong>{primaryContactOwnerStaff.name}</strong></span>
                        </button>
                      )}

                      {/* If no specific contact selected yet, list distinct contact owners */}
                      {!primaryContactOwnerStaff && distinctContactOwners.map(co => (
                        <button
                          key={co.uid}
                          type="button"
                          onClick={() => selectStaff(co)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${assignedTo === co.uid
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                            }`}
                          title={`Owner for contact ${co.contactName}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>Contact Owner ({co.contactName}): <strong>{co.name}</strong></span>
                        </button>
                      ))}

                      {/* Account Owner */}
                      {accOwnerStaff && (
                        <button
                          type="button"
                          onClick={() => selectStaff(accOwnerStaff)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${assignedTo === accOwnerStaff.uid
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                            }`}
                          title={`Account owner for ${selectedAccount?.companyName || 'Account'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>Account Owner: <strong>{accOwnerStaff.name}</strong></span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Input with icons */}
            <div
              className={`relative flex items-center bg-white border rounded-xl transition-all cursor-text ${showStaffDropdown ? 'border-primary ring-2 ring-primary/10 shadow-sm' : 'border-slate-300 hover:border-slate-400'
                }`}
            >
              <div className="pl-3.5 pr-1 text-slate-400 shrink-0">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Search staff by name, role, department or email..."
                value={assignedToSearch}
                onFocus={() => setShowStaffDropdown(true)}
                onChange={(e) => {
                  const val = e.target.value;
                  setAssignedToSearch(val);
                  setShowStaffDropdown(true);
                  const clean = val.replace(/^@/, '').trim().toLowerCase();
                  if (!clean) {
                    setAssignedTo('');
                  } else if (selectedStaffObj && clean !== selectedStaffObj.name?.toLowerCase().trim()) {
                    const exact = (staffList || []).find(s => s.name?.toLowerCase().trim() === clean);
                    if (exact) {
                      setAssignedTo(exact.uid);
                    } else {
                      setAssignedTo('');
                    }
                  }
                }}
                className="w-full bg-transparent px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none"
              />
              {(assignedTo || assignedToSearch) && (
                <button
                  type="button"
                  onClick={handleClearStaff}
                  className="p-1.5 mr-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shrink-0"
                  title="Clear staff selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                className="pr-3 text-slate-400 shrink-0 cursor-pointer"
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showStaffDropdown ? 'rotate-180 text-primary' : ''}`} />
              </button>
            </div>

            {/* Dropdown Menu */}
            {showStaffDropdown && (
              <div
                style={{ zIndex: 1000 }}
                className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 custom-scrollbar p-1">
                  {sortedStaff.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No team members found matching &quot;{assignedToSearch}&quot;
                    </div>
                  ) : (
                    sortedStaff.map(s => {
                      const isSelected = assignedTo === s.uid;
                      const isContactOwner = (primaryContactOwnerStaff && s.uid === primaryContactOwnerStaff.uid) || distinctContactOwners.some(c => c.uid === s.uid);
                      const isAccOwner = accOwnerStaff && s.uid === accOwnerStaff.uid;
                      const initials = (s.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'ST';

                      return (
                        <button
                          key={s.uid}
                          type="button"
                          onMouseDown={() => selectStaff(s)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-lg transition-colors text-left cursor-pointer ${isSelected ? 'bg-primary/5 text-primary font-bold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isContactOwner ? 'bg-emerald-100 text-emerald-800' :
                              isAccOwner ? 'bg-blue-100 text-blue-800' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                              {initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-semibold truncate ${isSelected ? 'text-primary' : 'text-slate-900'}`}>{s.name}</span>
                                {isContactOwner && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Key Contact Owner
                                  </span>
                                )}
                                {isAccOwner && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    Account Owner
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 truncate">
                                {[s.position || s.jobRole || s.role, s.department, s.email].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                          </div>
                          {isSelected && <CheckSquare className="w-4 h-4 text-primary shrink-0 ml-2" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Priority & Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <div className="space-y-2">
              <label className="text-slate-500 block uppercase tracking-wider text-[10px]">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 text-xs font-semibold cursor-pointer"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-slate-500 block uppercase tracking-wider text-[10px]">Due Date</label>
              <input
                type="date"
                max="2100-12-31"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 text-xs font-semibold"
              />
            </div>
          </div>



          {/* Description */}
          <div className="space-y-2 w-full">
            <label className="text-slate-500 block uppercase tracking-wider text-[10px]">Task Details / Instructions</label>
            <textarea
              placeholder="Provide precise details and metrics..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={6}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none text-xs font-semibold"
            />
          </div>

          {/* Form Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 w-full">
            <button
              type="button"
              onClick={handleBack}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-md transition-all cursor-pointer font-bold disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="xs" color="white" />
                  Assigning...
                </span>
              ) : 'Create & Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
