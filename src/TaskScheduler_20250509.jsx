import { useState, useRef, useCallback, useMemo } from "react";

const COLORS = [
  { bg: "#3b82f6" },
  { bg: "#10b981" },
  { bg: "#f59e0b" },
  { bg: "#ef4444" },
  { bg: "#8b5cf6" },
  { bg: "#ec4899" },
];

const HOUR_WIDTH = 60;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 48;
const LABEL_WIDTH = 160;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const TIMELINE_WIDTH = HOUR_WIDTH * 24;

function formatHour(h) {
  return `${String(h).padStart(2, "0")}:00`;
}
function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

const initialTasks = [
  { id: 1, name: "朝のミーティング", start: 9,    duration: 1,   colorIdx: 0 },
  { id: 2, name: "設計レビュー",     start: 10.5, duration: 1.5, colorIdx: 1 },
  { id: 3, name: "ランチ",           start: 12,   duration: 1,   colorIdx: 2 },
  { id: 4, name: "コーディング",     start: 13,   duration: 3,   colorIdx: 4 },
  { id: 5, name: "テスト",           start: 16.5, duration: 1.5, colorIdx: 3 },
];

const initialLinks = [
  { id: "l1", fromId: 1, toId: 2 },
  { id: "l2", fromId: 2, toId: 4 },
  { id: "l3", fromId: 4, toId: 5 },
];

let nextId = 6;
let nextLinkId = 4;

// ── Arrow SVG Overlay ────────────────────────────────────────────────────────

function ArrowLayer({ tasks, links, onDeleteLink, connectingFrom, mousePos }) {
  const totalHeight = tasks.length * ROW_HEIGHT;

  const taskIndexMap = useMemo(() => {
    const m = {};
    tasks.forEach((t, i) => { m[t.id] = i; });
    return m;
  }, [tasks]);

  const barRight = (task) => (task.start + task.duration) * HOUR_WIDTH;
  const barLeft  = (task) => task.start * HOUR_WIDTH;
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
  const timelineAreaRef             = useRef(null);

  const snap = (h) => Math.round(h * 4) / 4;

  const addTask = () => {
    const name = newTaskName.trim() || `タスク ${nextId}`;
    setTasks((p) => [...p, { id: nextId++, name, start: 9, duration: 1, colorIdx: Math.floor(Math.random() * COLORS.length) }]);
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
      const dH = (e.clientX - dragging.startX) / HOUR_WIDTH;
      setTasks((p) => p.map((t) => {
        if (t.id !== dragging.id) return t;
        if (dragging.type === "move")
          return { ...t, start: snap(clamp(dragging.origStart + dH, 0, 24 - t.duration)) };
        return { ...t, duration: snap(clamp(dragging.origDuration + dH, 0.25, 24 - t.start)) };
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

  const currentHour = new Date().getHours() + new Date().getMinutes() / 60;

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

        {/* Hour header */}
        <div style={{ display: "flex" }}>
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, background: "#0f1117", borderBottom: "1px solid #1e2330" }} />
          <div style={{ display: "flex", background: "#0f1117", borderBottom: "1px solid #1e2330", overflowX: "hidden" }}>
            {HOURS.map((h) => (
              <div key={h} style={{
                width: HOUR_WIDTH, flexShrink: 0, height: HEADER_HEIGHT,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, borderRight: "1px solid #1e2330",
                color: h === Math.floor(currentHour) ? "#60a5fa" : "#475569",
                fontWeight: h === Math.floor(currentHour) ? 700 : 400,
              }}>{formatHour(h)}</div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex" }}>

          {/* Labels */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, background: "#0f1117", borderRight: "1px solid #1e2330" }}>
            {tasks.map((task) => {
              const color = COLORS[task.colorIdx % COLORS.length];
              return (
                <div key={task.id} style={{
                  height: ROW_HEIGHT, display: "flex", alignItems: "center",
                  gap: 8, padding: "0 12px", borderBottom: "1px solid #1a202c",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color.bg, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {task.name}
                  </span>
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
              connectingFrom={connectingFrom} mousePos={mousePos} />

            {/* Rows */}
            {tasks.map((task) => {
              const color   = COLORS[task.colorIdx % COLORS.length];
              const isHover = hoveredId === task.id;
              const isFrom  = connectingFrom === task.id;

              return (
                <div key={task.id} style={{
                  position: "relative", width: TIMELINE_WIDTH, height: ROW_HEIGHT,
                  borderBottom: "1px solid #1a202c",
                }}>
                  {HOURS.map((h) => (
                    <div key={h} style={{
                      position: "absolute", left: h * HOUR_WIDTH, top: 0, bottom: 0,
                      width: 1, background: "#1e2330",
                    }} />
                  ))}

                  <div style={{
                    position: "absolute", left: currentHour * HOUR_WIDTH,
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
                      left: task.start * HOUR_WIDTH,
                      top: 8,
                      width: task.duration * HOUR_WIDTH,
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
                      padding: "0 10px", fontSize: 12, fontWeight: 600, color: "#fff",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                    }}>
                      {task.name}
                      <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6 }}>
                        {task.duration >= 1 ? `${task.duration}h` : `${task.duration * 60}m`}
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
        🔗 接続モード：バーを順にクリックで矢印を作成　／　矢印をクリックで削除　／　🕐 青縦線 = 現在時刻
      </p>
    </div>
  );
}
