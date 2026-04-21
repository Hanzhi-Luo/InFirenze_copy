from datetime import datetime
from functools import wraps

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from models import Event, User, db
from options import AREA_OPTIONS, CATEGORY_OPTIONS


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

def admin_required(view_fn):
    @wraps(view_fn)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != "admin":
            return redirect(url_for("events.index"))
        return view_fn(*args, **kwargs)

    return wrapped


def parse_date(raw):
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def parse_time(raw):
    try:
        return datetime.strptime(raw, "%H:%M").time()
    except (TypeError, ValueError):
        return None


@admin_bp.route("/")
@login_required
@admin_required
def dashboard():
    pending_events = (
        Event.query.filter_by(status="pending")
        .order_by(Event.date.asc(), Event.start_time.asc())
        .all()
    )
    all_events = Event.query.order_by(Event.date.asc(), Event.start_time.asc()).all()
    users = User.query.order_by(User.role.desc(), User.username.asc()).all()
    return render_template(
        "admin.html",
        pending_events=pending_events,
        all_events=all_events,
        users=users,
        area_options=AREA_OPTIONS,
        category_options=CATEGORY_OPTIONS,
    )


@admin_bp.route("/approve/<int:event_id>")
@login_required
@admin_required
def approve_event(event_id):
    event = db.session.get(Event, event_id)
    if event:
        event.status = "approved"
        db.session.commit()
        flash("Event approved.")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/reject/<int:event_id>")
@login_required
@admin_required
def reject_event(event_id):
    event = db.session.get(Event, event_id)
    if event:
        event.status = "rejected"
        db.session.commit()
        flash("Event rejected.")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/edit/<int:event_id>", methods=["GET", "POST"])
@login_required
@admin_required
def edit_event(event_id):
    event = db.session.get(Event, event_id)
    if not event:
        flash("Event not found.")
        return redirect(url_for("admin.dashboard"))

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        image_url = request.form.get("image_url", "").strip()
        area = request.form.get("area", "").strip()
        category = request.form.get("category", "").strip()
        event_date = parse_date(request.form.get("date"))
        start_at = parse_time(request.form.get("start_time"))
        end_at = parse_time(request.form.get("end_time"))
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)

        if not all([title, area, category, event_date, start_at, end_at]):
            flash("All fields are required.")
            return redirect(url_for("admin.edit_event", event_id=event_id))

        if area not in AREA_OPTIONS:
            flash("Invalid area selection.")
            return render_template(
                "edit_event.html",
                event=event,
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
            )

        if category not in CATEGORY_OPTIONS:
            flash("Invalid category selection.")
            return render_template(
                "edit_event.html",
                event=event,
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
            )

        if start_at >= end_at:
            flash("End time must be after start time.")
            return redirect(url_for("admin.edit_event", event_id=event_id))

        if lat is None or lng is None:
            flash("Latitude and longitude are required.")
            return redirect(url_for("admin.edit_event", event_id=event_id))

        event.title = title
        event.description = description
        event.image_url = image_url or None
        event.date = event_date
        event.start_time = start_at
        event.end_time = end_at
        event.area = area
        event.category = category
        event.lat = lat
        event.lng = lng
        db.session.commit()
        flash("Event updated.")
        return redirect(url_for("admin.dashboard"))

    return render_template(
        "edit_event.html",
        event=event,
        area_options=AREA_OPTIONS,
        category_options=CATEGORY_OPTIONS,
    )


@admin_bp.route("/promote/<int:user_id>")
@login_required
@admin_required
def promote_user(user_id):
    user = db.session.get(User, user_id)
    if user:
        user.role = "admin"
        db.session.commit()
        flash(f"{user.username} promoted to admin.")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/delete-user/<int:user_id>")
@login_required
@admin_required
def delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return redirect(url_for("admin.dashboard"))

    if user.id == current_user.id:
        flash("You cannot delete yourself.")
        return redirect(url_for("admin.dashboard"))

    if Event.query.filter_by(created_by=user.id).first():
        flash("Cannot delete user with existing events.")
        return redirect(url_for("admin.dashboard"))

    db.session.delete(user)
    db.session.commit()
    flash("User deleted.")
    return redirect(url_for("admin.dashboard"))
