import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Structural enforcement of docs/ARCHITECTURE.md's section 8.0: the accountability
 * (photo verification) and safety (wellness/SOS/duress) mechanisms must be separate code
 * paths. This walks every source file under each feature directory and greps its import
 * statements for a reference to the other directory — mirroring what apps/api's own
 * safety-firewall test does for the backend (see docs/ARCHITECTURE.md).
 */

const SRC_ROOT = path.join(__dirname, '..', 'src', 'features');
const SAFETY_DIR = path.join(SRC_ROOT, 'safety');
const VERIFICATION_DIR = path.join(SRC_ROOT, 'verification');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function importsMatching(file: string, pattern: RegExp): string[] {
  const content = fs.readFileSync(file, 'utf8');
  const importLines = content
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line) || /\brequire\(/.test(line));
  return importLines.filter((line) => pattern.test(line));
}

describe('safety/verification firewall', () => {
  it('both directories exist and are non-empty (the assertions below would be vacuous otherwise)', () => {
    expect(fs.existsSync(SAFETY_DIR)).toBe(true);
    expect(fs.existsSync(VERIFICATION_DIR)).toBe(true);
    expect(listSourceFiles(SAFETY_DIR).length).toBeGreaterThan(0);
    expect(listSourceFiles(VERIFICATION_DIR).length).toBeGreaterThan(0);
  });

  it('no file under src/features/safety imports from src/features/verification', () => {
    const offenders: Record<string, string[]> = {};
    for (const file of listSourceFiles(SAFETY_DIR)) {
      const hits = importsMatching(file, /features\/verification/);
      if (hits.length > 0) offenders[file] = hits;
    }
    expect(offenders).toEqual({});
  });

  it('no file under src/features/verification imports from src/features/safety', () => {
    const offenders: Record<string, string[]> = {};
    for (const file of listSourceFiles(VERIFICATION_DIR)) {
      const hits = importsMatching(file, /features\/safety/);
      if (hits.length > 0) offenders[file] = hits;
    }
    expect(offenders).toEqual({});
  });
});
