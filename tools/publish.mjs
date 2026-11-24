// Puts the app folder on GitHub Pages:  node tools/publish.mjs
//   1. refreshes the offline list (app/sw.js), so installed copies notice the update
//   2. pushes the app folder, exactly as it is on disk, to the "gh-pages" branch (that branch is the website)
// node tools/publish.mjs --dry   does everything except the push, and lists what would go up.
// The rest of the project (plan, tools, tests) lives on the "main" branch and is pushed with plain git.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'app');
const gitDir = path.join(root, '.git');
const dry = process.argv.includes('--dry');

if (!fs.existsSync(gitDir)) { console.error('This folder is not a git repository yet.'); process.exit(1); }

execFileSync(process.execPath, [path.join(root, 'tools', 'build-sw.mjs')], { stdio: 'inherit' });
const version = /VERSION = '([0-9a-f]+)'/.exec(fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8'))[1];

// Build the website's file list in a scratch index, so nothing staged or committed in the project is disturbed.
const index = path.join(gitDir, 'publish-index');
const env = { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: appDir, GIT_INDEX_FILE: index };
const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...args],
  { cwd: appDir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

try {
  fs.rmSync(index, { force: true });
  git('add', '--all', '--force', '.');
  const tree = git('write-tree');
  const files = git('ls-tree', '-r', '--name-only', tree).split('\n');
  if (!files.includes('index.html') || !files.includes('sw.js')) throw new Error('the app folder looks incomplete');

  if (dry) {
    console.log(`Dry run: version ${version}, ${files.length} files would be published:`);
    console.log(files.map(f => '  ' + f).join('\n'));
  } else {
    const commit = git('commit-tree', tree, '-m', `Publish ${version}`);
    git('push', '--force', 'origin', `${commit}:refs/heads/gh-pages`);
    console.log(`Published version ${version} (${files.length} files). The site updates in a minute or two.`);
  }
} finally {
  fs.rmSync(index, { force: true });
}
