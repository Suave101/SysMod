# How SysMod models a Soar agent

SysMod is adding formal verification of robot behavior: proving facts about what the Soar agent can and can't do, with the same AADL, AGREE and JKind tools that prove the electrical design. A proof is only as good as the model it is about. This page describes that model and how it is checked against real Soar.

The approach follows Ganeriwala et al., *Formal Analysis of Stochastic Cognitive Models: A Translation Framework from Soar to PRISM* (NFM 2026), which compiles Soar into a model checker's input. SysMod has an easier job than a general translator: it writes the Soar itself, from blocks, so it knows exactly which Soar features appear.

## The pieces

| Piece | File | What it is |
|---|---|---|
| Behavior model | [`behaviorModel.ts`](https://github.com/Suave101/SysMod/blob/main/sysmod-studio/src/renderer/src/views/behavior/behaviorModel.ts) | The rules, conditions and actions, read from the blocks the same way `soarGenerator.ts` writes `agent.soar` |
| Reference simulator | [`behaviorSimulator.ts`](https://github.com/Suave101/SysMod/blob/main/sysmod-studio/src/renderer/src/views/behavior/behaviorSimulator.ts) | Runs the model one robot loop at a time, following the semantics below |
| Soar oracle | [`scripts/soar_oracle.py`](https://github.com/Suave101/SysMod/blob/main/sysmod-studio/scripts/soar_oracle.py) | Runs `agent.soar` in real Soar 9.6.5 through Soar's own SML interface, with the FRC-Soar bridge's loop |
| Conformance tests | [`scripts/behaviorConformance.ts`](https://github.com/Suave101/SysMod/blob/main/sysmod-studio/scripts/behaviorConformance.ts) | Random programs and inputs through both; every loop must match |
| AGREE translation | [`agentAgree.ts`](https://github.com/Suave101/SysMod/blob/main/sysmod-studio/src/renderer/src/views/behavior/agentAgree.ts) | The same model as an AADL `Soar_Agent` component, for proofs ([Proving facts about robot behavior](proving-robot-behavior.md)) |

A later phase compiles the same model into PRISM (for probabilities), so all of them describe the same behavior.

## One loop is one decision

The robot runs Soar the way the [FRC-Soar bridge](https://github.com/Suave101/FRC-Soar) does. Each robot loop:

1. The robot marks every command from the last loop **done** (Soar adds `^status complete`).
2. The robot writes this loop's inputs to the input link. A value that didn't change is left alone.
3. Soar runs **one decision**: elaborate and propose, decide, apply, output. It stops before the next input phase.
4. The robot carries out every command the decision issued.

The model assumes the robot carries out each command in the same loop, which the bridge does when Soar finishes within the loop (its latency target is under 5 ms of a 20 ms loop).

## Inputs and tests

Each input is a working-memory element (WME) such as `^beambreak8 blocked` or `^match.mode autonomous`. A rule *instance* is a rule plus the WMEs its conditions matched. When an input's value changes, it is a new WME, so instances that matched the old one retract and new ones can fire. Negated conditions (**if not**) don't match a WME, so they don't take part.

Tests follow Soar's kernel (`compare_symbols` in `rete.cpp`):

| Test | Rule |
|---|---|
| **equals** / **does not equal** | Same symbol. Soar treats the whole number `1` and the decimal `1.0` as **different** symbols. The robot sends numeric readings as decimals, so SysMod writes a whole number in a test as a decimal: **equals 1** becomes `1.0`. |
| **is greater than** / **is less than** between numbers | By value; whole numbers and decimals compare normally |
| Between two words | Dictionary order (`strcmp`), so `other` is greater than `blocked` |
| Between a word and a number | The reading counts as **less than** the constant, whatever they are |
| An input the robot doesn't send | No test matches it; **if not** is true |

## Rules

| Rule | Support | When it acts |
|---|---|---|
| **Elaborate** | i-support | Each time a new instance matches. Its command is sent **once** per match and disappears when the match ends. |
| **Operator** (proposal) | i-support | Proposes the operator while its conditions match |
| **Apply** | o-support | When its operator is selected and its own conditions match, for each new instance. Its commands stay until cleared. |

An **Apply** block belongs to an operator *name*, not to the block it sits in: Soar's rule tests `(<o> ^name grab)`. Two operators with the same name share each other's apply rules (SysMod warns).

## Choosing an operator

Soar's preferences, as SysMod generates them, are decided in this order:

| Step | Rule |
|---|---|
| 1. Required | One **required** operator wins. Two at once is a *constraint failure*: nothing is selected, and the behavior stalls until one goes away (SysMod warns). |
| 2. Clearing | `sysmod-clear-commands` is **better than** every other operator, so it wins whenever a finished command is waiting |
| 3. Best | If any candidate is **best**, only best candidates remain |
| 4. Worst | **Worst** candidates are dropped if any other remains |
| 5. Stay | If the operator already selected is still among them, it **stays** |
| 6. Tie | Otherwise Soar picks one at random. Proofs cover **every** choice. |

An operator's apply rules fire when it becomes selected. While it stays selected they don't fire again, unless an input they matched changes.

## The command cycle

Together these give the cycle you see on the robot. While an operator's conditions hold:

| Loop | What happens |
|---|---|
| k | The operator is selected; its apply rule sends the command |
| k+1 | The command is done; the clear operator wins, removes it, and retracts |
| k+2 | The operator is selected again; its apply rule sends the command again |

So an operator re-sends its command **every two loops** for as long as it holds. An elaboration's command is sent once per match. Once it is done, the clear operator also interrupts the selected operator for a loop, which makes that operator send again a loop later.

## Duplicate rules

Soar ignores a rule that is identical to one it already loaded, apart from its name ("Ignoring … because it is a duplicate of …"). Order matters: the same conditions or actions in a different order make a different rule. The model drops exact duplicates and warns.

## Not in the model

| Left out | Why |
|---|---|
| **remember** / **forget** facts | No block reads them back, so they can't change behavior |
| Substates | The standard `sysmod-wait` rule keeps them idle; they never issue commands |
| Learning (chunking, reinforcement) | SysMod doesn't turn it on |
| Commands the robot is slow to carry out | The model assumes each command is done by the next loop |

## How it is checked

`npm run test:behavior` runs the simulator and real Soar side by side on 8 fixed programs and 30 random ones, each with three random 40-loop input traces. For every loop it compares:

- the commands sent, with their values and types
- the operator newly selected
- the operator still selected when the decision ends

When operators tie, the test checks that Soar's choice was one of the simulator's candidates, then follows it.

| Sweep | Programs | Loops | Ties | Result |
|---|---|---|---|---|
| CI default | 38 | 4,560 | 1,067 | Match |
| Seeds from 50000 | 508 | 60,960 | 11,255 | Match |
| Seeds from 90000 | 508 | 60,960 | 12,001 | Match |

Building the tests found five places where the first version of the model was wrong, each now fixed and covered: relational tests on words, mixed word and number tests, a disabled block hiding the blocks after it, duplicate rules, and the order sensitivity of duplicates.

To run more programs locally:

```bash
SOAR_WSL_HOME=/mnt/d/Downloads/SoarSuite_9.6.5-Multiplatform/bin CONFORMANCE_PROGRAMS=500 CONFORMANCE_SEED=50000 npm run test:behavior
```

`CONFORMANCE_ONLY=random-12,hold` reruns only the named programs. The oracle needs `python3` beside the Soar suite (`SOAR_PYTHON` picks another interpreter). A failure names the generated agent in `out/test/soar/` and the inputs of the failing loop and the one before it.

## What it means for students

Three rules surprise people:

- **Comparing words works in dictionary order**, which is rarely what you mean.
- **An operator keeps sending its command** while its conditions hold. Make the conditions false once the job is done if it should send only once, or use an **Elaborate** block.
- **Two required operators at once stall the agent.**
