from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime:
        """Return the current timestamp as a timezone-aware datetime."""


@dataclass(frozen=True)
class SystemClock:
    def now(self) -> datetime:
        return datetime.now(tz=UTC)


@dataclass
class FixedClock:
    current: datetime

    def now(self) -> datetime:
        return self.current

    def advance(self, seconds: int) -> None:
        self.current = self.current + timedelta(seconds=seconds)
