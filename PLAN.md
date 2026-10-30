# Plan: a "Defender of the Crown" clone

A browser remake of Cinemaware's 1986 strategy/action game: Saxon lords fight Normans
and each other for control of medieval England. A turn-based campaign map with
short arcade minigames in between (jousting, sword fights, sieges, rescuing a lady).

> **Name & IP:** "Defender of the Crown" is still a trademark, and the original art and
> music are copyrighted. The clone gets its own working title (e.g. **"Crown of the
> Realm"**) and only original assets: Gemini-generated art, our own audio. Mechanics
> are fair game; names, images and music are not.

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

## 2. Game design (what we're cloning)

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
   *"16-bit Amiga-era painted game art, 1986 Cinemaware style, rich oil-painting
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
   - pack sprite frames into sheets + Phaser JSON atlas.
4. **Review:** contact sheet of all assets, regenerate the off-style ones.

Risk: Gemini won't keep a character identical across poses. Mitigations: upload the
first approved image as a reference in follow-up prompts; keep sprites small so small
differences don't show; for animation use few key poses + tweens (squash, slide,
flash) instead of many frames.

### Audio

**Music: Lyria in the Gemini app** (via the browser, like the images). One style
preamble for every track, e.g. *"medieval orchestral game music, 1986 Amiga
Cinemaware mood, lute, recorder, horns and timpani, loopable, no vocals"*.

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
1. Title for the clone (needed before title-screen art).
2. Faithful (one action per turn, harsh randomness) vs. modernized (tooltips, undo,
   difficulty settings).
3. Gemini access: which Google account in Chrome, and image limits per day — sets
   how fast M7 can go.
