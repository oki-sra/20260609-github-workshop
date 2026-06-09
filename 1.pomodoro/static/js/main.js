"use strict";

const FOCUS_SECONDS = 25 * 60;
const STORAGE_KEY = "pomodoro.timer.state.v1";
const MODE_FOCUS = "focus";
const MODE_SHORT_BREAK = "short_break";
const MODE_LONG_BREAK = "long_break";
const MODE_ORDER = [MODE_FOCUS, MODE_SHORT_BREAK, MODE_LONG_BREAK];

const ui = {
	modeLabel: document.getElementById("modeLabel"),
	timeText: document.getElementById("timeText"),
	progressRing: document.getElementById("progressRing"),
	startPauseButton: document.getElementById("startPauseButton"),
	resetButton: document.getElementById("resetButton"),
	completedCount: document.getElementById("completedCount"),
	focusTime: document.getElementById("focusTime"),
	focusMinutesInput: document.getElementById("focusMinutesInput"),
	shortBreakMinutesInput: document.getElementById("shortBreakMinutesInput"),
	longBreakMinutesInput: document.getElementById("longBreakMinutesInput"),
	longBreakIntervalInput: document.getElementById("longBreakIntervalInput"),
	settingsStatus: document.getElementById("settingsStatus"),
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
		currentMode: MODE_FOCUS,
		cycleCount: 0,
		settings: {
			focus_minutes: 25,
			short_break_minutes: 5,
			long_break_minutes: 15,
			long_break_interval: 4,
		},
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

function modeToLabel(mode) {
	if (mode === MODE_FOCUS) {
		return "作業中";
	}
	if (mode === MODE_SHORT_BREAK) {
		return "短休憩";
	}
	if (mode === MODE_LONG_BREAK) {
		return "長休憩";
	}
	return "待機中";
}

function isMode(value) {
	return MODE_ORDER.includes(value);
}

function modeDurationSeconds(mode, settings) {
	if (mode === MODE_SHORT_BREAK) {
		return settings.short_break_minutes * 60;
	}
	if (mode === MODE_LONG_BREAK) {
		return settings.long_break_minutes * 60;
	}
	return settings.focus_minutes * 60;
}

function syncDurationForCurrentMode(resetRemaining = false) {
	const nextDuration = modeDurationSeconds(state.currentMode, state.settings);
	state.durationSeconds = nextDuration;
	if (resetRemaining || state.status === "idle") {
		state.remainingSeconds = nextDuration;
	}
}

function syncSettingsInputs() {
	ui.focusMinutesInput.value = String(state.settings.focus_minutes);
	ui.shortBreakMinutesInput.value = String(state.settings.short_break_minutes);
	ui.longBreakMinutesInput.value = String(state.settings.long_break_minutes);
	ui.longBreakIntervalInput.value = String(state.settings.long_break_interval);
}

function setSettingsStatus(text) {
	ui.settingsStatus.textContent = text;
}

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

	const currentMode = isMode(raw.currentMode) ? raw.currentMode : MODE_FOCUS;

	let cycleCount = Math.max(0, Math.floor(asSafeNumber(raw.cycleCount, 0)));
    if (!Number.isFinite(cycleCount)) {
        cycleCount = 0;
    }

	const settingsRaw = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
	const settings = {
		focus_minutes: Math.max(
			1,
			Math.floor(asSafeNumber(settingsRaw.focus_minutes, 25)),
		),
		short_break_minutes: Math.max(
			1,
			Math.floor(asSafeNumber(settingsRaw.short_break_minutes, 5)),
		),
		long_break_minutes: Math.max(
			1,
			Math.floor(asSafeNumber(settingsRaw.long_break_minutes, 15)),
		),
		long_break_interval: Math.max(
			1,
			Math.floor(asSafeNumber(settingsRaw.long_break_interval, 4)),
		),
	};

	const durationSeconds = Math.max(
		1,
		Math.floor(asSafeNumber(raw.durationSeconds, modeDurationSeconds(currentMode, settings))),
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
		currentMode,
		cycleCount,
		settings,
		durationSeconds,
		remainingSeconds,
		endAt,
		completedCount,
		totalFocusSeconds,
		statsDate,
	};
}

function playNotificationTone() {
	try {
		const context = new window.AudioContext();
		const oscillator = context.createOscillator();
		const gainNode = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = 880;
		gainNode.gain.value = 0.03;
		oscillator.connect(gainNode);
		gainNode.connect(context.destination);
		oscillator.start();
		oscillator.stop(context.currentTime + 0.22);
	} catch {
		// Ignore if AudioContext is unavailable.
	}
}

function notifySessionEnd(message) {
	playNotificationTone();
	if (!("Notification" in window)) {
		return;
	}
	if (Notification.permission === "granted") {
		new Notification("ポモドーロタイマー", { body: message });
		return;
	}
	if (Notification.permission === "default") {
		void Notification.requestPermission();
	}
}

function nextModeAfterFocus() {
	const nextCycle = state.cycleCount + 1;
	if (nextCycle % state.settings.long_break_interval === 0) {
		return MODE_LONG_BREAK;
	}
	return MODE_SHORT_BREAK;
}

function transitionAfterCompletion() {
	if (state.currentMode === MODE_FOCUS) {
		state.cycleCount += 1;
		state.currentMode = nextModeAfterFocus();
		syncDurationForCurrentMode(true);
		notifySessionEnd("作業セッションが完了しました。休憩に入りましょう。");
		return;
	}

	state.currentMode = MODE_FOCUS;
	syncDurationForCurrentMode(true);
	notifySessionEnd("休憩が終了しました。次の作業を開始しましょう。");
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
		if (
			typeof settings.focus_minutes !== "number" ||
			typeof settings.short_break_minutes !== "number" ||
			typeof settings.long_break_minutes !== "number" ||
			typeof settings.long_break_interval !== "number"
		) {
			setSettingsStatus("設定読込に失敗しました");
			return;
		}
		state.settings = {
			focus_minutes: Math.max(1, Math.floor(settings.focus_minutes)),
			short_break_minutes: Math.max(1, Math.floor(settings.short_break_minutes)),
			long_break_minutes: Math.max(1, Math.floor(settings.long_break_minutes)),
			long_break_interval: Math.max(1, Math.floor(settings.long_break_interval)),
		};
		syncDurationForCurrentMode(state.status !== "focus");
		syncSettingsInputs();
		render();
		saveState();
		setSettingsStatus("設定を読み込みました");
	} catch {
		setSettingsStatus("オフライン設定で動作中");
		// Keep local fallback when API is unavailable.
	}
}

async function pushSettingsToApi() {
	try {
		await fetchJSON(api.settings, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(state.settings),
		});
		setSettingsStatus("設定を保存しました");
	} catch {
		setSettingsStatus("設定保存に失敗しました");
	}
}

function applySettingsFromInputs() {
	const nextSettings = {
		focus_minutes: Math.max(1, Number.parseInt(ui.focusMinutesInput.value, 10) || 1),
		short_break_minutes: Math.max(
			1,
			Number.parseInt(ui.shortBreakMinutesInput.value, 10) || 1,
		),
		long_break_minutes: Math.max(
			1,
			Number.parseInt(ui.longBreakMinutesInput.value, 10) || 1,
		),
		long_break_interval: Math.max(
			1,
			Number.parseInt(ui.longBreakIntervalInput.value, 10) || 1,
		),
	};

	state.settings = nextSettings;
	syncDurationForCurrentMode(state.status !== "focus");
	syncSettingsInputs();
	render();
	saveState();
	void pushSettingsToApi();
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
	if (state.status === "paused") {
		ui.modeLabel.textContent = `${modeToLabel(state.currentMode)} (一時停止)`;
		return;
	}
	if (state.remainingSeconds === 0) {
		ui.modeLabel.textContent = "完了";
		return;
	}
	ui.modeLabel.textContent =
		state.status === "focus"
			? modeToLabel(state.currentMode)
			: `${modeToLabel(state.currentMode)} (待機)`;
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
		if (state.currentMode === MODE_FOCUS) {
			const actualSeconds = state.durationSeconds;
			state.completedCount += 1;
			state.totalFocusSeconds += state.durationSeconds;
			void postCompletedSession(actualSeconds);
		}
		transitionAfterCompletion();
		saveState();
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
			syncDurationForCurrentMode(true);
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
	state.currentMode = MODE_FOCUS;
	syncDurationForCurrentMode(true);
	state.endAt = null;
	render();
	saveState();
}

ui.startPauseButton.addEventListener("click", handleStartPause);
ui.resetButton.addEventListener("click", handleReset);
ui.focusMinutesInput.addEventListener("change", applySettingsFromInputs);
ui.shortBreakMinutesInput.addEventListener("change", applySettingsFromInputs);
ui.longBreakMinutesInput.addEventListener("change", applySettingsFromInputs);
ui.longBreakIntervalInput.addEventListener("change", applySettingsFromInputs);

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		onTick();
	}
});

loadState();
syncDurationForCurrentMode(state.status !== "focus");
syncSettingsInputs();

if (state.status === "focus") {
	startTicker();
}

render();

void loadSettingsFromApi();
void refreshStatsFromApi();
