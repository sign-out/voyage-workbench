import os
from pathlib import Path, PurePosixPath
import tempfile
import zipfile


def archive_entries(source):
    entries = {}
    with zipfile.ZipFile(source) as archive:
        total = 0
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            if entry.is_dir():
                continue
            if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or entry.filename in entries:
                raise ValueError('Invalid or duplicate SDK archive path')
            total += entry.file_size
            if total > 100 * 1024 * 1024 or len(entries) >= 5000:
                raise ValueError('SDK archive exceeds extraction limits')
            entries[entry.filename] = archive.read(entry)
    return entries


def factor_sdk_archives(sources, output):
    if set(sources) != {'arm64-v8a', 'x86_64'}:
        raise ValueError('Expected both supported SDK architectures')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    targets = {abi: output / ('cursor-sdk-' + abi + '.zip') for abi in sources}
    common_target = output / 'cursor-sdk-common.zip'
    if any(Path(source).resolve() in {target.resolve() for target in [*targets.values(), common_target]} for source in sources.values()):
        raise ValueError('SDK input archives must be separate from output archives')
    entries = {abi: archive_entries(source) for abi, source in sources.items()}
    first, second = entries.values()
    common = {name: data for name, data in first.items() if name in second and data == second[name]}
    outputs = {common_target: common}
    for abi, records in entries.items():
        outputs[targets[abi]] = {name: data for name, data in records.items() if name not in common}
    with tempfile.TemporaryDirectory(dir=output) as directory:
        for target, records in outputs.items():
            temporary = Path(directory) / target.name
            with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
                for name, data in sorted(records.items()):
                    archive.writestr(name, data)
        for target in outputs:
            os.replace(Path(directory) / target.name, target)
    return {abi: ['cursor-sdk-common.zip', targets[abi].name] for abi in sources}
