/*
 * Dungeon Blitz build calculator: calculation engine.
 * Pure functions over window.DBB_DATA (game data) and window.DBCALC_TALENT_DATA
 * (talent calculator data). No DOM access, so it can run in tests.
 */
(function (root) {
  "use strict";

  var BASE_CRIT = 0.15;
  var OPPOSITE = { Earth: "Air", Air: "Earth", Ice: "Fire", Fire: "Ice", Life: "Death", Death: "Life" };
  // Third ranged basic shot crits only for these (base mechanics notes).
  var RANGED_BASIC_CRITS = { frostbringer: true, flameseer: true, necromancer: true, shadowstalker: true };
  var MOVE_SPEED_PER_RUNE = 0.023;
  var SLOTS_TOTAL = 18;

  var CONDITIONS = {
    stealth: "You are in Stealth",
    cursed: "Target is cursed",
    stunned: "Target is stunned or staggered",
    ignited: "Target is ignited",
    slowed: "Target is slowed or immobilized",
    bound: "Target is bound",
    bleeding: "Target is bleeding",
    afterMaster: "Within 3 s of a master ability",
    afterKill: "Within 3 s of a kill"
  };

  // How each talentstone feeds the math. Stat stones (Attack/Defense/... I-XIV and the
  // Recovery stones) are recognised by name. Values: "calc" = the talent calculator's
  // number, otherwise the game's own value from PowerModTypes.
  var TALENT_RULES = {
    "Steadiness": { kind: "crit" },
    "Opportunist": { kind: "crit", cond: "stealth" },
    "Crippling Curse": { kind: "crit", cond: "cursed" },
    "Dominate": { kind: "crit", cond: "stunned" },
    "Volatile": { kind: "crit", cond: "ignited" },
    "Element Mastery": { kind: "critRune", rune: "elemental" },
    "Heavy Blows": { kind: "critRune", rune: "heavyBlow" },
    "Hemorrhage": { kind: "critRune", rune: "hemorrhage" },
    "Artery Strike": { kind: "dotFlat" },
    "Concentrated Venom": { kind: "dotFlat" },
    "Accelerant": { kind: "dotFlat" },
    "Chilblains": { kind: "dotFlat" },
    "Immolation": { kind: "dotFlat" },
    "Doom": { kind: "dotFlat" },
    "Deep Cuts": { kind: "dotStacks", calc: true },
    "Napalm": { kind: "dotStacks", calc: true },
    "Frost Bite": { kind: "dotStacks", calc: true },
    "Contact Poison": { kind: "dotVs", cond: "bleeding" },
    "Insidious Poison": { kind: "dotVs", cond: "bound" },
    "Pounce": { kind: "dmg", cond: "slowed" },
    "Twisted Hex": { kind: "dmg", cond: "bound" },
    "Cursed Armor": { kind: "dmg", cond: "cursed" },
    "Harmony": { kind: "dmg", cond: "afterMaster" },
    "Fury": { kind: "dmg", cond: "afterKill", calc: true },
    "Zeal": { kind: "fromExp", stat: "attack" },
    "Conviction": { kind: "fromExp", stat: "defense" },
    "Fervor": { kind: "fromExp", stat: "hp" },
    "Rapid Recovery": { kind: "stat", stat: "tenacity", calc: true }
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

  function parseVal(v) {
    if (Array.isArray(v)) v = v[0];
    var s = String(v == null ? "" : v).trim();
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
    if (isNaN(n)) return 0;
    return s.indexOf("%") >= 0 ? n / 100 : n;
  }

  function calcValue(talent, level) {
    var vals = talent.values || [];
    var row = Array.isArray(vals[0]) ? vals[0] : vals;
    return parseVal(row[level - 1]);
  }

  function gameEffect(name) {
    var list = (data().talentEffects || {})[name] || [];
    return list[0] || null;
  }

  function gameValue(effect, level) {
    if (!effect) return 0;
    var v = String(effect.values[Math.min(level, effect.values.length) - 1] || "0").split(",")[0];
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function pct(n, digits) {
    var d = digits == null ? 1 : digits;
    return (Math.round(n * 100 * Math.pow(10, d)) / Math.pow(10, d)) + "%";
  }

  /* ---------------- talents ---------------- */

  function emptyTalentBonuses() {
    return {
      attack: 0, expertise: 0, defense: 0, hp: 0, recovery: 0, tenacity: 0, critChance: 0,
      critCond: [], critRune: { heavyBlow: 0, hemorrhage: 0, elemental: 0 },
      dotFlat: {}, dotStacks: {}, dotVs: [], dmgCond: [],
      fromExp: { attack: 0, defense: 0, hp: 0 },
      stones: [], points: 0, conditions: {}
    };
  }

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
    if (/Recovery$/.test(name)) {
      v = calcValue(talent, level);
      out.recovery += v;
      return "+" + pct(v) + " Recovery";
    }
    var rule = TALENT_RULES[name];
    var eff = gameEffect(name);
    if (!rule) {
      var param = Array.isArray(talent.parameter) ? talent.parameter.join(" / ") : talent.parameter;
      var shown = (talent.values && (Array.isArray(talent.values[0]) ? talent.values.map(function (r) { return r[level - 1]; }).join(" / ") : talent.values[level - 1])) || "";
      return { info: true, text: param + ": " + shown };
    }
    v = rule.calc ? calcValue(talent, level) : gameValue(eff, level);
    var targets = (eff && eff.targets) || [];
    switch (rule.kind) {
      case "crit":
        if (rule.cond) {
          out.critCond.push({ source: name, value: v, cond: rule.cond });
          out.conditions[rule.cond] = true;
          return "+" + pct(v, 0) + " Critical Chance (" + CONDITIONS[rule.cond].toLowerCase() + ")";
        }
        out.critChance += v;
        return "+" + pct(v, 0) + " Critical Chance";
      case "critRune":
        out.critRune[rule.rune] += v;
        return "+" + pct(v, 0) + " " + { heavyBlow: "Heavy Blow", hemorrhage: "Hemorrhage", elemental: "elemental crit" }[rule.rune] + " damage";
      case "dotFlat":
        targets.forEach(function (b) { out.dotFlat[b] = (out.dotFlat[b] || 0) + v; });
        return "+" + v + " DoT damage to " + targets.slice(0, 3).join(", ") + (targets.length > 3 ? "…" : "");
      case "dotStacks":
        targets.forEach(function (b) { out.dotStacks[b] = (out.dotStacks[b] || 0) + v; });
        return "+" + v + " max stacks";
      case "dotVs":
        out.dotVs.push({ source: name, value: v, cond: rule.cond, targets: targets });
        out.conditions[rule.cond] = true;
        return "+" + pct(v, 0) + " poison damage (" + CONDITIONS[rule.cond].toLowerCase() + ")";
      case "dmg":
        out.dmgCond.push({ source: name, value: v, cond: rule.cond });
        out.conditions[rule.cond] = true;
        return "+" + pct(v, 0) + " damage (" + CONDITIONS[rule.cond].toLowerCase() + ")";
      case "fromExp":
        out.fromExp[rule.stat] += v;
        return "+" + pct(v) + " of Expertise as " + { attack: "Attack", defense: "Defense", hp: "max HP" }[rule.stat];
      case "stat":
        out[rule.stat] += v;
        return "+" + pct(v, 0) + " " + rule.stat.charAt(0).toUpperCase() + rule.stat.slice(1);
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
      out.attack = +t.attack || 0;
      out.expertise = +t.expertise || 0;
      out.defense = +t.defense || 0;
    }
    return out;
  }

  function charmBonuses(state) {
    var out = { hp: 0, attack: 0, expertise: 0, defense: 0, critChance: 0, critPower: 0, gearFind: 0, goldFind: 0, materialFind: 0, count: 0 };
    data().charms.forEach(function (c) {
      var n = Math.max(0, Math.floor(+((state.charms || {})[c.key]) || 0));
      out.count += n;
      out[c.stat] += n * c.value;
    });
    return out;
  }

  /* ---------------- damage helpers ---------------- */

  function critRuneDamage(runeKey, targetEl, tal, critPower) {
    var r = data().runes[runeKey];
    if (!r) return null;
    if (r.heal) return { key: runeKey, name: r.name, pct: 0, heal: true, note: "heals, no damage" };
    var base, bonus, note;
    if (r.element) {
      if (!targetEl) { base = 50; note = "neutral target"; }
      else if (targetEl === r.element) { base = 25; note = "target resists " + r.element; }
      else if (OPPOSITE[r.element] === targetEl) { base = 100; note = "target weak to " + r.element; }
      else { base = 50; note = "neutral target"; }
      bonus = tal.critRune.elemental;
    } else if (runeKey === "ProcMassive") { base = r.critPct; bonus = tal.critRune.heavyBlow; }
    else { base = r.critPct; bonus = tal.critRune.hemorrhage; }
    var fromPower = critPower * 100 * 0.5;
    return { key: runeKey, name: r.name, base: base, talentBonus: bonus, fromPower: fromPower,
      pct: base * (1 + bonus) + fromPower, note: note || "" };
  }

  function buffKindMap() {
    var map = {};
    var dots = data().dots;
    Object.keys(dots).forEach(function (k) { dots[k].buffs.forEach(function (b) { map[b] = k; }); });
    return map;
  }

  function makeDotCalc(expertise, tal, states) {
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
      var flat = tal.dotFlat[buff] || 0;
      var basePct = pb.tickPct;
      var talentPct = flat * 1.5 / pb.ticks * 100 * factor;
      var vsMult = 1;
      var vsNotes = [];
      tal.dotVs.forEach(function (e) {
        if (e.targets.indexOf(buff) >= 0 && states[e.cond]) { vsMult *= 1 + e.value; vsNotes.push(e.source); }
      });
      var maxStacks = pb.stacks + (tal.dotStacks[buff] || 0);
      var perTick = expertise * (basePct + talentPct) / 100 * vsMult;
      var rank = /(\d+)$/.exec(buff);
      var info = {
        buff: buff, kind: kindKey,
        name: kind.name + (kind.rankedFrom && rank ? " (rank " + rank[1] + ")" : (buff !== kind.buffs[0] ? " (" + buff + ")" : "")),
        basePct: basePct, talentPct: talentPct, vsMult: vsMult, vsNotes: vsNotes,
        ticks: pb.ticks, maxStacks: maxStacks, poison: !!kind.poison, source: kind.source,
        perTick: perTick, perStackTotal: perTick * pb.ticks, fullStackTick: perTick * maxStacks,
        fullStackTotal: perTick * maxStacks * pb.ticks
      };
      return (cache[buff] = info);
    };
  }

  function skillRuneEffects(keys) {
    var D = data();
    var fx = { multAdd: {}, appends: {}, replaces: {}, dotFlat: {}, notes: [] };
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
            if (m) { (fx.appends[p] = fx.appends[p] || []).push(m[1]); }
            if (rp) { (fx.replaces[p] = fx.replaces[p] || {})[rp[1]] = rp[2]; }
          });
        });
      } else if (r.type === "Buff" && r.prop === "DoTDamage") {
        var v = parseFloat(r.value) || 0;
        r.targets.forEach(function (b) { fx.dotFlat[b] = (fx.dotFlat[b] || 0) + v; });
      }
    });
    return fx;
  }

  function baseName(power) { return String(power).replace(/\d+$/, ""); }

  function computeSkill(ability, rank, ctx) {
    var ranks = ability.ranks;
    var r = ranks[Math.min(Math.max(rank, 1), ranks.length) - 1];
    var parts = [r].concat(r.chain || []);
    var res = { ability: ability.ability, name: ability.name, desc: ability.desc, hotbar: ability.hotbar,
      rank: r.rank, hits: 0, perHit: [], direct: 0, expected: 0, dot: 0, dots: [], runeBoost: 0 };
    parts.forEach(function (p) {
      var pbase = baseName(p.power);
      var add = ctx.runes.multAdd[pbase] || 0;
      if (add) res.runeBoost += add;
      p.mults.forEach(function (m) {
        var hit = ctx.attack * (m + add) * ctx.directMult;
        res.hits += 1;
        res.perHit.push(hit);
        res.direct += hit;
        res.expected += hit * ctx.critFactor;
      });
      var applied = {};
      Object.keys(p.dots || {}).forEach(function (b) {
        var rb = (ctx.runes.replaces[pbase] || {})[b] || b;
        applied[rb] = (applied[rb] || 0) + p.dots[b];
      });
      (ctx.runes.appends[pbase] || []).forEach(function (b) { applied[b] = (applied[b] || 0) + 1; });
      Object.keys(applied).forEach(function (b) {
        var d = ctx.dot(b);
        if (!d) return;
        var stacks = Math.min(applied[b], d.maxStacks);
        var amount = stacks * d.perStackTotal;
        res.dot += amount;
        res.dots.push({ buff: b, name: d.name, stacks: applied[b], amount: amount });
      });
    });
    res.total = res.expected + res.dot;
    res.directShare = res.total ? res.expected / res.total : 0;
    res.kind = res.total ? (res.dot && res.expected ? "mixed" : (res.dot ? "dot" : "direct")) : "utility";
    return res;
  }

  /* ---------------- main ---------------- */

  function defaultState() {
    return {
      v: 1,
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
      target: { element: "", reduction: 0, states: {} },
      skillRank: 10
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
    var states = target.states || {};
    var el = target.element || "";
    var num = function (v) { return +v || 0; };

    var expertise = base.expertise + gear.expertise + ch.expertise + tal.expertise + num(ex.expertise);
    var atkFromExp = Math.ceil(expertise * tal.fromExp.attack);
    var defFromExp = Math.ceil(expertise * tal.fromExp.defense);
    var hpFromExp = Math.ceil(expertise * tal.fromExp.hp);
    var attack = base.attack + gear.attack + ch.attack + tal.attack + num(ex.attack) + atkFromExp;
    var defense = base.defense + gear.defense + ch.defense + tal.defense + num(ex.defense) + defFromExp;
    var hpFlat = base.hp + ch.hp + tal.hp + num(ex.hp) + hpFromExp;
    var hp = Math.round(hpFlat * (1 + gear.hpPct));

    var critCondActive = 0;
    var critCond = tal.critCond.map(function (c) {
      var on = !!states[c.cond];
      if (on) critCondActive += c.value;
      return { source: c.source, value: c.value, cond: c.cond, active: on };
    });
    var critStat = gear.critChance + ch.critChance + tal.critChance + num(ex.critChance) / 100 + critCondActive;
    var critReal = Math.min(1, BASE_CRIT * (1 + critStat));
    var critPower = gear.critPower + ch.critPower + num(ex.critPower) / 100;

    var critRunes = gear.critRunes.map(function (k) { return critRuneDamage(k, el, tal, critPower); }).filter(Boolean);
    var critDamagePct = critRunes.reduce(function (a, r) { return a + (r.heal ? 0 : r.pct); }, 0);
    var critFactor = 1 + critReal * critDamagePct / 100;

    var slay = el ? gear.slay[el] || 0 : 0;
    var reduction = Math.min(100, Math.max(0, num(target.reduction))) / 100;
    var condDmg = 0;
    var dmgCond = tal.dmgCond.map(function (c) {
      var on = !!states[c.cond];
      if (on) condDmg += c.value;
      return { source: c.source, value: c.value, cond: c.cond, active: on };
    });
    var directMult = (1 + slay) * (1 - reduction) * (1 + condDmg);

    var runeFx = skillRuneEffects(gear.skillRunes);
    Object.keys(runeFx.dotFlat).forEach(function (b) { tal.dotFlat[b] = (tal.dotFlat[b] || 0) + runeFx.dotFlat[b]; });
    var dot = makeDotCalc(expertise, tal, states);

    var ctx = { attack: attack, directMult: directMult, critFactor: critFactor, dot: dot, runes: runeFx };
    var rank = Math.max(1, Math.min(10, Math.round(num(state.skillRank) || 10)));
    var groups = [
      { label: cls + " skills", list: D.skills[cls] || [] },
      { label: disc.name + " skills", list: D.skills[disc.master] || [] }
    ].map(function (g) {
      return { label: g.label, skills: g.list.map(function (a) { return computeSkill(a, rank, ctx); }) };
    });

    // Basic attacks: a 3-hit chain where only the 3rd hit can crit.
    var melee = (D.skills.Any || [])[0];
    var basics = [];
    if (melee) {
      var m = computeSkill(melee, 1, ctx);
      var hit = m.perHit[0] || 0;
      basics.push({ name: "Basic melee (3-hit chain)", perHit: hit, avgPerHit: hit * (2 + critFactor) / 3, thirdCrits: true });
    }
    groups.forEach(function (g) {
      g.skills.forEach(function (s) {
        if (s.hotbar === 0 && s.perHit.length) {
          var crits = !!RANGED_BASIC_CRITS[disc.key];
          var h = s.perHit[0];
          basics.push({ name: s.name + " (ranged basic)", perHit: h, avgPerHit: crits ? h * (2 + critFactor) / 3 : h, thirdCrits: crits });
        }
      });
    });

    // DoTs this build can apply at the chosen rank, plus anything talents boost.
    var seen = {};
    var dotRows = [];
    groups.forEach(function (g) {
      g.skills.forEach(function (s) {
        s.dots.forEach(function (d) {
          if (seen[d.buff]) { seen[d.buff].from.push(s.name); return; }
          var info = dot(d.buff);
          if (!info) return;
          seen[d.buff] = info;
          info.from = [s.name];
          dotRows.push(info);
        });
      });
    });

    var used = {};
    Object.keys(tal.conditions).forEach(function (k) { used[k] = true; });

    return {
      discipline: disc, cls: cls, build: build, rank: rank,
      base: base, gear: gear, charms: ch, talents: tal,
      stats: {
        hp: hp, attack: attack, expertise: expertise, defense: defense,
        critStat: critStat, critReal: critReal, critPower: critPower, critDamagePct: critDamagePct, critFactor: critFactor,
        attackSpeed: gear.attackSpeed + num(ex.attackSpeed) / 100, recovery: tal.recovery + gear.recovery,
        tenacity: gear.tenacity + tal.tenacity, moveSpeed: gear.moveSpeed,
        gearFind: gear.gearFind + ch.gearFind, goldFind: gear.goldFind + ch.goldFind, materialFind: gear.materialFind + ch.materialFind,
        slay: gear.slay, resist: gear.resist
      },
      breakdown: {
        hp: { base: base.hp, charms: ch.hp, talents: tal.hp, extra: num(ex.hp), fromExpertise: hpFromExp, percent: gear.hpPct },
        attack: { base: base.attack, gear: gear.attack, charms: ch.attack, talents: tal.attack, extra: num(ex.attack), fromExpertise: atkFromExp },
        expertise: { base: base.expertise, gear: gear.expertise, charms: ch.expertise, talents: tal.expertise, extra: num(ex.expertise) },
        defense: { base: base.defense, gear: gear.defense, charms: ch.defense, talents: tal.defense, extra: num(ex.defense), fromExpertise: defFromExp },
        critStat: { gear: gear.critChance, charms: ch.critChance, talents: tal.critChance, extra: num(ex.critChance) / 100, situational: critCondActive },
        critPower: { gear: gear.critPower, charms: ch.critPower, extra: num(ex.critPower) / 100 }
      },
      crit: { runes: critRunes, conditional: critCond },
      direct: { mult: directMult, slay: slay, reduction: reduction, condDmg: condDmg, conditional: dmgCond, element: el },
      skills: groups, basics: basics, dots: dotRows, runeNotes: runeFx.notes,
      conditionsUsed: used, charmSlots: SLOTS_TOTAL
    };
  }

  root.DBB_ENGINE = {
    compute: compute, decodeBuild: decodeBuild, defaultState: defaultState,
    CONDITIONS: CONDITIONS, OPPOSITE: OPPOSITE, SLOTS_TOTAL: SLOTS_TOTAL
  };
})(typeof window !== "undefined" ? window : globalThis);
