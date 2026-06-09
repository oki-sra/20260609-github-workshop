from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class TimerStatus(StrEnum):
    IDLE = "idle"
    FOCUS = "focus"
    PAUSED = "paused"


class TimerEvent(StrEnum):
    START = "START"
    PAUSE = "PAUSE"
    RESUME = "RESUME"
    RESET = "RESET"
    TICK = "TICK"


@dataclass(frozen=True)
class TimerState:
    status: TimerStatus
    focus_seconds: int
    remaining_seconds: int
    end_time: datetime | None
    completed: bool = False


DEFAULT_FOCUS_SECONDS = 25 * 60


def initial_state(focus_seconds: int = DEFAULT_FOCUS_SECONDS) -> TimerState:
    return TimerState(
        status=TimerStatus.IDLE,
        focus_seconds=focus_seconds,
        remaining_seconds=focus_seconds,
        end_time=None,
        completed=False,
    )
