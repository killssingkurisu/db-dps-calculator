(function () {
	var sentinel = {
		"talents": [
			{"name":"Defense I","tier":[1,1],"description":"Increases defense.","parameter":"Defense","values":["3","8","13","19","27"],"stat":1,"icon":[6,1]},
			{"name":"Attack I","tier":[1,2],"description":"Increases attack.","parameter":"Attack","values":["8","24","40","56","81"],"stat":2,"icon":[3,1]},
			{"name":"Health I","tier":[1,3],"description":"Increases health.","parameter":"Health","values":["235","469","821","1173","1760"],"stat":3,"icon":[15,0]},
			{"name":"Heroism","tier":[2,1],"description":"Gain recovery for 5 seconds when you fall below 20% HP.","no_add":true,"parameter":["Recovery Bonus","Cooldown (seconds)"],"values":[["2%","5%","9%","14%","20%"],["30","30","30","25","20"]],"stat":4,"icon":[14,0]},
			{"name":"Expertise II","tier":[2,2],"description":"Increases expertise.","parameter":"Expertise","values":["8","25","42","59","84"],"stat":5,"icon":[0,1]},
			{"name":"Lesser Recovery","tier":[2,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":6,"icon":[1,0]},
			{"name":"Taunt","tier":[3,1],"description":"Increases hate generation.","parameter":"Hate","values":["10%","20%","35%","50%","75%"],"stat":7,"icon":[18,1]},
			{"name":"Defense III","tier":[3,2],"description":"Increases defense.","parameter":"Defense","values":["3","9","15","22","31"],"stat":1,"icon":[6,1]},
			{"name":"Health III","tier":[3,3],"description":"Increases health.","parameter":"Health","values":["267","534","935","1336","2004"],"stat":3,"icon":[15,0]},
			{"name":"Resilience","tier":[4,1],"description":"Reduce the effectiveness of debuffs that decrease your stats.","parameter":"Debuff Reduction","values":["1%","2%","4%","7%","10%"],"stat":8,"icon":[15,2]},
			{"name":"Expertise IV","tier":[4,2],"description":"Increases expertise.","parameter":"Expertise","values":["10","29","49","68","97"],"stat":5,"icon":[0,1]},
			{"name":"Lesser Recovery","tier":[4,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":6,"icon":[1,0]},
			{"name":"Blessed","tier":[5,1],"description":"Reduce the amount of damage you receive from damage over time effects.","parameter":"DoT Reduction","values":["1%","3%","6%","10%","15%"],"stat":9,"icon":[11,1]},
			{"name":"Defense V","tier":[5,2],"description":"Increases defense.","parameter":"Defense","values":["3","10","17","24","34"],"stat":1,"icon":[6,1]},
			{"name":"Attack V","tier":[5,3],"description":"Increases attack.","parameter":"Attack","values":["11","34","56","78","112"],"stat":2,"icon":[3,1]},
			{"name":"Fervor","tier":[6,1],"description":"Add a percent of your expertise to your max HP.","parameter":"HP (% Expertise)","values":["3%","8%","16%","28%","45%"],"stat":10,"icon":[22,0]},
			{"name":"Expertise VI","tier":[6,2],"description":"Increases expertise.","parameter":"Expertise","values":["12","37","61","86","123"],"stat":5,"icon":[1,1]},
			{"name":"Health VI","tier":[6,3],"description":"Increases health.","parameter":"Health","values":["348","695","1217","1738","2608"],"stat":3,"icon":[16,0]},
			{"name":"Vigor","tier":[7,1],"description":"Heal for a percent of your expertise whenever you use a combat ability.","no_add":true,"parameter":"Healing (% Expertise)","values":["2%","5%","11%","20%","30%"],"stat":11,"icon":[20,1]},
			{"name":"Attack VII","tier":[7,2],"description":"Increases attack.","parameter":"Attack","values":["14","42","71","99","142"],"stat":2,"icon":[4,1]},
			{"name":"Lesser Recovery","tier":[7,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":6,"icon":[1,0]},
			{"name":"Dominate","tier":[8,1],"description":"Gain a critical chance bonus vs. staggered and stunned targets.","no_add":true,"parameter":"Critical Chance Bonus","values":["0.15%","0.3%","0.45%","0.75%","1.2%"],"stat":12,"icon":[23,1]},
			{"name":"Expertise VIII","tier":[8,2],"description":"Increases expertise.","parameter":"Expertise","values":["16","45","78","109","155"],"stat":5,"icon":[1,1]},
			{"name":"Health VIII","tier":[8,3],"description":"Increases health.","parameter":"Health","values":["434","869","1521","2172","3259"],"stat":3,"icon":[16,0]},
			{"name":"Rapid Recovery","tier":[9,1],"description":"Increases tenacity.","parameter":"Tenacity","values":["1%","2%","4%","7%","10%"],"stat":13,"icon":[4,0]},
			{"name":"Defense IX","tier":[9,2],"description":"Increases defense.","parameter":"Defense","values":["6","18","30","42","60"],"stat":1,"icon":[7,1]},
			{"name":"Greater Recovery","tier":[9,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":6,"icon":[2,0]},
			{"name":"Conviction","tier":[10,1],"description":"Add a percent of your expertise to your defense.","parameter":"Defense (% Expertise)","values":["0.1%","0.3%","0.6%","1%","1.5%"],"stat":14,"icon":[12,1]},
			{"name":"Attack X","tier":[10,2],"description":"Increases attack.","parameter":"Attack","values":["20","59","98","138","197"],"stat":2,"icon":[4,1]},
			{"name":"Health X","tier":[10,3],"description":"Increases health.","parameter":"Health","values":["520","1040","1821","2601","3902"],"stat":3,"icon":[16,0]},
			{"name":"Resilience","tier":[11,1],"description":"Reduce the effectiveness of debuffs that decrease your stats.","parameter":"Debuff Reduction","values":["1%","2%","4%","7%","10%"],"stat":8,"icon":[15,2]},
			{"name":"Expertise XI","tier":[11,2],"description":"Increases expertise.","parameter":"Expertise","values":["23","68","113","158","226"],"stat":5,"icon":[2,1]},
			{"name":"Defense XII","tier":[11,3],"description":"Increases defense.","parameter":"Defense","values":["8","25","41","58","83"],"stat":1,"icon":[8,1]},
			{"name":"Dominate","tier":[12,1],"description":"Gain a critical chance bonus vs. staggered and stunned targets.","no_add":true,"parameter":"Critical Chance Bonus","values":["0.15%","0.3%","0.45%","0.75%","1.2%"],"stat":12,"icon":[23,1]},
			{"name":"Fervor","tier":[12,2],"description":"Add a percent of your expertise to your max HP.","parameter":"HP (% Expertise)","values":["3%","8%","16%","28%","45%"],"stat":10,"icon":[22,0]},
			{"name":"Health XII","tier":[12,3],"description":"Increases health.","parameter":"Health","values":["683","1366","2391","3416","5124"],"stat":3,"icon":[17,0]},
			{"name":"Defense XIII","tier":[13,1],"description":"Increases defense.","parameter":"Defense","values":["10","29","48","67","95"],"stat":1,"icon":[8,1]},
			{"name":"Greater Recovery","tier":[13,2],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":6,"icon":[2,0]},
			{"name":"Expertise XIII","tier":[13,3],"description":"Increases expertise.","parameter":"Expertise","values":["29","86","143","200","286"],"stat":5,"icon":[2,1]},
			{"name":"Sentinel Armor","tier":[14,1],"description":"Gain bonus defense while Sentinel Form is not on cooldown.","no_add":true,"parameter":"Defense","values":["1%","2%","3%","4%","5%"],"stat":15,"icon":[10,2]},
			{"name":"Conviction","tier":[14,2],"description":"Add a percent of your expertise to your defense.","parameter":"Defense (% Expertise)","values":["0.1%","0.3%","0.6%","1%","1.5%"],"stat":14,"icon":[12,1]},
			{"name":"Master Recovery","tier":[14,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.5%","1.3%","2.4%","4.4%","7.5%"],"stat":6,"icon":[3,0]}
		],
		"skills": [
			{"name":"Defiance","description":"Taunt foes while slowing them and reducing their damage."},
			{"name":"Unstable Barrier","description":"Gain a force field with temporary HP. Explodes when depleted or activated."},
			{"name":"Sentinel Form","description":"Transform into a powerful Battle Avatar."}
		],
		"stats": [
			{"icon":[6,1],"parameter":"Defense","description":"Increases defense.","name":"Defense"},
			{"icon":[3,1],"parameter":"Attack","description":"Increases attack.","name":"Attack"},
			{"icon":[15,0],"parameter":"Health","description":"Increases health.","name":"Health"},
			{"icon":[14,0],"no_add":true,"parameter":["Recovery Bonus","Cooldown (seconds)"],"description":"Gain recovery for 5 seconds when you fall below 20% HP.","name":"Heroism"},
			{"icon":[0,1],"parameter":"Expertise","description":"Increases expertise.","name":"Expertise"},
			{"icon":[1,0],"parameter":"Recovery","description":"Increases recovery.","name":"Recovery"},
			{"icon":[18,1],"parameter":"Hate","description":"Increases hate generation.","name":"Taunt"},
			{"icon":[15,2],"parameter":"Debuff Reduction","description":"Reduce the effectiveness of debuffs that decrease your stats.","name":"Resilience"},
			{"icon":[11,1],"parameter":"DoT Reduction","description":"Reduce the amount of damage you receive from damage over time effects.","name":"Blessed"},
			{"icon":[22,0],"parameter":"HP (% Expertise)","description":"Add a percent of your expertise to your max HP.","name":"Fervor"},
			{"icon":[20,1],"no_add":true,"parameter":"Healing (% Expertise)","description":"Heal for a percent of your expertise whenever you use a combat ability.","name":"Vigor"},
			{"icon":[23,1],"no_add":true,"parameter":"Critical Chance Bonus","description":"Gain a critical chance bonus vs. staggered and stunned targets.","name":"Dominate"},
			{"icon":[4,0],"parameter":"Tenacity","description":"Increases tenacity.","name":"Rapid Recovery"},
			{"icon":[12,1],"parameter":"Defense (% Expertise)","description":"Add a percent of your expertise to your defense.","name":"Conviction"},
			{"icon":[10,2],"no_add":true,"parameter":"Defense","description":"Gain bonus defense while Sentinel Form is not on cooldown.","name":"Sentinel Armor"}
		]
	};

	window.DBCALC_TALENT_DATA = window.DBCALC_TALENT_DATA || {};
	window.DBCALC_TALENT_DATA.sentinel = sentinel;
}());