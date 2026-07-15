# WĀHA · وَاحَة — Master of Masters Platform

Interactive 3D pitch deck for a unified smart-park management platform for
**King Salman Park, Riyadh** (17.2 km², the world's largest urban park).

## Run it

No build step. Either:

- **Double-click `index.html`** — works offline (Three.js is vendored in `vendor/`).
- Or serve it: `python3 -m http.server 8643` and open `http://localhost:8643`.

## Controls

| Input | Action |
|---|---|
| `→` / `←` / `Space` / `PgUp` `PgDn` | Next / previous slide |
| `Home` / `End` | First / last slide |
| `F` or ⛶ buttons | Fullscreen |
| Mouse drag on any 3D panel | Orbit the camera |
| Progress dots / arrow buttons | Jump navigation |
| Scroll wheel / touch swipe | Navigate slides |

### Slide 6 — WĀHA Command (interactive ops room)
- Alerts stream in live; click an alert card **or its 3D beacon** to select it.
- **Dispatch crew** sends a worker from the depot to the fault; watch it resolve.
- **Auto-fix** appears on trivial (auto-fixable) faults.
- **2D plan view / 3D orbit view** toggles the camera.
- **⚡ Simulate incident** spawns a crowd incident on demand.

### Slide 5 — Architecture
Click a layer row to light up the matching slab in the 3D stack.

## Structure

```
index.html      markup + all styling (clay design system, see DESIGN.md)
js/deck.js      slide navigation, fullscreen, HUD
js/scenes.js    all Three.js scenes (one shared WebGL context)
vendor/three.min.js   Three.js r128 (UMD, offline)
DESIGN.md       "clay" design tokens (npx getdesign@latest add clay)
```

## Story arc (14 slides)

1. **Hero** — living park island
2. **The canvas** — King Salman Park facts & district massing
3. **The problem** — dozens of siloed systems: the 8-system operational core plus the venue long tail (BMS, access control, ticketing, fire, signage, fountains, EV charging)
4. **The idea** — unified protocol translator federating the masters
5. **Architecture** — field → adaptors → translator → data/control → AI → experience
6. **Single pane of glass** — gamified 2D–3D command map (interactive)
7. **AI operations** — auto-remediation triage + AI crew dispatch
8. **Root-cause intelligence** — AI log analysis maps upstream/downstream dependencies, instant RCA, routes the task to the right department (extends to OvulScanner / SolarWinds-class network & asset monitoring)
9. **Predictive asset health** — PM / CM / RM with RUL forecasting
10. **Crowd intelligence** — flow, density heat, surge prediction
11. **ESG & carbon** — resource utilisation + Scope 1/2/3 emissions tracking, reduction suggestions, carbon-credit capitalisation
12. **Outcomes** — design targets
13. **Roadmap** — Connect → Optimise → Anticipate
14. **Close**
