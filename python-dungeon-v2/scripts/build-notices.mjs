import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// Install/build reads local, version-pinned sources only; never fetch here.
const root = process.cwd();
const lock = JSON.parse(
  await readFile(resolve(root, "package-lock.json"), "utf8"),
);
const vendorRoot = resolve(root, "vendor/runtime-notices");
const vendor = JSON.parse(
  await readFile(resolve(vendorRoot, "sources.json"), "utf8"),
);
const runtime = JSON.parse(
  await readFile(resolve(root, "node_modules/pyodide/package.json"), "utf8"),
);
const runtimeLock = JSON.parse(
  await readFile(
    resolve(root, "node_modules/pyodide/pyodide-lock.json"),
    "utf8",
  ),
);
if (
  runtime.version !== vendor.pyodide ||
  runtimeLock.info.python !== vendor.python ||
  runtimeLock.info.platform !== vendor.platform
)
  throw new Error(
    "Runtime versions changed: update vendor/runtime-notices before building.",
  );

const pinned = await Promise.all(
  vendor.sources.map(async (source) => {
    if (!/^[a-zA-Z0-9.-]+$/.test(source.file))
      throw new Error("Invalid notice filename");
    const bytes = await readFile(resolve(vendorRoot, source.file));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== source.sha256)
      throw new Error(`Pinned notice changed: ${source.file}`);
    return { ...source, text: bytes.toString("utf8") };
  }),
);
const sections = [];
function section(title, source, text) {
  sections.push(
    `${"=".repeat(76)}\n${title}\n${source}\n${"=".repeat(76)}\n\n${text}`,
  );
}
let packages = 0;
for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b, "en"),
)) {
  if (!location || entry.dev) continue;
  if (
    !location.startsWith("node_modules/") ||
    location.split("/").includes("..")
  )
    throw new Error(`Unexpected package location: ${location}`);
  const folder = resolve(root, location);
  const actual = JSON.parse(
    await readFile(resolve(folder, "package.json"), "utf8"),
  );
  if (actual.version !== entry.version)
    throw new Error(`Installed version differs from lock: ${actual.name}`);
  if (actual.name === "pyodide") {
    const source = pinned.find((item) => item.name === "Pyodide");
    if (!source) throw new Error("Missing pinned Pyodide notice");
    section(
      `${actual.name} ${actual.version} — ${actual.license}`,
      `Source: https://github.com/pyodide/pyodide/tree/${actual.version}\nNotice: ${source.url}\nSHA-256: ${source.sha256}`,
      source.text,
    );
  } else {
    const names = (await readdir(folder))
      .filter((name) => /^(licen[sc]e|copying|notice|ofl)([._-]|$)/i.test(name))
      .sort();
    if (!names.length)
      throw new Error(`No installed notice found: ${actual.name}`);
    for (const name of names)
      section(
        `${actual.name} ${actual.version} — ${actual.license ?? entry.license} — ${name}`,
        `Package: ${entry.resolved}`,
        await readFile(resolve(folder, name), "utf8"),
      );
  }
  packages++;
}
for (const source of pinned.filter((item) => item.name !== "Pyodide")) {
  section(
    `${source.name} ${source.version}`,
    `Source: ${source.url}\nSHA-256: ${source.sha256}`,
    source.text,
  );
}
section(
  "Matter.js notice included with Phaser",
  "Source: node_modules/phaser/src/physics/matter-js/lib/license.js",
  await readFile(
    resolve(root, "node_modules/phaser/src/physics/matter-js/lib/license.js"),
    "utf8",
  ),
);
const text =
  `RuneCode — third-party notices\n\nThis file retains the original notice texts from the locked production dependency graph and the pinned Python runtime sources listed below. Some graph entries support Node or type definitions rather than browser execution. These third-party terms do not assign a license to original RuneCode code or artwork.\n\nPyodide runtime files are copied unchanged from npm pyodide ${runtime.version}. Its upstream source is available at https://github.com/pyodide/pyodide/tree/${runtime.version}.\n\n` +
  sections.join("\n\n") +
  "\n";
await mkdir(resolve(root, "public"), { recursive: true });
await writeFile(resolve(root, "public/THIRD-PARTY-NOTICES.txt"), text);
console.log(
  `Third-party notices: ${packages} locked packages, ${pinned.length} pinned runtime records, ${Buffer.byteLength(text)} bytes`,
);
