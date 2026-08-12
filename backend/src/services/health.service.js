import { db } from '../config/database.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';

/**
 * Calculates the health score for a specific account.
 * Formula:
 * 25% Engagement Frequency
 * 25% Relationship Depth
 * 25% Sentiment Trend
 * 25% Risk Signals
 */
export async function calculateAccountHealth(accountId) {
  try {
    // 0. Scan for tasks (actionMentions) overdue by 7+ days
    const allInteractionsSnapshot = await db.collection('interactions')
      .where('accountId', '==', accountId)
      .get();
    const allInteractions = allInteractionsSnapshot.docs.map(doc => doc.data());
    
    let hasOverdueTask = false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const inter of allInteractions) {
      const mentions = inter.actionMentions || [];
      for (const m of mentions) {
        if (m.status !== 'Completed' && m.dueDate) {
          const dueDateObj = new Date(m.dueDate);
          dueDateObj.setHours(0, 0, 0, 0);
          const diffMs = today.getTime() - dueDateObj.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays >= 7) {
            hasOverdueTask = true;
            break;
          }
        }
      }
      if (hasOverdueTask) break;
    }
    
    if (hasOverdueTask) {
      const existingOverdueRisksSnap = await db.collection('risks')
        .where('accountId', '==', accountId)
        .get();
      const existingOverdueRisks = existingOverdueRisksSnap.docs
        .map(d => d.data())
        .filter(r => r.category === 'Overdue Action' && r.status === 'Open');
        
      if (existingOverdueRisks.length === 0) {
        await db.collection('risks').add({
          accountId,
          category: 'Overdue Action',
          severity: 'High',
          description: 'A task has remained unresolved for 7+ days past its due date.',
          status: 'Open',
          createdAt: new Date().toISOString()
        });
        
        await db.collection('notifications').add({
          notificationId: 'notif-' + Math.random().toString(36).substring(2, 11),
          accountId,
          type: 'Overdue Task',
          message: 'Alert: Task remains unresolved for 7+ days past its due date. Account health impacted.',
          severity: 'High',
          read: false,
          date: getSystemDateString(),
          time: getSystemTimeString(),
          timestamp: new Date().toISOString()
        });
      }
    } else {
      const existingOverdueRisksSnap = await db.collection('risks')
        .where('accountId', '==', accountId)
        .get();
      const openOverdueRisks = existingOverdueRisksSnap.docs
        .filter(d => d.data().category === 'Overdue Action' && d.data().status === 'Open');
        
      for (const riskDoc of openOverdueRisks) {
        await db.collection('risks').doc(riskDoc.id).update({
          status: 'Closed',
          closedAt: new Date().toISOString()
        });
      }
    }

    // 1. Fetch Interactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    const recentInteractions = allInteractions.filter(i => i.timestamp >= thirtyDaysAgoIso);

    // Score Engagement Frequency (25%)
    let engagementScore = 0;
    const count = recentInteractions.length;
    if (count >= 5) engagementScore = 100;
    else if (count >= 3) engagementScore = 80;
    else if (count >= 1) engagementScore = 50;
    else engagementScore = 10;

    // 2. Fetch Contacts for Relationship Depth (25%)
    const contactsSnapshot = await db.collection('contacts')
      .where('accountId', '==', accountId)
      .get();
    const contacts = contactsSnapshot.docs.map(doc => doc.data());

    // Score Relationship Depth (25%)
    let relationshipScore = 0;
    if (contacts.length > 0) {
      const hierarchies = contacts.map(c => c.hierarchyTag || '');
      const influences = contacts.map(c => c.influenceTag || '');
      
      const hasCXOorVP = hierarchies.includes('CXO') || hierarchies.includes('VP');
      const hasDecisionMaker = influences.includes('Decision Maker');
      const hasChampion = influences.includes('Champion') || influences.includes('Influencer');

      if (hasCXOorVP && hasDecisionMaker) {
        relationshipScore = 100;
      } else if (hasCXOorVP || hasDecisionMaker) {
        relationshipScore = 85;
      } else if (hasChampion) {
        relationshipScore = 70;
      } else {
        relationshipScore = 50;
      }
    }

    // 3. Score Sentiment Trend (25%)
    let sentimentScore = 70; // baseline neutral
    if (allInteractions.length > 0) {
      const sortedInteractions = [...allInteractions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
      let sentimentSum = 0;
      sortedInteractions.forEach(i => {
        if (i.sentiment === 'Positive') sentimentSum += 100;
        else if (i.sentiment === 'Neutral') sentimentSum += 60;
        else sentimentSum += 0;
      });
      sentimentScore = sentimentSum / sortedInteractions.length;
    }

    // 4. Fetch Active Risks for Risk Signals (25%)
    const risksSnapshot = await db.collection('risks')
      .where('accountId', '==', accountId)
      .get();
    const risks = risksSnapshot.docs.map(doc => doc.data()).filter(r => r.status === 'Open');

    // Score Risk Signals (25%)
    let riskScore = 100;
    if (risks.length > 0) {
      const hasHigh = risks.some(r => r.severity === 'High');
      const hasMedium = risks.some(r => r.severity === 'Medium');
      if (hasHigh) {
        riskScore = 30;
      } else if (hasMedium) {
        riskScore = 60;
      } else {
        riskScore = 80;
      }
    }

    // Compute aggregate health score
    const healthScore = Math.round(
      (0.25 * engagementScore) +
      (0.25 * relationshipScore) +
      (0.25 * sentimentScore) +
      (0.25 * riskScore)
    );

    let status = 'Warning';
    if (healthScore >= 90) status = 'Excellent';
    else if (healthScore >= 75) status = 'Healthy';
    else if (healthScore >= 50) status = 'Warning';
    else status = 'Critical';

    const result = { healthScore, status };

    // Update account with computed scores
    const accountRef = db.collection('accounts').doc(accountId);
    const accountDoc = await accountRef.get();
    if (accountDoc.exists) {
      await accountRef.update(result);
    }

    // Log the health score update
    await db.collection('healthScores').add({
      accountId,
      healthScore,
      status,
      timestamp: new Date().toISOString()
    });

    // If health drops under 50, create an automatic system risk if not already present
    if (healthScore < 50 && risks.length === 0) {
      await db.collection('risks').add({
        accountId,
        category: 'Relationship Deterioration',
        severity: 'High',
        description: `Account health dropped to critical level (${healthScore}%).`,
        status: 'Open',
        createdAt: new Date().toISOString()
      });
      
      await db.collection('notifications').add({
        notificationId: 'notif-' + Math.random().toString(36).substring(2, 11),
        accountId,
        type: 'Health Score Drop',
        message: `Critical alert: Health score for client has dropped to ${healthScore}%!`,
        severity: 'High',
        read: false,
        date: getSystemDateString(),
        time: getSystemTimeString(),
        timestamp: new Date().toISOString()
      });
    }

    return result;
  } catch (error) {
    console.error(`Error calculating health score for account ${accountId}:`, error);
    return { healthScore: 50, status: 'Warning' };
  }
}

/**
 * Returns a detailed explanation breakdown for an account health score.
 */
export async function getAccountHealthExplanation(accountId) {
  try {
    const allInteractionsSnapshot = await db.collection('interactions')
      .where('accountId', '==', accountId)
      .get();
    const allInteractions = allInteractionsSnapshot.docs.map(doc => doc.data());

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    const recentInteractions = allInteractions.filter(i => i.timestamp >= thirtyDaysAgoIso);

    // Score Engagement Frequency (25%)
    let engagementScore = 0;
    const count = recentInteractions.length;
    if (count >= 5) engagementScore = 100;
    else if (count >= 3) engagementScore = 80;
    else if (count >= 1) engagementScore = 50;
    else engagementScore = 10;

    // Fetch Contacts
    const contactsSnapshot = await db.collection('contacts')
      .where('accountId', '==', accountId)
      .get();
    const contacts = contactsSnapshot.docs.map(doc => doc.data());

    // Score Relationship Depth (25%)
    let relationshipScore = 0;
    let hasCXOorVP = false;
    let hasDecisionMaker = false;
    let hasChampion = false;
    if (contacts.length > 0) {
      const hierarchies = contacts.map(c => c.hierarchyTag || '');
      const influences = contacts.map(c => c.influenceTag || '');
      
      hasCXOorVP = hierarchies.includes('CXO') || hierarchies.includes('VP');
      hasDecisionMaker = influences.includes('Decision Maker');
      hasChampion = influences.includes('Champion') || influences.includes('Influencer');

      if (hasCXOorVP && hasDecisionMaker) {
        relationshipScore = 100;
      } else if (hasCXOorVP || hasDecisionMaker) {
        relationshipScore = 85;
      } else if (hasChampion) {
        relationshipScore = 70;
      } else {
        relationshipScore = 50;
      }
    }

    // Score Sentiment Trend (25%)
    let sentimentScore = 70; // baseline neutral
    let recentInteractionsSentiments = [];
    if (allInteractions.length > 0) {
      const sortedInteractions = [...allInteractions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
      let sentimentSum = 0;
      sortedInteractions.forEach(i => {
        if (i.sentiment === 'Positive') sentimentSum += 100;
        else if (i.sentiment === 'Neutral') sentimentSum += 60;
        else sentimentSum += 0;
      });
      sentimentScore = sentimentSum / sortedInteractions.length;
      recentInteractionsSentiments = sortedInteractions.map(i => ({
        interactionId: i.interactionId || i.id,
        subject: i.subject,
        sentiment: i.sentiment,
        date: i.date
      }));
    }

    // Fetch Active Risks
    const risksSnapshot = await db.collection('risks')
      .where('accountId', '==', accountId)
      .get();
    const risks = risksSnapshot.docs.map(doc => doc.data()).filter(r => r.status === 'Open');

    // Score Risk Signals (25%)
    let riskScore = 100;
    if (risks.length > 0) {
      const hasHigh = risks.some(r => r.severity === 'High');
      const hasMedium = risks.some(r => r.severity === 'Medium');
      if (hasHigh) {
        riskScore = 30;
      } else if (hasMedium) {
        riskScore = 60;
      } else {
        riskScore = 80;
      }
    }

    const healthScore = Math.round(
      (0.25 * engagementScore) +
      (0.25 * relationshipScore) +
      (0.25 * sentimentScore) +
      (0.25 * riskScore)
    );

    let status = 'Warning';
    if (healthScore >= 90) status = 'Excellent';
    else if (healthScore >= 75) status = 'Healthy';
    else if (healthScore >= 50) status = 'Warning';
    else status = 'Critical';

    return {
      accountId,
      engagementScore,
      engagementCount: count,
      relationshipScore,
      contactsCount: contacts.length,
      hasCXOorVP,
      hasDecisionMaker,
      hasChampion,
      sentimentScore,
      recentInteractionsSentiments,
      riskScore,
      activeRisks: risks.map(r => ({
        riskId: r.riskId || r.id,
        category: r.category,
        severity: r.severity,
        description: r.description
      })),
      healthScore,
      status
    };
  } catch (error) {
    console.error(`Error explaining health score for account ${accountId}:`, error);
    return null;
  }
}
