/*
 * Preset combos for the DPS Calculator, three per discipline. Each one opens with the
 * skills that debuff the target (Armor Bane, Armor Breaker, Scorch, curses, stuns,
 * binds) or buff you, then spends the hardest-hitting and DoT skills while those
 * debuffs are up. Only one skill per hotbar slot 1-3 can be equipped, so every combo
 * uses at most one skill from each of those slots. "basic" is one basic attack.
 * Skills still on cooldown are skipped when the loop comes back round to them.
 */
window.DBB_COMBOS = {
	frostbringer: [
		{ id: "fb-chill", name: "Chilblains stack",
			why: "Frozen Ward and Hail Storm stack Chilblains, Permafrost Clone adds four more, then Frigid Comet hits into a target that is already ticking.",
			steps: ["FrozenWard", "IceStorm", "PermafrostClone", "FrigidComet"] },
		{ id: "fb-shatter", name: "Freeze and shatter",
			why: "Ice Lance freezes on every strike, so Piercing Cold lowers Defense for the strikes that follow; Glacial Spear and Frigid Comet land next.",
			steps: ["IceSpike", "GlacialSpear", "FrigidComet", "PermafrostClone"] },
		{ id: "fb-nova", name: "Chill and nova",
			why: "Arctic Blast chills and weakens first, then Ice Nova's seven rings and Glacial Spear do the damage; the clone keeps Chilblains rolling.",
			steps: ["FrostBlast", "IceNova", "GlacialSpear", "PermafrostClone"] }
	],
	flameseer: [
		{ id: "fs-scorch", name: "Scorch, then burn",
			why: "Iridescent Burst and Conflagration stack Scorch (+1% damage each) and Burn before Molten Fist and Wildfire hit.",
			steps: ["IridescentBurst", "FlameStrike", "MoltenFist", "WildFire"] },
		{ id: "fs-dragon", name: "Draconic Soul burst",
			why: "Draconic Soul gives +30% Attack for 15 s; Iridescent Burst scorches, then Flame Wave, Molten Fist and Wildfire land inside the buff.",
			steps: ["SummonDragonSoul", "IridescentBurst", "FirePillar", "MoltenFist", "WildFire"] },
		{ id: "fs-pyro", name: "Pyromania flamethrower",
			why: "Draconic Soul and Iridescent Burst first, then Pyromania turns basic attacks into a flamethrower that Burns and Scorches on every tick.",
			steps: ["SummonDragonSoul", "IridescentBurst", "Pyromania", "basic", "basic", "basic", "basic", "basic", "basic", "WildFire"] }
	],
	necromancer: [
		{ id: "nc-curse", name: "Curse, then burst",
			why: "Spectral Grasp curses, adds two Armor Bane and poisons; Desecrate and Wail of the Banshee hit the cursed target (Crippling Curse crit bonus).",
			steps: ["SpectralGrasp", "Desecrate", "BansheeWail"] },
		{ id: "nc-mark", name: "Death Mark",
			why: "Death Mark is channelled: it curses, lowers Defense 15% and poisons while you hold it. Spectral Grasp and Desecrate follow before the poison drops.",
			steps: ["DeathMark", "SpectralGrasp", "Desecrate"] },
		{ id: "nc-thirst", name: "Lifethirst opener",
			why: "Lifethirst gives +5% Attack and Expertise for 5 s, then Spectral Grasp curses and Wail of the Banshee hits inside the buff.",
			steps: ["Lifethirst", "SpectralGrasp", "BansheeWail"] }
	],
	viperblade: [
		{ id: "vb-break", name: "Armor break opener",
			why: "Armor Breaker (−50% Defense) and Withering Impact (two Armor Bane) go first, then Shadow Rend and Mist Walk stack Bleed and the master skills cash in.",
			steps: ["ReduceArmor", "WitherStrike", "VitalStrike", "MistWalk", "SeekingBlades", "ShadowBlade"] },
		{ id: "vb-venom", name: "Bleed, then poison",
			why: "Shadow Rend puts Bleed up first so Poison Strike and the Decoy's poison get Contact Poison's bonus; Charon's Blades and Mist Walk refresh the Bleed.",
			steps: ["VitalStrike", "PoisonStrike", "Decoy", "SeekingBlades", "MistWalk"] },
		{ id: "vb-hawk", name: "Hawk Strike burst",
			why: "Withering Impact adds Armor Bane and Bleed, Shadow Rend stacks Bleed, then Hawk Strike's single big hit and the master skills land on the debuffed target.",
			steps: ["WitherStrike", "VitalStrike", "HawkStrike", "ShadowBlade", "SeekingBlades", "MistWalk"] }
	],
	shadowstalker: [
		{ id: "ss-cripple", name: "Cripple and pounce",
			why: "Midnight Shroud for a stealth opener, then Dark Chi and Scorpion's Sting stack Armor Bane, Bind and Cripple so Pounce applies; Shadow Step breaks armor before Black Miasma.",
			steps: ["ShadowArmor", "DarkChi", "CrippleStrike", "ShadowStep", "ShadowTendrilDash"] },
		{ id: "ss-stealth", name: "Stealth burst",
			why: "Heart Seeker opens from stealth with Opportunist's crit bonus, Shadow Step breaks armor, then Black Miasma and Black Storm follow.",
			steps: ["ShadowArmor", "HeartSeeker", "ShadowStep", "ShadowTendrilDash", "BlackStorm"] },
		{ id: "ss-heavy", name: "Heavy hitters",
			why: "Stealth first, then Hawk Strike and Heart Seeker, the two biggest single hits, followed by Shadow Step's armor break and Black Miasma.",
			steps: ["ShadowArmor", "HawkStrike", "HeartSeeker", "ShadowStep", "ShadowTendrilDash"] }
	],
	soulthief: [
		{ id: "st-bind", name: "Bind, then poison",
			why: "Chaos Wave grants +30% Expertise and binds, Hex Blade binds again, so Necrotic Surge's poison gets Insidious Poison and Soul Reaver's DoT is boosted.",
			steps: ["ChaosArmor", "FatiguingStrike", "PoisonLance", "SoulReaver", "SoulShatter"] },
		{ id: "st-ghost", name: "Ghost Blade burst",
			why: "Ghost Blade's hit grants +35% Attack for 6 s; Armor Breaker follows, then Butcher's Boon, Hex Blade and Carnifex hit inside the buff.",
			steps: ["GhostBlade", "ReduceArmor", "PainBender", "FatiguingStrike", "SoulShatter"] },
		{ id: "st-hybrid", name: "Expertise and Attack",
			why: "Chaos Wave and Hex Blade bind with +30% Expertise for Soul Reaver, then Ghost Blade's Attack buff covers Necrotic Surge and Carnifex.",
			steps: ["ChaosArmor", "FatiguingStrike", "SoulReaver", "GhostBlade", "PoisonLance", "SoulShatter"] }
	],
	sentinel: [
		{ id: "se-stun", name: "Stun, then cleave",
			why: "Shield Stun stuns (Dominate's bonus) and Ignites, Cleave lands on the stunned target, Shockwave staggers to keep Dominate up, and Defiance follows.",
			steps: ["ShieldStun", "Cleave", "Shockwave", "Defiance"] },
		{ id: "se-jugg", name: "Juggernaut stagger",
			why: "Juggernaut staggers and cripples on every hit of the charge, so Cleave and Jump Slam get Dominate's bonus; Defiance on cooldown.",
			steps: ["Juggernaut", "Cleave", "JumpSlam", "Defiance"] },
		{ id: "se-form", name: "Sentinel Form",
			why: "Sentinel Form (+10% damage) turns basic attacks into heavy punches that Attack Speed speeds up; Shield Stun keeps the target stunned for Dominate.",
			steps: ["SentinelForm", "ShieldStun", "basic", "basic", "basic", "Defiance", "basic", "basic", "basic"] }
	],
	justicar: [
		{ id: "ju-cleave", name: "Harm and Cleaving Blows",
			why: "Harm stacks Armor Bane and Ignite on every pulse, Flame Axe adds Ignite, then Cleaving Blows makes basic attacks hit twice and Ignite.",
			steps: ["Harm", "FlameAxe", "CleavingBlows", "basic", "basic", "basic", "basic", "LeapStrike"] },
		{ id: "ju-berserk", name: "Berserker burst",
			why: "Berserker gives +60% Attack for 7 s; Harm debuffs first, then Furious Assault, Jump Slam and Meteor Smash land inside the buff.",
			steps: ["Berserker", "Harm", "FuriousAssault", "JumpSlam", "LeapStrike"] },
		{ id: "ju-storm", name: "Harm and lightning",
			why: "Harm's Armor Bane and Ignite (Volatile crit bonus) go first, then Lightning Bomb, Furious Assault, Lightning Storm and Meteor Smash.",
			steps: ["Harm", "LightningBomb", "FuriousAssault", "LightningStorm", "LeapStrike"] }
	],
	templar: [
		{ id: "te-penance", name: "Penance first",
			why: "Penance lowers Defense 15% for 4 s, then Celestial Lance (with Holy Fire) and Skewer (Ignite, Armor Bane) hit the weakened target.",
			steps: ["Penance", "CelestialLance", "Skewer"] },
		{ id: "te-reckon", name: "Hallowed Reckoning",
			why: "Hallowed Reckoning ticks four times and adds Holy Fire each tick from rank 5; Celestial Lance adds more Holy Fire and Smash follows.",
			steps: ["FountainOfLife", "CelestialLance", "Smash"] },
		{ id: "te-aura", name: "Empyrean Aura burst",
			why: "Empyrean Aura gives +33% Attack and Expertise for about 5 s; Penance lowers Defense, then Celestial Lance and Cleave land inside both.",
			steps: ["LeoneanAura", "Penance", "CelestialLance", "Cleave"] }
	]
};
