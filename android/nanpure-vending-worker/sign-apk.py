#!/usr/bin/env python3
"""Sign the coexisting app using its preserved private production bundle."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--private', type=Path, required=True)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--build-tools', default='35.0.0')
    args = parser.parse_args()
    build_tools = args.sdk.resolve() / 'build-tools' / args.build_tools
    private = args.private.resolve()
    signing = json.loads((private / 'signing.json').read_text())
    identity = json.loads((private / 'signature-info.json').read_text())
    if identity.get('applicationId') != 'jp.nanpure.refill.fast':
        raise RuntimeError('The signing bundle belongs to a different app.')
    key_file = (private / signing['keyFile']).resolve()
    if key_file.parent != private:
        raise RuntimeError('The signing key must be inside the private bundle.')
    apk = args.apk.resolve()
    output = args.out.resolve()
    if apk == output:
        raise RuntimeError('Choose an output different from the unsigned input.')
    badging = subprocess.run([str(build_tools / 'aapt2'), 'dump', 'badging', str(apk)],
                             check=True, capture_output=True, text=True).stdout
    if not re.search(r"^package: name='jp\.nanpure\.refill\.fast' ", badging, re.M):
        raise RuntimeError('The APK is not the coexisting fast edition.')
    output.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['NANPURE_SIGN_STORE_PASSWORD'] = signing['storePassword']
    env['NANPURE_SIGN_KEY_PASSWORD'] = signing['keyPassword']
    with tempfile.TemporaryDirectory(prefix='refill-sign-') as scratch:
        aligned = Path(scratch) / 'aligned.apk'
        subprocess.run([str(build_tools / 'zipalign'), '-P', '16', '-f', '4', str(apk), str(aligned)], check=True)
        subprocess.run([str(build_tools / 'apksigner'), 'sign', '--ks', str(key_file),
                        '--ks-key-alias', signing['alias'], '--ks-pass', 'env:NANPURE_SIGN_STORE_PASSWORD',
                        '--key-pass', 'env:NANPURE_SIGN_KEY_PASSWORD', '--v1-signing-enabled', 'true',
                        '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
                        '--v4-signing-enabled', 'false', '--out', str(output), str(aligned)],
                       env=env, check=True)
    verified = subprocess.run([str(build_tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(output)],
                              check=True, capture_output=True, text=True).stdout
    match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', verified)
    if not match or match.group(1).lower() != identity['certificateSHA256'].lower():
        raise RuntimeError('The signed APK has an unexpected certificate.')
    subprocess.run([str(build_tools / 'zipalign'), '-c', '-P', '16', '4', str(output)], check=True)
    print(json.dumps({'apk': str(output), 'applicationId': identity['applicationId'],
                      'certificateSHA256': match.group(1).lower(), 'signatureVerified': True}))


if __name__ == '__main__':
    main()
