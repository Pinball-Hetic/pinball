"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { MapMeta } from "@pinball/maps";

interface Props {
  maps: MapMeta[];
  onSelect: (id: string) => void;
}

/* ─── Config visuelle par map ─────────────────────────────────────── */
const THEME: Record<string, {
  accent: string;
  glow: string;
  gradient: string;
  logoEl: React.ReactNode;
}> = {
  strangerthings: {
    accent: "#CC0000",
    glow: "#CC000088",
    gradient: "linear-gradient(to top, #000 0%, #1a0000bb 40%, transparent 100%)",
    logoEl: (
      <div style={{ textAlign: "center", padding: "0 12px" }}>
        <div style={{
          height: 3, background: "#CC0000",
          marginBottom: 6, borderRadius: 1,
        }} />
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 900,
          fontSize: 44,
          color: "#CC0000",
          letterSpacing: "2px",
          lineHeight: 1,
          textTransform: "uppercase",
          textShadow: "0 0 30px #CC000066",
        }}>
          Stranger<br />Things
        </div>
        <div style={{
          height: 3, background: "#CC0000",
          marginTop: 6, borderRadius: 1,
        }} />
      </div>
    ),
  },
  zelda: {
    accent: "#C8960C",
    glow: "#C8960C88",
    gradient: "linear-gradient(to top, #000 0%, #1a0e00bb 40%, transparent 100%)",
    logoEl: (
      <div style={{ textAlign: "center", padding: "0 8px" }}>
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 400,
          fontSize: 11,
          color: "#C8960C",
          letterSpacing: "6px",
          textTransform: "uppercase",
          marginBottom: 2,
        }}>
          The Legend of
        </div>
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 900,
          fontSize: 56,
          lineHeight: 0.9,
          letterSpacing: "2px",
          textTransform: "uppercase",
          background: "linear-gradient(to bottom, #FFE066 0%, #C8960C 40%, #7a5800 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textShadow: "none",
          filter: "drop-shadow(0 0 12px #C8960C88)",
        }}>
          Zelda
        </div>
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 400,
          fontSize: 10,
          color: "#C8960C",
          letterSpacing: "5px",
          textTransform: "uppercase",
          marginTop: 4,
        }}>
          Ocarina of Time
        </div>
      </div>
    ),
  },
};

const FALLBACK_THEME = THEME.strangerthings;

/* ─── Composant ───────────────────────────────────────────────────── */
export function MapSelectorScreen({ maps, onSelect }: Props) {
  const [cursor, setCursor] = useState(0);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const confirm = useCallback(
    (idx: number) => onSelect(maps[idx].id),
    [maps, onSelect],
  );

  const go = useCallback((dir: 1 | -1) => {
    setAnimDir(dir === 1 ? "right" : "left");
    setCursor((c) => (c + dir + maps.length) % maps.length);
    setTimeout(() => setAnimDir(null), 400);
  }, [maps.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") go(-1);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") go(1);
      if (e.key === "Enter" || e.key === " " || e.key === "p" || e.key === "P")
        setCursor((c) => { confirm(c); return c; });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, confirm]);

  useEffect(() => {
    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === cursor) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });
  }, [cursor]);

  const active = maps[cursor];
  const t = THEME[active.id] ?? FALLBACK_THEME;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      userSelect: "none",
    }}>
      {/* Fond ambiant animé */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 70% 60% at 50% 55%, ${t.glow}22 0%, transparent 70%)`,
        transition: "background 0.6s ease",
        pointerEvents: "none",
      }} />

      {/* Label haut */}
      <div style={{
        position: "absolute", top: 36,
        fontSize: 10, letterSpacing: 8,
        color: "#444", textTransform: "uppercase",
        fontFamily: "'Courier New', monospace",
      }}>
        Select Your Map
      </div>

      {/* ─── Carrousel ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        width: "100%",
        position: "relative",
        zIndex: 1,
      }}>
        {maps.map((m, i) => {
          const diff = i - cursor;
          const absD = Math.abs(diff);
          const selected = diff === 0;

          // Slide horizontal pur — pas de rotation
          const translateX = diff * 510;
          const scale = selected ? 1 : 0.82;
          const opacity = absD > 1 ? 0 : selected ? 1 : 0.5;
          const zIndex = selected ? 10 : 5 - absD;
          const rotateY = 0;
          const blur = selected ? 0 : 1.5;

          const mt = THEME[m.id] ?? FALLBACK_THEME;

          return (
            <div
              key={m.id}
              onClick={() => selected ? confirm(i) : go(diff > 0 ? 1 : -1)}
              style={{
                position: "absolute",
                width: 460,
                height: 640,
                borderRadius: 16,
                overflow: "hidden",
                border: `1.5px solid ${selected ? mt.accent : "#1a1a1a"}`,
                background: "#0a0a0a",
                cursor: "pointer",
                // Transform 3D
                transform: `translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`,
                transformOrigin: "center center",
                opacity,
                zIndex,
                filter: blur > 0 ? `blur(${blur}px)` : "none",
                boxShadow: selected
                  ? `0 0 0 1px ${mt.accent}44, 0 24px 80px ${mt.accent}44, 0 0 160px ${mt.accent}18`
                  : "none",
                transition: `
                  transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                  opacity 0.45s ease,
                  box-shadow 0.45s ease,
                  filter 0.45s ease,
                  border-color 0.45s ease
                `,
              }}
            >
              {/* Vidéo */}
              {m.previewVideo && (
                <video
                  ref={(el) => { videoRefs.current[i] = el; }}
                  src={m.previewVideo}
                  autoPlay={selected}
                  loop muted playsInline
                  style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    objectFit: "contain",
                  }}
                />
              )}

              {/* Gradient overlay */}
              <div style={{
                position: "absolute", inset: 0,
                background: mt.gradient,
              }} />

              {/* Vignette latérale sur les non-sélectionnées */}
              {!selected && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(0,0,0,0.45)",
                }} />
              )}

              {/* Logo centré en haut */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "36px 16px 0",
              }}>
                {mt.logoEl}
              </div>

              {/* Coins décoratifs */}
              {[
                { top: 12, left: 12, borderTop: true, borderLeft: true },
                { top: 12, right: 12, borderTop: true, borderRight: true },
                { bottom: 12, left: 12, borderBottom: true, borderLeft: true },
                { bottom: 12, right: 12, borderBottom: true, borderRight: true },
              ].map((corner, ci) => (
                <div key={ci} style={{
                  position: "absolute",
                  ...corner as object,
                  width: 18, height: 18,
                  borderColor: selected ? `${mt.accent}88` : "#222",
                  borderStyle: "solid",
                  borderWidth: 0,
                  borderTopWidth:    corner.borderTop    ? 1.5 : 0,
                  borderLeftWidth:   corner.borderLeft   ? 1.5 : 0,
                  borderRightWidth:  corner.borderRight  ? 1.5 : 0,
                  borderBottomWidth: corner.borderBottom ? 1.5 : 0,
                  transition: "border-color 0.4s",
                }} />
              ))}

              {/* Bas de card : tagline + CTA */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "0 24px 28px",
              }}>
                {/* Ligne séparatrice */}
                <div style={{
                  height: 1,
                  background: `linear-gradient(to right, transparent, ${mt.accent}88, transparent)`,
                  marginBottom: 14,
                  opacity: selected ? 1 : 0.2,
                  transition: "opacity 0.4s",
                }} />

                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 9, letterSpacing: 4,
                  color: `${mt.accent}aa`,
                  textTransform: "uppercase",
                  marginBottom: selected ? 14 : 0,
                  transition: "margin 0.4s",
                }}>
                  {m.tagline}
                </div>

                {selected && (
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 9, letterSpacing: 3,
                    color: mt.accent,
                    textTransform: "uppercase",
                    animation: "blink 1.4s ease-in-out infinite",
                  }}>
                    ↵ Press Enter to Play
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Flèches navigation */}
      <div style={{
        position: "absolute",
        bottom: 52,
        display: "flex",
        gap: 24,
        alignItems: "center",
        zIndex: 2,
      }}>
        <button onClick={() => go(-1)} style={{
          background: "none", border: `1px solid #333`,
          color: "#555", width: 40, height: 40, borderRadius: "50%",
          cursor: "pointer", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
          fontFamily: "monospace",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent; (e.currentTarget as HTMLButtonElement).style.color = t.accent; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#333"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; }}
        >←</button>

        {/* Dots */}
        <div style={{ display: "flex", gap: 8 }}>
          {maps.map((_, i) => (
            <div key={i} onClick={() => { go(i > cursor ? 1 : -1); }} style={{
              width: i === cursor ? 24 : 6, height: 6, borderRadius: 3,
              background: i === cursor ? t.accent : "#2a2a2a",
              boxShadow: i === cursor ? `0 0 8px ${t.accent}` : "none",
              transition: "all 0.35s ease",
              cursor: "pointer",
            }} />
          ))}
        </div>

        <button onClick={() => go(1)} style={{
          background: "none", border: "1px solid #333",
          color: "#555", width: 40, height: 40, borderRadius: "50%",
          cursor: "pointer", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
          fontFamily: "monospace",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent; (e.currentTarget as HTMLButtonElement).style.color = t.accent; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#333"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; }}
        >→</button>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
