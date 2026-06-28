import { test, expect, afterEach, describe } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import NoSignal from './NoSignal'

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
    // Seuls 2 enfants dans CENTER : le titre, pas de bloc raison.
    expect(screen.queryByText('MAP INTROUVABLE')).toBeNull()
    // Le wrapper contient title uniquement (style/scanlines/grain à part).
    expect(container.querySelector('[aria-label="no signal"]')).not.toBeNull()
  })

  test('traite une raison vide ("") comme absente (branche falsy)', () => {
    const { container } = render(<NoSignal reason="" />)
    // reason="" est falsy → le bloc REASON n'est pas rendu, seul le titre reste.
    const wrap = container.querySelector('[aria-label="no signal"]')
    expect(wrap?.textContent).toContain('NO SIGNAL')
    // Aucun bloc texte supplémentaire (la raison) après le titre.
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
