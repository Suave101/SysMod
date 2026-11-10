<p align="center">
  <img src="docs/img/logo.svg" alt="SysMod Studio logo" width="128">
</p>

# SysMod Studio

**Model-Based Systems Engineering (MBSE) for FIRST Tech Challenge (FTC) & FIRST Robotics Competition (FRC)**

SysMod Studio is an open-source, web-based systems architecture tool designed to bring professional Model-Based Systems Engineering (MBSE) into the FIRST Robotics ecosystem.

Instead of treating hardware wiring, subsystem software, and engineering notebooks as isolated tasks, SysMod provides a single "source of truth." Teams map out their robot visually using an intuitive node-based editor, and SysMod automatically generates the underlying AADL (Architecture Analysis & Design Language) models, robot boilerplate code, and beautiful PDF schematics for design awards.

---

## ✨ Core Features

* **⚡ Node-Based Visual Architecture:** Drag and drop FTC/FRC components (Control Hubs, roboRIOs, SparkMaxes, Servos, Sensors) onto an infinite canvas. Wire them together to define exact power, PWM, I2C, and CAN pathways.
* **📄 PDF Schematic Engine (The "Tear Saver"):** One-click export of your entire canvas into a beautifully formatted, high-resolution PDF. Perfect for Engineering Notebooks, Control Award submissions, and pit design reviews.
* **💻 Auto-Generated Robot Code:** Stop manually typing hardware maps and CAN IDs. SysMod parses your digital twin and exports perfectly formatted `RobotHardware.java` (FTC) or WPILib `Constants.java` / `Subsystem.java` boilerplates.
* **📐 Native AADL Export:** Under the hood, your visual model is represented as AADL syntax, validating hardware limits (like PDH slot usage or CAN bus saturation) before a single wire is crimped.

---

## 🛠️ Tech Stack

SysMod Studio is a modern, fast web application built to run in the browser or offline in the pits:

* **Frontend:** React (TypeScript) + Vite
* **Visual Canvas:** `@xyflow/react` (React Flow)
* **State Management:** Zustand (Lightning-fast JSON state tracking)
* **Styling:** Tailwind CSS + `shadcn/ui`
* **PDF Generation:** `html-to-image` + `jspdf`
* **Code Generation:** Handlebars.js template engine

---

## 🚀 Quick Start (Development)

Want to run SysMod Studio locally and contribute?

**1. Clone the repository:**

```bash
git clone https://github.com/your-username/SysMod.git
cd SysMod

```

**2. Install dependencies:**

```bash
npm install

```

**3. Run the development server:**

```bash
npm run dev

```

Open `http://localhost:5173` in your browser to start building your digital twin.

---

## 🗺️ Product Roadmap

We are currently building **Phase 1**, focusing on rapid architecture mapping and code generation. However, the long-term vision of SysMod spans much further into aerospace-grade autonomous architectures.

* **Phase 1 (Done):** Web-based node editor, PDF schematics, AADL syntax generation, and FTC/FRC Java hardware mapping.
* **Phase 2 (Current, [Hardware Validation Engine](docs/hardware-validation.md)):** Active alerts for CAN bus saturation, current limit exceedances, and duplicate port IDs.
* **Phase 3 (The Soar AI Coprocessor Bridge):** Integration with custom Alpine/Arch Linux AI coprocessors. SysMod will map data flows between the main robot controller and a Soar cognitive architecture agent for dynamic, safety-assured autonomous routines.

---

## 📦 Releasing

Releases are built and published by [`.github/workflows/release.yml`](.github/workflows/release.yml). To publish one, push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow compiles JKind, runs the proof tests, builds the Windows installer and the Linux AppImage, and publishes them in one GitHub Release with auto-generated notes. You don't need to change the version in `package.json`, because the workflow sets it from the tag.

* Tags with a suffix, like `v0.1.0-alpha` or `v0.1.0-rc.1`, are published as **prereleases**.
* To rebuild an existing release, open **Actions → Release → Run workflow** and enter the tag. The release's files are replaced.
* The installers aren't code-signed yet, so Windows SmartScreen shows a warning the first time students run them.

---

## 🤝 Contributing

We welcome contributions from FIRST mentors, alumni, and students! Whether it's adding new REV/CTRE components to the React Flow node library, improving the Java Handlebars templates, or writing documentation, check out our `CONTRIBUTING.md` file to get started.

## 📝 License

This project is licensed under the MIT License - see the `LICENSE` file for details.