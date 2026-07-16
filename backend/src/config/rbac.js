/**
 * RBAC — Role-Based Access Control for Customer Pulse CRM
 * Nest Digital Internal — Single source of truth for roles and permissions.
 *
 * Usage in routes:
 *   import { requirePermission } from '../middleware/auth.middleware.js';
 *   import { PERMISSIONS } from '../config/rbac.js';
 *   router.get('/sensitive', authenticateToken, requirePermission(PERMISSIONS.VIEW_ALL_USERS), handler);
 */

export const ROLES = {
  ADMIN: 'Admin',
  EXECUTIVE: 'Executive',
  MANAGER: 'Sales Manager',
  EMPLOYEE: 'Employee'
};

/**
 * Permission keys mapped to the list of roles allowed to exercise them.
 * Keep this as the authoritative policy document — all route-level guards
 * should reference keys here rather than hardcoding role strings.
 */
export const PERMISSIONS = {
  // Accounts
  VIEW_ALL_ACCOUNTS:      [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER],
  VIEW_OWN_ACCOUNTS:      [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],
  CREATE_ACCOUNT:         [ROLES.ADMIN, ROLES.EXECUTIVE],
  EDIT_ACCOUNT:           [ROLES.ADMIN, ROLES.EXECUTIVE],
  DELETE_ACCOUNT:         [ROLES.ADMIN],

  // Contacts
  VIEW_CONTACTS:          [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],
  MANAGE_CONTACTS:        [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER],
  DELETE_CONTACT:         [ROLES.ADMIN, ROLES.EXECUTIVE],

  // Interactions
  VIEW_INTERACTIONS:      [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],
  CREATE_INTERACTION:     [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],
  DELETE_INTERACTION:     [ROLES.ADMIN, ROLES.EXECUTIVE],

  // Risks
  VIEW_RISKS:             [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER],
  MANAGE_RISKS:           [ROLES.ADMIN, ROLES.EXECUTIVE],
  DELETE_RISK:            [ROLES.ADMIN],

  // Notifications
  VIEW_NOTIFICATIONS:     [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],

  // Users & Admin
  VIEW_ALL_USERS:         [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],
  MANAGE_USERS:           [ROLES.ADMIN],
  DELETE_USER:            [ROLES.ADMIN],

  // Reports & Dashboards
  VIEW_DASHBOARD:         [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE],
  VIEW_REPORTS:           [ROLES.ADMIN, ROLES.EXECUTIVE],
  VIEW_EXECUTIVE_SUMMARY: [ROLES.ADMIN, ROLES.EXECUTIVE],

  // Activity Logs (audit trail)
  VIEW_ACTIVITY_LOGS:     [ROLES.ADMIN],

  // Staff Directory (for @mentions and task assignment)
  VIEW_STAFF_DIRECTORY:   [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.EMPLOYEE]
};

/**
 * Maps a userType string to the corresponding CRM permission role.
 * Used during LDAP auto-provisioning and user creation.
 *
 * @param {string} userType - The user's organizational type
 * @returns {string} The CRM role string
 */
export function userTypeToRole(userType) {
  if (!userType) return ROLES.EMPLOYEE;
  if (['CEO', 'Functional Head'].includes(userType)) return ROLES.EXECUTIVE;
  if ([
    'BU Head', 'Delivery Head', 'Delivery Manager',
    'Sales Manager', 'Account Manager', 'Project Manager'
  ].includes(userType)) return ROLES.MANAGER;
  if (userType === 'Admin') return ROLES.ADMIN;
  return ROLES.EMPLOYEE;
}
