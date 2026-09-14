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
]);

const result = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
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
    'Accepted build-tool exceptions: the React Native 0.87.1 Metro chain is awaiting a compatible upstream fix; its image-size findings are GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq.',
  );
}
