import { test, expect, afterEach, beforeEach, describe, spyOn } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

const RELOAD_MS = 15_000

function Boom(): never {
  throw new Error('render boom')
}

let consoleSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  sessionStorage.clear()
  // Silence le console.error attendu (crash + warning React boundary).
  consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  consoleSpy.mockRestore()
  sessionStorage.clear()
})

describe('ErrorBoundary', () => {
  test('rend les enfants quand il n y a pas d erreur', () => {
    render(
      <ErrorBoundary>
        <span>contenu sain</span>
      </ErrorBoundary>,
    )
    expect(screen.getByText('contenu sain')).toBeDefined()
  })

  test('affiche le filet de repli quand un enfant crash', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('STRANGER PINBALL')).toBeDefined()
  })

  test('incrémente le compteur de crash dans sessionStorage', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(sessionStorage.getItem('eb_crash_count')).toBe('1')
  })

  test('programme un reload tant que le compteur est sous le max', () => {
    const setTimeoutSpy = spyOn(window, 'setTimeout')
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    // Un setTimeout avec le délai de reload (15s) doit avoir été programmé.
    const scheduledReload = setTimeoutSpy.mock.calls.some(
      (c) => c[1] === RELOAD_MS,
    )
    expect(scheduledReload).toBe(true)
    setTimeoutSpy.mockRestore()
  })

  test('cesse de programmer un reload au-delà du max de crashs', () => {
    // Le 4e crash (count -> 4 > MAX_RELOADS=3) ne doit plus recharger.
    sessionStorage.setItem('eb_crash_count', '3')
    const setTimeoutSpy = spyOn(window, 'setTimeout')
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(sessionStorage.getItem('eb_crash_count')).toBe('4')
    const scheduledReload = setTimeoutSpy.mock.calls.some(
      (c) => c[1] === RELOAD_MS,
    )
    expect(scheduledReload).toBe(false)
    setTimeoutSpy.mockRestore()
  })
})
