import { useState, useEffect } from 'react';

export default function VaultPanel() {
  const [capsules, setCapsules] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [openLoops, setOpenLoops] = useState(null);
  const [blacklist, setBlacklist] = useState([]);
  const [newBlacklist, setNewBlacklist] = useState("");

  useEffect(() => {
    fetchCapsules();
    fetchBlacklist();
  }, []);

  async function fetchCapsules() {
    try {
      const res = await fetch('http://127.0.0.1:8765/context?q=project');
      if (res.ok) {
        const data = await res.json();
        setCapsules(data.capsules || []);
      }
    } catch(e) {
      // Fallback to localStorage
      const data = JSON.parse(localStorage.getItem('capsules') || '[]');
      setCapsules(data.slice(-10).reverse());
    }
  }

  async function fetchBlacklist() {
    try {
      // Try chrome storage if in extension context, else local
      if (window.chrome && chrome.storage) {
        const data = await chrome.storage.sync.get({excluded_patterns: []});
        setBlacklist(data.excluded_patterns || []);
      }
    } catch(e) {}
  }

  async function addBlacklist() {
    if (!newBlacklist.trim()) return;
    const updated = [...blacklist, newBlacklist.trim()];
    setBlacklist(updated);
    setNewBlacklist("");
    try {
      if (window.chrome && chrome.storage) {
        await chrome.storage.sync.set({excluded_patterns: updated});
      }
      await fetch('http://127.0.0.1:8765/capture', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({type: 'blacklist_update', excluded_patterns: updated})
      });
    } catch(e) {}
  }

  return (
    <div className="vault-panel w-80 bg-[#0f0f0f] border-l border-[#333] p-4 overflow-y-auto h-full text-white">
      <h2 className="text-sm font-bold mb-3">AI-Brain Vault</h2>
      
      <div className="mb-6">
        <h3 className="text-xs text-[#aaa] uppercase mb-2">Current Snapshot</h3>
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 text-xs">
          <p className="text-[#ccc]">Short-lived view of NOW. Auto-refreshed from graph.</p>
          <p className="mt-2 text-[10px] text-[#666]">See 04 Working Memory/Current Snapshot.md</p>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-xs text-[#aaa] uppercase mb-2">Capsules (Drag to chat)</h3>
        <div className="space-y-2">
          {capsules.length === 0 ? <p className="text-[11px] text-[#666]">No capsules yet. Capture from any AI chat.</p> :
            capsules.map(c => (
              <div key={c.id} draggable onDragStart={e => {
                e.dataTransfer.setData('application/x-capsule', JSON.stringify(c));
                e.dataTransfer.setData('text/plain', `[${c.title}]`);
              }} className="bg-[#1e1e1e] border border-[#333] rounded-lg p-2 cursor-grab hover:border-[#555]">
                <div className="text-xs font-semibold truncate">{c.title}</div>
                <div className="text-[10px] text-[#aaa] truncate">{c.background?.slice(0,60) || ''}</div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-xs text-[#aaa] uppercase mb-2">Never-Check Blacklist</h3>
        <p className="text-[10px] text-[#666] mb-2">Empty = check everything (your default rule)</p>
        <div className="flex gap-2 mb-2">
          <input value={newBlacklist} onChange={e=>setNewBlacklist(e.target.value)} placeholder="bank.com/*" className="flex-1 bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 text-xs text-white" />
          <button onClick={addBlacklist} className="bg-[#333] hover:bg-[#444] px-3 py-1 rounded text-xs">Add</button>
        </div>
        <div className="space-y-1">
          {blacklist.map(p => (
            <div key={p} className="flex justify-between bg-[#2a2a2a] px-2 py-1 rounded text-[11px]">
              <span>{p}</span>
              <button onClick={async () => {
                const updated = blacklist.filter(x=>x!==p);
                setBlacklist(updated);
                if (window.chrome && chrome.storage) await chrome.storage.sync.set({excluded_patterns: updated});
              }} className="text-[#888] hover:text-white">x</button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-xs text-[#aaa] uppercase mb-2">Open Loops</h3>
        <p className="text-[11px] text-[#666]">See 04 Working Memory/Open Loops.md - unresolved questions, commitments.</p>
      </div>

      <div className="text-[10px] text-[#555]">
        <p>Vault: AI-Brain/ - canonical memory</p>
        <p>API: 127.0.0.1:8765 - driver</p>
        <p>Extension: collector + suggester</p>
      </div>
    </div>
  );
}