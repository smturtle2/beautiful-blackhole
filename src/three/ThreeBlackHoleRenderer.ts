import * as THREE from "three";
import {
  RENDER_SCALE,
  clampRaymarchSteps,
  getRaymarchDetail
} from "../raymarch";
import type { BlackHoleSettings } from "../types";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

	  uniform vec2 uResolution;
	  uniform float uTime;
	  uniform float uExposure;
	  uniform float uLensing;
	  uniform float uSpin;
	  uniform float uDiskLuminosity;
	  uniform float uInclination;
	  uniform float uStarDensity;
	  uniform float uMotion;
	  uniform float uGlare;
	  uniform int uRaymarchSteps;
	  uniform float uRenderDetail;
	  uniform vec3 uCameraRight;
	  uniform vec3 uCameraUp;
	  uniform vec3 uCameraForward;
	  uniform float uCameraDistance;
	  varying vec2 vUv;

  const float PI = 3.14159265359;
  const float TAU = 6.28318530718;
  const int MAX_RAYMARCH_STEPS = 256;

  float hash31(vec3 p) {
    p = fract(p * vec3(127.1, 311.7, 74.7));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }

	  float fbm3(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 2; i++) {
      value += noise3(p) * amp;
      p = p * 2.07 + vec3(13.1, 7.7, 19.4);
      amp *= 0.52;
    }
    return value;
  }

  vec3 aces(vec3 color) {
    color *= 0.72;
    return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
  }

	  mat3 rotateX(float angle) {
	    float s = sin(angle);
	    float c = cos(angle);
	    return mat3(
	      1.0, 0.0, 0.0,
	      0.0, c, -s,
	      0.0, s, c
	    );
	  }

	  vec3 starField(vec3 dir, float density, float lensAmount) {
    vec3 ad = abs(dir);
    vec2 uv;
    if (ad.x > ad.y && ad.x > ad.z) {
      uv = dir.yz / max(ad.x, 0.001);
    } else if (ad.y > ad.z) {
      uv = dir.xz / max(ad.y, 0.001);
    } else {
      uv = dir.xy / max(ad.z, 0.001);
    }
    uv += dir.xy * 0.15;
    float stars = 0.0;
	    for (int layer = 0; layer < 3; layer++) {
	      float scale = layer == 0 ? 95.0 : (layer == 1 ? 175.0 : 330.0);
	      float threshold = layer == 0 ? 0.984 : (layer == 1 ? 0.991 : 0.996);
	      vec2 cell = floor(uv * scale);
	      vec2 local = fract(uv * scale) - 0.5;
	      float rnd = hash21(cell + float(layer) * 17.0);
	      float gate = smoothstep(threshold, 1.0, rnd) * density;
	      float size = mix(0.018, 0.06, hash21(cell + 9.3));
	      stars += gate * exp(-dot(local, local) / size);
	    }
	    vec3 tint = mix(vec3(0.58, 0.68, 1.0), vec3(1.0, 0.74, 0.38), noise3(dir * 18.0));
	    vec3 milky = vec3(0.7, 0.76, 1.0) * pow(fbm3(dir * 5.0 + vec3(2.0, 0.0, 7.0)), 3.2) * density * 0.18;
	    return tint * stars * (1.4 + lensAmount * 1.1) + milky;
	  }

	  vec3 thermalColor(float temperature) {
	    vec3 color = mix(vec3(0.35, 0.055, 0.012), vec3(1.0, 0.42, 0.11), smoothstep(0.08, 0.34, temperature));
	    color = mix(color, vec3(1.0, 0.78, 0.38), smoothstep(0.28, 0.58, temperature));
	    return mix(color, vec3(1.0, 0.98, 0.84), smoothstep(0.52, 0.92, temperature));
	  }

	  vec3 accretionDiskSurfaceEmission(vec3 diskHit, vec3 diskDir, float time, float bendAmount, float worldR, out float opacity) {
	    float cylindricalR = length(diskHit.xz);
	    float isco = mix(2.9, 1.58, uSpin);
	    float outer = 6.8;
	    float radialWindow = smoothstep(isco, isco + 0.24, cylindricalR) * (1.0 - smoothstep(outer * 0.78, outer, cylindricalR));
	    float diskAge = smoothstep(isco, outer, cylindricalR);
	    float angle = atan(diskHit.z, diskHit.x);
	    float orbitRate = (0.74 + uMotion * 1.08) / max(pow(cylindricalR, 1.52), 1.0);
	    float shear = angle + pow(cylindricalR, 0.72) * (1.54 + uSpin * 0.78) - time * orbitRate;
	    vec3 flowPoint = vec3(
	      cos(shear) * cylindricalR * 0.72,
	      diskAge * 3.8,
	      sin(shear) * cylindricalR * 0.72
	    );
	    float filaments = fbm3(flowPoint * vec3(1.35, 0.85, 1.35) + vec3(time * 0.14, 4.0, -time * 0.12));
	    float grain = 0.5 + 0.5 * sin(dot(flowPoint, vec3(2.3, 1.1, 1.7)) - time * 0.18);
	    if (uRenderDetail > 0.35) {
	      grain = noise3(flowPoint * vec3(2.1, 1.0, 2.1) + vec3(-time * 0.08, 8.0, time * 0.06));
	    }
	    float streaks = mix(0.78, 1.26, smoothstep(0.18, 0.94, filaments * 0.75 + grain * 0.45));

	    vec3 tangent = normalize(vec3(-diskHit.z, 0.0, diskHit.x));
	    float orbitalVelocity = clamp(sqrt(1.0 / max(cylindricalR, 1.0)) * mix(1.0, 1.48, uSpin), 0.08, 0.82);
	    float dopplerRaw = pow(clamp(1.0 + dot(tangent, -diskDir) * orbitalVelocity * 0.72, 0.34, 1.62), 1.68);
	    float doppler = mix(0.78, dopplerRaw, 0.48);

	    float zeroTorque = smoothstep(isco, isco * 1.38, cylindricalR);
	    float gravityShift = sqrt(clamp(1.0 - 1.0 / max(cylindricalR, 1.06), 0.05, 1.0));
	    float temperature = pow(isco / max(cylindricalR, isco), 0.72) * zeroTorque * gravityShift;
	    float lensWrap = smoothstep(0.36, 1.42, bendAmount);
	    float photonBoost = exp(-abs(worldR - 1.52) / 0.44);
	    float silhouetteEscape = smoothstep(1.04, 1.42, worldR);
	    float density = radialWindow * streaks * mix(0.92, 1.16, filaments) * silhouetteEscape;
	    float strength = density * pow(temperature, 2.58) * doppler * uDiskLuminosity;
	    strength *= 1.0 + uLensing * (1.12 * lensWrap + 1.85 * photonBoost);
	    opacity = clamp(density * (0.095 + lensWrap * 0.075), 0.0, 0.28);
	    vec3 heat = thermalColor(temperature);
	    vec3 causticWhite = mix(heat, vec3(1.0, 0.96, 0.78), smoothstep(0.36, 1.0, photonBoost + lensWrap * 0.35));
	    return causticWhite * strength * (1.35 + uExposure * 3.35);
	  }

	  vec3 accretionFlowEmission(vec3 diskPos, vec3 diskDir, float time, out float opacity) {
	    float cylindricalR = length(diskPos.xz);
	    float isco = mix(2.92, 1.64, uSpin);
	    float outer = 6.35;
	    float radialWindow = smoothstep(isco, isco + 0.28, cylindricalR) * (1.0 - smoothstep(outer * 0.76, outer, cylindricalR));
	    float diskAge = smoothstep(isco, outer, cylindricalR);
	    float scaleHeight = mix(0.16, 0.54, diskAge) * mix(0.95, 1.24, uDiskLuminosity);
	    float coreDensity = exp(-pow(abs(diskPos.y) / max(scaleHeight, 0.03), 1.35));
	    float atmosphere = exp(-pow(abs(diskPos.y) / max(scaleHeight * 2.2, 0.04), 1.7)) * 0.18;
	    float verticalDensity = coreDensity + atmosphere;

	    float angle = atan(diskPos.z, diskPos.x);
	    float orbitRate = (0.62 + uMotion * 0.85) / max(pow(cylindricalR, 1.42), 1.0);
	    float shear = angle + pow(cylindricalR, 0.72) * (1.38 + uSpin * 0.68) - time * orbitRate;
	    vec3 flowPoint = vec3(
	      cos(shear) * cylindricalR * 0.62,
	      diskPos.y * 1.8,
	      sin(shear) * cylindricalR * 0.62
	    );
	    float filaments = 0.5 + 0.5 * sin(dot(flowPoint, vec3(1.7, 2.9, 1.3)) + time * 0.24);
	    float streaks = mix(0.9, 1.08, 0.5 + 0.5 * sin(shear * 6.0 + filaments * 4.2));

	    vec3 tangent = normalize(vec3(-diskPos.z, 0.0, diskPos.x));
	    float orbitalVelocity = clamp(sqrt(1.0 / max(cylindricalR, 1.0)) * mix(1.0, 1.46, uSpin), 0.08, 0.78);
	    float dopplerRaw = pow(clamp(1.0 + dot(tangent, -diskDir) * orbitalVelocity * 0.78, 0.28, 1.68), 1.84);
	    float doppler = mix(0.78, dopplerRaw, 0.42);

	    float zeroTorque = smoothstep(isco, isco * 1.42, cylindricalR);
	    float gravityShift = sqrt(clamp(1.0 - 1.0 / max(cylindricalR, 1.06), 0.04, 1.0));
	    float temperature = pow(isco / max(cylindricalR, isco), 0.74) * zeroTorque * gravityShift;
	    float density = radialWindow * verticalDensity * mix(0.76, 1.2, filaments) * streaks;
	    float strength = density * pow(temperature, 2.35) * doppler * uDiskLuminosity * 0.78;
	    opacity = clamp(density * 0.032, 0.0, 0.082);
	    return thermalColor(temperature) * strength * (1.0 + uExposure * 2.65);
	  }

	  vec3 photonShellEmission(vec3 worldPos, vec3 diskPos, vec3 rayDir, float time, float bendAmount, out float opacity) {
	    float r = length(worldPos);
	    vec3 normal = worldPos / max(r, 0.001);
	    float photonSphere = 1.52;
	    float shell = exp(-abs(r - photonSphere) / 0.22);
	    float grazing = pow(clamp(1.0 - abs(dot(normal, rayDir)), 0.0, 1.0), 1.72);
	    float equatorialMemory = exp(-pow(abs(diskPos.y) / 0.5, 1.55));
	    float turbulent = 0.94 + 0.12 * sin(dot(normal, vec3(9.7, 4.1, 6.3)) + time * 0.12);
	    float escapeGlow = smoothstep(0.34, 1.7, bendAmount);
	    float density = shell * grazing * equatorialMemory * turbulent * escapeGlow * 2.05;
	    opacity = clamp(density * 0.038, 0.0, 0.085);
	    vec3 shellColor = mix(vec3(1.0, 0.56, 0.2), vec3(1.0, 0.97, 0.72), grazing);
	    return shellColor * density * uGlare * (0.42 + uExposure * 1.55);
	  }

	  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    p.x *= aspect;

	    mat3 basis = mat3(
	      normalize(uCameraRight),
	      normalize(uCameraUp),
	      normalize(uCameraForward)
	    );
	    float camDist = mix(16.0, 8.8, uCameraDistance);
	    vec3 rayOrigin = normalize(uCameraForward) * -camDist;
	    vec3 rayDir = normalize(basis * vec3(p * 0.82, 1.52));

	    float eventHorizon = 1.0;
	    float photonSphere = 1.52;
	    float mass = mix(0.95, 1.95, uLensing);
	    float time = uTime * mix(0.2, 1.35, uMotion);

	    vec3 pos = rayOrigin;
	    vec3 dir = rayDir;
	    vec3 color = vec3(0.0);
	    float transmittance = 1.0;
	    float minR = 1000.0;
	    float impact = length(cross(rayDir, rayOrigin));
	    float bendAccum = 0.0;
	    bool captured = false;
	    mat3 diskBasis = rotateX(mix(0.08, 0.62, uInclination));

	    float marchJitter = (hash21(vUv * uResolution + floor(time * 12.0)) - 0.5) * 0.035;
	    pos += dir * marchJitter;

	    for (int i = 0; i < MAX_RAYMARCH_STEPS; i++) {
	      if (i >= uRaymarchSteps) {
	        break;
	      }
	      float r = length(pos);
	      minR = min(minR, r);
	      if (r < eventHorizon) {
	        captured = true;
	        break;
      }
	      if (r > 28.0 && dot(pos, dir) > 0.0) {
        break;
      }

	      vec3 currentDiskPoint = diskBasis * pos;
	      float currentDiskR = length(currentDiskPoint.xz);
	      float photonDetail = exp(-abs(r - photonSphere) / 1.15);
	      float diskDetail = smoothstep(1.0, 0.0, abs(currentDiskPoint.y)) * smoothstep(7.7, 1.35, currentDiskR);
	      float detailZone = clamp(max(photonDetail, diskDetail), 0.0, 1.0);
	      float emptySpaceScale = mix(1.5, 1.02, uRenderDetail);
	      float stepSize = clamp(r * mix(0.046, 0.074, smoothstep(4.0, 16.0, r)), 0.038, 0.52);
	      stepSize *= mix(emptySpaceScale, 0.9, detailZone);
	      vec3 gravityDir = -pos / max(r, 0.001);
	      float bend = mass / max(r * r, eventHorizon * eventHorizon * 0.35);
	      dir = normalize(dir + gravityDir * bend * stepSize * 1.18);
	      vec3 nextPos = pos + dir * stepSize;
	      bendAccum += bend * stepSize;

	      vec3 rayPoint = mix(pos, nextPos, 0.55);
	      float pointR = length(rayPoint);
	      vec3 diskPoint = diskBasis * rayPoint;
	      vec3 diskPrev = diskBasis * pos;
	      vec3 diskNext = diskBasis * nextPos;
	      vec3 diskDir = normalize(diskBasis * dir);
	      if (pointR > eventHorizon * 1.035 && pointR < 8.6 && transmittance > 0.015) {
	        float diskDelta = diskPrev.y - diskNext.y;
	        if (abs(diskDelta) > 0.0001 && diskPrev.y * diskNext.y <= 0.0) {
	          float diskT = clamp(diskPrev.y / diskDelta, 0.0, 1.0);
	          vec3 diskHit = mix(diskPrev, diskNext, diskT);
	          float hitRadius = length(diskHit.xz);
	          if (hitRadius > 1.42 && hitRadius < 7.15) {
	            vec3 worldHit = mix(pos, nextPos, diskT);
	            float hitWorldR = length(worldHit);
	            if (hitWorldR > eventHorizon * 1.018) {
	              float surfaceOpacity = 0.0;
	              vec3 surfaceLight = accretionDiskSurfaceEmission(diskHit, diskDir, time, bendAccum, hitWorldR, surfaceOpacity);
	              color += surfaceLight * transmittance;
	              transmittance *= 1.0 - clamp(surfaceOpacity, 0.0, 0.42);
	            }
	          }
	        }
	        float shellOpacity = 0.0;
	        vec3 shellLight = vec3(0.0);
	        if (abs(pointR - photonSphere) < 0.82) {
	          shellLight = photonShellEmission(rayPoint, diskPoint, dir, time, bendAccum, shellOpacity);
	        }
	        float flowOpacity = 0.0;
	        vec3 flowLight = vec3(0.0);
	        float diskR = length(diskPoint.xz);
	        float diskAge = smoothstep(1.6, 6.8, diskR);
	        float sampleHeight = mix(0.32, 0.95, diskAge);
	        if (diskR > 1.36 && diskR < 7.25 && abs(diskPoint.y) < sampleHeight) {
	          flowLight = accretionFlowEmission(diskPoint, diskDir, time, flowOpacity);
	          float wrapBoost = 1.0 + uLensing * smoothstep(0.65, 1.8, bendAccum) * exp(-abs(pointR - photonSphere) / 0.75);
	          flowLight *= wrapBoost;
	        }
	        color += (flowLight + shellLight) * transmittance * stepSize;
	        transmittance *= 1.0 - clamp((flowOpacity + shellOpacity) * stepSize, 0.0, 0.24);
	      }

	      pos = nextPos;
	    }

	    if (!captured) {
	      vec3 escaped = normalize(dir);
	      float backgroundLensing = exp(-abs(minR - photonSphere * 1.25) / 0.95) * uLensing;
	      vec3 bg = starField(escaped, uStarDensity, backgroundLensing);
	      float lensGlow = exp(-abs(minR - photonSphere) / 0.11) * (0.25 + uLensing * 0.35);
	      bg += vec3(1.0, 0.72, 0.34) * lensGlow * (0.012 + uGlare * 0.012);
	      color += bg * transmittance;
	    }

	    float visualHorizon = mix(1.08, 1.48, uLensing) * mix(0.98, 1.08, uCameraDistance);
	    float centeredShadow = smoothstep(visualHorizon * 1.08, visualHorizon * 0.88, impact);
	    float captureShadow = captured ? smoothstep(visualHorizon * 1.55, visualHorizon * 1.05, impact) : 0.0;
	    float shadow = max(centeredShadow, captureShadow);
	    float photonEscape = smoothstep(0.08, 0.58, abs(minR - photonSphere));
	    color = mix(color, vec3(0.0), shadow * mix(0.62, 0.985, photonEscape));

	    vec3 diskEscape = diskBasis * normalize(dir);
	    float outsideShadow = smoothstep(visualHorizon * 0.96, visualHorizon * 1.18, impact);
	    float lensedReturn = exp(-abs(minR - photonSphere * 1.12) / 0.46);
	    lensedReturn *= smoothstep(0.28, 1.46, bendAccum);
	    lensedReturn *= exp(-pow(abs(diskEscape.y) / 0.72, 1.22));
	    lensedReturn *= outsideShadow * uLensing * uDiskLuminosity;
	    float horizonSkirt = exp(-abs(impact - visualHorizon * 1.42) / 0.32);
	    horizonSkirt *= smoothstep(0.2, 1.18, bendAccum) * outsideShadow;
	    horizonSkirt *= uLensing * uDiskLuminosity;
	    color += thermalColor(0.72) * lensedReturn * (0.08 + uExposure * 0.28);
	    color += vec3(1.0, 0.58, 0.2) * horizonSkirt * (0.018 + uExposure * 0.045);

	    float primaryRim = exp(-abs(impact - visualHorizon * 1.08) / 0.065);
	    float photonHalo = exp(-abs(minR - photonSphere) / 0.24) * 0.012;
	    vec3 rimColor = vec3(1.0, 0.9, 0.64);
	    color += rimColor * (primaryRim * 0.1 + photonHalo) * (0.28 + uExposure * 0.62);

	    vec2 screenUv = p / vec2(aspect, 1.0);
	    float horizontalGlare = exp(-abs(screenUv.y) * 16.0) * exp(-abs(screenUv.x) * 0.55);
	    float diagonalGlare = exp(-abs(screenUv.y + screenUv.x * 0.22) * 22.0) * 0.45;
	    float hotCore = exp(-abs(impact - visualHorizon * 1.16) / 0.2);
	    vec3 glareColor = vec3(1.0, 0.86, 0.54) * (horizontalGlare + diagonalGlare) * hotCore * uGlare * (0.12 + uExposure * 0.28);
	    color += glareColor;

	    float fringe = exp(-abs(impact - visualHorizon * 1.12) / 0.11) * uGlare;
	    color += vec3(0.08, -0.01, -0.05) * fringe * 0.18;
	    color += (hash21(vUv * uResolution + time) - 0.5) * mix(0.008, 0.014, uGlare);

    float vignette = smoothstep(1.85, 0.28, length(p / vec2(aspect, 1.0)));
    color *= 0.72 + vignette * 0.34;
    gl_FragColor = vec4(aces(color), 1.0);
  }
`;

type ShaderUniforms = {
	  uResolution: { value: THREE.Vector2 };
	  uTime: { value: number };
	  uExposure: { value: number };
	  uLensing: { value: number };
	  uSpin: { value: number };
	  uDiskLuminosity: { value: number };
	  uInclination: { value: number };
	  uStarDensity: { value: number };
	  uMotion: { value: number };
	  uGlare: { value: number };
	  uRaymarchSteps: { value: number };
	  uRenderDetail: { value: number };
	  uCameraRight: { value: THREE.Vector3 };
	  uCameraUp: { value: THREE.Vector3 };
	  uCameraForward: { value: THREE.Vector3 };
	  uCameraDistance: { value: number };
	};

export class ThreeBlackHoleRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms: ShaderUniforms;
  private readonly orientation = new THREE.Quaternion();
  private readonly initialOrientation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    0.22
  );
  private readonly angularVelocity = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3(1, 0, 0);
  private readonly cameraUp = new THREE.Vector3(0, 1, 0);
  private readonly cameraForward = new THREE.Vector3(0, 0, 1);
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpDragAxis = new THREE.Vector3();
  private readonly tmpWorldYaw = new THREE.Vector3();
  private readonly tmpLocalPitch = new THREE.Vector3();
  private readonly tmpRotation = new THREE.Quaternion();
  private readonly autoOrbitYawAxis = new THREE.Vector3(0, -1, 0);
  private frameId = 0;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  private settings: BlackHoleSettings;
  private destroyed = false;
  private elapsed = 0;
  private lastFrame = performance.now();
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private distance = 0.28;
  private activePointerId: number | null = null;
  private lastPointerTime = 0;

  constructor(canvas: HTMLCanvasElement, settings: BlackHoleSettings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.uniforms = {
	      uResolution: { value: new THREE.Vector2(1, 1) },
	      uTime: { value: 0 },
	      uExposure: { value: settings.exposure },
	      uLensing: { value: settings.lensing },
	      uSpin: { value: settings.spin },
	      uDiskLuminosity: { value: settings.diskLuminosity },
	      uInclination: { value: settings.inclination },
	      uStarDensity: { value: settings.starDensity },
	      uMotion: { value: settings.motion },
	      uGlare: { value: settings.glare },
	      uRaymarchSteps: { value: clampRaymarchSteps(settings.raymarchSteps) },
	      uRenderDetail: { value: getRaymarchDetail(settings.raymarchSteps) },
	      uCameraRight: { value: this.cameraRight },
	      uCameraUp: { value: this.cameraUp },
	      uCameraForward: { value: this.cameraForward },
	      uCameraDistance: { value: this.distance }
	    };

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.orientation.copy(this.initialOrientation);
    this.attachInput();
    this.updateSettings(settings);
  }

  startLoop() {
    const render = () => {
      if (this.destroyed) {
        return;
      }
      this.resize();
      this.animate();
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(render);
    };
    this.frameId = requestAnimationFrame(render);
  }

	  updateSettings(settings: BlackHoleSettings) {
	    this.settings = settings;
	    this.uniforms.uExposure.value = settings.exposure;
	    this.uniforms.uLensing.value = settings.lensing;
	    this.uniforms.uSpin.value = settings.spin;
	    this.uniforms.uDiskLuminosity.value = settings.diskLuminosity;
	    this.uniforms.uInclination.value = settings.inclination;
	    this.uniforms.uStarDensity.value = settings.starDensity;
	    this.uniforms.uMotion.value = settings.motion;
	    this.uniforms.uGlare.value = settings.glare;
	    this.uniforms.uRaymarchSteps.value = clampRaymarchSteps(
	      settings.raymarchSteps
	    );
	    this.uniforms.uRenderDetail.value = getRaymarchDetail(
	      settings.raymarchSteps
	    );
	  }

  resetView() {
    this.orientation.copy(this.initialOrientation);
    this.distance = 0.28;
    this.angularVelocity.set(0, 0, 0);
    this.syncCameraUniforms();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.detachInput();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
  }

  private animate() {
    const now = performance.now();
    const delta = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    if (!this.settings.paused) {
      this.elapsed += delta;
    }
    if (!this.dragging) {
      const angularSpeed = this.angularVelocity.length();
      if (angularSpeed > 0.0005) {
        this.tmpDragAxis.copy(this.angularVelocity).normalize();
        this.tmpRotation.setFromAxisAngle(
          this.tmpDragAxis,
          angularSpeed * delta
        );
        this.orientation.premultiply(this.tmpRotation).normalize();
      }
      const dampingFrame = delta * 60;
      this.angularVelocity.multiplyScalar(Math.pow(0.972, dampingFrame));
      if (this.angularVelocity.lengthSq() < 0.000001) {
        this.angularVelocity.set(0, 0, 0);
      }
    }
    if (!this.settings.paused && !this.dragging && this.settings.autoOrbit) {
      const autoOrbitYawSpeed = this.settings.autoOrbitYawSpeed * 0.32;
      const autoOrbitPitchSpeed = this.settings.autoOrbitPitchSpeed * 0.24;
      if (autoOrbitYawSpeed > 0.0005) {
        this.tmpRotation.setFromAxisAngle(
          this.autoOrbitYawAxis,
          autoOrbitYawSpeed * delta
        );
        this.orientation.premultiply(this.tmpRotation).normalize();
      }
      if (autoOrbitPitchSpeed > 0.0005) {
        this.tmpLocalPitch.copy(this.cameraRight).normalize();
        this.tmpRotation.setFromAxisAngle(
          this.tmpLocalPitch,
          autoOrbitPitchSpeed * delta
        );
        this.orientation.premultiply(this.tmpRotation).normalize();
      }
    }
    this.uniforms.uTime.value = this.elapsed;
    this.syncCameraUniforms();
  }

  private resize() {
	    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1) * RENDER_SCALE;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (
      width === this.width &&
      height === this.height &&
      pixelRatio === this.pixelRatio
    ) {
      return;
    }
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  }

  private syncCameraUniforms() {
    this.tmpRight.set(1, 0, 0).applyQuaternion(this.orientation).normalize();
    this.tmpUp.set(0, 1, 0).applyQuaternion(this.orientation).normalize();
    this.tmpForward.set(0, 0, 1).applyQuaternion(this.orientation).normalize();
    this.cameraRight.copy(this.tmpRight);
    this.cameraUp.copy(this.tmpUp);
    this.cameraForward.copy(this.tmpForward);
    this.uniforms.uCameraDistance.value = this.distance;
  }

  private attachInput() {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
  }

  private detachInput() {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
  }

  private handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    this.dragging = true;
    this.activePointerId = event.pointerId;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.lastPointerTime = performance.now();
    this.angularVelocity.set(0, 0, 0);
    try {
      if (!this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.setPointerCapture(event.pointerId);
      }
    } catch {
      // Window-level listeners keep dragging alive if pointer capture is unavailable.
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.dragging || event.pointerId !== this.activePointerId) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - this.pointerX;
    const dy = event.clientY - this.pointerY;
    const now = performance.now();
    const delta = Math.max((now - this.lastPointerTime) / 1000, 1 / 120);
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.lastPointerTime = now;
    const yawDelta = dx * 0.0062;
    const pitchDelta = dy * 0.0028;
    this.tmpRight.set(1, 0, 0).applyQuaternion(this.orientation).normalize();
    this.tmpWorldYaw.set(0, -yawDelta, 0);
    this.tmpLocalPitch.copy(this.tmpRight).multiplyScalar(-pitchDelta);
    this.tmpDragAxis.addVectors(this.tmpWorldYaw, this.tmpLocalPitch);
    const angle = this.tmpDragAxis.length();
    if (angle > 0.000001) {
      this.tmpRotation.setFromAxisAngle(this.tmpDragAxis.normalize(), angle);
      this.orientation.premultiply(this.tmpRotation).normalize();
    }
    this.tmpWorldYaw.set(0, -yawDelta / delta, 0);
    this.tmpLocalPitch.copy(this.tmpRight).multiplyScalar(-pitchDelta / delta);
    this.angularVelocity.addVectors(this.tmpWorldYaw, this.tmpLocalPitch);
    const maxAngularSpeed = 8.5;
    if (this.angularVelocity.length() > maxAngularSpeed) {
      this.angularVelocity.setLength(maxAngularSpeed);
    }
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.dragging = false;
    this.activePointerId = null;
    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already be gone after leaving the canvas or window.
    }
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.distance = THREE.MathUtils.clamp(
      this.distance + event.deltaY * -0.0008,
      0.08,
      1
    );
  };

	}
