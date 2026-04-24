export const MIN_RAYMARCH_STEPS = 16;
export const MAX_RAYMARCH_STEPS = 256;
export const DEFAULT_RAYMARCH_STEPS = 256;
export const RENDER_SCALE = 0.76;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampRaymarchSteps(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_RAYMARCH_STEPS;
  }
  return clamp(Math.round(value), MIN_RAYMARCH_STEPS, MAX_RAYMARCH_STEPS);
}

export function getRaymarchDetail(value: number) {
  const steps = clampRaymarchSteps(value);
  return clamp(
    (steps - MIN_RAYMARCH_STEPS) /
      (MAX_RAYMARCH_STEPS - MIN_RAYMARCH_STEPS),
    0,
    1
  );
}
