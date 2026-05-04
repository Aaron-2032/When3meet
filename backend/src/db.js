import path from "node:path";
import { fileURLToPath } from "node:url";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../data/when3meet.db");

let dbPromise;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = open({
      filename: dbPath,
      driver: sqlite3.Database,
    }).then(async (db) => {
      await db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          start_hour INTEGER NOT NULL DEFAULT 0,
          end_hour INTEGER NOT NULL DEFAULT 23,
          slot_minutes INTEGER NOT NULL DEFAULT 60,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS availability (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          datetime TEXT NOT NULL,
          status INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
          UNIQUE (event_id, user_name, datetime)
        );

        CREATE INDEX IF NOT EXISTS idx_availability_event_datetime
          ON availability (event_id, datetime);
      `);

      await db.exec("ALTER TABLE events ADD COLUMN slot_minutes INTEGER NOT NULL DEFAULT 60").catch(() => {});

      return db;
    });
  }

  return dbPromise;
}
