import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Coins,
  Download,
  Eye,
  Flame,
  Heart,
  HelpCircle,
  Home,
  Map,
  Play,
  RefreshCw,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Square,
  Star,
  Swords,
  Upload,
  Volume2,
  VolumeX,
  WifiOff,
  Flag,
  Lock,
  Compass,
  ScrollText,
} from "lucide-react";
import {
  API_GUIDE,
  CHAPTERS,
  ENCOUNTERS,
  HEROES,
  encounterById,
  isUnlocked,
  nextEncounter,
} from "./content";
import {
  commitBattle,
  purchase,
  resolveTurn,
  rewardVictory,
  startCombat,
} from "./engine";
import { actionCall, getSkill, skillCommand } from "./skills";
import { SOURCE_COMBAT_GUIDANCE } from "./sourceCurriculum";
import { actionBudget } from "./actionBudget";
import { freshSave, loadSave, persistSave, validateSave } from "./storage";
import { PythonRuntime } from "./runtime/client";
import type {
  CombatEvent,
  CombatState,
  ActionTrace,
  ActionKind,
  OffensiveAction,
  SkillId,
  HeroId,
  RunResult,
  SaveGameV1,
} from "./types";
import type { EditorHandle, ExecutionMark } from "./ui/Editor";
import type { OffenseMode } from "./ui/offenseCode";
import { SkillBook } from "./ui/SkillBook";
import { useBattleModules } from "./ui/battleModules";
import { ToolLoading } from "./ui/ToolLoading";
import { Modal } from "./ui/Modal";
import { TurnPreview, type TurnForecast } from "./ui/TurnPreview";
import { traitMessages } from "./heroTraits";
import { EnemyTactics, PlayerEffects } from "./ui/EnemyTactics";
import { CampaignSummary } from "./ui/CampaignSummary";
import { LearningJournal } from "./ui/LearningJournal";
import { useOfflineReady } from "./ui/useOfflineReady";
import { BattleAudio } from "./audio/BattleAudio";
import { PythonFeedback } from "./ui/PythonFeedback";
import { StarRules } from "./ui/StarRules";
import { LessonHints } from "./ui/LessonHints";
import { BattleResult } from "./ui/BattleResult";
import "./ui/learning.css";
const runtime = new PythonRuntime();
type Page = "intro" | "map" | "battle";
type Overlay =
  | "shop"
  | "journal"
  | "settings"
  | "help"
  | "reset"
  | "import"
  | "skills"
  | null;
export function App() {
  const [sounds] = useState(() => new BattleAudio());
  const [save, setSave] = useState<SaveGameV1>(freshSave),
    saveRef = useRef(save),
    [loaded, setLoaded] = useState(false),
    [page, setPage] = useState<Page>("intro"),
    [overlay, setOverlay] = useState<Overlay>(null),
    [selected, setSelected] = useState<HeroId>("adventurer"),
    [chapter, setChapter] = useState(1),
    [hint, setHint] = useState(0),
    [result, setResult] = useState<(RunResult & { preview?: boolean }) | null>(
      null,
    ),
    [forecast, setForecast] = useState<TurnForecast | null>(null),
    [offenseMode, setOffenseMode] = useState<OffenseMode>("attack"),
    [offenseSkill, setOffenseSkill] = useState<SkillId | "mixed">("class"),
    [events, setEvents] = useState<CombatEvent[]>([]),
    [presentation, setPresentation] = useState<CombatState | null>(null),
    [execution, setExecution] = useState<ExecutionMark | undefined>(),
    [runtimeTick, setRuntimeTick] = useState(0),
    [pythonPrepared, setPythonPrepared] = useState(false),
    [saveStatus, setSaveStatus] = useState("กำลังเปิดบันทึก…"),
    [storageBlocked, setStorageBlocked] = useState(false),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine),
    [importCandidate, setImportCandidate] = useState<SaveGameV1 | null>(null),
    [bootError, setBootError] = useState(""),
    [conflict, setConflict] = useState(false);
  const { ready: cached, updateWaiting } = useOfflineReady(pythonPrepared);
  const fileInput = useRef<HTMLInputElement>(null),
    hintTrigger = useRef<HTMLButtonElement>(null),
    editor = useRef<EditorHandle>(null),
    runLock = useRef(false),
    playbackLock = useRef(false),
    playbackEvidence = useRef<{ source: string; trace: ActionTrace[] } | null>(
      null,
    ),
    navEpoch = useRef(0),
    saveQueue = useRef(Promise.resolve()),
    persistedRevision = useRef<number | null>(null),
    checkpoint = useRef<SaveGameV1["battle"]>(null),
    instanceId = useRef(crypto.randomUUID()),
    channel = useRef<BroadcastChannel | null>(null);
  const mutate = useCallback(
    (fn: (s: SaveGameV1) => SaveGameV1) => {
      const current = saveRef.current;
      const next = {
        ...fn(current),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      // Invalidate an older write before React schedules the next render. The
      // new checkpoint and its pending label must appear in the same commit.
      saveRef.current = next;
      setSave(next);
      setSaveStatus(
        conflict
          ? "หยุดบันทึก • อีกแท็บมีบันทึกใหม่กว่า"
          : storageBlocked
            ? "ยังไม่ได้บันทึก • ส่งออกไฟล์สำรองได้"
            : "กำลังบันทึก…",
      );
    },
    [conflict, storageBlocked],
  );
  const say = (text: string) => setNotice(text);
  function openOverlay(next: Exclude<Overlay, null>, trigger: HTMLElement) {
    // Safari pointer clicks need explicit focus for reliable dialog restoration.
    trigger.focus({ preventScroll: true });
    setOverlay(next);
  }
  function showHint(level: number) {
    setHint(level);
    if (level <= 1) hintTrigger.current?.focus({ preventScroll: true });
  }
  const {
    Scene,
    modules,
    failed: toolsFailed,
  } = useBattleModules(page === "battle");
  const Editor = modules?.Editor;
  async function retryTools() {
    // Browsers cache failed module imports. Persist first, then reload to retry
    // the same hashed assets without throwing away the current room or draft.
    if (conflict || storageBlocked) {
      say("ยังบันทึกบนเครื่องไม่ได้ ส่งออกไฟล์ในตั้งค่าก่อนโหลดหน้าใหม่");
      return;
    }
    try {
      setSaveStatus("กำลังบันทึกก่อนโหลดใหม่…");
      await (saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(async () => {
          const pending = saveRef.current;
          await persistSave(pending, persistedRevision.current);
          persistedRevision.current = pending.revision;
        }));
      window.location.reload();
    } catch {
      setSaveStatus("บันทึกไม่ได้ • ส่งออกไฟล์สำรองในตั้งค่า");
      say(
        "ยังโหลดหน้าใหม่ไม่ได้ เพราะบันทึกไม่สำเร็จ ส่งออกไฟล์ในตั้งค่าเพื่อเก็บความคืบหน้า",
      );
    }
  }
  const onPlayback = useCallback(
    (playing: boolean) => {
      playbackLock.current = playing;
      if (!playing) {
        playbackEvidence.current = null;
        setExecution(undefined);
        setPresentation(null);
        sounds.stop();
      }
    },
    [sounds],
  );
  const onBeat = useCallback(
    (event: CombatEvent, _impact: boolean, source?: CombatEvent) => {
      const evidence = playbackEvidence.current;
      const index = event.actionIndex ?? source?.actionIndex;
      const action = index !== undefined ? evidence?.trace[index] : undefined;
      setExecution(
        evidence && action
          ? {
              source: evidence.source,
              line: action.line,
              command: actionCall(action),
            }
          : undefined,
      );
      if (event.vitals)
        setPresentation((previous) =>
          previous ? { ...previous, ...event.vitals } : previous,
        );
      sounds.play(event, saveRef.current.hero ?? "adventurer", source);
    },
    [sounds],
  );
  useEffect(() => {
    sounds.setEnabled(save.settings.sound);
  }, [save.settings.sound, sounds]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) sounds.close();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      sounds.close();
    };
  }, [sounds]);
  function toggleSound() {
    const enabled = !saveRef.current.settings.sound;
    sounds.unlock(enabled);
    mutate((s) => ({ ...s, settings: { ...s.settings, sound: enabled } }));
  }
  useEffect(() => {
    runtime.onStatus = () => {
      if (runtime.status === "ready") setPythonPrepared(true);
      setRuntimeTick((x) => x + 1);
    };
    void loadSave()
      .then((s) => {
        persistedRevision.current = s.revision;
        saveRef.current = s;
        setSave(s);
        setSelected(s.hero ?? "adventurer");
        setPage(
          s.battle?.status === "active" ? "battle" : s.hero ? "map" : "intro",
        );
        setChapter(
          s.battle
            ? encounterById(s.battle.encounterId).chapter
            : nextEncounter(s.completed).chapter,
        );
        setSaveStatus("บันทึกบนเครื่องนี้");
      })
      .catch((err) => {
        setBootError(String(err.message));
        setStorageBlocked(true);
        setSaveStatus("ยังไม่ได้บันทึก • ส่งออกไฟล์สำรองได้");
      })
      .finally(() => setLoaded(true));
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      runtime.onStatus = () => {};
      runtime.cancel();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    if (loaded) runtime.start();
  }, [loaded]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? innerHeight;
      const inset = Math.max(
        0,
        innerHeight - height - (viewport?.offsetTop ?? 0),
      );
      document.documentElement.style.setProperty(
        "--visual-height",
        `${height}px`,
      );
      document.documentElement.style.setProperty(
        "--keyboard-inset",
        `${inset}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    if (!loaded || storageBlocked || conflict) return;
    setSaveStatus("กำลังบันทึก…");
    const delay = save.battle !== checkpoint.current ? 0 : 450;
    checkpoint.current = save.battle;
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(async () => {
          await persistSave(save, persistedRevision.current);
          persistedRevision.current = save.revision;
          // An earlier queued write can finish while a newer draft waits.
          // Only the current checkpoint may announce that everything is saved.
          if (saveRef.current === save) setSaveStatus("บันทึกแล้วบนเครื่องนี้");
          channel.current?.postMessage({
            instance: instanceId.current,
            revision: save.revision,
          });
        })
        .catch((error) => {
          if (String(error).includes("CONFLICT")) {
            setConflict(true);
            runtime.cancel();
          }
          setSaveStatus("บันทึกไม่ได้ • ส่งออกไฟล์สำรองในตั้งค่า");
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [save, loaded, storageBlocked, conflict]);
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const c = new BroadcastChannel("runecode-save-updates");
    channel.current = c;
    c.onmessage = ({ data }) => {
      if (
        data.instance !== instanceId.current &&
        persistedRevision.current !== null &&
        data.revision > persistedRevision.current
      ) {
        setConflict(true);
        setSaveStatus("หยุดบันทึก • อีกแท็บมีบันทึกใหม่กว่า");
        runtime.cancel();
        setNotice(
          "มีการเล่นจากอีกแท็บ หยุดบันทึกแท็บนี้เพื่อป้องกันข้อมูลทับกัน",
        );
      }
    };
    return () => c.close();
  }, []);
  useEffect(() => {
    document.title = `${page === "battle" && save.battle ? encounterById(save.battle.encounterId).title : page === "map" ? "แผนที่การผจญภัย" : "ผจญภัยด้วย Python"} • RuneCode`;
  }, [page, save.battle?.encounterId]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const battle = save.battle,
    visibleBattle =
      presentation?.encounterId === battle?.encounterId ? presentation : battle,
    encounter = battle ? encounterById(battle.encounterId) : null,
    currentChapter = CHAPTERS[chapter - 1],
    hero = HEROES[save.hero ?? selected],
    progress = Math.round((save.completed.length / 24) * 100),
    code = encounter ? (save.drafts[encounter.id] ?? encounter.starter) : "";
  function navigate(next: Page) {
    playbackEvidence.current = null;
    setExecution(undefined);
    sounds.close();
    navEpoch.current++;
    if (runtime.status === "running") runtime.cancel();
    runLock.current = false;
    playbackLock.current = false;
    setPresentation(null);
    setEvents([]);
    setPage(next);
    setOverlay(null);
    setResult(null);
    setForecast(null);
    setHint(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function begin(id: string) {
    if (!save.hero || !isUnlocked(id, save.completed)) {
      say("ผ่านห้องก่อนหน้าเพื่อปลดล็อกห้องนี้");
      return;
    }
    if (runtime.status === "idle") runtime.start();
    if (
      saveRef.current.battle?.status !== "active" ||
      saveRef.current.battle.encounterId !== id
    )
      mutate((s) => ({ ...s, battle: startCombat(s, id) }));
    setEvents([]);
    setResult(null);
    setChapter(encounterById(id).chapter);
    navigate("battle");
  }
  function start() {
    mutate((s) => ({ ...s, hero: selected, onboarding: true, battle: null }));
    navigate("map");
  }
  function setCode(value: string) {
    if (!encounter) return;
    // An edited draft can no longer describe the committed animation, even if
    // Undo later restores identical text during that same playback.
    playbackEvidence.current = null;
    setExecution(undefined);
    setResult(null);
    setForecast(null);
    mutate((s) => ({
      ...s,
      drafts: { ...s.drafts, [encounter.id]: value.slice(0, 16000) },
    }));
  }
  function insertSkill(action: ActionKind, skill: SkillId = "class") {
    const epoch = navEpoch.current;
    setOverlay(null);
    requestAnimationFrame(() => {
      if (epoch !== navEpoch.current) return;
      if (editor.current?.insertAction(action, skill)) {
        setResult(null);
        say(
          action === "attack" || action === "skill"
            ? `เลือกคำสั่ง ${action === "skill" ? skillCommand(skill) : action} แล้ว ตรวจค่าพลังในวงเล็บให้ตรงโจทย์ก่อนรันโค้ด`
            : `แทรก ${action}() แล้ว ตรวจ AP รวมและภารกิจก่อนกดรันโค้ด`,
        );
      } else say("แทรกคำสั่งไม่ได้ โค้ดอาจเต็มหรือกำลังประมวลผล ลองอีกครั้ง");
    });
  }
  function chooseOffense(action: OffensiveAction, skill: SkillId = "class") {
    if (
      runLock.current ||
      playbackLock.current ||
      conflict ||
      battle?.status !== "active" ||
      (action === "skill" &&
        (!getSkill(battle.hero, skill) ||
          battle.mp < getSkill(battle.hero, skill)!.mp))
    )
      return;
    if (editor.current?.chooseOffense(action, skill)) {
      setResult(null);
      setForecast(null);
      say(
        `เลือกคำสั่ง ${action === "skill" ? skillCommand(skill) : action} แล้ว ตรวจค่าพลังในวงเล็บให้ตรงโจทย์${action === "skill" ? " • สกิลใช้ 2 AP เหลือ 1 AP สำหรับคำสั่งเสริม" : " • โจมตีใช้ครั้งละ 1 AP"} ย้อนกลับได้ด้วย Ctrl/Cmd+Z`,
      );
    } else
      say(
        "ยังเปลี่ยนท่าอัตโนมัติไม่ได้ ตรวจไวยากรณ์ ชื่อคำสั่งที่ประกาศเอง หรือโค้ดที่ยาวเกิน 16,000 ตัวอักษร โค้ดเดิมยังอยู่ครบ",
      );
  }
  async function run(mode: "turn" | "preview" = "turn") {
    const s = saveRef.current,
      b = s.battle;
    if (
      runLock.current ||
      playbackLock.current ||
      !modules ||
      conflict ||
      !b ||
      b.status !== "active" ||
      page !== "battle"
    )
      return;
    setForecast(null);
    if (!code.trim()) {
      setResult({
        ok: false,
        actions: [],
        stdout: [],
        diagnostic: {
          kind: "Empty",
          message: "เริ่มเขียนโค้ดก่อนกดรัน ลองอ่านภารกิจหรือเปิดคำใบ้",
        },
      });
      return;
    }
    if (runtime.status !== "ready") {
      if (runtime.status === "idle" || runtime.status === "error")
        runtime.retry();
      return;
    }
    runLock.current = true;
    if (mode === "turn") sounds.unlock(s.settings.sound);
    const epoch = navEpoch.current;
    const output = await runtime.run(
      code,
      encounterById(b.encounterId).contract,
      {
        hp: b.hp,
        mp: b.mp,
        enemy_hp: b.enemyHp,
        enemy_intent: b.intent.kind,
        potions: b.potions,
      },
    );
    runLock.current = false;
    if (epoch !== navEpoch.current) return;
    const budget = actionBudget(output.trace, code, output.traceLimited);
    const evaluated = {
      ...output,
      budget,
      preview: mode === "preview",
      diagnostic:
        output.diagnostic &&
        !output.diagnostic.line &&
        output.traceLimited &&
        budget?.firstOverLine
          ? { ...output.diagnostic, line: budget.firstOverLine }
          : output.diagnostic,
    };
    setResult(evaluated);
    if (!output.ok) return;
    const resolution = resolveTurn(b, output.actions);
    if (resolution.error) {
      setResult({
        ...evaluated,
        preview: mode === "preview",
        ok: false,
        diagnostic: {
          kind: "ActionError",
          message: resolution.error,
          line:
            output.trace?.[resolution.actionIndex ?? -1]?.line ??
            budget?.firstOverLine,
        },
      });
      return;
    }
    if (mode === "preview") {
      setForecast({
        before: b,
        after: resolution.state,
        actions: output.actions,
        source: code,
        traits: traitMessages(resolution.events),
      });
      return;
    }
    playbackLock.current = true;
    playbackEvidence.current = { source: code, trace: output.trace ?? [] };
    setPresentation(b);
    setEvents(resolution.events);
    mutate((s) => {
      const withBattle = commitBattle(s, resolution.state);
      return resolution.state.status === "won"
        ? rewardVictory(withBattle, resolution.state)
        : withBattle;
    });
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(save, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `runecode-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("ส่งออกบันทึกแล้ว เก็บไฟล์นี้ไว้เพื่อย้ายเครื่อง");
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2000000) {
      say("ไฟล์ใหญ่เกินไป เลือกไฟล์บันทึก RuneCode ขนาดไม่เกิน 2 MB");
      return;
    }
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!validateSave(data)) throw new Error();
      setImportCandidate(data);
      setOverlay("import");
    } catch {
      say("ไฟล์บันทึกไม่ถูกต้อง ข้อมูลเดิมยังอยู่ครบ");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function acceptImport() {
    if (conflict) {
      say("โหลดบันทึกล่าสุดก่อนนำเข้าไฟล์ เพื่อป้องกันข้อมูลจากอีกแท็บถูกทับ");
      return;
    }
    if (!importCandidate) return;
    const incoming = importCandidate;
    mutate((s) => ({
      ...incoming,
      revision: Math.max(s.revision, incoming.revision),
    }));
    setStorageBlocked(false);
    setBootError("");
    setConflict(false);
    setSelected(incoming.hero ?? "adventurer");
    setChapter(
      incoming.battle
        ? encounterById(incoming.battle.encounterId).chapter
        : nextEncounter(incoming.completed).chapter,
    );
    navigate(
      incoming.battle?.status === "active"
        ? "battle"
        : incoming.hero
          ? "map"
          : "intro",
    );
    setImportCandidate(null);
    say("นำเข้าบันทึกแล้ว");
  }
  const runtimeReady = runtime.status === "ready",
    busy = runtime.status === "running";
  void runtimeTick;
  if (!loaded)
    return (
      <div className="boot-screen">
        <Code2 size={44} />
        <p>กำลังเปิดสมุดการผจญภัย…</p>
      </div>
    );
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate(save.hero ? "map" : "intro")}
          aria-label="RuneCode กลับแผนที่"
        >
          <span className="brand-symbol">
            <Code2 size={25} />
          </span>
          <span>
            RUNE<span>CODE</span>
            <small>THE PYTHON CHRONICLES</small>
          </span>
        </button>
        <div className="topbar-center">
          <span className="tiny-dot" />
          เขียนโค้ดให้เป็นพลัง
        </div>
        <div className="topbar-actions">
          <span className="gold-count">
            <Coins size={18} />
            {save.gold.toLocaleString("th-TH")}
          </span>
          <button
            className="icon-button"
            onClick={toggleSound}
            aria-pressed={save.settings.sound}
            aria-label={save.settings.sound ? "ปิดเสียง" : "เปิดเสียง"}
          >
            {save.settings.sound ? (
              <Volume2 size={20} />
            ) : (
              <VolumeX size={20} />
            )}
          </button>
          <button
            className="icon-button"
            onClick={(event) => openOverlay("settings", event.currentTarget)}
            aria-label="ตั้งค่า"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>
      {save.hero && (
        <nav className="mobile-nav" aria-label="เมนูหลักบนมือถือ">
          <button
            onClick={() => navigate("map")}
            aria-current={page === "map" ? "page" : undefined}
          >
            <Compass size={17} />
            แผนที่
          </button>
          <button
            onClick={(event) => openOverlay("journal", event.currentTarget)}
          >
            <BookOpen size={17} />
            สมุดบทเรียน
          </button>
          <button onClick={(event) => openOverlay("shop", event.currentTarget)}>
            <ShoppingBag size={17} />
            ร้านค้า
          </button>
          <button onClick={(event) => openOverlay("help", event.currentTarget)}>
            <HelpCircle size={17} />
            วิธีเล่น
          </button>
        </nav>
      )}
      <div className="shell">
        <aside className="sidebar">
          <div className="rail-label">บันทึกนักเดินทาง</div>
          <nav aria-label="เมนูหลัก">
            <button
              className={page === "map" ? "nav-item active" : "nav-item"}
              onClick={() => navigate(save.hero ? "map" : "intro")}
            >
              <Compass size={19} />
              <span>การผจญภัย</span>
              <ChevronRight size={15} />
            </button>
            <button
              className="nav-item"
              onClick={(event) => openOverlay("journal", event.currentTarget)}
            >
              <BookOpen size={19} />
              <span>สมุดบทเรียน</span>
            </button>
            <button
              className="nav-item"
              onClick={(event) => openOverlay("shop", event.currentTarget)}
              disabled={!save.hero}
            >
              <ShoppingBag size={19} />
              <span>ร้านค้านักเดินทาง</span>
            </button>
            <button
              className="nav-item"
              onClick={(event) => openOverlay("help", event.currentTarget)}
            >
              <HelpCircle size={19} />
              <span>วิธีเล่น</span>
            </button>
          </nav>
          <div className="rail-progress">
            <span className="eyebrow">YOUR STORY</span>
            <h3>
              {save.completed.length} <span>/ 24 ห้อง</span>
            </h3>
            <div className="progress-track">
              <i style={{ width: `${progress}%` }} />
            </div>
            <p>
              {save.completed.length === 24
                ? "บทใหม่ของคุณเริ่มต้นได้เสมอ"
                : "ทุกบรรทัดพาคุณไปไกลขึ้น"}
            </p>
          </div>
          <div className="rail-note">
            <ScrollText size={24} />
            <p>
              “คาถาที่ยิ่งใหญ่
              <br />
              เริ่มจากโค้ดบรรทัดแรก”
            </p>
          </div>
          <div className="rail-bottom">
            <span
              className={`status-dot ${saveStatus.includes("ไม่ได้") ? "error" : ""}`}
            />
            <span>{saveStatus}</span>
          </div>
        </aside>
        <main id="main-content">
          {(bootError || conflict) && (
            <div className="banner error" role="alert">
              {conflict
                ? "อีกแท็บมีบันทึกใหม่กว่า กรุณาโหลดหน้านี้ใหม่ก่อนเล่นต่อ"
                : bootError}
              <button
                className="btn small"
                onClick={() =>
                  conflict ? location.reload() : setOverlay("settings")
                }
              >
                {conflict ? "โหลดบันทึกล่าสุด" : "จัดการบันทึก"}
              </button>
            </div>
          )}
          {offline && (
            <div className="banner">
              <WifiOff size={18} />
              ออฟไลน์ ·{" "}
              {cached
                ? "เล่นต่อได้จากไฟล์ที่เก็บไว้"
                : "ถ้า Python ยังไม่พร้อม ให้เชื่อมต่อแล้วโหลดครั้งแรก"}
            </div>
          )}
          {page === "intro" && (
            <section className="welcome">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">A NEW CHAPTER BEGINS</div>
                  <h1>
                    ทุกบรรทัด คือจุดเริ่มต้น
                    <br />
                    <span>ของการผจญภัย</span>
                  </h1>
                  <p>
                    เรียน Python จากศูนย์ ผ่านโลกแห่งรูนและเวทมนตร์
                    <br className="desktop-only" /> เขียนโค้ด วางแผนต่อสู้
                    แล้วค้นพบพลังของคุณ
                  </p>
                </div>
                <span className="edition-stamp">
                  6 ดินแดน
                  <br />
                  <b>24</b>
                  <br />
                  การผจญภัย
                </span>
              </div>
              <div className="welcome-diorama">
                {Scene ? (
                  <Scene
                    hero={selected}
                    reduced={save.settings.reducedMotion}
                  />
                ) : (
                  <ToolLoading
                    scene
                    failed={toolsFailed}
                    onRetry={retryTools}
                  />
                )}
                <div className="diorama-caption">
                  <span>01 / ป่าแสงแรก</span>
                  <span>
                    <Sparkles size={14} /> Python จริง · เล่นฟรี · ไม่ต้องสมัคร
                  </span>
                </div>
                <div className="diorama-story">
                  ที่ปลายป่า…
                  <br />
                  <strong>โลกแห่งรูนกำลังรอคุณ</strong>
                </div>
              </div>
              <div className="selection-heading">
                <div>
                  <span className="eyebrow">CHOOSE YOUR HERO</span>
                  <h2>คุณจะออกเดินทางในบทบาทไหน?</h2>
                </div>
                <span className="muted">ทุกอาชีพเรียนรู้ได้เหมือนกัน</span>
              </div>
              <div className="hero-grid">
                {(Object.keys(HEROES) as HeroId[]).map((id, i) => (
                  <button
                    key={id}
                    className={`hero-card ${selected === id ? "selected" : ""}`}
                    onClick={() => setSelected(id)}
                    aria-pressed={selected === id}
                  >
                    <span className={`hero-emblem emblem-${id}`}>
                      {i === 0 ? <Swords /> : i === 1 ? <Shield /> : <Flame />}
                    </span>
                    <div>
                      <small>{HEROES[id].badge}</small>
                      <h3>{HEROES[id].name}</h3>
                      <p>{HEROES[id].description}</p>
                      <span className="hero-stats">
                        HP {HEROES[id].hp} <i /> MP {HEROES[id].mp}
                      </span>
                    </div>
                    <span className="select-dot">
                      {selected === id && <Check size={12} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="start-row">
                <div>
                  <button className="btn primary large" onClick={start}>
                    เริ่มการผจญภัย <ArrowRight size={19} />
                  </button>
                  <small>ไม่ต้องมีพื้นฐาน เริ่มด้วยโค้ดเพียงหนึ่งบรรทัด</small>
                </div>
                <RuntimeBadge />
              </div>
            </section>
          )}
          {page === "map" && (
            <section className="map-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE WORLD OF RUNECODE</span>
                  <h1>
                    {save.completed.length === 24
                      ? "คุณคือผู้พิทักษ์แห่งรูน"
                      : "เส้นทางของนักโค้ด"}
                  </h1>
                  <p>
                    {save.completed.length === 24
                      ? "พิชิตครบ 6 ดินแดนแล้ว! กลับไปฝึก ปรับโค้ด และเก็บดาวได้เสมอ"
                      : "จากคำสั่งแรก สู่คาถาที่คุณสร้างขึ้นเอง"}
                  </p>
                </div>
                <button
                  className="btn primary"
                  onClick={() => begin(nextEncounter(save.completed).id)}
                  disabled={conflict}
                >
                  {save.completed.length === 24
                    ? "เล่นบอสอีกครั้ง"
                    : "เดินทางต่อ"}
                  <ArrowRight size={18} />
                </button>
              </div>
              <CampaignSummary
                save={save}
                disabled={conflict}
                onJournal={(trigger) => openOverlay("journal", trigger)}
                onExport={exportSave}
                onReplay={begin}
              />
              <div className="world-layout">
                <div className="chapter-list">
                  {CHAPTERS.map((c) => {
                    const cleared = c.encounters.filter((e) =>
                        save.completed.includes(e.id),
                      ).length,
                      unlocked = isUnlocked(c.encounters[0].id, save.completed);
                    return (
                      <button
                        key={c.id}
                        className={`chapter-card ${chapter === c.id ? "current" : ""} ${!unlocked ? "locked" : ""}`}
                        onClick={() => setChapter(c.id)}
                        aria-pressed={chapter === c.id}
                        style={{ "--region": c.color } as React.CSSProperties}
                      >
                        <span className="chapter-number">
                          {cleared === 4 ? (
                            <Check />
                          ) : !unlocked ? (
                            <Lock size={19} />
                          ) : (
                            c.icon
                          )}
                        </span>
                        <div>
                          <span className="chapter-region">{c.region}</span>
                          <h2>{c.title}</h2>
                          <p>{c.subtitle}</p>
                          <div className="chapter-dots">
                            {c.encounters.map((e) => (
                              <i
                                key={e.id}
                                className={
                                  save.completed.includes(e.id)
                                    ? "done"
                                    : e.boss
                                      ? "boss"
                                      : ""
                                }
                              />
                            ))}
                            <span>{cleared}/4</span>
                          </div>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    );
                  })}
                </div>
                <div className="region-panel">
                  <div className="region-art-title">
                    <span>CHAPTER {currentChapter.icon}</span>
                    <h2>{currentChapter.region}</h2>
                  </div>
                  <div className="region-art">
                    {Scene ? (
                      <Scene
                        chapter={chapter}
                        hero={save.hero!}
                        enemy={currentChapter.encounters[0].enemyKind}
                        reduced={save.settings.reducedMotion}
                      />
                    ) : (
                      <ToolLoading
                        scene
                        failed={toolsFailed}
                        onRetry={retryTools}
                      />
                    )}
                  </div>
                  <div className="region-detail">
                    <div className="region-detail-heading">
                      <h2>{currentChapter.title}</h2>
                      <span className="tag">3 ห้องเรียนรู้ + 1 บอส</span>
                    </div>
                    <p className="muted">
                      ฝึก {currentChapter.subtitle} แล้วนำสิ่งที่เรียนไปพิชิตบอส
                    </p>
                    <div className="encounter-list">
                      {currentChapter.encounters.map((e) => {
                        const done = save.completed.includes(e.id),
                          unlocked = isUnlocked(e.id, save.completed);
                        return (
                          <button
                            className="encounter-row"
                            key={e.id}
                            onClick={() => begin(e.id)}
                            disabled={!unlocked || conflict}
                          >
                            <span
                              className={
                                e.boss ? "room-icon boss" : "room-icon"
                              }
                            >
                              {done ? (
                                <Check size={18} />
                              ) : !unlocked ? (
                                <Lock size={16} />
                              ) : e.boss ? (
                                <Flag size={18} />
                              ) : (
                                e.room.toString().padStart(2, "0")
                              )}
                            </span>
                            <span>
                              <b>{e.title}</b>
                              <small>
                                {done
                                  ? "★".repeat(save.stars[e.id] ?? 1)
                                  : e.boss
                                    ? "บททดสอบประจำดินแดน"
                                    : e.contract.concepts.join(" · ")}
                              </small>
                            </span>
                            <span className="room-action">
                              {done
                                ? "ฝึกอีกครั้ง"
                                : unlocked
                                  ? "เข้าสู่ห้อง"
                                  : "ยังไม่ปลดล็อก"}
                              {unlocked && <ArrowRight size={15} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="map-tip">
                    <BookOpen size={19} />
                    <span>
                      ลืมคำสั่ง? เปิดสมุดบทเรียนได้ทุกเมื่อ
                      ไม่มีการหักคะแนนคำใบ้
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}
          {page === "battle" && battle && encounter && (
            <section className="battle-page">
              <div className="battle-heading">
                <button className="back-link" onClick={() => navigate("map")}>
                  <ArrowLeft size={17} /> แผนที่
                </button>
                <span className="eyebrow">
                  CHAPTER {String(encounter.chapter).padStart(2, "0")} / ROOM{" "}
                  {encounter.room === 4
                    ? "BOSS"
                    : String(encounter.room).padStart(2, "0")}
                </span>
                <span className="tag">เทิร์น {visibleBattle!.turn}</span>
              </div>
              <h1 className="battle-title">{encounter.title}</h1>
              <div className="battle-layout">
                <div className="combat-column">
                  <div className="combat-panel">
                    <div className="combat-status">
                      <CombatMeter
                        title={hero.name}
                        value={visibleBattle!.hp}
                        max={battle.maxHp}
                        mana={{ value: visibleBattle!.mp, max: battle.maxMp }}
                      />
                      <CombatMeter
                        title={encounter.enemy}
                        value={visibleBattle!.enemyHp}
                        max={battle.maxEnemyHp}
                        enemy
                      />
                    </div>
                    {Scene ? (
                      <Scene
                        key={`${encounter.id}-${navEpoch.current}`}
                        chapter={encounter.chapter}
                        hero={save.hero!}
                        enemy={encounter.enemyKind}
                        boss={encounter.boss}
                        events={events}
                        status={battle.status}
                        enemyName={encounter.enemy}
                        onPlayback={onPlayback}
                        onBeat={onBeat}
                        reduced={save.settings.reducedMotion}
                      />
                    ) : (
                      <ToolLoading
                        scene
                        failed={toolsFailed}
                        onRetry={retryTools}
                      />
                    )}
                  </div>
                  <EnemyTactics
                    battle={visibleBattle!}
                    boss={encounter.boss}
                    playing={!!presentation}
                  />
                  <div className="battle-log panel">
                    <div className="panel-label">
                      <ScrollText size={16} /> บันทึกการต่อสู้{" "}
                      <span>TURN {battle.turn}</span>
                    </div>
                    <div
                      className="log-lines"
                      role="log"
                      aria-label="บันทึกการต่อสู้"
                    >
                      {battle.log.slice(-6).map((line, i) => (
                        <p key={`${i}-${line}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                  <details className="api-details">
                    <summary>
                      <Code2 size={16} /> คู่มือคำสั่ง{" "}
                      <ChevronRight size={15} />
                    </summary>
                    <div className="api-grid">
                      {API_GUIDE.map(([name, description]) => (
                        <div key={name}>
                          <code>{name}</code>
                          <span>{description}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
                <div className="coding-column">
                  <div className="mission">
                    <span className="eyebrow">
                      <Flag size={14} /> ภารกิจของห้องนี้
                    </span>
                    <h2>{encounter.prompt}</h2>
                    {encounter.contract.sourceExercise && (
                      <p className="mission-combat-guidance">
                        {SOURCE_COMBAT_GUIDANCE}
                      </p>
                    )}
                    <div className="mission-footer">
                      <span>โค้ดผิด? ลองใหม่ได้ ไม่เสียเทิร์นหรือดาว</span>
                      <button
                        ref={hintTrigger}
                        onClick={() => showHint(hint === 3 ? 0 : hint + 1)}
                        className="hint-button"
                        aria-expanded={hint > 0}
                        aria-controls={
                          hint > 0 ? "lesson-hint-panel" : undefined
                        }
                      >
                        <HelpCircle size={16} />
                        {hint === 3
                          ? "ซ่อนคำใบ้"
                          : hint
                            ? "คำใบ้ถัดไป"
                            : "ขอคำใบ้"}
                      </button>
                    </div>
                    {hint > 0 && (
                      <LessonHints
                        key={encounter.id}
                        encounter={encounter}
                        level={hint}
                        onLevelChange={showHint}
                      />
                    )}
                    {battle.status === "active" && (
                      <StarRules maxHp={battle.maxHp} />
                    )}
                  </div>
                  <div className="code-workspace">
                    {Editor ? (
                      <Editor
                        ref={editor}
                        value={code}
                        onChange={setCode}
                        onOffenseChange={(mode, skill) => {
                          setOffenseMode(mode);
                          setOffenseSkill(skill);
                        }}
                        onRun={() => void run()}
                        onSkills={(trigger) => openOverlay("skills", trigger)}
                        skillsDisabled={!!presentation || conflict}
                        size={save.settings.editorSize}
                        disabled={busy || battle.status !== "active"}
                        diagnostic={result?.diagnostic}
                        execution={execution}
                      />
                    ) : (
                      <ToolLoading failed={toolsFailed} onRetry={retryTools} />
                    )}
                    <div
                      className="execution-bar"
                      onPointerDown={(event) => {
                        const button = (event.target as Element).closest(
                          "button",
                        );
                        if (!button) return;
                        // Safari does not focus buttons on pointer down. Keep this
                        // workspace focused so its sticky bar cannot jump before click.
                        event.preventDefault();
                        button.focus({ preventScroll: true });
                      }}
                    >
                      <div className="execution-budget">
                        <span className="ap-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                        <b>3 AP ต่อเทิร์น</b>
                        <small>attack 1 · defend 1 · skill 2</small>
                      </div>
                      <button
                        type="button"
                        className="btn secondary check-button"
                        onClick={() => void run("preview")}
                        disabled={
                          !runtimeReady ||
                          !modules ||
                          !!presentation ||
                          battle.status !== "active" ||
                          conflict
                        }
                        title="ทดลองรันโค้ดและดูผล โดยยังไม่เสียเทิร์น"
                      >
                        <Eye size={17} />
                        ตรวจแผน
                      </button>
                      {busy ? (
                        <button
                          className="btn stop"
                          onClick={() => {
                            runtime.cancel();
                            runtime.start();
                          }}
                        >
                          <Square size={16} /> หยุด
                        </button>
                      ) : (
                        <button
                          className="btn primary run-button"
                          onClick={() => void run()}
                          disabled={
                            !runtimeReady ||
                            !modules ||
                            !!presentation ||
                            battle.status !== "active" ||
                            conflict
                          }
                        >
                          <Play size={17} />
                          {!modules
                            ? "เตรียมเครื่องมือ…"
                            : runtimeReady
                              ? "รันโค้ด"
                              : "เตรียม Python…"}
                        </button>
                      )}
                    </div>
                  </div>
                  <PythonFeedback
                    result={result}
                    ready={runtimeReady}
                    reveal={!overlay}
                    onJump={(line) => editor.current?.focusLine(line)}
                  />
                  {battle.status !== "active" && !presentation && (
                    <BattleResult
                      key={`${encounter.id}-${battle.status}`}
                      battle={battle}
                      encounter={encounter}
                      bestStars={save.stars[encounter.id] ?? 1}
                      reveal={!overlay}
                      onAdvance={() =>
                        battle.status === "won" && encounter.id === "6-4"
                          ? navigate("map")
                          : battle.status === "lost"
                            ? begin(encounter.id)
                            : begin(
                                ENCOUNTERS[
                                  Math.min(
                                    ENCOUNTERS.findIndex(
                                      (e) => e.id === encounter.id,
                                    ) + 1,
                                    23,
                                  )
                                ].id,
                              )
                      }
                      onMap={() => navigate("map")}
                      onKeepCode={() =>
                        mutate((s) => ({
                          ...s,
                          notes: (
                            s.notes +
                            "\n\n# " +
                            encounter.title +
                            "\n" +
                            code
                          ).slice(-32000),
                        }))
                      }
                    />
                  )}
                  {forecast &&
                    forecast.before === battle &&
                    forecast.source === code && (
                      <TurnPreview
                        forecast={forecast}
                        onRun={() => void run()}
                        onEdit={() => editor.current?.focusLine()}
                        onClose={() => setForecast(null)}
                        disabled={!runtimeReady || !!presentation || conflict}
                      />
                    )}
                  <section
                    className="player-controls"
                    aria-label="สกิลฝั่งผู้เล่น"
                  >
                    <div className="tactics-heading">
                      <div>
                        <span>
                          <Sparkles size={15} />
                          สกิลผู้เล่น
                        </span>
                        <small className="tactics-ap">3 AP / เทิร์น</small>
                      </div>
                      <button
                        type="button"
                        className="player-skill-details"
                        aria-label="รายละเอียดสกิล"
                        title="รายละเอียดสกิล"
                        onClick={(event) =>
                          openOverlay("skills", event.currentTarget)
                        }
                        disabled={
                          busy ||
                          !!presentation ||
                          battle.status !== "active" ||
                          conflict
                        }
                      >
                        <BookOpen size={17} />
                      </button>
                    </div>
                    <div className="resources">
                      <span>
                        <Sparkles size={16} /> MP{" "}
                        <b>
                          {visibleBattle!.mp}/{battle.maxMp}
                        </b>
                      </span>
                      <span>
                        <Heart size={16} /> ยา <b>{visibleBattle!.potions}</b>
                      </span>
                      <span>
                        พลังโจมตี <b>{battle.attack}</b>
                      </span>
                    </div>
                    <PlayerEffects battle={visibleBattle!} />
                    <SkillBook
                      key={encounter.id}
                      variant="player"
                      battle={visibleBattle!}
                      onInsert={insertSkill}
                      offenseMode={offenseMode}
                      offenseSkill={offenseSkill}
                      onChooseOffense={chooseOffense}
                      disabled={busy || !modules || !!presentation || conflict}
                    />
                  </section>

                  <RuntimeBadge />
                </div>
              </div>
            </section>
          )}
          <footer className="footer">
            <span>
              RUNE<span>CODE</span>
              <i />
              เรียนรู้ทีละบรรทัด เติบโตทีละก้าว
            </span>
            <span>
              {saveStatus} <span className="status-dot" />
            </span>
          </footer>
        </main>
      </div>
      <div className="toast" role="status" aria-live="polite">
        {notice}
      </div>
      <input
        type="file"
        accept="application/json,.json"
        ref={fileInput}
        hidden
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {overlay && (
        <Modal
          title={
            {
              shop: "ร้านค้านักเดินทาง",
              journal: "สมุดของนักโค้ด",
              settings: "ตั้งค่าและบันทึก",
              help: "เริ่มต้นการผจญภัย",
              reset: "เริ่มการเดินทางใหม่",
              import: "นำเข้าบันทึกการผจญภัย",
              skills: "สกิลและคำสั่ง",
            }[overlay]
          }
          onClose={() => setOverlay(null)}
        >
          {overlay === "skills" && battle && (
            <SkillBook
              battle={battle}
              onInsert={insertSkill}
              offenseMode={offenseMode}
              offenseSkill={offenseSkill}
              onChooseOffense={chooseOffense}
              disabled={busy || !!presentation || conflict}
            />
          )}
          {overlay === "shop" && (
            <>
              <p className="muted">
                อุปกรณ์ที่ช่วยให้มั่นใจขึ้น ทุกห้องผ่านได้โดยไม่ต้องซื้อของ
              </p>
              <div className="shop-wallet">
                <Coins /> {save.gold} เหรียญ
              </div>
              <div className="shop-items">
                {(["potion", "attack", "hp"] as const).map((item) => {
                  const level =
                      item === "potion" ? save.potions : save.upgrades[item],
                    cost = item === "potion" ? 25 : 60 + level * 25,
                    cap = item === "potion" ? 9 : 5;
                  return (
                    <div className="shop-item" key={item}>
                      <span className="shop-icon">
                        {item === "potion" ? (
                          <Heart />
                        ) : item === "attack" ? (
                          <Swords />
                        ) : (
                          <Shield />
                        )}
                      </span>
                      <div>
                        <h3>
                          {item === "potion"
                            ? "ยาฟื้นพลัง"
                            : item === "attack"
                              ? "ลับคมอาวุธ"
                              : "เครื่องรางหัวใจ"}
                        </h3>
                        <p>
                          {item === "potion"
                            ? `ฟื้น 35 HP • มี ${save.potions} ขวด • ยาที่ซื้อพร้อมใช้เมื่อเริ่มห้องใหม่`
                            : `ระดับ ${level}/5 • ${item === "attack" ? "ATK +2" : "HP สูงสุด +12"} เมื่อเริ่มห้องใหม่`}
                        </p>
                      </div>
                      <button
                        className="btn secondary small"
                        disabled={
                          !save.hero ||
                          save.gold < cost ||
                          level >= cap ||
                          conflict
                        }
                        onClick={() => {
                          const p = purchase(saveRef.current, item);
                          if (p.error) {
                            say(p.error);
                            return;
                          }
                          mutate(() => p.save);
                          say("ซื้อสำเร็จ อุปกรณ์พร้อมสำหรับห้องถัดไป");
                        }}
                      >
                        {level >= cap ? "เต็มแล้ว" : `${cost} เหรียญ`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {overlay === "journal" && (
            <LearningJournal
              save={save}
              currentChapter={chapter}
              onNotesChange={(notes) => mutate((s) => ({ ...s, notes }))}
            />
          )}
          {overlay === "settings" && (
            <>
              <div className="settings-row">
                <div>
                  <b>เสียงเอฟเฟกต์</b>
                  <p>เสียงโจมตีและสกิลตามจังหวะต่อสู้ ปิดได้ทุกเมื่อ</p>
                </div>
                <button
                  className="btn secondary small"
                  aria-pressed={save.settings.sound}
                  onClick={toggleSound}
                >
                  {save.settings.sound ? "เปิด" : "ปิด"}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <b>ลดการเคลื่อนไหว</b>
                  <p>ปิดการลอยและลดเอฟเฟกต์ต่อสู้</p>
                </div>
                <button
                  className="btn secondary small"
                  aria-pressed={save.settings.reducedMotion}
                  onClick={() =>
                    mutate((s) => ({
                      ...s,
                      settings: {
                        ...s.settings,
                        reducedMotion: !s.settings.reducedMotion,
                      },
                    }))
                  }
                >
                  {save.settings.reducedMotion ? "เปิด" : "ปิด"}
                </button>
              </div>
              <div className="settings-row">
                <label htmlFor="font-size">
                  ขนาดตัวอักษรโค้ด: {save.settings.editorSize}px
                </label>
                <input
                  id="font-size"
                  type="range"
                  min="16"
                  max="22"
                  value={save.settings.editorSize}
                  onChange={(e) =>
                    mutate((s) => ({
                      ...s,
                      settings: { ...s.settings, editorSize: +e.target.value },
                    }))
                  }
                />
              </div>
              <div className="settings-save">
                <h3>บันทึกการผจญภัย</h3>
                <p>
                  {saveStatus} ·{" "}
                  {cached
                    ? "พร้อมเล่นออฟไลน์"
                    : "โหมดออฟไลน์พร้อมหลังเปิด production build และเก็บไฟล์ครบ"}
                </p>
                {updateWaiting && (
                  <p>
                    รุ่นใหม่พร้อมแล้ว เล่นต่อได้ตามปกติ
                    เมื่อบันทึกแล้วให้ปิดแท็บเกมทั้งหมดและเปิดใหม่เพื่ออัปเดต
                  </p>
                )}
                <div className="button-row">
                  <button className="btn secondary" onClick={exportSave}>
                    <Download size={17} /> ส่งออกไฟล์
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={17} /> นำเข้าไฟล์
                  </button>
                </div>
                {storageBlocked && (
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setStorageBlocked(false);
                      setBootError("");
                      say("กำลังลองบันทึกอีกครั้ง");
                    }}
                  >
                    ลองบันทึกอีกครั้ง
                  </button>
                )}
              </div>
              <div className="danger-zone">
                <p>เริ่มใหม่จะลบความคืบหน้าบนเครื่องนี้ ควรส่งออกไฟล์ไว้ก่อน</p>
                <button
                  className="btn danger"
                  onClick={() => setOverlay("reset")}
                >
                  เริ่มเกมใหม่
                </button>
              </div>
            </>
          )}
          {overlay === "help" && (
            <>
              <ol className="help-steps">
                <li>
                  <b>อ่านท่าศัตรูและภารกิจ</b>
                  <p>รู้ว่าจะเกิดอะไรขึ้น แล้วเลือกโจมตี ป้องกัน หรือใช้สกิล</p>
                </li>
                <li>
                  <b>เขียน Python ใน main.py</b>
                  <p>แต่ละเทิร์นมี 3 AP ใช้คำใบ้ได้เสมอโดยไม่เสียคะแนน</p>
                </li>
                <li>
                  <b>กดรัน แล้วดูผล</b>
                  <p>
                    โค้ดผิดไม่เสียเทิร์นหรือหักดาว
                    โค้ดที่ผ่านจะกลายเป็นการกระทำจริง
                  </p>
                </li>
                <li>
                  <b>พิชิตและเดินทางต่อ</b>
                  <p>
                    ลด HP ศัตรูจนหมดเพื่อชนะ
                    โค้ดและความคืบหน้าจะบันทึกบนเครื่องนี้
                  </p>
                </li>
              </ol>
              <div className="api-grid">
                {API_GUIDE.map(([n, d]) => (
                  <div key={n}>
                    <code>{n}</code>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
              <button className="btn primary" onClick={() => setOverlay(null)}>
                เข้าใจแล้ว <Check size={17} />
              </button>
            </>
          )}
          {overlay === "reset" && (
            <>
              <p>
                ความคืบหน้า เหรียญ อุปกรณ์
                และสมุดของคุณบนเครื่องนี้จะเริ่มใหม่ทั้งหมด
                ไฟล์ที่ส่งออกไว้จะยังใช้ได้
              </p>
              <div className="button-row">
                <button
                  className="btn secondary"
                  onClick={() => setOverlay("settings")}
                >
                  เก็บการเดินทางเดิมไว้
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    if (conflict) {
                      say(
                        "โหลดบันทึกล่าสุดก่อนเริ่มใหม่ เพื่อป้องกันข้อมูลจากอีกแท็บถูกทับ",
                      );
                      return;
                    }
                    runtime.cancel();
                    mutate(() => freshSave());
                    setStorageBlocked(false);
                    setConflict(false);
                    setBootError("");
                    navigate("intro");
                    runtime.start();
                  }}
                >
                  ยืนยันเริ่มใหม่
                </button>
              </div>
            </>
          )}
          {overlay === "import" && importCandidate && (
            <>
              <p>
                ไฟล์นี้มีความคืบหน้า {importCandidate.completed.length}/24 ห้อง
                และ {importCandidate.gold} เหรียญ
                การนำเข้าจะแทนที่บันทึกปัจจุบัน
              </p>
              <div className="button-row">
                <button
                  className="btn secondary"
                  onClick={() => setOverlay("settings")}
                >
                  ยกเลิก
                </button>
                <button className="btn primary" onClick={acceptImport}>
                  ใช้บันทึกจากไฟล์นี้
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function RuntimeBadge() {
  return (
    <div
      className={`runtime-badge ${runtime.status === "error" ? "failed" : ""}`}
    >
      <span
        className={`status-dot ${runtime.status === "ready" ? "" : "loading"}`}
      />
      <span>{runtime.message}</span>
      {(runtime.status === "error" || runtime.status === "idle") && (
        <button onClick={() => runtime.retry()} aria-label="โหลด Python ใหม่">
          <RefreshCw size={14} /> โหลดใหม่
        </button>
      )}
    </div>
  );
}
function CombatMeter({
  title,
  value,
  max,
  mana,
  enemy = false,
}: {
  title: string;
  value: number;
  max: number;
  mana?: { value: number; max: number };
  enemy?: boolean;
}) {
  return (
    <div className={`combat-meter ${enemy ? "enemy" : ""}`}>
      <div>
        <b>{title}</b>
        <span>
          {value}
          <small>/{max}</small>
        </span>
      </div>
      <div
        className="hp-track"
        role="progressbar"
        aria-label={`${title} พลังชีวิต`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <i style={{ width: `${(value / max) * 100}%` }} />
      </div>
      {mana && (
        <div className="mana-meter">
          <p className="mp-reading" aria-hidden="true">
            <Sparkles size={14} />
            <span>MP</span>
            <span className="mp-value">
              {mana.value}
              <small>/{mana.max}</small>
            </span>
          </p>
          <div
            className="mp-track"
            role="meter"
            aria-label={`${title} พลังเวท MP`}
            aria-valuenow={mana.value}
            aria-valuemin={0}
            aria-valuemax={mana.max}
            aria-valuetext={`${mana.value} จาก ${mana.max} MP`}
          >
            <i
              style={{
                width: `${mana.max > 0 ? (mana.value / mana.max) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
