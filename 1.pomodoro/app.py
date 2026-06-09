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

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
