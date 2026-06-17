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
const HEADER_HEIGHT = 96;
const DEFAULT_LABEL_WIDTH = 350;
const MIN_DAYS = 31;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

const initialTasks = [
  { id: 1, name: "設計1", start: 0, duration: 1, colorIdx: 0, progress: 0 },
  { id: 2, name: "設計レビュー1", start: 0, duration: 1, colorIdx: 1, progress: 0 },
  { id: 3, name: "コーディング1", start: 0, duration: 1, colorIdx: 2, progress: 0 },
  { id: 4, name: "コードレビュー1", start: 0, duration: 1, colorIdx: 3, progress: 0 },
  { id: 5, name: "テスト1", start: 0, duration: 1, colorIdx: 4, progress: 0 },
  { id: 6, name: "リリース1", start: 0, duration: 1, colorIdx: 5, progress: 0 },
  { id: 7, name: "設計2", start: 0, duration: 1, colorIdx: 0, progress: 0 },
  { id: 8, name: "設計レビュー2", start: 0, duration: 1, colorIdx: 1, progress: 0 },
  { id: 9, name: "コーディング2", start: 0, duration: 1, colorIdx: 2, progress: 0 },
  { id: 10, name: "コードレビュー2", start: 0, duration: 1, colorIdx: 3, progress: 0 },
  { id: 11, name: "テスト2", start: 0, duration: 1, colorIdx: 4, progress: 0 },
  { id: 12, name: "リリース2", start: 0, duration: 1, colorIdx: 5, progress: 0 },
];

const initialLinks = [
  // { id: "l1", fromId: 1, toId: 2 },
  // { id: "l2", fromId: 2, toId: 3 },
  // { id: "l3", fromId: 3, toId: 4 },
  // { id: "l4", fromId: 4, toId: 5 },
];

let nextId = initialTasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
let nextLinkId = initialLinks.reduce((max, l) => Math.max(max, parseInt(l.id.replace("l", ""))), 0) + 1;

// ── Arrow SVG Overlay ────────────────────────────────────────────────────────

function ArrowLayer({ tasks, links, onDeleteLink, connectingFrom, mousePos, isWorkingDay, getWorkingDayStartPosition, getWorkingDaysWidth, getTaskRealEndDay, timelineWidth, DAY_WIDTH }) {
  const totalHeight = tasks.length * ROW_HEIGHT;

  const taskIndexMap = useMemo(() => {
    const m = {};
    tasks.forEach((t, i) => { m[t.id] = i; });
    return m;
  }, [tasks]);

  const barLeft = (task) => getWorkingDayStartPosition(task.start) * DAY_WIDTH;
  const barRight = (task) => barLeft(task) + getWorkingDaysWidth(task.start, task.duration);
  const midY = (id) => (taskIndexMap[id] ?? 0) * ROW_HEIGHT + ROW_HEIGHT / 2;

  function buildPath(x1, y1, x2, y2, clearance = 0) {
    const dx = x2 - x1;
    const pad = Math.max(24, Math.abs(dx) * 0.3);

    if (dx > 10) {
      // target is to the right → S-curve
      return `M ${x1} ${y1} C ${x1 + pad} ${y1}, ${x2 - pad} ${y2}, ${x2} ${y2}`;
    } else {
      // target overlaps or is left → route around（間にある行のバーを避ける）
      const vx = Math.max(x1, x2, clearance) + 48;
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
        width: timelineWidth, height: Math.max(totalHeight, 1),
        pointerEvents: "none", zIndex: 20, overflow: "visible",
      }}
    >
      <defs>
        {["arrow", "arrow-preview"].map((id) => (
          <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={id === "arrow-preview" ? "#fbbf24" : "#94a3b8"} />
          </marker>
        ))}
      </defs>

      {links.map((link) => {
        const from = tasks.find((t) => t.id === link.fromId);
        const to = tasks.find((t) => t.id === link.toId);
        if (!from || !to) return null;

        // from/to の行の間に他のタスク行がある場合、そのバーを避けてループするようにする
        const fromIdx = taskIndexMap[from.id] ?? 0;
        const toIdx = taskIndexMap[to.id] ?? 0;
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        let clearance = 0;
        tasks.forEach((t, i) => {
          if (i > lo && i < hi) clearance = Math.max(clearance, barRight(t));
        });

        const d = buildPath(barRight(from), midY(from.id), barLeft(to), midY(to.id), clearance);
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

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = "task-scheduler-v1";

function loadStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      tasks: data.tasks,
      links: data.links,
      projectStartDate: new Date(data.projectStartDate),
      projectEndDate: new Date(data.projectEndDate),
      nonWorkingDates: new Set(data.nonWorkingDates ?? []),
    };
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TaskScheduler() {
  const saved = useMemo(() => {
    const data = loadStorage();
    if (data) {
      // ロードしたデータの最大IDに合わせてカウンターを更新（ID重複を防ぐ）
      const maxTaskId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      if (maxTaskId >= nextId) nextId = maxTaskId + 1;
      const maxLinkId = data.links.reduce((max, l) => {
        const n = parseInt(l.id.replace("l", "")) || 0;
        return Math.max(max, n);
      }, 0);
      if (maxLinkId >= nextLinkId) nextLinkId = maxLinkId + 1;
    }
    return data;
  }, []);

  const [tasks, setTasks] = useState(saved?.tasks ?? initialTasks);
  const [links, setLinks] = useState(saved?.links ?? initialLinks);
  const [newTaskName, setNewTaskName] = useState("");
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [colorPickerId, setColorPickerId] = useState(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });
  const [rowDragging, setRowDragging] = useState(null); // { id, overIndex }
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const resizingRef = useRef(null);
  const lastLinkChangeRef = useRef(null); // { toId } — リンク追加・削除時のターゲット
  const [dragging, setDragging] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [mode, setMode] = useState("edit"); // "edit" | "connect"
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [projectStartDate, setProjectStartDate] = useState(saved?.projectStartDate ?? new Date(2026, 4, 1));
  const [projectEndDate, setProjectEndDate] = useState(saved?.projectEndDate ?? new Date(2026, 5, 30));
  const [nonWorkingDates, setNonWorkingDates] = useState(saved?.nonWorkingDates ?? new Set());
  const timelineAreaRef = useRef(null);
  const labelRowsRef = useRef(null);
  const [hScrollbarHeight, setHScrollbarHeight] = useState(0);
  const importInputRef = useRef(null);
  const isImportingRef = useRef(false);
  const deletingTaskRef = useRef(false);

  const handleExport = () => {
    const data = {
      tasks,
      links,
      projectStartDate: projectStartDate.toISOString(),
      projectEndDate: projectEndDate.toISOString(),
      nonWorkingDates: [...nonWorkingDates],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-scheduler-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        isImportingRef.current = true;
        if (data.tasks) setTasks(data.tasks);
        if (data.links) setLinks(data.links);
        if (data.projectStartDate) setProjectStartDate(new Date(data.projectStartDate));
        if (data.projectEndDate) setProjectEndDate(new Date(data.projectEndDate));
        if (data.nonWorkingDates) setNonWorkingDates(new Set(data.nonWorkingDates));
      } catch {
        alert("ファイルの読み込みに失敗しました。");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const daysInTimeline = useMemo(() => {
    const maxEnd = tasks.reduce((max, t) => Math.max(max, t.start + t.duration), 0);
    return Math.max(MIN_DAYS, maxEnd + 7);
  }, [tasks]);
  const timelineWidth = DAY_WIDTH * daysInTimeline;

  const snap = (n) => Math.round(n);

  // プロジェクト開始日からの日数でカレンダーを表示
  const getDisplayDay = useCallback((dayOffset) => {
    const date = new Date(projectStartDate);
    date.setDate(date.getDate() + dayOffset);
    return date;
  }, [projectStartDate]);

  const months = useMemo(() => {
    const m = [];
    let currentMonth = null;
    let start = 0;
    for (let i = 0; i < daysInTimeline; i++) {
      const date = getDisplayDay(i);
      const month = date.getMonth() + 1;
      if (currentMonth !== month) {
        if (currentMonth !== null) {
          m.push({ month: currentMonth, start, end: i - 1 });
        }
        currentMonth = month;
        start = i;
      }
    }
    if (currentMonth !== null) {
      m.push({ month: currentMonth, start, end: daysInTimeline - 1 });
    }
    return m;
  }, [daysInTimeline, getDisplayDay]);

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

  // 営業日ベースでの表示位置を再計算（開始位置）
  const getWorkingDayStartPosition = useCallback((preEndDay, startDay) => {
    // 最大365日先まで探して無限ループを防ぐ
    let position = preEndDay;
    while (position < preEndDay + 365 && !isWorkingDay(position)) {
      position++;
    }
    return position;
  }, [isWorkingDay]);

  // 営業日ベースでの表示幅を計算（表示位置と同じ稼働日スナップ後の位置から計算）
  const getWorkingDaysWidth = (startDay, duration) => {
    const effectiveStart = getWorkingDayStartPosition(startDay);
    let workingCount = 0;
    let i = effectiveStart;
    while (workingCount < duration) {
      if (isWorkingDay(i)) workingCount++;
      i++;
      if (i > effectiveStart + 365) break;
    }
    return Math.max((i - effectiveStart) * DAY_WIDTH, DAY_WIDTH);
  };

  const lastToggledDayRef = useRef(null);

  const toggleWorkingDate = (dayOffset) => {
    lastToggledDayRef.current = dayOffset;
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
    setTasks((p) => [...p, { id: nextId++, name, start: 0, duration: 1, colorIdx: Math.floor(Math.random() * COLORS.length), progress: 0 }]);
    setNewTaskName("");
  };

  const deleteTask = (id) => {
    deletingTaskRef.current = true;
    setTasks((p) => p.filter((t) => t.id !== id));
    setLinks((p) => p.filter((l) => l.fromId !== id && l.toId !== id));
  };

  const deleteLink = (lid) => {
    const link = links.find((l) => l.id === lid);
    if (link) lastLinkChangeRef.current = { toId: link.toId };
    setLinks((p) => p.filter((l) => l.id !== lid));
  };

  // タスク開始時間を稼働日とリンクに合わせて同期する
  const syncTaskTimes = useCallback((currentTasks) => {
    let updated = currentTasks;

    for (let pass = 0; pass < updated.length; pass++) {
      let changed = false;
      const snapshot = updated;

      const next = snapshot.map((task) => {
        const inboundLinks = links.filter((link) => link.toId === task.id);

        let targetStart;
        if (inboundLinks.length === 0) {
          // 前任なし：現在位置を稼働日にスナップ（手動ドラッグ位置を維持）
          targetStart = getWorkingDayStartPosition(task.start);
        } else {
          // 前任あり：前任タスクの終了後を純粋に計算（前後どちらにも移動可能）
          targetStart = 0;
          for (const link of inboundLinks) {
            const fromTask = snapshot.find((t) => t.id === link.fromId);
            if (!fromTask) continue;
            const predecessorStart = getWorkingDayStartPosition(fromTask.start);
            const predecessorEnd = getTaskRealEndDay(predecessorStart, fromTask.duration);
            targetStart = Math.max(targetStart, getWorkingDayStartPosition(predecessorEnd + 1));
          }
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
    if (isImportingRef.current) return; // インポート中はスキップ（projectStartDate effectで処理）
    if (deletingTaskRef.current) { deletingTaskRef.current = false; return; } // タスク削除時はスキップ
    const fromDay = lastToggledDayRef.current;
    lastToggledDayRef.current = null;

    if (fromDay !== null) {
      // 稼働日トグル：期間が fromDay 以降にかかる全タスクとその子孫のみ更新
      setTasks((prev) => {
        // Step1: 終了日が fromDay 以降のタスク（ルート・非ルート問わず）と子孫を収集
        const affected = new Set();
        prev.forEach((t) => {
          const effStart = getWorkingDayStartPosition(t.start);
          const effEnd = getTaskRealEndDay(effStart, t.duration);
          if (effEnd >= fromDay) affected.add(t.id);
        });
        const queue = [...affected];
        while (queue.length > 0) {
          const id = queue.shift();
          links.filter((l) => l.fromId === id).forEach((l) => {
            if (!affected.has(l.toId)) { affected.add(l.toId); queue.push(l.toId); }
          });
        }

        // Step2: affected のタスクのみ再計算（ルート→スナップ、非ルート→前任から計算）
        let updated = prev;
        for (let pass = 0; pass < updated.length; pass++) {
          let changed = false;
          const snapshot = updated;
          const next = snapshot.map((task) => {
            if (!affected.has(task.id)) return task;
            const inboundLinks = links.filter((l) => l.toId === task.id);
            let targetStart;
            if (inboundLinks.length === 0) {
              targetStart = getWorkingDayStartPosition(task.start);
            } else {
              targetStart = 0;
              inboundLinks.forEach((link) => {
                const fromTask = snapshot.find((t) => t.id === link.fromId);
                if (!fromTask) return;
                const pStart = getWorkingDayStartPosition(fromTask.start);
                const pEnd = getTaskRealEndDay(pStart, fromTask.duration);
                targetStart = Math.max(targetStart, getWorkingDayStartPosition(pEnd + 1));
              });
            }
            if (targetStart !== task.start) { changed = true; return { ...task, start: targetStart }; }
            return task;
          });
          if (!changed) return updated;
          updated = next;
        }
        return updated;
      });
    } else if (lastLinkChangeRef.current !== null) {
      // リンク追加・削除：toId タスクとその子孫のみ再計算
      const { toId } = lastLinkChangeRef.current;
      lastLinkChangeRef.current = null;
      setTasks((prev) => {
        const affected = new Set([toId]);
        const queue = [toId];
        while (queue.length > 0) {
          const id = queue.shift();
          links.filter((l) => l.fromId === id).forEach((l) => {
            if (!affected.has(l.toId)) { affected.add(l.toId); queue.push(l.toId); }
          });
        }
        let updated = prev;
        for (let pass = 0; pass < updated.length; pass++) {
          let changed = false;
          const snapshot = updated;
          const next = snapshot.map((task) => {
            if (!affected.has(task.id)) return task;
            const inboundLinks = links.filter((l) => l.toId === task.id);
            if (inboundLinks.length === 0) return task;
            let targetStart = 0;
            inboundLinks.forEach((link) => {
              const fromTask = snapshot.find((t) => t.id === link.fromId);
              if (!fromTask) return;
              const pStart = getWorkingDayStartPosition(fromTask.start);
              const pEnd = getTaskRealEndDay(pStart, fromTask.duration);
              targetStart = Math.max(targetStart, getWorkingDayStartPosition(pEnd + 1));
            });
            if (targetStart !== task.start) { changed = true; return { ...task, start: targetStart }; }
            return task;
          });
          if (!changed) return updated;
          updated = next;
        }
        return updated;
      });
    } else {
      // プロジェクト開始日変更など：全タスク再計算
      setTasks((prev) => syncTaskTimes(prev));
    }
  }, [syncTaskTimes, links, getWorkingDayStartPosition, getTaskRealEndDay]);

  // localStorage 自動保存
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        tasks,
        links,
        projectStartDate: projectStartDate.toISOString(),
        projectEndDate: projectEndDate.toISOString(),
        nonWorkingDates: [...nonWorkingDates],
      }));
    } catch { /* quota超過等を無視 */ }
  }, [tasks, links, projectStartDate, projectEndDate, nonWorkingDates]);

  const onMouseDown = useCallback((e, id, type) => {
    if (mode !== "edit") return;
    e.preventDefault();
    const task = tasks.find((t) => t.id === id);
    setDragging({ id, type, startX: e.clientX, origStart: task.start, origDuration: task.duration });
  }, [tasks, mode]);

  const onMouseMove = useCallback((e) => {
    if (resizingRef.current) {
      const dx = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(120, Math.min(500, resizingRef.current.startWidth + dx));
      setLabelWidth(newWidth);
      return;
    }
    if (dragging) {
      const dD = (e.clientX - dragging.startX) / DAY_WIDTH;
      setTasks((p) => p.map((t) => {
        if (t.id !== dragging.id) return t;
        if (dragging.type === "move")
          return { ...t, start: snap(clamp(dragging.origStart + dD, 0, 365 - t.duration)) };
        return { ...t, duration: snap(clamp(dragging.origDuration + dD, 1, 365 - t.start)) };
      }));
    }
    if (connectingFrom && timelineAreaRef.current) {
      const r = timelineAreaRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - r.left + timelineAreaRef.current.scrollLeft,
        y: e.clientY - r.top - HEADER_HEIGHT,
      });
    }
  }, [dragging, connectingFrom]);

  // anchorId のタスクを固定し、その子孫タスクのみをカスケードする
  const cascadeFromTask = useCallback((currentTasks, anchorId) => {
    // anchorId から辿れる子孫タスクIDを収集
    const descendants = new Set();
    const queue = [anchorId];
    while (queue.length > 0) {
      const id = queue.shift();
      links.filter((l) => l.fromId === id).forEach((l) => {
        if (!descendants.has(l.toId)) {
          descendants.add(l.toId);
          queue.push(l.toId);
        }
      });
    }

    let updated = currentTasks;
    for (let pass = 0; pass < updated.length; pass++) {
      let changed = false;
      const snapshot = updated;
      const next = snapshot.map((task) => {
        if (!descendants.has(task.id)) return task; // 子孫以外は触らない
        let targetStart = 0;
        links.filter((l) => l.toId === task.id).forEach((link) => {
          const fromTask = snapshot.find((t) => t.id === link.fromId);
          if (!fromTask) return;
          const predecessorStart = getWorkingDayStartPosition(fromTask.start);
          const predecessorEnd = getTaskRealEndDay(predecessorStart, fromTask.duration);
          targetStart = Math.max(targetStart, getWorkingDayStartPosition(predecessorEnd + 1));
        });
        if (targetStart !== task.start) {
          changed = true;
          return { ...task, start: targetStart };
        }
        return task;
      });
      if (!changed) return updated;
      updated = next;
    }
    return updated;
  }, [links, getWorkingDayStartPosition, getTaskRealEndDay]);

  const commitRowDrag = useCallback(() => {
    if (!rowDragging) return;
    const { id, overIndex } = rowDragging;
    setTasks((prev) => {
      const fromIndex = prev.findIndex((t) => t.id === id);
      if (fromIndex === -1 || fromIndex === overIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
    setRowDragging(null);
  }, [rowDragging]);

  const onMouseUp = useCallback(() => {
    if (resizingRef.current) { resizingRef.current = null; return; }
    if (rowDragging) { commitRowDrag(); return; }
    if (dragging) {
      setTasks((prev) => cascadeFromTask(prev, dragging.id));
    }
    setDragging(null);
  }, [dragging, cascadeFromTask, rowDragging, commitRowDrag]);

  const cancelConnect = useCallback(() => { setConnectingFrom(null); setMousePos(null); }, []);

  // 右側（タイムライン）の縦スクロールに左側（ラベル列）の行を追従させる
  const handleTimelineScroll = useCallback((e) => {
    if (labelRowsRef.current) labelRowsRef.current.scrollTop = e.currentTarget.scrollTop;
  }, []);

  // 横スクロールバーの高さを計測し、左ラベル列の高さ調整に使う
  useEffect(() => {
    const el = timelineAreaRef.current;
    if (!el) return;
    const measure = () => setHScrollbarHeight(el.offsetHeight - el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onBarClick = useCallback((e, id) => {
    if (mode !== "connect") return;
    e.stopPropagation();
    if (!connectingFrom) {
      setConnectingFrom(id);
    } else {
      if (connectingFrom !== id && !links.some((l) => l.fromId === connectingFrom && l.toId === id)) {
        lastLinkChangeRef.current = { toId: id };
        setLinks((p) => [...p, { id: `l${nextLinkId++}`, fromId: connectingFrom, toId: id }]);
      }
      cancelConnect();
    }
  }, [mode, connectingFrom, links, cancelConnect]);


  const todayOffset = Math.floor((new Date() - projectStartDate) / (1000 * 60 * 60 * 24));
  const endDateOffset = Math.floor((projectEndDate - projectStartDate) / (1000 * 60 * 60 * 24));

  // 常に最新の syncTaskTimes と links を ref で保持（stale closure 回避）
  const syncTaskTimesRef = useRef(syncTaskTimes);
  const linksRef = useRef(links);
  useEffect(() => { syncTaskTimesRef.current = syncTaskTimes; });
  useEffect(() => { linksRef.current = links; });

  // プロジェクト開始日変更時のみ：ルートタスクをday0にリセットしてカスケード
  // インポート中・links変更・nonWorkingDates変更時は発火しない
  useEffect(() => {
    if (isImportingRef.current) {
      isImportingRef.current = false;
      return;
    }
    setTasks((prev) => {
      const reset = prev.map((task) => {
        const isRoot = !linksRef.current.some((l) => l.toId === task.id);
        return isRoot ? { ...task, start: 0 } : task;
      });
      return syncTaskTimesRef.current(reset);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStartDate]);

  return (
    <div
      style={{
        fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif",
        background: "#0f1117", height: "100vh", boxSizing: "border-box", color: "#e2e8f0",
        padding: "32px 24px", userSelect: "none",
        display: "flex", flexDirection: "column",
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
          {[["edit", "✏️ 編集"], ["connect", "🔗 接続"]].map(([m, label]) => (
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
            onChange={(e) => {
              const [y, m, d] = e.target.value.split("-").map(Number);
              setProjectStartDate(new Date(y, m - 1, d));
            }}
            style={{
              background: "#1e2330", border: "1px solid #2d3748", borderRadius: 6,
              padding: "4px 8px", color: "#e2e8f0", fontSize: 13, outline: "none", cursor: "pointer",
            }}
          />
        </label>

        {/* Project end date picker */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1" }}>
          📅 プロジェクト終了日:
          <input
            type="date"
            value={formatDateString(projectEndDate)}
            onChange={(e) => setProjectEndDate(new Date(e.target.value))}
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

        {/* Separator */}
        <div style={{ width: 1, height: 24, background: "#2d3748" }} />

        <button onClick={handleExport} style={{
          background: "#1e2330", border: "1px solid #2d3748", borderRadius: 8,
          padding: "7px 14px", color: "#cbd5e1", fontSize: 13, cursor: "pointer",
        }}>📥 エクスポート</button>

        <button onClick={() => importInputRef.current?.click()} style={{
          background: "#1e2330", border: "1px solid #2d3748", borderRadius: 8,
          padding: "7px 14px", color: "#cbd5e1", fontSize: 13, cursor: "pointer",
        }}>📤 インポート</button>
        <input ref={importInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />

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
      {colorPickerId !== null && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setColorPickerId(null)} />
          <div style={{
            position: "fixed", top: colorPickerPos.top, left: colorPickerPos.left,
            zIndex: 1000, background: "#1e2330", border: "1px solid #2d3748",
            borderRadius: 8, padding: 6, display: "flex", gap: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}>
            {COLORS.map((c, idx) => {
              const target = tasks.find((t) => t.id === colorPickerId);
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setTasks((p) => p.map((t) => t.id === colorPickerId ? { ...t, colorIdx: idx } : t));
                    setColorPickerId(null);
                  }}
                  style={{
                    width: 20, height: 20, borderRadius: "50%", background: c.bg,
                    border: target && idx === target.colorIdx ? "2px solid #fff" : "2px solid transparent",
                    cursor: "pointer", padding: 0,
                  }}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Timeline */}
      <div style={{ background: "#151922", borderRadius: 14, border: "1px solid #1e2330", overflow: "hidden", display: "flex", flex: "1 1 auto", minHeight: 0 }}>

        {/* Fixed left column: header spacer + task labels */}
        <div style={{ width: labelWidth, flexShrink: 0, background: "#0f1117", zIndex: 10, position: "relative", display: "flex", flexDirection: "column" }}>
          {/* Resize handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              resizingRef.current = { startX: e.clientX, startWidth: labelWidth };
            }}
            style={{
              position: "absolute", top: 0, right: 0, width: 4, height: "100%",
              cursor: "col-resize", zIndex: 20,
              background: "transparent",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#3b82f6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          />
          <div style={{ height: HEADER_HEIGHT, borderBottom: "1px solid #1e293b", flexShrink: 0 }} />
          <div ref={labelRowsRef} style={{ flex: 1, minHeight: 0, overflowY: "hidden" }}>
          {tasks.map((task, rowIndex) => {
            const color = COLORS[task.colorIdx % COLORS.length];
            const isDragOver = rowDragging && rowDragging.overIndex === rowIndex && rowDragging.id !== task.id;
            const isDraggingThis = rowDragging?.id === task.id;
            return (
              <div
                key={task.id}
                onMouseEnter={() => { if (rowDragging) setRowDragging((p) => ({ ...p, overIndex: rowIndex })); }}
                style={{
                  height: ROW_HEIGHT, boxSizing: "border-box", display: "flex", alignItems: "center",
                  gap: 8, padding: "0 12px", borderBottom: "1px solid #1e293b",
                  opacity: isDraggingThis ? 0.4 : 1,
                  position: "relative",
                }}>
                {isDragOver && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#3b82f6", zIndex: 5 }} />
                )}
                {/* Drag handle */}
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setRowDragging({ id: task.id, overIndex: rowIndex });
                  }}
                  style={{ fontSize: 14, color: "#475569", cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}
                >⠿</span>
                <button
                  onClick={(e) => {
                    if (colorPickerId === task.id) {
                      setColorPickerId(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setColorPickerPos({ top: rect.bottom + 4, left: rect.left });
                      setColorPickerId(task.id);
                    }
                  }}
                  style={{ width: 14, height: 14, borderRadius: "50%", background: color.bg, border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
                />
                {editingNameId === task.id ? (
                  <input
                    autoFocus
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    onBlur={() => {
                      const name = editingNameValue.trim();
                      if (name) setTasks((p) => p.map((t) => t.id === task.id ? { ...t, name } : t));
                      setEditingNameId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") { setEditingNameId(null); }
                    }}
                    style={{ flex: 1, fontSize: 13, color: "#e2e8f0", background: "#1e2a3a", border: "1px solid #3b82f6", borderRadius: 4, padding: "2px 6px", outline: "none" }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => { setEditingNameId(task.id); setEditingNameValue(task.name); }}
                    title="ダブルクリックで編集"
                    style={{ fontSize: 13, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left", cursor: "text" }}>
                    {task.name}
                  </span>
                )}
                {/* Duration */}
                <input value={task.duration}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(365, Math.floor(parseFloat(e.target.value) || 1)));
                    setTasks(prev => {
                      const updated = prev.map(t => t.id === task.id ? { ...t, duration: val } : t);
                      return cascadeFromTask(updated, task.id);
                    });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder={task.duration}
                  style={{ width: 30, fontSize: 13, color: "#e2e8f0", backgroundColor: "#111827", border: "1px solid #1e293b", borderRadius: 4, padding: "4px" }} />
                {/* Progress */}
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <input
                    type="number" min="0" max="100"
                    value={task.progress ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      setTasks((p) => p.map((t) => t.id === task.id ? { ...t, progress: val } : t));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ width: 36, fontSize: 12, color: "#e2e8f0", backgroundColor: "#111827", border: "1px solid #1e293b", borderRadius: 4, padding: "2px 4px" }}
                  />
                  <span style={{ fontSize: 11, color: "#64748b" }}>%</span>
                </div>
                <button onClick={() => deleteTask(task.id)}
                  style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0 }}>
                  ×
                </button>
              </div>
            );
          })}
          </div>
          {/* 右側の横スクロールバー分だけ高さを合わせるスペーサー */}
          <div style={{ height: hScrollbarHeight, flexShrink: 0 }} />
        </div>

        {/* Right area: header (sticky) + rows in one scroll container */}
        <div ref={timelineAreaRef} onScroll={handleTimelineScroll} className="timeline-scroll-area"
          style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" }}>

          {/* Day header - sticky so it stays visible during vertical scroll */}
          <div style={{ position: "sticky", top: 0, zIndex: 30, width: timelineWidth, height: HEADER_HEIGHT, background: "#0f1117", borderBottom: "1px solid #1e293b" }}>
            {/* Month header */}
            <div style={{ position: "absolute", top: 0, width: timelineWidth, height: HEADER_HEIGHT / 2, background: "#0f1117", borderBottom: "1px solid #1e293b" }}>
              {months.map(({ month, start, end }) => {
                const width = (end - start + 1) * DAY_WIDTH;
                return (
                  <div key={month} style={{
                    position: "absolute", left: start * DAY_WIDTH, width, height: HEADER_HEIGHT / 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 600, color: "#cbd5e1",
                    border: "1px solid #1e293b",
                  }}>
                    {month}月
                  </div>
                );
              })}
            </div>
            {/* Day header */}
            <div style={{ position: "absolute", top: HEADER_HEIGHT / 2, width: timelineWidth, height: HEADER_HEIGHT / 2, background: "#0f1117" }}>
              {Array.from({ length: daysInTimeline }, (_, i) => i).map((dayOffset) => {
                const displayDate = getDisplayDay(dayOffset);
                const isToday = new Date().toDateString() === displayDate.toDateString();
                const working = isWorkingDay(dayOffset);
                return (
                  <div
                    key={dayOffset}
                    onClick={() => toggleWorkingDate(dayOffset)}
                    style={{
                      position: "absolute", left: dayOffset * DAY_WIDTH, width: DAY_WIDTH, flexShrink: 0, height: HEADER_HEIGHT / 2,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, border: "1px solid #1e293b",
                      color: isToday ? "#ffffff" : working ? "#cbd5e1" : "#f87171",
                      background: isToday ? "#2563eb" : "transparent",
                      opacity: working ? 1 : 0.7,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 10 }}>{["日", "月", "火", "水", "木", "金", "土"][displayDate.getDay()]}</div>
                    <div>{displayDate.getDate()}</div>
                    {!working && <div style={{ fontSize: 8, marginTop: 2 }}>✕</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline rows */}
          <div style={{ position: "relative", width: timelineWidth }}>

            {/* SVG arrows */}
            <ArrowLayer tasks={tasks} links={links} onDeleteLink={deleteLink}
              connectingFrom={connectingFrom} mousePos={mousePos}
              isWorkingDay={isWorkingDay} getWorkingDayStartPosition={getWorkingDayStartPosition}
              getWorkingDaysWidth={getWorkingDaysWidth} getTaskRealEndDay={getTaskRealEndDay}
              timelineWidth={timelineWidth} DAY_WIDTH={DAY_WIDTH} />

            {tasks.map((task, rowIndex) => {
              const color = COLORS[task.colorIdx % COLORS.length];
              const isHover = hoveredId === task.id;
              const isFrom = connectingFrom === task.id;

              return (
                <div key={task.id} style={{
                  position: "relative", width: timelineWidth, height: ROW_HEIGHT, boxSizing: "border-box",
                  borderBottom: "1px solid #1e293b",
                  background: rowIndex % 2 === 0 ? "#0f1117" : "#101525",
                }}>
                  {Array.from({ length: daysInTimeline }, (_, i) => i).map((dayOffset) => (
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
                  <div style={{
                    position: "absolute", left: endDateOffset * DAY_WIDTH,
                    top: 0, bottom: 0, width: 2, background: "#ef4444", opacity: 0.5, zIndex: 2,
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
                    {/* Progress fill */}
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${task.progress ?? 0}%`,
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: "6px 0 0 6px",
                      pointerEvents: "none",
                    }} />
                    <span style={{
                      padding: "0 10px", fontSize: 12, fontWeight: 600, color: color.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                      position: "relative",
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
                  {/* Progress label to the right of the bar */}
                  {(task.progress ?? 0) > 0 && (
                    <div style={{
                      position: "absolute",
                      left: getWorkingDayStartPosition(task.start) * DAY_WIDTH + getWorkingDaysWidth(task.start, task.duration) + 4,
                      top: "50%", transform: "translateY(-50%)",
                      fontSize: 11, fontWeight: 700, color: "#ffffff", whiteSpace: "nowrap", pointerEvents: "none",
                      zIndex: 6,
                    }}>
                      {task.progress}%
                    </div>
                  )}
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

      <p style={{ marginTop: 14, fontSize: 12, color: "#bcb8d3", textAlign: "center" }}>
        🔗 接続モード：タスクを順にクリックで矢印を作成　／　矢印をクリックで削除　／　📅 日付をクリックで稼働日を設定　／　青縦線 = 本日　／　赤縦線 = プロジェクト終了日
      </p>
    </div>
  );
}
