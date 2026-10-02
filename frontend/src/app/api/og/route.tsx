// GET /api/og — default social-share image (WhatsApp / Facebook / X
// previews), referenced from the root layout's metadata. Deliberately a
// route and not an app/opengraph-image file: file-based metadata would
// override the per-page images (listing pages share their main photo).
export const runtime = 'nodejs';

import { ImageResponse } from 'next/og';
import { BRAND_COLOR } from '@/lib/seo/site';

const OG_SIZE = { width: 1200, height: 630 };

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: BRAND_COLOR,
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -2 }}>HABITAT-AFRIK</div>
      <div style={{ fontSize: 40, marginTop: 24, opacity: 0.95 }}>
        Annonces immobilières au Bénin, au Togo, en Côte d&apos;Ivoire et au Sénégal
      </div>
      <div style={{ fontSize: 30, marginTop: 40, opacity: 0.85 }}>
        Maisons · Appartements · Terrains · Bureaux — à vendre ou à louer
      </div>
    </div>,
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
  );
}
