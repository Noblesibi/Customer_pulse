import ldap from 'ldapjs';

/**
 * Helper to convert ldapjs 3.x SearchResultEntry to a flat object.
 */
function entryToObject(entry) {
  const dnString = entry.objectName ? entry.objectName.toString() : '';
  const obj = {
    dn: dnString,
    distinguishedName: dnString
  };
  
  const attrs = entry.pojo?.attributes || [];
  for (const attr of attrs) {
    const name = attr.type;
    const values = attr.values || [];
    if (values.length === 1) {
      obj[name] = values[0];
    } else if (values.length > 1) {
      obj[name] = values;
    } else {
      obj[name] = null;
    }
  }
  return obj;
}

/**
 * Authenticates a user against Nest Digital's Active Directory (LDAP).
 *
 * AD Configuration (Nest Digital):
 *   Server:          10.15.0.25:389
 *   Base DN:         DC=chn,DC=nestgroup,DC=net
 *   Bind Attribute:  userPrincipalName  (bind using user@nestgroup.net format)
 *   Login Attribute: sAMAccountName     (users type their short login name or full email)
 *
 * Authentication flow:
 *   1. Bind with service account credentials (LDAP_BIND_DN = UPN format)
 *   2. Search for the target user using sAMAccountName filter
 *   3. Bind again using the found user's userPrincipalName (or constructed UPN)
 *      to verify their password
 *
 * @param {string} username - User's email or sAMAccountName (e.g. amina.rashad or amina.rashad@nestgroup.net)
 * @param {string} password - User's AD password
 * @returns {Promise<object>} Authentication result with user profile
 */
export async function authenticateLdapUser(username, password) {
  if (!process.env.LDAP_ENABLED || process.env.LDAP_ENABLED === 'false') {
    return null; // LDAP disabled — fall through to local DB auth
  }

  // ── MOCK MODE ──────────────────────────────────────────────────────────────
  // Simulates the LDAP → JWT flow without a real LDAP server.
  // Useful for development and CI. Enable with LDAP_ENABLED=mock in .env
  if (process.env.LDAP_ENABLED === 'mock') {
    return simulateLdapAuth(username, password);
  }

  // ── REAL LDAP (Active Directory) ───────────────────────────────────────────
  const url        = process.env.LDAP_URL        || 'ldap://10.15.0.25:389';
  const bindDn     = process.env.LDAP_BIND_DN;   // UPN format: serviceaccount@nestgroup.net
  const bindPwd    = process.env.LDAP_BIND_PASSWORD;
  const searchBase = process.env.LDAP_SEARCH_BASE || 'DC=chn,DC=nestgroup,DC=net';
  const loginAttr  = process.env.LDAP_LOGIN_ATTRIBUTE || 'sAMAccountName';
  const bindAttr   = process.env.LDAP_BIND_ATTRIBUTE  || 'userPrincipalName';
  const domain     = process.env.LDAP_DOMAIN          || 'nestgroup.net';



  // Normalize username: preserve full email / UPN if available, or append domain
  const cleanUsername = (username || '').trim().toLowerCase();
  const userUpn = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@${domain}`;
  const sAMAccountName = cleanUsername.includes('@') ? cleanUsername.split('@')[0] : cleanUsername;

  // Determine query value for search based on LDAP_LOGIN_ATTRIBUTE (userPrincipalName or sAMAccountName)
  const queryValue = loginAttr === 'userPrincipalName' ? userUpn : sAMAccountName;

  console.log(`🔍 LDAP auth attempt — ${loginAttr}: ${queryValue} | server: ${url}`);

  return new Promise((resolve) => {
    let client;
    try {
      client = ldap.createClient({
        url,
        timeout: 8000,
        connectTimeout: 8000,
        reconnect: false
      });
    } catch (err) {
      console.error('❌ LDAP client creation failed:', err.message);
      return resolve({ authenticated: false, error: 'LDAP client error: ' + err.message });
    }

    client.on('error', (err) => {
      console.error('❌ LDAP connection error:', err.message);
      resolve({ authenticated: false, error: 'LDAP connection failed: ' + err.message });
    });

    const searchAndAuthenticateUser = (boundClient, userBindTarget) => {
      const searchFilter = process.env.LDAP_USER_SEARCH_FILTER
        ? process.env.LDAP_USER_SEARCH_FILTER.replace('{{username}}', queryValue)
        : `(${loginAttr}=${queryValue})`;

      const searchOptions = {
        filter: searchFilter,
        scope: 'sub',
        attributes: [
          'dn', 'mail', 'cn', 'displayName', 'sAMAccountName',
          'userPrincipalName', 'department', 'title', 'memberOf', 'distinguishedName'
        ]
      };

      boundClient.search(searchBase, searchOptions, (searchErr, searchRes) => {
        if (searchErr) {
          console.warn('⚠️  LDAP search failed after user bind, using default profile:', searchErr.message);
          boundClient.destroy();
          return resolve({
            authenticated: true,
            user: {
              username:   sAMAccountName,
              upn:        userUpn,
              email:      userUpn,
              name:       sAMAccountName,
              role:       'Employee',
              department: 'Corporate',
              position:   'Nest Digital Professional'
            }
          });
        }

        let userEntry = null;
        searchRes.on('searchEntry', (entry) => {
          if (!userEntry) userEntry = entryToObject(entry);
        });

        searchRes.on('error', (err) => {
          console.warn('⚠️  LDAP search stream error:', err.message);
        });

        searchRes.on('end', () => {
          boundClient.destroy();
          const entry = userEntry || {};
          const role = mapAdGroupsToRole(entry.memberOf, cleanUsername, domain);

          resolve({
            authenticated: true,
            user: {
              username:   sAMAccountName,
              upn:        entry.userPrincipalName || userUpn,
              email:      entry.mail || entry.userPrincipalName || userUpn,
              name:       entry.displayName || entry.cn || sAMAccountName,
              role,
              department: entry.department || 'Corporate',
              position:   entry.title || 'Nest Digital Professional'
            }
          });
        });
      });
    };

    // Helper for direct user bind attempt
    const attemptDirectUserBind = () => {
      console.log(`🔐 Attempting direct user bind fallback: ${userUpn}`);
      client.bind(userUpn, password, (userBindErr) => {
        if (userBindErr) {
          console.warn(`❌ Direct user bind failed for: ${userUpn} (${userBindErr.message})`);
          client.destroy();
          return resolve({ authenticated: false, error: 'Invalid AD credentials' });
        }

        console.log(`✅ Direct user LDAP bind successful: ${userUpn}`);
        searchAndAuthenticateUser(client, userUpn);
      });
    };

    // ── Step 1: Try Service Account Bind First (if configured) ─────────────
    if (bindDn && bindPwd) {
      client.bind(bindDn, bindPwd, (bindErr) => {
        if (bindErr) {
          console.warn(`⚠️ Service account bind failed (${bindErr.message}). Falling back to direct user bind...`);
          return attemptDirectUserBind();
        }

        // Service account bound successfully -> search for user entry
        const searchFilter = process.env.LDAP_USER_SEARCH_FILTER
          ? process.env.LDAP_USER_SEARCH_FILTER.replace('{{username}}', queryValue)
          : `(${loginAttr}=${queryValue})`;

        const searchOptions = {
          filter: searchFilter,
          scope: 'sub',
          attributes: [
            'dn', 'mail', 'cn', 'displayName', 'sAMAccountName',
            'userPrincipalName', 'department', 'title', 'memberOf', 'distinguishedName'
          ]
        };

        client.search(searchBase, searchOptions, (searchErr, searchRes) => {
          if (searchErr) {
            console.error('❌ LDAP search failed:', searchErr.message);
            client.destroy();
            return resolve({ authenticated: false, error: 'LDAP search failed: ' + searchErr.message });
          }

          let userEntry = null;

          searchRes.on('searchEntry', (entry) => {
            if (!userEntry) userEntry = entryToObject(entry);
          });

          searchRes.on('error', (err) => {
            console.error('❌ LDAP search stream error:', err.message);
          });

          searchRes.on('end', () => {
            if (!userEntry) {
              console.warn(`⚠️ User not found via service search. Attempting direct user bind...`);
              return attemptDirectUserBind();
            }

            // ── Step 2: Bind as the user to verify password ──────────────
            let userBindDn;
            if (bindAttr === 'userPrincipalName') {
              userBindDn = userEntry.userPrincipalName || userUpn;
            } else {
              userBindDn = userEntry.distinguishedName || userEntry.dn || userEntry.userPrincipalName || userUpn;
            }

            console.log(`🔐 Verifying user password via bind: ${userBindDn}`);

            client.bind(userBindDn, password, (userBindErr) => {
              client.destroy();

              if (userBindErr) {
                console.warn(`❌ User password bind failed for: ${userBindDn}`);
                return resolve({ authenticated: false, error: 'Invalid AD credentials' });
              }

              console.log(`✅ LDAP authentication successful: ${userBindDn}`);

              const role = mapAdGroupsToRole(userEntry.memberOf, cleanUsername, domain);

              resolve({
                authenticated: true,
                user: {
                  username:   sAMAccountName,
                  upn:        userEntry.userPrincipalName || userUpn,
                  email:      userEntry.mail || userEntry.userPrincipalName || userUpn,
                  name:       userEntry.displayName || userEntry.cn || sAMAccountName,
                  role,
                  department: userEntry.department || 'Corporate',
                  position:   userEntry.title       || 'Nest Digital Professional'
                }
              });
            });
          });
        });
      });
    } else {
      attemptDirectUserBind();
    }
  });
}

/**
 * Maps Active Directory group memberships (memberOf) to CRM RBAC roles.
 * Groups are matched by partial name — configure your AD groups to include
 * one of these markers for automatic role assignment:
 *
 *   "pulse-admin"   or "CRM-Admin"   → Admin
 *   "pulse-exec"    or "CRM-Exec"    or "C-Suite"    → Executive
 *   "pulse-manager" or "CRM-Manager" or "SalesTeam"  → Sales Manager
 *   (default)                                         → Employee
 *
 * @param {string|string[]} memberOf - The memberOf attribute from AD entry
 * @param {string} username - Username (for domain-based fallback)
 * @param {string} domain   - The AD domain (e.g. nestgroup.net)
 * @returns {string} CRM role string
 */
function mapAdGroupsToRole(memberOf, username, domain) {
  const groups = memberOf
    ? (Array.isArray(memberOf) ? memberOf : [memberOf]).map(g => g.toLowerCase())
    : [];

  const isAdmin   = groups.some(g => g.includes('pulse-admin')   || g.includes('crm-admin'));
  const isExec    = groups.some(g => g.includes('pulse-exec')    || g.includes('crm-exec')    || g.includes('c-suite')   || g.includes('executive'));
  const isManager = groups.some(g => g.includes('pulse-manager') || g.includes('crm-manager') || g.includes('salesteam') || g.includes('manager'));

  if (isAdmin)   return 'Admin';
  if (isExec)    return 'Executive';
  if (isManager) return 'Sales Manager';

  // Domain-based fallback (if no specific group is set up yet)
  if (username.endsWith('@pulseexecutive.com')) return 'Executive';
  if (username.endsWith('@pulsesales.com'))     return 'Sales Manager';

  return 'Employee';
}

/**
 * Mock LDAP authentication (LDAP_ENABLED=mock).
 * Validates against the hardcoded seeded user list so the full LDAP → JWT
 * flow can be tested end-to-end without a live AD server.
 *
 * @param {string} username - Login username or email
 * @param {string} password - Password
 * @returns {object} Authentication result
 */
function simulateLdapAuth(username, password) {
  const MOCK_LDAP_USERS = {
    'amina.rashad@nestgroup.net': { email: 'amina.rashad@nestgroup.net', name: 'Amina Rashad',   role: 'Employee',     department: 'Engineering', position: 'CRM Professional' },
    'amina.rashad':               { email: 'amina.rashad@nestgroup.net', name: 'Amina Rashad',   role: 'Employee',     department: 'Engineering', position: 'CRM Professional' },
    'admin@pulse.com':            { email: 'admin@pulse.com',            name: 'Admin User',      role: 'Admin',        department: 'IT',          position: 'System Administrator' },
    'admin':                      { email: 'admin@pulse.com',            name: 'Admin User',      role: 'Admin',        department: 'IT',          position: 'System Administrator' },
    'executive@pulse.com':        { email: 'executive@pulse.com',        name: 'Executive User',  role: 'Executive',    department: 'Management',  position: 'Chief Executive Officer' },
    'executive':                  { email: 'executive@pulse.com',        name: 'Executive User',  role: 'Executive',    department: 'Management',  position: 'Chief Executive Officer' },
    'manager@pulse.com':          { email: 'manager@pulse.com',          name: 'Manager User',    role: 'Sales Manager',department: 'Sales',       position: 'Logistics Division Lead' },
    'manager':                    { email: 'manager@pulse.com',          name: 'Manager User',    role: 'Sales Manager',department: 'Sales',       position: 'Logistics Division Lead' },
    'employee@pulse.com':         { email: 'employee@pulse.com',         name: 'Employee User',   role: 'Employee',     department: 'Engineering', position: 'Frontend Engineer' },
    'employee':                   { email: 'employee@pulse.com',         name: 'Employee User',   role: 'Employee',     department: 'Engineering', position: 'Frontend Engineer' },
  };

  const MOCK_LDAP_PASSWORDS = {
    'amina.rashad@nestgroup.net': 'nestgroup',
    'amina.rashad':               'nestgroup',
    'admin@pulse.com':            'admin123',
    'admin':                      'admin123',
    'executive@pulse.com':        'exec123',
    'executive':                  'exec123',
    'manager@pulse.com':          'manager123',
    'manager':                    'manager123',
    'employee@pulse.com':         'employee123',
    'employee':                   'employee123'
  };

  const cleanUser      = (username || '').trim().toLowerCase();
  const sAMAccountName = cleanUser.includes('@') ? cleanUser.split('@')[0] : cleanUser;

  const userProfile = MOCK_LDAP_USERS[cleanUser] || MOCK_LDAP_USERS[sAMAccountName];
  const expectedPwd = MOCK_LDAP_PASSWORDS[cleanUser] || MOCK_LDAP_PASSWORDS[sAMAccountName];

  if (!userProfile || !expectedPwd || expectedPwd !== password) {
    return { authenticated: false, error: 'Invalid mock LDAP credentials' };
  }

  console.log(`🎭 Mock LDAP authenticated: ${cleanUser}`);
  return {
    authenticated: true,
    user: {
      username:   sAMAccountName,
      upn:        userProfile.email,
      email:      userProfile.email,
      name:       userProfile.name,
      role:       userProfile.role,
      department: userProfile.department,
      position:   userProfile.position
    }
  };
}
