"use strict";

const FOCUS_SECONDS = 25 * 60;
const STORAGE_KEY = "pomodoro.timer.state.v1";

const ui = {
	modeLabel: document.getElementById("modeLabel"),
	timeText: document.getElementById("timeText"),
	progressRing: document.getElementById("progressRing"),
	startPauseButton: document.getElementById("startPauseButton"),
	resetButton: document.getElementById("resetButton"),
	completedCount: document.getElementById("completedCount"),
	focusTime: document.getElementById("focusTime"),
};

const api = {
	statsToday: "/api/stats/today",
	sessions: "/api/sessions",
	settings: "/api/settings",
};

function toDateKey(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function todayKey() {
	return toDateKey(new Date());
}

function createInitialState() {
	return {
		status: "idle",
		durationSeconds: FOCUS_SECONDS,
		remainingSeconds: FOCUS_SECONDS,
		endAt: null,
		completedCount: 0,
		totalFocusSeconds: 0,
		statsDate: todayKey(),
	};
}

let state = createInitialState();

let tickerId = null;

function safeParseJSON(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function asSafeNumber(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}

function normalizeLoadedState(raw) {
	if (raw === null || typeof raw !== "object") {
		return null;
	}

	const status =
		raw.status === "idle" || raw.status === "focus" || raw.status === "paused"
			? raw.status
			: "idle";

	const durationSeconds = Math.max(
		1,
		Math.floor(asSafeNumber(raw.durationSeconds, FOCUS_SECONDS)),
	);

	const remainingSeconds = Math.max(
		0,
		Math.min(
			durationSeconds,
			Math.floor(asSafeNumber(raw.remainingSeconds, durationSeconds)),
		),
	);

	let endAt = null;
	if (asSafeNumber(raw.endAt, null) !== null) {
		endAt = asSafeNumber(raw.endAt, null);
	}

	const completedCount = Math.max(
		0,
		Math.floor(asSafeNumber(raw.completedCount, 0)),
	);
	const totalFocusSeconds = Math.max(
		0,
		Math.floor(asSafeNumber(raw.totalFocusSeconds, 0)),
	);

	const statsDate =
		typeof raw.statsDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.statsDate)
			? raw.statsDate
			: todayKey();

	return {
		status,
		durationSeconds,
		remainingSeconds,
		endAt,
		completedCount,
		totalFocusSeconds,
		statsDate,
	};
}

function saveState() {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage errors (private mode, quota, blocked storage).
	}
}

function resetStatsIfNewDay() {
	const today = todayKey();
	if (state.statsDate === today) {
		return false;
	}
	state.completedCount = 0;
	state.totalFocusSeconds = 0;
	state.statsDate = today;
	return true;
}

function loadState() {
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return;
	}

	const parsed = safeParseJSON(raw);
	const loaded = normalizeLoadedState(parsed);
	if (!loaded) {
		return;
	}

	state = loaded;
	resetStatsIfNewDay();

	if (state.status === "focus" && state.endAt !== null) {
		state.remainingSeconds = remainingFromEndAt(state.endAt);
		if (state.remainingSeconds === 0) {
			state.status = "idle";
			state.endAt = null;
			state.completedCount += 1;
			state.totalFocusSeconds += state.durationSeconds;
		}
	}
}

async function fetchJSON(url, options = undefined) {
	const response = await window.fetch(url, options);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return response.json();
}

function applyStatsFromApi(stats) {
	if (!stats || typeof stats !== "object") {
		return;
	}
	if (typeof stats.completed_pomodoros === "number") {
		state.completedCount = Math.max(0, Math.floor(stats.completed_pomodoros));
	}
	if (typeof stats.total_focus_seconds === "number") {
		state.totalFocusSeconds = Math.max(0, Math.floor(stats.total_focus_seconds));
	}
	if (typeof stats.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(stats.date)) {
		state.statsDate = stats.date;
	}
}

async function refreshStatsFromApi() {
	try {
		const stats = await fetchJSON(api.statsToday);
		applyStatsFromApi(stats);
		render();
		saveState();
	} catch {
		// Keep local fallback when API is unavailable.
	}
}

async function loadSettingsFromApi() {
	try {
		const settings = await fetchJSON(api.settings);
		if (typeof settings.focus_minutes !== "number") {
			return;
		}
		const nextDuration = Math.max(1, Math.floor(settings.focus_minutes * 60));
		const previousDuration = state.durationSeconds;
		state.durationSeconds = nextDuration;
		if (state.status === "idle" && state.remainingSeconds === previousDuration) {
			state.remainingSeconds = nextDuration;
		}
		render();
		saveState();
	} catch {
		// Keep local fallback when API is unavailable.
	}
}

async function postCompletedSession(actualSeconds) {
	try {
		await fetchJSON(api.sessions, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				mode: "focus",
				planned_seconds: state.durationSeconds,
				actual_seconds: Math.max(0, Math.floor(actualSeconds)),
				status: "completed",
			}),
		});
		await refreshStatsFromApi();
	} catch {
		// Keep local fallback when API is unavailable.
	}
}

function formatTime(totalSeconds) {
	const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

function formatFocusTime(totalSeconds) {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	return `${hours}時間${String(minutes).padStart(2, "0")}分`;
}

function remainingFromEndAt(endAt) {
	const deltaMs = endAt - Date.now();
	if (deltaMs <= 0) {
		return 0;
	}
	return Math.ceil(deltaMs / 1000);
}

function syncRemainingIfRunning() {
	if (state.status !== "focus" || state.endAt === null) {
		return;
	}
	state.remainingSeconds = remainingFromEndAt(state.endAt);
}

function updateRing() {
	const ratio =
		(state.durationSeconds - state.remainingSeconds) / state.durationSeconds;
	const progressRatio = Math.min(1, Math.max(0, ratio));
	const progressDeg = progressRatio * 360;
	ui.progressRing.style.setProperty("--progress", `${progressDeg}deg`);
}

function updateModeText() {
	if (state.status === "focus") {
		ui.modeLabel.textContent = "作業中";
		return;
	}
	if (state.status === "paused") {
		ui.modeLabel.textContent = "一時停止";
		return;
	}
	if (state.remainingSeconds === 0) {
		ui.modeLabel.textContent = "完了";
		return;
	}
	ui.modeLabel.textContent = "待機中";
}

function updateStartPauseButton() {
	if (state.status === "focus") {
		ui.startPauseButton.textContent = "一時停止";
		return;
	}
	if (state.status === "paused") {
		ui.startPauseButton.textContent = "再開";
		return;
	}
	ui.startPauseButton.textContent = "開始";
}

function render() {
	const statsReset = resetStatsIfNewDay();
	syncRemainingIfRunning();
	ui.timeText.textContent = formatTime(state.remainingSeconds);
	ui.completedCount.textContent = String(state.completedCount);
	ui.focusTime.textContent = formatFocusTime(state.totalFocusSeconds);
	updateRing();
	updateModeText();
	updateStartPauseButton();
	if (statsReset) {
		saveState();
	}
}

function stopTicker() {
	if (tickerId !== null) {
		window.clearInterval(tickerId);
		tickerId = null;
	}
}

function onTick() {
	syncRemainingIfRunning();
	if (state.status === "focus" && state.remainingSeconds === 0) {
		stopTicker();
		state.status = "idle";
		state.endAt = null;
		resetStatsIfNewDay();
		const actualSeconds = state.durationSeconds;
		state.completedCount += 1;
		state.totalFocusSeconds += state.durationSeconds;
		saveState();
		void postCompletedSession(actualSeconds);
	}
	render();
}

function startTicker() {
	stopTicker();
	tickerId = window.setInterval(onTick, 250);
}

function handleStartPause() {
	if (state.status === "idle") {
		if (state.remainingSeconds === 0) {
			state.remainingSeconds = state.durationSeconds;
		}
		state.status = "focus";
		state.endAt = Date.now() + state.remainingSeconds * 1000;
		startTicker();
		render();
		saveState();
		return;
	}

	if (state.status === "focus") {
		syncRemainingIfRunning();
		state.status = "paused";
		state.endAt = null;
		stopTicker();
		render();
		saveState();
		return;
	}

	if (state.status === "paused") {
		state.status = "focus";
		state.endAt = Date.now() + state.remainingSeconds * 1000;
		startTicker();
		render();
		saveState();
	}
}

function handleReset() {
	stopTicker();
	state.status = "idle";
	state.remainingSeconds = state.durationSeconds;
	state.endAt = null;
	render();
	saveState();
}

ui.startPauseButton.addEventListener("click", handleStartPause);
ui.resetButton.addEventListener("click", handleReset);

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		onTick();
	}
});

loadState();

if (state.status === "focus") {
	startTicker();
}

render();

void loadSettingsFromApi();
void refreshStatsFromApi();
