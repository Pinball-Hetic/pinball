import { describe, expect, test } from 'bun:test'
import { getMapPackage } from './index'

describe('getMapPackage', () => {
  test('resolves strangerthings with layout and module', () => {
    const pkg = getMapPackage('strangerthings')
    expect(pkg).not.toBeNull()
    expect(pkg!.manifest.id).toBe('strangerthings')
    expect(pkg!.layout.bosses.length).toBeGreaterThan(0)
    expect(pkg!.module).toBeDefined()
  })

  test('returns null for unknown map id', () => {
    expect(getMapPackage('unknown')).toBeNull()
  })
})
