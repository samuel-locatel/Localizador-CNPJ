const fs = require('fs');

function loadProgress(progressPath) {
  if (!fs.existsSync(progressPath)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    return new Set(data);
  } catch {
    return new Set();
  }
}

function markDone(progressPath, cnpj) {
  let existing = [];
  if (fs.existsSync(progressPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    } catch {
      existing = [];
    }
  }
  existing.push(cnpj);
  fs.writeFileSync(progressPath, JSON.stringify(existing), 'utf8');
}

function clearProgress(progressPath) {
  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
}

module.exports = { loadProgress, markDone, clearProgress };
