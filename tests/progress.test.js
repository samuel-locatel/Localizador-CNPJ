const path = require('path');
const os = require('os');
const fs = require('fs');
const { loadProgress, markDone, clearProgress } = require('../src/progress');

function tempProgressPath() {
  return path.join(os.tmpdir(), `progress-test-${Date.now()}.progress.json`);
}

describe('loadProgress', () => {
  it('returns empty set if file does not exist', () => {
    const result = loadProgress('/nonexistent/file.progress.json');
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns set of previously processed CNPJs', () => {
    const p = tempProgressPath();
    fs.writeFileSync(p, JSON.stringify(['11111111000100', '22222222000100']));
    const result = loadProgress(p);
    expect(result.has('11111111000100')).toBe(true);
    expect(result.has('22222222000100')).toBe(true);
    fs.unlinkSync(p);
  });
});

describe('markDone', () => {
  it('appends CNPJ to progress file', () => {
    const p = tempProgressPath();
    markDone(p, '11111111000100');
    markDone(p, '22222222000100');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(data).toContain('11111111000100');
    expect(data).toContain('22222222000100');
    fs.unlinkSync(p);
  });
});

describe('clearProgress', () => {
  it('deletes the progress file', () => {
    const p = tempProgressPath();
    fs.writeFileSync(p, JSON.stringify(['11111111000100']));
    clearProgress(p);
    expect(fs.existsSync(p)).toBe(false);
  });

  it('does nothing if file does not exist', () => {
    expect(() => clearProgress('/nonexistent/file.json')).not.toThrow();
  });
});
