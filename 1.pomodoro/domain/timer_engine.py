from __future__ import annotations

import math
from dataclasses import replace
from datetime import datetime, timedelta

from domain.clock import Clock
from domain.timer_state import TimerEvent, TimerState, TimerStatus, initial_state


def handle_event(state: TimerState, event: TimerEvent, clock: Clock) -> TimerState:
    now = clock.now()

    if event == TimerEvent.START:
        if state.status != TimerStatus.IDLE:
            return state
        return TimerState(
            status=TimerStatus.FOCUS,
            focus_seconds=state.focus_seconds,
            remaining_seconds=state.focus_seconds,
            end_time=now + timedelta(seconds=state.focus_seconds),
            completed=False,
        )

    if event == TimerEvent.PAUSE:
        if state.status != TimerStatus.FOCUS or state.end_time is None:
            return state
        remaining = remaining_seconds_from_end_time(state.end_time, now)
        return replace(
            state,
            status=TimerStatus.PAUSED,
            remaining_seconds=remaining,
            end_time=None,
        )

    if event == TimerEvent.RESUME:
        if state.status != TimerStatus.PAUSED:
            return state
        return replace(
            state,
            status=TimerStatus.FOCUS,
            end_time=now + timedelta(seconds=state.remaining_seconds),
            completed=False,
        )

    if event == TimerEvent.RESET:
        return initial_state(state.focus_seconds)

    if event == TimerEvent.TICK:
        if state.status != TimerStatus.FOCUS or state.end_time is None:
            return state
        remaining = remaining_seconds_from_end_time(state.end_time, now)
        if remaining > 0:
            return replace(state, remaining_seconds=remaining)
        return replace(
            state,
            status=TimerStatus.IDLE,
            remaining_seconds=0,
            end_time=None,
            completed=True,
        )

    return state


def remaining_seconds_from_end_time(end_time: datetime, now: datetime) -> int:
    delta_seconds = (end_time - now).total_seconds()
    if delta_seconds <= 0:
        return 0
    return int(math.ceil(delta_seconds))


def apply_event(state: TimerState, event: TimerEvent, clock: Clock) -> TimerState:
    return handle_event(state, event, clock)
