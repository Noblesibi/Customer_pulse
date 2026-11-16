import React, { useState } from 'react';
import { Mail, MessageSquare, Calendar, Search, Filter, Phone, Video, ChevronDown, CheckSquare, Clock, Activity, Sparkles, X } from 'lucide-react';

import { formatDate } from '../../utils/dateFormat.js';

/**
 * Format and sanitize email/interaction text so it is clean, legible, and
 * completely free from raw HTML tags, entity codes, slogans, and boilerplate.
 */
function formatCleanInteractionContent(text) {
  if (!text) return '';
  let str = String(text);

  // If text contains HTML tags
  if (/<[a-z][\s\S]*>/i.test(str)) {
    const bodyMatch = str.match(/<div[^>]*class=["'][^"']*body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*footer/i)
      || str.match(/<div[^>]*class=["'][^"']*body[^"']*["'][^>]*>([\s\S]*?)<\/body>/i)
      || str.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) str = bodyMatch[1];

    str = str.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ')
             .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
             .replace(/<div[^>]*class=["'][^"']*btn-container[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ')
             .replace(/<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ' ')
             .replace(/<div[^>]*class=["'][^"']*header[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ')
             .replace(/<div[^>]*class=["'][^"']*footer[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ')
             .replace(/<div[^>]*class=["'][^"']*field-label[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*field-value[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, ' $1: $2. ')
             .replace(/<div[^>]*class=["'][^"']*card-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, ' ')
             .replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, ' ')
             .replace(/<(br|hr)\s*\/?>/gi, ' ')
             .replace(/<[^>]+>/g, ' ');
  }

  // Remove leaked/mashed boilerplate phrases from previously-stripped text
  str = str.replace(/CustomerPulseCustomerPulseRELATIONSHIPS,\s*MEASURED/gi, ' ')
           .replace(/CustomerPulseRELATIONSHIPS,\s*MEASURED/gi, ' ')
           .replace(/RELATIONSHIPS,\s*MEASURED/gi, ' ')
           .replace(/&#x[0-9a-fA-F]+;/gi, ' ')
           .replace(/&#[0-9]+;/g, ' ')
           .replace(/&nbsp;/gi, ' ')
           .replace(/&amp;/gi, '&')
           .replace(/&lt;/gi, '<')
           .replace(/&gt;/gi, '>')
           .replace(/&quot;/gi, '"')
           .replace(/&#39;/gi, "'");

  // Strip repeated header fragments prepended to text
  str = str.replace(/^(Associated Task Assigned\s*[-–—]?\s*)+/gi, '')
           .replace(/^CustomerPulse\s*/gi, '')
           .replace(/^(Associated Task Assigned\s*)+/gi, '');

  str = str.replace(/\s+/g, ' ').trim();
  return str;
}

function formatCleanInteractionTitle(rawTitle, accountName) {
  if (!rawTitle) return 'Logged Activity';
  let t = String(rawTitle).trim();
  
  // Clean bracketed prefixes: e.g. "[Associated Task Assigned] Reconnect..." -> "Reconnect..."
  t = t.replace(/^\[(Associated Task Assigned|Task Assigned|Notification|Task Reminder|Task Completed)\]\s*/i, '');
  
  // Clean trailing " - AccountName" if redundant with current account
  if (accountName && t.toLowerCase().endsWith(` - ${accountName.toLowerCase()}`)) {
    t = t.substring(0, t.length - (accountName.length + 3)).trim();
  }
  return t || rawTitle;
}

export default function InteractionsTab({ account, allActivities = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);



  const currentAccId = account?.accountId || account?.id;
  const processedInteractions = allActivities
    .filter(a => {
      if (a.itemType === 'task') return false;
      const aAcc = a.accountId || a.account_id;
      if (aAcc && currentAccId && aAcc !== currentAccId) return false;
      return true;
    })
    .map(a => {
    let type = 'Activity';
    if (a.itemType === 'interaction') {
      const hasAssociatedTask = Array.isArray(a.actionMentions) && a.actionMentions.length > 0;
      if (a.source === 'Teams') type = 'Teams Meeting';
      else if (a.source === 'Outlook Mail' || a.source === 'Email') type = 'Outlook Mail';
      else type = hasAssociatedTask ? 'Log Interaction with Task' : 'Log Interaction';
    } else if (a.itemType === 'task') {
      type = 'Task';
    } else if (a.itemType === 'teams_tracking') {
      type = 'Teams Meeting';
    } else if (a.itemType === 'mail_tracking') {
      type = 'Outlook Mail';
    } else if (a.itemType === 'greeting') {
      type = 'Greeting';
    }

    let rawTitle = a.title || a.subject || a.taskHeader || a.name || 'Logged Activity';
    let rawSummary = a.details || a.messageText || a.description || a.task || a.notes || '';
    
    let title = formatCleanInteractionTitle(rawTitle, account?.companyName || account?.name);
    let summary = formatCleanInteractionContent(rawSummary);
    
    let status = '';
    if (a.itemType === 'task') {
      status = a.status || 'Task Assigned';
      if (status === 'Pending') status = 'Task Assigned';
      if (a.dueDate && new Date(a.dueDate) < new Date() && status !== 'Completed') {
        status = 'Overdue';
      }
    } else if (a.itemType === 'interaction') {
      const hasAssociatedTask = Array.isArray(a.actionMentions) && a.actionMentions.length > 0;
      if (hasAssociatedTask) {
        const isOverdue = a.actionMentions.some(m => m.dueDate && new Date(m.dueDate) < new Date() && m.status !== 'Completed');
        if (isOverdue) {
          status = 'Overdue';
        } else {
          const allCompleted = a.actionMentions.every(m => m.status === 'Completed');
          status = allCompleted ? 'Completed' : 'Task Assigned';
        }
      } else {
        // Redundant "LOGGED" badge hidden so standard interactions/emails stay clean
        status = '';
      }
    } else {
      status = '';
    }

    let participants = [];
    if (a.assignedToName) participants.push(a.assignedToName);
    if (a.assignedByName) participants.push(a.assignedByName);
    if (a.loggedByName) participants.push(a.loggedByName);
    if (a.recipientName) participants.push(a.recipientName);
    if (a.contactName) participants.push(a.contactName);
    if (a.clientContactName) participants.push(a.clientContactName);
    if (a.toEmail) participants.push(a.toEmail);
    if (a.recipientEmail) participants.push(a.recipientEmail);
    if (a.actionMentions && Array.isArray(a.actionMentions)) {
      a.actionMentions.forEach(m => {
        if (m.name) participants.push(m.name);
        if (m.email) participants.push(m.email);
      });
    }

    const uniqueParticipants = [...new Set(participants.filter(Boolean))];

    // Global searchable text index containing all fields
    const searchableText = [
      title,
      rawTitle,
      summary,
      rawSummary,
      type,
      status,
      formatDate(a.date || a.timestamp || a.createdAt),
      a.date,
      a.timestamp,
      a.source,
      a.eventType,
      account?.companyName,
      account?.name,
      ...uniqueParticipants
    ].filter(Boolean).join(' ').toLowerCase();

    return {
      id: a.id || a.interactionId || a.taskId || Math.random().toString(),
      type,
      title,
      date: formatDate(a.date || a.timestamp || a.createdAt),
      participants: uniqueParticipants,
      summary,
      status,
      searchableText
    };
  });

  const trimmedQuery = searchTerm.trim().toLowerCase();
  const searchTokens = trimmedQuery.split(/\s+/).filter(Boolean);

  const filteredInteractions = processedInteractions.filter(i => {
    // Global search matching: EVERY typed word must match somewhere in the interaction record
    const matchesSearch = searchTokens.length === 0 || searchTokens.every(token => i.searchableText.includes(token));
    const matchesType = selectedType === 'All Types' || i.type === selectedType;
    return matchesSearch && matchesType;
  });

  // Count of matches found globally regardless of selectedType
  const globalMatchesCount = searchTokens.length > 0
    ? processedInteractions.filter(i => searchTokens.every(token => i.searchableText.includes(token))).length
    : 0;

  // Real-time computed stats
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const totalYTD = processedInteractions.filter(i => {
    const raw = allActivities[processedInteractions.indexOf(i)];
    const d = new Date(raw?.date || raw?.timestamp || raw?.createdAt || 0);
    return d >= startOfYear;
  }).length;

  const last30Days = processedInteractions.filter(i => {
    const raw = allActivities[processedInteractions.indexOf(i)];
    const d = new Date(raw?.date || raw?.timestamp || raw?.createdAt || 0);
    return d >= thirtyDaysAgo;
  }).length;

  // Channel breakdown counts
  const channelColors = {
    'Log Interaction': { bar: 'bg-indigo-900', label: 'Log Interaction' },
    'Log Interaction with Task': { bar: 'bg-blue-600', label: 'Interaction + Task' },
    'Outlook Mail': { bar: 'bg-sky-500', label: 'Outlook Mail' },
    'Teams Meeting': { bar: 'bg-purple-500', label: 'Teams Meeting' },
    'Task': { bar: 'bg-amber-500', label: 'Tasks' },
    'Greeting': { bar: 'bg-rose-400', label: 'Greetings' },
  };
  const channelCounts = {};
  processedInteractions.forEach(i => {
    const key = i.type;
    channelCounts[key] = (channelCounts[key] || 0) + 1;
  });
  const totalCount = processedInteractions.length || 1;
  const sortedChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({
      type,
      label: channelColors[type]?.label || type,
      bar: channelColors[type]?.bar || 'bg-gray-400',
      count,
      pct: Math.round((count / totalCount) * 100)
    }));

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-indigo-900">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 tracking-tight">
              Interactions
            </h2>
          </div>
        </div>

        {/* Filters Top Right */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Search all interactions, people, notes..."
              className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-100 transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="relative">
            <button 
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              className="flex items-center justify-between gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 min-w-[120px]"
            >
              {selectedType} <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {isTypeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  {['All Types', 'Log Interaction', 'Log Interaction with Task', 'Outlook Mail', 'Teams Meeting', 'Greeting'].map(type => (
                    <button
                      key={type}
                      onClick={() => { setSelectedType(type); setIsTypeDropdownOpen(false); }}
                      className={`block w-full text-left px-4 py-2 text-sm ${selectedType === type ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 overflow-hidden pt-2 min-h-0">
        
        {/* Left: Interactions Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 shrink-0">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-900" /> Interaction Timeline
            </h3>
            {searchTerm && (
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                {filteredInteractions.length} match{filteredInteractions.length === 1 ? '' : 'es'} found
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pr-3 space-y-4 min-h-0">
            {filteredInteractions.map((interaction, idx) => (
              <div key={interaction.id} className="flex gap-4 relative">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 z-10 border border-gray-200 shadow-sm">
                  {interaction.type === 'Outlook Mail' || interaction.type === 'Email' ? (
                    <Mail className="w-4 h-4 text-sky-500" />
                  ) : interaction.type === 'Teams Meeting' ? (
                    <Video className="w-4 h-4 text-purple-500" />
                  ) : interaction.type === 'Greeting' ? (
                    <Sparkles className="w-4 h-4 text-rose-500" />
                  ) : interaction.type === 'Log Interaction with Task' ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                  )}
                </div>
                {idx !== filteredInteractions.length - 1 && (
                  <div className="absolute left-5 top-10 bottom-[-24px] w-0.5 bg-gray-200 -translate-x-1/2" />
                )}
                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 flex-1 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                          interaction.type === 'Outlook Mail' ? 'bg-sky-50 text-sky-700 border-sky-100' :
                          interaction.type === 'Teams Meeting' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                          interaction.type === 'Task' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          interaction.type === 'Greeting' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                          interaction.type === 'Log Interaction with Task' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          'bg-indigo-50 text-indigo-700 border-indigo-100'
                        }`}>
                          {interaction.type}
                        </span>
                        <span className="text-xs font-bold text-gray-400">
                          {interaction.date}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-gray-900">{interaction.title}</h4>
                    </div>
                    {interaction.status && (
                      <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        interaction.status === 'Overdue'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : interaction.status === 'Task Assigned'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : interaction.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        {interaction.status}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 font-medium leading-relaxed mb-4">{interaction.summary}</p>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Participants:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {interaction.participants.map((p, i) => (
                        <span key={i} className="text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredInteractions.length === 0 && (
              <div className="text-center text-gray-500 mt-10 p-6 bg-white border border-gray-200 rounded-xl">
                <Search className="w-8 h-8 mx-auto mb-2 text-gray-400 opacity-60" />
                <p className="text-sm font-semibold text-gray-800">
                  {searchTerm ? `No interactions matching "${searchTerm}"` : 'No interactions recorded yet.'}
                </p>
                {selectedType !== 'All Types' && globalMatchesCount > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">
                      Found {globalMatchesCount} match{globalMatchesCount === 1 ? '' : 'es'} in other categories outside "{selectedType}".
                    </p>
                    <button
                      onClick={() => setSelectedType('All Types')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold transition-colors"
                    >
                      Show all {globalMatchesCount} matches
                    </button>
                  </div>
                )}
                {searchTerm && (
                  <div className="mt-3">
                    <button
                      onClick={() => { setSearchTerm(''); setSelectedType('All Types'); }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 rounded-lg text-xs font-semibold transition-colors"
                    >
                      Clear search & filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Stats */}
        <div className="w-80 shrink-0 flex flex-col gap-5 overflow-y-auto pr-1 min-h-0">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-600" /> Interaction Summary
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <div className="text-2xl font-black text-blue-900 mb-1">{totalYTD}</div>
                <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Total YTD</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <div className="text-2xl font-black text-blue-900 mb-1">{last30Days}</div>
                <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Last 30 Days</div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 flex-1 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-5">
              Top Channels
            </h3>
            <div className="space-y-4">
              {sortedChannels.length === 0 ? (
                <p className="text-xs text-gray-400 font-medium">No data yet.</p>
              ) : sortedChannels.map(ch => (
                <div key={ch.type}>
                  <div className="flex justify-between text-sm mb-1 font-bold">
                    <span className="text-gray-700">{ch.label}</span>
                    <span className="text-gray-900">{ch.pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`${ch.bar} h-2 rounded-full transition-all duration-500`} style={{ width: `${ch.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}





