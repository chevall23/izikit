import type { ReactNode } from 'react';

export type FlagCode = 'BJ' | 'TG' | 'CI' | 'SN' | 'BF' | 'ML' | 'GN' | 'FR';

const STAR = 'M0,-1 L0.588,0.809 L-0.951,-0.309 L0.951,-0.309 L-0.588,0.809 Z';

const FLAGS: Record<FlagCode, ReactNode> = {
  SN: (
    <>
      <rect width="60" height="60" fill="#FDEF42" />
      <rect width="20" height="60" fill="#00853F" />
      <rect x="40" width="20" height="60" fill="#E31B23" />
      <path d={STAR} fill="#00853F" transform="translate(30 30) scale(9)" />
    </>
  ),
  CI: (
    <>
      <rect width="60" height="60" fill="#FFFFFF" />
      <rect width="20" height="60" fill="#F77F00" />
      <rect x="40" width="20" height="60" fill="#009E60" />
    </>
  ),
  BJ: (
    <>
      <rect width="60" height="60" fill="#FCD116" />
      <rect width="22" height="60" fill="#008751" />
      <rect x="22" y="30" width="38" height="30" fill="#E8112D" />
    </>
  ),
  TG: (
    <>
      <rect width="60" height="60" fill="#006A4E" />
      <rect y="12" width="60" height="12" fill="#FFCE00" />
      <rect y="36" width="60" height="12" fill="#FFCE00" />
      <rect width="30" height="36" fill="#D21034" />
      <path d={STAR} fill="#FFFFFF" transform="translate(15 18) scale(8)" />
    </>
  ),
  BF: (
    <>
      <rect width="60" height="60" fill="#009E49" />
      <rect width="60" height="30" fill="#EF2B2D" />
      <path d={STAR} fill="#FCD116" transform="translate(30 30) scale(10)" />
    </>
  ),
  ML: (
    <>
      <rect width="60" height="60" fill="#FCD116" />
      <rect width="20" height="60" fill="#14B53A" />
      <rect x="40" width="20" height="60" fill="#CE1126" />
    </>
  ),
  GN: (
    <>
      <rect width="60" height="60" fill="#FCD116" />
      <rect width="20" height="60" fill="#CE1126" />
      <rect x="40" width="20" height="60" fill="#009460" />
    </>
  ),
  FR: (
    <>
      <rect width="60" height="60" fill="#FFFFFF" />
      <rect width="20" height="60" fill="#0055A4" />
      <rect x="40" width="20" height="60" fill="#EF4135" />
    </>
  ),
};

export function CountryFlag({ code, size = 24 }: { code: FlagCode; size?: number }) {
  return (
    <span
      className="relative inline-block flex-shrink-0 overflow-hidden rounded-full shadow-[0_0_0_1px_rgba(15,23,42,0.1)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 60 60" className="h-full w-full" aria-hidden>
        {FLAGS[code]}
        <ellipse cx="30" cy="12" rx="30" ry="18" fill="#FFFFFF" opacity="0.18" />
      </svg>
    </span>
  );
}
