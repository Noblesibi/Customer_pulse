import React, { useState, useEffect } from 'react';
import { Building2, UserPlus, ArrowRight, ArrowLeft, ChevronLeft } from 'lucide-react';
import { useStore } from '../store/index.js';
import { useNavigate, useParams } from 'react-router-dom';

export default function EditAccount() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { token, updateAccount } = useStore();

  // Company Information
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Technology');
  const [region, setRegion] = useState('North America');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ceoName, setCeoName] = useState('');
  const [domain, setDomain] = useState('Aerospace and Defence');

  // Stakeholder Details (Hierarchical Projects)
  const [projects, setProjects] = useState([
    {
      projectName: '',
      projectIndustry: '',
      projectType: 'Development',
      employees: [
        {
          name: '',
          email: '',
          phone: '',
          position: '',
          department: '',
          hierarchyTag: 'Staff',
          influenceTag: 'Observer'
        }
      ]
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const industries = ['Technology', 'Finance', 'Logistics', 'Healthcare', 'Manufacturing', 'Retail'];
  const regions = ['USA', 'UK', 'Germany', 'Singapore', 'India', 'UAE'];
  const nestBus = [
    'Aerospace and Defence',
    'Banking & Financial Service (BFS)',
    'Healthcare',
    'Insurance',
    'Locomotive',
    'Industrial',
    'Automotive',
    'Logistics & Supply Chain'
  ];
  const projectTypes = [
    'Development',
    'Support & Maintenance',
    'Testing & QA',
    'Consulting',
    'R&D',
    'Implementation'
  ];

  // Fetch account and contact details on load
  useEffect(() => {
    const fetchAccountData = async () => {
      if (!token || !id) return;
      try {
        setIsLoading(true);
        // Fetch account profile
        const accRes = await fetch(`http://localhost:5000/api/accounts/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!accRes.ok) {
          throw new Error('Failed to fetch account info');
        }
        const accData = await accRes.json();
        
        setCompanyName(accData.companyName || '');
        setIndustry(accData.industry || 'Technology');
        setRegion(accData.region || 'North America');
        setEmail(accData.email || '');
        setPhone(accData.phone || '');
        setCeoName(accData.ceoName || '');
        setDomain(accData.domain || '');

        // Fetch contacts
        const conRes = await fetch(`http://localhost:5000/api/contacts?accountId=${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (conRes.ok) {
          const conData = await conRes.json();
          // Group contacts by project
          const projectMap = {};
          
          conData.forEach(c => {
            const pName = c.projectName || '';
            const pInd = c.projectIndustry || '';
            const pType = c.projectType || 'Development';
            const key = `${pName}::${pInd}::${pType}`;
            
            if (!projectMap[key]) {
              projectMap[key] = {
                projectName: pName,
                projectIndustry: pInd,
                projectType: pType,
                employees: []
              };
            }
            projectMap[key].employees.push({
              contactId: c.contactId, // Retain ID for smart backend updates
              name: c.name || '',
              email: c.email || '',
              phone: c.phone || '',
              position: c.designation || '',
              department: c.department || '',
              hierarchyTag: c.hierarchyTag || 'Staff',
              influenceTag: c.influenceTag || 'Observer'
            });
          });

          const groupedProjects = Object.values(projectMap);
          if (groupedProjects.length > 0) {
            setProjects(groupedProjects);
          }
        }
      } catch (err) {
        console.error('Error loading account data:', err);
        alert('Failed to load client profile data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountData();
  }, [id, token]);

  const addProject = () => {
    setProjects([...projects, {
      projectName: '',
      projectIndustry: '',
      projectType: 'Development',
      employees: [
        {
          name: '',
          email: '',
          phone: '',
          position: '',
          department: '',
          hierarchyTag: 'Staff',
          influenceTag: 'Observer'
        }
      ]
    }]);
  };

  const removeProject = (pIndex) => {
    setProjects(projects.filter((_, i) => i !== pIndex));
  };

  const updateProjectField = (pIndex, field, value) => {
    const newProjects = [...projects];
    newProjects[pIndex][field] = value;
    setProjects(newProjects);
  };

  const addEmployee = (pIndex) => {
    const newProjects = [...projects];
    newProjects[pIndex].employees.push({
      name: '',
      email: '',
      phone: '',
      position: '',
      department: '',
      hierarchyTag: 'Staff',
      influenceTag: 'Observer'
    });
    setProjects(newProjects);
  };

  const removeEmployee = (pIndex, eIndex) => {
    const newProjects = [...projects];
    newProjects[pIndex].employees = newProjects[pIndex].employees.filter((_, i) => i !== eIndex);
    setProjects(newProjects);
  };

  const updateEmployeeField = (pIndex, eIndex, field, value) => {
    const newProjects = [...projects];
    newProjects[pIndex].employees[eIndex][field] = value;
    setProjects(newProjects);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Flatten projects -> employees into flat contacts list
    const flatContacts = [];
    projects.forEach(proj => {
      proj.employees.forEach(emp => {
        flatContacts.push({
          contactId: emp.contactId || null,
          name: emp.name,
          email: emp.email,
          phone: emp.phone,
          position: emp.position,
          department: emp.department,
          projectName: proj.projectName,
          projectIndustry: proj.projectIndustry,
          projectType: proj.projectType || 'Development',
          hierarchyTag: emp.hierarchyTag,
          influenceTag: emp.influenceTag
        });
      });
    });

    const success = await updateAccount(id, {
      companyName,
      industry,
      region,
      email,
      phone,
      ceoName,
      domain,
      contacts: flatContacts
    });

    setIsSubmitting(false);

    if (success) {
      navigate('/accounts');
    } else {
      const errorMsg = useStore.getState().accountsError || "Failed to update account. Please try again.";
      alert(errorMsg);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 h-auto animate-soft-pulse duration-1000">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1.5 cursor-pointer text-black hover:bg-dark-700 transition-colors font-bold text-base px-3.5 py-1.5 rounded-full"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Building2 className="w-6 h-6 text-primary" />
            Edit Client Profile
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Section 1: Corporate Profile */}
        <div className="glass p-8 rounded-2xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
          
          <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
            <span className="w-6 h-px bg-primary/50"></span>
            Corporate Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">Company Name *</label>
              <input 
                type="text" 
                required
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="e.g. Acme Corporation"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">CEO Name</label>
              <input 
                type="text" 
                value={ceoName}
                onChange={e => setCeoName(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="e.g. Jane Doe"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">General Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="contact@acme.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">Corporate Phone</label>
              <input 
                type="text" 
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">Industry</label>
              <select 
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none cursor-pointer transition-colors appearance-none"
              >
                {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">Location</label>
              <select 
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none cursor-pointer transition-colors appearance-none"
              >
                {regions.map(reg => <option key={reg} value={reg}>{reg}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">NeST BU</label>
              <select 
                value={domain}
                onChange={e => setDomain(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none cursor-pointer transition-colors appearance-none"
              >
                {nestBus.map(bu => <option key={bu} value={bu}>{bu}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Projects & Stakeholders */}
        <div className="glass p-8 rounded-2xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none"></div>

          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                <span className="w-6 h-px bg-blue-500/50"></span>
                Projects & Stakeholders
              </h2>
              <p className="text-xs text-slate-500">Details of the projects we are running and the employees related to each project.</p>
            </div>
            <button 
              type="button"
              onClick={addProject}
              className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-blue-500/20 hover:border-blue-500/50"
            >
              <Building2 className="w-4 h-4" />
              Add Project
            </button>
          </div>

          <div className="space-y-8">
            {projects.map((project, pIndex) => (
              <div key={pIndex} className="relative bg-dark-950/40 p-6 rounded-xl border border-slate-800/50 space-y-6">
                
                {/* Remove Project Button */}
                {projects.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => removeProject(pIndex)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors text-xs font-bold uppercase"
                  >
                    Remove Project
                  </button>
                )}
                
                <h3 className="text-xs font-bold text-slate-400 mb-2">Project {pIndex + 1}</h3>

                {/* Project level inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-4 border-b border-slate-800/40">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Name</label>
                    <input 
                      type="text" 
                      value={project.projectName}
                      onChange={e => updateProjectField(pIndex, 'projectName', e.target.value)}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="e.g. Acme Migration Platform"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Description</label>
                    <input 
                      type="text" 
                      value={project.projectIndustry}
                      onChange={e => updateProjectField(pIndex, 'projectIndustry', e.target.value)}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="e.g. Migration of critical database services"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 uppercase font-semibold">Project Type</label>
                    <select
                      value={project.projectType || 'Development'}
                      onChange={e => updateProjectField(pIndex, 'projectType', e.target.value)}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none cursor-pointer transition-colors appearance-none"
                    >
                      {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                {/* Employees sub-section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-blue-400/80 uppercase tracking-wide">Project Employees ({project.employees.length})</h4>
                    <button 
                      type="button"
                      onClick={() => addEmployee(pIndex)}
                      className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-all border border-blue-500/20 hover:border-blue-500/50 flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add Employee
                    </button>
                  </div>

                  <div className="space-y-4">
                    {project.employees.map((employee, eIndex) => (
                      <div key={eIndex} className="relative bg-dark-950/60 p-4 rounded-lg border border-slate-850 space-y-4">
                        
                        {/* Remove Employee Button */}
                        {project.employees.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeEmployee(pIndex, eIndex)}
                            className="absolute top-3 right-3 text-slate-655 hover:text-red-400 transition-colors text-xs font-bold uppercase"
                          >
                            Remove Employee
                          </button>
                        )}

                        <span className="text-xs font-bold text-slate-500">Employee {eIndex + 1}</span>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Employee Name</label>
                            <input 
                              type="text" 
                              required
                              value={employee.name}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'name', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none transition-colors"
                              placeholder="e.g. John Smith"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Position / Role</label>
                            <input 
                              type="text" 
                              value={employee.position}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'position', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none transition-colors"
                              placeholder="e.g. VP of Operations"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Direct Email</label>
                            <input 
                              type="email" 
                              value={employee.email}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'email', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none transition-colors"
                              placeholder="john.smith@acme.com"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Direct Phone</label>
                            <input 
                              type="text" 
                              value={employee.phone}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'phone', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none transition-colors"
                              placeholder="+1 (555) 111-2222"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Department</label>
                            <input 
                              type="text" 
                              value={employee.department}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'department', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none transition-colors"
                              placeholder="e.g. Engineering, Sales"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Hierarchy Tag</label>
                            <select
                              value={employee.hierarchyTag || 'Staff'}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'hierarchyTag', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none cursor-pointer transition-colors"
                            >
                              <option value="CXO">CXO</option>
                              <option value="VP">VP</option>
                              <option value="Director">Director</option>
                              <option value="Manager">Manager</option>
                              <option value="Staff">Staff</option>
                            </select>
                          </div>

                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs text-slate-400 uppercase font-semibold">Influence Tag</label>
                            <select
                              value={employee.influenceTag || 'Observer'}
                              onChange={e => updateEmployeeField(pIndex, eIndex, 'influenceTag', e.target.value)}
                              className="w-full bg-dark-950/40 border border-slate-800 focus:border-blue-500/50 text-xs text-white rounded-lg p-2.5 focus:outline-none cursor-pointer transition-colors"
                            >
                              <option value="Decision Maker">Decision Maker</option>
                              <option value="Influencer">Influencer</option>
                              <option value="Champion">Champion</option>
                              <option value="Gatekeeper">Gatekeeper</option>
                              <option value="Observer">Observer</option>
                            </select>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Influence Glossary/Guide Section */}
          <div className="mt-8 pt-6 border-t border-slate-800/60 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stakeholder Influence Tags Guide</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-dark-950/30 p-3 rounded-xl border border-slate-850 space-y-1">
                <span className="text-xs font-black uppercase text-primary tracking-wide">Decision Maker</span>
                <p className="text-xs text-slate-400 leading-normal">Final sign-off authority for budget, contracts, and renewals.</p>
              </div>
              <div className="bg-dark-950/30 p-3 rounded-xl border border-slate-850 space-y-1">
                <span className="text-xs font-black uppercase text-indigo-400 tracking-wide">Influencer</span>
                <p className="text-xs text-slate-400 leading-normal">Shapes technical standards and vendor evaluations.</p>
              </div>
              <div className="bg-dark-950/30 p-3 rounded-xl border border-slate-850 space-y-1">
                <span className="text-xs font-black uppercase text-emerald-400 tracking-wide">Champion</span>
                <p className="text-xs text-slate-400 leading-normal">Advocates for our platform and drives internal adoption.</p>
              </div>
              <div className="bg-dark-950/30 p-3 rounded-xl border border-slate-850 space-y-1">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wide">Gatekeeper</span>
                <p className="text-xs text-slate-400 leading-normal">Controls access to decision makers and critical data.</p>
              </div>
              <div className="bg-dark-950/30 p-3 rounded-xl border border-slate-850 space-y-1">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wide">Observer</span>
                <p className="text-xs text-slate-400 leading-normal">Monitors relationship with minimal transaction influence.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4 pt-4 pb-12">
          <button 
            type="button"
            onClick={() => navigate('/accounts')}
            className="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-primary hover:bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-70"
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                Save Changes
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
