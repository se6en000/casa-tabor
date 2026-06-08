---
name: pi-kiosk-launcher
description: Configure how the Casa Tabor app auto-launches on the Raspberry Pi 5 touchscreen — autostart on boot, fullscreen kiosk vs. windowed test mode, 200% zoom / device scale, and syncing the launcher to the Pi. Use when asked to change how/whether the kiosk starts, adjust zoom, toggle kiosk mode, or get the app to open automatically.
---

# Raspberry Pi Kiosk Launcher — Autostart, Zoom & Kiosk Toggle

The Casa Tabor app runs on a Pi 5 driving a 23.8" QHD (2560×1440) Pisichen
touchscreen. A single shell script launches Chromium pointed at the deployed
Vercel app and an autostart `.desktop` entry runs it on boot.

> Touch only works under X11, never Wayland — see the **pi-kiosk-touch** skill.
> This skill is about *launching* the app, not fixing touch.

## The two files that make it work

1. **Launcher script** — repo copy: `pi/start-casa.sh`; Pi copy: `/home/jake/start-casa.sh`.
   This is the source of truth for all Chromium flags (kiosk, zoom, touch, screen blanking).
2. **Autostart entry** (Pi only): `~/.config/autostart/casa-tabor.desktop`
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Casa Tabor
   Exec=/home/jake/start-casa.sh
   X-GNOME-Autostart-enabled=true
   ```
   This runs the launcher on every login/boot. To create it once:
   ```bash
   mkdir -p ~/.config/autostart
   nano ~/.config/autostart/casa-tabor.desktop   # paste the block above
   ```

## Kiosk toggle (production vs. testing)

`start-casa.sh` reads a `KIOSK` env var so you don't have to edit flags by hand:

```bash
KIOSK="${KIOSK:-0}"          # 0 = windowed (default), 1 = locked kiosk
...
KIOSK_FLAG=""
if [ "$KIOSK" = "1" ]; then KIOSK_FLAG="--kiosk"; fi
chromium-browser $KIOSK_FLAG --force-device-scale-factor=2 --touch-events=enabled ...
```

- **Testing/building:** leave `KIOSK=0` (or run `KIOSK=0 /home/jake/start-casa.sh`).
  Gives a normal window with tabs + address bar and full desktop access.
- **Production on the wall:** set the default to `1` (or `KIOSK=1 ...`) for
  locked-down fullscreen.

## 200% zoom / making the app bigger on the screen

Use the Chromium flag — NOT Ctrl-+ keypresses or per-host `Preferences` JSON
(both are fragile and non-persistent):

```bash
--force-device-scale-factor=2     # 200%. Use 1.5 / 1.75 / 2.25 etc. to taste
```

This scales the whole device at the compositor level: persistent across reboots,
crisp 2x rendering, and touch hit-targets scale correctly. Adjust the number to
re-tune; no other change needed.

## SSH access to the Pi

```bash
ssh jake@192.168.86.118          # DHCP — if it fails, re-check with: ssh ... 'hostname -I'
```
Key auth via `~/.ssh/id_ed25519`. SSH exit code **255** = transport failure
(host down / IP changed), just retry. To launch or inspect GUI apps over SSH
under X11 you must export the display env first:
```bash
export DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority XDG_RUNTIME_DIR=/run/user/1000
```

## Applying a launcher change to the running Pi

1. Edit `pi/start-casa.sh` in the repo.
2. Copy it over and make it executable:
   ```bash
   scp pi/start-casa.sh jake@192.168.86.118:/home/jake/start-casa.sh
   ssh jake@192.168.86.118 'chmod +x /home/jake/start-casa.sh'
   ```
3. **Fully quit Chromium before relaunching.** Chromium is a *singleton* — running
   `chromium-browser` again with the same profile just routes the URL to the
   EXISTING window, so a kiosk window will appear to "stick." Kill every chromium
   process, then start fresh:
   ```bash
   ssh jake@192.168.86.118 'kill $(pgrep -f chromium) 2>/dev/null; sleep 4'
   ssh jake@192.168.86.118 'export DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority XDG_RUNTIME_DIR=/run/user/1000; \
     KIOSK=0 nohup /home/jake/start-casa.sh > ~/casa.log 2>&1 < /dev/null & disown'
   ```
4. Commit the repo copy so the Pi and git stay in sync.

## Gotchas (cost real time before)

- **`pkill`/`killall` are blocked** in this environment. Use `kill <PID>` or
  `kill $(pgrep -f chromium)`.
- **`pgrep -af "chromium-browser"` self-matches your own SSH command** — the
  `bash -c "...chromium-browser..."` wrapper shows up in results and produces
  false "STILL KIOSK" readings. Detect mode robustly with `ps`:
  ```bash
  A=$(ps -eo args | grep "[c]hromium --")
  echo "$A" | grep -q -- "--kiosk" && echo KIOSK || echo WINDOWED
  ```
  (The `[c]` bracket trick also stops grep from matching itself.)
- Chromium's singleton means a "relaunch" without a full kill is a no-op for
  window mode — always kill all chromium procs first.
- Changes must land in BOTH places: the Pi (`scp`) AND the repo (`git commit`).
