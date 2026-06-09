from __future__ import annotations

from datetime import datetime


class StatsService:
    def __init__(self) -> None:
        self._daily_stats: dict[str, dict[str, int]] = {}

    def get_today(self) -> dict[str, int | str]:
        date_key = self._today_key()
        row = self._daily_stats.get(
            date_key,
            {"completed_pomodoros": 0, "total_focus_seconds": 0},
        )
        return {
            "date": date_key,
            "completed_pomodoros": row["completed_pomodoros"],
            "total_focus_seconds": row["total_focus_seconds"],
        }

    def add_completed_focus(self, focus_seconds: int) -> dict[str, int | str]:
        date_key = self._today_key()
        row = self._daily_stats.setdefault(
            date_key,
            {"completed_pomodoros": 0, "total_focus_seconds": 0},
        )
        row["completed_pomodoros"] += 1
        row["total_focus_seconds"] += focus_seconds
        return {
            "date": date_key,
            "completed_pomodoros": row["completed_pomodoros"],
            "total_focus_seconds": row["total_focus_seconds"],
        }

    def _today_key(self) -> str:
        return datetime.now().strftime("%Y-%m-%d")
