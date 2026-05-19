const COLLIDER_LEGEND = [
  { color: "#00ff44", label: "Sol — Trimesh" },
  { color: "#888888", label: "Caisse ext — aucun collider" },
  { color: "#ff8800", label: "Guides courbes — ConvexPoly" },
  { color: "#ff0022", label: "Bumpers — Cylinder" },
  { color: "#cc2200", label: "Slingshots — ConvexPoly" },
  { color: "#cc00ff", label: "Drop targets — Box" },
  { color: "#ffff00", label: "Séparateurs — Cylinder" },
  { color: "#0088ff", label: "Sensors — pas de collision" },
  { color: "#444444", label: "Décoratif — aucun collider" },
];

interface DebugPanelProps {
  debugPos: { x: number; y: number; z: number };
  onDebugPosChange: (pos: { x: number; y: number; z: number }) => void;
  debugRadius: number;
  onDebugRadiusChange: (r: number) => void;
  debugColliders: boolean;
  onLogSpawn: () => void;
}

export default function DebugPanel({
  debugPos,
  onDebugPosChange,
  debugRadius,
  onDebugRadiusChange,
  debugColliders,
  onLogSpawn,
}: DebugPanelProps) {
  return (
    <>
      {debugColliders && (
        <div className="absolute top-4 right-4 z-20 bg-black/90 rounded-lg p-3 font-mono text-xs space-y-1">
          <div className="text-white font-bold mb-2">Mode Debug Colliders [H]</div>
          {COLLIDER_LEGEND.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-zinc-300">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-black/80 px-5 py-4 font-mono text-xs text-zinc-200 backdrop-blur space-y-3 min-w-72">
        <div className="flex items-center justify-between mb-1">
          <span className="text-orange-400 font-bold uppercase tracking-wider">Debug Spawn</span>
          <button
            className="rounded bg-orange-600 px-2 py-0.5 text-white hover:bg-orange-500"
            onClick={onLogSpawn}
          >
            log
          </button>
        </div>
        {(["x", "y", "z"] as const).map((axis) => {
          const ranges = { x: [-0.35, 0.35], y: [0.95, 1.10], z: [-0.6, 0.7] };
          const [min, max] = ranges[axis];
          return (
            <label key={axis} className="flex items-center gap-3">
              <span className="w-4 text-orange-300 uppercase">{axis}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={0.0005}
                value={debugPos[axis]}
                className="flex-1 accent-orange-500"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onDebugPosChange({ ...debugPos, [axis]: val });
                }}
              />
              <span className="w-16 text-right tabular-nums">{debugPos[axis].toFixed(4)}</span>
            </label>
          );
        })}
        <div className="border-t border-zinc-700 pt-3 mt-2">
          <span className="text-cyan-400 font-bold uppercase tracking-wider text-[10px]">Ball Radius</span>
          <label className="flex items-center gap-3 mt-1">
            <span className="w-4 text-cyan-300 uppercase">R</span>
            <input
              type="range"
              min={0.005}
              max={0.05}
              step={0.001}
              value={debugRadius}
              className="flex-1 accent-cyan-500"
              onChange={(e) => {
                onDebugRadiusChange(parseFloat(e.target.value));
              }}
            />
            <span className="w-16 text-right tabular-nums">{debugRadius.toFixed(3)}</span>
          </label>
        </div>
      </div>
    </>
  );
}
