# Design Brief
The Project Design Brief serves as the foundational page of the FRC Engineering Portfolio, establishing the essential scope, constraints, and operational goals for a team's competition season. By detailing key metadata, defining a focused problem and design statement, and configuring physical rules such as frame perimeter, target weight, actuator counts, and budget ceilings, the brief aligns all engineering efforts before CAD and manufacturing begin. Furthermore, integrating custom, quantifiable performance criteria ensures that every downstream subsystem trade study and decision matrix remains directly tethered to the team's strategic objectives.

## Selecting the FRC Season
The FRC Season selector allows you to configure your Project Design Brief for a specific FIRST Robotics Competition game year. Setting the season establishes the relevant game context, rules, and parameters across your engineering portfolio.
Step-by-Step Instructions

1. **Locate the Selector:** In the top-right corner of the Project Design Brief header, find the input labeled `FRC Season`.

2. **Open the Dropdown Menu:** Click directly on the dropdown box (currently displaying REEFSCAPE™ (2025) with a down arrow icon).

3. **Select Your Target Season:** From the options list, click on the desired FRC competition season (e.g., REEFSCAPE™ (2025)).

<img src="../../assets/designBrief-FRC-Season.png"></img>

!!! note "FRC Season Affects Defaults!"
    Changing the selected season may update default constraints, rule references, and performance criteria templates elsewhere in your portfolio to match that specific game's requirements.

## Filling Out Document Information
The Document Information section establishes key project metadata, identifying the team, authors, intended audience, and end users for the FRC Engineering Portfolio.

<img src="../../assets/designBrief-Document-Information.png"></img>

1. **Student Designer(s):**
    - __Purpose:__ Identifies the key contributors to the design brief.
    - __Action:__ Click the text box and enter the names or roles of the student designers leading the project (e.g., Lead Mechanical & Software Engineers).
2. **Team Name & FRC Number:**
    - __Purpose:__ Links the document to your team's official FIRST registration details.
    - __Action:__ Enter your numeric FRC team number in the first box (e.g., 254) and your official team name in the adjacent box (e.g., The Cheesy Poofs).
3. **Client:**
    - __Purpose:__ Identifies the primary evaluation body for the portfolio.
    - __Action:__ Click the text field and specify the target reviewing audience (e.g., FRC Event Officials & Technical Judges).
4. **Target Consumer:**
    - __Purpose:__ Defines who will interact with or rely on the final robot/product during match play.
    - __Action:__ Enter the end-user group (e.g., Alliance Partners & Drive Team).

## Drafting the Problem Statement
The Problem Statement section establishes the core design challenge by clearly articulating the current issue or bottleneck in game strategy without implying or dictating potential solutions.

!!! note "Follow Key Guidelines: Do Not Describe Solutions!"
    Strictly avoid mentioning specific mechanisms, code implementations, or hardware configurations (e.g., "build an elevator" or "use a intake roller"). Focus exclusively on what the problem is, not how to solve it.

<img src="../../assets/designBrief-Problem-Statement.png"></img>

1. **Locate the Input Area:**
    - Click into the large text area under Section 2, labeled: `Draft your formal FRC problem statement here....`
2. **Apply Problem Statement Structure:** Ensure your text includes the following core elements required:
    - What is the problem?
    - Describe the specific game challenge, bottleneck, or inefficiency (e.g., scoring speed, game piece handling, or strategy constraints).
    - Who is affected?
    - Specify who experiences the issue (e.g., the drive team, alliance partners).
    - Where and when does it occur?
    - State the context during match play (e.g., during autonomous, endgame, or teleop transitions).
    - What is the measurable impact?
    - Detail the consequence of not solving the problem (e.g., lost scoring opportunities, lower ranking points).

!!! note "Example"
    "During FRC match play, high cycle times when retrieving game elements from the carpet limit total scoring capacity and leave alliance teams vulnerable to defensive play, resulting in missed ranking point thresholds and reduced overall alliance performance."

## Drafting the Design Statement
The Design Statement defines the overall scope and strategy of your project, explicitly stating what your team intends to design, build, test, and program while incorporating key FRC constraints and general mechanism outlines.

!!! note
    The Design Statement sets the boundaries for your design effort. Everything outlined here should directly connect to the measurable constraints set in your physical parameter modules and performance criteria

<img src="../../assets/designBrief-Design-Statement.png"></img>

1. **Locate the Input Area:** Click into the large text field under Section 3, starting with `Design, build, test, and program an FRC robot to....`
2. **Apply Design Statement Structure:** A standard Design Statement clearly specifies the action, target outcome, and overarching constraints. Ensure your statement follows this general template:
    - **Core Action Verb:** Begin with the standard engineering directive: "Design, build, test, and program an FRC robot that..."
    - **Intended Function & Mechanism Scope:** Outline the general mechanisms or primary strategic capabilities without locking down overly rigid implementation details (e.g., ground intake, multi-level scoring system).
    - **Boundaries & Constraints:** Briefly reference adherence to official FRC game rules, budget ceilings, weight limits, and physical sizing envelopes.
3. **Follow Key Guidelines:**
    - **Contrast with Problem Statement:** While the Problem Statement focuses purely on the issue, the Design Statement transitions into the proposed scope of action.
    - **Keep it High-Level:** Outline mechanism types and strategy goals rather than exact CAD measurements or specific part numbers.

!!! note "Example"
    "Design, build, test, and program an FRC robot to rapidly intake game pieces from the carpet, elevate them to multiple scoring levels, and score consistently during both autonomous and teleoperated periods, while strictly adhering to FRC weight, dimensional envelope, and budget constraints."

## Adding Performance Criteria
The Performance Criteria section allows you to define measurable evaluation metrics for testing candidate subsystem designs and scoring them in your decision matrix.

<img src="../../assets/designBrief-Performance-Criteria.png"></img>

### Step-by-Step Instructions

1. **Enter the Criterion Description:**
    - Click the text field under `CRITERION DESCRIPTION` and type a specific, quantifiable benchmark (e.g., `Scores Coral/Note element in under 1.5 seconds` or `Acquires game piece from ground within 1.0s`).
2. **Select a Mechanism Category:**
    - Click the `CATEGORY` dropdown menu and choose the subsystem or functional area associated with this metric (e.g., `Intake`, `Drivetrain`, `Elevator`, `Climber`).
3. **Add the Criterion:**
    - Click the purple `+ Add` button. Your new entry will populate in the list below the input form.

### Performance Criteria - Best Practices
- **Keep Metrics Quantifiable:** Avoid vague goals like "fast intake" or "strong arm." Use exact numbers, cycle times, or success rates (e.g., 90%+ shooting accuracy from 10ft).
- **Align with Game Strategy:** Focus criteria on cycle bottlenecks, scoring speed, or reliability targets established during game analysis. 
- Criteria added here will automatically carry forward into your subsystem decision matrices to help rank alternative mechanical designs objectively during trade studies.

## Configuring System Requirements & Technical Constraints
The right-hand sidebar panel sets the hardware, compliance, and sizing envelope parameters required to keep your robot within official FRC game rules and team engineering constraints.

<img src="../../assets/designBrief-System-Requirements.png"></img>

### Sections & Fields Guide
#### 1. FRC Envelope Rules (R101/R103)
Establishes the physical boundaries of the robot starting configuration.

- **Starting Perimeter Limits (Inches):**
    - **Length (X):** Click the input field and enter the baseline frame length (e.g., 30).
    - **Width (Y):** Click the input field and enter the baseline frame width (e.g., 30).
    - **Height (Z):** Click the input field and enter the starting height limit (e.g., 48).
- **Target Weight Goal:**
    - **Input:** Enter the target weight limit in pounds (e.g., 115 lbs) to ensure the team builds below the official maximum allowance (125.0 lbs excluding battery and bumpers).

#### 2. Actuators & Safety Compliance
Tracks control system allocations and mandatory safety hardware.

- **Planned Motors / CAN IDs:** Enter the total number of planned motors/CAN devices relative to the maximum power distribution hub capacity (e.g., 12 out of / 20 Max PDH).
- **Planned Pneumatic Actuators:** Enter the quantity of solenoid valves planned for pneumatic systems (e.g., 2 Solenoids).
- **120A Main Circuit Breaker:** Check the box to confirm inclusion of the mandatory main circuit breaker required by rule R601.

#### 3. Project Budget Ceiling
Sets the financial limits for overall mechanical and electrical hardware.

- **Hardware Cost Limit:** Click the `$` field and enter the dollar cap for the complete build envelope (e.g., `$4000`)

## Continue to Moscow Subsystem Ranker
Once all design brief parameters and criteria are configured, click the purple `Save & Continue to MoSCoW Prioritization →` button at the bottom of the panel to advance to the next step of your engineering portfolio.

<img src="../../assets/designBrief-Next-Button.png"></img>
