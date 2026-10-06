'use client';

// Audience tracking carried over from the legacy site (same accounts, so the
// history in Google Analytics / Meta continues): Google Tag Manager, the two
// GA4 properties and the two Meta pixels. Loaded only on the production
// domain — pre-production must not pollute the stats — and only once the
// page has fully loaded (lazyOnload), so five third-party tags never compete
// with the page's own content on slow mobile connections.
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PRODUCTION_HOST } from '@/lib/seo/site';

const GTM_ID = 'GTM-56PZ4HQ';
const GA4_IDS = ['G-L9LX1ETMMJ', 'G-Z9K09T0TDY'];
const META_PIXEL_IDS = ['1141777894801586', '706225327426885'];

type Fbq = (...args: unknown[]) => void;

export function Analytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();
  const firstPath = useRef<string | null>(null);

  // The hostname is only known in the browser.
  useEffect(() => {
    setEnabled(window.location.hostname === PRODUCTION_HOST);
  }, []);

  // GA4 records client-side navigations by itself (enhanced measurement);
  // the Meta pixel only sends the initial PageView, so report the others.
  useEffect(() => {
    if (firstPath.current === null) {
      firstPath.current = pathname;
      return;
    }
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    fbq?.('track', 'PageView');
  }, [pathname]);

  if (!enabled) return null;

  return (
    <>
      <Script id="gtm" strategy="lazyOnload">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <Script
        id="gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_IDS[0]}`}
        strategy="lazyOnload"
      />
      <Script id="gtag-init" strategy="lazyOnload">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${GA4_IDS.map((id) => `gtag('config','${id}');`).join('')}`}
      </Script>
      <Script id="meta-pixel" strategy="lazyOnload">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');${META_PIXEL_IDS.map((id) => `fbq('init','${id}');`).join('')}fbq('track','PageView');`}
      </Script>
    </>
  );
}
