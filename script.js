/* ============================================================
   AURIX AI — script.js
   Gemini API + Autonomous Agent + Tools (Wikipedia, PDF, Study, Notes)
   ============================================================ */

// ── State ──────────────────────────────────────────────────
const STATE = {
  mode: 'autonomous',          // 'minimal' | 'autonomous'
  apiKey: '',
  model: 'gemini-2.0-flash',
  maxSteps: 5,
  messages: [],                // {role, content, steps?, toolUsed?}
  history: [],                 // [{id, title, messages}]
  currentChatId: null,
  pdfText: '',
  pdfName: '',
  isThinking: false,
};

// ── DOM refs ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const sidebar        = $('sidebar');
const sidebarToggle  = $('sidebarToggle');
const menuBtn        = $('menuBtn');
const minimalBtn     = $('minimalBtn');
const autonomousBtn  = $('autonomousBtn');
const modeDesc       = $('modeDesc');
const toolsSection   = $('toolsSection');
const currentModeTag = $('currentModeTag');
const modelHint      = $('modelHint');
const newChatBtn     = $('newChatBtn');
const clearHistory   = $('clearHistory');
const historyList    = $('historyList');
const welcomeScreen  = $('welcomeScreen');
const messagesEl     = $('messages');
const chatArea       = $('chatArea');
const userInput      = $('userInput');
const sendBtn        = $('sendBtn');
const settingsBtn    = $('settingsBtn');
const settingsModal  = $('settingsModal');
const modalClose     = $('modalClose');
const apiKeyInput    = $('apiKeyInput');
const modelSelect    = $('modelSelect');
const maxStepsInput  = $('maxSteps');
const saveSettings   = $('saveSettings');
const pdfInput       = $('pdfInput');
const pdfBanner      = $('pdfBanner');
const pdfName        = $('pdfName');
const pdfRemove      = $('pdfRemove');

// ── Init ───────────────────────────────────────────────────
function init() {
  loadStorage();
  bindEvents();
  renderHistory();
}

function loadStorage() {
  STATE.apiKey  = localStorage.getItem('aurix_key')   || '';
  STATE.model   = localStorage.getItem('aurix_model') || 'gemini-2.0-flash';
  STATE.maxSteps= parseInt(localStorage.getItem('aurix_steps') || '5', 10);
  STATE.mode    = localStorage.getItem('aurix_mode')  || 'autonomous';

  try {
    STATE.history = JSON.parse(localStorage.getItem('aurix_history') || '[]');
  } catch { STATE.history = []; }

  apiKeyInput.value  = STATE.apiKey;
  modelSelect.value  = STATE.model;
  maxStepsInput.value= STATE.maxSteps;

  setMode(STATE.mode, false);
}

// ── Events ─────────────────────────────────────────────────
function bindEvents() {
  // Sidebar
  sidebarToggle.addEventListener('click', toggleSidebar);
  menuBtn.addEventListener('click', toggleSidebar);

  // Mode
  minimalBtn.addEventListener('click', () => setMode('minimal'));
  autonomousBtn.addEventListener('click', () => setMode('autonomous'));

  // Send
  sendBtn.addEventListener('click', handleSend);
  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  // Auto-resize textarea
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
  });

  // Quick buttons
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      userInput.value = btn.dataset.prompt;
      handleSend();
    });
  });

  // New chat
  newChatBtn.addEventListener('click', startNewChat);

  // Clear history
  clearHistory.addEventListener('click', () => {
    STATE.history = [];
    saveHistory();
    renderHistory();
  });

  // Settings
  settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
  modalClose.addEventListener('click', () => settingsModal.style.display = 'none');
  settingsModal.addEventListener('click', e => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
  });
  saveSettings.addEventListener('click', doSaveSettings);

  // PDF
  pdfInput.addEventListener('change', handlePdfUpload);
  pdfRemove.addEventListener('click', removePdf);
}

// ── Sidebar ────────────────────────────────────────────────
function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
}

// ── Mode ───────────────────────────────────────────────────
function setMode(mode, persist = true) {
  STATE.mode = mode;
  if (persist) localStorage.setItem('aurix_mode', mode);

  if (mode === 'minimal') {
    minimalBtn.classList.add('active');
    autonomousBtn.classList.remove('active');
    modeDesc.textContent = 'Fast Q&A — simple chatbot, no tools';
    currentModeTag.textContent = '⚡ Minimal Agent';
    modelHint.textContent = 'Direct Q&A mode';
    toolsSection.style.opacity = '0.4';
    toolsSection.style.pointerEvents = 'none';
  } else {
    autonomousBtn.classList.add('active');
    minimalBtn.classList.remove('active');
    modeDesc.textContent = 'Multi-step reasoning with tools & planning';
    currentModeTag.textContent = '🤖 Autonomous Agent';
    modelHint.textContent = 'Autonomous mode with tools';
    toolsSection.style.opacity = '1';
    toolsSection.style.pointerEvents = 'auto';
  }
}

// ── Settings ────────────────────────────────────────────────
function doSaveSettings() {
  STATE.apiKey  = apiKeyInput.value.trim();
  STATE.model   = modelSelect.value;
  STATE.maxSteps= parseInt(maxStepsInput.value, 10) || 5;

  localStorage.setItem('aurix_key',   STATE.apiKey);
  localStorage.setItem('aurix_model', STATE.model);
  localStorage.setItem('aurix_steps', STATE.maxSteps);

  settingsModal.style.display = 'none';
  showToast('Settings saved ✓');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
    background:'rgba(201,146,42,0.9)', color:'#1A1208', padding:'0.5rem 1.2rem',
    borderRadius:'99px', fontSize:'0.82rem', fontFamily:'DM Sans, sans-serif',
    fontWeight:'600', zIndex:'200', pointerEvents:'none',
    animation:'fadeIn 0.2s ease'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ── PDF ─────────────────────────────────────────────────────
async function handlePdfUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  pdfName.textContent = file.name;
  pdfBanner.style.display = 'flex';
  STATE.pdfName = file.name;

  try {
    // Use FileReader + basic text extraction heuristic
    const text = await extractPdfText(file);
    STATE.pdfText = text;
    showToast('PDF loaded — ' + Math.round(text.length / 1000) + 'k chars');
  } catch (err) {
    showToast('Could not read PDF text');
    STATE.pdfText = '';
  }

  // Reset input
  pdfInput.value = '';
}

function extractPdfText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bytes = new Uint8Array(e.target.result);
        // Extract readable text from PDF bytes (basic — works for text-based PDFs)
        let text = '';
        const decoder = new TextDecoder('latin1');
        const raw = decoder.decode(bytes);

        // Find text between BT...ET markers (PDF text objects)
        const matches = raw.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
        for (const m of matches) {
          // Extract strings in parentheses or angle brackets
          const inner = m[1];
          const strMatches = inner.matchAll(/\(([^)]+)\)/g);
          for (const s of strMatches) {
            const clean = s[1]
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '')
              .replace(/\\\\/g, '\\')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')');
            text += clean + ' ';
          }
        }

        // Also grab any human-readable text strings from the file
        if (text.length < 200) {
          const fallback = raw.match(/[A-Za-z0-9 .,;:!?'"()\-\n]{40,}/g);
          if (fallback) text = fallback.join('\n');
        }

        resolve(text.trim().slice(0, 50000)); // Cap at 50k chars
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function removePdf() {
  STATE.pdfText = '';
  STATE.pdfName = '';
  pdfBanner.style.display = 'none';
  showToast('PDF removed');
}

// ── Chat ─────────────────────────────────────────────────────
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || STATE.isThinking) return;

  if (!STATE.apiKey) {
    settingsModal.style.display = 'flex';
    showToast('Please add your Gemini API key first');
    return;
  }

  // Hide welcome
  welcomeScreen.classList.add('hidden');

  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';

  // Add user message
  addMessage('user', text);

  // Show typing
  const typingId = showTyping();

  STATE.isThinking = true;
  sendBtn.disabled = true;

  try {
    let response;
    if (STATE.mode === 'autonomous') {
      response = await runAutonomousAgent(text);
    } else {
      response = await runMinimalAgent(text);
    }
    removeTyping(typingId);
    addMessage('ai', response.content, response.steps, response.toolUsed);
  } catch (err) {
    removeTyping(typingId);
    addMessage('ai', `Error: ${err.message || 'Something went wrong. Check your API key and try again.'}`, [], null, true);
  } finally {
    STATE.isThinking = false;
    sendBtn.disabled = false;
    userInput.focus();
    saveCurrentChat();
  }
}

// ── Minimal Agent ─────────────────────────────────────────────
async function runMinimalAgent(userText) {
  const systemPrompt = `You are AURIX AI, a helpful and concise AI assistant. Answer clearly and accurately.${
    STATE.pdfText ? `\n\nThe user has uploaded a PDF (${STATE.pdfName}). Content:\n${STATE.pdfText.slice(0, 8000)}` : ''
  }`;

  const result = await callGemini(systemPrompt, buildConversationHistory(userText));
  return { content: result, steps: [], toolUsed: null };
}

// ── Autonomous Agent ──────────────────────────────────────────
async function runAutonomousAgent(userText) {
  const steps = [];
  let finalAnswer = '';
  let toolUsed = null;

  // Step 1: Plan
  steps.push({ icon: '🧠', text: 'Analyzing the request and planning approach…' });

  const planPrompt = `You are AURIX, an autonomous AI agent. Analyze this request and decide which tool(s) to use.

Available tools:
- WIKIPEDIA: Search Wikipedia for factual information. Use for: definitions, history, science, people, places.
- PDF_QA: Answer questions from the uploaded PDF. Use when user asks about uploaded document.
- STUDY_PLANNER: Create detailed study plans for JEE/EAMCET/exams. Use for exam prep, schedules.
- NOTES_GEN: Generate structured study notes on a topic. Use for "notes on", "explain", "summarize topic".
- NONE: No tool needed, answer directly from knowledge.

Respond with ONLY a JSON object (no markdown):
{
  "tool": "WIKIPEDIA" | "PDF_QA" | "STUDY_PLANNER" | "NOTES_GEN" | "NONE",
  "reasoning": "brief why",
  "query": "the specific query/topic for the tool"
}`;

  let plan;
  try {
    const planRaw = await callGemini(planPrompt, [{ role: 'user', parts: [{ text: userText }] }]);
    const cleaned = planRaw.replace(/```json|```/g, '').trim();
    plan = JSON.parse(cleaned);
  } catch {
    plan = { tool: 'NONE', reasoning: 'Fallback to direct answer', query: userText };
  }

  steps.push({ icon: '🔧', text: `Tool selected: ${plan.tool} — ${plan.reasoning}` });

  // Step 2: Execute tool
  let toolContext = '';

  if (plan.tool === 'WIKIPEDIA') {
    steps.push({ icon: '🌐', text: `Searching Wikipedia: "${plan.query}"…` });
    toolUsed = '🌐 Wikipedia';
    try {
      toolContext = await searchWikipedia(plan.query);
      steps.push({ icon: '✅', text: `Wikipedia data retrieved (${Math.round(toolContext.length / 100) / 10}k chars)` });
    } catch (e) {
      toolContext = 'Wikipedia search failed. Answering from knowledge.';
      steps.push({ icon: '⚠️', text: 'Wikipedia unavailable, using built-in knowledge' });
    }

  } else if (plan.tool === 'PDF_QA') {
    steps.push({ icon: '📄', text: 'Reading uploaded PDF…' });
    toolUsed = '📄 PDF Q&A';
    if (STATE.pdfText) {
      toolContext = `PDF Content (${STATE.pdfName}):\n${STATE.pdfText.slice(0, 12000)}`;
      steps.push({ icon: '✅', text: 'PDF content loaded for context' });
    } else {
      toolContext = 'No PDF uploaded. Please upload a PDF first.';
      steps.push({ icon: '⚠️', text: 'No PDF found — asking user to upload' });
    }

  } else if (plan.tool === 'STUDY_PLANNER') {
    steps.push({ icon: '📚', text: 'Generating personalized study plan…' });
    toolUsed = '📚 Study Planner';
    toolContext = `USER REQUEST: ${userText}\nCREATE: Detailed day-by-day study plan. Include: schedule, topics, practice, revision strategy, tips.`;

  } else if (plan.tool === 'NOTES_GEN') {
    steps.push({ icon: '📝', text: `Generating structured notes: "${plan.query}"…` });
    toolUsed = '📝 Notes Generator';
    toolContext = `NOTES REQUEST: Generate comprehensive, well-structured study notes on: ${plan.query}. Include key concepts, definitions, formulas if any, examples, and summary.`;
  }

  // Step 3: Generate final answer
  steps.push({ icon: '✍️', text: 'Composing final response…' });

  const finalSystemPrompt = buildFinalSystemPrompt(plan.tool, toolContext);
  const history = buildConversationHistory(userText);
  finalAnswer = await callGemini(finalSystemPrompt, history);

  steps.push({ icon: '✅', text: 'Response ready' });

  return { content: finalAnswer, steps, toolUsed };
}

function buildFinalSystemPrompt(tool, toolContext) {
  const base = `You are AURIX AI — an intelligent, helpful assistant. Be clear, accurate, and well-structured. Use markdown formatting (bold, bullet points, headers) where it helps readability.`;

  if (tool === 'NONE' || !toolContext) return base;

  return `${base}

You have retrieved the following context to answer the user's question:
---
${toolContext}
---
Use this context to give a thorough, accurate answer. Cite the source naturally in your response.`;
}

// ── Wikipedia Tool ────────────────────────────────────────────
async function searchWikipedia(query) {
  const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`;
  const searchRes = await fetch(endpoint);
  const searchData = await searchRes.json();

  if (!searchData.query?.search?.length) return 'No Wikipedia article found.';

  const pageId = searchData.query.search[0].pageid;
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchData.query.search[0].title)}`;

  const summaryRes = await fetch(summaryUrl);
  const summaryData = await summaryRes.json();

  let text = `**${summaryData.title}** (Wikipedia)\n\n${summaryData.extract || 'No summary available.'}`;

  // Get more content via content API
  const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts&exintro=false&explaintext=true&format=json&origin=*`;
  try {
    const contentRes = await fetch(contentUrl);
    const contentData = await contentRes.json();
    const page = contentData.query?.pages?.[pageId];
    if (page?.extract) {
      text += '\n\n' + page.extract.slice(0, 6000);
    }
  } catch { /* use summary only */ }

  return text;
}

// ── Gemini API ────────────────────────────────────────────────
async function callGemini(systemInstruction, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${STATE.model}:generateContent?key=${STATE.apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: messages,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

function buildConversationHistory(newUserText) {
  // Build Gemini-format history from STATE.messages + new message
  const history = [];

  for (const m of STATE.messages) {
    history.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    });
  }

  history.push({ role: 'user', parts: [{ text: newUserText }] });
  return history;
}

// ── Rendering ─────────────────────────────────────────────────
function addMessage(role, content, steps = [], toolUsed = null, isError = false) {
  STATE.messages.push({ role, content, steps, toolUsed });

  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '◈';

  const msgContent = document.createElement('div');
  msgContent.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble${isError ? ' error' : ''}`;
  bubble.innerHTML = role === 'ai' ? formatMarkdown(content) : escapeHtml(content);

  msgContent.appendChild(bubble);

  // Tool used badge
  if (toolUsed) {
    const callout = document.createElement('div');
    callout.className = 'tool-callout';
    callout.innerHTML = `<span>Tool used:</span> <strong>${toolUsed}</strong>`;
    msgContent.appendChild(callout);
  }

  // Thinking steps (for autonomous)
  if (steps && steps.length > 0 && role === 'ai') {
    const stepsEl = document.createElement('div');
    stepsEl.className = 'msg-steps';
    steps.forEach(s => {
      const step = document.createElement('div');
      step.className = 'step-item';
      step.innerHTML = `<span class="step-icon">${s.icon}</span><span>${escapeHtml(s.text)}</span>`;
      stepsEl.appendChild(step);
    });
    // Insert steps before bubble
    msgContent.insertBefore(stepsEl, bubble);
  }

  msg.appendChild(avatar);
  msg.appendChild(msgContent);
  messagesEl.appendChild(msg);

  scrollToBottom();
}

function showTyping() {
  const id = 'typing_' + Date.now();
  const msg = document.createElement('div');
  msg.className = 'msg ai';
  msg.id = id;
  msg.innerHTML = `
    <div class="msg-avatar">◈</div>
    <div class="msg-content">
      <div class="msg-bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`;
  messagesEl.appendChild(msg);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ── Formatting ────────────────────────────────────────────────
function formatMarkdown(text) {
  // Basic markdown → HTML
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="color:var(--gold-light);margin:.6em 0 .3em;font-family:Syne,sans-serif">$1</h4>');
  html = html.replace(/^## (.+)$/gm,  '<h3 style="color:var(--gold-light);margin:.7em 0 .35em;font-family:Syne,sans-serif">$1</h3>');
  html = html.replace(/^# (.+)$/gm,   '<h2 style="color:var(--gold-light);margin:.8em 0 .4em;font-family:Syne,sans-serif">$1</h2>');

  // Bullet lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li style="margin:.2em 0;padding-left:.5em">$1</li>');
  html = html.replace(/(<li[^>]*>[\s\S]+?<\/li>)/g, '<ul style="padding-left:1.2em;margin:.4em 0">$1</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:.2em 0">$1</li>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p style="margin:.5em 0">');
  html = html.replace(/\n/g, '<br>');

  return `<p style="margin:0">${html}</p>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── History ───────────────────────────────────────────────────
function saveCurrentChat() {
  if (!STATE.messages.length) return;

  const firstMsg = STATE.messages.find(m => m.role === 'user');
  const title = firstMsg
    ? firstMsg.content.slice(0, 45) + (firstMsg.content.length > 45 ? '…' : '')
    : 'Chat';

  if (STATE.currentChatId) {
    const idx = STATE.history.findIndex(h => h.id === STATE.currentChatId);
    if (idx >= 0) {
      STATE.history[idx] = { id: STATE.currentChatId, title, messages: STATE.messages };
    } else {
      STATE.history.unshift({ id: STATE.currentChatId, title, messages: STATE.messages });
    }
  } else {
    STATE.currentChatId = 'chat_' + Date.now();
    STATE.history.unshift({ id: STATE.currentChatId, title, messages: STATE.messages });
  }

  // Keep only last 30
  if (STATE.history.length > 30) STATE.history = STATE.history.slice(0, 30);

  saveHistory();
  renderHistory();
}

function saveHistory() {
  localStorage.setItem('aurix_history', JSON.stringify(STATE.history));
}

function renderHistory() {
  historyList.innerHTML = '';

  if (!STATE.history.length) {
    historyList.innerHTML = '<p class="history-empty">No chats yet</p>';
    return;
  }

  STATE.history.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = chat.title;
    item.title = chat.title;
    item.addEventListener('click', () => loadChat(chat));
    historyList.appendChild(item);
  });
}

function loadChat(chat) {
  STATE.messages = chat.messages;
  STATE.currentChatId = chat.id;

  messagesEl.innerHTML = '';
  welcomeScreen.classList.add('hidden');

  chat.messages.forEach(m => {
    const isError = false;
    addMessageDirect(m.role, m.content, m.steps || [], m.toolUsed || null, isError);
  });
}

function addMessageDirect(role, content, steps, toolUsed, isError) {
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '◈';

  const msgContent = document.createElement('div');
  msgContent.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble${isError ? ' error' : ''}`;
  bubble.innerHTML = role === 'ai' ? formatMarkdown(content) : escapeHtml(content);

  msgContent.appendChild(bubble);

  if (toolUsed) {
    const callout = document.createElement('div');
    callout.className = 'tool-callout';
    callout.innerHTML = `<span>Tool used:</span> <strong>${toolUsed}</strong>`;
    msgContent.appendChild(callout);
  }

  if (steps?.length && role === 'ai') {
    const stepsEl = document.createElement('div');
    stepsEl.className = 'msg-steps';
    steps.forEach(s => {
      const step = document.createElement('div');
      step.className = 'step-item';
      step.innerHTML = `<span class="step-icon">${s.icon}</span><span>${escapeHtml(s.text)}</span>`;
      stepsEl.appendChild(step);
    });
    msgContent.insertBefore(stepsEl, bubble);
  }

  msg.appendChild(avatar);
  msg.appendChild(msgContent);
  messagesEl.appendChild(msg);
  scrollToBottom();
}

function startNewChat() {
  STATE.messages = [];
  STATE.currentChatId = null;
  messagesEl.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  userInput.focus();
}

// ── Boot ──────────────────────────────────────────────────────
init();
