import { test, expect, afterEach, describe } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import VhsGlitch from '../../src/components/VhsGlitch'

afterEach(cleanup)

describe('VhsGlitch', () => {
  test('rend ses enfants dans la couche de contenu', () => {
    render(
      <VhsGlitch>
        <p>hello vhs</p>
      </VhsGlitch>,
    )
    const child = screen.getByText('hello vhs')
    expect(child).toBeDefined()
    expect(child.closest('.vhs-content')).not.toBeNull()
  })

  test('inclut les couches scanlines et tracking', () => {
    const { container } = render(<VhsGlitch>x</VhsGlitch>)
    expect(container.querySelector('.vhs-scanlines')).not.toBeNull()
    expect(container.querySelector('.vhs-track')).not.toBeNull()
  })

  test('applique la className fournie en plus de la base vhs', () => {
    const { container } = render(<VhsGlitch className="takeover">x</VhsGlitch>)
    const root = container.querySelector('.vhs')!
    expect(root.className).toContain('vhs')
    expect(root.className).toContain('takeover')
  })

  test('sans className, ne laisse pas un undefined dans la classe', () => {
    const { container } = render(<VhsGlitch>x</VhsGlitch>)
    const root = container.querySelector('.vhs')!
    expect(root.className).not.toContain('undefined')
  })
})
