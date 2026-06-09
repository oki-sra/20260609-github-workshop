from __future__ import annotations

from datetime import UTC, datetime, timedelta

from domain.timer_engine import handle_event
from domain.timer_state import TimerEvent, TimerStatus, initial_state


class FakeClock:
    def __init__(self, current: datetime) -> None:
        self.current = current

    def now(self) -> datetime:
        return self.current

    def advance(self, seconds: int) -> None:
        self.current = self.current + timedelta(seconds=seconds)


def test_start_from_idle_transitions_to_focus() -> None:
    clock = FakeClock(datetime(2026, 6, 9, 9, 0, 0, tzinfo=UTC))
    state = initial_state(focus_seconds=1500)

    next_state = handle_event(state, TimerEvent.START, clock)

    assert next_state.status == TimerStatus.FOCUS
    assert next_state.remaining_seconds == 1500
    assert next_state.end_time == clock.now() + timedelta(seconds=1500)
    assert next_state.completed is False


def test_pause_and_resume_keeps_remaining_time() -> None:
    clock = FakeClock(datetime(2026, 6, 9, 9, 0, 0, tzinfo=UTC))
    state = handle_event(initial_state(focus_seconds=600), TimerEvent.START, clock)

    clock.advance(125)
    paused = handle_event(state, TimerEvent.PAUSE, clock)
    resumed = handle_event(paused, TimerEvent.RESUME, clock)

    assert paused.status == TimerStatus.PAUSED
    assert paused.remaining_seconds == 475
    assert paused.end_time is None
    assert resumed.status == TimerStatus.FOCUS
    assert resumed.end_time == clock.now() + timedelta(seconds=475)


def test_tick_updates_remaining_from_end_time() -> None:
    clock = FakeClock(datetime(2026, 6, 9, 9, 0, 0, tzinfo=UTC))
    state = handle_event(initial_state(focus_seconds=120), TimerEvent.START, clock)

    clock.advance(19)
    ticked = handle_event(state, TimerEvent.TICK, clock)

    assert ticked.remaining_seconds == 101
    assert ticked.status == TimerStatus.FOCUS


def test_tick_completes_session_on_timeout_boundary() -> None:
    clock = FakeClock(datetime(2026, 6, 9, 9, 0, 0, tzinfo=UTC))
    state = handle_event(initial_state(focus_seconds=5), TimerEvent.START, clock)

    clock.advance(5)
    completed = handle_event(state, TimerEvent.TICK, clock)

    assert completed.status == TimerStatus.IDLE
    assert completed.remaining_seconds == 0
    assert completed.completed is True
    assert completed.end_time is None


def test_reset_returns_to_initial_state() -> None:
    clock = FakeClock(datetime(2026, 6, 9, 9, 0, 0, tzinfo=UTC))
    state = handle_event(initial_state(focus_seconds=300), TimerEvent.START, clock)
    clock.advance(20)
    state = handle_event(state, TimerEvent.TICK, clock)

    reset_state = handle_event(state, TimerEvent.RESET, clock)

    assert reset_state.status == TimerStatus.IDLE
    assert reset_state.remaining_seconds == 300
    assert reset_state.completed is False
    assert reset_state.end_time is None
