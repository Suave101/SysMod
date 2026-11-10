# What is AADL?

**AADL** (Architecture Analysis & Design Language) is a standard language for describing how a system is built: which parts it has, how they connect, and what information or energy flows between them. It is published by SAE International as standard AS5506. It is used in aircraft, spacecraft, cars and medical devices, where engineers need to check a design before anything is built.

Think of AADL as a wiring diagram written as text. A drawing is easy for people to read. AADL text is just as precise, and analysis tools can also check it automatically.

## The building blocks

| AADL concept | What it means | FRC example |
|---|---|---|
| **Component type** | A kind of part and the connection points it offers | "A Kraken X60 has a 12 V input and CAN in/out" |
| **Component implementation** | What a part is made of on the inside | "The robot contains a battery, a PDH, a roboRIO..." |
| **Subcomponent** | One specific part inside an implementation | `kraken6: device KrakenX60;` |
| **Feature (port)** | A connection point on a part, with a direction | `pwr_12v_in: in data port Electrical_Power;` |
| **Connection** | A wire from one port to another | `power_4: port pdh3.pwr_high_out -> kraken6.pwr_12v_in;` |
| **Data type** | What a port carries | `Electrical_Power`, a voltage |
| **Bus** | A shared network that connections run over | The CAN bus and the Ethernet network |
| **Property** | A fact about a part or connection | Which bus a CAN connection is bound to |
| **Annex** | A block written in another language, attached to a part | An AGREE contract (see [What is AGREE?](what-is-agree.md)) |

AADL also has categories for parts: `system` for the whole robot, `device` for hardware such as motors and sensors, `bus`, `processor`, `process`, `thread` and more. SysMod models the robot as one `system` made of `device` parts.

## A small example

```aadl
package Simple_Robot
public
  with Base_Types;

  data Electrical_Power extends Base_Types::Float
  end Electrical_Power;

  device Battery12V
    features
      pwr_battery_out: out data port Electrical_Power;
  end Battery12V;

  device KrakenX60
    features
      pwr_12v_in: in data port Electrical_Power;
  end KrakenX60;

  system Robot
  end Robot;

  system implementation Robot.impl
    subcomponents
      battery1: device Battery12V;
      kraken2: device KrakenX60;
    connections
      power_1: port battery1.pwr_battery_out -> kraken2.pwr_12v_in;
  end Robot.impl;
end Simple_Robot;
```

Real robots do not connect a motor straight to the battery. This example only shows the shape of an AADL file: types declare what parts offer, and the implementation says which parts exist and how they are wired.

## AADL in SysMod Studio

You never have to write AADL by hand in SysMod. On the Architecture page, select **Model & Contracts** in the activity bar, then `FRC_Robot_Architecture.aadl`. It opens as a read-only tab that updates as you wire. Select **Save FRC_Robot_Architecture.aadl** to save the file. You can also open it from **Export & Project → Generated code**, next to `robot.py` and `Robot.java`.

The saved file opens in [OSATE](https://osate.org), the free AADL toolset from the Software Engineering Institute at Carnegie Mellon University. Because it is plain text, you can also commit it to your team's repository and compare versions over the season.

## Learn more

- [AADL website](https://www.aadl.info) from the standards committee
- [OSATE](https://osate.org), the AADL toolset

Next: [What is AGREE?](what-is-agree.md)
