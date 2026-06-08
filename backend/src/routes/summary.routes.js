import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { generateExecutiveSummary } from '../services/ai.service.js';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/summary/:accountId
 * Generates an executive summary for a specific account using AI.
 */
router.get('/:accountId', async (req, res) => {
  const { accountId } = req.params;

  try {
    // 1. Fetch account details
    const accountDoc = await db.collection('accounts').doc(accountId).get();
    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const account = accountDoc.data();

    // 2. Fetch interactions for details
    const interactionsSnap = await db.collection('interactions')
      .where('accountId', '==', accountId)
      .get();
    const interactions = interactionsSnap.docs.map(doc => doc.data());

    // 3. Fetch active risks
    const risksSnap = await db.collection('risks')
      .where('accountId', '==', accountId)
      .get();
    const risks = risksSnap.docs.map(doc => doc.data()).filter(r => r.status === 'Open');

    // Prepare inputs
    const interactionsText = interactions
      .slice(0, 5)
      .map(i => `[${i.source}] ${i.messageText} (Sentiment: ${i.sentiment})`)
      .join('\n');

    const risksText = risks
      .map(r => `[Severity: ${r.severity}] ${r.category} - ${r.description}`)
      .join('\n');

    // Run summary engine
    const aiSummary = await generateExecutiveSummary(account.companyName, interactionsText, risksText);

    // Save summary record
    const summaryId = 'sum-' + Math.random().toString(36).substring(2, 11);
    await db.collection('summaries').doc(summaryId).set({
      summaryId,
      accountId,
      summaryText: aiSummary,
      timestamp: new Date().toISOString()
    });

    return res.json({
      accountId,
      companyName: account.companyName,
      summary: aiSummary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating account summary:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
