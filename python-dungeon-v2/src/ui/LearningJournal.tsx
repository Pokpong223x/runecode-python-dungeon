import { useState } from "react";
import { BookOpen, Check, Copy, Search, X } from "lucide-react";
import { CHAPTERS } from "../content";
import type {
  ChapterDefinition,
  EncounterDefinition,
  SaveGameV1,
} from "../types";
import "./journal.css";

/** Shared read-only excerpt for a learner's draft and a reference example. */
function CodeExcerpt({ code, label }: { code: string; label: string }) {
  const [feedback, setFeedback] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback("คัดลอกแล้ว วางในที่ที่ต้องการได้เลย");
    } catch {
      setFeedback("คัดลอกอัตโนมัติไม่ได้ เลือกข้อความในกรอบแล้วคัดลอกเองได้");
    }
  }
  return (
    <div className="journal-excerpt">
      <div className="journal-excerpt-heading">
        <b>{label}</b>
        <button
          className="btn ghost small"
          onClick={() => void copy()}
          aria-label={`คัดลอก${label}`}
        >
          <Copy size={16} aria-hidden="true" /> คัดลอก
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>
        <code>{code}</code>
      </pre>
      <p className="journal-copy-feedback" role="status">
        {feedback}
      </p>
    </div>
  );
}

function ChapterNotes({
  chapter,
  lessons,
  save,
  initiallyOpen,
}: {
  chapter: ChapterDefinition;
  lessons: EncounterDefinition[];
  save: SaveGameV1;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className="journal-chapter"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span className="journal-chapter-title">
          {chapter.icon} · {chapter.title}
        </span>
        <span className="journal-chapter-subtitle">{chapter.subtitle}</span>
      </summary>
      {lessons.map((lesson) => {
        const completed = save.completed.includes(lesson.id);
        const draft = save.drafts[lesson.id];
        return (
          <article
            className="lesson-note"
            key={lesson.id}
            aria-labelledby={`journal-${lesson.id}`}
          >
            <div className="journal-lesson-heading">
              <h3 id={`journal-${lesson.id}`}>{lesson.title}</h3>
              <span
                className={`journal-lesson-state${completed ? " completed" : ""}`}
              >
                {completed && <Check size={14} aria-hidden="true" />}
                {completed ? "ผ่านแล้ว" : "ยังไม่ผ่าน"}
              </span>
            </div>
            <p>{lesson.takeaway}</p>
            <ul className="journal-concepts" aria-label="แนวคิด Python">
              {lesson.contract.concepts.map((concept) => (
                <li key={concept}>
                  <code>{concept}</code>
                </li>
              ))}
            </ul>
            {draft?.trim() && (
              <div className="journal-own-code">
                <p>ร่างที่บันทึกไว้ล่าสุด อาจยังไม่ผ่านการตรวจ</p>
                <CodeExcerpt
                  key={draft}
                  code={draft}
                  label="โค้ดล่าสุดของคุณ"
                />
              </div>
            )}
            <details className="journal-example">
              <summary>ดูตัวอย่างแนวคิด</summary>
              <p>
                มีหลายวิธีที่ถูกต้อง
                ลองอธิบายแต่ละบรรทัดด้วยคำของตัวเองก่อนนำไปปรับใช้
              </p>
              <CodeExcerpt code={lesson.solutions[0]} label="ตัวอย่าง Python" />
            </details>
          </article>
        );
      })}
    </details>
  );
}

export function LearningJournal({
  save,
  currentChapter,
  onNotesChange,
}: {
  save: SaveGameV1;
  currentChapter: number;
  onNotesChange: (notes: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [completedOnly, setCompletedOnly] = useState(false);
  const terms = query
    .normalize("NFKC")
    .toLocaleLowerCase("th")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const chapters = CHAPTERS.map((chapter) => ({
    chapter,
    lessons: chapter.encounters.filter((lesson) => {
      if (lesson.boss || (completedOnly && !save.completed.includes(lesson.id)))
        return false;
      const searchable = [
        chapter.title,
        chapter.subtitle,
        lesson.title,
        lesson.prompt,
        lesson.takeaway,
        ...lesson.contract.concepts,
      ]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase("th");
      return terms.every((term) => searchable.includes(term));
    }),
  })).filter(({ lessons }) => lessons.length > 0);
  const lessons = CHAPTERS.flatMap((chapter) =>
    chapter.encounters.filter((lesson) => !lesson.boss),
  );
  const completed = lessons.filter((lesson) =>
    save.completed.includes(lesson.id),
  ).length;
  const count = chapters.reduce(
    (total, chapter) => total + chapter.lessons.length,
    0,
  );
  const filtered = terms.length > 0 || completedOnly;
  function reset() {
    setQuery("");
    setCompletedOnly(false);
  }

  return (
    <div className="learning-journal">
      <div className="journal-intro">
        <BookOpen size={26} aria-hidden="true" />
        <div>
          <b>คาถาที่ค่อย ๆ เรียนรู้</b>
          <p>
            ผ่านแล้ว {completed} / {lessons.length} บทเรียน · ไม่นับห้องบอส
          </p>
        </div>
      </div>
      <label className="journal-search-label" htmlFor="journal-search">
        ค้นหาบทเรียนหรือแนวคิด
      </label>
      <div className="journal-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="journal-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="เช่น ตัวแปร, list, for, class"
        />
        {query && (
          <button
            className="icon-button"
            aria-label="ล้างคำค้นหา"
            onClick={() => setQuery("")}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="journal-filter-row">
        <label className="journal-completed-filter">
          <input
            type="checkbox"
            checked={completedOnly}
            onChange={(e) => setCompletedOnly(e.target.checked)}
          />{" "}
          เฉพาะบทเรียนที่ผ่าน
        </label>
        <span role="status">พบ {count} บทเรียน</span>
      </div>
      <div className="journal-lessons">
        {chapters.map(({ chapter, lessons }) => (
          <ChapterNotes
            key={`${chapter.id}-${filtered ? "filtered" : "all"}`}
            chapter={chapter}
            lessons={lessons}
            save={save}
            initiallyOpen={filtered || chapter.id === currentChapter}
          />
        ))}
      </div>
      {count === 0 && (
        <div className="journal-empty">
          <p>
            {completedOnly
              ? "ยังไม่มีบทเรียนที่ผ่านตรงกับคำค้นนี้"
              : "ยังไม่พบบทเรียนที่ตรงกับคำค้นนี้"}
          </p>
          <button className="btn secondary" onClick={reset}>
            ดูบทเรียนทั้งหมด
          </button>
        </div>
      )}
      <label className="field-label" htmlFor="notes">
        บันทึกและคาถาของฉัน
      </label>
      <p className="journal-notes-help" id="notes-help">
        เก็บสิ่งที่ค้นพบในคำของคุณเอง บันทึกบนเครื่องนี้และส่งออกพร้อมเซฟได้
      </p>
      <textarea
        id="notes"
        className="notes resize-none"
        value={save.notes}
        onChange={(e) => onNotesChange(e.target.value.slice(0, 32000))}
        aria-describedby="notes-help"
        maxLength={32000}
        placeholder="เก็บสิ่งที่ค้นพบ หรือเขียนโค้ดที่อยากลอง…"
      />
    </div>
  );
}
