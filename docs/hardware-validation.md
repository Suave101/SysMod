# Hardware Validation

The Hardware Validation Engine checks your electrical design every time you change the diagram. It catches three kinds of problem before you build:

- **CAN bus saturation:** too much traffic on a CAN bus
- **Current limit exceedances:** more current than a breaker, fuse or regulator can supply
- **Duplicate port and ID assignments:** two devices on the same CAN ID, DIO port, PWM port or PDH channel

These run alongside the FRC wiring rules and the formal proofs. Like the wiring rules, they're instant checks on the diagram. The proofs are separate; see [AADL and AGREE for FRC](verification/aadl-agree-for-frc.md).

## How you're alerted

| Where | What you see |
|---|---|
| **On the component** | A badge with the number of problems on it. Hover to read them. Components with a hardware problem also get a red or amber ring. |
| **Pop-up alert** | When an edit causes a new hardware problem, an alert appears in the corner of the diagram. Select **Show on diagram** to jump to the components involved. |
| **Problems panel** | Every problem, with the FRC wiring rules |
| **Hardware panel** | Live gauges for CAN bus load and current, and a table of every ID and port |
| **Status bar** | The load on your busiest CAN bus, such as **CAN 34%**. It turns amber at 70% and red at 90%. Select it to open the Hardware panel. |

Problems that were already there when you opened the diagram don't pop up. They're still on the badges and in the panels.

## Editing IDs and limits

You can change these settings right on the component. Click the number and type a new one.

| Setting | On | Range |
|---|---|---|
| **CAN ID** | Motor controllers, CAN sensors and the Pneumatic Hub | 0–62 |
| **Port #** (DIO) | Limit switches, beam breaks and Through Bore encoders | 0–9 |
| **Port #** (PWM) | PWM servos | 0–9 |
| **Supply current limit** | Motor controllers, in amps | 0–120 |

New components get the lowest free ID or port, and motor controllers start with a 40 A limit to match their PDH channel.

The generated robot code uses these values. In **Export & Project → Generated code**, `robot.py` and `Robot.java` open as editor tabs that update as you edit:

- **CAN IDs and ports:** each device is created with the CAN ID or port set on its component.
- **Kraken X60, Kraken X44 and Falcon 500:** each gets a Phoenix 6 supply current limit set to its component's limit.
- **SPARK MAX and SPARK Flex:** each gets a REVLib 2025 smart current limit set to the same value. A smart current limit caps motor current, which is never lower than supply current, so the same number is a safe, slightly stricter limit.

If you change a limit in Phoenix Tuner or the REV Hardware Client instead, change it on the diagram too, so the checks and the code agree.

## CAN bus load

Every device on a CAN bus sends status messages many times a second. If the messages need more time than the bus has, they're delayed or dropped, and devices can stop responding.

SysMod estimates each bus's load from the devices on it:

| Device | Estimated frames per second |
|---|---|
| Kraken X60, Kraken X44, Falcon 500 (Talon FX) | 250 |
| SPARK MAX, SPARK Flex | 330 |
| Pigeon 2.0 | 150 |
| CANcoder | 100 |
| LaserCAN | 50 |
| roboRIO | 50 |
| REV PDH | 40 |
| REV Pneumatic Hub | 30 |

On the roboRIO's 1 Mbit/s CAN bus, each frame takes about 150 µs. On a CANivore's CAN FD bus, the data is sent faster, so each frame takes about 45 µs.

| Load | Alert |
|---|---|
| Under 70% | None |
| 70% to 90% | Warning: little room left for bursts |
| 90% and above | Error: frames are delayed or lost |

To lower the load, slow down status frames you don't use in your robot code, or move CTRE devices to a CANivore.

!!! note
    These are estimates based on vendor default settings. Your real load depends on how your code configures each device. Check it on the robot with the roboRIO's CAN utilization readout in the Driver Station.

## Current limits

SysMod adds up the current each part of the robot can draw, following the power wiring from each device back to the PDH and the main breaker. Motor controllers use their **supply current limit**. Other parts use a typical maximum draw:

| Device | Typical maximum draw |
|---|---|
| Compressor | 12 A |
| Limelight | 4 A |
| Linux coprocessor | 3 A |
| roboRIO 2.0 | 2 A |
| VH-109 radio | 1.5 A |
| REV Pneumatic Hub | 0.5 A, plus its compressor and solenoids |
| Solenoid valve | 0.2 A |

It then checks these limits:

| Check | Limit | Alert |
|---|---|---|
| PDH high-current channel | 40 A | Error if the devices behind it can draw more |
| PDH low-current or switchable channel | 15 A | Error if the devices behind it can draw more |
| Motor supply current limit | Its channel's breaker | Warning if the limit is higher than the breaker, because a long push at full power trips the breaker first |
| VRM output | 2 A | Error if the devices on it can draw more |
| Buck converter output | 5 A | Error if the devices on it can draw more |
| 120 A main breaker | 120 A | Note above 120 A. Warning above 240 A, where it can trip within seconds |

Short peaks above the main breaker's rating are normal. A robot whose motors could all draw 40 A at once usually exceeds it on paper. The warning at 240 A means that if those mechanisms really do run together, the breaker can trip and the battery will brown out. Lower the supply current limits on mechanisms that run at the same time.

!!! note
    The buck converter rating is typical. Check the datasheet for the converter you use.

## Duplicate IDs and ports

| Check | Rule |
|---|---|
| **CAN ID** | Devices of the same kind on the same bus need different IDs. Different kinds can share an ID: a Talon FX and a CANcoder can both be ID 1. SPARK MAX and SPARK Flex count as the same kind. Devices that aren't wired to a bus yet are compared with each other. |
| **DIO port** | Each roboRIO DIO port (0–9) connects to one device |
| **PWM port** | Each roboRIO PWM port (0–9) connects to one device |
| **PDH channel** | Each PDH channel powers one device |

IDs or ports outside their range are also errors.

## For developers

The engine is in [`hardwareValidation.ts`](https://github.com/Suave101/SysMod/blob/main/sysmod-studio/src/renderer/src/views/utils/hardwareValidation.ts). Every estimate on this page is a named constant at the top of that file, so it can be checked against a datasheet and updated in one place. Run its tests with:

```bash
npm run test:hardware
```
