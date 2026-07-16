import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckSquare, ArrowLeft, Building2, Users, Calendar, Clock, AtSign, Square, Send, 
  Mail, Video, Phone, MessageSquare, X, Paperclip, Upload, FileText, Trash2, Loader2, ChevronLeft, Plus
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function LogInteraction() {
  const navigate = useNavigate();
  const { 
    accounts,
    fetchAccounts,
    contacts,
    fetchContacts,
    staffList,
    fetchStaff,
    addInteraction,
    fetchActivityLogs,
    fetchInteractions,
    generateTaskHeader
  } = useStore();

  // Log Interaction Form States
  const [interactionSource, setInteractionSource] = useState('Outlook Mail');
  const [subject, setSubject] = useState('');
  const [interactionText, setInteractionText] = useState('');
  const [interactionDate, setInteractionDate] = useState(new Date().toISOString().split('T')[0]);
  const [interactionTime, setInteractionTime] = useState(new Date().toTimeString().slice(0, 5));
  const [interactionContactId, setInteractionContactId] = useState('');
  const [interactionAccountId, setInteractionAccountId] = useState('');

  const [tasks, setTasks] = useState([
    {
      id: Date.now(),
      taskHeader: '',
      selectedMentions: [],
      mentionSearch: '',
      showMentionDropdown: false,
      taskDueDate: '',
      taskPriority: 'Medium',
      taskDescription: ''
    }
  ]);
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

  useEffect(() => {
    fetchAccounts();
    fetchStaff();
  }, []);

  useEffect(() => {
    if (interactionAccountId) {
      fetchContacts(interactionAccountId);
    }
  }, [interactionAccountId]);

  const channels = [
    { id: 'Outlook Mail', label: 'Outlook Mail', icon: Mail, color: 'text-blue-400' },
    { id: 'Teams Chat', label: 'Teams Chat', icon: MessageSquare, color: 'text-purple-400' },
    { id: 'Phone', label: 'Phone', icon: Phone, color: 'text-emerald-400' },
    { id: 'Face to Face', label: 'Face to Face', icon: Users, color: 'text-amber-400' },
    { id: 'Teams Meeting', label: 'Teams Meeting', icon: Video, color: 'text-rose-400' },
  ];

  const handleLogInteraction = async (e) => {
    e.preventDefault();

    const targetAccountId = interactionAccountId;
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

    // Validate tasks array
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const hasAssignees = t.selectedMentions.length > 0;
      const hasDesc = t.taskDescription.trim().length > 0;

      if (hasAssignees && !hasDesc) {
        alert(`Please enter a task description for Task Assignment #${i + 1}.`);
        return;
      }
      if (!hasAssignees && hasDesc) {
        alert(`Please search and select at least one team member for Task Assignment #${i + 1}.`);
        return;
      }
    }

    // Compile actionMentions
    const compiledActionMentions = [];
    tasks.forEach(t => {
      if (t.selectedMentions.length > 0 && t.taskDescription.trim()) {
        t.selectedMentions.forEach(m => {
          compiledActionMentions.push({
            uid: m.uid,
            name: m.name,
            task: t.taskDescription.trim(),
            taskHeader: t.taskHeader ? t.taskHeader.trim() : null,
            dueDate: t.taskDueDate || null,
            priority: t.taskPriority
          });
        });
      }
    });

    const derivedSubject = subject.trim() || interactionText.trim().split('\n')[0].slice(0, 50) || 'Interaction Note';
    const res = await addInteraction({
      accountId: targetAccountId,
      contactId: targetContactId,
      source: interactionSource,
      subject: derivedSubject,
      messageText: interactionText,
      date: interactionDate,
      time: interactionTime,
      attachments: attachmentsList,
      actionMentions: compiledActionMentions
    });

    if (res) {
      fetchActivityLogs();
      fetchInteractions();
      navigate('/interaction-log');
    }
  };

  const handleInteractionTextBlur = async () => {
    if (!interactionText.trim()) return;
    try {
      const generated = await generateTaskHeader(interactionText);
      if (generated && generated !== 'Task Assignment') {
        setSubject(generated);
      }
    } catch (e) {
      console.error('Error generating interaction subject:', e);
    }
  };

  const handleTaskDescriptionBlur = async (taskIdx, desc) => {
    if (!desc.trim()) return;
    try {
      const generated = await generateTaskHeader(desc);
      if (generated && generated !== 'Task Assignment') {
        setTaskField(taskIdx, 'taskHeader', generated);
      }
    } catch (e) {
      console.error('Error generating task header:', e);
    }
  };

  const getMentionSearchQuery = (text) => {
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex === -1) return '';
    const partAfterAt = text.slice(lastAtIndex + 1);
    return partAfterAt;
  };

  const insertMention = (taskIdx, staffMember) => {
    setTasks(prev => prev.map((t, idx) => {
      if (idx !== taskIdx) return t;

      const lastAtIndex = t.mentionSearch.lastIndexOf('@');
      if (lastAtIndex === -1) return t;
      const beforeAt = t.mentionSearch.slice(0, lastAtIndex);
      const newText = beforeAt + `@${staffMember.name} `;

      const parsed = [];
      staffList.forEach(s => {
        if (newText.includes(`@${s.name}`)) {
          parsed.push({ uid: s.uid, name: s.name });
        }
      });

      return {
        ...t,
        mentionSearch: newText,
        selectedMentions: parsed,
        showMentionDropdown: false
      };
    }));
  };

  const handleMentionSearchChange = (taskIdx, val) => {
    setTasks(prev => prev.map((t, idx) => {
      if (idx !== taskIdx) return t;

      const parsed = [];
      staffList.forEach(s => {
        if (val.includes(`@${s.name}`)) {
          parsed.push({ uid: s.uid, name: s.name });
        }
      });

      return {
        ...t,
        mentionSearch: val,
        selectedMentions: parsed
      };
    }));
  };

  const toggleMention = (taskIdx, staffMember) => {
    setTasks(prev => prev.map((t, idx) => {
      if (idx !== taskIdx) return t;

      const exists = t.selectedMentions.find(m => m.uid === staffMember.uid);
      let updated;
      if (exists) {
        updated = t.selectedMentions.filter(m => m.uid !== staffMember.uid);
      } else {
        updated = [...t.selectedMentions, { uid: staffMember.uid, name: staffMember.name }];
      }

      let text = t.mentionSearch;
      if (exists) {
        text = text.replace(`@${staffMember.name}`, '').replace(/\s+/g, ' ').trim();
      } else {
        text = `@${staffMember.name} ${text}`.replace(/\s+/g, ' ').trim();
      }

      return {
        ...t,
        selectedMentions: updated,
        mentionSearch: text
      };
    }));
  };

  const setTaskField = (taskIdx, field, value) => {
    setTasks(prev => prev.map((t, idx) => {
      if (idx !== taskIdx) return t;
      return { ...t, [field]: value };
    }));
  };

  const addTask = () => {
    setTasks(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        taskHeader: '',
        selectedMentions: [],
        mentionSearch: '',
        showMentionDropdown: false,
        taskDueDate: '',
        taskPriority: 'Medium',
        taskDescription: ''
      }
    ]);
  };

  const removeTask = (taskIdx) => {
    if (tasks.length === 1) {
      // Clear instead of removing the last task
      setTasks([
        {
          id: Date.now(),
          taskHeader: '',
          selectedMentions: [],
          mentionSearch: '',
          showMentionDropdown: false,
          taskDueDate: '',
          taskPriority: 'Medium',
          taskDescription: ''
        }
      ]);
    } else {
      setTasks(prev => prev.filter((_, idx) => idx !== taskIdx));
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/interaction-log')}
          className="flex items-center gap-1.5 cursor-pointer text-black hover:bg-dark-700 transition-colors font-bold text-base px-3.5 py-1.5 rounded-full"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <h2 className="text-base font-extrabold text-white tracking-wide uppercase">Log Interaction</h2>
      </div>

      <div className="space-y-6">
        <form onSubmit={handleLogInteraction} className="space-y-6">
          
          {/* Section 1: Channel Type */}
          <div className="space-y-2">
            <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 text-slate-400" /> Channel / Interaction Type
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
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-dark-900/60 border-slate-800/80 text-slate-300 hover:border-slate-500'
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3 h-3 text-slate-400" /> Company Account
              </label>
              <select
                value={interactionAccountId}
                onChange={(e) => {
                  setInteractionAccountId(e.target.value);
                  setInteractionContactId('');
                }}
                className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 cursor-pointer"
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
              <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3 text-slate-400" /> Client Contact / Staff
              </label>
              <select
                value={interactionContactId}
                onChange={(e) => setInteractionContactId(e.target.value)}
                className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 cursor-pointer"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-slate-400" /> Date
              </label>
              <input
                type="date"
                value={interactionDate}
                onChange={(e) => setInteractionDate(e.target.value)}
                className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" /> Time
              </label>
              <input
                type="time"
                value={interactionTime}
                onChange={(e) => setInteractionTime(e.target.value)}
                className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 cursor-pointer"
              />
            </div>
          </div>



          {/* Section 4: Notes / Message */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Notes / Message Content *</label>
            <textarea
              value={interactionText}
              onChange={(e) => setInteractionText(e.target.value)}
              onBlur={handleInteractionTextBlur}
              rows={8}
              className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-4 focus:outline-none focus:border-primary/50 resize-none leading-relaxed font-semibold"
              placeholder="Paste email content, meeting notes, Teams chat log, call summary... Gemini AI will automatically parse sentiment, detect risks, and update the account health score."
            />
          </div>

          {/* Section: Attachments */}
          <div className="space-y-2">
            <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-slate-400" /> Attachments (Images, Videos, Docs, Files)
            </label>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-900 border border-slate-800/80 hover:border-slate-500 rounded-xl text-xs font-semibold text-slate-300 hover:bg-dark-700 cursor-pointer active:scale-98 transition-all w-fit">
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
                  <span className="text-xs text-slate-400 animate-pulse flex items-center gap-1.5 font-bold">
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

          {/* Section 5: Action Tracking / Internal Mentions */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <AtSign className="w-3.5 h-3.5 text-slate-400" /> Assign Tasks
              </label>
              <button
                type="button"
                onClick={addTask}
                className="bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task Assignment
              </button>
            </div>

            <div className="space-y-6">
              {tasks.map((t, taskIdx) => (
                <div key={t.id} className="relative bg-dark-900 border border-slate-805 rounded-2xl p-5 space-y-4 shadow-sm">
                  {/* Remove Button */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/40">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                      Task Assignment #{taskIdx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTask(taskIdx)}
                      className="text-rose-500 hover:text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>

                  {/* Search Assignee */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                      Assign Team Member(s)
                    </label>
                    <input
                      type="text"
                      value={t.mentionSearch}
                      onFocus={() => setTaskField(taskIdx, 'showMentionDropdown', true)}
                      onChange={(e) => handleMentionSearchChange(taskIdx, e.target.value)}
                      onBlur={() => setTimeout(() => setTaskField(taskIdx, 'showMentionDropdown', false), 150)}
                      placeholder="Type @name to search and assign team members..."
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450 font-semibold"
                    />
                    
                    {t.showMentionDropdown && (() => {
                      const query = getMentionSearchQuery(t.mentionSearch);
                      const filteredStaff = staffList.filter(s => 
                        s.name.toLowerCase().includes(query.toLowerCase()) || 
                        s.email.toLowerCase().includes(query.toLowerCase())
                      );
                      if (filteredStaff.length === 0 || !t.mentionSearch.includes('@')) return null;
                      return (
                        <div className="absolute z-55 w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                          {filteredStaff.map(s => {
                            const isSelected = t.selectedMentions.some(m => m.uid === s.uid);
                            return (
                              <button
                                key={s.uid}
                                type="button"
                                onMouseDown={() => insertMention(taskIdx, s)}
                                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-slate-800 transition-colors text-slate-700 ${
                                  isSelected ? 'bg-primary/5 text-primary' : ''
                                }`}
                              >
                                <div className="flex flex-col items-start text-left">
                                  <span className="font-bold text-black">{s.name}</span>
                                  <span className="text-xs text-slate-500 font-semibold">{s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                </div>
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Selected Assignees List */}
                  {t.selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold self-center uppercase tracking-wider">Assigned:</span>
                      {t.selectedMentions.map(m => (
                        <span
                          key={m.uid}
                          className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold rounded-full px-2.5 py-1"
                        >
                          @{m.name}
                          <button type="button" onClick={() => toggleMention(taskIdx, m)} className="hover:text-red-500 ml-1 cursor-pointer">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}



                  {/* Description Box */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                      Task Description details (Optional if no team member assigned)
                    </label>
                    <textarea
                      value={t.taskDescription}
                      onChange={(e) => setTaskField(taskIdx, 'taskDescription', e.target.value)}
                      onBlur={(e) => handleTaskDescriptionBlur(taskIdx, e.target.value)}
                      rows={3}
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 text-black font-semibold resize-none"
                      placeholder="Enter the specific task instruction or description for the assignee..."
                    />
                  </div>

                  {/* Metadata: Due Date & Priority */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800/40">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                        Task Due Date
                      </label>
                      <input
                        type="date"
                        value={t.taskDueDate}
                        onChange={(e) => setTaskField(taskIdx, 'taskDueDate', e.target.value)}
                        className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 text-black"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                        Task Priority
                      </label>
                      <select
                        value={t.taskPriority}
                        onChange={(e) => setTaskField(taskIdx, 'taskPriority', e.target.value)}
                        className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 text-black cursor-pointer"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="border-t border-slate-800 pt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/interaction-log')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-6 py-3 border border-slate-700/50 cursor-pointer active:scale-98 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-lg px-8 py-3 shadow-lg active:scale-98 transition-all cursor-pointer flex items-center gap-2"
            >
              <Send className="w-4 h-4 text-white" />
              Save & Assign Interaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
