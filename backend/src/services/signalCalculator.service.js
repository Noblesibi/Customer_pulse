import { db } from '../config/database.js';

/**
 * Core library for computing account health and risk signals.
 * This acts as the "Signal Ingestion Engine".
 */

// Helper: Normalize values
function normalize(val, min, max) {
  if (val <= min) return 0;
  if (val >= max) return 100;
  return Math.round(((val - min) / (max - min)) * 100);
}

/**
 * Computes all built-in and custom signals for a given account.
 * Output is a flat key-value map of signal names to their computed values.
 */
export async function computeAccountSignals(accountId) {
  const signals = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all interactions
  const allInteractionsSnapshot = await db.collection('interactions')
    .where('accountId', '==', accountId)
    .get();
  const allInteractions = allInteractionsSnapshot.docs.map(doc => doc.data());
  
  // Sort interactions latest first
  allInteractions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // --- BUILT-IN SIGNALS ---
  
  // 1. days_since_last_interaction
  if (allInteractions.length > 0) {
    const lastIntDate = new Date(allInteractions[0].timestamp);
    const diffTime = Math.abs(today - lastIntDate);
    signals['days_since_last_interaction'] = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } else {
    signals['days_since_last_interaction'] = 999; // Represents never/infinity
  }

  // 2. days_since_last_login
  const usersSnapshot = await db.collection('users').get();
  const accountUsers = usersSnapshot.docs
    .map(doc => doc.data())
    .filter(u => u.projects && u.projects.includes(accountId));
    
  let daysSinceLastLogin = 999;
  accountUsers.forEach(user => {
    if (user.last_login) {
      const loginDate = new Date(user.last_login);
      const diffTime = Math.abs(today - loginDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < daysSinceLastLogin) daysSinceLastLogin = diffDays;
    }
  });
  signals['days_since_last_login'] = daysSinceLastLogin;

  // 3. meetings_last_30d
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
  
  const recentMeetings = allInteractions.filter(i => 
    i.timestamp >= thirtyDaysAgoIso && 
    (i.source === 'Meeting' || i.type === 'meeting')
  );
  signals['meetings_last_30d'] = recentMeetings.length;

  // 4. transcript_sentiment
  let recentSentimentScore = 50; // default neutral
  const recentInteractions = allInteractions.filter(i => i.timestamp >= thirtyDaysAgoIso);
  if (recentInteractions.length > 0) {
    let sentimentSum = 0;
    recentInteractions.forEach(i => {
      if (i.sentiment === 'Positive') sentimentSum += 100;
      else if (i.sentiment === 'Negative') sentimentSum += 0;
      else sentimentSum += 50; // Neutral
    });
    recentSentimentScore = Math.round(sentimentSum / recentInteractions.length);
  }
  signals['transcript_sentiment'] = recentSentimentScore;

  // 5. Tasks and Commitments
  const tasksSnapshot = await db.collection('tasks').where('accountId', '==', accountId).get();
  const allTasks = tasksSnapshot.docs.map(d => d.data());
  
  let overdueCount = 0;
  let completedCount = 0;
  
  allTasks.forEach(task => {
    if (task.status === 'Completed') {
      completedCount++;
    } else if (task.dueDate) {
      const dueDateObj = new Date(task.dueDate);
      dueDateObj.setHours(0, 0, 0, 0);
      if (today.getTime() > dueDateObj.getTime()) {
        overdueCount++;
      }
    }
  });
  
  signals['overdue_task_count'] = overdueCount;
  signals['task_completion_rate'] = allTasks.length > 0 ? normalize(completedCount, 0, allTasks.length) : 100;
  
  // 6. Contacts and Champions
  const contactsSnapshot = await db.collection('contacts').where('accountId', '==', accountId).get();
  const contacts = contactsSnapshot.docs.map(doc => doc.data());
  signals['active_contacts_count'] = contacts.length;
  
  const hasChampion = contacts.some(c => c.influenceTag === 'Champion');
  signals['has_champion'] = hasChampion ? 1 : 0;
  
  // 7. Emails and Greetings
  const emailInteractions = allInteractions.filter(i => i.source === 'Email' || i.type === 'email');
  const greetingReplies = emailInteractions.filter(i => i.direction === 'inbound' && i.is_greeting_reply);
  signals['greeting_reply_received'] = greetingReplies.length > 0 ? 1 : 0;
  
  const unansweredEmails = emailInteractions.filter(i => i.direction === 'inbound' && !i.replied); // Simplified logic
  signals['unanswered_email_count'] = unansweredEmails.length;
  
  // Real average reply time and reply rate computed from actual interactions
  const inboundEmails = emailInteractions.filter(i => i.direction === 'inbound');
  const repliedInbound = inboundEmails.filter(i => i.replied || (Array.isArray(i.replies) && i.replies.length > 0));
  signals['email_reply_rate'] = inboundEmails.length > 0
    ? Math.round((repliedInbound.length / inboundEmails.length) * 100)
    : 100;

  let totalReplyHours = 0;
  let replyCount = 0;
  for (const ie of repliedInbound) {
    if (Array.isArray(ie.replies) && ie.replies.length > 0 && ie.timestamp) {
      const firstReply = ie.replies[0];
      const diffMs = new Date(firstReply.timestamp || firstReply.createdAt) - new Date(ie.timestamp);
      if (diffMs > 0) {
        totalReplyHours += diffMs / (1000 * 60 * 60);
        replyCount++;
      }
    }
  }
  signals['avg_reply_time'] = replyCount > 0
    ? Math.round(totalReplyHours / replyCount)
    : (unansweredEmails.length > 0 ? 48 : 12);
  
  // --- CUSTOM SIGNALS ---
  
  const customSignalsSnapshot = await db.collection('custom_signals').get();
  const customSignals = customSignalsSnapshot.docs.map(d => d.data());
  
  for (const cs of customSignals) {
    let filteredData = [];
    
    // Determine data source
    if (cs.source === 'interaction_type') {
      filteredData = allInteractions.filter(i => i.type === cs.filters?.type || i.source === cs.filters?.type);
    } else if (cs.source === 'tag') {
      filteredData = allInteractions.filter(i => i.tags && i.tags.includes(cs.filters?.tag));
    } else if (cs.source === 'custom_field') {
      filteredData = allInteractions.filter(i => i.custom_fields && i.custom_fields[cs.filters?.field] === cs.filters?.value);
    } else if (cs.source === 'ai_extracted') {
      // Stub for AI extracted logic on transcripts/emails
      filteredData = allInteractions.filter(i => i.ai_extracted && i.ai_extracted[cs.filters?.field] === cs.filters?.value);
    }
    
    // Apply time window if present
    if (cs.time_window_days) {
      const windowDate = new Date();
      windowDate.setDate(windowDate.getDate() - cs.time_window_days);
      const windowDateIso = windowDate.toISOString();
      filteredData = filteredData.filter(d => d.timestamp >= windowDateIso);
    }
    
    // Aggregate
    let value = 0;
    if (cs.aggregation === 'count') {
      value = filteredData.length;
    } else if (cs.aggregation === 'exists') {
      value = filteredData.length > 0 ? 1 : 0;
    } else if (cs.aggregation === 'last_date') {
      if (filteredData.length > 0) {
        const lastDate = new Date(filteredData[0].timestamp);
        const diffDays = Math.floor(Math.abs(today - lastDate) / (1000 * 60 * 60 * 24));
        value = diffDays;
      } else {
        value = 999;
      }
    } else if (cs.aggregation === 'average' && cs.filters?.numeric_field) {
      if (filteredData.length > 0) {
        const sum = filteredData.reduce((acc, curr) => acc + (curr[cs.filters.numeric_field] || 0), 0);
        value = sum / filteredData.length;
      }
    }
    
    signals[cs.name] = value;
  }
  
  // Ignore "no reply" rules if currently out of office
  const activeOoo = emailInteractions.find(i => i.is_auto_reply && new Date(i.timestamp) > thirtyDaysAgo);
  if (activeOoo) {
    // If out of office, override some signals that penalize non-responsiveness
    signals['unanswered_email_count'] = 0;
    signals['days_since_last_interaction'] = 0; 
  }

  return signals;
}
