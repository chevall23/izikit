import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('APP_URL', 'https://habitat-afrik.com');

import {
  listingApprovedEmail,
  listingRejectedEmail,
  subscriptionGraceEmail,
  subscriptionReminderEmail,
  withdrawalCancelledEmail,
} from './account-notices';
import { requestFeedbackEmail } from './templates';

const who = { firstName: 'Awa' };

describe('account notice e-mails', () => {
  it('a refused listing says why and links to the editor', () => {
    const mail = listingRejectedEmail('Villa Cotonou', 'Photos floues', 'l1')(who);
    expect(mail.subject).toContain('pas été validée');
    expect(mail.text).toContain('Photos floues');
    expect(mail.text).toContain('https://habitat-afrik.com/listings/l1/edit');
    expect(mail.text).toContain('Awa');
  });

  it('a validated listing says it is public', () => {
    const mail = listingApprovedEmail('Villa Cotonou')(who);
    expect(mail.text).toContain('visible par tous les visiteurs');
  });

  it('the reminder gives the end date in French and a renew link', () => {
    const mail = subscriptionReminderEmail(3, new Date('2026-11-30T12:00:00Z'))(who);
    expect(mail.subject).toContain('3 jours');
    expect(mail.text).toContain('30 novembre 2026');
    expect(mail.text).toContain('/settings?tab=abonnement');
  });

  it('the grace e-mail explains which listings get hidden', () => {
    const mail = subscriptionGraceEmail(5)(who);
    expect(mail.text).toContain('5 annonces les plus récentes');
    expect(mail.text).toContain('pas supprimées');
  });

  it('a cancelled withdrawal states the amount, the reason and that the balance is kept', () => {
    const mail = withdrawalCancelledEmail(25_000, 'XOF', 'Numéro invalide')(who);
    expect(mail.text).toContain('25 000 FCFA');
    expect(mail.text).toContain('Numéro invalide');
    expect(mail.text).toContain('disponible sur votre solde');
  });
});

describe('requestFeedbackEmail', () => {
  it('greets with the first name only', () => {
    const mail = requestFeedbackEmail({
      name: 'Kevin Test',
      summary: 'Villa · Vente · Cotonou, Bénin',
      token: 'tok',
      reminder: false,
      stopUrl: 'https://x/avis/tok?stop=1',
    });
    expect(mail.text).toContain('Kevin');
    expect(mail.text).not.toContain('Kevin Te');
  });
});
