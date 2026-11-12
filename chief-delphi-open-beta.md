**Title:** SysMod Studio Open Beta: free tool to plan, wire, check and prove your robot's design (testers wanted)

**Category:** Technical → Programming (or General Forum)
**Tags:** software, electrical, systems-engineering

---

Hi Chief Delphi,

I'm a researcher in the ASSIST Laboratory at Florida Tech. As part of a workforce-development project under NASA's University Leadership Initiative (TRANSCEND), we've been building **SysMod Studio**, a free, open-source desktop app that brings the systems-engineering tools used in aerospace to FRC teams.

It's now in **open beta**, and we'd really value feedback from students, mentors and CSAs before the 2027 season.

## What it does

SysMod Studio follows your robot from idea to code:

| Step | What you do | What you get |
|---|---|---|
| **Plan** | Fill in a design brief, sort requirements with MoSCoW, score concepts in a decision matrix | A written design rationale for your notebook / judges |
| **Wire** | Drag FRC devices onto a diagram (SystemCore or roboRIO, PDH, motor controllers, sensors, pneumatics, radio) and connect power, CAN, DIO/PWM and Ethernet | An electrical architecture that blocks impossible wiring (e.g. power into a CAN port) |
| **Check** | Watch the Problems and Hardware panels update live | FRC rule checks, CAN bus load estimates, current roll-up per PDH channel and breaker, duplicate CAN IDs, port conflicts |
| **Prove** | Click **Prove contracts** | Formal proofs (AADL/AGREE, checked by the bundled JKind model checker) that your design meets its requirements, plus a printable **Judge Report** that explains each proof in plain language |
| **Behave** | Build robot behavior with drag-and-drop blocks, grouped by subsystem | A Soar agent (`agent.soar`) and proofs about it, like "the intake and shooter never run together" or "the arm only moves in teleop" |
| **Export** | One click | WPILib Java and RobotPy code (REVLib, Phoenix 6, current limits from your diagram), a printable schematic and bill of materials, and AADL models |

No Java, Python or other installs needed. The proof engine is bundled.

## Download

- **Windows 10/11:** `sysmod-studio-<version>-setup.exe`
- **Linux:** `sysmod-studio-<version>.AppImage`

👉 **https://github.com/Suave101/SysMod/releases**

📖 Docs: <DOCS LINK>

The Windows installer isn't code-signed yet, so SmartScreen will say "Windows protected your PC". Click **More info → Run anyway**. School-managed laptops may block it. macOS isn't packaged yet, but you can run it from source (see the installation guide).

## What we'd like you to test

1. **Wire your 2026 robot** (or your 2027 plan on SystemCore). Does the diagram match how you'd really wire it? Are devices or ports missing?
2. **Rule and hardware checks.** Did it flag something that's actually legal, or miss something that isn't? CSAs and electrical leads, we especially want your eyes here.
3. **Generated code.** Does the Java/Python look like something your programmers would start from? What would you change?
4. **Proofs and the Judge Report.** Does the explanation make sense to a student who's never heard of formal verification? Would you show it to a judge?
5. **Behavior blocks.** Can you describe your robot's autonomous or teleop logic with them? Where did you get stuck?
6. **Anything confusing.** "I didn't know what this button did" is useful feedback.

## Known limitations (please read before reporting)

- **Save often, outside the app.** Your planning pages are saved automatically, but the **diagram, contracts and behavior are not saved to disk yet**. Behavior blocks can be saved by hand with **Save blocks**. Persistence is the next thing we're fixing.
- **SystemCore numbers.** We only use SystemCore specs that are published. Power and brownout rules for SystemCore are left out on purpose until they're released after kickoff.
- **Generated code** hasn't been compiled against the real vendor libraries yet. Treat it as a starting point, not a drop-in robot project.
- **Hardware estimates** (CAN frames/s, current draw) are rough, documented constants. They're meant to catch big problems, not replace measurements.
- **The app doesn't run the Soar agent.** Running it on the robot is the next phase, through a separate FRC-Soar bridge.

## How to report

Open an issue at **https://github.com/Suave101/SysMod/issues**, or reply in this thread. Please include:

- the version you installed and your OS
- what you did, what you expected, and what happened
- a screenshot if it helps

Issues are public, so please **don't include personal information** (names, school, contact details). Students, that goes double for you.

## Why we're doing this

Industry engineers use model-based systems engineering and formal verification to make sure aircraft and spacecraft do what they're supposed to. Those tools are usually expensive and hard to learn. We think FRC is a great place to learn the ideas early, on a system students already care about: their robot. Your feedback directly shapes what we build next.

Thanks for trying it out. We'll be reading every reply!

*ASSIST Laboratory, Florida Institute of Technology · NASA ULI TRANSCEND*
