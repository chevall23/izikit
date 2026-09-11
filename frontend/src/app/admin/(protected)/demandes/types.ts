// Shared API shape for GET/PATCH /api/admin/property-requests/[id],
// used by the list page and the edit form.
export interface RequestDetail {
  id: string;
  transactionType: string;
  propertyType: string;
  country: string;
  city: string;
  landmark: string | null;
  bedrooms: string | null;
  salons: string | null;
  surfaceM2: number | null;
  capacity: number | null;
  amenities: string[];
  priority: string;
  budgetMin: number | null;
  budgetMax: number | null;
  financing: string;
  delay: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  source: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedAgent: { id: string; name: string | null; email: string } | null;
}
