import ldap from 'ldapjs';

/**
 * Authenticates a user against the LDAP / Active Directory server configured in environment variables.
 * Performs a two-step authentication bind:
 * 1. Binds with system credentials (LDAP_BIND_DN) to query the user's distinguished name (DN)
 * 2. Binds with the user's actual DN and password to verify credentials
 * 
 * @param {string} username - User login email or username
 * @param {string} password - User password
 * @returns {Promise<object|null>} Authentication result or null if LDAP is disabled
 */
export async function authenticateLdapUser(username, password) {
  // Check if LDAP is enabled
  if (!process.env.LDAP_ENABLED || process.env.LDAP_ENABLED === 'false') {
    return null; // Bypass LDAP
  }

  const url = process.env.LDAP_URL || 'ldap://localhost:389';
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPassword = process.env.LDAP_BIND_PASSWORD;
  const searchBase = process.env.LDAP_SEARCH_BASE;
  const filterTemplate = process.env.LDAP_USER_SEARCH_FILTER || '(sAMAccountName={{username}})';

  console.log(`🔍 Attempting LDAP authentication for: ${username} at ${url}`);

  return new Promise((resolve) => {
    let client;
    try {
      client = ldap.createClient({ 
        url,
        timeout: 5000,
        connectTimeout: 5000
      });
    } catch (err) {
      console.error('❌ Failed to create LDAP client:', err.message);
      return resolve({ authenticated: false, error: 'LDAP client creation failed: ' + err.message });
    }

    client.on('error', (err) => {
      console.error('❌ LDAP Client connection error:', err.message);
      resolve({ authenticated: false, error: 'LDAP connection error: ' + err.message });
    });

    // Step 1: Bind with admin/service account to lookup the user's DN
    client.bind(bindDn, bindPassword, (err) => {
      if (err) {
        console.error('❌ LDAP Admin bind failed:', err.message);
        client.destroy();
        return resolve({ authenticated: false, error: 'LDAP service account bind failed: ' + err.message });
      }

      // Format search filter replacing email/username
      // If user enters email (e.g. employee@pulse.com), extract username part or search by mail
      const cleanUsername = username.split('@')[0];
      const filter = filterTemplate
        .replace('{{username}}', cleanUsername)
        .replace('{{email}}', username);

      const searchOptions = {
        filter,
        scope: 'sub',
        attributes: ['dn', 'mail', 'cn', 'displayName', 'department', 'title', 'memberOf']
      };

      client.search(searchBase, searchOptions, (searchErr, res) => {
        if (searchErr) {
          console.error('❌ LDAP Search initiation failed:', searchErr.message);
          client.destroy();
          return resolve({ authenticated: false, error: 'LDAP search initiation failed: ' + searchErr.message });
        }

        let userEntry = null;

        res.on('searchEntry', (entry) => {
          userEntry = entry.object;
        });

        res.on('error', (resErr) => {
          console.error('❌ LDAP Search stream error:', resErr.message);
          client.destroy();
          resolve({ authenticated: false, error: 'LDAP search error: ' + resErr.message });
        });

        res.on('end', (result) => {
          if (!userEntry) {
            console.log(`⚠️ User not found in LDAP search base for: ${username}`);
            client.destroy();
            return resolve({ authenticated: false, error: 'User not found in LDAP directory' });
          }

          const userDn = userEntry.dn || userEntry.utf8Name;
          
          // Step 2: Bind with the found User's DN and the password they entered
          client.bind(userDn, password, (userBindErr) => {
            client.destroy();
            if (userBindErr) {
              console.log(`❌ LDAP bind verification failed for user DN: ${userDn}`);
              return resolve({ authenticated: false, error: 'Invalid LDAP credentials' });
            }
            
            console.log(`🎉 LDAP authentication successful for user DN: ${userDn}`);
            
            // Map LDAP groups to CRM application roles
            let role = 'Employee';
            const memberOf = userEntry.memberOf || [];
            const groups = Array.isArray(memberOf) ? memberOf : [memberOf];
            
            const isGroupAdmin = groups.some(g => g.toLowerCase().includes('admin') || g.toLowerCase().includes('pulse-admin'));
            const isGroupExec = groups.some(g => g.toLowerCase().includes('exec') || g.toLowerCase().includes('pulse-exec'));
            const isGroupManager = groups.some(g => g.toLowerCase().includes('manager') || g.toLowerCase().includes('pulse-manager'));
            
            if (isGroupAdmin) role = 'Admin';
            else if (isGroupExec) role = 'Executive';
            else if (isGroupManager) role = 'Sales Manager';
            else {
              // Standard domain fallback mapping if no specific security groups
              if (username.endsWith('@pulseexecutive.com')) role = 'Executive';
              else if (username.endsWith('@pulsesales.com')) role = 'Sales Manager';
              else if (username.endsWith('@pulse.com') && cleanUsername.includes('admin')) role = 'Admin';
            }

            resolve({
              authenticated: true,
              user: {
                username: cleanUsername,
                dn: userDn,
                email: userEntry.mail || username,
                name: userEntry.displayName || userEntry.cn || cleanUsername,
                role,
                department: userEntry.department || 'Corporate',
                position: userEntry.title || 'Corporate Professional'
              }
            });
          });
        });
      });
    });
  });
}
