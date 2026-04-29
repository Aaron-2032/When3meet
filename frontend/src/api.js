import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

function uid() {
  return [...Array(10)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
}

export async function createEvent({ name, startDate, endDate }) {
  const id = uid();

  const { error } = await supabase
    .from("events")
    .insert({ id, name, start_date: startDate, end_date: endDate });

  if (error) throw new Error(error.message);

  return { id, url: `/event/${id}` };
}

export async function fetchEvent(eventId, userName) {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, start_date, end_date, created_at")
    .eq("id", eventId)
    .single();

  if (eventError) throw new Error("Event not found.");

  const { data: rows, error: availError } = await supabase
    .from("availability")
    .select("user_name, datetime")
    .eq("event_id", eventId)
    .order("datetime");

  if (availError) throw new Error(availError.message);

  const counts = {};
  const usersBySlot = {};
  const userAvailability = [];

  for (const row of rows) {
    counts[row.datetime] = (counts[row.datetime] || 0) + 1;
    if (!usersBySlot[row.datetime]) usersBySlot[row.datetime] = [];
    usersBySlot[row.datetime].push(row.user_name);
    if (userName && row.user_name === userName) {
      userAvailability.push(row.datetime);
    }
  }

  return {
    event,
    availability: { counts, usersBySlot },
    userAvailability,
  };
}

export async function saveAvailability(eventId, { userName, slots }) {
  const { error: deleteError } = await supabase
    .from("availability")
    .delete()
    .eq("event_id", eventId)
    .eq("user_name", userName);

  if (deleteError) throw new Error(deleteError.message);

  if (slots.length > 0) {
    const rows = slots.map((datetime) => ({ event_id: eventId, user_name: userName, datetime }));
    const { error: insertError } = await supabase.from("availability").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  return { ok: true, savedSlots: slots.length };
}
