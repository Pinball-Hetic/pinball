import type { PlayfieldCameraDebugTuning } from "@pinball/game-engine";

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

type CameraSliderSpec = {
  key: keyof PlayfieldCameraDebugTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  digits: number;
};

const CAMERA_SLIDERS: CameraSliderSpec[] = [
  { key: "dirY", label: "Dir Y", min: 0.92, max: 1, step: 0.005, digits: 3 },
  { key: "dirZ", label: "Dir Z", min: 0, max: 0.25, step: 0.005, digits: 3 },
  { key: "lookYBias", label: "Look Y", min: 0, max: 1, step: 0.01, digits: 2 },
  { key: "lookZBias", label: "Look Z", min: 0, max: 1, step: 0.01, digits: 2 },
  { key: "portraitNdcX", label: "NDC X", min: 0.85, max: 1.05, step: 0.005, digits: 3 },
  { key: "portraitNdcY", label: "NDC Y", min: 0.85, max: 1.05, step: 0.005, digits: 3 },
  { key: "distanceScale", label: "Dist", min: 0.7, max: 1.5, step: 0.01, digits: 2 },
];

interface DebugPanelProps {
  debugPos?: { x: number; y: number; z: number };
  onDebugPosChange?: (pos: { x: number; y: number; z: number }) => void;
  debugRadius?: number;
  onDebugRadiusChange?: (r: number) => void;
  debugColliders?: boolean;
  onLogSpawn?: () => void;
  cameraTuning?: PlayfieldCameraDebugTuning;
  onCameraTuningChange?: (tuning: PlayfieldCameraDebugTuning) => void;
}

export default function DebugPanel({
  debugPos,
  onDebugPosChange,
  debugRadius,
  onDebugRadiusChange,
  debugColliders,
  onLogSpawn,
  cameraTuning,
  onCameraTuningChange,
}: DebugPanelProps) {
  const showSpawn = debugPos && onDebugPosChange && debugRadius != null && onDebugRadiusChange;
  const showCamera = cameraTuning && onCameraTuningChange;

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

      {showCamera && (
        <div className="absolute top-4 left-4 z-20 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg bg-black/90 p-3 font-mono text-xs text-zinc-200 backdrop-blur min-w-72 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-violet-400">Camera [J]</span>
            <button
              type="button"
              className="rounded bg-violet-600 px-2 py-0.5 text-white hover:bg-violet-500"
              onClick={() => console.log("[camera-tuning]", cameraTuning)}
            >
              log
            </button>
          </div>
          {CAMERA_SLIDERS.map(({ key, label, min, max, step, digits }) => (
            <label key={key} className="flex items-center gap-2">
              <span className="w-12 text-violet-300">{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={cameraTuning[key]}
                className="flex-1 accent-violet-500"
                onChange={(e) => {
                  onCameraTuningChange({
                    ...cameraTuning,
                    [key]: parseFloat(e.target.value),
                  });
                }}
              />
              <span className="w-12 text-right tabular-nums">{cameraTuning[key].toFixed(digits)}</span>
            </label>
          ))}
        </div>
      )}

      {showSpawn && (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-black/80 px-5 py-4 font-mono text-xs text-zinc-200 backdrop-blur space-y-3 min-w-72">
          <div className="flex items-center justify-between mb-1">
            <span className="text-orange-400 font-bold uppercase tracking-wider">Debug Spawn</span>
            <button
              type="button"
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
                    onDebugPosChange({ ...debugPos, [axis]: parseFloat(e.target.value) });
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
      )}
    </>
  );
}
