import type { LessonContract, RunContext, RunResult } from "../types";
export type RuntimeStatus = "idle" | "loading" | "ready" | "running" | "error";
export class PythonRuntime {
  private worker: Worker | null = null;
  private sequence = 0;
  private resolveRun: ((r: RunResult) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  status: RuntimeStatus = "idle";
  message = "Python ยังไม่เริ่มโหลด";
  onStatus: () => void = () => {};
  private set(status: RuntimeStatus, message: string) {
    this.status = status;
    this.message = message;
    this.onStatus();
  }
  start() {
    if (this.worker) return;
    this.set("loading", "กำลังเตรียม Python ครั้งแรก อาจใช้เวลาสักครู่");
    this.worker = new Worker(new URL("./python.worker.ts", import.meta.url), {
      type: "module",
    });
    this.loadTimer = setTimeout(
      () => this.fail("โหลด Python นานเกินไป ตรวจเครือข่ายแล้วลองอีกครั้ง"),
      // The self-hosted first download may be slow even with precaching deferred.
      // This startup allowance is independent of the 3-second execution timer.
      240000,
    );
    this.worker.onmessage = ({ data }) => {
      if (data.type === "ready") {
        clearTimeout(this.loadTimer);
        this.set("ready", "Python พร้อมแล้ว");
      }
      if (data.type === "init-error")
        this.fail("โหลด Python ไม่สำเร็จ ตรวจเครือข่ายแล้วลองใหม่");
      if (data.type === "result" && data.id === this.sequence) {
        clearTimeout(this.timer);
        const done = this.resolveRun;
        this.resolveRun = null;
        this.set("ready", "Python พร้อมแล้ว");
        done?.(data.result);
      }
    };
    this.worker.onerror = () =>
      this.fail("ตัวรัน Python หยุดทำงาน กดโหลดใหม่เพื่อลองอีกครั้ง");
  }
  private fail(message: string) {
    clearTimeout(this.timer);
    clearTimeout(this.loadTimer);
    this.worker?.terminate();
    this.worker = null;
    const done = this.resolveRun;
    this.resolveRun = null;
    this.set("error", message);
    done?.({
      ok: false,
      actions: [],
      stdout: [],
      diagnostic: { kind: "RuntimeError", message },
    });
  }
  run(
    code: string,
    contract: LessonContract,
    context: RunContext,
  ): Promise<RunResult> {
    if (this.status !== "ready")
      return Promise.resolve({
        ok: false,
        actions: [],
        stdout: [],
        diagnostic: {
          kind: "Busy",
          message: "รอให้ Python พร้อมก่อน แล้วกดรันอีกครั้ง",
        },
      });
    this.set("running", "กำลังรันโค้ด…");
    const id = ++this.sequence;
    return new Promise((resolve) => {
      this.resolveRun = resolve;
      this.timer = setTimeout(() => {
        this.cancel(
          "Timeout",
          "โค้ดทำงานเกิน 3 วินาที ลองตรวจเงื่อนไขหยุดของลูป",
        );
        this.start();
      }, 3000);
      this.worker!.postMessage({
        type: "run",
        id,
        payload: { code, contract, context },
      });
    });
  }
  cancel(kind = "Cancelled", message = "หยุดแล้ว โค้ดและเทิร์นของคุณยังอยู่") {
    this.sequence++;
    clearTimeout(this.timer);
    clearTimeout(this.loadTimer);
    this.worker?.terminate();
    this.worker = null;
    const done = this.resolveRun;
    this.resolveRun = null;
    this.set("idle", message);
    done?.({
      ok: false,
      actions: [],
      stdout: [],
      diagnostic: { kind, message },
    });
  }
  retry() {
    this.cancel();
    this.start();
  }
}
