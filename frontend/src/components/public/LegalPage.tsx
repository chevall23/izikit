// Shared shell for the static information pages (à propos, CGU,
// confidentialité, mentions légales): public navbar/footer, breadcrumb,
// title and readable long-form typography.
import Link from 'next/link';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white text-neutral-900">
      <PublicNavbar active="accueil" />
      <main className="mx-auto max-w-[820px] px-4 py-10 lg:py-14">
        <p className="mb-3 flex items-center gap-2 text-[13px] text-gray-500">
          <Link href="/" className="text-gray-500">
            Accueil
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-neutral-900">{title}</span>
        </p>
        <h1 className="font-sora text-[28px] font-extrabold tracking-[-0.03em] lg:text-[36px]">
          {title}
        </h1>
        {updated && <p className="mt-2 text-sm text-gray-500">Dernière mise à jour : {updated}</p>}
        <div className="mt-8 text-[15px] leading-[1.8] text-neutral-700 [&_a]:text-brand [&_a]:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[20px] [&_h2]:font-extrabold [&_h2]:text-neutral-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-bold [&_h3]:text-neutral-900 [&_li]:mb-1.5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
