import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  authorLabelFor,
  feedbackEnabled,
  firstDelayMs,
  newFeedbackToken,
  optOutOfFeedback,
  sendDueFeedbackEmails,
  submitFeedback,
} from './feedback';

describe('feedback helpers', () => {
  it('abbreviates the author name for the public profile', () => {
    expect(authorLabelFor('Awa Sossou')).toBe('Awa S.');
    expect(authorLabelFor('  Koffi  ')).toBe('Koffi');
    expect(authorLabelFor('   ')).toBe('Un client');
  });

  it('is enabled only with REQUEST_FEEDBACK_ENABLED=1', () => {
    expect(feedbackEnabled({ REQUEST_FEEDBACK_ENABLED: '1' } as unknown as NodeJS.ProcessEnv)).toBe(
      true,
    );
    expect(
      feedbackEnabled({ REQUEST_FEEDBACK_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(feedbackEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('first delay defaults to 3 days and can be shortened for tests', () => {
    const env = (v?: string) =>
      ({ REQUEST_FEEDBACK_FIRST_DELAY_MINUTES: v }) as unknown as NodeJS.ProcessEnv;
    expect(firstDelayMs(env())).toBe(3 * 24 * 60 * 60 * 1000);
    expect(firstDelayMs(env('10'))).toBe(10 * 60_000);
    expect(firstDelayMs(env('abc'))).toBe(3 * 24 * 60 * 60 * 1000);
    expect(firstDelayMs(env('0'))).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('generates unguessable url-safe tokens', () => {
    const a = newFeedbackToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newFeedbackToken()).not.toBe(a);
  });

  it('sends nothing when the feature is off', async () => {
    vi.stubEnv('REQUEST_FEEDBACK_ENABLED', '');
    const prisma = { propertyRequest: { findMany: vi.fn() } } as unknown as PrismaClient;
    const res = await sendDueFeedbackEmails(prisma);
    expect(res).toEqual({ active: false, first: 0, reminders: 0 });
    expect(prisma.propertyRequest.findMany).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe('submitFeedback / optOut', () => {
  it('returns NOT_FOUND for an unknown token', async () => {
    const prisma = {
      requestFeedback: {
        findUnique: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaClient;
    expect(await submitFeedback(prisma, 'nope', { contacted: false, ratings: [] })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(await optOutOfFeedback(prisma, 'nope')).toBe(false);
  });
});
