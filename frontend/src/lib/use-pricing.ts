'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PRICING, PricingDataSchema, type PricingData } from './pricing';

// Defaults first (instant render), then the live values from the server.
export function usePricingState(): { pricing: PricingData; loaded: boolean } {
  const [state, setState] = useState<{ pricing: PricingData; loaded: boolean }>({
    pricing: DEFAULT_PRICING,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { pricing?: unknown } | null) => {
        if (cancelled || !body) return;
        const parsed = PricingDataSchema.safeParse(body.pricing);
        if (parsed.success) setState({ pricing: parsed.data, loaded: true });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function usePricing(): PricingData {
  return usePricingState().pricing;
}
