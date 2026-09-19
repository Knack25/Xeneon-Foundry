"""Package a built Foundry module using portable ZIP member names."""
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def package(source: Path, destination: Path) -> None:
    source = source.resolve(strict=True)
    manifest = json.loads((source / 'module.json').read_text(encoding='utf-8'))
    for entry in manifest['esmodules']:
        path = (source / entry).resolve(strict=True)
        if not path.is_relative_to(source) or not path.is_file():
            raise ValueError('Module entry point escapes the build directory')
    files = [source / 'module.json', *sorted((source / 'scripts').rglob('*.js'))]
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED) as archive:
        for path in files:
            if path.is_symlink() or not path.resolve().is_relative_to(source):
                raise ValueError('Only files inside the build directory may be packaged')
            archive.write(path, arcname=path.relative_to(source).as_posix())


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python scripts/package-foundry-probe.py BUILD_DIRECTORY OUTPUT.zip')
    package(Path(sys.argv[1]), Path(sys.argv[2]))
    print(sys.argv[2])
