import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

const RELOAD_MS = 15_000
const STABLE_MS = 30_000
const MAX_RELOADS = 3
const CRASH_KEY = 'eb_crash_count'

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

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }
  private timer = 0
  private resetTimer = 0

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  // Reset the counter only after STABLE_MS, not on every mount — otherwise the
  // counter never survives a reload and loop detection is inoperative.
  componentDidMount() {
    this.resetTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CRASH_KEY)
      } catch {}
    }, STABLE_MS)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[backglass] render crash', error, info.componentStack)
    if (this.timer) window.clearTimeout(this.timer)
    let count = 1
    try {
      count = Number(sessionStorage.getItem(CRASH_KEY) ?? 0) + 1
      sessionStorage.setItem(CRASH_KEY, String(count))
    } catch {}
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
