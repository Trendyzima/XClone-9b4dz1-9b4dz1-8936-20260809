'use strict';

/**

* _preload.cjs v5
* 
* Protection layers:
* 
* 1. DISK PATCH
* Fix Vite dep-*.js chunks on disk and lock them read-only.
* 
* 2. CJS HOOK
* Fix malformed Vite chunks loaded through CommonJS.
* 
* 3. FILE WATCHER
* Detect and repair OnSpace re-injection after startup.
* 
* ESM handling is provided separately by:
* 
* --experimental-loader vite-fix-loader.mjs

*/

const fs = require('fs');
const path = require('path');
const Module = require('module');

const CHUNKS_DIR = path.join(
__dirname,
'node_modules',
'vite',
'dist',
'node',
'chunks'
);

// ─── Core fix function ───────────────────────────────────────────────────────

function applyFix(s) {
if (!s.includes('??')) return s;

// 1. The most common form: code??"", or code??''
s = s.split('code??"", ').join('code, ');
s = s.split("code??'', ").join('code, ');
s = s.split('code??"",').join('code,');
s = s.split("code??'',").join('code,');
s = s.split('code??""').join('code');
s = s.split("code??''").join('code');

// 2. Any identifier??string (quoted strings)
s = s.replace(
/([A-Za-z_$][A-Za-z0-9_$])??"([^"\])"/g,
'$1'
);

s = s.replace(
/([A-Za-z_$][A-Za-z0-9_$])??'([^'\])'/g,
'$1'
);

// 3. Bare ??string
s = s.replace(/??"[^"]"/g, '');
s = s.replace(/??'[^']'/g, '');

// 4. ??methodName(...) { — same line
s = s.replace(
/??(?=[A-Za-z_$][A-Za-z0-9_$]\s[^)]{0,120}\s*{)/g,
' '
);

// 5. ??\n methodName(...) { — cross-line
s = s.replace(
/??(\r?\n[ \t])(?=[A-Za-z_$][A-Za-z0-9_$]\s[^)]{0,120}\s{)/g,
'$1'
);

// 6. ?? at the start of a line
s = s.replace(
/(\r?\n)([ \t]*)??(?=[^\s?])/g,
'$1$2'
);

// 7. identifier?? at end of line
s = s.replace(
/([A-Za-z_$][A-Za-z0-9_$]*)??(\r?\n)/g,
'$1$2'
);

// 8. identifier??( — ?? injected between method name and parens
// Example: toJSON??() { → toJSON() {
s = s.replace(
/([A-Za-z_$][A-Za-z0-9_$])??(?=\s[^)]{0,200}\s*{)/g,
'$1'
);

return s;
}

// ─── Malformed syntax verification ──────────────────────────────────────────

function hasMalformedSyntax(s) {
return /[A-Za-z_$][A-Za-z0-9_$]??\s[^)]{0,200}\s*{/.test(s);
}

// ─── Patch one file ──────────────────────────────────────────────────────────

function patchFile(fpath) {
let src;

try {
try {
fs.chmodSync(fpath, 0o644);
} catch (_) {}

src = fs.readFileSync(fpath, 'utf8');

} catch (_) {
return false;
}

const lock = () => {
try {
fs.chmodSync(fpath, 0o444);
} catch (_) {}
};

if (!src.includes('??')) {
lock();
return false;
}

const fixed = applyFix(src);

if (fixed === src) {
lock();
return false;
}

if (hasMalformedSyntax(fixed)) {
process.stderr.write(
'[preload-fix] ⚠️ repair incomplete: ' +
path.basename(fpath) +
'\n'
);

lock();
return false;

}

try {
fs.writeFileSync(fpath, fixed, 'utf8');
lock();

process.stderr.write(
  '[preload-fix] ✅ patched and verified ' +
  path.basename(fpath) +
  '\n'
);

return true;

} catch (e) {
lock();

process.stderr.write(
  '[preload-fix] ⚠️ write failed ' +
  path.basename(fpath) +
  ': ' +
  e.message +
  '\n'
);

return false;

}
}

// ─── Patch all Vite chunks ───────────────────────────────────────────────────

function patchAll(label) {
if (!fs.existsSync(CHUNKS_DIR)) {
return;
}

let files;

try {
files = fs
.readdirSync(CHUNKS_DIR)
.filter(f => f.endsWith('.js'));
} catch (_) {
return;
}

let count = 0;

for (const file of files) {
if (patchFile(path.join(CHUNKS_DIR, file))) {
count++;
}
}

if (count > 0) {
process.stderr.write(
'[preload-fix] 💾 patchAll(' +
label +
') fixed ' +
count +
' file(s)\n'
);
}
}

// ─── STEP 1: Initial disk patch ──────────────────────────────────────────────

patchAll('startup');

// ─── STEP 2: CJS fallback ────────────────────────────────────────────────────

const originalCompile = Module.prototype._compile;

Module.prototype._compile = function compileFix(content, filename) {
if (
filename &&
filename.includes('/vite/dist/node/') &&
content.includes('??')
) {
const fixed = applyFix(content);

if (fixed !== content) {
  process.stderr.write(
    '[preload-fix] 🔧 _compile fixed ' +
    path.basename(filename) +
    '\n'
  );

  return originalCompile.call(
    this,
    fixed,
    filename
  );
}

}

return originalCompile.call(
this,
content,
filename
);
};

// ─── STEP 3: Watch Vite chunks ───────────────────────────────────────────────

(function watchChunks() {
if (!fs.existsSync(CHUNKS_DIR)) {
return;
}

let files;

try {
files = fs
.readdirSync(CHUNKS_DIR)
.filter(f => f.endsWith('.js'));
} catch (_) {
return;
}

for (const file of files) {
const fp = path.join(CHUNKS_DIR, file);

try {
  const watcher = fs.watch(
    fp,
    {
      persistent: false
    },
    evt => {
      if (evt === 'change') {
        patchFile(fp);
      }
    }
  );

  watcher.on('error', () => {});
} catch (_) {}

try {
  fs.watchFile(
    fp,
    {
      persistent: false,
      interval: 250
    },
    () => {
      patchFile(fp);
    }
  );
} catch (_) {}

}
})();

process.stderr.write(
'[preload-fix] ✅ preload v5 installed ' +
'(disk-patch + CJS hook + watcher)\n'
);
