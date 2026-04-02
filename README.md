# When3Meet

A modern When2Meet-style group availability planner built with React, Vite, Tailwind CSS v4, Express, and SQLite.

## Features

- Create an event with a name and date range — get a shareable unique link
- Friends open the link → see a **welcome / join screen** with the event name, dates, and who has already responded
- Enter a name to join, then mark availability by clicking or dragging across hourly slots
- Color intensity overlay shows how many people are free in each slot
- Best time slots highlighted automatically
- Hover any slot to see exactly who is available
- Changes auto-save after each drag gesture
- Polls the backend every 5 seconds so all participants stay in sync
- Copy invite link button available on the join screen and the grid header
- Mobile-friendly responsive layout

## Project structure

```text
When3meet/
  backend/
    data/                 ← SQLite database file created here at runtime
    src/
      db.js
      server.js
    package.json
  frontend/
    src/
      pages/
        CreateEventPage.jsx
        EventPage.jsx
      utils/
        date.js
      App.jsx
      api.js
      index.css
      main.jsx
    .env.production       ← set VITE_API_BASE_URL for production builds
    index.html
    package.json
    postcss.config.js
    tailwind.config.js
    vite.config.js
  index.html              ← standalone single-file version (no backend needed)
  .gitignore
  README.md
```

## Run locally

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Start the backend (Terminal 1)

```bash
cd backend
npm run dev
```

The API runs on `http://localhost:4000`.

### 3. Start the frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

The Vite app runs on `http://localhost:5173` and proxies `/api` requests to the backend.

---

## Deploy to production

### Backend — Render

1. Push the `backend/` folder to a Git repo.
2. Create a new **Web Service** on [Render](https://render.com).
3. Set the build command to `npm install` and the start command to `npm start`.
4. Copy the public URL Render assigns (e.g. `https://when3meet-backend.onrender.com`).

### Frontend — static hosting (Vercel / Netlify / etc.)

1. Create `frontend/.env.production`:

```env
VITE_API_BASE_URL=https://your-backend.onrender.com/api
```

2. Build:

```bash
cd frontend
npm run build
```

3. Deploy the generated `frontend/dist/` folder to your static host.

---

## Standalone single-file version

`index.html` in the project root is a fully self-contained version that requires **no server, no npm, no internet**. Just double-click it in Chrome. Data is stored in the browser's `localStorage` and sharing works between tabs in the same browser on the same computer.

---

## Notes

- Availability is stored in `backend/data/when3meet.db` (SQLite, auto-created on first run)
- Event routes use the format `/event/:id`
- The frontend stores each participant's name in `localStorage` keyed by event ID, so returning visitors skip the join screen
- `VITE_API_BASE_URL` is only embedded at **build time** — changes to `.env.production` require a rebuild
