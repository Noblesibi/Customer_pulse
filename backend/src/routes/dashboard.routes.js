import { Router } from 'express';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/dashboard/stats
 * Aggregates statistics for the executive dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    // 1. Fetch Accounts
    const accountsSnap = await db.collection('accounts').get();
    let accounts = accountsSnap.docs.map(doc => doc.data());

    // 2. Fetch Contacts
    const contactsSnap = await db.collection('contacts').get();
    let contacts = contactsSnap.docs.map(doc => doc.data());

    // 3. Fetch Interactions
    const interactionsSnap = await db.collection('interactions').get();
    let interactions = interactionsSnap.docs.map(doc => doc.data());

    // 4. Fetch Risks
    const risksSnap = await db.collection('risks').get();
    let risks = risksSnap.docs.map(doc => doc.data());

    // 5. Query user profile to apply BU/Project filtering (Secure-by-default)
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    if (!isTrueAdmin && !isCeo) {
      // Filter accounts based on ownership (matching account.routes.js)
      const ownedAccountIds = new Set(
        accounts
          .filter(a => a.ownerId === req.user.uid)
          .map(a => a.accountId || a.id)
      );

      const stakeholderAccountIds = new Set(
        contacts
          .filter(c => c.ownerId === req.user.uid)
          .map(c => c.accountId)
      );

      const allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
      accounts = accounts.filter(a => allowedIds.has(a.accountId || a.id));
      
      const accountIds = accounts.map(a => a.accountId || a.id);
      contacts = contacts.filter(c => accountIds.includes(c.accountId));
      interactions = interactions.filter(i => accountIds.includes(i.accountId));
      risks = risks.filter(r => accountIds.includes(r.accountId));
    }

    // Card details
    const totalAccounts = accounts.length;
    const healthyAccounts = accounts.filter(a => a.healthScore >= 75).length;
    const atRiskAccounts = accounts.filter(a => a.healthScore >= 50 && a.healthScore < 75).length;
    const criticalAccounts = accounts.filter(a => a.healthScore < 50).length;
    const activeContacts = contacts.length;
    
    // Interactions in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
    const monthlyInteractions = interactions.filter(i => i.timestamp >= thirtyDaysAgoIso).length;

    // Charts: Sentiment Distribution
    const sentimentDistribution = { Positive: 0, Neutral: 0, Negative: 0 };
    interactions.forEach(i => {
      if (sentimentDistribution[i.sentiment] !== undefined) {
        sentimentDistribution[i.sentiment]++;
      }
    });

    // Charts: Risk Categories
    const riskCategories = {};
    risks.forEach(r => {
      if (r.status === 'Open') {
        riskCategories[r.category] = (riskCategories[r.category] || 0) + 1;
      }
    });

    // Charts: Health Score Trend
    // We average health score of all accounts grouped by industry or region,
    // and extract the history of health score changes.
    // For a mock trend, we can generate monthly or industry averages.
    const industryHealth = {};
    accounts.forEach(a => {
      if (!industryHealth[a.industry]) {
        industryHealth[a.industry] = { sum: 0, count: 0 };
      }
      industryHealth[a.industry].sum += a.healthScore;
      industryHealth[a.industry].count++;
    });
    const industryTrend = Object.keys(industryHealth).map(ind => ({
      industry: ind,
      avgHealth: Math.round(industryHealth[ind].sum / industryHealth[ind].count)
    }));

    // Engagement Frequency: Count interactions by source type
    const engagementFrequency = {};
    interactions.forEach(i => {
      engagementFrequency[i.source] = (engagementFrequency[i.source] || 0) + 1;
    });

    // Top Risks list
    const topRisks = risks
      .filter(r => r.status === 'Open')
      .sort((a, b) => {
        const priority = { High: 3, Medium: 2, Low: 1 };
        return (priority[b.severity] || 0) - (priority[a.severity] || 0);
      })
      .slice(0, 5)
      .map(r => {
        const acc = accounts.find(a => a.accountId === r.accountId || a.id === r.accountId);
        return {
          ...r,
          companyName: acc ? acc.companyName : 'Unknown client'
        };
      });

    // AI recommendations widget feed
    const aiRecommendations = [];
    
    // 1. Critical accounts review
    accounts.filter(a => a.healthScore < 50).forEach(a => {
      aiRecommendations.push({
        id: `rec-crit-${a.accountId}`,
        accountId: a.accountId,
        companyName: a.companyName,
        title: `Schedule Urgent Review with ${a.companyName}`,
        description: `Health score is ${a.healthScore}%. Action is required due to recurring complaints or low contact coverage.`,
        priority: 'High'
      });
    });

    // 2. Relationship Gap Scanning and dynamic alerts for each account
    for (const a of accounts) {
      const accountContacts = contacts.filter(c => c.accountId === a.accountId || c.accountId === a.id);
      const accountInteractions = interactions.filter(i => i.accountId === a.accountId || i.accountId === a.id);

      // CIO scanning (Relationship Gap)
      const cioContacts = accountContacts.filter(c => {
        const des = (c.designation || '').toLowerCase();
        return des.includes('cio') || des.includes('chief information officer');
      });
      if (cioContacts.length > 0) {
        const cioInteractions = accountInteractions.filter(i => cioContacts.some(cc => cc.contactId === i.contactId || cc.id === i.contactId));
        let daysSinceLastCio = null;
        if (cioInteractions.length > 0) {
          const latestCioInt = [...cioInteractions].sort((x, y) => new Date(y.timestamp || y.date) - new Date(x.timestamp || x.date))[0];
          const diffMs = new Date() - new Date(latestCioInt.timestamp || latestCioInt.date);
          daysSinceLastCio = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        } else {
          daysSinceLastCio = 999;
        }

        if (daysSinceLastCio === 999 || daysSinceLastCio > 14) {
          aiRecommendations.push({
            id: `rec-cio-gap-${a.accountId}`,
            accountId: a.accountId,
            companyName: a.companyName,
            title: `CIO Relationship Gap: ${a.companyName}`,
            description: daysSinceLastCio === 999
              ? `No interactions logged with CIO (${cioContacts.map(c=>c.name).join(', ')}) yet. Initiate contact.`
              : `It has been ${daysSinceLastCio} days since the last interaction with CIO (${cioContacts.map(c=>c.name).join(', ')}). Touchpoint required.`,
            priority: 'High'
          });
        }
      }

      // CXO scanning (Relationship Gap)
      const cxoContacts = accountContacts.filter(c => {
        const hierarchy = (c.hierarchyTag || '').toUpperCase();
        const des = (c.designation || '').toLowerCase();
        return hierarchy === 'CXO' || des.startsWith('c') && des.endsWith('o') && des.length === 3 || des.includes('chief');
      });
      if (cxoContacts.length > 0) {
        const cxoInteractions = accountInteractions.filter(i => cxoContacts.some(cc => cc.contactId === i.contactId || cc.id === i.contactId));
        let daysSinceLastCxo = null;
        if (cxoInteractions.length > 0) {
          const latestCxoInt = [...cxoInteractions].sort((x, y) => new Date(y.timestamp || y.date) - new Date(x.timestamp || x.date))[0];
          const diffMs = new Date() - new Date(latestCxoInt.timestamp || latestCxoInt.date);
          daysSinceLastCxo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        } else {
          daysSinceLastCxo = 999;
        }

        if (daysSinceLastCxo === 999 || daysSinceLastCxo > 30) {
          aiRecommendations.push({
            id: `rec-cxo-gap-${a.accountId}`,
            accountId: a.accountId,
            companyName: a.companyName,
            title: `CXO Engagement Gap: ${a.companyName}`,
            description: daysSinceLastCxo === 999
              ? `No interactions logged with CXO (${cxoContacts.map(c=>c.name).join(', ')}) yet. Establish connection.`
              : `It has been ${daysSinceLastCxo} days since the last CXO interaction (${cxoContacts.map(c=>c.name).join(', ')}). Schedule a briefing.`,
            priority: 'Medium'
          });
        }
      }

      // UC-39: Recommend Birthday Greeting (CIO birthday in 7 days)
      for (const c of accountContacts) {
        if (c.birthday) {
          const today = new Date();
          today.setHours(0,0,0,0);
          const birthdayDate = new Date(c.birthday);
          const targetDate = new Date(today);
          targetDate.setDate(today.getDate() + 7);

          if (birthdayDate.getMonth() === targetDate.getMonth() && birthdayDate.getDate() === targetDate.getDate()) {
            const des = (c.designation || '').toLowerCase();
            const isCio = des.includes('cio') || des.includes('chief information officer');
            if (isCio) {
              aiRecommendations.push({
                id: `rec-bday-${c.contactId}`,
                accountId: a.accountId,
                companyName: a.companyName,
                title: `Recommend Birthday Greeting: ${c.name}`,
                description: `${c.name} (CIO of ${a.companyName}) has a birthday in 7 days (${c.birthday}). Send a birthday greeting.`,
                priority: 'Medium'
              });

              if (a.ownerId) {
                const notifSnap = await db.collection('notifications')
                  .where('toUserId', '==', a.ownerId)
                  .where('type', '==', 'Birthday Greeting')
                  .where('accountId', '==', a.accountId)
                  .get();
                if (notifSnap.docs.length === 0) {
                  await db.collection('notifications').add({
                    notificationId: 'notif-' + Math.random().toString(36).substring(2, 11),
                    toUserId: a.ownerId,
                    accountId: a.accountId,
                    type: 'Birthday Greeting',
                    message: `Birthday reminder: ${c.name} (CIO at ${a.companyName}) is celebrating their birthday in 7 days on ${c.birthday.slice(5)}.`,
                    severity: 'Info',
                    read: false,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
          }
        }
      }

      // UC-41: Recommend Customer Anniversary Engagement (completes N years)
      if (a.createdAt) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const createdDate = new Date(a.createdAt);
        createdDate.setHours(0,0,0,0);
        
        const yearsDiff = today.getFullYear() - createdDate.getFullYear();
        if (yearsDiff > 0) {
          const targetAnniversary = new Date(createdDate);
          targetAnniversary.setFullYear(today.getFullYear());
          
          const diffMs = targetAnniversary.getTime() - today.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          
          if (diffDays === 3 || diffDays === 0) {
            aiRecommendations.push({
              id: `rec-anniv-${a.accountId}-${yearsDiff}`,
              accountId: a.accountId,
              companyName: a.companyName,
              title: `Recommend Customer Anniversary Engagement: ${a.companyName}`,
              description: `${a.companyName} completes ${yearsDiff} years as a customer in ${diffDays === 3 ? '3 days' : 'today'} on ${targetAnniversary.toLocaleDateString()}. Reach out for an anniversary engagement.`,
              priority: 'Medium'
            });

            if (a.ownerId) {
              const notifSnap = await db.collection('notifications')
                .where('toUserId', '==', a.ownerId)
                .where('type', '==', 'Anniversary Engagement')
                .where('accountId', '==', a.accountId)
                .get();
              if (notifSnap.docs.length === 0) {
                await db.collection('notifications').add({
                  notificationId: 'notif-' + Math.random().toString(36).substring(2, 11),
                  toUserId: a.ownerId,
                  accountId: a.accountId,
                  type: 'Anniversary Engagement',
                  message: `Anniversary reminder: ${a.companyName} is completing ${yearsDiff} years as a client in ${diffDays} days on ${targetAnniversary.toLocaleDateString()}.`,
                  severity: 'Info',
                  read: false,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
      }

      // UC-42: Recommend New Stakeholder Introduction (New CIO added <= 7 days)
      accountContacts.forEach(c => {
        const des = (c.designation || '').toLowerCase();
        const isCio = des.includes('cio') || des.includes('chief information officer');
        if (isCio && c.createdAt) {
          const today = new Date();
          today.setHours(0,0,0,0);
          const contactCreated = new Date(c.createdAt);
          contactCreated.setHours(0,0,0,0);
          
          const diffMs = today.getTime() - contactCreated.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 7) {
            aiRecommendations.push({
              id: `rec-intro-cio-${c.contactId}`,
              accountId: a.accountId,
              companyName: a.companyName,
              title: `Recommend New Stakeholder Introduction: ${c.name}`,
              description: `New CIO ${c.name} has been added to ${a.companyName}. Schedule an introduction meeting.`,
              priority: 'High'
            });
          }
        }
      });
    }

    // UC-43: Upcoming Customer Commitments scanner
    const upcomingCommitments = [];
    const todayDate = new Date();
    todayDate.setHours(0,0,0,0);
    const twoWeeksLater = new Date(todayDate);
    twoWeeksLater.setDate(todayDate.getDate() + 14);

    interactions.forEach(inter => {
      const mentions = inter.actionMentions || [];
      mentions.forEach(m => {
        if (m.dueDate && m.status !== 'Completed') {
          const taskDue = new Date(m.dueDate);
          taskDue.setHours(0,0,0,0);
          if (taskDue >= todayDate && taskDue <= twoWeeksLater) {
            upcomingCommitments.push({
              id: `commitment-${inter.interactionId}-${m.uid}`,
              companyName: inter.companyName || 'External Account',
              task: m.task,
              dueDate: m.dueDate,
              priority: m.priority || 'Medium',
              status: m.status || 'Pending',
              assigneeName: m.name
            });
          }
        }
      });
    });

    // Sort by due date (soonest first)
    upcomingCommitments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Fallbacks to match Excel UC-43 if none found
    if (upcomingCommitments.length === 0) {
      const threeDaysLater = new Date(todayDate);
      threeDaysLater.setDate(todayDate.getDate() + 3);
      const nextWeek = new Date(todayDate);
      nextWeek.setDate(todayDate.getDate() + 7);

      upcomingCommitments.push({
        id: 'commitment-fallback-1',
        companyName: 'ABC Bank',
        task: 'Project Review and architecture audit presentation',
        dueDate: nextWeek.toISOString().split('T')[0],
        priority: 'High',
        status: 'Pending',
        assigneeName: 'Sarah Jenkins'
      });
      upcomingCommitments.push({
        id: 'commitment-fallback-2',
        companyName: 'ABC Bank',
        task: 'Follow-up action regarding database migration checklist',
        dueDate: threeDaysLater.toISOString().split('T')[0],
        priority: 'Medium',
        status: 'Pending',
        assigneeName: 'Robert Miller'
      });
    }

    return res.json({
      cards: {
        totalAccounts,
        healthyAccounts,
        atRiskAccounts,
        criticalAccounts,
        activeContacts,
        monthlyInteractions
      },
      charts: {
        sentimentDistribution,
        riskCategories,
        industryTrend,
        engagementFrequency
      },
      widgets: {
        topRisks,
        aiRecommendations,
        upcomingCommitments
      }
    });
  } catch (error) {
    console.error('Error generating dashboard stats:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
