import {
  Camera,
  Expand,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { DEFAULT_SETTINGS, PRESETS } from "./presets";
import {
  MAX_RAYMARCH_STEPS,
  MIN_RAYMARCH_STEPS,
  clampRaymarchSteps
} from "./raymarch";
import type {
  BlackHoleSettings,
  PresetId,
  RendererBackend
} from "./types";
import { ThreeBlackHoleRenderer } from "./three/ThreeBlackHoleRenderer";

function supportsWebGL() {
  if (typeof document === "undefined") {
    return false;
  }

  const canvas = document.createElement("canvas");
  return Boolean(
    canvas.getContext("webgl2") ?? canvas.getContext("webgl")
  );
}

function formatValue(value: number, max = 1) {
  return max === 1 ? value.toFixed(2) : (value * max).toFixed(1);
}

function App() {
  const reducedMotion = useReducedMotion();
  const [settings, setSettings] =
    useState<BlackHoleSettings>(DEFAULT_SETTINGS);
  const [webglSupported] = useState(supportsWebGL);
  const [backend, setBackend] = useState<RendererBackend>(() =>
    supportsWebGL() ? "three" : "poster"
  );
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ThreeBlackHoleRenderer | null>(null);
  const settingsRef = useRef(settings);

  const selectedPreset = useMemo(
    () => PRESETS.find((preset) => preset.id === settings.preset) ?? PRESETS[0],
    [settings.preset]
  );

  const activeBackend: RendererBackend =
    webglSupported && !reducedMotion ? backend : "poster";
  const artworkActive = activeBackend === "three" && !rendererError;

  function retryRenderer() {
    setRendererError(null);
    setBackend(webglSupported && !reducedMotion ? "three" : "poster");
  }

  useEffect(() => {
    settingsRef.current = settings;
    rendererRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLButtonElement
      ) {
        return;
      }

      event.preventDefault();
      setSettings((current) => ({
        ...current,
        paused: !current.paused
      }));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeBackend !== "three" || !canvasRef.current) {
      rendererRef.current?.destroy();
      rendererRef.current = null;
      return;
    }

    let cancelled = false;

    try {
      const renderer = new ThreeBlackHoleRenderer(
        canvasRef.current,
        settingsRef.current
      );

      if (cancelled) {
        renderer.destroy();
        return;
      }

      rendererRef.current = renderer;
      renderer.startLoop();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start 3D renderer.";
      window.setTimeout(() => {
        if (!cancelled) {
          setRendererError(message);
          setBackend("poster");
        }
      }, 0);
    }

    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [activeBackend]);

  function updateSetting<K extends keyof BlackHoleSettings>(
    key: K,
    value: BlackHoleSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function applyPreset(id: PresetId) {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) {
      return;
    }

    setSettings((current) => ({
      ...current,
      ...preset.settings,
      preset: preset.id
    }));
    rendererRef.current?.resetView();
  }

  function resetView() {
    setSettings((current) => ({
      ...current,
      inclination: DEFAULT_SETTINGS.inclination
    }));
    rendererRef.current?.resetView();
  }

  async function captureCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = "beautiful-blackhole.png";
    link.click();
  }

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  return (
    <main className="app-shell">
      <section
        className="viewport"
        aria-label="Beautiful Blackhole viewport"
        onDoubleClick={resetView}
      >
        <canvas
          ref={canvasRef}
          className={`blackhole-canvas ${artworkActive ? "is-active" : ""}`}
          aria-label="Cinematic 3D black hole artwork"
        />
	        {!artworkActive && (
	          <div className="render-fallback" role="status">
	            <strong>3D renderer unavailable</strong>
	            <span>WebGL is required for the procedural black hole.</span>
	          </div>
	        )}
        <div className="space-grain" />

        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Beautiful Blackhole</h1>
              <p>3D cinematic black hole viewer</p>
            </div>
          </div>

          <div className="status-cluster" aria-label="Artwork actions">
            {artworkActive && !panelOpen && (
              <button
                className="icon-button"
                type="button"
                aria-label="Open controls"
                title="Controls"
                onClick={() => setPanelOpen(true)}
              >
                <SlidersHorizontal size={18} />
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="Enter fullscreen"
              title="Fullscreen"
              onClick={enterFullscreen}
            >
              <Expand size={18} />
            </button>
          </div>
        </header>

        {artworkActive && panelOpen && (
          <>
            <section
              id="control-panel"
              className="side-panel"
              aria-label="Artwork controls"
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <div className="panel-brand">
                <div>
                  <span>Beautiful</span>
                  <strong>Blackhole</strong>
                </div>
                <button
                  className="panel-close"
                  type="button"
                  aria-label="Close controls"
                  title="Close controls"
                  onClick={() => setPanelOpen(false)}
                >
                  <X size={17} />
                </button>
              </div>

              <div className="panel-section presets">
                <div className="section-label">
                  <Sparkles size={15} />
                  <span>Visual Mood</span>
                </div>
                <div className="preset-grid">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={
                        preset.id === settings.preset ? "is-selected" : ""
                      }
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel-section view-actions">
                <div className="section-label">
                  <span>Capture</span>
                </div>
                <div className="view-grid">
                  <button type="button" onClick={resetView}>
                    <RotateCcw size={16} />
                    Reset
                  </button>
                  <button type="button" onClick={captureCanvas}>
                    <Camera size={16} />
                    Shot
                  </button>
                </div>
              </div>

              <div className="panel-section render-quality">
                <div className="section-label">
                  <span>Raymarch Steps</span>
                </div>
                <StepInput
                  label="Steps"
                  value={settings.raymarchSteps}
                  onChange={(value) => updateSetting("raymarchSteps", value)}
                />
              </div>

              <div className="panel-section transport">
                <button
                  className="orb-button"
                  type="button"
                  aria-label={settings.paused ? "Play" : "Pause"}
                  onClick={() => updateSetting("paused", !settings.paused)}
                >
                  {settings.paused ? <Play size={34} /> : <Pause size={34} />}
                </button>
                <span>{settings.paused ? "Play" : "Pause"}</span>
                <kbd>Space</kbd>
              </div>

              <div className="panel-section auto-orbit">
                <Toggle
                  label="Auto Orbit"
                  checked={settings.autoOrbit}
                  onChange={(checked) => updateSetting("autoOrbit", checked)}
                />
                <Slider
                  label="Yaw Speed"
                  value={settings.autoOrbitYawSpeed}
                  onChange={(value) =>
                    updateSetting("autoOrbitYawSpeed", value)
                  }
                  display={formatValue(settings.autoOrbitYawSpeed, 2)}
                />
                <Slider
                  label="Pitch Speed"
                  value={settings.autoOrbitPitchSpeed}
                  onChange={(value) =>
                    updateSetting("autoOrbitPitchSpeed", value)
                  }
                  display={formatValue(settings.autoOrbitPitchSpeed, 2)}
                />
              </div>

              <div className="panel-section slider-bank">
                <Slider
                  label="Lensing"
                  value={settings.lensing}
                  onChange={(value) => updateSetting("lensing", value)}
                />
                <Slider
                  label="Spin"
                  value={settings.spin}
                  onChange={(value) => updateSetting("spin", value)}
                />
                <Slider
                  label="Disk Light"
                  value={settings.diskLuminosity}
                  onChange={(value) => updateSetting("diskLuminosity", value)}
                />
                <Slider
                  label="Inclination"
                  value={settings.inclination}
                  onChange={(value) => updateSetting("inclination", value)}
                />
                <Slider
                  label="Exposure"
                  value={settings.exposure}
                  onChange={(value) => updateSetting("exposure", value)}
                />
                <Slider
                  label="Star Field"
                  value={settings.starDensity}
                  onChange={(value) => updateSetting("starDensity", value)}
                />
                <Slider
                  label="Glare"
                  value={settings.glare}
                  onChange={(value) => updateSetting("glare", value)}
                />
                <Slider
                  label="Motion"
                  value={settings.motion}
                  onChange={(value) => updateSetting("motion", value)}
                  display={formatValue(settings.motion, 2)}
                />
              </div>

              <div className="panel-section actions">
                <button
                  className="tool-button"
                  type="button"
                  onClick={() => {
                    setSettings({ ...DEFAULT_SETTINGS });
                    rendererRef.current?.resetView();
                  }}
                >
                  <RotateCcw size={15} />
                  <span>Reset Look</span>
                </button>
              </div>
            </section>
          </>
        )}

        {artworkActive && (
          <footer className="hintbar">
            <span>Drag to orbit</span>
            <span>Scroll to zoom</span>
            <span>{selectedPreset.label}</span>
          </footer>
        )}

        {(rendererError || !webglSupported || reducedMotion) && (
          <aside className="fallback-note" aria-live="polite">
            <span>
              {rendererError ??
                (reducedMotion ? "Motion reduced" : "WebGL required")}
            </span>
            {rendererError && webglSupported && !reducedMotion && (
              <button type="button" onClick={retryRenderer}>
                Retry 3D
              </button>
            )}
          </aside>
        )}
      </section>
    </main>
  );
}

type SliderProps = {
  label: string;
  value: number;
  display?: string;
  onChange: (value: number) => void;
};

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type StepInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function StepInput({ label, value, onChange }: StepInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.currentTarget.value);
    if (Number.isFinite(nextValue)) {
      onChange(clampRaymarchSteps(nextValue));
    }
  }

  return (
    <label className="step-control">
      <span>{label}</span>
      <input
        type="number"
        min={MIN_RAYMARCH_STEPS}
        max={MAX_RAYMARCH_STEPS}
        step={1}
        value={value}
        onChange={handleChange}
        onBlur={() => onChange(clampRaymarchSteps(value))}
      />
      <small>
        {MIN_RAYMARCH_STEPS}-{MAX_RAYMARCH_STEPS}
      </small>
    </label>
  );
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

function Slider({ label, value, display, onChange }: SliderProps) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{display ?? formatValue(value)}</output>
    </label>
  );
}

export default App;
