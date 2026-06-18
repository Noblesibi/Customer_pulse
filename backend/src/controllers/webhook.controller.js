import { db } from '../config/database.js';
import { analyzeCommunication } from '../services/ai.service.js';
import { calculateAccountHealth } from '../services/health.service.js';

/**
 * Finds account and contact based on email address.
 */
async function resolveAccountAndContact(email) {
  try {
    // 1. Search contact by email
    const contactsSnapshot = await db.collection('contacts')
      .where('email', '==', email)
      .get();
    
    if (contactsSnapshot.docs.length > 0) {
      const contact = contactsSnapshot.docs[0].data();
      return { contactId: contact.contactId || contact.id, accountId: contact.accountId };
    }

    // 2. Search by domain mapping if contact not found
    const domain = email.split('@')[1];
    if (domain) {
      const accountsSnapshot = await db.collection('accounts').get();
      const accounts = accountsSnapshot.docs.map(doc => doc.data());
      // Try to find a company matching domain keyword (e.g. acme.com -> Acme Corporation)
      const matchingAccount = accounts.find(acc => {
        const companyWords = acc.companyName.toLowerCase().split(' ');
        return companyWords.some(word => word.length > 3 && domain.toLowerCase().includes(word));
      });

      if (matchingAccount) {
        return { contactId: 'unknown-graph-contact', accountId: matchingAccount.accountId || matchingAccount.id };
      }
    }
  } catch (error) {
    console.error('Error resolving account/contact from email:', error);
  }
  
  // Return default sandbox demo account if unable to match
  return { contactId: 'unknown-graph-contact', accountId: 'acc-1' };
}

export async function handleOutlookWebhook(req, res) {
  const { senderEmail, subject, bodyText, timestamp } = req.body;

  if (!senderEmail || !bodyText) {
    return res.status(400).json({ error: 'Missing required fields senderEmail and bodyText' });
  }

  try {
    const { contactId, accountId } = await resolveAccountAndContact(senderEmail);

    // AI Analysis
    const analysis = await analyzeCommunication(bodyText);

    // Save interaction
    const interactionId = 'int-' + Math.random().toString(36).substring(2, 11);
    const newInteraction = {
      interactionId,
      accountId,
      contactId,
      source: 'Email',
      messageText: `Subject: ${subject || 'No Subject'}\n\n${bodyText}`,
      sentiment: analysis.sentiment,
      riskDetected: analysis.riskLevel === 'High' || analysis.riskLevel === 'Medium',
      riskCategory: analysis.riskCategory || '',
      timestamp: timestamp || new Date().toISOString()
    };

    await db.collection('interactions').doc(interactionId).set(newInteraction);

    // If risk detected, add to risks
    if (newInteraction.riskDetected) {
      const riskId = 'risk-' + Math.random().toString(36).substring(2, 11);
      await db.collection('risks').doc(riskId).set({
        riskId,
        accountId,
        category: analysis.riskCategory,
        severity: analysis.riskLevel,
        description: analysis.summary,
        status: 'Open',
        createdAt: new Date().toISOString()
      });

      // Add real-time notification
      const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notificationId).set({
        notificationId,
        accountId,
        type: 'New Risk',
        message: `New risk alert detected: [${analysis.riskCategory}] - ${analysis.summary}`,
        severity: analysis.riskLevel,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    // Add generic activity log notification
    const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(notificationId).set({
      notificationId,
      accountId,
      type: 'New Interaction',
      message: `New Email received from ${senderEmail}`,
      severity: 'Low',
      read: false,
      timestamp: new Date().toISOString()
    });

    // Update Health Score
    const updatedHealth = await calculateAccountHealth(accountId);

    return res.status(201).json({
      message: 'Outlook webhook ingested successfully',
      interaction: newInteraction,
      analysis,
      health: updatedHealth
    });
  } catch (error) {
    console.error('Error handling Outlook webhook:', error);
    return res.status(500).json({ error: 'Internal server error processing webhook' });
  }
}

export async function handleTeamsWebhook(req, res) {
  const { senderEmail, messageText, timestamp } = req.body;

  if (!senderEmail || !messageText) {
    return res.status(400).json({ error: 'Missing required fields senderEmail and messageText' });
  }

  try {
    const { contactId, accountId } = await resolveAccountAndContact(senderEmail);

    // AI Analysis
    const analysis = await analyzeCommunication(messageText);

    // Save interaction
    const interactionId = 'int-' + Math.random().toString(36).substring(2, 11);
    const newInteraction = {
      interactionId,
      accountId,
      contactId,
      source: 'Teams Chat',
      messageText,
      sentiment: analysis.sentiment,
      riskDetected: analysis.riskLevel === 'High' || analysis.riskLevel === 'Medium',
      riskCategory: analysis.riskCategory || '',
      timestamp: timestamp || new Date().toISOString()
    };

    await db.collection('interactions').doc(interactionId).set(newInteraction);

    // If risk detected, add to risks
    if (newInteraction.riskDetected) {
      const riskId = 'risk-' + Math.random().toString(36).substring(2, 11);
      await db.collection('risks').doc(riskId).set({
        riskId,
        accountId,
        category: analysis.riskCategory,
        severity: analysis.riskLevel,
        description: analysis.summary,
        status: 'Open',
        createdAt: new Date().toISOString()
      });

      // Add real-time notification
      const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notificationId).set({
        notificationId,
        accountId,
        type: 'New Risk',
        message: `New risk alert detected on Teams: [${analysis.riskCategory}] - ${analysis.summary}`,
        severity: analysis.riskLevel,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    // Add generic notification
    const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(notificationId).set({
      notificationId,
      accountId,
      type: 'New Interaction',
      message: `New Teams message from ${senderEmail}`,
      severity: 'Low',
      read: false,
      timestamp: new Date().toISOString()
    });

    // Update Health Score
    const updatedHealth = await calculateAccountHealth(accountId);

    return res.status(201).json({
      message: 'Teams webhook ingested successfully',
      interaction: newInteraction,
      analysis,
      health: updatedHealth
    });
  } catch (error) {
    console.error('Error handling Teams webhook:', error);
    return res.status(500).json({ error: 'Internal server error processing webhook' });
  }
}
