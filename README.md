# Dungeon Blitz DPS Calculator

A static web app for planning level 50 Dungeon Blitz builds and measuring their damage. Pick talents, gear, runes and charms, and it shows the final character stats, critical hits, per-skill damage and damage over time, then plays skill combos against a target to report DPS and where that damage comes from. Builds can be saved in the browser, compared with each other and shared as links.

Live: https://killssingkurisu.github.io/db-dps-calculator/

The talent calculator is part of the app and also works on its own at [`/talents/`](https://killssingkurisu.github.io/db-dps-calculator/talents/). Old talent calculator links (`…/#3225h…`) still open, with that talent build loaded into the app.

## What goes in

- **Talents**: the embedded talent calculator. Every socketed talentstone is applied: stat stones, critical chance, DoT damage and stack talents, crit-rune talents, debuff-duration talents (Corrosive Strikes, Intensity, Lingering Curse…), and situational talents.
- **Gear**: six pieces. Either pick rarity and stat focus per piece (stats come from the game's gear tables, scaled by 912/1575), or type the total Attack, Expertise and Defense. Runes are set per piece: critical runes on the main hand, stat runes elsewhere, a skill rune on rare and legendary gear, and a find rune.
- **Charms**: count of each of the nine charm types, up to 18 sockets.
- **Other bonuses**: anything else, added on top.
- **Target and situation**: enemy element (elemental crits, slayer runes), a flat damage reduction, Armor Bane stacks, Armor Breaker and Scorch stacks for the skill list, and the situations your talents care about (stealth, low HP, cursed or bound targets…).

## What comes out

- **Character sheet**: HP, Attack, Expertise, Defense, critical chance and power, damage per crit, attack speed and the rest, with where each number comes from.
- **Critical hits**: per weapon rune, plus Mending Blow and Renew healing.
- **Skill damage**: every skill at the chosen rank, split into the part that scales with Attack and the part that scales with Expertise, with the debuffs it leaves on the target, the buffs it gives you, its cast time, mana and cooldown, and Retribution's reflect.
- **Combo DPS** (its own tab, or its own browser window with *Open in new window*): three preset combos per discipline that open with debuffs and buffs before the damage and DoT skills, plus one you build yourself. For the picked combo it shows sustained DPS (with the game's mana) and burst DPS (no mana limit), damage by skill (direct, critical, DoT), damage by type, how long each debuff stays on the target, and one pass of the combo step by step.

## How the numbers are worked out

- Level 50 base stats: 68,109 HP, 3,914 Attack, 2,655 Expertise; Defense 1,344 rogue, 1,008 mage, 1,680 paladin.
- Real critical chance = 15% × (1 + Critical Chance stat). A critical hit adds a share of the hit: Heavy Blow 60%, Hemorrhage 112.5%, elemental runes 100% vs their opposite, 50% neutral, 25% vs their own element, plus half the Critical Power per damaging rune.
- Skills fire one pulse per cast-time step in the game's power data; each pulse hits for Attack × its damage multiplier, and the skill's debuffs and DoTs land on every pulse unless the game marks them First, Last or Sequence (rules read from the game client).
- DoT ticks per stack are a share of Expertise (Bleed 6%, rogue poison 60%, Burn 9%, and so on, from the mechanics notes); talents add to them the way the game does. DoTs ignore defense, weakens and slayer runes.
- Armor Bane +5% damage per stack (7 max), Armor Breaker 20/35/50% with only two different values counting, Scorch +1% per stack (15, or more with Pyromania).
- Combos loop for the fight length (15, 30 or 60 s). Debuffs from earlier steps boost later hits, DoTs stack, refresh and tick each second, buffs on you and basic-attack changes (Berserker, Ghost Blade, Cleaving Blows, Sentinel Form, Pyromania…) last their real duration, attack speed only speeds up basic attacks, and skills on cooldown are skipped. Sustained DPS uses the game's mana: 80 to start, +5 per basic attack hit, skills spend their cost; master mana is filled at an estimated 0.4 per mana spent.

The in-app "How the numbers are worked out" section has the full list, including what is still approximate.

## Files

- `index.html`, `app/` — the DPS calculator (`app/engine.js` has all the math, `app/combos.js` the preset combos, `app/app.js` the page).
- `app/data/game-data.js` — generated game data; do not edit by hand.
- `talents/` — the talent calculator.
- `tools/extract_game_data.py` — regenerates `app/data/game-data.js` from the game's XML and the gear tables decompiled from `DungeonBlitz.swf` (see the script's header for inputs).
- `tools/check_engine.js` — `node tools/check_engine.js` checks the engine against hand calculations and the combo rules.

Everything is static; open `index.html` through any static file server.
