// Channel fan-out coverage for the Alert-match dispatcher.
//
// matchesAlert() (the pure predicate) is covered in matching.test.ts. This
// file exercises the side of the engine that actually notifies the agent
// who owns a matching sector alert: in-app notification (always), email
// (with an immediate best-effort drain so local dev — which has no cron —
// still sends), and WhatsApp via whatever provider is configured.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

const enqueue = vi.fn();
const drainOne = vi.fn();
const whatsappSend = vi.fn();
const smsSend = vi.fn();
const createNotification = vi.fn();

vi.mock('../queues/email-queue-singleton', () => ({
  getEmailQueue: () => ({ enqueue, drainOne }),
}));
vi.mock('../whatsapp-singleton', () => ({
  getWhatsappSender: () => ({ send: whatsappSend }),
}));
vi.mock('../sms-singleton', () => ({
  getSmsSender: () => ({ send: smsSend }),
}));
vi.mock('../notifications', () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

import { runMatchingForNewRequest, type RequestForMatching } from './matching';

const prisma = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(prisma);
  enqueue.mockReset().mockResolvedValue('email-job-1');
  drainOne.mockReset().mockResolvedValue(true);
  whatsappSend.mockReset().mockResolvedValue({ messageId: 'wa-1' });
  smsSend.mockReset().mockResolvedValue({ reference: 'sms-1' });
  createNotification.mockReset().mockResolvedValue({ id: 'notif-1' });
});

const REQUEST: RequestForMatching = {
  id: 'req-1',
  userId: 'agent-author',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Bénin',
  city: 'Cotonou',
  budgetMin: null,
  budgetMax: null,
  clientName: 'Awa',
};

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    userId: 'agent-owner',
    name: 'Villas à Cotonou',
    transactionType: 'VENTE',
    propertyTypes: ['VILLA'],
    country: 'Bénin',
    cities: ['Cotonou'],
    priceMin: null,
    priceMax: null,
    notifEmail: true,
    notifSms: false,
    notifWhatsapp: true,
    ...overrides,
  };
}

function ownerRow(overrides: Record<string, unknown> = {}) {
  return { id: 'agent-owner', email: 'owner@example.com', phone: '+2250700000000', ...overrides };
}

describe('runMatchingForNewRequest — channel fan-out', () => {
  it('emails (with an immediate drain nudge) and WhatsApps the owner of a matching alert', async () => {
    prisma.alert.findMany.mockResolvedValue([alertRow()] as never);
    prisma.alertMatch.create.mockResolvedValue({ id: 'm-1' } as never);
    prisma.user.findUnique.mockResolvedValue(ownerRow() as never);

    const notified = await runMatchingForNewRequest(prisma, REQUEST);

    expect(notified).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      to: 'owner@example.com',
      subject: 'Nouvelle correspondance pour "Villas à Cotonou"',
    });
    // Best-effort immediate delivery — the cron remains the durable path.
    expect(drainOne).toHaveBeenCalledTimes(1);

    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend.mock.calls[0]?.[0]).toEqual({
      to: '+2250700000000',
      params: ['Villas à Cotonou', expect.stringContaining('demande de Awa')],
    });

    expect(smsSend).not.toHaveBeenCalled();
  });

  it('skips WhatsApp when the alert has notifWhatsapp = false', async () => {
    prisma.alert.findMany.mockResolvedValue([alertRow({ notifWhatsapp: false })] as never);
    prisma.alertMatch.create.mockResolvedValue({ id: 'm-1' } as never);
    prisma.user.findUnique.mockResolvedValue(ownerRow() as never);

    await runMatchingForNewRequest(prisma, REQUEST);

    expect(whatsappSend).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('skips the email channel when the alert has notifEmail = false', async () => {
    prisma.alert.findMany.mockResolvedValue([alertRow({ notifEmail: false })] as never);
    prisma.alertMatch.create.mockResolvedValue({ id: 'm-1' } as never);
    prisma.user.findUnique.mockResolvedValue(ownerRow() as never);

    await runMatchingForNewRequest(prisma, REQUEST);

    expect(enqueue).not.toHaveBeenCalled();
    expect(drainOne).not.toHaveBeenCalled();
  });

  it('a failing immediate drain never rejects the matching run', async () => {
    prisma.alert.findMany.mockResolvedValue([alertRow({ notifWhatsapp: false })] as never);
    prisma.alertMatch.create.mockResolvedValue({ id: 'm-1' } as never);
    prisma.user.findUnique.mockResolvedValue(ownerRow({ phone: null }) as never);
    drainOne.mockRejectedValue(new Error('brevo 500'));

    await expect(runMatchingForNewRequest(prisma, REQUEST)).resolves.toBe(1);
  });

  it('does not re-notify when the (alert, request) pair is already matched', async () => {
    prisma.alert.findMany.mockResolvedValue([alertRow()] as never);
    prisma.alertMatch.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }) as never,
    );

    const notified = await runMatchingForNewRequest(prisma, REQUEST);

    expect(notified).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(whatsappSend).not.toHaveBeenCalled();
  });
});
