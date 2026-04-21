import json
from datetime import date, datetime, time, timedelta

from flask_login import LoginManager, UserMixin
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

from options import AREA_OPTIONS, CATEGORY_OPTIONS


db = SQLAlchemy()
login_manager = LoginManager()


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")
    display_name = db.Column(db.String(100), nullable=True)
    avatar_url = db.Column(db.String(300), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(120), nullable=True)
    interests = db.Column(db.Text, nullable=True)
    bio = db.Column(db.Text, nullable=True)

    events = db.relationship("Event", backref="creator", lazy=True)
    saved_events = db.relationship("SavedEvent", backref="user", lazy=True, cascade="all, delete-orphan")
    routes = db.relationship("Route", backref="user", lazy=True, cascade="all, delete-orphan")

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    @property
    def resolved_display_name(self):
        return (self.display_name or "").strip() or self.username

    @property
    def resolved_avatar_url(self):
        return (self.avatar_url or "").strip() or "/static/default-avatar.svg"


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(140), nullable=False)
    description = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(300), nullable=True)
    image_urls = db.Column(db.Text, nullable=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    area = db.Column(db.String(80), nullable=False)
    category = db.Column(db.String(80), nullable=False)

    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)

    status = db.Column(db.String(20), nullable=False, default="pending")
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    saved_by = db.relationship("SavedEvent", backref="event", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        image_list = []
        if self.image_urls:
            try:
                parsed = json.loads(self.image_urls)
                if isinstance(parsed, list):
                    image_list = [str(url) for url in parsed if str(url).strip()]
            except (TypeError, ValueError):
                image_list = []
        primary_image = image_list[0] if image_list else (self.image_url or "")

        return {
            "id": self.id,
            "title": self.title,
            "description": self.description or "",
            "image_url": primary_image,
            "image_urls": image_list,
            "lat": self.lat,
            "lng": self.lng,
            "area": self.area,
            "category": self.category,
            "date": self.date.isoformat(),
            "start_time": self.start_time.strftime("%H:%M"),
            "end_time": self.end_time.strftime("%H:%M"),
            "status": self.status,
        }


class SavedEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "event_id", name="uniq_saved_event_per_user"),
    )


class Route(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    stops = db.relationship(
        "RouteStop",
        backref="route",
        lazy=True,
        order_by="RouteStop.order",
        cascade="all, delete-orphan",
    )


class RouteStop(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey("route.id"), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    event = db.relationship("Event", lazy=True)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


AREA_CENTERS = {
    "Duomo": (43.7731, 11.2560),
    "Santa Maria Novella": (43.7769, 11.2475),
    "San Lorenzo": (43.7778, 11.2531),
    "San Marco": (43.7796, 11.2587),
    "Santissima Annunziata": (43.7772, 11.2616),
    "Sant'Ambrogio / D'Azeglio": (43.7720, 11.2689),
    "Santa Croce": (43.7687, 11.2628),
    "Santo Spirito": (43.7669, 11.2470),
    "San Niccolò": (43.7646, 11.2657),
}

COORD_OFFSETS = [
    (0.0006, 0.0007),
    (-0.0007, 0.0005),
    (0.0008, -0.0006),
    (-0.0005, -0.0007),
    (0.0003, 0.0010),
    (-0.0009, -0.0002),
]

TIME_WINDOWS = [
    (time(8, 30), time(10, 0)),
    (time(9, 30), time(11, 30)),
    (time(10, 30), time(12, 0)),
    (time(12, 30), time(14, 0)),
    (time(14, 0), time(16, 0)),
    (time(16, 30), time(18, 0)),
    (time(18, 30), time(20, 0)),
    (time(20, 0), time(22, 0)),
    (time(21, 0), time(22, 30)),
]

SAMPLE_EVENT_BLUEPRINTS = [
    {"title": "Sunrise Espresso Walk at Duomo", "area": "Duomo", "category": "Food"},
    {"title": "Renaissance Choir at Santa Maria Novella", "area": "Santa Maria Novella", "category": "Culture"},
    {"title": "San Lorenzo Market Tasting Trail", "area": "San Lorenzo", "category": "Food"},
    {"title": "Medici History Talk in San Marco", "area": "San Marco", "category": "Culture"},
    {"title": "Sketching Session at Santissima Annunziata", "area": "Santissima Annunziata", "category": "Art"},
    {"title": "D'Azeglio Farmers Basket Class", "area": "Sant'Ambrogio / D'Azeglio", "category": "Workshop"},
    {"title": "Arno Stories in Santa Croce", "area": "Santa Croce", "category": "Culture"},
    {"title": "Sunset Acoustic Set in Santo Spirito", "area": "Santo Spirito", "category": "Music"},
    {"title": "Terrace Photo Walk in San Niccolò", "area": "San Niccolò", "category": "Outdoor"},
    {"title": "Morning Fresco Tour by Duomo", "area": "Duomo", "category": "Culture"},
    {"title": "Vintage Vinyl Brunch in Santa Maria Novella", "area": "Santa Maria Novella", "category": "Music"},
    {"title": "Artisan Leather Demo in San Lorenzo", "area": "San Lorenzo", "category": "Workshop"},
    {"title": "Cloister Botanical Drawing in San Marco", "area": "San Marco", "category": "Art"},
    {"title": "Annunziata Chamber Trio", "area": "Santissima Annunziata", "category": "Music"},
    {"title": "Sant'Ambrogio Coffee Roastery Visit", "area": "Sant'Ambrogio / D'Azeglio", "category": "Food"},
    {"title": "Santa Croce Bookbinding Lab", "area": "Santa Croce", "category": "Workshop"},
    {"title": "Santo Spirito Street Food Crawl", "area": "Santo Spirito", "category": "Food"},
    {"title": "San Niccolò Viewpoint Yoga", "area": "San Niccolò", "category": "Outdoor"},
    {"title": "Duomo Bell Tower Photo Class", "area": "Duomo", "category": "Art"},
    {"title": "Santa Maria Novella Wine Stories", "area": "Santa Maria Novella", "category": "Food"},
    {"title": "San Lorenzo Pasta from Scratch", "area": "San Lorenzo", "category": "Workshop"},
    {"title": "San Marco Poetry Circle", "area": "San Marco", "category": "Culture"},
    {"title": "Annunziata Ceramic Painting", "area": "Santissima Annunziata", "category": "Art"},
    {"title": "Sant'Ambrogio Jazz Aperitivo", "area": "Sant'Ambrogio / D'Azeglio", "category": "Music"},
    {"title": "Santa Croce Artisan Market Walk", "area": "Santa Croce", "category": "Outdoor"},
    {"title": "Santo Spirito Night Sketch Jam", "area": "Santo Spirito", "category": "Art"},
    {"title": "San Niccolò Twilight Film Talk", "area": "San Niccolò", "category": "Culture"},
    {"title": "Duomo Architecture for Beginners", "area": "Duomo", "category": "Culture"},
    {"title": "Santa Maria Novella Organ Recital", "area": "Santa Maria Novella", "category": "Music"},
    {"title": "San Lorenzo Spice Blending Studio", "area": "San Lorenzo", "category": "Workshop"},
    {"title": "San Marco Courtyard Strings", "area": "San Marco", "category": "Music"},
    {"title": "Annunziata Florentine Dance Hour", "area": "Santissima Annunziata", "category": "Culture"},
    {"title": "D'Azeglio Community Art Swap", "area": "Sant'Ambrogio / D'Azeglio", "category": "Art"},
    {"title": "Santa Croce Indie Folk Evening", "area": "Santa Croce", "category": "Music"},
    {"title": "Santo Spirito Rooftop DJ Set", "area": "Santo Spirito", "category": "Music"},
    {"title": "San Niccolò Lantern Walk", "area": "San Niccolò", "category": "Outdoor"},
    {"title": "Duomo Gelato Craft Workshop", "area": "Duomo", "category": "Food"},
    {"title": "Santa Maria Novella Photojournal Walk", "area": "Santa Maria Novella", "category": "Outdoor"},
    {"title": "San Lorenzo Mosaic Mini-Class", "area": "San Lorenzo", "category": "Art"},
    {"title": "San Marco Philosophy at Noon", "area": "San Marco", "category": "Culture"},
    {"title": "Annunziata Watercolor Meetup", "area": "Santissima Annunziata", "category": "Art"},
    {"title": "Sant'Ambrogio Bread and Olive Oil Lab", "area": "Sant'Ambrogio / D'Azeglio", "category": "Food"},
    {"title": "Santa Croce Open Mic Night", "area": "Santa Croce", "category": "Music"},
    {"title": "Santo Spirito Pasta and Jazz Social", "area": "Santo Spirito", "category": "Food"},
    {"title": "San Niccolò Sunrise Run Club", "area": "San Niccolò", "category": "Outdoor"},
    {"title": "Duomo Evening Cinema Piazza", "area": "Duomo", "category": "Culture"},
    {"title": "Santa Maria Novella Herbal Tea Workshop", "area": "Santa Maria Novella", "category": "Workshop"},
    {"title": "San Lorenzo Local Designers Pop-up", "area": "San Lorenzo", "category": "Culture"},
    {"title": "San Marco Museum After Hours", "area": "San Marco", "category": "Culture"},
    {"title": "Santa Croce Riverside Meditation", "area": "Santa Croce", "category": "Outdoor"},
]


def build_seed_events(admin_id, existing_titles):
    start_date = date(2026, 4, 15)
    area_counts = {area: 0 for area in AREA_OPTIONS}
    events = []

    for idx, blueprint in enumerate(SAMPLE_EVENT_BLUEPRINTS):
        title = blueprint["title"]
        area = blueprint["area"]
        category = blueprint["category"]

        if title in existing_titles:
            continue
        if area not in AREA_OPTIONS or area not in AREA_CENTERS:
            continue
        if category not in CATEGORY_OPTIONS:
            continue

        center_lat, center_lng = AREA_CENTERS[area]
        area_index = area_counts[area]
        area_counts[area] += 1
        lat_offset, lng_offset = COORD_OFFSETS[area_index % len(COORD_OFFSETS)]
        start_at, end_at = TIME_WINDOWS[idx % len(TIME_WINDOWS)]

        events.append(
            Event(
                title=title,
                description=(
                    f"{title} is a local {category.lower()} experience in {area}. "
                    "Join a small group and discover a curated Florence moment."
                ),
                image_url=f"https://picsum.photos/seed/infirenze-{idx + 1}-1/1200/700",
                image_urls=json.dumps(
                    [
                        f"https://picsum.photos/seed/infirenze-{idx + 1}-1/1200/700",
                        f"https://picsum.photos/seed/infirenze-{idx + 1}-2/800/600",
                        f"https://picsum.photos/seed/infirenze-{idx + 1}-3/800/600",
                    ]
                ),
                lat=round(center_lat + lat_offset, 6),
                lng=round(center_lng + lng_offset, 6),
                area=area,
                category=category,
                date=start_date + timedelta(days=(idx % 8)),
                start_time=start_at,
                end_time=end_at,
                status="approved",
                created_by=admin_id,
            )
        )

    return events


def seed_data():
    admin = User.query.filter_by(username="admin").first()
    if not admin:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")
        db.session.add(admin)
        db.session.flush()

    demo_user = User.query.filter_by(username="demo").first()
    if not demo_user:
        demo_user = User(username="demo", role="user")
        demo_user.set_password("demo123")
        db.session.add(demo_user)
        db.session.flush()

    legacy_titles = [
        "Uffizi Guided Tour",
        "Arno Sunset Walk",
        "Tuscan Cooking Class",
        "Live Jazz Night",
        "Community Sketch Meetup",
    ]
    Event.query.filter(Event.title.in_(legacy_titles)).delete(synchronize_session=False)

    existing_titles = {row[0] for row in db.session.query(Event.title).all()}
    seed_events = build_seed_events(admin.id, existing_titles)
    if seed_events:
        db.session.add_all(seed_events)

    db.session.commit()
