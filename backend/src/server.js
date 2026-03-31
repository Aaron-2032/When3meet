import crypto from "node:crypto";

import cors from "cors";
import express from "express";

import { getDb } from "./db.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function isValidDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function toDateOnly(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDatesInRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);

  while (cursor <= last) {
    dates.push(toDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildValidSlotSet(startDate, endDate) {
  const slots = new Set();

  for (const date of getDatesInRange(startDate, endDate)) {
    for (let hour = 0; hour < 24; hour += 1) {
      slots.add(`${date}T${String(hour).padStart(2, "0")}:00`);
    }
  }

  return slots;
}

function createEventId() {
  return crypto.randomBytes(5).toString("hex");
}

function sanitizeName(value) {
  return String(value || "").trim().slice(0, 40);
}

async function getEventOr404(eventId, res) {
  const db = await getDb();
  const event = await db.get(
    "SELECT id, name, start_date, end_date, created_at FROM events WHERE id = ?",
    eventId,
  );

  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return null;
  }

  return event;
}

app.get("/api/health", async (_req, res) => {
  const db = await getDb();
  await db.get("SELECT 1");
  res.json({ ok: true });
});

app.post("/api/events", async (req, res) => {
  try {
    const db = await getDb();
    const name = String(req.body?.name || "").trim();
    const startDate = String(req.body?.startDate || "");
    const endDate = String(req.body?.endDate || "");

    if (!name) {
      return res.status(400).json({ error: "Event name is required." });
    }

    if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
      return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: "Start date must be before end date." });
    }

    let eventId = createEventId();

    while (await db.get("SELECT id FROM events WHERE id = ?", eventId)) {
      eventId = createEventId();
    }

    await db.run(
      "INSERT INTO events (id, name, start_date, end_date) VALUES (?, ?, ?, ?)",
      eventId,
      name,
      startDate,
      endDate,
    );

    return res.status(201).json({
      id: eventId,
      url: `/event/${eventId}`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create event." });
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const event = await getEventOr404(req.params.id, res);

    if (!event) {
      return;
    }

    const db = await getDb();
    const userName = sanitizeName(req.query.userName);
    const rows = await db.all(
      `
        SELECT user_name, datetime
        FROM availability
        WHERE event_id = ? AND status = 1
        ORDER BY datetime ASC, user_name ASC
      `,
      req.params.id,
    );

    const counts = {};
    const usersBySlot = {};
    const userAvailability = [];

    for (const row of rows) {
      counts[row.datetime] = (counts[row.datetime] || 0) + 1;

      if (!usersBySlot[row.datetime]) {
        usersBySlot[row.datetime] = [];
      }

      usersBySlot[row.datetime].push(row.user_name);

      if (userName && row.user_name === userName) {
        userAvailability.push(row.datetime);
      }
    }

    return res.json({
      event,
      availability: {
        counts,
        usersBySlot,
      },
      userAvailability,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load event." });
  }
});

app.put("/api/events/:id/availability", async (req, res) => {
  let db;
  let transactionStarted = false;

  try {
    db = await getDb();
    const event = await getEventOr404(req.params.id, res);

    if (!event) {
      return;
    }

    const userName = sanitizeName(req.body?.userName);
    const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];

    if (!userName) {
      return res.status(400).json({ error: "Your name is required." });
    }

    const validSlots = buildValidSlotSet(event.start_date, event.end_date);
    const normalizedSlots = [...new Set(slots.map((slot) => String(slot)))];

    if (normalizedSlots.some((slot) => !validSlots.has(slot))) {
      return res.status(400).json({ error: "One or more time slots are invalid." });
    }

    await db.exec("BEGIN");
    transactionStarted = true;
    await db.run(
      "DELETE FROM availability WHERE event_id = ? AND user_name = ?",
      req.params.id,
      userName,
    );

    if (normalizedSlots.length > 0) {
      const statement = await db.prepare(
        `
          INSERT INTO availability (event_id, user_name, datetime, status)
          VALUES (?, ?, ?, 1)
        `,
      );

      try {
        for (const slot of normalizedSlots) {
          await statement.run(req.params.id, userName, slot);
        }
      } finally {
        await statement.finalize();
      }
    }

    await db.exec("COMMIT");
    transactionStarted = false;

    return res.json({
      ok: true,
      savedSlots: normalizedSlots.length,
    });
  } catch (error) {
    if (transactionStarted && db) {
      await db.exec("ROLLBACK");
    }
    console.error(error);
    return res.status(500).json({ error: "Failed to save availability." });
  }
});

app.listen(PORT, () => {
  console.log(`When3Meet API running on http://localhost:${PORT}`);
});
