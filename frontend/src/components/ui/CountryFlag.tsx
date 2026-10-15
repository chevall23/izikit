import { FLAG_CODES, type FlagCode } from './country-data';

export type { FlagCode };
export { FLAG_CODES };

// Flags are static SVGs in /public/flags (country-flag-icons, 3:2), loaded on
// demand so the 245 files never weigh on the page itself.
export function CountryFlag({ code, size = 24 }: { code: FlagCode; size?: number }) {
  const height = Math.round(size * 0.75);
  return (
    <img
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      loading="lazy"
      width={size}
      height={height}
      className="inline-block flex-shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(15,23,42,0.12)]"
      style={{ width: size, height }}
    />
  );
}
