import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return import('./provider-singleton');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('provider-singleton (Moneroo)', () => {
  it('throws PaymentProviderUnconfiguredError when MONEROO_* env is missing', async () => {
    const { getProvider, PaymentProviderUnconfiguredError } = await freshModule();
    expect(() => getProvider()).toThrow(PaymentProviderUnconfiguredError);
  });

  it('constructs a Moneroo provider when env is fully set', async () => {
    vi.stubEnv('MONEROO_API_URL', 'https://api.moneroo.io');
    vi.stubEnv('MONEROO_SECRET_KEY', 'test-secret-key');
    vi.stubEnv('MONEROO_WEBHOOK_SECRET', 'test-webhook-secret');
    const { getProvider } = await freshModule();
    const provider = getProvider();
    expect(provider.name).toBe('moneroo');
  });

  it('caches the provider across calls', async () => {
    vi.stubEnv('MONEROO_API_URL', 'https://api.moneroo.io');
    vi.stubEnv('MONEROO_SECRET_KEY', 'test-secret-key');
    vi.stubEnv('MONEROO_WEBHOOK_SECRET', 'test-webhook-secret');
    const { getProvider } = await freshModule();
    expect(getProvider()).toBe(getProvider());
  });

  it('exposes a shared circuit breaker', async () => {
    const { breaker } = await freshModule();
    expect(breaker).toBeDefined();
  });
});

describe('provider-singleton (SasPay)', () => {
  it('is selected automatically when SASPAY_SECRET_KEY is set', async () => {
    vi.stubEnv('SASPAY_SECRET_KEY', 'sk_test_x');
    vi.stubEnv('SASPAY_WEBHOOK_SECRET', 'whsec');
    const { getProvider } = await freshModule();
    expect(getProvider().name).toBe('saspay');
  });

  it('wins over a configured Moneroo unless PAYMENT_PROVIDER says otherwise', async () => {
    vi.stubEnv('SASPAY_SECRET_KEY', 'sk_test_x');
    vi.stubEnv('SASPAY_WEBHOOK_SECRET', 'whsec');
    vi.stubEnv('MONEROO_API_URL', 'https://api.moneroo.io');
    vi.stubEnv('MONEROO_SECRET_KEY', 'k');
    vi.stubEnv('MONEROO_WEBHOOK_SECRET', 's');
    expect((await freshModule()).getProvider().name).toBe('saspay');

    vi.stubEnv('PAYMENT_PROVIDER', 'moneroo');
    expect((await freshModule()).getProvider().name).toBe('moneroo');
  });

  it('throws PaymentProviderUnconfiguredError when the webhook secret is missing', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'saspay');
    vi.stubEnv('SASPAY_SECRET_KEY', 'sk_test_x');
    const { getProvider, PaymentProviderUnconfiguredError } = await freshModule();
    expect(() => getProvider()).toThrow(PaymentProviderUnconfiguredError);
  });
});
