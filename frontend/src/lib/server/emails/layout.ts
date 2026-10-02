/**
 * Shared layout for every transactional email (French, Habitat Afrik
 * branding). Table-based markup with inline styles so it renders the same in
 * Gmail, Outlook and mobile clients.
 *
 * Every content field is PLAIN TEXT and is escaped here — callers never build
 * HTML themselves, so a visitor-supplied name or message cannot inject markup
 * (links, images) into an email sent to an agent or an admin.
 */
import 'server-only';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailOptions {
  subject: string;
  /** Hidden preview line shown next to the subject in the inbox. */
  preheader: string;
  /** "Bonjour <name>," — omitted name renders "Bonjour,". */
  greetingName?: string;
  paragraphs: string[];
  /** One-time code, shown large in a highlighted box. */
  code?: string;
  /** Label / value rows (contact details, order summary…). */
  details?: { label: string; value: string }[];
  /** A message written by someone else (visitor, admin), shown as a quote. */
  quote?: string;
  /** Call-to-action; `path` is resolved against APP_URL (dropped when unset). */
  button?: { label: string; path: string };
  /** Paragraphs after the button (security notes…). */
  closing?: string[];
}

const BRAND = '#376bff';
const TEXT = '#1f2937';
const MUTED = '#6b7280';
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appUrl(): string {
  return (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXT}">${htmlEscape(text)}</p>`;
}

export function renderEmail(opts: EmailOptions): EmailContent {
  const base = appUrl();
  const greeting = opts.greetingName?.trim() ? `Bonjour ${opts.greetingName.trim()},` : 'Bonjour,';
  const buttonUrl = opts.button && base ? `${base}${opts.button.path}` : null;

  const blocks: string[] = [paragraph(greeting), ...opts.paragraphs.map(paragraph)];

  if (opts.code) {
    blocks.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td align="center" style="background:#eef3ff;border-radius:10px;padding:20px"><span style="font-family:'Courier New',monospace;font-size:30px;font-weight:700;letter-spacing:6px;color:${BRAND}">${htmlEscape(opts.code)}</span></td></tr></table>`,
    );
  }

  if (opts.details?.length) {
    const rows = opts.details
      .map(
        (d) =>
          `<tr><td style="padding:8px 12px 8px 0;font-size:14px;color:${MUTED};white-space:nowrap;vertical-align:top">${htmlEscape(d.label)}</td><td style="padding:8px 0;font-size:14px;color:${TEXT};font-weight:600">${htmlEscape(d.value)}</td></tr>`,
      )
      .join('');
    blocks.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;width:100%">${rows}</table>`,
    );
  }

  if (opts.quote) {
    const body = htmlEscape(opts.quote).replace(/\r?\n/g, '<br>');
    blocks.push(
      `<div style="margin:0 0 20px;padding:14px 16px;background:#f9fafb;border-left:3px solid ${BRAND};border-radius:6px;font-size:14px;line-height:1.6;color:${TEXT}">${body}</div>`,
    );
  }

  if (buttonUrl && opts.button) {
    blocks.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px"><tr><td style="background:${BRAND};border-radius:8px"><a href="${htmlEscape(buttonUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${htmlEscape(opts.button.label)}</a></td></tr></table>`,
    );
  }

  for (const c of opts.closing ?? []) blocks.push(paragraph(c));
  blocks.push(
    `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:${TEXT}">Cordialement,<br><strong>L'équipe Habitat Afrik</strong></p>`,
  );

  const header = base
    ? `<img src="${htmlEscape(`${base}/logo.png`)}" width="119" height="70" alt="Habitat Afrik" style="display:block;border:0">`
    : `<span style="font-size:20px;font-weight:700;color:${BRAND}">HABITAT-AFRIK</span>`;
  const siteLink = base
    ? `<a href="${htmlEscape(base)}" style="color:${MUTED};text-decoration:underline">${htmlEscape(base.replace(/^https?:\/\//, ''))}</a>`
    : 'Habitat Afrik';

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${htmlEscape(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td align="center" style="padding:0 0 20px">${header}</td></tr>
<tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;font-family:${FONT}">${blocks.join('\n')}</td></tr>
<tr><td align="center" style="padding:24px 16px 0;font-size:12px;line-height:1.6;color:${MUTED};font-family:${FONT}">Habitat Afrik — La plateforme immobilière de l'Afrique de l'Ouest<br>${siteLink}<br>Ceci est un message automatique, merci de ne pas y répondre directement.</td></tr>
</table></td></tr></table>
</body></html>`;

  const textParts: string[] = [greeting, ...opts.paragraphs];
  if (opts.code) textParts.push(opts.code);
  if (opts.details?.length)
    textParts.push(opts.details.map((d) => `${d.label} : ${d.value}`).join('\n'));
  if (opts.quote) textParts.push(`« ${opts.quote} »`);
  if (buttonUrl && opts.button) textParts.push(`${opts.button.label} : ${buttonUrl}`);
  textParts.push(...(opts.closing ?? []));
  textParts.push("Cordialement,\nL'équipe Habitat Afrik");
  textParts.push(
    `—\nHabitat Afrik — La plateforme immobilière de l'Afrique de l'Ouest${base ? `\n${base}` : ''}\nCeci est un message automatique, merci de ne pas y répondre directement.`,
  );

  return { subject: opts.subject, html, text: textParts.join('\n\n') };
}
