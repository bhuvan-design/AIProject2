import os
from collections import deque
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, or_
from sqlalchemy.exc import SQLAlchemyError

app = Flask(__name__)

# Local development uses SQLite. Set DATABASE_URL to PostgreSQL when deploying.
database_url = os.environ.get("DATABASE_URL", "sqlite:///campus.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
app.config["JSON_SORT_KEYS"] = False

db = SQLAlchemy(app)


class Location(db.Model):
    __tablename__ = "locations"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(40), nullable=False, default="Campus")
    description = db.Column(db.String(240), nullable=False, default="Campus location")


class Connection(db.Model):
    __tablename__ = "connections"

    id = db.Column(db.Integer, primary_key=True)
    from_location_id = db.Column(db.Integer, db.ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    to_location_id = db.Column(db.Integer, db.ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    distance_m = db.Column(db.Integer, nullable=False)

    from_location = db.relationship("Location", foreign_keys=[from_location_id])
    to_location = db.relationship("Location", foreign_keys=[to_location_id])

    __table_args__ = (
        CheckConstraint("distance_m > 0", name="positive_connection_distance"),
        CheckConstraint("from_location_id != to_location_id", name="different_connection_endpoints"),
        db.UniqueConstraint("from_location_id", "to_location_id", name="unique_connection_direction"),
    )


class NavigationHistory(db.Model):
    __tablename__ = "navigation_history"

    id = db.Column(db.Integer, primary_key=True)
    source_code = db.Column(db.String(12), nullable=False)
    source_name = db.Column(db.String(100), nullable=False)
    destination_code = db.Column(db.String(12), nullable=False)
    destination_name = db.Column(db.String(100), nullable=False)
    route_codes = db.Column(db.Text, nullable=False, default="")
    route_names = db.Column(db.Text, nullable=False, default="")
    total_distance_m = db.Column(db.Integer, nullable=False, default=0)
    walking_time_min = db.Column(db.Float, nullable=False, default=0)
    hops = db.Column(db.Integer, nullable=False, default=0)
    success = db.Column(db.Boolean, nullable=False, default=False)
    requested_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


DEFAULT_LOCATIONS = [
    ("MG", "Main Gate", "Entrance", "The main entrance to campus."),
    ("AB", "Admin Block", "Administration", "Administration offices and student services."),
    ("CL", "Central Library", "Learning", "Library and quiet study spaces."),
    ("CS", "CSE Block", "Academic", "Computer Science and Engineering block."),
    ("ME", "Mechanical Block", "Academic", "Mechanical Engineering block."),
    ("AUD", "Auditorium", "Events", "Auditorium and campus events venue."),
    ("CAF", "Student Cafeteria", "Food", "Food court and student seating."),
    ("SP", "Sports Complex", "Sports", "Sports facilities and recreation."),
    ("BH", "Boys Hostel", "Hostel", "Residential accommodation."),
    ("GH", "Girls Hostel", "Hostel", "Residential accommodation."),
]

# Distances are sample project data, measured in metres.
DEFAULT_CONNECTIONS = [
    ("MG", "AB", 150),
    ("AB", "CL", 180),
    ("AB", "CS", 200),
    ("CS", "GH", 220),
    ("CS", "ME", 160),
    ("CS", "CAF", 210),
    ("CL", "ME", 190),
    ("CL", "AUD", 250),
    ("ME", "CAF", 170),
    ("ME", "AUD", 210),
    ("CAF", "BH", 280),
    ("AUD", "SP", 230),
    ("ME", "SP", 310),
    ("BH", "SP", 190),
]


def seed_database():
    """Create the tables and insert the sample campus map once."""
    db.create_all()

    if Location.query.first() is None:
        locations = [
            Location(code=code, name=name, category=category, description=description)
            for code, name, category, description in DEFAULT_LOCATIONS
        ]
        db.session.add_all(locations)
        db.session.flush()

        by_code = {location.code: location for location in locations}
        for source, destination, distance in DEFAULT_CONNECTIONS:
            db.session.add(
                Connection(
                    from_location_id=by_code[source].id,
                    to_location_id=by_code[destination].id,
                    distance_m=distance,
                )
            )
        db.session.commit()


def get_campus_graph():
    """Return locations and an undirected adjacency list from the database."""
    locations = Location.query.order_by(Location.name.asc()).all()
    connections = Connection.query.all()

    by_code = {location.code: location for location in locations}
    adjacency = {location.code: [] for location in locations}

    for connection in connections:
        source = connection.from_location.code
        destination = connection.to_location.code
        distance = connection.distance_m

        # Ignore orphaned/invalid data defensively.
        if source not in adjacency or destination not in adjacency:
            continue

        adjacency[source].append({"node": destination, "distance": distance})
        adjacency[destination].append({"node": source, "distance": distance})

    for neighbors in adjacency.values():
        neighbors.sort(key=lambda item: by_code[item["node"]].name)

    return by_code, adjacency


def bfs_search(source, destination, adjacency):
    """Breadth-First Search returns a route with the fewest edges, not shortest metres."""
    if source not in adjacency:
        raise ValueError("Please choose a valid starting location.")
    if destination not in adjacency:
        raise ValueError("Please choose a valid destination.")
    if source == destination:
        return {"path": [source], "visited": [source], "steps": 0}

    queue = deque([[source]])
    visited = {source}
    explored_order = []
    steps = 0

    while queue:
        path = queue.popleft()
        current = path[-1]
        explored_order.append(current)
        steps += 1

        if current == destination:
            return {"path": path, "visited": explored_order, "steps": steps}

        for edge in adjacency.get(current, []):
            neighbor = edge["node"]
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(path + [neighbor])

    return {"path": [], "visited": explored_order, "steps": steps}


def route_distance(path, adjacency):
    total = 0
    for source, destination in zip(path, path[1:]):
        edge = next(
            (item for item in adjacency.get(source, []) if item["node"] == destination),
            None,
        )
        if edge is None:
            raise ValueError("The route contains a connection that no longer exists.")
        total += edge["distance"]
    return total


def serialize_history(item):
    return {
        "id": item.id,
        "source": item.source_name,
        "sourceCode": item.source_code,
        "destination": item.destination_name,
        "destinationCode": item.destination_code,
        "route": item.route_names.split("|||") if item.route_names else [],
        "distance": item.total_distance_m,
        "walkingTime": round(item.walking_time_min, 1),
        "hops": item.hops,
        "success": item.success,
        "requestedAt": item.requested_at.isoformat() if item.requested_at else None,
    }


@app.route("/")
def home():
    try:
        locations = Location.query.order_by(Location.name.asc()).all()
        connections = Connection.query.count()
        recent_history = NavigationHistory.query.order_by(
            NavigationHistory.requested_at.desc()
        ).limit(5).all()
        total_searches = NavigationHistory.query.count()
        successful_searches = NavigationHistory.query.filter_by(success=True).count()
    except SQLAlchemyError:
        db.session.rollback()
        return (
            "The database could not be reached. Check DATABASE_URL and the database service, then restart the app.",
            503,
        )

    return render_template(
        "index.html",
        locations=locations,
        connection_count=connections,
        recent_history=[serialize_history(item) for item in recent_history],
        total_searches=total_searches,
        successful_searches=successful_searches,
    )


@app.get("/api/locations")
def api_locations():
    locations = Location.query.order_by(Location.name.asc()).all()
    return jsonify(
        [
            {"code": item.code, "name": item.name, "category": item.category}
            for item in locations
        ]
    )


@app.post("/api/navigate")
def navigate():
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", "")).strip().upper()
    destination = str(payload.get("destination", "")).strip().upper()

    try:
        by_code, adjacency = get_campus_graph()
        if source not in by_code:
            return jsonify({"success": False, "error": "Please choose a valid starting location."}), 400
        if destination not in by_code:
            return jsonify({"success": False, "error": "Please choose a valid destination."}), 400

        result = bfs_search(source, destination, adjacency)
        path = result["path"]
        distance = route_distance(path, adjacency) if path else 0
        walking_time = round(distance / 75, 1)  # Assumes 75 metres per minute.
        directions = []

        for index, (start, end) in enumerate(zip(path, path[1:]), start=1):
            edge = next(item for item in adjacency[start] if item["node"] == end)
            directions.append(
                {
                    "step": index,
                    "from": start,
                    "to": end,
                    "fromName": by_code[start].name,
                    "toName": by_code[end].name,
                    "distance": edge["distance"],
                }
            )

        history_item = NavigationHistory(
            source_code=source,
            source_name=by_code[source].name,
            destination_code=destination,
            destination_name=by_code[destination].name,
            route_codes="|||".join(path),
            route_names="|||".join(by_code[code].name for code in path),
            total_distance_m=distance,
            walking_time_min=walking_time,
            hops=max(0, len(path) - 1),
            success=bool(path),
        )
        db.session.add(history_item)
        db.session.commit()

        return jsonify(
            {
                "success": bool(path),
                "source": source,
                "destination": destination,
                "path": path,
                "pathNames": [by_code[code].name for code in path],
                "distance": distance,
                "walkingTime": walking_time,
                "hops": max(0, len(path) - 1),
                "visited": result["visited"],
                "stepsEvaluated": result["steps"],
                "directions": directions,
                "history": serialize_history(history_item),
            }
        )
    except ValueError as error:
        db.session.rollback()
        return jsonify({"success": False, "error": str(error)}), 400
    except SQLAlchemyError:
        db.session.rollback()
        app.logger.exception("Database error while calculating a route")
        return jsonify({"success": False, "error": "A database error occurred. Please try again."}), 500


@app.get("/api/history")
def api_history():
    try:
        records = NavigationHistory.query.order_by(
            NavigationHistory.requested_at.desc()
        ).limit(50).all()
        return jsonify([serialize_history(item) for item in records])
    except SQLAlchemyError:
        db.session.rollback()
        app.logger.exception("Database error while reading history")
        return jsonify({"error": "Could not load navigation history."}), 500


@app.cli.command("init-db")
def init_db_command():
    """Optional CLI command: flask --app app init-db"""
    seed_database()
    print("Database tables are ready and sample campus data is available.")


with app.app_context():
    seed_database()


if __name__ == "__main__":
    # Never enable debug mode on a public production server.
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
