import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchEvent, saveAvailability } from "../api";
import {
  HOURS,
  buildSlotKey,
  formatDateLabel,
  formatHourLabel,
  formatSlotLabel,
  getDatesInRange,
} from "../utils/date";

function getStorageKey(eventId) {
  return `when3meet:name:${eventId}`;
}

function getCellClasses(count, maxCount, isSelected, isBest) {
  if (isSelected) {
    return "border-brand-300 bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white shadow-md shadow-brand-900/40";
  }

  if (count === 0 || maxCount === 0) {
    return "border-white/10 bg-slate-900/60 text-slate-400 hover:bg-slate-800/80";
  }

  const ratio = count / maxCount;

  if (ratio >= 1) {
    return `border-emerald-300/40 bg-emerald-400/40 text-emerald-50 ${isBest ? "ring-2 ring-amber-300/80" : ""}`;
  }

  if (ratio >= 0.66) {
    return `border-cyan-300/30 bg-cyan-400/30 text-cyan-50 ${isBest ? "ring-2 ring-amber-300/70" : ""}`;
  }

  if (ratio >= 0.33) {
    return `border-violet-300/20 bg-violet-400/25 text-violet-50 ${isBest ? "ring-2 ring-amber-300/60" : ""}`;
  }

  return `border-white/10 bg-white/10 text-slate-200 ${isBest ? "ring-2 ring-amber-300/50" : ""}`;
}

export default function EventPage() {
  const { id } = useParams();
  const [eventData, setEventData] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState(new Set());
  const [userName, setUserName] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);

  const dragRef = useRef({
    active: false,
    mode: "add",
    visited: new Set(),
  });
  const selectedSlotsRef = useRef(new Set());
  const isSavingRef = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const storedName = window.localStorage.getItem(getStorageKey(id));

    if (storedName) {
      setUserName(storedName);
      setPendingName(storedName);
      setIsNameDialogOpen(false);
    } else {
      setIsNameDialogOpen(true);
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;

    async function loadEvent() {
      try {
        if (!mounted) {
          return;
        }

        if (!eventData) {
          setLoading(true);
        }

        const nextEvent = await fetchEvent(id, userName);

        if (!mounted) {
          return;
        }

        setEventData(nextEvent);
        setError("");

        if (!isDraggingRef.current && !isSavingRef.current) {
          const slots = new Set(nextEvent.userAvailability || []);
          selectedSlotsRef.current = slots;
          setSelectedSlots(slots);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadEvent();

    const interval = window.setInterval(() => {
      if (!isSavingRef.current) {
        loadEvent();
      }
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [id, userName]);

  useEffect(() => {
    function handlePointerUp() {
      finishDrag();
    }

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  const dates = useMemo(() => {
    if (!eventData?.event) {
      return [];
    }

    return getDatesInRange(eventData.event.start_date, eventData.event.end_date);
  }, [eventData]);

  const counts = eventData?.availability?.counts || {};
  const usersBySlot = eventData?.availability?.usersBySlot || {};
  const maxCount = Object.values(counts).reduce((highest, value) => Math.max(highest, value), 0);
  const bestSlots = new Set(
    Object.entries(counts)
      .filter(([, value]) => value > 0 && value === maxCount)
      .map(([slot]) => slot),
  );

  async function persistSelection(slotsToSave) {
    if (!userName) {
      setIsNameDialogOpen(true);
      return;
    }

    setSaveError("");
    setIsSaving(true);
    isSavingRef.current = true;

    try {
      await saveAvailability(id, {
        userName,
        slots: [...slotsToSave].sort(),
      });

      const refreshed = await fetchEvent(id, userName);
      setEventData(refreshed);

      const normalized = new Set(refreshed.userAvailability || []);
      selectedSlotsRef.current = normalized;
      setSelectedSlots(normalized);
    } catch (persistError) {
      setSaveError(persistError.message);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }

  function updateSlot(slot, mode) {
    if (dragRef.current.visited.has(slot)) {
      return;
    }

    dragRef.current.visited.add(slot);

    setSelectedSlots((current) => {
      const next = new Set(current);

      if (mode === "add") {
        next.add(slot);
      } else {
        next.delete(slot);
      }

      selectedSlotsRef.current = next;
      return next;
    });
  }

  function startDrag(slot) {
    if (!userName) {
      setIsNameDialogOpen(true);
      return;
    }

    const mode = selectedSlotsRef.current.has(slot) ? "remove" : "add";

    dragRef.current = {
      active: true,
      mode,
      visited: new Set(),
    };
    isDraggingRef.current = true;
    document.body.style.userSelect = "none";
    updateSlot(slot, mode);
  }

  function extendDrag(slot) {
    if (!dragRef.current.active) {
      return;
    }

    updateSlot(slot, dragRef.current.mode);
  }

  function finishDrag() {
    if (!dragRef.current.active) {
      return;
    }

    dragRef.current.active = false;
    dragRef.current.visited = new Set();
    isDraggingRef.current = false;
    document.body.style.userSelect = "";
    persistSelection(selectedSlotsRef.current);
  }

  function handleNameSubmit(event) {
    event.preventDefault();

    const normalized = pendingName.trim();

    if (!normalized) {
      return;
    }

    window.localStorage.setItem(getStorageKey(id), normalized);
    setUserName(normalized);
    setPendingName(normalized);
    setIsNameDialogOpen(false);
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
        <div className="glass-panel px-6 py-5 text-slate-200">Loading event...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-10">
        <div className="glass-panel w-full space-y-4 p-8">
          <p className="text-lg font-semibold text-white">Unable to load this event</p>
          <p className="text-sm text-slate-300">{error}</p>
          <Link className="secondary-button" to="/">
            Create a new event
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-2">
          <div className="text-sm text-brand-100">Shared availability board</div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            {eventData.event.name}
          </h1>
          <p className="text-sm text-slate-300">
            {formatDateLabel(eventData.event.start_date)} to{" "}
            {formatDateLabel(eventData.event.end_date)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="secondary-button"
            onClick={() => setIsNameDialogOpen(true)}
            type="button"
          >
            {userName ? `You: ${userName}` : "Set your name"}
          </button>
          <Link className="secondary-button" to="/">
            New event
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-slate-300">
                Click or drag across the grid to mark when you are free. Colored cells show how
                many people are available.
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="rounded-full bg-slate-800/80 px-3 py-1">24-hour view</span>
                <span className="rounded-full bg-brand-500/20 px-3 py-1">
                  Your selection
                </span>
                <span className="rounded-full bg-emerald-400/20 px-3 py-1">Best slots</span>
              </div>
            </div>
          </div>

          <div className="overflow-auto">
            <div
              className="grid min-w-[900px]"
              style={{
                gridTemplateColumns: `88px repeat(${dates.length}, minmax(110px, 1fr))`,
              }}
            >
              <div className="sticky left-0 top-0 z-30 border-b border-r border-white/10 bg-slate-950/95 px-3 py-4 text-xs uppercase tracking-[0.2em] text-slate-400 backdrop-blur">
                Time
              </div>

              {dates.map((date) => (
                <div
                  key={date}
                  className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 px-3 py-4 text-center text-sm font-medium text-slate-100 backdrop-blur"
                >
                  {formatDateLabel(date)}
                </div>
              ))}

              {HOURS.flatMap((hour) => {
                const row = [
                  <div
                    key={`hour-${hour}`}
                    className="sticky left-0 z-10 border-r border-white/10 bg-slate-950/95 px-3 py-4 text-sm font-medium text-slate-200 backdrop-blur"
                  >
                    {formatHourLabel(hour)}
                  </div>,
                ];

                for (const date of dates) {
                  const slot = buildSlotKey(date, hour);
                  const count = counts[slot] || 0;
                  const users = usersBySlot[slot] || [];
                  const isSelected = selectedSlots.has(slot);
                  const isBest = bestSlots.has(slot);

                  row.push(
                    <button
                      key={slot}
                      className={`m-1 flex min-h-20 touch-none flex-col items-center justify-center rounded-2xl border text-center text-sm transition ${getCellClasses(
                        count,
                        maxCount,
                        isSelected,
                        isBest,
                      )}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startDrag(slot);
                      }}
                      onPointerEnter={() => extendDrag(slot)}
                      onPointerUp={() => finishDrag()}
                      title={users.length ? `Available: ${users.join(", ")}` : "No one yet"}
                      type="button"
                    >
                      <span className="text-lg font-semibold">{count}</span>
                      <span className="px-2 text-[11px] leading-tight opacity-85">
                        {users.length ? users.join(", ") : "No availability"}
                      </span>
                    </button>,
                  );
                }

                return row;
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="glass-panel p-5">
            <h2 className="text-lg font-semibold text-white">Status</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>{userName ? `Saving as ${userName}` : "Add your name to start selecting."}</p>
              <p>{isSaving ? "Saving changes..." : "Changes save automatically after dragging."}</p>
              {saveError ? <p className="text-rose-200">{saveError}</p> : null}
            </div>
          </section>

          <section className="glass-panel p-5">
            <h2 className="text-lg font-semibold text-white">Best time slots</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {maxCount > 0 ? (
                <>
                  <p>{maxCount} participant(s) are available in the top slot(s).</p>
                  {Array.from(bestSlots)
                    .slice(0, 6)
                    .map((slot) => (
                      <div
                        key={slot}
                        className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-emerald-50"
                      >
                        {formatSlotLabel(slot)}
                      </div>
                    ))}
                </>
              ) : (
                <p>No availability has been submitted yet.</p>
              )}
            </div>
          </section>
        </aside>
      </section>

      {isNameDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <form className="glass-panel w-full max-w-md p-6" onSubmit={handleNameSubmit}>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-white">Enter your name</h2>
              <p className="text-sm text-slate-300">
                Your availability is saved under this name for this event.
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <input
                autoFocus
                className="form-input"
                maxLength={40}
                placeholder="Alex"
                value={pendingName}
                onChange={(event) => setPendingName(event.target.value)}
              />

              <div className="flex justify-end gap-3">
                {userName ? (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setPendingName(userName);
                      setIsNameDialogOpen(false);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
                <button className="primary-button" type="submit">
                  Save name
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
