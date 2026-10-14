import Link from 'next/link';
import { Lock } from 'lucide-react';

// Decorative, STATIC placeholder behind a blur — never real values. The data of
// a locked block is not even returned by the API for the free plan.
const DECOY_BARS = [38, 62, 45, 80, 55, 92, 70, 48, 66, 84, 52, 74];

export function LockedBlock({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        aria-hidden
        className="pointer-events-none flex h-[130px] items-end gap-1.5 blur-[6px] select-none"
      >
        {DECOY_BARS.map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-brand/30" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 text-center">
        <Lock className="h-4 w-4 text-gray-500" aria-hidden />
        <p className="text-[12.5px] font-medium text-neutral-800">{label}</p>
        <Link
          href="/settings?tab=abonnement"
          className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand/90"
        >
          Passer à Pro
        </Link>
      </div>
    </div>
  );
}
