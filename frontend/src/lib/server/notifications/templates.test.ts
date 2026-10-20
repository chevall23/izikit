import { describe, it, expect } from 'vitest';
import { subscriptionExpiredNotification, subscriptionGraceNotification } from './templates';

describe('subscriptionGraceNotification', () => {
  const end = new Date('2026-10-01T00:00:00Z');

  it('names the live FREE quota in the hiding warning', () => {
    expect(subscriptionGraceNotification('u1', end, 5).body).toContain(
      'seules vos 5 plus récentes',
    );
  });

  it('omits the hiding warning when the FREE plan is unlimited', () => {
    expect(subscriptionGraceNotification('u1', end, null).body).not.toContain('masquées');
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
      'Votre abonnement est terminé : votre compte repasse au plan Gratuit.',
    );
  });
});

describe('explicit wording', () => {
  it('says what a payment bought', async () => {
    const { paymentReceived } = await import('./templates');
    const n = paymentReceived('u', 'o1', 13_500, 'XOF', 'Pack Starter : 50 jetons crédités');
    expect(n.title).toBe('Paiement confirmé');
    expect(n.body).toContain('50 jetons crédités');
    expect(n.body).toContain('13 500 FCFA');
  });

  it('lists the reason in a refused listing and keeps one notification per decision', async () => {
    const { listingRejectedNotification } = await import('./templates');
    const at = new Date('2026-10-20T10:00:00Z');
    const n = listingRejectedNotification('u', 'l1', 'Villa', 'Photos floues', at);
    expect(n.body).toContain('Photos floues');
    expect(n.dedupeKey).toBe(`listing-rejected:l1:${at.toISOString()}`);
  });

  it('formats subscription dates in French', async () => {
    const { subscriptionReminderNotification } = await import('./templates');
    const n = subscriptionReminderNotification('u', 7, new Date('2026-11-30T12:00:00Z'));
    expect(n.body).toContain('30 novembre 2026');
  });

  it('writes withdrawals in French', async () => {
    const { withdrawalRequestedNotification } = await import('./templates');
    expect(withdrawalRequestedNotification('u', 'w', 5000, 'XOF').title).toBe(
      'Demande de retrait enregistrée',
    );
  });
});
