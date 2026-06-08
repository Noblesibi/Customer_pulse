import React, { useEffect, useState } from 'react';
import { 
  Users as UsersIcon, Shield, Mail, Calendar, Key, Plus, X, Lock, 
  User, Briefcase, Trash2, ArrowLeft, PlusCircle, MinusCircle, Upload, CheckCircle2,
  ChevronDown, ChevronRight, FolderOpen, Folder, UserCheck, Building2, GitBranch
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Users() {
  const { usersList, usersLoading, fetchUsersList, addUser, user, deleteUser } = useStore();

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  
  // Base fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState('Employee');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [reportingTo, setReportingTo] = useState('');

  // BU Head fields
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

  useEffect(() => {
    fetchUsersList();
  }, []);

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

    if (userType === 'BU Head') {
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
    } else if (userType === 'Project Manager') {
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
    <div className="space-y-6 select-none animate-soft-pulse duration-1000">
      
      {/* --------------------------------------------------------
          VIEW 1: REGISTRATION DYNAMIC FORM
          -------------------------------------------------------- */}
      {isAddUserOpen ? (
        <div className="glass p-6 md:p-8 rounded-2xl border border-slate-800/80 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <button 
              onClick={() => setIsAddUserOpen(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5 cursor-pointer bg-slate-100 px-3.5 py-2 rounded-lg border border-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Directory
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
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Full Name</label>
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
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Corporate Email</label>
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
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Account Password</label>
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
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Department</label>
                  <input 
                    type="text" required value={department} onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering, Sales, Human Resources"
                    className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                  />
                </div>

                {/* Position */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Position</label>
                  <input 
                    type="text" required value={position} onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. Lead Developer, BU Director, Executive Associate"
                    className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                  />
                </div>

                {/* User Type Select */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">User Type (Access Level)</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <select 
                      value={userType} onChange={(e) => setUserType(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 pl-10 pr-4 focus:outline-none cursor-pointer"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Project Manager">Project Manager</option>
                      <option value="BU Head">BU Head</option>
                      <option value="CEO">CEO</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                </div>

                {/* Reporting To (Global Field) */}
                {userType !== 'CEO' && userType !== 'Admin' && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Reporting To (Manager / Lead)</label>
                    <input 
                      type="text" required value={reportingTo} onChange={(e) => setReportingTo(e.target.value)}
                      placeholder="e.g. Jonathan Stark (CEO), Arthur Pendragon (Admin)"
                      className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* --------------------------------------------------------
                CONDITIONAL DYNAMIC PANELS
                -------------------------------------------------------- */}
            <div className="border-t border-slate-800/80 pt-6 space-y-6">
              
              {/* PANEL 1: BU HEAD */}
              {userType === 'BU Head' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Business Unit (BU Head) Details</h4>
                  </div>

                  {/* Projects Configuration Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Projects Mode</label>
                    <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                      <button 
                        type="button" onClick={() => setBuProjectsMode('manual')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${buProjectsMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                      >
                        Manual Configuration
                      </button>
                      <button 
                        type="button" onClick={() => setBuProjectsMode('excel')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${buProjectsMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
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
                            <span className="text-[10px] text-slate-500">{buProjectsExcelFile.name}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-400" />
                            <span className="text-xs font-bold text-slate-300">Drag & drop projects spreadsheet (.xlsx) here</span>
                            <span className="text-[10px] text-slate-400">or click to browse local files</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Configure Projects & Teams under BU</label>
                        <button 
                          type="button" onClick={handleAddBuProject}
                          className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Add Project Section
                        </button>
                      </div>

                      {buProjects.map((proj, projIdx) => (
                        <div key={projIdx} className="bg-dark-900/40 border border-slate-700 rounded-xl p-4 space-y-4 shadow-sm relative">
                          {buProjects.length > 1 && (
                            <button 
                              type="button" onClick={() => handleRemoveBuProject(projIdx)}
                              className="absolute top-4 right-4 text-rose-400 hover:text-rose-300 cursor-pointer flex items-center gap-1 text-[10px] font-bold bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20"
                            >
                              <X className="w-3.5 h-3.5" /> Remove Project
                            </button>
                          )}

                          {/* Project Name */}
                          <div className="space-y-1.5 max-w-md">
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Project Name</label>
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
                                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Employees Working on this Project</label>
                                <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                                  <button 
                                    type="button" onClick={() => handleBuProjectFieldChange(projIdx, 'employeesMode', 'manual')}
                                    className={`px-2 py-1 rounded-md text-[9px] font-bold cursor-pointer ${proj.employeesMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                  >
                                    Manual
                                  </button>
                                  <button 
                                    type="button" onClick={() => handleBuProjectFieldChange(projIdx, 'employeesMode', 'excel')}
                                    className={`px-2 py-1 rounded-md text-[9px] font-bold cursor-pointer ${proj.employeesMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
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
                                        <span className="text-[10px] font-bold text-white">Employees File Loaded!</span>
                                        <span className="text-[8px] text-slate-500">{proj.excelFileEmployees.name}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="w-5 h-5 text-slate-400" />
                                        <span className="text-[10px] font-semibold text-slate-400">Upload Roster Excel list</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex justify-end">
                                    <button 
                                      type="button" onClick={() => handleAddBuProjectEmployee(projIdx)}
                                      className="text-[9px] text-primary hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
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

              {/* PANEL 2: PROJECT MANAGER */}
              {userType === 'Project Manager' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Project Manager Details</h4>
                  </div>

                  {/* Under which BU */}
                  <div className="space-y-1.5 max-w-md">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Under Which BU (Business Unit)</label>
                    <input 
                      type="text" required value={pmBu} onChange={(e) => setPmBu(e.target.value)}
                      placeholder="e.g. Enterprise Software BU, EMEA Operations BU"
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {/* Projects Configuration Toggle */}
                  <div className="flex items-center justify-between pt-2">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Projects Managed Mode</label>
                    <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                      <button 
                        type="button" onClick={() => setPmProjectsMode('manual')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${pmProjectsMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                      >
                        Manual Configuration
                      </button>
                      <button 
                        type="button" onClick={() => setPmProjectsMode('excel')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${pmProjectsMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
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
                            <span className="text-[10px] text-slate-500">{pmProjectsExcelFile.name}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-400" />
                            <span className="text-xs font-bold text-slate-300">Drag & drop projects spreadsheet (.xlsx) here</span>
                            <span className="text-[10px] text-slate-400">or click to browse local files</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Configure Projects Managed</label>
                        <button 
                          type="button" onClick={handleAddPmProject}
                          className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Add Project Section
                        </button>
                      </div>

                      {pmProjects.map((proj, projIdx) => (
                        <div key={projIdx} className="bg-dark-900/40 border border-slate-700 rounded-xl p-4 space-y-4 shadow-sm relative">
                          {pmProjects.length > 1 && (
                            <button 
                              type="button" onClick={() => handleRemovePmProject(projIdx)}
                              className="absolute top-4 right-4 text-rose-400 hover:text-rose-300 cursor-pointer flex items-center gap-1 text-[10px] font-bold bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20"
                            >
                              <X className="w-3.5 h-3.5" /> Remove Project
                            </button>
                          )}

                          {/* Project Name */}
                          <div className="space-y-1.5 max-w-md">
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Project Name</label>
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
                                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Employees Working on this Project</label>
                                <div className="bg-dark-900/60 p-0.5 rounded-lg border border-slate-700 flex">
                                  <button 
                                    type="button" onClick={() => handlePmProjectFieldChange(projIdx, 'employeesMode', 'manual')}
                                    className={`px-2 py-1 rounded-md text-[9px] font-bold cursor-pointer ${proj.employeesMode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                  >
                                    Manual
                                  </button>
                                  <button 
                                    type="button" onClick={() => handlePmProjectFieldChange(projIdx, 'employeesMode', 'excel')}
                                    className={`px-2 py-1 rounded-md text-[9px] font-bold cursor-pointer ${proj.employeesMode === 'excel' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
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
                                        <span className="text-[10px] font-bold text-white">Employees File Loaded!</span>
                                        <span className="text-[8px] text-slate-500">{proj.excelFileEmployees.name}</span>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="w-5 h-5 text-slate-400" />
                                        <span className="text-[10px] font-semibold text-slate-400">Upload Roster Excel list</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex justify-end">
                                    <button 
                                      type="button" onClick={() => handleAddPmProjectEmployee(projIdx)}
                                      className="text-[9px] text-primary hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
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
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Business Unit (BU)</label>
                      <input 
                        type="text" required value={empBu} onChange={(e) => setEmpBu(e.target.value)}
                        placeholder="e.g. Enterprise Software BU"
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* Assigned Project */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Assigned Project</label>
                      <input 
                        type="text" required value={empProject} onChange={(e) => setEmpProject(e.target.value)}
                        placeholder="e.g. Project Pulse"
                        className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg py-3 px-4 focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* Project Manager */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Respected Project Manager</label>
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
        /* --------------------------------------------------------
            VIEW 2: DIRECTORY LIST TABLE
            -------------------------------------------------------- */
        <>
          {/* Page Header */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2.5 rounded-xl border border-primary/40 text-primary">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">User Management</h2>
                <p className="text-xs text-slate-400 mt-0.5">Review registered team members and organizational roles</p>
              </div>
            </div>
            
            <button 
              onClick={() => setIsAddUserOpen(true)}
              className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white active:scale-98 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>

          {/* Directory Table */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80">
            {usersLoading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : usersList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No registered users found in the system
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800/60 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-dark-900/40 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="p-4">Name</th>
                      <th className="p-4">Email Address</th>
                      <th className="p-4">User Type</th>
                      <th className="p-4">Registered Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {usersList.map(u => {
                      const isExpanded = expandedUsers[u.uid || u.id];
                      const expandable = hasExpandableContent(u);
                      return (
                        <React.Fragment key={u.uid || u.id}>
                          <tr 
                            className={`transition-colors ${expandable ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'}`}
                            onClick={() => expandable && toggleUserExpand(u.uid || u.id)}
                          >
                            {/* User Name */}
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                {expandable ? (
                                  <div className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                                    <ChevronDown className="w-4 h-4" />
                                  </div>
                                ) : (
                                  <div className="w-4" />
                                )}
                                <div className="bg-primary/10 border border-primary/20 text-primary w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs">
                                  {u.name ? u.name.substring(0, 2).toUpperCase() : 'US'}
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-white text-sm">{u.name}</span>
                                  {u.department && <span className="text-[10px] text-slate-500">{u.department}</span>}
                                </div>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="p-4 text-slate-300">
                              <div className="flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                <span>{u.email}</span>
                              </div>
                            </td>

                            {/* Role / User Type */}
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full border ${getUserTypeBadgeColor(u.userType || u.role)}`}>
                                <Shield className="w-3 h-3" />
                                {u.userType || u.role}
                              </span>
                            </td>

                            {/* Registered Date */}
                            <td className="p-4 text-slate-400">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                                <span>{new Date(u.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</span>
                              </div>
                            </td>

                            {/* Actions Column */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                {expandable && (
                                  <span className="text-[10px] text-slate-500 font-medium mr-1">
                                    {u.projects?.filter(p => p.name)?.length || (u.project ? 1 : 0)} project{(u.projects?.filter(p => p.name)?.length || (u.project ? 1 : 0)) !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {user && user.uid !== u.uid && (
                                  <button
                                    onClick={() => handleDeleteUser(u.uid, u.name)}
                                    className="text-rose-555 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1 font-semibold"
                                    title="Delete User"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Row: Projects & Employees Hierarchy */}
                          {isExpanded && expandable && (
                            <tr className="bg-gradient-to-b from-slate-800/20 to-transparent">
                              <td colSpan={5} className="p-0">
                                <div className="px-6 py-4 ml-8 border-l-2 border-primary/30 space-y-3 animate-soft-pulse">
                                  
                                  {/* BU + Reporting Info Bar */}
                                  {(u.bu || u.reportingTo) && (
                                    <div className="flex items-center gap-4 text-[10px] text-slate-400 pb-2 border-b border-slate-800/50">
                                      {u.bu && (
                                        <span className="flex items-center gap-1.5">
                                          <Building2 className="w-3.5 h-3.5 text-amber-500/70" />
                                          <span className="text-slate-500 font-semibold">BU:</span>
                                          <span className="text-slate-300 font-medium">{u.bu}</span>
                                        </span>
                                      )}
                                      {u.reportingTo && (
                                        <span className="flex items-center gap-1.5">
                                          <GitBranch className="w-3.5 h-3.5 text-cyan-500/70" />
                                          <span className="text-slate-500 font-semibold">Reports to:</span>
                                          <span className="text-slate-300 font-medium">{u.reportingTo}</span>
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* For BU Head / Project Manager: multiple projects with employees */}
                                  {u.projects && u.projects.length > 0 && u.projects.some(p => p.name) && (
                                    <div className="space-y-3">
                                      {u.projects.filter(p => p.name).map((proj, pIdx) => (
                                        <div key={pIdx} className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 space-y-3">
                                          {/* Project Header */}
                                          <div className="flex items-center gap-2.5">
                                            <div className="bg-violet-500/10 border border-violet-500/20 p-1.5 rounded-lg">
                                              <FolderOpen className="w-4 h-4 text-violet-400" />
                                            </div>
                                            <div>
                                              <span className="text-xs font-bold text-white">{proj.name}</span>
                                              <div className="flex items-center gap-3 mt-0.5">
                                                {proj.projectManagers && proj.projectManagers.length > 0 && (
                                                  <span className="text-[9px] text-slate-500">
                                                    {proj.projectManagers.length} PM{proj.projectManagers.length !== 1 ? 's' : ''}
                                                  </span>
                                                )}
                                                {proj.employees && proj.employees.length > 0 && (
                                                  <span className="text-[9px] text-slate-500">
                                                    {proj.employees.length} employee{proj.employees.length !== 1 ? 's' : ''}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Project Managers List */}
                                          {proj.projectManagers && proj.projectManagers.length > 0 && proj.projectManagers.some(Boolean) && (
                                            <div className="ml-4 space-y-1.5">
                                              <span className="text-[9px] text-purple-400/80 uppercase tracking-wider font-bold">Project Managers</span>
                                              <div className="flex flex-wrap gap-2">
                                                {proj.projectManagers.filter(Boolean).map((pm, pmIdx) => (
                                                  <div key={pmIdx} className="flex items-center gap-1.5 bg-purple-500/8 border border-purple-500/15 rounded-lg px-2.5 py-1.5">
                                                    <div className="bg-purple-500/20 w-5 h-5 rounded-md flex items-center justify-center">
                                                      <UserCheck className="w-3 h-3 text-purple-400" />
                                                    </div>
                                                    <span className="text-[11px] text-purple-200 font-medium">{pm}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* Employees List */}
                                          {proj.employees && proj.employees.length > 0 && proj.employees.some(Boolean) && (
                                            <div className="ml-4 space-y-1.5">
                                              <span className="text-[9px] text-blue-400/80 uppercase tracking-wider font-bold">Employees</span>
                                              <div className="flex flex-wrap gap-2">
                                                {proj.employees.filter(Boolean).map((emp, eIdx) => (
                                                  <div key={eIdx} className="flex items-center gap-1.5 bg-blue-500/8 border border-blue-500/15 rounded-lg px-2.5 py-1.5">
                                                    <div className="bg-blue-500/20 w-5 h-5 rounded-md flex items-center justify-center">
                                                      <User className="w-3 h-3 text-blue-400" />
                                                    </div>
                                                    <span className="text-[11px] text-blue-200 font-medium">{emp}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* For Employee type: single project + PM assignment */}
                                  {u.userType === 'Employee' && u.project && (
                                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 space-y-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className="bg-blue-500/10 border border-blue-500/20 p-1.5 rounded-lg">
                                          <Folder className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                          <span className="text-xs font-bold text-white">{u.project}</span>
                                          <span className="text-[9px] text-slate-500 ml-2">Assigned Project</span>
                                        </div>
                                      </div>
                                      {u.projectManagers && u.projectManagers.length > 0 && u.projectManagers.some(Boolean) && (
                                        <div className="ml-4 space-y-1.5">
                                          <span className="text-[9px] text-purple-400/80 uppercase tracking-wider font-bold">Project Manager</span>
                                          <div className="flex flex-wrap gap-2">
                                            {u.projectManagers.filter(Boolean).map((pm, pmIdx) => (
                                              <div key={pmIdx} className="flex items-center gap-1.5 bg-purple-500/8 border border-purple-500/15 rounded-lg px-2.5 py-1.5">
                                                <div className="bg-purple-500/20 w-5 h-5 rounded-md flex items-center justify-center">
                                                  <UserCheck className="w-3 h-3 text-purple-400" />
                                                </div>
                                                <span className="text-[11px] text-purple-200 font-medium">{pm}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
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
