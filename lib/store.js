'use strict';
// JSON file store under data/. Writes go to a temp file first and are then
// renamed into place, so a crash or power cut never leaves half a file.
const fs = require('node:fs');
const path = require('node:path');

class JsonFile {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = null;
  }

  load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Could not read ${this.file}: ${err.message}`);
      this.data = structuredClone(this.defaults);
    }
    return this.data;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, this.file); return; } catch (err) {
        // Windows can briefly lock a file (antivirus, indexer). Retry a little.
        if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
        const until = Date.now() + 50 * (i + 1);
        while (Date.now() < until) { /* short wait */ }
      }
    }
  }
}

module.exports = { JsonFile };
