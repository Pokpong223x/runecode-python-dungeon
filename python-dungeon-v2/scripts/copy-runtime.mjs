import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const source = resolve("node_modules/pyodide"),
  dest = resolve("public/python");
await mkdir(dest, { recursive: true });
for (const name of await readdir(source))
  if (/\.(mjs|js|wasm|zip|json)$/.test(name) && !name.includes("package"))
    await cp(resolve(source, name), resolve(dest, name));
console.log("Self-hosted Pyodide 314.0.7 copied to public/python");
