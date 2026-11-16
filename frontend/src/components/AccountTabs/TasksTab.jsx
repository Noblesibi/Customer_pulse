import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Clock, Search, Plus, User } from 'lucide-react';
import { useStore } from '../../store/index.js';
import { formatDate } from '../../utils/dateFormat.js';

export default function TasksTab({ account, allActivities }) {
  const navigate = useNavigate();
  const { staffTasks, fetchStaffTasks, interactions, fetchInteractions, generateTaskHeader } = useStore();
  const [generatedHeaders, setGeneratedHeaders] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  const accId = account?.accountId || account?.id || account?.account_id;

  useEffect(() => {
    if (!allActivities) {
      fetchStaffTasks('all-tasks');
      fetchInteractions();
    }
  }, [allActivities]);

  const getDisplayStatus = (status, dueDateRaw) => {
    let s = (!status || status === 'Pending') ? 'Task Assigned' : status;
    if (dueDateRaw) {
      const d = new Date(dueDateRaw);
      d.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (d < now && !s.toLowerCase().includes('complete') && !s.toLowerCase().includes('decline')) {
        s = 'Overdue';
      }
    }
    return s;
  };

  let combinedAccountTasks = [];

  if (allActivities) {
    const rawActivityTasks = allActivities.filter(a => a.itemType === 'task' && (!a.accountId || a.accountId === accId || a.account_id === accId));
    const seenIds = new Set(rawActivityTasks.map(t => t.taskId || t.id));
    const extraStoreTasks = (staffTasks || []).filter(t => {
      const tid = t.taskId || t.id;
      if (!tid || seenIds.has(tid)) return false;
      return t.accountId === accId || t.account_id === accId || (account?.companyName && t.companyName?.toLowerCase() === account.companyName?.toLowerCase());
    });
    const matchingStaffTasks = [...extraStoreTasks, ...rawActivityTasks].map(t => ({
      id: t.taskId || t.id,
      title: t.title || t.taskHeader || 'Staff Task', isFallbackTitle: !t.title && !t.taskHeader,
      description: t.description || t.task || '',
      priority: t.priority || 'Medium',
      dueDate: t.dueDate ? formatDate(t.dueDate) : 'No due date',
      status: getDisplayStatus(t.status, t.dueDate),
      assignedTo: t.assignedToName || 'Unassigned',
      assignedBy: t.assignedByName || 'System'
    }));

    const parsedInteractionTasks = [];
    allActivities.filter(a => a.itemType === 'interaction' && a.actionMentions && Array.isArray(a.actionMentions) && (!a.accountId || a.accountId === accId || a.account_id === accId)).forEach(item => {
      item.actionMentions.forEach(mention => {
        const taskDesc = mention.task || item.messageText || item.subject || 'Action Mention';
        const fallbackHeader = taskDesc.split(/[.!?\n]/)[0].trim();
        const cleanHeader = fallbackHeader.length <= 50 ? fallbackHeader : (fallbackHeader.slice(0, 47) + '...');
        const isFallback = !mention.taskHeader;
        parsedInteractionTasks.push({
          id: mention.taskId || `${item.interactionId}-${mention.uid}`,
          title: mention.taskHeader || cleanHeader, isFallbackTitle: isFallback,
          description: mention.task || item.messageText || item.subject || '',
          priority: mention.priority || 'Medium',
          dueDate: mention.dueDate ? formatDate(mention.dueDate) : (item.date ? formatDate(item.date) : 'No due date'),
          status: getDisplayStatus(mention.status, mention.dueDate),
          assignedTo: mention.name || 'Unassigned',
          assignedBy: item.loggedByName || 'Admin User'
        });
      });
    });

    combinedAccountTasks = [...matchingStaffTasks, ...parsedInteractionTasks];
  } else {
    // Filter staff tasks belonging to this account
    const matchingStaffTasks = (staffTasks || []).filter(t => 
      t.accountId === accId || t.account_id === accId || (account?.companyName && t.companyName?.toLowerCase() === account.companyName?.toLowerCase())
    ).map(t => ({
      id: t.taskId || t.id,
      title: t.title || t.taskHeader || 'Staff Task', isFallbackTitle: !t.title && !t.taskHeader,
      description: t.description || t.task || '',
      priority: t.priority || 'Medium',
      dueDate: t.dueDate ? formatDate(t.dueDate) : 'No due date',
      status: getDisplayStatus(t.status, t.dueDate),
      assignedTo: t.assignedToName || 'Unassigned',
      assignedBy: t.assignedByName || 'System'
    }));

    // Filter interaction-associated tasks belonging to this account
    const matchingInteractions = (interactions || []).filter(i => 
      (i.accountId || i.account_id) === accId || (account?.companyName && i.companyName?.toLowerCase() === account.companyName?.toLowerCase())
    );

    const parsedInteractionTasks = [];
    matchingInteractions.forEach(item => {
      if (item.actionMentions && Array.isArray(item.actionMentions)) {
        item.actionMentions.forEach(mention => {
          const taskDesc = mention.task || item.messageText || item.subject || 'Action Mention';
          const fallbackHeader = taskDesc.split(/[.!?\n]/)[0].trim();
          const cleanHeader = fallbackHeader.length <= 50 ? fallbackHeader : (fallbackHeader.slice(0, 47) + '...');
        const isFallback = !mention.taskHeader;
          parsedInteractionTasks.push({
            id: mention.taskId || `${item.interactionId}-${mention.uid}`,
            title: mention.taskHeader || cleanHeader, isFallbackTitle: isFallback,
            description: mention.task || item.messageText || item.subject || '',
            priority: mention.priority || 'Medium',
            dueDate: mention.dueDate ? formatDate(mention.dueDate) : (item.date ? formatDate(item.date) : 'No due date'),
            status: getDisplayStatus(mention.status, mention.dueDate),
            assignedTo: mention.name || 'Unassigned',
            assignedBy: item.loggedByName || 'Admin User'
          });
        });
      }
    });

    combinedAccountTasks = [...matchingStaffTasks, ...parsedInteractionTasks];
  }

  const displayTasksList = combinedAccountTasks;

  useEffect(() => {
    let isMounted = true;
    const processHeaders = async () => {
      for (const t of displayTasksList) {
        // If it's a fallback title or flagged as one
        if (t.description && t.isFallbackTitle) {
          if (!generatedHeaders[t.id]) {
            try {
              const h = await generateTaskHeader(t.description);
              if (isMounted && h) {
                setGeneratedHeaders(prev => ({...prev, [t.id]: h}));
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    };
    processHeaders();
    return () => { isMounted = false; };
  }, [displayTasksList]);

  const filteredTasks = displayTasksList.filter(t => {
    if (!searchTerm || !searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(query)) ||
      (t.description && t.description.toLowerCase().includes(query)) ||
      (t.assignedTo && t.assignedTo.toLowerCase().includes(query)) ||
      (t.assignedBy && t.assignedBy.toLowerCase().includes(query)) ||
      (t.status && t.status.toLowerCase().includes(query)) ||
      (t.priority && t.priority.toLowerCase().includes(query))
    );
  });

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] w-full overflow-hidden bg-white rounded-tl-2xl">
      {/* Header */}
      <div className="flex items-start justify-between p-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="text-primary">
            <CheckSquare className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 tracking-tight">
              Tasks ({filteredTasks.length})
            </h2>
            <p className="text-sm text-gray-500">Account tasks and associated action items.</p>
          </div>
        </div>

        {/* Filters Top Right */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Search tasks..."
              className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => navigate('/staff-tasks/new', { state: { preselectAccountId: accId, from: accId ? `/accounts/${accId}` : '/accounts', tab: 'Tasks' } })}
            className="flex items-center justify-between gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:opacity-90 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto mt-4 px-6 pb-6">
        <table className="w-full text-left border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '35%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead className="bg-white sticky top-0 z-10">
            <tr className="border-b border-gray-200">
              <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Task Header</th>
              <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Priority</th>
              <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Due Date</th>
              <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Status</th>
              <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Assigned By</th>
              <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center justify-center">
                    <CheckSquare className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm font-medium text-gray-500">No tasks found</p>
                    <p className="text-xs mt-1">Create a new task to get started.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredTasks.map(task => {
                return (
                  <tr 
                    key={task.id} 
                    onClick={() => navigate('/staff-tasks', { 
                      state: { 
                        selectedTaskId: task.id,
                        from: accId ? `/accounts/${accId}` : '/accounts',
                        tab: 'Tasks'
                      } 
                    })}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    <td className="py-4 px-2">
                      <div className="font-semibold text-sm text-gray-900 mb-0.5 truncate">{generatedHeaders[task.id] || task.title}</div>
                      <div className="text-xs text-gray-500 truncate">{task.description}</div>
                    </td>
                    <td className="py-4 px-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold ${
                        task.priority === 'High' ? 'bg-red-50 text-red-600' :
                        task.priority === 'Medium' ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {task.priority === 'High' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-0.5"></span>}
                        {task.priority === 'Medium' && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mr-0.5"></span>}
                        {task.priority === 'Low' && <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-0.5"></span>}
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        <Clock className="w-3.5 h-3.5 text-gray-400" /> {task.dueDate}
                      </div>
                    </td>
                    <td className="py-4 px-2">
                      <span className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
                        (task.status || '').toLowerCase().includes('complete') ? 'bg-green-50 text-green-700 border-green-200' :
                        (task.status || '').toLowerCase().includes('progress') || (task.status || '').toLowerCase().includes('accept') ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                        (task.status || '').toLowerCase().includes('overdue') ? 'bg-red-50 text-red-700 border-red-200' :
                        (task.status || '').toLowerCase().includes('assign') ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-sm text-gray-700 font-medium">
                      {task.assignedBy}
                    </td>
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-700 uppercase">
                          {(task.assignedTo || 'U').slice(0, 2)}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{task.assignedTo}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


