# Dungeon Blitz Build Calculator

A static web app for planning level 50 Dungeon Blitz builds. Pick talents, gear, runes and charms, and it shows the final character stats, critical hit numbers, damage over time and per-skill damage, split into the part that scales with Attack and the part that scales with Expertise. Builds can be saved in the browser, compared with each other and shared as links.

Live: https://killssingkurisu.github.io/db-talent-calculator/

The talent calculator is part of the app and also works on its own at [`/talents/`](https://killssingkurisu.github.io/db-talent-calculator/talents/). Old talent calculator links (`…/db-talent-calculator/#3225h…`) still open, with that talent build loaded into the app.

## What goes in

- **Talents**: the embedded talent calculator. Every socketed talentstone is applied: stat stones, critical chance, DoT damage and stack talents, crit-rune talents, and situational talents (counted only when that situation is turned on).
- **Gear**: six pieces. Either pick rarity and stat focus per piece (stats come from the game's gear tables, scaled by 912/1575), or type the total Attack, Expertise and Defense. Runes are always set per piece: critical runes on the main hand, stat runes elsewhere, a skill rune on rare and legendary gear, and a find rune.
- **Charms**: count of each of the nine charm types, up to 18 sockets.
- **Other bonuses**: anything else, added on top.
- **Target**: enemy element (for elemental crit and slayer runes) and a flat reduction for enemy defense.

## How the numbers are worked out

- Level 50 base stats: 68,109 HP, 3,914 Attack, 2,655 Expertise; Defense 1,344 rogue, 1,008 mage, 1,680 paladin.
- Real critical chance = 15% × (1 + Critical Chance stat). A critical hit adds a share of the hit: Heavy Blow 60%, Hemorrhage 112.5%, elemental runes 100% vs their opposite, 50% neutral, 25% vs their own element, plus half the Critical Power per damaging rune.
- Skill hits deal Attack × the skill's damage multiplier at the chosen rank (game power data).
- DoT ticks per stack are a share of Expertise (Bleed 6%, rogue poison 60%, Burn 9%, and so on, from the base mechanics notes); talents add to them the way the game does.

The in-app "How the numbers are worked out" section has the full list, including what is still approximate.

## Files

- `index.html`, `app/` — the build calculator (`app/engine.js` has all the math, `app/app.js` the page).
- `app/data/game-data.js` — generated game data; do not edit by hand.
- `talents/` — the talent calculator.
- `tools/extract_game_data.py` — regenerates `app/data/game-data.js` from the game's XML and the gear tables decompiled from `DungeonBlitz.swf` (see the script's header for inputs).
- `tools/check_engine.js` — `node tools/check_engine.js` checks the engine against hand calculations.

Everything is static; open `index.html` through any static file server.
