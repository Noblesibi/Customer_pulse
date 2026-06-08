import { Router } from 'express';
import { db } from '../config/firebase.js';
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
    const accounts = accountsSnap.docs.map(doc => doc.data());

    // 2. Fetch Contacts
    const contactsSnap = await db.collection('contacts').get();
    const contacts = contactsSnap.docs.map(doc => doc.data());

    // 3. Fetch Interactions
    const interactionsSnap = await db.collection('interactions').get();
    const interactions = interactionsSnap.docs.map(doc => doc.data());

    // 4. Fetch Risks
    const risksSnap = await db.collection('risks').get();
    const risks = risksSnap.docs.map(doc => doc.data());

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
    if (criticalAccounts > 0) {
      const critAccs = accounts.filter(a => a.healthScore < 50);
      critAccs.forEach(a => {
        aiRecommendations.push({
          id: `rec-${a.accountId}`,
          accountId: a.accountId,
          companyName: a.companyName,
          title: `Schedule Urgent Review with ${a.companyName}`,
          description: `Health score is ${a.healthScore}%. Action is required due to recurring complaints or low contact coverage.`,
          priority: 'High'
        });
      });
    }
    
    // Add default baseline recommendations
    if (aiRecommendations.length < 3) {
      aiRecommendations.push({
        id: 'rec-gen-1',
        title: 'Reach out to Acme Corporation',
        description: 'Account is healthy (88%) but has not had an interaction logged in over 14 days.',
        priority: 'Medium'
      });
      aiRecommendations.push({
        id: 'rec-gen-2',
        title: 'Establish CXO connection at Apex Financial',
        description: 'No CXO-level decision makers are currently mapped in contacts.',
        priority: 'Low'
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
        aiRecommendations
      }
    });
  } catch (error) {
    console.error('Error generating dashboard stats:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
