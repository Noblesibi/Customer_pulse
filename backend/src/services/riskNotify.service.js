/**
 * riskNotify.service.js — Role-aware "Notify" routing for account risks.
 *
 * Routing rules (sender is always excluded from recipients):
 *   - Admin (not owner / not key-contact owner) → Account Owner + all Key Contact Owners
 *   - Account Owner                              → all Key Contact Owners
 *   - Key Contact Owner                          → Account Owner + the other Key Contact Owners
 *
 * Every recipient receives an email (via NotificationEngine email queue) and an
 * in-app bell notification. All content is built from live Firestore data.
 */
import { db, logActivity } from '../config/database.js';
import { NotificationEngine } from './notification/NotificationEngine.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';

const lc = (s) => String(s || '').trim().toLowerCase();

function isAdminProfile(profile) {
  return Boolean(profile && (profile.userType === 'Admin' || profile.role === 'Admin'));
}

/** Resolve a user doc by uid, falling back to an email lookup. */
async function resolveUser(uid, email) {
  if (uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) return { uid, ...doc.data() };
    } catch (e) { /* ignore */ }
  }
  if (email) {
    try {
      const snap = await db.collection('users').get();
      const found = snap.docs.find(d => lc(d.data().email) === lc(email));
      if (found) return { uid: found.id, ...found.data() };
    } catch (e) { /* ignore */ }
  }
  return null;
}

/**
 * Builds the stakeholder map for an account and determines the sender's role
 * plus the exact list of recipients according to the routing rules.
 */
export async function resolveNotifyRouting(accountId, sender) {
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) {
    const err = new Error('Account not found');
    err.status = 404;
    throw err;
  }
  const account = { accountId, ...accountDoc.data() };

  const senderProfileDoc = await db.collection('users').doc(sender.uid).get();
  const senderProfile = senderProfileDoc.exists ? senderProfileDoc.data() : {};
  const senderEmail = lc(sender.email || senderProfile.email);

  const matchesSender = (id, email) =>
    (id && id === sender.uid) || (senderEmail && lc(email) === senderEmail);

  // ── Account owner ──
  const ownerUser = await resolveUser(account.ownerId, account.ownerEmail);
  const owner = ownerUser
    ? { uid: ownerUser.uid, name: ownerUser.name || account.ownerName || ownerUser.email, email: ownerUser.email }
    : null;

  // ── Key contact owners (grouped by owner, with the contacts they own) ──
  const contactsSnap = await db.collection('contacts').where('accountId', '==', accountId).get();
  const contacts = contactsSnap.docs.map(d => d.data());

  const contactOwnerMap = new Map(); // uid -> { uid, name, email, contacts: [] }
  for (const c of contacts) {
    if (!c.ownerId && !c.ownerEmail) continue;
    const u = await resolveUser(c.ownerId, c.ownerEmail);
    if (!u) continue;
    if (!contactOwnerMap.has(u.uid)) {
      contactOwnerMap.set(u.uid, { uid: u.uid, name: u.name || c.ownerName || u.email, email: u.email, contacts: [] });
    }
    contactOwnerMap.get(u.uid).contacts.push({ name: c.name, designation: c.designation || '' });
  }
  const keyContactOwners = [...contactOwnerMap.values()];

  // ── Sender role (owner takes precedence, then key-contact owner, then admin) ──
  let senderRole = null;
  if (owner && matchesSender(owner.uid, owner.email)) senderRole = 'Account Owner';
  else if (keyContactOwners.some(k => matchesSender(k.uid, k.email))) senderRole = 'Key Contact Owner';
  else if (isAdminProfile(senderProfile)) senderRole = 'Admin';

  // ── Recipients per routing rules ──
  const recipients = new Map(); // uid -> { uid, name, email, roles: [], contacts: [] }
  const add = (person, role) => {
    if (!person || matchesSender(person.uid, person.email)) return;
    const existing = recipients.get(person.uid) || { uid: person.uid, name: person.name, email: person.email, roles: [], contacts: [] };
    if (!existing.roles.includes(role)) existing.roles.push(role);
    if (person.contacts) existing.contacts.push(...person.contacts);
    recipients.set(person.uid, existing);
  };

  if (senderRole === 'Admin' || senderRole === 'Key Contact Owner') add(owner, 'Account Owner');
  if (senderRole) keyContactOwners.forEach(k => add(k, 'Key Contact Owner'));

  return {
    account,
    owner,
    keyContactOwners,
    sender: { uid: sender.uid, name: senderProfile.name || sender.name || sender.email, email: sender.email || senderProfile.email, role: senderRole },
    recipients: [...recipients.values()]
  };
}

/**
 * Sends the risk notification to all routed recipients.
 * @param {object} params - { accountId, risk: { riskId, title, severity, category, description, suggested } }
 * @param {object} sender - req.user
 */
export async function sendRiskNotification({ accountId, risk = {} }, sender) {
  const routing = await resolveNotifyRouting(accountId, sender);
  const { account, owner, keyContactOwners, recipients } = routing;
  const senderInfo = routing.sender;

  if (!senderInfo.role) {
    const err = new Error('Forbidden: only an Admin, the Account Owner or a Key Contact Owner can notify on this account.');
    err.status = 403;
    throw err;
  }
  if (recipients.length === 0) {
    const err = new Error('No other stakeholders are assigned to this account to notify.');
    err.status = 400;
    throw err;
  }

  // Live account snapshot
  const activeRisksSnap = await db.collection('risks').where('accountId', '==', accountId).get();
  const openRisks = activeRisksSnap.docs.map(d => d.data()).filter(r => r.status !== 'Resolved');

  const nowIso = new Date().toISOString();
  const riskTitle = risk.title || risk.category || 'Account risk';
  const severity = risk.severity || account.riskLevel || 'Medium';
  const accountUrlPath = `/accounts/${accountId}`;

  for (const r of recipients) {
    const others = recipients.filter(o => o.uid !== r.uid).map(o => `${o.name} (${o.roles.join(' & ')})`);
    await NotificationEngine.publishEvent(
      'risk_stakeholder_alert',
      {
        EmployeeName: r.name,
        RecipientRoles: r.roles.join(' & '),
        RecipientContacts: r.contacts,
        SenderName: senderInfo.name,
        SenderRole: senderInfo.role,
        CompanyName: account.companyName || 'Account',
        AccountOwnerName: owner?.name || account.ownerName || 'Unassigned',
        KeyContactOwnerNames: keyContactOwners.map(k => k.name),
        HealthScore: account.healthScore ?? null,
        RiskLevel: account.riskLevel || null,
        OpenRiskCount: openRisks.length,
        RiskTitle: riskTitle,
        RiskSeverity: severity,
        RiskCategory: risk.category || '',
        RiskDescription: risk.description || '',
        SuggestedAction: risk.suggested || '',
        AlsoNotified: others,
        SentAt: nowIso,
        AccountPath: accountUrlPath,
        AccountId: accountId,
        InAppMessage: `${senderInfo.name} (${senderInfo.role}) flagged a ${severity} risk on ${account.companyName}: "${riskTitle}"`
      },
      [r.uid],
      { relatedAccountId: accountId }
    );
  }

  // Persist "notified" state so the button stays in Notified state across reloads
  const riskKey = risk.riskId || risk.key || riskTitle;
  const logId = 'rn-' + Math.random().toString(36).substring(2, 11);
  await db.collection('risk_notifications').doc(logId).set({
    id: logId,
    accountId,
    riskKey,
    riskTitle,
    severity,
    senderUid: senderInfo.uid,
    senderName: senderInfo.name,
    senderRole: senderInfo.role,
    recipients: recipients.map(r => ({ uid: r.uid, name: r.name, roles: r.roles })),
    date: getSystemDateString(),
    time: getSystemTimeString(),
    createdAt: nowIso
  });

  if (risk.riskId) {
    try {
      const riskRef = db.collection('risks').doc(risk.riskId);
      const rd = await riskRef.get();
      if (rd.exists) await riskRef.update({ notifiedAt: nowIso, notifiedBy: senderInfo.name });
    } catch (e) { /* risk may be a computed/virtual one */ }
  }

  await logActivity(
    senderInfo.uid,
    senderInfo.name,
    'Notify Risk',
    `${senderInfo.role} notified ${recipients.map(r => r.name).join(', ')} about "${riskTitle}" on ${account.companyName}`
  );

  return {
    success: true,
    senderRole: senderInfo.role,
    recipients: recipients.map(r => ({ uid: r.uid, name: r.name, roles: r.roles })),
    riskKey,
    notifiedAt: nowIso
  };
}

/** Returns the risk keys already notified for an account (for persistent button state). */
export async function getNotifiedRiskKeys(accountId) {
  const snap = await db.collection('risk_notifications').where('accountId', '==', accountId).get();
  return [...new Set(snap.docs.map(d => d.data().riskKey).filter(Boolean))];
}
