// Verification / password-reset email factories consumed by the outbox
// dispatcher (`email.verification_code`, `email.password_reset`). Same
// signatures as the original starter; the French copy and the branded layout
// live in `lib/server/emails/` with every other transactional email.
//
// `expiresAt` is threaded from the outbox payload so the rendered TTL matches
// `AUTH_VERIFICATION_TTL_MIN` (O1 audit fix).
import 'server-only';
import { passwordResetCodeEmail, verificationCodeEmail } from '../emails/templates';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface VerificationEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "sous peu" wording when omitted. */
  expiresAt?: string;
}

export interface ResetPasswordEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "sous peu" wording when omitted. */
  expiresAt?: string;
}

export function verificationEmail(args: VerificationEmailArgs): EmailTemplate {
  return verificationCodeEmail({
    code: args.code,
    ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
  });
}

export function resetPasswordEmail(args: ResetPasswordEmailArgs): EmailTemplate {
  return passwordResetCodeEmail({
    code: args.code,
    ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
  });
}
