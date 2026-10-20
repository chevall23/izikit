// /orders/[id]/success — hosted-checkout redirect target (see `successUrl` in
// frontend/src/app/api/orders/route.ts). The customer can land here a few
// seconds BEFORE the provider's webhook credits the account, so the page reads
// the real order status instead of assuming it: it asks the provider once when
// the order is not PAID yet (reconcile), then shows "confirmed" or "being
// confirmed" (auto-refreshing). Only the status and the product kind are read —
// no personal data; the order id is an unguessable cuid.
import { prisma } from '@/lib/server/prisma';
import { reconcileOrder } from '@/lib/server/payments/reconcile';

export const dynamic = 'force-dynamic';

const REFRESH_SECONDS = 4;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;

function destinationFor(metadata: unknown): { href: string; label: string } {
  const kind = (metadata as { kind?: unknown } | null)?.kind;
  if (kind === 'token_purchase' || kind === 'token_purchase_custom') {
    return { href: '/jetons', label: 'Voir mon solde de jetons' };
  }
  return { href: '/settings', label: 'Retour aux paramètres' };
}

export default async function OrderSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let order = await prisma.order.findUnique({
    where: { id },
    select: { status: true, metadata: true, createdAt: true },
  });
  if (order && order.status !== 'PAID' && order.status !== 'REFUNDED') {
    await reconcileOrder(prisma, id);
    order = await prisma.order.findUnique({
      where: { id },
      select: { status: true, metadata: true, createdAt: true },
    });
  }

  const paid = order?.status === 'PAID' || order?.status === 'REFUNDED';
  const waiting = !paid && !!order && Date.now() - order.createdAt.getTime() < GIVE_UP_AFTER_MS;
  const dest = destinationFor(order?.metadata);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      {waiting && <meta httpEquiv="refresh" content={String(REFRESH_SECONDS)} />}
      {paid ? (
        <>
          <h1 className="font-sora mb-3 text-2xl font-semibold text-neutral-900">
            Paiement confirmé
          </h1>
          <p className="mb-6 text-gray-600">
            Merci — votre paiement a été reçu et votre compte a été mis à jour.
          </p>
        </>
      ) : waiting ? (
        <>
          <h1 className="font-sora mb-3 text-2xl font-semibold text-neutral-900">
            Confirmation en cours…
          </h1>
          <p className="mb-6 text-gray-600">
            Nous attendons la confirmation de votre paiement. Cette page se met à jour
            automatiquement, ne la fermez pas.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-sora mb-3 text-2xl font-semibold text-neutral-900">
            Paiement non confirmé
          </h1>
          <p className="mb-6 text-gray-600">
            Nous n&apos;avons pas encore reçu la confirmation de votre paiement. S&apos;il a bien
            été débité, il sera pris en compte automatiquement sous peu ; sinon contactez notre
            support en indiquant la référence ci-dessous.
          </p>
        </>
      )}
      <p className="mb-8 text-sm text-gray-500">
        Référence : <code className="rounded bg-gray-100 px-2 py-1">{id}</code>
      </p>
      <a
        href={dest.href}
        className="inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
      >
        {dest.label}
      </a>
    </main>
  );
}
