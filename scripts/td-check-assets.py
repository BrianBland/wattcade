"""Validate the live TD asset graph and inventories; use --update-inventories after pruning/exporting."""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / 'public/td'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--update-inventories', action='store_true')
    args = parser.parse_args()
    reached = set()

    def use(path):
        path = path.resolve()
        assert path.is_relative_to(KIT), f'Asset escaped kit: {path}'
        assert path.is_file(), f'Missing asset: {path.relative_to(ROOT)}'
        reached.add(path)

    def manifest(path):
        use(path)

        def walk(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in ('file', 'glow') and isinstance(child, str):
                        use(path.parent / child)
                    elif key in ('frames', 'frameGlows') and isinstance(child, list):
                        for file in child:
                            if isinstance(file, str):
                                use(path.parent / file)
                    else:
                        walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)

        walk(json.loads(path.read_text()))

    manifest(KIT / 'outpost/manifest.json')
    use(KIT / 'outpost/masks/cab_window.png')
    index = KIT / 'towers/manifest.json'
    use(index)
    towers = json.loads(index.read_text())['towers']
    assert set(towers) == {'tesla', 'prism', 'flamer'}, 'Index must contain the three live tower rigs'
    for file in towers.values():
        manifest(index.parent / file)
    for path in (KIT / 'aliens').glob('*/manifest.json'):
        manifest(path)
    for i in range(1, 7):
        use(KIT / f'environment/parts/splat_{i}.png')
    use(KIT / 'environment/road/portrait.webp')
    if (KIT / 'environment/road/landscape.webp').exists():
        use(KIT / 'environment/road/landscape.webp')
    # The retained production previews are the style references for future machinery art.
    for folder in ['outpost', 'towers']:
        use(KIT / folder / 'preview.png')
    assets = {p.resolve() for p in KIT.rglob('*') if p.suffix in ('.png', '.webp', '.json')}
    unused = assets - reached
    assert not unused, 'Unused shipped assets:\n' + '\n'.join(str(p.relative_to(ROOT)) for p in sorted(unused))

    for folder in ['outpost', 'towers', 'environment']:
        kit = KIT / folder
        if args.update_inventories:
            files = sorted({str(p.relative_to(kit)) for p in kit.rglob('*') if p.is_file()} | {'FILES.txt', 'SHA256SUMS.txt'})
            (kit / 'FILES.txt').write_text('\n'.join(files) + '\n')
            (kit / 'SHA256SUMS.txt').write_text(''.join(
                hashlib.sha256((kit / name).read_bytes()).hexdigest() + '  ' + name + '\n'
                for name in files if name != 'SHA256SUMS.txt'))
        actual = sorted(str(p.relative_to(kit)) for p in kit.rglob('*') if p.is_file())
        assert actual == (kit / 'FILES.txt').read_text().splitlines(), f'{folder}: stale inventory'
        entries = (kit / 'SHA256SUMS.txt').read_text().splitlines()
        assert len(entries) == len(actual) - 1, f'{folder}: missing checksums'
        for line in entries:
            digest, name = line.split('  ', 1)
            assert hashlib.sha256((kit / name).read_bytes()).hexdigest() == digest, f'{folder}/{name}: checksum mismatch'
    print(f'{len(reached)} live/reference assets; no unused shipped images or manifests; inventories/checksums pass.')


if __name__ == '__main__':
    main()
