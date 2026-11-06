// The IDE starts hook commands from a lowercase drive path (d:\...). On Windows, Vitest run from a cwd whose
// drive letter case differs from the real path loads two copies of itself and every suite fails. This wrapper fixes the cwd first.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

process.chdir(fs.realpathSync.native(process.cwd()));

const result = spawnSync(process.argv.slice(2).join(' '), { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
