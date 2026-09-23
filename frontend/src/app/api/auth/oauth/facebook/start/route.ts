// GET /api/auth/oauth/facebook/start
//
// Issues a state cookie (httpOnly, path /api/auth/oauth, maxAge 300) and 302
// redirects to Facebook's authorization dialog. No PKCE cookie — Facebook's
// arctic client doesn't use a code verifier. Inert (404) when
// FACEBOOK_CLIENT_ID/SECRET/REDIRECT_URI is missing — mirrors the Google route.
//
// Optional ?next= echoes a same-origin path through `app-oauth-next` so
// the callback can post-login redirect back to the originating page.
//
// Optional ?accountType= (TENANT_BUYER | OWNER_AGENT) echoes the profile
// chosen on /signup through `app-oauth-accountType` so the callback can
// apply it — but ONLY on the new-user create path; an existing user's
// accountType is never touched by login. Mirrors the Google start route.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { generateState } from 'arctic';
import { cookies } from 'next/headers';
import { tryCreateFacebookProvider } from '@/lib/server/oauth/facebook';
import { isSameOriginNext } from '@/lib/server/oauth/error-redirect';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const OAUTH_STATE_COOKIE = `${COOKIE_PREFIX}-oauth-fb-state`;
const OAUTH_NEXT_COOKIE = `${COOKIE_PREFIX}-oauth-next`;
const OAUTH_ACCOUNT_TYPE_COOKIE = `${COOKIE_PREFIX}-oauth-accountType`;
const OAUTH_COOKIE_MAX_AGE = 5 * 60; // 5 min, matches Google
const VALID_ACCOUNT_TYPES = new Set(['TENANT_BUYER', 'OWNER_AGENT']);

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const provider = tryCreateFacebookProvider();
    if (!provider) {
      // env-gated: 404 silently. Mirrors the Google inert pattern.
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const state = generateState();
    const url = provider.client.createAuthorizationURL(state, [...provider.scopes]);

    const store = await cookies();
    const cookieOpts = {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax' as const,
      path: '/api/auth/oauth',
      maxAge: OAUTH_COOKIE_MAX_AGE,
    };
    store.set(OAUTH_STATE_COOKIE, state, cookieOpts);

    const nextParam = req.nextUrl.searchParams.get('next');
    const appUrl = process.env.APP_URL ?? '';
    if (nextParam && appUrl) {
      const validated = isSameOriginNext(nextParam, appUrl);
      if (validated) {
        store.set(OAUTH_NEXT_COOKIE, validated, cookieOpts);
      } else {
        log.warn('oauth.facebook.start: rejected cross-origin ?next=', { next: nextParam });
      }
    }

    const accountTypeParam = req.nextUrl.searchParams.get('accountType');
    if (accountTypeParam && VALID_ACCOUNT_TYPES.has(accountTypeParam)) {
      store.set(OAUTH_ACCOUNT_TYPE_COOKIE, accountTypeParam, cookieOpts);
    }

    return NextResponse.redirect(url.toString(), 302);
  });
}
