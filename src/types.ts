export type RendererBackend = "three" | "poster";

export type PresetId =
  | "gargantua"
  | "whiteFurnace"
  | "emberCrown"
  | "deepField"
  | "eclipse";

export type BlackHoleSettings = {
  exposure: number;
  lensing: number;
  spin: number;
  diskLuminosity: number;
  inclination: number;
  starDensity: number;
  motion: number;
  glare: number;
  autoOrbit: boolean;
  autoOrbitYawSpeed: number;
  autoOrbitPitchSpeed: number;
  raymarchSteps: number;
  paused: boolean;
  preset: PresetId;
};

export type Preset = {
  id: PresetId;
  label: string;
  tone: "warm" | "white" | "red" | "quiet";
  settings: Pick<
    BlackHoleSettings,
    | "exposure"
    | "lensing"
    | "spin"
    | "diskLuminosity"
    | "inclination"
    | "starDensity"
    | "motion"
    | "glare"
    | "autoOrbit"
    | "autoOrbitYawSpeed"
    | "autoOrbitPitchSpeed"
  >;
};
