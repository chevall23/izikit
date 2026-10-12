// Required-field rules of the 3-step property request wizard, shared by both
// forms (/demande-immobiliere/nouvelle — public, /demandes/new — agent) and
// by both API routes, so the client and the server can never disagree.
// Pure: no DOM, no server imports.
//
// Step 1 — the property: country, city, and the field that matches the type
//          (surface for land, capacity for halls, bedrooms + salons otherwise).
// Step 2 — the budget: min AND max, max >= min, financing, delay.
// Step 3 — the contact: name, phone, email, client type, source.
//
// Amenities are a wish list and stay optional; priority has a default.

export type RequestStep = 1 | 2 | 3;

export const LAND_TYPES: ReadonlySet<string> = new Set(['PARCELLE', 'DOMAINE']);
export const HALL_TYPES: ReadonlySet<string> = new Set(['SALLE_FETE', 'SALLE_CONFERENCE']);

export interface RequestDraft {
  propertyType: string;
  country: string;
  city: string;
  surface: string;
  capacity: string;
  bedrooms: string;
  salons: string;
  priority: string;
  budgetMin: string;
  budgetMax: string;
  financing: string;
  delay: string;
  clientName: string;
  /** Full number, dial code included ("+229 90 12 34 56"). */
  phone: string;
  email: string;
  clientType: string;
  source: string;
}

export type RequestField = keyof RequestDraft;
export type RequestErrors = Partial<Record<RequestField, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function filled(value: string): boolean {
  return value.trim().length > 0;
}

/** Whole number > 0 from a form string ("80000000", "80 000 000"). */
export function positiveInt(value: string): number | null {
  const n = Number(value.replace(/\s/g, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function validateStep(step: RequestStep, d: RequestDraft): RequestErrors {
  const errors: RequestErrors = {};

  if (step === 1) {
    if (!filled(d.country)) errors.country = 'Choisissez le pays.';
    if (!filled(d.city)) errors.city = 'Choisissez la ville.';
    if (LAND_TYPES.has(d.propertyType)) {
      if (positiveInt(d.surface) === null) errors.surface = 'Indiquez la superficie en m².';
    } else if (HALL_TYPES.has(d.propertyType)) {
      if (positiveInt(d.capacity) === null) errors.capacity = 'Indiquez le nombre de places.';
    } else {
      if (!filled(d.bedrooms)) errors.bedrooms = 'Choisissez le nombre de chambres.';
      if (!filled(d.salons)) errors.salons = 'Choisissez le nombre de salons.';
    }
    if (!filled(d.priority)) errors.priority = 'Choisissez la priorité.';
  }

  if (step === 2) {
    const min = positiveInt(d.budgetMin);
    const max = positiveInt(d.budgetMax);
    if (min === null) errors.budgetMin = 'Indiquez le budget minimum (en FCFA).';
    if (max === null) errors.budgetMax = 'Indiquez le budget maximum (en FCFA).';
    if (min !== null && max !== null && max < min) {
      errors.budgetMax = 'Le budget maximum doit être supérieur ou égal au minimum.';
    }
    if (!filled(d.financing)) errors.financing = 'Choisissez le type de financement.';
    if (!filled(d.delay)) errors.delay = 'Choisissez le délai de recherche.';
  }

  if (step === 3) {
    const name = d.clientName.trim();
    if (name.length < 2 || !/\p{L}.*\p{L}/u.test(name)) {
      errors.clientName = 'Indiquez le nom complet du client.';
    }
    const digits = phoneDigits(d.phone);
    if (digits.length < 8 || digits.length > 15) {
      errors.phone = 'Indiquez un numéro de téléphone valide.';
    }
    if (!EMAIL.test(d.email.trim())) errors.email = 'Indiquez une adresse e-mail valide.';
    if (!filled(d.clientType)) errors.clientType = 'Choisissez le type de client.';
    if (!filled(d.source)) errors.source = 'Indiquez comment vous nous avez connus.';
  }

  return errors;
}

/** Errors of the given step, plus every step before it. */
export function validateThrough(step: RequestStep, d: RequestDraft): RequestErrors {
  let errors: RequestErrors = {};
  for (const s of [1, 2, 3] as const) {
    if (s > step) break;
    errors = { ...errors, ...validateStep(s, d) };
  }
  return errors;
}

/** First step that has an error, or null when the whole draft is valid. */
export function firstInvalidStep(d: RequestDraft): RequestStep | null {
  for (const s of [1, 2, 3] as const) {
    if (Object.keys(validateStep(s, d)).length > 0) return s;
  }
  return null;
}

/** Human list for a summary under the buttons: one message per field. */
export function errorMessages(errors: RequestErrors): string[] {
  return Object.values(errors).filter((m): m is string => typeof m === 'string');
}

/** Shape of a request body as the API routes parse it (numbers, not strings). */
export interface RequestBodyLike {
  propertyType: string;
  bedrooms?: string | undefined;
  salons?: string | undefined;
  /** Land surface in m² (`surfaceM2`, or the minimum of `surfaceMin`/`surfaceMax`). */
  surface?: number | undefined;
  capacity?: number | undefined;
  budgetMin?: number | undefined;
  budgetMax?: number | undefined;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | undefined;
}

/**
 * Server-side counterpart of validateStep for a parsed request body — used by
 * both POST routes in a zod `superRefine`, so the wizard's required fields
 * cannot be bypassed by calling the API directly. Fields the schema already
 * enforces (country, city, financing, delay…) are not repeated here.
 */
export function requestBodyIssues(b: RequestBodyLike): { field: RequestField; message: string }[] {
  const draft: RequestDraft = {
    propertyType: b.propertyType,
    country: 'x',
    city: 'x',
    surface: b.surface === undefined ? '' : String(b.surface),
    capacity: b.capacity === undefined ? '' : String(b.capacity),
    bedrooms: b.bedrooms ?? '',
    salons: b.salons ?? '',
    priority: 'x',
    budgetMin: b.budgetMin === undefined ? '' : String(b.budgetMin),
    budgetMax: b.budgetMax === undefined ? '' : String(b.budgetMax),
    financing: 'x',
    delay: 'x',
    clientName: b.clientName,
    phone: b.clientPhone,
    email: b.clientEmail ?? '',
    clientType: 'x',
    source: 'x',
  };
  const issues: { field: RequestField; message: string }[] = [];
  for (const step of [1, 2, 3] as const) {
    for (const [field, message] of Object.entries(validateStep(step, draft))) {
      issues.push({ field: field as RequestField, message });
    }
  }
  return issues;
}
