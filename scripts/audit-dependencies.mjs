import { spawnSync } from 'node:child_process';

const acceptedVulnerabilities = new Map([
  ['@react-native/community-cli-plugin', ['@react-native/metro-config']],
  ['@react-native/metro-config', ['metro-config']],
  ['@react-native/virtualized-lists', ['react-native']],
  ['image-size', ['GHSA-w3rx-r6r6-pgpr', 'GHSA-5p2g-fcmc-qvqq']],
  ['metro', ['image-size', 'metro-config', 'metro-transform-worker']],
  ['metro-config', ['metro']],
  ['metro-transform-worker', ['metro']],
  [
    'react-native',
    ['@react-native/community-cli-plugin', '@react-native/virtualized-lists'],
  ],

  // Build and test tooling only. None of these packages is bundled into the
  // Android or iOS app; they run on developer machines and CI. They are
  // accepted until the Jest, ESLint and React Native CLI majors that carry the
  // upstream fixes are adopted.
  ['@jest/core', ['jest-config']],
  ['create-jest', ['jest-config']],
  ['jest', ['@jest/core', 'jest-cli']],
  ['jest-cli', ['@jest/core', 'create-jest', 'jest-config']],
  ['jest-config', ['deepmerge']],
  ['deepmerge', ['GHSA-gcqx-w48m-w2h4']],
  ['glob', ['GHSA-3g3m-2fjr-6pw4', 'minimatch']],
  ['minimatch', ['GHSA-g3hv-75wg-m249']],
  ['babel-plugin-module-resolver', ['glob']],
  [
    '@typescript-eslint/eslint-plugin',
    ['@typescript-eslint/type-utils', '@typescript-eslint/utils'],
  ],
  ['@typescript-eslint/parser', ['@typescript-eslint/typescript-estree']],
  [
    '@typescript-eslint/type-utils',
    ['@typescript-eslint/typescript-estree', '@typescript-eslint/utils'],
  ],
  ['@typescript-eslint/typescript-estree', ['minimatch']],
  ['@typescript-eslint/utils', ['@typescript-eslint/typescript-estree']],
  [
    '@react-native-community/cli',
    [
      '@react-native-community/cli-config',
      '@react-native-community/cli-doctor',
      'deepmerge',
    ],
  ],
  ['@react-native-community/cli-config', ['deepmerge']],
  [
    '@react-native-community/cli-doctor',
    ['@react-native-community/cli-config', 'deepmerge'],
  ],
]);

const result = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch (parseError) {
  if (parseError instanceof Error) {
    process.stderr.write(`${parseError.message}\n`);
  }
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const vulnerabilities = Object.values(report.vulnerabilities ?? {});
const unresolved = vulnerabilities.filter(vulnerability => {
  const expectedVia = acceptedVulnerabilities.get(vulnerability.name);
  if (!expectedVia) return true;
  const actualVia = (vulnerability.via ?? [])
    .map(item =>
      typeof item === 'string' ? item : item.url?.split('/').pop() ?? '',
    )
    .sort();
  return (
    actualVia.length !== expectedVia.length ||
    actualVia.some((item, index) => item !== [...expectedVia].sort()[index])
  );
});

if (unresolved.length) {
  process.stderr.write(
    `Unapproved npm audit findings: ${unresolved
      .map(vulnerability => `${vulnerability.name} (${vulnerability.severity})`)
      .join(', ')}\n`,
  );
  process.exit(1);
}

if (vulnerabilities.length) {
  console.log(
    'Accepted build-tool exceptions: the React Native 0.87.1 Metro chain is awaiting a compatible upstream fix; its image-size findings are GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq. Jest, ESLint/TypeScript-ESLint and React Native CLI findings are development-only and are tracked for a future tooling upgrade.',
  );
}
