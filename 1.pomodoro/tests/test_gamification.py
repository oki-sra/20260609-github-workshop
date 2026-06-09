from __future__ import annotations

from datetime import date, timedelta

import pytest

from services.gamification_service import (
    BADGES,
    XP_PER_LEVEL,
    XP_PER_POMODORO,
    GamificationService,
    _xp_in_current_level,
    _xp_to_level,
)


# ------------------------------------------------------------------ helpers --


def _service_with_pomodoros(n: int) -> GamificationService:
    svc = GamificationService()
    for _ in range(n):
        svc.add_completed_pomodoro()
    return svc


# -------------------------------------------------------------- unit tests --


def test_xp_to_level_starts_at_one() -> None:
    assert _xp_to_level(0) == 1


def test_xp_to_level_increases() -> None:
    assert _xp_to_level(XP_PER_LEVEL) == 2
    assert _xp_to_level(XP_PER_LEVEL * 2) == 3


def test_xp_in_current_level() -> None:
    assert _xp_in_current_level(0) == 0
    assert _xp_in_current_level(XP_PER_POMODORO) == XP_PER_POMODORO
    assert _xp_in_current_level(XP_PER_LEVEL) == 0


def test_add_completed_pomodoro_returns_xp_info() -> None:
    svc = GamificationService()
    result = svc.add_completed_pomodoro()

    assert result["xp_gained"] == XP_PER_POMODORO
    assert result["total_xp"] == XP_PER_POMODORO
    assert result["level"] == 1
    assert isinstance(result["new_badges"], list)


def test_get_status_defaults() -> None:
    svc = GamificationService()
    status = svc.get_status()

    assert status["total_xp"] == 0
    assert status["level"] == 1
    assert status["xp_in_level"] == 0
    assert status["xp_per_level"] == XP_PER_LEVEL
    assert status["total_pomodoros"] == 0
    assert status["current_streak"] == 0
    assert status["earned_badges"] == []
    assert len(status["all_badges"]) == len(BADGES)


def test_first_pomodoro_badge_earned() -> None:
    svc = GamificationService()
    result = svc.add_completed_pomodoro()

    earned_ids = [b["id"] for b in svc.get_status()["earned_badges"]]
    assert "first_pomodoro" in earned_ids
    new_badge_ids = [b["id"] for b in result["new_badges"]]
    assert "first_pomodoro" in new_badge_ids


def test_ten_pomodoros_badge_not_earned_early() -> None:
    svc = _service_with_pomodoros(9)
    earned_ids = [b["id"] for b in svc.get_status()["earned_badges"]]
    assert "ten_pomodoros" not in earned_ids


def test_ten_pomodoros_badge_earned_at_ten() -> None:
    svc = _service_with_pomodoros(10)
    earned_ids = [b["id"] for b in svc.get_status()["earned_badges"]]
    assert "ten_pomodoros" in earned_ids


def test_level_up_at_xp_threshold() -> None:
    svc = _service_with_pomodoros(XP_PER_LEVEL // XP_PER_POMODORO)
    status = svc.get_status()
    assert status["level"] == 2
    assert status["xp_in_level"] == 0


def test_streak_single_day() -> None:
    svc = GamificationService()
    svc.add_completed_pomodoro()
    assert svc.get_status()["current_streak"] == 1


def test_streak_badge_requires_three_consecutive_days(monkeypatch: pytest.MonkeyPatch) -> None:
    # Simulate 3 consecutive days
    base = date(2026, 6, 7)
    call_count = 0

    def fake_today() -> date:
        nonlocal call_count
        # Each call to add_completed_pomodoro hits _today_key once; advance day every call
        d = base + timedelta(days=call_count)
        call_count += 1
        return d

    monkeypatch.setattr("services.gamification_service.date", _make_fake_date(base))

    svc = GamificationService()
    # Day 1
    _monkeypatch_today(monkeypatch, date(2026, 6, 7))
    svc.add_completed_pomodoro()
    # Day 2
    _monkeypatch_today(monkeypatch, date(2026, 6, 8))
    svc.add_completed_pomodoro()
    # Day 3 – badge should now be awarded
    _monkeypatch_today(monkeypatch, date(2026, 6, 9))
    result = svc.add_completed_pomodoro()

    assert "streak_3" in result["new_badges"] or "streak_3" in [b["id"] for b in result["new_badges"]]


def test_weekly_stats_returns_seven_days() -> None:
    svc = GamificationService()
    stats = svc.get_weekly_stats()
    assert len(stats) == 7
    for item in stats:
        assert "date" in item
        assert "completed_pomodoros" in item


def test_monthly_stats_returns_thirty_days() -> None:
    svc = GamificationService()
    stats = svc.get_monthly_stats()
    assert len(stats) == 30


def test_weekly_stats_reflects_added_pomodoro() -> None:
    svc = GamificationService()
    svc.add_completed_pomodoro()
    stats = svc.get_weekly_stats()
    today_str = date.today().isoformat()
    today_entry = next(s for s in stats if s["date"] == today_str)
    assert today_entry["completed_pomodoros"] == 1


# ------------------------------------------------------------------helpers --


def _make_fake_date(fixed: date):
    """Return a fake date class that always returns *fixed* from today()."""

    class _FakeDate(date):
        @classmethod
        def today(cls) -> date:  # type: ignore[override]
            return fixed

    return _FakeDate


def _monkeypatch_today(monkeypatch: pytest.MonkeyPatch, fixed: date) -> None:
    import services.gamification_service as mod

    class _FakeDate(date):
        @classmethod
        def today(cls) -> date:  # type: ignore[override]
            return fixed

    monkeypatch.setattr(mod, "date", _FakeDate)
