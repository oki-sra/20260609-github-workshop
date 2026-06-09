from __future__ import annotations

from datetime import datetime, timezone

from services.gamification_service import GamificationService
from services.settings_service import SettingsService, ValidationError
from services.stats_service import StatsService


class SessionService:
    def __init__(self) -> None:
        self._settings_service = SettingsService()
        self._stats_service = StatsService()
        self._gamification_service = GamificationService()
        self._next_id = 1

    def record(self, payload: object) -> dict[str, int | str]:
        if not isinstance(payload, dict):
            raise ValidationError("JSON object is required")

        mode = payload.get("mode")
        if mode not in {"focus", "short_break", "long_break"}:
            raise ValidationError("mode must be focus, short_break, or long_break")

        status = payload.get("status")
        if status not in {"started", "completed", "interrupted"}:
            raise ValidationError("status must be started, completed, or interrupted")

        planned_seconds = payload.get("planned_seconds")
        if not isinstance(planned_seconds, int) or planned_seconds <= 0:
            raise ValidationError("planned_seconds must be a positive integer")

        actual_seconds = payload.get("actual_seconds", planned_seconds)
        if not isinstance(actual_seconds, int) or actual_seconds < 0:
            raise ValidationError("actual_seconds must be an integer >= 0")

        session = {
            "id": self._next_id,
            "mode": mode,
            "planned_seconds": planned_seconds,
            "actual_seconds": actual_seconds,
            "status": status,
            "recorded_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        self._next_id += 1

        if status == "completed" and mode == "focus":
            self._stats_service.add_completed_focus(actual_seconds)
            self._gamification_service.add_completed_pomodoro()

        return session

    def get_today_stats(self) -> dict[str, int | str]:
        return self._stats_service.get_today()

    def get_settings(self) -> dict[str, int]:
        return self._settings_service.get()

    def update_settings(self, payload: object) -> dict[str, int]:
        return self._settings_service.update(payload)

    def get_gamification(self) -> dict:
        return self._gamification_service.get_status()

    def get_weekly_stats(self) -> list[dict]:
        return self._gamification_service.get_weekly_stats()

    def get_monthly_stats(self) -> list[dict]:
        return self._gamification_service.get_monthly_stats()


__all__ = ["SessionService", "ValidationError"]
