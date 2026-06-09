import os
from flask import Flask, jsonify, render_template, request

from services.session_service import SessionService, ValidationError


def create_app() -> Flask:
    app = Flask(__name__)
    session_service = SessionService()

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        return jsonify({"error": str(error)}), 400

    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    @app.get("/api/stats/today")
    def get_today_stats():
        return jsonify(session_service.get_today_stats())

    @app.post("/api/sessions")
    def create_session():
        payload = request.get_json(silent=True)
        session = session_service.record(payload)
        return jsonify(session), 201

    @app.get("/api/settings")
    def get_settings():
        return jsonify(session_service.get_settings())

    @app.put("/api/settings")
    def put_settings():
        payload = request.get_json(silent=True)
        settings = session_service.update_settings(payload)
        return jsonify(settings)

    @app.get("/api/gamification")
    def get_gamification():
        return jsonify(session_service.get_gamification())

    @app.get("/api/stats/weekly")
    def get_weekly_stats():
        return jsonify(session_service.get_weekly_stats())

    @app.get("/api/stats/monthly")
    def get_monthly_stats():
        return jsonify(session_service.get_monthly_stats())

    return app


app = create_app()


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
    app.run(debug=debug_mode)
