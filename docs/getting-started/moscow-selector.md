# Strategic Prioritization (MoSCoW)
The Strategic Prioritization tool implements the MoSCoW methodology (Must have, Should have, Could have, Won't have) to establish relative weights and strategy boundaries for your FRC robot's capabilities. By categorizing performance criteria and functional goals into clear priority tiers, your team can focus engineering resources on essential robot features, prevent scope creep, and directly inform scoring weights in downstream decision matrices.

## Adding a Custom Capability or Constraint
While criteria created in the Project Design Brief automatically flow into this tool, you can also add new strategic goals, vision features, or software capabilities directly on this page.

<img src="../../assets/moscow-Add-Criterion.png"></img>

1. **Locate the Input Bar:** Click into the top text input field labeled `Enter an FRC robot capability or constraint (e.g., Swerve 45° Lock / Limelight Reef Tag Alignment)...`.
2. **Type the Capability:** Enter the specific performance goal, autonomous routine requirement, or driver-assist feature you wish to track.
3. **Add to Board:** Click the purple `+ Add Criterion` button to place the item onto your prioritization board.

## Prioritizing Criteria Across Tiers
The board is divided into four strategic columns that define how critical a capability is to your team's match performance:

* **🔴 MUST HAVE:** Critical FRC robot requirements that the machine must possess to participate effectively in match play (e.g., basic drivetrain mobility, game piece intake).
* **🟡 SHOULD HAVE:** High-priority match capabilities that significantly enhance competitiveness but are not strictly non-negotiable for basic functionality.
* **🟢 COULD HAVE:** Desirable stretch goals or secondary features that will be implemented only if primary subsystems are completed ahead of schedule.
* **⚪ WON'T HAVE:** Explicitly excluded features for this season or build cycle, preventing unnecessary expenditure of time and resources on secondary strategies.

### Organizing via Drag-and-Drop
To reorder or reassign criteria between priority columns:

<img src="../../assets/moscow-Drag-And-Drop-Handle.png"></img>

1. **Grab the Handle:** Click and hold the six-dot grip icon (`::`) located on the left side of any criteria card.
2. **Drag to Target Column:** Move the card into the appropriate priority column (**MUST HAVE**, **SHOULD HAVE**, **COULD HAVE**, or **WON'T HAVE**).
3. **Release to Save:** Drop the card in position. The strategy weight will automatically update across your portfolio.

!!! note "Strategic Focus Prevents Scope Creep!"
    Clear MoSCoW prioritization ensures that mechanical, software, and electrical sub-teams prioritize core functionality before attempting high-risk stretch goals.

## Navigating to the Decision Matrix
Once your capabilities are prioritized into their respective tiers, click the purple `GO TO DECISION MATRIX →` button in the upper-right corner to proceed to subsystem selection and weighted evaluation.
