(function () {
	var originalUpdateBuildInfo = window.updateBuildInfo;

	window.updateBuildInfo = function () {
		originalUpdateBuildInfo();
		var currentExp = Math.min(100, (DBCalc.points_spent / 90) * 100);
		$(".talent-exp").stop(true).animate({ height: currentExp + "%" }, { duration: 200, queue: false });
	};

	window.switchDiscipline = function (disciplineId, slots) {
		var dataKey = DBCalc.disciplines[disciplineId]
			? DBCalc.disciplines[disciplineId].toLowerCase()
			: "";

		if (!(window.DBCALC_TALENT_DATA || {})[dataKey]) disciplineId = 4;

		var currentDiscipline = DBCalc.currentDisciplineID;
		$(".dsc-select").removeClass("selected hover");
		$(".dsc" + (disciplineId + 1)).addClass("selected");

		DBCalc.currentDisciplineID = disciplineId;
		DBCalc.currentClassID = Math.floor(disciplineId / 3);
		DBCalc.currentClass = DBCalc.classes[DBCalc.currentClassID];
		DBCalc.currentDiscipline = DBCalc.disciplines[disciplineId];
		$(".loading").hide();

		var data = (window.DBCALC_TALENT_DATA || {})[DBCalc.currentDiscipline.toLowerCase()] || {};
		DBCalc.talents = data.talents || [];
		DBCalc.skills = data.skills || [];
		DBCalc.stats = data.stats || [];

		showTalents(currentDiscipline !== disciplineId ? 0 : 200, 200, slots);
	};

	window.unlockFirstSlots = function () {
		[0, 1, 2].forEach(function (slotId) {
			$("#tree_slot_" + slotId).removeClass("closed");
			$("#tree_slot_" + slotId + " .talent-slot-label").addClass("unlocked");
		});
	};

	window.updateSocketsLock = function () {
		var i;
		var j;
		var id;

		for (i = 0; i < DBCalc.talent_slots.length; i++) DBCalc.talent_slots[i].locked = true;
		DBCalc.talent_slots[0].locked = false;
		DBCalc.talent_slots[1].locked = false;
		DBCalc.talent_slots[2].locked = false;

		var skillSocketLock = window.skillSocketLock();
		for (i = 0; i < DBCalc.talent_slots.length; i++) {
			if (DBCalc.socketed_stones.hasOwnProperty(i) && DBCalc.socketed_stones[i]) {
				DBCalc.talent_slots[i].locked = false;
				for (j = 0; j < DBCalc.talent_slots[i].connections.length; j++) {
					id = DBCalc.talent_slots[i].connections[j];
					if (!skillSocketLock || id <= skillSocketLock) DBCalc.talent_slots[id].locked = false;
				}
			}
		}

		for (i = 0; i < DBCalc.talent_slots.length; i++) {
			if (DBCalc.talent_slots[i].locked) {
				$("#tree_slot_" + i).addClass("closed");
				$("#tree_slot_" + i + " .talent-slot-label").removeClass("unlocked");
			} else {
				$("#tree_slot_" + i).removeClass("closed");
				$("#tree_slot_" + i + " .talent-slot-label").addClass("unlocked");
			}
		}
	};
}());