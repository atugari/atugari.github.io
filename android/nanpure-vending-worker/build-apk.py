#!/usr/bin/env python3
"""Build this dependency-free Android Java app with official SDK command-line tools.

The source tree is read-only. All generated files are temporary siblings of --out.
The resulting APK is aligned and unsigned; signing is a separate operation.
Example:
  python3 build-apk.py --project /path/to/nanpure-vending-worker \
      --sdk /path/to/sdk --jdk /path/to/jdk17 --build-tools 35.0.0 \
      --out /path/to/nanpure-refill-fast-0.3.0-unsigned.apk

An optional --bootstrap file is validated and reduced to format/endpoint/token.
Its token is never written to logs or build metadata.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile

ANDROID_NS = 'http://schemas.android.com/apk/res/android'
ALLOWED_BOOTSTRAP_KEYS = {'format', 'endpoint', 'token', 'deviceId', 'name'}


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def load_config(project: Path, endpoint_override: str | None) -> dict:
    text = (project / 'build.gradle').read_text(encoding='utf-8')

    def string(name):
        found = re.search(r'^\s*' + re.escape(name) + r'\s+[\'\"]([^\'\"]+)[\'\"]', text, re.M)
        if not found:
            raise ValueError('Cannot read ' + name + ' from build.gradle')
        return found.group(1)

    def number(name):
        found = re.search(r'^\s*' + re.escape(name) + r'\s+(\d+)\s*$', text, re.M)
        if not found:
            raise ValueError('Cannot read ' + name + ' from build.gradle')
        return int(found.group(1))

    default_endpoint = re.search(r'\.orElse\([\'\"]([^\'\"]+)[\'\"]\)\.get\(\)', text)
    if not default_endpoint:
        raise ValueError('Cannot read default endpoint from build.gradle')
    endpoint = endpoint_override or os.environ.get('NANPURE_REFILL_ENDPOINT') or default_endpoint.group(1)
    if not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::[0-9]+)?/api/vending/worker|http://(?:10\.0\.2\.2|127\.0\.0\.1|localhost):[0-9]+/api/vending/worker', endpoint):
        raise ValueError('Invalid refill endpoint')
    if re.search(r'^\s*dependencies\s*\{', text, re.M):
        raise ValueError('External dependency resolution requires Gradle; this builder does not substitute libraries')
    config = {'namespace': string('namespace'), 'application_id': string('applicationId'),
              'version_name': string('versionName'), 'version_code': number('versionCode'),
              'compile_sdk': number('compileSdk'), 'min_sdk': number('minSdk'),
              'target_sdk': number('targetSdk'), 'endpoint': endpoint}
    for name in ['namespace', 'application_id']:
        if not re.fullmatch(r'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+', config[name]):
            raise ValueError('Invalid Java package configuration')
    return config


def load_bootstrap(path: Path | None, endpoint: str) -> dict | None:
    if path is None:
        return None
    if path.stat().st_size > 65536:
        raise ValueError('Private bootstrap file is too large')
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError('Invalid private bootstrap JSON') from error
    if (not isinstance(value, dict) or not set(value).issubset(ALLOWED_BOOTSTRAP_KEYS)
            or type(value.get('format')) is not int or value['format'] != 1
            or value.get('endpoint') != endpoint or not isinstance(value.get('token'), str)
            or not re.fullmatch(r'[a-f0-9]{64}', value['token'])):
        raise ValueError('Invalid private device bootstrap configuration')
    return {'format': 1, 'endpoint': value['endpoint'], 'token': value['token']}


def run(command: list[str], env: dict, cwd: Path, label: str, capture: bool = False) -> str:
    print(label, flush=True)
    result = subprocess.run([str(x) for x in command], cwd=cwd, env=env, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ''


def android_system_image(jdk: Path, core: Path, work: Path, env: dict) -> Path:
    # This follows AGP's JdkImageTransformDelegate: compile against Android's
    # Java API stubs rather than accidentally exposing the host JDK's APIs.
    descriptor_dir = work / 'system-descriptor'
    descriptor_dir.mkdir()
    with zipfile.ZipFile(core) as archive:
        packages = sorted({name.rsplit('/', 1)[0].replace('/', '.')
                           for name in archive.namelist()
                           if name.endswith('.class') and '/' in name and not name.startswith('META-INF/')})
    descriptor = descriptor_dir / 'module-info.java'
    descriptor.write_text('module java.base {\n' + ''.join('exports ' + name + ';\n' for name in packages) + '}\n')
    run([jdk / 'bin/javac', '--system=none', '--patch-module=java.base=' + str(core),
         '-d', descriptor_dir, descriptor], env, work, 'Preparing Android Java API module')
    module_jar = work / 'android-java-base.jar'
    with zipfile.ZipFile(core) as original, zipfile.ZipFile(module_jar, 'w') as target:
        for entry in original.infolist():
            if entry.filename != 'module-info.class':
                target.writestr(entry, original.read(entry))
        target.write(descriptor_dir / 'module-info.class', 'module-info.class')
    jmods = work / 'jmods'
    jmods.mkdir()
    version = run([jdk / 'bin/jlink', '--version'], env, work, 'Checking JDK module version', True)
    run([jdk / 'bin/jmod', 'create', '--module-version', version, '--target-platform', 'android',
         '--class-path', module_jar, jmods / 'java.base.jmod'], env, work, 'Packaging Android Java API module')
    image = work / 'android-jdk-image'
    run([jdk / 'bin/jlink', '--module-path', jmods, '--add-modules', 'java.base', '--output', image,
         '--disable-plugin', 'system-modules'], env, work, 'Linking Android Java API image')
    shutil.copyfile(jdk / 'lib/jrt-fs.jar', image / 'lib/jrt-fs.jar')
    return image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--jdk', type=Path, required=True)
    parser.add_argument('--build-tools', default='35.0.0', help='SDK Build Tools version or absolute directory')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--bootstrap', type=Path, help='Optional private registration JSON; omitted for a generic APK')
    parser.add_argument('--endpoint', help='Optional validated worker API endpoint override')
    args = parser.parse_args()
    project, sdk, jdk, output = (p.resolve() for p in [args.project, args.sdk, args.jdk, args.out])
    tools = Path(args.build_tools)
    if not tools.is_absolute():
        tools = sdk / 'build-tools' / tools
    config = load_config(project, args.endpoint)
    bootstrap = load_bootstrap(args.bootstrap, config['endpoint'])
    platform = sdk / 'platforms' / ('android-' + str(config['compile_sdk']))
    android_jar = platform / 'android.jar'
    core = platform / 'core-for-system-modules.jar'
    required = [jdk / 'bin/javac', jdk / 'bin/java', jdk / 'bin/jmod', jdk / 'bin/jlink',
                tools / 'aapt2', tools / 'd8', tools / 'zipalign', android_jar, core]
    if any(not path.is_file() for path in required):
        raise ValueError('A required official SDK or JDK component is missing')
    if output.suffix.lower() != '.apk':
        raise ValueError('--out must name an APK file')
    output.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['JAVA_HOME'] = str(jdk)
    env['PATH'] = str(jdk / 'bin') + os.pathsep + env['PATH']
    started = time.time()
    source_paths = [project / 'build.gradle', project / 'prepare-engine.cjs',
                    project / 'engine-overrides/unique-solver.js', project / 'src/main/AndroidManifest.xml']
    for folder in ['src/main/java', 'src/main/res', 'src/main/assets']:
        source_paths += sorted(path for path in (project / folder).rglob('*') if path.is_file())
    if any(path.is_symlink() for path in source_paths):
        raise ValueError('Source symlinks must be reviewed before packaging')
    if any(path.name == 'refill-bootstrap.json' for path in source_paths):
        raise ValueError('Private bootstrap must be provided with --bootstrap, not stored in source assets')
    source_hashes = {str(path.relative_to(project)): sha256(path) for path in source_paths}

    with tempfile.TemporaryDirectory(prefix=output.stem + '.build-', dir=output.parent) as temporary:
        work = Path(temporary)
        assets, generated, classes, dex = (work / name for name in ['assets', 'java', 'classes', 'dex'])
        for directory in [assets, generated, classes, dex]:
            directory.mkdir()
        for path in (project / 'src/main/assets').rglob('*'):
            if path.is_file():
                target = assets / path.relative_to(project / 'src/main/assets')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        run(['node', project / 'prepare-engine.cjs', assets / 'engine.js'], env, project, 'Preparing pinned generator assets')
        if bootstrap is not None:
            private = assets / 'refill-bootstrap.json'
            private.write_text(json.dumps(bootstrap, separators=(',', ':')) + '\n', encoding='utf-8')
            private.chmod(0o600)
        profiles = json.loads((assets / 'profiles.json').read_text())
        if len(profiles) != 427 or len({entry['key'] for entry in profiles}) != 427:
            raise ValueError('Unexpected refill profile catalogue')
        engine_hash = sha256(assets / 'engine.js')
        profiles_hash = sha256(assets / 'profiles.json')
        ET.register_namespace('android', ANDROID_NS)
        manifest = ET.parse(project / 'src/main/AndroidManifest.xml')
        manifest.getroot().set('package', config['application_id'])
        application = manifest.getroot().find('application')
        if application is None:
            raise ValueError('Application element missing from AndroidManifest.xml')
        application.set('{' + ANDROID_NS + '}debuggable', 'false')
        processed_manifest = work / 'AndroidManifest.xml'
        manifest.write(processed_manifest, encoding='utf-8', xml_declaration=True)
        package_dir = generated / Path(config['namespace'].replace('.', '/'))
        package_dir.mkdir(parents=True)
        build_config = ('package ' + config['namespace'] + ';\npublic final class BuildConfig {\n'
                        '  private BuildConfig() {}\n  public static final boolean DEBUG = false;\n'
                        '  public static final String APPLICATION_ID = ' + json.dumps(config['application_id']) + ';\n'
                        '  public static final String BUILD_TYPE = "release";\n'
                        '  public static final int VERSION_CODE = ' + str(config['version_code']) + ';\n'
                        '  public static final String VERSION_NAME = ' + json.dumps(config['version_name']) + ';\n'
                        '  public static final String ENDPOINT = ' + json.dumps(config['endpoint']) + ';\n}\n')
        (package_dir / 'BuildConfig.java').write_text(build_config, encoding='utf-8')
        compiled_resources = work / 'resources.zip'
        run([tools / 'aapt2', 'compile', '--dir', project / 'src/main/res', '-o', compiled_resources],
            env, work, 'Compiling Android resources')
        packaged = work / 'resource-package.apk'
        run([tools / 'aapt2', 'link', '-I', android_jar, '--manifest', processed_manifest,
             '--java', generated, '--custom-package', config['namespace'],
             '--min-sdk-version', str(config['min_sdk']), '--target-sdk-version', str(config['target_sdk']),
             '--version-code', str(config['version_code']), '--version-name', config['version_name'],
             '-A', assets, '-o', packaged, compiled_resources], env, work, 'Linking manifest, resources and assets')
        image = android_system_image(jdk, core, work, env)
        java_sources = sorted((project / 'src/main/java').rglob('*.java')) + sorted(generated.rglob('*.java'))
        run([jdk / 'bin/javac', '--system', image, '-source', '17', '-target', '17', '-encoding', 'UTF-8',
             '-XDstringConcat=inline', '-g:none', '-classpath', android_jar, '-d', classes, *java_sources],
            env, work, 'Compiling Java against Android API stubs')
        class_jar = work / 'classes.jar'
        with zipfile.ZipFile(class_jar, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(classes.rglob('*.class')):
                archive.write(path, path.relative_to(classes).as_posix())
        run([tools / 'd8', '--release', '--min-api', str(config['min_sdk']), '--lib', android_jar,
             '--output', dex, class_jar], env, work, 'Converting Java bytecode to Android DEX')
        with zipfile.ZipFile(packaged, 'a', compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(dex.glob('*.dex')):
                archive.write(path, path.name)
        staged = work / 'aligned-unsigned.apk'
        run([tools / 'zipalign', '-f', '-P', '16', '4', packaged, staged], env, work, 'Aligning unsigned APK')
        run([tools / 'zipalign', '-c', '-P', '16', '4', staged], env, work, 'Verifying APK alignment')
        with zipfile.ZipFile(staged) as archive:
            if archive.testzip() is not None or 'classes.dex' not in archive.namelist():
                raise ValueError('APK archive verification failed')
            if ('assets/refill-bootstrap.json' in archive.namelist()) != (bootstrap is not None):
                raise ValueError('Unexpected bootstrap asset state')
            if archive.getinfo('resources.arsc').compress_type != zipfile.ZIP_STORED:
                raise ValueError('Resource table must be uncompressed for this target SDK')
        for path in source_paths:
            if sha256(path) != source_hashes[str(path.relative_to(project))]:
                raise ValueError('Source changed during build; output was not published')
        shutil.copyfile(staged, output)
    result = {'method': 'official Android SDK CLI', 'signed': False, 'bootstrap_included': bootstrap is not None,
              'configuration': config, 'apk': str(output), 'bytes': output.stat().st_size,
              'sha256': sha256(output), 'engine_sha256': engine_hash, 'profiles_sha256': profiles_hash,
              'profile_count': len(profiles), 'rule_count': len({entry['kind'] for entry in profiles}),
              'source_sha256': source_hashes, 'elapsed_seconds': round(time.time() - started, 2)}
    metadata = output.with_suffix('.build.json')
    metadata.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({key: result[key] for key in ['apk', 'bytes', 'sha256', 'signed', 'bootstrap_included', 'elapsed_seconds']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
