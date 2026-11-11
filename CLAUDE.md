# SysMod Studio — context for Claude

SysMod Studio is a free Electron desktop app from the **ASSIST Laboratory at Florida Tech**, built as a workforce-development project under **NASA ULI TRANSCEND**. It teaches FRC (FIRST Robotics Competition) high-school students MBSE and formal verification: plan a robot, wire its electrical architecture, check it against FRC rules, prove properties with AADL/AGREE, and generate robot code and a Soar agent.

The repo owner (GitHub `Suave101`) is a researcher in the ASSIST Lab, **not** an FRC student. Write outreach and docs from that perspective.

## Working agreements
- **Never commit or push unless asked.** The owner writes commit messages themselves. Leave changes staged/unstaged and summarize them so they can write the message.
- If you do commit: end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Verify in the real app (see "Testing in the app") and with the test scripts before calling something done. Report what wasn't verified.
- Don't guess unpublished hardware numbers (e.g. SystemCore power/brownout). Leave them out and document why.
- Docs style: plain, short sentences; tables for comparisons; explain for students and judges who don't know AADL.

## Repo layout
- `sysmod-studio/` — the Electron app (electron-vite, React 19, TypeScript, Tailwind 4 + daisyUI, zustand, @xyflow/react, Monaco, Blockly 13).
- `docs/` + `mkdocs.yml` + `.readthedocs.yaml` + `docs/requirements.txt` — MkDocs site on Read the Docs. `docs/img/logo.svg`, `favicon.ico`.
- `.github/workflows/ci.yml` — Windows + Ubuntu: npm ci, `test:hardware`, (Linux) download Soar 9.6.5 → `test:behavior`, `build:jkind -- --rebuild` (JDK 11), `test:proofs`, electron-vite build.
- `.github/workflows/release.yml` — on `v*` tag (or manual run with a tag): builds Windows NSIS + Linux AppImage on each OS, then one job publishes a **published** GitHub Release with `--generate-notes`; tags with `-suffix` are prereleases; existing release → files replaced. v0.1.0 is published.
- `SoarBlocks/` — the original standalone SoarBlocks repo (`Suave101/SoarBlocks`), **gitignored**. Its code was ported into the app (see Behavior). History was not merged.
- `site/` — old built docs output (tracked, stale).

## App architecture (`sysmod-studio/src`)
- `main/index.ts` — window, IPC: `save-local-json`/`load-local-json` (userData/`workspace-data.json`), `save-java-file` (legacy), `save-text-file` (generic save dialog). Linux window icon from `resources/icon.png?asset`.
- `main/jkind.ts` — `run-jkind` IPC: runs bundled `resources/jkind/runtime/bin/java` + `jkind.jar` (`-jkind -xml_to_stdout -ivc`). `resources/jkind/` is gitignored; built by `npm run build:jkind` (needs JDK 11 to compile; jlink trims a runtime so students need no Java).
- `preload/index.ts` — `window.electronAPI` (saveData/loadData) and `window.sysmodAPI` (saveJavaFile, saveTextFile, runJKind). Renderer always guards with `window.sysmodAPI?.…`.
- `renderer/src/App.tsx` — HashRouter: `/design-brief` → `/moscow` → `/brainstorming` → `/architecture`. Planning pages share one JSON doc via load/merge/save (DesignBrief's save does NOT merge — known bug).
- `views/ArchitectureCanvas.tsx` — VS Code–style workbench shell: activity bar (Components, Model & Contracts, Behavior, Export & Project), side bar, editor tabs (`diagram`, `judges`, `behavior`, `file:aadl|python|java|soar`, `contract:<scope>`), bottom panel (Problems, Hardware, Proofs), status bar. Ctrl+B / Ctrl+J. Diagram stays mounted; other tabs overlay with `absolute inset-0 z-10 bg-slate-950`.
- `views/workbench/useWorkbenchModel.ts` — single derived model: contracts, aadl, hardware analysis, rule report, Lustre program, `generated` {aadl, python, java, soar}, proof runner (results, explained proofs, staleness).
- `views/store/useRobotStore.ts` — zustand: nodes, edges, customContracts, behaviorBlocks, updateNodeData, `FRC_DEVICE_DEFAULTS` (palette catalog with categories/costs), onConnect rules (PDH channel allocation, radio port rules). In-memory only: diagram/contracts/behavior are **not persisted to disk yet**.
- Subsystems: `utils/subsystems.ts` — labeled frames on the diagram (`deviceType: 'Subsystem'`, React Flow type `SubsystemNode`, category `'Subsystem'`); a device is in a subsystem via React Flow `parentId` (position then relative to the frame; frames are kept first in `nodes`). `subsystemGroups(nodes, behaviorBlocks)` gives label, Soar `attribute` (`subsystemAttribute` in `behavior/soarNames.ts`), unique Java/Python class + field names, `memberIds`, and `commands` (values the Soar agent sets it to, from `subsystemCommands`, which walks Blockly JSON without loading Blockly). Store: `addSubsystem`, `renameSubsystem` (also rewrites behavior blocks via `renameInBehavior`), `setDeviceSubsystem`; deleting a frame releases its devices at the same screen spot. `DiagramEditor.onNodeDragStop` sets membership by the dragged device's center. `useWorkbenchModel` filters frames out of `model.nodes` (so rules/contracts/proofs/BOM never see them) and exposes `model.subsystems`. Java/Python generators emit one `SubsystemBase` / `commands2.Subsystem` class per frame with a `setState`/`set_state` case per Soar command; AADL only adds comments (hierarchy deliberately not modeled, so proofs are unchanged). No built-in claw/arm/drive anymore; the Soar device list is frames + diagram devices only.
- `views/components/` — `SubsystemNode` (frame with inline rename, NodeResizer, Soar commands), `StandardNode`, `ControlHubNode` (PDH, radio, breaker, CANivore, Pneumatic Hub, SystemCore, roboRIO, NetworkSwitch), `NodeFields` (editable CAN ID / DIO / PWM / current limit on nodes), `ProcessTimeline` (with logo), `PdfPreviewModal`.
- `views/utils/`:
  - `aadlGenerator.ts` — AADL + shared port vocabulary: `DEVICE_PORTS`, `getDevicePorts`, `getWireFamily`, `WIRE_VALUE_TYPES`, `groupWiresByNetwork` (treats `can-0..4` controller ports as separate bus roots), `toAadlIdentifier`.
  - `controllers.ts` — `CONTROLLERS` spec for SystemCore (default, 2027+: CAN 0–4, 6 shared Smart I/O 0–5, 4 USB, 2 I2C, no MXP) and roboRIO (2026 and earlier). `findController`.
  - `connectionRules.ts` — `connectionProblem`: blocks mismatched wire families (e.g. power→CAN), self-wires, and Ethernet capacity (1 cable per port; NetworkSwitch `eth-out` takes 4). Used by React Flow `isValidConnection`, `onConnectEnd` message, and the store.
  - `systemVerifier.ts` — FRC rule checks (Rules 1–15) for either controller; merges hardware issues.
  - `hardwareValidation.ts` — Phase 2 engine: CAN load per bus (frames/s estimates), current roll-up per PDH channel/regulator/main breaker, duplicate/out-of-range CAN IDs, DIO/PWM/Smart I/O, PDH channels. All estimates are named constants at the top.
  - `codeGenerators.ts` (Java) / `pythonGenerator.ts` — WPILib Java and RobotPy, REVLib 2025 API, Phoenix 6 supply current limits and SPARK smart current limits from each node's `currentLimit`; subsystem classes (see Subsystems); solenoids/compressor use `PneumaticsModuleType.REVPH` constructors. Not yet compiled against real vendor libs.
  - `monacoLanguages.ts` — Monaco `beforeMonacoMount` (aadl, agree, soar languages; `sysmod-dark` theme), `EDITOR_OPTIONS`.
  - `agree/` — `frcContracts.ts` (standard FRC contracts; SystemCore has PWM-range guarantee only, no brownout), `agreeParser.ts`, `lustreGenerator.ts` (facts + `--%IVC`), `jkindResults.ts`, `proofExplainer.ts` (two-column proofs from IVC: substitution / bounds / solver), `proofNotation.ts`, `judgeReport.tsx` (printable Judge Report HTML).
  - `pdfGenerator.ts` — schematic/BOM HTML.
- `views/behavior/` — Soar behavior editor (port from SoarBlocks is complete; block type names unchanged): `blocks.ts` (blocks + categorized toolbox, `setDeviceOptions`; `DeviceField` keeps unknown devices as "(not on diagram)"; legacy `soar_preference` defined but not in toolbox, generates nothing), `soarGenerator.ts` (`generateSoar(state)`, uses `^io.input-link` / `^io.output-link`, `soarName`, `soarValue`), `robotDevices.ts` (`behaviorDevices(devices, subsystemGroups)`: frames then diagram devices; `useTeamSubsystems` only feeds the "Add from Brainstorming" button; `exampleBehavior`), `soarNames.ts` (`soarName`, `soarValue`, `subsystemAttribute`, Blockly-free), `blockFiles.ts` (`readBlocksFile` accepts Blockly JSON or XML and moves SoarBlocks preference blocks onto Operator priorities; `writeBlocksFile`). UI in `workbench/BehaviorEditor.tsx` (Load example, Open/Save blocks via a file input and `saveGeneratedFile`, collapse + comments on). Blockly media served from `renderer/public/blockly-media/` (CSP blocks the CDN).
- Branding: `build/logo.svg` is the master; `npm run build:icons` (Electron render) writes build/icon.png/.ico/.icns, resources/icon.png, renderer assets/logo.svg, docs/img.

## Commands (run in `sysmod-studio/`)
- `npm run dev` — app. `npx electron-vite build` — production build.
- `npx tsc --noEmit -p tsconfig.web.json --composite false` — known pre-existing errors: Brainstorming `DollarSign`, `Versions.tsx` (a ControlHubNode `edges` one may also appear). Anything else is new.
- `npm run test:hardware` (50 checks, no Java), `npm run test:proofs` (needs `resources/jkind/`), `npm run test:behavior` (generator checks; real Soar if `SOAR_HOME` (Linux) or `SOAR_WSL_HOME` set).
- Local real-Soar on Windows: `$env:SOAR_WSL_HOME='/mnt/d/Downloads/SoarSuite_9.6.5-Multiplatform/bin'` (WSL distro `Debian`). Soar CLI runs only the first piped command, so source one file per process.

## Environment quirks (Windows dev machine)
- PowerShell is the working shell; the Bash tool can't fork. PowerShell 5.1: no `&&`; `R`/`Rp` are aliases (avoid as function names); `.NET` file calls resolve relative to the *process* cwd — use `$PWD\file`. Files may be CRLF; normalize when doing string replaces. Prefer the Edit tool for exact edits; PowerShell string escaping of `${…}` template literals is error-prone.
- Java on PATH is 8; JDK 24 at `C:\Program Files\JDK\OpenJDK-24`. Python not installed. `gh` not installed.
- Leftover dev servers can take port 5173 → new one uses 5174; match `localhost:517\d`.

## Testing in the app
Start `npx electron-vite dev --remoteDebuggingPort 9333` in the background, then drive it over CDP from a Node script (`fetch http://127.0.0.1:9333/json/list`, `Runtime.evaluate`, `Page.captureScreenshot`, `Input.dispatchMouseEvent` for real drags). Import the store in-page with `await import('/src/views/store/useRobotStore.ts')`. The first load after new deps can reload mid-script (Vite optimize) — retry. Stop the server afterwards.

## Roadmap / open items
- Phase 1 (done), Phase 2 Hardware Validation (done), Phase 3 Soar bridge: SoarBlocks port **done** (Behavior editor, `agent.soar`, block file open/save). The app does **not run** the agent; don't add a run button, console, or WASM/native Soar runtime. Running Soar on the roboRIO / SystemCore is **Phase 4**. (SoarBlocks' `soar_bridge.cpp`/`build.sh` WASM attempt was never finished and was intentionally not ported.)
- After FRC kickoff (Jan 9, 2027): SystemCore power rules, brownout threshold, price; WPILib 2027 code generation.
- Persist diagram/contracts/behavior to disk (behavior can be saved by hand with Save blocks, but nothing autosaves); fix DesignBrief save not merging; brainstorming budget isn't used on the Architecture page; `appId` is still `com.electron.app` (change before wide release); installers unsigned (SmartScreen warning).
- Docs pages: getting-started/installation, hardware-validation, robot-behavior, verification/* (what-is-aadl, what-is-agree, aadl-and-agree, aadl-agree-for-frc, judge-report, agree-without-osate).
