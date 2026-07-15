import React, { useEffect, useState } from 'react';
import { 
  Users as UsersIcon, Shield, Mail, Calendar, Key, Plus, X, Lock, 
  User, Briefcase, Trash2, ArrowLeft, PlusCircle, MinusCircle, Upload, CheckCircle2,
  ChevronDown, ChevronRight, FolderOpen, Folder, UserCheck, Building2, GitBranch,
  Activity, Send, Eye, MessageSquare, CheckCheck, ChevronLeft
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Users() {
  const { 
    usersList, usersLoading, fetchUsersList, addUser, user, deleteUser,
    accounts, accountsLoading, fetchAccounts,
    contacts, contactsLoading, fetchContacts,
    interactions, interactionsLoading, fetchInteractions
  } = useStore();

  const [activeTab, setActiveTab] = useState('clients'); // 'clients' or 'directory'
  const [clientSearch, setClientSearch] = useState('');
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'org'
  
  // Base fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState('Employee');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [reportingTo, setReportingTo] = useState('');
  const [showReportingSuggestions, setShowReportingSuggestions] = useState(false);

  // BU Head fields
  const [buHeadBu, setBuHeadBu] = useState('');
  const [buProjectsMode, setBuProjectsMode] = useState('manual'); // 'manual' or 'excel'
  const [buProjectsExcelFile, setBuProjectsExcelFile] = useState(null);
  const [buProjects, setBuProjects] = useState([
    { name: '', managersMode: 'manual', managers: ['', '', ''], excelFileManagers: null, employeesMode: 'manual', employees: ['', '', ''], excelFileEmployees: null }
  ]);

  // Project Manager fields
  const [pmBu, setPmBu] = useState('');
  const [pmProjectsMode, setPmProjectsMode] = useState('manual'); // 'manual' or 'excel'
  const [pmProjectsExcelFile, setPmProjectsExcelFile] = useState(null);
  const [pmProjects, setPmProjects] = useState([
    { name: '', employeesMode: 'manual', employees: ['', '', ''], excelFileEmployees: null }
  ]);

  // Employee fields
  const [empBu, setEmpBu] = useState('');
  const [empProject, setEmpProject] = useState('');
  const [empManager, setEmpManager] = useState('');

  // Expandable rows state
  const [expandedUsers, setExpandedUsers] = useState({});

  // Deletion modal state
  const [userToDelete, setUserToDelete] = useState(null);

  // Client stakeholders expansion state
  const [expandedUserStakeholders, setExpandedUserStakeholders] = useState({});
  const toggleUserStakeholders = (uid) => {
    setExpandedUserStakeholders(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  const getConnectedAccounts = (u) => {
    // 1. Direct ownership via ownerId or ownerName
    const owned = accounts.filter(a => 
      a.ownerId === u.uid || 
      (u.name && a.ownerName?.toLowerCase() === u.name.toLowerCase())
    );
    
    // 2. Connection via projects array or project text
    const connectedByProject = accounts.filter(a => {
      if (owned.some(o => o.accountId === a.accountId)) return false;
      
      let projectsArr = [];
      if (typeof u.projects === 'string') {
        try { projectsArr = JSON.parse(u.projects); } catch (e) { projectsArr = []; }
      } else if (Array.isArray(u.projects)) {
        projectsArr = u.projects;
      }
      
      if (projectsArr.length > 0) {
        return projectsArr.some(p => {
          const pName = typeof p === 'string' ? p : p.name;
          return pName && (
            a.companyName.toLowerCase().includes(pName.toLowerCase()) ||
            pName.toLowerCase().includes(a.companyName.toLowerCase())
          );
        });
      }
      
      if (u.project) {
        return a.companyName.toLowerCase().includes(u.project.toLowerCase()) ||
               u.project.toLowerCase().includes(a.companyName.toLowerCase());
      }
      
      return false;
    });
    
    return [...owned, ...connectedByProject];
  };

  const getAccountContacts = (accId) => {
    return contacts.filter(c => c.accountId === accId);
  };

  const handleAssignRole = (type, details = {}) => {
    setUserType(type);
    if (details.position) setPosition(details.position);
    if (details.department) setDepartment(details.department);
    if (details.bu) {
      setBuHeadBu(details.bu);
      setPmBu(details.bu);
      setEmpBu(details.bu);
    }
    setIsAddUserOpen(true);
  };

  const renderOrgNode = (title, matchType, details = {}, matchFn = null, colorClasses = {}) => {
    const matched = usersList.filter(u => {
      const uType = (u.userType || u.role);
      if (uType !== matchType) return false;
      if (matchFn) return matchFn(u);
      return true;
    });

    const bgClass = colorClasses.bg || 'glass';
    const borderClass = colorClasses.border || 'border-slate-700/60';
    const textClass = colorClasses.text || 'text-white';
    const accentBg = colorClasses.accentBg || 'bg-primary/10 border-primary/20 text-primary';

    if (matched.length > 0) {
      return (
        <div className="flex flex-col gap-2">
          {matched.map(u => {
            const isCurrentUser = user && user.email?.toLowerCase() === u.email?.toLowerCase();
            const connectedAccs = getConnectedAccounts(u);
            const isExpanded = !!expandedUserStakeholders[u.uid || u.id];
            
            return (
              <div key={u.uid || u.id} className={`${bgClass} border ${isCurrentUser ? 'border-primary ring-2 ring-primary/45 shadow-primary/20' : borderClass} p-3 rounded-xl shadow-lg flex flex-col items-center justify-between w-56 text-center hover:border-primary/50 transition-all shrink-0 relative overflow-hidden`}>
                {isCurrentUser && (
                  <div className="absolute top-0 left-0 bg-primary text-white text-xs font-black uppercase tracking-wider px-1.5 py-0.5 rounded-br-lg z-10">
                    You
                  </div>
                )}
                {user?.role === 'Admin' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUser(u.uid || u.id, u.name);
                    }}
                    className="absolute top-1 right-2 text-slate-500 hover:text-rose-500 transition-colors p-1 rounded hover:bg-slate-800 z-10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div className={`${accentBg} w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm mx-auto mt-2`}>
                  {u.name ? u.name.substring(0, 2).toUpperCase() : 'US'}
                </div>
                <div className="mt-1.5 flex flex-col items-center w-full">
                  <span className={`font-extrabold ${textClass} text-sm block truncate max-w-[200px]`}>{u.name}</span>
                  <span className="text-xs text-slate-500 mt-0.5 font-bold uppercase tracking-wider">{u.position || u.userType || u.role}</span>
                  <span className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{u.email}</span>
                  
                  {connectedAccs.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUserStakeholders(u.uid || u.id);
                      }}
                      className="mt-2 text-xs font-black uppercase tracking-wider text-primary hover:text-blue-400 bg-primary/10 border border-primary/20 px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer w-full justify-center active:scale-98 transition-all"
                    >
                      <span>💼 {connectedAccs.length} Client{connectedAccs.length !== 1 ? 's' : ''}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  
                  {isExpanded && connectedAccs.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700/60 w-full text-left space-y-2.5 select-text">
                      {connectedAccs.map(acc => {
                        const accContacts = getAccountContacts(acc.accountId || acc.id);
                        return (
                          <div key={acc.accountId || acc.id} className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-extrabold text-white truncate max-w-[150px]">{acc.companyName}</span>
                              <span className={`text-xs font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                acc.healthScore >= 80 
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : acc.healthScore >= 50 
                                    ? 'bg-amber-500/10 text-amber-400' 
                                    : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {acc.healthScore}%
                              </span>
                            </div>
                            {accContacts.length > 0 && (
                              <div className="space-y-1 pl-1 border-l border-slate-800/80">
                                <span className="text-xs text-slate-500 font-black uppercase tracking-widest block mb-0.5">Stakeholders</span>
                                {accContacts.map(c => (
                                  <div key={c.contactId || c.id} className="text-xs font-semibold text-slate-300 truncate flex items-center justify-between gap-1">
                                    <span className="truncate">👤 {c.name}</span>
                                    <span className="text-xs text-slate-500 italic shrink-0">({c.designation})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (user?.role !== 'Admin') {
      return (
        <div 
          className="border border-dashed border-slate-700/60 p-3 rounded-xl flex flex-col items-center justify-center w-56 h-[116px] text-center bg-slate-900/10 text-slate-500 transition-all shrink-0 select-none"
        >
          <span className="text-xs font-extrabold uppercase tracking-wider block">{title}</span>
          <span className="text-xs text-slate-600 mt-1.5 font-black italic">
            Vacant
          </span>
        </div>
      );
    }

    return (
      <div 
        onClick={() => handleAssignRole(matchType, details)}
        className="border border-dashed border-slate-700/65 hover:border-primary/50 hover:bg-primary/5 p-3 rounded-xl flex flex-col items-center justify-center w-56 h-[116px] text-center bg-slate-900/20 text-slate-400 cursor-pointer transition-all shrink-0 select-none group"
      >
        <span className="text-xs font-extrabold uppercase tracking-wider block">{title}</span>
        <span className="text-xs text-slate-500 mt-1.5 flex items-center gap-1 group-hover:text-primary transition-colors font-black">
          <PlusCircle className="w-4 h-4" /> Assign
        </span>
      </div>
    );
  };

  const renderManagersList = (title, matchType, details = {}) => {
    const matched = usersList.filter(u => (u.userType || u.role) === matchType);

    return (
      <div className="flex flex-col gap-2 bg-dark-900/40 p-4 rounded-2xl border border-slate-800/80 w-76 shadow-md shrink-0">
        <h4 className="text-xs font-bold text-center text-slate-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-slate-800/50">{title}</h4>
        <div className="flex flex-col gap-2 pr-1">
          {matched.length > 0 ? (
            matched.map(u => {
              const isCurrentUser = user && user.email?.toLowerCase() === u.email?.toLowerCase();
              const connectedAccs = getConnectedAccounts(u);
              const isExpanded = !!expandedUserStakeholders[u.uid || u.id];
              
              return (
                <div key={u.uid || u.id} className={`glass border ${isCurrentUser ? 'border-primary' : 'border-slate-700/60'} p-3 rounded-xl flex flex-col gap-2 relative overflow-hidden`}>
                  {isCurrentUser && (
                    <span className="absolute top-0 left-0 bg-primary text-white text-xs font-bold px-1.5 py-0.5 rounded-br-lg z-10">You</span>
                  )}
                  {user?.role === 'Admin' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUser(u.uid || u.id, u.name);
                      }}
                      className="absolute top-1 right-2 text-slate-500 hover:text-rose-500 transition-colors p-0.5 rounded hover:bg-slate-800 z-10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  
                  <div className="flex items-center gap-2.5 w-full mt-2">
                    <div className="bg-primary/10 border border-primary/20 text-primary w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
                      {u.name ? u.name.substring(0, 2).toUpperCase() : 'US'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-extrabold text-white text-sm block truncate">{u.name}</span>
                      <span className="text-xs text-slate-500 block truncate">{u.email}</span>
                    </div>
                  </div>
                  
                  {connectedAccs.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUserStakeholders(u.uid || u.id);
                      }}
                      className="mt-1 text-xs font-black uppercase tracking-wider text-primary hover:text-blue-400 bg-primary/10 border border-primary/20 px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer w-full justify-center active:scale-98 transition-all"
                    >
                      <span>💼 {connectedAccs.length} Client{connectedAccs.length !== 1 ? 's' : ''}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  
                  {isExpanded && connectedAccs.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 w-full text-left space-y-2.5 select-text">
                      {connectedAccs.map(acc => {
                        const accContacts = getAccountContacts(acc.accountId || acc.id);
                        return (
                          <div key={acc.accountId || acc.id} className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-extrabold text-white truncate max-w-[200px]">{acc.companyName}</span>
                              <span className={`text-xs font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                acc.healthScore >= 80 
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : acc.healthScore >= 50 
                                    ? 'bg-amber-500/10 text-amber-400' 
                                    : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {acc.healthScore}%
                              </span>
                            </div>
                            {accContacts.length > 0 && (
                              <div className="space-y-1 pl-1 border-l border-slate-800/80">
                                <span className="text-xs text-slate-500 font-black uppercase tracking-widest block mb-0.5">Stakeholders</span>
                                {accContacts.map(c => (
                                  <div key={c.contactId || c.id} className="text-xs font-semibold text-slate-300 truncate flex items-center justify-between gap-1">
                                    <span className="truncate font-semibold text-slate-355">👤 {c.name}</span>
                                    <span className="text-xs text-slate-500 italic shrink-0">({c.designation})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : user?.role === 'Admin' ? (
            <button 
              onClick={() => handleAssignRole(matchType, details)}
              className="border border-dashed border-slate-700/50 hover:border-primary/50 hover:bg-primary/5 p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs text-slate-500 cursor-pointer transition-all w-full select-none font-semibold"
            >
              <PlusCircle className="w-4 h-4 text-slate-500" /> Assign Manager
            </button>
          ) : (
            <div className="p-2 text-center text-xs text-slate-600 italic">No managers assigned</div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    fetchUsersList();
    fetchAccounts(1, '');
    fetchContacts();
    fetchInteractions();
  }, []);

  const toggleAccountExpand = (accountId) => {
    setExpandedAccounts(prev => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  const getAccountInteractions = (accountId) => {
    return interactions.filter(i => i.accountId === accountId);
  };

  const getInteractionTrackerState = (interaction) => {
    const hasMentions = Array.isArray(interaction.actionMentions) && interaction.actionMentions.length > 0;
    const isInitiated = true;
    
    const taskAssignedNotifications = Array.isArray(interaction.notifications) 
      ? interaction.notifications.filter(n => n.type === 'Task Assigned') 
      : [];
    const isAssigned = !hasMentions || (taskAssignedNotifications.length > 0 && taskAssignedNotifications.some(n => n.read));
    
    const hasReplies = Array.isArray(interaction.replies) && interaction.replies.length > 0;
    const isActioned = hasReplies;
    
    const taskReplyNotifications = Array.isArray(interaction.notifications) 
      ? interaction.notifications.filter(n => n.type === 'Task Reply') 
      : [];
    const isCompleted = isActioned && (
      (taskReplyNotifications.length > 0 && taskReplyNotifications.some(n => n.read)) || 
      (Array.isArray(interaction.replies) && interaction.replies.some(r => r.authorUid === interaction.loggedByUid))
    );

    return { isInitiated, isAssigned, isActioned, isCompleted };
  };

  const filteredAccounts = accounts.filter(acc => {
    const query = clientSearch.toLowerCase();
    const companyMatches = (acc.companyName || '').toLowerCase().includes(query);
    const projectMatches = (acc.projectName || '').toLowerCase().includes(query);
    const regionMatches = (acc.region || '').toLowerCase().includes(query);
    const industryMatches = (acc.industry || '').toLowerCase().includes(query);
    return companyMatches || projectMatches || regionMatches || industryMatches;
  });

  // Array handlers
  const handleArrayChange = (setter, index, val) => {
    setter(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleArrayAdd = (setter) => {
    setter(prev => [...prev, '']);
  };

  const handleArrayRemove = (setter, index) => {
    setter(prev => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const toggleUserExpand = (uid) => {
    setExpandedUsers(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  const hasExpandableContent = (u) => {
    return (
      (u.projects && u.projects.length > 0 && u.projects.some(p => p.name)) ||
      (u.project && u.project.trim() !== '') ||
      (u.bu && u.bu.trim() !== '')
    );
  };

  const handleDeleteUser = (uid, userName) => {
    setUserToDelete({ uid, name: userName });
  };

  const confirmDeleteUser = async () => {
    if (userToDelete) {
      const success = await deleteUser(userToDelete.uid);
      if (success) {
        setUserToDelete(null);
        fetchUsersList();
      } else {
        alert('Failed to delete user.');
      }
    }
  };

  // BU Head helper functions
  const handleAddBuProject = () => {
    setBuProjects(prev => [...prev, {
      name: '',
      managersMode: 'manual',
      managers: ['', '', ''],
      excelFileManagers: null,
      employeesMode: 'manual',
      employees: ['', '', ''],
      excelFileEmployees: null
    }]);
  };

  const handleRemoveBuProject = (index) => {
    setBuProjects(prev => {
      if (prev.length <= 1) {
        return [{
          name: '',
          managersMode: 'manual',
          managers: ['', '', ''],
          excelFileManagers: null,
          employeesMode: 'manual',
          employees: ['', '', ''],
          excelFileEmployees: null
        }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleBuProjectFieldChange = (projIndex, field, value) => {
    setBuProjects(prev => prev.map((proj, i) => i === projIndex ? { ...proj, [field]: value } : proj));
  };

  const handleAddBuProjectManager = (projIndex) => {
    setBuProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        return { ...proj, managers: [...proj.managers, ''] };
      }
      return proj;
    }));
  };

  const handleRemoveBuProjectManager = (projIndex, mgrIndex) => {
    setBuProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        const next = proj.managers.filter((_, mi) => mi !== mgrIndex);
        return { ...proj, managers: next.length ? next : [''] };
      }
      return proj;
    }));
  };

  const handleBuProjectManagerChange = (projIndex, mgrIndex, value) => {
    setBuProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        const next = [...proj.managers];
        next[mgrIndex] = value;
        return { ...proj, managers: next };
      }
      return proj;
    }));
  };

  const handleAddBuProjectEmployee = (projIndex) => {
    setBuProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        return { ...proj, employees: [...proj.employees, ''] };
      }
      return proj;
    }));
  };

  const handleRemoveBuProjectEmployee = (projIndex, empIndex) => {
    setBuProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        const next = proj.employees.filter((_, ei) => ei !== empIndex);
        return { ...proj, employees: next.length ? next : [''] };
      }
      return proj;
    }));
  };

  const handleBuProjectEmployeeChange = (projIndex, empIndex, value) => {
    setBuProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        const next = [...proj.employees];
        next[empIndex] = value;
        return { ...proj, employees: next };
      }
      return proj;
    }));
  };

  // PM projects helper functions
  const handleAddPmProject = () => {
    setPmProjects(prev => [...prev, {
      name: '',
      employeesMode: 'manual',
      employees: ['', '', ''],
      excelFileEmployees: null
    }]);
  };

  const handleRemovePmProject = (index) => {
    setPmProjects(prev => {
      if (prev.length <= 1) {
        return [{
          name: '',
          employeesMode: 'manual',
          employees: ['', '', ''],
          excelFileEmployees: null
        }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePmProjectFieldChange = (projIndex, field, value) => {
    setPmProjects(prev => prev.map((proj, i) => i === projIndex ? { ...proj, [field]: value } : proj));
  };

  const handleAddPmProjectEmployee = (projIndex) => {
    setPmProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        return { ...proj, employees: [...proj.employees, ''] };
      }
      return proj;
    }));
  };

  const handleRemovePmProjectEmployee = (projIndex, empIndex) => {
    setPmProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        const next = proj.employees.filter((_, ei) => ei !== empIndex);
        return { ...proj, employees: next.length ? next : [''] };
      }
      return proj;
    }));
  };

  const handlePmProjectEmployeeChange = (projIndex, empIndex, value) => {
    setPmProjects(prev => prev.map((proj, i) => {
      if (i === projIndex) {
        const next = [...proj.employees];
        next[empIndex] = value;
        return { ...proj, employees: next };
      }
      return proj;
    }));
  };

  const handleAddUserSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      name,
      email,
      password,
      userType,
      department,
      position,
      reportingTo: (userType === 'CEO' || userType === 'Admin') ? '' : reportingTo
    };

    if (['BU Head', 'Delivery Head'].includes(userType)) {
      payload.bu = buHeadBu;
      if (buProjectsMode === 'excel') {
        payload.projects = buProjectsExcelFile ? [{
          name: `Uploaded Projects: ${buProjectsExcelFile.name}`,
          projectManagers: [],
          employees: []
        }] : [];
      } else {
        payload.projects = buProjects.map(proj => {
          let finalPMs = [];
          if (proj.managersMode === 'excel') {
            finalPMs = proj.excelFileManagers ? [`Uploaded PM Roster: ${proj.excelFileManagers.name}`] : [];
          } else {
            finalPMs = proj.managers.filter(Boolean);
          }

          let finalEmps = [];
          if (proj.employeesMode === 'excel') {
            finalEmps = proj.excelFileEmployees ? [`Uploaded Employee Roster: ${proj.excelFileEmployees.name}`] : [];
          } else {
            finalEmps = proj.employees.filter(Boolean);
          }

          return {
            name: proj.name,
            projectManagers: finalPMs,
            employees: finalEmps
          };
        });
      }
    } else if (['Project Manager', 'Delivery Manager', 'Sales Manager', 'Account Manager'].includes(userType)) {
      payload.bu = pmBu;
      if (pmProjectsMode === 'excel') {
        payload.projects = pmProjectsExcelFile ? [{
          name: `Uploaded Projects Roster: ${pmProjectsExcelFile.name}`,
          employees: []
        }] : [];
      } else {
        payload.projects = pmProjects.map(proj => {
          let finalEmps = [];
          if (proj.employeesMode === 'excel') {
            finalEmps = proj.excelFileEmployees ? [`Uploaded Employee Roster: ${proj.excelFileEmployees.name}`] : [];
          } else {
            finalEmps = proj.employees.filter(Boolean);
          }

          return {
            name: proj.name,
            employees: finalEmps
          };
        });
      }
    } else if (userType === 'Employee') {
      payload.bu = empBu;
      payload.project = empProject;
      payload.projectManagers = [empManager].filter(Boolean);
    }

    const success = await addUser(payload);
    if (success) {
      // Reset all fields
      setIsAddUserOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setUserType('Employee');
      setDepartment('');
      setPosition('');
      setReportingTo('');
      
      setBuProjects([
        { name: '', managersMode: 'manual', managers: ['', '', ''], excelFileManagers: null, employeesMode: 'manual', employees: ['', '', ''], excelFileEmployees: null }
      ]);
      setBuProjectsMode('manual');
      setBuProjectsExcelFile(null);
      setBuHeadBu('');

      setPmBu('');
      setPmProjects([
        { name: '', employeesMode: 'manual', employees: ['', '', ''], excelFileEmployees: null }
      ]);
      setPmProjectsMode('manual');
      setPmProjectsExcelFile(null);

      setEmpBu('');
      setEmpProject('');
      setEmpManager('');

      fetchUsersList();
    } else {
      alert('Failed to register user.');
    }
  };

  const getUserTypeBadgeColor = (type) => {
    switch (type) {
      case 'Admin': return 'bg-rose-500/10 border-rose-500/20 text-rose-500';
      case 'CEO': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500';
      case 'BU Head': return 'bg-amber-500/10 border-amber-500/20 text-amber-500';
      case 'Project Manager': return 'bg-purple-500/10 border-purple-500/20 text-purple-500';
      default: return 'bg-blue-500/10 border-blue-500/20 text-blue-500';
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 select-none animate-soft-pulse duration-1000">

      {isAddUserOpen ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <button 
              onClick={() => setIsAddUserOpen(false)}
              className="flex items-center gap-1.5 cursor-pointer text-black hover:bg-dark-700 transition-colors font-bold text-base px-3.5 py-1.5 rounded-full"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
            <h2 className="text-base font-extrabold text-white tracking-wide">Register Platform User</h2>
          </div>

          <form onSubmit={handleAddUserSubmit} className="space-y-8">
            
            {/* Base User Info Card */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Base Profile Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" required value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Robert Stark"
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Corporate Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Corporate Password */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Account Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Department</label>
                  <input 
                    type="text" required value={department} onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering, Sales, Human Resources"
                    className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                  />
                </div>

                {/* Position */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Position</label>
                  <input 
                    type="text" required value={position} onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. Lead Developer, BU Director, Executive Associate"
                    className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                  />
                </div>

                {/* User Type Select */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">User Type (Access Level)</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <select 
                      value={userType} onChange={(e) => setUserType(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 pl-10 pr-4 focus:outline-none cursor-pointer"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Project Manager">Project Manager</option>
                      <option value="Sales Manager">Sales Manager</option>
                      <option value="Account Manager">Account Manager</option>
                      <option value="Delivery Manager">Delivery Manager</option>
                      <option value="Delivery Head">Delivery Head</option>
                      <option value="BU Head">BU Head / P&L Head</option>
                      <option value="Functional Head">Functional Head (Finance/HR/ITG/Quality)</option>
                      <option value="CEO">CEO</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                </div>

                {/* Reporting To (Global Field) */}
                {userType !== 'CEO' && userType !== 'Admin' && (
                  <div className="space-y-1.5 md:col-span-2 relative">
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Reporting To (Manager / Lead)</label>
                    <input 
                      type="text" required value={reportingTo} 
                      onChange={(e) => {
                        setReportingTo(e.target.value);
                        setShowReportingSuggestions(true);
                      }}
                      onFocus={() => setShowReportingSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowReportingSuggestions(false), 200)}
                      placeholder="e.g. Jonathan Stark (CEO), Arthur Pendragon (Admin)"
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                    />
                    {showReportingSuggestions && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                        {usersList.filter(u => {
                          const searchString = `${u.name} ${u.position || ''} ${u.userType || ''} ${u.role || ''}`.toLowerCase();
                          return searchString.includes(reportingTo.toLowerCase());
                        }).length > 0 ? (
                          usersList.filter(u => {
                            const searchString = `${u.name} ${u.position || ''} ${u.userType || ''} ${u.role || ''}`.toLowerCase();
                            return searchString.includes(reportingTo.toLowerCase());
                          }).map(u => (
                            <button
                              key={u.uid || u.id}
                              type="button"
                              onClick={() => {
                                setReportingTo(u.name);
                                setShowReportingSuggestions(false);
                              }}
                              className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center justify-between text-xs transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <div className="bg-primary/10 border border-primary/20 text-primary w-8 h-8 rounded flex items-center justify-center font-bold text-xs shrink-0">
                                  {u.name ? u.name.substring(0, 2).toUpperCase() : 'US'}
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-50">{u.name}</span>
                                  <span className="text-xs text-slate-355 font-medium">{u.email}</span>
                                </div>
                              </div>
                              <span className="text-xs bg-slate-700 border border-slate-600 px-2 py-0.5 rounded-full text-slate-200 font-bold uppercase tracking-wider">
                                {u.position || u.userType || u.role}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-400 font-medium">
                            No matching users found in the hierarchy
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* --------------------------------------------------------
                CONDITIONAL DYNAMIC PANELS
                -------------------------------------------------------- */}
            <div className="border-t border-slate-800/80 pt-6 space-y-6">
              
              {/* PANEL 1: BU HEAD / DELIVERY HEAD */}
              {['BU Head', 'Delivery Head'].includes(userType) && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider">{userType} details</h4>
                  </div>

                  {/* BU Name */}
                  <div className="space-y-1.5 max-w-md">
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                      {userType === 'Delivery Head' ? 'Delivery Division Name' : 'Business Unit (BU) Name'}
                    </label>
                    <input 
                      type="text" required value={buHeadBu} onChange={(e) => setBuHeadBu(e.target.value)}
                      placeholder={userType === 'Delivery Head' ? "e.g. Insurance, Industrial, Healthcare" : "e.g. Digital, Logistics, Finance"}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {/* Projects Configuration Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Projects Mode</label>
                    <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                      <button 
                        type="button" onClick={() => setBuProjectsMode('manual')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${buProjectsMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                      >
                        Manual Configuration
                      </button>
                      <button 
                        type="button" onClick={() => setBuProjectsMode('excel')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${buProjectsMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                      >
                        Excel Bulk Upload
                      </button>
                    </div>
                  </div>

                  {buProjectsMode === 'excel' ? (
                    <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-primary/50 transition-colors relative bg-dark-900/40">
                      <input 
                        type="file" accept=".xlsx,.xls" onChange={(e) => setBuProjectsExcelFile(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center justify-center space-y-2">
                        {buProjectsExcelFile ? (
                          <>
                            <CheckCircle2 className="w-8 h-8 text-success animate-bounce" />
                            <span className="text-xs font-bold text-white">Excel Projects File Loaded!</span>
                            <span className="text-xs text-slate-500">{buProjectsExcelFile.name}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-400" />
                            <span className="text-xs font-bold text-slate-300">Drag & drop projects spreadsheet (.xlsx) here</span>
                            <span className="text-xs text-slate-400">or click to browse local files</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Configure Projects & Teams under BU</label>
                        <button 
                          type="button" onClick={handleAddBuProject}
                          className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Add Project Section
                        </button>
                      </div>

                      {buProjects.map((proj, projIdx) => (
                        <div key={projIdx} className="bg-dark-900/40 border border-slate-700 rounded-xl p-4 space-y-4 shadow-sm relative">
                          {buProjects.length > 1 && (
                            <button 
                              type="button" onClick={() => handleRemoveBuProject(projIdx)}
                              className="absolute top-4 right-4 text-rose-400 hover:text-rose-300 cursor-pointer flex items-center gap-1 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20"
                            >
                              <X className="w-3.5 h-3.5" /> Remove Project
                            </button>
                          )}

                          {/* Project Name */}
                          <div className="space-y-1.5 max-w-md">
                            <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Project Name</label>
                            <input 
                              type="text" required value={proj.name} 
                              onChange={(e) => handleBuProjectFieldChange(projIdx, 'name', e.target.value)}
                              placeholder={`e.g. Project Apollo / Option #${projIdx + 1}`}
                              className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-lg py-2.5 px-3 focus:outline-none focus:border-primary/50"
                            />
                          </div>

                          <div className="space-y-3 pt-2 border-t border-slate-700/60">
                            
                            {/* Employees Subsection */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Employees Working on this Project</label>
                                <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                                  <button 
                                    type="button" onClick={() => handleBuProjectFieldChange(projIdx, 'employeesMode', 'manual')}
                                    className={`px-2 py-1 rounded-md text-xs font-bold cursor-pointer ${proj.employeesMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                  >
                                    Manual
                                  </button>
                                  <button 
                                    type="button" onClick={() => handleBuProjectFieldChange(projIdx, 'employeesMode', 'excel')}
                                    className={`px-2 py-1 rounded-md text-xs font-bold cursor-pointer ${proj.employeesMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                  >
                                    Excel
                                  </button>
                                </div>
                              </div>

                              {proj.employeesMode === 'excel' ? (
                                <div className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center relative bg-dark-900/40">
                                  <input 
                                    type="file" accept=".xlsx,.xls" 
                                    onChange={(e) => handleBuProjectFieldChange(projIdx, 'excelFileEmployees', e.target.files[0])}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div className="flex flex-col items-center justify-center space-y-1">
                                    {proj.excelFileEmployees ? (
                                      <>
                                        <CheckCircle2 className="w-5 h-5 text-success" />
                                        <span className="text-xs font-bold text-white">Employees File Loaded!</span>
                                        <span className="text-xs text-slate-500">{proj.excelFileEmployees.name}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="w-5 h-5 text-slate-400" />
                                        <span className="text-xs font-semibold text-slate-400">Upload Roster Excel list</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex justify-end">
                                    <button 
                                      type="button" onClick={() => handleAddBuProjectEmployee(projIdx)}
                                      className="text-xs text-primary hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                                    >
                                      <PlusCircle className="w-3 h-3" /> Add Employee
                                    </button>
                                  </div>
                                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                    {proj.employees.map((emp, empIdx) => (
                                      <div key={empIdx} className="flex items-center gap-1.5">
                                        <input 
                                          type="text" required value={emp} 
                                          onChange={(e) => handleBuProjectEmployeeChange(projIdx, empIdx, e.target.value)}
                                          placeholder={`Employee Name #${empIdx + 1}`}
                                          className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-lg py-2 px-3 focus:outline-none focus:border-primary/50"
                                        />
                                        {proj.employees.length > 1 && (
                                          <button type="button" onClick={() => handleRemoveBuProjectEmployee(projIdx, empIdx)} className="text-rose-500 hover:text-rose-600 cursor-pointer">
                                            <MinusCircle className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PANEL 2: PROJECT / DELIVERY / SALES / ACCOUNT MANAGER */}
              {['Project Manager', 'Delivery Manager', 'Sales Manager', 'Account Manager'].includes(userType) && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider">{userType} details</h4>
                  </div>

                  {/* Under which BU */}
                  <div className="space-y-1.5 max-w-md">
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Under Which Division / BU</label>
                    <input 
                      type="text" required value={pmBu} onChange={(e) => setPmBu(e.target.value)}
                      placeholder="e.g. Insurance, Healthcare, BFS BU, Enterprise BU"
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {/* Projects Configuration Toggle */}
                  <div className="flex items-center justify-between pt-2">
                    <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Projects Managed Mode</label>
                    <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                      <button 
                        type="button" onClick={() => setPmProjectsMode('manual')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${pmProjectsMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                      >
                        Manual Configuration
                      </button>
                      <button 
                        type="button" onClick={() => setPmProjectsMode('excel')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${pmProjectsMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                      >
                        Excel Bulk Upload
                      </button>
                    </div>
                  </div>

                  {pmProjectsMode === 'excel' ? (
                    <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-primary/50 transition-colors relative bg-dark-900/40">
                      <input 
                        type="file" accept=".xlsx,.xls" onChange={(e) => setPmProjectsExcelFile(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center justify-center space-y-2">
                        {pmProjectsExcelFile ? (
                          <>
                            <CheckCircle2 className="w-8 h-8 text-success animate-bounce" />
                            <span className="text-xs font-bold text-white">Excel Projects File Loaded!</span>
                            <span className="text-xs text-slate-500">{pmProjectsExcelFile.name}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-400" />
                            <span className="text-xs font-bold text-slate-300">Drag & drop projects spreadsheet (.xlsx) here</span>
                            <span className="text-xs text-slate-400">or click to browse local files</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Configure Projects Managed</label>
                        <button 
                          type="button" onClick={handleAddPmProject}
                          className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Add Project Section
                        </button>
                      </div>

                      {pmProjects.map((proj, projIdx) => (
                        <div key={projIdx} className="bg-dark-900/40 border border-slate-700 rounded-xl p-4 space-y-4 shadow-sm relative">
                          {pmProjects.length > 1 && (
                            <button 
                              type="button" onClick={() => handleRemovePmProject(projIdx)}
                              className="absolute top-4 right-4 text-rose-400 hover:text-rose-300 cursor-pointer flex items-center gap-1 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20"
                            >
                              <X className="w-3.5 h-3.5" /> Remove Project
                            </button>
                          )}

                          {/* Project Name */}
                          <div className="space-y-1.5 max-w-md">
                            <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Project Name</label>
                            <input 
                              type="text" required value={proj.name} 
                              onChange={(e) => handlePmProjectFieldChange(projIdx, 'name', e.target.value)}
                              placeholder={`e.g. Project Artemis / Option #${projIdx + 1}`}
                              className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-lg py-2.5 px-3 focus:outline-none focus:border-primary/50"
                            />
                          </div>

                          <div className="space-y-3 pt-2 border-t border-slate-700/60">
                            
                            {/* Employees Subsection */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Employees Working on this Project</label>
                                <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                                  <button 
                                    type="button" onClick={() => handlePmProjectFieldChange(projIdx, 'employeesMode', 'manual')}
                                    className={`px-2 py-1 rounded-md text-xs font-bold cursor-pointer ${proj.employeesMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                  >
                                    Manual
                                  </button>
                                  <button 
                                    type="button" onClick={() => handlePmProjectFieldChange(projIdx, 'employeesMode', 'excel')}
                                    className={`px-2 py-1 rounded-md text-xs font-bold cursor-pointer ${proj.employeesMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                  >
                                    Excel
                                  </button>
                                </div>
                              </div>

                              {proj.employeesMode === 'excel' ? (
                                <div className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center relative bg-dark-900/40">
                                  <input 
                                    type="file" accept=".xlsx,.xls" 
                                    onChange={(e) => handlePmProjectFieldChange(projIdx, 'excelFileEmployees', e.target.files[0])}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div className="flex flex-col items-center justify-center space-y-1">
                                    {proj.excelFileEmployees ? (
                                      <>
                                        <CheckCircle2 className="w-5 h-5 text-success" />
                                        <span className="text-xs font-bold text-white">Employees File Loaded!</span>
                                        <span className="text-xs text-slate-500">{proj.excelFileEmployees.name}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="w-5 h-5 text-slate-400" />
                                        <span className="text-xs font-semibold text-slate-400">Upload Roster Excel list</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex justify-end">
                                    <button 
                                      type="button" onClick={() => handleAddPmProjectEmployee(projIdx)}
                                      className="text-xs text-primary hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                                    >
                                      <PlusCircle className="w-3 h-3" /> Add Employee
                                    </button>
                                  </div>
                                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                    {proj.employees.map((emp, empIdx) => (
                                      <div key={empIdx} className="flex items-center gap-1.5">
                                        <input 
                                          type="text" required value={emp} 
                                          onChange={(e) => handlePmProjectEmployeeChange(projIdx, empIdx, e.target.value)}
                                          placeholder={`Employee Name #${empIdx + 1}`}
                                          className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-lg py-2 px-3 focus:outline-none focus:border-primary/50"
                                        />
                                        {proj.employees.length > 1 && (
                                          <button type="button" onClick={() => handleRemovePmProjectEmployee(projIdx, empIdx)} className="text-rose-500 hover:text-rose-600 cursor-pointer">
                                            <MinusCircle className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PANEL 3: EMPLOYEE */}
              {userType === 'Employee' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Employee Assignment Details</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Assigned BU */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Business Unit (BU)</label>
                      <input 
                        type="text" required value={empBu} onChange={(e) => setEmpBu(e.target.value)}
                        placeholder="e.g. Enterprise Software BU"
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* Assigned Project */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Assigned Project</label>
                      <input 
                        type="text" required value={empProject} onChange={(e) => setEmpProject(e.target.value)}
                        placeholder="e.g. Project Pulse"
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* Project Manager */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Respected Project Manager</label>
                      <input 
                        type="text" required value={empManager} onChange={(e) => setEmpManager(e.target.value)}
                        placeholder="e.g. Arthur Pendragon"
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Form Actions Footer */}
            <div className="border-t border-slate-800 pt-6 flex justify-end gap-3">
              <button 
                type="button" onClick={() => setIsAddUserOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-6 py-3 border border-slate-700/50 cursor-pointer active:scale-98 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="bg-primary hover:bg-blue-600 text-white text-xs font-semibold rounded-lg px-8 py-3 shadow-lg active:scale-98 transition-all cursor-pointer"
              >
                Register User Profile
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in duration-300">
          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-white uppercase tracking-wider">User Directory</h2>
              <p className="text-xs text-slate-500 mt-1">All platform users grouped by their business unit and role.</p>
            </div>
            <div className="flex items-center gap-3 relative max-w-lg w-full md:justify-end">
              <div className="relative w-full max-w-sm">
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search by name, role, BU..."
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-xl py-2.5 pl-4 pr-10 focus:outline-none focus:border-primary/50 placeholder-slate-500 font-semibold"
                />
              </div>
              {user?.role === 'Admin' && (
                <button
                  onClick={() => {
                    setUserType('Employee');
                    setPosition('');
                    setDepartment('');
                    setReportingTo('');
                    setIsAddUserOpen(true);
                  }}
                  className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white active:scale-98 transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add User
                </button>
              )}
            </div>
          </div>

          {/* User Groups */}
          {usersLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (() => {
            const q = clientSearch.toLowerCase();
            const filtered = usersList.filter(u =>
              !q ||
              (u.name || '').toLowerCase().includes(q) ||
              (u.email || '').toLowerCase().includes(q) ||
              (u.position || '').toLowerCase().includes(q) ||
              (u.userType || u.role || '').toLowerCase().includes(q) ||
              (u.bu || '').toLowerCase().includes(q) ||
              (u.department || '').toLowerCase().includes(q)
            );

            // Role order for sorting within a group
            const roleOrder = ['CEO','Admin','Functional Head','BU Head','Delivery Head','Delivery Manager','Project Manager','Sales Manager','Account Manager','Employee'];
            const sortUsers = (arr) => [...arr].sort((a,b) => {
              const ra = roleOrder.indexOf(a.userType || a.role) === -1 ? 99 : roleOrder.indexOf(a.userType || a.role);
              const rb = roleOrder.indexOf(b.userType || b.role) === -1 ? 99 : roleOrder.indexOf(b.userType || b.role);
              return ra - rb || (a.name||'').localeCompare(b.name||'');
            });

            // Leadership: CEO, Admin, Functional Heads (no BU)
            const leadership = filtered.filter(u => {
              const type = u.userType || u.role;
              return ['CEO','Admin','Functional Head'].includes(type);
            });

            // Group everyone else by BU
            const buMap = {};
            filtered.forEach(u => {
              const type = u.userType || u.role;
              if (['CEO','Admin','Functional Head'].includes(type)) return;
              const bu = u.bu || u.department || 'Unassigned';
              if (!buMap[bu]) buMap[bu] = [];
              buMap[bu].push(u);
            });

            const buEntries = Object.entries(buMap).sort(([a],[b]) => a.localeCompare(b));

            const RoleChip = ({ type }) => {
              const colors = {
                CEO: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
                Admin: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                'Functional Head': 'bg-slate-500/15 text-slate-400 border-slate-600/30',
                'BU Head': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                'Delivery Head': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                'Delivery Manager': 'bg-teal-500/15 text-teal-400 border-teal-500/30',
                'Project Manager': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                'Sales Manager': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
                'Account Manager': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                Employee: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
              };
              const cls = colors[type] || 'bg-slate-500/10 text-slate-400 border-slate-600/20';
              return (
                <span className={`text-[10px] font-black uppercase tracking-wider border px-1.5 py-0.5 rounded-md ${cls}`}>
                  {type}
                </span>
              );
            };

            const UserCard = ({ u }) => {
              const isMe = user && user.email?.toLowerCase() === u.email?.toLowerCase();
              const initials = u.name ? u.name.substring(0,2).toUpperCase() : 'US';
              const type = u.userType || u.role;
              return (
                <div className={`glass border ${isMe ? 'border-primary/60 ring-1 ring-primary/30' : 'border-slate-700/50'} rounded-xl p-3 flex items-center gap-3 relative hover:border-slate-600/70 transition-all group`}>
                  {isMe && (
                    <span className="absolute top-0 left-0 bg-primary text-white text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-br-lg rounded-tl-xl">You</span>
                  )}
                  <div className="bg-primary/10 border border-primary/20 text-primary w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-extrabold text-white text-xs truncate">{u.name}</span>
                      {(user?.role === 'Admin') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.uid || u.id, u.name)}
                          className="shrink-0 text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 block truncate">{u.email}</span>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <RoleChip type={type} />
                      {u.position && u.position !== type && (
                        <span className="text-[10px] text-slate-500 italic truncate">{u.position}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-5">
                {/* Leadership Section */}
                {leadership.length > 0 && (
                  <div className="glass rounded-2xl border border-slate-800/60 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"></span>
                      <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">Leadership & Administration</h3>
                      <span className="ml-auto text-[10px] font-bold text-slate-600 bg-slate-800/60 px-2 py-0.5 rounded-full">{leadership.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {sortUsers(leadership).map(u => <UserCard key={u.uid||u.id} u={u} />)}
                    </div>
                  </div>
                )}

                {/* BU Groups */}
                {buEntries.map(([bu, members]) => {
                  const buHeads = members.filter(u => ['BU Head','Delivery Head'].includes(u.userType||u.role));
                  const managers = members.filter(u => ['Project Manager','Delivery Manager','Sales Manager','Account Manager'].includes(u.userType||u.role));
                  const employees = members.filter(u => !['BU Head','Delivery Head','Project Manager','Delivery Manager','Sales Manager','Account Manager'].includes(u.userType||u.role));

                  const buColors = {
                    head: 'bg-amber-400',
                    border: 'border-amber-500/20',
                    label: 'text-amber-400',
                  };

                  return (
                    <div key={bu} className="glass rounded-2xl border border-slate-800/60 p-5 space-y-4">
                      {/* BU Header */}
                      <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60">
                        <span className={`w-2 h-2 rounded-full ${buColors.head} shrink-0`}></span>
                        <h3 className={`text-xs font-black uppercase tracking-widest ${buColors.label}`}>{bu}</h3>
                        <span className="ml-auto text-[10px] font-bold text-slate-600 bg-slate-800/60 px-2 py-0.5 rounded-full">{members.length} members</span>
                      </div>

                      {/* BU / Delivery Heads */}
                      {buHeads.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Unit Heads</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {sortUsers(buHeads).map(u => <UserCard key={u.uid||u.id} u={u} />)}
                          </div>
                        </div>
                      )}

                      {/* Managers */}
                      {managers.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Managers</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {sortUsers(managers).map(u => <UserCard key={u.uid||u.id} u={u} />)}
                          </div>
                        </div>
                      )}

                      {/* Employees */}
                      {employees.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Employees</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {sortUsers(employees).map(u => <UserCard key={u.uid||u.id} u={u} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="glass rounded-2xl border border-slate-800/60 p-12 text-center">
                    <p className="text-sm text-slate-500 font-semibold">No users found matching "{clientSearch}"</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {/* ========================================================
          DELETE USER CONFIRMATION MODAL
          ======================================================== */}
      {userToDelete && (
        <div className="fixed inset-0 bg-dark-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-sm w-full rounded-2xl p-6 border border-slate-800 shadow-2xl text-center space-y-4">
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Delete User Account</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Are you sure you want to permanently delete the user <strong className="text-white">{userToDelete.name}</strong>? This action cannot be undone.
              </p>
            </div>
            
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setUserToDelete(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 text-xs font-semibold rounded-lg py-2.5 border border-slate-700/50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteUser}
                className="w-full bg-rose-550 hover:bg-rose-600 active:scale-98 text-white text-xs font-semibold rounded-lg py-2.5 shadow-lg shadow-rose-500/10 transition-all cursor-pointer"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
