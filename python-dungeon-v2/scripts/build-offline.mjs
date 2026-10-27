import { writeFile } from "node:fs/promises";
import { createAssetManifest, renderServiceWorker } from "./offline-worker.mjs";
const files = await createAssetManifest("dist");
await writeFile("dist/sw.js", renderServiceWorker(files));
console.log("Verified offline cache manifest:", files.length, "files");
