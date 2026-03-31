import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createEvent } from "../api";
import { toDateInputValue } from "../utils/date";

export default function CreateEventPage() {
  const navigate = useNavigate();
  const defaults = useMemo(() => {
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + 4);

    return {
      startDate: toDateInputValue(today),
      endDate: toDateInputValue(end),
    };
  }, []);

  const [form, setForm] = useState({
    name: "",
    startDate: defaults.startDate,
    endDate: defaults.endDate,
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-100">
            When3Meet
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              A modern way to find the best time for everyone.
            </h1>
            <p className="max-w-2xl text-lg text-slate-300">
              Create a shared availability board in seconds, invite friends or teammates,
              and see the best time slots light up automatically.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Smooth click-and-drag time selection",
              "Live overlap counts with soft color intensity",
              "Responsive design for desktop and mobile",
            ].map((item) => (
              <div key={item} className="glass-panel p-4 text-sm text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel p-6 sm:p-8">
          <div className="mb-6 space-y-2">
            <h2 className="text-2xl font-semibold text-white">Create an event</h2>
            <p className="text-sm text-slate-300">
              Pick a name and date range, then share the generated link with your group.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Event name</span>
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
                <span className="text-sm font-medium text-slate-200">Start date</span>
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
                <span className="text-sm font-medium text-slate-200">End date</span>
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

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <button className="primary-button w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating event..." : "Generate event link"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
