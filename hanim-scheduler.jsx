import { useState, useEffect, useCallback } from "react";

const STUDENTS = [
  "Julia M", "Brandon", "Chloé S.", "Chloe L", "Mbali",
  "Sanya", "Ilenia", "Rizz", "Orjwan", "Abby",
  "Lia", "Natsumi", "Zee T.", "Aalia", "Maddie",
  "Ryan M", "Julia (Ela)"
];

const PALETTE = [
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5" },
  { bg: "#E6F1FB", text: "#0C447C", border: "#85B7EB" },
  { bg: "#FAECE7", text: "#712B13", border: "#F0997B" },
  { bg: "#EEEDFE", text: "#3C3489", border: "#AFA9EC" },
  { bg: "#FAEEDA", text: "#633806", border: "#EF9F27" },
  { bg: "#FBEAF0", text: "#72243E", border: "#ED93B1" },
  { bg: "#EAF3DE", text: "#27500A", border: "#97C459" },
  { bg: "#F1EFE8", text: "#444441", border: "#B4B2A9" },
];

const getColor = (name) => PALETTE[STUDENTS.indexOf(name) % PALETTE.length] || PALETTE[0];

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const pad = (n) => String(n).padStart(2, "0");
const toStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => { const n = new Date(); return toStr(n.getFullYear(), n.getMonth(), n.getDate()); };
const isPast = (s) => s <= todayStr();
const isToday = (s) => s === todayStr();
const fmtDate = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; };

const STORAGE_KEY = "hanim_sched_v1";

const callClaude = async (prompt) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text ?? "";
};

export default function Scheduler() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [lessons, setLessons] = useState([]);
  const [panel, setPanel] = useState(null); // null | { type: 'new', date } | { type: 'lesson', id }
  const [form, setForm] = useState({ student: STUDENTS[0], time: "", topic: "" });
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) { const s = JSON.parse(r.value); if (s.lessons) setLessons(s.lessons); }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async (ls) => {
    try { await window.storage.set(STORAGE_KEY, JSON.stringify({ lessons: ls })); } catch {}
  }, []);

  const { y, m } = ym;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const lessonsOn = (date) => lessons.filter(l => l.date === date);

  const openNew = (date) => { setPanel({ type: "new", date }); setForm({ student: STUDENTS[0], time: "", topic: "" }); setFeedback(""); setNotes(""); };
  const openLesson = (l) => { setPanel({ type: "lesson", id: l.id }); setNotes(l.notes || ""); setFeedback(l.feedback || ""); };
  const closePanel = () => { setPanel(null); setFeedback(""); setNotes(""); };

  const addLesson = async () => {
    if (!panel?.date) return;
    setSaving(true);
    const nl = { id: String(Date.now()), student: form.student, date: panel.date, time: form.time, topic: form.topic, notes: "", feedback: "" };
    const next = [...lessons, nl];
    setLessons(next);
    await save(next);
    setSaving(false);
    setPanel({ type: "lesson", id: nl.id });
    setNotes(""); setFeedback("");
  };

  const saveNotes = async () => {
    if (!panel?.id) return;
    setSaving(true);
    const next = lessons.map(l => l.id === panel.id ? { ...l, notes, feedback } : l);
    setLessons(next); await save(next);
    setSaving(false);
  };

  const deleteLesson = async () => {
    if (!panel?.id) return;
    const next = lessons.filter(l => l.id !== panel.id);
    setLessons(next); await save(next); closePanel();
  };

  const genFeedback = async () => {
    const lesson = lessons.find(l => l.id === panel?.id);
    if (!lesson) return;
    setGenerating(true); setFeedback("");
    const prompt = `You are helping Korean language tutor Hanim write a short post-lesson message to send to student "${lesson.student}" on Preply.

Lesson details:
- Date: ${fmtDate(lesson.date)}
- Topic: ${lesson.topic || "(not specified)"}
- Tutor's notes: ${notes || "(none)"}

Write a warm, brief bilingual message (Korean + English together). Use exactly this format:

[피드백 / Feedback]
(1-2 sentences in Korean about today's lesson — specific, warm)
(Same in English)

[오늘의 한마디 / Keep it up!]
(1 short motivational line in Korean)
(Same in English)

Be genuine and specific. No generic phrases. Output ONLY the message.`;
    try {
      const text = await callClaude(prompt);
      setFeedback(text);
      const next = lessons.map(l => l.id === panel.id ? { ...l, notes, feedback: text } : l);
      setLessons(next); await save(next);
    } catch { setFeedback("오류가 발생했어요. 다시 시도해주세요."); }
    setGenerating(false);
  };

  const selectedLesson = panel?.type === "lesson" ? lessons.find(l => l.id === panel.id) : null;

  if (!loaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "500px", fontFamily: "var(--font-sans)", color: "var(--color-text-tertiary)" }}>불러오는 중...</div>
  );

  const showPanel = panel !== null;

  return (
    <div style={{ fontFamily: "var(--font-sans)", fontSize: "14px", display: "flex", minHeight: "600px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>

      {/* Calendar */}
      <div style={{ flex: showPanel ? "0 0 56%" : "1", display: "flex", flexDirection: "column", borderRight: showPanel ? "0.5px solid var(--color-border-tertiary)" : "none", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: "14px 18px 10px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "16px", fontWeight: "500", color: "var(--color-text-primary)" }}>{y}년 {MONTHS[m]}</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })} style={{ fontSize: "12px", padding: "4px 10px" }}>오늘</button>
            <button onClick={() => setYm(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { ...p, m: p.m - 1 })} style={{ padding: "4px 8px" }}>‹</button>
            <button onClick={() => setYm(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { ...p, m: p.m + 1 })} style={{ padding: "4px 8px" }}>›</button>
          </div>
        </div>

        {/* Day names */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{ padding: "6px 0", textAlign: "center", fontSize: "11px", fontWeight: "500",
              color: i === 0 ? "var(--color-text-danger)" : i === 6 ? "#185FA5" : "var(--color-text-secondary)" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flex: 1 }}>
          {Array.from({ length: cells }, (_, i) => {
            const day = i - firstDay + 1;
            const valid = day >= 1 && day <= daysInMonth;
            const date = valid ? toStr(y, m, day) : null;
            const dayLessons = date ? lessonsOn(date) : [];
            const today = date && isToday(date);
            const col = i % 7;
            const isSelDate = date && panel?.type === "new" && panel.date === date;
            const isSelLesson = date && selectedLesson?.date === date;

            return (
              <div key={i} onClick={() => valid && openNew(date)}
                style={{
                  borderRight: col < 6 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                  padding: "4px 3px",
                  cursor: valid ? "pointer" : "default",
                  background: isSelDate || isSelLesson ? "var(--color-background-secondary)" : "transparent",
                  minHeight: "72px",
                  display: "flex", flexDirection: "column", gap: "2px",
                }}>
                {valid && (
                  <>
                    <div style={{
                      width: "22px", height: "22px", borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: today ? "500" : "400",
                      background: today ? "#1D9E75" : "transparent",
                      color: today ? "white" : col === 0 ? "var(--color-text-danger)" : col === 6 ? "#185FA5" : "var(--color-text-secondary)",
                      flexShrink: 0,
                    }}>{day}</div>
                    {dayLessons.map(l => {
                      const c = getColor(l.student);
                      return (
                        <div key={l.id} onClick={e => { e.stopPropagation(); openLesson(l); }}
                          style={{
                            background: c.bg, color: c.text,
                            border: l.id === selectedLesson?.id ? `1.5px solid ${c.border}` : "1px solid transparent",
                            borderRadius: "3px", padding: "1px 4px",
                            fontSize: "10px", fontWeight: "400",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}>
                          {l.time && <span style={{ opacity: 0.65 }}>{l.time} </span>}
                          {l.student}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel */}
      {showPanel && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--color-background-primary)", minWidth: 0 }}>

          <div style={{ padding: "14px 18px 10px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--color-text-primary)" }}>
              {panel.type === "new" ? fmtDate(panel.date) : selectedLesson ? fmtDate(selectedLesson.date) : ""}
            </span>
            <button onClick={closePanel} style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", color: "var(--color-text-tertiary)", padding: "2px 6px" }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

            {/* NEW FORM */}
            {panel.type === "new" && (
              <div>
                <div style={{ fontSize: "12px", fontWeight: "500", color: "var(--color-text-secondary)", marginBottom: "12px" }}>수업 추가</div>
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "500", color: "var(--color-text-secondary)", marginBottom: "4px" }}>학생</label>
                  <select value={form.student} onChange={e => setForm(p => ({ ...p, student: e.target.value }))} style={{ fontSize: "13px", width: "100%" }}>
                    {STUDENTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "500", color: "var(--color-text-secondary)", marginBottom: "4px" }}>시간</label>
                  <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} style={{ fontSize: "13px", width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "500", color: "var(--color-text-secondary)", marginBottom: "4px" }}>주제 (선택)</label>
                  <input type="text" value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} placeholder="예: 피동 표현, Unit 5..." style={{ fontSize: "13px", width: "100%", boxSizing: "border-box" }} />
                </div>
                <button onClick={addLesson} disabled={saving} style={{ width: "100%", padding: "10px", fontSize: "13px", fontWeight: "500" }}>
                  {saving ? "저장 중..." : "수업 추가"}
                </button>
              </div>
            )}

            {/* LESSON DETAIL */}
            {selectedLesson && (
              <div>
                {(() => {
                  const c = getColor(selectedLesson.student);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "14px" }}>
                      <span style={{ background: c.bg, color: c.text, borderRadius: "99px", padding: "3px 10px", fontSize: "12px", fontWeight: "500" }}>{selectedLesson.student}</span>
                      {selectedLesson.time && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{selectedLesson.time}</span>}
                      {selectedLesson.topic && <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>· {selectedLesson.topic}</span>}
                    </div>
                  );
                })()}

                {isPast(selectedLesson.date) ? (
                  <>
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: "500", color: "var(--color-text-secondary)", marginBottom: "4px" }}>수업 메모</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="오늘 뭐 했는지, 잘 한 것, 어려웠던 것..." rows={3}
                        style={{ width: "100%", resize: "vertical", boxSizing: "border-box", fontSize: "13px", padding: "8px 10px", fontFamily: "var(--font-sans)" }} />
                    </div>

                    <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                      <button onClick={genFeedback} disabled={generating}
                        style={{ flex: 1, padding: "9px", fontSize: "12px", fontWeight: "500", cursor: generating ? "not-allowed" : "pointer" }}>
                        {generating ? "생성 중..." : "피드백 + 한마디 생성"}
                      </button>
                      <button onClick={saveNotes} style={{ padding: "9px 12px", fontSize: "12px" }}>저장</button>
                    </div>

                    {feedback && (
                      <>
                        <div style={{ fontSize: "11px", fontWeight: "500", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Preply 메시지</div>
                        <div style={{
                          background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)",
                          borderRadius: "var(--border-radius-md)", padding: "12px",
                          fontSize: "13px", lineHeight: "1.75", color: "var(--color-text-primary)",
                          whiteSpace: "pre-wrap", marginBottom: "8px",
                        }}>{feedback}</div>
                        <button onClick={() => { navigator.clipboard.writeText(feedback); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          style={{ fontSize: "12px", padding: "6px 12px", background: copied ? "#1D9E75" : undefined, color: copied ? "white" : undefined }}>
                          <i className="ti ti-copy" aria-hidden="true" style={{ fontSize: "12px", marginRight: "4px", verticalAlign: "-1px" }}></i>
                          {copied ? "복사됐어요!" : "복사하기"}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "var(--color-text-tertiary)", fontSize: "13px" }}>
                    <i className="ti ti-calendar-event" aria-hidden="true" style={{ fontSize: "22px", display: "block", marginBottom: "8px" }}></i>
                    수업 당일이 되면 메모와 피드백을 작성할 수 있어요
                  </div>
                )}

                <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                  <button onClick={deleteLesson} style={{ fontSize: "12px", padding: "5px 10px", color: "var(--color-text-danger)" }}>
                    <i className="ti ti-trash" aria-hidden="true" style={{ fontSize: "12px", marginRight: "3px", verticalAlign: "-1px" }}></i>
                    수업 삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
