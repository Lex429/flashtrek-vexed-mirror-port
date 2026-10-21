# Visible-desktop gameplay measurements

`tests/browser-performance-headed.py` is an optional manual wrapper around the
unchanged `browser-performance-review.py`. It uses the same fixture restoration,
seed, population, equipment, three-second warm-up, simulation-time inputs and
frame/counter collection. The default is three twenty-second windows each of
ordinary flight, crowded flight and crowded combat in a real visible Edge
window. The fixed default is 1200 × 650 CSS pixels at DPR 1, fitting inside the
reference desktop's 1280 × 800 logical screen at native DPR 2. This is a separate
protocol from the headless 1280 × 850 run. It does not run an empty animation callback test or alter game settings.
It is not a CI timing gate.

Use the same immutable source roots and the same existing isolated fixture for
both commands. Close other benchmarks and leave the temporary browser visible,
focused and unobstructed. Do not interact with the game during a window.

```powershell
python tests/browser-performance-headed.py --source-root C:/Users/alphi/Vexed-Mirror-Foundation-Baseline --label headed-before --revision-label d68a0f0 --fixture test-results/performance-review/initial-save.json --seed 4292026 --seconds 20 --runs 3 --width 1200 --height 650 --dpr 1
python tests/browser-performance-headed.py --label headed-after --revision-label "tested implementation" --fixture test-results/performance-review/initial-save.json --seed 4292026 --seconds 20 --runs 3 --width 1200 --height 650 --dpr 1
```

The default preserves the requested CSS viewport and emulated DPR, enabling a
clean headed-versus-headed comparison. The temporary window is maximized so
Playwright's default outer-window height does not clip the emulated viewport.
Conditions flag an emulated viewport larger than the outer window; such a sample
cannot establish fully visible desktop presentation and needs a fitting viewport.
A headed result must not be pooled with
headless results as though the browser presentation conditions were identical.
Additional review options pass through, including scenario subsets and larger
saved fleets. `--headed-help` shows wrapper-specific options; `--help` shows the
underlying review options.

For a native fullscreen comparison, add `--fullscreen` to **both** commands and
use separate labels. Before restoring the fixture, the wrapper clicks its own
temporary button to grant the Fullscreen API a real user gesture. The button
does not send gameplay controls. Fullscreen deliberately removes viewport and
DPR emulation: native CSS dimensions, actual DPR and game-canvas pixels are
recorded per page. Requested review dimensions remain provenance only. Do not
compare fullscreen results unless actual dimensions/DPR match between runs.
The wrapper also requests and verifies the temporary browser's full-screen
window state: an automated desktop can acknowledge the DOM request while
leaving its outer window normal. It waits for the viewport to reach the screen
dimensions before restoring the fixture.
The report's normal viewport/DPR fields use the observed native values when all
measured pages agree; varying or unavailable geometry is explicitly marked.

On Windows, `--headed-monitor '\\.\DISPLAY2'` can position the temporary browser
on an active display before the fullscreen gesture. Use an actual device name
from the conditions report. The wrapper reads display devices and current modes
through `EnumDisplayDevicesW` / `EnumDisplaySettingsExW`; it does not change
refresh rate, GPU selection, registry, power policy or global browser settings.
It records the browser's CDP graphics/GPU report through the existing review,
configured display modes before/after, window bounds, focus/visibility,
fullscreen state, screen geometry and DPR. Focus/visibility events during timed
windows are flagged; interrupted windows need rerunning under comparable
conditions. Multiple monitors, remote-desktop sessions, OS overlays, background
activity and automatic GPU selection can still affect delivery.

The normal review report and raw frames remain under ignored
`test-results/performance-review/`. A separate `*-headed-conditions.json` keeps
conditions and failure information even when the underlying review fails.
The wrapper hash is recorded alongside unchanged underlying harness hashes.
Screenshots capture page pixels, not proof of physical panel delivery.

A monitor configured for 120 Hz does not establish 120-FPS gameplay. Conversely,
near-60 results in headless/60-Hz conditions do not establish a hardware ceiling.
Evaluate real gameplay intervals, active combatants, accepted shots, simulation
progress/debt and delivered paints together. Browser RAF intervals do not count
compositor-presented or physically displayed frames; a matching headed browser
trace/presentation analysis is needed for stronger delivery claims. Establish
stable 60-FPS reference gameplay before claiming higher rates. Never promise a
universal refresh target from this diagnostic.

For a matching heavy presentation diagnostic, `browser-performance-trace.py
--headed` uses the same maximized temporary window, fixed 1200 × 650 CSS viewport,
DPR 1, display metadata and focus/visibility event capture. Without `--headed`,
the trace keeps its existing headless 1280 × 850 protocol. Trace inputs, fixture
restoration, candidate-builder instrumentation, CPU sampling and process/thread
events remain owned by the existing trace harness; no additional source
injection is introduced by the headed flag.

```powershell
python tests/browser-performance-trace.py --headed --source-root C:/Users/alphi/Vexed-Mirror-Foundation-Baseline --label headed-trace-before --fixture test-results/performance-review/initial-save.json --scenario flight --seed 4292026 --seconds 8
python tests/browser-performance-trace.py --headed --label headed-trace-after --fixture test-results/performance-review/initial-save.json --scenario flight --seed 4292026 --seconds 8
```

Run these sequentially, then repeat both with `--scenario crowdedFlight` and
`--scenario crowdedCombat`. Keep the desktop visible, focused and unobstructed;
do not overlap tracing with clean measurements. The diagnostic report embeds
GPU/window/display conditions, and `*-trace-headed-conditions.json` also retains
conditions or failure information. A window-fit flag, an unfocused/hidden start
or a measured focus/visibility interruption prevents treating the trace as a
fully visible comparable observation. Heavy tracing changes delivery: compare
game logic, raster, compositing, GPU service and presentation events within the
marked interval on their actual threads, without adding overlapping parent and
child durations. These traces are separate from clean FPS windows and do not
prove physical display delivery by themselves.

Functional harness checks on the reference desktop verified the fitting fixed
viewport and actual native fullscreen at 1280 × 800 CSS, DPR 2, with a
2560 × 1600 game canvas and a CDP full-screen outer-window state. Windows reports
that display configured at 60 Hz. These short checks overlapped correctness
work and are not performance evidence. Paired clean results are recorded in
[the foundation review](fleet-foundation-results.md); physical 120-Hz delivery
remains unverified.
