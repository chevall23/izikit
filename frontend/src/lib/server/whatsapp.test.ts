import { describe, it, expect, vi } from 'vitest';
import { createWhatsappSender } from './whatsapp';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ENV = {
  BREVO_API_KEY: 'key',
  BREVO_WHATSAPP_SENDER_NUMBER: '+221700000000',
  BREVO_WHATSAPP_TEMPLATE_ID: '42',
};

describe('createWhatsappSender (Brevo)', () => {
  it('throws synchronously when a required env var is missing', () => {
    expect(() => createWhatsappSender({ ...ENV, BREVO_API_KEY: '' })).toThrow(/BREVO_API_KEY/);
    expect(() => createWhatsappSender({ ...ENV, BREVO_WHATSAPP_SENDER_NUMBER: '' })).toThrow(
      /BREVO_WHATSAPP_SENDER_NUMBER/,
    );
    expect(() => createWhatsappSender({ ...ENV, BREVO_WHATSAPP_TEMPLATE_ID: '' })).toThrow(
      /BREVO_WHATSAPP_TEMPLATE_ID/,
    );
  });

  it('throws when the template id is not numeric', () => {
    expect(() => createWhatsappSender({ ...ENV, BREVO_WHATSAPP_TEMPLATE_ID: 'abc' })).toThrow(
      /numeric/,
    );
  });

  it('sends via the Brevo API, mapping ordered params to 1-based keys', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { messageId: 'brevo-wa-1' }));
    const sender = createWhatsappSender(ENV, { fetchImpl });

    const result = await sender.send({
      to: '+2250700000000',
      params: ['Villas à Cotonou', 'Villa · Vente · Cotonou'],
    });

    expect(result).toEqual({ messageId: 'brevo-wa-1' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/whatsapp/sendMessage');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      senderNumber: '+221700000000',
      contactNumbers: ['+2250700000000'],
      templateId: 42,
      params: { '1': 'Villas à Cotonou', '2': 'Villa · Vente · Cotonou' },
    });
  });

  it('omits params entirely when none are given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { messageId: 'x' }));
    const sender = createWhatsappSender(ENV, { fetchImpl });

    await sender.send({ to: '+2250700000000', params: [] });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.params).toBeUndefined();
  });

  it('throws with the Brevo error message on a non-2xx response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { code: 'invalid_parameter', message: 'Bad number' }));
    const sender = createWhatsappSender(ENV, { fetchImpl });

    await expect(sender.send({ to: 'bad', params: [] })).rejects.toThrow(
      /Brevo WhatsApp error: Bad number/,
    );
  });

  it('throws when a 2xx response is missing messageId', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, {}));
    const sender = createWhatsappSender(ENV, { fetchImpl });

    await expect(sender.send({ to: '+2250700000000', params: [] })).rejects.toThrow(
      /no messageId/i,
    );
  });
});
