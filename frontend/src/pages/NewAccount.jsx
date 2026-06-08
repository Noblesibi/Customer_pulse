import React, { useState } from 'react';
import { Building2, UserPlus, ArrowRight, ArrowLeft } from 'lucide-react';
import { useStore } from '../store/index.js';
import { useNavigate } from 'react-router-dom';

export default function NewAccount() {
  const navigate = useNavigate();
  const { addAccount } = useStore();

  // Company Information
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Technology');
  const [region, setRegion] = useState('North America');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ceoName, setCeoName] = useState('');

  // Stakeholder Details
  const [contacts, setContacts] = useState([{
    name: '',
    email: '',
    phone: '',
    position: '',
    department: '',
    projects: ''
  }]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const industries = ['Technology', 'Finance', 'Logistics', 'Healthcare', 'Manufacturing', 'Retail'];
  const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const success = await addAccount({
      companyName,
      industry,
      region,
      email,
      phone,
      ceoName,
      contacts
    });

    setIsSubmitting(false);

    if (success) {
      navigate('/accounts');
    } else {
      alert("Failed to create account. Please try again.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 h-[calc(100vh-10rem)] overflow-y-auto animate-soft-pulse duration-1000">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate('/accounts')}
          className="p-2 rounded-xl bg-dark-900/40 border border-slate-800 hover:bg-slate-800/60 text-slate-400 hover:text-white transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Building2 className="w-6 h-6 text-primary" />
            Create New Client Account
          </h1>
          <p className="text-xs text-slate-400 mt-1">Complete the corporate profile and assign the primary stakeholder relationship.</p>
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
              <label className="text-[10px] text-slate-400 uppercase font-semibold">Company Name *</label>
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
              <label className="text-[10px] text-slate-400 uppercase font-semibold">CEO Name</label>
              <input 
                type="text" 
                value={ceoName}
                onChange={e => setCeoName(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="e.g. Jane Doe"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 uppercase font-semibold">General Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="contact@acme.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 uppercase font-semibold">Corporate Phone</label>
              <input 
                type="text" 
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 uppercase font-semibold">Industry</label>
              <select 
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none cursor-pointer transition-colors appearance-none"
              >
                {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 uppercase font-semibold">Region</label>
              <select 
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full bg-dark-950/60 border border-slate-800 focus:border-primary/50 text-sm text-white rounded-xl p-3 focus:outline-none cursor-pointer transition-colors appearance-none"
              >
                {regions.map(reg => <option key={reg} value={reg}>{reg}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Stakeholders */}
        <div className="glass p-8 rounded-2xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none"></div>

          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                <span className="w-6 h-px bg-blue-500/50"></span>
                Stakeholders & Connections
              </h2>
              <p className="text-xs text-slate-500">Details of the employees we are connecting with. This will automatically create their contact profiles.</p>
            </div>
            <button 
              type="button"
              onClick={() => setContacts([...contacts, { name: '', email: '', phone: '', position: '', department: '', projects: '' }])}
              className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-blue-500/20 hover:border-blue-500/50"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          </div>

          <div className="space-y-6">
            {contacts.map((contact, index) => (
              <div key={index} className="relative bg-dark-950/40 p-6 rounded-xl border border-slate-800/50">
                {contacts.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => setContacts(contacts.filter((_, i) => i !== index))}
                    className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors text-xs font-bold uppercase"
                  >
                    Remove
                  </button>
                )}
                
                <h3 className="text-xs font-bold text-slate-400 mb-4">Contact {index + 1}</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Employee Name</label>
                    <input 
                      type="text" 
                      value={contact.name}
                      onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[index].name = e.target.value;
                        setContacts(newContacts);
                      }}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="e.g. John Smith"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Position / Role</label>
                    <input 
                      type="text" 
                      value={contact.position}
                      onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[index].position = e.target.value;
                        setContacts(newContacts);
                      }}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="e.g. VP of Operations"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Direct Email</label>
                    <input 
                      type="email" 
                      value={contact.email}
                      onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[index].email = e.target.value;
                        setContacts(newContacts);
                      }}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="john.smith@acme.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Direct Phone</label>
                    <input 
                      type="text" 
                      value={contact.phone}
                      onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[index].phone = e.target.value;
                        setContacts(newContacts);
                      }}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="+1 (555) 111-2222"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Department</label>
                    <input 
                      type="text" 
                      value={contact.department}
                      onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[index].department = e.target.value;
                        setContacts(newContacts);
                      }}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors"
                      placeholder="e.g. Engineering, Sales"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Projects / Notes / Interactions</label>
                    <textarea 
                      value={contact.projects}
                      onChange={e => {
                        const newContacts = [...contacts];
                        newContacts[index].projects = e.target.value;
                        setContacts(newContacts);
                      }}
                      rows={3}
                      className="w-full bg-dark-950/60 border border-slate-800 focus:border-blue-500/50 text-sm text-white rounded-xl p-3 focus:outline-none transition-colors resize-none"
                      placeholder="List key projects we are collaborating on or any preliminary notes..."
                    />
                  </div>
                </div>
              </div>
            ))}
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
                Save Client Profile
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
