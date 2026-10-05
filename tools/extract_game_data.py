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
    # "Flurry poison" in the mechanics notes is the poison Flurry of Daggers applies.
    ("daggerPoison", {"name": "Flurry poison", "buffs": ["DaggerPoison"], "tickPct": 60, "stacks": 3, "poison": True}),
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
    ("soulReaver", {"name": "Soul Reaver", "buffs": ["SoulReaver%d" % i for i in range(1, 11)], "tickPct": 120, "rankedFrom": "SoulReaver1", "lifesteal": True}),
])

# Powers aimed at yourself or allies: their multipliers are heals or unused, not damage.
NON_HOSTILE_TARGETS = {"Self", "Friend", "GroupAndSelf", "AuraFriend", "RangedAoEFriend", "UndeadPet"}
# Aura powers tick on their own; the caster is only busy for the first cast entry.
AURA_TARGETS = {"Aura", "AuraFriend"}


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


def target_buffs(raw):
    """AddTargetBuff -> (rule, names). How the client applies the list on a power with
    several pulses (one pulse per CastTime entry, CombatState in DungeonBlitz.swf):
    no prefix = on every pulse, First: = first pulse only, Last: = last pulse only,
    Sequence: = the i-th buff on the i-th pulse. FirstTarget: only limits which of
    several targets get it, so against one target it acts like no prefix."""
    raw = raw.strip()
    rule = "every"
    for prefix, r in (("First:", "first"), ("Last:", "last"), ("Sequence:", "seq"), ("FirstTarget:", "every")):
        if raw.startswith(prefix):
            rule = r
            raw = raw[len(prefix):]
            break
    names = []
    for part in raw.split(","):
        part = part.strip()
        if ":" in part:
            part = part.split(":", 1)[1]
        if part:
            names.append(part)
    return rule, names


def ms_list(raw):
    return [int(num(c)) for c in raw.split(",") if c.strip()]


# Basic attacks and their stand-ins: the 3-hit chain powers. Buffs land on every third hit.
COMBO_TARGETS = {"MeleeCombo", "ProjectileCombo"}
# Basic-attack overrides with this many pulses are held channels (Pyromania's flamethrower):
# one pulse is one basic attack.
CHANNEL_PULSES = 10


def build_skills(xml_dir, dots, extra_buffs=()):
    pxml = read(os.path.join(xml_dir, "PlayerPowerTypes.xml"))
    powers = {n: b for n, b in re.findall(r'<Power PowerName="([^"]*)">(.*?)</Power>', pxml, re.S)}
    bxml = read(os.path.join(xml_dir, "PlayerBuffTypes.xml"))
    buff_defs = {n: b for n, b in re.findall(r'<BuffType BuffName="([^"]*)">(.*?)</BuffType>', bxml, re.S)}
    axml = read(os.path.join(xml_dir, "AbilityTypes.xml"))
    dot_buffs = {}
    for key, d in dots.items():
        for b in d["buffs"]:
            dot_buffs[b] = key
    # Debuffs that skill runes append or swap in (RuneStunStrike, RuneReduceArmor, ...).
    used_buffs = set(extra_buffs)

    def split_buffs(names):
        dots_applied, debuffs = defaultdict(int), defaultdict(int)
        for b in names:
            used_buffs.add(b)
            if b in dot_buffs:
                dots_applied[b] += 1
            else:
                debuffs[b] += 1
        return dict(dots_applied), dict(debuffs)

    def self_buff(bname, depth, extra_ms=0, on_damage=False):
        """A buff on yourself, kept only if it changes your damage."""
        body = buff_defs.get(bname)
        if body is None:
            return None
        out = {"buff": bname, "durationMs": int(num(tag("Duration", body), 0))}
        if out["durationMs"] and extra_ms:
            out["durationMs"] += extra_ms
        melee, magic = num(tag("MeleeDamage", body)), num(tag("MagicDamage", body))
        if melee > 0:
            out["melee"] = melee
        if magic > 0:
            out["magic"] = magic
        if tag("Effect", body) == "Stealthed":
            out["stealth"] = True
        for key, field in (("meleeOverride", "MeleeOverride"), ("rangedOverride", "RangedOverride")):
            pname = tag(field, body)
            if pname and depth < 3:
                info = power_info(pname, depth + 1, override=True)
                if info and info["mults"]:
                    out[key] = info
        if on_damage:
            out["onDamage"] = True
        return out if any(k in out for k in ("melee", "magic", "stealth", "meleeOverride", "rangedOverride")) else None

    def power_info(name, depth=0, override=False):
        body = powers.get(name)
        if body is None:
            return None
        target = tag("TargetMethod", body)
        hostile = target not in NON_HOSTILE_TARGETS
        mults = [num(v) for v in tag("BaseDamageMult", body).split(",") if v.strip()] or [0.0]
        casts = ms_list(tag("CastTime", body))
        recover = int(num(tag("RecoverTime", body)))
        channel = override and len(casts) >= CHANNEL_PULSES
        if channel:
            casts, recover = [casts[1] if len(casts) > 1 else casts[0]], 0
        # One pulse per CastTime entry; pulse i uses BaseDamageMult[i], or the first value.
        pulses = max(1, len(casts))
        offsets, acc = [], 0
        for i in range(pulses):
            acc += casts[i] if i < len(casts) else 0
            offsets.append(acc)
        hit_list = []
        for i in range(pulses):
            m = mults[i] if i < len(mults) else mults[0]
            if m > 0 and hostile:
                hit_list.append((round(m, 4), offsets[i]))
        rule, names = target_buffs(tag("AddTargetBuff", body)) if hostile else ("every", [])
        if target in COMBO_TARGETS:
            rule = "third"
        info = {"power": name, "target": target, "mults": [h[0] for h in hit_list], "hitAt": [h[1] for h in hit_list]}
        if rule == "seq":
            info["apply"] = {"rule": "seq", "steps": [dict(zip(("dots", "debuffs"), split_buffs([n]))) for n in names]}
        elif names:
            d, b = split_buffs(names)
            info["apply"] = {"rule": rule, "dots": d, "debuffs": b}
        if names:
            info["pulseAt"] = offsets
        if tag("ProcModifier", body) == "0":
            info["noCrit"] = True
        busy = (casts[0] if casts else 0) if target in AURA_TARGETS else sum(casts)
        info["busyMs"] = busy + recover
        info["lastAt"] = offsets[-1] if offsets else 0
        cd = int(num(tag("CoolDownTime", body)))
        if cd:
            info["cooldownMs"] = cd
        # ManaCost is "cost" or "cost,gain": basic attacks are "0,5", +5 mana per hit.
        mana_parts = tag("ManaCost", body).split(",")
        mana = num(mana_parts[0])
        if mana:
            info["mana"] = mana
        if len(mana_parts) > 1 and num(mana_parts[1]):
            info["manaGain"] = num(mana_parts[1])
        if tag("FromMasterMana", body).upper() == "TRUE":
            info["masterMana"] = True
        # Buffs on yourself that change your damage, including self-targeted AddTargetBuff.
        selfs = []
        aura_extra = (sum(casts) - casts[0]) if (target in AURA_TARGETS and casts) else 0
        raw_self = tag("AddSelfBuff", body)
        on_damage = raw_self.startswith("OnDamage:")
        for part in raw_self.split(","):
            part = part.strip().split(":", 1)[-1].strip()
            sb = self_buff(part, depth, aura_extra, on_damage) if part else None
            if sb:
                selfs.append(sb)
        if not hostile and target in ("Self", "GroupAndSelf", "AuraFriend"):
            for part in target_buffs(tag("AddTargetBuff", body))[1]:
                sb = self_buff(part, depth, aura_extra)
                if sb:
                    selfs.append(sb)
        if selfs:
            info["self"] = selfs
            info["selfAt"] = hit_list[0][1] if (on_damage and hit_list) else (casts[0] if casts else 0)
        if override:
            return info
        combo = tag("ComboName", body)
        chained = []
        if combo and depth < 3:
            for c in combo.split(","):
                sub = power_info(c.strip(), depth + 1)
                if sub and (sub["mults"] or sub.get("apply") or sub.get("self")):
                    chained.append(sub)
        # Damage that comes from a spawned explosion or a follow-up power.
        if not info["mults"] and depth == 0:
            base = re.sub(r"\d+$", "", name)
            rank = name[len(base):]
            for suffix in ("Close", "Explode", "Attack", "Combo"):
                sub = power_info(base + suffix + rank, depth + 1) or power_info(base + suffix, depth + 1)
                if sub and (sub["mults"] or sub.get("apply")) and all(sub["power"] != c["power"] for c in chained):
                    chained.append(sub)
                    break
        if target == "Charge" and any("Close" in c["power"] for c in chained):
            # The charge stops when it reaches the target; next to it, that is the
            # wind-up plus one pulse, and the Close power takes over from there.
            info["busyMs"] = (casts[0] + (casts[1] if len(casts) > 1 else 0)) if casts else 0
            info["lastAt"] = info["busyMs"]
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

    meta = OrderedDict()
    for b in sorted(used_buffs):
        body = buff_defs.get(b)
        if body is None:
            continue
        meta[b] = {"durationMs": int(num(tag("Duration", body), 5000)), "stacks": int(num(tag("StackCount", body), 1)) or 1,
                   "speed": num(tag("SpeedChange", body)), "defense": num(tag("MeleeDefense", body)),
                   "damage": num(tag("MeleeDamage", body)), "effect": tag("Effect", body)}
        if tag("RemoveOnDamage", body).lower() == "true":
            meta[b]["removeOnDamage"] = True
    return by_class, meta


# Charm gem lines: PrimaryType in CharmTypes.xml -> (calculator key, XML stat tag).
CHARM_TYPES = OrderedDict([
    ("Trog", ("gearFind", "ItemDrop")), ("Infernal", ("critChance", "ProcChanceUp")),
    ("Undead", ("goldFind", "GoldDrop")), ("Mythic", ("materialFind", "CraftDrop")),
    ("Draconic", ("critPower", "PowerBonus")), ("Sylvan", ("hp", "HitPointBoost")),
    ("Melee", ("attack", "MeleeBonus")), ("Magic", ("expertise", "MagicBonus")), ("Armor", ("defense", "ArmorBonus")),
])
CHARM_GEMS = {"gearFind": "Diamond", "critChance": "Amethyst", "goldFind": "Topaz", "materialFind": "Zircon",
              "critPower": "Ruby", "hp": "Emerald", "attack": "Citrine", "expertise": "Sapphire", "defense": "Onyx"}
# English rank names, rank 1 to 10 ("Infinite Citrine" is the rank 10 Attack charm).
CHARM_RANK_NAMES = ["Chipped", "Dim", "Streaked", "Unflawed", "Superb", "Stunning", "Radiant", "Celestial", "Goddess", "Infinite"]
SPECIAL_CHARMS = [("TripleFind", "eyeOfDiscovery", "Eye of Discovery"), ("DoubleFind1", "gleamingShard", "Gleaming Shard"),
                  ("DoubleFind2", "shimmeringFragment", "Shimmering Fragment"), ("DoubleFind3", "twilightSliver", "Twilight Sliver")]
CHARM_STAT_OF_TAG = OrderedDict((t, k) for k, t in CHARM_TYPES.values())


def parse_charm_xml(path):
    out = OrderedDict()
    if path and os.path.exists(path):
        for m in re.finditer(r'<CharmType CharmName="([^"]+)">(.*?)</CharmType>', read(path), re.S):
            out[m.group(1)] = m.group(2)
    return out


def build_charms(xml_dir, classic_dir):
    """Charm values for ranks 1 to 10, plus the special multi-stat charms.

    Values come from CharmTypes.xml; critical chance comes from the classic build's file,
    whose values the game shows (the top rank is +6% Critical Chance stat, "+1%" in game).
    """
    cur = parse_charm_xml(os.path.join(xml_dir, "CharmTypes.xml"))
    classic = parse_charm_xml(os.path.join(classic_dir, "CharmTypes.xml")) if classic_dir else OrderedDict()
    charms = [dict(c) for c in CHARMS]
    by_key = {c["key"]: c for c in charms}
    for ptype, (key, stat_tag) in CHARM_TYPES.items():
        c = by_key[key]
        ranks, ids = [], []
        for r in range(1, 11):
            name = "%s%02d" % (ptype, r)
            src = classic if (key == "critChance" and name in classic) else cur
            body = src.get(name)
            ranks.append(round(num(tag(stat_tag, body)), 6) if body else None)
            ids.append(name)
        if ranks[-1] is not None:
            c["value"] = ranks[-1]
        c["gem"] = CHARM_GEMS[key]
        c["ranks"] = ranks
        c["ids"] = ids
    specials = []
    for name, key, label in SPECIAL_CHARMS:
        body = cur.get(name)
        if not body:
            continue
        stats = OrderedDict()
        for stat_tag, stat in CHARM_STAT_OF_TAG.items():
            src_body = classic.get(name) if (stat == "critChance" and classic.get(name)) else body
            v = num(tag(stat_tag, src_body))
            if v:
                stats[stat] = round(v, 6)
        specials.append({"key": key, "name": label, "id": name, "stats": stats})
    return charms, specials


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
    skill_runes = build_skill_runes(mods)
    rune_buffs = set()
    for r in skill_runes.values():
        if r["prop"] == "AddTargetBuff":
            for part in r["value"].split(","):
                part = part.strip()
                if part.startswith("Append:"):
                    rune_buffs.add(part[len("Append:"):])
                elif part.startswith("Replace:") and "=" in part:
                    rune_buffs.add(part.split("=", 1)[1])
    skills, target_meta = build_skills(args.xml, dots, rune_buffs)
    charms, special_charms = build_charms(args.xml, args.classic)
    data = OrderedDict([
        ("meta", {"level": LEVEL, "gearScale": GEAR_SCALE,
                  "note": "Generated by tools/extract_game_data.py from Dungeon Blitz game files."}),
        ("classes", CLASS_BASELINES),
        ("disciplines", [{"id": i, "key": k, "name": n, "cls": c, "master": m}
                         for i, (k, n, c, m) in enumerate(DISCIPLINES)]),
        ("gear", build_gear(args.xml, args.gear_as)),
        ("runes", RUNES),
        ("elements", ELEMENTS),
        ("skillRunes", skill_runes),
        ("charms", charms),
        ("charmRanks", CHARM_RANK_NAMES),
        ("specialCharms", special_charms),
        ("dots", dots),
        ("skills", skills),
        ("targetBuffs", target_meta),
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
