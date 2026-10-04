/*
 * Lets the build calculator (the parent page) embed this talent calculator.
 * Posts the current build string and page height to the parent, and loads a
 * build when the parent asks. Does nothing when the page is opened on its own.
 */
(function () {
	"use strict";
	if (window.parent === window) return;

	var lastBuild = null;
	var lastHeight = 0;
	var timer = null;

	function currentBuild() {
		return typeof window.encodeBuild === "function" ? window.encodeBuild() : location.hash;
	}

	// The document is never shorter than the frame, so measure the content itself.
	function contentHeight() {
		var last = document.querySelector(".calculator-actions") || document.body;
		var bottom = last.getBoundingClientRect().bottom + (window.scrollY || 0);
		return Math.ceil(bottom + 8);
	}

	function post(force) {
		var build = currentBuild();
		var height = contentHeight();
		if (!force && build === lastBuild && height === lastHeight) return;
		lastBuild = build;
		lastHeight = height;
		window.parent.postMessage({ type: "dbb-talents", build: build, height: height }, "*");
	}

	// Talent changes fire several updates in a row (one per socket while a build
	// loads); only the settled result is sent.
	function schedule(force) {
		clearTimeout(timer);
		timer = setTimeout(function () { post(force); }, 80);
	}

	var original = window.updateBuildInfo;
	if (typeof original === "function") {
		window.updateBuildInfo = function () {
			var result = original.apply(this, arguments);
			schedule(false);
			return result;
		};
	}

	function load(build) {
		var hash = build.charAt(0) === "#" ? build : "#" + build;
		if (typeof window.decodeBuild !== "function" || typeof window.switchDiscipline !== "function") {
			location.hash = hash;
			return;
		}
		try { history.replaceState(null, "", hash); } catch (e) { location.hash = hash; }
		if (window.DBCalc) window.DBCalc.hash = location.hash;
		var parsed = window.decodeBuild(hash);
		window.switchDiscipline(parsed.discipline_id, parsed.slots);
	}

	window.addEventListener("message", function (event) {
		if (event.source !== window.parent) return;
		var data = event.data || {};
		if (data.type === "dbb-load" && typeof data.build === "string") load(data.build);
		if (data.type === "dbb-ping") schedule(true);
	});
	window.addEventListener("resize", function () { schedule(false); });
	window.addEventListener("load", function () { schedule(true); });
}());
