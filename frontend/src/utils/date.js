export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDatesInRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const last = new Date(`${endDate}T12:00:00`);

  while (cursor <= last) {
    dates.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function buildSlotKey(date, hour) {
  return `${date}T${String(hour).padStart(2, "0")}:00`;
}

export function formatDateLabel(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function formatHourLabel(hour) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: true,
  }).format(new Date(2024, 0, 1, hour, 0, 0));
}

export function formatSlotLabel(slot) {
  const [date, time] = slot.split("T");
  const hour = Number(time.split(":")[0]);
  return `${formatDateLabel(date)} at ${formatHourLabel(hour)}`;
}
