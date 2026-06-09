from app import create_app


def test_index_returns_ok() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200


def test_index_contains_timer_ui_elements() -> None:
    app = create_app()
    client = app.test_client()

    response = client.get("/")
    html = response.get_data(as_text=True)

    assert 'id="modeLabel"' in html
    assert 'id="timeText"' in html
    assert 'id="startPauseButton"' in html
    assert 'id="resetButton"' in html
    assert 'id="focusMinutesInput"' in html
    assert 'id="shortBreakMinutesInput"' in html
    assert 'id="longBreakMinutesInput"' in html
    assert 'id="longBreakIntervalInput"' in html
    assert 'id="settingsStatus"' in html
