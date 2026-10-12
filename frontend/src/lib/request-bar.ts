// Content of the home page's sticky "Rien ne correspond exactement ?" bar:
// the sentence quoted in the bar and the prefilled request-wizard link both
// follow what the visitor picked in the home search bar, with defaults.
import { COUNTRIES } from '@/lib/countries';
import { PROPERTY_TYPE_LABEL } from '@/lib/listings';

const DEFAULT_PROPERTY_TYPE = 'VILLA';
const DEFAULT_TRANSACTION_TYPE = 'VENTE';
const DEFAULT_COUNTRY = 'Bénin';
const DEFAULT_CITY = 'Cotonou';

// How each transaction reads in "Villa à Cotonou, achat".
const TRANSACTION_WORD: Record<string, string> = {
  VENTE: 'achat',
  LOCATION: 'location',
  SEJOUR: 'séjour',
  AUBERGE: 'auberge',
};

export interface RequestBarSearch {
  propertyType: string;
  transactionType: string;
  country: string;
  city: string;
}

export function requestBarSummary(search: RequestBarSearch): { label: string; href: string } {
  const propertyType = PROPERTY_TYPE_LABEL[search.propertyType]
    ? search.propertyType
    : DEFAULT_PROPERTY_TYPE;
  const transactionType = TRANSACTION_WORD[search.transactionType]
    ? search.transactionType
    : DEFAULT_TRANSACTION_TYPE;

  const typedCity = search.city.trim();
  const countryEntry = COUNTRIES.find((c) => c.name === search.country);
  const city = typedCity || countryEntry?.cities[0] || DEFAULT_CITY;
  const country =
    countryEntry?.name ?? COUNTRIES.find((c) => c.cities.includes(city))?.name ?? DEFAULT_COUNTRY;

  const label = `${PROPERTY_TYPE_LABEL[propertyType]} à ${city}, ${TRANSACTION_WORD[transactionType]}`;
  const params = new URLSearchParams({ propertyType, transactionType, country, city });
  return { label, href: `/demande-immobiliere/nouvelle?${params.toString()}` };
}
