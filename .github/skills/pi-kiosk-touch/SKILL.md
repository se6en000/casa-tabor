---
name: pi-kiosk-touch
description: Diagnose and fix touchscreen gestures (scroll, swipe, tap) not working in the Casa Tabor Chromium kiosk on the Raspberry Pi 5. Use when touch input feels broken, finger-scroll/swipe don't work, or the app behaves as if there is no touchscreen.
---

# Raspberry Pi Kiosk Touch — Diagnosis & Fix

## TL;DR — the root cause (already solved once)

**Chromium on Wayland (labwc/wayfire) SILENTLY DROPS touch events** on the Pi's
ILITEK USB touch panel. A finger drag arrives as a **mouse** drag, so native
page-scroll and swipe gestures break. **Chromium on X11/Xorg receives native
XInput2 touch and everything works.**

The fix is a one-time session switch, NOT a web-app change:

```bash
sudo raspi-config nonint do_wayland W1   # W1 = Openbox/X11 (W2=wayfire, W3=labwc)
sudo reboot
# verify after reboot:
echo $XDG_SESSION_TYPE   # must print: x11
```

Do NOT waste time editing React/CSS first — if `navigator.maxTouchPoints === 0`
and the touch-debug page shows mouse-only, it is the Wayland→Chromium layer.

## Hardware facts (Casa Tabor Pi)

- Panel: **Pisichen 23.8" QHD**, touch controller **ILITEK ILITEK-TP** (USB, VID `222A`).
- Pi 5, Raspberry Pi OS Bookworm, default desktop is **labwc (Wayland)** — this is the trap.
- The panel exposes TWO HID interfaces: a real `hid-multitouch` (10-pt, `event5`)
  AND a phantom `hid-generic` "ILITEK-TP Mouse" (`event6`). The phantom mouse is a
  red herring — at libinput level only the touch interface fires on a finger.

## SSH access

```bash
ssh jake@<pi-ip>     # default seen: jake@192.168.86.118 (DHCP — re-check with `hostname -I`)
```
Key-based login is set up from the Mac (`~/.ssh/id_ed25519`).

## Diagnostic ladder (run top-down; stop when a layer fails)

Launching GUI apps over SSH needs the session env. Grab it from a running GUI proc:
```bash
# X11 session:
export DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority XDG_RUNTIME_DIR=/run/user/1000 \
       DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
# Wayland session (older boots): also set WAYLAND_DISPLAY=wayland-0
```

1. **Is it touch or mouse to the browser?** Open the standalone diagnostic
   `https://casa-tabor.vercel.app/touch-debug.html` (file: `public/touch-debug.html`).
   Drag a finger: GREEN/blue `type=touch` lines = real touch; RED mouse-only = broken.
   IMPORTANT: a Mac always shows mouse-only (no touchscreen) — only the Pi result counts.

2. **Does libinput get touch?** (proves hardware/kernel are fine)
   ```bash
   sudo timeout 20 libinput debug-events    # then touch the screen
   ```
   Expect `TOUCH_DOWN / TOUCH_MOTION / TOUCH_UP` on the ILITEK event node.

3. **What session/compositor?**
   ```bash
   loginctl show-session <id> -p Type     # wayland  <-- the problem
   pgrep -af 'labwc|wayfire|openbox|Xorg'
   ```

4. **Does the Wayland seat even advertise touch?** (it does, yet Chromium still fails)
   ```bash
   wayland-info | grep -A2 wl_seat        # capabilities: pointer keyboard touch
   ```
   This is the key insight: every layer up to and including the compositor is fine;
   only Chromium-on-Wayland drops it.

## The fix (permanent)

1. Switch to X11: `sudo raspi-config nonint do_wayland W1 && sudo reboot`.
   This sets `/etc/lightdm/lightdm.conf` → `autologin-session=LXDE-pi-x`.
2. Kiosk launcher `pi/start-casa.sh` already uses `chromium-browser --touch-events=enabled`
   and X11 tools (`xset`, `unclutter`). It warns if booted under Wayland.
3. Autostart: `~/.config/autostart/casa-tabor.desktop` → `Exec=/home/jake/start-casa.sh`.
4. `unclutter` must be installed (`sudo apt install -y unclutter`) to hide the cursor.

Launch Chromium under X11 over SSH for testing:
```bash
export DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority XDG_RUNTIME_DIR=/run/user/1000
nohup chromium-browser --touch-events=enabled --kiosk \
  "https://casa-tabor.vercel.app" > ~/x11chrome.log 2>&1 < /dev/null & disown
```
(`--no-decommit-pooled-pages` "unrecognized flag" lines in the log are harmless.)

## Web-app safety net (already shipped)

`src/lib/pointerGestures.ts` (init'd in `main.tsx`) implements drag-to-scroll +
swipe-to-navigate on **mouse/pointer** input, for any environment that still
delivers touch-as-mouse. It is DORMANT by default and **tears itself down on the
first real `touchstart`**, so on a correct X11 session it never interferes.
- Calendar nav: it dispatches `casa:swipe` (detail `{dir:'next'|'prev'}`) on the
  `[data-swipe-nav]` container; `CalendarPage` listens and calls `goNext/goPrev`.
- Elements that do their own pointer dragging (framer-motion) opt out with
  `data-native-drag` (e.g. `EventDetailPanel`).

## Gotchas / time-savers

- `useIsMobile()` is an **inline function inside `EventDetailPanel.tsx`** (no
  `src/hooks/useIsMobile.ts`). It was forced to `return true` for the kiosk so the
  mobile bottom-sheet variant renders on the big touchscreen. Revisit only if the
  desktop side-panel variant is wanted again.
- `--touch-events=enabled` forces `navigator.maxTouchPoints` to 10 even on Wayland,
  but real touch events still won't fire there — capability ≠ delivery. Don't be
  fooled by maxTouchPoints alone; check that actual `touchstart` events arrive.
- `wev` over SSH may print nothing (block-buffered/permission); prefer
  `libinput debug-events` and the in-browser `touch-debug.html` instead.
- Forcing Chromium `--ozone-platform=x11` while the *session* is still Wayland
  (Xwayland) gave a blank window — switch the whole session to X11 instead.
