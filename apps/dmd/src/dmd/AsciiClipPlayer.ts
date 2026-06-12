import type { CinematicClip } from '@pinball/shared-types'
import { DOT, parseClip, trimFrame, type ParsedClip } from '@pinball/dmd-core'
import { RAW_CLIPS } from './clips'
import { DEMOGORGON_HERO } from './clips/demogorgonHero'

// Registre des clips ASCII spécifiques ST + frame hero. Les primitives de
// rendu (parseClip/blit/revealRadial/dissolve) vivent dans @pinball/dmd-core.
// TODO phase 5 : ce registre migrera dans packages/maps/strangerthings/dmd/.

// Palettes par clip (résolution char → index palette du DMD).
const RED = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.gameOver, '!': DOT.event }
const VIOLET = { ':': DOT.heticOff, '#': DOT.multi, '@': DOT.rain, '!': DOT.event }
const AMBER = { ':': DOT.heticOff, '#': DOT.score, '@': DOT.marquee, '!': DOT.event }

// Clips frame-par-frame restants (rises/slain sont désormais procéduraux).
export const CLIPS: Record<'portal_swallow' | 'last_chance' | 'hall_of_fame', ParsedClip> = {
  portal_swallow: parseClip(RAW_CLIPS.portal_swallow, VIOLET),
  last_chance: parseClip(RAW_CLIPS.last_chance, RED),
  hall_of_fame: parseClip(RAW_CLIPS.hall_of_fame, AMBER),
}

export function clipFor(clip: CinematicClip): ParsedClip | null {
  return clip in CLIPS ? CLIPS[clip as keyof typeof CLIPS] : null
}

// Frame statique hero (transformée par revealRadial/dissolve dans layouts).
export const HERO_FRAME: string[] = trimFrame(DEMOGORGON_HERO.replace(/\r/g, '').split('\n'))
