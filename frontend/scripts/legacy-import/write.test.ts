import { describe, expect, it } from 'vitest';
import { resolveUserAction } from './write';

describe('resolveUserAction', () => {
  it('updates a user already imported', () =>
    expect(resolveUserAction({ id: 'u1' }, { id: 'u1', legacyId: 'dem:1' })).toEqual({
      kind: 'update',
      id: 'u1',
    }));

  it('links an existing account that signed up on the new site with the same email', () =>
    expect(resolveUserAction(null, { id: 'u2', legacyId: null })).toEqual({
      kind: 'link',
      id: 'u2',
    }));

  it('creates when nothing matches', () =>
    expect(resolveUserAction(null, null)).toEqual({ kind: 'create' }));

  it('refuses to steal an email already linked to another legacy account', () =>
    expect(() => resolveUserAction(null, { id: 'u3', legacyId: 'dem:9' })).toThrow(
      /already linked/,
    ));
});
