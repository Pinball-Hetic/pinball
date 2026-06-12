import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

const RELOAD_MS = 15_000 // délai avant rechargement auto après un crash
const STABLE_MS = 30_000 // page stable ce délai → on considère la boucle rompue
const MAX_RELOADS = 3 // au-delà : on cesse de recharger, on reste sur le filet
const CRASH_KEY = 'eb_crash_count' // persiste À TRAVERS les reloads (sessionStorage)

// Styles inline : si la feuille de style est elle-même la cause du crash,
// le filet reste affichable (aucune dépendance externe).
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

// Filet kiosk : un crash de rendu n'affiche jamais un écran blanc. On
// montre une scène minimale, on log la stack, et on recharge la borne au
// bout de 15s (auto-récupération sans intervention humaine). Anti-boucle :
// si le crash persiste à travers les reloads, on arrête de recharger.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }
  private timer = 0
  private resetTimer = 0

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  // Page tenue stable STABLE_MS → crash isolé, pas une boucle : on remet le
  // compteur à zéro pour qu'un incident futur puisse de nouveau recharger.
  // (On NE reset PAS à chaque mount, sinon le compteur ne survivrait jamais
  // à un reload et la détection de boucle serait inopérante.)
  componentDidMount() {
    this.resetTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CRASH_KEY)
      } catch {
        /* sessionStorage indisponible (mode privé) : sans gravité */
      }
    }, STABLE_MS)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[backglass] render crash', error, info.componentStack)
    if (this.timer) window.clearTimeout(this.timer)
    // Un reload toutes les 15s à l'infini est pire qu'un écran de repli
    // stable : au-delà de MAX_RELOADS crashs rapprochés, on s'arrête.
    let count = 1
    try {
      count = Number(sessionStorage.getItem(CRASH_KEY) ?? 0) + 1
      sessionStorage.setItem(CRASH_KEY, String(count))
    } catch {
      /* sessionStorage indisponible : on recharge quand même une fois */
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
