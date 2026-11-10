# What is AGREE?

**AGREE** (Assume Guarantee REasoning Environment) is a language and tool for proving that a design behaves correctly. Rockwell Collins (now Collins Aerospace) and the University of Minnesota created it for checking aircraft software and hardware designs.

AADL says what parts a system has and how they are wired. AGREE adds what each part *promises* to do. A model checker then proves, mathematically, that the promises fit together.

## Contracts: assume and guarantee

Each part gets a **contract** with two halves:

- An **assume** is what the part needs from its surroundings. *"My supply voltage is never above 16 V."*
- A **guarantee** is what the part promises in return, as long as its assumptions hold. *"My PWM output is always between -1 and 1."*

A contract is like a deal between parts. A motor says: "If you give me a safe voltage, I promise to behave." The PDH says: "I never output more than my input." When the whole robot is checked, every part's assumptions must be proved from the other parts' guarantees and the wiring.

## The statements

| Statement | Meaning | Example |
|---|---|---|
| `assume` | What this part needs. SysMod must prove it from the wiring. | `assume "Safe supply" : pwr_12v_in <= 16.0;` |
| `guarantee` | What this part promises while its assumptions hold | `guarantee "No overvoltage" : pwr_high_out <= pwr_12v_in;` |
| `lemma` | A fact about the whole robot that must be proved | `lemma "Motor never browns out" : kraken6.pwr_12v_in >= 6.8;` |
| `assert` | A fact about the whole robot you take as given, without proof | `assert battery1.pwr_battery_out >= 11.0;` |
| `eq` | A named value, to keep contracts readable | `eq drop : real = pwr_12v_in - pwr_high_out;` |
| `const` | A fixed number | `const MAX_VOLTS : real = 16.0;` |

Every `assume`, `guarantee` and `lemma` has a description in quotes, which SysMod shows in the results.

`assert` is powerful because nothing checks it, so an `assert` that isn't true makes the whole proof meaningless. Use a `lemma` unless you are sure.

## Expressions

AGREE expressions work like the conditions in robot code:

- **Numbers and comparisons:** `+ - * /`, `div` and `mod` for integers, and `= <> < <= > >=`
- **Logic:** `and`, `or`, `xor`, `not`, `=>` (implies) and `<=>` (if and only if)
- **Choices:** `if brownout then 0.0 else command`
- **Types:** `bool`, `int` and `real`. Real numbers need a decimal point, so write `12.0`, not `12`.

### Time

AGREE describes behavior over time, one step after another. These operators look at earlier steps:

- `pre(x)` is the value of `x` at the previous step.
- `prev(x, 0.0)` is the same, but gives `0.0` at the very first step.
- `a -> b` means `a` at the first step and `b` at every step after.

For example, `true -> (pwr_12v_in >= pre(pwr_12v_in) - 1.0)` says the voltage never drops by more than 1 V in a single step.

## How the proof works

AGREE does not run a few test cases. It translates the contracts into **Lustre**, a language for systems that change over time, and gives them to a **model checker** called JKind. JKind considers every possible input at every step, forever, and returns one of three answers:

- **Proved:** the property holds in every possible situation.
- **Counterexample:** a specific step-by-step situation where it fails, which shows you exactly what to fix.
- **Not proved in time:** JKind ran out of time. This is not the same as failing.

## Learn more

- [AGREE on GitHub](https://github.com/loonwerks/AGREE)
- [JKind model checker](https://github.com/loonwerks/jkind)
- [The JKind Model Checker (paper)](https://arxiv.org/abs/1712.01222)

Next: [How AADL and AGREE work together](aadl-and-agree.md)
