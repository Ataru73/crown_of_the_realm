# Crown of the Realm

A browser remake of Cinemaware's *Defender of the Crown* (1986): Saxon and Norman
lords fight over medieval England on a turn-based campaign map, with arcade
minigames for battles, tournaments, raids, rescues and sieges.

**IP rule:** the title, names, art and music must be original. Copy the mechanics
only, never the original's names, images or music. Art is generated with Gemini and
music with Lyria in the Gemini app, both through the browser. See `PLAN.md`.

`PLAN.md` holds the full design, asset pipeline and milestones. This file covers
how to work in the repo and where it stands.

## Commands

```bash
npm run dev        # Vite dev server (in WSL use: npx vite --port 5173 --strictPort --host 0.0.0.0)
npm test           # Vitest, all model tests
npm run typecheck
npm run build      # typecheck + production build into dist/
```

## Stack

TypeScript, **Phaser 3.90** (deliberately not Phaser 4), Vite, Vitest. The logical
resolution is 640×400 (`src/config.ts`), with `pixelArt` and `Scale.FIT`.

## Architecture

- `src/model/` holds all game rules. It is pure TypeScript and **never imports
  Phaser**, so every rule can be tested headless.
  - `types.ts` (GameState, Lord, Territory, Army), `map.ts`, `economy.ts`,
    `combat.ts` (field battle), `actions.ts` (one action per turn), `turn.ts`
    (`playTurn`, `endTurn`, `withRng`), `ai.ts`, `events.ts` (kidnap),
    `joust.ts`, `sword.ts`, `save.ts`, `setup.ts` (`newGame`).
  - Randomness only comes from the seeded RNG (`rng.ts`, mulberry32), and its
    state lives in `GameState.rngState`. Use `withRng(state, fn)`, never
    `Math.random`, in the model.
  - Rule violations throw `RuleError`, which the UI shows as a dialog.
- `src/scenes/`: one Phaser scene per screen. Scenes read `session.state`
  (`src/game/session.ts`) and call model functions.
- **Minigame flow:** MapScene starts the minigame scene. When it finishes, the
  minigame starts `Map` again with its result (`MapSceneData`: conquest,
  tournament, raid, rescue). MapScene then plays that turn through
  `playTurn` with the outcome embedded in the action (`result` / `won`). With no
  outcome given, the model auto-resolves it, which is how AI lords act.
- `src/ui/` has the placeholder widgets: Button, Dialog, MapView, BuyDialog and the theme.
- `src/data/*.json` holds territories, heroes and lords.
- **Saving:** the game autosaves to localStorage (`crown-of-the-realm.save`) at
  the start of each player turn. When `GameState` changes shape, bump
  `STATE_VERSION` (`state.ts`) and add a migration in `save.ts`. It is currently
  v2, with a v1 migration.

## Conventions

- Put new rules in `src/model` with Vitest tests. Use the helpers in
  `tests/helpers.ts` (`game(seed)`, `memoryStorage`).
- `tests/balance.test.ts` simulates 100 AI campaigns and checks that every game
  finishes, plus broad statistics. Rerun it after any rule change.
- Do the real-time minigame logic in the model as a `tick(dt)` state machine
  that emits events, as in `sword.ts`. The scene drains the events for effects
  and poses the sprites from the phases.
- Verify UI changes in the browser (Edge through the claude-in-chrome extension, at
  `http://localhost:5173`). In dev builds the Phaser game is available as
  `window.game`, and model modules can be loaded with `await import('/src/model/...')`.
  The tab is throttled to about 6 fps when it is in the background, so wait
  generously.
- Commits: one per milestone, with messages like `M5: ...`, on `main`. There is
  no remote.

## Status (October 2026)

| Milestone | Status |
|---|---|
| M0 Scaffold | ✅ |
| M1 Campaign model, save/load, headless tests | ✅ |
| M2 Map scene, actions, army purchase | ✅ |
| M3 Field battle scene, AI lords, March | ✅ |
| M4 Jousting (first-person lance aim) | ✅ |
| M5 Sword fight (raid + rescue), kidnap event | ✅ |
| M6 Siege / catapult minigame | ⏳ next. `SiegeScene` is still a `MinigameScene` placeholder |
| M7 Gemini asset pass (all art is still shapes and placeholders) | — |
| M8 Cutscenes, Lyria music, SFX, balancing | — |
| M9 Polish, controls, deploy | — |

There are 102 tests, all passing.

### Known issues / deferred
- Balance is off: the hero wins about 9% of simulated games, and the plan's
  "no side >80%" target is not met yet. Proper balancing is deferred to M8.
- A raid on a lord with no gold still "succeeds" and reports stealing 0 gold.
- The swordsmen's shields are drawn on the back arm. M7 art replaces them anyway.
- Rescue victories show only a dialog. The romance cutscene is planned for M8,
  and `CutsceneScene` is still a placeholder.
- Not yet tested by hand in the browser (the model tests cover these): bombard,
  a won joust, jousting for land, the game-over defeat screen.
