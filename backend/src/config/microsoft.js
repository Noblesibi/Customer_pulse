import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is resolved reliably from backend root regardless of invocation directory
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const required = [
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

// Primary / Production Microsoft App configuration (Preserved for Outlook Mail.Read)
export const microsoftConfig = {
  tenantId: process.env.MICROSOFT_TENANT_ID,
  clientId: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,
  graphBaseUrl: 'https://graph.microsoft.com/v1.0',
};

// CustomerPulse-Dev Microsoft App configuration (Contacts.Read & Teams Transcripts)
const devTenantId = process.env.MICROSOFT_DEV_TENANT_ID || process.env.MICROSOFT_TENANT_ID;
const devClientId = process.env.MICROSOFT_DEV_CLIENT_ID || null;
const devClientSecret = process.env.MICROSOFT_DEV_CLIENT_SECRET || null;

const isDevConfigured = Boolean(
  devClientId &&
  devClientSecret &&
  !devClientId.startsWith('<') &&
  !devClientSecret.startsWith('<')
);

export const microsoftDevConfig = {
  tenantId: devTenantId,
  clientId: devClientId,
  clientSecret: devClientSecret,
  authority: `https://login.microsoftonline.com/${devTenantId}`,
  graphBaseUrl: 'https://graph.microsoft.com/v1.0',
  isConfigured: isDevConfigured,
};
