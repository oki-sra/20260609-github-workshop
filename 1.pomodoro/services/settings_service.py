from __future__ import annotations


class ValidationError(ValueError):
    pass


class SettingsService:
    def __init__(self) -> None:
        self._settings = {
            "focus_minutes": 25,
            "short_break_minutes": 5,
            "long_break_minutes": 15,
            "long_break_interval": 4,
        }

    def get(self) -> dict[str, int]:
        return dict(self._settings)

    def update(self, payload: object) -> dict[str, int]:
        if not isinstance(payload, dict):
            raise ValidationError("JSON object is required")

        next_settings = dict(self._settings)
        for key in self._settings:
            if key in payload:
                raw_value = payload[key]
                if not isinstance(raw_value, int):
                    raise ValidationError(f"{key} must be an integer")
                if raw_value <= 0:
                    raise ValidationError(f"{key} must be greater than 0")
                next_settings[key] = raw_value

        self._settings = next_settings
        return dict(self._settings)
