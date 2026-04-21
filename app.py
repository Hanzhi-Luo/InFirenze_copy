from flask import Flask
import os
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from models import db, login_manager, seed_data
from routes.admin import admin_bp
from routes.auth import auth_bp
from routes.events import events_bp


def ensure_user_profile_columns():
    inspector = inspect(db.engine)
    user_columns = {col["name"] for col in inspector.get_columns("user")}
    missing_columns = [
        ("display_name", "VARCHAR(100)"),
        ("avatar_url", "VARCHAR(300)"),
        ("phone", "VARCHAR(50)"),
        ("email", "VARCHAR(120)"),
        ("interests", "TEXT"),
        ("bio", "TEXT"),
    ]

    for column_name, column_type in missing_columns:
        if column_name not in user_columns:
            db.session.execute(text(f"ALTER TABLE user ADD COLUMN {column_name} {column_type}"))
    db.session.commit()


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
    database_url = os.getenv("DATABASE_URL", "sqlite:///events.db")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"

    app.register_blueprint(auth_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(admin_bp)

    with app.app_context():
        db.create_all()
        ensure_user_profile_columns()
        try:
            seed_data()
        except OperationalError:
            db.session.rollback()
            # Never drop tables on startup; avoid destructive recovery in production.
            app.logger.exception("Skipping seed_data due to database OperationalError during startup.")

    return app


app = create_app()


if __name__ == "__main__":
    app.run()
