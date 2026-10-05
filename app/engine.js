/*
 * Dungeon Blitz DPS Calculator: calculation engine.
 * Pure functions over window.DBB_DATA (game data), window.DBCALC_TALENT_DATA
 * (talent calculator data) and window.DBB_COMBOS (preset combos). No DOM access,
 * so it also runs under Node for tools/check_engine.js.
 */
(function (root) {
	"use strict";

	var BASE_CRIT = 0.15;
	var OPPOSITE = { Earth: "Air", Air: "Earth", Ice: "Fire", Fire: "Ice", Life: "Death", Death: "Life" };
	// Third ranged basic shot crits only for these (base mechanics notes).
	var RANGED_BASIC_CRITS = { frostbringer: true, flameseer: true, necromancer: true, shadowstalker: true };
	var MOVE_SPEED_PER_RUNE = 0.023;
	var SLOTS_TOTAL = 18;
	var ARMOR_BANE_PER_STACK = 0.05;   // "makes you deal 5% more damage", up to 7 stacks
	var ARMOR_BANE_MAX = 7;
	var SCORCH_BASE_MAX = 15;          // +1% damage per stack, Flameseer talents raise the cap
	var DOT_TICK_MS = 1000;
	var HEMORRHAGE_MS = 3000;
	var HARMONY_MS = 3000;
	var DEFAULT_WINDOW_S = 30;
	var MIN_STEP_MS = 100;
	var SAMPLE_MS = 100;
	// Mana (DungeonBlitz.swf): 80 mana, refilled only by basic attacks (+5 a hit, from the
	// power's "0,5" ManaCost); skills spend it. Spending mana fills master mana (max 100),
	// which master skills spend; 0.4 per mana spent is assumed for every class.
	var MANA_MAX = 80;
	var MASTER_MANA_MAX = 100;
	var MASTER_MANA_RATIO = 0.4;
	// Retribution (mechanics notes): % of Expertise per reflected hit and how many hits it
	// reflects, by rank. Ranks 3, 4, 7, 8 and 9 are interpolated between the listed ranks.
	var RETRIBUTION = {
		pct: [80, 100, 107.67, 115.33, 123, 130, 136.25, 142.5, 148.75, 155],
		hits: [7, 7, 9, 9, 9, 9, 10, 10, 10, 10],
		estimated: [false, false, true, true, false, false, true, true, true, false]
	};
	// Hallowed Reckoning "applies holy fire each tick after rank 4".
	var HALLOWED_FIRE_RANK = 5;
	var HALLOWED_FIRE_BUFF = "HolyFire1";
	var ARMOR_BREAKS = { "": [], "20": [0.2], "35": [0.35], "50": [0.5], "20+35": [0.2, 0.35], "20+50": [0.2, 0.5], "35+50": [0.35, 0.5] };

	var CONDITIONS = {
		stealth: "You are in Stealth",
		lowHp: "You are below 20% HP",
		sentinelReady: "Sentinel Form is off cooldown",
		afterMaster: "Within 3 s of a master ability",
		afterKill: "Within 3 s of a kill",
		cursed: "Target is cursed",
		stunned: "Target is stunned, staggered or demoralized",
		ignited: "Target is ignited",
		slowed: "Target is slowed or immobilized",
		bound: "Target is bound",
		bleeding: "Target is bleeding",
		frozen: "Target is frozen",
		hemorrhaging: "Target has Hemorrhage"
	};
	// Combos work out target states from their own debuffs; these come from your settings.
	var SELF_CONDITIONS = { stealth: true, lowHp: true, sentinelReady: true, afterKill: true };

	function seq(prefix, from, to) {
		var out = [];
		for (var i = from; i <= to; i++) out.push(prefix + i);
		return out;
	}
	var POISONS = ["PoisonStrike", "DaggerPoison", "PoisonCloud", "ChaosPoison"].concat(seq("Plagued", 1, 10), seq("ThornPoison", 1, 4), ["RunePoisonCloud", "RunePoisonStrike"]);
	var POISONS_VS_BLEED = ["PoisonStrike", "DaggerPoison", "ChaosPoison"].concat(seq("ThornPoison", 1, 4), ["RunePoisonStrike"]);
	var POISONS_VS_BOUND = ["PoisonStrike", "DaggerPoison", "ChaosPoison"].concat(seq("ThornPoison", 1, 4));
	var HOLY_FIRE = seq("HolyFire", 1, 5);
	var CHILBLAINS = ["Chilblains", "ChilblainsPermafrostDot"];
	var ARMOR_DEBUFFS = ["ArmorBane", "ReduceArmor", "ReduceArmor20", "ReduceArmor35", "ReduceArmor50", "ShadowReduce20", "ShadowReduce35", "ShadowReduce50"];
	var WEAKENS = ["Enfeeble", "Weakened", "Enfeeble30", "Enfeeble45", "Enfeeble60", "ChaosWeaken"];

	// How each talentstone feeds the math. Values come from the talent calculator, so the
	// two stay in step; the critical-chance stones use the game's own stat values because
	// their tooltips mix "real" and "stat" percentages. DoT stones add "ref × X%" to the
	// DoT's DoTDamage, the way the game does (ref = the DoT strength the percent refers to).
	var TALENT_RULES = {
		"Steadiness": { kind: "crit", game: true },
		"Opportunist": { kind: "crit", cond: "stealth", game: true },
		"Crippling Curse": { kind: "crit", cond: "cursed", game: true },
		"Volatile": { kind: "crit", cond: "ignited", game: true },
		"Element Mastery": { kind: "critRune", rune: "elemental" },
		"Heavy Blows": { kind: "critRune", rune: "heavyBlow" },
		"Hemorrhage": { kind: "critRune", rune: "hemorrhage" },
		"Artery Strike": { kind: "dotFlat", buffs: ["Bleeding"], ref: 0.2, label: "Bleed damage" },
		"Concentrated Venom": { kind: "dotFlat", buffs: POISONS, ref: 1, label: "Poison damage" },
		"Accelerant": { kind: "dotFlat", buffs: ["Burned"], ref: 0.3, label: "Burn damage" },
		"Chilblains": { kind: "dotFlat", buffs: CHILBLAINS, ref: 0.3, label: "Chilblains damage" },
		"Immolation": { kind: "dotFlat", buffs: ["Ignite"], ref: 0.5, label: "Ignite damage" },
		"Doom": { kind: "dotFlat", buffs: ["Bound"], ref: 1, label: "Bind damage" },
		"Smiting Flames": { kind: "dotFlat", buffs: HOLY_FIRE, ref: 1, label: "Holy Fire damage" },
		"Deep Cuts": { kind: "dotStacks", buffs: ["Bleeding"], label: "Bleed" },
		"Napalm": { kind: "dotStacks", buffs: ["Burned"], label: "Burn" },
		"Frost Bite": { kind: "dotStacks", buffs: CHILBLAINS, label: "Chilblains" },
		"Crusading Flames": { kind: "dotStacks", buffs: HOLY_FIRE, label: "Holy Fire" },
		"Pyromania": { kind: "scorchStacks" },
		"Contact Poison": { kind: "dotVs", cond: "bleeding", buffs: POISONS_VS_BLEED },
		"Insidious Poison": { kind: "dotVs", cond: "bound", buffs: POISONS_VS_BOUND },
		"Pounce": { kind: "dmg", cond: "slowed" },
		"Twisted Hex": { kind: "dmg", cond: "bound" },
		"Dominate": { kind: "dmg", cond: "stunned" },
		"Harmony": { kind: "dmg", cond: "afterMaster" },
		"Fury": { kind: "dmg", cond: "afterKill" },
		"Zeal": { kind: "fromExp", stat: "attack" },
		"Conviction": { kind: "fromExp", stat: "defense" },
		"Sanctify": { kind: "fromExp", stat: "defense" },
		"Fervor": { kind: "fromExp", stat: "hp" },
		"Rapid Recovery": { kind: "stat", stat: "tenacity", label: "Tenacity" },
		"Taunt": { kind: "stat", stat: "attackSpeed", label: "Attack Speed (and Hate)" },
		"Ethereal": { kind: "condPct", stats: ["expertise"], cond: "stealth" },
		"Pain Eater": { kind: "condPct", stats: ["attackSpeed", "defense"], cond: "lowHp" },
		"Cursed Sword": { kind: "condPct", stats: ["defense"], cond: "cursed" },
		"Wind Cloak": { kind: "condPct", stats: ["defense"], cond: "bound" },
		"Sentinel Armor": { kind: "condPct", stats: ["defense"], cond: "sentinelReady" },
		"Acid Edge": { kind: "acid" },
		"Piercing Cold": { kind: "shredCond", cond: "frozen" },
		"Corrosive Strikes": { kind: "debuffTime", buffs: ARMOR_DEBUFFS, label: "Armor Bane and Armor Breaker duration" },
		"Hamstring": { kind: "debuffTime", buffs: ["Crippled"], label: "Cripple duration" },
		"Nerve Strike": { kind: "debuffTime", buffs: WEAKENS, label: "Weaken duration" },
		"Daybreak": { kind: "debuffTime", buffs: ["Blinded"], label: "Blind duration" },
		"Intensity": { kind: "debuffTime", buffs: ["Scorched"], label: "Scorch duration" },
		"Lingering Curse": { kind: "debuffTime", buffs: ["Cursed", "MinorCurse"], label: "Curse duration" },
		"Lingering Chill": { kind: "debuffTime", buffs: ["Chilled42"], label: "Chill duration" }
	};

	var DEBUFF_LABELS = {
		ArmorBane: "Armor Bane", Weakened: "Weaken", Crippled: "Cripple", Blinded: "Blindness", Staggered: "Stagger",
		Dazed: "Daze", Chilled42: "Chill", Cursed: "Curse", MinorCurse: "Lich curse", Scorched: "Scorch",
		NovaRank1: "Ice root", RootStrikeRank1: "Entangle", VineLance: "Root", Frigid: "Frigid", Intimidate: "Weaken 75%",
		ChaosWeaken: "Chaos weaken", Sacred: null, FrozenWardDelay: null, LightningBomb: "Lightning bomb",
		PlagueBattalion: null, Infested3: "Infest", MeteorROR10: null, FireBrandRank8: null, HatePulse: null,
		RuneReduceArmor: "Armor Breaker slow", RuneEnfeeble: "Weaken (rune)"
	};

	function data() { return root.DBB_DATA; }

	function encodeChars() {
		var s = "", i;
		for (i = 49; i < 57; i++) s += String.fromCharCode(i);
		for (i = 97; i < 122; i++) s += String.fromCharCode(i);
		for (i = 65; i < 90; i++) s += String.fromCharCode(i);
		return s;
	}
	var ENC = encodeChars();

	/* Talent build string (as used by the talent calculator) -> discipline + sockets. */
	function decodeBuild(str) {
		str = String(str || "").replace(/^#/, "");
		var D = data();
		var disc = parseInt(str.charAt(0), 10);
		if (isNaN(disc)) disc = 3;
		disc = Math.max(0, Math.min(D.disciplines.length - 1, disc));
		var slots = [];
		var slot = 0;
		for (var i = 1; i < str.length; i++) {
			var level = parseInt(str.charAt(i), 10);
			if (level) {
				i++;
				var tid = ENC.indexOf(str.charAt(i));
				if (tid >= 0) slots.push({ slot: slot, level: Math.min(5, level), talentId: tid });
			}
			slot++;
		}
		return { discipline: disc, slots: slots };
	}

	function num(v) { return +v || 0; }

	function parseVal(v) {
		if (Array.isArray(v)) v = v[0];
		var s = String(v == null ? "" : v).trim();
		var n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
		if (isNaN(n)) return 0;
		return s.indexOf("%") >= 0 ? n / 100 : n;
	}

	function calcValue(talent, level, param) {
		var vals = talent.values || [];
		var row = Array.isArray(vals[0]) ? (vals[param || 0] || []) : (param ? [] : vals);
		return parseVal(row[level - 1]);
	}

	function gameValue(name, level) {
		var effect = ((data().talentEffects || {})[name] || [])[0];
		if (!effect) return 0;
		var v = String(effect.values[Math.min(level, effect.values.length) - 1] || "0").split(",")[0];
		var n = parseFloat(v);
		return isNaN(n) ? 0 : n;
	}

	function pct(n, digits) {
		var d = digits == null ? 1 : digits;
		return (Math.round(n * 100 * Math.pow(10, d)) / Math.pow(10, d)) + "%";
	}

	function secs(ms) { return (Math.round(ms / 100) / 10) + " s"; }

	/* ---------------- talents ---------------- */

	function emptyTalentBonuses() {
		return {
			attack: 0, expertise: 0, defense: 0, hp: 0, recovery: 0, tenacity: 0, attackSpeed: 0, critChance: 0,
			critCond: [], critRune: { heavyBlow: 0, hemorrhage: 0, elemental: 0 },
			dotFlat: {}, dotStacks: {}, dotVs: [], dmgCond: [], condPct: [], shredCond: [],
			fromExp: { attack: 0, defense: 0, hp: 0 }, acid: 0, scorchStacks: 0, hemoDebuff: 0, debuffTime: {},
			stones: [], points: 0, conditions: {}
		};
	}

	function condText(cond) { return CONDITIONS[cond].charAt(0).toLowerCase() + CONDITIONS[cond].slice(1); }

	function addTalent(out, talent, level) {
		var name = talent.name;
		var stat = /^(Attack|Defense|Expertise|Health) [IVXL]+$/.exec(name);
		var v;
		if (stat) {
			v = calcValue(talent, level);
			var key = { Attack: "attack", Defense: "defense", Expertise: "expertise", Health: "hp" }[stat[1]];
			out[key] += v;
			return "+" + Math.round(v) + " " + stat[1];
		}
		if (/^(Lesser|Greater|Master) Recovery$/.test(name)) {
			v = calcValue(talent, level);
			out.recovery += v;
			return "+" + pct(v) + " Recovery";
		}
		var rule = TALENT_RULES[name];
		if (!rule) {
			var param = Array.isArray(talent.parameter) ? talent.parameter.join(" / ") : talent.parameter;
			var shown = Array.isArray((talent.values || [])[0])
				? talent.values.map(function (r) { return r[level - 1]; }).join(" / ")
				: (talent.values || [])[level - 1];
			return { info: true, text: param + ": " + (shown || "") };
		}
		v = rule.game ? gameValue(name, level) : calcValue(talent, level);
		switch (rule.kind) {
			case "crit":
				if (rule.cond) {
					out.critCond.push({ source: name, value: v, cond: rule.cond });
					out.conditions[rule.cond] = true;
					return "+" + pct(v, 0) + " Critical Chance stat when " + condText(rule.cond);
				}
				out.critChance += v;
				return "+" + pct(v, 0) + " Critical Chance stat";
			case "critRune":
				out.critRune[rule.rune] += v;
				var label = { heavyBlow: "Heavy Blow", hemorrhage: "Hemorrhage", elemental: "elemental critical" }[rule.rune] + " damage";
				if (rule.rune === "hemorrhage") {
					var debuff = calcValue(talent, level, 1);
					if (debuff) {
						out.hemoDebuff += debuff;
						out.conditions.hemorrhaging = true;
						return "+" + pct(v) + " " + label + ", −" + pct(debuff, 2) + " target Defense while it has Hemorrhage";
					}
				}
				return "+" + pct(v) + " " + label;
			case "dotFlat":
				rule.buffs.forEach(function (b) { out.dotFlat[b] = (out.dotFlat[b] || 0) + v * rule.ref; });
				return "+" + pct(v) + " " + rule.label;
			case "dotStacks":
				rule.buffs.forEach(function (b) { out.dotStacks[b] = (out.dotStacks[b] || 0) + v; });
				return "+" + v + " max " + rule.label + " stacks";
			case "scorchStacks":
				out.scorchStacks += v;
				return "+" + v + " max Scorch stacks";
			case "dotVs":
				out.dotVs.push({ source: name, value: v, cond: rule.cond, targets: rule.buffs });
				out.conditions[rule.cond] = true;
				return "+" + pct(v) + " poison damage when " + condText(rule.cond);
			case "dmg":
				out.dmgCond.push({ source: name, value: v, cond: rule.cond });
				out.conditions[rule.cond] = true;
				return "+" + pct(v) + " damage when " + condText(rule.cond);
			case "fromExp":
				out.fromExp[rule.stat] += v;
				return "+" + pct(v) + " of Expertise as " + { attack: "Attack", defense: "Defense", hp: "max HP" }[rule.stat];
			case "stat":
				out[rule.stat] += v;
				return "+" + pct(v) + " " + rule.label;
			case "condPct":
				out.condPct.push({ source: name, value: v, cond: rule.cond, stats: rule.stats });
				out.conditions[rule.cond] = true;
				return "+" + pct(v) + " " + rule.stats.map(function (s) { return { expertise: "Expertise", defense: "Defense", attackSpeed: "Attack Speed" }[s]; }).join(" and ") + " when " + condText(rule.cond);
			case "acid":
				out.acid += v * ARMOR_BANE_PER_STACK;
				return "+" + pct(v) + " Armor Bane and Armor Breaker effect";
			case "shredCond":
				out.shredCond.push({ source: name, value: v, cond: rule.cond });
				out.conditions[rule.cond] = true;
				return "−" + pct(v) + " target Defense when " + condText(rule.cond);
			case "debuffTime":
				rule.buffs.forEach(function (b) { out.debuffTime[b] = (out.debuffTime[b] || 0) + v * 1000; });
				return "+" + v + " s " + rule.label;
		}
		return "";
	}

	function talentBonuses(build, disc) {
		var out = emptyTalentBonuses();
		var tdata = (root.DBCALC_TALENT_DATA || {})[disc.key] || {};
		var talents = tdata.talents || [];
		build.slots.forEach(function (s) {
			var t = talents[s.talentId];
			if (!t) return;
			out.points += s.level;
			var effect = addTalent(out, t, s.level);
			out.stones.push({
				slot: s.slot, name: t.name, level: s.level,
				text: typeof effect === "string" ? effect : effect.text,
				info: typeof effect === "object" && effect.info
			});
		});
		return out;
	}

	/* ---------------- gear, charms ---------------- */

	function rarityOf(key) {
		var list = data().gear.rarities;
		for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
		return list[list.length - 1];
	}

	function emptyGear() {
		var el = {};
		data().elements.forEach(function (e) { el[e] = 0; });
		return {
			attack: 0, expertise: 0, defense: 0, critChance: 0, critPower: 0, attackSpeed: 0, hpPct: 0,
			tenacity: 0, recovery: 0, slay: Object.assign({}, el), resist: Object.assign({}, el),
			gearFind: 0, goldFind: 0, materialFind: 0, moveSpeed: 0, critRunes: [], skillRunes: [], perSlot: {}
		};
	}

	function gearBonuses(state, cls) {
		var D = data();
		var out = emptyGear();
		var magicByKey = {};
		D.gear.magicRunes.forEach(function (m) { magicByKey[m.key] = m; });
		D.gear.slots.forEach(function (slot) {
			var s = (state.gear || {})[slot.key] || {};
			var rarity = rarityOf(s.rarity);
			var focus = s.focus || "Balanced";
			var stats = ((D.gear.stats[cls] || {})[slot.type] || {})[focus];
			stats = (stats && stats[rarity.key]) || { attack: 0, expertise: 0, defense: 0 };
			out.perSlot[slot.key] = stats;
			if (state.gearMode !== "totals") {
				out.attack += stats.attack;
				out.expertise += stats.expertise;
				out.defense += stats.defense;
			}
			var allowed = D.gear.procOptions[slot.type] || [];
			(s.runes || []).slice(0, rarity.procSlots).forEach(function (rk) {
				if (!rk || allowed.indexOf(rk) < 0) return;
				var r = D.runes[rk];
				if (!r) return;
				if (r.kind === "crit") { out.critRunes.push(rk); return; }
				if (r.stat === "slay" || r.stat === "resist") { out[r.stat][r.element] += r.value; return; }
				out[r.stat] += r.value;
			});
			var skillAllowed = ((D.gear.skillRuneOptions[cls] || {})[slot.type]) || [];
			if (rarity.skillRune && s.skillRune && skillAllowed.indexOf(s.skillRune) >= 0) out.skillRunes.push(s.skillRune);
			var m = magicByKey[s.magic];
			if (m) {
				out.gearFind += m.gearFind;
				out.goldFind += m.goldFind;
				out.materialFind += m.materialFind;
				if (m.speed) out.moveSpeed += MOVE_SPEED_PER_RUNE;
			}
		});
		if (state.gearMode === "totals") {
			var t = state.gearTotals || {};
			out.attack = num(t.attack);
			out.expertise = num(t.expertise);
			out.defense = num(t.defense);
		}
		return out;
	}

	function charmBonuses(state) {
		var out = { hp: 0, attack: 0, expertise: 0, defense: 0, critChance: 0, critPower: 0, gearFind: 0, goldFind: 0, materialFind: 0, count: 0 };
		data().charms.forEach(function (c) {
			var n = Math.max(0, Math.floor(num((state.charms || {})[c.key])));
			out.count += n;
			out[c.stat] += n * c.value;
		});
		return out;
	}

	/* ---------------- stats ---------------- */

	function condPctSum(tal, stat, conds) {
		var sum = 0;
		tal.condPct.forEach(function (c) { if (conds[c.cond] && c.stats.indexOf(stat) >= 0) sum += c.value; });
		return sum;
	}

	function finalStats(base, gear, ch, tal, ex, conds) {
		var expBase = base.expertise + gear.expertise + ch.expertise + tal.expertise + num(ex.expertise);
		var expPct = condPctSum(tal, "expertise", conds);
		var expertise = Math.round(expBase * (1 + expPct));
		var atkFromExp = Math.ceil(expertise * tal.fromExp.attack);
		var attack = base.attack + gear.attack + ch.attack + tal.attack + num(ex.attack) + atkFromExp;
		var defFromExp = Math.ceil(expertise * tal.fromExp.defense);
		var defBase = base.defense + gear.defense + ch.defense + tal.defense + num(ex.defense) + defFromExp;
		var defPct = condPctSum(tal, "defense", conds);
		var defense = Math.round(defBase * (1 + defPct));
		var hpFromExp = Math.ceil(expertise * tal.fromExp.hp);
		var hpFlat = base.hp + ch.hp + tal.hp + num(ex.hp) + hpFromExp;
		var hp = Math.round(hpFlat * (1 + gear.hpPct));
		var attackSpeed = gear.attackSpeed + tal.attackSpeed + num(ex.attackSpeed) / 100 + condPctSum(tal, "attackSpeed", conds);
		return {
			hp: hp, attack: attack, expertise: expertise, defense: defense, attackSpeed: attackSpeed,
			parts: {
				hp: { base: base.hp, charms: ch.hp, talents: tal.hp, extra: num(ex.hp), fromExpertise: hpFromExp, percent: gear.hpPct },
				attack: { base: base.attack, gear: gear.attack, charms: ch.attack, talents: tal.attack, extra: num(ex.attack), fromExpertise: atkFromExp },
				expertise: { base: base.expertise, gear: gear.expertise, charms: ch.expertise, talents: tal.expertise, extra: num(ex.expertise), situational: expertise - expBase },
				defense: { base: base.defense, gear: gear.defense, charms: ch.defense, talents: tal.defense, extra: num(ex.defense), fromExpertise: defFromExp, situational: defense - defBase }
			}
		};
	}

	/* ---------------- critical hits ---------------- */

	function critRuneDamage(runeKey, targetEl, tal, critPower) {
		var r = data().runes[runeKey];
		if (!r) return null;
		if (r.heal) return { key: runeKey, name: r.name, pct: 0, heal: true, note: "heals, no damage" };
		var base, bonus, note = "";
		if (r.element) {
			if (!targetEl) { base = 50; note = "neutral target"; }
			else if (targetEl === r.element) { base = 25; note = "target resists " + r.element; }
			else if (OPPOSITE[r.element] === targetEl) { base = 100; note = "target weak to " + r.element; }
			else { base = 50; note = "neutral target"; }
			bonus = tal.critRune.elemental;
		} else if (runeKey === "ProcMassive") { base = r.critPct; bonus = tal.critRune.heavyBlow; }
		else { base = r.critPct; bonus = tal.critRune.hemorrhage; note = "3 ticks of " + pct(base / 300 * (1 + bonus), 1) + ", up to 3 stacks"; }
		var fromPower = critPower * 100 * 0.5;
		return { key: runeKey, name: r.name, base: base, talentBonus: bonus, fromPower: fromPower,
			pct: base * (1 + bonus) + fromPower, note: note };
	}

	function critModel(gear, ch, tal, ex, targetEl, recovery) {
		var stat = gear.critChance + ch.critChance + tal.critChance + num(ex.critChance) / 100;
		var power = gear.critPower + ch.critPower + num(ex.critPower) / 100;
		var runes = gear.critRunes.map(function (k) { return critRuneDamage(k, targetEl, tal, power); }).filter(Boolean);
		var dmgPct = runes.reduce(function (a, r) { return a + (r.heal ? 0 : r.pct); }, 0);
		var heals = [];
		gear.critRunes.forEach(function (k) {
			if (k === "ProcHeal") heals.push({ key: k, name: "Mending Blow", pct: 100 + power * 100 * 0.5, note: "instant; boosted by Critical Power, not by Recovery" });
			if (k === "ProcHealTime") heals.push({ key: k, name: "Renew", pct: 125 * (1 + recovery), note: "5 ticks of 25%; boosted by Recovery, not by Critical Power" });
		});
		function statWith(conds) {
			var s = stat;
			tal.critCond.forEach(function (c) { if (conds[c.cond]) s += c.value; });
			return s;
		}
		function chance(conds) { return Math.min(1, BASE_CRIT * (1 + statWith(conds))); }
		return {
			stat: stat, power: power, runes: runes, dmgPct: dmgPct, heals: heals,
			hasHemorrhage: gear.critRunes.indexOf("ProcMassiveTime") >= 0,
			chance: chance,
			factor: function (conds) { return 1 + chance(conds) * dmgPct / 100; },
			statWith: statWith
		};
	}

	/* ---------------- direct damage, DoTs ---------------- */

	// debuffs: { armorBane, breaks: [..], others: [..], scorch, hemoUptime }
	function directMultiplier(env, conds, debuffs) {
		var tal = env.tal;
		var shred = Math.min(ARMOR_BANE_MAX, debuffs.armorBane || 0) * (ARMOR_BANE_PER_STACK + tal.acid);
		var breaks = (debuffs.breaks || []).slice().sort(function (a, b) { return b - a; });
		var distinct = breaks.filter(function (v, i) { return breaks.indexOf(v) === i; }).slice(0, 2);
		distinct.forEach(function (v) { shred += v + tal.acid; });
		(debuffs.others || []).forEach(function (v) { shred += v; });
		tal.shredCond.forEach(function (c) { if (conds[c.cond]) shred += c.value; });
		if (tal.hemoDebuff) shred += tal.hemoDebuff * (conds.hemorrhaging ? 1 : (debuffs.hemoUptime || 0));
		var scorch = Math.min(SCORCH_BASE_MAX + tal.scorchStacks, debuffs.scorch || 0) * 0.01;
		var condDmg = 0;
		tal.dmgCond.forEach(function (c) { if (conds[c.cond]) condDmg += c.value; });
		return (1 + env.slay) * (1 - env.reduction) * (1 + condDmg) * (1 + shred) * (1 + scorch);
	}

	var kindMapCache = null;
	function buffKindMap() {
		if (kindMapCache && kindMapCache.src === data()) return kindMapCache.map;
		var map = {};
		var dots = data().dots;
		Object.keys(dots).forEach(function (k) { dots[k].buffs.forEach(function (b) { map[b] = k; }); });
		kindMapCache = { src: data(), map: map };
		return map;
	}

	function makeDotBase(expertise, tal) {
		var dots = data().dots;
		var kinds = buffKindMap();
		var cache = {};
		return function (buff) {
			if (cache[buff] !== undefined) return cache[buff];
			var kindKey = kinds[buff];
			if (!kindKey) return (cache[buff] = null);
			var kind = dots[kindKey];
			var pb = kind.perBuff[buff];
			var factor = kind.xmlTickPct ? kind.tickPct / kind.xmlTickPct : 1;
			var talentPct = (tal.dotFlat[buff] || 0) * 1.5 / pb.ticks * 100 * factor;
			var rank = /(\d+)$/.exec(buff);
			var perTick = expertise * (pb.tickPct + talentPct) / 100;
			return (cache[buff] = {
				buff: buff, kind: kindKey, kindName: kind.name,
				name: kind.name + (kind.rankedFrom && rank ? " (rank " + rank[1] + ")" : (buff !== kind.buffs[0] ? " (" + buff + ")" : "")),
				basePct: pb.tickPct, talentPct: talentPct, ticks: pb.ticks, maxStacks: pb.stacks + (tal.dotStacks[buff] || 0),
				poison: !!kind.poison, lifesteal: !!kind.lifesteal, source: kind.source,
				perTick: perTick, perStackTotal: perTick * pb.ticks
			});
		};
	}

	function dotVsMult(tal, buff, conds) {
		var m = 1;
		var notes = [];
		tal.dotVs.forEach(function (e) {
			if (e.targets.indexOf(buff) >= 0 && conds[e.cond]) { m *= 1 + e.value; notes.push(e.source); }
		});
		return { mult: m, notes: notes };
	}

	function skillRuneEffects(keys) {
		var D = data();
		var fx = { multAdd: {}, appends: {}, replaces: {}, dotFlat: {}, buffTime: {}, notes: [] };
		keys.forEach(function (k) {
			var r = D.skillRunes[k];
			if (!r) return;
			fx.notes.push(r.name + ": " + r.desc);
			if (r.type === "Power" && r.prop === "BaseDamageMult") {
				var add = parseFloat(r.value) || 0;
				r.targets.forEach(function (p) { fx.multAdd[p] = (fx.multAdd[p] || 0) + add; });
			} else if (r.type === "Power" && r.prop === "AddTargetBuff") {
				String(r.value).split(",").forEach(function (part) {
					var m = /^Append:(.+)$/.exec(part.trim());
					var rp = /^Replace:(.+)=(.+)$/.exec(part.trim());
					r.targets.forEach(function (p) {
						if (m) (fx.appends[p] = fx.appends[p] || []).push(m[1]);
						if (rp) (fx.replaces[p] = fx.replaces[p] || {})[rp[1]] = rp[2];
					});
				});
			} else if (r.type === "Buff" && r.prop === "DoTDamage") {
				var v = parseFloat(r.value) || 0;
				r.targets.forEach(function (b) { fx.dotFlat[b] = (fx.dotFlat[b] || 0) + v; });
			} else if (r.type === "Buff" && r.prop === "Duration") {
				var ms = parseFloat(r.value) || 0;
				r.targets.forEach(function (b) { fx.buffTime[b] = (fx.buffTime[b] || 0) + ms; });
			}
		});
		return fx;
	}

	/* ---------------- skills ---------------- */

	function baseName(power) { return String(power).replace(/\d+$/, ""); }

	function debuffLabel(name) {
		if (Object.prototype.hasOwnProperty.call(DEBUFF_LABELS, name)) return DEBUFF_LABELS[name];
		var meta = (data().targetBuffs || {})[name];
		if (/^(StunStrike|ShieldStun|RuneStunStrike)/.test(name)) return "Stun";
		if (/^Freeze/.test(name)) return "Freeze";
		if (/^(ReduceArmor|ShadowReduce)/.test(name)) return "Armor Breaker " + pct(-(meta ? meta.defense : -0.2), 0);
		if (/^Warcry/.test(name)) return "Demoralize";
		if (meta && meta.defense < 0) return "Defense −" + pct(-meta.defense, 0);
		if (meta && meta.damage < 0) return "Weaken " + pct(-meta.damage, 0);
		if (/^Rune/.test(name)) return name.slice(4) + " (rune)";
		if (meta && meta.effect) return meta.effect;
		if (meta && meta.speed < 0) return "Slow";
		return name;
	}

	function stackCap(name, tal) {
		if (name === "ArmorBane") return ARMOR_BANE_MAX;
		if (name === "Scorched") return SCORCH_BASE_MAX + (tal ? tal.scorchStacks : 0);
		var meta = (data().targetBuffs || {})[name];
		return (meta && meta.stacks) || 1;
	}

	// Labels for the debuffs one cast leaves on the target, capped at each debuff's stack limit.
	function effectLabels(debuffs, tal) {
		var counts = {};
		var order = [];
		Object.keys(debuffs).forEach(function (b) {
			var label = debuffLabel(b);
			if (!label) return;
			if (!(label in counts)) { counts[label] = 0; order.push(label); }
			counts[label] += Math.min(debuffs[b], stackCap(b, tal));
		});
		return order.map(function (l) { return counts[l] > 1 ? l + " ×" + counts[l] : l; });
	}

	function overrideText(info) {
		var n = info.mults.length;
		return (n > 1 ? n + " hits of " : "") + Math.round(info.mults[0] * 100) + "% Attack";
	}

	function selfLabel(sb) {
		if (sb.stealth) return "Stealth until your next attack";
		var parts = [];
		if (sb.melee) parts.push("+" + pct(sb.melee, 0) + " Attack");
		if (sb.magic) parts.push("+" + pct(sb.magic, 0) + " Expertise");
		var ov = sb.meleeOverride || sb.rangedOverride;
		if (ov) parts.push("basic attacks hit for " + overrideText(ov));
		var text = parts.join(", ");
		if (sb.onDamage) text += " on hit";
		return text + (sb.durationMs ? " for " + secs(sb.durationMs) : " until it ends");
	}

	// Hallowed Reckoning puts holy fire on the target with every tick from rank 5.
	function hallowedExtra(ability, r, p) {
		if (ability.ability !== "FountainOfLife" || r.rank < HALLOWED_FIRE_RANK || p.target !== "Aura") return null;
		var e = {};
		e[HALLOWED_FIRE_BUFF] = 1;
		return e;
	}

	/*
	 * Target buffs one cast of a power part lands, as [{ at, dots, debuffs }] with `at` in ms
	 * from the part's start. The power's rule says which pulses carry its buff list: every
	 * pulse, the first, the last, a sequence, or every third basic attack (counted once here).
	 */
	function applicationsOf(p, runes, extra) {
		var pbase = baseName(p.power);
		var ap = p.apply;
		var replaces = runes.replaces[pbase] || {};
		var appends = runes.appends[pbase] || [];
		var pulses = p.pulseAt || p.hitAt || [];
		var out = [];
		function rename(map) {
			var o = {};
			Object.keys(map || {}).forEach(function (k) { var rk = replaces[k] || k; o[rk] = (o[rk] || 0) + map[k]; });
			return o;
		}
		var rule = ap ? ap.rule : "every";
		var first = pulses.length ? [pulses[0]] : [];
		var last = pulses.length ? [pulses[pulses.length - 1]] : [];
		var times = rule === "first" || rule === "third" ? first : (rule === "last" ? last : pulses);
		if (ap) {
			if (rule === "seq") ap.steps.forEach(function (st, i) { if (i < pulses.length) out.push({ at: pulses[i], dots: rename(st.dots), debuffs: rename(st.debuffs) }); });
			else times.forEach(function (t) { out.push({ at: t, dots: rename(ap.dots), debuffs: rename(ap.debuffs) }); });
		}
		if (appends.length) {
			var kinds = buffKindMap();
			var dd = {}, db = {};
			appends.forEach(function (b) { if (kinds[b]) dd[b] = (dd[b] || 0) + 1; else db[b] = (db[b] || 0) + 1; });
			(rule === "seq" || !times.length ? (pulses.length ? pulses : [0]) : times).forEach(function (t) {
				out.push({ at: t, dots: Object.assign({}, dd), debuffs: Object.assign({}, db) });
			});
		}
		if (extra) (p.hitAt || []).forEach(function (t) { out.push({ at: t, dots: Object.assign({}, extra), debuffs: {} }); });
		return out;
	}

	function rankOf(ability, rank) {
		var ranks = ability.ranks;
		return ranks[Math.min(Math.max(rank, 1), ranks.length) - 1];
	}

	// Spawned explosions (Decoy, Permafrost Clone, Shadow Legion) go off on their own:
	// they do not keep you busy.
	function locksCaster(p) { return !/Explode/.test(p.power); }

	function stepTime(ability, rank) {
		var r = rankOf(ability, rank);
		var parts = [r].concat(r.chain || []);
		return parts.reduce(function (a, p) { return a + (locksCaster(p) ? (p.busyMs || 0) : 0); }, 0);
	}

	function computeSkill(ability, rank, ctx) {
		var r = rankOf(ability, rank);
		var parts = [r].concat(r.chain || []);
		var res = { ability: ability.ability, name: ability.name, desc: ability.desc, hotbar: ability.hotbar,
			rank: r.rank, hits: 0, perHit: [], direct: 0, expected: 0, dot: 0, dots: [], effects: [], selfEffects: [],
			runeBoost: 0, reflect: null, castMs: stepTime(ability, rank), cooldownMs: r.cooldownMs || 0,
			mana: r.mana || 0, masterMana: !!r.masterMana };
		var dotApps = {};
		var debuffApps = {};
		var dotOrder = [];
		parts.forEach(function (p) {
			var add = ctx.runes.multAdd[baseName(p.power)] || 0;
			if (add && p.mults.length) res.runeBoost += add;
			p.mults.forEach(function (m) {
				var hit = ctx.attack * (m + add) * ctx.directMult;
				res.hits += 1;
				res.perHit.push(hit);
				res.direct += hit;
				res.expected += hit * (p.noCrit ? 1 : ctx.critFactor);
			});
			applicationsOf(p, ctx.runes, hallowedExtra(ability, r, p)).forEach(function (ev) {
				Object.keys(ev.dots).forEach(function (b) {
					if (!(b in dotApps)) { dotApps[b] = 0; dotOrder.push(b); }
					dotApps[b] += ev.dots[b];
				});
				Object.keys(ev.debuffs).forEach(function (b) { debuffApps[b] = (debuffApps[b] || 0) + ev.debuffs[b]; });
			});
			(p.self || []).forEach(function (sb) { res.selfEffects.push(selfLabel(sb)); });
		});
		dotOrder.forEach(function (b) {
			var d = ctx.dot(b);
			if (!d) return;
			var vs = dotVsMult(ctx.tal, b, ctx.conds);
			var stacks = Math.min(dotApps[b], d.maxStacks);
			var amount = stacks * d.perStackTotal * vs.mult;
			res.dot += amount;
			res.dots.push({ buff: b, name: d.name, stacks: stacks, applied: dotApps[b], amount: amount, lifesteal: d.lifesteal });
		});
		res.effects = effectLabels(debuffApps, ctx.tal);
		if (ability.ability === "Retribution") {
			var i = r.rank - 1;
			var perHit = ctx.expertise * RETRIBUTION.pct[i] / 100;
			res.reflect = { pct: RETRIBUTION.pct[i], perHit: perHit, hits: RETRIBUTION.hits[i], max: perHit * RETRIBUTION.hits[i], estimated: RETRIBUTION.estimated[i] };
		}
		var reflect = res.reflect ? res.reflect.max : 0;
		res.total = res.expected + res.dot + reflect;
		res.directShare = res.total ? res.expected / res.total : 0;
		res.kind = res.total ? (res.dot && res.expected ? "mixed" : (res.expected ? "direct" : "expertise")) : "utility";
		return res;
	}

	/* ---------------- combos ---------------- */

	function abilitiesFor(disc) {
		var D = data();
		return (D.skills[disc.cls] || []).concat(D.skills[disc.master] || []).filter(function (a) { return a.hotbar >= 1; });
	}

	// Mages fight with their discipline's ranged basic, everyone else with the melee chain.
	function basicFor(disc) {
		var D = data();
		if (disc.cls === "Mage") {
			var ranged = (D.skills[disc.master] || []).filter(function (a) { return a.hotbar === 0; })[0];
			if (ranged) return { name: ranged.name, info: ranged.ranks[0], ranged: true };
		}
		var melee = (D.skills.Any || [])[0];
		return { name: "Basic attack", info: melee ? melee.ranks[0] : { power: "SwordMelee", mults: [1], hitAt: [65], busyMs: 500, target: "MeleeCombo", noCrit: true }, ranged: false };
	}

	// The 3-hit basic chain only crits on its third hit; overrides that allow procs crit on every hit.
	function basicCanCrit(info, third) {
		if (!info.noCrit) return true;
		return (info.target === "MeleeCombo" || info.target === "ProjectileCombo") && third;
	}

	/*
	 * Plays a combo on loop for `windowS` seconds against one target. Debuffs from earlier
	 * steps (Armor Bane, Armor Breaker, Scorch, curses, slows, stuns) boost later hits, DoT
	 * stacks build, refresh and tick once a second, and conditional talents switch on when
	 * their target state is present. Buffs on yourself (Berserker, Chaos Wave, Ghost Blade)
	 * and basic-attack overrides (Cleaving Blows, Verdict, Sentinel Form, Pyromania, Meteor)
	 * apply for their duration. Crits use the average multiplier. Attack speed only speeds
	 * up basic attacks, as in the game. Mana is not limited; cooldowns are waited out with
	 * basic attacks.
	 */
	function simulateCombo(steps, env, windowS, manaLimited) {
		var D = data();
		var limited = !!manaLimited;
		var mp = MANA_MAX;
		var mmp = MASTER_MANA_MAX;
		var W = Math.max(5, Math.min(120, windowS || DEFAULT_WINDOW_S)) * 1000;
		var basicSpeed = 1 + Math.max(-0.5, env.attackSpeed);
		var byKey = {};
		env.abilities.forEach(function (a) { byKey[a.ability] = a; });
		var resolved = (steps || []).map(function (k) {
			if (k === "basic") return { basic: true, key: "basic" };
			return byKey[k] ? { key: k, ability: byKey[k] } : null;
		}).filter(Boolean);
		if (!resolved.length) return null;
		var names = { basic: env.basic.name };
		env.abilities.forEach(function (a) { names[a.ability] = a.name; });

		var events = [];
		var seqNo = 0;
		function push(ev) { ev.seq = seqNo++; events.push(ev); }

		// Buffs on yourself, as time intervals; a recast refreshes rather than stacks.
		var selfIv = [];
		function addSelf(sb, at, source) {
			if (sb.stealth) { push({ t: at, type: "stealth", key: source }); return; }
			var dur = sb.durationMs ? sb.durationMs + env.buffTime(sb.buff) : Infinity;
			for (var i = selfIv.length - 1; i >= 0; i--) {
				var iv = selfIv[i];
				if (iv.sb.buff === sb.buff && iv.end >= at) {
					iv.end = Math.max(iv.end, at + dur);
					iv.castAt = at;
					return;
				}
			}
			selfIv.push({ start: at, end: at + dur, castAt: at, sb: sb, source: source });
		}
		// The most recently cast override is the one your basic attacks use.
		function overrideAt(at) {
			var best = null;
			selfIv.forEach(function (iv) {
				var o = env.basic.ranged ? iv.sb.rangedOverride : iv.sb.meleeOverride;
				if (o && iv.start <= at && at < iv.end && iv.castAt <= at && (!best || iv.castAt >= best.castAt)) best = { castAt: iv.castAt, info: o, source: iv.source };
			});
			return best;
		}
		// Attack buffs count for hits after they start; Expertise buffs for DoTs applied from that moment.
		function selfMods(at) {
			var m = { melee: 0, magic: 0 };
			selfIv.forEach(function (iv) {
				if (at >= iv.end) return;
				if (iv.start < at) m.melee += iv.sb.melee || 0;
				if (iv.start <= at) m.magic += iv.sb.magic || 0;
			});
			return m;
		}

		var chain = 0;   // position in the 3-hit basic chain; using a skill restarts it
		function scheduleBasic(at) {
			var ov = overrideAt(at);
			// An override that costs master mana drops back to the plain attack when it runs out.
			if (ov && limited && ov.info.mana && ov.info.masterMana && mmp < ov.info.mana) ov = null;
			var info = ov ? ov.info : env.basic.info;
			if (limited) {
				if (ov && ov.info.mana) {
					if (ov.info.masterMana) mmp -= ov.info.mana;
					else mp = Math.max(0, mp - ov.info.mana);
				}
				mp = Math.min(MANA_MAX, mp + (info.manaGain || 0) * Math.max(1, info.mults.length));
			}
			var key = ov ? ov.source : "basic";
			var third = chain % 3 === 2;
			var add = env.runes.multAdd[baseName(info.power)] || 0;
			info.mults.forEach(function (m, i) {
				push({ t: at + (info.hitAt[i] || 0) / basicSpeed, type: "hit", key: key, mult: m + add, crit: basicCanCrit(info, third) });
			});
			applicationsOf(info, env.runes).forEach(function (ev) {
				if (info.apply && info.apply.rule === "third" && !third) return;
				push({ t: at + ev.at / basicSpeed, type: "buffs", key: key, dots: ev.dots, debuffs: ev.debuffs });
			});
			chain++;
			return { ms: Math.max(MIN_STEP_MS, info.busyMs || 0) / basicSpeed, key: key, override: !!ov };
		}

		var harmonyFrom = -1;
		function scheduleSkill(st, at) {
			var a = st.ability;
			var r = rankOf(a, env.rank);
			var parts = [r].concat(r.chain || []);
			var harmony = false;
			if (a.hotbar >= 4) harmonyFrom = at;
			else if (a.hotbar >= 1 && harmonyFrom >= 0 && at - harmonyFrom <= HARMONY_MS) { harmony = true; harmonyFrom = -1; }
			var start = at;
			var labels = [];
			function label(l) { if (l && labels.indexOf(l) < 0) labels.push(l); }
			parts.forEach(function (p) {
				var add = env.runes.multAdd[baseName(p.power)] || 0;
				p.mults.forEach(function (m, i) {
					push({ t: start + (p.hitAt[i] || 0), type: "hit", key: a.ability, mult: m + add, crit: !p.noCrit, harmony: harmony });
				});
				var dcount = {}, bcount = {};
				applicationsOf(p, env.runes, hallowedExtra(a, r, p)).forEach(function (ev) {
					push({ t: start + ev.at, type: "buffs", key: a.ability, dots: ev.dots, debuffs: ev.debuffs });
					Object.keys(ev.dots).forEach(function (b) { dcount[b] = (dcount[b] || 0) + ev.dots[b]; });
					Object.keys(ev.debuffs).forEach(function (b) { bcount[b] = (bcount[b] || 0) + ev.debuffs[b]; });
				});
				effectLabels(bcount, env.tal).forEach(label);
				Object.keys(dcount).forEach(function (b) {
					var d = env.dot(b);
					if (d) label(d.kindName + " ×" + Math.min(dcount[b], d.maxStacks));
				});
				(p.self || []).forEach(function (sb) { addSelf(sb, start + (p.selfAt || 0), a.ability); label(selfLabel(sb)); });
				if (locksCaster(p)) start += p.busyMs || 0;
			});
			chain = 0;
			return labels;
		}

		var t = 0;
		var loops = 0;
		var casts = 0;
		var waitMs = 0;
		var firstPassMs = 0;
		var mana = 0;
		var masterMana = 0;
		var cooldownReady = {};
		var castCount = {};
		var skipped = {};
		var noMana = {};
		var manaWaitMs = 0;
		var timeline = [];
		var guard = 0;
		var END = W - 1e-6;   // ignore float drift when steps add up to exactly the window
		while (t < END && guard++ < 4000) {
			var acted = 0;
			for (var i = 0; i < resolved.length && t < END; i++) {
				var st = resolved[i];
				if (st.basic) {
					var b = scheduleBasic(t);
					if (loops === 0) timeline.push({ key: "basic", name: b.override ? names[b.key] + " basic attack" : env.basic.name, start: t, ms: b.ms, effects: [], basic: true });
					t += b.ms;
					acted++;
					continue;
				}
				// A skill still on cooldown is skipped this time round, as a player would.
				if (t < (cooldownReady[st.key] || 0)) {
					skipped[st.key] = (skipped[st.key] || 0) + 1;
					continue;
				}
				var r = rankOf(st.ability, env.rank);
				var cost = limited ? (r.mana || 0) : 0;
				if (cost && r.masterMana && mmp < cost) {
					// Master mana only refills by spending mana on other skills.
					noMana[st.key] = (noMana[st.key] || 0) + 1;
					continue;
				}
				if (cost && !r.masterMana && mp < cost) {
					var manaStart = t;
					while (mp < cost && t < END) {
						var mb = scheduleBasic(t);
						t += mb.ms;
						manaWaitMs += mb.ms;
					}
					if (loops === 0 && t > manaStart) timeline.push({ key: "mana", name: "Basic attacks to build mana for " + st.ability.name, start: manaStart, ms: t - manaStart, effects: [], basic: true });
					if (t >= END) break;
				}
				if (cost) {
					if (r.masterMana) mmp -= cost;
					else {
						mp -= cost;
						mmp = Math.min(MASTER_MANA_MAX, mmp + cost * MASTER_MANA_RATIO);
					}
				}
				acted++;
				var effects = scheduleSkill(st, t);
				var dur = Math.max(MIN_STEP_MS, stepTime(st.ability, env.rank));
				if (loops === 0) {
					timeline.push({ key: st.key, name: st.ability.name, start: t, ms: dur, effects: effects, master: st.ability.hotbar >= 4, hotbar: st.ability.hotbar });
					if (r.masterMana) masterMana += r.mana || 0; else mana += r.mana || 0;
				}
				if (r.cooldownMs) cooldownReady[st.key] = t + r.cooldownMs;
				castCount[st.key] = (castCount[st.key] || 0) + 1;
				t += dur;
				casts++;
			}
			if (!acted && t < END) {
				// Everything in the combo is on cooldown: basic attacks until something is ready.
				var w = scheduleBasic(t);
				t += w.ms;
				waitMs += w.ms;
			}
			loops++;
			if (loops === 1) firstPassMs = t;
		}

		var PRIORITY = { hit: 0, buffs: 1, stealth: 2 };
		events.sort(function (a, b) { return a.t - b.t || PRIORITY[a.type] - PRIORITY[b.type] || a.seq - b.seq; });

		// Target state while the combo plays.
		var meta = D.targetBuffs || {};
		var debuffs = {};   // name -> { stacks, expiry }
		var dots = {};      // buff -> { stacks: [{ src, mult }], expiry, next }
		var critTimes = [];
		var bySkill = {};
		var byType = {};
		var total = 0;
		var permStealth = !!env.selfConds.stealth;
		var stealthOn = false;
		var stealthHitT = -1;
		var etherealPct = condPctSum(env.tal, "expertise", { stealth: true });
		var samples = {};
		var sampleCount = 0;
		var nextSample = 0;

		function credit(key, field, amount) {
			if (!bySkill[key]) bySkill[key] = { key: key, direct: 0, crit: 0, dot: 0 };
			bySkill[key][field] += amount;
			total += amount;
		}
		function addType(label, amount) { byType[label] = (byType[label] || 0) + amount; }
		function active(name, at) { var d = debuffs[name]; return d && d.expiry > at && d.stacks > 0 ? d : null; }

		function targetConds(at) {
			var c = Object.assign({}, env.selfConds);
			Object.keys(debuffs).forEach(function (name) {
				if (!active(name, at)) return;
				var m = meta[name] || {};
				if (name === "Cursed" || name === "MinorCurse") c.cursed = true;
				if (m.speed < 0 || /Frozen|Rooted|Stunned/.test(m.effect || "")) c.slowed = true;
				if (/Stunned/.test(m.effect || "") || name === "Staggered" || /^Warcry/.test(name)) c.stunned = true;
				if (/Frozen/.test(m.effect || "")) c.frozen = true;
			});
			Object.keys(dots).forEach(function (b) {
				var d = dots[b];
				if (!d.stacks.length || d.expiry <= at) return;
				if (b === "Bleeding") c.bleeding = true;
				if (b === "Bound") c.bound = true;
				if (b === "Ignite") c.ignited = true;
				if (b === "HailstoneRoot") c.slowed = true;
			});
			return c;
		}

		function targetDebuffs(at) {
			var out = { armorBane: 0, breaks: [], others: [], scorch: 0, hemoUptime: 0 };
			Object.keys(debuffs).forEach(function (name) {
				var d = active(name, at);
				if (!d) return;
				var m = meta[name] || {};
				if (name === "ArmorBane") out.armorBane = d.stacks;
				else if (name === "Scorched") out.scorch = d.stacks;
				else if (/^(ReduceArmor|ShadowReduce)/.test(name) && m.defense < 0) out.breaks.push(-m.defense);
				else if (m.defense < 0) out.others.push(-m.defense);
			});
			return out;
		}

		// Frozen and rooted targets break free when they take damage.
		function removeOnDamage(at) {
			Object.keys(debuffs).forEach(function (name) {
				var m = meta[name];
				if (m && m.removeOnDamage && active(name, at)) debuffs[name].expiry = at;
			});
		}

		function sampleUntil(to) {
			while (nextSample < to && nextSample < W) {
				var at = nextSample;
				var seen = {};
				advanceDots(at);
				sampleCount++;
				Object.keys(debuffs).forEach(function (name) {
					var d = active(name, at);
					var label = d && debuffLabel(name);
					if (!label) return;
					var x = seen[label] || (seen[label] = { stacks: 0, max: false, dot: false });
					x.stacks += d.stacks;
					x.max = x.max || stackCap(name, env.tal) > 1;
				});
				Object.keys(dots).forEach(function (b) {
					var d = dots[b];
					if (!d.stacks.length || d.expiry <= at) return;
					var label = env.dot(b).kindName;
					var x = seen[label] || (seen[label] = { stacks: 0, max: true, dot: true });
					x.stacks += d.stacks.length;
				});
				Object.keys(seen).forEach(function (label) {
					var s = samples[label] || (samples[label] = { on: 0, stacks: 0, max: false, dot: false });
					s.on++;
					s.stacks += seen[label].stacks;
					s.max = s.max || seen[label].max;
					s.dot = s.dot || seen[label].dot;
				});
				nextSample += SAMPLE_MS;
			}
		}

		function advanceDots(to) {
			Object.keys(dots).forEach(function (b) {
				var d = dots[b];
				var base = env.dot(b);
				while (d.stacks.length && d.next <= to && d.next <= W && d.next <= d.expiry) {
					var conds = targetConds(d.next);
					var vs = dotVsMult(env.tal, b, conds).mult;
					var tick = 0;
					d.stacks.forEach(function (s) {
						var amt = base.perTick * s.mult * vs;
						credit(s.src, "dot", amt);
						tick += amt;
					});
					addType(base.kindName, tick);
					removeOnDamage(d.next);
					d.next += DOT_TICK_MS;
				}
			});
		}

		events.forEach(function (ev) {
			if (ev.t > W) return;
			sampleUntil(ev.t);
			advanceDots(ev.t);
			if (ev.type === "stealth") { stealthOn = true; return; }
			if (ev.type === "hit") {
				var conds = targetConds(ev.t);
				if (permStealth || stealthOn) conds.stealth = true;
				if (ev.harmony) conds.afterMaster = true;
				var deb = targetDebuffs(ev.t);
				if (env.crit.hasHemorrhage && env.tal.hemoDebuff) {
					critTimes = critTimes.filter(function (x) { return x > ev.t - HEMORRHAGE_MS; });
					deb.hemoUptime = 1 - Math.pow(1 - env.crit.chance(conds), critTimes.length);
				}
				var mods = selfMods(ev.t);
				var hit = env.attack * (1 + mods.melee) * ev.mult * directMultiplier(env, conds, deb);
				var factor = ev.crit ? env.crit.factor(conds) : 1;
				credit(ev.key, "direct", hit);
				addType("Direct hits", hit);
				if (factor > 1) {
					credit(ev.key, "crit", hit * (factor - 1));
					addType("Critical hits", hit * (factor - 1));
				}
				if (ev.crit) critTimes.push(ev.t);
				removeOnDamage(ev.t);
				if (stealthOn) { stealthOn = false; stealthHitT = ev.t; }
				return;
			}
			var stealthed = !permStealth && (stealthOn || stealthHitT === ev.t);
			var dotMult = (1 + selfMods(ev.t).magic) * (stealthed ? 1 + etherealPct : 1);
			Object.keys(ev.debuffs).forEach(function (name) {
				var m = meta[name] || { durationMs: 5000, stacks: 1 };
				var cur = active(name, ev.t);
				var dur = (m.durationMs || 5000) + env.buffTime(name);
				debuffs[name] = { stacks: Math.min(stackCap(name, env.tal), (cur ? cur.stacks : 0) + ev.debuffs[name]), expiry: ev.t + dur };
			});
			Object.keys(ev.dots).forEach(function (b) {
				var base = env.dot(b);
				if (!base) return;
				var d = dots[b];
				if (!d || !d.stacks.length || d.expiry <= ev.t) d = dots[b] = { stacks: [], expiry: 0, next: ev.t + DOT_TICK_MS };
				for (var k = 0; k < ev.dots[b]; k++) {
					d.stacks.push({ src: ev.key, mult: dotMult });
					if (d.stacks.length > base.maxStacks) d.stacks.shift();
				}
				d.expiry = ev.t + base.ticks * DOT_TICK_MS + env.buffTime(b);
			});
		});
		sampleUntil(W);
		advanceDots(W);

		var skills = Object.keys(bySkill).map(function (k) {
			var s = bySkill[k];
			s.name = names[k] || k;
			s.casts = k === "basic" ? 0 : (castCount[k] || 0);
			s.total = s.direct + s.crit + s.dot;
			s.share = total ? s.total / total : 0;
			return s;
		}).sort(function (a, b) { return b.total - a.total; });
		var types = Object.keys(byType).map(function (k) { return { label: k, amount: byType[k], share: total ? byType[k] / total : 0, dot: k !== "Direct hits" && k !== "Critical hits" }; })
			.sort(function (a, b) { return b.amount - a.amount; });
		var uptime = Object.keys(samples).map(function (k) {
			var s = samples[k];
			return { label: k, pct: sampleCount ? s.on / sampleCount : 0, avgStacks: s.max && s.on ? s.stacks / s.on : 0, dot: !!s.dot };
		}).sort(function (a, b) { return b.pct - a.pct; });
		var dotTotal = types.reduce(function (a, x) { return a + (x.dot ? x.amount : 0); }, 0);
		return {
			windowS: W / 1000, total: total, dps: total / (W / 1000), loops: loops, casts: casts,
			firstPassMs: firstPassMs, waitMs: waitMs, mana: mana, masterMana: masterMana, timeline: timeline,
			skipped: Object.keys(skipped).map(function (k) { return { key: k, name: names[k] || k, times: skipped[k] }; }),
			noMana: Object.keys(noMana).map(function (k) { return { key: k, name: names[k] || k, times: noMana[k] }; }),
			manaLimited: limited, manaWaitMs: manaWaitMs,
			skills: skills, types: types, uptime: uptime, dotShare: total ? dotTotal / total : 0
		};
	}

	/* ---------------- main ---------------- */

	function defaultState() {
		return {
			v: 2,
			talents: "3225h315b5437252g3c2p5l3i5n5q3u2y2o3C2F5B3I5x5E3D2H2A3t",
			gearMode: "pieces",
			gearTotals: { attack: 0, expertise: 0, defense: 0 },
			gear: {
				mainhand: { rarity: "L", focus: "Attack", runes: ["ProcMassive", "ProcMassiveTime"], skillRune: "", magic: "" },
				offhand: { rarity: "L", focus: "Balanced", runes: [], skillRune: "", magic: "" },
				hat: { rarity: "L", focus: "Balanced", runes: [], skillRune: "", magic: "" },
				armor: { rarity: "L", focus: "Balanced", runes: [], skillRune: "", magic: "" },
				gloves: { rarity: "L", focus: "Balanced", runes: [], skillRune: "", magic: "" },
				boots: { rarity: "L", focus: "Balanced", runes: [], skillRune: "", magic: "" }
			},
			charms: {},
			extra: { attack: 0, expertise: 0, defense: 0, hp: 0, critChance: 0, critPower: 0, attackSpeed: 0 },
			target: { element: "", reduction: 0, armorBane: 0, armorBreak: "", scorch: 0, states: {} },
			skillRank: 10,
			comboWindow: DEFAULT_WINDOW_S,
			customCombo: [],
			selectedCombo: ""
		};
	}

	function compute(state) {
		var D = data();
		state = state || defaultState();
		var build = decodeBuild(state.talents);
		var disc = D.disciplines[build.discipline];
		var cls = disc.cls;
		var base = D.classes[cls];
		var tal = talentBonuses(build, disc);
		var gear = gearBonuses(state, cls);
		var ch = charmBonuses(state);
		var ex = state.extra || {};
		var target = state.target || {};
		var conds = Object.assign({}, target.states || {});
		var el = target.element || "";

		var st = finalStats(base, gear, ch, tal, ex, conds);
		var recovery = tal.recovery + gear.recovery;
		var crit = critModel(gear, ch, tal, ex, el, recovery);

		var runes = skillRuneEffects(gear.skillRunes);
		Object.keys(runes.dotFlat).forEach(function (b) { tal.dotFlat[b] = (tal.dotFlat[b] || 0) + runes.dotFlat[b]; });
		var dot = makeDotBase(st.expertise, tal);
		function buffTime(name) { return (tal.debuffTime[name] || 0) + (runes.buffTime[name] || 0); }

		var env = {
			tal: tal, slay: el ? gear.slay[el] || 0 : 0,
			reduction: Math.min(100, Math.max(0, num(target.reduction))) / 100
		};
		var staticDebuffs = {
			armorBane: Math.max(0, Math.min(ARMOR_BANE_MAX, Math.round(num(target.armorBane)))),
			breaks: ARMOR_BREAKS[target.armorBreak] || [],
			others: [], scorch: Math.max(0, Math.min(SCORCH_BASE_MAX + tal.scorchStacks, Math.round(num(target.scorch))))
		};
		var directMult = directMultiplier(env, conds, staticDebuffs);
		var critFactor = crit.factor(conds);
		var critReal = crit.chance(conds);

		var ctx = { attack: st.attack, expertise: st.expertise, directMult: directMult, critFactor: critFactor,
			dot: dot, runes: runes, tal: tal, conds: conds };
		var rank = Math.max(1, Math.min(10, Math.round(num(state.skillRank) || 10)));
		var groups = [
			{ label: cls + " skills", list: D.skills[cls] || [] },
			{ label: disc.name + " skills", list: D.skills[disc.master] || [] }
		].map(function (g) {
			return { label: g.label, skills: g.list.filter(function (a) { return a.hotbar >= 1; }).map(function (a) { return computeSkill(a, rank, ctx); }) };
		});

		// Basic attacks: a 3-hit chain where only the 3rd hit can crit.
		var basics = [];
		var melee = (D.skills.Any || [])[0];
		if (melee) {
			var m = computeSkill(melee, 1, ctx);
			var hit = m.perHit[0] || 0;
			basics.push({ name: "Basic melee (3-hit chain)", perHit: hit, avgPerHit: hit * (2 + critFactor) / 3, thirdCrits: true });
		}
		(D.skills[disc.master] || []).forEach(function (a) {
			if (a.hotbar !== 0) return;
			var s = computeSkill(a, 1, ctx);
			if (!s.perHit.length) return;
			var crits = !!RANGED_BASIC_CRITS[disc.key];
			var h = s.perHit[0];
			basics.push({ name: s.name + " (ranged basic)", perHit: h, avgPerHit: crits ? h * (2 + critFactor) / 3 : h, thirdCrits: crits });
		});

		// DoTs this build can apply at the chosen rank.
		var seen = {};
		var dotRows = [];
		groups.forEach(function (g) {
			g.skills.forEach(function (s) {
				s.dots.forEach(function (d) {
					if (seen[d.buff]) { if (seen[d.buff].from.indexOf(s.name) < 0) seen[d.buff].from.push(s.name); return; }
					var info = dot(d.buff);
					if (!info) return;
					var vs = dotVsMult(tal, d.buff, conds);
					var row = Object.assign({}, info, {
						vsMult: vs.mult, vsNotes: vs.notes, perTick: info.perTick * vs.mult,
						fullStackTick: info.perTick * vs.mult * info.maxStacks, from: [s.name]
					});
					seen[d.buff] = row;
					dotRows.push(row);
				});
			});
		});

		// Combos: target states come from the combo's own debuffs, yours from your settings.
		var selfConds = {};
		Object.keys(conds).forEach(function (k) { if (SELF_CONDITIONS[k] && conds[k]) selfConds[k] = true; });
		var abilities = abilitiesFor(disc);
		var comboEnv = Object.assign({}, env, {
			attack: st.attack, attackSpeed: st.attackSpeed, abilities: abilities, rank: rank,
			runes: runes, dot: dot, crit: crit, selfConds: selfConds, basic: basicFor(disc), buffTime: buffTime
		});
		var windowS = Math.max(5, Math.min(120, num(state.comboWindow) || DEFAULT_WINDOW_S));
		var presets = ((root.DBB_COMBOS || {})[disc.key] || []).map(function (c) {
			return { id: c.id, name: c.name, why: c.why, steps: c.steps.slice(), preset: true };
		});
		var custom = (state.customCombo || []).filter(function (k) { return k; });
		if (custom.length) presets.push({ id: "custom", name: "Your combo", why: "Built by you below.", steps: custom, preset: false });
		var combos = presets.map(function (c) {
			return Object.assign(c, {
				result: simulateCombo(c.steps, comboEnv, windowS, true),
				burst: simulateCombo(c.steps, comboEnv, windowS, false)
			});
		}).filter(function (c) { return c.result; });

		var used = {};
		Object.keys(tal.conditions).forEach(function (k) { used[k] = true; });

		return {
			discipline: disc, cls: cls, build: build, rank: rank,
			base: base, gear: gear, charms: ch, talents: tal,
			stats: {
				hp: st.hp, attack: st.attack, expertise: st.expertise, defense: st.defense,
				critStat: crit.statWith(conds), critReal: critReal, critPower: crit.power, critDamagePct: crit.dmgPct, critFactor: critFactor,
				attackSpeed: st.attackSpeed, recovery: recovery, tenacity: gear.tenacity + tal.tenacity, moveSpeed: gear.moveSpeed,
				gearFind: gear.gearFind + ch.gearFind, goldFind: gear.goldFind + ch.goldFind, materialFind: gear.materialFind + ch.materialFind,
				slay: gear.slay, resist: gear.resist
			},
			breakdown: {
				hp: st.parts.hp, attack: st.parts.attack, expertise: st.parts.expertise, defense: st.parts.defense,
				critStat: { gear: gear.critChance, charms: ch.critChance, talents: tal.critChance, extra: num(ex.critChance) / 100, situational: crit.statWith(conds) - crit.stat },
				critPower: { gear: gear.critPower, charms: ch.critPower, extra: num(ex.critPower) / 100 }
			},
			crit: { runes: crit.runes, heals: crit.heals, conditional: tal.critCond.map(function (c) { return Object.assign({ active: !!conds[c.cond] }, c); }) },
			direct: { mult: directMult, slay: env.slay, reduction: env.reduction, debuffs: staticDebuffs, element: el,
				conditional: tal.dmgCond.map(function (c) { return Object.assign({ active: !!conds[c.cond] }, c); }) },
			skills: groups, basics: basics, dots: dotRows, runeNotes: runes.notes,
			combos: combos, comboWindow: windowS, basicAttack: { name: comboEnv.basic.name, ranged: comboEnv.basic.ranged },
			abilities: abilities.map(function (a) {
				var r = rankOf(a, rank);
				return { ability: a.ability, name: a.name, hotbar: a.hotbar, castMs: stepTime(a, rank), cooldownMs: r.cooldownMs || 0 };
			}),
			scorchMax: SCORCH_BASE_MAX + tal.scorchStacks,
			conditionsUsed: used, charmSlots: SLOTS_TOTAL
		};
	}

	root.DBB_ENGINE = {
		compute: compute, decodeBuild: decodeBuild, defaultState: defaultState,
		CONDITIONS: CONDITIONS, SELF_CONDITIONS: SELF_CONDITIONS, OPPOSITE: OPPOSITE, SLOTS_TOTAL: SLOTS_TOTAL,
		ARMOR_BREAKS: ARMOR_BREAKS, ARMOR_BANE_MAX: ARMOR_BANE_MAX, SCORCH_BASE_MAX: SCORCH_BASE_MAX,
		RETRIBUTION: RETRIBUTION, DEFAULT_WINDOW_S: DEFAULT_WINDOW_S,
		MANA_MAX: MANA_MAX, MASTER_MANA_MAX: MASTER_MANA_MAX, MASTER_MANA_RATIO: MASTER_MANA_RATIO,
		// For tools/check_engine.js.
		_internal: { simulateCombo: simulateCombo, makeDotBase: makeDotBase }
	};
})(typeof window !== "undefined" ? window : globalThis);
