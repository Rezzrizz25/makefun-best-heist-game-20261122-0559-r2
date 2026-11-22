# The Midnight Vault

[![Bounty](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![Rank](https://make.fun/badge/best-heist-game-20261122-0559/Rezzrizz25/makefun-best-heist-game-20261122-0559-r2/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![Reward](https://make.fun/badge/best-heist-game-20261122-0559/Rezzrizz25/makefun-best-heist-game-20261122-0559-r2/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)

A top-down stealth heist in plain canvas 2D — no libraries, no build step, no network requests. Built for the [make.fun bounty "Make the best heist game"](https://make.fun/bounty/best-heist-game-20261122-0559).

## The job

Three floors, one legend:

1. **Marlowe Gallery** — steal the Marlowe Diamond.
2. **Meridian Bank** — the vault holds the bearer bonds.
3. **Gilded Cage** — the casino cage. The big one.

Read the patrolling guards' vision cones, dodge the sweeping cameras, crack the vault (hold **E** for 3 seconds), grab the side loot, and walk out the green door.

## Tools (limited charges, each costs take)

- **Smoke pellets** (`1`) — block sight for 5s.
- **EMP** (`2`) — kills the cameras for 8s.
- **Lockpick** (`3`) — cracks the vault instantly.

The alarm meter rises while a guard or camera has eyes on you. At 100, a 20-second lockdown countdown starts — reach the exit or get busted. Keep the alarm under 25 all floor for the **ghost bonus** (+500 score).

## Controls

- **WASD / arrows** — move (click the floor to walk there instead)
- **Shift** — sneak (slower, smaller profile)
- **E** — crack the vault (hold 3s)
- **1 / 2 / 3** — tools (or click the HUD tool buttons)
- **Enter** — start · **R** — retry / next floor

Sounds are synthesized with WebAudio — no audio files.

## Run it

```sh
node main.ts            # writes the game dossier to ./dist
# or
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

Then open `dist/index.html` in a browser, or play a staged scene:

```
dist/index.html?stage=1&seed=1   # thief crossing the corridor
dist/index.html?stage=2&seed=1   # caught in the red camera cone, alarm 16%
dist/index.html?stage=3&seed=1   # alarm 55% by the vault
dist/index.html?stage=4&seed=1   # CLEAN GETAWAY — vault $5,000, take $6,416
```

## Layout

- `main.ts` — entrypoint: writes the dossier into `$MAKEFUN_OUTPUT_DIR`
- `game/index.html` — the playable page
- `game/game.js` — game logic, rendering, input, staging
- `game/levels.js` — the three floors
- `tools/sim.mjs` — Node simulation tests (win path, floors 2–3, determinism)
- `tools/shots.mjs` — headless-Chrome staged screenshots
- `shots/` — the four staged screenshots (1280x720, each under 256 KiB)
