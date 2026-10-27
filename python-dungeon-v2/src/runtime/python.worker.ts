import type { PyodideInterface } from "pyodide";
import { PYTHON_VALIDATOR } from "./validator";
let runtime: PyodideInterface;
const ready = (async () => {
  self.postMessage({
    type: "loading",
    message: "กำลังเตรียมเครื่องมือ Python…",
  });
  const indexURL = new URL(
    `${import.meta.env.BASE_URL}python/`,
    self.location.origin,
  ).href;
  const { loadPyodide } = await import(
    /* @vite-ignore */ `${indexURL}pyodide.mjs`
  );
  runtime = await loadPyodide({ indexURL });
  self.postMessage({ type: "ready" });
})();
ready.catch((error) =>
  self.postMessage({ type: "init-error", message: String(error) }),
);
self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  try {
    await ready;
    runtime.globals.set("_payload", JSON.stringify(data.payload));
    const json = await runtime.runPythonAsync(PYTHON_VALIDATOR);
    self.postMessage({ type: "result", id: data.id, result: JSON.parse(json) });
  } catch (error) {
    self.postMessage({
      type: "result",
      id: data.id,
      result: {
        ok: false,
        actions: [],
        stdout: [],
        diagnostic: {
          kind: "RuntimeError",
          message: `ตัวรัน Python ขัดข้อง ลองโหลดใหม่ · ${String(error).slice(0, 100)}`,
        },
      },
    });
  }
};
