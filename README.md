# InFirenze (Flask + SQLite)

Production-style minimal event platform with moderation:

- Date filter (`YYYY-MM-DD`)
- Multi-select time slots (`morning/afternoon/evening`)
- Flask-Login auth (`register/login/logout`)
- Roles (`user/admin`)
- Event submission flow (`pending -> approved/rejected`)
- Admin panel for moderation and editing
- Leaflet map + route page

## Structure

```txt
app.py
models.py
routes/
  auth.py
  events.py
templates/
  index.html
  login.html
  register.html
  submit_event.html
  admin.html
  route.html
static/
  app.js
  styles.css
  route.js
  route.css
```

## Install

```bash
pip3 install -r requirements.txt
```

## Run

```bash
python3 app.py
```

Open: `http://127.0.0.1:5000`

## Seeded Accounts

- Admin: `admin / admin123`
- User: `demo / demo123`

## Key Routes

- `/login`
- `/register`
- `/logout`
- `/submit-event` (login required)
- `/admin` (admin only)
- `/api/events` (approved events only, supports date + multi-time filtering)

