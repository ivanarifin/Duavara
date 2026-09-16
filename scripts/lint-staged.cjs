const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

function gitFileList(args) {
  return execFileSync('git', args, { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

const isLintTarget = file => /\.[cm]?[jt]sx?$/.test(file);
const stagedFiles = gitFileList([
  'diff',
  '--cached',
  '--name-only',
  '-z',
  '--diff-filter=ACMR',
]).filter(isLintTarget);
const unstagedFilePaths = gitFileList([
  'diff',
  '--name-only',
  '-z',
  '--diff-filter=ACMR',
]);
const unstagedFiles = new Set(unstagedFilePaths);

function isPartiallyStaged(file) {
  return unstagedFiles.has(file);
}

const partiallyStagedFiles = stagedFiles.filter(isPartiallyStaged);

if (!stagedFiles.length) {
  console.log('No staged JavaScript or TypeScript files to lint.');
  process.exit(0);
}

if (partiallyStagedFiles.length) {
  throw new Error(
    `Partially staged source files cannot be linted safely:\n${partiallyStagedFiles
      .map(file => `  - ${file}`)
      .join('\n')}\nStage or unstage the remaining changes, then commit again.`
  );
}

const eslint = resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint'
);

if (!existsSync(eslint)) {
  throw new Error(
    'ESLint is not installed. Run npm install before committing.'
  );
}

execFileSync(eslint, ['--', ...stagedFiles], { stdio: 'inherit' });
