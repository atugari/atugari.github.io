#!/usr/bin/env python3
"""Sign a CI-built, aligned APK locally; private keys never enter the repository."""
import argparse
import hashlib
import os
from pathlib import Path
import secrets
import subprocess


def run(args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--private-directory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    artifact = args.artifact.resolve()
    private = args.private_directory.resolve()
    output = args.output.resolve()
    source = artifact / "nanpure-owner-1.0.0-unsigned.apk"
    signer = artifact / "apksigner.jar"
    if not source.is_file() or not signer.is_file():
        raise SystemExit("Extract the unsigned Android build artifact first.")
    repository = Path(__file__).resolve().parents[2]
    if private == repository or repository in private.parents:
        raise SystemExit("Signing keys must stay outside the public repository.")
    for line in (artifact / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        candidate = artifact / Path(name.strip()).name
        if not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest() != digest:
            raise SystemExit("Artifact checksum mismatch.")
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    private.chmod(0o700)
    keystore = private / "nanpure-owner-release.p12"
    password_file = private / "keystore-password.txt"
    if keystore.exists() != password_file.exists():
        raise SystemExit("Signing backup is incomplete; do not replace the existing key.")
    if not keystore.exists():
        password = secrets.token_urlsafe(40)
        descriptor = os.open(password_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(password + "\n")
        environment = dict(os.environ)
        environment["NP_OWNER_STOREPASS"] = password
        run([
            "keytool", "-genkeypair", "-keystore", str(keystore),
            "-storetype", "PKCS12", "-alias", "nanpure-owner",
            "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
            "-dname", "CN=Nanpure Owner, OU=Author App, O=Nanpure, C=JP",
            "-storepass:env", "NP_OWNER_STOREPASS",
        ], env=environment)
        keystore.chmod(0o600)
    output.parent.mkdir(parents=True, exist_ok=True)
    run([
        "java", "-jar", str(signer), "sign", "--ks", str(keystore),
        "--ks-key-alias", "nanpure-owner", "--ks-pass", "file:" + str(password_file),
        "--key-pass", "file:" + str(password_file), "--v1-signing-enabled", "true",
        "--v2-signing-enabled", "true", "--v3-signing-enabled", "true",
        "--v4-signing-enabled", "false", "--out", str(output), str(source),
    ])
    run(["java", "-jar", str(signer), "verify", "--verbose", "--print-certs", str(output)])
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".apk.sha256").write_text(checksum + "  " + output.name + "\n")
    print("Verified signed APK:", output)
    print("SHA-256:", checksum)


if __name__ == "__main__":
    main()
