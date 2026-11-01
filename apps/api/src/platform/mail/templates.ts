/**
 * Email templates as plain functions (text and HTML). Phase 4 moves them to React Email with
 * the brand colour and logo from Settings; the names and parameters stay the same.
 */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export type EmailTemplate =
  | {
      name: 'password-reset';
      params: { appName: string; fullName: string; link: string; minutes: number };
    }
  | { name: 'password-changed'; params: { appName: string; fullName: string; when: string } }
  | { name: 'account-locked'; params: { appName: string; fullName: string; minutes: number } }
  | {
      name: 'new-device-sign-in';
      params: { appName: string; fullName: string; device: string; ip: string; when: string };
    }
  | { name: 'two-factor-enabled'; params: { appName: string; fullName: string; when: string } }
  | { name: 'two-factor-disabled'; params: { appName: string; fullName: string; when: string } }
  | {
      name: 'two-factor-reset-by-admin';
      params: { appName: string; fullName: string; when: string };
    }
  | {
      name: 'recovery-code-used';
      params: { appName: string; fullName: string; when: string; left: number };
    }
  | {
      name: 'two-factor-reminder';
      params: { appName: string; fullName: string; link: string; day: number };
    }
  | {
      name: 'invitation';
      params: {
        appName: string;
        fullName: string;
        inviterName: string;
        organizationName: string;
        link: string;
        hours: number;
      };
    }
  | { name: 'account-disabled'; params: { appName: string; fullName: string } }
  | {
      name: 'email-change';
      params: { appName: string; fullName: string; link: string; minutes: number };
    }
  | { name: 'test'; params: { appName: string } };

export type EmailTemplateName = EmailTemplate['name'];

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function layout(
  appName: string,
  title: string,
  paragraphs: string[],
  button?: { text: string; link: string },
): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937">${p}</p>`)
    .join('');
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.link)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(button.text)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:32px">
<tr><td><h1 style="margin:0 0 24px;font-size:20px;color:#111827">${escapeHtml(appName)}</h1>
<h2 style="margin:0 0 16px;font-size:18px;color:#111827">${escapeHtml(title)}</h2>${body}${cta}
<p style="margin:24px 0 0;font-size:13px;color:#6b7280">If you did not expect this email, you can ignore it.</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function renderEmail(template: EmailTemplate): RenderedEmail {
  switch (template.name) {
    case 'password-reset': {
      const { appName, fullName, link, minutes } = template.params;
      return {
        subject: `Reset your ${appName} password`,
        text: `Hello ${fullName},\n\nUse this link to choose a new password. It works once and expires in ${minutes} minutes:\n${link}\n\nIf you did not ask for this, ignore this email; your password is unchanged.`,
        html: layout(
          appName,
          'Reset your password',
          [
            `Hello ${escapeHtml(fullName)},`,
            `Use the button below to choose a new password. The link works once and expires in ${minutes} minutes.`,
            'If you did not ask for this, ignore this email; your password is unchanged.',
          ],
          { text: 'Choose a new password', link },
        ),
      };
    }
    case 'password-changed': {
      const { appName, fullName, when } = template.params;
      return {
        subject: `Your ${appName} password was changed`,
        text: `Hello ${fullName},\n\nYour password was changed on ${when}. Every other session was signed out.\n\nIf this was not you, use "Forgot password?" on the sign-in page straight away.`,
        html: layout(appName, 'Your password was changed', [
          `Hello ${escapeHtml(fullName)},`,
          `Your password was changed on ${escapeHtml(when)}. Every other session was signed out.`,
          'If this was not you, use “Forgot password?” on the sign-in page straight away.',
        ]),
      };
    }
    case 'account-locked': {
      const { appName, fullName, minutes } = template.params;
      return {
        subject: `${appName}: sign-in locked for ${minutes} minutes`,
        text: `Hello ${fullName},\n\nToo many wrong passwords were entered for your account, so sign-in is locked for ${minutes} minutes.\n\nIf this was not you, choose a new password with "Forgot password?" once the lock ends.`,
        html: layout(appName, `Sign-in locked for ${minutes} minutes`, [
          `Hello ${escapeHtml(fullName)},`,
          `Too many wrong passwords were entered for your account, so sign-in is locked for ${minutes} minutes.`,
          'If this was not you, choose a new password with “Forgot password?” once the lock ends.',
        ]),
      };
    }
    case 'new-device-sign-in': {
      const { appName, fullName, device, ip, when } = template.params;
      return {
        subject: `New sign-in to ${appName}`,
        text: `Hello ${fullName},\n\nA new sign-in happened on ${when} from ${device} (${ip}).\n\nIf this was you, nothing to do. If not, change your password now and sign out other sessions from Profile → Security.`,
        html: layout(appName, 'New sign-in', [
          `Hello ${escapeHtml(fullName)},`,
          `A new sign-in happened on ${escapeHtml(when)} from ${escapeHtml(device)} (${escapeHtml(ip)}).`,
          'If this was you, nothing to do. If not, change your password now and sign out other sessions from Profile → Security.',
        ]),
      };
    }
    case 'two-factor-enabled': {
      const { appName, fullName, when } = template.params;
      return {
        subject: `Two-step verification is on for your ${appName} account`,
        text: `Hello ${fullName},\n\nTwo-step verification was turned on for your account on ${when}. Keep your recovery codes somewhere safe.\n\nIf this was not you, sign in and check Profile → Security straight away.`,
        html: layout(appName, 'Two-step verification is on', [
          `Hello ${escapeHtml(fullName)},`,
          `Two-step verification was turned on for your account on ${escapeHtml(when)}. Keep your recovery codes somewhere safe.`,
          'If this was not you, sign in and check Profile → Security straight away.',
        ]),
      };
    }
    case 'two-factor-disabled': {
      const { appName, fullName, when } = template.params;
      return {
        subject: `Two-step verification was turned off for your ${appName} account`,
        text: `Hello ${fullName},\n\nTwo-step verification was turned off on ${when}. Your account is now protected by your password alone.\n\nIf this was not you, change your password now and turn it back on.`,
        html: layout(appName, 'Two-step verification is off', [
          `Hello ${escapeHtml(fullName)},`,
          `Two-step verification was turned off on ${escapeHtml(when)}. Your account is now protected by your password alone.`,
          'If this was not you, change your password now and turn it back on.',
        ]),
      };
    }
    case 'two-factor-reset-by-admin': {
      const { appName, fullName, when } = template.params;
      return {
        subject: `An administrator reset two-step verification on your ${appName} account`,
        text: `Hello ${fullName},\n\nAn administrator removed two-step verification from your account on ${when}, usually because of a lost phone. Sign in with your password and set it up again from Profile → Security.`,
        html: layout(appName, 'Two-step verification was reset', [
          `Hello ${escapeHtml(fullName)},`,
          `An administrator removed two-step verification from your account on ${escapeHtml(when)}, usually because of a lost phone.`,
          'Sign in with your password and set it up again from Profile → Security.',
        ]),
      };
    }
    case 'recovery-code-used': {
      const { appName, fullName, when, left } = template.params;
      return {
        subject: `A recovery code was used on your ${appName} account`,
        text: `Hello ${fullName},\n\nA recovery code was used to sign in on ${when}. You have ${left} left.\n\nIf this was not you, change your password and make new recovery codes now.`,
        html: layout(appName, 'A recovery code was used', [
          `Hello ${escapeHtml(fullName)},`,
          `A recovery code was used to sign in on ${escapeHtml(when)}. You have ${left} left.`,
          'If this was not you, change your password and make new recovery codes now.',
        ]),
      };
    }
    case 'two-factor-reminder': {
      const { appName, fullName, link, day } = template.params;
      return {
        subject: `Protect your ${appName} account with two-step verification`,
        text: `Hello ${fullName},\n\nYour account has been open for ${day} day${day === 1 ? '' : 's'} without two-step verification. It takes two minutes with an authenticator app:\n${link}`,
        html: layout(
          appName,
          'Protect your account',
          [
            `Hello ${escapeHtml(fullName)},`,
            `Your account has been open for ${day} day${day === 1 ? '' : 's'} without two-step verification. It takes two minutes with an authenticator app on your phone.`,
          ],
          { text: 'Set up two-step verification', link },
        ),
      };
    }
    case 'invitation': {
      const { appName, fullName, inviterName, organizationName, link, hours } = template.params;
      return {
        subject: `${inviterName} invited you to ${organizationName} on ${appName}`,
        text: `Hello ${fullName},\n\n${inviterName} has invited you to join ${organizationName} on ${appName}. Choose your password with this link; it works once and expires in ${hours} hours:\n${link}\n\nIf you were not expecting this, ignore this email.`,
        html: layout(
          appName,
          `You are invited to ${organizationName}`,
          [
            `Hello ${escapeHtml(fullName)},`,
            `${escapeHtml(inviterName)} has invited you to join ${escapeHtml(organizationName)} on ${escapeHtml(appName)}. Choose your password with the button below; the link works once and expires in ${hours} hours.`,
          ],
          { text: 'Choose my password', link },
        ),
      };
    }
    case 'account-disabled': {
      const { appName, fullName } = template.params;
      return {
        subject: `Your ${appName} account was disabled`,
        text: `Hello ${fullName},\n\nAn administrator disabled your ${appName} account and you were signed out everywhere. If you think this is a mistake, speak to your administrator.`,
        html: layout(appName, 'Your account was disabled', [
          `Hello ${escapeHtml(fullName)},`,
          `An administrator disabled your ${escapeHtml(appName)} account and you were signed out everywhere. If you think this is a mistake, speak to your administrator.`,
        ]),
      };
    }
    case 'email-change': {
      const { appName, fullName, link, minutes } = template.params;
      return {
        subject: `Confirm your new email for ${appName}`,
        text: `Hello ${fullName},\n\nConfirm that this is your new email address for ${appName}. The link works once and expires in ${minutes} minutes:\n${link}\n\nIf you did not ask for this, ignore this email; nothing changes.`,
        html: layout(
          appName,
          'Confirm your new email',
          [
            `Hello ${escapeHtml(fullName)},`,
            `Confirm that this is your new email address for ${escapeHtml(appName)}. The link works once and expires in ${minutes} minutes.`,
            'If you did not ask for this, ignore this email; nothing changes.',
          ],
          { text: 'Confirm my email', link },
        ),
      };
    }
    case 'test': {
      const { appName } = template.params;
      return {
        subject: `${appName} test email`,
        text: 'This is a test email. Mail is set up correctly.',
        html: layout(appName, 'Test email', ['This is a test email. Mail is set up correctly.']),
      };
    }
  }
}
