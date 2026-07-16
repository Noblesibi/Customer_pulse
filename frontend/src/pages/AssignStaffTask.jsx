import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldAlert, Check, CheckSquare, Building2, Users } from 'lucide-react';
import { useStore } from '../store/index.js';

export default function AssignStaffTask() {
  const navigate = useNavigate();
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
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) {
      fetchContacts(accountId);
    }
  }, [accountId]);

  const getMentionSearchQuery = (text) => {
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex === -1) return '';
    return text.slice(lastAtIndex + 1);
  };

  const selectStaff = (staff) => {
    setAssignedTo(staff.uid);
    setAssignedToSearch(`@${staff.name}`);
    setShowStaffDropdown(false);
  };

  const filteredStaff = (() => {
    const query = getMentionSearchQuery(assignedToSearch);
    if (!assignedToSearch.includes('@')) return [];
    return (staffList || []).filter(s =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.email.toLowerCase().includes(query.toLowerCase())
    );
  })();

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    // Fallback: If assignedTo is empty, try to match by name from assignedToSearch
    let targetAssigneeUid = assignedTo;
    if (!targetAssigneeUid && assignedToSearch.trim()) {
      const cleanSearch = assignedToSearch.trim().toLowerCase();
      const searchName = cleanSearch.startsWith('@') ? cleanSearch.slice(1).trim() : cleanSearch;
      
      const matchedStaff = (staffList || []).find(
        s => s.name.toLowerCase() === searchName || s.email.toLowerCase() === cleanSearch
      );
      if (matchedStaff) {
        targetAssigneeUid = matchedStaff.uid;
      }
    }

    // Ensure we actually selected a staff member, account, and contact
    const selectedAccountObj = (accounts || []).find(a => (a.accountId || a.id) === accountId);
    const selectedContactObj = (contacts || []).find(c => c.contactId === contactId);

    if (!accountId) {
      setFormError('Please select a company account.');
      return;
    }
    if (!contactId) {
      setFormError('Please select a client contact.');
      return;
    }
    if (!description.trim() || !targetAssigneeUid) {
      setFormError('Please fill in task description and search/select a valid staff member using @name.');
      return;
    }

    const generatedTitle = title.trim() || `${selectedAccountObj?.companyName || 'Unknown Account'} - ${selectedContactObj?.name || 'Unknown Contact'}`;

    setSubmitting(true);
    const payload = {
      title: generatedTitle,
      description: description.trim(),
      assignedToUid: targetAssigneeUid,
      priority,
      dueDate: dueDate || null,
      accountId,
      contactId
    };

    const created = await createStaffTask(payload);
    setSubmitting(false);

    if (created) {
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
        navigate('/staff-tasks');
      }, 1200);
    } else {
      setFormError('Failed to create and assign task.');
    }
  };

  const handleDescriptionBlur = async () => {
    if (!description.trim()) return;
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
          onClick={() => navigate('/staff-tasks')}
          className="flex items-center gap-1.5 cursor-pointer text-black hover:bg-dark-700 transition-colors font-bold text-base px-3.5 py-1.5 rounded-full"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <h2 className="text-base font-extrabold text-white tracking-wide uppercase">Assign Task</h2>
      </div>

      {/* Form Container */}
      <div className="glass p-6 md:p-8 rounded-2xl border border-slate-800/80 w-full">
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

          {/* Company Account & Client Contact Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <div className="space-y-2">
              <label className="text-slate-500 block uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Building2 className="w-3 h-3 text-slate-400" /> Company Account
              </label>
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setContactId('');
                }}
                className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 text-black font-semibold cursor-pointer"
              >
                <option value="">Select Company</option>
                {(accounts || []).map(acc => (
                  <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>
                    {acc.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-slate-500 block uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Users className="w-3 h-3 text-slate-400" /> Client Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 text-black font-semibold cursor-pointer"
              >
                <option value="">{(!contacts || contacts.length === 0) ? 'No contacts found' : 'Select Contact'}</option>
                {(contacts || [])
                  .filter(c => !accountId || c.accountId === accountId)
                  .map(c => (
                    <option key={c.contactId} value={c.contactId}>
                      {c.name} — {c.designation || c.hierarchyTag}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Assign to Staff Search Autocomplete */}
          <div className="space-y-2 relative w-full">
            <label className="text-slate-500 block uppercase tracking-wider text-[10px]">Assign to Staff</label>
            <input
              type="text"
              placeholder="Type @name to search and assign team member..."
              value={assignedToSearch}
              onFocus={() => setShowStaffDropdown(true)}
              onChange={(e) => {
                setAssignedToSearch(e.target.value);
                if (!e.target.value.includes('@')) {
                  setAssignedTo('');
                }
              }}
              onBlur={() => setTimeout(() => setShowStaffDropdown(false), 200)}
              className="w-full bg-dark-700/50 border border-slate-355 rounded-xl px-4 py-3 text-black placeholder-slate-455 focus:outline-none focus:border-primary/50 text-xs font-semibold"
            />
            
            {showStaffDropdown && filteredStaff.length > 0 && (
              <div className="absolute z-55 w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                {filteredStaff.map(s => {
                  const isSelected = assignedTo === s.uid;
                  return (
                    <button
                      key={s.uid}
                      type="button"
                      onMouseDown={() => selectStaff(s)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-slate-800 transition-colors text-slate-700 ${
                        isSelected ? 'bg-primary/5 text-primary' : ''
                      }`}
                    >
                      <div className="flex flex-col items-start text-left">
                        <span className="font-bold text-black">{s.name}</span>
                        <span className="text-xs text-slate-500 font-semibold">
                          {s.role}{s.department ? ` · ${s.department}` : ''}
                        </span>
                      </div>
                      {isSelected && <CheckSquare className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-2 w-full">
            <label className="text-slate-500 block uppercase tracking-wider text-[10px]">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-dark-700/50 border border-slate-350 rounded-xl px-4 py-3 text-black focus:outline-none focus:border-primary/50 text-xs font-semibold cursor-pointer"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          
          {/* Due Date */}
          <div className="space-y-2 w-full">
            <label className="text-slate-500 block uppercase tracking-wider text-[10px]">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-dark-700/50 border border-slate-350 rounded-xl px-4 py-3 text-black focus:outline-none focus:border-primary/50 text-xs font-semibold"
            />
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
              className="w-full bg-dark-700/50 border border-slate-350 rounded-xl px-4 py-3 text-black placeholder-slate-455 focus:outline-none focus:border-primary/50 resize-none text-xs font-semibold"
            />
          </div>

          {/* Form Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-dark-800 w-full">
            <button
              type="button"
              onClick={() => navigate('/staff-tasks')}
              className="px-5 py-2.5 bg-dark-900 border border-dark-800 text-slate-500 hover:text-black rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl shadow-lg transition-all cursor-pointer font-bold disabled:opacity-50"
            >
              {submitting ? 'Assigning...' : 'Create & Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
