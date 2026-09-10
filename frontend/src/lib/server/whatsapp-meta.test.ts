import { describe, it, expect, vi } from 'vitest';
import { createMetaWhatsappSender } from './whatsapp-meta';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ENV = {
  WHATSAPP_META_TOKEN: 'tok',
  WHATSAPP_META_PHONE_NUMBER_ID: '123456',
  WHATSAPP_META_TEMPLATE_NAME: 'alert_match',
};

describe('createMetaWhatsappSender', () => {
  it('throws synchronously when a required env var is missing', () => {
    expect(() => createMetaWhatsappSender({ ...ENV, WHATSAPP_META_TOKEN: '' })).toThrow(
      /WHATSAPP_META_TOKEN/,
    );
    expect(() => createMetaWhatsappSender({ ...ENV, WHATSAPP_META_PHONE_NUMBER_ID: '' })).toThrow(
      /WHATSAPP_META_PHONE_NUMBER_ID/,
    );
    expect(() => createMetaWhatsappSender({ ...ENV, WHATSAPP_META_TEMPLATE_NAME: '' })).toThrow(
      /WHATSAPP_META_TEMPLATE_NAME/,
    );
  });

  it('POSTs a template message to the Graph API and maps the returned id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { messages: [{ id: 'wamid.ABC' }] }));
    const sender = createMetaWhatsappSender(ENV, { fetchImpl });

    const result = await sender.send({
      to: '+2250700000000',
      params: ['Villas à Cotonou', 'Villa · Vente · Cotonou — demande de Awa'],
    });

    expect(result).toEqual({ messageId: 'wamid.ABC' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123456/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer tok',
      'content-type': 'application/json',
    });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2250700000000', // leading "+" stripped
      type: 'template',
      template: {
        name: 'alert_match',
        language: { code: 'fr' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Villas à Cotonou' },
              { type: 'text', text: 'Villa · Vente · Cotonou — demande de Awa' },
            ],
          },
        ],
      },
    });
  });

  it('honours a custom template language and Graph API version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { messages: [{ id: 'x' }] }));
    const sender = createMetaWhatsappSender(
      { ...ENV, WHATSAPP_META_TEMPLATE_LANG: 'en_US', WHATSAPP_META_GRAPH_VERSION: 'v20.0' },
      { fetchImpl },
    );

    await sender.send({ to: '2250700000000', params: [] });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v20.0/123456/messages');
    const body = JSON.parse(init.body as string);
    expect(body.template.language).toEqual({ code: 'en_US' });
    expect(body.template.components).toBeUndefined(); // no params -> no components
  });

  it('throws with the Meta error message on a non-2xx response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: { message: 'Template name does not exist', code: 132001 } }),
      );
    const sender = createMetaWhatsappSender(ENV, { fetchImpl });

    await expect(sender.send({ to: '2250700000000', params: ['a', 'b'] })).rejects.toThrow(
      /Meta WhatsApp error: Template name does not exist/,
    );
  });

  it('throws when a 2xx response carries no message id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { messages: [] }));
    const sender = createMetaWhatsappSender(ENV, { fetchImpl });

    await expect(sender.send({ to: '2250700000000', params: [] })).rejects.toThrow(
      /no message id/i,
    );
  });
});
