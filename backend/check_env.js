import dotenv from 'dotenv';
dotenv.config();
console.log('Parsed LDAP_BIND_PASSWORD:', JSON.stringify(process.env.LDAP_BIND_PASSWORD));
