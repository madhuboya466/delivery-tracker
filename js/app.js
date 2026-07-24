/* ==========================================================================
   app.js — Daily Entry page (index.html)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initClock();
  initForm();
  await renderRecent();
  await loadEditTargetIfAny();
});

async function loadEditTargetIfAny() {
  const id = localStorage.getItem('dpt_edit_target');
  if (!id) return;
  localStorage.removeItem('dpt_edit_target');
  await loadEntryToForm(id);
}

function initTheme() {
  const saved = Storage.getTheme();
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.setTheme(next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
}

function initClock() {
  const el = document.getElementById('clock-pill');
  const render = () => {
    const now = new Date();
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })} · ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };
  render();
  setInterval(render, 30000);
}

const FIELD_IDS = ['swiggy', 'zomato', 'other', 'petrol', 'food', 'tea', 'recharge', 'bike', 'misc', 'senthome'];

function initForm() {
  const dateInput = document.getElementById('f-date');
  dateInput.value = todayISO();

  const form = document.getElementById('entry-form');

  FIELD_IDS.forEach((id) => {
    document.getElementById('f-' + id).addEventListener('input', updateLiveCalc);
  });

  document.getElementById('f-senthome').value = 700;

  document.getElementById('btn-clear').addEventListener('click', () => resetForm());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveEntry();
  });

  document.getElementById('fab-add').addEventListener('click', () => {
    document.getElementById('f-date').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('f-swiggy').focus();
  });

  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      await saveEntry();
    }
  });

  updateLiveCalc();
}

function collectFormEntry() {
  return {
    date: document.getElementById('f-date').value,
    swiggy: document.getElementById('f-swiggy').value,
    zomato: document.getElementById('f-zomato').value,
    other: document.getElementById('f-other').value,
    petrol: document.getElementById('f-petrol').value,
    food: document.getElementById('f-food').value,
    tea: document.getElementById('f-tea').value,
    recharge: document.getElementById('f-recharge').value,
    bike: document.getElementById('f-bike').value,
    misc: document.getElementById('f-misc').value,
    sentHome: document.getElementById('f-senthome').value,
    notes: document.getElementById('f-notes').value.trim(),
  };
}

function updateLiveCalc() {
  const entry = collectFormEntry();
  document.getElementById('calc-earnings').textContent = formatCurrency(Calc.totalEarnings(entry));
  document.getElementById('calc-expenses').textContent = formatCurrency(Calc.totalExpenses(entry));
  document.getElementById('calc-balance').textContent = formatCurrency(Calc.balanceBeforeHome(entry));
  const savingsEl = document.getElementById('calc-savings');
  const savings = Calc.finalSavings(entry);
  savingsEl.textContent = formatCurrency(savings);
  savingsEl.className = 'val mono ' + (savings >= 0 ? 'up' : 'down');
}

function validateForm() {
  let valid = true;

  const dateField = document.getElementById('f-date').closest('.field');
  const dateVal = document.getElementById('f-date').value;
  if (!dateVal) {
    dateField.classList.add('has-error');
    document.getElementById('f-date').classList.add('invalid');
    valid = false;
  } else {
    dateField.classList.remove('has-error');
    document.getElementById('f-date').classList.remove('invalid');
  }

  FIELD_IDS.forEach((id) => {
    const input = document.getElementById('f-' + id);
    const field = input.closest('.field');
    const v = input.value;
    if (v !== '' && Number(v) < 0) {
      field.classList.add('has-error');
      input.classList.add('invalid');
      valid = false;
    } else {
      field.classList.remove('has-error');
      input.classList.remove('invalid');
    }
  });

  return valid;
}

async function saveEntry() {
  if (!validateForm()) {
    showToast('Please fix the highlighted fields.', 'error');
    return;
  }
  const entry = collectFormEntry();
  const existing = await Storage.getByDate(entry.date);
  
  try {
    await Storage.upsert(entry);
    showToast(existing ? 'Entry updated for ' + entry.date : 'Entry saved for ' + entry.date, 'success');
    await renderRecent();
  } catch (e) {
    showToast('Failed to save to database.', 'error');
  }
}

function resetForm() {
  document.getElementById('entry-form').reset();
  document.getElementById('f-date').value = todayISO();
  document.getElementById('f-senthome').value = 700;
  document.querySelectorAll('.field').forEach((f) => f.classList.remove('has-error'));
  document.querySelectorAll('input.invalid').forEach((i) => i.classList.remove('invalid'));
  updateLiveCalc();
}

async function renderRecent() {
  const tbody = document.getElementById('recent-tbody');
  const allEntries = await Storage.getAll();
  const entries = allEntries.slice(0, 6);

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-road"></i>No entries yet — save your first ride above.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map((e) => {
    const savings = Calc.finalSavings(e);
    const rowClass = savings >= 0 ? 'profit-row' : 'loss-row';
    return `<tr class="${rowClass}">
      <td>${e.date}</td>
      <td>${formatCurrency(num(e.swiggy))}</td>
      <td>${formatCurrency(num(e.zomato))}</td>
      <td>${formatCurrency(num(e.other))}</td>
      <td>${formatCurrency(Calc.totalEarnings(e))}</td>
      <td>${formatCurrency(Calc.totalExpenses(e))}</td>
      <td>${formatCurrency(num(e.sentHome))}</td>
      <td class="savings-cell">${formatCurrency(savings)}</td>
      <td class="row-actions">
        <button class="icon-btn btn-sm" style="width:30px;height:30px;" onclick="loadEntryToForm('${e.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function loadEntryToForm(id) {
  const e = await Storage.getById(id);
  if (!e) return;
  document.getElementById('f-date').value = e.date;
  FIELD_IDS.forEach((f) => {
    const key = f === 'senthome' ? 'sentHome' : f;
    document.getElementById('f-' + f).value = e[key] ?? '';
  });
  document.getElementById('f-notes').value = e.notes || '';
  updateLiveCalc();
  document.getElementById('entry-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Loaded entry from ' + e.date + ' for editing.', 'info');
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