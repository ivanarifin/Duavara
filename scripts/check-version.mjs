import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = relativePath =>
  readFileSync(resolve(projectRoot, relativePath), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const packageVersion = packageJson.version;
if (typeof packageVersion !== 'string' || packageVersion.length === 0) {
  throw new Error(
    'Version check failed: package.json must contain a non-empty string version.',
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
const positiveInteger = (value, label) => {
  const normalized = String(value ?? '').trim();
  const parsed = Number(normalized);
  if (
    !/^\d+$/.test(normalized) ||
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `Version check failed: ${label} must be a positive integer (received ${
        value ?? 'nothing'
      }).`,
    );
  }
  return parsed;
};
const requestedIosBuild =
  process.env.DUAVARA_IOS_BUILD_NUMBER ?? optionValue('--ios-build-number');
const requestedAndroidBuild =
  process.env.DUAVARA_VERSION_CODE ??
  process.env.DUAVARA_ANDROID_BUILD_CODE ??
  optionValue('--android-build-code');

const xcodeProject = read('ios/Duavara.xcodeproj/project.pbxproj');
const marketingVersions = [
  ...xcodeProject.matchAll(/^\s*MARKETING_VERSION = ([^;]+);$/gm),
].map(match => match[1]);
if (marketingVersions.length === 0) {
  throw new Error('Version check failed: no iOS MARKETING_VERSION was found.');
}
if (marketingVersions.some(version => version !== packageVersion)) {
  throw new Error(
    `Version check failed: package.json version ${packageVersion} does not match iOS MARKETING_VERSION values ${marketingVersions.join(
      ', ',
    )}.`,
  );
}

const buildNumbers = [
  ...xcodeProject.matchAll(/^\s*CURRENT_PROJECT_VERSION = ([^;]+);$/gm),
].map(match => match[1]);
if (buildNumbers.length === 0) {
  throw new Error(
    'Version check failed: no iOS CURRENT_PROJECT_VERSION was found.',
  );
}
const parsedBuildNumbers = buildNumbers.map(buildNumber =>
  positiveInteger(buildNumber, 'iOS CURRENT_PROJECT_VERSION'),
);
const iosBuildNumber = positiveInteger(
  requestedIosBuild ?? parsedBuildNumbers[0],
  'iOS build number',
);

const androidBuildGradle = read('android/app/build.gradle');
if (
  !androidBuildGradle.includes(
    'def packageJson = new groovy.json.JsonSlurper().parse(file("../../package.json"))',
  ) ||
  !androidBuildGradle.includes('versionName packageJson.version.toString()') ||
  !androidBuildGradle.includes('versionCode versionCodeValue.toInteger()')
) {
  throw new Error(
    'Version check failed: Android versionName must derive from ../../package.json via packageJson.version.',
  );
}

const androidBuildCode = positiveInteger(
  requestedAndroidBuild ?? '1',
  'Android build code',
);

console.log(
  `Version check passed: ${packageVersion} (iOS build ${iosBuildNumber}; Android build code ${androidBuildCode}; Android versionName from package.json).`,
);
