import { test, expect, afterEach, describe } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import NoSignal from '../src/NoSignal'

afterEach(() => {
  cleanup()
})

describe('NoSignal', () => {
  test('affiche toujours le titre NO SIGNAL', () => {
    render(<NoSignal />)
    expect(screen.getByText('NO SIGNAL')).toBeDefined()
  })

  test('expose le aria-label "no signal"', () => {
    render(<NoSignal />)
    expect(screen.getByLabelText('no signal')).toBeDefined()
  })

  test('affiche la raison quand fournie', () => {
    render(<NoSignal reason="MAP INTROUVABLE" />)
    expect(screen.getByText('MAP INTROUVABLE')).toBeDefined()
  })

  test("n'affiche aucune raison quand le prop est absent", () => {
    const { container } = render(<NoSignal />)
    // Only the title in CENTER, no reason block.
    expect(screen.queryByText('MAP INTROUVABLE')).toBeNull()
    // The wrapper contains the title only (style/scanlines/grain aside).
    expect(container.querySelector('[aria-label="no signal"]')).not.toBeNull()
  })

  test('traite une raison vide ("") comme absente (branche falsy)', () => {
    const { container } = render(<NoSignal reason="" />)
    // reason="" is falsy → the REASON block is not rendered, only the title.
    const wrap = container.querySelector('[aria-label="no signal"]')
    expect(wrap?.textContent).toContain('NO SIGNAL')
    // No extra text block (the reason) after the title.
    const titles = screen.getAllByText('NO SIGNAL')
    expect(titles).toHaveLength(1)
  })

  test('injecte les keyframes CSS inline', () => {
    const { container } = render(<NoSignal />)
    const style = container.querySelector('style')
    expect(style?.textContent).toContain('nosignal-grain')
    expect(style?.textContent).toContain('nosignal-drift')
    expect(style?.textContent).toContain('nosignal-flicker')
  })
})
