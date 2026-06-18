import { db } from '../config/database.js';

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
    // 1. Fetch Interactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    const interactionsSnapshot = await db.collection('interactions')
      .where('accountId', '==', accountId)
      .get();
    
    const interactions = interactionsSnapshot.docs.map(doc => doc.data());
    const recentInteractions = interactions.filter(i => i.timestamp >= thirtyDaysAgoIso);

    // Score Engagement Frequency (25%)
    let engagementScore = 0;
    const count = recentInteractions.length;
    if (count >= 5) engagementScore = 100;
    else if (count >= 3) engagementScore = 80;
    else if (count >= 1) engagementScore = 50;
    else engagementScore = 10; // baseline if there are older interactions but nothing in 30 days

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
    if (interactions.length > 0) {
      // Sort interactions by date descending and take last 5
      const sortedInteractions = [...interactions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
      let sentimentSum = 0;
      sortedInteractions.forEach(i => {
        if (i.sentiment === 'Positive') sentimentSum += 100;
        else if (i.sentiment === 'Neutral') sentimentSum += 60;
        else sentimentSum += 0; // Negative
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

    // Determine status rules:
    // 90-100 = Excellent
    // 75-89 = Healthy
    // 50-74 = Warning
    // 0-49 = Critical
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
      
      // Push notification
      await db.collection('notifications').add({
        accountId,
        type: 'Health Score Drop',
        message: `Critical alert: Health score for client has dropped to ${healthScore}%!`,
        severity: 'High',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  } catch (error) {
    console.error(`Error calculating health score for account ${accountId}:`, error);
    return { healthScore: 50, status: 'Warning' };
  }
}
