// Run with: node tools/check_engine.js  (checks the engine against hand calculations)
global.window = global;
const fs = require('fs'), vm = require('vm');
const R = require('path').join(__dirname, '..') + '/';
for (const f of ['app/data/game-data.js', 'talents/js/talent-data.js', 'talents/js/mage-data.js', 'talents/js/viperblade-data.js',
	'talents/js/soulthief-data.js', 'talents/js/sentinel-data.js', 'talents/js/justicar-data.js', 'talents/js/templar-data.js',
	'app/combos.js', 'app/engine.js', 'app/library.js'])
	vm.runInThisContext(fs.readFileSync(R + f, 'utf8'), { filename: f });
const E = window.DBB_ENGINE, D = window.DBB_DATA, T = window.DBCALC_TALENT_DATA, L = window.DBB_LIBRARY;
const pending = [];

function bare(disc) {
	const s = E.defaultState();
	s.talents = String(disc);
	s.gearMode = 'totals';
	for (const k in s.gear) s.gear[k].runes = [];
	return s;
}
// A build string with one talent socketed: `slot` and talent index `tid` at `level`.
const ENC = '12345678abcdefghijklmnopqrstuvwxyABCDEFGHIJKLMNOPQRSTUVWXY';
function withTalent(disc, slot, tid, level) {
	let s = String(disc);
	for (let i = 0; i < slot; i++) s += '0';
	return s + level + ENC[tid];
}
function talentIndex(disc, name) { return T[D.disciplines[disc].key].talents.findIndex(t => t.name === name); }
function talentTier(disc, name) { const t = T[D.disciplines[disc].key].talents.find(t => t.name === name); return t && t.tier[0]; }

let ok = 0;
function check(name, got, want, tol) {
	const pass = typeof want === 'number' ? Math.abs(got - want) <= (tol || 1e-9) : got === want;
	console.log((pass ? 'PASS ' : 'FAIL ') + name + ': got ' + got + ', want ' + want);
	if (pass) ok++; else process.exitCode = 1;
}
function skill(r, ability) {
	for (const g of r.skills) for (const s of g.skills) if (s.ability === ability) return s;
	return null;
}

// 1. Baselines
for (const [d, def] of [[3, 1344], [0, 1008], [6, 1680]]) {
	const r = E.compute(bare(d));
	check('baseline ' + r.cls + ' HP', r.stats.hp, 68109);
	check('baseline ' + r.cls + ' ATK', r.stats.attack, 3914);
	check('baseline ' + r.cls + ' EXP', r.stats.expertise, 2655);
	check('baseline ' + r.cls + ' DEF', r.stats.defense, def);
}
// 2. Legendary attack main hand = 912
{ const s = bare(3); s.gearMode = 'pieces'; const r = E.compute(s); check('legendary Attack main hand', r.gear.perSlot.mainhand.attack, 912); }
// 2b. Attack/Expertise/Defense read by the DB Inventory Scanner replace the table values.
{
	const s = bare(3); s.gearMode = 'pieces';
	s.gear.mainhand.stats = { attack: 472, expertise: 400, defense: 0 };
	const r = E.compute(s);
	check('scanned main hand Attack', r.gear.perSlot.mainhand.attack, 472);
	check('scanned main hand Expertise', r.gear.perSlot.mainhand.expertise, 400);
	check('other slots keep table values', r.gear.perSlot.offhand.attack, E.tableStats('Rogue', 'Shield', s.gear.offhand.focus, s.gear.offhand.rarity).attack);
	check('bad scanned stats are ignored', E.scannedStats({ stats: { attack: -5, expertise: 'x' } }), null);
}
// 2c. Scan files and the scanner's links.
{
	const scan = { format: 'dbb-inventory', version: 1, source: 'test', scannedAt: '2026-10-05T18:42:07Z', character: { name: 'ksq', class: 'Rogue' },
		gear: [{ name: 'Key to the City', gearId: 1019, tier: 1, slot: 'mainhand', rarity: 'R', focus: 'Expertise', runes: ['ProcMassiveTime'],
			skillRune: 'PoisonStrike', magic: 'Speed+CraftDrop', level: 28, equipped: true, stats: { attack: 472, expertise: 400, defense: 0 },
			charms: ['expertise', null, 'attack@7'], confidence: 1 }],
		charms: [{ key: 'twilightSliver', name: 'Twilight Sliver', count: 6 }, { key: 'attack@10', name: 'Infinite Citrine', count: 2 }] };
	const p = L.parseScan(JSON.stringify(scan));
	const g = p.inventory && p.inventory.gear[0];
	check('scan import keeps stats', g && JSON.stringify(g.stats), '{"attack":472,"expertise":400,"defense":0}');
	check('scan import keeps the proc rune', g && g.runes.join(), 'ProcMassiveTime');
	check('scan import keeps the skill rune', g && g.skillRune, 'PoisonStrike');
	check('scan import keeps the magic rune', g && g.magic, 'Speed+CraftDrop');
	check('scan import keeps socketed charms', g && g.charms.join(), 'expertise,,attack@7');
	check('top-rank charm key normalized on import', p.inventory && p.inventory.charms.map(c => c.key).join(), 'twilightSliver,attack');
	check('scan without class is refused', !!L.parseScan(JSON.stringify(Object.assign({}, scan, { character: { name: 'x' } }))).error, true);
	const b64 = Buffer.from(JSON.stringify(scan)).toString('base64url');
	check('plain link import', (L.parseScan('https://example.test/#inv=' + b64).inventory || {}).id, 'inv-rogue-ksq');
	const z = require('zlib').deflateRawSync(Buffer.from(JSON.stringify(scan))).toString('base64url');
	pending.push(L.readScan('https://killssingkurisu.github.io/db-dps-calculator/#invz=' + z).then(r => {
		check('compressed link import', r.inventory && r.inventory.gear[0].name, 'Key to the City');
	}));
	pending.push(L.readScan('#invz=AAAA' + z.slice(4)).then(r => check('damaged compressed link', !!r.error, true)));
}
// 3. Charms
{ const s = bare(3); s.charms = { attack: 18 }; check('18 attack charms', E.compute(s).stats.attack, 3914 + 18 * 84); }
{ const s = bare(3); s.charms = { hp: 2, defense: 3, expertise: 4 }; const r = E.compute(s); check('charm HP', r.stats.hp, 68109 + 2 * 2838); check('charm DEF', r.stats.defense, 1344 + 84); check('charm EXP', r.stats.expertise, 2655 + 336); }
// 3b. Charm ranks ("attack@7" is a Radiant Citrine, +41 Attack) and special charms.
{ const s = bare(3); s.charms = { attack: 1, 'attack@7': 2 }; const r = E.compute(s); check('rank 7 Attack charms', r.stats.attack, 3914 + 84 + 2 * 41); check('charm count with ranks', r.charms.count, 3); }
{ const s = bare(3); s.charms = { 'critChance@1': 1, eyeOfDiscovery: 1 }; const r = E.compute(s); check('Chipped Amethyst + Eye of Discovery crit stat', r.charms.critChance, 0.006 + 0.05, 1e-12); check('Eye of Discovery gear find', r.charms.gearFind, 0.08, 1e-12); }
check('charm name for attack@10', E.charmInfo('attack@10').name, 'Infinite Citrine');
check('top rank key is normalized', E.charmInfo('attack@10').key, 'attack');
check('unknown charm rank is rejected', E.charmInfo('attack@11'), null);
// 3c. Magic Forge charms: a second gem of the same rank at half (R) or full (L) value.
check('Infinite Sapphire of Deflecting name', E.charmInfo('expertise+defense:R').name, 'Infinite Sapphire of Deflecting');
check('Infinite Sapphire of Deflecting defense', E.charmInfo('expertise+defense:R').stats.defense, 14);
check('Infinite Amethyst of Ruin crit power', E.charmInfo('critChance+critPower:L').stats.critPower, 0.05, 1e-12);
check('forged top-rank key is normalized', E.charmInfo('attack@10+hp:R').key, 'attack+hp:R');
check('special charms have no forge bonus', E.charmInfo('eyeOfDiscovery+attack:R'), null);
{ const s = bare(3); s.charms = { 'critChance+attack:R': 1, 'expertise+expertise:L': 1 }; const r = E.compute(s);
  check('forged Attack bonus', r.stats.attack, 3914 + 42); check('forged bonus of the same stat adds up', r.stats.expertise, 2655 + 168); }
// 4. Crit chance: notes example 70% stat -> 25.5%
{ const s = bare(3); s.extra.critChance = 70; check('crit 70% stat -> real', E.compute(s).stats.critReal, 0.255, 1e-12); }
// 5a. Notes example: Heavy Blow with 20% crit power -> 70%
{ const s = bare(3); s.gear.mainhand = { rarity: 'R', focus: 'Attack', runes: ['ProcMassive'], skillRune: '', magic: '' }; s.extra.critPower = 20; check('Heavy Blow + 20% CP', E.compute(s).stats.critDamagePct, 70, 1e-9); }
// 5b. Notes example: fire rune vs ice creature + Hemorrhage, 30% CP -> 242.5%
{ const s = bare(3); s.gear.mainhand = { rarity: 'L', focus: 'Attack', runes: ['ProcFire', 'ProcMassiveTime'], skillRune: '', magic: '' }; s.extra.critPower = 30; s.target.element = 'Ice'; check('Incinerate vs Ice + Hemorrhage + 30% CP', E.compute(s).stats.critDamagePct, 242.5, 1e-9); }
// 5c. Elemental vs own element 25%, neutral 50%
{ const s = bare(3); s.gear.mainhand = { rarity: 'R', focus: 'Attack', runes: ['ProcFire'], skillRune: '', magic: '' }; s.target.element = 'Fire'; check('Incinerate vs Fire', E.compute(s).stats.critDamagePct, 25); s.target.element = 'Earth'; check('Incinerate vs Earth', E.compute(s).stats.critDamagePct, 50); }
// 5d. Magic/rare weapon ignores a second rune
{ const s = bare(3); s.gear.mainhand = { rarity: 'R', focus: 'Attack', runes: ['ProcMassive', 'ProcMassiveTime'], skillRune: '', magic: '' }; check('rare weapon uses 1 rune', E.compute(s).crit.runes.length, 1); }
// 5e. Mending Blow heals 100% + CP/2; Renew 125% boosted by Recovery, not CP
{ const s = bare(3); s.gear.mainhand = { rarity: 'L', focus: 'Attack', runes: ['ProcHeal', 'ProcHealTime'], skillRune: '', magic: '' }; s.extra.critPower = 20; const h = E.compute(s).crit.heals; check('Mending Blow heal', h[0].pct, 110, 1e-9); check('Renew heal', h[1].pct, 125, 1e-9); }
// 6. Gear rune stats
{ const s = bare(3); s.gear.offhand.runes = ['CritChance', 'HealthPercent']; s.gear.boots.runes = ['CritDamage']; const r = E.compute(s); check('CritChance rune -> 16.5%', r.stats.critReal, 0.165, 1e-12); check('HealthPercent rune', r.stats.hp, Math.round(68109 * 1.15)); check('CritDamage rune', r.stats.critPower, 0.10, 1e-12); }
// 7. DoTs: bleed 6% exp/tick; Artery Strike 5/5 adds +0.05 DoTDamage -> +1.5% -> 7.5%
{ const s = bare(3); const r = E.compute(s); const bleed = r.dots.find(d => d.buff === 'Bleeding'); check('bleed tick no talents', bleed.perTick, 2655 * 0.06, 1e-6); check('bleed stacks', bleed.maxStacks, 15); }
{ const r = E.compute(E.defaultState()); const bleed = r.dots.find(d => d.buff === 'Bleeding'); check('bleed % with 3x Artery Strike 5/5', +(bleed.basePct + bleed.talentPct).toFixed(4), 6 + 3 * 1.5, 1e-9); check('bleed stacks with 2x Deep Cuts 5/5', bleed.maxStacks, 25); }
// 8. Skill: Poison Strike r10 = 2 hits x 1.49 x Attack; its poison lands on the last hit only (Last:)
{ const r = E.compute(bare(3)); const ps = skill(r, 'PoisonStrike'); check('Poison Strike direct', ps.direct, 2 * 1.49 * 3914, 1e-6); check('Poison Strike poison per stack total', ps.dot, 2655 * 0.60 * 5, 1e-6); }

// 9. Buff timing on multi-pulse powers (client rules): no prefix = every pulse, First: = once.
{
	const r = E.compute(bare(3));
	const ws = skill(r, 'WitherStrike');   // First: ... Bleeding x4, 2 hits
	check('Withering Impact bleeds land once (First:)', ws.dots.find(d => d.buff === 'Bleeding').applied, 4);
	const vs = skill(r, 'VitalStrike');    // Bleeding x6 on each of 5 pulses, capped at 15
	check('Shadow Rend bleeds every pulse', vs.dots.find(d => d.buff === 'Bleeding').applied, 30);
	check('Shadow Rend bleed capped at max stacks', vs.dots.find(d => d.buff === 'Bleeding').stacks, 15);
}
// 10. Talentstone values from the update file.
{
	const cases = [
		[3, 'Contact Poison', 5, 'Poison vs bleeding', r => r.talents.dotVs[0].value, 0.30],
		[3, 'Corrosive Strikes', 5, 'Armor Bane +2 s', r => r.talents.debuffTime.ArmorBane, 2000],
		[3, 'Hemorrhage', 5, 'Hemorrhage damage', r => r.talents.critRune.hemorrhage, 0.15],
		[3, 'Hemorrhage', 5, 'Hemorrhage defense debuff', r => r.talents.hemoDebuff, 0.02],
		[4, 'Ethereal', 5, 'Ethereal expertise in stealth', r => r.talents.condPct[0].value, 0.10],
		[4, 'Opportunist', 5, 'Opportunist crit stat (game value)', r => r.talents.critCond[0].value, 0.1],
		[5, 'Insidious Poison', 5, 'Insidious Poison', r => r.talents.dotVs[0].value, 0.20],
		[5, 'Wind Cloak', 5, 'Wind Cloak defense vs bound', r => r.talents.condPct[0].value, 0.05],
		[6, 'Dominate', 5, 'Dominate', r => r.talents.dmgCond[0].value, 0.25],
		[7, 'Immolation', 5, 'Immolation (doubled)', r => r.talents.dotFlat.Ignite, 0.32 * 0.5],
		[7, 'Heavy Blows', 5, 'Heavy Blows', r => r.talents.critRune.heavyBlow, 0.15],
		[7, 'Pain Eater', 5, 'Pain Eater', r => r.talents.condPct[0].value, 0.10],
		[8, 'Smiting Flames', 5, 'Smiting Flames', r => r.talents.dotFlat.HolyFire1, 0.15],
		[8, 'Crusading Flames', 5, 'Crusading Flames stacks', r => r.talents.dotStacks.HolyFire1, 5],
		[8, 'Sanctify', 5, 'Sanctify defense from expertise', r => r.talents.fromExp.defense, 0.05],
		[0, 'Chilblains', 5, 'Chilblains damage', r => r.talents.dotFlat.Chilblains, 0.5 * 0.3],
		[1, 'Accelerant', 5, 'Accelerant (+50%)', r => r.talents.dotFlat.Burned, 0.5 * 0.3]
	];
	for (const [disc, name, level, label, get, want] of cases) {
		const tid = talentIndex(disc, name);
		const s = bare(disc);
		s.talents = withTalent(disc, 0, tid, level);
		check(label + ' at ' + level + '/5', get(E.compute(s)), want, 1e-9);
	}
}
// 11. Necromancer: Cursed Armor is row 5, Cursed Sword row 6.
check('Necromancer Cursed Armor row', talentTier(2, 'Cursed Armor'), 5);
check('Necromancer Cursed Sword row (first)', Math.min.apply(null, T.necromancer.talents.filter(t => t.name === 'Cursed Sword').map(t => t.tier[0])), 6);
// 12. Target debuffs: Armor Bane +5%/stack up to 7; Armor Breaker counts two different values; Scorch +1%/stack, 15 max.
{
	const s = bare(3);
	s.target.armorBane = 7; check('7 Armor Bane = +35%', E.compute(s).direct.mult, 1.35, 1e-12);
	s.target.armorBane = 9; check('Armor Bane caps at 7', E.compute(s).direct.mult, 1.35, 1e-12);
	s.target.armorBane = 0; s.target.armorBreak = '35+50'; check('Armor Breaker 35% + 50%', E.compute(s).direct.mult, 1.85, 1e-12);
	s.target.armorBreak = ''; s.target.scorch = 30; check('Scorch caps at 15 without talents', E.compute(s).direct.mult, 1.15, 1e-12);
}
// 13. Retribution rank 10: 155% of Expertise per reflected hit, up to 10 hits.
{ const r = E.compute(bare(6)); const ret = skill(r, 'Retribution'); check('Retribution per hit', ret.reflect.perHit, 2655 * 1.55, 1e-6); check('Retribution hits', ret.reflect.hits, 10); }
// 14. Hallowed Reckoning puts Holy Fire on with each of its 4 ticks from rank 5.
{ const r = E.compute(bare(8)); check('Hallowed Reckoning holy fire applications', skill(r, 'FountainOfLife').dots[0].applied, 4); }

// 15. Combos: every preset uses real skills, at most one per hotbar slot 1-3, and simulates.
for (const disc of D.disciplines) {
	const all = (D.skills[disc.cls] || []).concat(D.skills[disc.master] || []);
	const byKey = {}; all.forEach(a => { byKey[a.ability] = a; });
	const presets = window.DBB_COMBOS[disc.key] || [];
	let valid = presets.length >= 3;
	for (const c of presets) {
		const slots = {};
		for (const st of c.steps) {
			if (st === 'basic') continue;
			const a = byKey[st];
			if (!a || a.hotbar < 1) { valid = false; continue; }
			if (a.hotbar <= 3) { if (slots[a.hotbar] && slots[a.hotbar] !== st) valid = false; slots[a.hotbar] = st; }
		}
	}
	check(disc.name + ' presets valid', valid, true);
	const s = bare(disc.id);
	const r = E.compute(s);
	const sums = r.combos.map(c => c.result.skills.reduce((a, x) => a + x.share, 0));
	check(disc.name + ' combos simulate', r.combos.length === presets.length && r.combos.every(c => c.result.dps > 0 && c.burst.dps > 0), true);
	check(disc.name + ' damage shares add up', sums.every(x => Math.abs(x - 1) < 1e-9), true);
}
// 16. Combo mechanics.
{
	const s = bare(6);
	s.comboWindow = 30;
	// Cleave only: 5 hits x 2.42 x Attack every 900 ms with unlimited mana (no crit rune).
	s.customCombo = ['Cleave'];
	let c = E.compute(s).combos.find(x => x.id === 'custom');
	// Hits that would land after the 30 s window are not counted.
	const casts = Math.ceil(30000 / 900);
	let hits = 0;
	for (let k = 0; k < casts; k++) for (const at of [400, 500, 600, 700, 800]) if (900 * k + at <= 30000) hits++;
	check('Cleave loop casts', c.burst.casts, casts);
	check('Cleave loop burst DPS', c.burst.dps, hits * 2.42 * 3914 / 30, 1e-6);
	// With mana: 80 to start, Cleave costs 20, each basic attack gives 5.
	check('Cleave loop with mana waits for basic attacks', c.result.manaWaitMs > 0 && c.result.casts < casts, true);
	// Attack speed only speeds up basic attacks.
	s.extra.attackSpeed = 50;
	c = E.compute(s).combos.find(x => x.id === 'custom');
	check('attack speed leaves skill casts alone', c.burst.casts, casts);
	s.customCombo = ['basic'];
	c = E.compute(s).combos.find(x => x.id === 'custom');
	check('attack speed speeds up basic attacks', c.burst.loops, Math.ceil(30000 / (500 / 1.5)));
}
{
	// Berserker (+60% Attack for 7 s) right before Furious Assault.
	const s = bare(7);
	s.customCombo = ['Berserker', 'FuriousAssault'];
	s.comboWindow = 5;
	const c = E.compute(s).combos.find(x => x.id === 'custom');
	const fa = c.burst.skills.find(x => x.key === 'FuriousAssault');
	let hits = 0;
	for (let t = 910; t < 5000; t += 1200) for (const at of [160, 410, 700]) if (t + at <= 5000) hits++;
	check('Berserker boosts the hits after it', fa.direct, hits * 1.82 * 3914 * 1.6, 1e-6);
}
{
	// Armor Breaker then a big hit: the hit after it gets +50%.
	const s = bare(3);
	s.customCombo = ['ReduceArmor', 'HawkStrike'];
	s.comboWindow = 5;
	const c = E.compute(s).combos.find(x => x.id === 'custom');
	const hs = c.burst.skills.find(x => x.key === 'HawkStrike');
	let hits = 0;
	for (let t = 450; t < 5000; t += 1500) if (t + 600 <= 5000) hits++;
	check('Hawk Strike after Armor Breaker', hs.direct / hits, 5.9 * 3914 * 1.5, 1e-6);
}
// 16b. Two Contact Poison stones add up (+30% + 30% = +60%), they don't multiply.
{
	const tid = talentIndex(3, 'Contact Poison');
	const s = bare(3);
	s.talents = '3' + '0' + '5' + ENC[tid] + '0' + '5' + ENC[tid];
	s.target.states = { bleeding: true };
	const fp = E.compute(s).dots.find(d => d.buff === 'DaggerPoison');
	check('two Contact Poison 5/5 vs bleeding', fp.vsMult, 1.6, 1e-9);
}
// 17. Simulation edge cases on made-up skills.
{
	const I = E._internal;
	const base = E.compute(bare(3));
	function env(abilities) {
		const tal = JSON.parse(JSON.stringify(base.talents));
		return {
			tal: tal, slay: 0, reduction: 0, attack: 1000, attackSpeed: 0, abilities: abilities, rank: 1,
			runes: { multAdd: {}, appends: {}, replaces: {}, dotFlat: {}, buffTime: {}, notes: [] },
			dot: I.makeDotBase(1000, tal), crit: { hasHemorrhage: false, chance: () => 0, factor: () => 1 },
			selfConds: {}, buffTime: () => 0,
			basic: { name: 'Basic', info: { power: 'SwordMelee', target: 'MeleeCombo', mults: [1], hitAt: [65], noCrit: true, busyMs: 500, manaGain: 5 }, ranged: false }
		};
	}
	function ab(key, part) { return { ability: key, name: key, hotbar: 1, ranks: [Object.assign({ rank: 1, power: key + '1', target: 'Melee', mults: [], hitAt: [], busyMs: 500, lastAt: 0 }, part)] }; }
	const bleedOnce = { apply: { rule: 'every', dots: { Bleeding: 1 }, debuffs: {} }, pulseAt: [0] };
	// A DoT refreshed after its last tick but before it runs out keeps its stacks:
	// 2 stacks tick 5 times, the refresh at 5.2 s makes 3 stacks that tick 5 more times.
	let e = env([ab('A', bleedOnce), ab('Wait', { busyMs: 4200 }), ab('Long', { busyMs: 100000 })]);
	let res = I.simulateCombo(['A', 'A', 'Wait', 'A', 'Long'], e, 20, false);
	check('DoT refreshed late keeps its stacks', res.total / e.dot('Bleeding').perTick, 25, 1e-9);
	// An Expertise buff counts for a DoT applied the moment it starts.
	e = env([ab('C', Object.assign({ self: [{ buff: 'Chaos', durationMs: 5000, magic: 0.3 }], selfAt: 0 }, bleedOnce)), ab('Long', { busyMs: 100000 })]);
	res = I.simulateCombo(['C', 'Long'], e, 20, false);
	check('Expertise buff boosts the DoT cast with it', res.total / e.dot('Bleeding').perTick, 5 * 1.3, 1e-9);
	// The most recently cast basic-attack override is the one in use.
	const ovr = (mult) => ({ power: 'Ovr' + mult, target: 'Melee', mults: [mult], hitAt: [0], busyMs: 500 });
	e = env([
		ab('X', { self: [{ buff: 'BX', durationMs: 20000, meleeOverride: ovr(2) }], selfAt: 0 }),
		ab('Y', { self: [{ buff: 'BY', durationMs: 20000, meleeOverride: ovr(3) }], selfAt: 0 }),
		ab('Long', { busyMs: 100000 })
	]);
	e.abilities.forEach(a => { a.hotbar = 4; });   // master slots: no skill mana, no Harmony
	res = I.simulateCombo(['X', 'Y', 'basic', 'X', 'basic', 'Long'], e, 10, false);
	const by = Object.fromEntries(res.skills.map(s => [s.key, s.direct]));
	check('override from the latest cast is used', [by.X, by.Y].join(','), '2000,3000');
}
// 18. Party fights: one shared target, debuffs from anyone help everyone, party buffs reach everyone.
{
	const viper = E.compute(E.defaultState());                       // Viperblade with talents: Armor Bane, bleeds
	const just = E.compute(Object.assign(E.defaultState(), { talents: '7' }));   // Justicar, no talents
	const temp = E.compute(Object.assign(E.defaultState(), { talents: '8' }));   // Templar, no talents
	const W = 30;
	const jSteps = ['Harm', 'FuriousAssault', 'JumpSlam', 'LeapStrike'];
	const vSteps = viper.combos[0].steps;
	const soloJ = E.simulateParty([{ steps: jSteps, env: just.env }], W, false);
	check('party of one matches the solo combo', soloJ.total, E._internal.simulateCombo(jSteps, just.env, W, false).total, 1e-6);
	const duo = E.simulateParty([{ steps: vSteps, env: viper.env }, { steps: jSteps, env: just.env }], W, false);
	check('party total is the sum of its members', duo.total, duo.members[0].total + duo.members[1].total, 1e-6);
	check("Viperblade's debuffs raise the Justicar's damage", duo.members[1].total > soloJ.total, true);
	check('members keep their own timelines', duo.members[1].timeline[0].key, 'Harm');
	const aura = E.simulateParty([{ steps: ['LeoneanAura', 'Penance', 'CelestialLance', 'Cleave'], env: temp.env }, { steps: jSteps, env: just.env }], W, false);
	const noAura = E.simulateParty([{ steps: ['Penance', 'CelestialLance', 'Cleave'], env: temp.env }, { steps: jSteps, env: just.env }], W, false);
	check('Empyrean Aura buffs the rest of the party', aura.members[1].total > noAura.members[1].total, true);
	check('Empyrean Aura is listed as a party buff', aura.members[0].partyBuffs.join(), 'Empyrean Aura');
	const idle = E.simulateParty([{ steps: [], env: temp.env }, { steps: jSteps, env: just.env }], W, false);
	check('a member without steps deals no damage', idle.members[0] === null && Math.abs(idle.total - soloJ.total) < 1e-6, true);
	const opt = E.optimizeParty([
		{ env: viper.env, choices: viper.combos.map(c => ({ id: c.id, steps: c.steps })) },
		{ env: just.env, choices: just.combos.map(c => ({ id: c.id, steps: c.steps })) }
	], W, true);
	let bestSeen = 0;
	viper.combos.forEach(a => just.combos.forEach(b => {
		const r = E.simulateParty([{ steps: a.steps, env: viper.env }, { steps: b.steps, env: just.env }], W, true);
		bestSeen = Math.max(bestSeen, r.total);
	}));
	check('party optimizer finds the best pair of combos', opt.total, bestSeen, 1e-6);
	const big = E.optimizeParty([0, 1, 2, 3].map(() => ({ env: viper.env, choices: viper.combos.map(c => ({ id: c.id, steps: c.steps })) })), W, true, 10);
	check('large party searches stay within reach', big.total >= E.simulateParty([0, 1, 2, 3].map(() => ({ steps: viper.combos[0].steps, env: viper.env })), W, true).total - 1e-6, true);
}
// 19. Load slots: up to four scans, talents per load.
{
	const mk = (name, cls) => L.parseScan(JSON.stringify({ format: 'dbb-inventory', version: 1, scannedAt: '2026-10-06T00:00:00Z',
		character: { name, class: cls }, gear: [], charms: [{ key: 'attack', count: 1 }] })).inventory;
	L.clearInventories();
	const a = L.putInventory(mk('ksq', 'Rogue')), b = L.putInventory(mk('Doktor', 'Paladin')), c = L.putInventory(mk('Vidar', 'Mage'));
	check('loads fill slots in order', [a.slot, b.slot, c.slot].join(), '1,2,3');
	const d = L.putInventory(mk('Ana', 'Mage'));
	check('fourth load takes slot 4', d.slot, 4);
	check('a fifth character needs a slot', L.putInventory(mk('Extra', 'Rogue')), null);
	L.setInventoryTalents(b.id, '6');
	const b2 = L.putInventory(mk('Doktor', 'Paladin'));
	check('updating a load keeps its slot and talents', b2.slot + ' ' + b2.talents, '2 6');
	const e = L.putInventory(mk('Extra', 'Rogue'), 3);
	check('a chosen slot replaces its load', e.slot + ' ' + L.inventories().map(x => x.character.name).join('/'), '3 ksq/Doktor/Extra/Ana');
	L.moveInventory(e.id, 1);
	check('moving a load swaps slots', L.inventories().map(x => x.slot + x.character.name).join('/'), '1Extra/2Doktor/3ksq/4Ana');
	const merged = L.merge(L.current(), { inventories: [Object.assign(mk('Remote', 'Mage'), { id: 'inv-mage-remote', slot: 2, importedAt: Date.now() + 1000 })] });
	const cleaned = L.merge(merged, {});
	check('a merged load claiming a taken slot pushes the older one out', cleaned.inventories.filter(x => x.slot === 2).map(x => x.character.name).join() + ' ' + cleaned.inventories.filter(x => !x.slot).length, 'Remote 1');
	L.clearInventories();
	check('remove all loads', L.inventories().length, 0);
	check('talent build string', L.parseTalents('3225h315b').talents, '3225h315b');
	check('talent calculator link', L.parseTalents('https://db-calculator.theminesa.studio/#6123ab').discipline, 6);
	check('DPS calculator link', L.parseTalents('https://x.test/#b=' + Buffer.from(JSON.stringify({ talents: '8115a' })).toString('base64url')).talents, '8115a');
	check('nonsense is refused', !!L.parseTalents('hello').error, true);
	const withT = L.parseScan(JSON.stringify({ format: 'dbb-inventory', version: 1, character: { name: 'x', class: 'Rogue', talents: '3225h' }, gear: [], charms: [{ key: 'attack', count: 1 }] }));
	check('scan carries talents for its class', withT.inventory.talents, '3225h');
	const wrongT = L.parseScan(JSON.stringify({ format: 'dbb-inventory', version: 1, character: { name: 'x', class: 'Rogue', talents: '8115a' }, gear: [], charms: [{ key: 'attack', count: 1 }] }));
	check('talents of another class are dropped', wrongT.inventory.talents, undefined);
}
Promise.all(pending).then(() => console.log(ok + ' checks passed'));
