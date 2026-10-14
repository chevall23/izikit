import { describe, it, expect } from 'vitest';
import { subscriptionGraceNotification } from './templates';

describe('subscriptionGraceNotification', () => {
  const end = new Date('2026-10-01T00:00:00Z');

  it('names the live FREE quota in the hiding warning', () => {
    expect(subscriptionGraceNotification('u1', end, 5).body).toContain('au-delà de 5');
  });

  it('omits the hiding warning when the FREE plan is unlimited', () => {
    expect(subscriptionGraceNotification('u1', end, null).body).not.toContain('masquage');
  });
});
