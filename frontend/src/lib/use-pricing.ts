'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PRICING, PricingDataSchema, type PricingData } from './pricing';

// Defaults first (instant render), then the live values from the server.
export function usePricing(): PricingData {
  const [pricing, setPricing] = useState<PricingData>(DEFAULT_PRICING);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { pricing?: unknown } | null) => {
        if (cancelled || !body) return;
        const parsed = PricingDataSchema.safeParse(body.pricing);
        if (parsed.success) setPricing(parsed.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return pricing;
}
