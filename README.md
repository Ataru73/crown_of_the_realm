# Crown of the Realm

A browser strategy game of medieval England, inspired by the 1980s computer classics.
Saxon and Norman lords fight over the counties of England on a turn-based campaign
map, and the big moments are played as short arcade minigames: jousting
tournaments, sword fights in castle corridors, catapult sieges and field battles.

All art, music and sound are original to this project (see [CREDITS.md](CREDITS.md)).

## How to play

Choose one of four Saxon heroes. Each has a different mix of **Leadership** (field
battles), **Jousting** and **Swordplay**, so the hero you pick sets your difficulty.
Each month you take one action on the map:

- **Attack** a neighbouring county with your army. With catapults, a castle is
  besieged first.
- **Raid** a rival's castle to steal gold, or **rescue** a lady the Normans have carried off.
- **Joust** a rival for fame, or for one of their counties.
- **March** your army through your own lands, or **rest**.

Mustering troops and building castles don't use up your turn. Take every Norman
castle to win, and lose if your home castle falls. The game autosaves at the start
of each of your turns.

### Controls

The game plays with the mouse, the keyboard, or a touch screen.

| Where | Controls |
|---|---|
| Map | Click a county (or move between them with the arrow keys), then an action (or its number key, 1 to 8) |
| Muster dialog | 1 to 5 buy, C builds a castle, Enter is done |
| Dialogs, screens | Enter (or Space) for the main button |
| Hero choice | 1 to 4 |
| Battle | 1 to 5 pick the tactic |
| Joust | Aim with the mouse, a finger or the arrow keys; click, tap or Space to ride |
| Sword fight | A or Space to strike, D or Shift to parry |
| Siege | Up/Down to aim, hold and release Space to throw, 1/2 for stones or fire pots, Enter to storm |
| Anywhere | Esc or ⚙ for settings (volume, full screen, quit to title); M or 🔊 to mute |

## Running it

Needs Node.js 22.12 or newer.

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # model tests (Vitest)
npm run build      # static build into dist/
```

`dist/` is a plain static site with relative paths, so it can be hosted anywhere.
`.github/workflows/deploy.yml` tests, builds and publishes it to GitHub Pages on
every push to `main` (set the repository's Pages source to "GitHub Actions").
Elsewhere, e.g. Cloudflare Pages, use build command `npm run build` and output
directory `dist`.

## How it's built

TypeScript, [Phaser 3](https://phaser.io), Vite and Vitest, at a logical
resolution of 640×400.

- `src/model/` holds every game rule as pure TypeScript with a seeded RNG, never
  importing Phaser, so the whole campaign can be simulated and tested headless.
  The tests include a balance check that plays 100 all-AI campaigns.
- `src/scenes/` has one Phaser scene per screen; `src/ui/` the widgets and audio.
- `tools/assets/` is the asset pipeline: image prompts and processing
  (`prompts.yaml`, `process.py`), music prompts and looping (`music-prompts.yaml`,
  `music.py`), and a sound-effect synthesiser (`sfx.py`).

[PLAN.md](PLAN.md) has the full design and milestones; [CLAUDE.md](CLAUDE.md) has
the working notes and current status.

## Licence

The source code is released under the [MIT licence](LICENSE).

The images and music were generated with Google Gemini and Lyria, and may not be
protected by copyright in every country. They are provided as they are, for use
with this game. Phaser is © Phaser Studio Inc., under the MIT licence.
