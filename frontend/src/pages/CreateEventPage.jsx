import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createEvent } from "../api";
import { HOURS, formatHourLabel, toDateInputValue } from "../utils/date";

export default function CreateEventPage() {
  const navigate = useNavigate();
  const defaults = useMemo(() => {
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + 4);
    return { startDate: toDateInputValue(today), endDate: toDateInputValue(end) };
  }, []);

  const [form, setForm] = useState({
    name: "",
    startDate: defaults.startDate,
    endDate: defaults.endDate,
    startHour: 9,
    endHour: 22,
    slotMinutes: 60,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const created = await createEvent(form);
      navigate(created.url);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="absolute left-6 top-6">
        <span className="inline-flex items-center rounded-full border border-brand-300/50 bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700">
          When3Meet
        </span>
      </div>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20">
        <section className="glass-panel w-full p-6 sm:p-8">
          <div className="mb-6 space-y-1">
            <h1 className="text-2xl font-semibold text-brand-700">Create an event</h1>
            <p className="text-sm text-brand-400">
              受夠難用的When2meet了嗎?
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-brand-700">Event name</span>
              <input
                className="form-input"
                placeholder="Team offsite planning"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-700">Start date</span>
                <input
                  className="form-input"
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-700">End date</span>
                <input
                  className="form-input"
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                  required
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-700">Start time</span>
                <select
                  className="form-input cursor-pointer"
                  value={form.startHour}
                  onChange={(event) => {
                    const newHour = Number(event.target.value);
                    setForm((current) => ({
                      ...current,
                      startHour: newHour,
                      endHour: current.endHour <= newHour ? newHour + 1 : current.endHour,
                    }));
                  }}
                >
                  {HOURS.filter((h) => h < 23).map((h) => (
                    <option key={h} value={h}>{formatHourLabel(h)}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-700">End time</span>
                <select
                  className="form-input cursor-pointer"
                  value={form.endHour}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endHour: Number(event.target.value) }))
                  }
                >
                  {HOURS.filter((h) => h > form.startHour).map((h) => (
                    <option key={h} value={h}>{formatHourLabel(h)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-brand-700">
                時間間隔
                <span className="ml-1.5 text-xs font-normal text-brand-400">(選填)</span>
              </span>
              <div className="flex gap-2">
                {[
                  { value: 60, label: "每 1 小時" },
                  { value: 30, label: "每 30 分鐘" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`flex-1 rounded-xl border py-2 text-sm font-medium transition ${
                      form.slotMinutes === value
                        ? "border-brand-500 bg-brand-100 text-brand-700"
                        : "border-brand-200 bg-white text-brand-400 hover:bg-brand-50"
                    }`}
                    onClick={() => setForm((c) => ({ ...c, slotMinutes: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-300/50 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button className="primary-button w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating event..." : "Generate event link →"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
