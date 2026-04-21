from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from models import User, db


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("events.index"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        role = request.form.get("role", "user")

        if not username or not password:
            flash("Username and password are required.")
            return redirect(url_for("auth.register"))

        if role not in {"admin", "user"}:
            role = "user"

        existing = User.query.filter_by(username=username).first()
        if existing:
            flash("Username already exists.")
            return redirect(url_for("auth.register"))

        user = User(username=username, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash("Registration successful. Please log in.")
        return redirect(url_for("auth.login"))

    return render_template("register.html")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        if current_user.role == "admin":
            return redirect(url_for("admin.dashboard"))
        return redirect(url_for("events.index"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = User.query.filter_by(username=username).first()

        if not user or not user.check_password(password):
            flash("Invalid username or password.")
            return redirect(url_for("auth.login"))

        login_user(user)
        if user.role == "admin":
            return redirect(url_for("admin.dashboard"))
        return redirect(url_for("events.index"))

    return render_template("login.html")


@auth_bp.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("events.index"))


@auth_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    if request.method == "POST":
        current_user.avatar_url = request.form.get("avatar_url", "").strip() or None
        current_user.display_name = request.form.get("display_name", "").strip() or None
        current_user.phone = request.form.get("phone", "").strip() or None
        current_user.email = request.form.get("email", "").strip() or None
        current_user.interests = request.form.get("interests", "").strip() or None
        current_user.bio = request.form.get("bio", "").strip() or None
        db.session.commit()
        flash("Profile updated successfully.")
        return redirect(url_for("auth.profile"))

    return render_template("profile.html")
