/** Audit actions written by the auth module. */
export const AuthActions = {
  loginSuccess: 'auth.login.success',
  loginFailed: 'auth.login.failed',
  loginLocked: 'auth.login.locked',
  logout: 'auth.session.signed_out',
  sessionExtended: 'auth.session.extended',
  sessionRevoked: 'auth.session.revoked',
  otherSessionsRevoked: 'auth.session.others_revoked',
  passwordChanged: 'auth.password.changed',
  passwordResetRequested: 'auth.password.reset_requested',
  passwordReset: 'auth.password.reset',
  setupOrganization: 'setup.organization.completed',
  profileUpdated: 'profile.personal.updated',
  preferencesUpdated: 'profile.preferences.updated',
  adminCreated: 'admin.superadmin.created',
  adminRecovered: 'admin.superadmin.recovered',
} as const;
