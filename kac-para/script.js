/* ============================================================
   Kaç Para? — Profesyonel Bütçe Takipçisi (v16 - Gizlilik Politikası)
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
    btn.style.cssText = 'background:var(--primary-2); color:white; border:none; padding:6px 12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.8rem; margin-left:10px;';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action.callback();
      el.className = 'toast'; 
    });
    
    el.appendChild(btn);
  }

  el.className = `toast show ${type}`;
  
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { 
    el.className = 'toast'; 
  }, action ? 4000 : 2200);
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
    if (state.theme === 'auto') {
      btn.textContent = '🔄';
      btn.title = 'Tema: Otomatik (Sistem)';
    } else if (state.theme === 'dark') {
      btn.textContent = '🌙';
      btn.title = 'Tema: Karanlık';
    } else {
      btn.textContent = '☀️';
      btn.title = 'Tema: Aydınlık';
    }
  }
}

function processRecurring() {
  const now = new Date();
  const currentMonthKey = getMonthKey(now);
  
  if (state.lastProcessedMonth === currentMonthKey) return;

  if (!state.lastProcessedMonth) {
    state.lastProcessedMonth = currentMonthKey;
    save();
    return;
  }

  if (state.recurring.length > 0) {
    const year = now.getFullYear();
    const month = now.getMonth();
    let addedCount = 0;

    state.recurring.forEach(rec => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(rec.day, daysInMonth);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

      const exists = state.transactions.some(t => 
        t.date === dateStr && t.note === rec.name && t.amount === rec.amount && t.category === rec.category
      );

      if (!exists) {
        state.transactions.push({
          id: uid(),
          type: 'expense',
          amount: rec.amount,
          category: rec.category,
          note: rec.name,
          date: dateStr,
          isRecurring: true
        });
        addedCount++;
      }
    });

    state.lastProcessedMonth = currentMonthKey;
    save();
    
    if (addedCount > 0) {
      toast(`${addedCount} adet tekrarlayan ödeme eklendi. 🔁`, 'success');
    }
  }
}

function renderRecurringList() {
  const ul = $('#recurringList');
  if (!ul) return;
  ul.innerHTML = '';
  
  if (state.recurring.length === 0) {
    $('#emptyRecurring').hidden = false;
    return;
  }
  $('#emptyRecurring').hidden = true;

  state.recurring.forEach((rec, index) => {
    const meta = EXPENSE_CATEGORIES[rec.category] || { emoji: '📦' };
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${index * 0.05}s`;
    li.innerHTML = `
      <span class="expense-emoji">${meta.emoji}</span>
      <div class="expense-info">
        <span class="expense-note">${escapeHTML(rec.name)}</span>
        <span class="expense-meta">Her ayın ${rec.day}. günü · ${rec.category}</span>
      </div>
      <span class="expense-amount expense">${fmt(rec.amount)}</span>
      <button type="button" class="del-btn" data-id="${rec.id}" title="Sil">🗑️</button>
    `;
    ul.appendChild(li);
  });
}

function renderLimitsList() {
  const ul = $('#limitsList');
  if (!ul) return;
  ul.innerHTML = '';
  
  if (!state.limits || Object.keys(state.limits).length === 0) {
    $('#emptyLimits').hidden = false;
    return;
  }
  $('#emptyLimits').hidden = true;

  Object.entries(state.limits).forEach(([cat, amount], index) => {
    const meta = EXPENSE_CATEGORIES[cat] || { emoji: '📦' };
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${index * 0.05}s`;
    li.innerHTML = `
      <span class="expense-emoji">${meta.emoji}</span>
      <div class="expense-info">
        <span class="expense-note">${cat}</span>
        <span class="expense-meta">Aylık Limit</span>
      </div>
      <span class="expense-amount">${fmt(amount)}</span>
      <button type="button" class="del-limit-btn" data-cat="${cat}" title="Sil">🗑️</button>
    `;
    ul.appendChild(li);
  });
}

function updateMonthDisplay() {
  const options = { month: 'long', year: 'numeric' };
  let label = selectedDate.toLocaleDateString('tr-TR', options);
  label = label.charAt(0).toUpperCase() + label.slice(1);
  
  const today = new Date();
  if (selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear()) {
    label = `Bu Ay (${label})`;
  }
  $('#currentMonthLabel').textContent = label;
}

function isSelectedMonth(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() === selectedDate.getFullYear() && d.getMonth() === selectedDate.getMonth();
}

function monthTransactions() {
  return state.transactions.filter(t => isSelectedMonth(t.date));
}

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
    if (select) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${meta.emoji} ${name}`;
      select.appendChild(opt);
    }
  }

  for (const [name, meta] of Object.entries(EXPENSE_CATEGORIES)) {
    if (recSelect) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${meta.emoji} ${name}`;
      recSelect.appendChild(opt);
    }
    if (limitSelect) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${meta.emoji} ${name}`;
      limitSelect.appendChild(opt);
    }
  }

  if (label && submitBtn) {
    if (currentType === 'expense') {
      label.textContent = 'Gider Kategorisi';
      submitBtn.textContent = '+ Gider Ekle';
      submitBtn.style.background = 'linear-gradient(135deg, #e74c3c, #ff7675)';
    } else {
      label.textContent = 'Gelir Kategorisi';
      submitBtn.textContent = '+ Gelir Ekle';
      submitBtn.style.background = 'linear-gradient(135deg, #2ecc71, #55efc4)';
    }
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

  const prevDate = new Date(selectedDate);
  prevDate.setMonth(prevDate.getMonth() - 1);
  
  const prevList = state.transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === prevDate.getFullYear() && d.getMonth() === prevDate.getMonth();
  });
  
  const prevIncome = prevList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const incomeTrendEl = $('#statIncomeTrend');
  const expenseTrendEl = $('#statExpenseTrend');

  if (prevIncome > 0) {
    const diff = ((income - prevIncome) / prevIncome) * 100;
    incomeTrendEl.textContent = diff >= 0 ? `↑ %${diff.toFixed(1)} (Geçen ay)` : `↓ %${Math.abs(diff).toFixed(1)} (Geçen ay)`;
    incomeTrendEl.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
  } else if (income > 0) {
    incomeTrendEl.textContent = 'Geçen ay veri yok';
  }

  if (prevExpense > 0) {
    const diff = ((expense - prevExpense) / prevExpense) * 100;
    expenseTrendEl.textContent = diff <= 0 ? `↓ %${Math.abs(diff).toFixed(1)} (Geçen ay)` : `↑ %${diff.toFixed(1)} (Geçen ay)`;
    expenseTrendEl.style.color = diff <= 0 ? 'var(--green)' : 'var(--red)';
  } else if (expense > 0) {
    expenseTrendEl.textContent = 'Geçen ay veri yok';
  }

  const bar = $('#budgetBar');
  const remEl = $('#statRemaining');
  let ratio = budget > 0 ? Math.min(expense / budget, 1) : 0;
  bar.style.width = (ratio * 100) + '%';

  if (remaining < 0) {
    remEl.style.color = 'var(--red)';
    bar.style.background = 'var(--red)';
  } else if (budget > 0 && expense > budget) {
    remEl.style.color = 'var(--red)';
    bar.style.background = 'var(--red)';
  } else if (ratio > 0.8) {
    remEl.style.color = 'var(--yellow)';
    bar.style.background = 'var(--yellow)';
  } else {
    remEl.style.color = 'var(--green)';
    bar.style.background = 'var(--green)';
  }
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

  const ul = $('#expenseList');
  ul.innerHTML = '';

  if (list.length === 0) {
    $('#emptyState').hidden = false;
    return;
  }
  $('#emptyState').hidden = true;

  const categoryTotals = {};
  monthTransactions().filter(t => t.type === 'expense').forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  list.forEach((t, index) => {
    const isIncome = t.type === 'income';
    const meta = (isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[t.category] || { emoji: '📦' };
    const recIcon = t.isRecurring ? ' 🔁' : '';
    
    const limit = state.limits ? state.limits[t.category] : null;
    const catTotal = categoryTotals[t.category] || 0;
    const isOverLimit = limit && catTotal > limit && !isIncome;

    const li = document.createElement('li');
    li.className = 'expense-item';
    li.style.animationDelay = `${index * 0.05}s`;
    li.innerHTML = `
      <span class="expense-emoji">${meta.emoji}</span>
      <div class="expense-info">
        <span class="expense-note ${isOverLimit ? 'limit-warning' : ''}">
          ${escapeHTML(t.note || t.category)}${recIcon}
          ${isOverLimit ? ' 🚨' : ''}
        </span>
        <span class="expense-meta">${isIncome ? 'Gelir' : 'Gider'} · ${t.category} · ${formatDate(t.date)}</span>
      </div>
      <span class="expense-amount ${isIncome ? 'income' : 'expense'}">
        ${isIncome ? '+' : '-'}${fmt(t.amount)}
      </span>
      <button type="button" class="del-btn" data-id="${t.id}" title="Sil">🗑️</button>
    `;
    ul.appendChild(li);
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

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

  const tbody = $('#pdfTableBody');
  tbody.innerHTML = '';

  list.forEach(t => {
    const tr = document.createElement('tr');
    const typeStr = t.type === 'income' ? 'Gelir' : 'Gider';
    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${typeStr}</td>
      <td>${t.category}</td>
      <td>${escapeHTML(t.note || '-')}</td>
      <td style="text-align: right; color: ${t.type === 'income' ? 'green' : 'red'};">
        ${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  window.print();
}

function drawDonut() {
  const canvas = $('#donutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const list = monthTransactions().filter(t => t.type === 'expense');
  const totals = {};
  for (const t of list) totals[t.category] = (totals[t.category] || 0) + t.amount;
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8;
  const inner = R * 0.6;

  const duration = 800;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);

    ctx.clearRect(0, 0, W, H);

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R + inner) / 2, 0, Math.PI * 2);
      ctx.lineWidth = R - inner;
      ctx.strokeStyle = 'rgba(154,163,192,.25)';
      ctx.stroke();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
      ctx.font = '600 13px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Gider Yok', cx, cy);
    } else {
      let start = -Math.PI / 2;
      for (const [cat, val] of entries) {
        const angle = (val / total) * Math.PI * 2;
        const meta = EXPENSE_CATEGORIES[cat] || { color: '#b2bec3' };
        ctx.beginPath();
        ctx.arc(cx, cy, R, start, start + (angle * easeOut));
        ctx.arc(cx, cy, inner, start + (angle * easeOut), start, true);
        ctx.closePath();
        ctx.fillStyle = meta.color;
        ctx.fill();
        start += angle;
      }
      
      if (progress > 0.5) {
        ctx.globalAlpha = (progress - 0.5) * 2;
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text');
        ctx.font = '800 16px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(fmt(total * easeOut), cx, cy - 6);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillText('toplam gider', cx, cy + 14);
        ctx.globalAlpha = 1;
      }
    }

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  const legend = $('#donutLegend');
  legend.innerHTML = '';
  if (entries.length === 0) {
    legend.innerHTML = '<span class="legend-name" style="font-size:.8rem">Veri yok</span>';
    return;
  }
  for (const [cat, val] of entries) {
    const meta = EXPENSE_CATEGORIES[cat] || { emoji: '📦', color: '#b2bec3' };
    const pct = total ? (val / total) * 100 : 0;
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `
      <span class="legend-dot" style="background:${meta.color}"></span>
      <span class="legend-name">${meta.emoji} ${cat}</span>
      <span class="legend-value">${pct.toFixed(0)}%</span>
    `;
    legend.appendChild(div);
  }
}

function drawBars() {
  const canvas = $('#barChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const totals = days.map(d => {
    const iso = d.toISOString().slice(0, 10);
    return state.transactions
      .filter(t => t.date === iso && t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
  });
  const max = Math.max(...totals, 1);

  const pad = { top: 12, bottom: 26, left: 8, right: 8 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const barW = Math.max(chartW / days.length * 0.6, 2);
  const gap = chartW / days.length;

  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue('--muted') || '#9aa3c0';
  const primary = styles.getPropertyValue('--primary') || '#6c5ce7';
  const primary2 = styles.getPropertyValue('--primary-2') || '#8b7bff';

  const duration = 800;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);

    ctx.clearRect(0, 0, W, H);

    days.forEach((d, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const val = totals[i];
      const h = (val / max) * chartH * easeOut;
      
      const grad = ctx.createLinearGradient(0, pad.top + chartH, 0, pad.top);
      grad.addColorStop(0, primary.trim());
      grad.addColorStop(1, primary2.trim());
      
      ctx.fillStyle = val > 0 ? grad : 'rgba(154,163,192,.18)';
      const finalH = val > 0 ? Math.max(h, 3) : 3;
      roundRect(ctx, x, pad.top + chartH - finalH, barW, finalH, Math.min(4, barW/2));
      ctx.fill();
    });
    
    if (progress > 0.5) {
      ctx.globalAlpha = (progress - 0.5) * 2;
      const labelDays = [1, 10, 20, daysInMonth];
      ctx.fillStyle = textColor;
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      labelDays.forEach(dayNum => {
        const i = dayNum - 1;
        const x = pad.left + gap * i + gap / 2;
        ctx.fillText(dayNum, x, H - 8);
      });
      ctx.globalAlpha = 1;
    }

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderAll() {
  updateMonthDisplay();
  renderStats();
  renderList();
  renderRecurringList();
  renderLimitsList();
  drawDonut();
  drawBars();
}

function downloadCSV() {
  const list = [...monthTransactions()].sort((a, b) => (a.date > b.date ? 1 : -1));
  if (list.length === 0) return toast('Bu ay için veri yok.', 'error');

  let csvContent = "\uFEFF"; 
  csvContent += "Tarih,Tür,Kategori,Açıklama,Tutar (₺)\n";

  list.forEach(t => {
    const typeStr = t.type === 'income' ? 'Gelir' : 'Gider';
    const note = `"${(t.note || '').replace(/"/g, '""')}"`;
    csvContent += `${t.date},${typeStr},${t.category},${note},${t.amount}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kacpara-${getMonthKey(selectedDate)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Excel (CSV) indirildi ✓');
}

function setupEvents() {
  $('#prevMonthBtn').addEventListener('click', () => { selectedDate.setMonth(selectedDate.getMonth() - 1); renderAll(); });
  $('#nextMonthBtn').addEventListener('click', () => { selectedDate.setMonth(selectedDate.getMonth() + 1); renderAll(); });

  document.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      updateFormCategories();
    });
  });

  $('#expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    
    const rawAmount = $('#amount').value;
    const cleanAmount = rawAmount.replace(/[^0-9+\-*/().\s]/g, ''); 
    
    let amount = 0;
    try {
      if (cleanAmount.trim() !== '') {
        amount = Function('"use strict";return (' + cleanAmount + ')')();
      }
    } catch (err) {
      amount = NaN;
    }

    const category = $('#category').value;
    const note = $('#note').value.trim();
    const date = $('#date').value || todayISO();

    if (isNaN(amount) || amount <= 0) {
      return toast('Geçerli bir tutar veya işlem gir. (Örn: 50+25)', 'error');
    }

    amount = Math.round(amount * 100) / 100;

    state.transactions.push({ id: uid(), type: currentType, amount, category, note, date });
    save();
    ev.target.reset();
    $('#date').value = todayISO();
    selectedDate = new Date(date);
    renderAll();
    toast(currentType === 'income' ? 'Gelir eklendi ✓' : 'Gider eklendi ✓');
  });

  $('#expenseList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    
    const deletedItem = state.transactions.find(t => t.id === id);
    if (!deletedItem) return;

    state.transactions = state.transactions.filter(t => t.id !== id);
    save();
    renderAll();

    toast('Kayıt silindi.', 'error', {
      text: 'Geri Al',
      callback: () => {
        state.transactions.push(deletedItem);
        save();
        renderAll();
        toast('Kayıt geri getirildi ✓', 'success');
      }
    });
  });

  $('#searchInput').addEventListener('input', renderList);

  $('#filterToggleBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const panel = $('#filterPanel');
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      $('#filterType').value = state.filterType || 'all';
      $('#filterSort').value = state.filterSort || 'date-desc';
    } else {
      panel.classList.add('hidden');
    }
  });

  $('#filterType').addEventListener('change', (e) => {
    state.filterType = e.target.value;
    save();
    renderList();
  });

  $('#filterSort').addEventListener('change', (e) => {
    state.filterSort = e.target.value;
    save();
    renderList();
  });

  $('#themeToggle').addEventListener('click', () => {
    if (state.theme === 'auto') state.theme = 'dark';
    else if (state.theme === 'dark') state.theme = 'light';
    else state.theme = 'auto';
    
    save();
    applyTheme();
    drawDonut();
    drawBars();
    
    let msg = state.theme === 'auto' ? 'Otomatik Tema (Sistem) 🔄' : (state.theme === 'dark' ? 'Karanlık Tema 🌙' : 'Aydınlık Tema ☀️');
    toast(msg, 'success');
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') {
      applyTheme();
      drawDonut();
      drawBars();
    }
  });

  $('#editBudgetBtn').addEventListener('click', (e) => {
    e.preventDefault();
    $('#budgetInput').value = state.budgets[getMonthKey(selectedDate)] || '';
    $('#budgetModal').classList.remove('hidden');
    $('#budgetModal').hidden = false;
    $('#budgetInput').focus();
  });

  $('#budgetCancel').addEventListener('click', (e) => {
    e.preventDefault();
    $('#budgetModal').classList.add('hidden');
    $('#budgetModal').hidden = true;
  });

  $('#budgetModal').addEventListener('click', (ev) => {
    if (ev.target.id === 'budgetModal') { $('#budgetModal').classList.add('hidden'); $('#budgetModal').hidden = true; }
  });

  $('#budgetSave').addEventListener('click', (e) => {
    e.preventDefault();
    const v = parseFloat($('#budgetInput').value) || 0;
    state.budgets[getMonthKey(selectedDate)] = v;
    save();
    $('#budgetModal').classList.add('hidden');
    $('#budgetModal').hidden = true;
    renderAll();
    toast('Hedef bütçe güncellendi ✓');
  });

  $('#recurringBtn').addEventListener('click', (e) => {
    e.preventDefault();
    $('#recurringModal').classList.remove('hidden');
    $('#recurringModal').hidden = false;
  });

  $('#recurringClose').addEventListener('click', (e) => {
    e.preventDefault();
    $('#recurringModal').classList.add('hidden');
    $('#recurringModal').hidden = true;
  });

  $('#recurringModal').addEventListener('click', (ev) => {
    if (ev.target.id === 'recurringModal') { $('#recurringModal').classList.add('hidden'); $('#recurringModal').hidden = true; }
  });

  $('#recurringForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#recName').value.trim();
    const amount = parseFloat($('#recAmount').value);
    const category = $('#recCategory').value;
    const day = parseInt($('#recDay').value);

    if (!name || !amount || amount <= 0 || !category || !day || day < 1 || day > 31) {
      return toast('Lütfen tüm alanları doğru doldur.', 'error');
    }

    state.recurring.push({ id: uid(), name, amount, category, day });
    save();
    $('#recurringForm').reset();
    $('#recDay').value = 1;
    renderRecurringList();
    toast('Tekrarlayan ödeme eklendi 🔁');
  });

  $('#recurringList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    
    const deletedRec = state.recurring.find(r => r.id === id);
    if (!deletedRec) return;

    state.recurring = state.recurring.filter(r => r.id !== id);
    save();
    renderRecurringList();

    toast('Tekrarlayan ödeme silindi.', 'error', {
      text: 'Geri Al',
      callback: () => {
        state.recurring.push(deletedRec);
        save();
        renderRecurringList();
        toast('Ödeme geri getirildi ✓', 'success');
      }
    });
  });

  $('#limitsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    $('#limitsModal').classList.remove('hidden');
    $('#limitsModal').hidden = false;
    renderLimitsList();
  });

  $('#limitsClose').addEventListener('click', (e) => {
    e.preventDefault();
    $('#limitsModal').classList.add('hidden');
    $('#limitsModal').hidden = true;
  });

  $('#limitsModal').addEventListener('click', (ev) => {
    if (ev.target.id === 'limitsModal') { $('#limitsModal').classList.add('hidden'); $('#limitsModal').hidden = true; }
  });

  $('#limitsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const cat = $('#limitCategory').value;
    const amount = parseFloat($('#limitAmount').value);
    if (!cat || !amount || amount <= 0) return toast('Geçerli bir limit gir.', 'error');
    
    state.limits[cat] = amount;
    save();
    $('#limitsForm').reset();
    renderLimitsList();
    renderAll();
    toast('Limit eklendi 🎯');
  });

  $('#limitsList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.del-limit-btn');
    if (!btn) return;
    const cat = btn.dataset.cat;
    delete state.limits[cat];
    save();
    renderLimitsList();
    renderAll();
    toast('Limit silindi', 'error');
  });

  $('#cleanupBtn').addEventListener('click', (e) => {
    e.preventDefault();
    $('#cleanupModal').classList.remove('hidden');
    $('#cleanupModal').hidden = false;
  });

  $('#cleanupCancel').addEventListener('click', (e) => {
    e.preventDefault();
    $('#cleanupModal').classList.add('hidden');
    $('#cleanupModal').hidden = true;
  });

  $('#cleanupModal').addEventListener('click', (ev) => {
    if (ev.target.id === 'cleanupModal') {
      $('#cleanupModal').classList.add('hidden');
      $('#cleanupModal').hidden = true;
    }
  });

  $('#cleanupConfirm').addEventListener('click', (e) => {
    e.preventDefault();
    const months = parseInt($('#cleanupRange').value);
    const now = new Date();
    const thresholdDate = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    
    if (!confirm(`${months} aydan eski tüm veriler kalıcı olarak silinecek. Emin misin?`)) return;
    
    const oldCount = state.transactions.length;
    state.transactions = state.transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= thresholdDate;
    });

    const deletedCount = oldCount - state.transactions.length;

    save();
    $('#cleanupModal').classList.add('hidden');
    $('#cleanupModal').hidden = true;
    renderAll();
    toast(`${deletedCount} adet eski kayıt temizlendi. 🧹`, 'success');
  });

  $('#exportPdfBtn').addEventListener('click', (e) => {
    e.preventDefault();
    generatePdfReport();
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kacpara-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Yedek indirildi ✓');
  });
  
  $('#exportCsvBtn').addEventListener('click', downloadCSV);

  $('#importInput').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.transactions)) throw new Error('Geçersiz format');
        state = { ...state, ...data };
        save();
        applyTheme();
        renderAll();
        toast('Veriler yüklendi ✓');
      } catch (err) { toast('Dosya okunamadı', 'error'); }
      ev.target.value = '';
    };
    reader.readAsText(file);
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Tüm veriler silinecek. Emin misin?')) return;
    state = { transactions: [], budgets: {}, recurring: [], limits: {}, lastProcessedMonth: '', theme: state.theme, filterType: 'all', filterSort: 'date-desc' };
    save();
    renderAll();
    toast('Tüm veriler silindi', 'error');
  });

  window.addEventListener('resize', () => { drawDonut(); drawBars(); });

  // GİZLİLİK POLİTİKASI OLAYLARI
  const privacyModal = $('#privacyModal');
  if (privacyModal) {
    $('#privacyBtn').addEventListener('click', (e) => {
      e.preventDefault();
      privacyModal.classList.remove('hidden');
      privacyModal.hidden = false;
    });

    $('#privacyClose').addEventListener('click', (e) => {
      e.preventDefault();
      privacyModal.classList.add('hidden');
      privacyModal.hidden = true;
    });

    privacyModal.addEventListener('click', (ev) => {
      if (ev.target.id === 'privacyModal') {
        privacyModal.classList.add('hidden');
        privacyModal.hidden = true;
      }
    });
  }

  let deferredPrompt;
  const installBanner = document.getElementById('installBanner');
  const installBtn = document.getElementById('installBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBanner) installBanner.classList.remove('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (installBanner) installBanner.classList.add('hidden');
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installBanner) installBanner.classList.add('hidden');
    toast('Uygulama başarıyla kuruldu! 🎉');
    deferredPrompt = null;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW hatası:', err));
    });
  }
}

/* ---------- KLAVYE KISAYOLLARI ---------- */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isInputActive = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);

    if (e.key === '/' && !isInputActive) {
      e.preventDefault();
      const searchInput = $('#searchInput');
      if (searchInput) searchInput.focus();
    }

    if (e.key === 'Escape') {
      const form = $('#expenseForm');
      if (form) {
        form.reset();
        $('#date').value = todayISO();
        document.activeElement.blur();
        document.querySelectorAll('.modal').forEach(modal => {
          modal.classList.add('hidden');
          modal.hidden = true;
        });
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      if (state.theme === 'auto') state.theme = 'dark';
      else if (state.theme === 'dark') state.theme = 'light';
      else state.theme = 'auto';
      
      save();
      applyTheme();
      drawDonut();
      drawBars();
      
      let msg = state.theme === 'auto' ? 'Otomatik Tema (Sistem) 🔄' : (state.theme === 'dark' ? 'Karanlık Tema 🌙' : 'Aydınlık Tema ☀️');
      toast(msg, 'success');
    }

    if (e.shiftKey && e.key.toLowerCase() === 'n' && !isInputActive) {
      e.preventDefault();
      const amountInput = $('#amount');
      if (amountInput) {
        amountInput.focus();
        amountInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

function init() {
  load();
  applyTheme();
  processRecurring();
  
  $('#date').value = todayISO();
  document.querySelector('.switch-btn[data-type="expense"]').classList.add('active');
  updateFormCategories();

  const budgetModal = $('#budgetModal');
  if (budgetModal) { budgetModal.classList.add('hidden'); budgetModal.hidden = true; }
  
  const recModal = $('#recurringModal');
  if (recModal) { recModal.classList.add('hidden'); recModal.hidden = true; }

  const limitsModal = $('#limitsModal');
  if (limitsModal) { limitsModal.classList.add('hidden'); limitsModal.hidden = true; }

  const cleanupModal = $('#cleanupModal');
  if (cleanupModal) { cleanupModal.classList.add('hidden'); cleanupModal.hidden = true; }
  
  const filterPanel = $('#filterPanel');
  if (filterPanel) filterPanel.classList.add('hidden');

  const privacyModalInit = $('#privacyModal');
  if (privacyModalInit) { privacyModalInit.classList.add('hidden'); privacyModalInit.hidden = true; }

  setupEvents();
  setupKeyboardShortcuts();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);