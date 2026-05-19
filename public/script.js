let conversationHistory = [];
let isTyping = false;

window.onload = () => {
  spawnFoodEmojis();
  autoResize();
};

function getTime() {
  return new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

function formatMessage(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  let html = '';
  let inList = false;
  let inTable = false;
  let tableLines = [];

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  const renderTable = (rows) => {
    const cells = rows[0].replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    const header = cells.map((cell) => `<th>${formatInline(cell)}</th>`).join('');
    const bodyRows = rows.slice(2).map((row) => {
      const columns = row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      return `<tr>${columns.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`;
    }).join('');

    return `<table><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  };

  const isTableSeparator = (line) => {
    const cells = line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
  };

  const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);

  lines.forEach((line, index) => {
    const nextLine = lines[index + 1] || '';
    const headingMatch = line.match(/^#{1,3}\s*(.*)$/);
    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    const numberMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    const isLastLine = index === lines.length - 1;

    if (!inTable && isTableRow(line) && isTableSeparator(nextLine)) {
      closeList();
      inTable = true;
      tableLines.push(line);
      return;
    }

    if (inTable) {
      if (isTableRow(line)) {
        tableLines.push(line);
        return;
      }

      html += renderTable(tableLines);
      tableLines = [];
      inTable = false;
      if (line.trim() === '') {
        html += '<br>';
      }
    }

    if (headingMatch) {
      closeList();
      html += `<strong>${formatInline(headingMatch[1])}</strong>`;
    } else if (bulletMatch || numberMatch) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${formatInline(bulletMatch ? bulletMatch[1] : numberMatch[1])}</li>`;
    } else {
      if (line.trim() === '') {
        closeList();
        html += '<br>';
      } else {
        html += formatInline(line);
      }
    }

    if (!isLastLine && !inTable) {
      html += '<br>';
    }
  });

  if (inTable) {
    html += renderTable(tableLines);
  }
  closeList();

  return html;
}

function scrollToBottom() {
  const c = document.getElementById('chatArea');
  c.scrollTop = c.scrollHeight;
}

function addUserMessage(text) {
  const chatArea = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div>
      <div class="bubble user-bubble">${escapeHtml(text)}</div>
      <div class="bubble-time" style="color:var(--muted)">${getTime()}</div>
    </div>
    <div class="avatar user-avatar">You</div>
  `;
  chatArea.appendChild(row);
  scrollToBottom();
}

function addBotMessage(text) {
  removeTyping();
  const chatArea = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'message-row';
  row.innerHTML = `
    <div class="avatar bot-avatar">🍜</div>
    <div>
      <div class="bubble bot-bubble">${formatMessage(text)}</div>
      <div class="bubble-time">${getTime()}</div>
    </div>
  `;
  chatArea.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  const chatArea = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'typing-row';
  row.id = 'typingIndicator';
  row.innerHTML = `
    <div class="avatar bot-avatar">🍜</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatArea.appendChild(row);
  scrollToBottom();
}

function removeTyping() {
  const t = document.getElementById('typingIndicator');
  if (t) t.remove();
}

function sendSuggestion(chip) {
  const text = chip.textContent.trim();
  document.getElementById('userInput').value = text;
  sendMessage();
}

function autoResize() {
  const ta = document.getElementById('userInput');
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function sendMessage() {
  if (isTyping) return;

  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  isTyping = true;
  document.getElementById('sendBtn').disabled = true;

  addUserMessage(text);
  conversationHistory.push({ role: 'user', content: text });
  const helpCard = document.getElementById('helpCard');
  if (helpCard) {
    helpCard.style.display = 'none';
  }
  showTyping();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.error || 'Something went wrong');
    }

    if (data.error) {
      throw new Error(data.error.message || 'Groq API error');
    }

    if (!data.choices || data.choices.length === 0) {
      const raw = JSON.stringify(data, null, 2);
      throw new Error(`Walang response mula sa assistant. Response: ${raw}`);
    }

    const choice = data.choices[0];
    const reply = choice?.message?.content || choice?.message?.content?.toString?.() || choice?.text || data?.output_text || data?.output || JSON.stringify(choice || data);
    if (!reply) {
      const raw = JSON.stringify(data, null, 2);
      throw new Error(`Walang response mula sa assistant. Response: ${raw}`);
    }

    conversationHistory.push({ role: 'assistant', content: reply });
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    addBotMessage(reply);
  } catch (error) {
    removeTyping();
    addBotMessage(`Ay nako, may error! 😅 "${error.message}" — Subukan mo ulit after a moment ha! 🙏`);
  } finally {
    isTyping = false;
    document.getElementById('sendBtn').disabled = false;
    input.focus();
  }
}

function spawnFoodEmojis() {
  const foods = ['🍜','🍖','🥘','🍗','🍌','🥭','🍚','🦐','🥩','🍲','🌶️','🧄','🥥','🍠','🐟'];
  const bg = document.getElementById('foodBg');
  foods.forEach((emoji) => {
    const el = document.createElement('div');
    el.className = 'food-float';
    el.textContent = emoji;
    el.style.left = (Math.random() * 100) + '%';
    el.style.animationDuration = (15 + Math.random() * 20) + 's';
    el.style.animationDelay = (Math.random() * 15) + 's';
    el.style.fontSize = (20 + Math.random() * 20) + 'px';
    bg.appendChild(el);
  });
}