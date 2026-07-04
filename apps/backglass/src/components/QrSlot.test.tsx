import { test, expect, afterEach, describe } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import QrSlot from './QrSlot'

afterEach(cleanup)

describe('QrSlot', () => {
  test('affiche la légende d invitation', () => {
    render(<QrSlot />)
    expect(screen.getByText(/BIENT/)).toBeDefined()
    expect(screen.getByText(/SCANNEZ POUR REJOINDRE/)).toBeDefined()
  })

  test('rend exactement 25 points de motif', () => {
    const { container } = render(<QrSlot />)
    expect(container.querySelectorAll('.qr-dot').length).toBe(25)
  })

  test('le motif a un état data-on déterministe sur chaque point', () => {
    // (i*7 + (i%3)*5) % 3 reduces to (i%3)*3 % 3 === 0 for all i:
    // every dot is therefore "on". This locks in that behavior.
    const { container } = render(<QrSlot />)
    const dots = container.querySelectorAll('.qr-dot')
    expect(dots.length).toBe(25)
    dots.forEach((d) => expect(d.getAttribute('data-on')).toBe('true'))
  })

  test('rend sans planter même avec une url fournie', () => {
    const { container } = render(<QrSlot url="https://example.com" />)
    expect(container.querySelector('.qr-slot')).not.toBeNull()
  })
})
