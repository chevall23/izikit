// Default social-share image (WhatsApp / Facebook / X previews) for every page
// that doesn't provide its own (listing pages use their main photo).
import { ImageResponse } from 'next/og';
import { BRAND_COLOR } from '@/lib/seo/site';

export const alt = "Habitat-Afrik — Annonces immobilières en Afrique de l'Ouest";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
    size,
  );
}
