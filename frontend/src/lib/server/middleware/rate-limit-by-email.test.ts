// clientIp must not trust the client-controlled start of X-Forwarded-For.
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { clientIp } from './rate-limit-by-email';

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://test/api/x', { headers });
}

describe('clientIp', () => {
  it('ignores a spoofed leftmost entry and keeps the proxy-appended one', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 41.85.10.20' }))).toBe('41.85.10.20');
  });

  it('skips internal hops appended by our own infrastructure', () => {
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 41.85.10.20, 127.0.0.1, 10.0.0.5' }))).toBe(
      '41.85.10.20',
    );
  });

  it('uses the single entry when the proxy overwrites the header', () => {
    expect(clientIp(req({ 'x-forwarded-for': '41.85.10.20' }))).toBe('41.85.10.20');
  });

  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientIp(req({ 'x-real-ip': '41.85.10.21' }))).toBe('41.85.10.21');
    expect(clientIp(req({}))).toBe('unknown');
  });
});
