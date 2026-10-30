# CampusFlow: Intelligent Campus Navigation Assistant

A Flask web application for a campus navigation mini project. It uses a relational database to store campus locations, connections, and navigation history. The route-finding algorithm is Breadth-First Search (BFS).

## Features

- A responsive dark dashboard UI.
- Campus locations and walkable connections stored in SQL tables.
- BFS route calculation and step-by-step directions.
- Distance and estimated walking time.
- Persistent navigation history.
- JSON endpoints for locations, navigation, and history.
- SQLite by default for local development; PostgreSQL can be used for deployment.

## Project structure

```text
smart_campus_navigation/
├── app.py
├── requirements.txt
├── Procfile
├── .env.example
├── .gitignore
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── script.js
```

## Run locally on macOS

1. Install Python 3.10 or newer.
2. Open Terminal and move into this project folder.
3. Create and activate a virtual environment:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

4. Install dependencies:

   ```bash
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

5. Start the application:

   ```bash
   python app.py
   ```

6. Open `http://127.0.0.1:5000` in your browser.

The first run creates the database tables and seeds the sample campus locations and connections. By default, local data is stored in `campus.db`.

## Database tables

- `locations`: location code, name, category, and description.
- `connections`: pairs of connected locations and distance in metres.
- `navigation_history`: start, destination, route, distance, estimated walking time, number of connections, result status, and timestamp.

The sample distances are for demonstration only. Replace them with measured distances for your actual campus before presenting the project as a real campus map.

## PostgreSQL deployment

1. Create a PostgreSQL database using your hosting provider.
2. Set the environment variable `DATABASE_URL` to the database's connection string. If the provider gives a `postgres://` URL, the app normalizes that legacy prefix automatically.
3. Deploy the project from your Git repository. The included `Procfile` runs `gunicorn app:app`.
4. Confirm that the provider uses the root directory containing `app.py` and `requirements.txt`.
5. Open the deployed URL and test a route. The database tables and sample records are created automatically when the app starts.

Do not commit real database credentials or `.env` files to GitHub. Set production environment variables in the hosting dashboard.

## API endpoints

- `GET /api/locations`: returns the available campus locations.
- `POST /api/navigate`: accepts JSON such as `{"source":"MG","destination":"BH"}` and calculates and saves the result.
- `GET /api/history`: returns up to 50 recent navigation searches.

## Algorithm note

BFS finds a path with the fewest edges in an unweighted graph. Because this project has distances on the edges, a BFS route is not guaranteed to have the minimum total distance in metres. The UI explains this distinction.

Walking time is an estimate based on 75 metres per minute. Adjust the assumption if your project specification requires a different walking speed.
