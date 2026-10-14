import { describe, it, expect } from 'vitest';
import { subscriptionExpiredNotification, subscriptionGraceNotification } from './templates';

describe('subscriptionGraceNotification', () => {
  const end = new Date('2026-10-01T00:00:00Z');

  it('names the live FREE quota in the hiding warning', () => {
    expect(subscriptionGraceNotification('u1', end, 5).body).toContain('au-delà de 5');
  });

  it('omits the hiding warning when the FREE plan is unlimited', () => {
    expect(subscriptionGraceNotification('u1', end, null).body).not.toContain('masquage');
  });
});

describe('subscriptionExpiredNotification', () => {
  const end = new Date('2026-10-01T00:00:00Z');

  it('mentions hidden listings and deactivated alerts', () => {
    const body = subscriptionExpiredNotification('u1', 4, end, 2).body;
    expect(body).toContain('4 annonce(s) ont été masquées');
    expect(body).toContain('2 alerte(s) secteur ont été désactivées');
  });

  it('mentions only alerts when no listing was hidden', () => {
    const body = subscriptionExpiredNotification('u1', 0, end, 3).body;
    expect(body).not.toContain('masquées');
    expect(body).toContain('3 alerte(s) secteur');
  });

  it('keeps the plain message when nothing was affected', () => {
    expect(subscriptionExpiredNotification('u1', 0, end).body).toBe(
      'Votre compte repasse au plan Gratuit.',
    );
  });
});
