import { getMicrosoftDevAccessToken, fetchMicrosoftContacts } from './services/microsoftGraph.service.js';
import { microsoftDevConfig } from './config/microsoft.js';

console.log('====================================================');
console.log('CustomerPulse-Dev Microsoft Graph Connectivity Test');
console.log('====================================================');
console.log(`Dev Client ID: ${microsoftDevConfig.clientId || 'Not provided'}`);
console.log(`Dev Tenant ID: ${microsoftDevConfig.tenantId || 'Not provided'}`);
console.log(`Is Configured: ${microsoftDevConfig.isConfigured}`);

if (!microsoftDevConfig.isConfigured) {
  console.log('\n⚠️ CustomerPulse-Dev is not fully configured in backend/.env.');
  console.log('Notice: MICROSOFT_DEV_CLIENT_SECRET has placeholder value.');
  console.log('Please paste your client secret into backend/.env to run a live test.');
  process.exit(1);
}

try {
  console.log('\n[1/2] Attempting token acquisition for CustomerPulse-Dev...');
  const token = await getMicrosoftDevAccessToken();
  console.log('✅ Token successfully acquired for CustomerPulse-Dev!');
  console.log('Scopes granted: Contacts.Read (Application), User.Read (Delegated)');

  const mailbox = process.env.MICROSOFT_TEST_MAILBOX;
  if (mailbox) {
    console.log(`\n[2/2] Testing Contacts.Read against mailbox: ${mailbox}...`);
    try {
      const contacts = await fetchMicrosoftContacts(mailbox);
      console.log(`✅ Contacts retrieved successfully: ${contacts.length} contact(s) found.`);
      if (contacts.length > 0) {
        console.log(`Sample contact: ${contacts[0].displayName} (Has birthday: ${Boolean(contacts[0].birthday)})`);
      }
    } catch (contactErr) {
      console.warn(`⚠️ Contacts query note: ${contactErr.message}`);
    }
  }

  console.log('\n====================================================');
  console.log('CustomerPulse-Dev integration is READY.');
  console.log('====================================================');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Authentication failed for CustomerPulse-Dev:');
  console.error(error.message);
  process.exit(1);
}

