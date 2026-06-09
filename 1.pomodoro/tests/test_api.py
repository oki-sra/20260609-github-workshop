from app import create_app


def test_get_today_stats_default_values() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/api/stats/today")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["completed_pomodoros"] == 0
    assert payload["total_focus_seconds"] == 0
    assert isinstance(payload["date"], str)


def test_post_completed_session_updates_today_stats() -> None:
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/sessions",
        json={
            "mode": "focus",
            "planned_seconds": 1500,
            "actual_seconds": 1500,
            "status": "completed",
        },
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["mode"] == "focus"
    assert payload["status"] == "completed"

    stats_response = client.get("/api/stats/today")
    stats = stats_response.get_json()
    assert stats["completed_pomodoros"] == 1
    assert stats["total_focus_seconds"] == 1500


def test_post_session_invalid_payload_returns_400() -> None:
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/sessions",
        json={
            "mode": "focus",
            "planned_seconds": 0,
            "status": "completed",
        },
    )

    assert response.status_code == 400
    assert "error" in response.get_json()


def test_get_settings_returns_defaults() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/api/settings")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload == {
        "focus_minutes": 25,
        "short_break_minutes": 5,
        "long_break_minutes": 15,
        "long_break_interval": 4,
    }


def test_put_settings_updates_values() -> None:
    app = create_app()
    client = app.test_client()

    response = client.put(
        "/api/settings",
        json={"focus_minutes": 30, "long_break_interval": 3},
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["focus_minutes"] == 30
    assert payload["long_break_interval"] == 3
    assert payload["short_break_minutes"] == 5


def test_put_settings_invalid_value_returns_400() -> None:
    app = create_app()
    client = app.test_client()

    response = client.put("/api/settings", json={"focus_minutes": -1})

    assert response.status_code == 400
    assert "error" in response.get_json()


def test_get_gamification_returns_defaults() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/api/gamification")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["total_xp"] == 0
    assert payload["level"] == 1
    assert payload["total_pomodoros"] == 0
    assert payload["current_streak"] == 0
    assert payload["earned_badges"] == []
    assert isinstance(payload["all_badges"], list)
    assert len(payload["all_badges"]) > 0


def test_post_completed_session_updates_gamification() -> None:
    app = create_app()
    client = app.test_client()

    client.post(
        "/api/sessions",
        json={
            "mode": "focus",
            "planned_seconds": 1500,
            "actual_seconds": 1500,
            "status": "completed",
        },
    )

    response = client.get("/api/gamification")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["total_xp"] == 100
    assert payload["total_pomodoros"] == 1
    assert payload["level"] == 1
    # first_pomodoro badge should be earned
    earned_ids = [b["id"] for b in payload["earned_badges"]]
    assert "first_pomodoro" in earned_ids


def test_get_weekly_stats_returns_seven_days() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/api/stats/weekly")
    payload = response.get_json()

    assert response.status_code == 200
    assert isinstance(payload, list)
    assert len(payload) == 7
    for item in payload:
        assert "date" in item
        assert "completed_pomodoros" in item


def test_get_monthly_stats_returns_thirty_days() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/api/stats/monthly")
    payload = response.get_json()

    assert response.status_code == 200
    assert isinstance(payload, list)
    assert len(payload) == 30
