import { useState, useRef, useCallback, useMemo, useEffect } from "react";

const COLORS = [
  { bg: "#2563eb", text: "#ffffff" },
  { bg: "#0ea5e9", text: "#020617" },
  { bg: "#16a34a", text: "#ffffff" },
  { bg: "#f59e0b", text: "#111827" },
  { bg: "#e11d48", text: "#ffffff" },
  { bg: "#7c3aed", text: "#ffffff" },
];

const DAY_WIDTH = 40;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 48;
const LABEL_WIDTH = 250;
const DAYS_IN_MONTH = 31;
const TIMELINE_WIDTH = DAY_WIDTH * DAYS_IN_MONTH;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

const initialTasks = [
  { id: 1, name: "朝のミーティング", start: 0, duration: 1, colorIdx: 0 },
  { id: 2, name: "設計レビュー",     start: 2, duration: 1, colorIdx: 1 },
  { id: 3, name: "ランチ",           start: 4, duration: 1, colorIdx: 2 },
  { id: 4, name: "コーディング",     start: 6, duration: 2, colorIdx: 4 },
  { id: 5, name: "テスト",           start: 9, duration: 1, colorIdx: 3 },
];

const initialLinks = [
  { id: "l1", fromId: 1, toId: 2 },
  { id: "l2", fromId: 2, toId: 4 },
  { id: "l3", fromId: 4, toId: 5 },
];

let nextId = 6;
let nextLinkId = 4;

// ── Arrow SVG Overlay ────────────────────────────────────────────────────────

function ArrowLayer({ tasks, links, onDeleteLink, connectingFrom, mousePos, isWorkingDay, getWorkingDayStartPosition, getWorkingDaysWidth, getTaskRealEndDay, DAYS_IN_MONTH, DAY_WIDTH }) {
  const totalHeight = tasks.length * ROW_HEIGHT;

  const taskIndexMap = useMemo(() => {
    const m = {};
    tasks.forEach((t, i) => { m[t.id] = i; });
    return m;
  }, [tasks]);

  const barLeft  = (task) => getWorkingDayStartPosition(task.start) * DAY_WIDTH;
  const barRight = (task) => barLeft(task) + getWorkingDaysWidth(task.start, task.duration);
  const midY     = (id)   => (taskIndexMap[id] ?? 0) * ROW_HEIGHT + ROW_HEIGHT / 2;

  function buildPath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const pad = Math.max(24, Math.abs(dx) * 0.3);

    if (dx > 10) {
      // target is to the right → S-curve
      return `M ${x1} ${y1} C ${x1 + pad} ${y1}, ${x2 - pad} ${y2}, ${x2} ${y2}`;
    } else {
      // target overlaps or is left → route around
      const vx = Math.max(x1, x2) + 48;
      return [
        `M ${x1} ${y1}`,
        `C ${x1 + 28} ${y1}, ${vx} ${y1}, ${vx} ${(y1 + y2) / 2}`,
        `C ${vx} ${y2}, ${x2 - 28} ${y2}, ${x2} ${y2}`,
      ].join(" ");
    }
  }

  return (
    <svg
      style={{
        position: "absolute", top: 0, left: 0,
        width: TIMELINE_WIDTH, height: Math.max(totalHeight, 1),
        pointerEvents: "none", zIndex: 20, overflow: "visible",
      }}
    >
      <defs>
        {["arrow","arrow-preview"].map((id) => (
          <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={id === "arrow-preview" ? "#fbbf24" : "#94a3b8"} />
          </marker>
        ))}
      </defs>

      {links.map((link) => {
        const from = tasks.find((t) => t.id === link.fromId);
        const to   = tasks.find((t) => t.id === link.toId);
        if (!from || !to) return null;
        const d = buildPath(barRight(from), midY(from.id), barLeft(to), midY(to.id));
        return (
          <g key={link.id} style={{ pointerEvents: "all" }}>
            {/* invisible wide hit area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={12}
              style={{ cursor: "pointer" }} onClick={() => onDeleteLink(link.id)} />
            <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5}
              strokeDasharray="5,3" markerEnd="url(#arrow)" style={{ pointerEvents: "none" }} />
          </g>
        );
      })}

      {/* Preview arrow */}
      {connectingFrom && mousePos && (() => {
        const from = tasks.find((t) => t.id === connectingFrom);
        if (!from) return null;
        const d = buildPath(barRight(from), midY(from.id), mousePos.x, mousePos.y);
        return (
          <path d={d} fill="none" stroke="#fbbf24" strokeWidth={1.5}
            strokeDasharray="6,3" markerEnd="url(#arrow-preview)" />
        );
      })()}
    </svg>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TaskScheduler() {
  const [tasks, setTasks]           = useState(initialTasks);
  const [links, setLinks]           = useState(initialLinks);
  const [newTaskName, setNewTaskName] = useState("");
  const [dragging, setDragging]     = useState(null);
  const [hoveredId, setHoveredId]   = useState(null);
  const [mode, setMode]             = useState("edit"); // "edit" | "connect"
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos]     = useState(null);
  const [projectStartDate, setProjectStartDate] = useState(new Date(2026, 3, 1)); // 2026年4月1日
  const [nonWorkingDates, setNonWorkingDates] = useState(new Set()); // 稼働しない日付の集合（"YYYY-MM-DD"形式）
  const timelineAreaRef             = useRef(null);
  const headerScrollRef             = useRef(null);

  const snap = (n) => Math.round(n);

  // プロジェクト開始日からの日数でカレンダーを表示
  const getDisplayDay = useCallback((dayOffset) => {
    const date = new Date(projectStartDate);
    date.setDate(date.getDate() + dayOffset);
    return date;
  }, [projectStartDate]);

  const formatDateString = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const isWorkingDay = useCallback((dayOffset) => {
    const date = getDisplayDay(dayOffset);
    return !nonWorkingDates.has(formatDateString(date));
  }, [getDisplayDay, nonWorkingDates]);

  // 営業日ベースでタスク終了日を計算
  const getTaskRealEndDay = useCallback((startDay, workingDuration) => {
    let currentDay = startDay;
    let workingDaysCount = 0;
    while (workingDaysCount < workingDuration) {
      if (isWorkingDay(currentDay)) {
        workingDaysCount++;
      }
      if (workingDaysCount < workingDuration) {
        currentDay++;
      }
    }
    return currentDay;
  }, [isWorkingDay]);

  // 営業日ベースでの表示位置を計算（開始位置）
  const getWorkingDayStartPosition = useCallback((startDay) => {
    let position = startDay;
    while (position < DAYS_IN_MONTH && !isWorkingDay(position)) {
      position++;
    }
    return Math.min(position, DAYS_IN_MONTH - 1);
  }, [isWorkingDay]);

  // 営業日ベースでの表示幅を計算（表示は実働日数のみ）
  const getWorkingDaysWidth = (startDay, duration) => {
    for ( let i = startDay; i < (startDay + duration); i++){
      if (!isWorkingDay(i)) {
        duration ++;
      }
    }
    return Math.max(duration * DAY_WIDTH, DAY_WIDTH);
  };

  const toggleWorkingDate = (dayOffset) => {
    const dateStr = formatDateString(getDisplayDay(dayOffset));
    setNonWorkingDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  };

  const addTask = () => {
    const name = newTaskName.trim() || `タスク ${nextId}`;
    setTasks((p) => [...p, { id: nextId++, name, start: 0, duration: 1, colorIdx: Math.floor(Math.random() * COLORS.length) }]);
    setNewTaskName("");
  };

  const deleteTask = (id) => {
    setTasks((p) => p.filter((t) => t.id !== id));
    setLinks((p) => p.filter((l) => l.fromId !== id && l.toId !== id));
  };

  const deleteLink = (lid) => setLinks((p) => p.filter((l) => l.id !== lid));

  const onMouseDown = useCallback((e, id, type) => {
    if (mode !== "edit") return;
    e.preventDefault();
    const task = tasks.find((t) => t.id === id);
    setDragging({ id, type, startX: e.clientX, origStart: task.start, origDuration: task.duration });
  }, [tasks, mode]);

  const onMouseMove = useCallback((e) => {
    if (dragging) {
      const dD = (e.clientX - dragging.startX) / DAY_WIDTH;
      setTasks((p) => p.map((t) => {
        if (t.id !== dragging.id) return t;
        if (dragging.type === "move")
          return { ...t, start: snap(clamp(dragging.origStart + dD, 0, DAYS_IN_MONTH - t.duration)) };
        return { ...t, duration: snap(clamp(dragging.origDuration + dD, 1, DAYS_IN_MONTH - t.start)) };
      }));
    }
    if (connectingFrom && timelineAreaRef.current) {
      const r = timelineAreaRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
  }, [dragging, connectingFrom]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  const cancelConnect = useCallback(() => { setConnectingFrom(null); setMousePos(null); }, []);

  const onBarClick = useCallback((e, id) => {
    if (mode !== "connect") return;
    e.stopPropagation();
    if (!connectingFrom) {
      setConnectingFrom(id);
    } else {
      if (connectingFrom !== id && !links.some((l) => l.fromId === connectingFrom && l.toId === id)) {
        setLinks((p) => [...p, { id: `l${nextLinkId++}`, fromId: connectingFrom, toId: id }]);
      }
      cancelConnect();
    }
  }, [mode, connectingFrom, links, cancelConnect]);

  // 特定のタスクの所要時間を更新するための関数
  const updateTaskDuration = useCallback((id, newDuration) => {
    setTasks(prev => prev.map((task) => {
      if (task.id === id) {
        return { ...task, duration: newDuration };
      }
      return task;
    }));
  }, []);

  // タスク開始時間を稼働日とリンクに合わせて同期する
  const syncTaskTimes = useCallback((currentTasks) => {
    console.log('syncTaskTimes');
    let updated = currentTasks;

    for (let pass = 0; pass < updated.length; pass++) {    
      let changed = false;
      const snapshot = updated;

      const next = snapshot.map((task) => {
        const ownStart = getWorkingDayStartPosition(task.start);
        let targetStart = ownStart;

        const inboundLinks = links.filter((link) => link.toId === task.id);
        for (const link of inboundLinks) {
          const fromTask = snapshot.find((t) => t.id === link.fromId);
          if (!fromTask) continue;

          const predecessorStart = getWorkingDayStartPosition(fromTask.start);
          const predecessorEnd = getTaskRealEndDay(predecessorStart, fromTask.duration);
          targetStart = Math.max(targetStart, getWorkingDayStartPosition(predecessorEnd + 1));
        }

        if (targetStart !== task.start) {
          changed = true;
          return { ...task, start: targetStart };
        }
        return task;
      });

      if (!changed) {
        return updated;
      }

      updated = next;
    }

    return updated;
  }, [getWorkingDayStartPosition, getTaskRealEndDay, links]);

  useEffect(() => {
    setTasks((prev) => syncTaskTimes(prev));
  }, [syncTaskTimes]);

  useEffect(() => {
    const handleScroll = () => {
      if (headerScrollRef.current && timelineAreaRef.current) {
        headerScrollRef.current.style.transform = `translateX(-${timelineAreaRef.current.scrollLeft}px)`;
      }
    };
    const scrollArea = timelineAreaRef.current;
    if (scrollArea) {
      scrollArea.addEventListener("scroll", handleScroll);
      return () => scrollArea.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div
      style={{
        fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif",
        background: "#0f1117", minHeight: "100vh", color: "#e2e8f0",
        padding: "32px 24px", userSelect: "none",
      }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px" }}>
        📅 タスクスケジューラ
      </h1>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        {/* Mode buttons */}
        <div style={{ display: "flex", background: "#1a1f2e", borderRadius: 8, padding: 3, gap: 3 }}>
          {[["edit","✏️ 編集"],["connect","🔗 接続"]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); cancelConnect(); }}
              style={{
                background: mode === m ? "#3b82f6" : "transparent", border: "none",
                borderRadius: 6, padding: "6px 14px",
                color: mode === m ? "#fff" : "#64748b",
                fontSize: 13, fontWeight: mode === m ? 600 : 400, cursor: "pointer",
              }}>{label}</button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 24, background: "#2d3748" }} />

        {/* Project start date picker */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1" }}>
          📅 プロジェクト開始日:
          <input 
            type="date" 
            value={formatDateString(projectStartDate)}
            onChange={(e) => setProjectStartDate(new Date(e.target.value))}
            style={{
              background: "#1e2330", border: "1px solid #2d3748", borderRadius: 6,
              padding: "4px 8px", color: "#e2e8f0", fontSize: 13, outline: "none", cursor: "pointer",
            }}
          />
        </label>

        {/* Separator */}
        <div style={{ width: 1, height: 24, background: "#2d3748" }} />

        <input value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="新しいタスク名…"
          style={{
            background: "#1e2330", border: "1px solid #2d3748", borderRadius: 8,
            padding: "7px 14px", color: "#e2e8f0", fontSize: 13, outline: "none", width: 190,
          }} />
        <button onClick={addTask} style={{
          background: "#3b82f6", border: "none", borderRadius: 8,
          padding: "7px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>＋ 追加</button>

        {mode === "connect" && (
          <span style={{ fontSize: 12, color: "#fbbf24" }}>
            {connectingFrom ? "▶ 接続先のバーをクリック（背景クリックでキャンセル）" : "▶ 接続元のバーをクリック"}
          </span>
        )}
      </div>

      {/* Background cancel overlay */}
      {connectingFrom && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1 }} onClick={cancelConnect} />
      )}

      {/* Timeline */}
      <div style={{ background: "#151922", borderRadius: 14, border: "1px solid #1e2330", overflow: "hidden" }}>

        {/* Day header */}
        <div style={{ display: "flex", borderBottom: "1px solid #1e293b" }}>
          <div style={{ width: LABEL_WIDTH, height: 48, flexShrink: 0, background: "#0f1117", borderBottom: "1px solid #1e293b" }} />
          <div ref={headerScrollRef} style={{ position: "relative", width: TIMELINE_WIDTH, background: "#0f1117", borderBottom: "1px solid #1e293b", overflow: "hidden", transform: "translateX(0)" }}>
            {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i).map((dayOffset) => {
              const displayDate = getDisplayDay(dayOffset);
              const isToday = new Date().toDateString() === displayDate.toDateString();
              const working = isWorkingDay(dayOffset);
              return (
                <div 
                  key={dayOffset}
                  onClick={() => toggleWorkingDate(dayOffset)}
                  style={{
                    position: "absolute", left: dayOffset * DAY_WIDTH, width: DAY_WIDTH, flexShrink: 0, height: HEADER_HEIGHT,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 600, borderRight: "1px solid #1e293b",
                    color: isToday ? "#60a5fa" : working ? "#cbd5e1" : "#94a3b8",
                    background: isToday ? "#1a2f4a" : working ? "transparent" : "#0f172a",
                    opacity: working ? 1 : 0.75,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isToday) {
                      e.currentTarget.style.background = working ? "#1e2330" : "#1a1f2e";
                      e.currentTarget.style.opacity = "0.8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isToday ? "#1a2f4a" : working ? "transparent" : "#0a0d12";
                    e.currentTarget.style.opacity = working ? "1" : "0.6";
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.7 }}>{["月","火","水","木","金","土","日"][displayDate.getDay()]}</div>
                  <div>{displayDate.getDate()}</div>
                  {!working && <div style={{ fontSize: 8, marginTop: 2, opacity: 0.8 }}>✕</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex" }}>

          {/* Labels */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, background: "#0f1117" }}>
            {tasks.map((task, rowIndex) => {
              const color = COLORS[task.colorIdx % COLORS.length];

              return (
                <div key={task.id} style={{
                  height: ROW_HEIGHT, display: "flex", alignItems: "center",
                  gap: 8, padding: "0 12px", borderBottom: "1px solid #1e293b",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color.bg, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
                    {task.name}
                  </span>
                  {/* Duration Time */}
                  <input key={task.id} value={task.duration}
                    onChange={(e) => updateTaskDuration(task.id, e.target.value)}
                    onKeyDown={(e) => {if (e.key === "Enter") {
                      const finalValue = parseFloat(e.target.value) || 0;
                      setTasks(prev => {
                        const updated = prev.map(t => t.id === task.id ? { ...t, duration: finalValue } : t);
                        return syncTaskTimes(updated);
                      });
                      e.currentTarget.blur();
                    }}}
                    placeholder={task.duration}
                    style={{ width: 30, fontSize: 13, color: "#e2e8f0", backgroundColor: "#111827", border: "1px solid #1e293b", borderRadius: 4, padding: "4px" }} />
                  <button onClick={() => deleteTask(task.id)}
                    style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* Timeline area */}
          <div ref={timelineAreaRef} style={{ position: "relative", width: TIMELINE_WIDTH, flexShrink: 0, overflowX: "auto", zIndex: 2 }}>

            {/* SVG arrows */}
            <ArrowLayer tasks={tasks} links={links} onDeleteLink={deleteLink}
              connectingFrom={connectingFrom} mousePos={mousePos}
              isWorkingDay={isWorkingDay} getWorkingDayStartPosition={getWorkingDayStartPosition}
              getWorkingDaysWidth={getWorkingDaysWidth} getTaskRealEndDay={getTaskRealEndDay}
              DAYS_IN_MONTH={DAYS_IN_MONTH} DAY_WIDTH={DAY_WIDTH} />

            {/* Rows */}
            {tasks.map((task, rowIndex) => {
              const color   = COLORS[task.colorIdx % COLORS.length];
              const isHover = hoveredId === task.id;
              const isFrom  = connectingFrom === task.id;
              console.log(task);

              // プロジェクト開始日から今日までの日数を計算
              const todayOffset = Math.floor((new Date() - projectStartDate) / (1000 * 60 * 60 * 24));

              return ( 
                <div key={task.id} style={{
                  position: "relative", width: TIMELINE_WIDTH, height: ROW_HEIGHT,
                  borderBottom: "1px solid #1e293b",
                  background: rowIndex % 2 === 0 ? "#0f1117" : "#101525",
                }}>
                  {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i).map((dayOffset) => (
                    <div key={dayOffset} style={{
                      position: "absolute", left: dayOffset * DAY_WIDTH, top: 0, bottom: 0,
                      borderRight: "1px solid #1e293b",
                      background: isWorkingDay(dayOffset) ? "#141a2b" : "#0b111f",
                      opacity: isWorkingDay(dayOffset) ? 1 : 0.85,
                    }} />
                  ))}
                  <div style={{
                    position: "absolute", left: todayOffset * DAY_WIDTH,
                    top: 0, bottom: 0, width: 2, background: "#60a5fa", opacity: 0.5, zIndex: 2,
                  }} />
                  {/* Task bar */}
                  <div
                    onMouseDown={(e) => onMouseDown(e, task.id, "move")}
                    onMouseEnter={() => setHoveredId(task.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => onBarClick(e, task.id)}
                    style={{
                      position: "absolute",
                      left: getWorkingDayStartPosition(task.start) * DAY_WIDTH,
                      top: 8,
                      width: getWorkingDaysWidth(task.start, task.duration),
                      height: ROW_HEIGHT - 16,
                      background: color.bg,
                      borderRadius: 6,
                      cursor: mode === "connect" ? "crosshair"
                        : dragging?.id === task.id ? "grabbing" : "grab",
                      boxShadow: isFrom
                        ? `0 0 0 2px #fbbf24, 0 0 16px #fbbf2455`
                        : isHover ? `0 0 0 2px ${color.bg}99, 0 4px 12px ${color.bg}44` : "none",
                      transition: dragging ? "none" : "box-shadow 0.15s",
                      display: "flex", alignItems: "center", overflow: "hidden",
                      zIndex: 5,
                    }}
                  >
                    <span style={{
                      padding: "0 10px", fontSize: 12, fontWeight: 600, color: color.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                    }}>
                      {task.name}
                      <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6 }}>
                        {task.duration >= 1 ? `${task.duration}日` : `${task.duration * 24}時間`}
                      </span>
                    </span>
                    {mode === "edit" && (
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, task.id, "resize"); }}
                        style={{
                          width: 10, height: "100%", cursor: "ew-resize",
                          background: "rgba(0,0,0,0.25)", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>⋮</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {tasks.length === 0 && (
              <div style={{ display: "flex", height: 120, alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 14 }}>
                タスクを追加してください
              </div>
            )}
          </div>
        </div>
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: "#334155", textAlign: "center" }}>
        🔗 接続モード：タスクを順にクリックで矢印を作成　／　矢印をクリックで削除　／　📅 日付をクリックで稼働日を設定　／　青縦線 = 本日
      </p>
    </div>
  );
}
