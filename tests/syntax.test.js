// Pull every inline <script> out of season.html and syntax-check it.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, '..', 'season.html'), 'utf8');
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m, i = 0, bad = 0;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seasonchunks-'));

while ((m = re.exec(html)) !== null){
  i++;
  if (/\bsrc\s*=/.test(m[1])){
    console.log('  skip  #' + i + ' external: ' + m[1].trim());
    continue;
  }
  // line number of this chunk in the assembled file, for useful errors
  const line = html.slice(0, m.index).split('\n').length;
  const f = path.join(outDir, 'chunk' + String(i).padStart(2,'0') + '.js');
  fs.writeFileSync(f, m[2]);
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log('  ok    #' + i + '  (season.html line ' + line + ', ' +
                m[2].split('\n').length + ' lines)');
  } catch (e){
    bad++;
    console.log('  FAIL  #' + i + '  (season.html line ' + line + ')');
    console.log(String(e.stderr || e.stdout || e.message).split('\n').slice(0,8).join('\n'));
  }
}
console.log(bad ? '\n' + bad + ' script block(s) failed to parse' : '\nall script blocks parse');
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
