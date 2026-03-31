const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error("Cannot reach the server. Make sure the backend is running: cd backend && npm run dev");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        `Server error (${response.status}). Is the backend running? Run: cd backend && npm run dev`,
    );
  }

  return data;
}

export function createEvent(payload) {
  return request("/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchEvent(eventId, userName) {
  const query = userName ? `?userName=${encodeURIComponent(userName)}` : "";
  return request(`/events/${eventId}${query}`);
}

export function saveAvailability(eventId, payload) {
  return request(`/events/${eventId}/availability`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
