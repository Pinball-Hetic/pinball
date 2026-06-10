import {
  RESET_LABELS,
  LOST_LABELS,
  type BallDiagnosticsSnapshot,
  type BallZone,
} from "@pinball/game-engine";

interface BallDebugOverlayProps {
  snapshot: BallDiagnosticsSnapshot | null;
  visible: boolean;
}

const ZONE_LABELS: Record<BallZone, string> = {
  lane: "Couloir plongeur",
  playfield: "Terrain",
  drain_zone: "Zone de drain",
  out_of_bounds: "HORS TERRAIN",
};

const ZONE_COLORS: Record<BallZone, string> = {
  lane: "#38bdf8",
  playfield: "#4ade80",
  drain_zone: "#fbbf24",
  out_of_bounds: "#f87171",
};

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-400">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export default function BallDebugOverlay({ snapshot, visible }: BallDebugOverlayProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-30 w-72 space-y-1 rounded-lg bg-black/85 p-3 font-mono text-[11px] text-zinc-200 backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wider text-emerald-400">
          Debug balle
        </span>
        <span className="text-[9px] text-zinc-500">[J]</span>
      </div>

      <div className="mb-1 text-[9px] leading-tight text-amber-400/70">
        M : déplacer la bille à la souris (drag)
      </div>

      {!snapshot ? (
        <div className="text-zinc-500">En attente de la physique…</div>
      ) : (
        <>
          <Row label="État jeu">{snapshot.gameState}</Row>
          <Row label="Zone">
            <span style={{ color: ZONE_COLORS[snapshot.zone] }}>
              {ZONE_LABELS[snapshot.zone]}
            </span>
          </Row>
          <div className="my-1 border-t border-zinc-700" />
          <Row label="Pos X">{fmt(snapshot.pos.x)}</Row>
          <Row label="Pos Y">{fmt(snapshot.pos.y)}</Row>
          <Row label="Pos Z">{fmt(snapshot.pos.z)}</Row>
          <Row label="Vitesse">{fmt(snapshot.speed)} m/s</Row>
          <Row label="Vel X/Y/Z">
            {fmt(snapshot.vel.x, 2)} / {fmt(snapshot.vel.y, 2)} / {fmt(snapshot.vel.z, 2)}
          </Row>
          <div className="my-1 border-t border-zinc-700" />
          <Row label="Vitesse de pointe">
            <span style={{ color: "#34d399" }}>{fmt(snapshot.peakSpeed)} m/s</span>
          </Row>
          <Row label="Apogée Z (plus haut)">
            <span style={{ color: "#a78bfa" }}>{fmt(snapshot.apexZ)}</span>
          </Row>
          <Row label="X à l'apogée">{fmt(snapshot.apexX)}</Row>
          <div className="text-[9px] leading-tight text-zinc-500">
            Guide de sortie : Z ≈ -0.40 à -0.49
          </div>
          <div className="my-1 border-t border-zinc-700" />
          <Row label="Dernier évènement">{snapshot.lastEvent ?? "—"}</Row>
          <Row label="Dernier reset">
            {snapshot.lastReset ? RESET_LABELS[snapshot.lastReset] : "—"}
          </Row>
          <div className="my-1 border-t border-zinc-700" />
          <Row label="Pertes">{snapshot.lostCount}</Row>
          <div className="flex flex-col gap-0.5">
            <span className="text-zinc-400">Dernière perte</span>
            <span
              className="text-right"
              style={{ color: snapshot.lastLost ? "#f87171" : undefined }}
            >
              {snapshot.lastLost ? LOST_LABELS[snapshot.lastLost] : "—"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
