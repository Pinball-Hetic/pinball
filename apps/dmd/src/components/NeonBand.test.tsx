import { test, expect, afterEach, describe } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import NeonBand from './NeonBand'

afterEach(cleanup)

describe('NeonBand', () => {
  test('rend le texte fourni', () => {
    render(<NeonBand text="STRANGER" position="top" />)
    expect(screen.getByText('STRANGER')).toBeDefined()
  })

  test('texte vide : rend un span sans crasher', () => {
    const { container } = render(<NeonBand text="" position="bottom" />)
    expect(container.querySelector('span')).not.toBeNull()
  })

  test('position top : bordure en bas, pas en haut', () => {
    render(<NeonBand text="A" position="top" />)
    const div = screen.getByText('A').parentElement as HTMLElement
    expect(div.style.borderBottom).toContain('3px solid')
    expect(div.style.borderTop).toBe('')
  })

  test('position bottom : bordure en haut, pas en bas', () => {
    render(<NeonBand text="B" position="bottom" />)
    const div = screen.getByText('B').parentElement as HTMLElement
    expect(div.style.borderTop).toContain('3px solid')
    expect(div.style.borderBottom).toBe('')
  })

  test('couleur par défaut #E71D23 appliquée au texte', () => {
    render(<NeonBand text="DEF" position="top" />)
    const span = screen.getByText('DEF') as HTMLElement
    expect(span.style.color.toUpperCase()).toBe('#E71D23')
  })

  test('couleur custom : convertie en rgba pour le halo (boxShadow)', () => {
    render(<NeonBand text="X" position="top" color="#00FF00" />)
    const div = screen.getByText('X').parentElement as HTMLElement
    // hexToRgba(#00FF00, 0.7) → rgba(0,255,0,0.7)
    expect(div.style.boxShadow).toContain('rgba(0,255,0,0.7)')
  })

  test('couleur custom : background utilise le halo attenue (alpha 0.12)', () => {
    render(<NeonBand text="Y" position="bottom" color="#0000FF" />)
    const div = screen.getByText('Y').parentElement as HTMLElement
    expect(div.style.background).toContain('rgba(0,0,255,0.12)')
  })

  test('boxShadow oriente le halo selon la position', () => {
    const { container: top } = render(<NeonBand text="T" position="top" />)
    const topDiv = top.querySelector('div') as HTMLElement
    expect(topDiv.style.boxShadow.startsWith('0 6px')).toBe(true)
    cleanup()
    const { container: bottom } = render(<NeonBand text="T" position="bottom" />)
    const botDiv = bottom.querySelector('div') as HTMLElement
    expect(botDiv.style.boxShadow.startsWith('0 -6px')).toBe(true)
  })
})
