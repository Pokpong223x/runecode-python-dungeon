import { useEffect, useState } from "react";

let sceneRequest: Promise<typeof import("./Scene")> | null = null;
let editorRequest: Promise<typeof import("./Editor")> | null = null;
const loadScene = () =>
  (sceneRequest ??= import("./Scene").catch((error: unknown) => {
    sceneRequest = null;
    throw error;
  }));
const loadEditor = () =>
  (editorRequest ??= import("./Editor").catch((error: unknown) => {
    editorRequest = null;
    throw error;
  }));

function useModule<T>(load: () => Promise<T>, active: boolean) {
  const [module, setModule] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active || module) return;
    let current = true;
    setFailed(false);
    void load().then(
      (loaded) => {
        if (current) setModule(loaded);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [active, module, load]);
  return { module, failed };
}

/** Render the shell first; defer CodeMirror until a room actually opens. */
export function useBattleModules(editorActive: boolean) {
  const scene = useModule(loadScene, true);
  const editor = useModule(loadEditor, editorActive);
  const Scene = scene.module?.Scene;
  const Editor = editor.module?.Editor;
  return {
    Scene,
    modules: Scene && Editor ? { Scene, Editor } : null,
    failed: scene.failed || editor.failed,
  };
}
