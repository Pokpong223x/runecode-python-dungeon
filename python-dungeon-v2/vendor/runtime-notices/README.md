# Pinned runtime notice sources

These unmodified texts accompany Pyodide 314.0.7, whose installed runtime lock identifies CPython 3.14.2 and Emscripten 5.0.3. `sources.json` records each official version-tag URL, byte count and SHA-256. The one-time copies were downloaded from those upstream sources; install/build uses only local files and verifies their hashes.

`scripts/build-notices.mjs` combines these texts with the installed production dependency licenses, Chakra Petch's full OFL notice and the Matter.js notice shipped in Phaser. It generates `public/THIRD-PARTY-NOTICES.txt` before Vite copies public assets. The complete file ships with the static build and is included in its verified offline cache.

When deliberately changing the pinned runtime, refresh these texts and source metadata for the actual new versions. The generator rejects a version or hash mismatch rather than silently attributing another release. Original RuneCode code and artwork retain their existing ownership; this folder adds third-party notices only.
