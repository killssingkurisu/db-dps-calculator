(function () {
	var templar = {
		"talents": [
			{"name":"Expertise I","tier":[1,1],"description":"Increases expertise.","parameter":"Expertise","values":["8","24","40","56","81"],"stat":1,"icon":[0,1]},
			{"name":"Defense I","tier":[1,2],"description":"Increases defense.","parameter":"Defense","values":["3","8","13","19","27"],"stat":2,"icon":[6,1]},
			{"name":"Lesser Recovery","tier":[1,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":3,"icon":[1,0]},
			{"name":"Daybreak","tier":[2,1],"description":"Increases Blinded Duration.","parameter":"Duration (seconds)","values":["0.1","0.25","0.5","0.75","1"],"stat":4,"icon":[2,3]},
			{"name":"Attack II","tier":[2,2],"description":"Increases attack.","parameter":"Attack","values":["8","25","42","59","84"],"stat":5,"icon":[3,1]},
			{"name":"Health II","tier":[2,3],"description":"Increases health.","parameter":"Health","values":["245","490","857","1225","1837"],"stat":6,"icon":[15,0]},
			{"name":"Blinding Light","tier":[3,1],"description":"Increases Blinded Miss Chance.","parameter":"Miss Chance","values":["2%","4%","6%","8%","10%"],"stat":7,"icon":[6,3]},
			{"name":"Expertise III","tier":[3,2],"description":"Increases expertise.","parameter":"Expertise","values":["9","28","46","65","93"],"stat":1,"icon":[0,1]},
			{"name":"Lesser Recovery","tier":[3,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":3,"icon":[1,0]},
			{"name":"Lesser Recovery","tier":[4,1],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":3,"icon":[1,0]},
			{"name":"Attack IV","tier":[4,2],"description":"Increases attack.","parameter":"Attack","values":["10","29","49","68","97"],"stat":5,"icon":[3,1]},
			{"name":"Defense IV","tier":[4,3],"description":"Increases defense.","parameter":"Defense","values":["3","10","16","23","32"],"stat":2,"icon":[6,1]},
			{"name":"Clutch Heal","tier":[5,1],"description":"Increased Healing on targets with less than 20% Health.","no_add":true,"parameter":"Healing Boost","values":["2%","4%","6%","8%","10%"],"stat":8,"icon":[3,3]},
			{"name":"Expertise V","tier":[5,2],"description":"Increases expertise.","parameter":"Expertise","values":["11","34","56","78","112"],"stat":1,"icon":[0,1]},
			{"name":"Health V","tier":[5,3],"description":"Increases health.","parameter":"Health","values":["318","637","1114","1591","2387"],"stat":6,"icon":[16,0]},
			{"name":"Smiting Flames","tier":[6,1],"description":"Increases Holy Fire damage.","parameter":"Holy Fire Damage","values":["3%","5%","10%","13%","15%"],"stat":9,"icon":[4,3]},
			{"name":"Attack VI","tier":[6,2],"description":"Increases attack.","parameter":"Attack","values":["12","37","61","86","123"],"stat":5,"icon":[4,1]},
			{"name":"Lesser Recovery","tier":[6,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":3,"icon":[1,0]},
			{"name":"Blinding Light","tier":[7,1],"description":"Increases Blinded Miss Chance.","parameter":"Miss Chance","values":["2%","4%","6%","8%","10%"],"stat":7,"icon":[6,3]},
			{"name":"Expertise VII","tier":[7,2],"description":"Increases expertise.","parameter":"Expertise","values":["14","42","71","99","142"],"stat":1,"icon":[1,1]},
			{"name":"Defense VII","tier":[7,3],"description":"Increases defense.","parameter":"Defense","values":["5","14","24","33","47"],"stat":2,"icon":[7,1]},
			{"name":"Crusading Flames","tier":[8,1],"description":"Increases the maximum number of Holy Fire stacks.","parameter":"Holy Fire Stacks","values":["1","2","3","4","5"],"stat":10,"icon":[4,0]},
			{"name":"Health VIII","tier":[8,2],"description":"Increases health.","parameter":"Health","values":["434","869","1521","2172","3259"],"stat":6,"icon":[16,0]},
			{"name":"Greater Recovery","tier":[8,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":3,"icon":[2,0]},
			{"name":"Daybreak","tier":[9,1],"description":"Increases Blinded Duration.","parameter":"Duration (seconds)","values":["0.1","0.25","0.5","0.75","1"],"stat":4,"icon":[2,3]},
			{"name":"Expertise IX","tier":[9,2],"description":"Increases expertise.","parameter":"Expertise","values":["18","54","90","125","179"],"stat":1,"icon":[1,1]},
			{"name":"Defense IX","tier":[9,3],"description":"Increases defense.","parameter":"Defense","values":["6","18","30","42","60"],"stat":2,"icon":[7,1]},
			{"name":"Greater Recovery","tier":[10,1],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":3,"icon":[2,0]},
			{"name":"Clutch Heal","tier":[10,2],"description":"Increased Healing on targets with less than 20% Health.","no_add":true,"parameter":"Healing Boost","values":["2%","4%","6%","8%","10%"],"stat":8,"icon":[3,3]},
			{"name":"Attack X","tier":[10,3],"description":"Increases attack.","parameter":"Attack","values":["20","59","98","138","197"],"stat":5,"icon":[4,1]},
			{"name":"Smiting Flames","tier":[11,1],"description":"Increases Holy Fire damage.","parameter":"Holy Fire Damage","values":["3%","5%","10%","13%","15%"],"stat":9,"icon":[4,3]},
			{"name":"Expertise XI","tier":[11,2],"description":"Increases expertise.","parameter":"Expertise","values":["23","68","113","158","226"],"stat":1,"icon":[2,1]},
			{"name":"Greater Recovery","tier":[11,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":3,"icon":[2,0]},
			{"name":"Sanctify","tier":[12,1],"description":"Add a percent of your Expertise to your Defense.","parameter":"Defense (% Expertise)","values":["1%","2%","3%","4%","5%"],"stat":11,"icon":[5,3]},
			{"name":"Blinding Light","tier":[12,2],"description":"Increases Blinded Miss Chance.","parameter":"Miss Chance","values":["2%","4%","6%","8%","10%"],"stat":7,"icon":[6,3]},
			{"name":"Attack XII","tier":[12,3],"description":"Increases attack.","parameter":"Attack","values":["25","75","124","174","249"],"stat":5,"icon":[5,1]},
			{"name":"Daybreak","tier":[13,1],"description":"Increases Blinded Duration.","parameter":"Duration (seconds)","values":["0.1","0.25","0.5","0.75","1"],"stat":4,"icon":[2,3]},
			{"name":"Defense XIII","tier":[13,2],"description":"Increases defense.","parameter":"Defense","values":["10","29","48","67","95"],"stat":2,"icon":[8,1]},
			{"name":"Master Recovery","tier":[13,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.5%","1.3%","2.4%","4.4%","7.5%"],"stat":3,"icon":[3,0]},
			{"name":"Sanctify","tier":[14,1],"description":"Add a percent of your Expertise to your Defense.","parameter":"Defense (% Expertise)","values":["1%","2%","3%","4%","5%"],"stat":11,"icon":[5,3]},
			{"name":"Clutch Heal","tier":[14,2],"description":"Increased Healing on targets with less than 20% Health.","no_add":true,"parameter":"Healing Boost","values":["2%","4%","6%","8%","10%"],"stat":8,"icon":[3,3]},
			{"name":"Expertise XIV","tier":[14,3],"description":"Increases expertise.","parameter":"Expertise","values":["31","94","157","220","315"],"stat":1,"icon":[2,1]}
		],
		"skills": [
			{"name":"Sanctum","description":"Heals allies in an area and Blinds foes."},
			{"name":"Sacred Light","description":"Heal and Cleanse your party, making them temporarily immune to negative conditions."},
			{"name":"Empyrean Aura","description":"For 5 seconds, create an aura that grants nearby Allies a 15% Attack and Expertise boost."}
		],
		"stats": [
			{"icon":[0,1],"parameter":"Expertise","description":"Increases expertise.","name":"Expertise"},
			{"icon":[6,1],"parameter":"Defense","description":"Increases defense.","name":"Defense"},
			{"icon":[1,0],"parameter":"Recovery","description":"Increases recovery.","name":"Recovery"},
			{"icon":[2,3],"parameter":"Duration (seconds)","description":"Increases Blinded Duration.","name":"Daybreak"},
			{"icon":[3,1],"parameter":"Attack","description":"Increases attack.","name":"Attack"},
			{"icon":[15,0],"parameter":"Health","description":"Increases health.","name":"Health"},
			{"icon":[6,3],"parameter":"Miss Chance","description":"Increases Blinded Miss Chance.","name":"Blinding Light"},
			{"icon":[3,3],"no_add":true,"parameter":"Healing Boost","description":"Increased Healing on targets with less than 20% Health.","name":"Clutch Heal"},
			{"icon":[4,3],"parameter":"Holy Fire Damage","description":"Increases Holy Fire damage.","name":"Smiting Flames"},
			{"icon":[4,0],"parameter":"Holy Fire Stacks","description":"Increases the maximum number of Holy Fire stacks.","name":"Crusading Flames"},
			{"icon":[5,3],"parameter":"Defense (% Expertise)","description":"Add a percent of your Expertise to your Defense.","name":"Sanctify"}
		]
	};

	window.DBCALC_TALENT_DATA = window.DBCALC_TALENT_DATA || {};
	window.DBCALC_TALENT_DATA.templar = templar;
}());