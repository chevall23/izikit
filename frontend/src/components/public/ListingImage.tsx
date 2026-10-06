// Listing / article photo through next/image: resized per screen, lazy
// loaded, served from our own domain (the optimizer fetches the R2 original
// once and caches it — r2.dev is rate-limited and not meant to take public
// traffic directly). Renders in `fill` mode: the parent must be positioned
// and sized. Hosts not declared in next.config `images.remotePatterns`
// (e.g. a stray legacy URL) are shown as-is instead of failing.
import Image from 'next/image';

const OPTIMIZABLE_HOST = /^https:\/\/([a-z0-9-]+\.)*(r2\.dev|res\.cloudinary\.com)\//i;

/** Local /paths and hosts declared in next.config `images.remotePatterns`. */
export function isOptimizableImage(src: string): boolean {
  return src.startsWith('/') || OPTIMIZABLE_HOST.test(src);
}

export function ListingImage({
  src,
  alt,
  sizes,
  priority = false,
  className = 'object-cover',
}: {
  src: string;
  alt: string;
  /** Rendered width hint, e.g. "(min-width: 1024px) 33vw, 100vw". */
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      unoptimized={!isOptimizableImage(src)}
    />
  );
}
