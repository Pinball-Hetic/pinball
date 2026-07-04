import type { CSSProperties } from "react";
import type { BossDefinition } from "@pinball/game-engine";
import type { MapManifest } from "@pinball/shared-types";
import type { BossHudState, ScorePop } from "../../hooks/useGameState";
import ScorePopFeedback from "./ScorePopFeedback";
import PlungerPowerBar from "./PlungerPowerBar";
import BossHealthBar from "./BossHealthBar";
import { bossHealthBarTheme } from "./bossHealthHud";
import StyledQrCode from "./StyledQrCode";
import type { PlayfieldBootPhase } from "./bootPhase";

// Ball reset = DEV helper only (button + hint + R key). Must not exist in
// prod (cabinet). NODE_ENV is inlined at Next build time.
const IS_DEV = process.env.NODE_ENV !== "production";

export type { PlayfieldBootPhase };

interface GameOverlayProps {
  lives: number;
  gameState: "idle" | "playing" | "game_over";
  bootPhase: PlayfieldBootPhase;
  plungerCharge: number | null;
  onResetBall?: () => void;
  initialLives: number;
  bossHud: BossHudState;
  scorePops: ScorePop[];
  alternateWorldActive: boolean;
  alternateWorldHint: boolean;
  atmosphereBannerLabel: string;
  atmosphereHintLabel: string;
  attractTagline: string;
  bosses: BossDefinition[];
  cabinetMode?: boolean;
  portraitFill?: boolean;
  plungerAnchor?: { x: number; y: number };
  onAttractInteract?: () => void;
  gameOverClaimUrl?: string | null;
  gameOverCode?: string | null;
  gameOverScore?: number;
  mapTheme?: CSSProperties;
  outro?: MapManifest["outro"];
  qrLogo?: string;
}

type OverlayLayout = {
  header: string;
  livesSize: string;
  keyboardHints: string | null;
  alternateWorldBanner: string;
  upsideDownHint: string;
  bossAssist: string;
  bottomHint: string;
  powerHint: string;
  attractShell: string;
  attractTitle: string;
  attractSubtitle: string;
  attractPrompt: string;
  attractTapHint: string | null;
  attractControls: string | null;
};

const PORTRAIT_BOSS_BOTTOM: Record<string, string> = {
  "bottom-8": "bottom-[22%]",
  "bottom-24": "bottom-[32%]",
};

function overlayLayout(portraitFill: boolean): OverlayLayout {
  if (portraitFill) {
    return {
      header:
        "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))]",
      livesSize: "text-base",
      keyboardHints: null,
      alternateWorldBanner:
        "pointer-events-none absolute inset-x-0 top-[max(2.5rem,calc(env(safe-area-inset-top)+1.75rem))] z-10 flex justify-center",
      upsideDownHint:
        "pointer-events-none absolute inset-x-0 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] z-10 flex justify-center px-4",
      bossAssist:
        "pointer-events-none absolute inset-x-0 top-[max(4rem,calc(env(safe-area-inset-top)+3rem))] z-10 flex justify-center",
      bottomHint: "bottom-[max(1rem,env(safe-area-inset-bottom))]",
      powerHint: "bottom-[max(3.25rem,env(safe-area-inset-bottom))]",
      attractShell:
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#0a0e18]/75 via-[#0a0e18]/55 to-[#0a0e18]/85 px-4 pb-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[2px]",
      attractTitle:
        "mt-2 font-mono text-3xl font-bold uppercase tracking-[0.16em] text-zinc-100 drop-shadow-[0_0_24px_rgba(255,180,0,0.35)]",
      attractSubtitle: "mt-3 max-w-[16rem] text-sm leading-relaxed text-zinc-400",
      attractPrompt:
        "rounded-full border border-amber-500/30 bg-black/50 px-8 py-4 font-mono backdrop-blur-sm",
      attractTapHint: "text-[10px] uppercase tracking-[0.22em] text-zinc-600",
      attractControls: null,
    };
  }
  return {
    header:
      "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-4",
    livesSize: "text-lg",
    keyboardHints: "text-right font-mono text-[10px] text-zinc-500 space-y-0.5 leading-relaxed",
    alternateWorldBanner: "pointer-events-none absolute inset-x-0 top-[4.75rem] z-10 flex justify-center",
    upsideDownHint: "pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-6",
    bossAssist: "pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center",
    bottomHint: "bottom-6",
    powerHint: "bottom-6",
    attractShell:
      "absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#0a0e18]/75 via-[#0a0e18]/55 to-[#0a0e18]/85 px-6 backdrop-blur-[2px]",
    attractTitle:
      "mt-3 font-mono text-4xl font-bold uppercase tracking-[0.18em] text-zinc-100 drop-shadow-[0_0_24px_rgba(255,180,0,0.35)] sm:text-5xl",
    attractSubtitle: "mt-3 max-w-xs text-sm leading-relaxed text-zinc-400",
    attractPrompt:
      "rounded-full border border-amber-500/30 bg-black/50 px-6 py-3 font-mono backdrop-blur-sm",
    attractTapHint: "text-[10px] uppercase tracking-[0.22em] text-zinc-600",
    attractControls:
      "absolute bottom-8 text-center font-mono text-[10px] text-zinc-600 space-y-1 leading-relaxed",
  };
}

function bossBottomClass(legacyClass: string, portraitFill: boolean): string {
  if (!portraitFill) return legacyClass;
  return PORTRAIT_BOSS_BOTTOM[legacyClass] ?? "bottom-[22%]";
}

export default function GameOverlay({
  lives,
  gameState,
  bootPhase,
  plungerCharge,
  onResetBall,
  initialLives,
  bossHud,
  scorePops,
  alternateWorldActive,
  alternateWorldHint,
  atmosphereBannerLabel,
  atmosphereHintLabel,
  attractTagline,
  bosses,
  cabinetMode = false,
  portraitFill = false,
  plungerAnchor,
  onAttractInteract,
  gameOverClaimUrl = null,
  gameOverCode = null,
  gameOverScore = 0,
  mapTheme,
  outro,
  qrLogo,
}: GameOverlayProps) {
  void cabinetMode;
  const layout = overlayLayout(portraitFill);

  const showHud = bootPhase === "in_game";
  const showLaunchHint =
    bootPhase === "in_game" && gameState === "idle" && plungerCharge === null;
  const showPowerBar =
    bootPhase === "in_game" && gameState === "idle" && plungerCharge !== null;
  const showGameOver = bootPhase === "in_game" && gameState === "game_over";

  // Outro accent color: normal glow vs inverted world. Neutral fallbacks →
  // a map without a theme stays clean (no hardcoded ST).
  const glow = alternateWorldActive ? "var(--glow-alt, #b14dff)" : "var(--glow, #ff2d2d)";
  const dot = "var(--vignette, #2a0606)";
  const title = outro?.title ?? "FIN DE PARTIE";
  const scanLabel = outro?.scanLabel ?? "Scanne pour t'inscrire au classement";
  const replayLabel = outro?.replayLabel ?? "START — Rejouer";

  const showResetBall =
    IS_DEV && bootPhase === "in_game" && gameState !== "game_over" && plungerCharge === null;

  const showAlternateWorldBanner =
    bootPhase === "in_game" && gameState === "playing" && alternateWorldActive;

  const showAlternateWorldHint =
    bootPhase === "in_game" && gameState === "playing" && alternateWorldHint;

  return (
    <>
      <ScorePopFeedback pops={scorePops} />

      {showHud && (
        <header className={layout.header}>
          <div className="font-mono space-y-1.5">
            <div className={`flex gap-1.5 ${layout.livesSize}`}>
              {Array.from({ length: Math.max(lives, initialLives) }).map((_, i) => (
                <span
                  key={i}
                  className="transition-opacity duration-300"
                  style={{ opacity: i < lives ? 1 : 0.2 }}
                >
                  ●
                </span>
              ))}
            </div>
            {showResetBall && onResetBall && (
              <button
                type="button"
                onClick={onResetBall}
                className="pointer-events-auto mt-2 rounded border border-red-500/35 bg-black/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300/90 backdrop-blur-sm transition hover:border-red-400/50 hover:bg-black/80 hover:text-red-200 active:scale-[0.98]"
              >
                Reset balle — R (−1 vie)
              </button>
            )}
          </div>
          {layout.keyboardHints && (
            <div className={layout.keyboardHints}>
              <div>Q / ← — Flipper gauche</div>
              <div>D / → — Flipper droit</div>
              <div>ESPACE — Charger / lancer</div>
              {IS_DEV && <div>R — Reset balle (−1 vie)</div>}
              <div>H — Debug colliders</div>
            </div>
          )}
        </header>
      )}

      {showAlternateWorldBanner && (
        <div className={layout.alternateWorldBanner}>
          <div className="rounded border border-violet-500/25 bg-black/45 px-3 py-1 font-mono backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-[0.45em] text-violet-300/80 drop-shadow-[0_0_10px_rgba(140,80,200,0.45)]">
              {atmosphereBannerLabel}
            </p>
          </div>
        </div>
      )}

      {showAlternateWorldHint && (
        <div className={layout.upsideDownHint}>
          <p className="animate-pulse text-center font-mono text-xs uppercase tracking-[0.22em] text-violet-200/75 drop-shadow-[0_0_12px_rgba(150,90,220,0.55)] sm:text-sm">
            {atmosphereHintLabel}
          </p>
        </div>
      )}

      {bosses.map((def) => {
        const bossId = def.id;
        const hud = bossHud[bossId];
        const showBossHud =
          bootPhase === "in_game" &&
          gameState === "playing" &&
          hud.active &&
          (!def.hud.requiresAlternateWorld || alternateWorldActive);

        if (!showBossHud) return null;

        return (
          <div key={bossId}>
            {hud.assistFlash && def.hud.assistLabel && !hud.victory && (
              <div className={layout.bossAssist}>
                <p className="font-mono text-sm font-bold uppercase tracking-[0.25em] text-violet-300 drop-shadow-[0_0_14px_rgba(180,100,255,0.85)] sm:text-base">
                  {def.hud.assistLabel}
                </p>
              </div>
            )}

            {!hud.victory && (() => {
              const healthTheme = def.hud.healthBar ? bossHealthBarTheme(bossId) : null;
              const bottomClass = bossBottomClass(def.hud.bottomClass, portraitFill);

              if (healthTheme) {
                return (
                  <BossHealthBar
                    label={def.hud.label}
                    hits={hud.hits}
                    maxHits={def.targetHits}
                    theme={healthTheme}
                    bottomClass={bottomClass}
                  />
                );
              }

              return (
                <div
                  className={`pointer-events-none absolute inset-x-0 ${bottomClass} z-10 flex justify-center`}
                >
                  <div
                    className={`rounded border ${def.hud.borderClass} bg-black/70 px-4 py-2 text-center font-mono backdrop-blur-sm`}
                  >
                    <p className={`text-[10px] uppercase tracking-[0.35em] ${def.hud.subtitleClass}`}>
                      {def.hud.label}
                    </p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${def.hud.hitsClass}`}>
                      {hud.hits} / {def.targetHits}
                    </p>
                  </div>
                </div>
              );
            })()}

            {hud.victory && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <p className={`font-mono text-2xl font-bold uppercase tracking-[0.2em] sm:text-3xl ${def.hud.victoryClass}`}>
                  {def.hud.victoryLabel}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {bootPhase === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400/90"
            aria-hidden
          />
          <div className="text-center font-mono">
            <p className="text-xs uppercase tracking-[0.45em] text-zinc-500">
              Chargement
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Préparation du plateau…
            </p>
          </div>
        </div>
      )}

      {bootPhase === "attract" && (
        <div className={layout.attractShell} onPointerDown={onAttractInteract}>
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.55em] text-red-400/80">
              {attractTagline}
            </p>
            <h1 className={layout.attractTitle}>Pinball</h1>
          </div>
        </div>
      )}

      {showGameOver && (
        <div
          className="crt-scanlines pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 backdrop-blur-[2px]"
          style={{
            ...mapTheme,
            background:
              "radial-gradient(ellipse at center, var(--vignette, #14181f) 0%, #000000 78%)",
          }}
        >
          <p
            className="vhs-flicker font-black uppercase tracking-[0.28em] text-3xl sm:text-4xl"
            style={{
              fontFamily: "var(--st-font, serif)",
              color: "var(--foreground, #ede4d3)",
              textShadow: `0 0 18px ${glow}, 0 0 42px ${glow}99`,
            }}
          >
            {title}
          </p>

          <p
            className="font-black tabular-nums text-5xl sm:text-6xl"
            style={{
              fontFamily: "var(--st-font, serif)",
              color: "var(--foreground, #ede4d3)",
              textShadow: `0 0 16px ${glow}, 0 0 40px ${glow}80`,
            }}
          >
            {gameOverScore.toLocaleString("fr-FR")}
          </p>

          <div className="relative px-5 pt-5">
            <p
              className="absolute inset-x-0 -top-1 text-center font-mono text-[9px] uppercase tracking-[0.4em]"
              style={{ color: glow, textShadow: `0 0 10px ${glow}` }}
            >
              Transmission entrante
            </p>
            {/* 4 bracket corners */}
            <span className="absolute left-0 top-3 h-5 w-5 border-l-2 border-t-2" style={{ borderColor: glow }} />
            <span className="absolute right-0 top-3 h-5 w-5 border-r-2 border-t-2" style={{ borderColor: glow }} />
            <span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2" style={{ borderColor: glow }} />
            <span className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2" style={{ borderColor: glow }} />

            {gameOverClaimUrl ? (
              <StyledQrCode value={gameOverClaimUrl} color={glow} dotColor={dot} logoUrl={qrLogo} />
            ) : (
              <div className="flex h-[180px] w-[180px] items-center justify-center rounded-lg border border-white/10 bg-black/40">
                <p className="animate-pulse font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  Génération du code…
                </p>
              </div>
            )}
          </div>

          {gameOverCode && (
            <p
              className="text-sm font-bold uppercase tracking-[0.5em]"
              style={{
                fontFamily: "var(--st-font, monospace)",
                color: "var(--foreground, #ede4d3)",
                textShadow: `0 0 8px ${glow}`,
              }}
            >
              <span className="opacity-60">CODE</span>{" "}
              {gameOverCode.split("").join(" ")}
            </p>
          )}

          <p
            className="max-w-xs text-center font-mono text-xs uppercase tracking-[0.18em]"
            style={{ color: "var(--foreground, #ede4d3)", opacity: 0.8 }}
          >
            {scanLabel}
          </p>

          <p
            className="animate-pulse font-mono text-[11px] uppercase tracking-[0.24em]"
            style={{ color: glow, textShadow: `0 0 12px ${glow}` }}
          >
            {replayLabel}
          </p>
        </div>
      )}

      {showPowerBar && (
        <PlungerPowerBar
          charge={plungerCharge}
          portraitFill={portraitFill}
          anchor={plungerAnchor}
        />
      )}

      {showPowerBar && (
        <div className={`pointer-events-none absolute inset-x-0 ${layout.powerHint} z-10 flex justify-center px-4`}>
          <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.22em] text-amber-200/80">
            Relâcher ESPACE pour lancer
          </p>
        </div>
      )}

      {showLaunchHint && (
        <div className={`pointer-events-none absolute inset-x-0 ${layout.bottomHint} z-10 flex flex-col items-center gap-2 px-4`}>
          {lives < initialLives && (
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
              Bille perdue — {lives} vie{lives > 1 ? "s" : ""} restante{lives > 1 ? "s" : ""}
            </p>
          )}
          <div className="rounded-full border border-zinc-700/60 bg-black/55 px-5 py-2 font-mono backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-300">
              Maintenir <span className="text-amber-300/90">ESPACE</span> — relâcher pour lancer
            </p>
          </div>
        </div>
      )}
    </>
  );
}
