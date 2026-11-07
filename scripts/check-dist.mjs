// Run after `npm run build`: checks the built site in dist/ (spec: .kiro/specs/hosting).
// 1. No test fixtures were bundled.
// 2. Nothing in dist/ points at another domain, so the site makes no request to another origin at run time.
// 3. The font and the favicon are present (spec: .kiro/specs/skin-and-sound).
// Usage: node scripts/check-dist.mjs [dist-directory]
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`check-dist: ${path.join(dist, 'index.html')} not found. Run "npm run build" first.`);
  process.exit(1);
}

// Text that only the fixture levels and the fixture page contain.
const FIXTURE_MARKERS = ['tests/fixtures', '(fixtures)', 'Fixture Corridor', 'Fixture Lab', 'fixture-corridor', 'fixture-lab'];
// Any absolute http(s) URL, except the XML namespace strings that SVG and DOM code carry.
const EXTERNAL_URL = /https?:\/\/(?!www\.w3\.org\/)[^\s"'`)]+/g;
// A protocol-relative reference such as src="//cdn.example/x.js".
const PROTOCOL_RELATIVE = /(?:src|href|action)\s*=\s*["']\/\/[^\s"']+/g;

// The font file and its licence hold licence text (for example http://scripts.sil.org/OFL) that the page never loads,
// so the text scans skip them (skin-and-sound S12). The path check still runs on every file.
const LICENCE_ONLY = /\.ttf$|(^|[\\/])OFL\.txt$/;
// Files the skinned page needs; reported through the same problems list.
const REQUIRED_FILES = ['fonts/vt323-regular.ttf', 'favicon.svg'];

const files = fs
  .readdirSync(dist, { recursive: true })
  .map(String)
  .filter((file) => fs.statSync(path.join(dist, file)).isFile());

const problems = [];
for (const file of files) {
  if (/(^|[\\/])(tests|fixtures)([\\/]|$)/.test(file)) {
    problems.push(`${file}: the path is inside a tests or fixtures folder`);
  }
  if (LICENCE_ONLY.test(file)) continue;
  const text = fs.readFileSync(path.join(dist, file), 'utf8');
  for (const marker of FIXTURE_MARKERS) {
    if (text.includes(marker)) problems.push(`${file}: contains the fixture text "${marker}"`);
  }
  for (const match of text.match(EXTERNAL_URL) ?? []) problems.push(`${file}: external URL ${match}`);
  for (const match of text.match(PROTOCOL_RELATIVE) ?? []) problems.push(`${file}: external reference ${match}`);
}

for (const required of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(dist, required))) problems.push(`${required}: required file is missing from dist`);
}

if (problems.length > 0) {
  console.error(`check-dist: ${problems.length} problem(s) in ${dist}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check-dist: ok (${files.length} files in ${dist}: no fixtures, no external URLs, font and favicon present)`);
