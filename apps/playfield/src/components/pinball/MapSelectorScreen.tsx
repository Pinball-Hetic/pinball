"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { MapMeta } from "@pinball/maps";

interface Props {
  maps: MapMeta[];
  onSelect: (id: string) => void;
}

const MAP_STYLES: Record<string, {
  titleFont: string;
  titleColor: string;
  titleShadow: string;
  titleLetterSpacing: string;
  taglineColor: string;
  glowColor: string;
  topAccent: string;
  bottomAccent: string;
  overlayGradient: string;
}> = {
  strangerthings: {
    titleFont: '"Georgia", "Times New Roman", serif',
    titleColor: "#ff2020",
    titleShadow: "0 0 20px #ff000088, 0 0 60px #ff000044, 2px 2px 0 #000",
    titleLetterSpacing: "6px",
    taglineColor: "rgba(255,100,100,0.8)",
    glowColor: "#e53935",
    topAccent: "linear-gradient(to bottom, #e5393588, transparent)",
    bottomAccent: "linear-gradient(to top, #000000ee 0%, #1a000088 50%, transparent 100%)",
    overlayGradient: "linear-gradient(to bottom, #00000055 0%, transparent 35%, #00000088 65%, #000000ee 100%)",
  },
  zelda: {
    titleFont: '"Georgia", "Times New Roman", serif',
    titleColor: "#FFD700",
    titleShadow: "0 0 20px #FFD70088, 0 0 60px #FFD70044, 2px 2px 0 #000",
    titleLetterSpacing: "3px",
    taglineColor: "rgba(255,215,0,0.7)",
    glowColor: "#FFD700",
    topAccent: "linear-gradient(to bottom, #FFD70033, transparent)",
    bottomAccent: "linear-gradient(to top, #000000ee 0%, #1a110088 50%, transparent 100%)",
    overlayGradient: "linear-gradient(to bottom, #00000055 0%, transparent 35%, #00000088 65%, #000000ee 100%)",
  },
};

const FALLBACK_STYLE = MAP_STYLES.strangerthings;

export function MapSelectorScreen({ maps, onSelect }: Props) {
  const [cursor, setCursor] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const confirm = useCallback(
    (idx: number) => onSelect(maps[idx].id),
    [maps, onSelect],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft": case "a": case "A":
          setCursor((c) => (c - 1 + maps.length) % maps.length);
          break;
        case "ArrowRight": case "d": case "D":
          setCursor((c) => (c + 1) % maps.length);
          break;
        case "Enter": case " ": case "p": case "P":
          setCursor((c) => { confirm(c); return c; });
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maps.length, confirm]);

  useEffect(() => {
    const vid = videoRefs.current[cursor];
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }
  }, [cursor]);

  const active = maps[cursor];
  const activeStyle = MAP_STYLES[active.id] ?? FALLBACK_STYLE;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Courier New', monospace",
      color: "#fff",
      userSelect: "none",
      gap: 36,
      overflow: "hidden",
    }}>

      {/* Ambient background glow derrière les cartes */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse 60% 50% at 50% 60%, ${activeStyle.glowColor}18 0%, transparent 70%)`,
        transition: "background 0.6s ease",
        pointerEvents: "none",
      }} />

      {/* Titre */}
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 8,
          color: "#666",
          marginBottom: 6,
          textTransform: "uppercase",
        }}>
          Select Your Map
        </div>
        <div style={{
          width: 40,
          height: 1,
          background: "#333",
          margin: "0 auto",
        }} />
      </div>

      {/* Cartes */}
      <div style={{
        display: "flex",
        gap: 32,
        alignItems: "center",
        position: "relative",
        zIndex: 1,
      }}>
        {maps.map((m, i) => {
          const selected = i === cursor;
          const s = MAP_STYLES[m.id] ?? FALLBACK_STYLE;

          return (
            <button
              key={m.id}
              onClick={() => { setCursor(i); confirm(i); }}
              style={{
                position: "relative",
                overflow: "hidden",
                background: "#0a0a0a",
                border: `1px solid ${selected ? s.glowColor : "#222"}`,
                borderRadius: 12,
                cursor: "pointer",
                width: 260,
                height: 420,
                padding: 0,
                transition: "all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                transform: selected ? "scale(1.05) translateY(-8px)" : "scale(0.9) translateY(8px)",
                boxShadow: selected
                  ? `0 0 0 1px ${s.glowColor}66, 0 20px 60px ${s.glowColor}33, 0 0 120px ${s.glowColor}11`
                  : "0 4px 20px #00000088",
                opacity: selected ? 1 : 0.55,
                flexShrink: 0,
              }}
            >
              {/* Vidéo */}
              {m.previewVideo && (
                <video
                  ref={(el) => { videoRefs.current[i] = el; }}
                  src={m.previewVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}

              {/* Overlay gradient */}
              <div style={{
                position: "absolute",
                inset: 0,
                background: s.overlayGradient,
              }} />

              {/* Accent haut */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                height: 80,
                background: s.topAccent,
              }} />

              {/* Contenu bas */}
              <div style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "24px 20px 22px",
              }}>
                {/* Ligne décorative */}
                <div style={{
                  width: "100%",
                  height: 1,
                  background: `linear-gradient(to right, transparent, ${s.glowColor}88, transparent)`,
                  marginBottom: 14,
                  opacity: selected ? 1 : 0.3,
                  transition: "opacity 0.3s",
                }} />

                {/* Titre map */}
                <div style={{
                  fontFamily: s.titleFont,
                  fontSize: 20,
                  fontWeight: 900,
                  color: s.titleColor,
                  textShadow: selected ? s.titleShadow : "none",
                  letterSpacing: s.titleLetterSpacing,
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                  marginBottom: 8,
                  transition: "text-shadow 0.3s",
                }}>
                  {m.name}
                </div>

                {/* Tagline */}
                <div style={{
                  fontSize: 9,
                  letterSpacing: 4,
                  color: s.taglineColor,
                  textTransform: "uppercase",
                  opacity: selected ? 1 : 0.5,
                  transition: "opacity 0.3s",
                }}>
                  {m.tagline}
                </div>

                {/* Prompt PRESS ENTER */}
                {selected && (
                  <div style={{
                    marginTop: 16,
                    fontSize: 9,
                    letterSpacing: 3,
                    color: `${s.glowColor}cc`,
                    textTransform: "uppercase",
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}>
                    Press Enter to Play
                  </div>
                )}
              </div>

              {/* Coin déco haut-gauche */}
              <div style={{
                position: "absolute",
                top: 14, left: 14,
                width: 16, height: 16,
                borderTop: `1px solid ${s.glowColor}${selected ? "99" : "33"}`,
                borderLeft: `1px solid ${s.glowColor}${selected ? "99" : "33"}`,
                transition: "border-color 0.3s",
              }} />
              {/* Coin déco bas-droit */}
              <div style={{
                position: "absolute",
                bottom: 14, right: 14,
                width: 16, height: 16,
                borderBottom: `1px solid ${s.glowColor}${selected ? "99" : "33"}`,
                borderRight: `1px solid ${s.glowColor}${selected ? "99" : "33"}`,
                transition: "border-color 0.3s",
              }} />
            </button>
          );
        })}
      </div>

      {/* Indicateur pagination */}
      <div style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        position: "relative",
        zIndex: 1,
      }}>
        {maps.map((_, i) => (
          <div
            key={i}
            onClick={() => setCursor(i)}
            style={{
              width: i === cursor ? 28 : 6,
              height: 6,
              borderRadius: 3,
              background: i === cursor ? activeStyle.glowColor : "#333",
              transition: "all 0.3s ease",
              cursor: "pointer",
              boxShadow: i === cursor ? `0 0 8px ${activeStyle.glowColor}88` : "none",
            }}
          />
        ))}
      </div>

      {/* Navigation hint bas */}
      <div style={{
        position: "absolute",
        bottom: 28,
        fontSize: 9,
        letterSpacing: 4,
        color: "#333",
        textTransform: "uppercase",
      }}>
        ← → to browse
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
