#!/usr/bin/env python3
"""Build app/data/game-data.js from Dungeon Blitz game files.

Inputs (all read-only):
  --xml      folder with the client XML (GearTypes.xml, PlayerPowerTypes.xml, ...)
             from dungeon-blitz-r/src/client/content/xml
  --classic  the same folder from the classic build (dungeon-blitz-dps-test); only
             CharmTypes.xml is read from it, for the corrected crit charm value
  --gear-as  GearType.as decompiled from DungeonBlitz.swf with JPEXS FFDec
             (holds the gear stat tables; they are not in the XML)
  --out      output file (default: app/data/game-data.js)

Gear primary stats are scaled by 912/1575: the files give a legendary main hand
1575 Attack at level 50, the correct value is 912, and the same ratio is applied
to every Attack, Expertise and Defense table.
"""
import argparse
import json
import os
import re
from collections import OrderedDict, defaultdict

LEVEL = 50
GEAR_SCALE = 912 / 1575

CLASS_BASELINES = OrderedDict([
    ("Rogue", {"hp": 68109, "attack": 3914, "expertise": 2655, "defense": 1344}),
    ("Mage", {"hp": 68109, "attack": 3914, "expertise": 2655, "defense": 1008}),
    ("Paladin", {"hp": 68109, "attack": 3914, "expertise": 2655, "defense": 1680}),
])

# Talent calculator discipline ids -> class and the game's internal master class name.
DISCIPLINES = [
    ("frostbringer", "Frostbringer", "Mage", "Frostwarden"),
    ("flameseer", "Flameseer", "Mage", "Flameseer"),
    ("necromancer", "Necromancer", "Mage", "Necromancer"),
    ("viperblade", "Viperblade", "Rogue", "Executioner"),
    ("shadowstalker", "Shadowstalker", "Rogue", "ShadowWalker"),
    ("soulthief", "Soulthief", "Rogue", "Soulthief"),
    ("sentinel", "Sentinel", "Paladin", "Sentinel"),
    ("justicar", "Justicar", "Paladin", "Justicar"),
    ("templar", "Templar", "Paladin", "Templar"),
]

SLOTS = [
    ("mainhand", "Sword", "Main hand"),
    ("offhand", "Shield", "Off hand"),
    ("hat", "Hat", "Hat"),
    ("armor", "Armor", "Armor"),
    ("gloves", "Gloves", "Gloves"),
    ("boots", "Boots", "Boots"),
]

FOCUSES = [
    ("Attack", "Attack"),
    ("Expertise", "Expertise"),
    ("Armor", "Defense"),
    ("Balanced", "Balanced"),
    ("Spread", "Spread"),
]

RARITIES = [
    {"key": "M", "name": "Magic", "offset": 0, "procSlots": 1, "skillRune": False},
    {"key": "R", "name": "Rare", "offset": 1, "procSlots": 1, "skillRune": True},
    {"key": "L", "name": "Legendary", "offset": 2, "procSlots": 2, "skillRune": True},
]

# Gear runes (ProcRune / ProcRune2). Values come from CombatState constants in the
# client (const_560 crit 0.1, const_466 crit power 0.1, const_260 HP 0.15, const_126
# resist 0.1, const_136 slayer 0.1, const_556 recovery 0.1, const_569 tenacity 0.15,
# const_548 haste 0.05). Crit-rune damage is from the base mechanics notes.
ELEMENTS = ["Earth", "Air", "Ice", "Fire", "Life", "Death"]
RUNES = OrderedDict()
RUNES["ProcMassive"] = {"name": "Heavy Blow", "kind": "crit", "critPct": 60, "desc": "Critical hits deal 60% of the hit as extra damage"}
RUNES["ProcMassiveTime"] = {"name": "Hemorrhage", "kind": "crit", "critPct": 112.5, "desc": "Critical hits apply Hemorrhage, 112.5% of the hit"}
for el, rune in [("Earth", "Earthshaker"), ("Air", "Typhoon"), ("Ice", "Blizzard"),
                 ("Fire", "Incinerate"), ("Life", "Lifebane"), ("Death", "Death Dealer")]:
    RUNES["Proc" + el] = {"name": rune, "kind": "crit", "element": el,
                          "desc": el + " damage on critical hit: 100% vs its opposite, 50% neutral, 25% vs " + el}
RUNES["ProcHeal"] = {"name": "Mending Blow", "kind": "crit", "critPct": 0, "heal": True, "desc": "Restores health on critical hit (no damage)"}
RUNES["ProcHealTime"] = {"name": "Renew", "kind": "crit", "critPct": 0, "heal": True, "desc": "Heal over time on critical hit (no damage)"}
RUNES["CritChance"] = {"name": "Critical Chance", "kind": "stat", "stat": "critChance", "value": 0.10, "desc": "+10% Critical Chance stat (+1.5% real)"}
RUNES["CritDamage"] = {"name": "Critical Power", "kind": "stat", "stat": "critPower", "value": 0.10, "desc": "+10% Critical Power"}
RUNES["Haste"] = {"name": "Attack Speed", "kind": "stat", "stat": "attackSpeed", "value": 0.05, "desc": "+5% Attack Speed"}
RUNES["HealthPercent"] = {"name": "Health Bonus", "kind": "stat", "stat": "hpPct", "value": 0.15, "desc": "+15% max HP"}
RUNES["Resilience"] = {"name": "Tenacity", "kind": "stat", "stat": "tenacity", "value": 0.15, "desc": "+15% Tenacity"}
RUNES["RecoveryBoost"] = {"name": "Recovery Bonus", "kind": "stat", "stat": "recovery", "value": 0.10, "desc": "+10% healing received"}
for el in ELEMENTS:
    RUNES[el + "Slay"] = {"name": el + " Slayer", "kind": "stat", "stat": "slay", "element": el, "value": 0.10,
                          "desc": "+10% damage to " + el + " creatures"}
    RUNES["Resist" + el] = {"name": "Resist " + el, "kind": "stat", "stat": "resist", "element": el, "value": 0.10,
                            "desc": "+10% resist " + el + " damage"}

MAGIC_NAMES = {"Speed": "Move Speed", "ItemDrop": "Gear Find", "GoldDrop": "Gold Find", "CraftDrop": "Material Find"}

# Charms at their top rank. Crit is the classic build's value: +6% Critical Chance
# stat, shown in game as "+1% critical chance".
CHARMS = [
    {"key": "gearFind", "name": "Gear Find", "stat": "gearFind", "value": 0.10, "unit": "pct"},
    {"key": "critChance", "name": "Critical Chance", "stat": "critChance", "value": 0.06, "unit": "pct",
     "note": "+6% Critical Chance stat (about +1% real)"},
    {"key": "goldFind", "name": "Gold Find", "stat": "goldFind", "value": 0.10, "unit": "pct"},
    {"key": "materialFind", "name": "Material Find", "stat": "materialFind", "value": 0.10, "unit": "pct"},
    {"key": "critPower", "name": "Critical Power", "stat": "critPower", "value": 0.05, "unit": "pct"},
    {"key": "hp", "name": "Health", "stat": "hp", "value": 2838, "unit": "flat"},
    {"key": "attack", "name": "Attack", "stat": "attack", "value": 84, "unit": "flat"},
    {"key": "expertise", "name": "Expertise", "stat": "expertise", "value": 84, "unit": "flat"},
    {"key": "defense", "name": "Defense", "stat": "defense", "value": 28, "unit": "flat"},
]

# DoT kinds. tickPct is % of Expertise per tick per stack, from the base mechanics
# notes; it matches the game formula DoTDamage * 1.5 / ticks used for anything not
# listed. refBase converts a talent's "+X%" into the flat DoTDamage it adds.
DOT_KINDS = OrderedDict([
    ("bleed", {"name": "Bleed", "buffs": ["Bleeding"], "tickPct": 6, "stacks": 15}),
    ("poisonRogue", {"name": "Poison (rogue)", "buffs": ["PoisonStrike"], "tickPct": 60, "stacks": 3, "poison": True}),
    ("runePoison", {"name": "Poison (Poison Strike rune)", "buffs": ["RunePoisonStrike"], "poison": True}),
    ("daggerPoison", {"name": "Dagger poison", "buffs": ["DaggerPoison"], "poison": True}),
    ("flurryPoison", {"name": "Flurry poison", "buffs": ["FlurryPoison"], "tickPct": 60, "stacks": 3, "poison": True}),
    ("chaosPoison", {"name": "Chaos poison", "buffs": ["ChaosPoison"], "tickPct": 30, "stacks": 3, "poison": True}),
    ("poisonMage", {"name": "Poison (mage)", "buffs": ["PoisonCloud", "RunePoisonCloud"], "tickPct": 30, "stacks": 3, "poison": True}),
    ("decoyPoison", {"name": "Decoy poison", "buffs": ["RuneDecoy"], "poison": True}),
    ("plague", {"name": "Plague", "buffs": ["Plagued%d" % i for i in range(1, 11)], "tickPct": 40, "rankedFrom": "Plagued1", "poison": True}),
    ("entanglement", {"name": "Entanglement poison", "buffs": ["ThornPoison%d" % i for i in range(1, 5)], "stacks": 1, "poison": True}),
    ("bind", {"name": "Bind", "buffs": ["Bound"], "tickPct": 30, "stacks": 3}),
    ("burn", {"name": "Burn", "buffs": ["Burned"], "tickPct": 9, "stacks": 5}),
    ("burning", {"name": "Burning", "buffs": ["Burning"]}),
    ("wildfire", {"name": "Wildfire", "buffs": ["WildFire"]}),
    ("chilblains", {"name": "Chilblains", "buffs": ["Chilblains", "ChilblainsPermafrostDot"], "tickPct": 15, "stacks": 5}),
    ("hailstone", {"name": "Hailstone root", "buffs": ["HailstoneRoot"]}),
    ("holyFire", {"name": "Holy fire", "buffs": ["HolyFire%d" % i for i in range(1, 6)], "tickPct": 30, "stacks": 2, "rankedFrom": "HolyFire1"}),
    ("ignite", {"name": "Ignite", "buffs": ["Ignite"], "tickPct": 15, "stacks": 5}),
    ("haunted", {"name": "Haunted", "buffs": ["Haunted"]}),
    ("soulReaver", {"name": "Soul Reaver", "buffs": ["SoulReaver%d" % i for i in range(1, 11)]}),
])

# How a talent's displayed "+X%" maps to flat DoTDamage (= game BuffValue / X).
DOT_TALENT_REF = {"Bleeding": 0.2, "Burned": 1 / 3, "Chilblains": 1 / 3, "Ignite": 0.5, "Bound": 1.0,
                  "PoisonStrike": 1.0, "ProcMassiveTimeBuff": 1.0}


def read(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def tag(name, body):
    m = re.search(r"<%s>(.*?)</%s>" % (name, name), body, re.S)
    return m.group(1).strip() if m else ""


def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def gear_tables(gear_as):
    src = read(gear_as)
    tables = {k: [int(v) for v in vals.split(",")]
              for k, vals in re.findall(r'const_7\["(\w+)"\] = \[([^\]]*)\]', src)}
    mapping = dict(re.findall(r'const_1\["(\w+)"\] = "(\w+)"', src))
    return tables, mapping


def build_gear(xml_dir, gear_as):
    tables, mapping = gear_tables(gear_as)
    stats, raw = {}, {}
    for cls in CLASS_BASELINES:
        stats[cls], raw[cls] = {}, {}
        for _key, gtype, _name in SLOTS:
            stats[cls][gtype], raw[cls][gtype] = {}, {}
            for focus, _label in FOCUSES:
                stats[cls][gtype][focus], raw[cls][gtype][focus] = {}, {}
                for r in RARITIES:
                    idx = LEVEL + r["offset"]
                    vals, raws = {}, {}
                    for stat, out in (("Attack", "attack"), ("Expertise", "expertise"), ("Armor", "defense")):
                        table = tables.get(mapping.get("%s_%s_%s_%s%s" % (cls, gtype, stat, cls, focus), ""))
                        v = table[idx] if table else 0
                        raws[out] = v
                        vals[out] = int(round(v * GEAR_SCALE))
                    stats[cls][gtype][focus][r["key"]] = vals
                    raw[cls][gtype][focus][r["key"]] = raws

    xml = read(os.path.join(xml_dir, "GearTypes.xml"))
    proc_opts = defaultdict(set)
    skill_opts = defaultdict(lambda: defaultdict(set))
    magic_opts = set()
    for name, _gid, gtype, body in re.findall(r'<Gear GearName="([^"]*)" GearID="(\d+)" Type="([^"]*)">(.*?)</Gear>', xml, re.S):
        if gtype.startswith("-"):
            continue
        for t in ("ProcRune", "ProcRune2"):
            v = tag(t, body)
            if v and not v.startswith("-"):
                proc_opts[gtype].add(v)
        pr, used = tag("PowerRune", body), tag("UsedBy", body)
        if pr and not pr.startswith("-") and pr != "SwordMelee":
            skill_opts[used][gtype].add(pr)
        mr = tag("MagicRune", body)
        if mr and not mr.startswith("-"):
            magic_opts.add(mr)
    order = list(RUNES)
    proc = {g: sorted(v, key=lambda k: order.index(k) if k in order else 999) for g, v in proc_opts.items()}
    skills = {c: {g: sorted(v) for g, v in d.items()} for c, d in skill_opts.items()}

    magic = []
    mt = read(os.path.join(xml_dir, "MagicTypes.xml"))
    for mname, body in re.findall(r'<MagicType MagicName="([^"]*)">(.*?)</MagicType>', mt, re.S):
        if mname not in magic_opts:
            continue
        parts = mname.split("+")
        magic.append({"key": mname, "name": " + ".join(MAGIC_NAMES.get(p, p) for p in parts),
                      "speed": num(tag("Speed", body)), "gearFind": num(tag("ItemDrop", body)),
                      "goldFind": num(tag("GoldDrop", body)), "materialFind": num(tag("CraftDrop", body))})
    return {
        "slots": [{"key": k, "type": t, "name": n} for k, t, n in SLOTS],
        "focuses": [{"key": k, "name": n} for k, n in FOCUSES],
        "rarities": RARITIES,
        "stats": stats,
        "rawStats": raw,
        "procOptions": proc,
        "skillRuneOptions": skills,
        "magicRunes": magic,
    }


def parse_mods(xml_dir):
    xml = read(os.path.join(xml_dir, "PowerModTypes.xml"))
    return [dict(re.findall(r"<(\w+)>([^<]*)</\1>", m)) for m in re.findall(r"<PowerModType>(.*?)</PowerModType>", xml, re.S)]


def build_skill_runes(mods):
    out = OrderedDict()
    for m in mods:
        mn = m.get("ModName", "")
        if not mn.startswith("Rune"):
            continue
        out[mn[4:]] = {
            "name": m.get("DisplayName", mn[4:]),
            "desc": m.get("Description", ""),
            "type": m.get("ModType", ""),
            "prop": m.get("PowerProperty") or m.get("BuffProperty") or "",
            "targets": (m.get("PowerName") or m.get("BuffName") or "").split(","),
            "value": m.get("PowerValue") or m.get("BuffValue") or "",
        }
    return out


def build_talent_effects(mods):
    """Game definition of every talentstone, keyed by display name."""
    grouped = OrderedDict()
    for m in mods:
        disp, mn = m.get("DisplayName", ""), m.get("ModName", "")
        if not disp or mn.startswith("Rune"):
            continue
        base = re.sub(r"\d+$", "", mn)
        grouped.setdefault(disp, OrderedDict()).setdefault(base, []).append(m)
    effects = OrderedDict()
    for disp, bases in grouped.items():
        variants = []
        for base, lst in bases.items():
            m0 = lst[0]
            variants.append({
                "mod": base,
                "type": m0.get("ModType", ""),
                "prop": m0.get("StatProperty") or m0.get("BuffProperty") or m0.get("PowerProperty") or "",
                "targets": [t for t in (m0.get("BuffName") or m0.get("PowerName") or "").split(",") if t],
                "values": [l.get("StatValue") or l.get("BuffValue") or l.get("PowerValue") or l.get("SelfValue") or "" for l in lst[:5]],
            })
        effects[disp] = variants
    return effects


def parse_buffs(xml_dir):
    xml = read(os.path.join(xml_dir, "PlayerBuffTypes.xml"))
    buffs = {}
    for name, body in re.findall(r'<BuffType BuffName="([^"]*)">(.*?)</BuffType>', xml, re.S):
        dot = num(tag("DoTDamage", body))
        if dot <= 0:
            continue
        tick = num(tag("DoTTickLength", body), 1000) or 1000
        dur = num(tag("Duration", body), 5000)
        buffs[name] = {"dot": dot, "tickMs": tick, "durationMs": dur, "ticks": int(round(dur / tick)),
                       "stacks": int(num(tag("StackCount", body), 1)) or 1}
    return buffs


def build_dots(buffs):
    dots = OrderedDict()
    for key, kind in DOT_KINDS.items():
        entry = dict(kind)
        present = [b for b in kind["buffs"] if b in buffs]
        entry["buffs"] = present
        if not present:
            continue
        first = buffs[present[0]]
        entry.setdefault("ticks", first["ticks"])
        entry.setdefault("stacks", first["stacks"])
        xml_tick = first["dot"] * 1.5 / first["ticks"] * 100
        entry["xmlTickPct"] = round(xml_tick, 3)
        entry["source"] = "mechanics" if "tickPct" in kind else "game"
        entry.setdefault("tickPct", round(xml_tick, 3))
        # Per-buff tick %: the game formula for each buff, scaled by the same factor
        # that turns the first buff's game value into the mechanics-notes value.
        factor = entry["tickPct"] / xml_tick if xml_tick else 1.0
        entry["perBuff"] = {}
        for b in present:
            bx = buffs[b]["dot"] * 1.5 / buffs[b]["ticks"] * 100
            per_rank_stacks = key in ("plague", "soulReaver")
            entry["perBuff"][b] = {"tickPct": round(bx * factor, 4), "ticks": buffs[b]["ticks"],
                                   "stacks": max(buffs[b]["stacks"], 1) if per_rank_stacks else entry["stacks"]}
        dots[key] = entry
    return dots


def first_buffs(raw):
    """AddTargetBuff -> list of buff names; First:/Last:/Append: prefixes dropped."""
    out = []
    for part in raw.split(","):
        part = part.strip()
        if not part or part.startswith("Sequence:"):
            part = part.split(":", 1)[-1] if part else part
        if ":" in part:
            part = part.split(":", 1)[1]
        if part:
            out.append(part)
    return out


def build_skills(xml_dir, dots):
    pxml = read(os.path.join(xml_dir, "PlayerPowerTypes.xml"))
    powers = {n: b for n, b in re.findall(r'<Power PowerName="([^"]*)">(.*?)</Power>', pxml, re.S)}
    axml = read(os.path.join(xml_dir, "AbilityTypes.xml"))
    dot_buffs = {}
    for key, d in dots.items():
        for b in d["buffs"]:
            dot_buffs[b] = key

    def power_info(name, depth=0):
        body = powers.get(name)
        if body is None:
            return None
        mults = [num(v) for v in tag("BaseDamageMult", body).split(",") if v.strip()] or [0.0]
        casts = [c for c in tag("CastTime", body).split(",") if c.strip()]
        hits = len(mults) if len(mults) > 1 else max(1, len(casts))
        if len(mults) == 1:
            mults = mults * hits
        dmg_mults = [m for m in mults if m > 0]
        applied = defaultdict(int)
        for b in first_buffs(tag("AddTargetBuff", body)):
            if b in dot_buffs:
                applied[b] += 1
        info = {"power": name, "mults": [round(m, 4) for m in dmg_mults], "dots": dict(applied),
                "target": tag("TargetMethod", body)}
        combo = tag("ComboName", body)
        chained = []
        if combo and depth < 3:
            for c in combo.split(","):
                sub = power_info(c.strip(), depth + 1)
                if sub:
                    chained.append(sub)
        # Damage that comes from a spawned explosion or a follow-up power.
        if not dmg_mults and depth == 0:
            base = re.sub(r"\d+$", "", name)
            rank = name[len(base):]
            for suffix in ("Close", "Explode", "Attack", "Combo"):
                sub = power_info(base + suffix + rank, depth + 1) or power_info(base + suffix, depth + 1)
                if sub and (sub["mults"] or sub["dots"]) and all(sub["power"] != c["power"] for c in chained):
                    chained.append(sub)
                    break
        if chained:
            info["chain"] = chained
        return info

    def display(name):
        body = powers.get(name) or ""
        return tag("DisplayName", body), tag("Description", body)

    by_class = OrderedDict()
    for aname, body in re.findall(r'<Ability AbilityName="([^"]*)">(.*?)</Ability>', axml, re.S):
        cls = tag("Class", body)
        if cls in ("----", "") or aname == "DeathBlowOld":
            continue
        ranks = []
        for r in range(1, 11):
            info = power_info("%s%d" % (aname, r))
            if info is None:
                if r == 1:
                    info = power_info(aname)
                if info is None:
                    break
            info["rank"] = r
            ranks.append(info)
        if not ranks:
            continue
        dname, desc = display(ranks[-1]["power"])
        if not dname:
            dname, desc = display(aname)
        by_class.setdefault(cls, []).append({
            "ability": aname, "name": dname or aname, "desc": desc,
            "hotbar": int(num(tag("HotbarLocation", body))), "category": tag("Category", body),
            "type": tag("Type", body), "ranks": ranks,
        })
    return by_class


def build_charms(classic_dir):
    """Top-rank charm values; crit is checked against the classic build's charm."""
    charms = [dict(c) for c in CHARMS]
    path = os.path.join(classic_dir, "CharmTypes.xml") if classic_dir else ""
    if path and os.path.exists(path):
        xml = read(path)
        m = re.search(r'<CharmType CharmName="Infernal10">(.*?)</CharmType>', xml, re.S)
        if m:
            for c in charms:
                if c["key"] == "critChance":
                    c["value"] = num(tag("ProcChanceUp", m.group(1)), c["value"])
    return charms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xml", required=True)
    ap.add_argument("--classic", default="")
    ap.add_argument("--gear-as", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "app", "data", "game-data.js"))
    args = ap.parse_args()

    mods = parse_mods(args.xml)
    buffs = parse_buffs(args.xml)
    dots = build_dots(buffs)
    data = OrderedDict([
        ("meta", {"level": LEVEL, "gearScale": GEAR_SCALE,
                  "note": "Generated by tools/extract_game_data.py from Dungeon Blitz game files."}),
        ("classes", CLASS_BASELINES),
        ("disciplines", [{"id": i, "key": k, "name": n, "cls": c, "master": m}
                         for i, (k, n, c, m) in enumerate(DISCIPLINES)]),
        ("gear", build_gear(args.xml, args.gear_as)),
        ("runes", RUNES),
        ("elements", ELEMENTS),
        ("skillRunes", build_skill_runes(mods)),
        ("charms", build_charms(args.classic)),
        ("dots", dots),
        ("dotTalentRef", DOT_TALENT_REF),
        ("skills", build_skills(args.xml, dots)),
        ("talentEffects", build_talent_effects(mods)),
    ])
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("// Generated by tools/extract_game_data.py. Do not edit by hand.\n")
        fh.write("window.DBB_DATA = ")
        json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
        fh.write(";\n")
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
