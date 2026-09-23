import Link from 'next/link';

const STAR = 'M0,-1 L0.588,0.809 L-0.951,-0.309 L0.951,-0.309 L-0.588,0.809 Z';

const FLAGS: { name: string; flag: React.ReactNode }[] = [
  {
    name: 'Sénégal',
    flag: (
      <>
        <rect width="60" height="60" fill="#FDEF42" />
        <rect width="20" height="60" fill="#00853F" />
        <rect x="40" width="20" height="60" fill="#E31B23" />
        <path d={STAR} fill="#00853F" transform="translate(30 30) scale(9)" />
      </>
    ),
  },
  {
    name: "Côte d'Ivoire",
    flag: (
      <>
        <rect width="60" height="60" fill="#FFFFFF" />
        <rect width="20" height="60" fill="#F77F00" />
        <rect x="40" width="20" height="60" fill="#009E60" />
      </>
    ),
  },
  {
    name: 'Bénin',
    flag: (
      <>
        <rect width="60" height="60" fill="#FCD116" />
        <rect width="22" height="60" fill="#008751" />
        <rect x="22" y="30" width="38" height="30" fill="#E8112D" />
      </>
    ),
  },
  {
    name: 'Togo',
    flag: (
      <>
        <rect width="60" height="60" fill="#006A4E" />
        <rect y="12" width="60" height="12" fill="#FFCE00" />
        <rect y="36" width="60" height="12" fill="#FFCE00" />
        <rect width="30" height="36" fill="#D21034" />
        <path d={STAR} fill="#FFFFFF" transform="translate(15 18) scale(8)" />
      </>
    ),
  },
];

export function MobileCountryPicker() {
  return (
    <section className="px-4 pb-6 lg:hidden">
      <h2 className="mb-4 font-sora text-[20px] font-bold tracking-[-0.02em]">
        Choisissez un pays
      </h2>
      <ul className="grid grid-cols-4 gap-2">
        {FLAGS.map((f) => (
          <li key={f.name}>
            <Link
              href={`/annonces?country=${encodeURIComponent(f.name)}`}
              className="flex flex-col items-center gap-2"
            >
              <span className="relative block h-[60px] w-[60px] overflow-hidden rounded-full shadow-[0_2px_8px_rgba(15,23,42,0.18)] ring-2 ring-white">
                <svg viewBox="0 0 60 60" className="h-full w-full" aria-hidden>
                  {f.flag}
                  <ellipse cx="30" cy="12" rx="30" ry="18" fill="#FFFFFF" opacity="0.18" />
                </svg>
              </span>
              <span className="text-center text-[11px] leading-tight font-bold">{f.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
