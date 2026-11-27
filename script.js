/* ============================================================
   Kaç Para? — Profesyonel Bütçe Takipçisi (v21 - Tertemiz)
   ============================================================ */

const STORAGE_KEY = 'kacpara.v5'; 

const EXPENSE_CATEGORIES = {
  'Yemek':     { emoji: '🍔', color: '#ff7675' },
  'Market':    { emoji: '🛒', color: '#55efc4' },
  'Ulaşım':    { emoji: '🚌', color: '#74b9ff' },
  'Fatura':    { emoji: '🧾', color: '#fdcb6e' },
  'Eğlence':   { emoji: '🎬', color: '#a29bfe' },
  'Sağlık':    { emoji: '💊', color: '#fd79a8' },
  'Alışveriş': { emoji: '🛍️', color: '#e17055' },
  'Diğer':     { emoji: '📦', color: '#b2bec3' },
};

const INCOME_CATEGORIES = {
  'Maaş':      { emoji: '💼', color: '#2ecc71' },
  'Ek İş':     { emoji: '💻', color: '#27ae60' },
  'Burs':      { emoji: '🎓', color: '#1abc9c' },
  'Yatırım':   { emoji: '📈', color: '#16a085' },
  'Diğer':     { emoji: '💰', color: '#55efc4' },
};

let state = {
  transactions: [],
  budgets: {},
  recurring: [],
  limits: {},
  goals: [],
  debts: [],
  lastProcessedMonth: '',
  theme: 'auto',
  filterType: 'all',
  filterSort: 'date-desc',
};

let currentType = 'expense';
let selectedDate = new Date();

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (e) { console.warn(e); }
}

function toast(msg, type = 'success', action = null) {
  const el = $('#toast');
  if (!el) return;
  el.innerHTML = '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = msg;
  el.appendChild(msgSpan);

  if (action) {
    const btn = document.createElement('button');
    btn.id = 'toastActionBtn';
    btn.textContent = action.text;
    btn.style.cssText = 'background:var(--primary-2); color:white; border:none; padding:4px 8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.8rem;';
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      action.callback();
      el.className = 'toast'; 
    });
    el.appendChild(btn);
  }
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, action ? 4000 : 2500);
}

function applyTheme() {
  let activeTheme = state.theme;
  if (activeTheme === 'auto') {
    const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = isSystemDark ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', activeTheme);
  const btn = $('#themeToggle');
  if (btn) {
    if (state.theme === 'auto') { btn.textContent = '🔄'; btn.title = 'Otomatik Tema'; }
    else if (state.theme === 'dark') { btn.textContent = '🌙'; btn.title = 'Karanlık Tema'; }
    else { btn.textContent = '☀️'; btn.title = 'Aydınlık Tema'; }
  }
}

function processRecurring() {
  const now = new Date();
  const currentMonthKey = getMonthKey(now);
  if (state.lastProcessedMonth === currentMonthKey) return;
  if (!state.lastProcessedMonth) { state.lastProcessedMonth = currentMonthKey; save(); return; }
  if (state.recurring.length > 0) {
    const year = now.getFullYear(); const month = now.getMonth(); let addedCount = 0;
    state.recurring.forEach(rec => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(rec.day, daysInMonth);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
      const exists = state.transactions.some(t => t.date === dateStr && t.note === rec.name && t.amount === rec.amount);
      if (!exists) {
        state.transactions.push({ id: uid(), type: 'expense', amount: rec.amount, category: rec.category, note: rec.name, date: dateStr, isRecurring: true });
        addedCount++;
      }
    });
    state.lastProcessedMonth = currentMonthKey;
    save();
    if (addedCount > 0) toast(`${addedCount} adet tekrarlayan ödeme eklendi.`, 'success');
  }
}

function renderRecurringList() {
  const ul = $('#recurringList'); if (!ul) return; ul.innerHTML = '';
  if (state.recurring.length === 0) { $('#emptyRecurring').hidden = false; return; }
  $('#emptyRecurring').hidden = true;
  state.recurring.forEach(rec => {
    const meta = EXPENSE_CATEGORIES[rec.category] || { emoji: '📦' };
    const li = document.createElement('li'); li.className = 'expense-item';
    li.innerHTML = `
      <span class="expense-emoji">${meta.emoji}</span>
      <div class="expense-info"><span class="expense-note">${escapeHTML(rec.name)}</span><span class="expense-meta">Her ayın ${rec.day}. günü</span></div>
      <span class="expense-amount expense">${fmt(rec.amount)}</span>
      <button type="button" class="del-btn" data-id="${rec.id}">🗑️</button>`;
    ul.appendChild(li);
  });
}

function renderLimitsList() {
  const ul = $('#limitsList'); if (!ul) return; ul.innerHTML = '';
  if (!state.limits || Object.keys(state.limits).length === 0) { $('#emptyLimits').hidden = false; return; }
  $('#emptyLimits').hidden = true;
  Object.entries(state.limits).forEach(([cat, amount]) => {
    const meta = EXPENSE_CATEGORIES[cat] || { emoji: '📦' };
    const li = document.createElement('li'); li.className = 'expense-item';
    li.innerHTML = `
      <span class="expense-emoji">${meta.emoji}</span>
      <div class="expense-info"><span class="expense-note">${cat}</span><span class="expense-meta">Aylık Limit</span></div>
      <span class="expense-amount">${fmt(amount)}</span>
      <button type="button" class="del-limit-btn" data-cat="${cat}">🗑️</button>`;
    ul.appendChild(li);
  });
}

function renderGoalsList() {
  const ul = $('#goalList'); if (!ul) return; ul.innerHTML = '';
  if (!state.goals || state.goals.length === 0) { $('#emptyGoal').hidden = false; return; }
  $('#emptyGoal').hidden = true;
  state.goals.forEach(goal => {
    const pct = Math.min((goal.saved / goal.amount) * 100, 100);
    const li = document.createElement('li'); li.className = 'expense-item'; li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; width:100%; margin-bottom: 4px;">
        <span class="expense-note">${escapeHTML(goal.name)}</span>
        <span class="expense-amount">${fmt(goal.saved)} / ${fmt(goal.amount)}</span>
      </div>
      <div class="progress" style="width:100%;"><div class="progress-bar" style="width:${pct}%; background: var(--primary);"></div></div>
      <div style="display:flex; justify-content:space-between; width:100%; margin-top: 4px;">
        <span class="expense-meta">%${pct.toFixed(0)} Tamamlandı</span>
        <button type="button" class="del-btn" data-id="${goal.id}" style="margin-left: auto;">🗑️</button>
      </div>`;
    ul.appendChild(li);
  });
}

function renderDebtsList() {
  const ul = $('#debtList'); if (!ul) return; ul.innerHTML = '';
  if (!state.debts || state.debts.length === 0) { $('#emptyDebt').hidden = false; return; }
  $('#emptyDebt').hidden = true;
  state.debts.forEach(debt => {
    const isBorc = debt.type === 'borc';
    const li = document.createElement('li'); li.className = 'expense-item';
    li.innerHTML = `
      <span class="expense-emoji">${isBorc ? '🔴' : '🟢'}</span>
      <div class="expense-info"><span class="expense-note">${escapeHTML(debt.name)}</span><span class="expense-meta">${isBorc ? 'Borç' : 'Alacak'}</span></div>
      <span class="expense-amount ${isBorc ? 'expense' : 'income'}">${fmt(debt.amount)}</span>
      <button type="button" class="del-btn" data-id="${debt.id}">🗑️</button>`;
    ul.appendChild(li);
  });
}

function updateMonthDisplay() {
  const options = { month: 'long', year: 'numeric' };
  let label = selectedDate.toLocaleDateString('tr-TR', options);
  label = label.charAt(0).toUpperCase() + label.slice(1);
  const today = new Date();
  if (selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear()) label = `Bu Ay (${label})`;
  $('#currentMonthLabel').textContent = label;
}

function isSelectedMonth(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() === selectedDate.getFullYear() && d.getMonth() === selectedDate.getMonth();
}

function monthTransactions() { return state.transactions.filter(t => isSelectedMonth(t.date)); }

function updateFormCategories() {
  const select = $('#category');
  const recSelect = $('#recCategory');
  const limitSelect = $('#limitCategory');
  const label = $('#categoryLabel');
  const submitBtn = $('#submitBtn');
  
  if (select) select.innerHTML = '';
  if (recSelect) recSelect.innerHTML = '';
  if (limitSelect) limitSelect.innerHTML = '';
  
  const cats = currentType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  for (const [name, meta] of Object.entries(cats)) {
    if (select) { const opt = document.createElement('option'); opt.value = name; opt.textContent = `${meta.emoji} ${name}`; select.appendChild(opt); }
  }
  for (const [name, meta] of Object.entries(EXPENSE_CATEGORIES)) {
    if (recSelect) { const opt = document.createElement('option'); opt.value = name; opt.textContent = `${meta.emoji} ${name}`; recSelect.appendChild(opt); }
    if (limitSelect) { const opt = document.createElement('option'); opt.value = name; opt.textContent = `${meta.emoji} ${name}`; limitSelect.appendChild(opt); }
  }

  if (label && submitBtn) {
    if (currentType === 'expense') { label.textContent = 'Gider Kategorisi'; submitBtn.textContent = '+ Gider Ekle'; submitBtn.style.background = 'var(--red)'; }
    else { label.textContent = 'Gelir Kategorisi'; submitBtn.textContent = '+ Gelir Ekle'; submitBtn.style.background = 'var(--green)'; }
  }
}

function renderStats() {
  const list = monthTransactions();
  const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const remaining = income - expense;
  const budget = state.budgets[getMonthKey(selectedDate)] || 0;

  $('#statIncome').textContent = fmt(income);
  $('#statExpense').textContent = fmt(expense);
  $('#statRemaining').textContent = fmt(remaining);
  $('#statBudget').textContent = fmt(budget);

  const prevDate = new Date(selectedDate); prevDate.setMonth(prevDate.getMonth() - 1);
  const prevList = state.transactions.filter(t => { const d = new Date(t.date); return d.getFullYear() === prevDate.getFullYear() && d.getMonth() === prevDate.getMonth(); });
  const prevIncome = prevList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const iTrend = $('#statIncomeTrend'); const eTrend = $('#statExpenseTrend');
  if (prevIncome > 0) { const diff = ((income - prevIncome) / prevIncome) * 100; iTrend.textContent = diff >= 0 ? `↑ %${diff.toFixed(0)}` : `↓ %${Math.abs(diff).toFixed(0)}`; iTrend.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)'; }
  else iTrend.textContent = '—';
  if (prevExpense > 0) { const diff = ((expense - prevExpense) / prevExpense) * 100; eTrend.textContent = diff <= 0 ? `↓ %${Math.abs(diff).toFixed(0)}` : `↑ %${diff.toFixed(0)}`; eTrend.style.color = diff <= 0 ? 'var(--green)' : 'var(--red)'; }
  else eTrend.textContent = '—';

  const bar = $('#budgetBar'); const remEl = $('#statRemaining');
  let ratio = budget > 0 ? Math.min(expense / budget, 1) : 0;
  bar.style.width = (ratio * 100) + '%';

  if (remaining < 0 || (budget > 0 && expense > budget)) { remEl.style.color = 'var(--red)'; bar.style.background = 'var(--red)'; }
  else if (ratio > 0.8) { remEl.style.color = 'var(--yellow)'; bar.style.background = 'var(--yellow)'; }
  else { remEl.style.color = 'var(--green)'; bar.style.background = 'var(--green)'; }
}

function renderList() {
  const q = ($('#searchInput').value || '').toLowerCase().trim();
  let list = [...monthTransactions()].filter(t => {
    const matchesSearch = !q || t.note.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    const typeFilter = state.filterType || 'all';
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const sortVal = state.filterSort || 'date-desc';
  list.sort((a, b) => {
    if (sortVal === 'date-desc') return a.date < b.date ? 1 : -1;
    if (sortVal === 'date-asc') return a.date > b.date ? 1 : -1;
    if (sortVal === 'amount-desc') return b.amount - a.amount;
    if (sortVal === 'amount-asc') return a.amount - b.amount;
    return 0;
  });

  const ul = $('#expenseList'); ul.innerHTML = '';
  if (list.length === 0) { $('#emptyState').hidden = false; return; }
  $('#emptyState').hidden = true;

  const categoryTotals = {};
  monthTransactions().filter(t => t.type === 'expense').forEach(t => { categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount; });

  list.forEach(t => {
    const isIncome = t.type === 'income';
    const meta = (isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[t.category] || { emoji: '📦' };
    const recIcon = t.isRecurring ? ' 🔁' : '';
    const limit = state.limits ? state.limits[t.category] : null;
    const catTotal = categoryTotals[t.category] || 0;
    const isOverLimit = limit && catTotal > limit && !isIncome;

    const li = document.createElement('li'); li.className = 'expense-item';
    li.innerHTML = `
      <span class="expense-emoji">${meta.emoji}</span>
      <div class="expense-info">
        <span class="expense-note ${isOverLimit ? 'limit-warning' : ''}">${escapeHTML(t.note || t.category)}${recIcon}${isOverLimit ? ' 🚨' : ''}</span>
        <span class="expense-meta">${t.category} · ${formatDate(t.date)}</span>
      </div>
      <span class="expense-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${fmt(t.amount)}</span>
      <button type="button" class="del-btn" data-id="${t.id}">🗑️</button>`;
    ul.appendChild(li);
  });
}

function escapeHTML(str) { return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])); }
function formatDate(iso) { const d = new Date(iso); return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }); }

function generatePdfReport() {
  const list = [...monthTransactions()].sort((a, b) => (a.date > b.date ? 1 : -1));
  if (list.length === 0) return toast('Bu ay için veri yok.', 'error');
  const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const remaining = income - expense;
  const options = { month: 'long', year: 'numeric' };
  let monthLabel = selectedDate.toLocaleDateString('tr-TR', options);
  monthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  $('#pdfMonthLabel').textContent = monthLabel;
  $('#pdfIncome').textContent = fmt(income);
  $('#pdfExpense').textContent = fmt(expense);
  $('#pdfRemaining').textContent = fmt(remaining);

  const tbody = $('#pdfTableBody'); tbody.innerHTML = '';
  list.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${formatDate(t.date)}</td><td>${t.type === 'income' ? 'Gelir' : 'Gider'}</td><td>${t.category}</td><td>${escapeHTML(t.note || '-')}</td><td style="text-align:right; color:${t.type==='income'?'green':'red'}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</td>`;
    tbody.appendChild(tr);
  });
  window.print();
}

function drawDonut() {
  const canvas = $('#donutChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const list = monthTransactions().filter(t => t.type === 'expense');
  const totals = {}; for (const t of list) totals[t.category] = (totals[t.category] || 0) + t.amount;
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const W = canvas.width, H = canvas.height; const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8; const inner = R * 0.6;

  function animate(progress) {
    ctx.clearRect(0, 0, W, H);
    if (total === 0) {
      ctx.beginPath(); ctx.arc(cx, cy, (R + inner) / 2, 0, Math.PI * 2); ctx.lineWidth = R - inner; ctx.strokeStyle = 'rgba(154,163,192,.25)'; ctx.stroke();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); ctx.font = '600 13px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Gider Yok', cx, cy);
    } else {
      let start = -Math.PI / 2;
      for (const [cat, val] of entries) {
        const angle = (val / total) * Math.PI * 2; const meta = EXPENSE_CATEGORIES[cat] || { color: '#b2bec3' };
        ctx.beginPath(); ctx.arc(cx, cy, R, start, start + (angle * progress)); ctx.arc(cx, cy, inner, start + (angle * progress), start, true); ctx.closePath(); ctx.fillStyle = meta.color; ctx.fill(); start += angle;
      }
      if (progress > 0.5) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text'); ctx.font = '800 16px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(total), cx, cy - 6);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); ctx.font = '600 11px Inter'; ctx.fillText('toplam gider', cx, cy + 14);
      }
    }
  }
  let start = performance.now();
  function loop(now) { let p = Math.min((now - start) / 600, 1); animate(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  const legend = $('#donutLegend'); legend.innerHTML = '';
  if (entries.length === 0) { legend.innerHTML = '<span style="font-size:.8rem; color:var(--muted)">Veri yok</span>'; return; }
  for (const [cat, val] of entries) {
    const meta = EXPENSE_CATEGORIES[cat] || { emoji: '📦', color: '#b2bec3' }; const pct = (val / total) * 100;
    legend.innerHTML += `<div class="legend-item"><span class="legend-dot" style="background:${meta.color}"></span><span class="legend-name">${meta.emoji} ${cat}</span><span class="legend-value">%${pct.toFixed(0)}</span></div>`;
  }
}

function drawBars() {
  const canvas = $('#barChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  const year = selectedDate.getFullYear(), month = selectedDate.getMonth(), daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = []; for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
  const totals = days.map(d => { const iso = d.toISOString().slice(0, 10); return state.transactions.filter(t => t.date === iso && t.type === 'expense').reduce((s, t) => s + t.amount, 0); });
  const max = Math.max(...totals, 1);
  const pad = { top: 12, bottom: 20, left: 8, right: 8 }; const chartW = W - pad.left - pad.right; const chartH = H - pad.top - pad.bottom;
  const barW = Math.max(chartW / days.length * 0.6, 2); const gap = chartW / days.length;
  
  function animate(progress) {
    ctx.clearRect(0, 0, W, H);
    days.forEach((d, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2; const val = totals[i]; const h = (val / max) * chartH * progress;
      ctx.fillStyle = val > 0 ? '#6c5ce7' : 'rgba(154,163,192,.15)';
      const fH = val > 0 ? Math.max(h, 3) : 3;
      ctx.beginPath(); ctx.roundRect(x, pad.top + chartH - fH, barW, fH, 3); ctx.fill();
    });
    if (progress > 0.5) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); ctx.font = '600 9px Inter'; ctx.textAlign = 'center';
      [1, 10, 20, daysInMonth].forEach(n => { const i = n - 1; ctx.fillText(n, pad.left + gap * i + gap / 2, H - 4); });
    }
  }
  let start = performance.now();
  function loop(now) { let p = Math.min((now - start) / 600, 1); animate(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
}

function renderAll() { updateMonthDisplay(); renderStats(); renderList(); renderRecurringList(); renderLimitsList(); renderGoalsList(); renderDebtsList(); drawDonut(); drawBars(); }

function downloadCSV() {
  const list = [...monthTransactions()].sort((a, b) => (a.date > b.date ? 1 : -1));
  if (list.length === 0) return toast('Bu ay için veri yok.', 'error');
  let csv = "\uFEFF" + "Tarih,Tür,Kategori,Açıklama,Tutar\n";
  list.forEach(t => { csv += `${t.date},${t.type === 'income' ? 'Gelir' : 'Gider'},${t.category},"${(t.note || '').replace(/"/g, '""')}",${t.amount}\n`; });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = `kacpara-${getMonthKey(selectedDate)}.csv`; a.click(); URL.revokeObjectURL(url);
  toast('CSV indirildi ✓');
}

function setupEvents() {
  $('#toggleFormBtn').addEventListener('click', () => {
    const c = $('#formContainer');
    c.classList.toggle('hidden');
    $('#toggleIcon').textContent = c.classList.contains('hidden') ? '▼' : '▲';
  });

  $('#quickAddBtn').addEventListener('click', () => {
    const c = $('#formContainer');
    c.classList.remove('hidden');
    $('#toggleIcon').textContent = '▲';
    $('#amount').focus();
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const settingsModal = $('#settingsModal');
  $('#settingsBtn').addEventListener('click', () => { settingsModal.classList.remove('hidden'); settingsModal.hidden = false; });
  $('#settingsClose').addEventListener('click', () => { settingsModal.classList.add('hidden'); settingsModal.hidden = true; });
  settingsModal.addEventListener('click', (e) => { if(e.target === settingsModal) { settingsModal.classList.add('hidden'); settingsModal.hidden = true; } });

  $('#prevMonthBtn').addEventListener('click', () => { selectedDate.setMonth(selectedDate.getMonth() - 1); renderAll(); });
  $('#nextMonthBtn').addEventListener('click', () => { selectedDate.setMonth(selectedDate.getMonth() + 1); renderAll(); });

  document.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); currentType = btn.dataset.type; updateFormCategories();
    });
  });

  $('#expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const raw = $('#amount').value; const clean = raw.replace(/[^0-9+\-*/().\s]/g, ''); let amount = 0;
    try { amount = Function('"use strict";return (' + (clean || '0') + ')')(); } catch (e) { amount = NaN; }
    const category = $('#category').value; const note = $('#note').value.trim(); const date = $('#date').value || todayISO();
    if (isNaN(amount) || amount <= 0) return toast('Geçerli tutar gir.', 'error');
    state.transactions.push({ id: uid(), type: currentType, amount: Math.round(amount*100)/100, category, note, date });
    save(); ev.target.reset(); $('#date').value = todayISO(); selectedDate = new Date(date);
    renderAll(); 
    $('#formContainer').classList.add('hidden'); $('#toggleIcon').textContent = '▼';
    toast(currentType === 'income' ? 'Gelir eklendi ✓' : 'Gider eklendi ✓');
  });

  $('#expenseList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-btn'); if (!btn) return;
    const id = btn.dataset.id; const item = state.transactions.find(t => t.id === id);
    if (!item) return;
    state.transactions = state.transactions.filter(t => t.id !== id); save(); renderAll();
    toast('Kayıt silindi', 'error', { text: 'Geri Al', callback: () => { state.transactions.push(item); save(); renderAll(); toast('Geri getirildi ✓'); } });
  });

  $('#searchInput').addEventListener('input', renderList);

  $('#filterToggleBtn').addEventListener('click', () => {
    const p = $('#filterPanel'); p.classList.toggle('hidden');
    if(!p.classList.contains('hidden')) { $('#filterType').value = state.filterType || 'all'; $('#filterSort').value = state.filterSort || 'date-desc'; }
  });
  $('#filterType').addEventListener('change', (e) => { state.filterType = e.target.value; save(); renderList(); });
  $('#filterSort').addEventListener('change', (e) => { state.filterSort = e.target.value; save(); renderList(); });

  $('#themeToggle').addEventListener('click', () => {
    if (state.theme === 'auto') state.theme = 'dark'; else if (state.theme === 'dark') state.theme = 'light'; else state.theme = 'auto';
    save(); applyTheme(); drawDonut(); drawBars();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'auto') { applyTheme(); drawDonut(); drawBars(); } });

  // Modallar
  $('#editBudgetBtn').addEventListener('click', () => { $('#budgetInput').value = state.budgets[getMonthKey(selectedDate)] || ''; $('#budgetModal').hidden = false; $('#budgetModal').classList.remove('hidden'); });
  $('#budgetCancel').addEventListener('click', () => { $('#budgetModal').classList.add('hidden'); $('#budgetModal').hidden = true; });
  $('#budgetSave').addEventListener('click', () => { const v = parseFloat($('#budgetInput').value) || 0; state.budgets[getMonthKey(selectedDate)] = v; save(); $('#budgetModal').classList.add('hidden'); $('#budgetModal').hidden = true; renderAll(); toast('Bütçe güncellendi ✓'); });

  $('#recurringBtn').addEventListener('click', () => { $('#recurringModal').hidden = false; $('#recurringModal').classList.remove('hidden'); settingsModal.classList.add('hidden'); settingsModal.hidden = true; });
  $('#recurringClose').addEventListener('click', () => { $('#recurringModal').classList.add('hidden'); $('#recurringModal').hidden = true; });
  $('#recurringForm').addEventListener('submit', (e) => {
    e.preventDefault(); const name = $('#recName').value.trim(); const amount = parseFloat($('#recAmount').value); const category = $('#recCategory').value; const day = parseInt($('#recDay').value);
    if (!name || !amount || amount <= 0 || !category || day < 1 || day > 31) return toast('Geçersiz bilgi.', 'error');
    state.recurring.push({ id: uid(), name, amount, category, day }); save(); $('#recurringForm').reset(); $('#recDay').value = 1; renderRecurringList(); toast('Eklendi ✓');
  });
  $('#recurringList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-btn'); if (!btn) return; const id = btn.dataset.id;
    const item = state.recurring.find(r => r.id === id); if (!item) return;
    state.recurring = state.recurring.filter(r => r.id !== id); save(); renderRecurringList();
    toast('Silindi', 'error', { text: 'Geri Al', callback: () => { state.recurring.push(item); save(); renderRecurringList(); } });
  });

  $('#limitsBtn').addEventListener('click', () => { $('#limitsModal').hidden = false; $('#limitsModal').classList.remove('hidden'); settingsModal.classList.add('hidden'); settingsModal.hidden = true; });
  $('#limitsClose').addEventListener('click', () => { $('#limitsModal').classList.add('hidden'); $('#limitsModal').hidden = true; });
  $('#limitsForm').addEventListener('submit', (e) => {
    e.preventDefault(); const cat = $('#limitCategory').value; const amount = parseFloat($('#limitAmount').value);
    if (!cat || amount <= 0) return toast('Geçersiz limit.', 'error');
    state.limits[cat] = amount; save(); $('#limitsForm').reset(); renderLimitsList(); renderAll(); toast('Limit eklendi 🎯');
  });
  $('#limitsList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-limit-btn'); if (!btn) return; delete state.limits[btn.dataset.cat]; save(); renderLimitsList(); renderAll(); toast('Limit silindi', 'error');
  });

  // YENİ: Hedef Modal İşlemleri
  $('#addGoalBtn').addEventListener('click', () => { $('#goalModal').hidden = false; $('#goalModal').classList.remove('hidden'); });
  $('#goalCancel').addEventListener('click', () => { $('#goalModal').classList.add('hidden'); $('#goalModal').hidden = true; });
  $('#goalSave').addEventListener('click', () => {
    const name = $('#goalName').value.trim(); const amount = parseFloat($('#goalAmount').value); const saved = parseFloat($('#goalSaved').value) || 0;
    if (!name || !amount || amount <= 0) return toast('Geçerli bilgi gir.', 'error');
    state.goals.push({ id: uid(), name, amount, saved }); save(); renderGoalsList(); $('#goalModal').classList.add('hidden'); $('#goalModal').hidden = true;
    $('#goalName').value = ''; $('#goalAmount').value = ''; $('#goalSaved').value = '0'; toast('Hedef eklendi 🎯');
  });
  $('#goalList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-btn'); if (!btn) return; state.goals = state.goals.filter(g => g.id !== btn.dataset.id); save(); renderGoalsList(); toast('Hedef silindi', 'error');
  });

  // YENİ: Borç Modal İşlemleri
  $('#addDebtBtn').addEventListener('click', () => { $('#debtModal').hidden = false; $('#debtModal').classList.remove('hidden'); });
  $('#debtCancel').addEventListener('click', () => { $('#debtModal').classList.add('hidden'); $('#debtModal').hidden = true; });
  $('#debtSave').addEventListener('click', () => {
    const name = $('#debtName').value.trim(); const amount = parseFloat($('#debtAmount').value); const type = $('#debtType').value;
    if (!name || !amount || amount <= 0) return toast('Geçerli bilgi gir.', 'error');
    state.debts.push({ id: uid(), name, amount, type }); save(); renderDebtsList(); $('#debtModal').classList.add('hidden'); $('#debtModal').hidden = true;
    $('#debtName').value = ''; $('#debtAmount').value = ''; toast('Kayıt eklendi ✓');
  });
  $('#debtList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-btn'); if (!btn) return; state.debts = state.debts.filter(d => d.id !== btn.dataset.id); save(); renderDebtsList(); toast('Kayıt silindi', 'error');
  });

  $('#cleanupBtn').addEventListener('click', () => { $('#cleanupModal').hidden = false; $('#cleanupModal').classList.remove('hidden'); settingsModal.classList.add('hidden'); settingsModal.hidden = true; });
  $('#cleanupCancel').addEventListener('click', () => { $('#cleanupModal').classList.add('hidden'); $('#cleanupModal').hidden = true; });
  $('#cleanupConfirm').addEventListener('click', () => {
    const months = parseInt($('#cleanupRange').value); const now = new Date(); const th = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    if (!confirm(`${months} aydan eski veriler silinecek. Emin misin?`)) return;
    const old = state.transactions.length; state.transactions = state.transactions.filter(t => new Date(t.date) >= th);
    save(); $('#cleanupModal').classList.add('hidden'); $('#cleanupModal').hidden = true; renderAll(); toast(`${old - state.transactions.length} kayıt silindi 🧹`);
  });

  // Dışa/İçe Aktar
  $('#exportPdfBtn').addEventListener('click', () => { settingsModal.classList.add('hidden'); settingsModal.hidden = true; generatePdfReport(); });
  $('#exportCsvBtn').addEventListener('click', () => { settingsModal.classList.add('hidden'); settingsModal.hidden = true; downloadCSV(); });
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kacpara-${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
    toast('Yedek indirildi ✓'); settingsModal.classList.add('hidden'); settingsModal.hidden = true;
  });
  $('#importInput').addEventListener('change', (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result); if (!data || !Array.isArray(data.transactions)) throw new Error();
        state = { ...state, ...data }; save(); applyTheme(); renderAll(); toast('Veriler yüklendi ✓');
        settingsModal.classList.add('hidden'); settingsModal.hidden = true;
      } catch { toast('Dosya okunamadı', 'error'); } ev.target.value = '';
    };
    reader.readAsText(file);
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Tüm veriler silinecek. Emin misin?')) return;
    state = { transactions: [], budgets: {}, recurring: [], limits: {}, goals: [], debts: [], lastProcessedMonth: '', theme: state.theme, filterType: 'all', filterSort: 'date-desc' };
    save(); renderAll(); toast('Tüm veriler silindi', 'error'); settingsModal.classList.add('hidden'); settingsModal.hidden = true;
  });

  // PWA
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#installBanner').classList.remove('hidden'); });
  $('#installBtn')?.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBanner').classList.add('hidden'); });
  window.addEventListener('appinstalled', () => { $('#installBanner').classList.add('hidden'); toast('Uygulama kuruldu! 🎉'); });
  if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})); }

  window.addEventListener('resize', () => { drawDonut(); drawBars(); });
}

function init() {
  load(); applyTheme(); processRecurring();
  $('#date').value = todayISO();
  document.querySelector('.switch-btn[data-type="expense"]').classList.add('active');
  updateFormCategories();
  
  ['#settingsModal','#budgetModal','#recurringModal','#limitsModal','#cleanupModal','#goalModal','#debtModal'].forEach(s => { const el = $(s); if(el) { el.classList.add('hidden'); el.hidden = true; } });

  setupEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);