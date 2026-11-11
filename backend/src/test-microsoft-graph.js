import { getMicrosoftAccessToken } from './services/microsoftGraph.service.js';

try {
  const token = await getMicrosoftAccessToken();

  console.log('Microsoft Graph authentication successful.');
  console.log('Token received:', Boolean(token));
  process.exit(0);
} catch (error) {
  console.error('Microsoft Graph authentication failed.');
  console.error(error.message);
  process.exit(1);
}
