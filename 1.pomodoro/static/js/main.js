"use strict";

// ======================================================================
// Constants
// ======================================================================
const FOCUS_SECONDS = 25 * 60;
const STORAGE_KEY = "pomodoro.timer.state.v1";
const APPEARANCE_KEY = "pomodoro.appearance.v1";
const GAMIFICATION_KEY = "pomodoro.gamification.v1";
const MODE_FOCUS = "focus";
const MODE_SHORT_BREAK = "short_break";
const MODE_LONG_BREAK = "long_break";
const MODE_ORDER = [MODE_FOCUS, MODE_SHORT_BREAK, MODE_LONG_BREAK];

// Ring color: blue (start) → yellow (50%) → red (end)
const RING_COLOR_START = { r: 104, g: 118, b: 231 }; // #6876e7
const RING_COLOR_MID = { r: 240, g: 175, b: 40 };  // #f0af28
const RING_COLOR_END = { r: 231, g: 76, b: 60 };   // #e74c3c

// ======================================================================
// UI element references
// ======================================================================
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
	// New elements
	particleCanvas: document.getElementById("particleCanvas"),
	xpLevel: document.getElementById("xpLevel"),
	xpText: document.getElementById("xpText"),
	xpBarFill: document.getElementById("xpBarFill"),
	xpBarTrack: document.getElementById("xpBarTrack"),
	streakCount: document.getElementById("streakCount"),
	badgesGrid: document.getElementById("badgesGrid"),
	statsChart: document.getElementById("statsChart"),
	soundStartInput: document.getElementById("soundStartInput"),
	soundEndInput: document.getElementById("soundEndInput"),
	soundTickInput: document.getElementById("soundTickInput"),
};

// ======================================================================
// API routes
// ======================================================================
const api = {
	statsToday: "/api/stats/today",
	sessions: "/api/sessions",
	settings: "/api/settings",
	gamification: "/api/gamification",
	statsWeekly: "/api/stats/weekly",
	statsMonthly: "/api/stats/monthly",
};

// ======================================================================
// Appearance state (theme + sounds) – separate from timer state
// ======================================================================
let appearance = {
	theme: "light",
	soundStart: true,
	soundEnd: true,
	soundTick: false,
};

function loadAppearance() {
	try {
		const raw = window.localStorage.getItem(APPEARANCE_KEY);
		if (!raw) return;
		const parsed = safeParseJSON(raw);
		if (!parsed || typeof parsed !== "object") return;
		if (["light", "dark", "focus"].includes(parsed.theme)) {
			appearance.theme = parsed.theme;
		}
		if (typeof parsed.soundStart === "boolean") appearance.soundStart = parsed.soundStart;
		if (typeof parsed.soundEnd === "boolean") appearance.soundEnd = parsed.soundEnd;
		if (typeof parsed.soundTick === "boolean") appearance.soundTick = parsed.soundTick;
	} catch {
		// ignore
	}
}

function saveAppearance() {
	try {
		window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
	} catch {
		// ignore
	}
}

function applyTheme(theme) {
	document.documentElement.setAttribute("data-theme", theme);
	document.querySelectorAll(".theme-btn").forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.theme === theme);
	});
}

// ======================================================================
// Gamification local state
// ======================================================================
let gamification = {
	totalXp: 0,
	level: 1,
	xpInLevel: 0,
	xpPerLevel: 500,
	totalPomodoros: 0,
	currentStreak: 0,
	earnedBadges: [],
	allBadges: [],
};

function loadGamificationLocal() {
	try {
		const raw = window.localStorage.getItem(GAMIFICATION_KEY);
		if (!raw) return;
		const parsed = safeParseJSON(raw);
		if (!parsed || typeof parsed !== "object") return;
		if (typeof parsed.totalXp === "number") gamification.totalXp = Math.max(0, parsed.totalXp);
		if (typeof parsed.level === "number") gamification.level = Math.max(1, parsed.level);
		if (typeof parsed.xpInLevel === "number") gamification.xpInLevel = Math.max(0, parsed.xpInLevel);
		if (typeof parsed.xpPerLevel === "number") gamification.xpPerLevel = Math.max(1, parsed.xpPerLevel);
		if (typeof parsed.totalPomodoros === "number") gamification.totalPomodoros = Math.max(0, parsed.totalPomodoros);
		if (typeof parsed.currentStreak === "number") gamification.currentStreak = Math.max(0, parsed.currentStreak);
		if (Array.isArray(parsed.earnedBadges)) gamification.earnedBadges = parsed.earnedBadges;
		if (Array.isArray(parsed.allBadges)) gamification.allBadges = parsed.allBadges;
	} catch {
		// ignore
	}
}

function saveGamificationLocal() {
	try {
		window.localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(gamification));
	} catch {
		// ignore
	}
}

// ======================================================================
// Timer state
// ======================================================================
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
	if (mode === MODE_FOCUS) return "作業中";
	if (mode === MODE_SHORT_BREAK) return "短休憩";
	if (mode === MODE_LONG_BREAK) return "長休憩";
	return "待機中";
}

function isMode(value) {
	return MODE_ORDER.includes(value);
}

function modeDurationSeconds(mode, settings) {
	if (mode === MODE_SHORT_BREAK) return settings.short_break_minutes * 60;
	if (mode === MODE_LONG_BREAK) return settings.long_break_minutes * 60;
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
	updatePresetButtons();
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
	if (raw === null || typeof raw !== "object") return null;

	const status =
		raw.status === "idle" || raw.status === "focus" || raw.status === "paused"
			? raw.status
			: "idle";
	const currentMode = isMode(raw.currentMode) ? raw.currentMode : MODE_FOCUS;

	let cycleCount = Math.max(0, Math.floor(asSafeNumber(raw.cycleCount, 0)));
	if (!Number.isFinite(cycleCount)) cycleCount = 0;

	const settingsRaw = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
	const settings = {
		focus_minutes: Math.max(1, Math.floor(asSafeNumber(settingsRaw.focus_minutes, 25))),
		short_break_minutes: Math.max(1, Math.floor(asSafeNumber(settingsRaw.short_break_minutes, 5))),
		long_break_minutes: Math.max(1, Math.floor(asSafeNumber(settingsRaw.long_break_minutes, 15))),
		long_break_interval: Math.max(1, Math.floor(asSafeNumber(settingsRaw.long_break_interval, 4))),
	};

	const durationSeconds = Math.max(
		1,
		Math.floor(asSafeNumber(raw.durationSeconds, modeDurationSeconds(currentMode, settings))),
	);
	const remainingSeconds = Math.max(
		0,
		Math.min(durationSeconds, Math.floor(asSafeNumber(raw.remainingSeconds, durationSeconds))),
	);

	let endAt = null;
	if (asSafeNumber(raw.endAt, null) !== null) {
		endAt = asSafeNumber(raw.endAt, null);
	}

	const completedCount = Math.max(0, Math.floor(asSafeNumber(raw.completedCount, 0)));
	const totalFocusSeconds = Math.max(0, Math.floor(asSafeNumber(raw.totalFocusSeconds, 0)));
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

// ======================================================================
// Sound system
// ======================================================================
function playTone(frequency, duration, gainValue = 0.04) {
	try {
		const context = new window.AudioContext();
		const oscillator = context.createOscillator();
		const gainNode = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency;
		gainNode.gain.value = gainValue;
		oscillator.connect(gainNode);
		gainNode.connect(context.destination);
		oscillator.start();
		oscillator.stop(context.currentTime + duration);
	} catch {
		// ignore if AudioContext unavailable
	}
}

function playStartSound() {
	if (!appearance.soundStart) return;
	playTone(523, 0.12); // C5
	setTimeout(() => playTone(659, 0.12), 130); // E5
}

function playEndSound() {
	if (!appearance.soundEnd) return;
	playTone(880, 0.18, 0.04); // A5
	setTimeout(() => playTone(1047, 0.18, 0.04), 200); // C6
	setTimeout(() => playTone(1319, 0.3, 0.03), 400); // E6
}

function playTickSound() {
	if (!appearance.soundTick) return;
	playTone(1000, 0.03, 0.015);
}

// ======================================================================
// Notification
// ======================================================================
function notifySessionEnd(message) {
	playEndSound();
	if (!("Notification" in window)) return;
	if (Notification.permission === "granted") {
		new Notification("ポモドーロタイマー", { body: message });
		return;
	}
	if (Notification.permission === "default") {
		void Notification.requestPermission();
	}
}

// ======================================================================
// Ring color interpolation (blue→yellow→red)
// ======================================================================
function lerpColor(a, b, t) {
	return {
		r: Math.round(a.r + (b.r - a.r) * t),
		g: Math.round(a.g + (b.g - a.g) * t),
		b: Math.round(a.b + (b.b - a.b) * t),
	};
}

function ringColorForProgress(ratio) {
	// ratio: 0 = start (blue), 1 = end (red)
	const t = Math.max(0, Math.min(1, ratio));
	let c;
	if (t < 0.5) {
		c = lerpColor(RING_COLOR_START, RING_COLOR_MID, t * 2);
	} else {
		c = lerpColor(RING_COLOR_MID, RING_COLOR_END, (t - 0.5) * 2);
	}
	return `rgb(${c.r},${c.g},${c.b})`;
}

function updateRing() {
	const ratio =
		(state.durationSeconds - state.remainingSeconds) / state.durationSeconds;
	const progressRatio = Math.min(1, Math.max(0, ratio));
	const progressDeg = progressRatio * 360;
	ui.progressRing.style.setProperty("--progress", `${progressDeg}deg`);

	// Color changes only during focus mode
	if (state.currentMode === MODE_FOCUS && state.status !== "idle") {
		const color = ringColorForProgress(progressRatio);
		ui.progressRing.style.setProperty("--ring-color", color);
	} else {
		ui.progressRing.style.removeProperty("--ring-color");
	}
}

// ======================================================================
// Particle system (canvas overlay – focus mode only)
// ======================================================================
const particleCtx = ui.particleCanvas ? ui.particleCanvas.getContext("2d") : null;
const particles = [];
const PARTICLE_MAX = 30;

function resizeParticleCanvas() {
	if (!ui.particleCanvas) return;
	ui.particleCanvas.width = window.innerWidth;
	ui.particleCanvas.height = window.innerHeight;
}

function spawnParticle() {
	const theme = appearance.theme;
	const colors =
		theme === "focus"
			? ["rgba(76,175,80,0.6)", "rgba(129,199,132,0.5)", "rgba(200,230,201,0.4)"]
			: theme === "dark"
			? ["rgba(123,143,232,0.6)", "rgba(160,170,240,0.5)", "rgba(200,210,255,0.4)"]
			: ["rgba(104,118,231,0.55)", "rgba(130,150,240,0.5)", "rgba(180,190,255,0.4)"];

	particles.push({
		x: Math.random() * window.innerWidth,
		y: window.innerHeight + 10,
		vx: (Math.random() - 0.5) * 0.6,
		vy: -(0.4 + Math.random() * 0.8),
		size: 2 + Math.random() * 4,
		alpha: 0.7 + Math.random() * 0.3,
		color: colors[Math.floor(Math.random() * colors.length)],
	});
}

let particleRafId = null;
let lastSpawnTime = 0;

function animateParticles(timestamp) {
	if (!particleCtx) return;
	particleCtx.clearRect(0, 0, ui.particleCanvas.width, ui.particleCanvas.height);

	const isFocus = state.status === "focus" && state.currentMode === MODE_FOCUS;

	// Spawn new particles during focus mode
	if (isFocus && particles.length < PARTICLE_MAX && timestamp - lastSpawnTime > 200) {
		spawnParticle();
		lastSpawnTime = timestamp;
	}

	for (let i = particles.length - 1; i >= 0; i--) {
		const p = particles[i];
		p.x += p.vx;
		p.y += p.vy;
		// Fade out when near top
		if (p.y < window.innerHeight * 0.3) {
			p.alpha -= 0.005;
		}
		if (p.alpha <= 0 || p.y < -20) {
			particles.splice(i, 1);
			continue;
		}
		particleCtx.save();
		particleCtx.globalAlpha = p.alpha;
		particleCtx.fillStyle = p.color;
		particleCtx.beginPath();
		particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
		particleCtx.fill();
		particleCtx.restore();
	}

	particleRafId = requestAnimationFrame(animateParticles);
}

function startParticles() {
	if (particleRafId !== null) return;
	resizeParticleCanvas();
	particleRafId = requestAnimationFrame(animateParticles);
}

function stopParticles() {
	if (particleRafId !== null) {
		cancelAnimationFrame(particleRafId);
		particleRafId = null;
	}
	particles.length = 0;
	if (particleCtx) {
		particleCtx.clearRect(0, 0, ui.particleCanvas.width, ui.particleCanvas.height);
	}
}

window.addEventListener("resize", resizeParticleCanvas);

// ======================================================================
// Chart rendering
// ======================================================================
let chartData = [];
let chartPeriod = "weekly";

function renderChart(data) {
	const canvas = ui.statsChart;
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	const dpr = window.devicePixelRatio || 1;
	const displayW = canvas.clientWidth || 360;
	const displayH = canvas.clientHeight || 140;
	canvas.width = displayW * dpr;
	canvas.height = displayH * dpr;
	ctx.scale(dpr, dpr);

	const w = displayW;
	const h = displayH;
	const padL = 28;
	const padR = 8;
	const padT = 10;
	const padB = 24;
	const chartW = w - padL - padR;
	const chartH = h - padT - padB;

	const counts = data.map((d) => d.completed_pomodoros);
	const maxCount = Math.max(1, ...counts);
	const barCount = data.length;
	const gapRatio = 0.25;
	const barWidth = (chartW / barCount) * (1 - gapRatio);
	const gap = (chartW / barCount) * gapRatio;

	// Background
	ctx.clearRect(0, 0, w, h);

	// Y-axis gridlines (0, mid, max)
	const style = getComputedStyle(document.documentElement);
	const chartBg = style.getPropertyValue("--chart-bg").trim() || "#dfe1e8";
	const chartBarColor = style.getPropertyValue("--chart-bar").trim() || "#6876e7";
	const textColor = style.getPropertyValue("--muted").trim() || "#61636f";

	ctx.strokeStyle = chartBg;
	ctx.lineWidth = 1;
	for (let i = 0; i <= 2; i++) {
		const y = padT + chartH - (i / 2) * chartH;
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(padL + chartW, y);
		ctx.stroke();
	}

	// Bars
	for (let i = 0; i < barCount; i++) {
		const count = counts[i];
		const barH = (count / maxCount) * chartH;
		const x = padL + i * (barWidth + gap) + gap / 2;
		const y = padT + chartH - barH;

		ctx.fillStyle = chartBarColor;
		ctx.beginPath();
		const radius = Math.min(3, barWidth / 2);
		ctx.roundRect(x, y, barWidth, barH, [radius, radius, 0, 0]);
		ctx.fill();
	}

	// X-axis labels (show only some labels based on period)
	ctx.fillStyle = textColor;
	ctx.font = `${Math.max(9, Math.min(11, Math.floor(chartW / barCount * 0.65)))}px sans-serif`;
	ctx.textAlign = "center";
	const labelStep = barCount <= 7 ? 1 : Math.ceil(barCount / 7);
	for (let i = 0; i < barCount; i += labelStep) {
		const item = data[i];
		const parts = item.date.split("-");
		const label = `${parts[1]}/${parts[2]}`;
		const x = padL + i * (barWidth + gap) + gap / 2 + barWidth / 2;
		ctx.fillText(label, x, h - 6);
	}

	// Y-axis label
	ctx.textAlign = "right";
	ctx.font = "9px sans-serif";
	ctx.fillText(String(maxCount), padL - 3, padT + 4);
	ctx.fillText("0", padL - 3, padT + chartH);
}

async function loadAndRenderChart() {
	try {
		const url = chartPeriod === "weekly" ? api.statsWeekly : api.statsMonthly;
		const data = await fetchJSON(url);
		if (Array.isArray(data)) {
			chartData = data;
			renderChart(chartData);
		}
	} catch {
		// Keep local empty chart on API failure
		renderChart([]);
	}
}

// ======================================================================
// Gamification display
// ======================================================================
function renderGamification() {
	// XP bar
	const pct = Math.min(100, (gamification.xpInLevel / gamification.xpPerLevel) * 100);
	if (ui.xpBarFill) ui.xpBarFill.style.width = `${pct}%`;
	if (ui.xpBarTrack) {
		ui.xpBarTrack.setAttribute("aria-valuenow", String(gamification.xpInLevel));
		ui.xpBarTrack.setAttribute("aria-valuemax", String(gamification.xpPerLevel));
	}
	if (ui.xpLevel) ui.xpLevel.textContent = `Lv.${gamification.level}`;
	if (ui.xpText) {
		ui.xpText.textContent = `${gamification.xpInLevel} / ${gamification.xpPerLevel} XP`;
	}
	// Streak
	if (ui.streakCount) ui.streakCount.textContent = String(gamification.currentStreak);
	// Badges
	if (ui.badgesGrid) renderBadges();
}

function renderBadges() {
	const earnedIds = new Set(gamification.earnedBadges.map((b) => (typeof b === "string" ? b : b.id)));
	const allBadges = gamification.allBadges.length
		? gamification.allBadges
		: [
				{ id: "first_pomodoro", name: "初回達成", description: "初めてポモドーロを完了", icon: "🍅" },
				{ id: "ten_pomodoros", name: "十番勝負", description: "合計10回ポモドーロを完了", icon: "🏆" },
				{ id: "streak_3", name: "3日連続", description: "3日連続でポモドーロを完了", icon: "🔥" },
				{ id: "weekly_10", name: "週10回達成", description: "1週間で10回ポモドーロを完了", icon: "📅" },
		  ];

	ui.badgesGrid.innerHTML = allBadges
		.map((badge) => {
			const earned = earnedIds.has(badge.id);
			return `<div class="badge-item${earned ? "" : " locked"}" title="${badge.description}">
  <span class="badge-icon">${badge.icon}</span>
  <div class="badge-info">
    <span class="badge-name">${badge.name}</span>
    <span class="badge-desc">${badge.description}</span>
  </div>
</div>`;
		})
		.join("");
}

function applyGamificationFromApi(data) {
	if (!data || typeof data !== "object") return;
	if (typeof data.total_xp === "number") gamification.totalXp = data.total_xp;
	if (typeof data.level === "number") gamification.level = data.level;
	if (typeof data.xp_in_level === "number") gamification.xpInLevel = data.xp_in_level;
	if (typeof data.xp_per_level === "number") gamification.xpPerLevel = data.xp_per_level;
	if (typeof data.total_pomodoros === "number") gamification.totalPomodoros = data.total_pomodoros;
	if (typeof data.current_streak === "number") gamification.currentStreak = data.current_streak;
	if (Array.isArray(data.earned_badges)) gamification.earnedBadges = data.earned_badges;
	if (Array.isArray(data.all_badges)) gamification.allBadges = data.all_badges;
}

async function refreshGamificationFromApi() {
	try {
		const data = await fetchJSON(api.gamification);
		applyGamificationFromApi(data);
		saveGamificationLocal();
		renderGamification();
	} catch {
		// Keep local fallback
	}
}

// ======================================================================
// Preset buttons
// ======================================================================
function updatePresetButtons() {
	document.querySelectorAll(".preset-btn").forEach((btn) => {
		const type = btn.dataset.presetType;
		const value = Number.parseInt(btn.dataset.value, 10);
		let current;
		if (type === "focus") current = state.settings.focus_minutes;
		else if (type === "short") current = state.settings.short_break_minutes;
		else if (type === "long") current = state.settings.long_break_minutes;
		btn.classList.toggle("active", current === value);
	});
}

function handlePresetClick(btn) {
	const type = btn.dataset.presetType;
	const value = Number.parseInt(btn.dataset.value, 10);
	if (!Number.isFinite(value) || value <= 0) return;

	if (type === "focus") {
		state.settings.focus_minutes = value;
	} else if (type === "short") {
		state.settings.short_break_minutes = value;
	} else if (type === "long") {
		state.settings.long_break_minutes = value;
	}

	syncDurationForCurrentMode(state.status !== "focus");
	syncSettingsInputs();
	render();
	saveState();
	void pushSettingsToApi();
}

// ======================================================================
// Session state persistence
// ======================================================================
function saveState() {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// ignore
	}
}

function resetStatsIfNewDay() {
	const today = todayKey();
	if (state.statsDate === today) return false;
	state.completedCount = 0;
	state.totalFocusSeconds = 0;
	state.statsDate = today;
	return true;
}

function loadState() {
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return;
	const parsed = safeParseJSON(raw);
	const loaded = normalizeLoadedState(parsed);
	if (!loaded) return;
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

// ======================================================================
// API helpers
// ======================================================================
async function fetchJSON(url, options = undefined) {
	const response = await window.fetch(url, options);
	if (!response.ok) throw new Error(`Request failed: ${response.status}`);
	return response.json();
}

function applyStatsFromApi(stats) {
	if (!stats || typeof stats !== "object") return;
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
		// Keep local fallback
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
	}
}

async function pushSettingsToApi() {
	try {
		await fetchJSON(api.settings, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
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
		short_break_minutes: Math.max(1, Number.parseInt(ui.shortBreakMinutesInput.value, 10) || 1),
		long_break_minutes: Math.max(1, Number.parseInt(ui.longBreakMinutesInput.value, 10) || 1),
		long_break_interval: Math.max(1, Number.parseInt(ui.longBreakIntervalInput.value, 10) || 1),
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
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				mode: "focus",
				planned_seconds: state.durationSeconds,
				actual_seconds: Math.max(0, Math.floor(actualSeconds)),
				status: "completed",
			}),
		});
		await refreshStatsFromApi();
		await refreshGamificationFromApi();
		await loadAndRenderChart();
	} catch {
		// Keep local fallback
	}
}

// ======================================================================
// Formatting
// ======================================================================
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
	if (deltaMs <= 0) return 0;
	return Math.ceil(deltaMs / 1000);
}

function syncRemainingIfRunning() {
	if (state.status !== "focus" || state.endAt === null) return;
	state.remainingSeconds = remainingFromEndAt(state.endAt);
}

// ======================================================================
// Render
// ======================================================================
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
	renderGamification();
	if (statsReset) saveState();
}

// ======================================================================
// Mode transitions
// ======================================================================
function nextModeAfterFocus() {
	const nextCycle = state.cycleCount + 1;
	if (nextCycle % state.settings.long_break_interval === 0) return MODE_LONG_BREAK;
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

// ======================================================================
// Ticker
// ======================================================================
function stopTicker() {
	if (tickerId !== null) {
		window.clearInterval(tickerId);
		tickerId = null;
	}
}

function onTick() {
	syncRemainingIfRunning();
	playTickSound();
	if (state.status === "focus" && state.remainingSeconds === 0) {
		stopTicker();
		stopParticles();
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

// ======================================================================
// Event handlers
// ======================================================================
function handleStartPause() {
	if (state.status === "idle") {
		if (state.remainingSeconds === 0) syncDurationForCurrentMode(true);
		state.status = "focus";
		state.endAt = Date.now() + state.remainingSeconds * 1000;
		startTicker();
		startParticles();
		playStartSound();
		render();
		saveState();
		return;
	}
	if (state.status === "focus") {
		syncRemainingIfRunning();
		state.status = "paused";
		state.endAt = null;
		stopTicker();
		stopParticles();
		render();
		saveState();
		return;
	}
	if (state.status === "paused") {
		state.status = "focus";
		state.endAt = Date.now() + state.remainingSeconds * 1000;
		startTicker();
		startParticles();
		playStartSound();
		render();
		saveState();
	}
}

function handleReset() {
	stopTicker();
	stopParticles();
	state.status = "idle";
	state.currentMode = MODE_FOCUS;
	syncDurationForCurrentMode(true);
	state.endAt = null;
	render();
	saveState();
}

function handleSoundChange() {
	appearance.soundStart = ui.soundStartInput.checked;
	appearance.soundEnd = ui.soundEndInput.checked;
	appearance.soundTick = ui.soundTickInput.checked;
	saveAppearance();
}

function syncSoundInputs() {
	if (ui.soundStartInput) ui.soundStartInput.checked = appearance.soundStart;
	if (ui.soundEndInput) ui.soundEndInput.checked = appearance.soundEnd;
	if (ui.soundTickInput) ui.soundTickInput.checked = appearance.soundTick;
}

// ======================================================================
// Event listeners
// ======================================================================
ui.startPauseButton.addEventListener("click", handleStartPause);
ui.resetButton.addEventListener("click", handleReset);
ui.focusMinutesInput.addEventListener("change", applySettingsFromInputs);
ui.shortBreakMinutesInput.addEventListener("change", applySettingsFromInputs);
ui.longBreakMinutesInput.addEventListener("change", applySettingsFromInputs);
ui.longBreakIntervalInput.addEventListener("change", applySettingsFromInputs);

if (ui.soundStartInput) ui.soundStartInput.addEventListener("change", handleSoundChange);
if (ui.soundEndInput) ui.soundEndInput.addEventListener("change", handleSoundChange);
if (ui.soundTickInput) ui.soundTickInput.addEventListener("change", handleSoundChange);

// Theme buttons
document.querySelectorAll(".theme-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		appearance.theme = btn.dataset.theme;
		applyTheme(appearance.theme);
		saveAppearance();
		// Refresh chart with updated colors
		renderChart(chartData);
	});
});

// Preset buttons
document.querySelectorAll(".preset-btn").forEach((btn) => {
	btn.addEventListener("click", () => handlePresetClick(btn));
});

// Chart tabs
document.querySelectorAll(".chart-tab").forEach((tab) => {
	tab.addEventListener("click", () => {
		chartPeriod = tab.dataset.period;
		document.querySelectorAll(".chart-tab").forEach((t) => {
			t.classList.toggle("active", t === tab);
			t.setAttribute("aria-selected", t === tab ? "true" : "false");
		});
		void loadAndRenderChart();
	});
});

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		onTick();
	}
});

window.addEventListener("resize", () => {
	if (chartData.length) renderChart(chartData);
});

// ======================================================================
// Initialization
// ======================================================================
loadState();
loadAppearance();
loadGamificationLocal();
applyTheme(appearance.theme);
syncSoundInputs();
syncDurationForCurrentMode(state.status !== "focus");
syncSettingsInputs();

if (state.status === "focus") {
	startTicker();
	startParticles();
}

render();

void loadSettingsFromApi();
void refreshStatsFromApi();
void refreshGamificationFromApi();
void loadAndRenderChart();
