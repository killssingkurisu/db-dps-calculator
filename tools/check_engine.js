// Run with: node tools/check_engine.js  (checks the engine against hand calculations)
global.window = global;
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const R=require('path').join(__dirname, '..') + '/';
for (const f of ['app/data/game-data.js','talents/js/talent-data.js','talents/js/mage-data.js','talents/js/viperblade-data.js','talents/js/soulthief-data.js','talents/js/sentinel-data.js','talents/js/justicar-data.js','talents/js/templar-data.js','app/engine.js'])
  vm.runInThisContext(fs.readFileSync(R+f,'utf8'),{filename:f});
const E=window.DBB_ENGINE;
function bare(disc){ const s=E.defaultState(); s.talents=String(disc); s.gearMode='totals'; for (const k in s.gear) s.gear[k].runes=[]; return s; }
let ok=0; function check(name, got, want, tol){ const pass = typeof want==='number' ? Math.abs(got-want) <= (tol||1e-9) : got===want; console.log((pass?'PASS ':'FAIL ')+name+': got '+got+', want '+want); if(pass) ok++; else process.exitCode=1; }

// 1. Baselines
for (const [d,def] of [[3,1344],[0,1008],[6,1680]]) { const r=E.compute(bare(d)); check('baseline '+r.cls+' HP', r.stats.hp, 68109); check('baseline '+r.cls+' ATK', r.stats.attack, 3914); check('baseline '+r.cls+' EXP', r.stats.expertise, 2655); check('baseline '+r.cls+' DEF', r.stats.defense, def); }
// 2. Legendary attack main hand = 912
{ const s=bare(3); s.gearMode='pieces'; const r=E.compute(s); check('legendary Attack main hand', r.gear.perSlot.mainhand.attack, 912); }
// 3. Charms
{ const s=bare(3); s.charms={attack:18}; check('18 attack charms', E.compute(s).stats.attack, 3914+18*84); }
{ const s=bare(3); s.charms={hp:2, defense:3, expertise:4}; const r=E.compute(s); check('charm HP', r.stats.hp, 68109+2*2838); check('charm DEF', r.stats.defense, 1344+84); check('charm EXP', r.stats.expertise, 2655+336); }
// 4. Crit chance: notes example 70% stat -> 25.5%
{ const s=bare(3); s.extra.critChance=70; check('crit 70% stat -> real', E.compute(s).stats.critReal, 0.255, 1e-12); }
// 5a. Notes example: Heavy Blow with 20% crit power -> 70%
{ const s=bare(3); s.gear.mainhand={rarity:'R',focus:'Attack',runes:['ProcMassive'],skillRune:'',magic:''}; s.extra.critPower=20; check('Heavy Blow + 20% CP', E.compute(s).stats.critDamagePct, 70, 1e-9); }
// 5b. Notes example: fire rune vs ice creature + Hemorrhage, 30% CP -> 242.5%
{ const s=bare(3); s.gear.mainhand={rarity:'L',focus:'Attack',runes:['ProcFire','ProcMassiveTime'],skillRune:'',magic:''}; s.extra.critPower=30; s.target.element='Ice'; check('Incinerate vs Ice + Hemorrhage + 30% CP', E.compute(s).stats.critDamagePct, 242.5, 1e-9); }
// 5c. Elemental vs own element 25%, neutral 50%
{ const s=bare(3); s.gear.mainhand={rarity:'R',focus:'Attack',runes:['ProcFire'],skillRune:'',magic:''}; s.target.element='Fire'; check('Incinerate vs Fire', E.compute(s).stats.critDamagePct, 25); s.target.element='Earth'; check('Incinerate vs Earth', E.compute(s).stats.critDamagePct, 50); }
// 5d. Magic/rare weapon ignores a second rune
{ const s=bare(3); s.gear.mainhand={rarity:'R',focus:'Attack',runes:['ProcMassive','ProcMassiveTime'],skillRune:'',magic:''}; check('rare weapon uses 1 rune', E.compute(s).crit.runes.length, 1); }
// 6. Gear rune stats
{ const s=bare(3); s.gear.offhand.runes=['CritChance','HealthPercent']; s.gear.boots.runes=['CritDamage']; const r=E.compute(s); check('CritChance rune -> 16.5%', r.stats.critReal, 0.165, 1e-12); check('HealthPercent rune', r.stats.hp, Math.round(68109*1.15)); check('CritDamage rune', r.stats.critPower, 0.10, 1e-12); }
// 7. DoTs: bleed 6% exp/tick; Artery Strike 5/5 adds +0.05 DoTDamage -> +1.5% -> 7.5%
{ const s=bare(3); s.talents='3'; const r=E.compute(s); const bleed=r.dots.find(d=>d.buff==='Bleeding'); check('bleed tick no talents', bleed.perTick, 2655*0.06, 1e-6); check('bleed stacks', bleed.maxStacks, 15); }
{ const r=E.compute(E.defaultState()); const bleed=r.dots.find(d=>d.buff==='Bleeding'); check('bleed % with 3x Artery Strike 5/5', +(bleed.basePct+bleed.talentPct).toFixed(4), 6+3*1.5, 1e-9); check('bleed stacks with 2x Deep Cuts 5/5', bleed.maxStacks, 25); }
// 8. Skill: Poison Strike r10 = 2 hits x 1.49 x Attack
{ const s=bare(3); const r=E.compute(s); const ps=r.skills[0].skills.find(x=>x.ability==='PoisonStrike'); check('Poison Strike direct', ps.direct, 2*1.49*3914, 1e-6); check('Poison Strike poison per stack total', ps.dot, 2655*0.60*5, 1e-6); }
console.log(ok+' checks passed');
