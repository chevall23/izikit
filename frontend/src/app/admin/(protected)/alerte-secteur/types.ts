// Shape returned by GET /api/admin/alerts/[id] ({ alert }). Shared by the
// detail drawer and the edit form.

export interface AlertMatchRow {
  id: string;
  createdAt: string;
  propertyRequest: {
    id: string;
    transactionType: string;
    propertyType: string;
    country: string;
    city: string;
    budgetMin: number | null;
    budgetMax: number | null;
    clientName: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface AlertDetail {
  id: string;
  name: string;
  transactionType: string;
  propertyTypes: string[];
  country: string;
  cities: string[];
  priceMin: number | null;
  priceMax: number | null;
  frequency: string;
  notifWhatsapp: boolean;
  notifEmail: boolean;
  notifSms: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string | null; email: string; phone: string | null } | null;
  matches: AlertMatchRow[];
}
