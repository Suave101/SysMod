# Showing judges your proofs

The **Judge Report** turns your proof results into a handout for judges and mentors who have never heard of AADL or AGREE. It explains, in plain language, what is proved about your robot's electrical design and shows a step-by-step mathematical proof of each property.

## Opening it

On the Architecture page, do either of these:

- Select **Export & Project** in the activity bar, then **Judge report (proofs)**.
- In the **Proofs** panel, select **Judge report**.

The report opens as an editor tab. If you haven't proved anything yet, select **Prove and build the report**.

| Button | What it does |
|---|---|
| **Prove again** | Re-runs the proofs. Use it after changing the diagram or a contract. The toolbar warns you when the report is out of date. |
| **Print / Save PDF** | Prints the report, or saves it as a PDF from the print dialog |
| **Save HTML** | Saves the report as a single web page you can open on any computer |

The cover shows your team number and name from the Design Brief.

## What's in the report

1. **Testing vs. proving, in one minute.** A short explanation for readers who don't know formal methods, and how to read the math.
2. **What we proved.** A table of every proved property, with the part it's about and the proof method.
3. **Not proved yet.** Any property that failed or timed out, listed honestly. Judges tend to respect a team that knows where its design still needs work.
4. **The proofs.** One section per property, described below.
5. **Wiring rule checks.** A summary of the FRC wiring rules from the **Problems** panel.
6. **What a proof does and doesn't mean.** The limits of the method, in plain language.

### Anatomy of a proof

Each proof is a two-column proof, the same format as a geometry proof:

- **Why it matters:** one or two sentences a student can say out loud.
- **Theorem:** the property in math notation. For example, `0 ≤ kraken6.pwr_12v_in(t) ≤ 16` means "at every moment *t*, the Kraken's supply is between 0 V and 16 V".
- **Steps:** numbered statements, each with a reason. A reason is a wire on your diagram, a promise from a component's contract, or a step that follows from earlier lines.
- **∎** closes the proof, and a symbols list explains every name used.

For example, the proof that a motor never sees more than 16 V follows the power from the motor back to the battery:

| # | Statement | Reason |
|---|---|---|
| 1 | kraken6.pwr_12v_in(t) = pdh3.pwr_high_out(t) | Wire on our diagram |
| 2 | pdh3.pwr_high_out(t) ≤ pdh3.pwr_12v_in(t) | Promise by the REV PDH, which holds because Proof 1 shows the PDH's own supply is in range |
| 3 | pdh3.pwr_12v_in(t) = breaker2.pwr_pdh_out(t) | Wire on our diagram |
| 4 | breaker2.pwr_pdh_out(t) = breaker2.pwr_battery_in(t) ∨ breaker2.pwr_pdh_out(t) = 0 | Promise by the main breaker: it passes voltage through, or is tripped |
| 5 | breaker2.pwr_battery_in(t) = battery1.pwr_battery_out(t) | Wire on our diagram |
| 6 | battery1.pwr_battery_out(t) ≤ 14.4 | Promise by the battery |
| 7 | kraken6.pwr_12v_in(t) ≤ 14.4 | Lines 1–6, taking the larger case of line 4 |
| 8 | 14.4 < 16 | Arithmetic |
| 9 | kraken6.pwr_12v_in(t) ≤ 16 | Lines 7 and 8 ∎ |

## How the proofs are built

JKind proves each property with an SMT solver, which answers yes or no but doesn't give an argument a person can follow. SysMod runs JKind with its `-ivc` option, which also reports an **inductive validity core**: the smallest set of wires and contract promises that the proof needs. SysMod then rebuilds a readable argument from that set, using one of three methods:

| Method | Used when | How it reads |
|---|---|---|
| **Follow the wires** | Following the wires turns one promise into exactly the property | "Replace each value in line 2 with the one wired to it" |
| **Chain of limits** | The property is a bound, like every supply-voltage check | A chain of `=`, `≤` and `≥` steps, then arithmetic |
| **Logic solver** | Anything else, such as properties that compare moments in time | The facts used, then a final step that says plainly it was checked by the solver |

The explanation never decides whether a property holds. Only JKind does that, and the report shows a property as proved only when JKind proved it.

When a proof uses a component's promise, and that promise depends on the component's own needs being met, the report links to the proof of those needs. Proofs are ordered so that each one comes after the proofs it builds on.

## Tips for judging

- Lead with the summary: how many properties are proved, and what they mean for the robot.
- Pick one proof, such as the motor supply proof, and walk through it line by line. Every line is either a wire you drew, a promise from a datasheet or the rules, or simple arithmetic.
- Explain why a proof is stronger than a test: a test checks one battery voltage, while the proof covers every voltage at every moment.
- Be ready to say what the proofs don't cover. The last section of the report lists those limits for you.
