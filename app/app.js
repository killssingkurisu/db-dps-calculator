/* Dungeon Blitz DPS Calculator: page wiring. Math lives in engine.js. */
(function () {
	"use strict";

	var D = window.DBB_DATA;
	var E = window.DBB_ENGINE;
	var LIB = window.DBB_LIBRARY;
	var DRIVE = window.DBB_DRIVE;
	var INV_KEY = "dbb-inventory-selected-v1";
	var SCANNER_URL = "https://github.com/killssingkurisu/db-inventory-scanner/releases/latest";
	var LAST_KEY = "dbb-last-state-v1";
	var TAB_KEY = "dbb-sheet-tab-v1";
	var WINDOWS = [15, 30, 60];
	var ELEMENT_LABEL = { "": "Unknown or neutral" };
	D.elements.forEach(function (e) { ELEMENT_LABEL[e] = e + " creature"; });
	var BREAK_LABEL = { "": "None", "20": "20%", "35": "35%", "50": "50%", "20+35": "20% + 35%", "20+50": "20% + 50%", "35+50": "35% + 50%" };
	var SLOT_LABEL = { 1: "Slot 1", 2: "Slot 2", 3: "Slot 3" };

	var POPOUT = /[?&]view=combos(&|$)/.test(location.search);
	var state;
	var compareId = "";
	var frame = null;
	var renderedClass = "";
	var queued = false;
	var toastTimer = null;
	var sheetTab = "character";
	var lastResult = null;

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

	function secs(ms, digits) {
		var d = digits == null ? 2 : digits;
		return (ms / 1000).toFixed(d) + " s";
	}

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

	function cleanCharms(c) {
		var out = {};
		Object.keys(c || {}).forEach(function (k) {
			var info = E.charmInfo(k);
			var n = Math.max(0, Math.min(99, Math.floor(+c[k] || 0)));
			if (info && n) out[info.key] = (out[info.key] || 0) + n;
		});
		return out;
	}

	function normalize(s) {
		var d = E.defaultState();
		s = s && typeof s === "object" ? s : {};
		var t = s.target || {};
		var out = {
			v: 2,
			talents: typeof s.talents === "string" && /^\d/.test(s.talents) ? s.talents : d.talents,
			gearMode: s.gearMode === "totals" ? "totals" : "pieces",
			gearTotals: Object.assign({}, d.gearTotals, s.gearTotals || {}),
			gear: {},
			charms: cleanCharms(s.charms),
			extra: Object.assign({}, d.extra, s.extra || {}),
			target: {
				element: D.elements.indexOf(t.element) >= 0 ? t.element : "",
				reduction: +t.reduction || 0,
				armorBane: clamp(Math.round(+t.armorBane || 0), 0, E.ARMOR_BANE_MAX),
				armorBreak: Object.prototype.hasOwnProperty.call(E.ARMOR_BREAKS, t.armorBreak) ? t.armorBreak : "",
				scorch: clamp(Math.round(+t.scorch || 0), 0, 30),
				states: Object.assign({}, t.states || {})
			},
			skillRank: clamp(Math.round(+s.skillRank) || 10, 1, 10),
			comboWindow: WINDOWS.indexOf(+s.comboWindow) >= 0 ? +s.comboWindow : E.DEFAULT_WINDOW_S,
			comboMode: s.comboMode === "burst" ? "burst" : "mana",
			customCombo: Array.isArray(s.customCombo) ? s.customCombo.filter(function (k) { return typeof k === "string" && /^[A-Za-z]+$/.test(k); }).slice(0, 20) : [],
			selectedCombo: typeof s.selectedCombo === "string" ? s.selectedCombo : ""
		};
		D.gear.slots.forEach(function (slot) {
			var g = (s.gear || {})[slot.key] || d.gear[slot.key];
			var piece = {
				rarity: g.rarity || "L",
				focus: g.focus || "Balanced",
				runes: Array.isArray(g.runes) ? g.runes.slice(0, 2) : [],
				skillRune: g.skillRune || "",
				magic: g.magic || ""
			};
			// A piece equipped from a scan keeps its name and the stats the game showed.
			if (typeof g.item === "string" && g.item) piece.item = g.item.slice(0, 80);
			var st = E.scannedStats(g);
			if (st) piece.stats = st;
			out.gear[slot.key] = piece;
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

	// Links always open the full calculator, even when copied from the pop-out combo window.
	function shareUrl() {
		return location.origin + location.pathname + "#b=" + toB64(JSON.stringify(state));
	}

	function persist() {
		storeSet(LAST_KEY, state);
		try { history.replaceState(null, "", "#b=" + toB64(JSON.stringify(state))); } catch (e) { /* ignore */ }
		var full = document.getElementById("full-link");
		if (full) full.href = location.pathname + "#b=" + toB64(JSON.stringify(state));
	}

	function currentDisc() {
		return D.disciplines[E.decodeBuild(state.talents).discipline];
	}

	function currentClass() { return currentDisc().cls; }

	function onChange() {
		persist();
		if (queued) return;
		queued = true;
		requestAnimationFrame(function () {
			queued = false;
			if (!POPOUT && currentClass() !== renderedClass) { renderGear(); renderInventory(); }
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
			state.selectedCombo = "";
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

	function slotStatsText(stats, scanned) {
		var parts = [];
		if (stats.attack) parts.push([fmt(stats.attack), " Atk"]);
		if (stats.expertise) parts.push([fmt(stats.expertise), " Exp"]);
		if (stats.defense) parts.push([fmt(stats.defense), " Def"]);
		var span = el("span", { class: "slot-stats" + (scanned ? " scanned" : ""),
			title: scanned ? "As the game showed it, from your scan" : "The game's table value for this rarity and stat focus at level 50" });
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
			var scanned = E.scannedStats(g);
			var stats = scanned || E.tableStats(cls, slot.type, g.focus, rarity.key);

			function set(key, idx) {
				return function (v) {
					if (idx != null) {
						g.runes = g.runes.slice();
						g.runes[idx] = v;
					} else {
						g[key] = v;
					}
					// A changed piece is no longer the scanned item. Runes don't move its
					// Attack, Expertise and Defense, but a new rarity or stat focus does.
					var wasItem = !!g.item;
					delete g.item;
					if (key === "rarity" || key === "focus") delete g.stats;
					if (key === "rarity" || key === "focus" || wasItem) {
						renderGear();
						renderInventory();
					}
					onChange();
				};
			}

			function useTable() {
				delete g.stats;
				delete g.item;
				renderGear();
				renderInventory();
				onChange();
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
				state.gearMode === "pieces" ? slotStatsText(stats, !!scanned) : null
			]);
			var item = (g.item || scanned) ? el("div", { class: "slot-item" }, [
				el("span", { class: "slot-item-name rarity-" + rarity.key, text: g.item || "Scanned piece" }),
				scanned && state.gearMode === "pieces" ? el("span", { class: "slot-item-note", text: "stats from your scan" }) : null,
				scanned && state.gearMode === "pieces" ? el("button", { type: "button", class: "link-btn", text: "Use table stats", onclick: useTable,
					title: "Use the game's table values for this rarity and stat focus instead" }) : null
			]) : null;
			grid.appendChild(el("div", { class: "slot" + (scanned ? " has-scan" : "") }, [head, item, fields]));
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
		clear(totals);
		if (mode === "totals") {
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

	function statValueText(stat, value) {
		var c = D.charms.filter(function (x) { return x.stat === stat; })[0];
		var name = c ? c.name : stat;
		if (stat === "critChance") return "+" + pct(value, 1) + " crit stat (about " + pct(value * 0.15, 2) + " real)";
		if (c && c.unit === "pct") return "+" + pct(value, 1) + " " + name;
		return "+" + fmt(value) + " " + name;
	}

	function charmValueText(info) {
		return Object.keys(info.stats).map(function (st) { return statValueText(st, info.stats[st]); }).join(", ");
	}

	function charmRow(key, removable) {
		var info = E.charmInfo(key);
		var input = el("input", { type: "number", min: "0", max: "18", step: "1", inputmode: "numeric", "aria-label": info.name + " charms", value: state.charms[key] || 0 });
		function setCount(n) {
			n = clamp(Math.round(+n) || 0, 0, 18);
			if (n) state.charms[key] = n;
			else delete state.charms[key];
			input.value = n;
			onChange();
		}
		input.addEventListener("input", function () { setCount(input.value); });
		var minus = el("button", { type: "button", "aria-label": "One fewer " + info.name, text: "−", onclick: function () { setCount((state.charms[key] || 0) - 1); } });
		var plus = el("button", { type: "button", "aria-label": "One more " + info.name, text: "+", onclick: function () { setCount((state.charms[key] || 0) + 1); } });
		var title = info.special ? info.name : info.label;
		var sub = info.special ? "" : info.name + (info.rank < E.CHARM_MAX_RANK ? ", rank " + info.rank : "");
		return el("div", { class: "charm" + (removable ? " charm-extra" : "") }, [
			el("span", { class: "charm-name" }, [title, sub ? el("small", { text: sub }) : null]),
			el("span", { class: "stepper" }, [minus, input, plus]),
			el("span", { class: "charm-value", text: charmValueText(info) + " each" })
		]);
	}

	function renderCharms() {
		var list = $("charm-list");
		clear(list);
		D.charms.forEach(function (c) { list.appendChild(charmRow(c.key, false)); });
		// Lower ranks and special charms, from a scan or added by hand.
		Object.keys(state.charms).filter(function (k) {
			var info = E.charmInfo(k);
			return info && (info.special || info.rank < E.CHARM_MAX_RANK);
		}).sort().forEach(function (k) { list.appendChild(charmRow(k, true)); });

		var typeSel = el("select", { "aria-label": "Charm" });
		D.charms.forEach(function (c) { typeSel.appendChild(option(c.key, c.name + " (" + c.gem + ")", false)); });
		(D.specialCharms || []).forEach(function (c) { typeSel.appendChild(option(c.key, c.name, false)); });
		var rankSel = el("select", { "aria-label": "Rank" });
		for (var r = E.CHARM_MAX_RANK; r >= 1; r--) rankSel.appendChild(option(String(r), r + " · " + (D.charmRanks[r - 1] || ""), r === E.CHARM_MAX_RANK));
		function syncRank() { rankSel.disabled = !D.charms.some(function (c) { return c.key === typeSel.value; }); }
		typeSel.addEventListener("change", syncRank);
		syncRank();
		var add = el("button", { type: "button", class: "btn btn-small", text: "Add", onclick: function () {
			var key = rankSel.disabled ? typeSel.value : typeSel.value + "@" + rankSel.value;
			var info = E.charmInfo(key);
			if (!info) return;
			state.charms[info.key] = (state.charms[info.key] || 0) + 1;
			renderCharms();
			onChange();
		} });
		list.appendChild(el("div", { class: "charm-add" }, [
			el("span", { class: "field-label", text: "Add a lower-rank or special charm" }),
			el("span", { class: "charm-add-row" }, [typeSel, rankSel, add])
		]));
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
			state.target.reduction = clamp(v, 0, 100);
			onChange();
		}, { min: "0", max: "100" }));
		box.appendChild(numberField("Armor Bane stacks (0–7)", state.target.armorBane, function (v) {
			state.target.armorBane = clamp(Math.round(v), 0, E.ARMOR_BANE_MAX);
			onChange();
		}, { min: "0", max: String(E.ARMOR_BANE_MAX), step: "1", inputmode: "numeric" }));
		var breakOpts = Object.keys(E.ARMOR_BREAKS).map(function (k) { return [k, BREAK_LABEL[k] || k]; });
		box.appendChild(selectField("Armor Breaker on target", breakOpts, state.target.armorBreak, function (v) { state.target.armorBreak = v; onChange(); }));
		box.appendChild(numberField("Scorch stacks", state.target.scorch, function (v) {
			state.target.scorch = clamp(Math.round(v), 0, 30);
			onChange();
		}, { min: "0", max: "30", step: "1", inputmode: "numeric" }));
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
		var t = r.talents;
		t.critCond.concat(t.dmgCond, t.dotVs, t.condPct, t.shredCond).forEach(function (c) {
			(sources[c.cond] = sources[c.cond] || []).push(c.source);
		});
		if (t.hemoDebuff) (sources.hemorrhaging = sources.hemorrhaging || []).push("Hemorrhage");
		used.forEach(function (cond) {
			var input = el("input", { type: "checkbox", checked: state.target.states[cond] ? true : null });
			input.addEventListener("change", function () { state.target.states[cond] = input.checked; onChange(); });
			var names = (sources[cond] || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
			var where = E.SELF_CONDITIONS[cond] ? "Counts in combos too." : "Combos work this out from their own debuffs.";
			box.appendChild(el("label", { class: "check" }, [input, el("span", {}, [
				E.CONDITIONS[cond],
				el("small", { text: "Turns on " + names.join(", ") + ". " + where })
			])]));
		});
	}

	/* ---------- saved builds, compare ---------- */

	function savedBuilds() { return LIB.builds(); }

	function renderBuilds() {
		var list = $("build-list");
		if (!list) { renderCompareSelect(); return; }
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
					LIB.deleteBuild(b.id);
					if (compareId === b.id) compareId = "";
				} }),
				el("span", { class: "build-meta", text: disc.name + ", saved " + new Date(b.saved).toLocaleString() })
			]));
		});
		renderCompareSelect();
	}

	function renderCompareSelect() {
		var builds = savedBuilds();
		if (compareId && !builds.some(function (b) { return b.id === compareId; })) compareId = "";
		var sel = $("compare-select");
		clear(sel);
		sel.appendChild(option("", "Nothing", !compareId));
		builds.forEach(function (b) { sel.appendChild(option(b.id, b.name, b.id === compareId)); });
	}

	function setupBuilds() {
		$("save-form").addEventListener("submit", function (e) {
			e.preventDefault();
			var input = $("save-name");
			var name = input.value.trim() || currentDisc().name + " build";
			LIB.saveBuild(name, state);
			input.value = "";
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

	/* ---------- scanned inventory ---------- */

	var SLOT_NAME = {};
	D.gear.slots.forEach(function (s) { SLOT_NAME[s.key] = s.name; });
	var RARITY_NAME = { M: "Magic", R: "Rare", L: "Legendary" };
	var invOpen = {};   // which slot groups of the scanned gear panel are open

	function selectedInventory() {
		var all = LIB.inventories();
		if (!all.length) return null;
		var id = storeGet(INV_KEY, "");
		return all.filter(function (x) { return x.id === id; })[0] || all[all.length - 1];
	}

	function gearToSlot(item) {
		var piece = { rarity: item.rarity, focus: item.focus, runes: item.runes.slice(0, 2), skillRune: item.skillRune || "", magic: item.magic || "", item: item.name };
		var st = E.scannedStats(item);
		if (st) piece.stats = st;
		return piece;
	}

	// Is the calculator's piece in a slot this scanned item?
	function sameGear(item, piece) {
		return item.rarity === piece.rarity && item.focus === piece.focus && (item.skillRune || "") === (piece.skillRune || "") && (item.magic || "") === (piece.magic || "") &&
			JSON.stringify((item.runes || []).filter(Boolean)) === JSON.stringify((piece.runes || []).filter(Boolean)) &&
			JSON.stringify(E.scannedStats(item)) === JSON.stringify(E.scannedStats(piece)) &&
			(!piece.item || piece.item === item.name);
	}

	function statsLine(st) {
		var parts = [];
		if (st.attack) parts.push(fmt(st.attack) + " Atk");
		if (st.expertise) parts.push(fmt(st.expertise) + " Exp");
		if (st.defense) parts.push(fmt(st.defense) + " Def");
		return parts.join(" · ");
	}

	function equipItem(item) {
		if (state.gearMode !== "pieces") state.gearMode = "pieces";
		state.gear[item.slot] = gearToSlot(item);
		renderGear();
		renderInventory();
		onChange();
	}

	function useEquipped(inv) {
		var equipped = inv.gear.filter(function (g) { return g.equipped; });
		if (!equipped.length) { toast("This scan has no equipped gear"); return; }
		state.gearMode = "pieces";
		var charms = {};
		equipped.forEach(function (g) {
			state.gear[g.slot] = gearToSlot(g);
			(g.charms || []).forEach(function (k) {
				var info = k && E.charmInfo(k);
				if (info) charms[info.key] = (charms[info.key] || 0) + 1;
			});
		});
		state.charms = charms;
		renderInputs();
		onChange();
		toast("Using " + inv.character.name + "'s equipped gear and charms");
	}

	function runeNames(item) {
		var parts = item.runes.map(function (k) { return D.runes[k] ? D.runes[k].name : k; });
		if (item.skillRune) {
			var sr = D.skillRunes[item.skillRune];
			parts.push((sr && sr.name ? sr.name : item.skillRune) + " rune");
		}
		if (item.magic) {
			var m = D.gear.magicRunes.filter(function (x) { return x.key === item.magic; })[0];
			parts.push(m ? m.name : item.magic);
		}
		return parts.join(" · ");
	}

	// Resolves to true when the scan was imported.
	function importScan(input, quiet) {
		return LIB.readScan(input).then(function (res) {
			if (res.error) { toast(res.error); return false; }
			var inv = LIB.putInventory(res.inventory);
			storeSet(INV_KEY, inv.id);
			renderInventory();
			if (!quiet) toast("Imported " + inv.gear.length + " gear and " + inv.charms.length + " kinds of charms for " + inv.character.name);
			return true;
		});
	}

	function renderInventory() {
		var box = $("inventory-body");
		if (!box) return;
		clear(box);
		var all = LIB.inventories();
		var inv = selectedInventory();
		if (!inv) {
			box.appendChild(el("p", { class: "panel-note" }, [
				"Scan your gear and charms in the game with the ",
				el("a", { href: SCANNER_URL, target: "_blank", rel: "noopener", text: "DB Inventory Scanner" }),
				" (Windows), then import the file it saves. You can also paste its text or open the link it gives you."
			]));
			return;
		}
		var cls = currentClass();
		var head = el("div", { class: "inv-head" });
		if (all.length > 1) {
			var sel = el("select", { "aria-label": "Scanned character" });
			all.slice().reverse().forEach(function (x) {
				sel.appendChild(option(x.id, x.character.name + " (" + x.character.class + ")", x.id === inv.id));
			});
			sel.addEventListener("change", function () { storeSet(INV_KEY, sel.value); renderInventory(); });
			head.appendChild(el("label", { class: "field field-inline" }, [el("span", { class: "field-label", text: "Character" }), sel]));
		}
		head.appendChild(el("p", { class: "inv-meta" }, [
			el("b", { text: inv.character.name }),
			" · " + inv.character.class + (inv.character.level ? " level " + inv.character.level : "") +
			" · scanned " + new Date(inv.scannedAt).toLocaleString() + " · " + inv.gear.length + " gear"
		]));
		var mismatch = inv.character.class !== cls;
		head.appendChild(el("div", { class: "inv-actions" }, [
			el("button", { type: "button", class: "btn btn-small btn-primary", text: "Use equipped gear and charms", disabled: mismatch ? true : null, onclick: function () { useEquipped(inv); } }),
			el("button", { type: "button", class: "btn btn-small", text: "Remove this scan", onclick: function () {
				if (!window.confirm("Remove the scan of " + inv.character.name + " from this browser" + (DRIVE && DRIVE.status().state === "synced" ? " and Google Drive" : "") + "?")) return;
				LIB.deleteInventory(inv.id);
			} })
		]));
		box.appendChild(head);
		if (mismatch) {
			box.appendChild(el("p", { class: "panel-note warn", text: inv.character.name + " is a " + inv.character.class + ". Pick a " + inv.character.class + " discipline at the top to equip this gear." }));
		}

		D.gear.slots.forEach(function (slot) {
			var items = inv.gear.filter(function (g) { return g.slot === slot.key; });
			if (!items.length) return;
			var openKey = inv.id + "|" + slot.key;
			items.sort(function (a, b) {
				return (b.equipped - a.equipped) || ("LRM".indexOf(a.rarity) - "LRM".indexOf(b.rarity)) || (b.level - a.level) || a.name.localeCompare(b.name);
			});
			var current = state.gear[slot.key];
			var details = el("details", { class: "inv-slot", open: invOpen[openKey] ? true : null });
			details.addEventListener("toggle", function () { invOpen[openKey] = details.open; });
			details.appendChild(el("summary", {}, [
				el("span", { class: "inv-slot-name", text: slot.name }),
				el("span", { class: "inv-count", text: items.length + (items.length === 1 ? " item" : " items") })
			]));
			var ul = el("ul", { class: "inv-list" });
			items.forEach(function (g) {
				var using = sameGear(g, current);
				var charmText = (g.charms || []).filter(Boolean).map(function (k) { var i = E.charmInfo(k); return i ? i.name : k; }).join(", ");
				var focusName = (D.gear.focuses.filter(function (f) { return f.key === g.focus; })[0] || {}).name || g.focus;
				ul.appendChild(el("li", { class: "inv-item" + (using ? " on" : "") }, [
					el("div", { class: "inv-item-main" }, [
						el("span", { class: "inv-name rarity-" + g.rarity, text: g.name }),
						el("span", { class: "inv-tags" }, [
							RARITY_NAME[g.rarity] + " · " + focusName + (g.level ? " · level " + g.level : "") + (g.stats ? " · " + statsLine(g.stats) : ""),
							g.equipped ? el("span", { class: "badge", text: "Equipped in game" }) : null
						]),
						el("span", { class: "inv-runes", text: runeNames(g) || "No runes" }),
						charmText ? el("span", { class: "inv-charms", text: "Charms: " + charmText }) : null
					]),
					el("button", { type: "button", class: "btn btn-small", text: using ? "In use" : "Equip", disabled: (using || mismatch) ? true : null,
						"aria-label": (using ? "In use: " : "Equip ") + g.name, onclick: function () { equipItem(g); } })
				]));
			});
			details.appendChild(ul);
			box.appendChild(details);
		});

		if (inv.charms.length) {
			var chips = el("ul", { class: "inv-charm-list" });
			inv.charms.forEach(function (c) {
				var info = E.charmInfo(c.key);
				chips.appendChild(el("li", {}, [el("b", { text: "×" + c.count }), " " + (info ? info.name : c.name),
					info ? el("small", { text: charmValueText(info) }) : null]));
			});
			box.appendChild(el("h3", { text: "Charms in your bags" }));
			box.appendChild(chips);
		}
	}

	function setupInventory() {
		var file = $("inv-file");
		$("inv-import").addEventListener("click", function () { file.click(); });
		file.addEventListener("change", function () {
			var f = file.files && file.files[0];
			if (!f) return;
			var reader = new FileReader();
			reader.onload = function () { importScan(String(reader.result)); file.value = ""; };
			reader.readAsText(f);
		});
		$("inv-paste").addEventListener("click", function () {
			function fromText(text) { if (text && text.trim()) importScan(text); }
			if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
				navigator.clipboard.readText().then(fromText, function () { fromText(window.prompt("Paste the scan text here")); });
			} else {
				fromText(window.prompt("Paste the scan text here"));
			}
		});
		// Dropping a scan file anywhere on the panel imports it.
		var panel = $("inventory-panel");
		panel.addEventListener("dragover", function (e) { e.preventDefault(); panel.classList.add("drop"); });
		panel.addEventListener("dragleave", function () { panel.classList.remove("drop"); });
		panel.addEventListener("drop", function (e) {
			e.preventDefault();
			panel.classList.remove("drop");
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (!f) return;
			var reader = new FileReader();
			reader.onload = function () { importScan(String(reader.result)); };
			reader.readAsText(f);
		});
	}

	/* ---------- Google sign-in ---------- */

	function timeAgo(t) {
		var s = Math.max(0, Math.round((Date.now() - t) / 1000));
		if (s < 60) return "just now";
		if (s < 3600) return Math.round(s / 60) + " min ago";
		if (s < 86400) return Math.round(s / 3600) + " h ago";
		return new Date(t).toLocaleDateString();
	}

	function renderCloud(st) {
		var box = $("cloud");
		if (!box || !DRIVE) return;
		clear(box);
		var p = st.profile || {};
		var signedIn = st.state !== "signed-out" && p.email;
		if (!signedIn) {
			box.appendChild(el("button", { type: "button", class: "btn btn-google", disabled: st.gis === "failed" ? true : null,
				title: "Keep your saved builds and scanned gear in your Google Drive", onclick: function () { DRIVE.signIn(); } }, "Sign in with Google"));
		} else {
			var label = st.state === "syncing" ? "Syncing…"
				: st.state === "synced" ? "Synced " + timeAgo(st.lastSync || Date.now())
				: st.state === "expired" ? "Not syncing"
				: st.state === "connecting" ? "Connecting…"
				: "Sync problem";
			var menu = el("details", { class: "cloud-menu" });
			menu.appendChild(el("summary", { "aria-label": "Google Drive sync, " + p.email }, [
				p.picture ? el("img", { src: p.picture, alt: "", width: "22", height: "22", referrerpolicy: "no-referrer" }) : el("span", { class: "g-mark", text: (p.name || p.email || "?").charAt(0).toUpperCase() }),
				el("span", { class: "cloud-state cloud-" + st.state, text: label })
			]));
			var body = el("div", { class: "cloud-pop" }, [
				el("p", {}, [el("b", { text: p.name || p.email }), el("br"), el("small", { text: p.email })]),
				el("p", { class: "panel-note", text: "Saved builds and scanned gear are kept in your Google Drive's private app folder and synced between your browsers." }),
				st.state === "expired"
					? el("button", { type: "button", class: "btn btn-small btn-primary", text: "Reconnect", onclick: function () { DRIVE.signIn(); } })
					: el("button", { type: "button", class: "btn btn-small", text: "Sync now", disabled: st.state === "syncing" ? true : null, onclick: function () { DRIVE.sync(); } }),
				el("button", { type: "button", class: "btn btn-small", text: "Sign out", onclick: function () { DRIVE.signOut(); } })
			]);
			menu.appendChild(body);
			box.appendChild(menu);
		}
		if (st.message && (st.state === "error" || st.state === "expired" || !signedIn)) {
			box.appendChild(el("span", { class: "cloud-msg" + (st.state === "error" ? " err" : ""), role: "status", text: st.message }));
		}
	}

	function setupCloud() {
		if (!DRIVE || !DRIVE.configured) return;
		DRIVE.onStatus(renderCloud);
		DRIVE.init();
		setInterval(function () { if (DRIVE.status().state === "synced") renderCloud(DRIVE.status()); }, 60000);
	}

	function compareResult() {
		if (!compareId) return null;
		var b = savedBuilds().filter(function (x) { return x.id === compareId; })[0];
		if (!b) return null;
		var s = normalize(b.state);
		// Same combo settings, so combo DPS lines up.
		s.comboWindow = state.comboWindow;
		s.customCombo = state.customCombo.slice();
		return { name: b.name, result: E.compute(s) };
	}

	/* ---------- results: character sheet ---------- */

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
		var statParts = { base: flat("base"), gear: flat("gear"), charms: flat("charms"), talents: flat("talents"), extra: flat("other"), fromExpertise: flat("from Expertise"), situational: flat("situational") };
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
			["Attack speed", "attackSpeed", function (v) { return "+" + pct(v, 0); }, "speeds up basic attacks"],
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
		if (r.crit.heals.length) {
			var hl = el("ul", { class: "note-list" });
			r.crit.heals.forEach(function (h) {
				hl.appendChild(el("li", {}, [h.name + " heals ", el("span", { class: "value", text: pct(h.pct / 100, 1) }), " of the critical hit (" + h.note + ")."]));
			});
			box.appendChild(hl);
		}
		var cond = r.crit.conditional;
		if (cond.length) {
			var ul = el("ul", { class: "note-list" });
			cond.forEach(function (c) {
				ul.appendChild(el("li", { text: c.source + ": +" + pct(c.value, 0) + " Critical Chance stat when " + E.CONDITIONS[c.cond].toLowerCase() + (c.active ? " (counted)" : " (not counted here; turn it on under Target and situation)") }));
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

	function costText(sk) {
		var parts = [secs(sk.castMs) + " to cast"];
		if (sk.mana) parts.push(fmt(sk.mana) + (sk.masterMana ? " master mana" : " mana"));
		if (sk.cooldownMs) parts.push(secs(sk.cooldownMs, sk.cooldownMs % 1000 ? 2 : 0) + " cooldown");
		return parts.join(", ");
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
					sk.total ? el("span", { class: "value", text: fmt(sk.total) }) : el("span", { class: "dim", text: sk.selfEffects.length ? "buff" : "no damage" }),
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
				detail.appendChild(el("span", {}, [el("strong", { text: "Use: " }), costText(sk) + ", hotbar " + (sk.hotbar >= 4 ? "master slot " + sk.hotbar : "slot " + sk.hotbar) + "."]));
				if (sk.hits) {
					var perHit = sk.perHit.every(function (h) { return Math.abs(h - sk.perHit[0]) < 0.5; })
						? sk.hits + " hit" + (sk.hits > 1 ? "s" : "") + " × " + fmt(sk.perHit[0])
						: sk.perHit.map(fmt).join(" + ");
					detail.appendChild(el("span", {}, [el("strong", { text: "Direct: " }), perHit + " = " + fmt(sk.direct) + ", with crits " + fmt(sk.expected)]));
				}
				sk.dots.forEach(function (d) {
					var stackText = d.stacks + " stack" + (d.stacks > 1 ? "s" : "") + (d.applied > d.stacks ? " (" + d.applied + " applied, capped)" : "");
					detail.appendChild(el("span", {}, [el("strong", { text: d.name + ": " }), stackText + " per cast, " + fmt(d.amount) + " over the DoT's duration" + (d.lifesteal ? "; heals you for the same" : "")]));
				});
				if (sk.effects.length) detail.appendChild(el("span", {}, [el("strong", { text: "On the target: " }), sk.effects.join(", ")]));
				if (sk.selfEffects.length) detail.appendChild(el("span", {}, [el("strong", { text: "On you: " }), sk.selfEffects.join("; ")]));
				if (sk.reflect) {
					detail.appendChild(el("span", {}, [el("strong", { text: "Reflects: " }),
						fmt(sk.reflect.perHit) + " (" + pct(sk.reflect.pct / 100, 2) + " of Expertise) on each of up to " + sk.reflect.hits + " hits you take, " + fmt(sk.reflect.max) + " in all" + (sk.reflect.estimated ? " (rank value estimated between listed ranks)" : "") + "."]));
				}
				if (sk.runeBoost) detail.appendChild(el("span", { text: "Includes +" + sk.runeBoost.toFixed(2) + " damage multiplier from your skill rune." }));
				if (sk.total) detail.appendChild(el("span", { text: pct(sk.directShare, 0) + " from Attack, " + pct(1 - sk.directShare, 0) + " from Expertise." }));
				else if (!sk.selfEffects.length) detail.appendChild(el("span", { text: "No direct damage or damage over time in the game data: a summon or utility skill." }));
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
		box.appendChild(el("p", { class: "panel-note", text: "Ticks once a second. DoTs ignore enemy defense, weakens and slayer runes. Each new stack restarts the duration." }));
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

	function renderMethod() {
		var box = $("method");
		if (box.firstChild) return;
		[
			["Base stats", "Level 50 with no gear, talents or charms: 68,109 HP, 3,914 Attack, 2,655 Expertise, and 1,344 Defense for rogues, 1,008 for mages, 1,680 for paladins."],
			["Gear", "Each piece's Attack, Expertise and Defense come from the game's gear tables for your class, slot, stat focus and rarity at level 50, scaled by 912/1575 so a legendary Attack main hand gives 912 Attack. Runes use the game's values: Critical Chance +10% stat, Critical Power +10%, Attack Speed +5%, Health Bonus +15% max HP, Tenacity +15%, Recovery +10%, slayer +10% damage, resist +10%."],
			["Critical hits", "Real chance is 15% × (1 + Critical Chance stat). A crit adds a percentage of the hit: Heavy Blow 60%, Hemorrhage 112.5% (3 ticks of 37.5%), elemental runes 100% against their opposite, 50% neutral, 25% against their own element. Each damaging critical rune also adds half your Critical Power. Heavy Blows, Hemorrhage and Element Mastery multiply their rune. Mending Blow heals 100% of the crit plus half your Critical Power; Renew heals 125% over 5 ticks and scales with Recovery, not Critical Power."],
			["Skills", "Each skill fires one pulse per cast-time step in the game's power data, and every pulse hits for Attack × that step's damage multiplier (skill runes add to it). Skill hits can crit, so their expected value uses the average crit multiplier; basic attacks only crit on the 3rd hit of the chain. The debuffs and DoTs a skill lists land on every pulse unless the game marks them First or Last, which is how Shadow Rend or Harm stack so fast."],
			["Target debuffs", "Armor Bane: +5% damage per stack, up to 7. Armor Breaker: 20%, 35% or 50% more damage, and only two different values count at once. Scorch: +1% per stack, 15 stacks (more with Flameseer's Pyromania talent). Other Defense debuffs (Penance, Death Mark, Shadow Step, Hemorrhage's talent) add their percentage. Acid Edge adds to each Armor Bane stack and Armor Breaker; Corrosive Strikes and similar talents lengthen the debuffs."],
			["Damage over time", "Per tick per stack is a share of Expertise: Bleed 6%, rogue and Flurry poison 60%, chaos and mage poison 30%, Bind 30%, Burn 9%, Chilblains 15%, Ignite 15%, Holy fire 30%, Plague 40% at rank 1, Soul Reaver 120% over its ticks. Other DoTs use the game formula DoTDamage × 1.5 ÷ ticks. Talents that raise a DoT add to its DoTDamage the way the game does, and stack talents raise the cap. DoTs ignore Defense, weakens and slayer runes."],
			["Paladin specials", "Retribution reflects a share of Expertise on each hit you take: 80% at rank 1, 100% at 2, 123% at 5, 130% at 6, 155% at 10, reflecting up to 7, 9 or 10 hits; ranks in between are estimated. Hallowed Reckoning hits 4 times and applies Holy Fire with each tick from rank 5."],
			["Combo DPS", "A combo plays its steps in a loop for the fight length against one target. Debuffs from earlier steps raise the damage of later ones, DoTs build up, refresh and tick once a second, frozen and rooted targets break free when hit, and talents that need a target state switch on while the combo keeps that state up. Buffs on you (Berserker, Draconic Soul, Chaos Wave, Ghost Blade, Empyrean Aura) and basic-attack changes (Cleaving Blows, Verdict, Sentinel Form, Pyromania, Meteor) last their real duration. Attack speed only speeds up basic attacks, as in the game. A skill on cooldown is skipped until it is ready."],
			["Mana", "Sustained DPS follows the game's mana: you start with 80, each basic attack hit gives 5, and skills spend their cost, so the combo stops for basic attacks when it runs dry. Basic attacks changed by Cleaving Blows, Verdict, Sentinel Form, Meteor or Pyromania give no mana (their game data has none), and Sentinel Form, Pyromania and Hailstone Embrace attacks spend master mana. Spending mana fills master mana (100 max, full at the start) for master skills; the 0.4 per mana spent used here is an estimate. Burst DPS ignores mana."],
			["Still approximate", "Enemy defense is a flat reduction you enter, and slayer runes multiply direct hits against that creature type. Multi-hit skills assume the target stays inside the area for every pulse; dashes that pass through a target may hit it fewer times. Pets, summons, minions, Retribution's reflected damage (it depends on how often you are hit), Decoy timing, Midnight Shroud's bonus hit and the extra Expertise-based debuff duration are not counted in combo DPS. Check skill numbers against the training dummy before trusting small differences."]
		].forEach(function (p) {
			box.appendChild(el("p", {}, [el("strong", { text: p[0] + ". " }), p[1]]));
		});
	}

	/* ---------- results: combo window ---------- */

	function comboResult(c) { return state.comboMode === "burst" ? c.burst : c.result; }

	function pickCombo(r) {
		if (!r.combos.length) return null;
		var chosen = r.combos.filter(function (c) { return c.id === state.selectedCombo; })[0];
		if (chosen) return chosen;
		return r.combos.slice().sort(function (a, b) { return b.result.dps - a.result.dps; })[0];
	}

	function renderBestCombo(r) {
		var btn = $("best-combo");
		clear(btn);
		var best = r.combos.slice().sort(function (a, b) { return b.result.dps - a.result.dps; })[0];
		if (!best) { btn.hidden = true; return; }
		btn.hidden = false;
		btn.appendChild(el("span", { class: "best-label", text: "Best combo" }));
		btn.appendChild(el("span", { class: "best-name", text: best.name }));
		btn.appendChild(el("span", { class: "best-dps" }, [el("span", { class: "value", text: fmt(best.result.dps) }), " DPS"]));
		btn.appendChild(el("span", { class: "best-go", text: "See combos" }));
		btn.onclick = function () { setTab("combos"); };
	}

	function segBar(parts, max) {
		var bar = el("span", { class: "dist-bar", "aria-hidden": "true" });
		var total = parts.reduce(function (a, p) { return a + p[1]; }, 0);
		var width = max ? total / max * 100 : 0;
		var inner = el("span", { class: "dist-fill", style: "width:" + width.toFixed(2) + "%" });
		parts.forEach(function (p) {
			if (p[1] > 0) inner.appendChild(el("i", { class: p[0], style: "width:" + (p[1] / total * 100).toFixed(2) + "%" }));
		});
		bar.appendChild(inner);
		return bar;
	}

	function renderComboList(r, cmp) {
		var list = $("combo-list");
		clear(list);
		var chosen = pickCombo(r);
		if (!r.combos.length) {
			list.appendChild(el("p", { class: "panel-note", text: "No combos for this discipline yet. Build one below." }));
			return;
		}
		var best = Math.max.apply(null, r.combos.map(function (c) { return c.result.dps; }));
		r.combos.forEach(function (c) {
			var other = cmp ? cmp.result.combos.filter(function (x) { return x.id === c.id; })[0] : null;
			var on = chosen && chosen.id === c.id;
			var card = el("button", { type: "button", role: "radio", "aria-checked": on ? "true" : "false", class: "combo-card" + (on ? " on" : ""), onclick: function () {
				state.selectedCombo = c.id;
				onChange();
			} }, [
				el("span", { class: "combo-name" }, [c.name, c.preset ? null : el("span", { class: "tag", text: "yours" }), c.result.dps === best ? el("span", { class: "tag tag-best", text: "best" }) : null]),
				el("span", { class: "combo-steps", text: c.steps.map(function (k) { return stepName(r, k); }).join(" → ") }),
				el("span", { class: "combo-dps" }, [
					el("span", { class: "value", text: fmt(c.result.dps) }), " DPS",
					el("span", { class: "dim", text: " · burst " + fmt(c.burst.dps) }),
					other ? deltaNode(c.result.dps, other.result.dps) : null
				])
			]);
			list.appendChild(card);
		});
	}

	function stepName(r, key) {
		if (key === "basic") return "Basic attack";
		var a = r.abilities.filter(function (x) { return x.ability === key; })[0];
		return a ? a.name : key;
	}

	function renderComboDetail(r, cmp) {
		var box = $("combo-detail");
		clear(box);
		var c = pickCombo(r);
		if (!c) return;
		var res = comboResult(c);
		var other = cmp ? cmp.result.combos.filter(function (x) { return x.id === c.id; })[0] : null;
		var otherRes = other ? comboResult(other) : null;
		var mana = state.comboMode !== "burst";

		var modeSeg = el("div", { class: "segmented", role: "radiogroup", "aria-label": "Mana" }, [
			["mana", "Sustained (mana)"], ["burst", "Burst (no mana limit)"]
		].map(function (m) {
			return el("button", { type: "button", role: "radio", "aria-checked": state.comboMode === m[0] ? "true" : "false", text: m[1], onclick: function () {
				state.comboMode = m[0];
				onChange();
			} });
		}));
		box.appendChild(el("div", { class: "combo-head" }, [
			el("div", { class: "combo-big" }, [
				el("span", { class: "big-num" }, fmt(res.dps)),
				el("span", { class: "big-unit", text: " DPS" }),
				otherRes ? deltaNode(res.dps, otherRes.dps) : null,
				el("span", { class: "big-sub", text: (mana ? "sustained, with mana" : "burst, mana ignored") + " · " + fmt(res.total) + " damage in " + res.windowS + " s" + (otherRes ? " · " + cmp.name + ": " + fmt(otherRes.dps) : "") })
			]),
			modeSeg
		]));
		box.appendChild(el("p", { class: "combo-why", text: c.why }));

		var cols = el("div", { class: "combo-cols" });
		box.appendChild(cols);

		// Damage by skill
		var distBox = el("div", { class: "combo-block" }, [el("h3", { text: "Damage by skill" })]);
		var maxSkill = Math.max.apply(null, res.skills.map(function (s) { return s.total; }).concat([1]));
		var ul = el("ul", { class: "dist-list" });
		res.skills.forEach(function (s) {
			var castText = s.key === "basic" ? "" : (s.casts ? s.casts + " cast" + (s.casts > 1 ? "s" : "") : "basic attacks while active");
			ul.appendChild(el("li", {}, [
				el("span", { class: "dist-name" }, [s.name, castText ? el("small", { text: " " + castText }) : null]),
				el("span", { class: "dist-val" }, [el("span", { class: "value", text: fmt(s.total / res.windowS) }), " DPS · " + pct(s.share, 1)]),
				segBar([["seg-direct", s.direct], ["seg-crit", s.crit], ["seg-dot", s.dot]], maxSkill)
			]));
		});
		distBox.appendChild(ul);
		distBox.appendChild(el("div", { class: "legend" }, [
			el("span", {}, [el("i", { class: "swatch swatch-direct" }), "Direct hits"]),
			el("span", {}, [el("i", { class: "swatch swatch-crit" }), "Critical hits"]),
			el("span", {}, [el("i", { class: "swatch swatch-dot" }), "Damage over time"])
		]));
		cols.appendChild(distBox);

		// Damage by type
		var typeBox = el("div", { class: "combo-block" }, [el("h3", { text: "Damage by type" })]);
		var tl = el("ul", { class: "dist-list" });
		var maxType = Math.max.apply(null, res.types.map(function (t) { return t.amount; }).concat([1]));
		res.types.forEach(function (t) {
			var cls = t.label === "Direct hits" ? "seg-direct" : (t.label === "Critical hits" ? "seg-crit" : "seg-dot");
			tl.appendChild(el("li", {}, [
				el("span", { class: "dist-name", text: t.label }),
				el("span", { class: "dist-val" }, [el("span", { class: "value", text: fmt(t.amount / res.windowS) }), " DPS · " + pct(t.share, 1)]),
				segBar([[cls, t.amount]], maxType)
			]));
		});
		typeBox.appendChild(tl);
		typeBox.appendChild(el("p", { class: "panel-note", text: pct(1 - res.dotShare, 0) + " scales with Attack, " + pct(res.dotShare, 0) + " with Expertise." }));

		// Debuff uptime
		if (res.uptime.length) {
			typeBox.appendChild(el("h3", { text: "Debuffs on the target" }));
			typeBox.appendChild(el("p", { class: "panel-note block-note", text: "Share of the fight each is up, and its average stacks while up." }));
			var ul2 = el("ul", { class: "uptime-list" });
			res.uptime.forEach(function (u) {
				ul2.appendChild(el("li", {}, [
					el("span", { class: "dist-name", text: u.label }),
					el("span", { class: "dist-val", text: pct(u.pct, 0) + (u.avgStacks ? " · " + u.avgStacks.toFixed(1) + " stacks" : "") }),
					el("span", { class: "up-bar", "aria-hidden": "true" }, el("i", { class: u.dot ? "seg-dot" : "seg-debuff", style: "width:" + (u.pct * 100).toFixed(1) + "%" }))
				]));
			});
			typeBox.appendChild(ul2);
		}
		cols.appendChild(typeBox);

		// Timeline of the first pass
		var tlBox = el("div", { class: "combo-block combo-timeline" }, [el("h3", { text: "One pass of the combo" })]);
		var ol = el("ol", { class: "timeline" });
		res.timeline.forEach(function (step) {
			ol.appendChild(el("li", { class: step.basic ? "tl-basic" : (step.master ? "tl-master" : "") }, [
				el("span", { class: "tl-time", text: secs(step.start) }),
				el("span", { class: "tl-name" }, [step.name, step.master ? el("span", { class: "tag", text: "master" }) : null, el("small", { text: " " + secs(step.ms) })]),
				step.effects.length ? el("span", { class: "tl-fx", text: step.effects.join(" · ") }) : null
			]));
		});
		tlBox.appendChild(ol);
		var notes = [];
		notes.push("One pass takes " + secs(res.firstPassMs) + "; the loop runs " + res.loops + " time" + (res.loops > 1 ? "s" : "") + " in " + res.windowS + " s with " + res.casts + " skill casts.");
		if (mana && res.manaWaitMs) notes.push(secs(res.manaWaitMs, 1) + " spent on basic attacks to build mana.");
		if (mana && (res.mana || res.masterMana)) notes.push("One pass costs " + fmt(res.mana) + " mana" + (res.masterMana ? " and " + fmt(res.masterMana) + " master mana" : "") + ".");
		if (res.skipped.length) notes.push("Skipped while on cooldown: " + res.skipped.map(function (s) { return s.name + " ×" + s.times; }).join(", ") + ".");
		if (mana && res.noMana.length) notes.push("Skipped for lack of master mana: " + res.noMana.map(function (s) { return s.name + " ×" + s.times; }).join(", ") + ".");
		if (res.waitMs) notes.push(secs(res.waitMs, 1) + " of basic attacks while every skill was on cooldown.");
		tlBox.appendChild(el("p", { class: "panel-note", text: notes.join(" ") }));
		cols.appendChild(tlBox);
	}

	function renderComboTools(r) {
		var sel = $("combo-length");
		clear(sel);
		WINDOWS.forEach(function (w) { sel.appendChild(option(String(w), w + " seconds", w === state.comboWindow)); });
		sel.onchange = function () { state.comboWindow = +sel.value; onChange(); };
		$("combo-intro").textContent = r.discipline.name + " combos at skill rank " + r.rank + " against one target. Each combo opens with its debuffs and buffs, then spends its damage skills while they are up. Pick one to see where its damage comes from.";
	}

	function slotConflicts(r, steps) {
		var bySlot = {};
		steps.forEach(function (k) {
			var a = r.abilities.filter(function (x) { return x.ability === k; })[0];
			if (!a || a.hotbar < 1 || a.hotbar > 3) return;
			var list = bySlot[a.hotbar] = bySlot[a.hotbar] || [];
			if (list.indexOf(a.name) < 0) list.push(a.name);
		});
		return Object.keys(bySlot).filter(function (s) { return bySlot[s].length > 1; }).map(function (s) {
			return "Hotbar slot " + s + " holds one skill, so " + bySlot[s].join(" and ") + " can't both be equipped.";
		});
	}

	function renderBuilder(r) {
		var box = $("combo-builder");
		clear(box);
		var valid = {};
		r.abilities.forEach(function (a) { valid[a.ability] = a; });
		var steps = state.customCombo.filter(function (k) { return k === "basic" || valid[k]; });
		if (steps.length !== state.customCombo.length) state.customCombo = steps;

		var list = el("ol", { class: "builder-steps" });
		if (!steps.length) list.appendChild(el("li", { class: "empty", text: "No steps yet. Add skills in the order you cast them." }));
		steps.forEach(function (k, i) {
			var a = valid[k];
			var slot = k === "basic" ? "" : (a.hotbar >= 4 ? "M" : String(a.hotbar));
			function move(dir) {
				return function () {
					var j = i + dir;
					if (j < 0 || j >= steps.length) return;
					var s = steps.slice();
					var tmp = s[i]; s[i] = s[j]; s[j] = tmp;
					state.customCombo = s;
					state.selectedCombo = "custom";
					onChange();
				};
			}
			list.appendChild(el("li", { class: "builder-step" }, [
				el("span", { class: "step-slot" + (slot === "M" ? " master" : ""), text: slot || "B", title: slot ? (slot === "M" ? "Master skill" : "Hotbar slot " + slot) : "Basic attack" }),
				el("span", { class: "step-name", text: stepName(r, k) }),
				el("button", { type: "button", class: "icon-btn", "aria-label": "Move " + stepName(r, k) + " earlier", text: "↑", disabled: i === 0 ? true : null, onclick: move(-1) }),
				el("button", { type: "button", class: "icon-btn", "aria-label": "Move " + stepName(r, k) + " later", text: "↓", disabled: i === steps.length - 1 ? true : null, onclick: move(1) }),
				el("button", { type: "button", class: "icon-btn", "aria-label": "Remove " + stepName(r, k), text: "×", onclick: function () {
					var s = steps.slice();
					s.splice(i, 1);
					state.customCombo = s;
					onChange();
				} })
			]));
		});
		box.appendChild(list);

		var add = el("select", { "aria-label": "Skill to add" });
		add.appendChild(option("basic", r.basicAttack.name === "Basic attack" ? "Basic attack" : "Basic attack (" + r.basicAttack.name + ")"));
		[1, 2, 3, 4, 5, 6].forEach(function (slot) {
			var group = el("optgroup", { label: slot <= 3 ? "Hotbar slot " + slot : "Master slot " + slot });
			r.abilities.filter(function (a) { return a.hotbar === slot; }).forEach(function (a) {
				var extra = secs(a.castMs, 2) + (a.cooldownMs ? ", " + secs(a.cooldownMs, a.cooldownMs % 1000 ? 2 : 0) + " cooldown" : "");
				group.appendChild(option(a.ability, a.name + " (" + extra + ")"));
			});
			if (group.firstChild) add.appendChild(group);
		});
		var presetSel = el("select", { "aria-label": "Copy a preset" });
		presetSel.appendChild(option("", "Start from a preset…"));
		r.combos.filter(function (c) { return c.preset; }).forEach(function (c) { presetSel.appendChild(option(c.id, c.name)); });
		presetSel.addEventListener("change", function () {
			var p = r.combos.filter(function (c) { return c.id === presetSel.value; })[0];
			if (!p) return;
			state.customCombo = p.steps.slice();
			state.selectedCombo = "custom";
			onChange();
		});
		box.appendChild(el("div", { class: "builder-tools" }, [
			el("label", { class: "field builder-add" }, [el("span", { class: "field-label", text: "Add a step" }), add]),
			el("button", { type: "button", class: "btn", text: "Add", onclick: function () {
				if (state.customCombo.length >= 20) { toast("20 steps at most"); return; }
				state.customCombo = state.customCombo.concat([add.value]);
				state.selectedCombo = "custom";
				onChange();
			} }),
			el("label", { class: "field" }, [el("span", { class: "field-label", text: "Or copy" }), presetSel]),
			steps.length ? el("button", { type: "button", class: "btn", text: "Clear", onclick: function () {
				state.customCombo = [];
				if (state.selectedCombo === "custom") state.selectedCombo = "";
				onChange();
			} }) : null
		]));
		var warn = slotConflicts(r, steps);
		if (warn.length) box.appendChild(el("ul", { class: "note-list warn" }, warn.map(function (w) { return el("li", { text: w }); })));
		box.appendChild(el("p", { class: "panel-note", text: "Slots 1 to 3 hold one skill each; master skills go in slots 4 to 6. A basic attack step is one swing or shot, so add several to spend a Cleaving Blows, Verdict, Sentinel Form, Meteor or Pyromania window." }));
	}

	function renderCombos(r, cmp) {
		renderComboTools(r);
		renderComboList(r, cmp);
		renderComboDetail(r, cmp);
		renderBuilder(r);
		renderBestCombo(r);
		var pd = $("popout-discipline");
		if (pd) pd.textContent = r.discipline.name + " · " + (r.talents.points) + " talent points";
	}

	/* ---------- tabs, pop-out ---------- */

	function setTab(tab) {
		sheetTab = tab === "combos" ? "combos" : "character";
		if (!POPOUT) storeSet(TAB_KEY, sheetTab);
		document.querySelectorAll(".sheet-tabs [role=tab]").forEach(function (b) {
			var on = b.getAttribute("data-view") === sheetTab;
			b.setAttribute("aria-selected", on ? "true" : "false");
			b.tabIndex = on ? 0 : -1;
		});
		$("view-character").hidden = sheetTab !== "character";
		$("view-combos").hidden = sheetTab !== "combos";
	}

	function setupTabs() {
		var tabs = [].slice.call(document.querySelectorAll(".sheet-tabs [role=tab]"));
		tabs.forEach(function (b, i) {
			b.addEventListener("click", function () { setTab(b.getAttribute("data-view")); });
			b.addEventListener("keydown", function (e) {
				if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
				var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
				setTab(next.getAttribute("data-view"));
				next.focus();
			});
		});
		setTab(POPOUT ? "combos" : storeGet(TAB_KEY, "character"));
		$("combo-popout").addEventListener("click", function () {
			var url = location.pathname + "?view=combos#b=" + toB64(JSON.stringify(state));
			var w = window.open(url, "dbb-combo-window", "width=1100,height=900");
			if (!w) location.href = url;
		});
	}

	// Keep the main page and the pop-out combo window in step through localStorage.
	function setupSync() {
		window.addEventListener("storage", function (e) {
			if (e.key !== LAST_KEY || !e.newValue) return;
			var s;
			try { s = normalize(JSON.parse(e.newValue)); } catch (err) { return; }
			if (JSON.stringify(s) === JSON.stringify(state)) return;
			var talentsChanged = s.talents !== state.talents;
			state = s;
			try { history.replaceState(null, "", "#b=" + toB64(JSON.stringify(state))); } catch (err) { /* ignore */ }
			if (POPOUT) { renderResults(); return; }
			if (talentsChanged) loadTalentsIntoFrame();
			syncDisciplineSelect();
			renderInputs();
			renderResults();
		});
	}

	/* ---------- render ---------- */

	function renderResults() {
		var r = E.compute(state);
		lastResult = r;
		var cmp = compareResult();
		renderCombos(r, cmp);
		if (POPOUT) {
			document.title = "Combo DPS · " + r.discipline.name + " · Dungeon Blitz DPS Calculator";
			return;
		}
		renderSheet(r, cmp);
		renderCrit(r, cmp);
		renderSkills(r, cmp);
		renderDots(r, cmp);
		renderTalentFx(r);
		renderSituations(r);
		renderMethod();
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
		renderInventory();
		renderCharms();
		renderExtra();
		renderTarget();
		renderSkillRank();
		renderBuilds();
	}

	// A scan sent from the DB Inventory Scanner as a link: …/#invz=<raw DEFLATE, base64url>,
	// or …/#inv=<base64 JSON>. True when the address had one (it is imported in the background).
	function readScanHash() {
		var m = /^#(invz?=[A-Za-z0-9_-]+)$/.exec(location.hash);
		if (!m) return false;
		try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
		importScan(m[1]).then(function (ok) {
			persist();
			if (!ok) return;
			var panel = $("inventory-panel");
			if (panel && panel.scrollIntoView) setTimeout(function () { panel.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
		});
		return true;
	}

	function init() {
		if (!D || !E || !LIB) return;
		LIB.load();
		var scanInHash = /^#invz?=/.test(location.hash);
		state = (!scanInHash && readHash()) || normalize(storeGet(LAST_KEY, null));
		setupTabs();
		setupSync();
		if (POPOUT) {
			LIB.onChange(function () { renderCompareSelect(); });
			renderCompareSelect();
			$("compare-select").addEventListener("change", function () { compareId = this.value; renderResults(); });
			$("copy-link").addEventListener("click", function () {
				var url = shareUrl();
				if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { toast("Link copied"); });
				else window.prompt("Copy this link", url);
			});
			renderResults();
			persist();
			return;
		}
		buildDisciplineSelect();
		setupGearMode();
		setupBuilds();
		setupInventory();
		setupFrame();
		renderInputs();
		if (scanInHash) readScanHash();
		renderResults();
		persist();
		setupCloud();
		LIB.onChange(function (lib, why) {
			if (why === "builds" || why === "sync" || why === "storage") renderBuilds();
			if (why === "inventories" || why === "sync" || why === "storage") renderInventory();
		});
		window.addEventListener("hashchange", function () {
			if (readScanHash()) return;
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
