import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

const RELOAD_MS = 15_000 // delay before auto-reload after a crash
const STABLE_MS = 30_000 // page stable for this long → crash loop considered broken
const MAX_RELOADS = 3 // beyond this: stop reloading, stay on the safety net
const CRASH_KEY = 'eb_crash_count' // persists ACROSS reloads (sessionStorage)

// Inline styles: if the stylesheet itself caused the crash, the safety net
// stays renderable (no external dependency).
const fallbackStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#000',
  color: '#e50914',
  font: '700 48px monospace',
  letterSpacing: '0.25em',
  textShadow: '0 0 16px #e50914',
}

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// Kiosk safety net: a render crash never shows a white screen. Show a minimal
// scene, log the stack, and reload the cabinet after 15s (self-recovery
// without human intervention). Anti-loop: if the crash persists across
// reloads, stop reloading.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }
  private timer = 0
  private resetTimer = 0

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  // Page held stable for STABLE_MS → isolated crash, not a loop: reset the
  // counter so a future incident can reload again.
  // (Do NOT reset on every mount, otherwise the counter would never survive
  // a reload and loop detection would be inoperative.)
  componentDidMount() {
    this.resetTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CRASH_KEY)
      } catch {
        /* sessionStorage unavailable (private mode): harmless */
      }
    }, STABLE_MS)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[backglass] render crash', error, info.componentStack)
    if (this.timer) window.clearTimeout(this.timer)
    // Reloading every 15s forever is worse than a stable fallback screen:
    // beyond MAX_RELOADS crashes in a row, stop.
    let count = 1
    try {
      count = Number(sessionStorage.getItem(CRASH_KEY) ?? 0) + 1
      sessionStorage.setItem(CRASH_KEY, String(count))
    } catch {
      /* sessionStorage unavailable: still reload once */
    }
    if (count <= MAX_RELOADS) {
      this.timer = window.setTimeout(() => window.location.reload(), RELOAD_MS)
    }
  }

  componentWillUnmount() {
    if (this.timer) window.clearTimeout(this.timer)
    if (this.resetTimer) window.clearTimeout(this.resetTimer)
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={fallbackStyle}>
          <span>STRANGER PINBALL</span>
        </div>
      )
    }
    return this.props.children
  }
}
