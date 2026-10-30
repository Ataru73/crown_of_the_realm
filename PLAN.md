# Plan: Crown of the Realm

A browser strategy and action game set in medieval England, inspired by 1980s retro classics:
Saxon lords fight Normans and each other for control of England on a turn-based campaign
map with short arcade minigames in between (jousting, sword fights, sieges, rescuing a lady).

> **Intellectual Property & Originality:** *Crown of the Realm* is an independent, original work.
> All title branding, character names, visual art, music, audio, and code are created specifically
> for this project. No proprietary trademarks, copyrighted artwork, audio recordings, or proprietary
> assets from any third-party classic titles are used.

---

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Game state is big and typed models stop bugs in the campaign logic |
| Engine | **Phaser 3** (scenes, input, tweens, audio, sprite sheets) | Every minigame is a natural Phaser `Scene` |
| Build | **Vite** | Fast dev server, static build you can host anywhere |
| Tests | **Vitest** | Campaign rules (combat, AI, economy) are pure functions and easy to test |
| Asset tools | **Python 3 + Pillow** (+ `rembg` for cutouts) | Turn Gemini output into game-ready sprites |
| Asset source | **Gemini** in Chrome via the browser tools | Paintings, portraits, backgrounds, sprite poses |
| Music source | **Lyria** in the Gemini app, same browser workflow | Looping music per scene, short stings |

Target resolution: **640×400 logical** (2× the Amiga's 320×200), scaled with
`pixelArt: true` / integer scaling, so the art keeps the painted-but-crisp look.

## 2. Game design

### Campaign
- **Map of England** split into ~18 territories, each with a yearly income and a
  vassal army. Starting state: 3 Saxon lords (player picks one of 4 heroes), 3 Norman
  lords, the rest neutral.
- **Heroes** have 4 stats: *Leadership*, *Jousting*, *Swordplay*, *Fame*. Each hero
  has a different spread (difficulty choice).
- **Turn = one month.** On their turn the player picks one action:
  1. **Hold a tournament** – jousting; win fame or land.
  2. **Go conquering** – move the campaign army into an adjacent territory → field battle.
  3. **Go raiding** – sword fight inside an enemy castle to steal gold.
  4. **Buy army** – soldiers, knights, catapults, castles.
  5. **Pass.**
- **Random events:** Normans kidnap a Saxon lady → rescue mission (sword fight) →
  romance cutscene + bonus. Neighbours call tournaments that the player can join.
- **Income** collected per territory each turn; armies cost upkeep.
- **AI lords** (Normans and rival Saxons) take the same actions with simple weighted
  heuristics.
- **Win:** capture all Norman castles. **Lose:** your home castle falls.

### Minigames
| Minigame | Mechanic | Result |
|---|---|---|
| **Jousting** | First-person view: aim the lance at the opponent's shield while the horse charges; hit window and aim decide hit/unhorse/miss | Fame, or the opponent's territory ("joust for land") |
| **Sword fight** (raid / rescue) | Side view, corridor of guards; timing-based attack/parry against waves | Gold, or the rescued lady |
| **Siege** | Catapult aiming: set angle/power, knock down a wall section; possibly Greek fire / disease | Lowers castle defence before the assault |
| **Field battle** | Abstract: two army bars, each round the player picks a tactic (attack/hold/bombard/retreat); outcome based on numbers + Leadership | Territory changes hands |

## 3. Architecture

```
src/
  main.ts                 Phaser config, scene list
  model/                  pure game logic, no Phaser
    types.ts              Territory, Lord, Army, Hero, GameState
    map.ts                territory graph (adjacency, income)
    economy.ts            income, upkeep, purchases
    combat.ts             field battle resolution
    ai.ts                 AI lord decisions
    events.ts             random events (kidnap, tournaments)
    save.ts               serialize to localStorage
    rng.ts                seeded RNG (reproducible tests)
  scenes/
    BootScene.ts          preload assets, show title painting
    TitleScene.ts         menu, hero selection
    MapScene.ts           campaign map, turn loop, action menu
    JoustScene.ts
    SwordScene.ts
    SiegeScene.ts
    BattleScene.ts
    CutsceneScene.ts      full-screen paintings + caption (story beats)
    GameOverScene.ts
  ui/                     parchment panels, buttons, text boxes
  data/
    territories.json      names, positions on map, neighbours, income
    heroes.json, lords.json, prices.json
public/assets/            processed art & audio (output of the asset pipeline)
tools/assets/             Python scripts for the pipeline
raw-assets/               Gemini originals (git-ignored or kept for provenance)
tests/                    Vitest suites for model/
```

Key rule: **`model/` never imports Phaser.** Scenes read `GameState`, call model
functions, and render. That keeps the rules testable and lets minigames return a
simple result object (`{ outcome: 'win', goldStolen: 120 }`) back to `MapScene`.

## 4. Asset pipeline with Gemini

### Asset list (first pass ~40 images)
- **Backgrounds (16:10):** title painting, England map, castle interiors (×3),
  jousting field, siege view of castle wall, battlefield, lady's chamber, victory and
  defeat paintings.
- **Portraits:** 4 Saxon heroes, 3 Norman lords, 2 Saxon rivals, 2 ladies, Robin-Hood-
  style outlaw ally.
- **Sprites:** jousting opponent knight on horse (approach frames at 4–5 scales),
  lance + shield overlay; swordsman player/guard poses (idle, attack, parry, hit, die);
  catapult, boulder, wall-break states; army icons and banners for the map.
- **UI:** parchment panel, wax seal button, heraldic shields (one per lord), gold coin.

### Workflow
1. **Style sheet first.** Settle one prompt preamble and reuse it everywhere, e.g.
   *"16-bit Amiga-era painted game art, late-1980s adventure game style, rich oil-painting
   colors, dramatic lighting, medieval England, no text, no watermark"*. Generate
   2–3 test images, pick the look, then lock it.
2. **Generate in Chrome:** open gemini.google.com with the browser tools, submit each
   prompt from a prompt list (`tools/assets/prompts.yaml`), and save the image into
   `raw-assets/<id>.png`. (In practice the download button stalls in Edge, so the
   image is relayed from the page to `tools/assets/receive.mjs`; see `CLAUDE.md`.) For sprites ask for **a single subject on a flat magenta
   (#FF00FF) background**, side view, consistent framing.
3. **Process (`tools/assets/process.py`):**
   - crop/resize to target size (backgrounds 640×400);
   - background removal for sprites (chroma-key magenta, `rembg` as fallback);
   - **palette reduction** to 32–64 colors with light dithering for the retro look;
   - cut pose sheets (all of a character's poses in one Gemini image) into one PNG
     per frame. (Planned as an atlas; separate images turned out simpler.)
4. **Review:** contact sheet of all assets, regenerate the off-style ones.

Risk: Gemini won't keep a character identical across poses. Mitigations: upload the
first approved image as a reference in follow-up prompts; keep sprites small so small
differences don't show; for animation use few key poses + tweens (squash, slide,
flash) instead of many frames.

### Audio

**Music: Lyria in the Gemini app** (via the browser, like the images). One style
preamble for every track, e.g. *"medieval orchestral game music, late-1980s 16-bit
retro style, lute, recorder, horns and timpani, loopable, no vocals"*.

| Track | Used in | Mood |
|---|---|---|
| `title` | Title, hero select | Heroic main theme |
| `campaign` | Map scene | Calm, stately, long loop |
| `tournament` | Joust | Brass fanfare, festive |
| `battle` | Field battle | Drums, urgent |
| `siege` | Siege | Heavy, slow percussion |
| `swordfight` | Raid / rescue | Fast, tense strings |
| `romance` | Rescue cutscene | Lute and harp, gentle |
| `victory` / `defeat` | Battle results, game over | Short stings (5–10 s) |

Workflow:
1. Prompts live in `tools/assets/music-prompts.yaml` next to the image prompts.
2. Generate in the Gemini app; pick the best take per track; download into
   `raw-assets/music/<id>.<ext>` (each download is confirmed with the user first).
3. Process (`tools/assets/music.py`, ffmpeg): trim, crossfade the ends so the
   track loops cleanly, loudness-normalise (about −16 LUFS), export `.ogg` plus
   `.mp3` fallback to `public/assets/music/`.
4. In the game: one music manager that crossfades between tracks on scene change,
   with a mute toggle remembered in localStorage.

Limits to keep in mind: clips are short (≈30 s), so every track is designed as a
loop; check the Gemini/Lyria terms for using generated music in a published game
and note the source in `CREDITS.md`.

**Sound effects:** Lyria is for music, so SFX (lance hit, sword clash, catapult,
crowd, coins) come from CC0 packs (OpenGameArt, freesound CC0) or jsfxr. Credit
everything in `CREDITS.md`.

## 5. Milestones

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Vite + TS + Phaser + Vitest, scene skeletons with placeholder rectangles | `npm run dev` shows title → map → each scene and back |
| **M1** | Campaign model: territories, lords, economy, turn loop, save/load, tests | A full campaign can be "played" headless in a test |
| **M2** | Map scene: clickable territories, owner colors, action menu, army purchase | Playable campaign with auto-resolved fights |
| **M3** | Field battle scene + AI lords taking turns | Normans expand and attack; game can be won/lost |
| **M4** | Jousting minigame | Tournaments give fame / land |
| **M5** | Sword fight minigame (raid + rescue) | Raids steal gold, kidnap event works |
| **M6** | Siege minigame | Catapult lowers castle defence before assault |
| **M7** | Asset pass with Gemini: style lock, generate, process, swap placeholders | All placeholders replaced |
| **M8** | Cutscenes, music/SFX, balancing, difficulty via hero choice | Complete game loop with story beats |
| **M9** | Polish: settings, keyboard/mouse/touch controls, build & deploy (e.g. GitHub Pages) | Static build hosted |
| **M10** | Blender renders for the animated units, catapult and siege wall (§8) | No hand-measured anchors left; every unit animates in cycles |

Placeholders first (M0–M6) so gameplay is never blocked on art; the asset pass (M7)
can start in parallel once the style is locked, since it only needs the asset list
and sizes.

## 6. Testing
- **Unit (Vitest):** economy, combat odds, AI choices, event triggers, save/load
  round-trip — all with seeded RNG.
- **Simulation test:** run 100 AI-vs-AI campaigns headless to check balance (no
  side wins >80%, games finish within N turns).
- **Manual/browser:** play each minigame through the Chrome tools, screenshot each
  scene for the review.

## 7. Open decisions
1. Game title settled: "Crown of the Realm".
2. Faithful (one action per turn, harsh randomness) vs. modernized (tooltips, undo,
   difficulty settings).
3. Gemini access: which Google account in Chrome, and image limits per day — sets
   how fast M7 can go.

## 8. Blender renders (M10)

The battle foot soldier (`tools/assets/blender/soldier.py`) showed that Blender is better
than Gemini at everything that has to **match itself**: frames of one animation, the
same figure seen at many sizes, and anchor points, which come out of the render instead
of being measured by hand. Gemini stays the tool for one-off paintings.

| Asset | Today | In Blender | Payoff |
|---|---|---|---|
| Battle knight (`knight`) | 3 Gemini poses, measured `KNIGHT_FRAMES` | horse + rider rig: rest, gallop cycle, attack | High: stands next to the rendered soldiers |
| Swordsmen (`swordsman_hero`, `_guard`) | 6 Gemini poses, measured `FRAMES`, mirrored fall | one human rig, two outfits, full cycles | High: the largest animated sprites |
| Joust opponent (`joust_knight`) | 3 Gemini poses, measured shield points | same horse + rider, seen head-on | Medium |
| Catapult arm | drawn in code | rendered arm, rotated by Phaser | Medium |
| Siege wall | stone tile tinted darker, crack lines in code | rendered courses with damage stages, rubble | Medium |
| Map banner | still Gemini sprite | cloth-sim flutter loop | Low, optional |

Not moving: backgrounds, portraits, cutscenes, the parchment and stone tiles, the
first-person lance (all single paintings), and `castle_icon`/`hut`/`keep` (too small or
too static to gain anything).

### 8.1 Shared foundation (step B0)

Before any new asset, split `soldier.py` into:

- `tools/assets/blender/rig.py`: `clear`, `material` (with the shared `COLOURS`),
  `build_armature(BONES)`, the `limb`/`ball`/`box`/`cone` builders, `swing`, `ground`,
  `setup_render(res, px_per_m, camera)` and the render loop that keys each pose,
  renders it and writes `anchors.json` from a dict of named world points per frame.
  The camera is a parameter: orthographic side view (battle, sword, siege) or
  perspective head-on (joust).
- One script per asset (`soldier.py`, `knight.py`, `swordsman.py`, `joust.py`,
  `catapult.py`, `wall.py`) holding only its bones, body and `ANIMS`.

Scripts run through the MCP's `execute_blender_code`, where `__file__` is undefined, so
each one puts `ROOT / "tools/assets/blender"` on `sys.path` before importing `rig`.

Done when the soldier re-renders from the split scripts pixel-identical to the current
`public/assets/soldier_*`.

`process.py` already handles `kind: render` (one `scale`, one crop box per animation,
every anchor key copied into `points`), so most assets need only new `prompts.yaml`
entries. Two small additions: `tint: false` renders (catapult, wall), and an optional
`height` instead of `scale`, to size a render to the sprite it replaces.

### 8.2 Battle knight (B1)

- **Horse:** built from primitives like the soldier, to stay in the same style and fully
  original: barrel body, neck, head, two-segment legs, tail. Rig: `root`, `spine`,
  `neck`, `head`, `upper`/`lower` per leg, `tail`. If primitives don't read as a horse at
  37 px, fall back to `generate_3d` (original, so fine for the IP policy) and parent its
  mesh to the same rig with automatic weights. Poly Haven (CC0) is acceptable; Sketchfab
  is not, its licences vary.
- **Rider:** the soldier's upper body (mail, helmet) sitting on the horse's `spine`, with
  a lance or sword bone. The caparison and the rider's surcoat are tint green.
- **Animations:** `rest` (1), `gallop` (6, a four-beat cycle), `attack` (3: raise,
  strike, recover). Anchors per frame: `feet` (ground under the horse's centre), `hand`.
- **Game:** `knightPose` uses `assetPoint` like `soldierPose`; `KNIGHT_FRAMES` goes. The
  charge loops the gallop at `GALLOP_CYCLE_PX` (ground covered per cycle, measured from
  the render) so the hooves don't slide.
- **Sizing:** pick `scale`/`height` so it stands the same 37 px as the Gemini knight.

### 8.3 Swordsmen (B2)

- One human rig, extended from the soldier's: a `sword` bone in the near hand and a round
  shield on the far forearm. Two outfits on it, matching the current prompts: the hero
  (Saxon, round helmet, green tunic and shield) and the guard. Both share proportions,
  so the fight is fair to the eye.
- **Animations**, mapped to the phases of `src/model/sword.ts`: `idle` (2, a breathing
  bob), `step` (4, forward/back footwork), `windup` (2), `strike` (2), `parry` (2), `hit`
  (2), `fall` (4, ending on the ground the right way round, so `mirrored` goes).
- **Sword:** render it with the figure, so the far arm and shield occlude it correctly,
  and export `hand` and `tip` anchors. That replaces the separate `sword` sprite and its
  per-phase angles in SwordScene; the tip anchor drives the clash sparks. (Decision at
  the start of B2: if the angle-driven sword is worth keeping for its smoothness, render
  the figures without it and export a `sword_angle` per frame instead.)
- **Risk:** at 150 px the primitive look shows. Before building all frames, render the
  idle pose over `corridor.png` and compare with the painted sprites. Remedies, in order:
  bevels and more segments, a little noise in the base colours, an inverted-hull outline,
  more palette colours in `process.py`.
- **Game:** `FRAMES` goes; poses come from `assetPoint`. Frame timing follows the
  model's phase durations, so no rule changes and no test changes.

### 8.4 Joust opponent (B3)

- Reuses the B1 horse and rider, with a lance and a tint-green shield.
- Perspective camera at the player's eye height, looking down the lists, so the knight
  comes at the camera slightly off-axis as now.
- **Animations:** `charge` (4, the gallop seen head-on), `struck` (3: the hit, thrown back,
  falling). Anchors: `shield` (centre, plus `shield_r` on its rim, giving the radius) and
  `lance_tip`.
- Rendered once at the `IMPACT_SCALE` size (240 px tall) and scaled down in game as today;
  `KNIGHT_FRAMES` and `SHIELD_RADIUS` come from the manifest.

### 8.5 Catapult and siege wall (B4)

- **Catapult:** the frame without its arm (replaces `catapult`, used in SiegeScene and
  the battle) plus the arm alone, both at the same scale. The arm swings in the view
  plane, so one arm sprite rotated by Phaser is exact. Anchors: `pivot` on the frame and
  on the arm, `bucket` on the arm (where the stone sits). SiegeScene's `arm` Graphics
  becomes an image; the white wind-up marks stay in code.
- **Wall:** one render per course in `ROW_HP` (4 rows) in three states, `whole`,
  `cracked` and `broken` (a cell-fracture pass, a few stones knocked out), plus a rubble
  pile at 1–4 fallen courses. `drawWall` picks the state from each row's health instead
  of tinting the stone tile, and the crenellations and rubble come from the renders.
  The dimensions follow `WALL_THICKNESS`, `ROW_HEIGHT` and `SCALE`, so the art lines up
  with the model's hit boxes.

### 8.6 Banner (B5, optional)

A cloth-sim pennant on a pole, baked to a 6-frame loop with the cloth tint green.
Played on the map at each owned territory. Skip it if it reads as noise at 22 px.

### Order and checks

| Step | Content | Commit |
|---|---|---|
| B0 | `rig.py` split, soldier re-rendered identical | `M10: shared Blender rig module` |
| B1 | Battle knight | `M10: render the battle knight in Blender` |
| B2 | Swordsmen | `M10: render the swordsmen in Blender` |
| B3 | Joust opponent | `M10: render the joust knight in Blender` |
| B4 | Catapult arm and siege wall | `M10: render the catapult and wall in Blender` |
| B5 | Banner (optional) | `M10: animated banner` |

For every step:
1. A contact sheet of the new frames with a 10 px grid and the anchors marked, checked
   before touching the game.
2. The scene in the browser with the new sprites, next to the painted backgrounds and
   the other units, at both lord colours; a short GIF for the fight scenes.
3. `npm test` and `npm run typecheck`; the model doesn't change, so the tests should
   not either.
4. Update `CLAUDE.md` (Asset pipeline step 5, the "Animation is key poses" known issue)
   and remove the Gemini prompts that no longer feed the game.
