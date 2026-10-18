import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8765;

const possibleVaultPaths = [
  path.join(__dirname, '../../AI-Brain'),
  path.join(__dirname, '../AI-Brain'),
  path.join(os.homedir(), 'Documents', 'AI-Brain'),
  path.join(__dirname, '../../AI-Brain-Vault/AI-Brain'),
  '/home/user/AI-Brain',
  path.join(__dirname, '../AI-Brain')
];

let VAULT_PATH = null;
for (const p of possibleVaultPaths) {
  if (fs.existsSync(p)) { VAULT_PATH = p; break; }
}
if (!VAULT_PATH) VAULT_PATH = path.join(__dirname, '../AI-Brain');

console.log('Vault path:', VAULT_PATH);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

function ensureDir(rel) {
  const full = path.join(VAULT_PATH, rel);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  return full;
}
function appendJsonl(relFile, obj) {
  const full = path.join(VAULT_PATH, relFile);
  ensureDir(path.dirname(relFile));
  fs.appendFileSync(full, JSON.stringify(obj) + '\n');
}
function writeMarkdown(relFile, content) {
  const full = path.join(VAULT_PATH, relFile);
  ensureDir(path.dirname(relFile));
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

app.post('/capture', (req, res) => {
  const data = req.body;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth()+1).padStart(2,'0');
  try {
    if (data.type === 'browser_visit') {
      const rel = `02 Sources/Browser Activity/${year}/${month}.jsonl`;
      appendJsonl(rel, {url: data.url, title: data.title, visited_at: data.visited_at || data.captured_at, capture_status: data.capture_status || 'visit-only', source: data.source || 'history-api'});
      appendJsonl(`09 Activity & Undo/${year}/${month}.md`, `[${now.toISOString()}] visit ${data.url} - ${data.capture_status}`);
    } else if (data.type === 'web_page') {
      if (!data.url) throw new Error('no url');
      const id = Date.now();
      const rel = `02 Sources/Web Pages/${year}/${id}.md`;
      const md = `---\nid: web-${id}\nurl: ${data.url}\ntitle: ${data.title || ''}\ncaptured_at: ${data.captured_at}\n---\n\n# ${data.title || data.url}\n\nSource: ${data.url}\n\n## Content\n${(data.content||'').slice(0,10000)}\n`;
      writeMarkdown(rel, md);
      appendJsonl(`02 Sources/Browser Activity/${year}/${month}.jsonl`, {url: data.url, title: data.title, visited_at: data.captured_at, capture_status: 'content-captured', source_id: rel});
    } else if (data.type === 'conversation') {
      const provider = data.provider || 'Other';
      const id = data.conversation_id || Date.now();
      const rel = `02 Sources/Conversations/${provider}/${year}/${id}.md`;
      const transcript = (data.messages||[]).map(m => `### [${m.role}] ${m.timestamp}\n${m.text}\n`).join('\n');
      const md = `---\nid: ${id}\nprovider: ${provider}\ntitle: ${data.title || ''}\ncaptured_at: ${data.captured_at}\n---\n\n# ${data.title || 'Conversation '+id}\n\nProvider: ${provider}\nURL: ${data.url || ''}\n\n## Transcript\n${transcript}\n`;
      writeMarkdown(rel, md);
    } else if (data.type === 'capsule') {
      const c = data.capsule;
      const rel = `03 Memory/Entities/capsule-${c.id}.md`;
      const md = `---\nid: ${c.id}\ntitle: ${c.title}\ncreated: ${c.created}\nupdated: ${c.updated}\nversion: ${c.version}\n---\n\n# Capsule: ${c.title}\n\n## Goals\n${(c.goals||[]).map(g=>'- '+g).join('\n')}\n\n## Constraints\n${(c.constraints||[]).map(c=>'- '+c).join('\n')}\n\n## Background\n${c.background||''}\n`;
      writeMarkdown(rel, md);
    } else if (data.type === 'wasnt_accessible') {
      const rel = `01 Inbox/Processing Errors/${year}-${month}.md`;
      ensureDir('01 Inbox/Processing Errors');
      const full = path.join(VAULT_PATH, rel);
      fs.appendFileSync(full, `- ${data.captured_at} wasn't accessible: ${data.url} - reason: ${data.reason}\n`);
    }
    res.json({ok: true, vault: VAULT_PATH});
  } catch (e) {
    console.error(e);
    res.status(500).json({error: e.message});
  }
});

app.get('/context', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({capsules: [], entities: [], claims: []});
  try {
    const entitiesDir = path.join(VAULT_PATH, '03 Memory/Entities');
    let capsules = [];
    if (fs.existsSync(entitiesDir)) {
      const files = fs.readdirSync(entitiesDir).filter(f=>f.endsWith('.md')).slice(-100);
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(entitiesDir, file), 'utf-8');
          const lower = content.toLowerCase();
          let score = 0;
          const qWords = q.split(' ').filter(w=>w.length>2);
          for (const w of qWords) if (lower.includes(w)) score++;
          if (q && lower.includes(q)) score+=5;
          if (score>0) {
            const idMatch = content.match(/id:\s*(.+)/);
            const titleMatch = content.match(/title:\s*(.+)/) || content.match(/# Capsule:\s*(.+)/);
            const id = idMatch ? idMatch[1].trim() : file.replace('.md','');
            const title = titleMatch ? titleMatch[1].trim() : file;
            capsules.push({id, title, background: content.slice(0,500), goals: [], score});
          }
        } catch(e) {}
      }
      capsules.sort((a,b)=>b.score-a.score);
      capsules = capsules.slice(0,5).map(({score, ...r})=>r);
    }
    res.json({capsules, entities: [], claims: []});
  } catch(e) { res.json({capsules: [], entities: [], claims: []}); }
});

app.get('/', (req,res)=>res.json({ok:true, vault: VAULT_PATH, message: 'AI ASSistant Vault API at 127.0.0.1:8765'}));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`AI ASSistant Vault API running at http://127.0.0.1:${PORT}`);
  console.log(`Vault: ${VAULT_PATH}`);
});