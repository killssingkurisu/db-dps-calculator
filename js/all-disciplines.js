(function () {
	var originalUpdateBuildInfo = window.updateBuildInfo;

	window.updateBuildInfo = function () {
		originalUpdateBuildInfo();
		// Matches the game client: the bar fills over 70 points (rank XIV unlocks at 65, +5),
		// so each row lines up with the 5 points that unlock it.
		var currentExp = Math.min(100, (DBCalc.points_spent / 70) * 100);
		$(".talent-exp").stop(true).animate({ height: currentExp + "%" }, { duration: 200, queue: false });
		window.updateSocketsLock();
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

	// Sockets 0 (2/2) and 1 (5/5) start open. Socket 2 (3/3) also needs 5 spent points,
	// on top of its connection to socket 0.
	var SOCKET_POINT_GATES = { 2: 5 };

	function socketGateMet(slotId) {
		return !SOCKET_POINT_GATES.hasOwnProperty(slotId) || DBCalc.points_spent >= SOCKET_POINT_GATES[slotId];
	}

	window.unlockFirstSlots = function () {
		[0, 1].forEach(function (slotId) {
			$("#tree_slot_" + slotId).removeClass("closed");
			$("#tree_slot_" + slotId + " .talent-slot-label").addClass("unlocked");
		});
	};

	// Recompute every socket from scratch whenever a connection would open, so point gates hold.
	window.unlockSlotConnections = function () {
		window.updateSocketsLock();
	};

	window.updateSocketsLock = function () {
		var i;
		var j;
		var id;

		for (i = 0; i < DBCalc.talent_slots.length; i++) DBCalc.talent_slots[i].locked = true;
		DBCalc.talent_slots[0].locked = false;
		DBCalc.talent_slots[1].locked = false;

		var skillSocketLock = window.skillSocketLock();
		for (i = 0; i < DBCalc.talent_slots.length; i++) {
			if (DBCalc.socketed_stones.hasOwnProperty(i) && DBCalc.socketed_stones[i]) {
				DBCalc.talent_slots[i].locked = false;
				for (j = 0; j < DBCalc.talent_slots[i].connections.length; j++) {
					id = DBCalc.talent_slots[i].connections[j];
					if ((!skillSocketLock || id <= skillSocketLock) && socketGateMet(id)) DBCalc.talent_slots[id].locked = false;
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