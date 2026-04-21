import json
from datetime import date, datetime, time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import (
    abort,
    Blueprint,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)
from flask_login import current_user, login_required
from sqlalchemy import and_, or_

from models import Event, Route, RouteStop, SavedEvent, db
from options import AREA_OPTIONS, CATEGORY_OPTIONS


events_bp = Blueprint("events", __name__)

TIME_SLOTS = {
    "morning": (time(6, 0), time(11, 59)),
    "afternoon": (time(12, 0), time(17, 59)),
    "evening": (time(18, 0), time(23, 59)),
}

def parse_date(raw):
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_time(raw):
    try:
        return datetime.strptime(raw, "%H:%M").time()
    except (TypeError, ValueError):
        return None


def approved_query():
    return Event.query.filter(
        Event.status == "approved",
        Event.area.in_(AREA_OPTIONS),
    )


def filter_approved_events(args):
    query = approved_query()

    selected_date = parse_date(args.get("date"))
    selected_area = args.get("area", "").strip()
    selected_categories = [
        category.strip() for category in args.getlist("categories") if category.strip()
    ]
    selected_slots = [slot for slot in args.getlist("time_slots") if slot in TIME_SLOTS]

    if selected_date:
        query = query.filter(Event.date == selected_date)
    if selected_area:
        query = query.filter(Event.area == selected_area)
    if selected_categories:
        query = query.filter(Event.category.in_(selected_categories))
    if selected_slots:
        overlap_clauses = []
        for slot in selected_slots:
            slot_start, slot_end = TIME_SLOTS[slot]
            overlap_clauses.append(
                and_(Event.start_time <= slot_end, Event.end_time >= slot_start)
            )
        query = query.filter(or_(*overlap_clauses))

    return query.order_by(Event.date, Event.start_time).all()


def get_filter_options():
    approved = approved_query()
    categories = [row[0] for row in approved.with_entities(Event.category).distinct().all()]
    return {
        "areas": AREA_OPTIONS,
        "categories": sorted(categories),
        "time_slots": [
            {"value": key, "label": key.capitalize()} for key in TIME_SLOTS.keys()
        ],
    }


@events_bp.route("/")
def index():
    return render_template("index.html", filter_options=get_filter_options())


@events_bp.route("/route.html")
def route_page():
    return render_template("route.html")


@events_bp.route("/events/<int:event_id>")
def event_detail(event_id):
    event = db.session.get(Event, event_id)
    if not event:
        abort(404)

    can_view_unapproved = (
        current_user.is_authenticated
        and (current_user.role == "admin" or current_user.id == event.created_by)
    )
    if event.status != "approved" and not can_view_unapproved:
        abort(404)

    image_candidates = []
    if event.image_urls:
        try:
            parsed = json.loads(event.image_urls)
            if isinstance(parsed, list):
                image_candidates = [str(url).strip() for url in parsed if str(url).strip()]
        except (TypeError, ValueError):
            image_candidates = []
    if not image_candidates and event.image_url:
        image_candidates = [event.image_url]
    if not image_candidates:
        image_candidates = ["https://placehold.co/1400x700/e9ecef/4b5563?text=InFirenze+Event"]

    current_end = datetime.combine(event.date, event.end_time)
    suggested_pool = (
        approved_query()
        .filter(Event.id != event.id)
        .order_by(Event.date.asc(), Event.start_time.asc())
        .limit(50)
        .all()
    )

    def sort_key(candidate):
        candidate_start = datetime.combine(candidate.date, candidate.start_time)
        same_category = candidate.category == event.category
        after_current = candidate_start >= current_end
        return (
            0 if same_category else 1,
            0 if after_current else 1,
            candidate.date,
            candidate.start_time,
        )

    suggested_events = sorted(suggested_pool, key=sort_key)[:5]

    is_saved = False
    if current_user.is_authenticated:
        is_saved = (
            SavedEvent.query.filter_by(user_id=current_user.id, event_id=event.id).first()
            is not None
        )

    return render_template(
        "event_detail.html",
        event=event,
        is_saved=is_saved,
        event_images=image_candidates,
        suggested_events=suggested_events,
    )


@events_bp.route("/api/events")
def api_events():
    events = [event.to_dict() for event in filter_approved_events(request.args)]
    return jsonify(events)


@events_bp.route("/api/saved-events")
def api_saved_events():
    if not current_user.is_authenticated:
        return jsonify([])
    saved_ids = [
        row.event_id
        for row in SavedEvent.query.filter_by(user_id=current_user.id).all()
    ]
    return jsonify(saved_ids)


@events_bp.route("/api/geocode")
def api_geocode():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "Please enter a location to search."}), 400

    search_text = f"{query}, Florence, Italy"
    params = urlencode(
        {
            "q": search_text,
            "format": "jsonv2",
            "limit": 1,
            "addressdetails": 0,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = Request(
        url,
        headers={
            "User-Agent": "InFirenze/1.0 (event-discovery-app)",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError):
        return jsonify({"error": "Geocoding service is temporarily unavailable."}), 502

    if not payload:
        return jsonify({"error": "No location found. Try a more specific place name."}), 404

    top_result = payload[0]
    try:
        lat = float(top_result["lat"])
        lng = float(top_result["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Invalid geocoding response."}), 502

    return jsonify(
        {
            "lat": lat,
            "lng": lng,
            "name": top_result.get("display_name", search_text),
            "display_name": top_result.get("display_name", search_text),
        }
    )


@events_bp.route("/submit_event", methods=["GET", "POST"])
@events_bp.route("/submit-event", methods=["GET", "POST"])
@login_required
def submit_event():
    form_data = {}

    if request.method == "POST":
        form_data = {
            "location_query": request.form.get("location_query", "").strip(),
            "location_name": request.form.get("location_name", "").strip(),
            "title": request.form.get("title", "").strip(),
            "description": request.form.get("description", "").strip(),
            "image_urls": [value.strip() for value in request.form.getlist("image_urls")],
            "date": request.form.get("date", "").strip(),
            "start_time": request.form.get("start_time", "").strip(),
            "end_time": request.form.get("end_time", "").strip(),
            "area": request.form.get("area", "").strip(),
            "category": request.form.get("category", "").strip(),
            "lat": request.form.get("lat", "").strip(),
            "lng": request.form.get("lng", "").strip(),
        }

        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        image_urls = [
            value.strip()
            for value in request.form.getlist("image_urls")
            if value.strip()
        ]
        image_urls_json = json.dumps(image_urls) if image_urls else None
        primary_image_url = image_urls[0] if image_urls else None
        area = request.form.get("area", "").strip()
        category = request.form.get("category", "").strip()
        event_date = parse_date(request.form.get("date"))
        start_at = parse_time(request.form.get("start_time"))
        end_at = parse_time(request.form.get("end_time"))
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)

        if not all([title, area, category, event_date, start_at, end_at]):
            flash("All fields are required.")
            return render_template(
                "submit_event.html",
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
                form_data=form_data,
            )

        if area not in AREA_OPTIONS:
            flash("Invalid area selection.")
            return render_template(
                "submit_event.html",
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
                form_data=form_data,
            )

        if category not in CATEGORY_OPTIONS:
            flash("Invalid category selection.")
            return render_template(
                "submit_event.html",
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
                form_data=form_data,
            )

        if start_at >= end_at:
            flash("End time must be after start time.")
            return render_template(
                "submit_event.html",
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
                form_data=form_data,
            )

        if lat is None or lng is None:
            flash("Latitude and longitude are required.")
            return render_template(
                "submit_event.html",
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
                form_data=form_data,
            )

        event = Event(
            title=title,
            description=description,
            image_url=primary_image_url,
            image_urls=image_urls_json,
            area=area,
            category=category,
            date=event_date,
            start_time=start_at,
            end_time=end_at,
            lat=lat,
            lng=lng,
            status="pending",
            created_by=current_user.id,
        )
        db.session.add(event)
        db.session.commit()
        flash("Event submitted for review.")
        return redirect(url_for("events.index"))

    return render_template(
        "submit_event.html",
        area_options=AREA_OPTIONS,
        category_options=CATEGORY_OPTIONS,
        form_data=form_data,
    )


@events_bp.route("/my-events")
@events_bp.route("/my-submissions")
@login_required
def my_events():
    user_events = (
        Event.query.filter_by(created_by=current_user.id)
        .order_by(Event.date.asc(), Event.start_time.asc())
        .all()
    )
    return render_template("my_events.html", user_events=user_events)


@events_bp.route("/my-events/edit/<int:event_id>", methods=["GET", "POST"])
@login_required
def edit_my_event(event_id):
    event = Event.query.filter_by(id=event_id, created_by=current_user.id).first()
    if not event:
        flash("Event not found.")
        return redirect(url_for("events.my_events"))

    if request.method == "POST":
        was_approved = event.status == "approved"
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
            return render_template(
                "edit_event.html",
                event=event,
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
            )

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
            return render_template(
                "edit_event.html",
                event=event,
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
            )

        if lat is None or lng is None:
            flash("Latitude and longitude are required.")
            return render_template(
                "edit_event.html",
                event=event,
                area_options=AREA_OPTIONS,
                category_options=CATEGORY_OPTIONS,
            )

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

        if was_approved:
            event.status = "pending"

        db.session.commit()
        if was_approved:
            flash("Your changes have been submitted for re-approval.")
        else:
            flash("Event updated.")
        return redirect(url_for("events.my_events"))

    return render_template(
        "edit_event.html",
        event=event,
        area_options=AREA_OPTIONS,
        category_options=CATEGORY_OPTIONS,
    )


@events_bp.route("/saved")
@login_required
def saved_page():
    saved_event_rows = (
        SavedEvent.query.filter_by(user_id=current_user.id)
        .order_by(SavedEvent.created_at.desc())
        .all()
    )
    saved_events = [row.event for row in saved_event_rows if row.event]

    user_routes = (
        Route.query.filter_by(user_id=current_user.id)
        .order_by(Route.created_at.desc())
        .all()
    )
    route_cards = []
    for route in user_routes:
        ordered_stops = sorted(route.stops, key=lambda stop: stop.order)
        events = [stop.event for stop in ordered_stops if stop.event]
        payload = [
            {
                "id": event.id,
                "title": event.title,
                "lat": event.lat,
                "lng": event.lng,
                "area": event.area,
                "category": event.category,
                "date": event.date.isoformat(),
                "start_time": event.start_time.strftime("%H:%M"),
                "end_time": event.end_time.strftime("%H:%M"),
            }
            for event in events
        ]
        encoded = quote(json.dumps(payload))
        route_cards.append({"route": route, "events": events, "encoded": encoded})

    return render_template(
        "saved.html",
        saved_events=saved_events,
        route_cards=route_cards,
    )


@events_bp.route("/save-event/<int:event_id>", methods=["POST"])
@login_required
def save_event(event_id):
    event = db.session.get(Event, event_id)
    if not event:
        abort(404)

    existing = SavedEvent.query.filter_by(user_id=current_user.id, event_id=event_id).first()
    created = False
    if not existing:
        db.session.add(SavedEvent(user_id=current_user.id, event_id=event_id))
        db.session.commit()
        created = True

    if request.is_json or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify({"saved": True, "created": created})

    flash("Event saved." if created else "Event already saved.")
    return redirect(request.referrer or url_for("events.saved_page"))


@events_bp.route("/unsave-event/<int:event_id>", methods=["POST"])
@login_required
def unsave_event(event_id):
    saved = SavedEvent.query.filter_by(user_id=current_user.id, event_id=event_id).first()
    removed = False
    if saved:
        db.session.delete(saved)
        db.session.commit()
        removed = True

    if request.is_json or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify({"saved": False, "removed": removed})

    flash("Event removed from saved items." if removed else "Event was not saved.")
    return redirect(request.referrer or url_for("events.saved_page"))


@events_bp.route("/save-route", methods=["POST"])
@login_required
def save_route():
    payload = request.get_json(silent=True) or {}
    event_ids = payload.get("event_ids") or []
    name = (payload.get("name") or "").strip()

    if not isinstance(event_ids, list) or not event_ids:
        return jsonify({"error": "Select at least one stop before saving."}), 400

    cleaned_ids = []
    for raw_id in event_ids:
        try:
            event_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if db.session.get(Event, event_id) is not None:
            cleaned_ids.append(event_id)

    if not cleaned_ids:
        return jsonify({"error": "No valid stops were provided."}), 400

    route_name = name or f"My Route {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    route = Route(user_id=current_user.id, name=route_name)
    db.session.add(route)
    db.session.flush()

    for index, event_id in enumerate(cleaned_ids, start=1):
        db.session.add(RouteStop(route_id=route.id, event_id=event_id, order=index))

    db.session.commit()
    return jsonify({"ok": True, "route_id": route.id, "name": route.name})
