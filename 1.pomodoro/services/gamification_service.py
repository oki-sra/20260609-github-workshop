from __future__ import annotations

from datetime import date, timedelta

XP_PER_POMODORO = 100
XP_PER_LEVEL = 500

BADGES: list[dict] = [
    {
        "id": "first_pomodoro",
        "name": "初回達成",
        "description": "初めてポモドーロを完了",
        "icon": "🍅",
    },
    {
        "id": "ten_pomodoros",
        "name": "十番勝負",
        "description": "合計10回ポモドーロを完了",
        "icon": "🏆",
    },
    {
        "id": "streak_3",
        "name": "3日連続",
        "description": "3日連続でポモドーロを完了",
        "icon": "🔥",
    },
    {
        "id": "weekly_10",
        "name": "週10回達成",
        "description": "1週間で10回ポモドーロを完了",
        "icon": "📅",
    },
]


def _xp_to_level(total_xp: int) -> int:
    return total_xp // XP_PER_LEVEL + 1


def _xp_in_current_level(total_xp: int) -> int:
    return total_xp % XP_PER_LEVEL


class GamificationService:
    def __init__(self) -> None:
        self._total_xp: int = 0
        self._total_pomodoros: int = 0
        self._daily_counts: dict[str, int] = {}
        self._earned_badge_ids: set[str] = set()

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def add_completed_pomodoro(self) -> dict:
        today = self._today_key()
        self._total_xp += XP_PER_POMODORO
        self._total_pomodoros += 1
        self._daily_counts[today] = self._daily_counts.get(today, 0) + 1

        new_badge_ids = self._check_new_badges()
        new_badges = [b for b in BADGES if b["id"] in new_badge_ids]

        return {
            "xp_gained": XP_PER_POMODORO,
            "total_xp": self._total_xp,
            "level": _xp_to_level(self._total_xp),
            "new_badges": new_badges,
        }

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_status(self) -> dict:
        level = _xp_to_level(self._total_xp)
        xp_in_level = _xp_in_current_level(self._total_xp)
        earned = [b for b in BADGES if b["id"] in self._earned_badge_ids]
        return {
            "total_xp": self._total_xp,
            "level": level,
            "xp_in_level": xp_in_level,
            "xp_per_level": XP_PER_LEVEL,
            "total_pomodoros": self._total_pomodoros,
            "current_streak": self._current_streak(),
            "earned_badges": earned,
            "all_badges": BADGES,
        }

    def get_weekly_stats(self) -> list[dict]:
        today = date.today()
        return [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "completed_pomodoros": self._daily_counts.get(
                    (today - timedelta(days=i)).isoformat(), 0
                ),
            }
            for i in range(6, -1, -1)
        ]

    def get_monthly_stats(self) -> list[dict]:
        today = date.today()
        return [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "completed_pomodoros": self._daily_counts.get(
                    (today - timedelta(days=i)).isoformat(), 0
                ),
            }
            for i in range(29, -1, -1)
        ]

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _today_key() -> str:
        return date.today().isoformat()

    def _current_streak(self) -> int:
        streak = 0
        current = date.today()
        while self._daily_counts.get(current.isoformat(), 0) > 0:
            streak += 1
            current -= timedelta(days=1)
        return streak

    def _current_week_pomodoros(self) -> int:
        today = date.today()
        iso_year, iso_week, _ = today.isocalendar()
        total = 0
        for date_str, count in self._daily_counts.items():
            try:
                d = date.fromisoformat(date_str)
                y, w, _ = d.isocalendar()
                if y == iso_year and w == iso_week:
                    total += count
            except ValueError:
                pass
        return total

    def _check_new_badges(self) -> list[str]:
        new: list[str] = []
        streak = self._current_streak()
        weekly = self._current_week_pomodoros()

        conditions: dict[str, bool] = {
            "first_pomodoro": self._total_pomodoros >= 1,
            "ten_pomodoros": self._total_pomodoros >= 10,
            "streak_3": streak >= 3,
            "weekly_10": weekly >= 10,
        }

        for badge_id, earned in conditions.items():
            if earned and badge_id not in self._earned_badge_ids:
                self._earned_badge_ids.add(badge_id)
                new.append(badge_id)

        return new
