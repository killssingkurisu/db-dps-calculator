/* Dungeon Blitz DPS Calculator: page wiring. Math lives in engine.js, saved data in library.js. */
(function () {
	"use strict";

	var D = window.DBB_DATA;
	var E = window.DBB_ENGINE;
	var LIB = window.DBB_LIBRARY;
	var DRIVE = window.DBB_DRIVE;
	var METER = window.DBB_METER;
	var SCANNER_URL = "https://github.com/killssingkurisu/db-inventory-scanner/releases/latest";
	var LAUNCHER_URL = "https://github.com/killssingkurisu/db-dpsmod/releases/latest";
	var APP_KEY = "dbb-app-v1";            // the party, which member is open, party settings
	var LAST_KEY = "dbb-last-state-v1";    // one character, from before parties; read once to move over
	var TAB_KEY = "dbb-tab-v2";
	var SCOPE_KEY = "dbb-combo-scope-v1";
	var LOAD_VIEW_KEY = "dbb-load-view-v1";
	var MAX_PARTY = 4;
	var WINDOWS = [15, 30, 60];
	var TABS = ["character", "gears", "talents", "combos", "party", "import", "settings"];
	var SCOPES = ["character", "party", "meter"];
	var MAX_STEPS = 80;
	var ELEMENT_LABEL = { "": "Unknown or neutral" };
	D.elements.forEach(function (e) { ELEMENT_LABEL[e] = e + " creature"; });
	var BREAK_LABEL = { "": "None", "20": "20%", "35": "35%", "50": "50%", "20+35": "20% + 35%", "20+50": "20% + 50%", "35+50": "35% + 50%" };

	var POPOUT = /[?&]view=combos(&|$)/.test(location.search);
	var app;          // { v, active, chars: [character state…], party: {…} }
	var state;        // the open character: app.chars[app.active]
	var compareId = "";
	var frame = null;
	var renderedClass = "";
	var queued = false;
	var toastTimer = null;
	var tab = "character";
	var comboScope = "character";
	var lastResult = null;
	var partyCache = {};       // member index -> { key, result } for party fights
	var optimizing = false;
	var optimizeResult = null; // last "find the best combos" answer
	var pendingScan = null;    // a scan waiting for a free load slot
	var editLane = -1;         // which party lane has its combo builder open
	var meterPick = { run: "", seconds: 5 };   // the meter run and window the DPS meter view shows
	var meterSaved = null;     // { id, discipline, name }: the combo just saved from a window

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
		addKids(node, kids);
		return node;
	}

	// Children: nodes, text, and arrays of them (nested arrays too); null and false are skipped.
	function addKids(node, kids) {
		[].concat(kids == null ? [] : kids).forEach(function (kid) {
			if (kid == null || kid === false) return;
			if (Array.isArray(kid)) { addKids(node, kid); return; }
			node.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
		});
	}

	function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

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

	function shortSecs(ms) {
		var s = ms / 1000;
		return (Math.round(s * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " s";
	}

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	// "Oct 6, 2026, 9:42 PM" in the reader's own locale.
	function when(t) {
		var d = new Date(t);
		if (isNaN(d)) return "";
		try { return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return d.toLocaleString(); }
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
		t.classList.add("on");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { t.textContent = ""; t.classList.remove("on"); }, 2600);
	}

	function copyText(text, done) {
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text).then(function () { toast(done); }, function () { window.prompt("Copy this", text); });
		} else {
			window.prompt("Copy this", text);
		}
	}

	function option(value, text, selected) {
		return el("option", { value: value, text: text, selected: selected ? true : null });
	}

	function selectField(label, options, value, onchange, disabled) {
		var sel = el("select", { disabled: disabled ? true : null });
		options.forEach(function (o) { sel.appendChild(option(o[0], o[1], o[0] === value)); });
		sel.addEventListener("change", function () { onchange(sel.value); });
		return el("label", { class: "field" }, [el("span", { class: "field-label", text: label }), sel]);
	}

	function numberField(label, value, onInput, attrs) {
		var input = el("input", Object.assign({ type: "number", step: "any", value: value || 0, inputmode: "decimal" }, attrs || {}));
		input.addEventListener("input", function () { onInput(+input.value || 0); });
		return el("label", { class: "field" }, [el("span", { class: "field-label", text: label }), input]);
	}

	function segmented(label, options, value, onpick, extraClass) {
		return el("div", { class: "segmented" + (extraClass ? " " + extraClass : ""), role: "radiogroup", "aria-label": label }, options.map(function (o) {
			return el("button", { type: "button", role: "radio", "aria-checked": o[0] === value ? "true" : "false", text: o[1], onclick: function () { onpick(o[0]); } });
		}));
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

	function cleanFrom(f) {
		if (!f || typeof f !== "object" || ["load", "build", "copy", "new"].indexOf(f.type) < 0) return null;
		return { type: f.type, id: typeof f.id === "string" ? f.id.slice(0, 80) : "", label: typeof f.label === "string" ? f.label.slice(0, 60) : "" };
	}

	function normalize(s) {
		var d = E.defaultState();
		s = s && typeof s === "object" ? s : {};
		var t = s.target || {};
		var out = {
			v: 2,
			name: typeof s.name === "string" ? s.name.trim().slice(0, 24) : "",
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
			selectedCombo: typeof s.selectedCombo === "string" ? s.selectedCombo : "",
			partyCombo: typeof s.partyCombo === "string" ? s.partyCombo.slice(0, 40) : ""
		};
		var from = cleanFrom(s.from);
		if (from) out.from = from;
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

	function normalizeApp(a) {
		a = a && typeof a === "object" ? a : {};
		var chars = (Array.isArray(a.chars) ? a.chars : []).slice(0, MAX_PARTY).map(normalize);
		if (!chars.length) chars = [normalize(null)];
		var p = a.party || {};
		return {
			v: 3,
			active: clamp(Math.floor(+a.active || 0), 0, chars.length - 1),
			chars: chars,
			party: {
				window: WINDOWS.indexOf(+p.window) >= 0 ? +p.window : E.DEFAULT_WINDOW_S,
				mode: p.mode === "burst" ? "burst" : "mana",
				element: D.elements.indexOf(p.element) >= 0 ? p.element : "",
				reduction: clamp(+p.reduction || 0, 0, 100)
			}
		};
	}

	function discOf(ch) { return D.disciplines[E.decodeBuild(ch.talents).discipline]; }
	function currentDisc() { return discOf(state); }
	function currentClass() { return currentDisc().cls; }

	function charName(i) {
		var ch = app.chars[i];
		if (ch && ch.name) return ch.name;
		return i === 0 ? "You" : (ch ? discOf(ch).name : "Member " + (i + 1));
	}

	// A character's results, with the combos saved for their discipline played next to the presets.
	function computeFor(ch) { return E.compute(ch, { combos: LIB.combosFor(discOf(ch).id) }); }
	function combosStamp() { return LIB.combos().map(function (c) { return c.id + ":" + c.saved; }).join(","); }

	// The unnamed first member is "You" on labels; sentences need its grammar.
	function isYou(i) { var ch = app.chars[i]; return i === 0 && !(ch && ch.name); }
	function who(i) { return isYou(i) ? "you" : charName(i); }                    // "Use gear on you"
	function whose(i) { return isYou(i) ? "your" : charName(i) + "'s"; }          // "your gear"
	function target(i) { return isYou(i) ? "your character" : charName(i); }      // "Load into your character"
	function says(i, s, plain) { return (isYou(i) ? "you " + plain : charName(i) + " " + s); }  // "you are", "Kai is"
	function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

	function readHash() {
		var h = location.hash.replace(/^#/, "");
		if (!h) return null;
		if (h.indexOf("p=") === 0) {
			try { return { party: normalizeApp(JSON.parse(fromB64(h.slice(2)))) }; } catch (e) { return null; }
		}
		if (h.indexOf("b=") === 0) {
			try { return { char: normalize(JSON.parse(fromB64(h.slice(2)))) }; } catch (e) { return null; }
		}
		if (/^\d/.test(h)) return { talents: h };   // an old talent calculator link
		return null;
	}

	// Links always open the full calculator, even when copied from the pop-out combo window.
	function shareUrl() { return location.origin + location.pathname + "#b=" + toB64(JSON.stringify(state)); }
	function partyUrl() { return location.origin + location.pathname + "#p=" + toB64(JSON.stringify(app)); }

	function persist() {
		storeSet(APP_KEY, app);
		var hash = "#b=" + toB64(JSON.stringify(state));
		try { history.replaceState(null, "", location.pathname + location.search + hash); } catch (e) { /* ignore */ }
		var full = $("full-link");
		if (full) full.href = location.pathname + hash;
	}

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

	// Opens another party member for editing in every tab.
	function setActive(i) {
		if (i < 0 || i >= app.chars.length) return;
		if (i === app.active) return;
		app.active = i;
		state = app.chars[i];
		loadTalentsIntoFrame();
		renderInputs();
		onChange();
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
			// A post from before the last build we sent belongs to whoever was open then.
			if (frameLoadId && Object.prototype.hasOwnProperty.call(data, "id") && data.id !== frameLoadId) return;
			var build = String(data.build || "").replace(/^#/, "");
			if (/^\d/.test(build) && build !== state.talents) {
				var discChanged = build.charAt(0) !== state.talents.charAt(0);
				state.talents = build;
				if (discChanged) { state.selectedCombo = ""; state.partyCombo = ""; }
				onChange();
			}
		});
	}

	var frameLoadId = 0;
	function loadTalentsIntoFrame() {
		if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: "dbb-load", build: state.talents, id: ++frameLoadId }, "*");
	}

	/* ---------- discipline ---------- */

	function disciplineSelect(value, onpick, label) {
		var sel = el("select", { "aria-label": label || "Discipline" });
		Object.keys(D.classes).forEach(function (cls) {
			var group = el("optgroup", { label: cls });
			D.disciplines.forEach(function (d) {
				if (d.cls === cls) group.appendChild(option(String(d.id), d.name, d.id === value));
			});
			sel.appendChild(group);
		});
		sel.addEventListener("change", function () { onpick(+sel.value); });
		return sel;
	}

	// A new discipline starts an empty talent tree for that discipline.
	function setDiscipline(ch, id) {
		if (id === E.decodeBuild(ch.talents).discipline) return;
		ch.talents = String(id);
		ch.selectedCombo = "";
		ch.partyCombo = "";
		ch.customCombo = [];
		if (ch === state) loadTalentsIntoFrame();
		onChange();
	}
	/* ---------- gear ---------- */

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
		// A half-strength forge bonus can end in .5, as the game shows it.
		return "+" + (value % 1 ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : fmt(value)) + " " + name;
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
		// Lower ranks, forged and special charms, from a scan or added by hand.
		Object.keys(state.charms).filter(function (k) {
			var info = E.charmInfo(k);
			return info && (info.special || info.forge || info.rank < E.CHARM_MAX_RANK);
		}).sort().forEach(function (k) { list.appendChild(charmRow(k, true)); });

		var typeSel = el("select", { "aria-label": "Charm" });
		D.charms.forEach(function (c) { typeSel.appendChild(option(c.key, c.name + " (" + c.gem + ")", false)); });
		(D.specialCharms || []).forEach(function (c) { typeSel.appendChild(option(c.key, c.name, false)); });
		var rankSel = el("select", { "aria-label": "Rank" });
		for (var r = E.CHARM_MAX_RANK; r >= 1; r--) rankSel.appendChild(option(String(r), r + " · " + (D.charmRanks[r - 1] || ""), r === E.CHARM_MAX_RANK));
		// Magic Forge bonus: half (R) or all (L) of the same rank of a second gem.
		var forgeSel = el("select", { "aria-label": "Magic Forge bonus" });
		forgeSel.appendChild(option("", "No forge bonus", true));
		["R", "L"].forEach(function (tier) {
			E.FORGE_GEMS.forEach(function (k, i) {
				var g = D.charms.filter(function (c) { return c.key === k; })[0];
				if (g) forgeSel.appendChild(option(k + ":" + tier, E.FORGE_SUFFIX[tier][i] + " · " + (tier === "R" ? "half " : "full ") + g.name, false));
			});
		});
		function syncRank() {
			var gem = D.charms.some(function (c) { return c.key === typeSel.value; });
			rankSel.disabled = !gem;
			forgeSel.disabled = !gem;
		}
		typeSel.addEventListener("change", syncRank);
		syncRank();
		var add = el("button", { type: "button", class: "btn btn-small", text: "Add", onclick: function () {
			var key = rankSel.disabled ? typeSel.value : typeSel.value + "@" + rankSel.value + (forgeSel.value ? "+" + forgeSel.value : "");
			var info = E.charmInfo(key);
			if (!info) return;
			state.charms[info.key] = (state.charms[info.key] || 0) + 1;
			renderCharms();
			onChange();
		} });
		list.appendChild(el("div", { class: "charm-add" }, [
			el("span", { class: "field-label", text: "Add a lower-rank, forged or special charm" }),
			el("span", { class: "charm-add-row" }, [typeSel, rankSel, forgeSel, add])
		]));
	}

	/* ---------- other bonuses, target ---------- */

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
				el("button", { type: "button", class: "btn btn-small", text: "Load", title: "Load into " + target(app.active), onclick: function () {
					var keep = { name: state.name, partyCombo: "" };
					app.chars[app.active] = normalize(Object.assign({}, b.state, keep, { from: { type: "build", id: b.id, label: b.name } }));
					state = app.chars[app.active];
					loadTalentsIntoFrame();
					renderInputs();
					onChange();
					toast("Loaded " + b.name + " into " + target(app.active));
				} }),
				el("button", { type: "button", class: "btn btn-small", text: "Delete", onclick: function () {
					LIB.deleteBuild(b.id);
					if (compareId === b.id) compareId = "";
				} }),
				el("span", { class: "build-meta", text: disc.name + ", saved " + when(b.saved) })
			]));
		});
		renderCompareSelect();
	}

	function compareSelect() {
		var builds = savedBuilds();
		if (compareId && !builds.some(function (b) { return b.id === compareId; })) compareId = "";
		var sel = el("select", { class: "compare-select", "aria-label": "Compare with a saved build" });
		sel.appendChild(option("", "Nothing", !compareId));
		builds.forEach(function (b) { sel.appendChild(option(b.id, b.name, b.id === compareId)); });
		sel.addEventListener("change", function () { compareId = sel.value; renderResults(); });
		return sel;
	}

	// The compare pickers live in several tabs; keep them all showing the same build.
	function renderCompareSelect() {
		document.querySelectorAll(".compare-slot").forEach(function (slot) {
			clear(slot);
			slot.appendChild(el("label", { class: "field" }, [el("span", { class: "field-label", text: "Compare with" }), compareSelect()]));
		});
	}

	function setupBuilds() {
		$("save-form").addEventListener("submit", function (e) {
			e.preventDefault();
			var input = $("save-name");
			var name = input.value.trim() || (state.name ? state.name + " " : "") + currentDisc().name + " build";
			LIB.saveBuild(name, state);
			input.value = "";
			toast("Saved " + name);
		});
		$("copy-link").addEventListener("click", function () {
			copyText(shareUrl(), "Link to " + whose(app.active) + " build copied");
		});
	}

	function compareResult() {
		if (!compareId) return null;
		var b = savedBuilds().filter(function (x) { return x.id === compareId; })[0];
		if (!b) return null;
		var s = normalize(b.state);
		// Same combo settings, so combo DPS lines up.
		s.comboWindow = state.comboWindow;
		s.customCombo = state.customCombo.slice();
		return { name: b.name, result: computeFor(s) };
	}

	/* ---------- loads (scans from the DB Inventory Scanner) ---------- */

	var SLOT_NAME = {};
	D.gear.slots.forEach(function (s) { SLOT_NAME[s.key] = s.name; });
	var RARITY_NAME = { M: "Magic", R: "Rare", L: "Legendary" };
	var invOpen = {};   // which slot groups of the scanned gear panel are open

	function loadLabel(inv) { return "Load " + inv.slot + ": " + inv.character.name; }

	// The load the Gears tab shows: the one picked there, else the first filled slot.
	function selectedInventory() {
		var all = LIB.inventories().filter(function (x) { return x.slot; });
		if (!all.length) return null;
		var want = +storeGet(LOAD_VIEW_KEY, 0);
		return all.filter(function (x) { return x.slot === want; })[0] || all[0];
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
		return parts.join(", ");
	}

	function equipItem(item) {
		if (state.gearMode !== "pieces") state.gearMode = "pieces";
		state.gear[item.slot] = gearToSlot(item);
		renderGear();
		renderInventory();
		onChange();
	}

	// Puts a load's equipped gear and socketed charms on a character.
	function applyEquipped(inv, ch) {
		var equipped = inv.gear.filter(function (g) { return g.equipped; });
		if (!equipped.length) return false;
		ch.gearMode = "pieces";
		var charms = {};
		equipped.forEach(function (g) {
			ch.gear[g.slot] = gearToSlot(g);
			(g.charms || []).forEach(function (k) {
				var info = k && E.charmInfo(k);
				if (info) charms[info.key] = (charms[info.key] || 0) + 1;
			});
		});
		ch.charms = charms;
		return true;
	}

	function useEquipped(inv) {
		if (!applyEquipped(inv, state)) { toast("This load has no equipped gear"); return; }
		renderInputs();
		onChange();
		toast(cap(says(app.active, "now wears", "now wear")) + " " + inv.character.name + "'s equipped gear and charms");
	}

	function useLoadTalents(inv, ch) {
		if (!inv.talents) return;
		ch.talents = inv.talents;
		ch.selectedCombo = "";
		ch.partyCombo = "";
		if (ch === state) loadTalentsIntoFrame();
		onChange();
	}

	// A new party member from a load: its equipped gear, charms and (if pasted) talents.
	function memberFromLoad(inv, discId) {
		var ch = normalize(null);
		ch.name = inv.character.name.slice(0, 24);
		ch.talents = inv.talents && E.decodeBuild(inv.talents).discipline === discId ? inv.talents : String(discId);
		ch.customCombo = [];
		applyEquipped(inv, ch);
		ch.from = { type: "load", id: inv.id, label: "Load " + inv.slot };
		return ch;
	}

	function disciplinesOf(cls) { return D.disciplines.filter(function (d) { return d.cls === cls; }); }

	function loadDiscipline(inv) {
		if (inv.talents) return E.decodeBuild(inv.talents).discipline;
		return disciplinesOf(inv.character.class)[0].id;
	}

	function addMember(ch) {
		if (app.chars.length >= MAX_PARTY) { toast("A party has four members at most"); return false; }
		app.chars.push(ch);
		onChange();
		toast(charName(app.chars.length - 1) + " joined the party");
		return true;
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
		return parts.join(", ");
	}

	// Resolves to true when the scan was stored in a load slot.
	function importScan(input, opts) {
		opts = opts || {};
		return LIB.readScan(input).then(function (res) {
			if (res.error) { toast(res.error); return false; }
			var inv = LIB.putInventory(res.inventory, opts.slot || 0);
			if (!inv) {
				pendingScan = res.inventory;
				setTab("import");
				renderLoads();
				toast("All four loads are in use. Pick one to replace.");
				return false;
			}
			pendingScan = null;
			storeSet(LOAD_VIEW_KEY, inv.slot);
			renderLoads();
			renderInventory();
			renderTalentImport();
			if (!opts.quiet) toast(loadLabel(inv) + ", " + inv.gear.length + " gear and " + inv.charms.length + " kinds of charms");
			return true;
		});
	}

	function readFile(file, then) {
		var reader = new FileReader();
		reader.onload = function () { then(String(reader.result)); };
		reader.readAsText(file);
	}

	function pasteThen(then, what) {
		function fromText(text) { if (text && text.trim()) then(text); }
		if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
			navigator.clipboard.readText().then(fromText, function () { fromText(window.prompt("Paste the " + what + " here")); });
		} else {
			fromText(window.prompt("Paste the " + what + " here"));
		}
	}

	var fileTargetSlot = 0;
	function pickFile(slot) {
		fileTargetSlot = slot || 0;
		$("load-file").click();
	}

	function dropTarget(node, slot) {
		node.addEventListener("dragover", function (e) { e.preventDefault(); node.classList.add("drop"); });
		node.addEventListener("dragleave", function () { node.classList.remove("drop"); });
		node.addEventListener("drop", function (e) {
			e.preventDefault();
			node.classList.remove("drop");
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (f) readFile(f, function (text) { importScan(text, { slot: slot }); });
		});
	}

	function setupLoads() {
		var file = $("load-file");
		file.addEventListener("change", function () {
			var f = file.files && file.files[0];
			if (!f) return;
			var slot = fileTargetSlot;
			readFile(f, function (text) { importScan(text, { slot: slot }); file.value = ""; });
		});
	}

	function talentSummary(talents) {
		var b = E.decodeBuild(talents);
		var points = b.slots.reduce(function (n, s) { return n + s.level; }, 0);
		return D.disciplines[b.discipline].name + ", " + points + " talent point" + (points === 1 ? "" : "s");
	}

	function pasteTalentsInto(inv) {
		pasteThen(function (text) {
			var t = LIB.parseTalents(text);
			if (t.error) { toast(t.error); return; }
			if (D.disciplines[t.discipline].cls !== inv.character.class) {
				toast("Those talents are for a " + D.disciplines[t.discipline].cls + "; " + inv.character.name + " is a " + inv.character.class);
				return;
			}
			LIB.setInventoryTalents(inv.id, t.talents);
			toast("Talents saved with load " + inv.slot);
		}, "talent build or link");
	}

	function loadCard(slot) {
		var inv = LIB.inventoryInSlot(slot);
		var card = el("div", { class: "load-card" + (inv ? "" : " empty") });
		dropTarget(card, slot);
		var head = el("div", { class: "load-head" }, [el("h3", { text: "Load " + slot })]);
		card.appendChild(head);
		if (!inv) {
			card.appendChild(el("p", { class: "panel-note", text: "Empty. Import a scan file, paste a scan, or drop a file here." }));
			card.appendChild(el("div", { class: "load-actions" }, [
				el("button", { type: "button", class: "btn btn-small btn-primary", text: "Import file", onclick: function () { pickFile(slot); } }),
				el("button", { type: "button", class: "btn btn-small", text: "Paste scan", onclick: function () { pasteThen(function (t) { importScan(t, { slot: slot }); }, "scan"); } })
			]));
			return card;
		}
		head.appendChild(el("button", { type: "button", class: "icon-btn", "aria-label": "Remove load " + slot, title: "Remove this load", text: "×", onclick: function () {
			if (!window.confirm("Remove " + inv.character.name + "'s scan from load " + slot + (DRIVE && DRIVE.status().state === "synced" ? " here and in Google Drive" : "") + "?")) return;
			LIB.deleteInventory(inv.id);
		} }));
		var equipped = inv.gear.filter(function (g) { return g.equipped; }).length;
		card.appendChild(el("p", { class: "load-name" }, [el("b", { text: inv.character.name }), " " + inv.character.class]));
		card.appendChild(el("p", { class: "panel-note", text: "Scanned " + when(inv.scannedAt) + ". " + inv.gear.length + " gear (" + equipped + " equipped), " + inv.charms.length + " kinds of charms." }));

		var talentRow = el("div", { class: "load-talents" });
		if (inv.talents) {
			talentRow.appendChild(el("span", {}, ["Talents: ", el("b", { text: talentSummary(inv.talents) })]));
			if (discOf({ talents: inv.talents }).cls === currentClass()) {
				talentRow.appendChild(el("button", { type: "button", class: "link-btn", text: "Use on " + who(app.active), onclick: function () {
					useLoadTalents(inv, state);
					toast(cap(says(app.active, "now uses", "now use")) + " " + inv.character.name + "'s talents");
				} }));
			}
			talentRow.appendChild(el("button", { type: "button", class: "link-btn", text: "Replace", onclick: function () { pasteTalentsInto(inv); } }));
			talentRow.appendChild(el("button", { type: "button", class: "link-btn", text: "Remove", onclick: function () { LIB.setInventoryTalents(inv.id, ""); } }));
		} else {
			talentRow.appendChild(el("span", { class: "dim", text: "No talents with this load." }));
			talentRow.appendChild(el("button", { type: "button", class: "link-btn", text: "Paste talents", onclick: function () { pasteTalentsInto(inv); } }));
		}
		card.appendChild(talentRow);

		var discSel = el("select", { "aria-label": "Discipline for " + inv.character.name });
		disciplinesOf(inv.character.class).forEach(function (d) { discSel.appendChild(option(String(d.id), d.name, d.id === loadDiscipline(inv))); });
		var full = app.chars.length >= MAX_PARTY;
		var fits = inv.character.class === currentClass();
		if (!fits) card.appendChild(el("p", { class: "panel-note", text: cap(says(app.active, "is", "are")) + " a " + currentClass() + ", so " + inv.character.name + "'s gear goes on a party member." }));
		card.appendChild(el("div", { class: "load-actions" }, [
			fits ? el("button", { type: "button", class: "btn btn-small btn-primary", text: "Use gear on " + who(app.active), onclick: function () { useEquipped(inv); } }) : null,
			el("button", { type: "button", class: "btn btn-small", text: "Show gear", onclick: function () { storeSet(LOAD_VIEW_KEY, slot); renderInventory(); setTab("gears"); } }),
			el("span", { class: "load-join" }, [
				discSel,
				el("button", { type: "button", class: "btn btn-small" + (fits ? "" : " btn-primary"), text: "Add to party", disabled: full ? true : null, title: full ? "The party is full" : "", onclick: function () {
					if (addMember(memberFromLoad(inv, +discSel.value))) renderParty();
				} })
			])
		]));
		var update = el("details", { class: "load-update" }, [
			el("summary", { text: "Update with a new scan" }),
			el("div", { class: "load-actions" }, [
				el("button", { type: "button", class: "btn btn-small", text: "From a file", onclick: function () { pickFile(slot); } }),
				el("button", { type: "button", class: "btn btn-small", text: "Paste scan", onclick: function () { pasteThen(function (t) { importScan(t, { slot: slot }); }, "scan"); } })
			])
		]);
		card.appendChild(update);
		return card;
	}

	function renderLoads() {
		var box = $("loads");
		if (!box) return;
		clear(box);
		var all = LIB.inventories();
		var inSlots = all.filter(function (x) { return x.slot; });
		var tools = $("loads-tools");
		clear(tools);
		tools.appendChild(el("a", { class: "btn btn-small", href: SCANNER_URL, target: "_blank", rel: "noopener", text: "Get the scanner" }));
		if (all.length) {
			tools.appendChild(el("button", { type: "button", class: "btn btn-small", text: "Remove all", onclick: function () {
				if (!window.confirm("Remove all " + all.length + " loads" + (DRIVE && DRIVE.status().state === "synced" ? " here and in Google Drive" : "") + "?")) return;
				LIB.clearInventories();
				toast("All loads removed");
			} }));
		}
		$("loads-note").textContent = "Scans of your gear and charms from the DB Inventory Scanner (Windows). Up to four at once, one per character; " +
			(inSlots.length ? inSlots.length + " in use." : "none yet.") + " They're kept in this browser, and in Google Drive when you sign in.";

		if (pendingScan) {
			var ask = el("div", { class: "load-ask", role: "alert" }, [
				el("p", {}, ["All four loads are in use. Replace one with ", el("b", { text: pendingScan.character.name }), "'s scan?"])
			]);
			var row = el("div", { class: "load-actions" });
			[1, 2, 3, 4].forEach(function (slot) {
				var cur = LIB.inventoryInSlot(slot);
				row.appendChild(el("button", { type: "button", class: "btn btn-small", text: "Load " + slot + (cur ? " (" + cur.character.name + ")" : ""), onclick: function () {
					var inv = LIB.putInventory(pendingScan, slot);
					pendingScan = null;
					if (inv) { storeSet(LOAD_VIEW_KEY, slot); toast(loadLabel(inv) + " stored"); }
					renderLoads();
				} }));
			});
			row.appendChild(el("button", { type: "button", class: "btn btn-small", text: "Cancel", onclick: function () { pendingScan = null; renderLoads(); } }));
			ask.appendChild(row);
			box.appendChild(ask);
		}
		for (var slot = 1; slot <= LIB.MAX_LOADS; slot++) box.appendChild(loadCard(slot));

		var extra = $("loads-extra");
		clear(extra);
		var others = all.filter(function (x) { return !x.slot; });
		if (others.length) {
			extra.appendChild(el("h3", { class: "group-title", text: "Loads from your other devices that don't fit" }));
			var ul = el("ul", { class: "build-list" });
			others.forEach(function (inv) {
				var free = LIB.freeSlot();
				ul.appendChild(el("li", {}, [
					el("span", { class: "build-name", text: inv.character.name + " (" + inv.character.class + ")" }),
					free ? el("button", { type: "button", class: "btn btn-small", text: "Put in load " + free, onclick: function () { LIB.moveInventory(inv.id, free); } }) : null,
					el("button", { type: "button", class: "btn btn-small", text: "Remove", onclick: function () { LIB.deleteInventory(inv.id); } }),
					el("span", { class: "build-meta", text: "scanned " + when(inv.scannedAt) })
				]));
			});
			extra.appendChild(ul);
		}
	}

	/* ---------- Gears tab: browse a load ---------- */

	function renderInventory() {
		var box = $("inventory-body");
		if (!box) return;
		clear(box);
		var tools = $("inv-tools");
		clear(tools);
		var all = LIB.inventories().filter(function (x) { return x.slot; });
		var inv = selectedInventory();
		if (!inv) {
			box.appendChild(el("p", { class: "panel-note" }, [
				"Scan your gear and charms in the game with the ",
				el("a", { href: SCANNER_URL, target: "_blank", rel: "noopener", text: "DB Inventory Scanner" }),
				" (Windows), then bring the scan in from the Import tab. Its “Open in DPS Calculator” button does that for you."
			]));
			tools.appendChild(el("button", { type: "button", class: "btn btn-small", text: "Go to Import", onclick: function () { setTab("import"); } }));
			return;
		}
		var sel = el("select", { "aria-label": "Load to show" });
		all.forEach(function (x) { sel.appendChild(option(String(x.slot), loadLabel(x), x.slot === inv.slot)); });
		sel.addEventListener("change", function () { storeSet(LOAD_VIEW_KEY, +sel.value); renderInventory(); });
		tools.appendChild(sel);

		var cls = currentClass();
		var head = el("div", { class: "inv-head" });
		head.appendChild(el("p", { class: "inv-meta" }, [
			el("b", { text: inv.character.name }),
			" " + inv.character.class + ". Scanned " + when(inv.scannedAt) + ", " + inv.gear.length + " gear."
		]));
		var mismatch = inv.character.class !== cls;
		head.appendChild(el("div", { class: "inv-actions" }, [
			el("button", { type: "button", class: "btn btn-small btn-primary", text: "Use equipped gear and charms", disabled: mismatch ? true : null, onclick: function () { useEquipped(inv); } }),
			inv.talents ? el("button", { type: "button", class: "btn btn-small", text: "Use its talents", disabled: mismatch ? true : null, onclick: function () { useLoadTalents(inv, state); toast(cap(says(app.active, "now uses", "now use")) + " " + inv.character.name + "'s talents"); } }) : null
		]));
		box.appendChild(head);
		if (mismatch) {
			box.appendChild(el("p", { class: "panel-note warn", text: inv.character.name + " is a " + inv.character.class + " and " + says(app.active, "is", "are") + " a " + cls + ". Open a " + inv.character.class + " in the party bar, or change discipline in the Character tab, to equip this gear." }));
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
							RARITY_NAME[g.rarity] + ", " + focusName + (g.level ? ", level " + g.level : "") + (g.stats ? ": " + statsLine(g.stats) : ""),
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

	/* ---------- Settings: Google Drive, backup file, this browser ---------- */

	function timeAgo(t) {
		var s = Math.max(0, Math.round((Date.now() - t) / 1000));
		if (s < 60) return "just now";
		if (s < 3600) return Math.round(s / 60) + " min ago";
		if (s < 86400) return Math.round(s / 3600) + " h ago";
		return new Date(t).toLocaleDateString();
	}

	function applyWorkspace(data) {
		app = normalizeApp(data);
		state = app.chars[app.active];
		partyCache = {};
		loadTalentsIntoFrame();
		renderInputs();
		onChange();
	}

	function stateLabel(st) {
		return st.state === "syncing" ? "Syncing…"
			: st.state === "synced" ? "Synced " + timeAgo(st.lastSync || Date.now())
			: st.state === "expired" ? "Not syncing: sign-in expired"
			: st.state === "connecting" ? "Connecting…"
			: st.state === "error" ? "Sync problem"
			: "Signed out";
	}

	function renderDrive(st) {
		var chip = $("sync-chip");
		var box = $("drive-settings");
		if (!DRIVE || !DRIVE.configured) {
			if (box) { clear(box); box.appendChild(el("p", { class: "panel-note", text: "Google sign-in isn't set up on this copy of the calculator." })); }
			return;
		}
		st = st || DRIVE.status();
		var p = st.profile || {};
		var signedIn = st.state !== "signed-out" && p.email;
		if (chip) {
			chip.hidden = !signedIn;
			clear(chip);
			if (signedIn) {
				chip.className = "sync-chip cloud-" + st.state;
				chip.title = "Google Drive: " + stateLabel(st);
				chip.appendChild(el("span", { class: "sync-dot", "aria-hidden": "true" }));
				chip.appendChild(document.createTextNode(st.state === "synced" ? "Drive" : stateLabel(st)));
				chip.onclick = function () { setTab("settings"); };
			}
		}
		if (!box) return;
		clear(box);
		if (!signedIn) {
			box.appendChild(el("p", { text: "Sign in to keep your saved builds, loads, combos and meter runs in your own Google Drive and get them in any browser. The calculator only sees its own hidden folder there, nothing else in your Drive." }));
			box.appendChild(el("div", { class: "settings-actions" }, [
				el("button", { type: "button", class: "btn btn-primary btn-google", disabled: st.gis === "failed" ? true : null, onclick: function () { DRIVE.signIn(); } }, "Sign in with Google")
			]));
			if (st.message) box.appendChild(el("p", { class: "panel-note" + (st.state === "error" ? " warn" : ""), role: "status", text: st.message }));
			return;
		}
		box.appendChild(el("div", { class: "account" }, [
			p.picture ? el("img", { src: p.picture, alt: "", width: "40", height: "40", referrerpolicy: "no-referrer" }) : el("span", { class: "g-mark", text: (p.name || p.email || "?").charAt(0).toUpperCase() }),
			el("span", {}, [el("b", { text: p.name || p.email }), el("br"), el("small", { text: p.email })]),
			el("span", { class: "cloud-state cloud-" + st.state, text: stateLabel(st) })
		]));
		var last = DRIVE.lastBackup ? DRIVE.lastBackup() : 0;
		box.appendChild(el("p", { class: "panel-note", text: "Saved builds, loads, combos and meter runs sync on their own while you're signed in. " +
			(last ? "Your party was last backed up " + timeAgo(last) + "." : "Back up now also keeps your party: its members, gear, talents and combos.") }));
		var busy = st.state === "syncing" || st.state === "connecting";
		box.appendChild(el("div", { class: "settings-actions" }, [
			st.state === "expired"
				? el("button", { type: "button", class: "btn btn-primary", text: "Reconnect", onclick: function () { DRIVE.signIn(); } })
				: el("button", { type: "button", class: "btn btn-primary", text: "Back up now", disabled: busy ? true : null, onclick: function () {
					DRIVE.backup(JSON.parse(JSON.stringify(app))).then(function (ok) { if (ok) toast("Backed up to Google Drive"); });
				} }),
			el("button", { type: "button", class: "btn", text: "Load from Drive", disabled: busy || st.state === "expired" ? true : null, onclick: function () {
				if (!window.confirm("Load from Google Drive? This browser's saved builds, loads, combos and meter runs become the Drive copy, and the party from your last backup replaces the current one.")) return;
				DRIVE.restore().then(function (res) {
					if (res.workspace && res.workspace.data) {
						applyWorkspace(res.workspace.data);
						toast("Loaded your backup from " + when(res.workspace.saved));
					} else {
						toast("Loaded builds and loads from Google Drive");
					}
				}, function (e) { toast(e.message); });
			} }),
			el("button", { type: "button", class: "btn", text: "Sign out", onclick: function () { DRIVE.signOut(); } })
		]));
		if (st.message && (st.state === "error" || st.state === "expired")) {
			box.appendChild(el("p", { class: "panel-note warn", role: "status", text: st.message }));
		}
	}

	function setupCloud() {
		if (!DRIVE || !DRIVE.configured) { renderDrive(); return; }
		DRIVE.onStatus(renderDrive);
		DRIVE.init();
		setInterval(function () { if (DRIVE.status().state === "synced") renderDrive(DRIVE.status()); }, 60000);
	}

	function downloadFile(name, text) {
		var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
		var a = el("a", { href: url, download: name });
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
	}

	function renderFileSettings() {
		var box = $("file-settings");
		if (!box) return;
		clear(box);
		var lib = LIB.current();
		box.appendChild(el("p", { text: "One file with your saved builds (" + lib.builds.length + "), loads (" + lib.inventories.length + "), saved combos (" + lib.combos.length + "), meter runs (" + lib.runs.length + ") and party (" + app.chars.length + (app.chars.length === 1 ? " member" : " members") + "). Keep it anywhere and bring it back here or in another browser." }));
		box.appendChild(el("div", { class: "settings-actions" }, [
			el("button", { type: "button", class: "btn btn-primary", text: "Download backup file", onclick: function () {
				var data = { format: "dbb-calculator-backup", v: 1, saved: new Date().toISOString(), library: LIB.current(), workspace: app };
				downloadFile("dbb-dps-calculator-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data));
			} }),
			el("button", { type: "button", class: "btn", text: "Restore from a file", onclick: function () { $("backup-file").click(); } })
		]));
	}

	function setupFileSettings() {
		var input = $("backup-file");
		input.addEventListener("change", function () {
			var f = input.files && input.files[0];
			if (!f) return;
			readFile(f, function (text) {
				input.value = "";
				var data;
				try { data = JSON.parse(text); } catch (e) { toast("That file isn't a backup: it is not valid JSON."); return; }
				if (!data || data.format !== "dbb-calculator-backup") { toast("That file isn't a DPS Calculator backup."); return; }
				var lib = data.library || {};
				var nb = (lib.builds || []).length, ni = (lib.inventories || []).length, nc = (lib.combos || []).length, nr = (lib.runs || []).length;
				var np = data.workspace && data.workspace.chars ? data.workspace.chars.length : 0;
				if (!window.confirm("Restore this backup from " + when(data.saved) + "? Its " + nb + " builds, " + ni + " loads, " + nc + " saved combos and " + nr + " meter runs are added to this browser's" + (np ? ", and its party of " + np + " replaces the current one." : "."))) return;
				LIB.replace(LIB.merge(LIB.current(), lib), "sync");
				if (data.workspace) applyWorkspace(data.workspace);
				toast("Backup restored");
			});
		});
	}

	function renderBrowserSettings() {
		var box = $("browser-settings");
		if (!box || box.firstChild) return;
		box.appendChild(el("p", { text: "Everything you do here is saved in this browser as you go. Clearing it removes your builds, loads and party from this browser only; a Google Drive backup stays where it is." }));
		box.appendChild(el("div", { class: "settings-actions" }, [
			el("button", { type: "button", class: "btn", text: "Clear this browser's data", onclick: function () {
				if (!window.confirm("Clear all saved builds, loads and the party from this browser?")) return;
				try {
					[APP_KEY, LAST_KEY, LIB.KEY, TAB_KEY, SCOPE_KEY, LOAD_VIEW_KEY, "dbb-saved-builds-v1", "dbb-inventory-selected-v1", "dbb-sheet-tab-v1", "dbb-drive-v1"].forEach(function (k) { window.localStorage.removeItem(k); });
					window.sessionStorage.removeItem("dbb-drive-token-v1");
				} catch (e) { /* storage blocked */ }
				location.href = location.pathname;
			} })
		]));
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

	function renderMethod() {
		var box = $("method");
		if (!box || box.firstChild) return;
		[
			["Base stats", "Level 50 with no gear, talents or charms: 68,109 HP, 3,914 Attack, 2,655 Expertise, and 1,344 Defense for rogues, 1,008 for mages, 1,680 for paladins."],
			["Gear", "Each piece's Attack, Expertise and Defense come from the game's gear tables for your class, slot, stat focus and rarity at level 50, scaled by 912/1575 so a legendary Attack main hand gives 912 Attack. Runes use the game's values: Critical Chance +10% stat, Critical Power +10%, Attack Speed +5%, Health Bonus +15% max HP, Tenacity +15%, Recovery +10%, slayer +10% damage, resist +10%."],
			["Critical hits", "Real chance is 15% × (1 + Critical Chance stat). A crit adds a percentage of the hit: Heavy Blow 60%, Hemorrhage 112.5% (3 ticks of 37.5%), elemental runes 100% against their opposite, 50% neutral, 25% against their own element. Each damaging critical rune also adds half your Critical Power. Heavy Blows, Hemorrhage and Element Mastery multiply their rune. Mending Blow heals 100% of the crit plus half your Critical Power; Renew heals 125% over 5 ticks and scales with Recovery, not Critical Power."],
			["Skills", "Each skill fires one pulse per cast-time step in the game's power data, and every pulse hits for Attack × that step's damage multiplier (skill runes add to it). Skill hits can crit, so their expected value uses the average crit multiplier; basic attacks only crit on the 3rd hit of the chain. The debuffs and DoTs a skill lists land on every pulse unless the game marks them First or Last, which is how Shadow Rend or Harm stack so fast."],
			["Target debuffs", "Armor Bane: +5% damage per stack, up to 7. Armor Breaker: 20%, 35% or 50% more damage, and only two different values count at once. Scorch: +1% per stack, 15 stacks (more with Flameseer's Pyromania talent). Other Defense debuffs (Penance, Death Mark, Shadow Step, Hemorrhage's talent) add their percentage. Acid Edge adds to each Armor Bane stack and Armor Breaker; Corrosive Strikes and similar talents lengthen the debuffs."],
			["Damage over time", "Per tick per stack is a share of Expertise: Bleed 6%, rogue and Flurry poison 60%, chaos and mage poison 30%, Bind 30%, Burn 9%, Chilblains 15%, Ignite 15%, Holy fire 30%, Plague 40% at rank 1, Soul Reaver 120% over its ticks. Other DoTs use the game formula DoTDamage × 1.5 ÷ ticks. Talents that raise a DoT add to its DoTDamage the way the game does, and stack talents raise the cap. DoTs ignore Defense, weakens and slayer runes."],
			["Paladin specials", "Retribution reflects a share of Expertise on each hit you take: 80% at rank 1, 100% at 2, 123% at 5, 130% at 6, 155% at 10, reflecting up to 7, 9 or 10 hits; ranks in between are estimated. Hallowed Reckoning hits 4 times and applies Holy Fire with each tick from rank 5."],
			["Combo DPS", "A combo plays its steps in a loop for the fight length against one target. Debuffs from earlier steps raise the damage of later ones, DoTs build up, refresh and tick once a second, frozen and rooted targets break free when hit, and talents that need a target state switch on while the combo keeps that state up. Buffs on you (Berserker, Draconic Soul, Chaos Wave, Ghost Blade, Empyrean Aura) and basic-attack changes (Cleaving Blows, Verdict, Sentinel Form, Pyromania, Meteor) last their real duration. Attack speed only speeds up basic attacks, as in the game. A skill on cooldown is skipped until it is ready."],
			["Party fights", "In the Party view every member loops their own combo against the same target at the same time. The target's debuffs are shared: one member's Armor Bane, Armor Breaker, Scorch, curses, slows and stuns raise everyone's damage and switch on everyone's talents that need them, and a target bleeding or ignited by anyone counts as bleeding or ignited. Each member's DoTs stack on their own. Buffs a skill gives the whole party (Empyrean Aura) count for every member while they last. Find the best combos tries every member's presets and their own combo together and keeps the set with the most party damage."],
			["Meter runs", "A DB DPS Launcher export lists every cast and every hit and DoT tick. Each hit counts for the cast that caused it: the latest cast of the same spell (basic attacks by their power), and rune procs such as Hemorrhage for the latest cast of any kind. The best 5, 10 and 20 s are the stretches of casting whose casts caused the most damage, DoT ticks after the stretch included; the damage that landed inside it is shown next to it. In a dungeon that damage is spread over many targets, while a saved combo plays on one. Assassinate (DeathBlowOld in the live game) fires the Assassinate powers, and ranged basic attacks play as the melee chain."],
			["Mana", "Sustained DPS follows the game's mana: you start with 80, each basic attack hit gives 5, and skills spend their cost, so the combo stops for basic attacks when it runs dry. Basic attacks changed by Cleaving Blows, Verdict, Sentinel Form, Meteor or Pyromania give no mana (their game data has none), and Sentinel Form, Pyromania and Hailstone Embrace attacks spend master mana. Spending mana fills master mana (100 max, full at the start) for master skills; the 0.4 per mana spent used here is an estimate. Burst DPS ignores mana."],
			["Still approximate", "Enemy defense is a flat reduction you enter, and slayer runes multiply direct hits against that creature type. Multi-hit skills assume the target stays inside the area for every pulse; dashes that pass through a target may hit it fewer times. Pets, summons, minions, Retribution's reflected damage (it depends on how often you are hit), Decoy timing, Midnight Shroud's bonus hit and the extra Expertise-based debuff duration are not counted in combo DPS. Check skill numbers against the training dummy before trusting small differences."]
		].forEach(function (p) {
			box.appendChild(el("p", {}, [el("strong", { text: p[0] + ". " }), p[1]]));
		});
	}

	/* ---------- Character tab: who this is ---------- */

	function renderCharHead(r) {
		var box = $("char-fields");
		if (!box) return;
		clear(box);
		var name = el("input", { type: "text", maxlength: "24", autocomplete: "off", value: state.name || "", placeholder: app.active === 0 ? "You" : r.discipline.name });
		name.addEventListener("change", function () { state.name = name.value.trim().slice(0, 24); onChange(); });
		box.appendChild(el("label", { class: "field" }, [el("span", { class: "field-label", text: "Name" }), name]));
		box.appendChild(el("label", { class: "field" }, [el("span", { class: "field-label", text: "Discipline" }),
			disciplineSelect(r.build.discipline, function (id) { setDiscipline(state, id); })]));
		box.appendChild(el("div", { class: "compare-slot" }));
		var from = state.from;
		var where = from ? (from.type === "load" ? "Gear from " + from.label : from.type === "build" ? "Loaded from the saved build " + from.label : from.type === "copy" ? "Copied from " + from.label : "") : "";
		$("sheet-sub").textContent = r.discipline.name + " " + r.cls + ", level 50, " + r.talents.points + " talent points" + (where ? ". " + where + "." : ".");
		renderCompareSelect();
	}

	/* ---------- Talents tab: what the talents add ---------- */

	function renderTalentInflow(r) {
		var box = $("talent-inflow");
		if (!box) return;
		clear(box);
		var tal = r.talents;
		var b = r.breakdown;
		var s = r.stats;
		$("inflow-sub").textContent = tal.points + " talent points in " + r.discipline.name + ", flowing into the character sheet and every combo.";
		if (!tal.stones.length) {
			box.appendChild(el("p", { class: "panel-note", text: "No talentstones socketed yet. Socket some in the tree above, or bring a build in." }));
			return;
		}

		// Stats: how much of each total comes from talents.
		var rows = [
			["Attack", (b.attack.talents || 0) + (b.attack.fromExpertise || 0), s.attack, b.attack.fromExpertise ? fmt(b.attack.fromExpertise) + " of it from Expertise" : ""],
			["Expertise", (b.expertise.talents || 0), s.expertise, ""],
			["Defense", (b.defense.talents || 0) + (b.defense.fromExpertise || 0), s.defense, b.defense.fromExpertise ? fmt(b.defense.fromExpertise) + " of it from Expertise" : ""],
			["Max HP", (b.hp.talents || 0) + (b.hp.fromExpertise || 0), s.hp, b.hp.fromExpertise ? fmt(b.hp.fromExpertise) + " of it from Expertise" : ""]
		];
		var t = el("table", { class: "data-table inflow-table" }, [el("thead", {}, el("tr", {}, [
			el("th", { text: "Stat" }), el("th", { text: "From talents" }), el("th", { text: "Your total" }), el("th", { text: "Share" })
		]))]);
		var body = el("tbody");
		rows.forEach(function (row) {
			if (!row[1]) return;
			body.appendChild(el("tr", {}, [
				el("td", {}, [row[0], row[3] ? el("span", { class: "how dim", text: " " + row[3] }) : null]),
				el("td", {}, el("span", { class: "value", text: "+" + fmt(row[1]) })),
				el("td", { text: fmt(row[2]) }),
				el("td", {}, [el("span", { class: "share-bar", "aria-hidden": "true" }, el("i", { style: "width:" + clamp(row[1] / Math.max(1, row[2]) * 100, 0, 100).toFixed(1) + "%" })), " " + pct(row[1] / Math.max(1, row[2]), 0)])
			]));
		});
		[["Critical Chance stat", tal.critChance], ["Recovery", tal.recovery], ["Tenacity", tal.tenacity], ["Attack speed", tal.attackSpeed]].forEach(function (row) {
			if (!row[1]) return;
			body.appendChild(el("tr", {}, [el("td", { text: row[0] }), el("td", {}, el("span", { class: "value", text: "+" + pct(row[1], 1) })), el("td", { colspan: "2", class: "dim", text: row[0] === "Critical Chance stat" ? "real chance " + pct(s.critReal, 2) + " in all" : "" })]));
		});
		t.appendChild(body);
		box.appendChild(t);

		// Damage effects that are always on.
		var always = [];
		var rune = { heavyBlow: "Heavy Blow", hemorrhage: "Hemorrhage", elemental: "elemental critical" };
		Object.keys(tal.critRune).forEach(function (k) { if (tal.critRune[k]) always.push("+" + pct(tal.critRune[k], 1) + " " + rune[k] + " damage"); });
		r.dots.forEach(function (d) {
			if (d.talentPct) always.push(d.name + ": +" + pct(d.talentPct / 100, 1) + " of Expertise per tick");
		});
		var dotName = {};
		r.dots.forEach(function (d) { dotName[d.buff] = d.name; });
		Object.keys(tal.dotStacks).forEach(function (k) { if (tal.dotStacks[k]) always.push("+" + tal.dotStacks[k] + " max " + (dotName[k] || k) + " stacks"); });
		if (tal.scorchStacks) always.push("+" + tal.scorchStacks + " max Scorch stacks");
		if (tal.acid) always.push("Armor Bane and Armor Breaker hit harder (+" + pct(tal.acid, 1) + " per Armor Bane stack)");
		if (tal.hemoDebuff) always.push("Hemorrhage lowers the target's Defense by " + pct(tal.hemoDebuff, 2));
		var longer = {};
		Object.keys(tal.debuffTime).forEach(function (k) {
			if (!tal.debuffTime[k]) return;
			var label = (E.debuffLabel(k) || k).replace(/\s*[−-]?\d+(\.\d+)?%$/, "");
			var sx = shortSecs(tal.debuffTime[k]);
			longer[sx] = longer[sx] || [];
			if (longer[sx].indexOf(label) < 0) longer[sx].push(label);
		});
		Object.keys(longer).forEach(function (sx) {
			var names = longer[sx];
			always.push((names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0]) + " last " + sx + " longer");
		});
		if (always.length) {
			box.appendChild(el("h3", { class: "group-title", text: "Damage effects" }));
			box.appendChild(el("ul", { class: "note-list" }, always.map(function (x) { return el("li", { text: x }); })));
		}

		// Situational bonuses: on when their condition holds.
		var conds = [];
		var states = state.target.states || {};
		function condLine(c, what) {
			var self = E.SELF_CONDITIONS[c.cond];
			var on = !!states[c.cond];
			conds.push(el("li", {}, [what + " when " + E.CONDITIONS[c.cond].toLowerCase() + " ",
				el("span", { class: "tag" + (on ? " tag-best" : ""), text: self ? (on ? "on" : "off") : (on ? "on in the sheet" : "combos decide") }),
				el("small", { class: "dim", text: " " + c.source })]));
		}
		tal.critCond.forEach(function (c) { condLine(c, "+" + pct(c.value, 0) + " Critical Chance stat"); });
		tal.dmgCond.forEach(function (c) { condLine(c, "+" + pct(c.value, 1) + " damage"); });
		tal.condPct.forEach(function (c) { condLine(c, "+" + pct(c.value, 1) + " " + c.stats.join(" and ")); });
		tal.dotVs.forEach(function (c) { condLine(c, "+" + pct(c.value, 1) + " poison damage"); });
		tal.shredCond.forEach(function (c) { condLine(c, "−" + pct(c.value, 1) + " target Defense"); });
		if (conds.length) {
			box.appendChild(el("h3", { class: "group-title", text: "Situational" }));
			box.appendChild(el("ul", { class: "note-list cond-list" }, conds));
			box.appendChild(el("p", { class: "panel-note", text: "Turn situations on under Target and situation in the Character tab. Combos switch target states on by themselves while their debuffs are up." }));
		}
	}

	function renderTalentFx(r) {
		var box = $("talent-fx");
		if (!box) return;
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

	function useTalents(build) {
		var t = LIB.parseTalents(build);
		if (t.error) { toast(t.error); return false; }
		var to = D.disciplines[t.discipline];
		if (to.cls !== currentClass() && !window.confirm(cap(says(app.active, "is", "are")) + " a " + currentClass() + ". Switch " + (isYou(app.active) ? "" : "them ") + "to " + to.name + "? Gear stays as it is.")) return false;
		if (E.decodeBuild(state.talents).discipline !== t.discipline) { state.selectedCombo = ""; state.partyCombo = ""; }
		state.talents = t.talents;
		loadTalentsIntoFrame();
		onChange();
		toast(cap(says(app.active, "now uses", "now use")) + " " + talentSummary(t.talents));
		return true;
	}

	function renderTalentImport() {
		var box = $("talent-import");
		if (!box) return;
		clear(box);
		var input = el("input", { type: "text", autocomplete: "off", placeholder: "Talent build or talent calculator link" });
		var form = el("form", { class: "save-form" }, [
			el("label", { class: "field" }, [el("span", { class: "field-label", text: "Paste a build" }), input]),
			el("button", { type: "submit", class: "btn btn-primary", text: "Use these talents" })
		]);
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			if (useTalents(input.value)) input.value = "";
		});
		box.appendChild(form);
		var withTalents = LIB.inventories().filter(function (x) { return x.slot && x.talents; });
		if (withTalents.length) {
			box.appendChild(el("h3", { class: "group-title", text: "From your loads" }));
			var ul = el("ul", { class: "build-list" });
			withTalents.forEach(function (inv) {
				ul.appendChild(el("li", {}, [
					el("span", { class: "build-name", text: loadLabel(inv) }),
					el("button", { type: "button", class: "btn btn-small", text: "Use", onclick: function () { useTalents(inv.talents); } }),
					el("span", { class: "build-meta", text: talentSummary(inv.talents) })
				]));
			});
			box.appendChild(ul);
		}
		box.appendChild(el("div", { class: "settings-actions" }, [
			el("button", { type: "button", class: "btn btn-small", text: "Copy this build", onclick: function () { copyText(state.talents, "Talent build copied"); } })
		]));
		box.appendChild(el("p", { class: "panel-note", text: "Talents can also be saved with a load in the Import tab. Reading them straight from the game will come with a scanner update; loads will then bring their talents along." }));
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
		var best = r.combos.slice().sort(function (a, b) { return comboResult(b).dps - comboResult(a).dps; })[0];
		if (!best) { btn.hidden = true; return; }
		btn.hidden = false;
		btn.appendChild(el("span", { class: "best-label", text: "Best combo" }));
		btn.appendChild(el("span", { class: "best-name", text: best.name }));
		btn.appendChild(el("span", { class: "best-dps" }, [el("span", { class: "value", text: fmt(comboResult(best).dps) }), " DPS"]));
		btn.appendChild(el("span", { class: "best-go", text: "See combos" }));
		btn.onclick = function () { setScope("character"); setTab("combos"); };
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
				el("span", { class: "combo-name" }, [c.name, c.preset ? null : el("span", { class: "tag", text: c.saved ? "saved" : "yours" }), c.result.dps === best ? el("span", { class: "tag tag-best", text: "best" }) : null]),
				el("span", { class: "combo-steps", text: stepsText(r, c.steps), title: c.steps.length > 8 ? stepsText(r, c.steps) : null }),
				c.source && c.source.type === "meter" ? el("span", { class: "combo-measured", text: "In game " + fmt(c.source.dps) + " DPS over " + c.source.seconds + " s" }) : null,
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

	// "Withering Impact → Basic attack ×3 → Vicious Assault": a repeat in a row is written once.
	function stepsText(r, steps) {
		var out = [];
		steps.forEach(function (k) {
			var name = stepName(r, k);
			var last = out[out.length - 1];
			if (last && last.name === name) last.n++;
			else out.push({ name: name, n: 1 });
		});
		return out.map(function (x) { return x.name + (x.n > 1 ? " ×" + x.n : ""); }).join(" → ");
	}

	// What a saved combo remembers from the game, and what can be done with it.
	function savedComboBox(c) {
		var box = el("div", { class: "measured" });
		var src = c.source;
		if (src && src.type === "meter") {
			box.appendChild(el("p", {}, [
				"Measured in game: ", el("b", { text: fmt(src.dps) + " DPS" }),
				" over " + src.seconds + " s, " + METER.clockText(src.startMs) + " to " + METER.clockText(src.endMs) + " of " + src.character + "'s run" + (src.place ? " in " + src.place : "") +
				", hitting " + src.targets + (src.targets === 1 ? " target." : " targets (" + pct(src.topTargetShare, 0) + " of it on the main one).") +
				" The simulation above plays it on one target."
			]));
			if (src.rotation) box.appendChild(el("p", { class: "panel-note", text: "Rotation in game: " + src.rotation }));
		}
		box.appendChild(el("div", { class: "settings-actions" }, [
			el("button", { type: "button", class: "btn btn-small", text: "Rename", onclick: function () {
				var name = window.prompt("New name for this combo", c.name);
				if (name && name.trim()) LIB.renameCombo(c.id, name);
			} }),
			el("button", { type: "button", class: "btn btn-small", text: "Copy to your combo", onclick: function () {
				state.customCombo = c.steps.slice(0, MAX_STEPS);
				state.selectedCombo = "custom";
				onChange();
				toast("Copied to your combo. Change it in the builder below.");
			} }),
			el("button", { type: "button", class: "btn btn-small", text: "Delete", onclick: function () {
				if (!window.confirm("Delete the saved combo " + c.name + "?")) return;
				app.chars.forEach(function (ch) {
					if (ch.selectedCombo === c.id) ch.selectedCombo = "";
					if (ch.partyCombo === c.id) ch.partyCombo = "";
				});
				LIB.deleteCombo(c.id);
				toast("Deleted " + c.name);
			} })
		]));
		return box;
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

		box.appendChild(el("div", { class: "combo-head" }, [
			el("div", { class: "combo-big" }, [
				el("span", { class: "big-num" }, fmt(res.dps)),
				el("span", { class: "big-unit", text: " DPS" }),
				otherRes ? deltaNode(res.dps, otherRes.dps) : null,
				el("span", { class: "big-sub", text: c.name + ", " + (mana ? "sustained with mana" : "burst, mana ignored") + ": " + fmt(res.total) + " damage in " + res.windowS + " s" + (otherRes ? ". " + cmp.name + ": " + fmt(otherRes.dps) + " DPS" : "") })
			])
		]));
		box.appendChild(el("p", { class: "combo-why", text: c.why }));
		if (c.saved) box.appendChild(savedComboBox(c));

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
		// Basic attacks in a row without effects share one row.
		var rows = [];
		res.timeline.forEach(function (step) {
			var last = rows[rows.length - 1];
			if (step.basic && !step.effects.length && last && last.basic && !last.effects.length && last.name === step.name) {
				last.n++;
				last.ms += step.ms;
				return;
			}
			rows.push({ start: step.start, ms: step.ms, name: step.name, basic: step.basic, master: step.master, effects: step.effects, n: 1 });
		});
		rows.forEach(function (step) {
			ol.appendChild(el("li", { class: step.basic ? "tl-basic" : (step.master ? "tl-master" : "") }, [
				el("span", { class: "tl-time", text: secs(step.start) }),
				el("span", { class: "tl-name" }, [step.name + (step.n > 1 ? " ×" + step.n : ""), step.master ? el("span", { class: "tag", text: "master" }) : null, el("small", { text: " " + secs(step.ms) })]),
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

	/* ---------- Combos tab: toolbar ---------- */

	function showScope() {
		document.querySelectorAll("[data-combo-scope]").forEach(function (b) {
			b.setAttribute("aria-checked", b.getAttribute("data-combo-scope") === comboScope ? "true" : "false");
		});
		SCOPES.forEach(function (k) { var box = $("combos-" + k); if (box) box.hidden = k !== comboScope; });
	}

	function setScope(scope) {
		comboScope = SCOPES.indexOf(scope) >= 0 ? scope : "character";
		if (!POPOUT) storeSet(SCOPE_KEY, comboScope);
		showScope();
		renderResults();
	}

	function windowSelect(value, onpick) {
		var sel = el("select", { "aria-label": "Fight length" });
		WINDOWS.forEach(function (w) { sel.appendChild(option(String(w), w + " seconds", w === value)); });
		sel.addEventListener("change", function () { onpick(+sel.value); });
		return el("label", { class: "field field-inline" }, [el("span", { class: "field-label", text: "Fight length" }), sel]);
	}

	function renderCombosTools() {
		var box = $("combos-tools");
		if (!box) return;
		clear(box);
		if (comboScope === "meter") {
			box.appendChild(el("button", { type: "button", class: "btn btn-primary", text: "Import meter files", onclick: function () { $("meter-file").click(); } }));
			box.appendChild(el("a", { class: "btn btn-small", href: LAUNCHER_URL, target: "_blank", rel: "noopener", text: "Get DB DPS Launcher" }));
			return;
		}
		if (comboScope === "party") {
			box.appendChild(windowSelect(app.party.window, function (w) { app.party.window = w; optimizeResult = null; onChange(); }));
			box.appendChild(segmented("Mana", [["mana", "Sustained (mana)"], ["burst", "Burst"]], app.party.mode, function (m) { app.party.mode = m; optimizeResult = null; onChange(); }));
			box.appendChild(el("button", { type: "button", class: "btn btn-primary", text: optimizing ? "Working…" : "Find the best combos", disabled: optimizing || app.chars.length < 1 ? true : null, onclick: runOptimizer }));
			return;
		}
		box.appendChild(windowSelect(state.comboWindow, function (w) { state.comboWindow = w; onChange(); }));
		box.appendChild(segmented("Mana", [["mana", "Sustained (mana)"], ["burst", "Burst"]], state.comboMode, function (m) { state.comboMode = m; onChange(); }));
		box.appendChild(el("div", { class: "compare-slot" }));
		if (!POPOUT) box.appendChild(el("button", { type: "button", class: "btn btn-small", text: "Open in new window", onclick: function () {
			var url = location.pathname + "?view=combos#b=" + toB64(JSON.stringify(state));
			var w = window.open(url, "dbb-combo-window", "width=1100,height=900");
			if (!w) location.href = url;
		} }));
	}

	/* ---------- the combo builder: click skills, see what a pass costs ---------- */

	function slotConflicts(abilities, steps) {
		var bySlot = {};
		steps.forEach(function (k) {
			var a = abilities.filter(function (x) { return x.ability === k; })[0];
			if (!a || a.hotbar < 1 || a.hotbar > 3) return;
			var list = bySlot[a.hotbar] = bySlot[a.hotbar] || [];
			if (list.indexOf(a.name) < 0) list.push(a.name);
		});
		return Object.keys(bySlot).filter(function (s) { return bySlot[s].length > 1; }).map(function (s) {
			return "Hotbar slot " + s + " holds one skill, so " + bySlot[s].join(" and ") + " can't both be equipped.";
		});
	}

	function skillMeta(a) {
		var parts = [shortSecs(a.castMs)];
		if (a.cooldownMs) parts.push(shortSecs(a.cooldownMs) + " cooldown");
		if (a.mana) parts.push(a.mana + (a.masterMana ? " master mana" : " mana"));
		return parts.join(", ");
	}

	var dragFrom = -1;

	/*
	 * Builds a combo for one character: click skills to add them, drag (or use the arrows) to
	 * reorder, × to remove. `ch` is the character, `r` its result, `save(steps)` stores a change.
	 */
	function renderComboBuilder(box, ch, r, save, opts) {
		opts = opts || {};
		var byKey = {};
		r.abilities.forEach(function (a) { byKey[a.ability] = a; });
		var steps = (ch.customCombo || []).filter(function (k) { return k === "basic" || byKey[k]; });
		var basicMs = 500;

		if (opts.discipline) {
			box.appendChild(el("div", { class: "builder-row" }, [
				el("label", { class: "field field-inline" }, [el("span", { class: "field-label", text: "Discipline" }),
					disciplineSelect(r.build.discipline, function (id) { setDiscipline(ch, id); }, "Discipline for this combo")]),
				el("span", { class: "panel-note", text: r.cls + " skills at rank " + r.rank + "." })
			]));
		}

		// The sequence.
		var seq = el("ol", { class: "seq", "aria-label": "Combo steps" });
		if (!steps.length) seq.appendChild(el("li", { class: "seq-empty", text: "Empty. Click skills below to add them in the order you cast them." }));
		steps.forEach(function (k, i) {
			var a = byKey[k];
			var slot = k === "basic" ? "B" : (a.hotbar >= 4 ? "M" : String(a.hotbar));
			function move(dir) {
				var j = i + dir;
				if (j < 0 || j >= steps.length) return;
				var s = steps.slice();
				var tmp = s[i]; s[i] = s[j]; s[j] = tmp;
				save(s);
			}
			var chip = el("li", { class: "seq-chip" + (slot === "M" ? " master" : "") + (k === "basic" ? " basic" : ""), draggable: "true", title: k === "basic" ? "Basic attack" : a.name + ": " + skillMeta(a) }, [
				el("span", { class: "seq-slot", text: slot }),
				el("span", { class: "seq-name", text: k === "basic" ? r.basicAttack.name : a.name }),
				el("span", { class: "seq-tools" }, [
					el("button", { type: "button", class: "icon-btn", "aria-label": "Move earlier", text: "‹", disabled: i === 0 ? true : null, onclick: function () { move(-1); } }),
					el("button", { type: "button", class: "icon-btn", "aria-label": "Move later", text: "›", disabled: i === steps.length - 1 ? true : null, onclick: function () { move(1); } }),
					el("button", { type: "button", class: "icon-btn", "aria-label": "Remove", text: "×", onclick: function () { var s = steps.slice(); s.splice(i, 1); save(s); } })
				])
			]);
			chip.addEventListener("dragstart", function (e) { dragFrom = i; chip.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* old browsers */ } });
			chip.addEventListener("dragend", function () { chip.classList.remove("dragging"); });
			chip.addEventListener("dragover", function (e) { e.preventDefault(); chip.classList.add("drop"); });
			chip.addEventListener("dragleave", function () { chip.classList.remove("drop"); });
			chip.addEventListener("drop", function (e) {
				e.preventDefault();
				chip.classList.remove("drop");
				if (dragFrom < 0 || dragFrom === i) return;
				var s = steps.slice();
				var moved = s.splice(dragFrom, 1)[0];
				s.splice(i, 0, moved);
				dragFrom = -1;
				save(s);
			});
			seq.appendChild(chip);
		});
		box.appendChild(seq);

		// What one pass costs.
		if (steps.length) {
			var castMs = 0, mana = 0, master = 0;
			steps.forEach(function (k) {
				if (k === "basic") { castMs += basicMs; return; }
				var a = byKey[k];
				castMs += a.castMs;
				if (a.masterMana) master += a.mana; else mana += a.mana;
			});
			box.appendChild(el("p", { class: "panel-note seq-sum", text: steps.length + " step" + (steps.length > 1 ? "s" : "") + ", " + shortSecs(castMs) + " of casting per pass" +
				(mana ? ", " + mana + " mana" : "") + (master ? ", " + master + " master mana" : "") + ". Skills on cooldown are skipped until they're ready." }));
		}

		// The palette.
		var pal = el("div", { class: "palette" });
		var used = {};
		steps.forEach(function (k) { used[k] = true; });
		function add(k) {
			if (steps.length >= MAX_STEPS) { toast(MAX_STEPS + " steps at most"); return; }
			save(steps.concat([k]));
		}
		var groups = [["Basic", [{ ability: "basic", name: r.basicAttack.name, castMs: basicMs, cooldownMs: 0, mana: 0, hotbar: 0 }]]];
		[1, 2, 3].forEach(function (slot) {
			groups.push(["Hotbar " + slot, r.abilities.filter(function (a) { return a.hotbar === slot; })]);
		});
		groups.push(["Master", r.abilities.filter(function (a) { return a.hotbar >= 4; })]);
		groups.forEach(function (g) {
			if (!g[1].length) return;
			var row = el("div", { class: "pal-row" }, [el("span", { class: "pal-label", text: g[0] })]);
			var chips = el("div", { class: "pal-chips" });
			g[1].forEach(function (a) {
				chips.appendChild(el("button", { type: "button", class: "skill-chip" + (a.hotbar >= 4 ? " master" : "") + (used[a.ability] ? " used" : ""), title: a.desc || "", onclick: function () { add(a.ability); } }, [
					el("span", { class: "chip-name", text: a.name + (a.party ? " (party)" : "") }),
					el("span", { class: "chip-meta", text: a.ability === "basic" ? "one swing or shot, " + shortSecs(basicMs) : (a.from ? a.from + ", " : "") + skillMeta(a) })
				]));
			});
			row.appendChild(chips);
			pal.appendChild(row);
		});
		box.appendChild(pal);

		var presetSel = el("select", { "aria-label": "Start from a preset or a saved combo" });
		presetSel.appendChild(option("", "Start from a combo…"));
		[["Presets", r.combos.filter(function (c) { return c.preset; })], ["Saved", r.combos.filter(function (c) { return c.saved; })]].forEach(function (g) {
			if (!g[1].length) return;
			var group = el("optgroup", { label: g[0] });
			g[1].forEach(function (c) { group.appendChild(option(c.id, c.name)); });
			presetSel.appendChild(group);
		});
		presetSel.addEventListener("change", function () {
			var p = r.combos.filter(function (c) { return c.id === presetSel.value; })[0];
			if (p) save(p.steps.slice());
		});
		box.appendChild(el("div", { class: "builder-tools" }, [
			presetSel,
			steps.length ? el("button", { type: "button", class: "btn btn-small", text: "Clear", onclick: function () { save([]); } }) : null
		]));
		var warn = slotConflicts(r.abilities, steps);
		if (warn.length) box.appendChild(el("ul", { class: "note-list warn" }, warn.map(function (w) { return el("li", { text: w }); })));
	}

	function renderCombosCharacter(r, cmp) {
		var intro = $("combo-intro");
		if (intro) intro.textContent = r.discipline.name + " combos at skill rank " + r.rank + " against one target, " + state.comboWindow + " seconds. Each combo opens with its debuffs and buffs, then spends its damage skills while they are up. Pick one to see where its damage comes from.";
		renderComboList(r, cmp);
		renderComboDetail(r, cmp);
		var box = $("combo-builder");
		if (box) {
			clear(box);
			renderComboBuilder(box, state, r, function (steps) {
				state.customCombo = steps;
				state.selectedCombo = steps.length ? "custom" : (state.selectedCombo === "custom" ? "" : state.selectedCombo);
				onChange();
			}, { discipline: true });
		}
	}

	/* ---------- Combos: runs from the DPS meter ---------- */

	function runName(run) {
		var base = String(run.file || "").replace(/\.json$/i, "").replace(/^[0-9a-f]{8}-/, "").trim();
		return base || run.character.name + (run.place ? ", " + run.place : "");
	}

	function runTitle(run) { return run.character.name + "'s run" + (run.place ? " in " + run.place : ""); }

	// Newest fight first.
	function sortedRuns() {
		return LIB.runs().sort(function (a, b) { return String(b.startedAt || b.exportedAt).localeCompare(String(a.startedAt || a.exportedAt)); });
	}

	function pickedRun() {
		var all = sortedRuns();
		var run = all.filter(function (x) { return x.id === meterPick.run; })[0] || all[0] || null;
		if (run) meterPick.run = run.id;
		return run;
	}

	function pickedWindow(run) {
		if (!run) return null;
		return run.windows.filter(function (w) { return w.seconds === meterPick.seconds; })[0] || run.windows[0] || null;
	}

	function importMeterFiles(files) {
		var list = [].slice.call(files || []);
		if (!list.length) return;
		var left = list.length, added = [], errors = [];
		var had = {};
		LIB.runs().forEach(function (x) { had[x.id] = true; });
		list.forEach(function (f) {
			readFile(f, function (text) {
				var res = METER.parse(text, f.name);
				if (res.error) errors.push(f.name + ": " + res.error);
				else added.push(LIB.putRun(res.run));
				if (--left) return;
				if (added.length) {
					var newest = added.map(function (a) { return a.run; }).sort(function (a, b) { return String(b.startedAt).localeCompare(String(a.startedAt)); })[0];
					meterPick = { run: newest.id, seconds: meterPick.seconds || 5 };
				}
				var ids = {};
				added.forEach(function (a) { ids[a.run.id] = a.run; });
				var fresh = Object.keys(ids).filter(function (id) { return !had[id]; }).length;
				var again = Object.keys(ids).length - fresh;
				var msg = Object.keys(ids).length === 1 ? (again ? "Updated " : "Imported ") + runName(added[added.length - 1].run)
					: (fresh ? "Imported " + fresh + (fresh === 1 ? " run" : " runs") : "") + (again ? (fresh ? ", updated " : "Updated ") + again + (again === 1 ? " that was already here" : " that were already here") : "");
				if (errors.length) msg = (msg ? msg + ". " : "") + errors[0] + (errors.length > 1 ? " " + (errors.length - 1) + " more files couldn't be read." : "");
				toast(msg);
				if (!POPOUT && tab !== "combos") setTab("combos");
				setScope("meter");
			});
		});
	}

	function setupMeter() {
		var input = $("meter-file");
		if (!input) return;
		input.addEventListener("change", function () {
			importMeterFiles(input.files);
			input.value = "";
		});
		var panel = $("meter-panel");
		if (!panel) return;
		panel.addEventListener("dragover", function (e) { e.preventDefault(); panel.classList.add("drop"); });
		panel.addEventListener("dragleave", function (e) { if (!panel.contains(e.relatedTarget)) panel.classList.remove("drop"); });
		panel.addEventListener("drop", function (e) {
			e.preventDefault();
			panel.classList.remove("drop");
			var files = e.dataTransfer && e.dataTransfer.files;
			if (files && files.length) importMeterFiles(files);
		});
	}

	function renderMeter(r) {
		renderMeterRuns();
		renderMeterWindow(r);
	}

	function renderMeterRuns() {
		var body = $("runs-body");
		var tools = $("runs-tools");
		if (!body) return;
		clear(body);
		clear(tools);
		var all = sortedRuns();
		if (!all.length) {
			body.appendChild(el("div", { class: "runs-empty" }, [
				el("p", {}, ["No runs yet. Fight with ", el("a", { href: LAUNCHER_URL, target: "_blank", rel: "noopener", text: "DB DPS Launcher" }),
					", press Export in its Damage Meter, then bring the file in with Import meter files or drop it on this panel. Several files at once work too."])
			]));
			return;
		}
		tools.appendChild(el("button", { type: "button", class: "btn btn-small", text: "Remove all", onclick: function () {
			if (!window.confirm("Remove all " + all.length + " meter runs" + (DRIVE && DRIVE.status().state === "synced" ? " here and in Google Drive" : "") + "? Combos you saved from them stay.")) return;
			LIB.clearRuns();
			toast("All meter runs removed");
		} }));

		// The best of each length across the runs.
		var best = {};
		all.forEach(function (run) {
			run.windows.forEach(function (w) { if (!best[w.seconds] || w.dps > best[w.seconds]) best[w.seconds] = w.dps; });
		});
		var picked = pickedRun();
		body.appendChild(el("div", { class: "run-row run-head", "aria-hidden": "true" }, [
			el("span", { class: "run-info", text: "Run" }),
			METER.WINDOWS.map(function (sec) { return el("span", { class: "run-win-h", text: "Best " + sec + " s" }); }),
			el("span")
		]));
		var ul = el("ul", { class: "run-list", "aria-label": "Meter runs" });
		all.forEach(function (run) {
			var on = picked && run.id === picked.id;
			var cells = METER.WINDOWS.map(function (sec) {
				var w = run.windows.filter(function (x) { return x.seconds === sec; })[0];
				if (!w) return el("span", { class: "win-btn none" }, [el("span", { class: "win-len", text: sec + " s" }), "too short"]);
				var pressed = on && meterPick.seconds === sec;
				var top = all.length > 1 && w.dps === best[sec];
				return el("button", {
					type: "button", class: "win-btn" + (top ? " best" : ""), "aria-pressed": pressed ? "true" : "false",
					"aria-label": "Best " + sec + " s of " + runName(run) + ": " + fmt(w.dps) + " DPS" + (top ? ", the best of all runs" : ""),
					onclick: function () { meterPick = { run: run.id, seconds: sec }; meterSaved = null; renderMeter(lastResult); }
				}, [
					el("span", { class: "win-len", text: sec + " s" }),
					el("span", { class: "win-dps", text: fmt(w.dps) }),
					el("span", { class: "win-at" }, [top ? el("span", { class: "win-best", text: "best" }) : null, (top ? ", at " : "at ") + METER.clockText(w.startMs)])
				]);
			});
			ul.appendChild(el("li", { class: "run-row" + (on ? " on" : "") }, [
				el("div", { class: "run-info" }, [
					el("b", { class: "run-name", text: runName(run) }),
					el("small", { text: run.character.name + (run.place ? ", " + run.place : "") + ". " + when(run.startedAt || run.exportedAt) + ", " +
						METER.clockText(run.fight.durationMs) + " of fighting, " + fmt(run.fight.dps) + " DPS overall." })
				]),
				cells,
				el("button", { type: "button", class: "icon-btn run-remove", text: "×", title: "Remove this run", "aria-label": "Remove " + runName(run), onclick: function () {
					LIB.deleteRun(run.id);
					toast("Removed " + runName(run));
				} })
			]));
		});
		body.appendChild(ul);
	}

	// "+1.2 s": when a cast came in its window.
	function plusSecs(ms) { return "+" + (Math.round(ms / 100) / 10).toFixed(1) + " s"; }

	function renderMeterWindow(r) {
		var panel = $("window-panel");
		var body = $("window-body");
		if (!panel || !body) return;
		clear(body);
		var tools = $("window-tools");
		clear(tools);
		var run = pickedRun();
		var w = pickedWindow(run);
		panel.hidden = !w;
		if (!w) return;
		meterPick.seconds = w.seconds;
		var info = {};
		run.spells.forEach(function (s) { info[s.key] = s; });
		var disc = run.discipline >= 0 ? D.disciplines[run.discipline] : null;

		$("window-title").textContent = "Best " + w.seconds + " s of " + runName(run);
		$("window-sub").textContent = runTitle(run) + (disc ? ", " + disc.name : "") + ". " + METER.clockText(w.startMs) + " to " + METER.clockText(w.endMs) + " on the meter's clock.";
		tools.appendChild(segmented("Window length", run.windows.map(function (x) { return [String(x.seconds), x.seconds + " s"]; }), String(w.seconds), function (v) {
			meterPick.seconds = +v;
			meterSaved = null;
			renderMeter(lastResult);
		}));

		// The headline: what the casts in these seconds caused.
		body.appendChild(el("div", { class: "combo-head" }, [el("div", { class: "combo-big" }, [
			el("span", { class: "big-num", text: fmt(w.dps) }),
			el("span", { class: "big-unit", text: " DPS" }),
			el("span", { class: "big-sub", text: fmt(w.damage) + " damage from the casts in these " + w.seconds + " s, their DoT ticks after it included. " +
				fmt(w.landedDps) + " DPS landed inside the " + w.seconds + " s." })
		])]));

		var spellsUsed = w.casts.filter(function (c) { return c.kind !== "melee" && c.kind !== "ranged"; }).length;
		var basics = w.casts.length - spellsUsed;
		body.appendChild(el("dl", { class: "stat-pills window-pills" }, [
			el("div", {}, [el("dt", { text: "Skills cast" }), el("dd", { text: String(spellsUsed) })]),
			el("div", {}, [el("dt", { text: "Basic attacks" }), el("dd", { text: String(basics) })]),
			el("div", {}, [el("dt", { text: "Hits" }), el("dd", { text: fmt(w.hits) + (w.crits ? ", " + w.crits + " crit" + (w.crits > 1 ? "s" : "") : "") })]),
			el("div", {}, [el("dt", { text: "Targets" }), el("dd", { text: w.targets + (w.targets > 1 ? ", " + pct(w.topTargetShare, 0) + " on one" : "") })]),
			el("div", {}, [el("dt", { text: "Over time" }), el("dd", { text: pct(w.dotShare, 0) })])
		]));

		// The casts on a strip as long as the window, then in order.
		var ms = w.seconds * 1000;
		var track = el("div", { class: "rot-track", role: "img", "aria-label": w.casts.length + " casts in " + w.seconds + " seconds" });
		w.casts.forEach(function (c) {
			var s = info[c.key] || { name: c.key, slotKey: "" };
			var basic = c.kind === "melee" || c.kind === "ranged";
			var master = /^(4|E|Q)$/.test(c.slotKey || s.slotKey || "");
			track.appendChild(el("span", { class: "rot-mark" + (basic ? " basic" : master ? " master" : " spell"), style: "left:" + Math.min(99.6, c.t / ms * 100).toFixed(2) + "%",
				title: s.name + ", " + plusSecs(c.t) + (c.damage ? ", " + fmt(c.damage) + " damage" : "") }));
		});
		var axis = el("div", { class: "rot-axis", "aria-hidden": "true" });
		for (var t = 0; t <= w.seconds; t += w.seconds > 10 ? 5 : w.seconds > 5 ? 2 : 1) {
			axis.appendChild(el("span", { style: "left:" + (t / w.seconds * 100).toFixed(2) + "%", text: t + " s" }));
		}
		body.appendChild(el("div", { class: "rot-strip" }, [track, axis]));

		var items = [];
		w.casts.forEach(function (c) {
			var s = info[c.key] || { name: c.key, slotKey: "" };
			var basic = c.kind === "melee" || c.kind === "ranged";
			var last = items[items.length - 1];
			if (basic && last && last.basic && last.key === c.key) { last.n++; last.damage += c.damage; return; }
			items.push({ t: c.t, key: c.key, name: s.name, slot: basic ? "B" : (c.slotKey || s.slotKey || "?"), basic: basic, n: 1, damage: c.damage });
		});
		body.appendChild(el("ol", { class: "rot-list", "aria-label": "Rotation" }, items.map(function (it) {
			return el("li", { class: "rot-item" + (it.basic ? " basic" : /^(4|E|Q)$/.test(it.slot) ? " master" : "") }, [
				el("span", { class: "rot-t", text: plusSecs(it.t) }),
				el("span", { class: "seq-slot", text: it.slot }),
				el("span", { class: "rot-name", text: it.name + (it.n > 1 ? " ×" + it.n : "") }),
				el("span", { class: "rot-dmg", text: fmt(it.damage) })
			]);
		})));

		var cols = el("div", { class: "combo-cols" });
		body.appendChild(cols);
		var dist = el("div", { class: "combo-block" }, [el("h3", { text: "Damage by skill" })]);
		var maxS = Math.max.apply(null, w.bySpell.map(function (x) { return x.damage; }).concat([1]));
		dist.appendChild(el("ul", { class: "dist-list" }, w.bySpell.map(function (x) {
			return el("li", {}, [
				el("span", { class: "dist-name", text: x.name }),
				el("span", { class: "dist-val" }, [el("span", { class: "value", text: fmt(x.damage / w.seconds) }), " DPS, " + pct(x.share, 1)]),
				segBar([["seg-direct", x.damage - x.dot], ["seg-dot", x.dot]], maxS)
			]);
		})));
		dist.appendChild(el("div", { class: "legend" }, [
			el("span", {}, [el("i", { class: "swatch swatch-direct" }), "Hits"]),
			el("span", {}, [el("i", { class: "swatch swatch-dot" }), "Damage over time"])
		]));
		cols.appendChild(dist);

		// As a combo: the steps, how it simulates here, and saving it.
		var st = METER.stepsFor(run, w);
		var discId = disc ? disc.id : discOf(state).id;
		var here = r && r.discipline.id === discId ? r : { abilities: run.spells.filter(function (x) { return x.calc && x.calc !== "basic"; }).map(function (x) { return { ability: x.calc, name: x.name }; }) };
		var block = el("div", { class: "combo-block save-block" }, [el("h3", { text: "Save as a combo" })]);
		block.appendChild(el("p", { class: "panel-note", text: st.steps.length + " steps for " + D.disciplines[discId].name + ": " + stepsText(here, st.steps).replace(/Basic attack/g, "basic attack") + "." }));
		run.spells.forEach(function (x) {
			if (!x.calc || x.calc === "basic" || x.calc === x.key || st.steps.indexOf(x.calc) < 0) return;
			var calcName = stepName(here, x.calc);
			if (calcName !== x.name) block.appendChild(el("p", { class: "panel-note", text: x.name + " plays as " + calcName + ", which fires the same powers in the game's data." }));
		});
		if (st.missing.length) block.appendChild(el("p", { class: "panel-note warn", text: "Not in the calculator's data, so left out: " + st.missing.join(", ") + "." }));
		if (w.casts.some(function (c) { return c.kind === "ranged"; })) {
			block.appendChild(el("p", { class: "panel-note", text: "Ranged basic attacks play as the melee chain in the simulation." }));
		}
		if (r && r.discipline.id === discId && st.steps.length) {
			var sim = E.simulateParty([{ steps: st.steps, env: r.env }], state.comboWindow, state.comboMode !== "burst");
			var simDps = sim && sim.members[0] ? sim.members[0].dps : 0;
			block.appendChild(el("p", {}, ["With " + whose(app.active) + " gear and talents, looped on one target for " + state.comboWindow + " s: ",
				el("b", { text: fmt(simDps) + " DPS" }), state.comboMode === "burst" ? " (burst)." : " (with mana)."]));
		} else if (disc) {
			block.appendChild(el("p", { class: "panel-note", text: "Open a " + disc.name + " in the party bar to see how it simulates with their gear and talents." }));
		}
		var defaultName = (runName(run) + " " + w.seconds + " s").slice(0, 60);
		var nameInput = el("input", { type: "text", maxlength: "60", autocomplete: "off", value: defaultName });
		var form = el("form", { class: "save-form" }, [
			el("label", { class: "field" }, [el("span", { class: "field-label", text: "Combo name" }), nameInput]),
			el("button", { type: "submit", class: "btn btn-primary", text: "Save as combo", disabled: st.steps.length ? null : true })
		]);
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var entry = LIB.saveCombo({
				name: nameInput.value.trim() || defaultName,
				discipline: discId,
				steps: st.steps,
				why: "The best " + w.seconds + " s of " + runTitle(run) + ", " + METER.clockText(w.startMs) + " to " + METER.clockText(w.endMs) + ", as cast in game.",
				source: {
					type: "meter", runId: run.id, file: run.file, character: run.character.name, place: run.place, date: run.startedAt,
					seconds: w.seconds, startMs: w.startMs, endMs: w.endMs, dps: w.dps, landedDps: w.landedDps, damage: w.damage,
					hits: w.hits, crits: w.crits, targets: w.targets, topTargetShare: w.topTargetShare, dotShare: w.dotShare,
					rotation: METER.rotationText(run, w), bySpell: w.bySpell.slice(0, 8)
				}
			});
			if (!entry) { toast("Nothing to save: none of these casts are in the calculator's data."); return; }
			meterSaved = { id: entry.id, discipline: discId, name: entry.name };
			if (discOf(state).id === discId) state.selectedCombo = entry.id;
			onChange();
			toast("Saved " + entry.name);
		});
		block.appendChild(form);
		if (meterSaved && meterSaved.discipline === discId) {
			var sameDisc = discOf(state).id === discId;
			block.appendChild(el("p", { class: "saved-note", role: "status" }, ["Saved as ", el("b", { text: meterSaved.name }), ". It's in " + D.disciplines[discId].name + "'s combo list" + (sameDisc ? "" : ", and in the party lanes of every " + D.disciplines[discId].name) + ". ",
				sameDisc ? el("button", { type: "button", class: "link-btn", text: "Show it", onclick: function () { state.selectedCombo = meterSaved.id; meterSaved = null; setScope("character"); } }) : null]));
		}
		cols.appendChild(block);
	}

	/* ---------- party fights ---------- */

	// A member as they fight with the party: the party's target and fight length.
	function partyMemberState(ch) {
		var s = JSON.parse(JSON.stringify(ch));
		s.target = { element: app.party.element, reduction: app.party.reduction, armorBane: 0, armorBreak: "", scorch: 0, states: (ch.target && ch.target.states) || {} };
		s.comboWindow = app.party.window;
		return s;
	}

	function memberResult(i) {
		var s = partyMemberState(app.chars[i]);
		var key = JSON.stringify(s) + "|" + combosStamp();
		var c = partyCache[i];
		if (c && c.key === key) return c.result;
		var r = computeFor(s);
		partyCache[i] = { key: key, result: r };
		return r;
	}

	function partyDps(c) { return app.party.mode === "burst" ? c.burst.dps : c.result.dps; }

	// The combo a member plays in the party: the one picked, else their best on their own.
	function partyComboFor(r, ch) {
		var pick = r.combos.filter(function (c) { return c.id === ch.partyCombo; })[0];
		if (pick) return pick;
		return r.combos.slice().sort(function (a, b) { return partyDps(b) - partyDps(a); })[0] || null;
	}

	var fightCache = null;
	function partyFight() {
		var key = JSON.stringify({ chars: app.chars, party: app.party }) + "|" + combosStamp();
		if (fightCache && fightCache.key === key) return fightCache.value;
		var rs = app.chars.map(function (ch, i) { return memberResult(i); });
		var picks = rs.map(function (r, i) { return partyComboFor(r, app.chars[i]); });
		var sim = E.simulateParty(picks.map(function (c, i) { return { steps: c ? c.steps : [], env: rs[i].env }; }), app.party.window, app.party.mode !== "burst");
		var value = { results: rs, picks: picks, sim: sim };
		fightCache = { key: key, value: value };
		return value;
	}

	function runOptimizer() {
		if (optimizing) return;
		optimizing = true;
		optimizeResult = null;
		renderCombosTools();
		setTimeout(function () {
			var fight = partyFight();
			var options = fight.results.map(function (r) {
				return { env: r.env, choices: r.combos.map(function (c) { return { id: c.id, steps: c.steps, name: c.name }; }) };
			});
			var res = E.optimizeParty(options, app.party.window, app.party.mode !== "burst", 400);
			optimizing = false;
			optimizeResult = {
				before: fight.sim ? fight.sim.total : 0,
				total: res.total,
				evaluated: res.evaluated,
				picks: res.pick.map(function (ix, i) { return options[i].choices[ix]; })
			};
			renderResults();
		}, 30);
	}


	function memberSwatch(i) {
		return el("span", { class: "member-swatch m" + i, "aria-hidden": "true" });
	}

	function renderPartyCombos() {
		var sumBox = $("party-summary");
		var lanes = $("party-lanes");
		if (!sumBox || !lanes) return;
		clear(sumBox);
		clear(lanes);
		var fight = partyFight();
		var sim = fight.sim;
		var mana = app.party.mode !== "burst";
		$("party-dps-sub").textContent = app.chars.length + (app.chars.length === 1 ? " member" : " members") + " against " + (app.party.element ? "a " + ELEMENT_LABEL[app.party.element].toLowerCase() : "one target") +
			(app.party.reduction ? " with " + app.party.reduction + "% damage reduction" : "") + ", " + app.party.window + " seconds, " + (mana ? "sustained with mana." : "burst with mana ignored.");
		if (!sim) {
			sumBox.appendChild(el("p", { class: "panel-note", text: "Nobody has a combo yet. Pick or build one for each member below." }));
		} else {
			sumBox.appendChild(el("div", { class: "combo-head" }, [el("div", { class: "combo-big" }, [
				el("span", { class: "big-num", text: fmt(sim.dps) }),
				el("span", { class: "big-unit", text: " party DPS" }),
				el("span", { class: "big-sub", text: fmt(sim.total) + " damage in " + sim.windowS + " s" })
			])]));
		}

		if (optimizeResult) {
			var gain = optimizeResult.total - optimizeResult.before;
			var o = el("div", { class: "opt-result" });
			if (gain > 0.5) {
				o.appendChild(el("p", {}, [el("b", { text: "Best found: " + fmt(optimizeResult.total / app.party.window) + " party DPS" }), ", " + fmt(gain / app.party.window) + " more than now, after trying " + optimizeResult.evaluated + " sets of combos."]));
				o.appendChild(el("ul", { class: "note-list" }, optimizeResult.picks.map(function (p, i) { return el("li", {}, [memberSwatch(i), " " + cap(says(i, "plays", "play")) + " " + p.name]); })));
				o.appendChild(el("button", { type: "button", class: "btn btn-primary", text: "Use these combos", onclick: function () {
					optimizeResult.picks.forEach(function (p, i) { if (app.chars[i]) app.chars[i].partyCombo = p.id; });
					optimizeResult = null;
					onChange();
					toast("Party combos updated");
				} }));
			} else {
				o.appendChild(el("p", { text: "These combos are already the best of " + optimizeResult.evaluated + " sets tried." }));
			}
			sumBox.appendChild(o);
		}

		if (sim) {
			var cols = el("div", { class: "combo-cols" });
			var who = el("div", { class: "combo-block" }, [el("h3", { text: "Damage by member" })]);
			var ul = el("ul", { class: "dist-list" });
			var max = Math.max.apply(null, sim.members.map(function (m) { return m ? m.total : 0; }).concat([1]));
			sim.members.forEach(function (m, i) {
				var solo = fight.picks[i] ? partyDps(fight.picks[i]) : 0;
				var dps = m ? m.dps : 0;
				ul.appendChild(el("li", {}, [
					el("span", { class: "dist-name" }, [memberSwatch(i), " " + charName(i), el("small", { text: " " + (fight.picks[i] ? fight.picks[i].name : "no combo") })]),
					el("span", { class: "dist-val" }, [el("span", { class: "value", text: fmt(dps) }), " DPS, " + pct(sim.total ? (m ? m.total : 0) / sim.total : 0, 0),
						solo && dps - solo > 0.5 ? el("span", { class: "delta up", text: "+" + fmt(dps - solo) + " from the party" }) : null]),
					segBar([["seg-m" + i, m ? m.total : 0]], max)
				]));
			});
			who.appendChild(ul);
			cols.appendChild(who);
			var deb = el("div", { class: "combo-block" }, [el("h3", { text: "On the target" })]);
			if (sim.uptime.length) {
				deb.appendChild(el("p", { class: "panel-note block-note", text: "Share of the fight each debuff is up, from anyone, and its average stacks." }));
				var ul2 = el("ul", { class: "uptime-list" });
				sim.uptime.forEach(function (u) {
					ul2.appendChild(el("li", {}, [
						el("span", { class: "dist-name", text: u.label }),
						el("span", { class: "dist-val", text: pct(u.pct, 0) + (u.avgStacks ? ", " + u.avgStacks.toFixed(1) + " stacks" : "") }),
						el("span", { class: "up-bar", "aria-hidden": "true" }, el("i", { class: u.dot ? "seg-dot" : "seg-debuff", style: "width:" + (u.pct * 100).toFixed(1) + "%" }))
					]));
				});
				deb.appendChild(ul2);
			} else {
				deb.appendChild(el("p", { class: "panel-note", text: "Nobody puts debuffs on the target." }));
			}
			cols.appendChild(deb);
			sumBox.appendChild(cols);
		}

		// One lane per member: who, which combo, and when they cast.
		var W = app.party.window * 1000;
		var axis = el("div", { class: "lane-axis", "aria-hidden": "true" });
		for (var s = 0; s <= app.party.window; s += app.party.window > 30 ? 10 : 5) {
			axis.appendChild(el("span", { style: "left:" + (s * 1000 / W * 100).toFixed(2) + "%", text: s + " s" }));
		}
		app.chars.forEach(function (ch, i) {
			var r = fight.results[i];
			var m = sim ? sim.members[i] : null;
			var pick = fight.picks[i];
			var lane = el("div", { class: "lane" });
			var comboSel = el("select", { "aria-label": cap(whose(i)) + " combo" });
			comboSel.appendChild(option("", "Best on their own" + (pick && !ch.partyCombo ? " (" + pick.name + ")" : ""), !ch.partyCombo));
			r.combos.forEach(function (c) { comboSel.appendChild(option(c.id, c.name + ", " + fmt(partyDps(c)) + " DPS alone", c.id === ch.partyCombo)); });
			comboSel.addEventListener("change", function () { ch.partyCombo = comboSel.value; optimizeResult = null; onChange(); });
			lane.appendChild(el("div", { class: "lane-head" }, [
				el("button", { type: "button", class: "lane-who", title: "Open " + target(i), onclick: function () { setActive(i); setTab("character"); } }, [
					memberSwatch(i), el("b", { text: charName(i) }), el("small", { text: r.discipline.name })
				]),
				el("label", { class: "field field-inline" }, [el("span", { class: "field-label", text: "Discipline" }), disciplineSelect(r.build.discipline, function (id) { setDiscipline(ch, id); optimizeResult = null; }, cap(whose(i)) + " discipline")]),
				el("label", { class: "field field-inline" }, [el("span", { class: "field-label", text: "Combo" }), comboSel]),
				el("button", { type: "button", class: "btn btn-small", "aria-expanded": editLane === i ? "true" : "false", text: editLane === i ? "Done" : "Edit combo", onclick: function () { editLane = editLane === i ? -1 : i; renderPartyCombos(); } }),
				el("span", { class: "lane-dps" }, [el("span", { class: "value", text: m ? fmt(m.dps) : "0" }), " DPS"])
			]));
			var track = el("div", { class: "lane-track", role: "img", "aria-label": cap(says(i, "casts", "cast")) + " " + (m ? m.castLog.length : 0) + " skills in " + app.party.window + " seconds" });
			(m ? m.castLog : []).forEach(function (c) {
				track.appendChild(el("span", { class: "cast" + (c.master ? " master" : "") + " m" + i, style: "left:" + (c.start / W * 100).toFixed(2) + "%;width:" + Math.max(0.4, c.ms / W * 100).toFixed(2) + "%", title: c.name + " at " + shortSecs(c.start) }));
			});
			lane.appendChild(track);
			if (m && m.partyBuffs.length) lane.appendChild(el("p", { class: "panel-note", text: "Buffs the whole party with " + m.partyBuffs.join(", ") + "." }));
			if (editLane === i) {
				var b = el("div", { class: "lane-builder" });
				renderComboBuilder(b, ch, r, function (steps) {
					ch.customCombo = steps;
					ch.partyCombo = steps.length ? "custom" : "";
					optimizeResult = null;
					onChange();
				});
				lane.appendChild(b);
			}
			lanes.appendChild(lane);
		});
		lanes.appendChild(axis);
		if (app.chars.length < MAX_PARTY) {
			lanes.appendChild(el("p", { class: "panel-note" }, ["Add party members in the ", el("button", { type: "button", class: "link-btn", text: "Party tab", onclick: function () { setTab("party"); } }), "."]));
		}
	}

	/* ---------- Party tab ---------- */

	function statPills(s) {
		return el("dl", { class: "stat-pills" }, [
			el("div", {}, [el("dt", { text: "Attack" }), el("dd", { text: fmt(s.attack) })]),
			el("div", {}, [el("dt", { text: "Expertise" }), el("dd", { text: fmt(s.expertise) })]),
			el("div", {}, [el("dt", { text: "Defense" }), el("dd", { text: fmt(s.defense) })]),
			el("div", {}, [el("dt", { text: "Max HP" }), el("dd", { text: fmt(s.hp) })]),
			el("div", {}, [el("dt", { text: "Crit" }), el("dd", { text: pct(s.critReal, 1) })])
		]);
	}

	function sourceText(ch) {
		var f = ch.from;
		if (!f) return "";
		if (f.type === "load") return "Gear from " + f.label;
		if (f.type === "build") return "From the saved build " + f.label;
		if (f.type === "copy") return "Copied from " + f.label;
		return "";
	}

	function removeMember(i) {
		if (i <= 0 || i >= app.chars.length) return;
		var name = charName(i);
		app.chars.splice(i, 1);
		if (app.active === i) app.active = 0;
		else if (app.active > i) app.active--;
		state = app.chars[app.active];
		partyCache = {};
		optimizeResult = null;
		editLane = -1;
		loadTalentsIntoFrame();
		renderInputs();
		onChange();
		toast(name + " left the party");
	}

	function renderParty() {
		var grid = $("party-members");
		if (!grid) return;
		clear(grid);
		var fight = partyFight();
		var sim = fight.sim;
		app.chars.forEach(function (ch, i) {
			var r = fight.results[i];
			var m = sim ? sim.members[i] : null;
			var share = sim && sim.total && m ? m.total / sim.total : 0;
			var card = el("article", { class: "member-card m" + i + (i === app.active ? " open" : "") }, [
				el("header", { class: "member-head" }, [
					el("div", {}, [el("h3", { text: charName(i) }), el("p", { class: "panel-note", text: r.discipline.name + " " + r.cls + ", " + r.talents.points + " talent points" + (i === 0 ? ". This is you." : ".") })]),
					i === app.active ? el("span", { class: "tag tag-best", text: "open" }) : null
				]),
				statPills(r.stats),
				el("p", { class: "member-combo" }, fight.picks[i]
					? [el("b", { text: fight.picks[i].name }), ": ", el("span", { class: "value", text: m ? fmt(m.dps) : "0" }), " DPS in the party" + (app.chars.length > 1 ? ", " + pct(share, 0) + " of it" : "")]
					: ["No combo for this discipline yet."]),
				sourceText(ch) ? el("p", { class: "panel-note", text: sourceText(ch) + "." }) : null,
				el("div", { class: "member-actions" }, [
					el("button", { type: "button", class: "btn btn-small btn-primary", text: i === app.active ? "Edit" : "Open", onclick: function () { setActive(i); setTab("character"); } }),
					el("button", { type: "button", class: "btn btn-small", text: "Combo", onclick: function () { setScope("party"); setTab("combos"); } }),
					i > 0 ? el("button", { type: "button", class: "btn btn-small", text: "Remove", onclick: function () { removeMember(i); } }) : null
				])
			]);
			grid.appendChild(card);
		});
		for (var k = app.chars.length; k < MAX_PARTY; k++) {
			grid.appendChild(el("div", { class: "member-card member-open" }, [
				el("h3", { text: "Open spot" }),
				el("button", { type: "button", class: "link-btn", text: "Add a member", onclick: function () { var a = $("party-add"); if (a && a.scrollIntoView) a.scrollIntoView({ behavior: "smooth", block: "start" }); } })
			]));
		}
		renderPartyAdd();
		renderPartyEnemy();
		renderSynergy(fight);
	}

	function renderPartyAdd() {
		var box = $("party-add");
		if (!box) return;
		clear(box);
		if (app.chars.length >= MAX_PARTY) {
			box.appendChild(el("p", { class: "panel-note", text: "The party is full: four members. Remove someone to add another." }));
			return;
		}
		// From a load.
		var loads = LIB.inventories().filter(function (x) { return x.slot; });
		var row1 = el("div", { class: "add-row" }, [el("h3", { text: "From a load" })]);
		if (loads.length) {
			var loadSel = el("select", { "aria-label": "Load" });
			loads.forEach(function (x) { loadSel.appendChild(option(String(x.slot), loadLabel(x) + " (" + x.character.class + ")")); });
			var discSel = el("select", { "aria-label": "Discipline" });
			function fillDisc() {
				var inv = LIB.inventoryInSlot(+loadSel.value);
				clear(discSel);
				if (!inv) return;
				disciplinesOf(inv.character.class).forEach(function (d) { discSel.appendChild(option(String(d.id), d.name, d.id === loadDiscipline(inv))); });
			}
			loadSel.addEventListener("change", fillDisc);
			fillDisc();
			row1.appendChild(el("div", { class: "add-fields" }, [loadSel, discSel, el("button", { type: "button", class: "btn btn-small btn-primary", text: "Add", onclick: function () {
				var inv = LIB.inventoryInSlot(+loadSel.value);
				if (inv && addMember(memberFromLoad(inv, +discSel.value))) renderParty();
			} })]));
			row1.appendChild(el("p", { class: "panel-note", text: "Wears the load's equipped gear and charms, with its talents if you pasted them in the Import tab." }));
		} else {
			row1.appendChild(el("p", { class: "panel-note" }, ["No loads yet. ", el("button", { type: "button", class: "link-btn", text: "Import a scan", onclick: function () { setTab("import"); } }), " first."]));
		}
		box.appendChild(row1);

		// From a saved build.
		var builds = savedBuilds();
		var row2 = el("div", { class: "add-row" }, [el("h3", { text: "From a saved build" })]);
		if (builds.length) {
			var buildSel = el("select", { "aria-label": "Saved build" });
			builds.forEach(function (b) { buildSel.appendChild(option(b.id, b.name + " (" + D.disciplines[E.decodeBuild(b.state.talents).discipline].name + ")")); });
			row2.appendChild(el("div", { class: "add-fields" }, [buildSel, el("button", { type: "button", class: "btn btn-small btn-primary", text: "Add", onclick: function () {
				var b = builds.filter(function (x) { return x.id === buildSel.value; })[0];
				if (!b) return;
				var ch = normalize(Object.assign({}, b.state, { name: b.name.slice(0, 24), partyCombo: "", from: { type: "build", id: b.id, label: b.name } }));
				if (addMember(ch)) renderParty();
			} })]));
		} else {
			row2.appendChild(el("p", { class: "panel-note", text: "No saved builds yet. Save one in the Character tab." }));
		}
		box.appendChild(row2);

		// A new character, or a copy of the open one.
		var usedDisc = app.chars.map(function (c) { return E.decodeBuild(c.talents).discipline; });
		var fresh = D.disciplines.filter(function (d) { return usedDisc.indexOf(d.id) < 0; })[0] || D.disciplines[0];
		var newSel = disciplineSelect(fresh.id, function () { /* read on Add */ }, "Discipline of the new member");
		box.appendChild(el("div", { class: "add-row" }, [
			el("h3", { text: "A new character" }),
			el("div", { class: "add-fields" }, [newSel, el("button", { type: "button", class: "btn btn-small btn-primary", text: "Add", onclick: function () {
				var ch = normalize(null);
				ch.talents = String(+newSel.value);
				ch.from = { type: "new", id: "", label: "" };
				if (addMember(ch)) renderParty();
			} })]),
			el("p", { class: "panel-note", text: "Starts with legendary gear and no talents. Open them in the party bar to fill in the rest." })
		]));
		box.appendChild(el("div", { class: "add-row" }, [
			el("h3", { text: "A copy of " + target(app.active) }),
			el("div", { class: "add-fields" }, [el("button", { type: "button", class: "btn btn-small", text: "Add a copy", onclick: function () {
				var ch = normalize(JSON.parse(JSON.stringify(state)));
				ch.name = ((isYou(app.active) ? currentDisc().name : charName(app.active)) + " 2").slice(0, 24);
				ch.from = { type: "copy", id: "", label: who(app.active) };
				if (addMember(ch)) renderParty();
			} })])
		]));
	}

	function renderPartyEnemy() {
		var box = $("party-enemy");
		if (!box) return;
		clear(box);
		var elOpts = [""].concat(D.elements).map(function (e) { return [e, ELEMENT_LABEL[e]]; });
		box.appendChild(selectField("Enemy type", elOpts, app.party.element, function (v) { app.party.element = v; optimizeResult = null; onChange(); }));
		box.appendChild(numberField("Enemy damage reduction (%)", app.party.reduction, function (v) { app.party.reduction = clamp(v, 0, 100); optimizeResult = null; onChange(); }, { min: "0", max: "100" }));
		box.appendChild(el("div", { class: "settings-actions" }, [
			el("button", { type: "button", class: "btn btn-small", text: "Copy party link", onclick: function () { copyText(partyUrl(), "Party link copied"); } })
		]));
	}

	// Who helps whom: each member's debuffs and party buffs, and how much more the others deal
	// with them in the party than without.
	function renderSynergy(fight) {
		var box = $("party-synergy");
		if (!box) return;
		clear(box);
		var sim = fight.sim;
		if (app.chars.length < 2 || !sim) {
			box.appendChild(el("p", { class: "panel-note", text: "Add a member to see how each one raises the others' damage." }));
			return;
		}
		var mana = app.party.mode !== "burst";
		var ul = el("ul", { class: "synergy-list" });
		app.chars.forEach(function (ch, i) {
			var m = sim.members[i];
			var without = E.simulateParty(fight.picks.map(function (c, k) { return { steps: k === i || !c ? [] : c.steps, env: fight.results[k].env }; }), app.party.window, mana);
			var othersWith = sim.total - (m ? m.total : 0);
			var othersWithout = without ? without.total : 0;
			var lift = othersWith - othersWithout;
			var fx = [];
			(m ? m.timeline : []).forEach(function (step) {
				step.effects.forEach(function (e) {
					if (/^\+/.test(e)) return;                     // buffs on themselves
					var name = e.replace(/\s*×\d+$/, "");
					if (fx.indexOf(name) < 0) fx.push(name);
				});
			});
			ul.appendChild(el("li", {}, [
				el("p", {}, [memberSwatch(i), " ", el("b", { text: charName(i) }), lift > 0.5
					? [isYou(i) ? " raise the others' damage by " : " raises the others' damage by ", el("span", { class: "value", text: fmt(lift / sim.windowS) }), " DPS (" + pct(othersWithout ? lift / othersWithout : 0, 1) + ")."]
					: [isYou(i) ? " don't change the others' damage." : " doesn't change the others' damage."]]),
				fx.length ? el("p", { class: "panel-note", text: "On the target: " + fx.join(", ") + "." }) : null,
				m && m.partyBuffs.length ? el("p", { class: "panel-note", text: "Buffs the party with " + m.partyBuffs.join(", ") + "." }) : null
			]));
		});
		box.appendChild(ul);
	}

	/* ---------- the party bar: everyone at a glance ---------- */

	function renderPartyBar(r) {
		var bar = $("partybar");
		if (!bar) return;
		clear(bar);
		var many = app.chars.length > 1;
		var fight = many ? partyFight() : null;
		var frames = el("div", { class: "frames", role: "group", "aria-label": "Party members: pick one to edit" });
		app.chars.forEach(function (ch, i) {
			var mr = i === app.active ? r : (fight ? fight.results[i] : computeFor(ch));
			var dps, share = 1, note;
			if (fight && fight.sim) {
				var m = fight.sim.members[i];
				dps = m ? m.dps : 0;
				share = fight.sim.total ? (m ? m.total : 0) / fight.sim.total : 0;
				note = "in the party";
			} else {
				var best = mr.combos.slice().sort(function (a, b) { return comboResult(b).dps - comboResult(a).dps; })[0];
				dps = best ? comboResult(best).dps : 0;
				note = "best combo";
			}
			frames.appendChild(el("button", { type: "button", class: "frame m" + i + (i === app.active ? " on" : ""), "aria-pressed": i === app.active ? "true" : "false", onclick: function () { setActive(i); } }, [
				el("span", { class: "frame-name", text: charName(i) }),
				el("span", { class: "frame-disc", text: mr.discipline.name }),
				el("span", { class: "frame-bar", "aria-hidden": "true" }, el("i", { style: "width:" + (share * 100).toFixed(1) + "%" })),
				el("span", { class: "frame-dps" }, [el("b", { text: fmt(dps) }), " DPS " + note])
			]));
		});
		if (app.chars.length < MAX_PARTY && !POPOUT) {
			frames.appendChild(el("button", { type: "button", class: "frame frame-add", onclick: function () { setTab("party"); var a = $("party-add"); if (a && a.scrollIntoView) a.scrollIntoView({ behavior: "smooth", block: "start" }); } }, [
				el("span", { class: "frame-name", text: "Add member" }),
				el("span", { class: "frame-disc", text: (MAX_PARTY - app.chars.length) + " more can join" })
			]));
		}
		bar.appendChild(frames);
		var s = r.stats;
		bar.appendChild(el("div", { class: "quick" }, [
			el("span", { class: "quick-who", text: charName(app.active) }),
			statPills(s)
		]));
	}

	/* ---------- tabs, pop-out ---------- */

	function setTab(t) {
		tab = TABS.indexOf(t) >= 0 ? t : "character";
		if (POPOUT) tab = "combos";
		else storeSet(TAB_KEY, tab);
		document.querySelectorAll(".tabbar [role=tab]").forEach(function (b) {
			var on = b.getAttribute("data-tab") === tab;
			b.setAttribute("aria-selected", on ? "true" : "false");
			b.tabIndex = on ? 0 : -1;
		});
		TABS.forEach(function (k) {
			var p = $("panel-" + k);
			if (p) p.hidden = k !== tab;
		});
		if (tab === "talents") loadTalentsIntoFrame();   // the frame reports its height once it can be seen
		if (tab === "party") renderParty();
		if (tab === "import") renderLoads();
	}

	function setupTabs() {
		var tabs = [].slice.call(document.querySelectorAll(".tabbar [role=tab]"));
		tabs.forEach(function (b, i) {
			b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
			b.addEventListener("keydown", function (e) {
				if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
				var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
				setTab(next.getAttribute("data-tab"));
				next.focus();
			});
		});
		document.querySelectorAll("[data-combo-scope]").forEach(function (b) {
			b.addEventListener("click", function () { setScope(b.getAttribute("data-combo-scope")); });
		});
		var saved = storeGet(TAB_KEY, "character");
		setTab(POPOUT ? "combos" : saved);
	}

	// Keep the main page and the pop-out combo window (and other tabs) in step.
	function setupSync() {
		window.addEventListener("storage", function (e) {
			if (e.key !== APP_KEY || !e.newValue) return;
			var next;
			try { next = normalizeApp(JSON.parse(e.newValue)); } catch (err) { return; }
			if (JSON.stringify(next) === JSON.stringify(app)) return;
			var talentsChanged = next.chars[next.active].talents !== state.talents || next.active !== app.active;
			app = next;
			state = app.chars[app.active];
			var hash = "#b=" + toB64(JSON.stringify(state));
			try { history.replaceState(null, "", location.pathname + location.search + hash); } catch (err) { /* ignore */ }
			if (POPOUT) { renderResults(); return; }
			if (talentsChanged) loadTalentsIntoFrame();
			renderInputs();
			renderResults();
		});
	}

	/* ---------- render ---------- */

	function renderResults() {
		var r = computeFor(state);
		lastResult = r;
		var cmp = compareResult();
		renderPartyBar(r);
		renderCombosTools();
		if (comboScope === "party") renderPartyCombos();
		else if (comboScope === "meter") renderMeter(r);
		else renderCombosCharacter(r, cmp);
		renderBestCombo(r);
		renderCompareSelect();
		if (POPOUT) {
			document.title = (comboScope === "party" ? "Party combos" : comboScope === "meter" ? "DPS meter runs" : "Combo DPS · " + charName(app.active) + ", " + r.discipline.name) + " · Dungeon Blitz DPS Calculator";
			return;
		}
		renderCharHead(r);
		renderSheet(r, cmp);
		renderCrit(r, cmp);
		renderSkills(r, cmp);
		renderDots(r, cmp);
		renderSituations(r);
		renderMethod();
		renderTalentInflow(r);
		renderTalentFx(r);
		var charmCount = $("charm-count");
		charmCount.textContent = r.charms.count + " of " + r.charmSlots + " charm sockets used";
		charmCount.className = "panel-note charm-count" + (r.charms.count > r.charmSlots ? " over" : "");
		var note = $("gear-note");
		note.textContent = state.gearMode === "pieces"
			? cap(whose(app.active)) + " gear adds " + fmt(r.gear.attack) + " Attack, " + fmt(r.gear.expertise) + " Expertise and " + fmt(r.gear.defense) + " Defense."
			: "Enter the Attack, Expertise and Defense " + whose(app.active) + " gear adds in total. Runes are still set per piece.";
		if (tab === "party") renderParty();
		renderFileSettings();
		document.title = charName(app.active) + ", " + r.discipline.name + " · Dungeon Blitz DPS Calculator";
	}

	function renderSkillRank() {
		var sel = $("skill-rank");
		clear(sel);
		for (var i = 10; i >= 1; i--) sel.appendChild(option(String(i), String(i), i === state.skillRank));
		sel.onchange = function () { state.skillRank = +sel.value; onChange(); };
	}

	function renderInputs() {
		if (POPOUT) return;
		renderGear();
		renderInventory();
		renderCharms();
		renderExtra();
		renderTarget();
		renderSkillRank();
		renderBuilds();
		renderLoads();
		renderTalentImport();
		renderBrowserSettings();
		renderFileSettings();
	}

	// A scan sent from the DB Inventory Scanner as a link: …/#invz=<raw DEFLATE, base64url>,
	// or …/#inv=<base64 JSON>. True when the address had one (it is imported in the background).
	function readScanHash() {
		var m = /^#(invz?=[A-Za-z0-9_-]+)$/.exec(location.hash);
		if (!m) return false;
		try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
		importScan(m[1]).then(function (ok) {
			persist();
			if (ok) setTab("import");
		});
		return true;
	}

	// What an address brings in: a party link, one character's build, or old talent links.
	function applyHash(h) {
		if (!h) return false;
		if (h.party) { app = h.party; }
		else if (h.char) {
			var cur = app.chars[app.active];
			if (JSON.stringify(h.char) === JSON.stringify(cur)) return false;
			if (!h.char.name) h.char.name = cur.name;
			app.chars[app.active] = h.char;
		} else if (h.talents) {
			if (app.chars[app.active].talents === h.talents) return false;
			app.chars[app.active].talents = h.talents;
		}
		state = app.chars[app.active];
		return true;
	}

	function init() {
		if (!D || !E || !LIB) return;
		LIB.load();
		var stored = storeGet(APP_KEY, null);
		app = stored ? normalizeApp(stored) : normalizeApp({ chars: [storeGet(LAST_KEY, null)] });
		state = app.chars[app.active];
		var scanInHash = /^#invz?=/.test(location.hash);
		if (!scanInHash) applyHash(readHash());
		comboScope = storeGet(SCOPE_KEY, "character");
		if (SCOPES.indexOf(comboScope) < 0) comboScope = "character";
		setupTabs();
		showScope();
		setupSync();
		setupMeter();
		$("copy-link").addEventListener("click", function () {
			if (POPOUT) copyText(shareUrl(), "Link copied");
		});
		if (POPOUT) {
			LIB.onChange(function (lib, why) {
				renderCompareSelect();
				if (why === "combos" || why === "runs" || why === "sync" || why === "storage") renderResults();
			});
			renderResults();
			persist();
			return;
		}
		setupGearMode();
		setupBuilds();
		setupLoads();
		setupFileSettings();
		setupFrame();
		renderInputs();
		if (scanInHash) readScanHash();
		renderResults();
		persist();
		setupCloud();
		LIB.onChange(function (lib, why) {
			if (why === "builds" || why === "sync" || why === "storage") renderBuilds();
			if (why === "inventories" || why === "sync" || why === "storage") { renderLoads(); renderInventory(); renderTalentImport(); }
			if (why === "combos" || why === "runs" || why === "sync" || why === "storage") { renderResults(); return; }
			if (tab === "party") renderParty();
			renderFileSettings();
		});
		window.addEventListener("hashchange", function () {
			if (readScanHash()) return;
			if (!applyHash(readHash())) return;
			partyCache = {};
			loadTalentsIntoFrame();
			renderInputs();
			renderResults();
		});
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
}());
