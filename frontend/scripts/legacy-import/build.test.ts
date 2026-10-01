import { describe, expect, it } from 'vitest';
import type { SqlRow } from './parse-dump';
import { buildImportSet } from './build';

const NOW = new Date('2026-10-01T12:00:00Z');

const dem = (o: SqlRow): SqlRow => ({
  iddem: 1,
  nom: 'SOGAN',
  prenom: 'Roger',
  mail: 'r@x.com',
  tel: '22966000001',
  apropos: '',
  datesave: '2024-01-01 10:00:00',
  etat: '1',
  codepays: 'BJ',
  ...o,
});

const base = (): Record<string, SqlRow[]> => ({
  tbldemarcheur: [],
  tblclient: [],
  tblannonce: [],
  tblgalerie: [],
  tblville: [
    { idville: 1, libville: 'Cotonou', idpays: 1 },
    { idville: 41, libville: 'Lomé', idpays: 2 },
  ],
  tblannonce_vu: [],
  tblalertesecteur: [],
  tbldemandes: [],
  tblportefeuille: [],
});

const ann = (o: SqlRow): SqlRow => ({
  idannonce: 100,
  titre: ' Villa à vendre ',
  type: 'vente',
  prix: '50000000',
  superficie: '300',
  chambre: 4,
  salon: '1',
  cuisine: '1',
  douche: '2',
  idtype: 1,
  repere: 'Pharmacie X',
  idville: 1,
  quartier: 'Fidjrossè',
  description: 'Belle villa',
  datesave: '2025-01-01 08:00:00',
  iddem: 1,
  confid: 1,
  ...o,
});

describe('buildImportSet', () => {
  it('dedupes agents by email, keeping the etat=1 account and re-pointing listings', () => {
    const d = base();
    d.tbldemarcheur = [
      dem({ iddem: 1, etat: '0', datesave: '2025-06-01 00:00:00' }),
      dem({ iddem: 2, tel: '22966000002' }),
    ];
    d.tblannonce = [ann({ iddem: 1 })];
    const s = buildImportSet(d, NOW);
    expect(s.users.map((u) => u.legacyId)).toEqual(['dem:2']);
    expect(s.listings[0]?.ownerLegacyId).toBe('dem:2');
  });

  it('gives agents without email a placeholder and leaves them unverified', () => {
    const d = base();
    d.tbldemarcheur = [dem({ iddem: 7, mail: '' })];
    const u = buildImportSet(d, NOW).users[0];
    expect(u?.email).toBe('legacy-dem-7@import.habitat-afrik.invalid');
    expect(u?.emailVerifiedAt).toBeNull();
  });

  it('marks agents with a pending verification code as unverified', () => {
    const d = base();
    d.tbldemarcheur = [dem({ etat: '7e620' })];
    expect(buildImportSet(d, NOW).users[0]?.emailVerifiedAt).toBeNull();
  });

  it('assigns a duplicated phone only to the first user', () => {
    const d = base();
    d.tbldemarcheur = [
      dem({ iddem: 1, mail: 'a@x.com', tel: '22966000001' }),
      dem({ iddem: 2, mail: 'b@x.com', tel: '22966000001' }),
    ];
    expect(buildImportSet(d, NOW).users.map((u) => u.phone)).toEqual(['+22966000001', null]);
  });

  it('imports only clients with a valid, unused email', () => {
    const d = base();
    d.tbldemarcheur = [dem({ mail: 'r@x.com' })];
    d.tblclient = [
      { idcli: 1, nom: 'A', prenom: 'B', mail: 'c:/', datesave: '2022-10-26' },
      { idcli: 2, nom: 'A', prenom: 'B', mail: 'R@x.com', datesave: '2022-10-26' },
      { idcli: 3, nom: 'Doe', prenom: 'Jane', mail: 'jane@x.com', datesave: '2022-10-26' },
    ];
    const clients = buildImportSet(d, NOW).users.filter((u) => u.accountType === 'TENANT_BUYER');
    expect(clients.map((u) => u.legacyId)).toEqual(['cli:3']);
  });

  it('maps a visible listing to VERIFIED with country, landmark and view count', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [ann({})];
    d.tblannonce_vu = [
      { idannonce: 100, nbrevu: 12 },
      { idannonce: 100, nbrevu: 3 },
    ];
    expect(buildImportSet(d, NOW).listings[0]).toMatchObject({
      legacyId: 'ann:100',
      title: 'Villa à vendre',
      city: 'Cotonou',
      country: 'Bénin',
      propertyType: 'VILLA',
      transactionType: 'VENTE',
      price: 50000000,
      status: 'VERIFIED',
      landmark: 'Fidjrossè — Pharmacie X',
      surfaceM2: 300,
      bedrooms: 4,
      bathrooms: 2,
      kitchens: 1,
      viewCount: 15,
    });
  });

  it('forces DRAFT when hidden, unpriced or untyped', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [
      ann({ idannonce: 1, confid: 0 }),
      ann({ idannonce: 2, prix: '2.02' }),
      ann({ idannonce: 3, type: 'undefined' }),
      ann({ idannonce: 4, idtype: 0 }),
    ];
    const ls = buildImportSet(d, NOW).listings;
    expect(ls.map((l) => l.status)).toEqual(['DRAFT', 'DRAFT', 'DRAFT', 'DRAFT']);
    expect(ls[1]?.price).toBe(0);
    expect(ls[2]?.transactionType).toBe('VENTE');
    expect(ls[3]?.propertyType).toBe('MAISON');
  });

  it('notes the land-title status for parcels', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [ann({ idannonce: 1, idtype: 13 }), ann({ idannonce: 2, idtype: 8 })];
    const ls = buildImportSet(d, NOW).listings;
    expect(ls[0]?.description).toBe('Belle villa\n\nTitre foncier : oui');
    expect(ls[1]?.description).toBe('Belle villa\n\nTitre foncier : non');
  });

  it('orders photos per listing and keeps a single primary', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [ann({})];
    d.tblgalerie = [
      { idgal: 5, urltof: 'b.webp', etat: 0, idannonce: 100 },
      { idgal: 3, urltof: 'a.webp', etat: 1, idannonce: 100 },
      { idgal: 9, urltof: 'c.webp', etat: 1, idannonce: 100 },
      { idgal: 10, urltof: 'x.webp', etat: 1, idannonce: 999 }, // orphan listing
    ];
    const s = buildImportSet(d, NOW);
    expect(s.photos.map((p) => [p.legacyId, p.position, p.isPrimary])).toEqual([
      ['gal:3', 0, true],
      ['gal:5', 1, false],
      ['gal:9', 2, false],
    ]);
    expect(s.skipped.photosOrphan).toBe(1);
  });

  it('splits a sector alert into VENTE + LOCATION alerts with city names', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblalertesecteur = [
      {
        idalerte: 20,
        ville: '1/41/',
        datesave: '2026-04-02 21:17:10',
        dateexpire: '2027-07-22 23:50:51',
        iddem: 1,
        tel_alerte: '+33745548695',
        mail_alerte: '',
        idpays: 1,
      },
    ];
    const a = buildImportSet(d, NOW).alerts;
    expect(a.map((x) => x.legacyId)).toEqual(['alerte:20:VENTE', 'alerte:20:LOCATION']);
    expect(a[0]).toMatchObject({
      country: 'Bénin',
      cities: ['Cotonou'],
      notifWhatsapp: true,
      notifEmail: false,
      active: true,
    });
  });

  it('sums wallet balances onto the kept agent', () => {
    const d = base();
    d.tbldemarcheur = [dem({ iddem: 1, etat: '0' }), dem({ iddem: 2 })];
    d.tblportefeuille = [
      { iddem: 1, solde: 3 },
      { iddem: 2, solde: 4 },
      { iddem: 2, solde: 0 },
    ];
    expect(buildImportSet(d, NOW).wallets).toEqual([{ ownerLegacyId: 'dem:2', balance: 7 }]);
  });

  it('maps public requests and closes the stale ones', () => {
    const d = base();
    d.tbldemandes = [
      {
        iddemandes: 18,
        idpays: 2,
        idville: 41,
        idtype: 4,
        action: 'louer',
        note: 'Appart',
        datesave: '2026-09-20 17:12:54',
        bmin: 50000,
        bmax: 60000,
        teldemande: '+22899163304',
        maildemande: 'h@x.com',
        chambre: 2,
        salon: 1,
        superficie: 0,
      },
      {
        iddemandes: 19,
        idpays: 2,
        idville: 41,
        idtype: 4,
        action: 'louer',
        note: '',
        datesave: '2026-01-01 00:00:00',
        bmin: 0,
        bmax: 0,
        teldemande: '',
        maildemande: '',
        chambre: 0,
        salon: 0,
        superficie: 0,
      },
    ];
    const r = buildImportSet(d, NOW).requests;
    expect(r[0]).toMatchObject({
      legacyId: 'demande:18',
      transactionType: 'LOCATION',
      propertyType: 'APPARTEMENT',
      country: 'Togo',
      city: 'Lomé',
      bedrooms: '2 chambres',
      salons: '1 salon',
      budgetMin: 50000,
      budgetMax: 60000,
      status: 'EN_ATTENTE',
    });
    expect(r[1]?.status).toBe('CLOTUREE');
  });
});
