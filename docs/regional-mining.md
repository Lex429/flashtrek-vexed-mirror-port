# Regional asteroid belts and mineral technology

All 52 systems have two asteroid belts. Basic Trellium, Tritanium, Dilithium and
Gallicite occur throughout the galaxy; regional abundance gives travel a purpose.
The original 262 Sol asteroids retain their IDs, positions and ore types. Sol gains
360 additional rocks; other systems have 144–240 rocks each.

| Region | Main deposits | Secondary deposits |
| --- | --- | --- |
| Earth and nearby independent space | Trellium, 60% | Tritanium, Dilithium |
| Klingon | Dilithium, 60% | Tritanium, some Gallicite |
| Vulcan | Gallicite, 60% | Dilithium, Trellium |
| Cardassian | Tritanium, 60% | Dilithium, some Trellium |
| Romulan | Gallicite and Trellium, 30% each | Dilithium |
| Ferengi | Tritanium and Dilithium, 30% each | Gallicite, Trellium |
| Remote, unclaimed or dangerous frontier | Mixed basic ores, 3% Benamite | All basic ores |

These are generation weights, rounded to whole rocks. Ordinary regions have a
0.3% Benamite weight, so some individual belts have none. Sol keeps its original
rare deposits without adding new Benamite. Geology follows the original map's
territories rather than changing when a planet is conquered. Minor territories
use their nearest major region; nearby independent space uses Earth's mix and
distant independent space uses the frontier mix.

## Playing

Install the mining laser at a port's **Shop → Mining**. Click an asteroid in
flight, choose **Mine**, then collect the released pieces. Mining progress,
depletion and remaining pieces survive saving and reloading in every system.
**Find an unclaimed asteroid** in the Mining shop or system Market selects a
nearby available rock and starts the normal flight approach.

The **Local ore refinery** buys one mineral unit at a time. Offers reflect regional
abundance. Sales require the port's available money and storage; payment comes
from its actual treasury, respecting funds reserved for existing deliveries. Raw
minerals become industrial Ore in the existing market. Dilithium uses the game's
existing Dilithium resource rather than creating a second inventory.

Keep minerals to install technology on the current hull model:

| Upgrade | Effect per level | First-level materials | Latinum |
| --- | --- | --- | --- |
| Shields | +10% capacity | 12 Trellium + 4 Tritanium | 500 |
| Hull | +10% capacity | 12 Tritanium + 4 Dilithium | 500 |
| Engines | +8% flight speed | 12 Gallicite + 4 Tritanium | 650 |
| Weapons | +8% damage | 12 Dilithium + 4 Trellium | 650 |
| Interstellar drive | +15% warp speed and fuel efficiency | 4 Benamite + 8 Gallicite | 1,200 |

Each upgrade has three levels. Level two costs twice the listed materials and
money; level three costs three times as much. Effects add per level. Upgrades
remain saved per hull model and use the shared ship definitions, movement,
navigation and weapon rules. Installation consumes materials and pays the port;
it preserves existing hull/shield damage when increasing capacity.

## NPCs, saves and performance

The existing fleet gains regional work without adding a second population. Each
original station has a resident chosen from its existing ships. Residents finish
their saved work, return to their operating base and mine locally when a buyer
can fund the ore. Traders consider nearby systems; miners reserve individual
rocks and use the existing depletion and delivery transactions. A resident may
wait when no buyer or unclaimed rock is available. Sol's industrial freighters
keep their existing jobs and ports. Belts are finite, so depleted systems do not
automatically replenish.

`regional-minerals.js` owns pure geology, prices and upgrade recipes.
`sol-asteroids.js` owns deterministic geometry and spatial queries.
`asteroid-combat.js` owns mining and ore entitlements. New asteroid IDs are
`systemId * 100000 + index`; old Sol IDs 0–261 remain valid.
`npc-lives.js` owns jobs, reservations, market settlement and installation.
Rendering and inspector reads cannot finish jobs or grant resources.

Geometry is generated per system without loading images. Nearby spatial queries
bound rendering, radar and pointer selection; distant miners use geometry without
preparing asteroid artwork. Existing identities, cargo, tasks, money, depleted
rocks and original Sol geometry are preserved during migration.

## Verification

`node --test tests/regional-mining.test.cjs` checks the original Sol hash, all
regions, unique IDs, mining pause/reload, save migration, funded sales and upgrades,
and thirty minutes of regional work using 0.25-second simulation steps.
`python tests/browser-regional-mining.py` checks actual asteroid selection, mining,
collection, local sales, hull installation and prospecting in Klingon space.

Use `python tests/browser-npc-performance.py --label NAME` for comparable browser
timings with the same saved population and viewport. Timing reports and browser
screenshots belong in ignored `test-results`, not in source control.

The October 17, 2026 before/after diagnostic used Edge 155.0.4283.45 at 1280×850
with the same 169-ship save (SHA-256 beginning `2878ea104bafcc6a`). In six-second
windows, flight simulation p95 was 0.60 ms before and after; flight callback p95
was 5.40 ms in both runs. Dev map simulation p95 remained 0.40 ms. Flight frame
interval p95 was 30.3/30.4 ms, with one/two intervals above 50 ms. These short
machine-specific measurements do not establish a smoothness improvement;
occasional frame stalls remain.
