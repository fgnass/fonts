// Publishes dist/ (from `npm run build`) to the gh-pages branch, which GitHub
// Pages serves at fonts.gnass.buzz (public/CNAME). The font data in
// public/data is not in git, so the site is built locally. Each deploy
// replaces the branch with a single commit, so old data does not pile up.
//
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

const remote = git(['remote', 'get-url', 'origin']);
const name = git(['config', 'user.name']), email = git(['config', 'user.email']);
const commit = git(['rev-parse', '--short', 'HEAD']);
const dirty = git(['status', '--porcelain']) ? ' (with uncommitted changes)' : '';

// A fresh repository in a copy of dist/: the build output only.
const dir = mkdtempSync(join(tmpdir(), 'fonts-deploy-'));
try {
  execFileSync('cp', ['-R', 'dist/.', dir]);
  // No Jekyll processing on GitHub Pages.
  writeFileSync(join(dir, '.nojekyll'), '');
  git(['init', '-q', '-b', 'gh-pages'], dir);
  git(['add', '-A'], dir);
  git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Deploy ${commit}${dirty}`], dir);
  execFileSync('git', ['push', '--force', remote, 'gh-pages'], { cwd: dir, stdio: 'inherit' });
  console.log(`Deployed ${commit}${dirty} to gh-pages`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
