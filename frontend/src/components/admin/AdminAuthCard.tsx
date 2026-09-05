import { type ReactNode } from 'react';

/**
 * Centered single-card shell for the Banani "HABITATAFRIK EQUIPE" admin auth
 * screens (inscription, and the upcoming admin login). The Banani design hides
 * the split-screen brand panel and centers one white card on a subtle
 * top→bottom gradient — this reproduces that exactly.
 */
export function AdminAuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-white to-gray-50 px-5 py-8 md:px-6 md:py-12">
      <div className="w-full max-w-[520px] rounded-xl bg-white p-6 shadow-[0_24px_60px_rgba(17,24,39,0.08)] sm:p-8 md:p-9">
        {children}
      </div>
    </div>
  );
}
