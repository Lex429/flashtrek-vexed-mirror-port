# Controller controls

The active browser game reads standard Gamepad API controllers once per existing
display frame. DualSense/Sony is preferred when an Xbox is also connected. Focus
the game and press a controller button to let the browser expose it; release it
before playing. A connection/disconnection popup and persistent controller badge
remain visible on the main menu, in flight and over overlays. Click the badge
to open controller setup. If the browser never exposes button input, select
**Connect DualSense** and choose the controller in the browser picker. Previously
granted access can reconnect automatically when the page loads.

| Control | Action |
| --- | --- |
| Left stick | Steer toward the direction pushed; tilt farther for stronger thrust |
| D-pad in flight | Keyboard arrows: Up thrust, Left/Right turn, Down drift/brake/fresh-press reverse |
| L1 | Hold to brake to a stop |
| R2 | Hold to fire through the existing weapon/recharge owner |
| L2 | Squeeze once to select/cycle; release before selecting again |
| Cross | Loot a selected disabled ship, dock/open port services, mine the selected asteroid, or confirm a menu choice |
| Create/Share (left small button) | Open/close the galaxy map |
| Touchpad click | Open/close inventory |
| Square / Triangle | Inventory / map shortcuts |
| Circle | Back; in flight clear the target, cancel cruise, or undock |
| Options | Pause/resume |
| D-pad or left stick in menus | Move through visible controls; left/right adjusts selected fields |
| D-pad or left stick on map | Move to nearby systems/planets in the direction pressed |
| L2 / R2 on map | Smooth zoom out / in |
| Cross on map | Open system, open destination details, then confirm the chosen travel action |
| Circle / B on map | Destination → solar system → galaxy → close |
| R3 on map | Center on your ship |

Keyboard and mouse remain available, including typing new-game names. The stick
also navigates the two live inventory grids, page buttons and Take all; Cross
immediately takes a focused item from their inventory into yours
and Circle closes it. Repairs and world time continue while looting. Foreign
deployed DOTs use the ordinary L2 target cycle and R2 weapon controls.

The stick has an 18% radial dead zone. Release steering to coast. L1 brakes without
requesting thrust; directional steering retains the shared hull's gradual turn
and acceleration limits, and waits to apply thrust until facing toward the
requested direction. The D-pad feeds the same held arrow keys into the existing
keyboard controller, retaining simultaneous thrust/turn, drift taps, held brakes
and fresh-press reverse exactly. D-pad/keyboard steering takes priority over
the directional stick when both
are used. Center the stick after a menu or focus change. Held buttons must
be released after those transitions, reconnects, or hidden-tab intervals. Changing
targets stops held fire until a fresh R2 squeeze. Input never integrates movement,
manufactures a lock, bypasses weapon rules, or alters saves.

`gamepad-controls.js` owns device selection, normalization, button edges and menu
navigation. Its directional command supplies heading, throttle and brake intent;
`ship-motion.js` retains all movement integration. `native-game.js` polls it
before the existing frame's simulation and dispatches to existing action owners,
including the shared temporary manual override during a cruise. Keyboard intent
still belongs to `player-combat-controls.js`. No extra animation loop or
simulation clock is introduced. Unrecognized layouts report unsupported rather
than guessing button indexes.

The map retains its original black chart and dark neutral panels. PC controls
remain independent of a connected controller: click once to select, double-click
to zoom to a system or planet, scroll or use +/- to zoom, and drag to pan. Enter
or Space selects a focused destination and focuses its navigation action. Home
or Center on ship recenters without changing the selection; Escape or M closes
the map directly. An idle controller cannot take over the PC map controls.

With the controller, the map opens near your ship. Back out to the galaxy, select
a system and press Cross to fly the camera into its solar system. Browse its
planets, press Cross for destination details, then choose and confirm an available
cruise, warp or navigation action. Back steps out one level. Selecting or zooming
never travels automatically. The selected name stays visible in the chart and
destination panel; breadcrumbs describe the view separately from ship location.

`map-controls.js` owns pure spatial selection and eased/logarithmic camera
interpolation. `map-ui.js` owns the hierarchy, real pointer actions, trigger zoom
and controller actions. It uses the existing RAF and authoritative catalog and
navigation owner. Unknown systems do not reveal planet data. Reduced-motion mode
snaps explicit camera moves. PlayStation touchpad click uses its additional button
at index 17; finger motion/swipes are not needed for inventory.

Run `node --test tests/gamepad-controls.test.cjs tests/player-controls.test.cjs
tests/flight-feel.test.cjs tests/map-controls.test.cjs` and the browser regressions
`tests/browser-gamepad-controls.py`, `tests/browser-controller-map.py`, and
`tests/browser-cruise-navigation.py`. Controller browser regressions inject a
standard controller at the browser API boundary; the map regression checks the
explicit travel dispatch, while cruise-navigation exercises real travel.
Physical Bluetooth/controller behavior still needs a hands-on check.

## Damage vibration

Damage vibration is on by default. Pause → Options provides an on/off switch,
connection capability status and a short Test vibration button. The preference
is separate from game saves. The controller badge turns amber and says vibration
setup when controls work but vibration is unavailable.

On Windows, a DualSense can work through the Gamepad API without a vibration
actuator. Select **Connect DualSense**. In the browser's device picker,
click the controller name to enable **Connect**, click **Connect**, then press
**Test vibration** in the game. This uses direct WebHID
output for Bluetooth and USB. The browser requires device permission; the game
cannot grant it. Previously granted access is restored only when one matching
DualSense is available. Chrome, Edge and compatible Brave builds expose WebHID;
the options screen reports when browser or device access is unavailable.

`dualsense-hid.js` is an independent adapter, restricted to Sony
DualSense/Edge vendor/product IDs. Its output changes only compatible vibration:
USB report 0x02, or Bluetooth report 0x31 with a sequence and CRC32 including the
0xA2 transport header. Motors receive an explicit zero report when each pulse
ends, on cancellation, and on opening the connection. It leaves LEDs, trigger
effects, microphone levels and firmware untouched. It also decodes USB, basic
Bluetooth and full Bluetooth input reports into the standard button/stick layout,
including Create, Options and touchpad click. Full Bluetooth input CRCs are
verified. The existing input selector uses these reports only when no usable
native Sony gamepad is available; it never dispatches both input sources.
Missing reports expire after one second so held flight/fire cannot get stuck.
The ordinary focus, menu, button-release and centered-stick gates still apply.
Protocol field layout was checked against the
[SDL PS5 backend](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_ps5.c).
Browser permission behavior follows the
[Chrome WebHID documentation](https://developer.chrome.com/docs/capabilities/hid).

`controller-haptics.js` consumes successful player damage results from the shared
`ship-damage.js` owner. It reads the exact shield/hull contact in ship coordinates:
port favors the strong/low-frequency channel, starboard the weak/high-frequency
channel, bow uses a shorter pulse, and stern a longer pulse. Hull hits are stronger
than comparable shield hits. These are approximate patterns: the browser exposes
rumble channels rather than a spatial actuator array, and physical separation
depends on the controller/driver. Single-channel devices retain pulse feedback.

Only real shield/hull damage emits feedback; NPC hits and visual-only effects do
not. Requests merge within one display interval and are limited to one every
90 ms, with stale queued hits discarded. Damage amounts and physics are untouched.
Pause, menus, focus loss, hidden pages, device changes and disabled vibration stop
playback and discard pending feedback. The explicit Options test is allowed while
paused. Fatal damage starts its final pulse immediately; clearing steering after
destruction preserves that pulse while normal menu/focus gates still cancel it.
API rejections are caught without interrupting gameplay.

Run `node --test tests/controller-haptics.test.cjs tests/dualsense-hid.test.cjs`,
`python tests/browser-controller-haptics.py`, and
`python tests/browser-dualsense-hid.py`. The direct browser regression runs in
installed Brave when available, checks native WebHID availability, reproduces a
missing Gamepad actuator, exercises the device-picker flow with a simulated HID
device, exercises direct stick/D-pad flight, map, touchpad inventory and pause
with an empty Gamepad API, and sends shared fatal damage through the live game's handler.
USB/Bluetooth packets and automatic motor stops are checked separately. Tests
cannot establish whether a physical controller actually moved.
