'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const m=JSON.parse(fs.readFileSync('manifest.json','utf8')),p=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(m.manifest_version,3);assert.equal(m.version,p.version);assert.ok(fs.existsSync(m.options_page));
for(const f of ['core.js','app.js','spreadsheet.js','facebook-bridge.js','meta-ai-bridge.js','styles.css'])assert.ok(fs.statSync(f).size>0,f);
assert.ok(!fs.readFileSync('meta-ai-bridge.js','utf8').includes('fetch('));
assert.ok(fs.readFileSync('app.js','utf8').includes('COMMENT_CRAWL_META_PROMPT'));
assert.ok(require('./core.js').valid(require('./core.js').defaults()));
console.log('Validation passed: Manifest V3, app files, local state, and Meta AI Web UI bridge.');
