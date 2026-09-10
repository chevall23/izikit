// Dev helper: drain the pending EmailJob queue once, now.
//
// The email queue (frontend/src/lib/server/queues/email-queue.ts) only
// actually sends when POST /api/cron/email-queue-drain runs. In prod that
// cron is scheduled from the N0C panel (docs/deploy/n0c-crons.md); locally
// nothing triggers it, so alert-match emails (and every other queued
// email) sit at PENDING forever. Run this to flush them:
//
//   pnpm --filter frontend drain:emails
//
// Requires the same env as the app: UPSTASH_REDIS_REST_URL/TOKEN,
// BREVO_API_KEY, EMAIL_FROM. Prints how many jobs it processed.
import { pathToFileURL } from 'node:url';
import { getEmailQueue } from '../src/lib/server/queues/email-queue-singleton';

export async function main(): Promise<number> {
  const queue = getEmailQueue();
  if (!queue) {
    console.error(
      'Email queue not configured — set UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, BREVO_API_KEY, EMAIL_FROM.',
    );
    process.exit(1);
  }

  let processed = 0;
  // Bounded loop so a poison job can't spin forever; re-run if it hits the cap.
  for (let i = 0; i < 500; i++) {
    const handled = await queue.drainOne();
    if (!handled) break;
    processed++;
  }

  console.log(`Drained ${processed} email job(s).`);
  return processed;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
