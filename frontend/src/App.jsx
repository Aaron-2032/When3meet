import { Route, Routes } from "react-router-dom";

import CreateEventPage from "./pages/CreateEventPage";
import EventPage from "./pages/EventPage";

export default function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.22),_transparent_30%),linear-gradient(180deg,_#0f172a_0%,_#111827_42%,_#172554_100%)] text-slate-100">
      <Routes>
        <Route path="/" element={<CreateEventPage />} />
        <Route path="/event/:id" element={<EventPage />} />
      </Routes>
    </div>
  );
}
