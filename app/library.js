/*
 * Dungeon Blitz DPS Calculator: your saved builds and scanned inventories.
 *
 * Everything lives in this browser's localStorage. drive.js copies the same library to
 * Google Drive and merges it back, so it has to merge cleanly: every item has an id and a
 * timestamp, the newest copy of an item wins, and deletions are remembered for a while so
 * a delete on one device also removes the item on the others.
 */
(function (root) {
	"use strict";

	var KEY = "dbb-library-v1";
	var OLD_BUILDS_KEY = "dbb-saved-builds-v1";
	var TOMBSTONE_DAYS = 180;
	var MAX_LOADS = 4;   // scans kept at once, one per load slot
	var SCAN_FORMAT = "dbb-inventory";
	var listeners = [];
	var lastWritten = "";

	function D() { return root.DBB_DATA; }
	function E() { return root.DBB_ENGINE; }
	function now() { return Date.now(); }

	function readRaw() {
		try {
			var raw = root.localStorage.getItem(KEY);
			return raw ? JSON.parse(raw) : null;
		} catch (e) { return null; }
	}

	function writeRaw(lib) {
		try {
			lastWritten = JSON.stringify(lib);
			root.localStorage.setItem(KEY, lastWritten);
		} catch (e) { /* storage full or blocked: the in-memory copy still works this visit */ }
	}

	function empty() { return { v: 1, builds: [], inventories: [], deleted: {}, updated: 0 }; }

	function validBuild(b) {
		return !!b && typeof b.id === "string" && typeof b.name === "string" && !!b.state && typeof b.state === "object";
	}

	function validInventory(x) {
		return !!x && typeof x.id === "string" && !!x.character && Array.isArray(x.gear) && Array.isArray(x.charms);
	}

	function stamp(x) { return +(x.saved || x.importedAt || 0); }

	// Every scan sits in one of the load slots 1-4. Two scans claiming a slot (a merge from
	// another device) keep the newer one there and move the other to a free slot; scans that
	// don't fit get slot 0 and wait in "other loads" until a slot is free.
	function fixSlots(list) {
		var taken = {};
		var bySlot = list.slice().sort(function (a, b) { return stamp(b) - stamp(a); });
		bySlot.forEach(function (x) {
			var s = Math.floor(+x.slot || 0);
			if (s >= 1 && s <= MAX_LOADS && !taken[s]) { taken[s] = x.id; x.slot = s; }
			else x.slot = 0;
		});
		bySlot.forEach(function (x) {
			if (x.slot) return;
			for (var s = 1; s <= MAX_LOADS; s++) if (!taken[s]) { taken[s] = x.id; x.slot = s; return; }
		});
		return list;
	}

	function clean(lib) {
		lib = lib && typeof lib === "object" ? lib : {};
		var out = empty();
		out.builds = (Array.isArray(lib.builds) ? lib.builds : []).filter(validBuild);
		out.inventories = fixSlots((Array.isArray(lib.inventories) ? lib.inventories : []).filter(validInventory).map(function (x) { return Object.assign({}, x); }));
		var cutoff = now() - TOMBSTONE_DAYS * 864e5;
		Object.keys(lib.deleted || {}).forEach(function (id) {
			var t = +lib.deleted[id];
			if (t > cutoff) out.deleted[id] = t;
		});
		out.updated = +lib.updated || 0;
		return out;
	}

	var lib = null;

	function load() {
		var raw = readRaw();
		if (!raw) {
			raw = empty();
			// Builds saved before the library existed.
			try {
				var old = JSON.parse(root.localStorage.getItem(OLD_BUILDS_KEY) || "[]");
				if (Array.isArray(old)) raw.builds = old.filter(validBuild);
			} catch (e) { /* nothing to bring over */ }
			raw.updated = raw.builds.length ? now() : 0;
			writeRaw(raw);
		}
		lib = clean(raw);
		return lib;
	}

	function current() { return lib || load(); }

	function emit(why) {
		listeners.forEach(function (f) {
			try { f(current(), why); } catch (e) { /* a listener failing must not stop the others */ }
		});
	}

	function commit(why) {
		lib.updated = now();
		writeRaw(lib);
		emit(why);
	}

	// Merge two libraries. The newest copy of each build or inventory wins; a deletion wins
	// over any copy that is not newer than it.
	function merge(a, b) {
		a = clean(a);
		b = clean(b);
		var out = empty();
		Object.keys(a.deleted).concat(Object.keys(b.deleted)).forEach(function (id) {
			out.deleted[id] = Math.max(a.deleted[id] || 0, b.deleted[id] || 0);
		});
		["builds", "inventories"].forEach(function (kind) {
			var byId = {};
			a[kind].concat(b[kind]).forEach(function (x) {
				var cur = byId[x.id];
				if (!cur || stamp(x) > stamp(cur)) byId[x.id] = x;
			});
			out[kind] = Object.keys(byId).map(function (id) { return byId[id]; })
				.filter(function (x) { return !(out.deleted[x.id] >= stamp(x)); })
				.sort(function (x, y) { return stamp(x) - stamp(y); });
		});
		out.updated = Math.max(a.updated, b.updated);
		return out;
	}

	function same(a, b) {
		function key(l) {
			return JSON.stringify({ b: l.builds, i: l.inventories, d: l.deleted });
		}
		return key(clean(a)) === key(clean(b));
	}

	/* ---------- builds ---------- */

	function builds() { return current().builds.slice(); }

	function saveBuild(name, state) {
		current();
		var existing = lib.builds.filter(function (b) { return b.name === name; })[0];
		var entry = {
			id: existing ? existing.id : "b" + now().toString(36) + Math.random().toString(36).slice(2, 6),
			name: name, saved: now(), state: JSON.parse(JSON.stringify(state))
		};
		lib.builds = lib.builds.filter(function (b) { return b.name !== name; }).concat([entry]);
		delete lib.deleted[entry.id];
		commit("builds");
		return entry;
	}

	function deleteBuild(id) {
		current();
		lib.builds = lib.builds.filter(function (b) { return b.id !== id; });
		lib.deleted[id] = now();
		commit("builds");
	}

	/* ---------- scanned inventories ---------- */

	// Scans in load-slot order; scans without a slot (slot 0) come last.
	function inventories() {
		return current().inventories.slice().sort(function (a, b) { return (a.slot || 99) - (b.slot || 99) || stamp(a) - stamp(b); });
	}

	function inventoryInSlot(slot) {
		return current().inventories.filter(function (x) { return x.slot === slot; })[0] || null;
	}

	function freeSlot() {
		for (var s = 1; s <= MAX_LOADS; s++) if (!inventoryInSlot(s)) return s;
		return 0;
	}

	// Where a new scan would go: the slot its character already has, the given slot, or the
	// first free one. 0 when all four are taken by other characters.
	function slotFor(inv, slot) {
		var same = current().inventories.filter(function (x) { return x.id === inv.id && x.slot; })[0];
		if (slot >= 1 && slot <= MAX_LOADS) return slot;
		if (same) return same.slot;
		return freeSlot();
	}

	// Saves a scan into a load slot, replacing what was there. Returns the stored scan, or
	// null when no slot was given and all four are full.
	function putInventory(inv, slot) {
		current();
		var s = slotFor(inv, slot);
		if (!s) return null;
		var prev = current().inventories.filter(function (x) { return x.id === inv.id; })[0];
		if (prev && prev.talents && !inv.talents) inv.talents = prev.talents;   // an updated scan keeps pasted talents
		inv.importedAt = now();
		inv.slot = s;
		lib.inventories.forEach(function (x) {
			if (x.slot === s && x.id !== inv.id) lib.deleted[x.id] = now();
		});
		lib.inventories = lib.inventories.filter(function (x) { return x.id !== inv.id && !(x.slot === s); }).concat([inv]);
		delete lib.deleted[inv.id];
		commit("inventories");
		return inv;
	}

	function deleteInventory(id) {
		current();
		lib.inventories = lib.inventories.filter(function (x) { return x.id !== id; });
		lib.deleted[id] = now();
		commit("inventories");
	}

	function clearInventories() {
		current();
		lib.inventories.forEach(function (x) { lib.deleted[x.id] = now(); });
		lib.inventories = [];
		commit("inventories");
	}

	// Moves a scan to another slot; a scan already there swaps places with it.
	function moveInventory(id, slot) {
		current();
		var inv = lib.inventories.filter(function (x) { return x.id === id; })[0];
		if (!inv || slot < 1 || slot > MAX_LOADS) return;
		var other = inventoryInSlot(slot);
		if (other && other !== inv) { other.slot = inv.slot; other.importedAt = now(); }
		inv.slot = slot;
		inv.importedAt = now();
		commit("inventories");
	}

	// A talent build for a load (pasted now; a later scanner can read it from the game).
	function setInventoryTalents(id, talents) {
		current();
		var inv = lib.inventories.filter(function (x) { return x.id === id; })[0];
		if (!inv) return;
		if (talents) inv.talents = talents; else delete inv.talents;
		inv.importedAt = now();
		commit("inventories");
	}

	// Replace the whole library with a merged copy from Google Drive.
	function replace(next, why) {
		lib = clean(next);
		writeRaw(lib);
		emit(why || "sync");
	}

	function onChange(f) { listeners.push(f); }

	// Another tab (or the pop-out window) changed the library.
	if (root.addEventListener) {
		root.addEventListener("storage", function (e) {
			if (e.key !== KEY || !e.newValue || e.newValue === lastWritten) return;
			try { lib = clean(JSON.parse(e.newValue)); } catch (err) { return; }
			emit("storage");
		});
	}

	/* ---------- reading a scan from the DB Inventory Scanner ---------- */

	function str(v, max) { return typeof v === "string" ? v.trim().slice(0, max || 80) : ""; }

	function slotKeys() { return D().gear.slots.map(function (s) { return s.key; }); }

	function cleanGear(g, cls) {
		var data = D();
		if (!g || typeof g !== "object") return null;
		var slot = slotKeys().indexOf(g.slot) >= 0 ? g.slot : "";
		if (!slot) return null;
		var slotType = data.gear.slots.filter(function (s) { return s.key === slot; })[0].type;
		var rarity = ["M", "R", "L"].indexOf(g.rarity) >= 0 ? g.rarity : "M";
		var focusKeys = data.gear.focuses.map(function (f) { return f.key; });
		var allowedRunes = data.gear.procOptions[slotType] || [];
		var skillAllowed = ((data.gear.skillRuneOptions[cls] || {})[slotType]) || [];
		var magicKeys = data.gear.magicRunes.map(function (m) { return m.key; });
		var charms = (Array.isArray(g.charms) ? g.charms : []).slice(0, 3).map(function (k) {
			var info = typeof k === "string" ? E().charmInfo(k) : null;
			return info ? info.key : null;
		});
		while (charms.length < 3) charms.push(null);
		return {
			name: str(g.name, 80) || "Unnamed item",
			gearId: Math.max(0, Math.floor(+g.gearId || 0)),
			tier: [0, 1, 2].indexOf(+g.tier) >= 0 ? +g.tier : ["M", "R", "L"].indexOf(rarity),
			slot: slot,
			rarity: rarity,
			focus: focusKeys.indexOf(g.focus) >= 0 ? g.focus : "Balanced",
			runes: (Array.isArray(g.runes) ? g.runes : []).filter(function (k) { return allowedRunes.indexOf(k) >= 0; }).slice(0, 2),
			skillRune: skillAllowed.indexOf(g.skillRune) >= 0 ? g.skillRune : "",
			magic: magicKeys.indexOf(g.magic) >= 0 ? g.magic : "",
			level: Math.max(0, Math.min(99, Math.floor(+g.level || 0))),
			equipped: !!g.equipped,
			// Attack, Expertise and Defense as the game showed them (missing if unreadable).
			stats: E().scannedStats(g),
			charms: charms,
			confidence: Math.max(0, Math.min(1, +g.confidence || 0)) || null
		};
	}

	function fromB64Bytes(s) {
		s = s.replace(/-/g, "+").replace(/_/g, "/");
		while (s.length % 4) s += "=";
		var bin = atob(s);
		var bytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	}

	function fromB64(s) { return new TextDecoder().decode(fromB64Bytes(s)); }

	// The scanner's links carry the scan compressed: raw DEFLATE, then base64url (#invz=).
	function inflate(b64) {
		if (typeof root.DecompressionStream !== "function") {
			return Promise.reject(new Error("This browser can't open compressed scan links. Use the scanner's Copy scan button, or import the file it saved."));
		}
		var stream = new Blob([fromB64Bytes(b64)]).stream().pipeThrough(new root.DecompressionStream("deflate-raw"));
		return new Response(stream).text();
	}

	// Like parseScan, but also takes the scanner's compressed links. Returns a promise.
	function readScan(input) {
		var m = typeof input === "string" ? /(?:#|^)invz=([A-Za-z0-9_-]+)/.exec(input.trim()) : null;
		if (!m) return Promise.resolve(parseScan(input));
		return inflate(m[1]).then(parseScan, function (e) {
			return { error: e && /browser/.test(e.message) ? e.message : "That link's scan data is damaged." };
		});
	}

	// Returns { inventory } or { error } for a scan file's text or parsed JSON.
	function parseScan(input) {
		var data = D();
		var json = input;
		if (typeof input === "string") {
			var text = input.trim();
			// A link from the scanner (…#inv=...) or the bare base64 payload also works.
			var m = /(?:#|^)inv=([A-Za-z0-9_-]+)/.exec(text);
			if (m) {
				try { text = fromB64(m[1]); } catch (e) { return { error: "That link's scan data is damaged." }; }
			}
			try { json = JSON.parse(text); } catch (e) { return { error: "That isn't a scan file: it is not valid JSON." }; }
		}
		if (!json || typeof json !== "object") return { error: "That isn't a scan file." };
		if (json.format !== SCAN_FORMAT) return { error: "That JSON isn't from the DB Inventory Scanner (format \"" + SCAN_FORMAT + "\" expected)." };
		if (+json.version !== 1) return { error: "This scan was made by a newer scanner (format version " + json.version + "). Update the page and try again." };
		var ch = json.character || {};
		var cls = Object.prototype.hasOwnProperty.call(data.classes, ch.class) ? ch.class : "";
		if (!cls) return { error: "The scan doesn't say which class the character is." };
		var gear = (Array.isArray(json.gear) ? json.gear : []).map(function (g) { return cleanGear(g, cls); }).filter(Boolean);
		var charms = [];
		var seen = {};
		(Array.isArray(json.charms) ? json.charms : []).forEach(function (c) {
			var info = c && typeof c.key === "string" ? E().charmInfo(c.key) : null;
			var n = Math.max(0, Math.min(9999, Math.floor(+(c && c.count) || 0)));
			if (!info || !n) return;
			if (seen[info.key]) { seen[info.key].count += n; return; }
			seen[info.key] = { key: info.key, name: info.name, count: n };
			charms.push(seen[info.key]);
		});
		if (!gear.length && !charms.length) return { error: "The scan has no gear or charms in it." };
		var name = str(ch.name, 40) || "Unnamed character";
		var talents = ch.talents ? parseTalents(String(ch.talents)) : null;
		var scanned = Date.parse(json.scannedAt);
		return {
			inventory: {
				id: "inv-" + cls.toLowerCase() + "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
				character: { name: name, class: cls, level: Math.max(0, Math.min(99, Math.floor(+ch.level || 0))) || null },
				scannedAt: isNaN(scanned) ? new Date().toISOString() : new Date(scanned).toISOString(),
				source: str(json.source, 60),
				gear: gear,
				charms: charms,
				talents: talents && !talents.error && data.disciplines[talents.discipline].cls === cls ? talents.talents : undefined
			}
		};
	}

	/*
	 * A talent build from whatever the player pastes: the build string itself, a talent
	 * calculator link (…#3225h3…), or a DPS Calculator link (…#b=…). Returns { talents,
	 * discipline } or { error }.
	 */
	function parseTalents(input) {
		var text = String(input || "").trim();
		if (!text) return { error: "Paste a talent build or a talent calculator link." };
		var hash = text.indexOf("#") >= 0 ? text.slice(text.lastIndexOf("#") + 1) : text;
		var build = hash;
		if (/^b=/.test(hash) || /^p=/.test(hash)) {
			try {
				var obj = JSON.parse(fromB64(hash.slice(2)));
				if (obj && Array.isArray(obj.chars)) obj = obj.chars[Math.max(0, Math.min(obj.chars.length - 1, +obj.active || 0))];
				build = obj && typeof obj.talents === "string" ? obj.talents : "";
			} catch (e) { return { error: "That link's build data is damaged." }; }
		}
		if (!/^[0-9][0-9A-Za-z]{0,120}$/.test(build)) return { error: "That isn't a talent build. Copy the link from the talent calculator." };
		var disc = parseInt(build.charAt(0), 10);
		if (disc >= D().disciplines.length) return { error: "That talent build is for a discipline this calculator doesn't know." };
		return { talents: build, discipline: disc };
	}

	root.DBB_LIBRARY = {
		KEY: KEY, SCAN_FORMAT: SCAN_FORMAT,
		load: load, current: current, merge: merge, same: same, replace: replace, onChange: onChange,
		builds: builds, saveBuild: saveBuild, deleteBuild: deleteBuild,
		inventories: inventories, putInventory: putInventory, deleteInventory: deleteInventory,
		parseScan: parseScan, readScan: readScan, parseTalents: parseTalents,
		MAX_LOADS: MAX_LOADS, inventoryInSlot: inventoryInSlot, freeSlot: freeSlot, slotFor: slotFor,
		clearInventories: clearInventories, moveInventory: moveInventory, setInventoryTalents: setInventoryTalents
	};
})(typeof window !== "undefined" ? window : globalThis);
