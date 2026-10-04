/* Dungeon Blitz Build Calculator: page wiring. Math lives in engine.js. */
(function () {
	"use strict";

	var D = window.DBB_DATA;
	var E = window.DBB_ENGINE;
	var BUILDS_KEY = "dbb-saved-builds-v1";
	var LAST_KEY = "dbb-last-state-v1";
	var ELEMENT_LABEL = { "": "Unknown or neutral" };
	D.elements.forEach(function (e) { ELEMENT_LABEL[e] = e + " creature"; });

	var state;
	var compareId = "";
	var frame = null;
	var renderedClass = "";
	var queued = false;
	var toastTimer = null;

	/* ---------- small helpers ---------- */

	function $(id) { return document.getElementById(id); }

	function el(tag, attrs, kids) {
		var node = document.createElement(tag);
		Object.keys(attrs || {}).forEach(function (k) {
			var v = attrs[k];
			if (v == null || v === false) return;
			if (k === "text") node.textContent = v;
			else if (k === "class") node.className = v;
			else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2), v);
			else node.setAttribute(k, v === true ? "" : v);
		});
		[].concat(kids || []).forEach(function (kid) {
			if (kid == null || kid === false) return;
			node.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
		});
		return node;
	}

	function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

	function fmt(n) { return Math.round(n).toLocaleString("en-US"); }

	function pct(f, digits) {
		var d = digits == null ? 1 : digits;
		var v = Math.round(f * 100 * Math.pow(10, d)) / Math.pow(10, d);
		return v.toLocaleString("en-US", { maximumFractionDigits: d }) + "%";
	}

	function storeGet(key, fallback) {
		try {
			var raw = window.localStorage.getItem(key);
			return raw ? JSON.parse(raw) : fallback;
		} catch (e) { return fallback; }
	}

	function storeSet(key, value) {
		try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
	}

	function toB64(str) {
		return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}

	function fromB64(str) {
		var s = str.replace(/-/g, "+").replace(/_/g, "/");
		while (s.length % 4) s += "=";
		return decodeURIComponent(escape(atob(s)));
	}

	function toast(text) {
		var t = $("toast");
		t.textContent = text;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { t.textContent = ""; }, 2400);
	}

	/* ---------- state ---------- */

	function normalize(s) {
		var d = E.defaultState();
		s = s && typeof s === "object" ? s : {};
		var t = s.target || {};
		var out = {
			v: 1,
			talents: typeof s.talents === "string" && /^\d/.test(s.talents) ? s.talents : d.talents,
			gearMode: s.gearMode === "totals" ? "totals" : "pieces",
			gearTotals: Object.assign({}, d.gearTotals, s.gearTotals || {}),
			gear: {},
			charms: Object.assign({}, s.charms || {}),
			extra: Object.assign({}, d.extra, s.extra || {}),
			target: { element: D.elements.indexOf(t.element) >= 0 ? t.element : "", reduction: +t.reduction || 0, states: Object.assign({}, t.states || {}) },
			skillRank: Math.max(1, Math.min(10, Math.round(+s.skillRank) || 10))
		};
		D.gear.slots.forEach(function (slot) {
			var g = (s.gear || {})[slot.key] || d.gear[slot.key];
			out.gear[slot.key] = {
				rarity: g.rarity || "L",
				focus: g.focus || "Balanced",
				runes: Array.isArray(g.runes) ? g.runes.slice(0, 2) : [],
				skillRune: g.skillRune || "",
				magic: g.magic || ""
			};
		});
		return out;
	}

	function readHash() {
		var h = location.hash.replace(/^#/, "");
		if (!h) return null;
		if (h.indexOf("b=") === 0) {
			try { return normalize(JSON.parse(fromB64(h.slice(2)))); } catch (e) { return null; }
		}
		if (/^\d/.test(h)) {
			// An old talent calculator link: keep everything else, load these talents.
			var s = normalize(storeGet(LAST_KEY, null));
			s.talents = h;
			return s;
		}
		return null;
	}

	function shareUrl() {
		return location.href.split("#")[0] + "#b=" + toB64(JSON.stringify(state));
	}

	function persist() {
		storeSet(LAST_KEY, state);
		try { history.replaceState(null, "", "#b=" + toB64(JSON.stringify(state))); } catch (e) { /* ignore */ }
	}

	function currentClass() {
		return D.disciplines[E.decodeBuild(state.talents).discipline].cls;
	}

	function onChange() {
		persist();
		if (queued) return;
		queued = true;
		requestAnimationFrame(function () {
			queued = false;
			if (currentClass() !== renderedClass) renderGear();
			renderResults();
		});
	}

	/* ---------- talents frame ---------- */

	function setupFrame() {
		frame = $("talents-frame");
		frame.src = "talents/index.html#" + state.talents;
		window.addEventListener("message", function (event) {
			if (!frame || event.source !== frame.contentWindow) return;
			var data = event.data || {};
			if (data.type !== "dbb-talents") return;
			if (data.height) frame.style.height = Math.max(320, Math.ceil(data.height)) + "px";
			var build = String(data.build || "").replace(/^#/, "");
			if (/^\d/.test(build) && build !== state.talents) {
				state.talents = build;
				syncDisciplineSelect();
				onChange();
			}
		});
	}

	function loadTalentsIntoFrame() {
		if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: "dbb-load", build: state.talents }, "*");
	}

	/* ---------- discipline ---------- */

	function buildDisciplineSelect() {
		var sel = $("discipline");
		clear(sel);
		Object.keys(D.classes).forEach(function (cls) {
			var group = el("optgroup", { label: cls });
			D.disciplines.forEach(function (d) {
				if (d.cls === cls) group.appendChild(el("option", { value: d.id, text: d.name }));
			});
			sel.appendChild(group);
		});
		sel.addEventListener("change", function () {
			var id = +sel.value;
			if (id === E.decodeBuild(state.talents).discipline) return;
			state.talents = String(id);
			loadTalentsIntoFrame();
			onChange();
		});
		syncDisciplineSelect();
	}

	function syncDisciplineSelect() {
		$("discipline").value = String(E.decodeBuild(state.talents).discipline);
	}

	/* ---------- gear ---------- */

	function option(value, text, selected) {
		return el("option", { value: value, text: text, selected: selected ? true : null });
	}

	function selectField(label, options, value, onchange, disabled) {
		var sel = el("select", { disabled: disabled ? true : null });
		options.forEach(function (o) { sel.appendChild(option(o[0], o[1], o[0] === value)); });
		sel.addEventListener("change", function () { onchange(sel.value); });
		return el("label", { class: "field" }, [el("span", { class: "field-label", text: label }), sel]);
	}

	function slotStatsText(stats) {
		var parts = [];
		if (stats.attack) parts.push([fmt(stats.attack), " Atk"]);
		if (stats.expertise) parts.push([fmt(stats.expertise), " Exp"]);
		if (stats.defense) parts.push([fmt(stats.defense), " Def"]);
		var span = el("span", { class: "slot-stats" });
		parts.forEach(function (p, i) {
			if (i) span.appendChild(document.createTextNode("  "));
			span.appendChild(el("b", { text: p[0] }));
			span.appendChild(document.createTextNode(p[1]));
		});
		if (!parts.length) span.textContent = "No primary stats";
		return span;
	}

	function renderGear() {
		var cls = currentClass();
		renderedClass = cls;
		var grid = $("gear-grid");
		clear(grid);
		var rarityOpts = D.gear.rarities.map(function (r) { return [r.key, r.name]; });
		var focusOpts = D.gear.focuses.map(function (f) { return [f.key, f.name]; });
		var magicOpts = [["", "None"]].concat(D.gear.magicRunes.map(function (m) { return [m.key, m.name]; }));

		D.gear.slots.forEach(function (slot) {
			var g = state.gear[slot.key];
			var rarity = D.gear.rarities.filter(function (r) { return r.key === g.rarity; })[0] || D.gear.rarities[2];
			var runeOpts = [["", "None"]].concat((D.gear.procOptions[slot.type] || []).map(function (k) { return [k, D.runes[k].name]; }));
			var skillKeys = ((D.gear.skillRuneOptions[cls] || {})[slot.type]) || [];
			if (g.skillRune && skillKeys.indexOf(g.skillRune) < 0) g.skillRune = "";
			var skillOpts = [["", "None"]].concat(skillKeys.map(function (k) {
				var r = D.skillRunes[k];
				return [k, r ? r.desc || r.name : k];
			}));
			var stats = ((D.gear.stats[cls] || {})[slot.type] || {})[g.focus];
			stats = (stats && stats[rarity.key]) || { attack: 0, expertise: 0, defense: 0 };

			function set(key, idx) {
				return function (v) {
					if (idx != null) {
						g.runes = g.runes.slice();
						g.runes[idx] = v;
					} else {
						g[key] = v;
					}
					if (key === "rarity" || key === "focus") renderGear();
					onChange();
				};
			}

			var fields = el("div", { class: "slot-fields" }, [
				selectField("Rarity", rarityOpts, g.rarity, set("rarity")),
				state.gearMode === "pieces" ? selectField("Stat focus", focusOpts, g.focus, set("focus")) : null,
				selectField(slot.type === "Sword" ? "Critical rune" : "Rune", runeOpts, g.runes[0] || "", set("runes", 0)),
				rarity.procSlots > 1 ? selectField(slot.type === "Sword" ? "Second critical rune" : "Second rune", runeOpts, g.runes[1] || "", set("runes", 1)) : null,
				rarity.skillRune ? selectField("Skill rune", skillOpts, g.skillRune, set("skillRune")) : null,
				selectField("Find rune", magicOpts, g.magic, set("magic"))
			]);
			var head = el("div", { class: "slot-head" }, [
				el("span", { class: "slot-name", text: slot.name }),
				state.gearMode === "pieces" ? slotStatsText(stats) : null
			]);
			grid.appendChild(el("div", { class: "slot" }, [head, fields]));
		});
		renderGearMode();
	}

	function renderGearMode() {
		var mode = state.gearMode;
		document.querySelectorAll("[data-gear-mode]").forEach(function (b) {
			b.setAttribute("aria-checked", b.getAttribute("data-gear-mode") === mode ? "true" : "false");
		});
		var totals = $("gear-totals");
		totals.hidden = mode !== "totals";
		if (mode === "totals" && !totals.firstChild) {
			[["attack", "Gear Attack"], ["expertise", "Gear Expertise"], ["defense", "Gear Defense"]].forEach(function (f) {
				var input = el("input", { type: "number", min: "0", step: "1", inputmode: "numeric", value: state.gearTotals[f[0]] || 0 });
				input.addEventListener("input", function () { state.gearTotals[f[0]] = Math.max(0, +input.value || 0); onChange(); });
				totals.appendChild(el("label", { class: "field" }, [el("span", { class: "field-label", text: f[1] }), input]));
			});
		}
	}

	function setupGearMode() {
		document.querySelectorAll("[data-gear-mode]").forEach(function (b) {
			b.addEventListener("click", function () {
				state.gearMode = b.getAttribute("data-gear-mode");
				renderGear();
				onChange();
			});
		});
	}

	/* ---------- charms ---------- */

	function charmValueText(c) {
		if (c.key === "critChance") return "+" + pct(c.value, 1) + " crit stat, about " + pct(c.value * 0.15, 1) + " real";
		if (c.unit === "pct") return "+" + pct(c.value, 1) + " " + c.name;
		return "+" + fmt(c.value) + " " + c.name;
	}

	function renderCharms() {
		var list = $("charm-list");
		clear(list);
		D.charms.forEach(function (c) {
			var input = el("input", { type: "number", min: "0", max: "18", step: "1", inputmode: "numeric", "aria-label": c.name + " charms", value: state.charms[c.key] || 0 });
			function setCount(n) {
				n = Math.max(0, Math.min(18, Math.round(+n) || 0));
				state.charms[c.key] = n;
				input.value = n;
				onChange();
			}
			input.addEventListener("input", function () { setCount(input.value); });
			var minus = el("button", { type: "button", "aria-label": "One fewer " + c.name + " charm", text: "−", onclick: function () { setCount((state.charms[c.key] || 0) - 1); } });
			var plus = el("button", { type: "button", "aria-label": "One more " + c.name + " charm", text: "+", onclick: function () { setCount((state.charms[c.key] || 0) + 1); } });
			list.appendChild(el("div", { class: "charm" }, [
				el("span", { class: "charm-name", text: c.name }),
				el("span", { class: "stepper" }, [minus, input, plus]),
				el("span", { class: "charm-value", text: charmValueText(c) + " each" })
			]));
		});
	}

	/* ---------- other bonuses, target ---------- */

	function numberField(label, value, onInput, attrs) {
		var input = el("input", Object.assign({ type: "number", step: "any", value: value || 0, inputmode: "decimal" }, attrs || {}));
		input.addEventListener("input", function () { onInput(+input.value || 0); });
		return el("label", { class: "field" }, [el("span", { class: "field-label", text: label }), input]);
	}

	function renderExtra() {
		var box = $("extra-fields");
		clear(box);
		[["attack", "Attack"], ["expertise", "Expertise"], ["defense", "Defense"], ["hp", "Max HP"],
			["critChance", "Critical Chance stat (%)"], ["critPower", "Critical Power (%)"], ["attackSpeed", "Attack Speed (%)"]
		].forEach(function (f) {
			box.appendChild(numberField(f[1], state.extra[f[0]], function (v) { state.extra[f[0]] = v; onChange(); }));
		});
	}

	function renderTarget() {
		var box = $("target-fields");
		clear(box);
		var elOpts = [""].concat(D.elements).map(function (e) { return [e, ELEMENT_LABEL[e]]; });
		box.appendChild(selectField("Enemy type", elOpts, state.target.element, function (v) { state.target.element = v; onChange(); }));
		box.appendChild(numberField("Enemy damage reduction (%)", state.target.reduction, function (v) {
			state.target.reduction = Math.max(0, Math.min(100, v));
			onChange();
		}, { min: "0", max: "100" }));
	}

	function renderSituations(r) {
		var box = $("situations");
		clear(box);
		var used = Object.keys(r.conditionsUsed);
		if (!used.length) {
			box.appendChild(el("p", { class: "panel-note", text: "No situational talents in this build." }));
			return;
		}
		box.appendChild(el("h3", { text: "Situational talents" }));
		var sources = {};
		r.talents.critCond.concat(r.talents.dmgCond, r.talents.dotVs).forEach(function (c) {
			(sources[c.cond] = sources[c.cond] || []).push(c.source);
		});
		used.forEach(function (cond) {
			var input = el("input", { type: "checkbox", checked: state.target.states[cond] ? true : null });
			input.addEventListener("change", function () { state.target.states[cond] = input.checked; onChange(); });
			var names = (sources[cond] || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
			box.appendChild(el("label", { class: "check" }, [input, el("span", {}, [
				E.CONDITIONS[cond],
				el("small", { text: "Turns on " + names.join(", ") })
			])]));
		});
	}

	/* ---------- saved builds, compare ---------- */

	function savedBuilds() { return storeGet(BUILDS_KEY, []); }

	function renderBuilds() {
		var list = $("build-list");
		clear(list);
		var builds = savedBuilds();
		if (!builds.length) list.appendChild(el("li", { class: "empty", text: "No saved builds yet." }));
		builds.forEach(function (b) {
			var disc = D.disciplines[E.decodeBuild(b.state.talents).discipline];
			list.appendChild(el("li", {}, [
				el("span", { class: "build-name", text: b.name }),
				el("button", { type: "button", class: "btn btn-small", text: "Load", onclick: function () {
					state = normalize(b.state);
					loadTalentsIntoFrame();
					renderInputs();
					syncDisciplineSelect();
					onChange();
					toast("Loaded " + b.name);
				} }),
				el("button", { type: "button", class: "btn btn-small", text: "Delete", onclick: function () {
					storeSet(BUILDS_KEY, savedBuilds().filter(function (x) { return x.id !== b.id; }));
					if (compareId === b.id) compareId = "";
					renderBuilds();
					onChange();
				} }),
				el("span", { class: "build-meta", text: disc.name + ", saved " + new Date(b.saved).toLocaleString() })
			]));
		});
		var sel = $("compare-select");
		clear(sel);
		sel.appendChild(option("", "Nothing", !compareId));
		builds.forEach(function (b) { sel.appendChild(option(b.id, b.name, b.id === compareId)); });
	}

	function setupBuilds() {
		$("save-form").addEventListener("submit", function (e) {
			e.preventDefault();
			var input = $("save-name");
			var disc = D.disciplines[E.decodeBuild(state.talents).discipline];
			var name = input.value.trim() || disc.name + " build";
			var builds = savedBuilds();
			var existing = builds.filter(function (b) { return b.name === name; })[0];
			var entry = { id: existing ? existing.id : "b" + Date.now().toString(36), name: name, saved: Date.now(), state: JSON.parse(JSON.stringify(state)) };
			builds = builds.filter(function (b) { return b.name !== name; }).concat([entry]);
			storeSet(BUILDS_KEY, builds);
			input.value = "";
			renderBuilds();
			toast("Saved " + name);
		});
		$("compare-select").addEventListener("change", function () {
			compareId = this.value;
			renderResults();
		});
		$("copy-link").addEventListener("click", function () {
			var url = shareUrl();
			if (navigator.clipboard && window.isSecureContext) {
				navigator.clipboard.writeText(url).then(function () { toast("Link copied"); }, function () { window.prompt("Copy this link", url); });
			} else {
				window.prompt("Copy this link", url);
			}
		});
	}

	function compareResult() {
		if (!compareId) return null;
		var b = savedBuilds().filter(function (x) { return x.id === compareId; })[0];
		if (!b) return null;
		return { name: b.name, result: E.compute(normalize(b.state)) };
	}

	/* ---------- results ---------- */

	function deltaNode(now, then, formatter, unitless) {
		var d = now - then;
		if (Math.abs(d) < 1e-9) return el("span", { class: "delta dim", text: "no change" });
		var f = formatter || fmt;
		var text = (d > 0 ? "+" : "−") + f(Math.abs(d));
		if (!unitless && then) text += " (" + (d > 0 ? "+" : "−") + pct(Math.abs(d / then), 1) + ")";
		return el("span", { class: "delta " + (d > 0 ? "up" : "down"), text: text });
	}

	function howText(parts, labels) {
		var out = [];
		Object.keys(labels).forEach(function (k) {
			var v = parts[k];
			if (v) out.push((out.length ? (v < 0 ? " − " : " + ") : "") + labels[k](Math.abs(v)));
		});
		return out.join("");
	}

	function renderSheet(r, cmp) {
		var s = r.stats;
		var b = r.breakdown;
		var flat = function (label) { return function (v) { return fmt(v) + " " + label; }; };
		var statParts = { base: flat("base"), gear: flat("gear"), charms: flat("charms"), talents: flat("talents"), extra: flat("other"), fromExpertise: flat("from Expertise") };
		var pctParts = function (labels) {
			var o = {};
			Object.keys(labels).forEach(function (k) { o[k] = function (v) { return pct(v, 1) + " " + labels[k]; }; });
			return o;
		};
		var rows = [
			["Max HP", "hp", fmt, howText(b.hp, statParts) + (b.hp.percent ? ", then +" + pct(b.hp.percent, 0) + " from runes" : "")],
			["Attack", "attack", fmt, howText(b.attack, statParts)],
			["Expertise", "expertise", fmt, howText(b.expertise, statParts)],
			["Defense", "defense", fmt, howText(b.defense, statParts)],
			["Critical chance", "critReal", function (v) { return pct(v, 2); }, "15% × (1 + " + pct(s.critStat, 1) + " stat" + (s.critStat ? ": " + howText(b.critStat, pctParts({ gear: "gear", charms: "charms", talents: "talents", extra: "other", situational: "situational" })) : "") + ")"],
			["Critical power", "critPower", function (v) { return pct(v, 1); }, howText(b.critPower, pctParts({ gear: "gear", charms: "charms", extra: "other" }))],
			["Damage per critical hit", "critDamagePct", function (v) { return pct(v / 100, 1); }, "of the hit that crits, from weapon runes"],
			["Attack speed", "attackSpeed", function (v) { return "+" + pct(v, 0); }, ""],
			["Recovery", "recovery", function (v) { return "+" + pct(v, 1); }, ""],
			["Tenacity", "tenacity", function (v) { return "+" + pct(v, 0); }, ""],
			["Move speed", "moveSpeed", function (v) { return "+" + pct(v, 1); }, ""],
			["Gear find", "gearFind", function (v) { return "+" + pct(v, 0); }, ""],
			["Gold find", "goldFind", function (v) { return "+" + pct(v, 0); }, ""],
			["Material find", "materialFind", function (v) { return "+" + pct(v, 0); }, ""]
		];
		var table = $("stat-table");
		clear(table);
		var head = el("tr", {}, [el("th", { scope: "col", text: "Stat" }), el("th", { scope: "col", text: "This build" })]);
		if (cmp) head.appendChild(el("th", { scope: "col", text: cmp.name }));
		table.appendChild(el("thead", {}, head));
		var body = el("tbody");
		rows.forEach(function (row) {
			var v = s[row[1]];
			var always = ["hp", "attack", "expertise", "defense", "critReal", "critPower", "critDamagePct"].indexOf(row[1]) >= 0;
			var cv = cmp ? cmp.result.stats[row[1]] : null;
			if (!always && !v && !cv) return;
			var cell = el("td", {}, [el("span", { class: "value", text: row[2](v) })]);
			if (cmp) cell.appendChild(deltaNode(v, cv, row[2] === fmt ? fmt : function (x) { return row[2](x).replace(/^\+/, ""); }, row[2] !== fmt));
			var tr = el("tr", {}, [el("th", { scope: "row" }, [row[0], row[3] ? el("span", { class: "how", text: row[3] }) : null]), cell]);
			if (cmp) tr.appendChild(el("td", { class: "dim", text: row[2](cv) }));
			body.appendChild(tr);
		});
		var slayRows = [];
		D.elements.forEach(function (e) {
			if (s.slay[e]) slayRows.push(e + " Slayer +" + pct(s.slay[e], 0));
			if (s.resist[e]) slayRows.push("Resist " + e + " +" + pct(s.resist[e], 0));
		});
		if (slayRows.length) {
			body.appendChild(el("tr", {}, [el("th", { scope: "row", text: "Elemental" }), el("td", { colspan: cmp ? 2 : 1, class: "dim", text: slayRows.join(", ") })]));
		}
		table.appendChild(body);
		$("sheet-sub").textContent = r.discipline.name + " " + r.cls + ", level 50, " + r.talents.points + " talent points";
	}

	function renderCrit(r, cmp) {
		var box = $("crit-body");
		clear(box);
		var s = r.stats;
		if (!r.crit.runes.length) {
			box.appendChild(el("p", { class: "panel-note", text: "No critical rune on the main hand, so critical hits add nothing. Pick one in Gear." }));
		} else {
			var t = el("table", { class: "data-table" }, [
				el("thead", {}, el("tr", {}, [el("th", { text: "Weapon rune" }), el("th", { text: "Base" }), el("th", { text: "Talents" }), el("th", { text: "Crit power" }), el("th", { text: "Per crit" })]))
			]);
			var body = el("tbody");
			r.crit.runes.forEach(function (cr) {
				body.appendChild(el("tr", {}, [
					el("td", {}, [cr.name, cr.note ? el("span", { class: "how dim", text: " " + cr.note }) : null]),
					el("td", { text: cr.heal ? "heal" : pct(cr.base / 100, 1) }),
					el("td", { text: cr.heal ? "" : (cr.talentBonus ? "×" + (1 + cr.talentBonus).toFixed(2) : "") }),
					el("td", { text: cr.heal ? "" : "+" + pct(cr.fromPower / 100, 1) }),
					el("td", { class: "value", text: cr.heal ? "0%" : pct(cr.pct / 100, 1) })
				]));
			});
			t.appendChild(body);
			box.appendChild(t);
		}
		var line = el("p", { class: "panel-note" });
		line.style.marginTop = "10px";
		line.appendChild(document.createTextNode("Skill hits crit " + pct(s.critReal, 2) + " of the time for " + pct(s.critDamagePct / 100, 1) + " extra, so they average "));
		line.appendChild(el("span", { class: "value", text: "×" + s.critFactor.toFixed(3) }));
		line.appendChild(document.createTextNode("."));
		if (cmp) line.appendChild(el("span", { class: "dim", text: " " + cmp.name + ": ×" + cmp.result.stats.critFactor.toFixed(3) + "." }));
		box.appendChild(line);
		var cond = r.crit.conditional;
		if (cond.length) {
			var ul = el("ul", { class: "note-list" });
			cond.forEach(function (c) {
				ul.appendChild(el("li", { text: c.source + ": +" + pct(c.value, 0) + " Critical Chance stat when " + E.CONDITIONS[c.cond].toLowerCase() + (c.active ? " (counted)" : " (not counted, turn it on under Target and situation)") }));
			});
			box.appendChild(ul);
		}
	}

	function findSkill(res, ability) {
		if (!res) return null;
		for (var i = 0; i < res.skills.length; i++) {
			for (var j = 0; j < res.skills[i].skills.length; j++) {
				if (res.skills[i].skills[j].ability === ability) return res.skills[i].skills[j];
			}
		}
		return null;
	}

	function renderSkills(r, cmp) {
		var box = $("skills-body");
		clear(box);
		if (r.basics.length) {
			box.appendChild(el("h3", { class: "group-title", text: "Basic attacks" }));
			r.basics.forEach(function (b) {
				box.appendChild(el("p", { class: "panel-note" }, [
					b.name + ": ",
					el("span", { class: "value", text: fmt(b.perHit) }),
					" per hit" + (b.thirdCrits ? ", the 3rd hit can crit, averaging " + fmt(b.avgPerHit) + " per hit." : ", these shots do not crit.")
				]));
			});
		}
		r.skills.forEach(function (group) {
			box.appendChild(el("h3", { class: "group-title", text: group.label }));
			group.skills.forEach(function (sk) {
				var other = cmp ? findSkill(cmp.result, sk.ability) : null;
				var totalCell = el("span", { class: "skill-total" }, [
					sk.total ? el("span", { class: "value", text: fmt(sk.total) }) : el("span", { class: "dim", text: "no damage" }),
					other && (sk.total || other.total) ? deltaNode(sk.total, other.total) : null
				]);
				var bar = el("span", { class: "split" + (sk.total ? "" : " utility"), "aria-hidden": "true" });
				if (sk.total) {
					var dPct = Math.round(sk.directShare * 1000) / 10;
					bar.appendChild(el("span", { class: "seg-direct", style: "width:" + dPct + "%" }));
					bar.appendChild(el("span", { class: "seg-dot", style: "width:" + (100 - dPct) + "%" }));
				}
				var detail = el("div", { class: "skill-detail" });
				if (sk.desc) detail.appendChild(el("span", { text: sk.desc }));
				if (sk.hits) {
					var perHit = sk.perHit.every(function (h) { return Math.abs(h - sk.perHit[0]) < 0.5; })
						? sk.hits + " hit" + (sk.hits > 1 ? "s" : "") + " × " + fmt(sk.perHit[0])
						: sk.perHit.map(fmt).join(" + ");
					detail.appendChild(el("span", {}, [el("strong", { text: "Direct: " }), perHit + " = " + fmt(sk.direct) + ", with crits " + fmt(sk.expected)]));
				}
				sk.dots.forEach(function (d) {
					detail.appendChild(el("span", {}, [el("strong", { text: d.name + ": " }), d.stacks + " stack" + (d.stacks > 1 ? "s" : "") + " per cast, " + fmt(d.amount) + " over the DoT's duration"]));
				});
				if (sk.runeBoost) detail.appendChild(el("span", { text: "Includes +" + sk.runeBoost.toFixed(2) + " damage multiplier from your skill rune." }));
				if (sk.total) detail.appendChild(el("span", { text: pct(sk.directShare, 0) + " from Attack, " + pct(1 - sk.directShare, 0) + " from Expertise." }));
				else detail.appendChild(el("span", { text: "No direct damage or damage over time in the game data: a buff, summon or utility skill." }));
				box.appendChild(el("details", { class: "skill" }, [
					el("summary", {}, [
						el("span", { class: "skill-name" }, [sk.name, el("span", { class: "rank", text: "rank " + sk.rank })]),
						totalCell,
						bar
					]),
					detail
				]));
			});
		});
		if (r.runeNotes.length) {
			box.appendChild(el("p", { class: "panel-note", text: "Skill runes on your gear: " + r.runeNotes.join("; ") + "." }));
		}
	}

	function renderDots(r, cmp) {
		var box = $("dots-body");
		clear(box);
		if (!r.dots.length) {
			box.appendChild(el("p", { class: "panel-note", text: "None of this discipline's skills apply damage over time at rank " + r.rank + "." }));
			return;
		}
		var t = el("table", { class: "data-table" }, [el("thead", {}, el("tr", {}, [
			el("th", { text: "DoT" }), el("th", { text: "Per tick, 1 stack" }), el("th", { text: "Stacks" }), el("th", { text: "Per second at max" })
		]))]);
		var body = el("tbody");
		r.dots.forEach(function (d) {
			var other = null;
			if (cmp) cmp.result.dots.forEach(function (x) { if (x.buff === d.buff) other = x; });
			var pctText = pct(d.basePct / 100, 1) + (d.talentPct ? " + " + pct(d.talentPct / 100, 1) + " talents" : "") + " of Expertise" + (d.vsMult !== 1 ? ", ×" + d.vsMult.toFixed(2) + " " + d.vsNotes.join(", ") : "");
			body.appendChild(el("tr", {}, [
				el("td", {}, [d.name, el("span", { class: "how dim", text: " " + pctText + ". From " + d.from.join(", ") + "." })]),
				el("td", { text: fmt(d.perTick) }),
				el("td", { text: d.maxStacks }),
				el("td", {}, [el("span", { class: "value", text: fmt(d.fullStackTick) }), other ? deltaNode(d.fullStackTick, other.fullStackTick) : null])
			]));
		});
		t.appendChild(body);
		box.appendChild(t);
		box.appendChild(el("p", { class: "panel-note", text: "Ticks once a second. DoTs ignore enemy defense, weakens and slayer runes." }));
	}

	function renderTalentFx(r) {
		var box = $("talent-fx");
		clear(box);
		if (!r.talents.stones.length) {
			box.appendChild(el("p", { class: "panel-note", text: "No talentstones socketed yet." }));
			return;
		}
		var ul = el("ul", { class: "fx-list" });
		r.talents.stones.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (s) {
			ul.appendChild(el("li", {}, [
				el("span", { class: "fx-name", text: s.name + " " + s.level + "/5" }),
				el("span", { class: "fx-text" + (s.info ? "" : " on"), text: s.text + (s.info ? " (no damage effect)" : "") })
			]));
		});
		box.appendChild(ul);
	}

	function renderMethod(r) {
		var box = $("method");
		if (box.firstChild) return;
		[
			["Base stats", "Level 50 with no gear, talents or charms: 68,109 HP, 3,914 Attack, 2,655 Expertise, and 1,344 Defense for rogues, 1,008 for mages, 1,680 for paladins."],
			["Gear", "Each piece's Attack, Expertise and Defense come from the game's gear tables for your class, slot, stat focus and rarity at level 50, scaled by 912/1575 so a legendary Attack main hand gives 912 Attack. Runes use the game's values: Critical Chance +10% stat, Critical Power +10%, Attack Speed +5%, Health Bonus +15% max HP, Tenacity +15%, Recovery +10%, slayer +10% damage, resist +10%."],
			["Critical hits", "Real chance is 15% × (1 + Critical Chance stat). A crit adds a percentage of the hit: Heavy Blow 60%, Hemorrhage 112.5%, elemental runes 100% against their opposite, 50% neutral, 25% against their own element. Each damaging critical rune also adds half your Critical Power. Talents such as Heavy Blows, Hemorrhage and Element Mastery multiply their rune."],
			["Skills", "Each hit deals Attack × the skill's damage multiplier at the chosen rank, from the game's power data. Multi-strike skills list one multiplier per strike. Every skill hit can crit, so the expected value uses the average crit multiplier. Skill runes add their multiplier to the matching skill."],
			["Damage over time", "Per tick per stack is a share of Expertise: Bleed 6%, rogue poison 60%, chaos and mage poison 30%, Bind 30%, Burn 9%, Chilblains 15%, Ignite 15%, Holy fire 30%, Plague 40% at rank 1. Other DoTs use the game formula DoTDamage × 1.5 ÷ ticks. Talents that raise a DoT add to its DoTDamage the way the game does, and stack talents raise the cap. A skill's DoT is counted once per cast, up to the stack cap."],
			["Situational talents", "Bonuses that need a condition, such as Opportunist in Stealth, only count when you turn that situation on under Target and situation."],
			["Still approximate", "Enemy defense is a flat reduction you enter, slayer runes multiply direct hits against that creature type, and damage-over-time skills assume every listed stack lands. Check skill numbers against the training dummy before trusting small differences."]
		].forEach(function (p) {
			box.appendChild(el("p", {}, [el("strong", { text: p[0] + ". " }), p[1]]));
		});
	}

	function renderResults() {
		var r = E.compute(state);
		var cmp = compareResult();
		renderSheet(r, cmp);
		renderCrit(r, cmp);
		renderSkills(r, cmp);
		renderDots(r, cmp);
		renderTalentFx(r);
		renderSituations(r);
		renderMethod(r);
		var charmCount = $("charm-count");
		charmCount.textContent = r.charms.count + " of " + r.charmSlots + " charm sockets used";
		charmCount.className = "panel-note charm-count" + (r.charms.count > r.charmSlots ? " over" : "");
		var note = $("gear-note");
		note.textContent = state.gearMode === "pieces"
			? "Gear adds " + fmt(r.gear.attack) + " Attack, " + fmt(r.gear.expertise) + " Expertise and " + fmt(r.gear.defense) + " Defense."
			: "Enter the Attack, Expertise and Defense your gear adds in total. Runes are still set per piece.";
	}

	function renderSkillRank() {
		var sel = $("skill-rank");
		clear(sel);
		for (var i = 10; i >= 1; i--) sel.appendChild(option(String(i), String(i), i === state.skillRank));
		sel.onchange = function () { state.skillRank = +sel.value; onChange(); };
	}

	function renderInputs() {
		renderGear();
		renderCharms();
		renderExtra();
		renderTarget();
		renderSkillRank();
		renderBuilds();
	}

	function init() {
		if (!D || !E) return;
		state = readHash() || normalize(storeGet(LAST_KEY, null));
		buildDisciplineSelect();
		setupGearMode();
		setupBuilds();
		setupFrame();
		renderInputs();
		renderResults();
		persist();
		window.addEventListener("hashchange", function () {
			var s = readHash();
			if (!s || JSON.stringify(s) === JSON.stringify(state)) return;
			state = s;
			loadTalentsIntoFrame();
			syncDisciplineSelect();
			renderInputs();
			renderResults();
		});
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
}());
