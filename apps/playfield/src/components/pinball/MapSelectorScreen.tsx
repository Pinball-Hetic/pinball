"use client";
import { useEffect, useState, useCallback } from "react";
import type { MapMeta } from "@pinball/maps";

interface Props {
  maps: MapMeta[];
  onSelect: (id: string) => void;
}

/**
 * Écran de sélection de map — s'affiche avant le chargement du plateau.
 * Navigation : ←/→ (ou A/D), confirmation Enter/Espace/P (plunger).
 * S'adapte aux boutons physiques via les mêmes touches qu'en mode direct.
 */
export function MapSelectorScreen({ maps, onSelect }: Props) {
  const [cursor, setCursor] = useState(0);

  const confirm = useCallback(
    (idx: number) => onSelect(maps[idx].id),
    [maps, onSelect],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          setCursor((c) => (c - 1 + maps.length) % maps.length);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          setCursor((c) => (c + 1) % maps.length);
          break;
        case "Enter":
        case " ":
        case "p":
        case "P":
          setCursor((c) => { confirm(c); return c; });
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maps.length, confirm]);

  const active = maps[cursor];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Courier New', Courier, monospace",
        color: "#fff",
        userSelect: "none",
        gap: 40,
      }}
    >
      {/* Titre */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, letterSpacing: 6, color: "#888", marginBottom: 8 }}>
          SELECT YOUR MAP
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#444",
            letterSpacing: 2,
          }}
        >
          ← → to browse · ENTER to play
        </div>
      </div>

      {/* Cartes */}
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        {maps.map((m, i) => {
          const selected = i === cursor;
          return (
            <button
              key={m.id}
              onClick={() => { setCursor(i); confirm(i); }}
              style={{
                background: selected ? `${m.accentColor}18` : "#111",
                border: `2px solid ${selected ? m.accentColor : "#2a2a2a"}`,
                borderRadius: 12,
                padding: "28px 36px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                transition: "all 0.2s ease",
                transform: selected ? "scale(1.06)" : "scale(1)",
                boxShadow: selected ? `0 0 32px ${m.accentColor}44` : "none",
                minWidth: 180,
              }}
            >
              {/* Pastille couleur */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: m.accentColor,
                  boxShadow: selected ? `0 0 20px ${m.accentColor}88` : "none",
                  transition: "box-shadow 0.2s",
                }}
              />
              {/* Nom */}
              <div
                style={{
                  fontSize: 15,
                  fontWeight: "bold",
                  color: selected ? m.accentColor : "#aaa",
                  letterSpacing: 1,
                  transition: "color 0.2s",
                  textAlign: "center",
                }}
              >
                {m.name}
              </div>
              {/* Tagline */}
              <div
                style={{
                  fontSize: 10,
                  color: selected ? "#ccc" : "#555",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  transition: "color 0.2s",
                }}
              >
                {m.tagline}
              </div>
            </button>
          );
        })}
      </div>

      {/* Indicateur de selection */}
      <div style={{ display: "flex", gap: 8 }}>
        {maps.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === cursor ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === cursor ? active.accentColor : "#333",
              transition: "all 0.2s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
