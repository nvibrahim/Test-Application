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
