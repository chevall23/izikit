import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  adminAccessApprovedEmail,
  adminAccessCodeEmail,
  adminAccessNewRequestEmail,
  adminAccessRejectedEmail,
  alertMatchEmail,
  contactMessageEmail,
  formatAmount,
  legalDocumentsSubmittedEmail,
  listingInquiryEmail,
  paymentConfirmationEmail,
} from './templates';

beforeEach(() => vi.stubEnv('APP_URL', 'https://habitat-afrik.com'));

describe('transactional email templates', () => {
  it('listing inquiry: French subject per type, visitor details, escaped message, link to contacts', () => {
    const t = listingInquiryEmail({
      type: 'VR_VISIT',
      listingTitle: 'Villa à Cotonou',
      name: 'Kofi',
      phone: '+229 01 00 00 00',
      message: '<a href="https://evil.example">promo</a>',
    });
    expect(t.subject).toBe('Demande de visite virtuelle — Villa à Cotonou');
    expect(t.text).toContain('Téléphone : +229 01 00 00 00');
    expect(t.html).not.toContain('<a href="https://evil.example">');
    expect(t.html).toContain('https://habitat-afrik.com/contacts');
    expect(
      listingInquiryEmail({
        ...{ type: 'MESSAGE' as const, listingTitle: 'X', name: 'a', phone: '1', message: 'm' },
      }).subject,
    ).toBe('Nouveau message — X');
  });

  it('contact message: maps the subject code to its French label', () => {
    const t = contactMessageEmail({
      firstName: 'Ama',
      lastName: 'Mensah',
      email: 'ama@example.com',
      subject: 'PARTNERSHIP',
      message: 'Bonjour',
    });
    expect(t.subject).toBe('Nouveau message de contact — Partenariat');
    expect(t.text).toContain('E-mail : ama@example.com');
  });

  it('admin access emails are personalised and link to the right pages', () => {
    expect(adminAccessCodeEmail({ name: 'Awa', code: 'K7M2Q9XA', ttlMinutes: 15 }).text).toContain(
      'expire dans 15 minutes',
    );
    expect(adminAccessNewRequestEmail({ requesterEmail: 'x@y.com' }).html).toContain(
      'https://habitat-afrik.com/admin/demandes-acces',
    );
    expect(adminAccessApprovedEmail({ name: 'Awa' }).text).toContain('Bonjour Awa,');
    const rejected = adminAccessRejectedEmail({ name: 'Awa', reason: 'Dossier incomplet' });
    expect(rejected.text).toContain('Dossier incomplet');
    expect(adminAccessRejectedEmail({ name: 'Awa' }).text).not.toContain('Motif');
  });

  it('alert match and legal documents use French labels', () => {
    expect(alertMatchEmail({ alertName: 'Cotonou', summary: 'Achat · Villa' }).subject).toBe(
      'Nouvelle correspondance pour votre alerte « Cotonou »',
    );
    expect(
      legalDocumentsSubmittedEmail({ userEmail: 'a@b.com', types: ['RCCM', 'ID_CARD'] }).text,
    ).toContain("Pièce d'identité nationale");
  });

  it('payment confirmation formats the amount from its smallest unit', () => {
    expect(formatAmount(150000, 'XOF')).toBe('150 000 FCFA');
    expect(formatAmount(1999, 'EUR')).toBe('19,99 EUR');
    expect(
      paymentConfirmationEmail({ orderId: 'ord_1', amount: 5000, currency: 'XOF' }).text,
    ).toContain('Montant : 5 000 FCFA');
  });
});
