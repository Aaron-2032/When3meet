export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const WEEKDAYS_ZH = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

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

export function buildSlotKey(date, hour, minute = 0) {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function buildSlotsForRange(startHour, endHour, slotMinutes = 60) {
  const slots = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    slots.push({ hour, minute: 0 });
    if (slotMinutes === 30) {
      slots.push({ hour, minute: 30 });
    }
  }
  return slots;
}

export function formatDateLabel(date) {
  const d = new Date(`${date}T12:00:00`);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day} ${WEEKDAYS_ZH[d.getDay()]}`;
}

export function formatHourLabel(hour) {
  if (hour === 0) return "12AM";
  if (hour === 12) return "12PM";
  return hour < 12 ? `${hour}AM` : `${hour - 12}PM`;
}

export function formatSlotLabel(slot) {
  const [date, time] = slot.split("T");
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const timeLabel = minute > 0
    ? `${formatHourLabel(hour)}:${String(minute).padStart(2, "0")}`
    : formatHourLabel(hour);
  return `${formatDateLabel(date)} ${timeLabel}`;
}
