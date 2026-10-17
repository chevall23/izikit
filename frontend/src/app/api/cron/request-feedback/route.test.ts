import { describe, it, expect, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

const send = vi.fn();
vi.mock('@/lib/server/requests/feedback', () => ({
  feedbackEnabled: () => process.env.REQUEST_FEEDBACK_ENABLED === '1',
  sendDueFeedbackEmails: (...a: unknown[]) => send(...a),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const makeReq = () =>
  new NextRequest('http://localhost/api/cron/request-feedback', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });

describe('POST /api/cron/request-feedback', () => {
  it('returns 401 when the secret is wrong', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    expect((await POST(makeReq())).status).toBe(401);
  });

  it('is a no-op while the feature flag is off', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the due e-mails when enabled', async () => {
    vi.stubEnv('REQUEST_FEEDBACK_ENABLED', '1');
    send.mockResolvedValueOnce({ active: true, first: 2, reminders: 1 });
    const { POST } = await import('./route');
    const body = await (await POST(makeReq())).json();
    expect(body).toEqual({ ok: true, result: { active: true, first: 2, reminders: 1 } });
  });
});
