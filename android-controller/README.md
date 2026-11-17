# ⚔️ Deck Test Tuesday - Native Android Game Controller

A native Android companion application designed specifically for **Deck Test Tuesday / Realm of Villainy** live broadcasts.

It pairs directly with the Deck Test Tuesday Next.js web application over local Wi-Fi or USB ADB tunneling, replicating all functions of the `MobileControllerClient` in high-contrast neo-brutalist styling.

---

## 🌟 Features

- **Live Stream Control**: View current broadcast status (`STREAM LIVE` vs `OFF-AIR`) and toggle live stream state (`PATCH /api/episodes`).
- **Dynamic Episode Selection**: Pick active broadcast episode; decks automatically filter to that stream.
- **Match Setup**:
  - Andy's Deck selector (purple theme `#3B1F54`, auto-picks Andy's deck).
  - Kirsten's Deck selector (pink theme `#FF2E93`, auto-picks Kirsten's deck).
  - `⇄ SWAP` pilot decks with one tap.
  - Series format toggles: `Bo1`, `Bo3`, `Bo5` (updates "FIRST TO X" counter dynamically).
- **Tactile Arena Scoreboard**:
  - High-contrast scoreboard with large numbers and series status badge.
  - Giant tactile win buttons for Andy and Kirsten with haptic vibration feedback.
  - Game log history tracking each game winner.
  - `↺ UNDO LAST GAME`: rolls back accidental taps.
  - `RESET MATCH`: resets the series to 0-0.
  - `🏆 FINISH & SAVE MATCH`: posts the match record directly into `/api/matches`, updates pilot assignments, and resets the arena for the next match on stream.
- **Quick Refresh (`↻ REFRESH`)**:
  - Re-syncs latest episodes and deck libraries from the web app at any time without losing your current match state.

---

## 📁 Project Structure (100% Self-Contained)

```
deck-test-controller/
  ├── AndroidManifest.xml         # Package: com.decktesttuesday.controller, API 24-34
  ├── build_and_install.ps1       # One-click build, sign, and install to connected device
  ├── README.md                   # Documentation & guide
  ├── build-tools/                # Bundled Android compile & packaging toolchain
  │   ├── aapt2.exe               # Android Asset Packaging Tool 2
  │   ├── android.jar             # Android API 34 SDK library
  │   ├── r8.jar                  # D8 DEX compiler
  │   ├── zipalign.exe            # 4-byte APK aligner
  │   └── apksigner.jar           # Official Google APK signature tool
  ├── res/                        # Drawables, layouts, and styles
  │   ├── drawable/               # Brutalist shapes, buttons, and backgrounds
  │   ├── layout/                 # activity_main.xml, spinner_item.xml, etc.
  │   └── values/                 # styles.xml, colors.xml, strings.xml
  └── src/
      └── com/decktesttuesday/controller/MainActivity.java
```

---

## 🚀 How to Build & Install

### Prerequisites
- Windows 10/11 with PowerShell.
- Any Java JDK (JDK 8 through 26) installed.
- Android device connected via USB with USB Debugging enabled.

### Run Build & Install
Open PowerShell in this directory and run:
```powershell
powershell -ExecutionPolicy Bypass -File .\build_and_install.ps1
```
This script will:
1. Compile Android XML and drawable resources via `aapt2`.
2. Generate `R.java`.
3. Compile `MainActivity.java` with Java 8 bytecode compatibility.
4. Convert class files to `classes.dex` via `D8`.
5. Package, 4-byte `zipalign`, and sign the APK with v2/v3 signatures.
6. Install and immediately launch the app on your connected tablet via `adb`.

---

## 📋 Copying to `deck-test-tuesday-app`

This directory is completely standalone with no absolute paths or external dependencies.

To include it directly in the web app repository:
1. Copy the entire `deck-test-controller` folder into your web app repository (for example, as `deck-test-tuesday-app/android-controller` or `deck-test-tuesday-app/mobile-controller`).
2. You can run `build_and_install.ps1` from within that folder at any time.

---

## 🌐 Connecting to the Web App

### Over Local Wi-Fi:
1. Ensure your Next.js server binds to `0.0.0.0` so other devices on your LAN can connect:
   ```bash
   npm run dev -- -H 0.0.0.0 -p 3001
   ```
2. On the tablet, enter your computer's local IP (e.g. `192.168.1.195`), port `3001`, password `villainy`, and tap **CONNECT CONTROLLER**.

### Over USB Cable (No Wi-Fi needed):
1. In terminal, run:
   ```bash
   adb reverse tcp:3001 tcp:3001
   ```
2. On the tablet, set Host to `127.0.0.1` and Port to `3001`, then tap **CONNECT CONTROLLER**.
