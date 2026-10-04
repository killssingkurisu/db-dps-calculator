(function () {
	"use strict";

	var BASE_WIDTH = 1006;
	var MIN_MOBILE_SCALE = 0.55;
	var stage;
	var shell;
	var shareButton;
	var shareStatus;
	var resizeTimer;
	var statusTimer;

	function supportsZoom() {
		return !window.CSS || !CSS.supports || CSS.supports("zoom", "1");
	}

	function getScale() {
		var availableWidth = Math.max(0, stage.clientWidth - 8);
		var fittedScale = Math.min(1, availableWidth / BASE_WIDTH);
		return window.innerWidth <= 700
			? Math.max(MIN_MOBILE_SCALE, fittedScale)
			: fittedScale;
	}

	function centerStage() {
		var maxScroll = Math.max(0, stage.scrollWidth - stage.clientWidth);
		if (maxScroll) stage.scrollLeft = Math.round(maxScroll / 2);
	}

	function resizeCalculator() {
		if (!stage || !shell) return;

		var scale = getScale();
		if (supportsZoom()) {
			shell.style.zoom = String(scale);
			shell.style.transform = "";
			stage.style.height = "auto";
		} else {
			shell.style.zoom = "";
			shell.style.transform = "scale(" + scale + ")";
			stage.style.height = Math.ceil(shell.scrollHeight * scale) + "px";
		}

		stage.setAttribute("data-scale", scale.toFixed(3));
		window.requestAnimationFrame(centerStage);
	}

	function scheduleResize() {
		window.clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(resizeCalculator, 80);
	}

	function announce(message) {
		if (!shareStatus) return;
		window.clearTimeout(statusTimer);
		shareStatus.textContent = message;
		statusTimer = window.setTimeout(function () {
			shareStatus.textContent = "";
		}, 2200);
	}

	function getBuildUrl() {
		var href = shareButton.getAttribute("href") || window.location.href;
		return new URL(href, window.location.href).href;
	}

	function shareBuild(event) {
		var url = getBuildUrl();

		if (navigator.share) {
			event.preventDefault();
			navigator.share({ title: document.title, url: url }).catch(function (error) {
				if (error && error.name !== "AbortError") announce("Could not share build");
			});
			return;
		}

		if (navigator.clipboard && window.isSecureContext) {
			event.preventDefault();
			navigator.clipboard.writeText(url).then(function () {
				announce("Build link copied");
			}).catch(function () {
				window.location.href = shareButton.getAttribute("href") || "#";
			});
		}
	}

	function init() {
		stage = document.getElementById("calculator_stage");
		shell = document.getElementById("calculator_shell");
		shareButton = document.getElementById("link_button");
		shareStatus = document.getElementById("share_status");

		if (!stage || !shell) return;

		resizeCalculator();
		window.addEventListener("resize", scheduleResize, { passive: true });
		window.addEventListener("orientationchange", scheduleResize, { passive: true });

		if (shareButton) shareButton.addEventListener("click", shareBuild, true);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
}());
