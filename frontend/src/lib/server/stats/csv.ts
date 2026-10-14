// CSV for the statistics export. Excel-FR friendly (UTF-8 BOM, ';' separator)
// and safe against spreadsheet formula injection: any text cell that would be
// read as a formula gets a leading apostrophe.
import 'server-only';

const EOL = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const row = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(';');

export interface StatsCsvData {
  period: string;
  kpis: { label: string; value: number; trendPct: number }[];
  viewsByDay: { date: string; count: number }[];
  listings: {
    title: string;
    city: string;
    country: string;
    propertyType: string;
    transactionType: string;
    status: string;
    price: number;
    currency: string;
    views: number;
    contacts: number;
  }[];
}

export function buildStatsCsv(data: StatsCsvData): string {
  const lines: string[] = [
    `Indicateurs (période : ${data.period})`,
    'Indicateur;Valeur;Variation (%)',
    ...data.kpis.map((k) => row([k.label, k.value, k.trendPct])),
    '',
    'Vues par jour',
    'Date;Vues',
    ...data.viewsByDay.map((v) => row([v.date, v.count])),
    '',
    'Détail par annonce',
    'Titre;Ville;Pays;Type de bien;Transaction;Statut;Prix;Devise;Vues;Contacts',
    ...data.listings.map((l) =>
      row([
        l.title,
        l.city,
        l.country,
        l.propertyType,
        l.transactionType,
        l.status,
        l.price,
        l.currency,
        l.views,
        l.contacts,
      ]),
    ),
    '',
  ];
  return '﻿' + lines.join(EOL);
}
