(function () {
	var soulthief = {
		"talents": [
			{"name":"Attack I","tier":[1,1],"description":"Increases attack.","parameter":"Attack","values":["8","24","40","56","81"],"stat":1,"icon":[3,1]},
			{"name":"Lesser Recovery","tier":[1,2],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Health I","tier":[1,3],"description":"Increases health.","parameter":"Health","values":["235","469","821","1173","1760"],"stat":3,"icon":[15,0]},
			{"name":"Concentrated Venom","tier":[2,1],"description":"Increases poison damage.","parameter":"Poison Damage","values":["7%","14%","21%","28%","35%"],"stat":4,"icon":[6,0]},
			{"name":"Expertise II","tier":[2,2],"description":"Increases expertise.","parameter":"Expertise","values":["8","25","42","59","84"],"stat":5,"icon":[0,1]},
			{"name":"Defense II","tier":[2,3],"description":"Increases defense.","parameter":"Defense","values":["3","8","14","20","28"],"stat":6,"icon":[6,1]},
			{"name":"Twisted Hex","tier":[3,1],"description":"Deal extra damage to bound targets.","no_add":true,"parameter":"Bonus Damage","values":["1%","2%","3%","5%","7%"],"stat":7,"icon":[17,2]},
			{"name":"Attack III","tier":[3,2],"description":"Increases attack.","parameter":"Attack","values":["9","28","46","65","93"],"stat":1,"icon":[3,1]},
			{"name":"Lesser Recovery","tier":[3,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Doom","tier":[4,1],"description":"Increases bind damage.","parameter":"Bind Damage","values":["2%","6%","12%","21%","34%"],"stat":8,"icon":[20,2]},
			{"name":"Attack IV","tier":[4,2],"description":"Increases attack.","parameter":"Attack","values":["10","29","49","68","97"],"stat":1,"icon":[3,1]},
			{"name":"Health IV","tier":[4,3],"description":"Increases health.","parameter":"Health","values":["279","558","977","1395","2093"],"stat":3,"icon":[15,0]},
			{"name":"Insidious Poison","tier":[5,1],"description":"Increases poison damage vs. bound targets.","parameter":"Poison vs Bound","values":["2%","6%","13%","23%","35%"],"stat":9,"icon":[19,2]},
			{"name":"Expertise V","tier":[5,2],"description":"Increases expertise.","parameter":"Expertise","values":["11","34","56","78","112"],"stat":5,"icon":[0,1]},
			{"name":"Defense V","tier":[5,3],"description":"Increases defense.","parameter":"Defense","values":["3","10","17","24","34"],"stat":6,"icon":[6,1]},
			{"name":"Wind Cloak","tier":[6,1],"description":"Gain bonus defense vs. projectiles.","parameter":"Defense","values":["1%","2%","3%","5%","7%"],"stat":10,"icon":[16,2]},
			{"name":"Tenacious Hex","tier":[6,2],"description":"Increases bind strength damage.","parameter":"Effect","values":["1%","2%","3%","4%","5%"],"stat":11,"icon":[18,2]},
			{"name":"Attack VI","tier":[6,3],"description":"Increases attack.","parameter":"Attack","values":["12","37","61","86","123"],"stat":1,"icon":[4,1]},
			{"name":"Concentrated Venom","tier":[7,1],"description":"Increases poison damage.","parameter":"Poison Damage","values":["7%","14%","21%","28%","35%"],"stat":4,"icon":[6,0]},
			{"name":"Expertise VII","tier":[7,2],"description":"Increases expertise.","parameter":"Expertise","values":["14","42","71","99","142"],"stat":5,"icon":[1,1]},
			{"name":"Health VII","tier":[7,3],"description":"Increases health.","parameter":"Health","values":["397","795","1391","1987","2980"],"stat":3,"icon":[16,0]},
			{"name":"Twisted Hex","tier":[8,1],"description":"Deal extra damage to bound targets.","no_add":true,"parameter":"Bonus Damage","values":["1%","2%","3%","5%","7%"],"stat":7,"icon":[17,2]},
			{"name":"Attack VIII","tier":[8,2],"description":"Increases attack.","parameter":"Attack","values":["16","45","78","109","155"],"stat":1,"icon":[4,1]},
			{"name":"Greater Recovery","tier":[8,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":2,"icon":[2,0]},
			{"name":"Insidious Poison","tier":[9,1],"description":"Increases poison damage vs. bound targets.","parameter":"Poison vs Bound","values":["2%","6%","13%","23%","35%"],"stat":9,"icon":[19,2]},
			{"name":"Doom","tier":[9,2],"description":"Increases bind damage.","parameter":"Bind Damage","values":["2%","6%","12%","21%","34%"],"stat":8,"icon":[20,2]},
			{"name":"Expertise IX","tier":[9,3],"description":"Increases expertise.","parameter":"Expertise","values":["18","54","90","125","179"],"stat":5,"icon":[1,1]},
			{"name":"Concentrated Venom","tier":[10,1],"description":"Increases poison damage.","parameter":"Poison Damage","values":["7%","14%","21%","28%","35%"],"stat":4,"icon":[6,0]},
			{"name":"Attack X","tier":[10,2],"description":"Increases attack.","parameter":"Attack","values":["20","59","98","138","197"],"stat":1,"icon":[4,1]},
			{"name":"Defense X","tier":[10,3],"description":"Increases defense.","parameter":"Defense","values":["7","20","33","46","66"],"stat":6,"icon":[7,1]},
			{"name":"Wind Cloak","tier":[11,1],"description":"Gain bonus defense vs. projectiles.","parameter":"Defense","values":["1%","2%","3%","5%","7%"],"stat":10,"icon":[16,2]},
			{"name":"Expertise XI","tier":[11,2],"description":"Increases expertise.","parameter":"Expertise","values":["23","68","113","158","226"],"stat":5,"icon":[2,1]},
			{"name":"Greater Recovery","tier":[11,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":2,"icon":[2,0]},
			{"name":"Twisted Hex","tier":[12,1],"description":"Deal extra damage to bound targets.","no_add":true,"parameter":"Bonus Damage","values":["1%","2%","3%","5%","7%"],"stat":7,"icon":[17,2]},
			{"name":"Health XII","tier":[12,2],"description":"Increases health.","parameter":"Health","values":["683","1366","2391","3416","5124"],"stat":3,"icon":[17,0]},
			{"name":"Defense XII","tier":[12,3],"description":"Increases defense.","parameter":"Defense","values":["8","25","41","58","83"],"stat":6,"icon":[8,1]},
			{"name":"Doom","tier":[13,1],"description":"Increases bind damage.","parameter":"Bind Damage","values":["2%","6%","12%","21%","34%"],"stat":8,"icon":[20,2]},
			{"name":"Attack XIII","tier":[13,2],"description":"Increases attack.","parameter":"Attack","values":["29","86","143","200","286"],"stat":1,"icon":[5,1]},
			{"name":"Master Recovery","tier":[13,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.5%","1.3%","2.4%","4.4%","7.5%"],"stat":2,"icon":[3,0]},
			{"name":"Heroism","tier":[14,1],"description":"Gain recovery for 5 seconds when you fall below 20% HP.","no_add":true,"parameter":["Recovery Bonus","Cooldown (seconds)"],"values":[["2%","5%","9%","14%","20%"],["30","30","30","25","20"]],"stat":12,"icon":[14,0]},
			{"name":"Wind Cloak","tier":[14,2],"description":"Gain bonus defense vs. projectiles.","parameter":"Defense","values":["1%","2%","3%","5%","7%"],"stat":10,"icon":[16,2]},
			{"name":"Expertise XIV","tier":[14,3],"description":"Increases expertise.","parameter":"Expertise","values":["31","94","157","220","315"],"stat":5,"icon":[2,1]}
		],
		"skills": [
			{"name":"Carnifex","description":"Deliver a devastating double strike that binds a single enemy."},
			{"name":"Soul Reaver","description":"Strike and drain health from an enemy while it lives. 5 sec duration."},
			{"name":"Ghost Blade","description":"Steal your foe's strength while it lives. 4 sec duration."}
		],
		"stats": [
			{"icon":[3,1],"parameter":"Attack","description":"Increases attack.","name":"Attack"},
			{"icon":[1,0],"parameter":"Recovery","description":"Increases recovery.","name":"Recovery"},
			{"icon":[15,0],"parameter":"Health","description":"Increases health.","name":"Health"},
			{"icon":[6,0],"parameter":"Poison Damage","description":"Increases poison damage.","name":"Concentrated Venom"},
			{"icon":[0,1],"parameter":"Expertise","description":"Increases expertise.","name":"Expertise"},
			{"icon":[6,1],"parameter":"Defense","description":"Increases defense.","name":"Defense"},
			{"icon":[17,2],"no_add":true,"parameter":"Bonus Damage","description":"Deal extra damage to bound targets.","name":"Twisted Hex"},
			{"icon":[20,2],"parameter":"Bind Damage","description":"Increases bind damage.","name":"Doom"},
			{"icon":[19,2],"parameter":"Poison vs Bound","description":"Increases poison damage vs. bound targets.","name":"Insidious Poison"},
			{"icon":[16,2],"parameter":"Defense","description":"Gain bonus defense vs. projectiles.","name":"Wind Cloak"},
			{"icon":[18,2],"parameter":"Effect","description":"Increases bind strength damage.","name":"Tenacious Hex"},
			{"icon":[14,0],"no_add":true,"parameter":["Recovery Bonus","Cooldown (seconds)"],"description":"Gain recovery for 5 seconds when you fall below 20% HP.","name":"Heroism"}
		]
	};

	window.DBCALC_TALENT_DATA = window.DBCALC_TALENT_DATA || {};
	window.DBCALC_TALENT_DATA.soulthief = soulthief;
}());