import { Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";

import CreateEventPage from "./pages/CreateEventPage";
import EventPage from "./pages/EventPage";

export default function App() {
  return (
    <div className="min-h-screen bg-brand-50 text-brand-700">
      <Routes>
        <Route path="/" element={<CreateEventPage />} />
        <Route path="/event/:id" element={<EventPage />} />
      </Routes>
      <Analytics />
    </div>
  );
}
