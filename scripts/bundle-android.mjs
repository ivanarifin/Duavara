import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const format = process.argv[2];

if (format !== 'apk' && format !== 'aab') {
  throw new Error(
    'Usage: node scripts/bundle-android.mjs <apk|aab> [--version-code <positive-integer>]',
  );
}

const optionValue = option => {
  const optionIndex = process.argv.findIndex(
    argument => argument === option || argument.startsWith(`${option}=`),
  );
  if (optionIndex === -1) return undefined;
  const argument = process.argv[optionIndex];
  return argument.startsWith(`${option}=`)
    ? argument.slice(option.length + 1)
    : process.argv[optionIndex + 1] ?? '';
};
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const requestedVersionCode =
  optionValue('--version-code') ??
  optionValue('--android-build-code') ??
  (process.argv[3] && !process.argv[3].startsWith('-')
    ? process.argv[3]
    : undefined) ??
  process.env.DUAVARA_VERSION_CODE ??
  process.env.DUAVARA_ANDROID_BUILD_CODE ??
  '1';
const normalizedVersionCode = String(requestedVersionCode).trim();
const versionCode = Number(normalizedVersionCode);
if (
  !/^\d+$/.test(normalizedVersionCode) ||
  !Number.isSafeInteger(versionCode) ||
  versionCode < 1
) {
  throw new Error(
    'Android build code must be a positive integer (use --version-code or DUAVARA_VERSION_CODE)',
  );
}

const artifactName = `${packageJson.name}-${packageJson.version}.${format}`;
const gradleTask =
  format === 'apk' ? ':app:assembleRelease' : ':app:bundleRelease';
const sourcePath = join(
  'android',
  'app',
  'build',
  'outputs',
  format === 'apk' ? 'apk' : 'bundle',
  'release',
  `app-release.${format}`,
);
const gitStatus = spawnSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
if (gitStatus.status !== 0 || gitStatus.stdout.trim()) {
  throw new Error(
    'Refusing to create a release artifact from an uncommitted working tree. Commit the release candidate first.',
  );
}

const outputDirectory = 'dist';
const outputPath = join(outputDirectory, artifactName);
const checksumPath = `${outputPath}.sha256`;
const metadataPath = `${outputPath}.json`;

mkdirSync(outputDirectory, { recursive: true });
[outputPath, checksumPath, metadataPath].forEach(function (path) {
  rmSync(path, { force: true });
});

const result = spawnSync('./gradlew', [gradleTask], {
  cwd: 'android',
  env: { ...process.env, DUAVARA_VERSION_CODE: String(versionCode) },
  stdio: 'inherit',
});

if (result.status !== 0) process.exit(result.status || 1);
if (!existsSync(sourcePath)) {
  throw new Error(`Expected release artifact was not created: ${sourcePath}`);
}

copyFileSync(sourcePath, outputPath);
const sha256 = createHash('sha256')
  .update(readFileSync(outputPath))
  .digest('hex');
writeFileSync(checksumPath, `${sha256}  ${artifactName}\n`);

const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const gitSha = gitResult.status === 0 ? gitResult.stdout.trim() : null;
if (!gitSha) throw new Error('Unable to determine the release commit SHA.');

writeFileSync(
  metadataPath,
  `${JSON.stringify(
    { version: packageJson.version, versionCode, gitSha },
    null,
    2,
  )}\n`,
);

console.log(`\nRelease ${format.toUpperCase()}: ${outputPath}`);
console.log(`SHA-256: ${checksumPath}`);
console.log(`Metadata: ${metadataPath}`);
