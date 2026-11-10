# Installation Guide

SysMod Studio is a free desktop app for Windows and Linux. Everything it needs is included, so you don't need to install Java, Python or any other software first.

**[⬇ Download the latest release](https://github.com/Suave101/SysMod/releases/latest)**

The link opens the newest release on GitHub. Under **Assets**, download the file for your computer:

| Your computer | Download this file |
|---|---|
| Windows 10 or 11 (64-bit) | `sysmod-studio-<version>-setup.exe` |
| Linux (64-bit) | `sysmod-studio-<version>.AppImage` |

You can ignore the other files in the list. The app uses them to check for updates.

!!! note
    macOS isn't supported yet. Mac users can [run SysMod Studio from source](#running-from-source).

## Windows

1. Download `sysmod-studio-<version>-setup.exe` from the [latest release](https://github.com/Suave101/SysMod/releases/latest).
2. Open the downloaded file. SysMod Studio installs for your user account, so you don't need administrator rights, and it opens when it's done.
3. Next time, start it from the **sysmod-studio** shortcut on your desktop or in the Start menu.

!!! warning "Windows protected your PC"
    The installer isn't code-signed yet, so Windows SmartScreen may show a **Windows protected your PC** message the first time you run it. Select **More info**, check that the app is `sysmod-studio-<version>-setup.exe`, then select **Run anyway**.

    On a school computer, this may be blocked. Ask your IT department to allow the installer, or install it on a personal or team computer.

### Updating

Download the newest installer from the [latest release](https://github.com/Suave101/SysMod/releases/latest) and run it. It replaces the old version, and your saved work is kept.

### Uninstalling

Open **Settings → Apps → Installed apps**, find **sysmod-studio**, then select **Uninstall**.

## Linux

1. Download `sysmod-studio-<version>.AppImage` from the [latest release](https://github.com/Suave101/SysMod/releases/latest).
2. Make it executable and run it:

    ```bash
    chmod +x sysmod-studio-*.AppImage
    ./sysmod-studio-*.AppImage
    ```

If nothing happens, or you see an error about FUSE, install the FUSE 2 library. On Ubuntu 22.04 and newer:

```bash
sudo apt install libfuse2
```

On Ubuntu 24.04, use `libfuse2t64` instead of `libfuse2`.

To update, download the newest AppImage and delete the old one.

## Checking that it works

1. Open SysMod Studio. It starts on the **Design Brief** page.
2. Go to the **Architecture** page and add a 12V battery, a 120A main breaker, a PDH and a motor controller from the component palette. Wire them together.
3. In the panel at the bottom, open **Proofs** and select **Prove contracts**.

If the proofs run and show **Proved**, everything is installed correctly, including the bundled proof engine. To learn what the proofs mean, see [AADL and AGREE for FRC](../verification/aadl-agree-for-frc.md).

## Where your work is saved

SysMod Studio saves your Design Brief, MoSCoW and decision matrix work on your computer:

| System | Folder |
|---|---|
| Windows | `%APPDATA%\sysmod-studio` |
| Linux | `~/.config/sysmod-studio` |

To move your work to another computer, copy `workspace-data.json` from that folder into the same folder on the other computer.

## Older versions

Every version is listed on the [releases page](https://github.com/Suave101/SysMod/releases). Versions marked **Pre-release** are early test builds and may have bugs.

## Running from source

This is for developers, and for Mac users until there is a macOS release. You need [Node.js](https://nodejs.org) 24 and [Git](https://git-scm.com).

```bash
git clone https://github.com/Suave101/SysMod.git
cd SysMod/sysmod-studio
npm ci
npm run dev
```

The app opens in development mode. To run proofs from source, you also need to build the proof engine. That needs JDK 11, and is explained in [AADL and AGREE for FRC](../verification/aadl-agree-for-frc.md#running-from-source).

## Getting help

If something doesn't work, check the [existing issues](https://github.com/Suave101/SysMod/issues) or open a new one. Say which version you installed, your operating system and what happened. Please don't include personal information, such as your name, school or contact details. Issues are public.
