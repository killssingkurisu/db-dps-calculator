/*
 * Dungeon Blitz DPS Calculator: Google sign-in and Google Drive sync.
 *
 * Signing in with Google gives this page an access token for the hidden "app data" folder in
 * your own Google Drive (scope drive.appdata: the page can only see files it made itself).
 * The library from library.js (saved builds and scanned inventories) is kept there as one
 * JSON file and merged with this browser's copy on every sync, so builds and scans follow
 * you between browsers and devices. Nothing is sent anywhere else, and there is no server.
 */
(function (root) {
	"use strict";

	var CLIENT_ID = "47070294526-0n9el96hu4sqi4l2s06kq004phf3r7cl.apps.googleusercontent.com";
	var DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
	var SCOPES = [DRIVE_SCOPE, "openid", "email", "profile"].join(" ");
	var FILE_NAME = "dbb-dps-calculator-library.json";
	var PROFILE_KEY = "dbb-drive-v1";
	var TOKEN_KEY = "dbb-drive-token-v1";
	var GIS_SRC = "https://accounts.google.com/gsi/client";
	var API = "https://www.googleapis.com/drive/v3/files";
	var UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
	var AUTOSYNC_MS = 2500;
	var REFRESH_AFTER_MS = 60000;

	var LIB = root.DBB_LIBRARY;
	var tokenClient = null;
	var gisState = "loading";          // loading | ready | failed
	var token = null;
	var tokenExp = 0;
	var profile = readJSON(root.localStorage, PROFILE_KEY) || {};
	var status = { state: "signed-out", message: "" };
	var listeners = [];
	var syncing = null;
	var again = false;
	var pendingWorkspace = null;   // the party setup to store with the next upload (Back up now)
	var autoTimer = null;
	var applyingRemote = false;

	function readJSON(store, key) {
		try { var raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
	}

	function writeJSON(store, key, value) {
		try {
			if (value == null) store.removeItem(key);
			else store.setItem(key, JSON.stringify(value));
		} catch (e) { /* storage blocked */ }
	}

	function setStatus(state, message) {
		status = { state: state, message: message || "", profile: profile, gis: gisState, lastSync: profile.lastSync || 0 };
		listeners.forEach(function (f) { try { f(status); } catch (e) { /* keep going */ } });
	}

	function tokenValid() { return !!token && Date.now() < tokenExp; }

	function saveProfile() { writeJSON(root.localStorage, PROFILE_KEY, profile); }

	/* ---------- Google Identity Services ---------- */

	function loadGis() {
		if (!CLIENT_ID) { gisState = "failed"; return; }
		var s = document.createElement("script");
		s.src = GIS_SRC;
		s.async = true;
		s.defer = true;
		s.onload = function () {
			try {
				tokenClient = root.google.accounts.oauth2.initTokenClient({
					client_id: CLIENT_ID,
					scope: SCOPES,
					callback: onToken,
					error_callback: onTokenError
				});
				gisState = "ready";
			} catch (e) {
				gisState = "failed";
			}
			setStatus(status.state === "signed-out" && profile.email ? "expired" : status.state, status.message);
		};
		s.onerror = function () {
			gisState = "failed";
			setStatus(status.state, "Google sign-in could not load. A blocker or the network may be stopping accounts.google.com.");
		};
		document.head.appendChild(s);
	}

	// Must run straight from a click, or the browser blocks Google's sign-in window.
	function signIn() {
		if (gisState !== "ready" || !tokenClient) {
			setStatus("error", gisState === "failed" ? "Google sign-in is not available here." : "Google sign-in is still loading. Try again in a moment.");
			return;
		}
		setStatus("connecting", "Waiting for Google…");
		var opts = { prompt: profile.email ? "" : "consent" };
		if (profile.email) opts.login_hint = profile.email;
		tokenClient.requestAccessToken(opts);
	}

	function onToken(resp) {
		if (!resp || resp.error) {
			setStatus("error", "Google sign-in didn't finish" + (resp && resp.error ? " (" + resp.error + ")" : "") + ".");
			return;
		}
		var granted = root.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE);
		if (!granted) {
			setStatus("error", "Sync needs the permission to keep its own data in your Google Drive. Sign in again and leave that box ticked.");
			return;
		}
		token = resp.access_token;
		tokenExp = Date.now() + Math.max(60, (+resp.expires_in || 3600) - 120) * 1000;
		writeJSON(root.sessionStorage, TOKEN_KEY, { token: token, exp: tokenExp });
		fetchProfile().then(function () { return sync(); }).catch(function (e) { fail(e); });
	}

	function onTokenError(err) {
		var type = err && err.type;
		var msg = type === "popup_closed" ? "Sign-in window closed before it finished."
			: type === "popup_failed_to_open" ? "The browser blocked Google's sign-in window. Allow pop-ups for this page and try again."
			: "Google sign-in failed.";
		setStatus(token ? "synced" : (profile.email ? "expired" : "signed-out"), msg);
	}

	function signOut() {
		var t = token;
		token = null;
		tokenExp = 0;
		writeJSON(root.sessionStorage, TOKEN_KEY, null);
		if (t && root.google && root.google.accounts && root.google.accounts.oauth2) {
			try { root.google.accounts.oauth2.revoke(t, function () { /* done */ }); } catch (e) { /* ignore */ }
		}
		profile = {};
		saveProfile();
		setStatus("signed-out", "Signed out. Your builds stay in this browser.");
	}

	/* ---------- Drive REST calls ---------- */

	function DriveError(status, message) {
		this.status = status;
		this.message = message;
	}

	function api(method, url, body, contentType) {
		if (!tokenValid()) return Promise.reject(new DriveError(401, "expired"));
		var headers = { Authorization: "Bearer " + token };
		if (contentType) headers["Content-Type"] = contentType;
		return fetch(url, { method: method, headers: headers, body: body }).then(function (res) {
			if (res.status === 401) {
				token = null;
				writeJSON(root.sessionStorage, TOKEN_KEY, null);
				throw new DriveError(401, "expired");
			}
			if (!res.ok) {
				return res.text().then(function (t) {
					var m = "";
					try { m = JSON.parse(t).error.message; } catch (e) { m = t.slice(0, 160); }
					throw new DriveError(res.status, m || ("HTTP " + res.status));
				});
			}
			var ct = res.headers.get("Content-Type") || "";
			return ct.indexOf("json") >= 0 ? res.json() : res.text();
		});
	}

	function fetchProfile() {
		return api("GET", "https://www.googleapis.com/oauth2/v3/userinfo").then(function (u) {
			profile.email = u.email || "";
			profile.name = u.name || u.given_name || u.email || "";
			profile.picture = u.picture || "";
			saveProfile();
		}).catch(function (e) {
			if (e && e.status === 401) throw e;
			// The profile is only for display; sync works without it.
		});
	}

	function findFile() {
		var q = encodeURIComponent("name = '" + FILE_NAME + "' and trashed = false");
		return api("GET", API + "?spaces=appDataFolder&q=" + q + "&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10")
			.then(function (r) { return (r.files && r.files[0]) ? r.files[0].id : ""; });
	}

	function download(id) {
		return api("GET", API + "/" + encodeURIComponent(id) + "?alt=media").then(function (body) {
			if (typeof body === "string") {
				try { return JSON.parse(body); } catch (e) { return null; }
			}
			return body;
		});
	}

	function create(content) {
		var boundary = "dbb" + Math.random().toString(36).slice(2);
		var meta = { name: FILE_NAME, parents: ["appDataFolder"], mimeType: "application/json" };
		var body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
			"\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + content +
			"\r\n--" + boundary + "--";
		return api("POST", UPLOAD + "?uploadType=multipart&fields=id", body, "multipart/related; boundary=" + boundary)
			.then(function (r) { return r.id; });
	}

	function update(id, content) {
		return api("PATCH", UPLOAD + "/" + encodeURIComponent(id) + "?uploadType=media&fields=id", content, "application/json; charset=UTF-8")
			.then(function (r) { return r.id; });
	}

	/* ---------- sync ---------- */

	function fail(e) {
		if (e && e.status === 401) {
			setStatus("expired", "Your Google sign-in has run out. Click Reconnect to keep syncing.");
			return;
		}
		var msg = e && e.message ? e.message : String(e);
		if (e && e.status === 403 && /has not been used|disabled/i.test(msg)) msg = "The Google Drive API isn't turned on for this site's Google project yet.";
		setStatus("error", "Sync failed: " + msg);
	}

	// Download, merge with this browser's copy, upload. Only one sync runs at a time; a
	// change made during a sync runs another one straight after.
	function sync() {
		if (!tokenValid()) {
			setStatus(profile.email ? "expired" : "signed-out", profile.email ? "Reconnect to sync with Google Drive." : "");
			return Promise.resolve(false);
		}
		if (syncing) { again = true; return syncing; }
		setStatus("syncing", "Syncing with Google Drive…");
		var local = LIB.current();
		var didBackup = false;
		syncing = (profile.fileId ? Promise.resolve(profile.fileId) : findFile())
			.then(function (id) {
				if (!id) return { id: "", remote: null };
				return download(id).then(function (remote) { return { id: id, remote: remote }; }, function (e) {
					if (e && e.status === 404) return { id: "", remote: null };
					throw e;
				});
			})
			.then(function (r) {
				var remoteLib = r.remote && typeof r.remote === "object" ? (r.remote.library || r.remote) : null;
				var merged = LIB.merge(local, remoteLib || {});
				if (!LIB.same(merged, LIB.current())) {
					applyingRemote = true;
					try { LIB.replace(merged, "sync"); } finally { applyingRemote = false; }
				}
				// The party setup is only stored by "Back up now"; ordinary syncs keep the stored one.
				var workspace = pendingWorkspace || (r.remote && r.remote.workspace) || undefined;
				var fresh = !!pendingWorkspace;
				pendingWorkspace = null;
				var content = JSON.stringify({ app: "dbb-dps-calculator", v: 1, saved: new Date().toISOString(), library: merged, workspace: workspace });
				if (remoteLib && LIB.same(merged, remoteLib) && !fresh) return r.id;
				didBackup = fresh;
				return r.id ? update(r.id, content).catch(function (e) {
					if (e && e.status === 404) return create(content);
					throw e;
				}) : create(content);
			})
			.then(function (id) {
				profile.fileId = id;
				profile.lastSync = Date.now();
				if (didBackup) profile.lastBackup = profile.lastSync;
				saveProfile();
				setStatus("synced", "");
				return true;
			})
			.catch(function (e) {
				if (e && e.status === 404) { profile.fileId = ""; saveProfile(); }
				fail(e);
				return false;
			})
			.then(function (ok) {
				syncing = null;
				if (again) { again = false; return sync(); }
				return ok;
			});
		return syncing;
	}

	// Back up now: sync builds and loads, and store this party setup with them.
	function backup(workspaceData) {
		pendingWorkspace = { saved: new Date().toISOString(), data: workspaceData };
		return sync();
	}

	// Load from Drive: this browser's builds and loads become the Drive copy (nothing local is
	// kept), and the party setup stored by the last backup comes back. Resolves to
	// { workspace } (null when the backup has none) or rejects with a message.
	function restore() {
		if (!tokenValid()) return Promise.reject(new Error(profile.email ? "Reconnect to Google Drive first." : "Sign in with Google first."));
		// Let a sync that is under way finish first, so it can't merge the old library back in.
		return Promise.resolve(syncing).then(function () {
			setStatus("syncing", "Loading from Google Drive…");
			return profile.fileId ? profile.fileId : findFile();
		})
			.then(function (id) {
				if (!id) throw new DriveError(404, "There's no backup in your Google Drive yet. Press Back up now first.");
				return download(id).then(function (remote) { return { id: id, remote: remote }; });
			})
			.then(function (r) {
				var remoteLib = r.remote && typeof r.remote === "object" ? (r.remote.library || r.remote) : null;
				if (!remoteLib) throw new DriveError(500, "The backup in your Google Drive couldn't be read.");
				applyingRemote = true;
				try { LIB.replace(remoteLib, "sync"); } finally { applyingRemote = false; }
				profile.fileId = r.id;
				profile.lastSync = Date.now();
				saveProfile();
				setStatus("synced", "");
				return { workspace: (r.remote && r.remote.workspace) || null, saved: r.remote && r.remote.saved };
			})
			.catch(function (e) {
				if (e && e.status === 404 && !/backup/.test(e.message || "")) { profile.fileId = ""; saveProfile(); }
				fail(e);
				throw new Error(e && e.message ? e.message : String(e));
			});
	}

	function scheduleSync() {
		clearTimeout(autoTimer);
		if (!tokenValid()) {
			if (profile.email) setStatus("expired", "Changes are saved in this browser. Reconnect to sync them to Google Drive.");
			return;
		}
		autoTimer = setTimeout(function () { sync(); }, AUTOSYNC_MS);
	}

	/* ---------- start ---------- */

	function init() {
		if (!LIB || !root.fetch) return;
		var saved = readJSON(root.sessionStorage, TOKEN_KEY);
		if (saved && saved.token && saved.exp > Date.now() && profile.email) {
			token = saved.token;
			tokenExp = saved.exp;
		}
		LIB.onChange(function (lib, why) {
			if (applyingRemote || why === "sync") return;
			if (profile.email) scheduleSync();
		});
		document.addEventListener("visibilitychange", function () {
			if (document.visibilityState === "visible" && tokenValid() && Date.now() - (profile.lastSync || 0) > REFRESH_AFTER_MS) sync();
		});
		loadGis();
		if (tokenValid()) {
			setStatus("synced", "");
			sync();
		} else {
			setStatus(profile.email ? "expired" : "signed-out", "");
		}
	}

	root.DBB_DRIVE = {
		init: init,
		signIn: signIn,
		signOut: signOut,
		sync: sync,
		backup: backup,
		restore: restore,
		lastBackup: function () { return profile.lastBackup || 0; },
		status: function () { return status; },
		onStatus: function (f) { listeners.push(f); f(status); },
		configured: !!CLIENT_ID,
		FILE_NAME: FILE_NAME
	};
})(window);
