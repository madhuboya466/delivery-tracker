/* ==========================================================================
   dashboard.js — Monthly Dashboard page (dashboard.html)
   ========================================================================== */

let currentRange = { type: 'current', from: null, to: null };
let trendChart = null;
let pieChart = null;
let pendingRowDeleteId = null;

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initRangeFilters();
  initSearch();
  await initGoal();
  initExport();
  initDataManagement();
  restoreLastMonth();
  await render();

  // Request browser notification permission
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }

  // Subscribe to real-time changes
  dbClient
    .channel('realtime-entries')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'entries' },
      async (payload) => {
        const newEntry = payload.new;
        
        showToast(`New route entry added for ${newEntry.date}!`, 'success');
        await render();

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Entry Logged!', {
            body: `Date: ${newEntry.date} | Earnings: ₹${Number(newEntry.swiggy || 0) + Number(newEntry.zomato || 0)}`,
            icon: 'https://cdn-icons-png.flaticon.com/512/2972/2972531.png'
          });
        }
      }
    )
    .subscribe();
});

function initTheme() {
  const saved = Storage.getTheme();
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
  document.getElementById('theme-toggle').addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.setTheme(next);
    updateThemeIcon(next);
    await render();
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
}

function initRangeFilters() {
  document.querySelectorAll('.chip[data-range]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      document.querySelectorAll('.chip[data-range]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const type = chip.dataset.range;
      document.getElementById('custom-range-card').style.display = type === 'custom' ? 'block' : 'none';
      if (type !== 'custom') {
        currentRange = { type, from: null, to: null };
        Storage.setLastMonth(type === 'current' ? currentMonthKey() : previousMonthKey());
        await render();
      }
    });
  });

  document.getElementById('apply-range').addEventListener('click', async () => {
    const from = document.getElementById('range-from').value;
    const to = document.getElementById('range-to').value;
    if (!from || !to) {
      showToast('Pick both a start and end date.', 'error');
      return;
    }
    currentRange = { type: 'custom', from, to };
    await render();
  });
}

function restoreLastMonth() {
  const last = Storage.getLastMonth();
  if (last === previousMonthKey()) {
    document.querySelectorAll('.chip[data-range]').forEach((c) => c.classList.remove('active'));
    document.querySelector('.chip[data-range="previous"]').classList.add('active');
    currentRange = { type: 'previous', from: null, to: null };
  } else {
    currentRange = { type: 'current', from: null, to: null };
  }
}

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function previousMonthKey() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function resolveRangeBounds() {
  const now = new Date();
  if (currentRange.type === 'current') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [isoOf(first), isoOf(last)];
  }
  if (currentRange.type === 'previous') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return [isoOf(first), isoOf(last)];
  }
  return [currentRange.from, currentRange.to];
}

function isoOf(d) {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

async function entriesInRange() {
  const [from, to] = resolveRangeBounds();
  const all = await Storage.getAll();
  return all
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function tableEntries() {
  const search = (document.getElementById('search-date').value || '').trim();
  const list = await entriesInRange();
  return search ? list.filter((e) => e.date.includes(search)) : list;
}

function initSearch() {
  document.getElementById('search-date').addEventListener('input', async () => await render());
}

async function render() {
  const entries = await entriesInRange();
  await renderTodayStats();
  renderMonthlyStats(entries);
  await renderGoal(entries);
  renderCalendar(entries);
  renderTable(await tableEntries());
  renderReport(entries);

  try {
    if (typeof Chart === 'undefined') throw new Error('Chart.js did not load');
    renderCharts(entries);
  } catch (err) {
    console.error('Charts unavailable:', err);
  }
}

// async function renderTodayStats() {
//   const today = await Storage.getByDate(todayISO());
//   const earn = today ? Calc.totalEarnings(today) : 0;
//   const exp = today ? Calc.totalExpenses(today) : 0;
//   const save = today ? Calc.finalSavings(today) : 0;
//   document.getElementById('s-today-earn').textContent = formatCurrency(earn);
//   document.getElementById('s-today-exp').textContent = formatCurrency(exp);
//   document.getElementById('s-today-save').textContent = formatCurrency(save);
// }

/* ---------- Today's snapshot ---------- */

async function renderTodayStats() {
  // Find the container holding Today's snapshot stat cards
  const todayGrid = document.querySelector('.stat-grid'); 

  // If the user selected 'Last Month' or 'Custom', hide Today's Snapshot section
  if (currentRange.type !== 'current') {
    if (todayGrid) todayGrid.style.display = 'none';
    return;
  }

  // Otherwise, show the grid and compute today's values
  if (todayGrid) todayGrid.style.display = 'grid';

  const today = await Storage.getByDate(todayISO());
  const earn = today ? Calc.totalEarnings(today) : 0;
  const exp = today ? Calc.totalExpenses(today) : 0;
  const save = today ? Calc.finalSavings(today) : 0;

  document.getElementById('s-today-earn').textContent = formatCurrency(earn);
  document.getElementById('s-today-exp').textContent = formatCurrency(exp);
  document.getElementById('s-today-save').textContent = formatCurrency(save);
}

function renderMonthlyStats(entries) {
  const totalEarn = sum(entries, Calc.totalEarnings);
  const totalExp = sum(entries, Calc.totalExpenses);
  const totalSave = sum(entries, Calc.finalSavings);
  const totalSentHome = sum(entries, (e) => num(e.sentHome));
  const days = entries.length || 1;

  document.getElementById('s-month-earn').textContent = formatCurrency(totalEarn);
  document.getElementById('s-month-exp').textContent = formatCurrency(totalExp);
  document.getElementById('s-month-save').textContent = formatCurrency(totalSave);
  document.getElementById('s-sent-home').textContent = formatCurrency(totalSentHome);
  document.getElementById('s-avg-earn').textContent = formatCurrency(entries.length ? totalEarn / days : 0);
  document.getElementById('s-avg-save').textContent = formatCurrency(entries.length ? totalSave / days : 0);

  if (entries.length) {
    const highEarn = entries.reduce((a, b) => (Calc.totalEarnings(a) >= Calc.totalEarnings(b) ? a : b));
    const highSave = entries.reduce((a, b) => (Calc.finalSavings(a) >= Calc.finalSavings(b) ? a : b));
    document.getElementById('s-high-earn').textContent = `${formatCurrency(Calc.totalEarnings(highEarn))} · ${highEarn.date}`;
    document.getElementById('s-high-save').textContent = `${formatCurrency(Calc.finalSavings(highSave))} · ${highSave.date}`;
  } else {
    document.getElementById('s-high-earn').textContent = '—';
    document.getElementById('s-high-save').textContent = '—';
  }
}

function sum(list, fn) {
  return list.reduce((acc, e) => acc + fn(e), 0);
}

async function initGoal() {
  const goal = await Storage.getGoal();
  document.getElementById('goal-input').value = goal;
  document.getElementById('goal-save').addEventListener('click', async () => {
    const val = Number(document.getElementById('goal-input').value) || 0;
    if (val < 0) { showToast('Goal cannot be negative.', 'error'); return; }
    await Storage.setGoal(val);
    await render();
    showToast('Monthly goal updated.', 'success');
  });
}

// async function renderGoal(entries) {
//   const goal = await Storage.getGoal();
//   const saved = Math.max(0, sum(entries, Calc.finalSavings));
//   const pct = goal > 0 ? Math.min(100, Math.round((saved / goal) * 100)) : 0;

//   document.getElementById('goal-saved').textContent = formatCurrency(saved);
//   document.getElementById('goal-target').textContent = formatCurrency(goal);
//   document.getElementById('gauge-pct').textContent = pct + '%';

//   const circle = document.getElementById('gauge-circle');
//   const circumference = 2 * Math.PI * 52;
//   const offset = circumference - (pct / 100) * circumference;
//   circle.setAttribute('stroke-dasharray', circumference.toFixed(1));
//   circle.setAttribute('stroke-dashoffset', offset.toFixed(1));
// }

async function renderGoal(entries) {
  const goal = await Storage.getGoal();
  // Compute Total Sent Home across entries in active range
  const totalSentHome = sum(entries, (e) => num(e.sentHome));
  const pct = goal > 0 ? Math.min(100, Math.round((totalSentHome / goal) * 100)) : 0;

  document.getElementById('goal-sent').textContent = formatCurrency(totalSentHome);
  document.getElementById('goal-target').textContent = formatCurrency(goal);
  document.getElementById('gauge-pct').textContent = pct + '%';

  const circle = document.getElementById('gauge-circle');
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (pct / 100) * circumference;
  circle.setAttribute('stroke-dasharray', circumference.toFixed(1));
  circle.setAttribute('stroke-dashoffset', offset.toFixed(1));
}

// function renderCalendar(entries) {
//   const grid = document.getElementById('calendar-grid');
//   const [from] = resolveRangeBounds();
//   const ref = new Date(from + 'T00:00:00');
//   const year = ref.getFullYear();
//   const month = ref.getMonth();

//   const byDate = {};
//   entries.forEach((e) => { byDate[e.date] = e; });

//   const firstDay = new Date(year, month, 1);
//   const daysInMonth = new Date(year, month + 1, 0).getDate();
//   const startOffset = firstDay.getDay();

//   let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => `<div class="cal-dow">${d}</div>`).join('');

//   for (let i = 0; i < startOffset; i++) html += `<div class="cal-day empty"></div>`;

//   for (let day = 1; day <= daysInMonth; day++) {
//     const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
//     const entry = byDate[dateStr];
//     if (entry) {
//       const savings = Calc.finalSavings(entry);
//       const cls = savings >= 0 ? 'profit' : 'loss';
//       html += `<div class="cal-day ${cls}" title="${dateStr}"><span class="d-num">${day}</span><span class="d-val">${savings >= 0 ? '+' : ''}${Math.round(savings)}</span></div>`;
//     } else {
//       html += `<div class="cal-day" title="${dateStr}"><span class="d-num">${day}</span></div>`;
//     }
//   }

//   grid.innerHTML = html;
// }

/* ---------- Calendar view (Tracking Sent Home Money) ---------- */

function renderCalendar(entries) {
  const grid = document.getElementById('calendar-grid');
  const [from] = resolveRangeBounds();
  const ref = new Date(from + 'T00:00:00');
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const byDate = {};
  entries.forEach((e) => { byDate[e.date] = e; });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();

  let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => `<div class="cal-dow">${d}</div>`).join('');

  for (let i = 0; i < startOffset; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = byDate[dateStr];
    if (entry) {
      // Pull sent home money instead of savings
      const sentHome = num(entry.sentHome); 
      const cls = sentHome > 0 ? 'profit' : '';
      html += `<div class="cal-day ${cls}" title="${dateStr}">
        <span class="d-num">${day}</span>
        <span class="d-val">${sentHome > 0 ? '₹' + Math.round(sentHome) : '—'}</span>
      </div>`;
    } else {
      html += `<div class="cal-day" title="${dateStr}"><span class="d-num">${day}</span></div>`;
    }
  }

  grid.innerHTML = html;
}

function renderTable(entries) {
  const tbody = document.getElementById('main-tbody');
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="16"><div class="empty-state"><i class="fa-solid fa-road"></i>No entries in this range.</div></td></tr>`;
    return;
  }
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));

  tbody.innerHTML = sorted.map((e) => {
    const savings = Calc.finalSavings(e);
    const rowClass = savings >= 0 ? 'profit-row' : 'loss-row';
    const notes = (e.notes || '').replace(/</g, '&lt;');
    return `<tr class="${rowClass}">
      <td>${e.date}</td>
      <td>${formatCurrency(num(e.swiggy))}</td>
      <td>${formatCurrency(num(e.zomato))}</td>
      <td>${formatCurrency(num(e.other))}</td>
      <td>${formatCurrency(Calc.totalEarnings(e))}</td>
      <td>${formatCurrency(num(e.petrol))}</td>
      <td>${formatCurrency(num(e.food))}</td>
      <td>${formatCurrency(num(e.tea))}</td>
      <td>${formatCurrency(num(e.recharge))}</td>
      <td>${formatCurrency(num(e.bike))}</td>
      <td>${formatCurrency(num(e.misc))}</td>
      <td>${formatCurrency(Calc.totalExpenses(e))}</td>
      <td>${formatCurrency(num(e.sentHome))}</td>
      <td class="savings-cell">${formatCurrency(savings)}</td>
      <td style="font-family:var(--font-body); white-space:normal; max-width:180px;">${notes || '—'}</td>
      <td class="row-actions">
        <button class="icon-btn btn-sm" style="width:30px;height:30px;" onclick="editRow('${e.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn btn-sm" style="width:30px;height:30px;" onclick="askDeleteRow('${e.id}','${e.date}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function editRow(id) {
  localStorage.setItem('dpt_edit_target', id);
  window.location.href = 'index.html';
}

function askDeleteRow(id, date) {
  pendingRowDeleteId = id;
  document.getElementById('row-delete-date').textContent = date;
  document.getElementById('row-delete-modal').classList.add('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cancel-row-delete').addEventListener('click', () => {
    document.getElementById('row-delete-modal').classList.remove('open');
    pendingRowDeleteId = null;
  });
  document.getElementById('confirm-row-delete').addEventListener('click', async () => {
    if (pendingRowDeleteId) {
      await Storage.remove(pendingRowDeleteId);
      showToast('Entry deleted.', 'success');
      await render();
    }
    document.getElementById('row-delete-modal').classList.remove('open');
    pendingRowDeleteId = null;
  });
});

function renderCharts(entries) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const labels = sorted.map((e) => e.date.slice(5));
  const earnData = sorted.map((e) => Calc.totalEarnings(e));
  const expData = sorted.map((e) => Calc.totalExpenses(e));
  const saveData = sorted.map((e) => Calc.finalSavings(e));

  const gridColor = document.documentElement.getAttribute('data-theme') === 'light'
    ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const textColor = document.documentElement.getAttribute('data-theme') === 'light'
    ? '#55596a' : '#9aa1b1';

  const trendCtx = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Earnings', data: earnData, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)', tension: 0.35, fill: true, pointRadius: 2 },
        { label: 'Expenses', data: expData, borderColor: '#f76a6a', backgroundColor: 'rgba(247,106,106,0.08)', tension: 0.35, fill: true, pointRadius: 2 },
        { label: 'Savings', data: saveData, borderColor: '#ff7a3d', backgroundColor: 'rgba(255,122,61,0.08)', tension: 0.35, fill: true, pointRadius: 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor, font: { family: 'Inter', size: 11 } } } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
      },
    },
  });

  const totals = {
    Petrol: sum(entries, (e) => num(e.petrol)),
    Food: sum(entries, (e) => num(e.food)),
    Tea: sum(entries, (e) => num(e.tea)),
    Recharge: sum(entries, (e) => num(e.recharge)),
    Bike: sum(entries, (e) => num(e.bike)),
    Misc: sum(entries, (e) => num(e.misc)),
  };

  const pieCtx = document.getElementById('expense-pie').getContext('2d');
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(totals),
      datasets: [{
        data: Object.values(totals),
        backgroundColor: ['#ff7a3d', '#f76a6a', '#f5c451', '#60a5fa', '#a78bfa', '#34d399'],
        borderColor: 'transparent',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Inter', size: 10 }, boxWidth: 10, padding: 10 } } },
    },
  });
}

function renderReport(entries) {
  const grid = document.getElementById('report-grid');
  const items = [
    ['Total Swiggy Income', sum(entries, (e) => num(e.swiggy))],
    ['Total Zomato Income', sum(entries, (e) => num(e.zomato))],
    ['Total Other Income', sum(entries, (e) => num(e.other))],
    ['Total Petrol', sum(entries, (e) => num(e.petrol))],
    ['Total Food', sum(entries, (e) => num(e.food))],
    ['Total Tea', sum(entries, (e) => num(e.tea))],
    ['Total Recharge', sum(entries, (e) => num(e.recharge))],
    ['Total Bike', sum(entries, (e) => num(e.bike))],
    ['Total Misc', sum(entries, (e) => num(e.misc))],
    ['Total Sent Home', sum(entries, (e) => num(e.sentHome))],
    ['Net Profit', sum(entries, Calc.finalSavings)],
    ['Number of Working Days', entries.length],
    ['Average Earnings', entries.length ? sum(entries, Calc.totalEarnings) / entries.length : 0],
    ['Average Expenses', entries.length ? sum(entries, Calc.totalExpenses) / entries.length : 0],
    ['Average Savings', entries.length ? sum(entries, Calc.finalSavings) / entries.length : 0],
  ];

  grid.innerHTML = items.map(([label, val]) => {
    const display = label === 'Number of Working Days' ? val : formatCurrency(val);
    return `<div class="report-item"><div class="r-lbl">${label}</div><div class="r-val">${display}</div></div>`;
  }).join('');
}

function initExport() {
  document.getElementById('btn-export-csv').addEventListener('click', async () => await exportCSV());
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-pdf').addEventListener('click', () => {
    showToast('Use "Save as PDF" in the print dialog.', 'info');
    window.print();
  });
}

async function exportCSV() {
  const entries = (await entriesInRange()).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!entries.length) { showToast('No entries to export in this range.', 'error'); return; }

  const headers = ['Date', 'Swiggy', 'Zomato', 'Other', 'Total Earnings', 'Petrol', 'Food', 'Tea', 'Recharge', 'Bike', 'Misc', 'Total Expenses', 'Sent Home', 'Savings', 'Notes'];
  const rows = entries.map((e) => [
    e.date, num(e.swiggy), num(e.zomato), num(e.other), Calc.totalEarnings(e),
    num(e.petrol), num(e.food), num(e.tea), num(e.recharge), num(e.bike), num(e.misc),
    Calc.totalExpenses(e), num(e.sentHome), Calc.finalSavings(e),
    '"' + (e.notes || '').replace(/"/g, '""') + '"',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, `route-ledger-${resolveRangeBounds().join('_to_')}.csv`, 'text/csv');
  showToast('CSV exported.', 'success');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initDataManagement() {
  document.getElementById('btn-backup').addEventListener('click', async () => {
    const json = await Storage.exportBackup();
    downloadFile(json, `route-ledger-backup-${todayISO()}.json`, 'application/json');
    showToast('Backup downloaded.', 'success');
  });

  document.getElementById('btn-restore').addEventListener('click', () => {
    document.getElementById('restore-file').click();
  });

  document.getElementById('restore-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result);
        const count = await Storage.restoreBackup(payload);
        showToast(`Restored ${count} entries.`, 'success');
        await render();
      } catch (err) {
        showToast('Could not read that backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btn-delete-all').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('open');
  });
  document.getElementById('cancel-delete').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.remove('open');
  });
  document.getElementById('confirm-delete').addEventListener('click', async () => {
    await Storage.clearAll();
    document.getElementById('delete-modal').classList.remove('open');
    showToast('All data deleted.', 'success');
    await render();
  });
}

function showToast(message, type = 'info') {
  const region = document.getElementById('toast-region');
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  region.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}


function initDataManagement() {
  document.getElementById('btn-backup')?.addEventListener('click', async () => {
    const json = await Storage.exportBackup();
    downloadFile(json, `route-ledger-backup-${todayISO()}.json`, 'application/json');
    showToast('Backup downloaded.', 'success');
  });

  document.getElementById('btn-restore')?.addEventListener('click', () => {
    document.getElementById('restore-file')?.click();
  });

  document.getElementById('restore-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result);
        const count = await Storage.restoreBackup(payload);
        showToast(`Restored ${count} entries.`, 'success');
        await render();
      } catch (err) {
        showToast('Could not read that backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Optional chaining (?.) prevents errors when the delete button is hidden/commented out
  document.getElementById('btn-delete-all')?.addEventListener('click', () => {
    document.getElementById('delete-modal')?.classList.add('open');
  });
  document.getElementById('cancel-delete')?.addEventListener('click', () => {
    document.getElementById('delete-modal')?.classList.remove('open');
  });
  document.getElementById('confirm-delete')?.addEventListener('click', async () => {
    await Storage.clearAll();
    document.getElementById('delete-modal')?.classList.remove('open');
    showToast('All data deleted.', 'success');
    await render();
  });
}

document.getElementById('s-high-save').innerHTML = `${formatCurrency(Calc.finalSavings(highSave))} <span class="stat-date">· ${highSave.date}</span>`;