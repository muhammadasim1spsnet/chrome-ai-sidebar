// ── CONFIG ──────────────────────────────────────────────────────────────────
let config = {
  url:   'http://localhost:3456',
  model: 'us.anthropic.claude-opus-4-6-v1'
};
let messages    = [];
let pageContent = '';
let isLoading   = false;

// Load saved config
chrome.storage.local.get(['claudeConfig'], r => {
  if (r.claudeConfig) {
    config = { ...config, ...r.claudeConfig };
    document.getElementById('cfg-url').value   = config.url;
    document.getElementById('cfg-model').value = config.model;
    updateModelBadge();
  }
});

function updateModelBadge() {
  const badge = document.getElementById('model-badge');
  const id = config.model || '';
  if (id.includes('opus-4-8'))        badge.textContent = 'Opus 4.8';
  else if (id.includes('opus-4-7'))   badge.textContent = 'Opus 4.7';
  else if (id.includes('opus-4-6'))   badge.textContent = 'Opus 4.6';
  else if (id.includes('sonnet-4-6')) badge.textContent = 'Sonnet 4.6';
  else if (id.includes('haiku'))      badge.textContent = 'Haiku 4.5';
  else badge.textContent = 'Claude';
}

// ── PAGE CONTENT ─────────────────────────────────────────────────────────────
async function loadPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    document.getElementById('page-title').textContent = tab.title || tab.url || 'Unknown page';

    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        url:   location.href,
        text:  document.body.innerText.slice(0, 4000)
      })
    });
    pageContent = `Page: ${res.result.title}\nURL: ${res.result.url}\n\n${res.result.text}`;
  } catch {
    pageContent = 'Could not read page content.';
    document.getElementById('page-title').textContent = 'Could not read page';
  }
}

setTimeout(loadPage, 500);
loadPage();

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function formatContent(text) {
  const div = document.createElement('div');
  // Simple code block handling
  const parts = text.split(/(```[\s\S]*?```)/g);
  parts.forEach(part => {
    if (part.startsWith('```')) {
      const lines = part.slice(3).split('\n');
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = lines.slice(1, -1).join('\n');
      pre.appendChild(code);
      div.appendChild(pre);
    } else {
      // Inline code
      const span = document.createElement('span');
      span.style.whiteSpace = 'pre-wrap';
      const inlineParts = part.split(/(`[^`]+`)/g);
      inlineParts.forEach(ip => {
        if (ip.startsWith('`') && ip.endsWith('`')) {
          const code = document.createElement('code');
          code.textContent = ip.slice(1, -1);
          span.appendChild(code);
        } else {
          span.appendChild(document.createTextNode(ip));
        }
      });
      div.appendChild(span);
    }
  });
  return div;
}

function addMessage(role, content, isThinking = false) {
  const empty = document.getElementById('empty');
  if (empty) empty.remove();

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  if (isThinking) row.id = 'thinking-msg';

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = `avatar ${role === 'user' ? 'user-av' : 'ai-av'}`;
  if (role === 'user') {
    avatar.textContent = 'U';
  } else {
    avatar.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm0 4l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" fill="#8b7cf8"/></svg>`;
  }

  // Body
  const body = document.createElement('div');
  body.className = 'msg-body';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = role === 'user' ? 'You' : 'Claude';

  if (role === 'assistant' && !isThinking && content) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    };
    meta.appendChild(copyBtn);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (isThinking) {
    bubble.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
  } else if (role === 'assistant') {
    bubble.appendChild(formatContent(content));
  } else {
    bubble.textContent = content;
  }

  body.appendChild(meta);
  body.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(body);

  document.getElementById('messages').appendChild(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return row;
}

function removeThinking() {
  document.getElementById('thinking-msg')?.remove();
}

// ── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function send(text) {
  const input = document.getElementById('userInput');
  const msg = text || input.value.trim();
  if (!msg || isLoading) return;

  isLoading = true;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;

  addMessage('user', msg);
  messages.push({ role: 'user', content: [{ type: 'text', text: msg }] });
  addMessage('assistant', '', true);

  try {
    const res = await fetch(`${config.url}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, pageContent })
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    removeThinking();
    addMessage('assistant', data.reply);
    messages.push({ role: 'assistant', content: [{ type: 'text', text: data.reply }] });

  } catch (err) {
    removeThinking();
    if (err.message.includes('Failed to fetch')) {
      addMessage('assistant', '❌ Cannot reach backend. Make sure your Node.js server is running:\n\n  cd backend\n  node server.js');
    } else {
      addMessage('assistant', `❌ Error: ${err.message}`);
    }
    showToast('Connection failed', true);
  }

  isLoading = false;
  document.getElementById('sendBtn').disabled = false;
  input.focus();
}

// ── SUGGESTION BUTTONS ────────────────────────────────────────────────────────
document.querySelectorAll('.suggestion').forEach(btn => {
  btn.addEventListener('click', () => send(btn.textContent));
});

// ── AUTO-RESIZE TEXTAREA ──────────────────────────────────────────────────────
document.getElementById('userInput').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

document.getElementById('userInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

document.getElementById('sendBtn').addEventListener('click', () => send());

// ── CLEAR ─────────────────────────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', () => {
  messages = [];
  const box = document.getElementById('messages');
  box.innerHTML = '';
  const empty = document.createElement('div');
  empty.id = 'empty';
  empty.innerHTML = `
    <div class="empty-logo">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm0 4l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" fill="#8b7cf8" opacity="0.7"/>
      </svg>
    </div>
    <h3>Ask Claude</h3>
    <p>Chat about the page you're reading or ask anything</p>
    <div class="suggestions">
      <button class="suggestion">Summarize this page</button>
      <button class="suggestion">What are the key points?</button>
      <button class="suggestion">Explain this in simple terms</button>
    </div>`;
  box.appendChild(empty);
  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => send(btn.textContent));
  });
});

// ── SETTINGS ─────────────────────────────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('settings').classList.toggle('open');
});

document.getElementById('saveSettings').addEventListener('click', () => {
  config.url   = document.getElementById('cfg-url').value.trim();
  config.model = document.getElementById('cfg-model').value.trim();
  chrome.storage.local.set({ claudeConfig: config });
  document.getElementById('settings').classList.remove('open');
  updateModelBadge();
  showToast('Settings saved ✓');
});
