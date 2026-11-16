"""Bulk, resumable download of the full open ECG datasets used by CardioEKG.

Why: download_data.py fetched one file per request (curl), so long runs stopped after a few
hundred records when the network dropped (see network-blocker.json: 522 PTB-XL records). This
script mirrors whole datasets with a resumable tool and verifies every file against the
SHA256SUMS.txt that PhysioNet publishes for each project.

Files land in data/clinical-run/<source>/ with the same relative paths that download_data.py
expects, so after a bulk mirror download_data.py --full only builds manifests (no per-file requests).

Usage (from the repository root, on a machine with internet access):
  python training/clinical-run/bulk_download.py ptb chapman ludb qt
  python training/clinical-run/bulk_download.py --verify-only ptb
Tools tried in order: aws s3 sync (public bucket, no account), wget mirror, curl per file with resume.
Licences: PTB-XL and Chapman-Shaoxing-Ningbo CC BY 4.0; LUDB and QTDB ODC-By 1.0. The licence file
of each project is downloaded and hashed into data/clinical-run/<source>/LICENSE-CHECK.json.
"""
import argparse, hashlib, json, shutil, subprocess, sys
from pathlib import Path

ROOT = Path('data/clinical-run')
PROJECTS = {
    # source: (PhysioNet slug, version, expected records, licence)
    'ptb': ('ptb-xl', '1.0.3', 21799, 'CC BY 4.0'),
    'chapman': ('ecg-arrhythmia', '1.0.0', 45152, 'CC BY 4.0'),
    'ludb': ('ludb', '1.0.1', 200, 'ODC-By 1.0'),
    'qt': ('qtdb', '1.0.0', 105, 'ODC-By 1.0'),
}


def run(command):
    print('$', ' '.join(command), flush=True)
    return subprocess.run(command).returncode == 0


def mirror(source):
    slug, version, _, _ = PROJECTS[source]
    target = ROOT / source
    target.mkdir(parents=True, exist_ok=True)
    if shutil.which('aws') and run(['aws', 's3', 'sync', '--no-sign-request', '--only-show-errors',
                                    f's3://physionet-open/{slug}/{version}/', str(target)]):
        return True
    if shutil.which('wget') and run(['wget', '-r', '-N', '-c', '-np', '-nH', '--cut-dirs=3', '-q', '--show-progress',
                                     '-P', str(target), f'https://physionet.org/files/{slug}/{version}/']):
        return True
    # Last resort: per-file curl with resume, driven by the checksum list.
    sums = target / 'SHA256SUMS.txt'
    if not run(['curl', '-fsSL', '--retry', '5', '-C', '-', f'https://physionet.org/files/{slug}/{version}/SHA256SUMS.txt', '-o', str(sums)]):
        return False
    ok = True
    for line in sums.read_text().splitlines():
        _, relative = line.split(maxsplit=1)
        dest = target / relative
        if dest.exists() and dest.stat().st_size:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        ok &= run(['curl', '-fsSL', '--retry', '5', '-C', '-', f'https://physionet.org/files/{slug}/{version}/{relative}', '-o', str(dest)])
    return ok


def verify(source):
    slug, version, expected, licence = PROJECTS[source]
    target = ROOT / source
    sums = target / 'SHA256SUMS.txt'
    if not sums.exists():
        run(['curl', '-fsSL', '--retry', '5', f'https://physionet.org/files/{slug}/{version}/SHA256SUMS.txt', '-o', str(sums)])
    bad, missing, checked = [], [], 0
    for line in sums.read_text().splitlines():
        digest, relative = line.split(maxsplit=1)
        path = target / relative
        if not path.exists():
            missing.append(relative)
            continue
        h = hashlib.sha256()
        with path.open('rb') as handle:
            for block in iter(lambda: handle.read(1 << 20), b''):
                h.update(block)
        checked += 1
        if h.hexdigest() != digest:
            bad.append(relative)
    headers = sum(1 for _ in target.rglob('*.hea'))
    licence_file = next((p for p in [target / 'LICENSE.txt', target / 'LICENSE'] if p.exists()), None)
    report = {'source': source, 'project': f'{slug}/{version}', 'licence_declared': licence,
              'licence_sha256': hashlib.sha256(licence_file.read_bytes()).hexdigest() if licence_file else None,
              'files_checked': checked, 'checksum_mismatch': bad[:50], 'missing': len(missing),
              'header_files': headers, 'expected_records': expected}
    (target / 'LICENSE-CHECK.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return not bad and not missing


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sources', nargs='+', choices=sorted(PROJECTS))
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    failed = []
    for source in args.sources:
        if not args.verify_only and not mirror(source):
            failed.append(source)
            continue
        if not verify(source):
            failed.append(source)
    if failed:
        sys.exit('Incomplete or unverified: ' + ', '.join(failed) + ' — rerun to resume.')
    print('All requested datasets mirrored and verified. Next: python training/clinical-run/download_data.py --full')


if __name__ == '__main__':
    main()
