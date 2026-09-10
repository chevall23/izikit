/**
 * WhatsApp sender over the Meta WhatsApp Cloud API (official).
 *
 * Implements the same `WhatsappSender` contract as `whatsapp.ts` (Brevo)
 * so `whatsapp-singleton.ts` can pick whichever provider is configured and
 * call sites stay provider-agnostic.
 *
 * Business-initiated messages MUST use a pre-approved *template* — Meta
 * does not allow arbitrary free text outside a 24h customer-service
 * window. `WHATSAPP_META_TEMPLATE_NAME` names the approved template;
 * ordered `params` fill its body placeholders ({{1}}, {{2}}, …).
 *
 * Credentials come from https://developers.facebook.com → your App →
 * WhatsApp → API Setup:
 *   - a *permanent* System User access token (not the 24h test token)
 *   - the Phone Number ID of the registered WhatsApp Business number
 *   - the name + language of a pre-approved message template
 *
 * Best-effort, no durable queue — a send failure is logged and skipped by
 * the caller, never blocking the in-app notification or other channels.
 */
import type { SendWhatsappInput, WhatsappSender } from './whatsapp';

const DEFAULT_GRAPH_VERSION = 'v21.0';
const DEFAULT_TEMPLATE_LANG = 'fr';

export interface CreateMetaWhatsappSenderEnv {
  /** Permanent System User access token. */
  WHATSAPP_META_TOKEN: string;
  /** Phone Number ID of the registered WhatsApp Business number. */
  WHATSAPP_META_PHONE_NUMBER_ID: string;
  /** Name of a pre-approved message template. */
  WHATSAPP_META_TEMPLATE_NAME: string;
  /** Template language/locale code. Defaults to "fr". */
  WHATSAPP_META_TEMPLATE_LANG?: string | undefined;
  /** Graph API version. Defaults to "v21.0". */
  WHATSAPP_META_GRAPH_VERSION?: string | undefined;
}

export interface CreateMetaWhatsappSenderOptions {
  fetchImpl?: typeof fetch;
}

interface MetaSendSuccess {
  messages?: { id?: string }[];
}

interface MetaSendError {
  error?: { message?: string; code?: number; type?: string };
}

export function createMetaWhatsappSender(
  env: CreateMetaWhatsappSenderEnv,
  options: CreateMetaWhatsappSenderOptions = {},
): WhatsappSender {
  if (!env.WHATSAPP_META_TOKEN) {
    throw new Error('createMetaWhatsappSender: WHATSAPP_META_TOKEN is required');
  }
  if (!env.WHATSAPP_META_PHONE_NUMBER_ID) {
    throw new Error('createMetaWhatsappSender: WHATSAPP_META_PHONE_NUMBER_ID is required');
  }
  if (!env.WHATSAPP_META_TEMPLATE_NAME) {
    throw new Error('createMetaWhatsappSender: WHATSAPP_META_TEMPLATE_NAME is required');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const token = env.WHATSAPP_META_TOKEN;
  const phoneNumberId = env.WHATSAPP_META_PHONE_NUMBER_ID;
  const templateName = env.WHATSAPP_META_TEMPLATE_NAME;
  const templateLang = env.WHATSAPP_META_TEMPLATE_LANG || DEFAULT_TEMPLATE_LANG;
  const graphVersion = env.WHATSAPP_META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  return {
    async send(input: SendWhatsappInput): Promise<{ messageId: string }> {
      const components =
        input.params.length > 0
          ? [
              {
                type: 'body',
                parameters: input.params.map((text) => ({ type: 'text', text })),
              },
            ]
          : [];

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          // Meta expects the recipient without a leading "+".
          to: input.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      });

      if (!res.ok) {
        const errorBody = (await res.json().catch(() => ({}))) as MetaSendError;
        throw new Error(`Meta WhatsApp error: ${errorBody.error?.message ?? res.statusText}`);
      }

      const data = (await res.json()) as MetaSendSuccess;
      const messageId = data.messages?.[0]?.id;
      if (!messageId) {
        throw new Error('Meta WhatsApp returned no message id');
      }

      return { messageId };
    },
  };
}
