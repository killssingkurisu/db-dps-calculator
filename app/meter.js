/*
 * Dungeon Blitz DPS Calculator: reading the DB DPS Launcher's damage meter exports
 * (format "dbb-dps", version 2) and finding the best rotations in them.
 *
 * A run's rotation is the list of casts the meter saw (rotation.casts, one entry per spell
 * cast or per run of basic attacks, with every cast's time since launcher 1.6.4). Every hit
 * and DoT tick in hits[] is credited to the cast that caused it, the way the meter does it:
 * the latest cast of the same spell (basic attacks by their power), so a DoT's ticks count
 * for the cast that put it up, even after the window. Hits nothing claims (rune procs such as
 * Hemorrhage) go to the latest cast of any kind.
 *
 * The best N-second rotation is the N seconds of casts that caused the most damage; its DPS is
 * that damage over N seconds. The damage that simply landed inside the same N seconds is kept
 * too, since that is what the meter's own DPS chart shows.
 *
 * No DOM access: app.js draws everything. window.DBB_METER.
 */
(function (root) {
	"use strict";

	var FORMAT = "dbb-dps";
	var WINDOWS = [5, 10, 20];
	var MATCH_SLACK_MS = 60;          // a hit can reach the meter a moment before its cast
	// Abilities the live game names differently from the client data the calculator was
	// built from. DeathBlowOld ("Assassinate") fires the Assassinate powers.
	var ALIASES = { DeathBlowOld: "Assassinate" };

	function D() { return root.DBB_DATA; }
	function num(v) { var n = +v; return isFinite(n) ? n : 0; }
	function str(v, max) { return typeof v === "string" ? v.trim().slice(0, max || 80) : ""; }

	function hash(text) {
		var h = 0x811c9dc5;
		for (var i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i);
			h = (h * 0x01000193) >>> 0;
		}
		return h.toString(36);
	}

	/* ---------- the calculator's abilities, for naming and mapping ---------- */

	// Every ability of a class: the class skills, each discipline's tier and master skills,
	// and the basic-attack overrides (hotbar 0). With the discipline each belongs to.
	function classAbilities(cls) {
		var data = D();
		var out = [];
		(data.skills[cls] || []).forEach(function (a) { out.push({ a: a, disc: null }); });
		data.disciplines.forEach(function (d) {
			if (d.cls !== cls) return;
			(data.skills[d.master] || []).forEach(function (a) { out.push({ a: a, disc: d }); });
		});
		return out;
	}

	// The calculator's ability key for a spell the meter saw, or "" when the calculator
	// doesn't know it.
	function calcKey(meterKey, meterName, cls) {
		var list = cls ? classAbilities(cls) : [];
		if (!cls) Object.keys(D().classes).forEach(function (c) { list = list.concat(classAbilities(c)); });
		function has(k) { return list.some(function (x) { return x.a.ability === k && x.a.hotbar >= 1; }); }
		if (has(meterKey)) return meterKey;
		if (ALIASES[meterKey] && has(ALIASES[meterKey])) return ALIASES[meterKey];
		var name = String(meterName || "").toLowerCase();
		var byName = list.filter(function (x) { return x.a.hotbar >= 1 && x.a.name.toLowerCase() === name; })[0];
		return byName ? byName.a.ability : "";
	}

	// Which class: the export's own, else the class whose skills the run used most.
	function inferClass(raw, spellKeys) {
		var data = D();
		var given = raw.character && raw.character.class;
		if (given && Object.prototype.hasOwnProperty.call(data.classes, given)) return given;
		var best = "", bestScore = 0;
		Object.keys(data.classes).forEach(function (cls) {
			var keys = classAbilities(cls).map(function (x) { return x.a.ability; });
			var score = spellKeys.filter(function (k) { return keys.indexOf(k) >= 0 || keys.indexOf(ALIASES[k]) >= 0; }).length;
			if (score > bestScore) { best = cls; bestScore = score; }
		});
		return best;
	}

	// Which discipline: its master skills (4, E, Q) and basic overrides decide, tier skills help.
	function inferDiscipline(cls, spellKeys) {
		var data = D();
		var best = -1, bestScore = 0, tie = false;
		data.disciplines.forEach(function (d) {
			if (d.cls !== cls) return;
			var score = 0;
			(data.skills[d.master] || []).forEach(function (a) {
				if (spellKeys.indexOf(a.ability) < 0) return;
				score += a.hotbar >= 4 || a.hotbar === 0 ? 5 : 1;
			});
			if (score > bestScore) { best = d.id; bestScore = score; tie = false; }
			else if (score && score === bestScore) tie = true;
		});
		return tie ? -1 : best;
	}

	/* ---------- reading an export ---------- */

	function cleanHits(list) {
		return (Array.isArray(list) ? list : []).filter(function (h) {
			return h && isFinite(+h.atMs) && isFinite(+h.damage) && +h.damage > 0;
		}).map(function (h) {
			return {
				t: num(h.atMs), damage: num(h.damage), crit: !!h.crit, dot: h.kind === "dot",
				powerId: num(h.powerId), spell: str(h.spell, 60), target: str(h.target, 60)
			};
		}).sort(function (a, b) { return a.t - b.t; });
	}

	// One press per cast: a spell entry is one press; a run of basic attacks is one press
	// per attack, at its own time (castTimesMs) or spread evenly over the run (before 1.6.4).
	function expandCasts(list, basicKeyOf) {
		var presses = [];
		(Array.isArray(list) ? list : []).forEach(function (c) {
			if (!c || !isFinite(+c.atMs)) return;
			var kind = c.kind === "melee" || c.kind === "ranged" || c.kind === "spell" ? c.kind : "other";
			var basic = c.key === "basic";
			var found = basic ? basicKeyOf(num(c.powerId), str(c.name, 60)) : "";
			var key = basic ? (found || str(c.name, 60) || "basic") : str(c.key, 60);
			if (!key) return;
			var n = Math.max(1, Math.min(200, Math.floor(num(c.casts) || 1)));
			var times = Array.isArray(c.castTimesMs) && c.castTimesMs.length ? c.castTimesMs.map(num) : null;
			if (!times) {
				var a = num(c.atMs), b = Math.max(a, num(c.endMs) || a);
				times = [];
				for (var i = 0; i < (basic ? n : 1); i++) times.push(n > 1 && basic ? a + (b - a) * i / (n - 1) : a);
			}
			times.forEach(function (t) {
				presses.push({
					t: t, key: key, kind: basic ? (kind === "ranged" ? "ranged" : "melee") : kind, basic: basic, matched: !basic || !!found,
					powerId: num(c.powerId), slotKey: c.slotKey == null ? "" : String(c.slotKey).slice(0, 2),
					damage: 0, direct: 0, dotDamage: 0, hits: 0, crits: 0, targets: {}, bySpell: {}
				});
			});
		});
		// A basic attack whose power never hit anything (1.6.3 counted "Summon Pet" as melee)
		// is named after the usual basic attack of its kind.
		var usual = {};
		presses.forEach(function (p) {
			if (!p.basic || !p.matched) return;
			var m = usual[p.kind] || (usual[p.kind] = {});
			m[p.key] = (m[p.key] || 0) + 1;
		});
		presses.forEach(function (p) {
			var m = usual[p.kind];
			if (p.basic && !p.matched && m) p.key = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0];
		});
		presses.sort(function (a, b) { return a.t - b.t; });
		presses.forEach(function (p, i) { p.i = i; });
		return presses;
	}

	// Credits every hit to the press that caused it.
	function credit(hits, presses) {
		var lastBySpell = {}, lastByPower = {}, lastAny = null;
		var pi = 0, lost = 0;
		hits.forEach(function (h) {
			while (pi < presses.length && presses[pi].t <= h.t + MATCH_SLACK_MS) {
				var p = presses[pi++];
				if (p.basic) lastByPower[p.powerId] = p;
				else lastBySpell[p.key] = p;
				lastAny = p;
			}
			var to = lastBySpell[h.spell] || lastByPower[h.powerId] || lastAny;
			if (!to) { lost += h.damage; return; }
			to.damage += h.damage;
			if (h.dot) to.dotDamage += h.damage; else to.direct += h.damage;
			to.hits++;
			if (h.crit) to.crits++;
			to.targets[h.target] = (to.targets[h.target] || 0) + h.damage;
			var s = to.bySpell[h.spell] || (to.bySpell[h.spell] = { damage: 0, direct: 0, dot: 0 });
			s.damage += h.damage;
			if (h.dot) s.dot += h.damage; else s.direct += h.damage;
		});
		return lost;
	}

	// The N seconds of presses that caused the most damage.
	function bestWindow(presses, ms) {
		var best = null, j = 0, acc = 0;
		for (var i = 0; i < presses.length; i++) {
			while (j < presses.length && presses[j].t < presses[i].t + ms) { acc += presses[j].damage; j++; }
			if (!best || acc > best.damage) best = { from: i, to: j, damage: acc, startMs: presses[i].t };
			acc -= presses[i].damage;
		}
		return best;
	}

	function landedIn(hits, a, b) {
		var sum = 0;
		hits.forEach(function (h) { if (h.t >= a && h.t < b) sum += h.damage; });
		return sum;
	}

	function summarizeWindow(seconds, best, presses, hits, spellInfo, durationMs) {
		var ms = seconds * 1000;
		var list = presses.slice(best.from, best.to);
		var startMs = best.startMs;
		var totals = { damage: 0, direct: 0, dot: 0, hits: 0, crits: 0 };
		var targets = {}, bySpell = {};
		list.forEach(function (p) {
			totals.damage += p.damage; totals.direct += p.direct; totals.dot += p.dotDamage;
			totals.hits += p.hits; totals.crits += p.crits;
			Object.keys(p.targets).forEach(function (t) { targets[t] = (targets[t] || 0) + p.targets[t]; });
			Object.keys(p.bySpell).forEach(function (k) {
				var s = bySpell[k] || (bySpell[k] = { damage: 0, direct: 0, dot: 0 });
				s.damage += p.bySpell[k].damage; s.direct += p.bySpell[k].direct; s.dot += p.bySpell[k].dot;
			});
		});
		var targetList = Object.keys(targets).map(function (t) { return targets[t]; }).sort(function (a, b) { return b - a; });
		var dmg = totals.damage || 1;
		return {
			seconds: seconds,
			startMs: Math.round(startMs),
			endMs: Math.round(startMs + ms),
			damage: Math.round(totals.damage),
			dps: Math.round(totals.damage / seconds),
			landedDps: Math.round(landedIn(hits, startMs, startMs + ms) / seconds),
			short: durationMs < ms,
			hits: totals.hits,
			crits: totals.crits,
			dotShare: totals.dot / dmg,
			targets: targetList.length,
			topTargetShare: targetList.length ? targetList[0] / dmg : 0,
			casts: list.map(function (p) {
				return { t: Math.round(p.t - startMs), key: p.key, kind: p.kind, slotKey: p.slotKey, damage: Math.round(p.damage), crits: p.crits };
			}),
			bySpell: Object.keys(bySpell).map(function (k) {
				var s = bySpell[k];
				return { key: k, name: (spellInfo[k] && spellInfo[k].name) || k, damage: Math.round(s.damage), dot: Math.round(s.dot), share: s.damage / dmg };
			}).sort(function (a, b) { return b.damage - a.damage; })
		};
	}

	// Returns { run } or { error } for an export's text or parsed JSON.
	function parse(input, fileName) {
		var json = input;
		if (typeof input === "string") {
			try { json = JSON.parse(input.replace(/^﻿/, "")); } catch (e) { return { error: "That isn't a meter export: it is not valid JSON." }; }
		}
		if (!json || typeof json !== "object") return { error: "That isn't a meter export." };
		if (json.format !== FORMAT) {
			if (json.format === "dbb-inventory") return { error: "That's a scan from the DB Inventory Scanner. Bring scans in from the Import tab." };
			return { error: "That JSON isn't a DB DPS Launcher export (format \"" + FORMAT + "\" expected)." };
		}
		if (+json.version < 2) return { error: "This export is from an old meter (format version " + json.version + "). Export it again from DB DPS Launcher." };
		var hits = cleanHits(json.hits);
		var rotation = json.rotation || {};
		if (!hits.length) return { error: "This export has no hits in it. Export after a fight." };
		if (!Array.isArray(rotation.casts) || !rotation.casts.length) return { error: "This export has no rotation in it, so there are no casts to build a combo from." };

		// Spells the meter listed, and which spell each basic-attack power counted for.
		var spellInfo = {};
		(Array.isArray(json.spells) ? json.spells : []).forEach(function (s) {
			if (!s || !s.key) return;
			spellInfo[str(s.key, 60)] = { name: str(s.name, 60) || str(s.key, 60), slotKey: s.slotKey == null ? "" : String(s.slotKey).slice(0, 2), rank: s.rank == null ? null : num(s.rank) };
		});
		var powerSpell = {};
		hits.forEach(function (h) {
			var m = powerSpell[h.powerId] || (powerSpell[h.powerId] = {});
			m[h.spell] = (m[h.spell] || 0) + 1;
		});
		function basicKeyOf(powerId, name) {
			var m = powerSpell[powerId];
			if (m) return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0];
			var byName = Object.keys(spellInfo).filter(function (k) { return spellInfo[k].name === name; })[0];
			return byName || "";
		}

		var presses = expandCasts(rotation.casts, basicKeyOf);
		var lost = credit(hits, presses);
		var fight = json.fight || {};
		var durationMs = num(fight.durationMs) || (hits[hits.length - 1].t - hits[0].t);
		var totalDamage = hits.reduce(function (a, h) { return a + h.damage; }, 0);

		// Class, discipline and the calculator's names for the spells used.
		var usedKeys = [];
		presses.forEach(function (p) { if (usedKeys.indexOf(p.key) < 0) usedKeys.push(p.key); });
		var cls = inferClass(json, usedKeys.map(function (k) { return calcKey(k, spellInfo[k] && spellInfo[k].name, "") || k; }));
		var spells = usedKeys.map(function (k) {
			var basic = presses.some(function (p) { return p.key === k && p.basic; });
			var info = spellInfo[k] || { name: k, slotKey: "" };
			return { key: k, name: info.name, slotKey: info.slotKey || "", basic: basic, calc: basic ? "basic" : calcKey(k, info.name, cls) };
		});
		var discipline = inferDiscipline(cls, spells.map(function (s) { return s.calc || s.key; }).concat(usedKeys));

		var windows = WINDOWS.map(function (s) {
			var best = bestWindow(presses, s * 1000);
			return best ? summarizeWindow(s, best, presses, hits, spellInfo, durationMs) : null;
		}).filter(Boolean);

		var ch = json.character || {};
		var dg = fight.dungeon || null;
		var place = dg && dg.name ? str(dg.name, 80) : (Array.isArray(fight.levels) && fight.levels.length ? str(fight.levels[0], 80) : "");
		var dotDamage = hits.reduce(function (a, h) { return a + (h.dot ? h.damage : 0); }, 0);
		var critHits = hits.filter(function (h) { return !h.dot; });
		var targets = {};
		hits.forEach(function (h) { targets[h.target] = 1; });
		var name = str(ch.name, 40) || "Unnamed character";
		var startedAt = str(fight.startedAt, 40) || str(json.exportedAt, 40);
		return {
			run: {
				id: "run-" + hash([name, startedAt, Math.round(totalDamage), Math.round(durationMs)].join("|")),
				file: str(fileName, 120),
				source: str(json.source, 60),
				exportedAt: str(json.exportedAt, 40),
				startedAt: startedAt,
				importedAt: Date.now(),
				character: { name: name, class: cls },
				discipline: discipline,
				place: place,
				dungeon: dg ? { name: str(dg.name, 80), level: str(dg.level, 60), endedBy: str(dg.endedBy, 20), completion: num(dg.completion), deaths: num(dg.deaths) } : null,
				fight: {
					durationMs: Math.round(durationMs),
					damage: Math.round(totalDamage),
					dps: Math.round(totalDamage / Math.max(1, durationMs / 1000)),
					casts: presses.filter(function (p) { return !p.basic; }).length,
					basics: presses.filter(function (p) { return p.basic; }).length,
					hits: critHits.length,
					critRate: critHits.length ? critHits.filter(function (h) { return h.crit; }).length / critHits.length : 0,
					dotShare: totalDamage ? dotDamage / totalDamage : 0,
					targets: Object.keys(targets).length,
					uncredited: totalDamage ? lost / totalDamage : 0,
					castTimes: rotation.casts.some(function (c) { return c && Array.isArray(c.castTimesMs); })
				},
				spells: spells,
				windows: windows
			}
		};
	}

	/* ---------- turning a window into a combo ---------- */

	// The calculator steps for a window's casts: spells by the calculator's keys, one "basic"
	// per basic attack. Spells the calculator doesn't know are left out and named.
	// casts: the same steps with the time each was cast, ms from the window's start: the
	// spell execution the calculator replays with a character's own gear and talents.
	function stepsFor(run, win) {
		var byKey = {};
		(run.spells || []).forEach(function (s) { byKey[s.key] = s; });
		var steps = [], missing = [], casts = [];
		win.casts.forEach(function (c) {
			var s = byKey[c.key];
			var k = c.kind === "melee" || c.kind === "ranged" || (s && s.basic) ? "basic" : (s ? s.calc : "");
			if (k) {
				steps.push(k);
				casts.push({ t: Math.max(0, Math.round(c.t)), key: k });
			} else {
				var n = s ? s.name : c.key;
				if (missing.indexOf(n) < 0) missing.push(n);
			}
		});
		return { steps: steps, missing: missing, casts: casts };
	}

	// "s3 MA3 s4 RA2": the meter's own way of writing a rotation.
	function rotationText(run, win) {
		var parts = [];
		win.casts.forEach(function (c) {
			if (c.kind === "melee" || c.kind === "ranged") {
				var tag = c.kind === "melee" ? "MA" : "RA";
				var last = parts[parts.length - 1];
				if (last && last.tag === tag) last.n++;
				else parts.push({ tag: tag, n: 1 });
				return;
			}
			var info = (run.spells || []).filter(function (s) { return s.key === c.key; })[0];
			var slot = { "1": "s1", "2": "s2", "3": "s3", "4": "s4", "E": "s5", "Q": "s6" }[c.slotKey || (info && info.slotKey) || ""];
			parts.push({ text: slot || (info ? info.name : c.key) });
		});
		return parts.map(function (p) { return p.text || p.tag + p.n; }).join(" ");
	}

	function clockText(ms) {
		var s = Math.max(0, ms) / 1000;
		var m = Math.floor(s / 60);
		var rest = s - m * 60;
		return m + ":" + (rest < 10 ? "0" : "") + rest.toFixed(1);
	}

	root.DBB_METER = {
		FORMAT: FORMAT,
		WINDOWS: WINDOWS,
		ALIASES: ALIASES,
		parse: parse,
		stepsFor: stepsFor,
		rotationText: rotationText,
		clockText: clockText,
		calcKey: calcKey,
		_internal: { expandCasts: expandCasts, credit: credit, bestWindow: bestWindow, cleanHits: cleanHits, inferDiscipline: inferDiscipline }
	};
}(typeof window !== "undefined" ? window : this));
