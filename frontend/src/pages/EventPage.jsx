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

function copyToClipboard(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function getCellClasses(isSelected) {
  if (isSelected) {
    return "border-brand-300 bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white shadow-md shadow-brand-900/40";
  }
  return "border-white/10 bg-slate-900/60 text-slate-400 hover:bg-slate-800/80";
}

function hoursToRanges(hours) {
  const ranges = [];
  let start = null;
  let prev = null;
  for (const h of hours) {
    if (start === null) { start = h; prev = h; }
    else if (h === prev + 1) { prev = h; }
    else { ranges.push({ start, end: prev }); start = h; prev = h; }
  }
  if (start !== null) ranges.push({ start, end: prev });
  return ranges;
}

function HourLabel({ hour }) {
  const label = formatHourLabel(hour);
  const match = label.match(/^(\d+)(AM|PM)$/);
  if (!match) return <span>{label}</span>;
  const [, num, period] = match;
  return (
    <span className="inline-flex items-baseline gap-px">
      <span style={{ fontSize: "1.15em" }}>{num}</span>
      <span style={{ fontSize: "0.7em" }}>{period}</span>
    </span>
  );
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
  const [copied, setCopied] = useState(false);
  const [isBestOpen, setIsBestOpen] = useState(true);

  const dragRef = useRef({ active: false, mode: "add", visited: new Set(), startSlot: null, initialSlots: new Set() });
  const dragMoved = useRef(false);
  const selectedSlotsRef = useRef(new Set());
  const isSavingRef = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const storedName = window.localStorage.getItem(getStorageKey(id));
    if (storedName) {
      setUserName(storedName);
      setPendingName(storedName);
    }
    setIsNameDialogOpen(false);
  }, [id]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function loadEvent() {
      try {
        if (!mounted) return;

        const nextEvent = await fetchEvent(id, userName);
        if (!mounted) return;

        setEventData(nextEvent);
        setError("");

        if (!isDraggingRef.current && !isSavingRef.current) {
          const slots = new Set(nextEvent.userAvailability || []);
          selectedSlotsRef.current = slots;
          setSelectedSlots(slots);
        }
      } catch (loadError) {
        if (mounted) setError(loadError.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadEvent();
    const interval = window.setInterval(() => {
      if (!isSavingRef.current) loadEvent();
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [id, userName]);

  useEffect(() => {
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
    };
  }, []);

  const dates = useMemo(() => {
    if (!eventData?.event) return [];
    return getDatesInRange(eventData.event.start_date, eventData.event.end_date);
  }, [eventData]);

  const eventHours = useMemo(() => {
    if (!eventData?.event) return HOURS;
    const startH = eventData.event.start_hour ?? 0;
    const endH = eventData.event.end_hour ?? 23;
    return HOURS.filter((h) => h >= startH && h <= endH);
  }, [eventData]);

  const counts = eventData?.availability?.counts || {};
  const usersBySlot = eventData?.availability?.usersBySlot || {};
  const maxCount = Object.values(counts).reduce((h, v) => Math.max(h, v), 0);
  const bestSlots = new Set(
    Object.entries(counts)
      .filter(([, v]) => v > 0 && v === maxCount)
      .map(([slot]) => slot),
  );

  const bestByDate = (() => {
    const map = {};
    for (const slot of bestSlots) {
      const [date, time] = slot.split("T");
      const hour = Number(time.split(":")[0]);
      if (!map[date]) map[date] = [];
      map[date].push({ hour, slot });
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => {
        const sorted = [...items].sort((a, b) => a.hour - b.hour);
        const users = [...new Set(sorted.flatMap(({ slot }) => usersBySlot[slot] || []))];
        return { date, hours: sorted.map((s) => s.hour), users };
      });
  })();

  async function persistSelection(slotsToSave) {
    if (!userName) { setIsNameDialogOpen(true); return; }
    setSaveError("");
    setIsSaving(true);
    isSavingRef.current = true;

    try {
      await saveAvailability(id, { userName, slots: [...slotsToSave].sort() });
      const refreshed = await fetchEvent(id, userName);
      setEventData(refreshed);
      const normalized = new Set(refreshed.userAvailability || []);
      selectedSlotsRef.current = normalized;
      setSelectedSlots(normalized);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }

  function updateSlot(slot, mode) {
    if (dragRef.current.visited.has(slot)) return;
    dragRef.current.visited.add(slot);
    setSelectedSlots((current) => {
      const next = new Set(current);
      if (mode === "add") next.add(slot); else next.delete(slot);
      selectedSlotsRef.current = next;
      return next;
    });
  }

  function startDrag(slot) {
    if (!userName) { setIsNameDialogOpen(true); return; }
    const mode = selectedSlotsRef.current.has(slot) ? "remove" : "add";
    dragRef.current = {
      active: true,
      mode,
      visited: new Set(),
      startSlot: slot,
      initialSlots: new Set(selectedSlotsRef.current),
    };
    dragMoved.current = false;
    isDraggingRef.current = true;
    document.body.style.userSelect = "none";
    // Don't toggle yet — wait for tap (pointerup on same cell) or drag (entering another cell)
  }

  function extendDrag(slot) {
    if (!dragRef.current.active) return;
    if (slot === dragRef.current.startSlot) return;
    if (!dragMoved.current) {
      // First cell entered after start — commit start cell and mark as drag
      dragMoved.current = true;
      updateSlot(dragRef.current.startSlot, dragRef.current.mode);
    }
    updateSlot(slot, dragRef.current.mode);
  }

  function finishDrag() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    isDraggingRef.current = false;
    document.body.style.userSelect = "";

    const { startSlot, mode } = dragRef.current;
    dragRef.current.visited = new Set();

    if (!dragMoved.current && startSlot) {
      // Pure tap — apply toggle only to the tapped cell
      const next = new Set(selectedSlotsRef.current);
      if (mode === "add") next.add(startSlot);
      else next.delete(startSlot);
      selectedSlotsRef.current = next;
      setSelectedSlots(next);
      persistSelection(next);
    } else if (dragMoved.current) {
      persistSelection(selectedSlotsRef.current);
    }
  }

  function cancelDrag() {
    if (!dragRef.current.active) return;
    if (dragMoved.current) {
      // Revert any cells toggled during the cancelled drag
      const initial = new Set(dragRef.current.initialSlots);
      selectedSlotsRef.current = initial;
      setSelectedSlots(initial);
    }
    dragRef.current.active = false;
    dragRef.current.visited = new Set();
    isDraggingRef.current = false;
    document.body.style.userSelect = "";
  }

  function handleNameSubmit(event) {
    event.preventDefault();
    const normalized = pendingName.trim();
    if (!normalized) return;
    window.localStorage.setItem(getStorageKey(id), normalized);
    setUserName(normalized);
    setPendingName(normalized);
    setIsNameDialogOpen(false);
  }

  function handleCopyLink() {
    copyToClipboard(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSelectAllDay(date) {
    if (!userName) { setIsNameDialogOpen(true); return; }
    const daySlots = eventHours.map((h) => buildSlotKey(date, h));
    const allSelected = daySlots.every((s) => selectedSlotsRef.current.has(s));
    const next = new Set(selectedSlotsRef.current);
    daySlots.forEach((s) => (allSelected ? next.delete(s) : next.add(s)));
    selectedSlotsRef.current = next;
    setSelectedSlots(next);
    persistSelection(next);
  }

  function handleSelectAll() {
    if (!userName) { setIsNameDialogOpen(true); return; }
    const allSlots = dates.flatMap((date) => eventHours.map((h) => buildSlotKey(date, h)));
    const allSelected = allSlots.every((s) => selectedSlotsRef.current.has(s));
    const next = new Set(allSelected ? [] : allSlots);
    selectedSlotsRef.current = next;
    setSelectedSlots(next);
    persistSelection(next);
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
          <Link className="secondary-button" to="/">Create a new event</Link>
        </div>
      </main>
    );
  }

  if (!userName) {
    const participantNames = [
      ...new Set(Object.values(eventData?.availability?.usersBySlot || {}).flat()),
    ];

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12">
        <div className="glass-panel w-full space-y-1 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            You&rsquo;re invited
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">{eventData.event.name}</h1>
          <p className="text-sm text-slate-400">
            {formatDateLabel(eventData.event.start_date)} &rarr;{" "}
            {formatDateLabel(eventData.event.end_date)}
          </p>
          {participantNames.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {participantNames.map((name) => (
                <span key={name} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                  {name} ✓
                </span>
              ))}
              <span className="rounded-full bg-slate-800/50 px-3 py-1 text-xs text-slate-500">
                {participantNames.length} responded
              </span>
            </div>
          )}
        </div>

        <div className="glass-panel w-full p-6">
          <h2 className="mb-1 text-lg font-semibold text-white">Enter your name to join</h2>
          <p className="mb-5 text-sm text-slate-400">
            You&rsquo;ll be able to mark your availability on the next screen.
          </p>
          <form className="space-y-4" onSubmit={handleNameSubmit}>
            <input
              autoFocus
              className="form-input"
              maxLength={40}
              placeholder="Your name"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
            />
            <button className="primary-button w-full" type="submit">
              Join &amp; select availability →
            </button>
          </form>
        </div>

        <button className="secondary-button w-full" type="button" onClick={handleCopyLink}>
          {copied ? "✓ Link copied!" : "📋 Copy invite link"}
        </button>

        <Link className="text-xs text-slate-600 hover:text-slate-400" to="/">
          Create your own event
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
      {/* Header */}
      <section className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-xs text-brand-100 sm:text-sm">Shared availability board</div>
          <h1 className="text-xl font-semibold text-white sm:text-3xl">{eventData.event.name}</h1>
          <p className="text-xs text-slate-300 sm:text-sm">
            {formatDateLabel(eventData.event.start_date)} to{" "}
            {formatDateLabel(eventData.event.end_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="secondary-button text-sm" type="button" onClick={handleCopyLink}>
            {copied ? "✓ Copied!" : "📋 Copy link"}
          </button>
          <button className="secondary-button text-sm" type="button" onClick={() => setIsNameDialogOpen(true)}>
            👤 {userName}
          </button>
          <Link className="secondary-button text-sm" to="/">＋ New</Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="glass-panel overflow-hidden">
          {/* Controls */}
          <div className="border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-100">
                  已選時段
                </span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                  最佳時段
                </span>
                <button
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-slate-100 transition hover:bg-white/15 active:scale-95"
                  type="button"
                  onClick={handleSelectAll}
                >
                  {dates.flatMap((d) => eventHours.map((h) => buildSlotKey(d, h))).every((s) => selectedSlots.has(s))
                    ? "清除全選"
                    : "全選"}
                </button>
              </div>
              <p className="text-xs text-slate-500">點擊日期標題可全選當天</p>
            </div>
          </div>

          {/* Availability grid */}
          <div className="grid-scroll-area">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `68px repeat(${dates.length}, minmax(88px, 1fr))`,
                minWidth: `${68 + dates.length * 88}px`,
              }}
            >
              <div className="sticky left-0 top-0 z-30 border-b border-r border-white/10 bg-slate-950/95 px-2 py-3 text-[10px] uppercase tracking-widest text-slate-400 backdrop-blur">
                Time
              </div>

              {dates.map((date) => {
                const daySlots = eventHours.map((h) => buildSlotKey(date, h));
                const allSelected = daySlots.every((s) => selectedSlots.has(s));
                return (
                  <div
                    key={date}
                    className="sticky top-0 z-20 flex flex-col items-center gap-1 border-b border-white/10 bg-slate-950/95 px-1 py-2 text-center backdrop-blur"
                  >
                    <span className="text-xs font-medium text-slate-100">{formatDateLabel(date)}</span>
                    <button
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/15 active:scale-95"
                      type="button"
                      onClick={() => handleSelectAllDay(date)}
                    >
                      {allSelected ? "Clear" : "All"}
                    </button>
                  </div>
                );
              })}

              {eventHours.flatMap((hour) => {
                const row = [
                  <div
                    key={`hour-${hour}`}
                    className="sticky left-0 z-10 flex items-center border-r border-white/10 bg-slate-950/95 px-2 text-xs font-medium text-slate-200 backdrop-blur"
                    style={{ minHeight: "60px" }}
                  >
                    <HourLabel hour={hour} />
                  </div>,
                ];

                for (const date of dates) {
                  const slot = buildSlotKey(date, hour);
                  const count = counts[slot] || 0;
                  const users = usersBySlot[slot] || [];
                  const isSelected = selectedSlots.has(slot);

                  row.push(
                    <button
                      key={slot}
                      className={`m-0.5 flex flex-col items-center justify-center rounded-xl border text-center transition sm:m-1 sm:rounded-2xl ${getCellClasses(isSelected)}`}
                      style={{ minHeight: "60px" }}
                      onPointerDown={(e) => { e.preventDefault(); startDrag(slot); }}
                      onPointerEnter={() => extendDrag(slot)}
                      onPointerUp={() => finishDrag()}
                      onPointerCancel={() => cancelDrag()}
                      title={users.length ? `Available: ${users.join(", ")}` : "No one yet"}
                      type="button"
                    >
                      <span className="text-base font-semibold">{count}</span>
                      {users.length > 0 && (
                        <span className="hidden px-1 text-[10px] leading-tight opacity-80 sm:block">
                          {users.join(", ")}
                        </span>
                      )}
                    </button>,
                  );
                }

                return row;
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="glass-panel overflow-hidden">
            <button
              className="flex w-full items-center justify-between p-5 text-left transition hover:bg-white/5"
              type="button"
              onClick={() => setIsBestOpen((prev) => !prev)}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">Best time slots</h2>
                {maxCount > 0 && (
                  <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                    {bestSlots.size}
                  </span>
                )}
              </div>
              <svg
                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isBestOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isBestOpen && (
              <div className="space-y-3 px-5 pb-5">
                {maxCount > 0 ? (
                  <>
                    <p className="text-xs text-slate-400">
                      最多 {maxCount} 人同時有空，共 {bestSlots.size} 個時段
                    </p>
                    {bestByDate.slice(0, 6).map(({ date, hours, users }) => (
                      <div key={date} className="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-3">
                        <p className="mb-2 text-xs font-semibold text-emerald-300">
                          {formatDateLabel(date)}
                        </p>
                        <div className="mb-2 flex flex-wrap gap-1">
                          {hoursToRanges(hours).map(({ start, end }) => (
                            <span
                              key={start}
                              className="rounded-lg bg-emerald-400/20 px-2 py-0.5 text-xs font-medium text-emerald-100"
                            >
                              {start === end
                                ? <HourLabel hour={start} />
                                : <><HourLabel hour={start} />–<HourLabel hour={end + 1} /></>}
                            </span>
                          ))}
                        </div>
                        {users.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {users.map((name) => (
                              <span
                                key={name}
                                className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300"
                              >
                                ✓ {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-slate-300">尚無人填寫可用時段。</p>
                )}
              </div>
            )}
          </section>

          <section className="glass-panel p-5">
            <h2 className="text-lg font-semibold text-white">Status</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>Saving as <span className="font-medium text-white">{userName}</span></p>
              <p>{isSaving ? "Saving changes..." : "Changes save automatically after dragging."}</p>
              {saveError ? <p className="text-rose-200">{saveError}</p> : null}
            </div>
          </section>
        </aside>
      </section>

      {/* Name dialog */}
      {isNameDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <form className="glass-panel w-full max-w-md p-6" onSubmit={handleNameSubmit}>
            <h2 className="text-xl font-semibold text-white">Enter your name</h2>
            <p className="mt-1 text-sm text-slate-300">
              Your availability is saved under this name for this event.
            </p>
            <div className="mt-5 space-y-4">
              <input
                autoFocus
                className="form-input"
                maxLength={40}
                placeholder="Alex"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                {userName && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => { setPendingName(userName); setIsNameDialogOpen(false); }}
                  >
                    Cancel
                  </button>
                )}
                <button className="primary-button" type="submit">Save name</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
