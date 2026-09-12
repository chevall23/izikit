// Shared HABITAT-AFRIK wordmark (frontend/public/logo.png), used in place of
// the old icon-square + text placeholder across every header/sidebar/auth
// layout. The source PNG has an opaque white background (no alpha), so on a
// dark surface (footer, auth hero) it needs the `chip` variant to stay
// legible rather than floating as a plain white rectangle.
import { cn } from '@/lib/utils';

const ASPECT_RATIO = 119 / 70;

export function Logo({
  height = 32,
  chip = false,
  className,
}: {
  height?: number;
  chip?: boolean;
  className?: string;
}) {
  const img = (
    <img
      src="/logo.png"
      alt="HABITAT-AFRIK"
      height={height}
      width={Math.round(height * ASPECT_RATIO)}
      className="block"
      style={{ height, width: 'auto' }}
    />
  );

  if (!chip) return <span className={className}>{img}</span>;

  return (
    <span className={cn('inline-flex items-center rounded-lg bg-white px-2 py-1', className)}>
      {img}
    </span>
  );
}
