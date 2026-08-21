import { deriveAuthIdentity, findAuthIdentityConflicts, resolveAuthIdentity } from '@/utils/authIdentity'
import { describe, expect, it } from 'vitest'

/**
 * 身份绑定标识的判定与后端 `app/runtime/extensions/auth_entries.py` 保持一一对应：
 * 两端对同一份配置必须算出同一个标识，算歪了前端就会把冲突显示成正常、或反过来。
 */
describe('authIdentity', () => {
  describe('resolveAuthIdentity', () => {
    it('derives the key from type and name when no key is declared', () => {
      expect(resolveAuthIdentity({ type: 'oidc', name: 'Keycloak' })).toBe('oidc@Keycloak')
      expect(deriveAuthIdentity('oidc', 'Keycloak')).toBe('oidc@Keycloak')
    })

    it('prefers the declared key so existing bindings keep matching', () => {
      expect(resolveAuthIdentity({ type: 'oidc', name: 'Keycloak', identity_provider: 'legacy-sso' })).toBe(
        'legacy-sso',
      )
    })

    it('trims the declared key the same way the host does before writing the binding column', () => {
      expect(resolveAuthIdentity({ type: 'oidc', name: 'Keycloak', identity_provider: '  legacy-sso  ' })).toBe(
        'legacy-sso',
      )
    })

    it('treats a whitespace-only or non-string key as not declared', () => {
      expect(resolveAuthIdentity({ type: 'oidc', name: 'Keycloak', identity_provider: '   ' })).toBe('oidc@Keycloak')
      expect(resolveAuthIdentity({ type: 'oidc', name: 'Keycloak', identity_provider: null })).toBe('oidc@Keycloak')
      expect(resolveAuthIdentity({ type: 'oidc', name: 'Keycloak', identity_provider: 42 })).toBe('oidc@Keycloak')
    })
  })

  describe('findAuthIdentityConflicts', () => {
    it('reports nothing when every entry lands on its own key', () => {
      const conflicts = findAuthIdentityConflicts([
        { type: 'oidc', name: 'Keycloak' },
        { type: 'oidc', name: 'Authentik' },
        { type: 'embysso', name: 'Keycloak' },
      ])

      expect([...conflicts]).toEqual([])
    })

    it('reports a key claimed by a declared entry and a derived one alike', () => {
      const conflicts = findAuthIdentityConflicts([
        { type: 'oidc', name: 'Keycloak' },
        { type: 'embysso', name: '家里那台', identity_provider: 'oidc@Keycloak' },
      ])

      expect([...conflicts]).toEqual(['oidc@Keycloak'])
    })

    it('reports every colliding key, because each collision silences all of its claimants', () => {
      const conflicts = findAuthIdentityConflicts([
        { type: 'oidc', name: 'A', identity_provider: 'shared' },
        { type: 'oidc', name: 'B', identity_provider: 'shared' },
        { type: 'embysso', name: 'C', identity_provider: 'other' },
        { type: 'embysso', name: 'D', identity_provider: 'other' },
      ])

      expect([...conflicts].sort()).toEqual(['other', 'shared'])
    })
  })
})
