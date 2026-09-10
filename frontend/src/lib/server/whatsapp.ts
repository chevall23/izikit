/**
 * WhatsApp sender over Brevo's WhatsApp Business API.
 *
 * Requires a WhatsApp Business sender + at least one pre-approved message
 * template configured in the Brevo account (WhatsApp does not allow
 * arbitrary free-text business-initiated messages) — that setup happens
 * outside this code. `BREVO_WHATSAPP_TEMPLATE_ID` identifies which
 * approved template to use; the ordered `params` fill its body
 * placeholders ({{1}}, {{2}}, …) in order.
 *
 * Best-effort, no durable queue — same posture as `sms.ts`. The exact
 * request payload below follows Brevo's public WhatsApp API docs; verify
 * against your account once WhatsApp is actually configured, since this
 * could not be exercised against a live Brevo WhatsApp sender in this
 * environment.
 *
 * The `WhatsappSender` interface is provider-agnostic: `whatsapp-meta.ts`
 * implements the same contract against the Meta WhatsApp Cloud API, and
 * `whatsapp-singleton.ts` picks whichever provider is configured. Call
 * sites (see `lib/server/alerts/matching.ts`) only pass the recipient and
 * an ordered list of template body parameters — the template identity and
 * language live in the provider factory, not the call site.
 */
const BREVO_WHATSAPP_URL = 'https://api.brevo.com/v3/whatsapp/sendMessage';

export interface SendWhatsappInput {
  to: string; // E.164, e.g. "+2250700000000"
  /** Ordered template body parameters — placeholder {{1}} = params[0], etc. */
  params: string[];
}

export interface WhatsappSender {
  send(input: SendWhatsappInput): Promise<{ messageId: string }>;
}

export interface CreateWhatsappSenderEnv {
  BREVO_API_KEY: string;
  /** Brevo-registered WhatsApp Business sender number, E.164. */
  BREVO_WHATSAPP_SENDER_NUMBER: string;
  /** Id of a pre-approved WhatsApp template in the Brevo account. */
  BREVO_WHATSAPP_TEMPLATE_ID: string;
}

export interface CreateWhatsappSenderOptions {
  fetchImpl?: typeof fetch;
}

interface BrevoWhatsappSuccess {
  messageId?: string;
}

interface BrevoWhatsappError {
  code?: string;
  message?: string;
}

/** Brevo's WhatsApp API expects params keyed by 1-based placeholder index. */
function toBrevoParams(params: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((value, i) => {
    out[String(i + 1)] = value;
  });
  return out;
}

export function createWhatsappSender(
  env: CreateWhatsappSenderEnv,
  options: CreateWhatsappSenderOptions = {},
): WhatsappSender {
  if (!env.BREVO_API_KEY) {
    throw new Error('createWhatsappSender: BREVO_API_KEY is required');
  }
  if (!env.BREVO_WHATSAPP_SENDER_NUMBER) {
    throw new Error('createWhatsappSender: BREVO_WHATSAPP_SENDER_NUMBER is required');
  }
  if (!env.BREVO_WHATSAPP_TEMPLATE_ID) {
    throw new Error('createWhatsappSender: BREVO_WHATSAPP_TEMPLATE_ID is required');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = env.BREVO_API_KEY;
  const senderNumber = env.BREVO_WHATSAPP_SENDER_NUMBER;
  const templateId = Number(env.BREVO_WHATSAPP_TEMPLATE_ID);
  if (!Number.isFinite(templateId)) {
    throw new Error('createWhatsappSender: BREVO_WHATSAPP_TEMPLATE_ID must be numeric');
  }

  return {
    async send(input: SendWhatsappInput): Promise<{ messageId: string }> {
      const params = toBrevoParams(input.params);
      const res = await fetchImpl(BREVO_WHATSAPP_URL, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          senderNumber,
          contactNumbers: [input.to],
          templateId,
          ...(Object.keys(params).length > 0 ? { params } : {}),
        }),
      });

      if (!res.ok) {
        const errorBody = (await res.json().catch(() => ({}))) as BrevoWhatsappError;
        throw new Error(`Brevo WhatsApp error: ${errorBody.message ?? res.statusText}`);
      }

      const data = (await res.json()) as BrevoWhatsappSuccess;
      if (!data.messageId) {
        throw new Error('Brevo WhatsApp returned no messageId');
      }

      return { messageId: data.messageId };
    },
  };
}
