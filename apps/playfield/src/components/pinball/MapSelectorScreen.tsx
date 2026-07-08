"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { MapMeta } from "@pinball/maps";
import { BUTTON_ACTION } from "@pinball/shared-types";
import { usePhysicalInputs } from "@/hooks/usePhysicalInputs";

interface Props {
  maps: MapMeta[];
  onSelect: (id: string) => void;
}

const THEME: Record<string, {
  accent: string;
  glow: string;
  gradient: string;
  logoEl: React.ReactNode;
}> = {
  strangerthings: {
    accent: "#CC0000",
    glow: "#CC000088",
    gradient: "linear-gradient(to top, #000 0%, #1a0000cc 35%, transparent 100%)",
    logoEl: (
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <div style={{
          height: 4, background: "#CC0000",
          marginBottom: 12, borderRadius: 2,
        }} />
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 900,
          fontSize: 88,
          color: "#CC0000",
          letterSpacing: "4px",
          lineHeight: 1,
          textTransform: "uppercase",
          textShadow: "0 0 60px #CC000066",
        }}>
          Stranger<br />Things
        </div>
        <div style={{
          height: 4, background: "#CC0000",
          marginTop: 12, borderRadius: 2,
        }} />
      </div>
    ),
  },
  zelda: {
    accent: "#C8960C",
    glow: "#C8960C88",
    gradient: "linear-gradient(to top, #000 0%, #1a0e00cc 35%, transparent 100%)",
    logoEl: (
      <div style={{ textAlign: "center", padding: "0 16px" }}>
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 400,
          fontSize: 22,
          color: "#C8960C",
          letterSpacing: "10px",
          textTransform: "uppercase",
          marginBottom: 4,
        }}>
          The Legend of
        </div>
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 900,
          fontSize: 112,
          lineHeight: 0.9,
          letterSpacing: "4px",
          textTransform: "uppercase",
          background: "linear-gradient(to bottom, #FFE066 0%, #C8960C 40%, #7a5800 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textShadow: "none",
          filter: "drop-shadow(0 0 24px #C8960C88)",
        }}>
          Zelda
        </div>
        <div style={{
          fontFamily: '"Georgia", serif',
          fontWeight: 400,
          fontSize: 18,
          color: "#C8960C",
          letterSpacing: "8px",
          textTransform: "uppercase",
          marginTop: 8,
        }}>
          Ocarina of Time
        </div>
      </div>
    ),
  },
};

const FALLBACK_THEME = THEME.strangerthings;

export function MapSelectorScreen({ maps, onSelect }: Props) {
  const [cursor, setCursor] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const confirm = useCallback(
    (idx: number) => onSelect(maps[idx].id),
    [maps, onSelect],
  );

  const go = useCallback((dir: 1 | -1) => {
    setCursor((c) => (c + dir + maps.length) % maps.length);
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

  // PinballPlayfield isn't mounted yet, so this subscription is what lets the
  // selector receive physical cabinet buttons.
  const { callbacksRef } = usePhysicalInputs();
  useEffect(() => {
    callbacksRef.current = {
      onButton: (data) => {
        if (data.action !== "DOWN") return;
        const action = BUTTON_ACTION[data.id];
        if (action === "FLIP_LEFT") go(-1);
        else if (action === "FLIP_RIGHT") go(1);
        else if (action === "PLUNGE" || action === "START")
          setCursor((c) => { confirm(c); return c; });
      },
    };
  }, [callbacksRef, go, confirm]);

  useEffect(() => {
    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === cursor) { vid.currentTime = 0; vid.play().catch(() => {}); }
      else { vid.pause(); }
    });
  }, [cursor]);

  const active = maps[cursor];
  const t = THEME[active.id] ?? FALLBACK_THEME;

  const CARD_W = 800;
  const CARD_H = 1300;
  const SIDE_OFFSET = 920;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      overflow: "hidden",
      userSelect: "none",
      paddingTop: 80,
      paddingBottom: 80,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 80% 60% at 50% 52%, ${t.glow}22 0%, transparent 65%)`,
        transition: "background 0.6s ease",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative", zIndex: 2,
        fontSize: 18, letterSpacing: 14,
        color: "#333", textTransform: "uppercase",
        fontFamily: "'Courier New', monospace",
        flexShrink: 0,
      }}>
        Select Your Map
      </div>

      <div style={{
        position: "relative",
        width: "100%",
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>
        {maps.map((m, i) => {
          const diff = i - cursor;
          const absD = Math.abs(diff);
          const selected = diff === 0;

          const translateX = diff * SIDE_OFFSET;
          const scale = selected ? 1 : 0.72;
          const opacity = absD > 1 ? 0 : selected ? 1 : 0.45;
          const zIndex = selected ? 10 : 5 - absD;
          const blur = selected ? 0 : 3;

          const mt = THEME[m.id] ?? FALLBACK_THEME;

          return (
            <div
              key={m.id}
              onClick={() => selected ? confirm(i) : go(diff > 0 ? 1 : -1)}
              style={{
                position: "absolute",
                width: CARD_W,
                height: CARD_H,
                borderRadius: 24,
                overflow: "hidden",
                border: `2px solid ${selected ? mt.accent : "#1a1a1a"}`,
                background: "#080808",
                cursor: "pointer",
                transform: `translateX(${translateX}px) scale(${scale})`,
                transformOrigin: "center center",
                opacity,
                zIndex,
                filter: blur > 0 ? `blur(${blur}px)` : "none",
                boxShadow: selected
                  ? `0 0 0 1px ${mt.accent}44, 0 32px 120px ${mt.accent}44, 0 0 200px ${mt.accent}18`
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

              <div style={{
                position: "absolute", inset: 0,
                background: mt.gradient,
              }} />

              {!selected && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(0,0,0,0.5)",
                }} />
              )}

              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "72px 24px 0",
              }}>
                {mt.logoEl}
              </div>

              {[
                { top: 20, left: 20, borderTop: true, borderLeft: true },
                { top: 20, right: 20, borderTop: true, borderRight: true },
                { bottom: 20, left: 20, borderBottom: true, borderLeft: true },
                { bottom: 20, right: 20, borderBottom: true, borderRight: true },
              ].map((corner, ci) => (
                <div key={ci} style={{
                  position: "absolute",
                  ...corner as object,
                  width: 32, height: 32,
                  borderColor: selected ? `${mt.accent}88` : "#222",
                  borderStyle: "solid",
                  borderWidth: 0,
                  borderTopWidth:    corner.borderTop    ? 2 : 0,
                  borderLeftWidth:   corner.borderLeft   ? 2 : 0,
                  borderRightWidth:  corner.borderRight  ? 2 : 0,
                  borderBottomWidth: corner.borderBottom ? 2 : 0,
                  transition: "border-color 0.4s",
                }} />
              ))}

              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "0 40px 52px",
              }}>
                <div style={{
                  height: 1,
                  background: `linear-gradient(to right, transparent, ${mt.accent}88, transparent)`,
                  marginBottom: 24,
                  opacity: selected ? 1 : 0.2,
                  transition: "opacity 0.4s",
                }} />

                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 18, letterSpacing: 6,
                  color: `${mt.accent}aa`,
                  textTransform: "uppercase",
                  marginBottom: selected ? 28 : 0,
                  transition: "margin 0.4s",
                }}>
                  {m.tagline}
                </div>

                {selected && (
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 18, letterSpacing: 5,
                    color: mt.accent,
                    textTransform: "uppercase",
                    animation: "blink 1.4s ease-in-out infinite",
                  }}>
                    Press Enter to Play
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        position: "relative", zIndex: 2,
        display: "flex",
        gap: 48,
        alignItems: "center",
        flexShrink: 0,
      }}>
        <button onClick={() => go(-1)} style={{
          background: "none", border: `2px solid #333`,
          color: "#555", width: 80, height: 80, borderRadius: "50%",
          cursor: "pointer", fontSize: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
          fontFamily: "monospace",
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent;
            (e.currentTarget as HTMLButtonElement).style.color = t.accent;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#333";
            (e.currentTarget as HTMLButtonElement).style.color = "#555";
          }}
        >&#8592;</button>

        <div style={{ display: "flex", gap: 16 }}>
          {maps.map((_, i) => (
            <div key={i} onClick={() => setCursor(i)} style={{
              width: i === cursor ? 48 : 12,
              height: 12,
              borderRadius: 6,
              background: i === cursor ? t.accent : "#2a2a2a",
              boxShadow: i === cursor ? `0 0 16px ${t.accent}` : "none",
              transition: "all 0.35s ease",
              cursor: "pointer",
            }} />
          ))}
        </div>

        <button onClick={() => go(1)} style={{
          background: "none", border: "2px solid #333",
          color: "#555", width: 80, height: 80, borderRadius: "50%",
          cursor: "pointer", fontSize: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
          fontFamily: "monospace",
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent;
            (e.currentTarget as HTMLButtonElement).style.color = t.accent;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#333";
            (e.currentTarget as HTMLButtonElement).style.color = "#555";
          }}
        >&#8594;</button>
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
