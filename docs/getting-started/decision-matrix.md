# Decision Matrix

The Decision Matrix is where your team picks a design. You list a few candidate designs, score each one against the criteria you prioritized on the MoSCoW page, and SysMod adds up a weighted score for each. The same page splits your budget across the robot's subsystems.

A decision matrix is a standard engineering trade study. Judges look for one because it shows the team chose a design for reasons it can explain, not just the first idea.

## Where the criteria come from

Every criterion in your **Must Have**, **Should Have** and **Could Have** columns on the MoSCoW page becomes a column in the matrix. Its weight comes from its column:

| MoSCoW column | Weight in the matrix |
|---|---|
| Must Have | 3 |
| Should Have | 2 |
| Could Have | 1 |
| Won't Have | Left out |

To change a weight, go **Back to MoSCoW** and drag the criterion to another column. The matrix uses what you saved with **Go to Decision Matrix**.

## Adding a design concept

<img src="../../assets/decisionMatrix-Add-Concept.png" alt="The Candidate FRC Architecture field and Add Design Concept button, boxed in red">

1. **Name the design:** Click the field labeled `CANDIDATE FRC ARCHITECTURE` and describe one whole design, such as `Swerve drive with over-the-bumper roller intake`.
2. **Add it:** Click the purple `+ Add Design Concept` button. The design appears as a new row in the matrix.

Add at least two or three designs, so there's something to compare. To remove one, click the trash icon at the end of its row.

## Scoring each design

<img src="../../assets/decisionMatrix-Scores.png" alt="The decision matrix with three designs scored against five criteria, and weighted scores of 50, 45 and 37, boxed in red">

1. **Read the column header:** Each column shows its MoSCoW group and weight, such as `MUST (W:3)`, above the criterion.
2. **Pick a score:** For each design, choose a score from **1 (Poor)** to **5 (Best)** for how well it meets that criterion. A dash (`-`) means not scored yet, and counts as 0.
3. **Read the result:** The **Weighted Score** column adds up each score times its weight. The highest score is the design the matrix recommends.

!!! note "Example"
    The first design above scores 5, 5, 4, 5 and 2. Its weighted score is 5Ã—3 + 5Ã—3 + 4Ã—2 + 5Ã—2 + 2Ã—1 = **50**.

### Decision Matrix - Best Practices
- **Score honestly, then discuss.** Have a few team members score on their own first, then compare. Big differences show where the team disagrees about a design.
- **Use evidence.** Base scores on prototypes, past robots or calculations, and note where each score came from for your portfolio.
- **Watch the Must Haves.** A design that scores 1 on a Must Have may be a poor choice even with a high total.
- **The matrix informs, the team decides.** If two designs are within a few points, look at risk, build time and cost before choosing.

## Splitting the budget across subsystems

<img src="../../assets/decisionMatrix-Subsystem-Budget.png" alt="The FRC Subsystem Budget Breakdown panel with three subsystems totaling $3,500 of a $4,000 cap, and the Save and Continue button, boxed in red">

The **FRC Subsystem Budget Breakdown** panel splits the hardware budget from your Design Brief across the parts of the robot.

1. **Name the subsystem:** Enter a part of the robot with one job under `SUBSYSTEM NAME`, such as `Ground Intake` or `Swerve Drivetrain`.
2. **Estimate its cost:** Enter the dollar amount under `ESTIMATED COST ($)`.
3. **Add it:** Click the purple `+ Add` button. Click `âœ•` on a subsystem to remove it.

Below the list:

- **Budget Cap (from Brief)** is the `Project Budget Ceiling` from your Design Brief.
- **Total Allocated** adds up every subsystem's cost.
- **Remaining Balance** is what's left. It turns red when you've allocated more than the cap.

The subsystems you list here carry forward to the Architecture Canvas. Under **Subsystems** in the Components side bar, **Add from Brainstorming** makes a labeled frame for each one, ready for you to drag its motors and sensors into. See [Robot Behavior with Soar](../robot-behavior.md#subsystems) for what subsystem frames do.

!!! note
    The costs here are your team's estimates. They aren't compared with the component prices on the Architecture Canvas yet.

## Saving and continuing

Scores, designs and subsystems save as you change them. When you're done, click the purple `Save & Continue to FRC System Canvas â†’` button to move on to the Architecture Canvas and design your robot's electrical system.
