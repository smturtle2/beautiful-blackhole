import type { BlackHoleSettings, Preset } from "./types";
import { DEFAULT_RAYMARCH_STEPS } from "./raymarch";

export const PRESETS: Preset[] = [
  {
    id: "gargantua",
    label: "Gargantua",
    tone: "warm",
    settings: {
      exposure: 0.92,
      lensing: 0.96,
      spin: 0.72,
      diskLuminosity: 0.86,
      inclination: 0.54,
      starDensity: 0.86,
      motion: 0.32,
      glare: 0.82,
      autoOrbit: true,
      autoOrbitYawSpeed: 0.36,
      autoOrbitPitchSpeed: 0.16
    }
  },
  {
    id: "whiteFurnace",
    label: "White Furnace",
    tone: "white",
    settings: {
      exposure: 1,
      lensing: 0.98,
      spin: 0.55,
      diskLuminosity: 1,
      inclination: 0.42,
      starDensity: 0.62,
      motion: 0.48,
      glare: 1,
      autoOrbit: true,
      autoOrbitYawSpeed: 0.28,
      autoOrbitPitchSpeed: 0.12
    }
  },
  {
    id: "emberCrown",
    label: "Ember Crown",
    tone: "red",
    settings: {
      exposure: 0.96,
      lensing: 0.86,
      spin: 0.82,
      diskLuminosity: 0.9,
      inclination: 0.5,
      starDensity: 0.72,
      motion: 0.64,
      glare: 0.75,
      autoOrbit: true,
      autoOrbitYawSpeed: 0.48,
      autoOrbitPitchSpeed: 0.2
    }
  },
  {
    id: "deepField",
    label: "Deep Field",
    tone: "quiet",
    settings: {
      exposure: 0.68,
      lensing: 0.82,
      spin: 0.38,
      diskLuminosity: 0.45,
      inclination: 0.6,
      starDensity: 1,
      motion: 0.2,
      glare: 0.42,
      autoOrbit: true,
      autoOrbitYawSpeed: 0.2,
      autoOrbitPitchSpeed: 0.08
    }
  },
  {
    id: "eclipse",
    label: "Eclipse",
    tone: "warm",
    settings: {
      exposure: 0.76,
      lensing: 1,
      spin: 0.64,
      diskLuminosity: 0.62,
      inclination: 0.28,
      starDensity: 0.78,
      motion: 0.24,
      glare: 0.65,
      autoOrbit: true,
      autoOrbitYawSpeed: 0.18,
      autoOrbitPitchSpeed: 0.1
    }
  }
];

export const DEFAULT_SETTINGS: BlackHoleSettings = {
  ...PRESETS[0].settings,
  raymarchSteps: DEFAULT_RAYMARCH_STEPS,
  paused: false,
  preset: PRESETS[0].id
};
