// Lazy-init WhatsappSender. Picks the first configured provider:
//   1. Meta WhatsApp Cloud API — WHATSAPP_META_TOKEN +
//      WHATSAPP_META_PHONE_NUMBER_ID + WHATSAPP_META_TEMPLATE_NAME
//   2. Brevo WhatsApp — BREVO_API_KEY + BREVO_WHATSAPP_SENDER_NUMBER +
//      BREVO_WHATSAPP_TEMPLATE_ID
// Returns null when neither is fully configured — callers MUST handle the
// null case gracefully. Pattern mirrors sms-singleton.ts /
// email-queue-singleton.ts.
import 'server-only';
import { createWhatsappSender, type WhatsappSender } from './whatsapp';
import { createMetaWhatsappSender } from './whatsapp-meta';
import { createLogger } from './logger';

const log = createLogger();

let _sender: WhatsappSender | null = null;
let _initialized = false;

export function getWhatsappSender(): WhatsappSender | null {
  if (_initialized) return _sender;
  _initialized = true;

  const metaToken = process.env.WHATSAPP_META_TOKEN ?? '';
  const metaPhoneId = process.env.WHATSAPP_META_PHONE_NUMBER_ID ?? '';
  const metaTemplate = process.env.WHATSAPP_META_TEMPLATE_NAME ?? '';

  if (metaToken && metaPhoneId && metaTemplate) {
    _sender = createMetaWhatsappSender({
      WHATSAPP_META_TOKEN: metaToken,
      WHATSAPP_META_PHONE_NUMBER_ID: metaPhoneId,
      WHATSAPP_META_TEMPLATE_NAME: metaTemplate,
      WHATSAPP_META_TEMPLATE_LANG: process.env.WHATSAPP_META_TEMPLATE_LANG || undefined,
      WHATSAPP_META_GRAPH_VERSION: process.env.WHATSAPP_META_GRAPH_VERSION || undefined,
    });
    log.info('whatsapp-singleton: using Meta WhatsApp Cloud API');
    return _sender;
  }

  const brevoKey = process.env.BREVO_API_KEY ?? '';
  const senderNumber = process.env.BREVO_WHATSAPP_SENDER_NUMBER ?? '';
  const brevoTemplateId = process.env.BREVO_WHATSAPP_TEMPLATE_ID ?? '';

  if (brevoKey && senderNumber && brevoTemplateId) {
    _sender = createWhatsappSender({
      BREVO_API_KEY: brevoKey,
      BREVO_WHATSAPP_SENDER_NUMBER: senderNumber,
      BREVO_WHATSAPP_TEMPLATE_ID: brevoTemplateId,
    });
    log.info('whatsapp-singleton: using Brevo WhatsApp');
    return _sender;
  }

  log.warn(
    'whatsapp-singleton: not configured (set WHATSAPP_META_TOKEN + WHATSAPP_META_PHONE_NUMBER_ID + WHATSAPP_META_TEMPLATE_NAME, or BREVO_API_KEY + BREVO_WHATSAPP_SENDER_NUMBER + BREVO_WHATSAPP_TEMPLATE_ID)',
  );
  _sender = null;
  return null;
}

/** Test-only — clear the cached sender. */
export function __resetWhatsappSenderSingleton(): void {
  _sender = null;
  _initialized = false;
}
