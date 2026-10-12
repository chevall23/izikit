'use client';

// Sticky bar pinned to the bottom of the home page: "Pas d'annonce qui
// correspond à votre besoin ?" → straight to the request wizard, prefilled from the home
// search bar. It steps aside while the full "Vous ne trouvez pas ?" section
// is on screen (same message twice), and the visitor can close it — it comes
// back on the next page load.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Megaphone, X } from 'lucide-react';
import { requestBarSummary, type RequestBarSearch } from '@/lib/request-bar';

export function PropertyRequestBar({ search }: { search: RequestBarSearch }) {
  // Dismissal lives in memory only: closing hides the bar until the page is
  // reloaded or revisited, then it comes back.
  const [dismissed, setDismissed] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(false);

  useEffect(() => {
    const section = document.getElementById('demande');
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      setSectionVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  if (dismissed) return null;
  const { label, href } = requestBarSummary(search);

  return (
    <aside
      aria-label="Publier une demande immobilière"
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-3 transition duration-300 motion-reduce:transition-none sm:px-6 sm:pb-4 ${
        sectionVisible
          ? 'pointer-events-none translate-y-full opacity-0'
          : 'translate-y-0 opacity-100'
      }`}
    >
      {/* Animated border: a conic-gradient "comet" far larger than the bar spins
          behind it; the 3px padding lets only the edge show through. */}
      <div className="relative mx-auto max-w-[1000px] overflow-hidden rounded-[18px] bg-white/10 p-[3px] shadow-[0_12px_32px_rgba(0,0,0,0.3)] sm:rounded-[22px]">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -mt-[800px] -ml-[800px] h-[1600px] w-[1600px] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_180deg,#7C3AED_245deg,#FF2D87_305deg,#FFB800_352deg,transparent_360deg)] motion-reduce:hidden"
        />
        <div className="relative flex items-center gap-3 rounded-2xl bg-neutral-900 py-3 pr-9 pl-3 text-white sm:gap-4 sm:rounded-[20px] sm:px-5 sm:py-4 sm:pr-10">
          <span className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500 sm:flex">
            <Megaphone className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-sora text-[15px] leading-tight font-bold">
              Pas d&apos;annonce qui correspond à votre besoin ?
            </p>
            <p className="mt-0.5 hidden text-[13px] leading-snug text-white/70 sm:block">
              Publiez votre demande «&nbsp;{label}&nbsp;» en 30 secondes. Les agents certifiés vous
              proposent des biens, même non publiés.
            </p>
            <p className="mt-0.5 truncate text-[12px] text-white/70 sm:hidden">
              Publiez votre demande «&nbsp;{label}&nbsp;» en 30 secondes.
            </p>
          </div>
          <Link
            href={href}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-brand/90 sm:px-5 sm:text-sm"
          >
            Demander
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Masquer ce bandeau"
            className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
