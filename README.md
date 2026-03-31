# When3Meet

A modern When2Meet-style availability planner built with React, Vite, Tailwind CSS, Express, and SQLite.

## Project structure

```text
When3meet/
  backend/
    data/
    src/
      db.js
      server.js
    package.json
  frontend/
    src/
      pages/
      utils/
      App.jsx
      api.js
      index.css
      main.jsx
    index.html
    package.json
    postcss.config.js
    tailwind.config.js
    vite.config.js
  .gitignore
  README.md
```

## Features

- Create an event with a name and date range
- Share a unique event URL
- Select availability by clicking or dragging across hourly slots
- Save availability under a participant name
- See overlap counts with color intensity
- Highlight the best time slots
- Hover for participant tooltips
- Poll the backend every few seconds for updates
- Mobile-friendly responsive layout

## Run locally

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

The API runs on `http://localhost:4000`.

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

The Vite app runs on `http://localhost:5173` and proxies API requests to the backend.

## Notes

- Availability is stored in `backend/data/when3meet.db`
- Event routes use the format `/event/:id`
- The frontend stores the participant name in local storage per event
