# Planetary Impact Simulator

An interactive 3D simulator of large bodies hitting an Earth-size planet — from 10 m meteors that burst in the atmosphere to Mars-size giant impacts that form moons or shatter the planet.

The visuals are cinematic; the numbers are not. Every readout comes from published impact physics:

- **Cratering, atmospheric entry, thermal, blast, seismic, ejecta** — Collins, Melosh & Marcus (2005), the *Earth Impact Effects Program* (M&PS 40, 817), including pi-group crater scaling, the pancake breakup model, and distance-based damage.
- **Giant impacts** — Leinhardt & Stewart (2012, ApJ 745, 79) disruption scaling with the Genda, Kokubo & Ida (2012) merge criterion: accretion, graze-and-merge, hit-and-run, erosion, catastrophic disruption.
- The Theia preset reproduces the canonical Moon-forming impact: graze-and-merge, ~1.75 lunar-mass debris disk, global magma ocean, ~4.5 h day.

## Run it

Any static file server works (ES modules need http, not file://):

```
npx http-server . -p 8742
```

Then open http://localhost:8742. Textures and three.js load from CDN — first load needs a network connection.

## Things to try

- Pick a preset (Chelyabinsk → Chicxulub → Theia) and press **LAUNCH**
- Click the planet to move ground zero; choose **deep ocean** as the target for tsunamis
- Drag the **observer distance** slider — "You are standing…" tells you what the blast, heat, shaking, and ejecta do at that range, with arrival times
- Scrub the **timeline** backward and forward through an impact
- **Hit-and-run**: a Mars-size body that grazes Earth and escapes, mangled
- Crank a Mars-size impactor to 72 km/s, head-on, and see what it actually takes to shatter a planet (spoiler: 2× escape velocity is nowhere near enough)

## Architecture

No build step — vanilla ES modules, three.js via CDN importmap.

| File | Role |
| --- | --- |
| `js/physics.js` | Pure SI physics, no rendering imports — runs in Node for validation |
| `js/effects.js` | GPU ejecta (stateless ballistics in the vertex shader), multi-front shockwaves, debris ring, planet chunks |
| `js/main.js` | Scene, impact sequence state machine, camera director, timeline scrubbing |
| `js/ui.js` | Control panel, presets, readouts, observer panel |

Physics readouts are exact SI; the animation runs on a labeled cinematic time-lapse so planetary-scale ballistics read at human speed.
