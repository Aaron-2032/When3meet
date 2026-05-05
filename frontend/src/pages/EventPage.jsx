import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchEvent, saveAvailability } from "../api";
import {
  buildSlotKey,
  buildSlotsForRange,
  formatDateLabel,
  formatHourLabel,
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
    return "border-brand-600 bg-gradient-to-br from-brand-700 to-brand-500 text-white shadow-sm shadow-brand-700/20";
  }
  return "border-brand-200 bg-brand-50 text-brand-400 hover:bg-brand-100";
}

function slotsToRanges(slots, slotMinutes = 60) {
  if (slots.length === 0) return [];
  const ranges = [];
  let start = slots[0];
  let prev = slots[0];
  for (let i = 1; i < slots.length; i++) {
    const curr = slots[i];
    const isConsecutive = curr.hour * 60 + curr.minute === prev.hour * 60 + prev.minute + slotMinutes;
    if (isConsecutive) { prev = curr; }
    else { ranges.push({ start, end: prev }); start = curr; prev = curr; }
  }
  ranges.push({ start, end: prev });
  return ranges;
}

function SlotLabel({ hour, minute }) {
  if (minute === 30) {
    return <span className="text-[10px] text-brand-300">:30</span>;
  }
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
  const isExpiredRef = useRef(false);
  const saveQueueRef = useRef(null);

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
        isExpiredRef.current = nextEvent.isExpired ?? false;
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
      if (!isSavingRef.current && !isExpiredRef.current) loadEvent();
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

  const eventSlots = useMemo(() => {
    if (!eventData?.event) return buildSlotsForRange(0, 23, 60);
    const startH = eventData.event.start_hour ?? 0;
    const endH = eventData.event.end_hour ?? 23;
    const sm = eventData.event.slot_minutes ?? 60;
    return buildSlotsForRange(startH, endH, sm);
  }, [eventData]);

  const slotMinutes = eventData?.event?.slot_minutes ?? 60;
  const cellHeight = slotMinutes === 30 ? 40 : 60;

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
      const [hourStr, minuteStr] = time.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (!map[date]) map[date] = [];
      map[date].push({ hour, minute, slot });
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => {
        const sorted = [...items].sort((a, b) => a.hour - b.hour || a.minute - b.minute);
        const users = [...new Set(sorted.flatMap(({ slot }) => usersBySlot[slot] || []))];
        return { date, slots: sorted, users };
      });
  })();

  async function persistSelection(slotsToSave) {
    if (!userName) { setIsNameDialogOpen(true); return; }
    setSaveError("");

    if (isSavingRef.current) {
      saveQueueRef.current = slotsToSave;
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      let pending = slotsToSave;
      do {
        saveQueueRef.current = null;
        await saveAvailability(id, { userName, slots: [...pending].sort() });
        pending = saveQueueRef.current;
      } while (pending !== null);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      isSavingRef.current = false;
      saveQueueRef.current = null;
      setIsSaving(false);
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
    if (isExpiredRef.current) return;
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
  }

  function extendDrag(slot) {
    if (!dragRef.current.active) return;
    if (slot === dragRef.current.startSlot) return;
    if (!dragMoved.current) {
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
    if (isExpiredRef.current || !userName) { setIsNameDialogOpen(true); return; }
    const daySlots = eventSlots.map(({ hour, minute }) => buildSlotKey(date, hour, minute));
    const allSelected = daySlots.every((s) => selectedSlotsRef.current.has(s));
    const next = new Set(selectedSlotsRef.current);
    daySlots.forEach((s) => (allSelected ? next.delete(s) : next.add(s)));
    selectedSlotsRef.current = next;
    setSelectedSlots(next);
    persistSelection(next);
  }

  function handleSelectAll() {
    if (isExpiredRef.current || !userName) { setIsNameDialogOpen(true); return; }
    const allSlots = dates.flatMap((d) => eventSlots.map(({ hour, minute }) => buildSlotKey(d, hour, minute)));
    const allSelected = allSlots.every((s) => selectedSlotsRef.current.has(s));
    const next = new Set(allSelected ? [] : allSlots);
    selectedSlotsRef.current = next;
    setSelectedSlots(next);
    persistSelection(next);
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
        <div className="glass-panel px-6 py-5 text-brand-600">Loading event...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-10">
        <div className="glass-panel w-full space-y-4 p-8">
          <p className="text-lg font-semibold text-brand-700">Unable to load this event</p>
          <p className="text-sm text-brand-500">{error}</p>
          <Link className="secondary-button" to="/">Create a new event</Link>
        </div>
      </main>
    );
  }

  const isExpired = eventData?.isExpired ?? false;

  if (!userName && !isExpired) {
    const participantNames = [
      ...new Set(Object.values(eventData?.availability?.usersBySlot || {}).flat()),
    ];

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12">
        <div className="glass-panel w-full space-y-1 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">
            You&rsquo;re invited
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">{eventData.event.name}</h1>
          <p className="text-sm text-brand-400">
            {formatDateLabel(eventData.event.start_date)} &rarr;{" "}
            {formatDateLabel(eventData.event.end_date)}
          </p>
          {participantNames.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {participantNames.map((name) => (
                <span key={name} className="rounded-full bg-brand-100 px-3 py-1 text-xs text-brand-600">
                  {name} ✓
                </span>
              ))}
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-400">
                {participantNames.length} responded
              </span>
            </div>
          )}
        </div>

        <div className="glass-panel w-full p-6">
          <h2 className="mb-1 text-lg font-semibold text-brand-700">Enter your name to join</h2>
          <p className="mb-5 text-sm text-brand-400">
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

        <Link className="text-xs text-brand-300 hover:text-brand-500 transition" to="/">
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
          <div className="text-xs text-brand-400 sm:text-sm">Shared availability board</div>
          <h1 className="text-xl font-semibold text-brand-700 sm:text-3xl">
            {eventData.event.name}{userName ? <span className="text-brand-400"> — {userName}</span> : null}
          </h1>
          <p className="text-xs text-brand-500 sm:text-sm">
            {formatDateLabel(eventData.event.start_date)} to{" "}
            {formatDateLabel(eventData.event.end_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="secondary-button gap-1.5 px-3 py-1.5 text-xs" type="button" onClick={handleCopyLink}>
            {copied ? "✓ Copied!" : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                Copy link
              </>
            )}
          </button>
          <button className="secondary-button gap-1.5 px-3 py-1.5 text-xs" type="button" onClick={() => setIsNameDialogOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
            {userName}
          </button>
          <Link className="secondary-button px-3 py-1.5 text-xs" to="/">＋ New event</Link>
        </div>
      </section>

      {isExpired && (
        <div className="rounded-2xl border border-brand-300/40 bg-brand-100 px-4 py-3 text-sm text-brand-600">
          此活動已於 <span className="font-medium">{formatDateLabel(eventData.event.end_date)}</span> 結束，目前為唯讀模式，無法修改可用時間。
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="glass-panel overflow-hidden">
          {/* Controls */}
          {!isExpired && (
            <div className="border-b border-brand-200 px-4 py-3 sm:px-6">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-100 active:scale-95"
                    type="button"
                    onClick={handleSelectAll}
                  >
                    {dates.flatMap((d) => eventSlots.map(({ hour, minute }) => buildSlotKey(d, hour, minute))).every((s) => selectedSlots.has(s))
                      ? "清除全選"
                      : "全選所有時段"}
                  </button>
                </div>
                <p className="text-xs text-brand-300">點擊日期標題可全選當天</p>
              </div>
            </div>
          )}

          {/* Availability grid */}
          <div className="grid-scroll-area">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `68px repeat(${dates.length}, minmax(88px, 1fr))`,
                minWidth: `${68 + dates.length * 88}px`,
              }}
            >
              <div className="sticky left-0 top-0 z-30 border-b border-r border-brand-200 bg-brand-50/95 px-2 py-3 text-[10px] uppercase tracking-widest text-brand-300 backdrop-blur">
                Time
              </div>

              {dates.map((date) => {
                const daySlots = eventSlots.map(({ hour, minute }) => buildSlotKey(date, hour, minute));
                const allSelected = daySlots.every((s) => selectedSlots.has(s));
                return (
                  <div
                    key={date}
                    className="sticky top-0 z-20 flex flex-col items-center gap-1 border-b border-brand-200 bg-brand-50/95 px-1 py-2 text-center backdrop-blur"
                  >
                    <span className="text-xs font-medium text-brand-700">{formatDateLabel(date)}</span>
                    {!isExpired && (
                      <button
                        className="rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[10px] font-medium text-brand-400 transition hover:bg-brand-100 active:scale-95"
                        type="button"
                        onClick={() => handleSelectAllDay(date)}
                      >
                        {allSelected ? "Clear" : "All"}
                      </button>
                    )}
                  </div>
                );
              })}

              {eventSlots.flatMap(({ hour, minute }) => {
                const row = [
                  <div
                    key={`slot-${hour}-${minute}`}
                    className="sticky left-0 z-10 flex items-center border-r border-brand-200 bg-brand-50/95 px-2 text-xs font-medium text-brand-500 backdrop-blur"
                    style={{ minHeight: `${cellHeight}px` }}
                  >
                    <SlotLabel hour={hour} minute={minute} />
                  </div>,
                ];

                for (const date of dates) {
                  const slot = buildSlotKey(date, hour, minute);
                  const count = counts[slot] || 0;
                  const users = usersBySlot[slot] || [];
                  const isSelected = selectedSlots.has(slot);

                  row.push(
                    <button
                      key={slot}
                      className={`m-0.5 flex flex-col items-center justify-center rounded-xl border text-center transition sm:m-1 sm:rounded-2xl ${getCellClasses(isSelected)}`}
                      style={{ minHeight: `${cellHeight}px` }}
                      onPointerDown={isExpired ? undefined : (e) => { e.preventDefault(); startDrag(slot); }}
                      onPointerEnter={isExpired ? undefined : () => extendDrag(slot)}
                      onPointerUp={isExpired ? undefined : () => finishDrag()}
                      onPointerCancel={isExpired ? undefined : () => cancelDrag()}
                      title={users.length ? `Available: ${users.join(", ")}` : "No one yet"}
                      type="button"
                    >
                      <span className="text-base font-semibold">{count}</span>
                      {users.length > 0 && slotMinutes === 60 && (
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
              className="flex w-full items-center justify-between p-5 text-left transition hover:bg-brand-50"
              type="button"
              onClick={() => setIsBestOpen((prev) => !prev)}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-brand-700">Best time slots</h2>
                {maxCount > 0 && (
                  <span className="rounded-full bg-brand-400/20 px-2 py-0.5 text-xs font-medium text-brand-600">
                    {bestSlots.size}
                  </span>
                )}
              </div>
              <svg
                className={`h-4 w-4 text-brand-400 transition-transform duration-200 ${isBestOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isBestOpen && (
              <div className="space-y-3 px-5 pb-5">
                {maxCount > 0 ? (
                  <>
                    <p className="text-xs text-brand-400">
                      最多 {maxCount} 人同時有空，共 {bestSlots.size} 個時段
                    </p>
                    {bestByDate.slice(0, 6).map(({ date, slots, users }) => (
                      <div key={date} className="rounded-2xl border border-brand-300/40 bg-brand-50 p-3">
                        <p className="mb-2 text-xs font-semibold text-brand-700">
                          {formatDateLabel(date)}
                        </p>
                        <div className="mb-2 flex flex-wrap gap-1">
                          {slotsToRanges(slots, slotMinutes).map(({ start, end }) => {
                            const startLabel = start.minute === 0
                              ? formatHourLabel(start.hour)
                              : `${formatHourLabel(start.hour)}:30`;
                            const endTotalMin = end.hour * 60 + end.minute + slotMinutes;
                            const endHour = Math.floor(endTotalMin / 60);
                            const endMin = endTotalMin % 60;
                            const endLabel = endMin === 0
                              ? formatHourLabel(endHour)
                              : `${formatHourLabel(endHour)}:30`;
                            const isSingle = start.hour === end.hour && start.minute === end.minute;
                            return (
                              <span
                                key={`${start.hour}-${start.minute}`}
                                className="rounded-lg bg-brand-400/15 px-2 py-0.5 text-xs font-medium text-brand-700"
                              >
                                {isSingle ? startLabel : `${startLabel}–${endLabel}`}
                              </span>
                            );
                          })}
                        </div>
                        {users.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {users.map((name) => (
                              <span
                                key={name}
                                className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] text-brand-500"
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
                  <p className="text-sm text-brand-400">尚無人填寫可用時段。</p>
                )}
              </div>
            )}
          </section>

          <section className="glass-panel p-5">
            <h2 className="text-lg font-semibold text-brand-700">Status</h2>
            <div className="mt-4 space-y-3 text-sm text-brand-500">
              {isExpired ? (
                <p className="text-brand-600">此活動已結束，資料為唯讀模式。</p>
              ) : (
                <>
                  <p>Saving as <span className="font-medium text-brand-700">{userName}</span></p>
                  <p>{isSaving ? "Saving changes..." : "Changes save automatically after dragging."}</p>
                  {saveError ? <p className="text-rose-600">{saveError}</p> : null}
                </>
              )}
            </div>
          </section>
        </aside>
      </section>

      {/* Name dialog */}
      {isNameDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/20 px-4 backdrop-blur-sm">
          <form className="glass-panel w-full max-w-md p-6" onSubmit={handleNameSubmit}>
            <h2 className="text-xl font-semibold text-brand-700">Enter your name</h2>
            <p className="mt-1 text-sm text-brand-500">
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
