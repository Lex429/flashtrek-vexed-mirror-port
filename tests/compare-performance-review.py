"""Pool clean review windows; retain workload counts and per-window variation."""
import argparse
import json
from pathlib import Path
import statistics


def distribution(values):
    ordered = sorted(values)
    def percentile(fraction):
        return ordered[min(len(ordered)-1, int(len(ordered)*fraction))] if ordered else 0
    return {'mean': statistics.mean(values) if values else 0,
            'median': statistics.median(values) if values else 0,
            'p95': percentile(.95), 'p99': percentile(.99), 'worst': max(values, default=0)}


def summarize(path):
    report = json.loads(path.read_text(encoding='utf-8'))
    output = {'label': report['label'], 'revision': report['revision'],
              'initialSaveSha256': report['initialSaveSha256'], 'scenarios': {}}
    for mode, windows in report['scenarios'].items():
        frames = []
        for row in windows:
            raw = path.with_name(f"{report['label']}-{mode}-{row['run']}-frames.json")
            frames.extend(json.loads(raw.read_text(encoding='utf-8')))
        intervals = [frame['intervalMs'] for frame in frames if frame['intervalMs'] > 0]
        seconds = sum(row['actualSeconds'] for row in windows)
        work = {}
        for row in windows:
            for name, count in row['counters']['simulationWork'].items():
                work[name] = work.get(name, 0)+count
        output['scenarios'][mode] = {
            'seconds': seconds, 'frames': len(frames), 'averageFps': len(frames)/seconds,
            'fpsPerWindow': [row['averageFps'] for row in windows],
            'intervalMs': distribution(intervals),
            'over33ms': sum(value > 33 for value in intervals),
            'over50ms': sum(value > 50 for value in intervals),
            **{name: distribution([frame[name] for frame in frames]) for name in ['callbackMs', 'simulationMs', 'renderMs']},
            'simulationSecondsPerWindow': [row['counters']['simulationProgressSeconds'] for row in windows],
            'activeCombatantsPerWindow': [row['state']['activeCombatants'] for row in windows],
            'survivingShipsPerWindow': [row['state']['survivingShips'] for row in windows],
            'acceptedShotsPerWindow': [row['counters']['acceptedShots'] for row in windows],
            'physicsSubsteps': sum(row['counters']['physicsSubsteps'] for row in windows),
            'simulationWork': work,
            'asteroidSpatialWork': {name: sum(row['counters'].get('asteroidSpatialWork', {}).get(name, 0) for row in windows)
                                    for name in set().union(*(row['counters'].get('asteroidSpatialWork', {}) for row in windows))},
            'totals': {name: sum(row['counters'][name] for row in windows)
                       for name in ['canvasAllocations', 'offscreenAllocations', 'effectDraws', 'paints', 'acceptedShots']},
            'spriteTotals': {name: sum(row['counters']['sprite'].get(name, 0) for row in windows)
                             for name in set().union(*(row['counters']['sprite'] for row in windows))}}
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    args = parser.parse_args()
    before, after = summarize(args.before), summarize(args.after)
    assert before['initialSaveSha256'] == after['initialSaveSha256'], 'Different saved workloads'
    result = {'before': before, 'after': after,
              'notes': ['Counts above 33 ms use the literal 33 ms threshold on raw frame intervals.',
                        'Pooled FPS is total measured callbacks divided by actual window duration.',
                        'Artwork paint calls are not delivered compositor frames; use the separate CDP trace.',
                        'Workload changes must be reviewed before attributing frame delivery to an algorithm.']}
    output = args.after.with_name(args.after.stem+'-comparison.json')
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('| Scenario | FPS before/after | P95 ms before/after | >50 ms before/after |')
    print('|---|---:|---:|---:|')
    for mode, old in before['scenarios'].items():
        new = after['scenarios'][mode]
        print(f"| {mode} | {old['averageFps']:.1f} / {new['averageFps']:.1f} | "
              f"{old['intervalMs']['p95']:.1f} / {new['intervalMs']['p95']:.1f} | {old['over50ms']} / {new['over50ms']} |")
    print(output)


if __name__ == '__main__':
    main()
