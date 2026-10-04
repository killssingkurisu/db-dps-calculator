(function () {
	var justicar = {
		"talents": [
			{"name":"Attack I","tier":[1,1],"description":"Increases attack.","parameter":"Attack","values":["8","24","40","56","81"],"stat":1,"icon":[3,1]},
			{"name":"Lesser Recovery","tier":[1,2],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Defense I","tier":[1,3],"description":"Increases defense.","parameter":"Defense","values":["3","8","13","19","27"],"stat":3,"icon":[6,1]},
			{"name":"Immolation","tier":[2,1],"description":"Increases Ignite Damage.","parameter":"Ignite Damage","values":["2%","4%","6%","10%","16%"],"stat":4,"icon":[12,0]},
			{"name":"Expertise II","tier":[2,2],"description":"Increases expertise.","parameter":"Expertise","values":["8","25","42","59","84"],"stat":5,"icon":[0,1]},
			{"name":"Health II","tier":[2,3],"description":"Increases health.","parameter":"Health","values":["245","490","857","1225","1837"],"stat":6,"icon":[15,0]},
			{"name":"Acid Edge","tier":[3,1],"description":"Increases effectiveness of Armor Bane and Armor Break.","parameter":"Effect","values":["2%","4%","6%","8%","10%"],"stat":7,"icon":[10,1]},
			{"name":"Attack III","tier":[3,2],"description":"Increases attack.","parameter":"Attack","values":["9","28","46","65","93"],"stat":1,"icon":[3,1]},
			{"name":"Lesser Recovery","tier":[3,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Volatile","tier":[4,1],"description":"Gain a Critical Chance Bonus vs. Ignited Targets.","no_add":true,"parameter":"Critical Chance Bonus","values":["2%","4%","6%","8%","10%"],"stat":8,"icon":[22,1]},
			{"name":"Expertise IV","tier":[4,2],"description":"Increases expertise.","parameter":"Expertise","values":["10","29","49","68","97"],"stat":5,"icon":[0,1]},
			{"name":"Defense IV","tier":[4,3],"description":"Increases defense.","parameter":"Defense","values":["3","10","16","23","32"],"stat":3,"icon":[6,1]},
			{"name":"Corrosive Strikes","tier":[5,1],"description":"Increases Armor Bane and Armor Break durations.","parameter":"Duration (seconds)","values":["0.1","0.3","0.6","1.1","1.8"],"stat":9,"icon":[9,1]},
			{"name":"Attack V","tier":[5,2],"description":"Increases attack.","parameter":"Attack","values":["11","34","56","78","112"],"stat":1,"icon":[3,1]},
			{"name":"Health V","tier":[5,3],"description":"Increases health.","parameter":"Health","values":["318","637","1114","1591","2387"],"stat":6,"icon":[16,0]},
			{"name":"Immolation","tier":[6,1],"description":"Increases Ignite Damage.","parameter":"Ignite Damage","values":["2%","4%","6%","10%","16%"],"stat":4,"icon":[12,0]},
			{"name":"Expertise VI","tier":[6,2],"description":"Increases expertise.","parameter":"Expertise","values":["12","37","61","86","123"],"stat":5,"icon":[1,1]},
			{"name":"Defense VI","tier":[6,3],"description":"Increases defense.","parameter":"Defense","values":["4","12","21","29","41"],"stat":3,"icon":[7,1]},
			{"name":"Heavy Blows","tier":[7,1],"description":"Increases Heavy Blow Critical Effect.","parameter":"Heavy Blow Damage","values":["1%","2%","4%","7%","10%"],"stat":10,"icon":[21,1]},
			{"name":"Lesser Recovery","tier":[7,2],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Attack VII","tier":[7,3],"description":"Increases attack.","parameter":"Attack","values":["14","42","71","99","142"],"stat":1,"icon":[4,1]},
			{"name":"Immolation","tier":[8,1],"description":"Increases Ignite Damage.","parameter":"Ignite Damage","values":["2%","4%","6%","10%","16%"],"stat":4,"icon":[12,0]},
			{"name":"Expertise VIII","tier":[8,2],"description":"Increases expertise.","parameter":"Expertise","values":["16","45","78","109","155"],"stat":5,"icon":[1,1]},
			{"name":"Defense VIII","tier":[8,3],"description":"Increases defense.","parameter":"Defense","values":["5","16","26","36","52"],"stat":3,"icon":[7,1]},
			{"name":"Heavy Blows","tier":[9,1],"description":"Increases Heavy Blow Critical Effect.","parameter":"Heavy Blow Damage","values":["1%","2%","4%","7%","10%"],"stat":10,"icon":[21,1]},
			{"name":"Attack IX","tier":[9,2],"description":"Increases attack.","parameter":"Attack","values":["18","54","90","125","179"],"stat":1,"icon":[4,1]},
			{"name":"Greater Recovery","tier":[9,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":2,"icon":[2,0]},
			{"name":"Fury","tier":[10,1],"description":"Gain a Damage Bonus for 3 seconds when you reduce a target to 0 HP. 10 second cooldown.","no_add":true,"parameter":"Damage Bonus","values":["1%","2%","4%","6%","10%"],"stat":11,"icon":[19,0]},
			{"name":"Volatile","tier":[10,2],"description":"Gain a Critical Chance Bonus vs. Ignited Targets.","no_add":true,"parameter":"Critical Chance Bonus","values":["2%","4%","6%","8%","10%"],"stat":8,"icon":[22,1]},
			{"name":"Expertise X","tier":[10,3],"description":"Increases expertise.","parameter":"Expertise","values":["20","59","98","138","197"],"stat":5,"icon":[1,1]},
			{"name":"Fire Shield","tier":[11,1],"description":"Damage nearby foes when melee attacked by an Ignited enemy.","no_add":true,"parameter":"Cooldown (seconds)","values":["15","13","10","8","6"],"stat":12,"icon":[21,0]},
			{"name":"Defense XI","tier":[11,2],"description":"Increases defense.","parameter":"Defense","values":["8","23","38","53","76"],"stat":3,"icon":[8,1]},
			{"name":"Health XI","tier":[11,3],"description":"Increases health.","parameter":"Health","values":["624","1247","2183","3118","4678"],"stat":6,"icon":[17,0]},
			{"name":"Volatile","tier":[12,1],"description":"Gain a Critical Chance Bonus vs. Ignited Targets.","no_add":true,"parameter":"Critical Chance Bonus","values":["2%","4%","6%","8%","10%"],"stat":8,"icon":[22,1]},
			{"name":"Attack XII","tier":[12,2],"description":"Increases attack.","parameter":"Attack","values":["25","75","124","174","249"],"stat":1,"icon":[5,1]},
			{"name":"Greater Recovery","tier":[12,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":2,"icon":[2,0]},
			{"name":"Zeal","tier":[13,1],"description":"Add a percent of your Expertise to your Attack.","parameter":"Attack (% Expertise)","values":["0.5%","1%","2%","3%","5%"],"stat":13,"icon":[19,1]},
			{"name":"Expertise XIII","tier":[13,2],"description":"Increases expertise.","parameter":"Expertise","values":["29","86","143","200","286"],"stat":5,"icon":[2,1]},
			{"name":"Health XIII","tier":[13,3],"description":"Increases health.","parameter":"Health","values":["784","1567","2743","3918","5877"],"stat":6,"icon":[17,0]},
			{"name":"Pain Eater","tier":[14,1],"description":"Gain an Attack Speed bonus for 5 seconds when you fall below 20% HP. 15 second cooldown.","no_add":true,"parameter":"Attack Speed Bonus","values":["1%","2%","4%","7%","10%"],"stat":14,"icon":[8,2]},
			{"name":"Heavy Blows","tier":[14,2],"description":"Increases Heavy Blow Critical Effect.","parameter":"Heavy Blow Damage","values":["1%","2%","4%","7%","10%"],"stat":10,"icon":[21,1]},
			{"name":"Zeal","tier":[14,3],"description":"Add a percent of your Expertise to your Attack.","parameter":"Attack (% Expertise)","values":["0.5%","1%","2%","3%","5%"],"stat":13,"icon":[19,1]}
		],
		"skills": [
			{"name":"Meteor Smash","description":"Leaps to target dealing damage at take off and impact. Deals extra damage to Ignited targets."},
			{"name":"Lightning Bomb","description":"Turns a foe into a Lightning Bomb causing them to explode when killed. Spreads a similar effect to damaged enemies."},
			{"name":"Berserker","description":"Gain increased Damage and Health regen at the cost of reduced Defense."}
		],
		"stats": [
			{"icon":[3,1],"parameter":"Attack","description":"Increases attack.","name":"Attack"},
			{"icon":[1,0],"parameter":"Recovery","description":"Increases recovery.","name":"Recovery"},
			{"icon":[6,1],"parameter":"Defense","description":"Increases defense.","name":"Defense"},
			{"icon":[12,0],"parameter":"Ignite Damage","description":"Increases Ignite Damage.","name":"Immolation"},
			{"icon":[0,1],"parameter":"Expertise","description":"Increases expertise.","name":"Expertise"},
			{"icon":[15,0],"parameter":"Health","description":"Increases health.","name":"Health"},
			{"icon":[10,1],"parameter":"Effect","description":"Increases effectiveness of Armor Bane and Armor Break.","name":"Acid Edge"},
			{"icon":[22,1],"no_add":true,"parameter":"Critical Chance Bonus","description":"Gain a Critical Chance Bonus vs. Ignited Targets.","name":"Volatile"},
			{"icon":[9,1],"parameter":"Duration (seconds)","description":"Increases Armor Bane and Armor Break durations.","name":"Corrosive Strikes"},
			{"icon":[21,1],"parameter":"Heavy Blow Damage","description":"Increases Heavy Blow Critical Effect.","name":"Heavy Blows"},
			{"icon":[19,0],"no_add":true,"parameter":"Damage Bonus","description":"Gain a Damage Bonus for 3 seconds when you reduce a target to 0 HP. 10 second cooldown.","name":"Fury"},
			{"icon":[21,0],"no_add":true,"parameter":"Cooldown (seconds)","description":"Damage nearby foes when melee attacked by an Ignited enemy.","name":"Fire Shield"},
			{"icon":[19,1],"parameter":"Attack (% Expertise)","description":"Add a percent of your Expertise to your Attack.","name":"Zeal"},
			{"icon":[8,2],"no_add":true,"parameter":"Attack Speed Bonus","description":"Gain an Attack Speed bonus for 5 seconds when you fall below 20% HP. 15 second cooldown.","name":"Pain Eater"}
		]
	};

	window.DBCALC_TALENT_DATA = window.DBCALC_TALENT_DATA || {};
	window.DBCALC_TALENT_DATA.justicar = justicar;
}());