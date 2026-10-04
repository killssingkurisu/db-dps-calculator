(function () {
	var viperblade = {
		"talents": [
			{"name":"Attack I","tier":[1,1],"description":"Increases attack.","parameter":"Attack","values":["8","24","40","56","81"],"stat":1,"icon":[3,1]},
			{"name":"Lesser Recovery","tier":[1,2],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3%"],"stat":2,"icon":[1,0]},
			{"name":"Defense I","tier":[1,3],"description":"Increases defense.","parameter":"Defense","values":["3","8","13","19","27"],"stat":3,"icon":[6,1]},
			{"name":"Artery Strike","tier":[2,1],"description":"Increases bleed damage.","parameter":"Bleed Damage","values":["5%","10%","15%","20%","25%"],"stat":4,"icon":[6,2]},
			{"name":"Expertise II","tier":[2,2],"description":"Increases expertise.","parameter":"Expertise","values":["8","25","42","59","84"],"stat":5,"icon":[0,1]},
			{"name":"Health II","tier":[2,3],"description":"Increases health.","parameter":"Health","values":["245","490","857","1225","1837"],"stat":6,"icon":[15,0]},
			{"name":"Corrosive Strikes","tier":[3,1],"description":"Increases armor break and armor bane durations.","parameter":"Duration (seconds)","values":["0.1","0.3","0.6","1.1","1.8"],"stat":7,"icon":[9,1]},
			{"name":"Attack III","tier":[3,2],"description":"Increases attack.","parameter":"Attack","values":["9","28","46","65","93"],"stat":1,"icon":[3,1]},
			{"name":"Defense III","tier":[3,3],"description":"Increases defense.","parameter":"Defense","values":["3","9","15","22","31"],"stat":3,"icon":[6,1]},
			{"name":"Concentrated Venom","tier":[4,1],"description":"Increases poison damage.","parameter":"Poison Damage","values":["7%","14%","21%","28%","35%"],"stat":8,"icon":[6,0]},
			{"name":"Expertise IV","tier":[4,2],"description":"Increases expertise.","parameter":"Expertise","values":["10","29","49","68","97"],"stat":5,"icon":[0,1]},
			{"name":"Lesser Recovery","tier":[4,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Hemorrhage","tier":[5,1],"description":"Increases hemorrhage critical effect.","parameter":"Hemorrhage Damage","values":["1%","3%","6%","10%","15%"],"stat":9,"icon":[24,1]},
			{"name":"Attack V","tier":[5,2],"description":"Increases attack.","parameter":"Attack","values":["11","34","56","78","112"],"stat":1,"icon":[3,1]},
			{"name":"Health V","tier":[5,3],"description":"Increases health.","parameter":"Health","values":["318","637","1114","1591","2387"],"stat":6,"icon":[15,0]},
			{"name":"Deep Cuts","tier":[6,1],"description":"Increases maximum number of bleed stacks.","parameter":"Bleed Stacks","values":["1","2","3","4","5"],"stat":10,"icon":[5,2]},
			{"name":"Expertise VI","tier":[6,2],"description":"Increases expertise.","parameter":"Expertise","values":["12","37","61","86","123"],"stat":5,"icon":[0,1]},
			{"name":"Lesser Recovery","tier":[6,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.1%","0.3%","0.8%","1.8%","3.0%"],"stat":2,"icon":[1,0]},
			{"name":"Steadiness","tier":[7,1],"description":"Increases critical chance.","parameter":"Critical Chance","values":["0.3%","0.6%","0.9%","1.2%","1.5%"],"stat":11,"icon":[24,0]},
			{"name":"Concentrated Venom","tier":[7,2],"description":"Increases poison damage.","parameter":"Poison Damage","values":["7%","14%","21%","28%","35%"],"stat":8,"icon":[6,0]},
			{"name":"Health VII","tier":[7,3],"description":"Increases health.","parameter":"Health","values":["397","795","1391","1987","2980"],"stat":6,"icon":[16,0]},
			{"name":"Contact Poison","tier":[8,1],"description":"Increases poison damage vs. bleeding targets.","parameter":"Poison vs Bleeding","values":["2%","4%","8%","12%","18%"],"stat":12,"icon":[7,0]},
			{"name":"Hemorrhage","tier":[8,2],"description":"Increases hemorrhage critical effect.","parameter":"Hemorrhage Damage","values":["1%","3%","6%","10%","15%"],"stat":9,"icon":[24,1]},
			{"name":"Attack VIII","tier":[8,3],"description":"Increases attack.","parameter":"Attack","values":["16","45","78","109","155"],"stat":1,"icon":[4,1]},
			{"name":"Artery Strike","tier":[9,1],"description":"Increases bleed damage.","parameter":"Bleed Damage","values":["5%","10%","15%","20%","25%"],"stat":4,"icon":[6,2]},
			{"name":"Greater Recovery","tier":[9,2],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":2,"icon":[2,0]},
			{"name":"Defense IX","tier":[9,3],"description":"Increases defense.","parameter":"Defense","values":["6","18","30","42","60"],"stat":3,"icon":[7,1]},
			{"name":"Acid Edge","tier":[10,1],"description":"Increases effectiveness of armor break and armor bane.","parameter":"Effect","values":["2%","4%","6%","8%","10%"],"stat":13,"icon":[10,1]},
			{"name":"Expertise X","tier":[10,2],"description":"Increases expertise.","parameter":"Expertise","values":["20","59","98","138","197"],"stat":5,"icon":[1,1]},
			{"name":"Greater Recovery","tier":[10,3],"description":"Increases recovery.","parameter":"Recovery","values":["0.2%","0.6%","1.4%","2.9%","5.3%"],"stat":2,"icon":[2,0]},
			{"name":"Steadiness","tier":[11,1],"description":"Increases critical chance.","parameter":"Critical Chance","values":["0.3%","0.6%","0.9%","1.2%","1.5%"],"stat":11,"icon":[24,0]},
			{"name":"Concentrated Venom","tier":[11,2],"description":"Increases poison damage.","parameter":"Poison Damage","values":["7%","14%","21%","28%","35%"],"stat":8,"icon":[6,0]},
			{"name":"Attack XI","tier":[11,3],"description":"Increases attack.","parameter":"Attack","values":["23","68","113","158","226"],"stat":1,"icon":[5,1]},
			{"name":"Hemorrhage","tier":[12,1],"description":"Increases hemorrhage critical effect.","parameter":"Hemorrhage Damage","values":["1%","3%","6%","10%","15%"],"stat":9,"icon":[24,1]},
			{"name":"Artery Strike","tier":[12,2],"description":"Increases bleed damage.","parameter":"Bleed Damage","values":["5%","10%","15%","20%","25%"],"stat":4,"icon":[6,2]},
			{"name":"Expertise XII","tier":[12,3],"description":"Increases expertise.","parameter":"Expertise","values":["25","75","124","174","249"],"stat":5,"icon":[2,1]},
			{"name":"Contact Poison","tier":[13,1],"description":"Increases poison damage vs. bleeding targets.","parameter":"Poison vs Bleeding","values":["2%","4%","8%","12%","18%"],"stat":12,"icon":[7,0]},
			{"name":"Deep Cuts","tier":[13,2],"description":"Increases maximum number of bleed stacks.","parameter":"Bleed Stacks","values":["1","2","3","4","5"],"stat":10,"icon":[5,2]},
			{"name":"Attack XIII","tier":[13,3],"description":"Increases attack.","parameter":"Attack","values":["29","86","143","200","286"],"stat":1,"icon":[5,1]},
			{"name":"Steadiness","tier":[14,1],"description":"Increases critical chance.","parameter":"Critical Chance","values":["0.3%","0.6%","0.9%","1.2%","1.5%"],"stat":11,"icon":[24,0]},
			{"name":"Attack XIV","tier":[14,2],"description":"Increases attack.","parameter":"Attack","values":["31","94","157","220","315"],"stat":1,"icon":[5,1]},
			{"name":"Expertise XIV","tier":[14,3],"description":"Increases expertise.","parameter":"Expertise","values":["31","94","157","220","315"],"stat":5,"icon":[2,1]}
		],
		"skills": [
			{"name":"Mist Walk","description":"Dash and deal a powerful AoE Intimidate with 5 stacks of bleed. Gain increased Defense during the dash."},
			{"name":"Crimson Butterfly","description":"Slash nearby enemies and remove up to 3 stacks of bleed per target. Removed bleed deals extra damage."},
			{"name":"Charon's Blades","description":"Transform into a Death Avatar. Gain increased Attack damage for the duration."}
		],
		"stats": [
			{"icon":[3,1],"parameter":"Attack","description":"Increases attack.","name":"Attack"},
			{"icon":[1,0],"parameter":"Recovery","description":"Increases recovery.","name":"Recovery"},
			{"icon":[6,1],"parameter":"Defense","description":"Increases defense.","name":"Defense"},
			{"icon":[6,2],"parameter":"Bleed Damage","description":"Increases bleed damage.","name":"Artery Strike"},
			{"icon":[0,1],"parameter":"Expertise","description":"Increases expertise.","name":"Expertise"},
			{"icon":[15,0],"parameter":"Health","description":"Increases health.","name":"Health"},
			{"icon":[9,1],"parameter":"Duration (seconds)","description":"Increases armor break and armor bane durations.","name":"Corrosive Strikes"},
			{"icon":[6,0],"parameter":"Poison Damage","description":"Increases poison damage.","name":"Concentrated Venom"},
			{"icon":[24,1],"parameter":"Hemorrhage Damage","description":"Increases hemorrhage critical effect.","name":"Hemorrhage"},
			{"icon":[5,2],"parameter":"Bleed Stacks","description":"Increases maximum number of bleed stacks.","name":"Deep Cuts"},
			{"icon":[24,0],"parameter":"Critical Chance","description":"Increases critical chance.","name":"Steadiness"},
			{"icon":[7,0],"parameter":"Poison vs Bleeding","description":"Increases poison damage vs. bleeding targets.","name":"Contact Poison"},
			{"icon":[10,1],"parameter":"Effect","description":"Increases effectiveness of armor break and armor bane.","name":"Acid Edge"}
		]
	};

	window.DBCALC_TALENT_DATA = window.DBCALC_TALENT_DATA || {};
	window.DBCALC_TALENT_DATA.viperblade = viperblade;
}());