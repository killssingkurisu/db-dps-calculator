# Dungeon Blitz DPS Calculator

A static web app for planning level 50 Dungeon Blitz builds and measuring their damage, alone or as a party of four. Pick talents, gear, runes and charms (or bring them in from the game with the [DB Inventory Scanner](https://github.com/killssingkurisu/db-inventory-scanner)), and it shows the final character stats, critical hits, per-skill damage and damage over time, then plays skill combos against a target to report DPS and where that damage comes from. Builds can be saved, compared, shared as links and backed up to your own Google Drive.

Live: https://killssingkurisu.github.io/db-dps-calculator/

The talent calculator is part of the app and also works on its own at [`/talents/`](https://killssingkurisu.github.io/db-dps-calculator/talents/). Old talent calculator links (`…/#3225h…`) still open, with that talent build loaded into the app.

## The tabs

- **Character**: the open party member's name and discipline, the character sheet (HP, Attack, Expertise, Defense, critical chance and power, damage per crit, attack speed and the rest, with where each number comes from), critical hits per weapon rune, other bonuses, the target and situation, saved builds, and every skill's damage at the chosen rank with its DoTs.
- **Gears**: six pieces, by rarity and stat focus (stats from the game's gear tables, scaled by 912/1575) or as typed totals; runes per piece; the nine charm types plus lower-rank, forged and special charms, up to 18 sockets; and the gear from a load, to equip piece by piece.
- **Talents**: the embedded talent calculator, what the talents add to each stat, their damage effects and situational bonuses, a box to paste a build or link, and the list of socketed talentstones.
- **Combos**: *Character* shows the open member's preset combos and the one you build (click skills in cast order; each shows its cast time, cooldown and mana; drag or use the arrows to reorder), with sustained and burst DPS, damage by skill and type, debuff uptime and one pass step by step. *Party* plays everyone's combo against the same target at once: debuffs anyone puts up raise everyone's damage, and party buffs such as Empyrean Aura reach the whole party. It shows party DPS, damage by member, one lane per member on a shared clock, and *Find the best combos* tries the combinations and picks the set with the most party damage. *Open in new window* puts the combos in a window of their own.
- **Party**: you and up to three others, each a full character with their own gear, talents and combos. Add members from a load, a saved build, as a new character or as a copy; set the party's target; see how much each member raises the others' damage.
- **Import**: four load slots for scans from the DB Inventory Scanner (from a file, pasted, dropped, or opened straight from the scanner's link). Each load can carry a talent build, can be updated with a newer scan, put on the open member or added to the party; *Remove all* clears them.
- **Settings**: Google sign-in to keep saved builds and loads in your own Google Drive (synced as you go; *Back up now* also stores the party, *Load from Drive* brings it back), a backup file to download and restore, and clearing this browser's data.

The bar under the tabs shows the party as the game's party frames; click one to open that member in every tab.

## How the numbers are worked out

- Level 50 base stats: 68,109 HP, 3,914 Attack, 2,655 Expertise; Defense 1,344 rogue, 1,008 mage, 1,680 paladin.
- Real critical chance = 15% × (1 + Critical Chance stat). A critical hit adds a share of the hit: Heavy Blow 60%, Hemorrhage 112.5%, elemental runes 100% vs their opposite, 50% neutral, 25% vs their own element, plus half the Critical Power per damaging rune.
- Skills fire one pulse per cast-time step in the game's power data; each pulse hits for Attack × its damage multiplier, and the skill's debuffs and DoTs land on every pulse unless the game marks them First, Last or Sequence (rules read from the game client).
- DoT ticks per stack are a share of Expertise (Bleed 6%, rogue poison 60%, Burn 9%, and so on, from the mechanics notes); talents add to them the way the game does. DoTs ignore defense, weakens and slayer runes.
- Armor Bane +5% damage per stack (7 max), Armor Breaker 20/35/50% with only two different values counting, Scorch +1% per stack (15, or more with Pyromania).
- Combos loop for the fight length (15, 30 or 60 s). In a party every member loops their own combo on one shared target and clock. Debuffs from earlier steps boost later hits, DoTs stack, refresh and tick each second, buffs on you and basic-attack changes (Berserker, Ghost Blade, Cleaving Blows, Sentinel Form, Pyromania…) last their real duration, attack speed only speeds up basic attacks, and skills on cooldown are skipped. Sustained DPS uses the game's mana: 80 to start, +5 per basic attack hit, skills spend their cost; master mana is filled at an estimated 0.4 per mana spent.

The in-app "How the numbers are worked out" section has the full list, including what is still approximate.

## Files

- `index.html`, `app/` — the DPS calculator (`app/engine.js` has all the math and the party simulation, `app/combos.js` the preset combos, `app/library.js` saved builds and loads, `app/drive.js` Google Drive sync, `app/app.js` the page).
- `app/data/game-data.js` — generated game data; do not edit by hand.
- `talents/` — the talent calculator.
- `tools/extract_game_data.py` — regenerates `app/data/game-data.js` from the game's XML and the gear tables decompiled from `DungeonBlitz.swf` (see the script's header for inputs).
- `tools/check_engine.js` — `node tools/check_engine.js` checks the engine against hand calculations and the combo rules.

Everything is static; open `index.html` through any static file server.
