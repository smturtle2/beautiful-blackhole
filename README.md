# Beautiful Blackhole

A cinematic WebGPU artwork viewer built with Vite, React, TypeScript, and a native WGSL fullscreen renderer.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

## Notes

- WebGPU requires a compatible browser and a secure context such as `localhost`.
- If WebGPU is unavailable, the app intentionally shows a minimal `WebGPU required` fallback.
- The current artwork blueprint is saved at `ui-blueprints/beautiful-blackhole-artwork-blueprint.png`.
