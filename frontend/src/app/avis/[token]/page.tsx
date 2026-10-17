'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

interface Form {
  firstName: string;
  summary: string;
  submitted: boolean;
  optedOut: boolean;
  agents: Array<{ id: string; name: string | null; avatarUrl: string | null }>;
}

type Phase = 'loading' | 'notfound' | 'form' | 'done' | 'stopped';

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json' },
  });
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Note de 1 à 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} sur 5`}
          onClick={() => onChange(n)}
          className="p-1"
        >
          <Star
            className={cn(
              'h-8 w-8',
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300',
            )}
          />
        </button>
      ))}
    </div>
  );
}

export default function AvisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [stopMode, setStopMode] = useState(false);
  useEffect(() => {
    setStopMode(new URLSearchParams(window.location.search).get('stop') === '1');
  }, []);
  const [phase, setPhase] = useState<Phase>('loading');
  const [form, setForm] = useState<Form | null>(null);
  const [contacted, setContacted] = useState<boolean | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await call(`/api/public/feedback/${encodeURIComponent(token)}`);
        if (!alive) return;
        if (!res.ok) return setPhase('notfound');
        const data = (await res.json()) as Form;
        setForm(data);
        setPhase(data.submitted ? 'done' : data.optedOut && !stopMode ? 'stopped' : 'form');
      } catch {
        if (alive) setPhase('notfound');
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, stopMode]);

  const agents = form?.agents ?? [];
  const missingRating = contacted === true && agents.some((a) => !ratings[a.id]);
  const canSend = contacted !== null && !missingRating && !busy;

  async function submit() {
    if (contacted === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/public/feedback/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: JSON.stringify({
          contacted,
          ratings: contacted ? agents.map((a) => ({ agentId: a.id, rating: ratings[a.id] })) : [],
          comment: comment.trim() || undefined,
        }),
      });
      if (res.ok || res.status === 409) return setPhase('done');
      setError("Votre réponse n'a pas pu être enregistrée. Réessayez dans un instant.");
    } catch {
      setError('Connexion impossible. Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      const res = await call(`/api/public/feedback/${encodeURIComponent(token)}/stop`, {
        method: 'POST',
      });
      if (res.ok) setPhase('stopped');
      else setError("Action impossible pour l'instant.");
    } catch {
      setError('Connexion impossible. Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-[560px]">
        <Link href="/" className="mb-6 inline-block">
          <Logo height={36} />
        </Link>

        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
          {phase === 'loading' && <p className="text-gray-500">Chargement…</p>}

          {phase === 'notfound' && (
            <>
              <h1 className="text-xl font-bold text-gray-900">Lien introuvable</h1>
              <p className="mt-2 text-gray-600">
                Ce lien n&apos;est plus valide. Si vous avez besoin d&apos;aide, contactez notre
                support.
              </p>
            </>
          )}

          {phase === 'done' && (
            <>
              <h1 className="text-xl font-bold text-gray-900">Merci pour votre retour !</h1>
              <p className="mt-2 text-gray-600">
                Votre avis nous aide à garantir un service de qualité.
              </p>
            </>
          )}

          {phase === 'stopped' && (
            <>
              <h1 className="text-xl font-bold text-gray-900">C&apos;est noté</h1>
              <p className="mt-2 text-gray-600">Vous ne recevrez plus de rappels à ce sujet.</p>
            </>
          )}

          {phase === 'form' && form && (
            <>
              <h1 className="text-xl font-bold text-gray-900">
                {form.firstName ? `Bonjour ${form.firstName},` : 'Bonjour,'} votre avis compte
              </h1>
              <p className="mt-2 text-sm text-gray-600">Votre demande : {form.summary}</p>

              {stopMode ? (
                <div className="mt-6">
                  <p className="text-gray-700">
                    Souhaitez-vous ne plus recevoir de rappels pour cette demande ?
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={stop}
                    className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    Ne plus recevoir ces rappels
                  </button>
                  {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  <fieldset>
                    <legend className="font-semibold text-gray-900">
                      Un agent vous a-t-il contacté ?
                    </legend>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {[
                        { v: true, l: 'Oui' },
                        { v: false, l: 'Non' },
                      ].map((o) => (
                        <button
                          key={o.l}
                          type="button"
                          onClick={() => setContacted(o.v)}
                          className={cn(
                            'rounded-xl border px-4 py-3 font-semibold',
                            contacted === o.v
                              ? 'border-brand bg-brand text-white'
                              : 'border-gray-300 text-gray-800',
                          )}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {contacted === true &&
                    (agents.length > 0 ? (
                      agents.map((a) => (
                        <div key={a.id}>
                          <p className="font-semibold text-gray-900">
                            Comment noteriez-vous {a.name ?? 'cet agent'} ?
                          </p>
                          <Stars
                            value={ratings[a.id] ?? 0}
                            onChange={(n) => setRatings((r) => ({ ...r, [a.id]: n }))}
                          />
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-600">
                        Merci, nous avons bien noté votre réponse.
                      </p>
                    ))}

                  {contacted !== null && (
                    <div>
                      <label htmlFor="comment" className="font-semibold text-gray-900">
                        Un commentaire ?{' '}
                        <span className="font-normal text-gray-500">(facultatif)</span>
                      </label>
                      <textarea
                        id="comment"
                        value={comment}
                        maxLength={1000}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-sm"
                      />
                    </div>
                  )}

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={submit}
                    className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-40"
                  >
                    Envoyer mon avis
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
