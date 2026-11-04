import * as api from './api.js?v=20261103b';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const num = new Intl.NumberFormat('en-US');
const state = {
  session: null,
  routes: [],
  stations: [],
  governorates: [],
  vehicles: [],
  routeInspectors: [],
  routeLookupsLoaded: false,
  stationFilters: { search: '', governorate: '' },
  stationEditingId: null,
  governorateEditingCode: null,
  vehicleEditingId: null,
  inspectors: [],
  users: [],
  support: [],
  supportTab: 'support',
  supportActive: null,
  supportThread: [],
  people: { users: [], inspectors: [] },
  peopleFilters: {
    users: { search: '', governorate: '', role: '', minCompliance: '' },
    inspectors: { search: '', governorate: '', minCompliance: '' },
  },
  routeSeatActive: null,
  routeSeatDate: '',
  routeSeatRequest: 0,
  earningsRange: 'day',
  statsRange: 'day',
  earnings: [],
  charts: { earnings: null, bookings: null },
  subscriptions: [],
  subscriptionPlans: [],
  subscriptionTab: 'requests',
  subscriptionFilters: { status: '', governorate: '' },
  planEditingId: null,
  notifications: [],
  notifLastSeen: localStorage.getItem('busna.notifLastSeen') || '',
  notifTimer: null,
};

// ------------------------------------------------------- custom select UI --

const customSelectState = {
  popup: null,
  list: null,
  openSelect: null,
  openTrigger: null,
};

const nativeSelectValue = Object.getOwnPropertyDescriptor(
  HTMLSelectElement.prototype,
  'value',
);

Object.defineProperty(HTMLSelectElement.prototype, 'value', {
  configurable: true,
  enumerable: nativeSelectValue.enumerable,
  get() {
    return nativeSelectValue.get.call(this);
  },
  set(value) {
    nativeSelectValue.set.call(this, value);
    if (typeof this._syncCustomSelect === 'function') this._syncCustomSelect();
  },
});

function customSelectPopup() {
  if (!customSelectState.popup) {
    const popup = document.createElement('div');
    popup.className = 'custom-select-popup';
    popup.dataset.open = 'false';
    const list = document.createElement('ul');
    list.className = 'custom-select-list';
    list.setAttribute('role', 'listbox');
    popup.appendChild(list);
    document.body.appendChild(popup);
    customSelectState.popup = popup;
    customSelectState.list = list;
  }
  return customSelectState.popup;
}

function closeCustomSelect() {
  if (customSelectState.popup) {
    customSelectState.popup.dataset.open = 'false';
  }
  if (customSelectState.openTrigger) {
    customSelectState.openTrigger.setAttribute('aria-expanded', 'false');
  }
  customSelectState.openSelect = null;
  customSelectState.openTrigger = null;
}

function renderCustomSelectOptions(select) {
  const list = customSelectState.list;
  if (!list) return;
  list.innerHTML = '';
  Array.from(select.options).forEach((option, index) => {
    const item = document.createElement('li');
    item.className = 'custom-select-option';
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '-1');
    item.setAttribute(
      'aria-selected',
      index === select.selectedIndex ? 'true' : 'false',
    );
    if (option.disabled) item.setAttribute('aria-disabled', 'true');
    item.textContent = option.textContent;
    item.addEventListener('click', () => {
      if (option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeCustomSelect();
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        item.click();
      } else if (event.key === 'Escape') {
        const trigger = customSelectState.openTrigger;
        closeCustomSelect();
        trigger?.focus();
      }
    });
    list.appendChild(item);
  });

  const popup = customSelectState.popup;
  const selected = list.children[select.selectedIndex];
  if (popup && selected) {
    popup.scrollTop = Math.max(
      0,
      selected.offsetTop - popup.clientHeight / 2 + selected.offsetHeight / 2,
    );
  }
}

function positionCustomSelect(trigger) {
  const popup = customSelectState.popup;
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const width = Math.max(rect.width, 180);
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const openAbove = spaceBelow < 170 && spaceAbove > spaceBelow;
  const left = Math.max(
    margin,
    Math.min(rect.right - width, window.innerWidth - width - margin),
  );

  popup.style.width = `${Math.min(width, window.innerWidth - margin * 2)}px`;
  popup.style.left = `${left}px`;
  popup.style.maxHeight = `${Math.min(300, Math.max(140, openAbove ? spaceAbove : spaceBelow))}px`;

  if (openAbove) {
    popup.style.top = 'auto';
    popup.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  } else {
    popup.style.top = `${rect.bottom + gap}px`;
    popup.style.bottom = 'auto';
  }
}

function openCustomSelect(select, trigger, render) {
  if (typeof closeDateTimePicker === 'function') closeDateTimePicker();
  const popup = customSelectPopup();
  if (customSelectState.openSelect === select && popup.dataset.open === 'true') {
    closeCustomSelect();
    return;
  }
  closeCustomSelect();
  const host = trigger.closest('dialog[open]') || document.body;
  if (popup.parentNode !== host) host.appendChild(popup);
  customSelectState.openSelect = select;
  customSelectState.openTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  render();
  positionCustomSelect(trigger);
  popup.dataset.open = 'true';
}

function enhanceCustomSelect(select) {
  if (!select || select.dataset.customSelect === 'true' || select.multiple) {
    return;
  }
  select.dataset.customSelect = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('custom-select-native');
  select.setAttribute('tabindex', '-1');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const valueLabel = document.createElement('span');
  valueLabel.className = 'custom-select-value';
  trigger.appendChild(valueLabel);
  wrapper.appendChild(trigger);

  const sync = () => {
    const option = select.options[select.selectedIndex];
    valueLabel.textContent = option ? option.textContent : '—';
    trigger.disabled = select.disabled;
    trigger.classList.toggle('is-placeholder', !select.value);
    if (customSelectState.openSelect === select) {
      renderCustomSelectOptions(select);
      if (customSelectState.openTrigger) {
        positionCustomSelect(customSelectState.openTrigger);
      }
    }
  };

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCustomSelect(select, trigger, () =>
      renderCustomSelectOptions(select),
    );
  });

  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openCustomSelect(select, trigger, () =>
        renderCustomSelectOptions(select),
      );
      const items = Array.from(customSelectState.list.children).filter(
        (item) => item.getAttribute('aria-disabled') !== 'true',
      );
      const target = items[select.selectedIndex] || items[0];
      target?.focus();
    } else if (event.key === 'Escape') {
      closeCustomSelect();
    }
  });

  select.addEventListener('change', sync);
  select._syncCustomSelect = sync;

  const observer = new MutationObserver(sync);
  observer.observe(select, { childList: true });

  sync();
}

function initCustomSelects() {
  document.querySelectorAll('select').forEach(enhanceCustomSelect);

  // A form.reset() reverts selectedIndex without touching `.value`, so refresh
  // the custom labels on the next microtask (after the default reset action).
  document.addEventListener(
    'reset',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      queueMicrotask(() => {
        form
          .querySelectorAll('select')
          .forEach((select) => select._syncCustomSelect?.());
      });
    },
    true,
  );

  document.addEventListener('click', (event) => {
    if (!customSelectState.openSelect) return;
    if (
      event.target.closest('.custom-select-popup') ||
      event.target.closest('.custom-select-trigger')
    ) {
      return;
    }
    closeCustomSelect();
  });

  window.addEventListener(
    'scroll',
    (event) => {
      if (event.target === customSelectState.popup) return;
      closeCustomSelect();
    },
    true,
  );
  window.addEventListener('resize', closeCustomSelect);

  const bodyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'SELECT') enhanceCustomSelect(node);
        node.querySelectorAll?.('select').forEach(enhanceCustomSelect);
      });
    }
    if (
      customSelectState.openSelect &&
      !document.body.contains(customSelectState.openSelect)
    ) {
      closeCustomSelect();
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------- custom date / time --

const customDateTimeState = {
  popup: null,
  openInput: null,
  openTrigger: null,
  viewDate: null,
  hour: 8,
  minute: 0,
};

const DATE_CALENDAR_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 8H5v10h14V10Z"/></svg>';
const DATE_CLOCK_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z"/></svg>';

const inputValueDescriptor = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value',
);

function initCustomDateTimes() {
  document
    .querySelectorAll('input[type="date"], input[type="time"]')
    .forEach(enhanceDateTimeInput);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('input[type="date"], input[type="time"]')) {
          enhanceDateTimeInput(node);
        }
        node
          .querySelectorAll?.('input[type="date"], input[type="time"]')
          .forEach(enhanceDateTimeInput);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    if (!customDateTimeState.openInput) return;
    if (
      event.target.closest('.custom-datetime-popup') ||
      event.target.closest('.custom-datetime-trigger')
    ) {
      return;
    }
    closeDateTimePicker();
  });

  window.addEventListener(
    'scroll',
    (event) => {
      const popup = customDateTimeState.popup;
      if (popup && event.target instanceof Node && popup.contains(event.target)) {
        return;
      }
      closeDateTimePicker();
    },
    true,
  );
  window.addEventListener('resize', closeDateTimePicker);

  document.addEventListener(
    'reset',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      queueMicrotask(() => {
        form
          .querySelectorAll('input[type="date"], input[type="time"]')
          .forEach((input) => input._syncCustomDateTime?.());
      });
    },
    true,
  );
}

function enhanceDateTimeInput(input) {
  if (!input || input.dataset.customDateTime === 'true') return;
  input.dataset.customDateTime = 'true';

  const isDate = input.type === 'date';
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-datetime';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  input.classList.add('custom-datetime-native');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-datetime-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const valueLabel = document.createElement('span');
  valueLabel.className = 'custom-datetime-value';
  const icon = document.createElement('span');
  icon.className = 'custom-datetime-icon';
  icon.innerHTML = isDate ? DATE_CALENDAR_ICON : DATE_CLOCK_ICON;
  trigger.appendChild(valueLabel);
  trigger.appendChild(icon);
  wrapper.appendChild(trigger);

  const sync = () => {
    const value = input.value;
    valueLabel.textContent = value
      ? isDate
        ? formatPickerDate(value)
        : formatClock(value)
      : isDate
        ? 'اختر التاريخ'
        : 'اختر الوقت';
    trigger.classList.toggle('is-placeholder', !value);
  };

  Object.defineProperty(input, 'value', {
    configurable: true,
    get() {
      return inputValueDescriptor.get.call(this);
    },
    set(value) {
      inputValueDescriptor.set.call(this, value);
      sync();
    },
  });

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (customDateTimeState.openInput === input) {
      closeDateTimePicker();
    } else {
      openDateTimePicker(input, trigger);
    }
  });

  input.addEventListener('change', sync);
  input.addEventListener('input', sync);
  input._syncCustomDateTime = sync;
  sync();
}

function customDateTimePopup() {
  if (!customDateTimeState.popup) {
    const popup = document.createElement('div');
    popup.className = 'custom-datetime-popup';
    popup.dataset.open = 'false';
    document.body.appendChild(popup);
    customDateTimeState.popup = popup;
  }
  return customDateTimeState.popup;
}

function closeDateTimePicker() {
  if (customDateTimeState.popup) {
    customDateTimeState.popup.dataset.open = 'false';
  }
  if (customDateTimeState.openTrigger) {
    customDateTimeState.openTrigger.setAttribute('aria-expanded', 'false');
  }
  customDateTimeState.openInput = null;
  customDateTimeState.openTrigger = null;
}

function openDateTimePicker(input, trigger) {
  closeCustomSelect();
  closeDateTimePicker();
  const popup = customDateTimePopup();
  const host = trigger.closest('dialog[open]') || document.body;
  if (popup.parentNode !== host) host.appendChild(popup);

  customDateTimeState.openInput = input;
  customDateTimeState.openTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');

  if (input.type === 'date') {
    const current = input.value
      ? new Date(`${input.value}T00:00:00`)
      : new Date();
    customDateTimeState.viewDate = new Date(
      current.getFullYear(),
      current.getMonth(),
      1,
    );
    renderCalendarPicker();
    positionDateTimePicker(trigger, 286);
  } else {
    const [hour, minute] = (input.value || '08:00').split(':');
    customDateTimeState.hour = Number(hour) || 0;
    customDateTimeState.minute = Number(minute) || 0;
    renderTimePicker();
    positionDateTimePicker(trigger, 224);
  }

  popup.dataset.open = 'true';
}

function positionDateTimePicker(trigger, width) {
  const popup = customDateTimeState.popup;
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const popupWidth = Math.min(width, window.innerWidth - margin * 2);
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
  const left = Math.max(
    margin,
    Math.min(rect.right - popupWidth, window.innerWidth - popupWidth - margin),
  );

  popup.style.width = `${popupWidth}px`;
  popup.style.left = `${left}px`;
  popup.style.maxHeight = `${Math.min(340, Math.max(180, openAbove ? spaceAbove : spaceBelow))}px`;

  if (openAbove) {
    popup.style.top = 'auto';
    popup.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  } else {
    popup.style.top = `${rect.bottom + gap}px`;
    popup.style.bottom = 'auto';
  }
}

function formatPickerDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function renderCalendarPicker() {
  const popup = customDateTimeState.popup;
  const input = customDateTimeState.openInput;
  const view = customDateTimeState.viewDate;
  const year = view.getFullYear();
  const month = view.getMonth();
  const selected = input?.value
    ? new Date(`${input.value}T00:00:00`)
    : null;
  const today = new Date();
  const startOffset = (new Date(year, month, 1).getDay() + 1) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat('ar-EG', {
    month: 'long',
    year: 'numeric',
  }).format(view);
  const weekdays = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

  let cells = '';
  for (let index = 0; index < startOffset; index += 1) {
    cells += '<span class="calendar-day is-blank"></span>';
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const classes = ['calendar-day'];
    if (selected && date.toDateString() === selected.toDateString()) {
      classes.push('is-selected');
    }
    if (date.toDateString() === today.toDateString()) {
      classes.push('is-today');
    }
    cells += `<button type="button" class="${classes.join(' ')}" data-date="${iso}">${day}</button>`;
  }

  popup.innerHTML = `
    <div class="calendar-head">
      <button type="button" class="calendar-nav" data-month="-1" aria-label="الشهر السابق">›</button>
      <span class="calendar-title">${monthLabel}</span>
      <button type="button" class="calendar-nav" data-month="1" aria-label="الشهر التالي">‹</button>
    </div>
    <div class="calendar-weekdays">${weekdays
      .map((weekday) => `<span>${weekday}</span>`)
      .join('')}</div>
    <div class="calendar-grid">${cells}</div>`;

  popup.querySelectorAll('[data-month]').forEach((button) => {
    button.addEventListener('click', () => {
      const delta = Number(button.dataset.month);
      customDateTimeState.viewDate = new Date(year, month + delta, 1);
      renderCalendarPicker();
    });
  });

  popup.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!customDateTimeState.openInput) return;
      customDateTimeState.openInput.value = button.dataset.date;
      customDateTimeState.openInput.dispatchEvent(
        new Event('change', { bubbles: true }),
      );
      closeDateTimePicker();
    });
  });
}

function renderTimePicker() {
  const popup = customDateTimeState.popup;
  const hour = customDateTimeState.hour;
  const minute = customDateTimeState.minute;

  const hours = Array.from({ length: 24 }, (_, value) => {
    const selected = value === hour ? ' is-selected' : '';
    return `<button type="button" class="time-option${selected}" data-hour="${value}">${pad2(value)}</button>`;
  }).join('');
  const minutes = Array.from({ length: 60 }, (_, value) => {
    const selected = value === minute ? ' is-selected' : '';
    return `<button type="button" class="time-option${selected}" data-minute="${value}">${pad2(value)}</button>`;
  }).join('');

  popup.innerHTML = `
    <div class="time-picker">
      <div class="time-col">
        <span class="time-col-head">الساعة</span>
        ${hours}
      </div>
      <div class="time-col">
        <span class="time-col-head">الدقيقة</span>
        ${minutes}
      </div>
    </div>`;

  popup.querySelectorAll('.time-col').forEach((column) => {
    const selected = column.querySelector('.is-selected');
    if (selected) {
      column.scrollTop = Math.max(
        0,
        selected.offsetTop - column.clientHeight / 2 + selected.offsetHeight / 2,
      );
    }
  });

  popup.querySelectorAll('[data-hour]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!customDateTimeState.openInput) return;
      customDateTimeState.hour = Number(button.dataset.hour);
      popup.querySelectorAll('[data-hour]').forEach((item) => {
        item.classList.toggle(
          'is-selected',
          Number(item.dataset.hour) === customDateTimeState.hour,
        );
      });
      customDateTimeState.openInput.value = `${pad2(customDateTimeState.hour)}:${pad2(customDateTimeState.minute)}`;
      customDateTimeState.openInput.dispatchEvent(
        new Event('change', { bubbles: true }),
      );
    });
  });

  popup.querySelectorAll('[data-minute]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!customDateTimeState.openInput) return;
      customDateTimeState.minute = Number(button.dataset.minute);
      customDateTimeState.openInput.value = `${pad2(customDateTimeState.hour)}:${pad2(customDateTimeState.minute)}`;
      customDateTimeState.openInput.dispatchEvent(
        new Event('change', { bubbles: true }),
      );
      closeDateTimePicker();
    });
  });
}

// ------------------------------------------------------------------ boot --

async function boot() {
  initCustomSelects();
  initCustomDateTimes();
  bindStatic();
  consumeOAuthError();

  let session = null;
  try {
    session = await api.fetchSession();
  } catch (error) {
    showFatal(error.message);
    return;
  }

  renderGate(session);

  if (!session) {
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') || params.has('access_token')) {
      const box = $('#login-error');
      box.textContent =
        'عادنا من تسجيل الدخول لكن لم يتم استلام جلسة. ' +
        'تأكد من ضبط Redirect URLs ثم حاول مرة أخرى.';
      box.classList.remove('hidden');
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }

  api.supabase.auth.onAuthStateChange(async () => {
    try {
      const next = await api.fetchSession();
      renderGate(next);
    } catch (error) {
      toast(error.message);
    }
  });
}

function allowedViews(session) {
  if (!session) return [];
  const views = [];
  if (session.canViewOverview) {
    // Analysts see every screen, just read-only.
    views.push('overview', 'routes', 'stations', 'vehicles', 'inspectors', 'users');
  }
  if (session.canManage) views.push('feedback', 'subscriptions');
  if (session.canUseTools) views.push('tools');
  return views;
}

function renderGate(session) {
  state.session = session;

  $('#boot').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#unauthorized').classList.add('hidden');
  $('#app').classList.add('hidden');

  if (!session) {
    $('#login').classList.remove('hidden');
    return;
  }
  if (!session.canViewOverview) {
    $('#unauthorized-email').textContent = session.email;
    $('#unauthorized').classList.remove('hidden');
    return;
  }

  const views = allowedViews(session);
  $$('.nav-item').forEach((item) => {
    item.classList.toggle('hidden', !views.includes(item.dataset.view));
  });

  // Write affordances disappear for read-only roles (analyst).
  $('#btn-add-route').classList.toggle('hidden', !session.canManage);
  $('#btn-add-station').classList.toggle('hidden', !session.canManage);
  $('#btn-add-governorate').classList.toggle('hidden', !session.canManage);
  $('#btn-add-vehicle').classList.toggle('hidden', !session.canManage);
  $('#btn-add-inspector').classList.toggle('hidden', !session.canManage);
  $('#users-hint').textContent = session.canEditUsers
    ? session.canAssignAdmin
      ? 'دور واحد لكل حساب. لا يمكنك تغيير دورك بنفسك.'
      : 'يمكنك تعديل الطلاب والمحللين والمفتشين. حسابات الإدارة للمدير العام فقط.'
    : 'عرض فقط. تغيير الأدوار غير متاح لهذا الحساب.';

  $('#account-email').textContent = session.email;
  $('#account-role').textContent = session.roleLabel;
  $('#app').classList.remove('hidden');
  $('.topbar').classList.toggle('hidden', !session.canManage);
  showView(views.includes(currentView()) ? currentView() : views[0]);
  if (session.canViewOverview) {
    ensureStations().catch(() => {});
  }
  if (session.canManage) startNotificationPolling();
}

function startNotificationPolling() {
  if (state.notifTimer) return;
  loadNotifications();
  state.notifTimer = setInterval(loadNotifications, 30000);
}

function showFatal(message) {
  console.error('dashboard bootstrap failed:', message);
  $('#boot').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#unauthorized').classList.remove('hidden');
  $('#unauthorized-email').textContent = 'تعذر الاتصال بالخادم. أعد المحاولة لاحقاً.';
}

// Surfaces errors Supabase sends back on the redirect (?error=...&error_description=...)
// so a misconfigured Redirect URL is visible instead of a blank redirect failure.
function consumeOAuthError() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('error_description') || params.get('error');
  if (!raw) return;

  const box = $('#login-error');
  box.textContent = `فشل تسجيل الدخول: ${decodeURIComponent(raw.replaceAll('+', ' '))}`;
  box.classList.remove('hidden');

  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
}

// ------------------------------------------------------------------ views --

const VIEWS = [
  'overview',
  'routes',
  'stations',
  'vehicles',
  'inspectors',
  'feedback',
  'subscriptions',
  'users',
  'tools',
];

function currentView() {
  const hash = window.location.hash.replace('#', '');
  return VIEWS.includes(hash) ? hash : 'overview';
}

function showView(name) {
  const allowed = allowedViews(state.session);
  const target = allowed.includes(name) ? name : (allowed[0] || 'overview');

  $$('.nav-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === target);
  });
  VIEWS.forEach((view) => {
    $(`#view-${view}`).classList.toggle('hidden', view !== target);
  });

  if (target === 'overview') loadOverview();
  if (target === 'routes') loadRoutes();
  if (target === 'stations') loadStations();
  if (target === 'vehicles') loadVehicles();
  if (target === 'inspectors') loadInspectors();
  if (target === 'feedback') loadSupport();
  if (target === 'subscriptions') loadSubscriptions();
  if (target === 'users') loadUsers();
  if (target === 'tools') loadTools();
}

// Disables the trigger button (with aria-busy) while `fn` is in flight and
// always restores it, on success and on error alike.
async function withBusy(button, fn) {
  if (!button) return fn();
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// Honest note under a list table: `عرض X من Y`, warn-toned when truncated.
function renderListNotice(viewName, shown, total) {
  const section = $(`#view-${viewName}`);
  const wrap = section.querySelector('.table-wrap');
  let note = section.querySelector('.page-notice');
  if (total == null) {
    if (note) note.remove();
    return;
  }
  if (!note) {
    note = document.createElement('p');
    note.className = 'page-notice';
    wrap.insertAdjacentElement('afterend', note);
  }
  note.classList.toggle('page-notice-warn', total > shown);
  note.textContent = `عرض ${num.format(shown)} من ${num.format(total)}`;
}

// --------------------------------------------------------------- overview --

const STAT_LABELS = [
  ['total_users', 'إجمالي المستخدمين'],
  ['total_students', 'الطلاب'],
  ['total_inspectors', 'المفتشون'],
  ['total_routes', 'المسارات'],
  ['active_routes', 'المسارات الفعّالة'],
  ['upcoming_bookings', 'حجوزات قادمة'],
];

const STAT_RANGE_LABELS = {
  day: 'اليوم',
  week: 'الأسبوع',
  month: 'الشهر',
  year: 'السنة',
};

async function loadOverview(trigger = null) {
  const errorBox = $('#overview-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    const [statsRes, bookingsRes, summaryRes, earningsRes, collectionsRes] =
      await Promise.allSettled([
        api.fetchStats(state.statsRange),
        api.fetchRecentBookings(),
        api.fetchDashboardSummary(),
        api.fetchEarnings(state.earningsRange),
        api.fetchInspectorCollections(),
      ]);

    const problems = [];
    const reason = (result) => result.reason?.message || String(result.reason);

    renderStats(
      statsRes.status === 'fulfilled' ? statsRes.value : null,
      summaryRes.status === 'fulfilled' ? summaryRes.value : {},
    );
    if (statsRes.status === 'rejected') problems.push(`الإحصائيات: ${reason(statsRes)}`);
    if (summaryRes.status === 'rejected') problems.push(`الملخص: ${reason(summaryRes)}`);

    if (bookingsRes.status === 'fulfilled') {
      renderBookings(bookingsRes.value.rows);
      renderListNotice('overview', bookingsRes.value.rows.length, bookingsRes.value.total);
    } else {
      problems.push(`الحجوزات: ${reason(bookingsRes)}`);
    }

    if (collectionsRes.status === 'fulfilled') {
      renderCollections(collectionsRes.value);
    } else {
      problems.push(`تحصيلات المفتشين: ${reason(collectionsRes)}`);
    }

    if (earningsRes.status === 'fulfilled') {
      try {
        renderCharts(earningsRes.value);
      } catch (error) {
        problems.push(`الرسوم: ${error.message}`);
      }
    } else {
      problems.push(`الأرباح: ${reason(earningsRes)}`);
    }

    if (problems.length) {
      errorBox.textContent = problems.join(' • ');
      errorBox.classList.remove('hidden');
      console.error('overview problems:', problems);
    }
  });
}

async function refreshStats(trigger = null) {
  const errorBox = $('#overview-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const [stats, summary] = await Promise.all([
        api.fetchStats(state.statsRange),
        api.fetchDashboardSummary(),
      ]);
      renderStats(stats, summary);
    } catch (error) {
      errorBox.textContent = `الإحصائيات: ${error.message}`;
      errorBox.classList.remove('hidden');
    }
  });
}

function money(value) {
  return `${num.format(Number(value || 0))} ج.م`;
}

function renderStats(stats, summary = {}) {
  const grid = $('#stat-grid');
  if (!stats) {
    grid.innerHTML = '<p class="empty">لا توجد بيانات.</p>';
    return;
  }

  const rangeLabel = STAT_RANGE_LABELS[state.statsRange] || STAT_RANGE_LABELS.day;
  const periodLabels = [
    ['range_bookings', `حجوزات ${rangeLabel}`],
    ['range_completed', `صعود ${rangeLabel}`],
    ['range_cancelled', `إلغاءات ${rangeLabel}`],
    ['range_no_shows', `غياب ${rangeLabel}`],
  ];

  const cards = [...STAT_LABELS, ...periodLabels].map(
    ([key, label]) => `
      <div class="stat">
        <span class="stat-value">${num.format(Number(stats[key] ?? 0))}</span>
        <span class="stat-label">${label}</span>
      </div>`,
  );

  cards.push(
    `
    <div class="stat stat-wide">
      <span class="stat-value">${money(stats.range_revenue)}</span>
      <span class="stat-label">أرباح ${rangeLabel}</span>
    </div>`,
    `
    <div class="stat">
      <span class="stat-value">${num.format(Number(summary.active_subscriptions ?? 0))}</span>
      <span class="stat-label">اشتراكات نشطة</span>
    </div>`,
    `
    <div class="stat">
      <span class="stat-value">${num.format(Number(summary.pending_subscriptions ?? 0))}</span>
      <span class="stat-label">اشتراكات بانتظار التحصيل</span>
    </div>`,
  );

  grid.innerHTML = cards.join('');
}

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function formatBucket(value, range) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  if (range === 'month') {
    return `${MONTHS_AR[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
  }
  if (range === 'week') {
    return `${date.getDate()}/${date.getMonth() + 1}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        rtl: true,
        labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Tajawal' } },
      },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        callbacks: {
          label: (context) => `${context.dataset.label}: ${money(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => num.format(value),
        },
      },
    },
    elements: {
      line: { tension: 0.35, borderWidth: 2.5 },
      point: { radius: 2, hoverRadius: 5 },
    },
  };
}

function chartCountOptions() {
  const options = chartOptions();
  options.plugins.tooltip.callbacks.label = (context) =>
    `${context.dataset.label}: ${num.format(context.parsed.y)}`;
  return options;
}

function renderCharts(rows) {
  state.earnings = rows;
  if (!window.Chart) return;

  const labels = rows.map((row) => formatBucket(row.bucket_start, state.earningsRange));
  const ticketRevenue = rows.map((row) => Number(row.ticket_revenue || 0));
  const subRevenue = rows.map((row) => Number(row.subscription_revenue || 0));
  const totalRevenue = rows.map((row) => Number(row.total || 0));
  const ticketCounts = rows.map((row) => Number(row.ticket_count || 0));
  const subCounts = rows.map((row) => Number(row.subscription_count || 0));

  const earningsData = {
    labels,
    datasets: [
      {
        label: 'أرباح التذاكر',
        data: ticketRevenue,
        borderColor: '#2e7dd1',
        backgroundColor: 'rgba(46, 125, 209, 0.12)',
      },
      {
        label: 'أرباح الاشتراكات',
        data: subRevenue,
        borderColor: '#35c759',
        backgroundColor: 'rgba(53, 199, 89, 0.12)',
      },
      {
        label: 'الإجمالي',
        data: totalRevenue,
        borderColor: '#0e2a47',
        backgroundColor: 'rgba(14, 42, 71, 0.08)',
        borderDash: [6, 4],
      },
    ],
  };

  if (state.charts.earnings) {
    state.charts.earnings.data = earningsData;
    state.charts.earnings.update();
  } else {
    state.charts.earnings = new window.Chart($('#earnings-chart'), {
      type: 'line',
      data: earningsData,
      options: chartOptions(),
    });
  }

  const bookingsData = {
    labels,
    datasets: [
      {
        label: 'تذاكر',
        data: ticketCounts,
        borderColor: '#0e2a47',
        backgroundColor: 'rgba(14, 42, 71, 0.1)',
      },
      {
        label: 'اشتراكات',
        data: subCounts,
        borderColor: '#f2a93b',
        backgroundColor: 'rgba(242, 169, 59, 0.12)',
      },
    ],
  };

  if (state.charts.bookings) {
    state.charts.bookings.data = bookingsData;
    state.charts.bookings.update();
  } else {
    state.charts.bookings = new window.Chart($('#bookings-chart'), {
      type: 'line',
      data: bookingsData,
      options: chartCountOptions(),
    });
  }

  const label = { day: 'آخر 30 يوماً', week: 'آخر 12 أسبوعاً', month: 'آخر 12 شهراً' };
  $('#bookings-range-label').textContent = label[state.earningsRange] || '';
}

function renderCollections(rows) {
  const body = $('#collections-body');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">لا توجد تحصيلات بعد.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.full_name || row.email || '—')}
          <div class="muted small">${escapeHtml(row.email || '')}</div>
        </td>
        <td>${money(row.cash_tickets)}</td>
        <td>${num.format(Number(row.cash_ticket_count || 0))}</td>
        <td>${money(row.subscriptions)}</td>
        <td>${num.format(Number(row.subscription_count || 0))}</td>
        <td><strong>${money(row.total)}</strong></td>
      </tr>`,
    )
    .join('');
}

function renderBookings(rows) {
  const body = $('#bookings-body');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">لا توجد حجوزات بعد.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const user = row.users || {};
      const route = row.routes || {};
      const trip = route.code
        ? `${escapeHtml(route.code)} · ${escapeHtml(route.origin || '')} ← ${escapeHtml(route.destination || '')}`
        : '—';
      return `
        <tr>
          <td>${escapeHtml(user.full_name || '—')}</td>
          <td>${trip}</td>
          <td>${escapeHtml(row.travel_date || '—')}</td>
          <td>${row.seat_num ?? '—'}</td>
          <td>${paymentLabel(row.payment_method)}</td>
          <td>${statusBadge(row.status)}</td>
        </tr>`;
    })
    .join('');
}

// ----------------------------------------------------------------- routes --

async function loadRoutes(trigger = null) {
  const errorBox = $('#routes-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const { rows, total } = await api.fetchRoutes();
      state.routes = rows;
      renderRoutes();
      renderListNotice('routes', rows.length, total);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

const SEAT_PRESETS = {
  bus: [
    { seats: 17, label: '17 مقعد — 4×3 + 5' },
    { seats: 21, label: '21 مقعد — 4×4 + 5' },
    { seats: 25, label: '25 مقعد — 4×5 + 5' },
    { seats: 29, label: '29 مقعد — 4×6 + 5' },
    { seats: 33, label: '33 مقعد — 4×7 + 5' },
    { seats: 37, label: '37 مقعد — 4×8 + 5' },
    { seats: 41, label: '41 مقعد — 4×9 + 5' },
    { seats: 45, label: '45 مقعد — 4×10 + 5' },
    { seats: 49, label: '49 مقعد — 4×11 + 5' },
    { seats: 53, label: '53 مقعد — 4×12 + 5' },
  ],
  microbus: [
    { seats: 12, label: '12 مقعد — 2 + 3 + 3 + 4' },
    { seats: 14, label: '14 مقعد — 2 + 3 + 3 + 3 + 3' },
    { seats: 15, label: '15 مقعد — 2 + 3 + 3 + 3 + 4' },
  ],
  minibus: [
    { seats: 14, label: '14 مقعد — 2 + 4 + 4 + 4' },
    { seats: 17, label: '17 مقعد — 2 + 4 + 4 + 4 + 3' },
    { seats: 22, label: '22 مقعد — 2 + 4×5' },
    { seats: 26, label: '26 مقعد — 2 + 4×6' },
  ],
  tamnaya: [
    { seats: 7, label: '7 مقاعد — 1 + 3 + 3' },
  ],
};

function vehicleLabel(value) {
  if (value === 'microbus') return 'ميكروباص';
  if (value === 'minibus') return 'ميني باص';
  if (value === 'tamnaya') return 'تمناية';
  return 'باص';
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toArabicDigits(value) {
  return String(value ?? '').replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)]);
}

function formatPlateLetters(value) {
  const letters = String(value || '').replace(/[^\u0621-\u064A]/g, '');
  return letters.slice(0, 3).split('').join(' ');
}

function vehiclePlateLabel(vehicle) {
  const letters = String(vehicle.plate_letters || '').trim();
  const numbers = vehicle.plate_numbers;
  return `${letters}${numbers == null ? '' : ` ${toArabicDigits(numbers)}`}`.trim() || '—';
}

function normalizePlateDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[^0-9]/g, '');
}

function populateSeatOptions(vehicle, preferred = null) {
  const select = $('#route-seats');
  if (!select) return;
  const presets = SEAT_PRESETS[vehicle] || SEAT_PRESETS.bus;
  const current = Number(preferred);
  const options = presets.slice();
  if (
    Number.isInteger(current) &&
    current > 0 &&
    !options.some((option) => option.seats === current)
  ) {
    options.push({ seats: current, label: `${current} مقعد — الحالي` });
  }
  options.sort((a, b) => a.seats - b.seats);
  select.innerHTML = options
    .map((option) => `<option value="${option.seats}">${option.label}</option>`)
    .join('');
  select.value = String(
    options.some((option) => option.seats === current)
      ? current
      : presets[0].seats,
  );
}

function renderRoutes() {
  const body = $('#routes-body');
  const canManage = Boolean(state.session?.canManage);

  if (!state.routes.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty">لا توجد مسارات. أضف أول مسار من الأعلى.</td></tr>';
    return;
  }

  body.innerHTML = state.routes
    .map(
      (route) => `
      <tr class="route-row" data-route-seats="${route.id}" tabindex="0"
          title="عرض مخطط مقاعد المركبة">
        <td><code>${escapeHtml(route.code)}</code></td>
        <td>${escapeHtml(route.origin)} ← ${escapeHtml(route.destination)}</td>
        <td>${formatTripDate(route.trip_date)}</td>
        <td>${formatClock(route.move_time)}</td>
        <td><span class="badge badge-neutral">${vehicleLabel(route.vehicle_type)}</span></td>
        <td>${num.format(Number(route.price))} ج.م</td>
        <td>${route.seats}</td>
        <td>
          ${canManage
            ? `<button class="badge ${route.is_active ? 'badge-ok' : 'badge-off'}"
                      data-toggle-route="${route.id}" type="button"
                      title="اضغط لتغيير الحالة">
                ${route.is_active ? 'فعّال' : 'موقوف'}
              </button>`
            : `<span class="badge ${route.is_active ? 'badge-ok' : 'badge-off'}">
                ${route.is_active ? 'فعّال' : 'موقوف'}
              </span>`}
        </td>
        <td class="row-actions">
          <button class="btn btn-mini" data-open-seats="${route.id}" type="button">المقاعد</button>
          ${canManage
            ? `<button class="btn btn-mini" data-edit-route="${route.id}" type="button">تعديل</button>
               <button class="btn btn-mini btn-danger-ghost" data-delete-route="${route.id}" type="button">حذف</button>`
            : ''}
        </td>
      </tr>`,
    )
    .join('');
}

function stationLabel(station) {
  return `${station.name} — ${governorateLabel(station.governorate)}`;
}

function stationOptions(selectedId) {
  return [
    '<option value="">اختر محطة…</option>',
    ...state.stations
      .filter((station) => station.is_active || String(station.id) === String(selectedId))
      .map(
        (station) =>
          `<option value="${station.id}" ${
            String(station.id) === String(selectedId) ? 'selected' : ''
          }>${escapeHtml(stationLabel(station))}</option>`,
      ),
  ].join('');
}

function graphNodeHtml(node, index) {
  return `
    <div class="graph-node" data-graph-node data-stop-id="${node.stopId ?? ''}">
      <div class="graph-node-head">
        <span class="graph-node-index">${index + 1}</span>
        <div class="graph-node-actions">
          <button type="button" class="btn btn-mini" data-move-node="-1" title="إلى اليمين">→</button>
          <button type="button" class="btn btn-mini" data-move-node="1" title="إلى اليسار">←</button>
          <button type="button" class="btn btn-mini btn-danger-ghost" data-remove-node title="حذف المحطة">×</button>
        </div>
      </div>
      <label class="graph-node-field">
        <span>المحطة</span>
        <select class="node-station" aria-label="المحطة">${stationOptions(node.stationId ?? '')}</select>
      </label>
    </div>`;
}

function graphEdgeHtml(price, index) {
  return `
    <div class="graph-edge" data-graph-edge>
      <span class="graph-edge-line"></span>
      <label class="graph-edge-price">
        <span>سعر الوصلة ${index + 1}</span>
        <input class="edge-price" type="number" min="0" step="1"
               value="${Number(price) || 0}" inputmode="numeric"
               aria-label="سعر الوصلة ${index + 1}">
      </label>
      <span class="graph-edge-line"></span>
    </div>`;
}

function readGraph() {
  const graph = $('#route-graph');
  if (!graph) return { nodes: [], edges: [] };
  const nodes = $$('[data-graph-node]', graph).map((node) => ({
    stationId: node.querySelector('.node-station')?.value || '',
    stopId: node.dataset.stopId || null,
  }));
  const edges = $$('[data-graph-edge]', graph).map(
    (edge) => Number(edge.querySelector('.edge-price')?.value) || 0,
  );
  return { nodes, edges };
}

function writeGraph(data) {
  const graph = $('#route-graph');
  if (!graph) return;

  const nodes = data.nodes.length
    ? data.nodes
    : [{ stationId: '', stopId: null }];
  const edges = data.edges.slice(0, Math.max(0, nodes.length - 1));
  while (edges.length < nodes.length - 1) edges.push(0);

  graph.innerHTML = nodes
    .map((node, index) => {
      const edge = index === 0 ? '' : graphEdgeHtml(edges[index - 1], index - 1);
      return edge + graphNodeHtml(node, index);
    })
    .join('');

  refreshTripSelectors();
  updateTripCostPreview();
  updateSeatPreview();
  updateRouteCode();
}

function resolveStationId(stop) {
  if (stop.station_id) return stop.station_id;
  return (
    state.stations.find(
      (station) =>
        station.name.trim() === String(stop.name || '').trim() &&
        (!stop.governorate || station.governorate === stop.governorate),
    )?.id ?? ''
  );
}

function renderRouteGraph(stops) {
  const nodes = stops.map((stop) => ({
    stationId: resolveStationId(stop),
    stopId: stop.id,
  }));
  const edges = stops.slice(1).map((stop, index) => {
    const previous = Number(stops[index].price) || 0;
    const current = Number(stop.price) || 0;
    return Math.max(0, current - previous);
  });
  writeGraph({ nodes: nodes.length ? nodes : [{ stationId: '' }], edges });
}

function addRouteNode() {
  const data = readGraph();
  const nodes = data.nodes.length
    ? data.nodes
    : [{ stationId: '', stopId: null }];
  const edges = data.edges.slice();
  if (nodes.length > 0) edges.push(0);
  nodes.push({ stationId: '' });
  writeGraph({ nodes, edges });
  const nodeSelects = $$('#route-graph .node-station');
  nodeSelects[nodeSelects.length - 1]?.focus();
}

function removeRouteNode(index) {
  const data = readGraph();
  if (data.nodes.length <= 1) return;
  const nodes = data.nodes.slice();
  const edges = data.edges.slice();
  nodes.splice(index, 1);
  if (index > 0) edges.splice(index - 1, 1);
  else if (edges.length) edges.splice(0, 1);
  writeGraph({ nodes, edges });
}

function moveRouteNode(index, direction) {
  const data = readGraph();
  const target = index + direction;
  if (target < 0 || target >= data.nodes.length) return;
  const nodes = data.nodes.slice();
  [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
  writeGraph({ nodes, edges: data.edges });
}

function refreshTripSelectors() {
  const startSelect = $('#trip-start');
  const endSelect = $('#trip-end');
  if (!startSelect || !endSelect) return;

  const data = readGraph();
  const hasPreviousStart = startSelect.value !== '';
  const hasPreviousEnd = endSelect.value !== '';
  const previousStart = Number(startSelect.value);
  const previousEnd = Number(endSelect.value);
  const options = data.nodes
    .map((node, index) => {
      const station = state.stations.find(
        (item) => String(item.id) === String(node.stationId),
      );
      const label = station ? station.name : `محطة ${index + 1}`;
      return `<option value="${index}">${index + 1}. ${escapeHtml(label)}</option>`;
    })
    .join('');

  startSelect.innerHTML = options;
  endSelect.innerHTML = options;
  startSelect.value =
    hasPreviousStart &&
    Number.isInteger(previousStart) &&
    previousStart < data.nodes.length
      ? String(previousStart)
      : '0';
  endSelect.value =
    hasPreviousEnd &&
    Number.isInteger(previousEnd) &&
    previousEnd < data.nodes.length
      ? String(previousEnd)
      : String(Math.max(0, data.nodes.length - 1));
}

function updateTripCostPreview() {
  refreshTripSelectors();
  const valueBox = $('#trip-cost-value');
  const rangeBox = $('#trip-cost-range');
  if (!valueBox) return;

  const data = readGraph();
  const start = Number($('#trip-start')?.value);
  const end = Number($('#trip-end')?.value);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
    valueBox.textContent = '—';
    if (rangeBox) rangeBox.textContent = 'اختر محطة بداية قبل محطة النهاية.';
    return;
  }

  const total = data.edges
    .slice(start, end)
    .reduce((sum, price) => sum + (Number(price) || 0), 0);
  valueBox.textContent = `${num.format(total)} ج.م`;
  if (rangeBox) {
    rangeBox.textContent = `من المحطة ${start + 1} إلى المحطة ${end + 1}`;
  }
}

function collectRouteStops() {
  const data = readGraph();
  if (data.nodes.length < 2) {
    throw new Error('أضف محطتين على الأقل للمسار.');
  }

  const nodes = data.nodes.map((node) => {
    const station = state.stations.find(
      (item) => String(item.id) === String(node.stationId),
    );
    return { station, stationId: node.stationId, stopId: node.stopId };
  });
  if (nodes.some((node) => !node.station)) {
    throw new Error('اختر محطة لكل عقدة في الرسم.');
  }
  const ids = nodes.map((node) => String(node.stationId));
  if (new Set(ids).size !== ids.length) {
    throw new Error('لا يمكن تكرار المحطة نفسها في المسار.');
  }

  let cumulative = 0;
  return nodes.map((node, index) => {
    if (index > 0) cumulative += Math.max(0, Number(data.edges[index - 1]) || 0);
    return {
      id: node.stopId,
      station_id: node.station.id,
      code: node.station.code,
      name: node.station.name,
      governorate: node.station.governorate,
      price: cumulative,
    };
  });
}

function updateRouteCode() {
  const form = $('#route-form');
  if (!form) return;
  const data = readGraph();
  const codes = data.nodes.map((node) => {
    const station = state.stations.find(
      (item) => String(item.id) === String(node.stationId),
    );
    return station?.code ? String(station.code).toUpperCase() : '';
  });
  form.code.value = codes.every(Boolean) ? codes.join('-') : '';
}

async function ensureRouteLookups(force = false) {
  if (!force && state.routeLookupsLoaded) return;
  const [vehicles, inspectors] = await Promise.all([
    api.fetchVehicles(),
    api.fetchInspectors(),
  ]);
  state.vehicles = vehicles;
  state.routeInspectors = inspectors.rows || [];
  state.routeLookupsLoaded = true;
  populateRouteInspectorSelect();
  renderVehiclePicker();
}

function selectedRouteVehicle() {
  const id = $('#route-vehicle')?.value;
  return state.vehicles.find((vehicle) => String(vehicle.id) === String(id)) || null;
}

function routeVehicleType() {
  return $('#route-vehicle-type')?.value || 'bus';
}

function vehicleOptionLabel(vehicle) {
  return `#${vehicle.id} — ${vehicleLabel(vehicle.vehicle_type)} · ${num.format(
    Number(vehicle.capacity) || 0,
  )} مقعد · ${escapeHtml(vehiclePlateLabel(vehicle))}`;
}

function renderVehiclePicker() {
  const list = $('#route-vehicle-list');
  if (!list) return;
  const type = routeVehicleType();
  const query = ($('#route-vehicle-search')?.value || '').trim().toLowerCase();
  const selectedId = $('#route-vehicle')?.value || '';

  const matches = state.vehicles.filter((vehicle) => {
    if (!vehicle.is_active && String(vehicle.id) !== String(selectedId)) return false;
    if (vehicle.vehicle_type !== type) return false;
    if (!query) return true;
    const haystack =
      `${vehicle.id} ${vehicle.capacity} ${vehicle.plate_letters || ''} ${vehicle.plate_numbers || ''} ${vehicle.description || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!matches.length) {
    list.innerHTML =
      '<li class="vehicle-empty">لا توجد مركبات مطابقة لهذا النوع.</li>';
    return;
  }

  list.innerHTML = matches
    .map(
      (vehicle) => `<li data-vehicle-option="${vehicle.id}"
        aria-selected="${String(vehicle.id) === String(selectedId) ? 'true' : 'false'}">
        <span>${vehicleOptionLabel(vehicle)}</span>
        <span class="vehicle-meta">${escapeHtml(vehicle.description || '')}</span>
      </li>`,
    )
    .join('');
}

function openVehiclePicker() {
  const picker = $('#route-vehicle-picker');
  if (!picker) return;
  picker.dataset.open = 'true';
  renderVehiclePicker();
}

function closeVehiclePicker() {
  const picker = $('#route-vehicle-picker');
  if (picker) picker.dataset.open = 'false';
}

function selectRouteVehicle(id) {
  const vehicle = state.vehicles.find((item) => String(item.id) === String(id));
  if (!vehicle) return;
  const hidden = $('#route-vehicle');
  const search = $('#route-vehicle-search');
  if (hidden) hidden.value = String(vehicle.id);
  if (search) {
    search.value = `#${vehicle.id} — ${vehicleLabel(vehicle.vehicle_type)} · ${vehicle.capacity} مقعد`;
  }
  closeVehiclePicker();
  updateSeatPreview();
}

function clearRouteVehicle() {
  const hidden = $('#route-vehicle');
  const search = $('#route-vehicle-search');
  if (hidden) hidden.value = '';
  if (search) search.value = '';
  updateSeatPreview();
}

function populateRouteInspectorSelect(selectedId = null) {
  const select = $('#route-inspector');
  if (!select) return;
  const current = selectedId ?? select.value;
  const options = state.routeInspectors
    .filter(
      (inspector) =>
        inspector.is_active || String(inspector.id) === String(current),
    )
    .map(
      (inspector) =>
        `<option value="${inspector.id}">${escapeHtml(
          inspector.full_name || inspector.email,
        )}</option>`,
    )
    .join('');
  select.innerHTML = `<option value="">بدون مفتش</option>${options}`;
  select.value =
    current && select.querySelector(`option[value="${current}"]`)
      ? String(current)
      : '';
}

function buildSeatRows(vehicle, total) {
  const rows = [];
  let seat = 1;
  if (vehicle === 'microbus') {
    const front = total >= 2 ? 2 : total;
    if (front > 0) {
      rows.push(
        Array.from({ length: front }, () => ({
          seat: seat++,
          kind: 'window',
        })),
      );
    }
    let remaining = total - front;
    while (remaining > 0) {
      const count = remaining > 4 ? 3 : remaining;
      rows.push(
        Array.from({ length: count }, (_, index) => {
          let kind = 'middle';
          if (count <= 1) kind = 'window';
          else if (index === 0 || index === count - 1) kind = 'window';
          return { seat: seat++, kind };
        }),
      );
      remaining -= count;
    }
    return rows;
  }

  if (vehicle === 'minibus') {
    const front = total >= 2 ? 2 : total;
    if (front > 0) {
      rows.push(
        Array.from({ length: front }, () => ({
          seat: seat++,
          kind: 'window',
        })),
      );
    }
    let remaining = total - front;
    while (remaining > 0) {
      if (remaining <= 5) {
        rows.push(
          Array.from({ length: remaining }, (_, index) => {
            let kind = 'middle';
            if (remaining <= 1) kind = 'window';
            else if (index === 0 || index === remaining - 1) kind = 'window';
            else if (remaining === 5 && (index === 1 || index === remaining - 2)) {
              kind = 'aisle';
            }
            return { seat: seat++, kind };
          }),
        );
        remaining = 0;
      } else {
        rows.push([
          { seat: seat++, kind: 'window' },
          { seat: seat++, kind: 'aisle' },
          { gap: true },
          { seat: seat++, kind: 'aisle' },
          { seat: seat++, kind: 'window' },
        ]);
        remaining -= 4;
      }
    }
    return rows;
  }

  if (vehicle === 'tamnaya') {
    if (total > 0) {
      rows.push([{ seat: seat++, kind: 'window' }]);
    }
    let remaining = total - (total > 0 ? 1 : 0);
    while (remaining > 0) {
      const count = remaining > 3 ? 3 : remaining;
      rows.push(
        Array.from({ length: count }, (_, index) => ({
          seat: seat++,
          kind: benchSeatKind(index, count),
        })),
      );
      remaining -= count;
    }
    return rows;
  }

  const remainder = total % 4;
  const backRow = total < 5 ? total : remainder === 1 ? 5 : remainder;
  let remaining = total - backRow;
  while (remaining > 0) {
    const count = Math.min(4, remaining);
    const row = [];
    for (let index = 0; index < count; index += 1) {
      if (index === 2) row.push({ gap: true });
      const rightSide = index >= 2;
      row.push({
        seat: seat++,
        kind: !rightSide
          ? index === 0
            ? 'window'
            : 'aisle'
          : index === count - 1
            ? 'window'
            : 'aisle',
      });
    }
    rows.push(row);
    remaining -= count;
  }
  if (backRow > 0) {
    rows.push(
      Array.from({ length: backRow }, (_, index) => ({
        seat: seat++,
        kind: benchSeatKind(index, backRow),
      })),
    );
  }
  return rows;
}

function benchSeatKind(index, count) {
  if (count <= 2) return 'window';
  if (index === 0 || index === count - 1) return 'window';
  if (count === 5 && (index === 1 || index === count - 2)) return 'aisle';
  return 'middle';
}

function renderSeatPreview(box, vehicle, total) {
  const safeTotal = Math.max(1, Math.min(60, Number(total) || 1));
  const rows = buildSeatRows(vehicle, safeTotal);
  const seatRows = rows
    .map((row, rowIndex) => {
      const driver =
        vehicle !== 'bus' && rowIndex === 0
          ? '<span class="seat-driver-inline" title="السائق"><img src="assets/steering-wheel.svg" alt=""></span>'
          : '';
      return `
        <div class="seat-row">
          ${driver}
          ${row
            .map((cell) =>
              cell.gap
                ? '<span class="seat-gap"></span>'
                : `<span class="seat-cell seat-${cell.kind}" title="${cell.kind}">${cell.seat}</span>`,
            )
            .join('')}
        </div>`;
    })
    .join('');
  const driver =
    vehicle !== 'bus'
      ? ''
      : `<div class="seat-driver">
          <img src="assets/steering-wheel.svg" alt="">
          <span>السائق</span>
        </div>`;

  box.innerHTML = `
    <div class="seat-preview-head">
      <strong>${vehicleLabel(vehicle)} · ${safeTotal} مقعد</strong>
      <span class="seat-legend">
        <i class="seat-dot seat-window"></i> شباك
        <i class="seat-dot seat-middle"></i> أوسط
        <i class="seat-dot seat-aisle"></i> ممر
      </span>
    </div>
    <div class="seat-vehicle">
      ${driver}
      <div class="seat-rows">${seatRows}</div>
    </div>`;
}

function updateSeatPreview() {
  const box = $('#seat-preview');
  if (!box) return;
  const vehicle = selectedRouteVehicle();
  if (!vehicle) {
    box.innerHTML =
      '<p class="empty">اختر مركبة من القائمة لعرض مخطط المقاعد.</p>';
    return;
  }
  renderSeatPreview(box, vehicle.vehicle_type, vehicle.capacity);
}

function updateVehicleSeatPreview() {
  const box = $('#vehicle-seat-preview');
  if (!box) return;
  const form = $('#vehicle-form');
  renderSeatPreview(
    box,
    form.vehicle_type.value,
    Number(form.capacity.value) || 1,
  );
}

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function paymentTypeLabel(method) {
  if (method === 'subscription') return 'اشتراك';
  if (method === 'app') return 'تطبيق';
  return 'كاش';
}

function routeSeatPassenger(booking) {
  const person = booking.claimant || booking.owner || {};
  return person.full_name || 'مستخدم';
}

function routeSeatTooltip(bookings) {
  return bookings
    .map((booking) => {
      const person = booking.claimant || booking.owner || {};
      const phone = person.phone || 'بدون هاتف';
      const paid = booking.paid ? 'مدفوع' : 'غير مدفوع';
      const segment =
        booking.boarding?.name && booking.alighting?.name
          ? ` • ${booking.boarding.name} ← ${booking.alighting.name}`
          : '';
      return `${routeSeatPassenger(booking)} — ${phone} — ${paymentTypeLabel(
        booking.payment_method,
      )} (${paid})${segment}`;
    })
    .join(' | ');
}

function renderRouteSeatMap(route, bookings) {
  const box = $('#route-seats-map');
  if (!box) return;

  const total = Math.max(1, Math.min(60, Number(route.seats) || 1));
  const rows = buildSeatRows(route.vehicle_type || 'bus', total);
  const bySeat = new Map();
  for (const booking of bookings) {
    const seat = Number(booking.seat_num);
    if (!Number.isInteger(seat)) continue;
    if (!bySeat.has(seat)) bySeat.set(seat, []);
    bySeat.get(seat).push(booking);
  }

  const seatRows = rows
    .map((row, rowIndex) => {
      const driver =
        route.vehicle_type !== 'bus' && rowIndex === 0
          ? '<span class="seat-driver-inline" title="السائق"><img src="assets/steering-wheel.svg" alt=""></span>'
          : '';
      return `
        <div class="seat-row">
          ${driver}
          ${row
            .map((cell) => {
              if (cell.gap) return '<span class="seat-gap"></span>';
              const seatBookings = bySeat.get(cell.seat) || [];
              const info = seatBookings.length
                ? routeSeatTooltip(seatBookings)
                : 'متاح';
              const classes = ['seat-cell', `seat-${cell.kind}`];
              if (seatBookings.length) classes.push('is-booked');
              if (seatBookings.length > 1) classes.push('is-multi');
              return `<span class="${classes.join(' ')}"
                            title="${escapeHtml(info)}"
                            aria-label="مقعد ${cell.seat}: ${escapeHtml(info)}">
                        ${cell.seat}
                        ${seatBookings.length ? '<i class="seat-booked-dot"></i>' : ''}
                      </span>`;
            })
            .join('')}
        </div>`;
    })
    .join('');
  const driver =
    route.vehicle_type === 'bus'
      ? `<div class="seat-driver">
          <img src="assets/steering-wheel.svg" alt="">
          <span>السائق</span>
        </div>`
      : '';

  const occupied = bySeat.size;
  $('#route-seats-meta').textContent =
    `${route.code} • ${route.origin} ← ${route.destination} • ` +
    `${vehicleLabel(route.vehicle_type)} • ${formatTripDate(state.routeSeatDate)} • ` +
    `${num.format(occupied)} / ${num.format(total)} مقعد محجوز`;

  box.innerHTML = `
    <div class="seat-preview-head">
      <strong>${vehicleLabel(route.vehicle_type)} · ${total} مقعد</strong>
      <span class="seat-legend">
        <i class="seat-dot seat-window"></i> شباك
        <i class="seat-dot seat-middle"></i> أوسط
        <i class="seat-dot seat-aisle"></i> ممر
        <i class="seat-dot seat-booked"></i> محجوز
      </span>
    </div>
    <div class="seat-vehicle">
      ${driver}
      <div class="seat-rows">${seatRows}</div>
    </div>`;
}

async function loadRouteSeatBookings() {
  const route = state.routeSeatActive;
  const date = state.routeSeatDate;
  if (!route || !date) return;

  const request = ++state.routeSeatRequest;
  const box = $('#route-seats-map');
  box.innerHTML = '<p class="empty">جارٍ تحميل بيانات المقاعد…</p>';
  try {
    const rows = await api.fetchRouteSeatBookings(route.id, date);
    if (request !== state.routeSeatRequest) return;
    renderRouteSeatMap(route, rows);
  } catch (error) {
    if (request !== state.routeSeatRequest) return;
    box.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function openRouteSeatDialog(route) {
  state.routeSeatActive = route;
  state.routeSeatDate = route.trip_date || localIsoDate();
  const dateInput = $('#route-seats-date');
  if (dateInput) dateInput.value = state.routeSeatDate;
  const title = $('#route-seats-title');
  if (title) title.textContent = `مقاعد المسار ${route.code}`;
  const delayButton = $('#btn-delay-trip');
  if (delayButton) delayButton.hidden = !state.session?.canManage;
  const dialog = $('#route-seats-dialog');
  if (dialog && !dialog.open) dialog.showModal();
  loadRouteSeatBookings();
}

function openTripDelayDialog() {
  const route = state.routeSeatActive;
  if (!route || !state.routeSeatDate) return;
  const form = $('#trip-delay-form');
  form.reset();
  form.minutes.value = '15';
  setFormError('delay', null);
  $('#trip-delay-meta').textContent =
    `${route.code} • ${route.origin} ← ${route.destination} • ` +
    formatTripDate(state.routeSeatDate);
  const dialog = $('#trip-delay-dialog');
  if (!dialog.open) dialog.showModal();
}

async function saveTripDelay(event) {
  event.preventDefault();
  const route = state.routeSeatActive;
  if (!route || !state.routeSeatDate) return;
  const form = event.currentTarget;
  const button = $('#btn-save-trip-delay');
  const minutes = Number(form.minutes.value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) {
    setFormError('delay', 'أدخل مدة من 1 إلى 600 دقيقة.');
    return;
  }

  setFormError('delay', null);
  button.disabled = true;
  try {
    await api.reportTripDelay(
      route.id,
      state.routeSeatDate,
      Math.round(minutes),
      form.note.value.trim() || null,
    );
    toast('تم تأخير الرحلة وإرسال تنبيه لجميع الركاب.');
    $('#trip-delay-dialog').close();
  } catch (error) {
    setFormError('delay', error.message);
  } finally {
    button.disabled = false;
  }
}

async function openRouteDialog(route = null) {
  const form = $('#route-form');
  form.reset();
  setFormError('route', null);
  state.routeEditingId = route?.id ?? null;

  try {
    await Promise.all([ensureStations(), ensureRouteLookups(true)]);
  } catch (error) {
    setFormError('route', error.message);
    return;
  }

  $('#route-dialog-title').textContent = route ? 'تعديل المسار' : 'مسار جديد';
  $('#btn-save-route').textContent = route ? 'حفظ التعديلات' : 'إضافة المسار';

  let stops = [];
  if (route) {
    form.move_time.value = formatTime(route.move_time);
    form.trip_date.value = route.trip_date || '';
    form.is_active.checked = Boolean(route.is_active);
    const assigned = state.vehicles.find(
      (vehicle) => String(vehicle.id) === String(route.vehicle_id),
    );
    $('#route-vehicle-type').value = assigned?.vehicle_type || route.vehicle_type || 'bus';
    populateRouteInspectorSelect(route.inspector_id ?? '');
    try {
      stops = await api.fetchRouteStops(route.id);
    } catch (_) {
      stops = [];
    }
    if (assigned) selectRouteVehicle(assigned.id);
    else clearRouteVehicle();
  } else {
    form.is_active.checked = true;
    $('#route-vehicle-type').value = 'bus';
    populateRouteInspectorSelect('');
    clearRouteVehicle();
  }

  renderRouteGraph(stops);
  $('#route-dialog').showModal();
}

async function uniqueRouteCode(baseCode, editingId = null) {
  const base = String(baseCode || 'ROUT').toUpperCase();
  try {
    const { rows } = await api.fetchRoutes();
    const taken = new Set(
      rows
        .filter((route) => String(route.id) !== String(editingId))
        .map((route) => String(route.code).toUpperCase()),
    );
    if (!taken.has(base)) return base;
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  } catch (_) {
    return base;
  }
}

async function saveRoute(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveButton = $('#btn-save-route');
  setFormError('route', null);

  let stops;
  try {
    stops = collectRouteStops();
  } catch (error) {
    setFormError('route', error.message);
    return;
  }

  const vehicle = selectedRouteVehicle();
  if (!vehicle) {
    setFormError('route', 'اختر مركبة من الأسطول أولاً.');
    return;
  }

  if (!form.trip_date.value) {
    setFormError('route', 'اختر تاريخ الرحلة.');
    return;
  }
  if (!form.move_time.value) {
    setFormError('route', 'اختر موعد الانطلاق.');
    return;
  }

  const last = stops[stops.length - 1];
  const baseCode = stops.map((stop) => stop.code).join('-');
  const code = await uniqueRouteCode(baseCode, state.routeEditingId);
  form.code.value = code;

  const payload = {
    code,
    price: last.price,
    origin: stops[0].name,
    destination: last.name,
    trip_date: form.trip_date.value || null,
    move_time: form.move_time.value,
    seats: vehicle.capacity,
    vehicle_type: vehicle.vehicle_type,
    vehicle_id: vehicle.id,
    inspector_id: form.inspector_id.value || null,
    is_active: form.is_active.checked,
  };

  saveButton.disabled = true;
  try {
    const creating = state.routeEditingId == null;
    const route = creating
      ? await api.createRoute(payload)
      : await api.updateRoute(state.routeEditingId, payload);
    await api.replaceRouteStops(route.id, stops);
    toast(creating ? 'تمت إضافة المسار.' : 'تم حفظ التعديلات.');
    $('#route-dialog').close();
    await loadRoutes();
  } catch (error) {
    setFormError('route', error.message);
  } finally {
    saveButton.disabled = false;
  }
}

// --------------------------------------------------------------- stations --

function populateGovernorateSelects() {
  const optionFor = (governorate) =>
    `<option value="${escapeHtml(governorate.code)}">${escapeHtml(governorate.name_ar)}</option>`;
  const options = state.governorates
    .filter((governorate) => governorate.is_active)
    .map(optionFor)
    .join('');
  const allOptions = state.governorates.map(optionFor).join('');

  ['inspectors-governorate', 'users-governorate', 'subscriptions-governorate', 'stations-governorate'].forEach(
    (id) => {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">كل المحافظات</option>${options}`;
      select.value = current;
    },
  );

  const stationSelect = $('#station-governorate');
  if (stationSelect) {
    const current = stationSelect.value;
    stationSelect.innerHTML = allOptions;
    if (current) stationSelect.value = current;
  }
}

async function ensureStations(force = false) {
  if (!force && state.stations.length && state.governorates.length) return;
  const [governorates, stations] = await Promise.all([
    api.fetchGovernorates(),
    api.fetchStations(),
  ]);
  state.governorates = governorates;
  state.stations = stations;
  populateGovernorateSelects();
}

async function loadStations(trigger = null) {
  const errorBox = $('#stations-error');
  errorBox.classList.add('hidden');
  $('#governorates-error').classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      await ensureStations(true);
      renderStations();
      renderGovernorates();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function filteredStations() {
  const { search, governorate } = state.stationFilters;
  const needle = search.trim().toLowerCase();
  return state.stations.filter((station) => {
    if (governorate && station.governorate !== governorate) return false;
    if (!needle) return true;
    return (
      station.name.toLowerCase().includes(needle) ||
      station.code.toLowerCase().includes(needle)
    );
  });
}

function renderStations() {
  const body = $('#stations-body');
  const rows = filteredStations();
  const canManage = Boolean(state.session?.canManage);

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">لا توجد محطات مطابقة.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (station) => `
      <tr>
        <td><code>${escapeHtml(station.code)}</code></td>
        <td>
          ${escapeHtml(station.name)}
          ${station.maps_url
            ? `<a class="muted small" href="${escapeHtml(station.maps_url)}"
                   target="_blank" rel="noopener">خريطة</a>`
            : ''}
        </td>
        <td>${escapeHtml(governorateLabel(station.governorate))}</td>
        <td>
          ${canManage
            ? `<button class="badge ${station.is_active ? 'badge-ok' : 'badge-off'}"
                      data-toggle-station="${station.id}" type="button">
                ${station.is_active ? 'مفعّلة' : 'موقوفة'}
              </button>`
            : `<span class="badge ${station.is_active ? 'badge-ok' : 'badge-off'}">
                ${station.is_active ? 'مفعّلة' : 'موقوفة'}
              </span>`}
        </td>
        <td class="row-actions">
          ${canManage
            ? `<button class="btn btn-mini" data-edit-station="${station.id}" type="button">تعديل</button>
               <button class="btn btn-mini btn-danger-ghost" data-delete-station="${station.id}" type="button">حذف</button>`
            : '<span class="muted small">—</span>'}
        </td>
      </tr>`,
    )
    .join('');
}

function renderGovernorates() {
  const body = $('#governorates-body');
  const canManage = Boolean(state.session?.canManage);
  if (!state.governorates.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">لا توجد محافظات.</td></tr>';
    return;
  }
  body.innerHTML = state.governorates
    .map(
      (governorate) => `
      <tr>
        <td><code>${escapeHtml(governorate.code)}</code></td>
        <td>${escapeHtml(governorate.name_ar)}</td>
        <td>${escapeHtml(governorate.name_en || '—')}</td>
        <td>${num.format(Number(governorate.sort_order) || 0)}</td>
        <td><span class="badge ${governorate.is_active ? 'badge-ok' : 'badge-off'}">
          ${governorate.is_active ? 'مفعّلة' : 'موقوفة'}
        </span></td>
        <td class="row-actions">
          ${canManage
            ? `<button class="btn btn-mini" data-edit-governorate="${escapeHtml(governorate.code)}" type="button">تعديل</button>
               <button class="btn btn-mini btn-danger-ghost" data-delete-governorate="${escapeHtml(governorate.code)}" type="button">حذف</button>`
            : '<span class="muted small">—</span>'}
        </td>
      </tr>`,
    )
    .join('');
}

async function openStationDialog(station = null) {
  try {
    await ensureStations();
  } catch (error) {
    toast(error.message);
    return;
  }
  const form = $('#station-form');
  form.reset();
  setFormError('station', null);
  state.stationEditingId = station?.id ?? null;
  $('#station-dialog-title').textContent = station ? 'تعديل المحطة' : 'محطة جديدة';
  $('#btn-save-station').textContent = station ? 'حفظ التعديلات' : 'إضافة المحطة';
  populateGovernorateSelects();
  if (station) {
    form.code.value = station.code;
    form.name.value = station.name;
    form.governorate.value = station.governorate;
    form.maps_url.value = station.maps_url ?? '';
    form.latitude.value = station.latitude ?? '';
    form.longitude.value = station.longitude ?? '';
    form.is_active.checked = Boolean(station.is_active);
  } else {
    form.is_active.checked = true;
  }
  $('#station-dialog').showModal();
}

async function saveStation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#btn-save-station');
  setFormError('station', null);
  const payload = {
    code: form.code.value.trim().toUpperCase(),
    name: form.name.value.trim(),
    governorate: form.governorate.value,
    maps_url: form.maps_url.value.trim(),
    latitude: Number(form.latitude.value),
    longitude: Number(form.longitude.value),
    is_active: form.is_active.checked,
  };
  button.disabled = true;
  try {
    if (state.stationEditingId == null) await api.createStation(payload);
    else await api.updateStation(state.stationEditingId, payload);
    toast(state.stationEditingId == null ? 'تمت إضافة المحطة.' : 'تم حفظ المحطة.');
    $('#station-dialog').close();
    await loadStations();
  } catch (error) {
    setFormError('station', error.message);
  } finally {
    button.disabled = false;
  }
}

function openGovernorateDialog(governorate = null) {
  const form = $('#governorate-form');
  form.reset();
  setFormError('governorate', null);
  state.governorateEditingCode = governorate?.code ?? null;
  $('#governorate-dialog-title').textContent = governorate ? 'تعديل المحافظة' : 'محافظة جديدة';
  $('#btn-save-governorate').textContent = governorate ? 'حفظ التعديلات' : 'إضافة المحافظة';
  form.code.readOnly = Boolean(governorate);
  if (governorate) {
    form.code.value = governorate.code;
    form.name_ar.value = governorate.name_ar;
    form.name_en.value = governorate.name_en || '';
    form.sort_order.value = governorate.sort_order || 0;
    form.is_active.checked = Boolean(governorate.is_active);
  } else {
    form.sort_order.value = state.governorates.length + 1;
    form.is_active.checked = true;
  }
  $('#governorate-dialog').showModal();
}

async function saveGovernorate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#btn-save-governorate');
  setFormError('governorate', null);
  const payload = {
    name_ar: form.name_ar.value.trim(),
    name_en: form.name_en.value.trim(),
    sort_order: Number(form.sort_order.value) || 0,
    is_active: form.is_active.checked,
  };
  button.disabled = true;
  try {
    if (state.governorateEditingCode == null) {
      await api.createGovernorate({ ...payload, code: form.code.value.trim().toLowerCase() });
    } else {
      await api.updateGovernorate(state.governorateEditingCode, payload);
    }
    toast(state.governorateEditingCode == null ? 'تمت إضافة المحافظة.' : 'تم حفظ المحافظة.');
    $('#governorate-dialog').close();
    await loadStations();
  } catch (error) {
    setFormError('governorate', error.message);
  } finally {
    button.disabled = false;
  }
}

// --------------------------------------------------------------- vehicles --

function populateVehicleCapacity(vehicle, preferred = null) {
  const select = $('#vehicle-capacity');
  if (!select) return;
  const presets = SEAT_PRESETS[vehicle] || SEAT_PRESETS.bus;
  const current = Number(preferred);
  const options = presets.slice();
  if (
    Number.isInteger(current) &&
    current > 0 &&
    !options.some((option) => option.seats === current)
  ) {
    options.push({ seats: current, label: `${current} مقعد — الحالي` });
  }
  options.sort((a, b) => a.seats - b.seats);
  select.innerHTML = options
    .map((option) => `<option value="${option.seats}">${option.label}</option>`)
    .join('');
  select.value = String(
    options.some((option) => option.seats === current) ? current : presets[0].seats,
  );
}

async function loadVehicles(trigger = null) {
  const errorBox = $('#vehicles-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      state.vehicles = await api.fetchVehicles();
      state.routeLookupsLoaded = false;
      renderVehicles();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function renderVehicles() {
  const body = $('#vehicles-body');
  if (!body) return;
  const canManage = Boolean(state.session?.canManage);

  if (!state.vehicles.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">لا توجد مركبات. أضف أول مركبة من الأعلى.</td></tr>';
    return;
  }

  body.innerHTML = state.vehicles
    .map(
      (vehicle) => `
      <tr>
        <td><code>#${vehicle.id}</code></td>
        <td><span class="badge badge-neutral">${vehicleLabel(vehicle.vehicle_type)}</span></td>
        <td><code>${escapeHtml(vehiclePlateLabel(vehicle))}</code></td>
        <td>${escapeHtml(vehicle.description || '—')}</td>
        <td>${num.format(Number(vehicle.capacity) || 0)}</td>
        <td>
          ${canManage
            ? `<button class="badge ${vehicle.is_active ? 'badge-ok' : 'badge-off'}"
                      data-toggle-vehicle="${vehicle.id}" type="button">
                ${vehicle.is_active ? 'مفعّلة' : 'موقوفة'}
              </button>`
            : `<span class="badge ${vehicle.is_active ? 'badge-ok' : 'badge-off'}">
                ${vehicle.is_active ? 'مفعّلة' : 'موقوفة'}
              </span>`}
        </td>
        <td class="row-actions">
          ${canManage
            ? `<button class="btn btn-mini" data-edit-vehicle="${vehicle.id}" type="button">تعديل</button>
               <button class="btn btn-mini btn-danger-ghost" data-delete-vehicle="${vehicle.id}" type="button">حذف</button>`
            : '<span class="muted small">—</span>'}
        </td>
      </tr>`,
    )
    .join('');
}

function openVehicleDialog(vehicle = null) {
  const form = $('#vehicle-form');
  form.reset();
  setFormError('vehicle', null);
  state.vehicleEditingId = vehicle?.id ?? null;
  $('#vehicle-dialog-title').textContent = vehicle
    ? `تعديل المركبة #${vehicle.id}`
    : 'مركبة جديدة';
  $('#btn-save-vehicle').textContent = vehicle ? 'حفظ التعديلات' : 'إضافة المركبة';

  if (vehicle) {
    form.vehicle_type.value = vehicle.vehicle_type;
    populateVehicleCapacity(vehicle.vehicle_type, vehicle.capacity);
    form.plate_letters.value = formatPlateLetters(vehicle.plate_letters || '');
    form.plate_numbers.value =
      vehicle.plate_numbers == null ? '' : toArabicDigits(vehicle.plate_numbers);
    form.description.value = vehicle.description || '';
    form.is_active.checked = Boolean(vehicle.is_active);
  } else {
    form.vehicle_type.value = 'bus';
    populateVehicleCapacity('bus');
    form.is_active.checked = true;
  }
  updateVehicleSeatPreview();
  $('#vehicle-dialog').showModal();
}

async function saveVehicle(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#btn-save-vehicle');
  setFormError('vehicle', null);

  const letters = formatPlateLetters(form.plate_letters.value);
  form.plate_letters.value = letters;
  if (!/^[\u0621-\u064A]( ?[\u0621-\u064A]){1,2}$/.test(letters)) {
    setFormError('vehicle', 'حروف اللوحة يجب أن تكون حرفين أو ثلاثة حروف عربية.');
    return;
  }
  const digits = normalizePlateDigits(form.plate_numbers.value);
  const numbers = Number(digits);
  if (!digits || numbers < 1 || numbers > 9999) {
    setFormError('vehicle', 'أرقام اللوحة يجب أن تكون من 1 إلى 4 أرقام.');
    return;
  }

  const payload = {
    vehicle_type: form.vehicle_type.value,
    capacity: Number(form.capacity.value),
    plate_letters: letters,
    plate_numbers: numbers,
    description: form.description.value.trim() || null,
    is_active: form.is_active.checked,
  };
  button.disabled = true;
  try {
    if (state.vehicleEditingId == null) await api.createVehicle(payload);
    else await api.updateVehicle(state.vehicleEditingId, payload);
    toast(state.vehicleEditingId == null ? 'تمت إضافة المركبة.' : 'تم حفظ المركبة.');
    $('#vehicle-dialog').close();
    await loadVehicles();
  } catch (error) {
    setFormError('vehicle', error.message);
  } finally {
    button.disabled = false;
  }
}

async function toggleVehicle(id, isActive) {
  try {
    await api.updateVehicle(id, { is_active: isActive });
    await loadVehicles();
  } catch (error) {
    toast(error.message);
  }
}

async function removeVehicle(id) {
  if (!window.confirm('حذف هذه المركبة؟ ستبقى مساراتها دون مركبة محددة.')) return;
  try {
    await api.deleteVehicle(id);
    toast('تم حذف المركبة.');
    await loadVehicles();
  } catch (error) {
    toast(error.message);
  }
}

// ------------------------------------------------------------- inspectors --

const GOVERNORATE_LABELS = {
  sharkia: 'الشرقية',
  ismailia: 'الإسماعيلية',
};

function governorateLabel(value) {
  return GOVERNORATE_LABELS[value] || '—';
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[^a-z0-9\u0600-\u06FF ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function fuzzyScore(haystack, needle) {
  if (!needle) return 1;
  if (haystack.includes(needle)) return 1;
  const distance = levenshtein(haystack, needle);
  return 1 - distance / Math.max(haystack.length, needle.length, 1);
}

function matchesDirectoryFallback(row, filters) {
  if (filters.governorate) return false;
  if (filters.minCompliance !== '' && filters.minCompliance != null) return false;
  if (!filters.search) return true;
  const haystack = normalizeName(`${row.full_name} ${row.email} ${row.phone}`);
  return fuzzyScore(haystack, normalizeName(filters.search)) > 0.3;
}

async function loadInspectors(trigger = null) {
  const errorBox = $('#inspectors-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const filters = state.peopleFilters.inspectors;
      const [{ rows, total }, allPeople, filteredPeople] = await Promise.all([
        api.fetchInspectors(),
        api.fetchPeople({ role: 'inspector' }),
        api.fetchPeople({
          search: filters.search,
          governorate: filters.governorate,
          role: 'inspector',
          minCompliance: filters.minCompliance,
        }),
      ]);
      const accounts = await api.fetchAccounts(rows.map((row) => row.email));
      const allByEmail = new Map(
        allPeople.map((person) => [(person.email || '').toLowerCase(), person]),
      );
      const allowedIds = new Set(filteredPeople.map((person) => person.id));

      state.inspectors = rows
        .map((row) => {
          const key = (row.email || '').toLowerCase();
          const person = allByEmail.get(key) || null;
          return {
            ...row,
            person,
            account: accounts.find((item) => (item.email || '').toLowerCase() === key),
          };
        })
        .filter((row) =>
          row.person
            ? allowedIds.has(row.person.id)
            : matchesDirectoryFallback(row, filters),
        );

      renderInspectors();
      renderListNotice('inspectors', state.inspectors.length, total);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function renderInspectors() {
  const body = $('#inspectors-body');
  const canManage = Boolean(state.session?.canManage);

  if (!state.inspectors.length) {
    body.innerHTML =
      '<tr><td colspan="8" class="empty">لا يوجد مفتشون بعد. انسخ رقم المستخدم من تطبيق المفتش ثمّ رقِّه.</td></tr>';
    return;
  }

  body.innerHTML = state.inspectors
    .map((row) => {
      const person = row.person;
      const name = person?.full_name || row.full_name || '—';
      const email = person?.email || row.email || '';
      const phone = person?.phone || row.phone || '—';
      const compliance =
        person?.compliance_rate == null
          ? '—'
          : `${Number(person.compliance_rate).toFixed(1)}%`;
      const accountLabel = row.account
        ? row.account.role === 'inspector' || row.account.role === 'admin'
          ? '<span class="badge badge-ok">مفتش مفعّل</span>'
          : '<span class="badge badge-warn">حساب غير مفعّل</span>'
        : '<span class="badge badge-off">بانتظار أول تسجيل دخول</span>';

      return `
        <tr>
          <td>${escapeHtml(name)}
            <div class="muted small"><code>${escapeHtml(email)}</code></div>
          </td>
          <td>${escapeHtml(phone)}</td>
          <td>${governorateLabel(person?.governorate)}</td>
          <td>${compliance}</td>
          <td>${
            person?.id
              ? `<button class="btn btn-mini" data-person="${person.id}" type="button">عرض</button>`
              : '<span class="muted small">—</span>'
          }</td>
          <td>${accountLabel}</td>
          <td>
            ${canManage
              ? `<button class="badge ${row.is_active ? 'badge-ok' : 'badge-off'}"
                        data-toggle-inspector="${row.id}" type="button"
                        title="اضغط لتغيير الحالة">
                  ${row.is_active ? 'فعّال' : 'موقوف'}
                </button>`
              : `<span class="badge ${row.is_active ? 'badge-ok' : 'badge-off'}">
                  ${row.is_active ? 'فعّال' : 'موقوف'}
                </span>`}
          </td>
          <td class="row-actions">
            ${canManage
              ? `<button class="btn btn-mini" data-edit-inspector="${row.id}" type="button">تعديل</button>
                 <button class="btn btn-mini btn-danger-ghost" data-delete-inspector="${row.id}" type="button">حذف</button>`
              : '<span class="muted small">—</span>'}
          </td>
        </tr>`;
    })
    .join('');
}

async function openPersonBookings(personId) {
  const person =
    state.people.users.find((item) => item.id === personId) ||
    state.inspectors.map((row) => row.person).find((item) => item?.id === personId);
  if (!person) return;

  $('#person-dialog-title').textContent = `آخر 5 تذاكر — ${person.full_name || person.email}`;
  $('#person-dialog-meta').textContent =
    `${governorateLabel(person.governorate)} · ${person.phone || 'بدون هاتف'} · ` +
    `الامتثال: ${person.compliance_rate == null ? '—' : `${Number(person.compliance_rate).toFixed(1)}%`}`;
  $('#person-dialog-error').classList.add('hidden');
  $('#person-bookings-body').innerHTML =
    '<tr><td colspan="9" class="empty">جارٍ التحميل…</td></tr>';
  $('#person-dialog').showModal();

  try {
    const rows = await api.fetchPersonBookings(personId);
    renderPersonBookings(rows);
  } catch (error) {
    $('#person-dialog-error').textContent = error.message;
    $('#person-dialog-error').classList.remove('hidden');
  }
}

function renderPersonBookings(rows) {
  const body = $('#person-bookings-body');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty">لا توجد تذاكر لهذا المستخدم.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const trip = row.route_code
        ? `${escapeHtml(row.route_code)} · ${escapeHtml(row.origin || '')} ← ${escapeHtml(row.destination || '')}`
        : '—';
      const segment =
        row.boarding_stop || row.alighting_stop
          ? `${escapeHtml(row.boarding_stop || '—')} → ${escapeHtml(row.alighting_stop || '—')}`
          : '—';
      return `
        <tr>
          <td>${escapeHtml(row.travel_date || '—')}
            <div class="muted small">${formatClock(row.move_time)}</div>
          </td>
          <td>${trip}</td>
          <td>${row.seat_num ?? '—'}</td>
          <td>${segment}</td>
          <td>${money(row.fare)}</td>
          <td>${paymentLabel(row.payment_method)}</td>
          <td>${statusBadge(row.status)}</td>
          <td class="muted small">${formatStamp(row.created_at)}</td>
          <td>${escapeHtml(row.boarded_by || '—')}</td>
        </tr>`;
    })
    .join('');
}

function openInspectorDialog(row = null) {
  const form = $('#inspector-form');
  form.reset();
  setFormError('inspector', null);
  clearInspectorPreview();
  state.inspectorEditingId = row?.id ?? null;
  state.inspectorMode = 'id';
  state.inspectorUser = null;

  const editing = row != null;
  $('#inspector-dialog-title').textContent = editing ? 'تعديل المفتش' : 'ترقية مفتش';
  $('#btn-save-inspector').textContent = editing ? 'حفظ' : 'ترقية';
  $('#inspector-mode').classList.toggle('hidden', editing);

  form.user_id.value = '';
  form.email.value = editing ? row.email : '';
  form.email.readOnly = editing;
  form.is_active.checked = editing ? Boolean(row.is_active) : true;

  setInspectorMode(editing ? 'email' : 'id');
  $('#inspector-dialog').showModal();
  if (!editing) form.user_id.focus();
}

function setInspectorMode(mode) {
  state.inspectorMode = mode;
  $$('#inspector-mode .segment').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
  $('#inspector-mode-id').classList.toggle('hidden', mode !== 'id');
  $('#inspector-mode-email').classList.toggle('hidden', mode !== 'email');
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clearInspectorPreview() {
  const preview = $('#inspector-preview');
  preview.classList.add('hidden');
  preview.textContent = '';
  state.inspectorUser = null;
}

async function resolveInspectorUser(id) {
  const preview = $('#inspector-preview');
  setFormError('inspector', null);

  if (!UUID_PATTERN.test(id.trim())) {
    clearInspectorPreview();
    return null;
  }

  preview.classList.remove('hidden');
  preview.textContent = 'جارٍ البحث عن الحساب…';

  try {
    const user = await api.fetchUserById(id);
    if (!user) {
      clearInspectorPreview();
      return null;
    }
    const roleLabel = { student: 'طالب', inspector: 'مفتش', admin: 'إدارة' }[user.role] || user.role;
    preview.innerHTML = `
      <div class="preview-name">${escapeHtml(user.full_name || 'بدون اسم')}</div>
      <div class="preview-meta"><code>${escapeHtml(user.email)}</code></div>
      <div class="preview-meta">الدور الحالي: <strong>${escapeHtml(roleLabel)}</strong></div>`;
    state.inspectorUser = user;
    return user;
  } catch (error) {
    clearInspectorPreview();
    setFormError('inspector', error.message);
    return null;
  }
}

async function saveInspector(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveButton = $('#btn-save-inspector');
  setFormError('inspector', null);

  const isActive = form.is_active.checked;
  saveButton.disabled = true;

  try {
    if (state.inspectorEditingId != null) {
      await api.updateInspector(state.inspectorEditingId, { is_active: isActive });
      toast('تم حفظ التعديلات.');
    } else if (state.inspectorMode === 'id') {
      const id = form.user_id.value.trim();
      if (!UUID_PATTERN.test(id)) {
        setFormError('inspector', 'صيغة المعرّف غير صحيحة. ألصق المعرّف كاملاً.');
        return;
      }
      const user = state.inspectorUser?.id === id ? state.inspectorUser : await resolveInspectorUser(id);
      if (!user) {
        setFormError('inspector', 'لا يوجد حساب بهذا المعرّف.');
        return;
      }
      if (user.role === 'admin') {
        setFormError('inspector', 'لا يمكن ترقية حساب إدارة إلى مفتش.');
        return;
      }
      const result = await api.upsertInspector({
        email: user.email,
        fullName: user.full_name || '',
        isActive,
      });
      toast(result.already ? 'تم تحديث سجل المفتش.' : 'تمت ترقية المستخدم إلى مفتش.');
    } else {
      const email = form.email.value.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        setFormError('inspector', 'صيغة البريد الإلكتروني غير صحيحة.');
        return;
      }
      const result = await api.upsertInspector({ email, fullName: '', isActive });
      toast(
        result.already
          ? 'تم تحديث سجل المفتش.'
          : 'تمت إضافة المفتش، سيُفعَّل تلقائياً عند أول تسجيل دخول.',
      );
    }

    $('#inspector-dialog').close();
    await loadInspectors();
  } catch (error) {
    setFormError('inspector', error.message);
  } finally {
    saveButton.disabled = false;
  }
}

// ------------------------------------------------------------------- users --

const PENALTY_META = {
  green: {
    label: 'أخضر — لا جزاء',
    meaning:
      'لا يوجد جزاء نشط. المستخدم يستطيع الحجز النقدي بالمقاعد المتاحة له.',
  },
  red: {
    label: 'أحمر — غياب واحد',
    meaning:
      'غياب واحد عن رحلة نقدية خلال آخر 30 يومًا. الحد الأقصى للحجز النقدي مقعد واحد في اليوم.',
  },
  black: {
    label: 'أسود — غيابان أو أكثر',
    meaning:
      'غيابان أو أكثر عن رحلات نقدية خلال آخر 30 يومًا. الحجز النقدي موقوف مؤقتًا.',
  },
};

let penaltyUserId = null;

function penaltyStatusOf(user) {
  const status = user?.penalty_status;
  return status === 'red' || status === 'black' ? status : 'green';
}

function penaltyButton(user) {
  const status = penaltyStatusOf(user);
  const meta = PENALTY_META[status];
  return `<button class="penalty-dot penalty-${status}" data-penalty-user="${user.id}" type="button" title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}"></button>`;
}

async function loadUsers(trigger = null) {
  const errorBox = $('#users-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const filters = state.peopleFilters.users;
      const rows = await api.fetchPeople(filters);
      state.people.users = rows;
      renderUsers();
      renderListNotice('users', rows.length, null);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function renderUsers() {
  const body = $('#users-body');
  const me = state.session?.id;
  const canEdit = Boolean(state.session?.canEditUsers);
  const canAssignAdmin = Boolean(state.session?.canAssignAdmin);
  const roleOptions = canAssignAdmin
    ? api.ASSIGNABLE_ROLES
    : api.ADMIN_ROLE_OPTIONS;

  if (!state.people.users.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">لا يوجد مستخدمون مطابقون.</td></tr>';
    return;
  }

  body.innerHTML = state.people.users
    .map((user) => {
      const isSelf = user.id === me;
      const targetIsAdmin = user.role === 'admin' || user.role === 'super_admin';
      const editable =
        canEdit &&
        !isSelf &&
        user.role !== 'super_admin' &&
        (canAssignAdmin || !targetIsAdmin);
      const roleLabel = api.ROLE_LABELS[user.role] || user.role;
      const compliance =
        user.compliance_rate == null
          ? '—'
          : `${Number(user.compliance_rate).toFixed(1)}%`;

      const roleCell = editable
        ? `<select class="role-select" data-role-user="${user.id}">${roleOptions.map(
            (role) =>
              `<option value="${role}" ${role === user.role ? 'selected' : ''}>${api.ROLE_LABELS[role] || role}</option>`,
          ).join('')}</select>`
        : `<span class="badge badge-off">${escapeHtml(roleLabel)}</span>`;

      return `
        <tr>
          <td>${escapeHtml(user.full_name || '—')}
            <div class="muted small"><code>${escapeHtml(user.email || '')}</code></div>
          </td>
          <td>${escapeHtml(user.phone || '—')}</td>
          <td>${governorateLabel(user.governorate)}</td>
          <td>${compliance}</td>
          <td class="penalty-cell">${penaltyButton(user)}</td>
          <td><button class="btn btn-mini" data-person="${user.id}" type="button">عرض</button></td>
          <td>${roleCell}</td>
          <td class="row-actions">
            ${editable
              ? `<button class="btn btn-mini" data-save-role="${user.id}" type="button">حفظ الدور</button>
                 <button class="btn btn-mini btn-danger-ghost" data-delete-user="${user.id}" type="button">حذف</button>`
              : `<span class="muted small">${isSelf ? 'حسابك' : '—'}</span>`}
          </td>
        </tr>`;
    })
    .join('');
}

async function saveUserRole(userId) {
  const select = document.querySelector(`[data-role-user="${userId}"]`);
  if (!select) return;

  const button = document.querySelector(`[data-save-role="${userId}"]`);
  const role = select.value;

  if (button) button.disabled = true;
  try {
    await api.setUserRole(userId, role);
    toast('تم تحديث الدور.');
    await loadUsers();
  } catch (error) {
    $('#users-error').textContent = error.message;
    $('#users-error').classList.remove('hidden');
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteUserAccount(userId) {
  const user = state.people.users.find((item) => item.id === userId);
  const label = user?.full_name || user?.email || 'هذا المستخدم';
  if (
    !window.confirm(
      `حذف حساب ${label} نهائيًا؟ ستُحذف كل حجوزاته واشتراكاته وإشعاراته ولا يمكن التراجع.`,
    )
  ) {
    return;
  }

  try {
    await api.deleteUser(userId);
    toast('تم حذف الحساب.');
    await loadUsers();
  } catch (error) {
    $('#users-error').textContent = error.message;
    $('#users-error').classList.remove('hidden');
  }
}

function openPenaltyDialog(userId) {
  const user = state.people.users.find((item) => item.id === userId);
  if (!user) return;
  penaltyUserId = userId;
  $('#penalty-dialog-error').classList.add('hidden');
  renderPenaltyDialog(user);
  const dialog = $('#penalty-dialog');
  if (!dialog.open) dialog.showModal();
}

function renderPenaltyDialog(user) {
  const status = penaltyStatusOf(user);
  const meta = PENALTY_META[status];
  const count = Number(user.penalty_count || 0);
  const forgiven = Number(user.forgiven_count || 0);

  $('#penalty-dialog-title').textContent = 'جزاء عدم الحضور';
  $('#penalty-dialog-user').textContent =
    `${user.full_name || 'مستخدم'} · ${user.email || 'بدون بريد'} · ` +
    `${governorateLabel(user.governorate)}`;
  $('#penalty-dialog-dot').className = `penalty-dot penalty-${status}`;
  $('#penalty-dialog-badge').className = `badge penalty-pill penalty-${status}`;
  $('#penalty-dialog-badge').textContent = meta.label;
  $('#penalty-dialog-meaning').textContent = meta.meaning;
  $('#penalty-dialog-count').textContent = count
    ? `الغيابات النشطة: ${num.format(count)} · تمت مسامحة ${num.format(forgiven)} سابقًا.`
    : forgiven
      ? `لا توجد غيابات نشطة · تمت مسامحة ${num.format(forgiven)} سابقًا.`
      : 'لا توجد غيابات نشطة.';

  const button = $('#btn-forgive-penalty');
  const hint = $('#penalty-dialog-hint');
  if (status === 'green') {
    button.hidden = true;
    hint.textContent = 'لا حاجة لمسامحة.';
  } else if (!state.session?.canManage) {
    button.hidden = true;
    hint.textContent = 'المسامحة متاحة للمدير فقط.';
  } else {
    button.hidden = false;
    button.disabled = false;
    button.textContent = status === 'black' ? 'مسامحة ← أحمر' : 'مسامحة ← أخضر';
    hint.textContent =
      status === 'black'
        ? 'بعد المسامحة سيصبح الجزاء أحمر.'
        : 'بعد المسامحة سيُزال الجزاء نهائيًا.';
  }
}

async function forgivePenalty() {
  const user = state.people.users.find((item) => item.id === penaltyUserId);
  if (!user) return;
  const button = $('#btn-forgive-penalty');
  const errorBox = $('#penalty-dialog-error');
  errorBox.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'جارٍ المسامحة…';

  try {
    const updated = await api.forgivePenalty(user.id);
    Object.assign(user, {
      penalty_count: Number(updated.penalty_count || 0),
      forgiven_count: Number(updated.forgiven_count || 0),
      penalty_status: updated.penalty_status || 'green',
    });
    renderUsers();
    renderPenaltyDialog(user);
    toast('تمت المسامحة وتحديث الجزاء.');
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
    button.disabled = false;
    button.textContent =
      penaltyStatusOf(user) === 'black' ? 'مسامحة ← أحمر' : 'مسامحة ← أخضر';
  }
}

// ---------------------------------------------------------- subscriptions --

const SUB_STATUS_LABELS = {
  pending: 'بانتظار التحصيل',
  active: 'نشط',
  expired: 'منتهي',
  cancelled: 'ملغي',
};

function subscriptionStatusClass(status) {
  return {
    pending: 'badge-warn',
    active: 'badge-ok',
    expired: 'badge-off',
    cancelled: 'badge-off',
  }[status] || 'badge-off';
}

async function loadSubscriptions(trigger = null) {
  const errorBox = $('#subscriptions-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const filters = state.subscriptionFilters;
      const [requests, plans] = await Promise.all([
        api.fetchSubscriptions(filters),
        api.fetchSubscriptionPlans(),
      ]);
      state.subscriptions = requests;
      state.subscriptionPlans = plans;
      renderSubscriptions();
      renderPlans();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function renderSubscriptions() {
  const body = $('#subscriptions-body');
  if (!state.subscriptions.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty">لا توجد اشتراكات مطابقة.</td></tr>';
    return;
  }

  body.innerHTML = state.subscriptions
    .map((row) => {
      const pending = row.status === 'pending' && !row.paid;
      return `
        <tr>
          <td>${escapeHtml(row.full_name || '—')}
            <div class="muted small">${escapeHtml(row.email || '')}</div>
          </td>
          <td>${governorateLabel(row.governorate)}</td>
          <td>${escapeHtml(row.plan_name || '—')}
            <div class="muted small">${row.duration_days ?? '—'} يوم</div>
          </td>
          <td>${money(row.amount)}</td>
          <td><span class="badge ${subscriptionStatusClass(row.status)}">${
            SUB_STATUS_LABELS[row.status] || escapeHtml(row.status)
          }</span></td>
          <td>${
            row.paid
              ? '<span class="badge badge-ok">مدفوع</span>'
              : '<span class="badge badge-warn">غير مدفوع</span>'
          }</td>
          <td class="muted small">${formatStamp(row.created_at)}</td>
          <td>${escapeHtml(row.collected_by_name || '—')}</td>
          <td class="row-actions">
            ${
              pending
                ? `<button class="btn btn-mini" data-collect-subscription="${row.id}" type="button">تحصيل</button>`
                : '<span class="muted small">—</span>'
            }
          </td>
        </tr>`;
    })
    .join('');
}

function renderPlans() {
  const body = $('#plans-body');
  if (!state.subscriptionPlans.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">لا توجد خطط.</td></tr>';
    return;
  }

  body.innerHTML = state.subscriptionPlans
    .map(
      (plan) => `
      <tr>
        <td>${escapeHtml(plan.name_ar || plan.code)}</td>
        <td>${plan.duration_days} يوم</td>
        <td>${money(plan.price)}</td>
        <td>${
          plan.is_active
            ? '<span class="badge badge-ok">مفعّلة</span>'
            : '<span class="badge badge-off">موقوفة</span>'
        }</td>
        <td class="row-actions">
          <button class="btn btn-mini" data-edit-plan="${plan.id}" type="button">تعديل</button>
        </td>
      </tr>`,
    )
    .join('');
}

function openPlanDialog(plan) {
  const form = $('#plan-form');
  form.reset();
  setFormError('plan', null);
  state.planEditingId = plan.id;
  $('#plan-dialog-title').textContent = `تعديل خطة ${plan.name_ar || plan.code}`;
  form.plan_id.value = plan.id;
  form.price.value = plan.price;
  form.duration_days.value = plan.duration_days;
  form.is_active.checked = Boolean(plan.is_active);
  $('#plan-dialog').showModal();
}

async function savePlan(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#btn-save-plan');
  setFormError('plan', null);
  button.disabled = true;

  try {
    await api.saveSubscriptionPlan({
      id: Number(form.plan_id.value),
      price: Number(form.price.value),
      duration_days: Number(form.duration_days.value),
      is_active: form.is_active.checked,
    });
    toast('تم حفظ الخطة.');
    $('#plan-dialog').close();
    await loadSubscriptions();
  } catch (error) {
    setFormError('plan', error.message);
  } finally {
    button.disabled = false;
  }
}

async function collectSubscriptionRow(id) {
  if (!window.confirm('تأكيد تحصيل قيمة هذا الاشتراك نقداً؟')) return;
  try {
    await api.collectSubscription(id);
    toast('تم تسجيل التحصيل وتفعيل الاشتراك.');
    await loadSubscriptions();
    if (currentView() === 'overview') await loadOverview();
  } catch (error) {
    $('#subscriptions-error').textContent = error.message;
    $('#subscriptions-error').classList.remove('hidden');
  }
}

// -------------------------------------------------------- notifications --

function renderNotifications() {
  const list = $('#notif-list');
  const badge = $('#notif-badge');
  const rows = state.notifications;
  const lastSeen = state.notifLastSeen ? new Date(state.notifLastSeen) : null;
  const unread = lastSeen
    ? rows.filter((row) => new Date(row.created_at) > lastSeen)
    : [];

  badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
  badge.classList.toggle('hidden', unread.length === 0);

  if (!rows.length) {
    list.innerHTML = '<p class="empty">لا توجد إشعارات.</p>';
    return;
  }

  list.innerHTML = rows
    .map((row) => {
      const isUnread = lastSeen && new Date(row.created_at) > lastSeen;
      const user = row.users || {};
      const category =
        row.category === 'suggestion'
          ? 'اقتراح'
          : row.category === 'issue'
            ? 'مشكلة'
            : 'أخرى';
      return `
        <button class="notif-item ${isUnread ? 'is-unread' : ''}"
                data-notif-id="${row.id}" type="button">
          <span><strong>${escapeHtml(row.reference || '')}</strong> · ${category}</span>
          <span>${escapeHtml(user.full_name || user.email || 'مستخدم')} — ${escapeHtml(
            (row.message || '').slice(0, 90),
          )}</span>
          <span class="notif-meta">${formatStamp(row.created_at)}</span>
        </button>`;
    })
    .join('');
}

async function loadNotifications() {
  try {
    const rows = await api.fetchFeedbackNotifications(20);
    const previous = state.notifLastSeen;
    state.notifications = rows;

    if (!previous) {
      state.notifLastSeen = rows[0]?.created_at || new Date().toISOString();
      localStorage.setItem('busna.notifLastSeen', state.notifLastSeen);
    } else {
      const fresh = rows.filter((row) => new Date(row.created_at) > new Date(previous));
      if (fresh.length) notifyBrowser(fresh);
    }

    renderNotifications();
  } catch (_) {
    // The bell is best-effort; the support inbox still works without it.
  }
}

function notifyBrowser(rows) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const latest = rows[0];
  const user = latest.users || {};
  try {
    const note = new Notification('طلب دعم جديد', {
      body: `${user.full_name || 'مستخدم'}: ${latest.message || ''}`.slice(0, 120),
      icon: 'favicon.png',
      tag: latest.id,
    });
    note.onclick = () => {
      window.focus();
      openNotification(latest.id);
    };
  } catch (_) {
    // Some browsers block constructors in insecure contexts.
  }
}

async function enableBrowserNotifications() {
  if (!('Notification' in window)) {
    toast('هذا المتصفح لا يدعم الإشعارات.');
    return;
  }
  const permission = await Notification.requestPermission();
  toast(
    permission === 'granted'
      ? 'تم تفعيل إشعارات المتصفح.'
      : 'لم يتم السماح بإشعارات المتصفح.',
  );
}

function markNotificationsSeen() {
  state.notifLastSeen = new Date().toISOString();
  localStorage.setItem('busna.notifLastSeen', state.notifLastSeen);
  renderNotifications();
}

async function openNotification(id) {
  const row = state.notifications.find((item) => item.id === id);
  if (!row) return;

  markNotificationsSeen();
  $('#notif-panel').classList.add('hidden');
  window.location.hash = 'feedback';

  state.supportTab = row.category === 'suggestion' ? 'suggestion' : 'support';
  $$('#support-tabs .segment').forEach((item) =>
    item.classList.toggle('is-active', item.dataset.tab === state.supportTab),
  );
  $('#support-panel').classList.toggle('hidden', state.supportTab !== 'support');
  $('#suggestions-panel').classList.toggle('hidden', state.supportTab !== 'suggestion');

  await loadSupport();
  if (row.category !== 'suggestion') openSupportThread(row.id);
}

// -------------------------------------------------------- support requests --

const SUPPORT_CATEGORY_LABELS = {
  suggestion: 'اقتراح',
  issue: 'مشكلة',
  other: 'أخرى',
};

const SUPPORT_STATUS_LABELS = {
  new: 'جديد',
  in_progress: 'قيد المعالجة',
  waiting_user: 'بانتظار المستخدم',
  resolved: 'تم الحل',
  closed: 'مغلق',
};

const SUPPORT_PRIORITY_LABELS = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عالية',
};

const SUPPORT_STATUS_OPTIONS = ['new', 'in_progress', 'waiting_user', 'resolved', 'closed'];

function supportStatusClass(status) {
  return {
    new: 'badge-off',
    in_progress: 'badge-warn',
    waiting_user: 'badge-info',
    resolved: 'badge-ok',
    closed: 'badge-off',
  }[status] || 'badge-off';
}

function priorityClass(priority) {
  return { high: 'badge-danger', low: 'badge-off' }[priority] || 'badge-warn';
}

// A request is unread when the user wrote after the last time an admin opened it.
function isSupportUnread(row) {
  if (!row.admin_last_read_at) return true;
  return new Date(row.last_activity_at) > new Date(row.admin_last_read_at);
}

async function loadSupport(trigger = null) {
  const errorBox = $('#support-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      state.support = await api.fetchSupportRequests(state.supportTab);
      renderSupport();
      updateSupportBadge();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

async function updateSupportBadge() {
  try {
    const summary = await api.fetchSupportSummary();
    const badge = $('.nav-item[data-view="feedback"] .nav-badge');
    if (!badge) return;
    const count = Number(summary.unread_count || 0);
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count === 0);
  } catch {
    // The badge is decorative; the inbox itself surfaces load errors.
  }
}

function renderSupport() {
  const isSuggestion = state.supportTab === 'suggestion';
  const target = $(isSuggestion ? '#suggestions-body' : '#support-body');

  if (!state.support.length) {
    target.innerHTML = `<tr><td colspan="8" class="empty">${
      isSuggestion ? 'لا توجد اقتراحات.' : 'لا توجد طلبات دعم.'
    }</td></tr>`;
    return;
  }

  target.innerHTML = state.support
    .map((row) => {
      const user = row.users || {};
      const unread = isSupportUnread(row);
      const category =
        row.category === 'other'
          ? escapeHtml(row.other_label || 'أخرى')
          : SUPPORT_CATEGORY_LABELS[row.category] || escapeHtml(row.category);
      const status = row.status || 'new';
      const userCell = `${escapeHtml(user.full_name || '—')}
        <div class="muted small">${escapeHtml(user.email || '')}</div>`;

      if (isSuggestion) {
        return `
        <tr>
          <td class="muted small">${formatStamp(row.created_at)}</td>
          <td>${userCell}</td>
          <td><span class="badge badge-info">${category}</span></td>
          <td class="feedback-message">${escapeHtml(row.message)}</td>
          <td>
            <select class="inline-select" data-support-status="${row.id}">
              ${SUPPORT_STATUS_OPTIONS.map(
                (option) =>
                  `<option value="${option}"${option === status ? ' selected' : ''}>${
                    SUPPORT_STATUS_LABELS[option]
                  }</option>`,
              ).join('')}
            </select>
          </td>
        </tr>`;
      }

      return `
      <tr class="${unread ? 'is-unread' : ''}">
        <td>
          <button class="link-button" data-open-support="${row.id}" type="button">
            <span class="unread-dot${unread ? '' : ' hidden'}"></span>
            ${escapeHtml(row.reference || '—')}
          </button>
        </td>
        <td class="muted small">${formatStamp(row.last_activity_at || row.created_at)}</td>
        <td>${userCell}</td>
        <td><span class="badge badge-info">${category}</span></td>
        <td>
          <span class="badge ${priorityClass(row.priority)}">
            ${SUPPORT_PRIORITY_LABELS[row.priority] || 'عادية'}
          </span>
        </td>
        <td><span class="badge ${supportStatusClass(status)}">${
          SUPPORT_STATUS_LABELS[status] || escapeHtml(status)
        }</span></td>
        <td class="feedback-message">${escapeHtml(row.message)}</td>
        <td class="row-actions">
          <button class="btn btn-mini" data-open-support="${row.id}" type="button">فتح</button>
        </td>
      </tr>`;
    })
    .join('');
}

async function openSupportThread(id) {
  const row = state.support.find((item) => String(item.id) === String(id));
  if (!row) return;

  state.supportActive = row;
  state.supportThread = [];
  $('#support-dialog-title').textContent = `طلب ${row.reference || ''}`;
  $('#support-dialog-meta').textContent =
    `${row.users?.full_name || 'مستخدم'} — ${formatStamp(row.created_at)}`;
  $('#support-status').value = row.status || 'new';
  $('#support-priority').value = row.priority || 'normal';
  $('#support-reply-body').value = '';
  $('#support-internal').checked = false;
  $('#support-dialog-error').classList.add('hidden');
  $('#support-messages').innerHTML = '<p class="empty">جارٍ تحميل المحادثة…</p>';

  const dialog = $('#support-dialog');
  if (!dialog.open) dialog.showModal();

  await refreshSupportThread();
}

async function refreshSupportThread() {
  const row = state.supportActive;
  if (!row) return;

  try {
    state.supportThread = await api.fetchSupportThread(row.id);
    renderSupportThread();
    await api.markSupportRead(row.id);
    row.admin_last_read_at = new Date().toISOString();
    renderSupport();
    updateSupportBadge();
  } catch (error) {
    $('#support-dialog-error').textContent = error.message;
    $('#support-dialog-error').classList.remove('hidden');
  }
}

function renderSupportThread() {
  const box = $('#support-messages');
  const row = state.supportActive;
  if (!row) return;

  const messages = [
    {
      author_role: 'user',
      body: row.message,
      created_at: row.created_at,
      is_internal: false,
      users: row.users,
    },
    ...state.supportThread,
  ];

  box.innerHTML = messages
    .map((message) => {
      const isAdmin = message.author_role === 'admin';
      const internal = Boolean(message.is_internal);
      const author = isAdmin
        ? 'فريق الدعم'
        : escapeHtml(message.users?.full_name || 'المستخدم');

      return `
      <div class="support-bubble ${isAdmin ? 'is-admin' : 'is-user'}${
        internal ? ' is-internal' : ''
      }">
        <div class="support-bubble-head">
          <span>${author}</span>
          <span>${formatStamp(message.created_at)}</span>
        </div>
        ${internal ? '<span class="badge badge-warn">ملاحظة داخلية</span>' : ''}
        <p>${escapeHtml(message.body)}</p>
      </div>`;
    })
    .join('');

  box.scrollTop = box.scrollHeight;
}

async function sendSupportReply(event) {
  event.preventDefault();
  const row = state.supportActive;
  if (!row) return;

  const body = $('#support-reply-body').value.trim();
  if (!body) {
    toast('اكتب نص الرد أولاً.');
    return;
  }

  const internal = $('#support-internal').checked;
  const button = $('#btn-send-support');

  await withBusy(button, async () => {
    try {
      await api.replySupport(row.id, state.session.id, body, internal);
      $('#support-reply-body').value = '';
      $('#support-internal').checked = false;
      toast(internal ? 'تم حفظ الملاحظة الداخلية.' : 'تم إرسال الرد.');
      await refreshSupportThread();
      await loadSupport();
    } catch (error) {
      $('#support-dialog-error').textContent = error.message;
      $('#support-dialog-error').classList.remove('hidden');
    }
  });
}

async function changeSupportField(field, value) {
  const row = state.supportActive;
  if (!row) return;

  try {
    await api.updateSupport(row.id, { [field]: value });
    row[field] = value;
    toast('تم التحديث.');
    await loadSupport();
  } catch (error) {
    $('#support-dialog-error').textContent = error.message;
    $('#support-dialog-error').classList.remove('hidden');
  }
}

// ------------------------------------------------------------------- tools --

async function loadTools(trigger = null) {
  const errorBox = $('#tools-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const rows = await api.fetchBoardingLog();
      renderBoardings(rows);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function renderBoardings(rows) {
  const body = $('#boardings-body');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">لا توجد حجوزات لرحلة اليوم.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const route = row.route_code
        ? `${escapeHtml(row.route_code)} · ${escapeHtml(row.origin || '')} ← ${escapeHtml(row.destination || '')}`
        : '—';
      return `
        <tr>
          <td>${escapeHtml(row.passenger_name || '—')}</td>
          <td>${route}</td>
          <td>${row.seat_num ?? '—'}</td>
          <td>${paymentLabel(row.payment_method)} ${row.paid ? '<span class="badge badge-ok">مدفوع</span>' : '<span class="badge badge-warn">غير مدفوع</span>'}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${formatStamp(row.updated_at)}</td>
        </tr>`;
    })
    .join('');
}

// Client-side decode of a ticket token: b1.<booking>.<issued>.<expires>.<sig>
function decodeToken(raw) {
  const token = (raw || '').trim();
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'b1') {
    return { raw: token, wellFormed: false };
  }

  const stamp = (value) => {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
  };

  return {
    raw: token,
    wellFormed: true,
    version: parts[0],
    bookingId: parts[1],
    issuedAt: stamp(parts[2]),
    expiresAt: stamp(parts[3]),
    hasSignature: parts[4].length === 64,
    expired: (stamp(parts[3])?.getTime() ?? 0) < Date.now(),
  };
}

function renderTokenResult(info, verify) {
  const box = $('#token-result');
  box.classList.remove('hidden');

  const rows = info.wellFormed
    ? [
        ['well_formed', 'true'],
        ['booking_id', escapeHtml(info.bookingId)],
        ['issued_at', info.issuedAt ? formatStamp(info.issuedAt) : '—'],
        ['expires_at', info.expiresAt ? formatStamp(info.expiresAt) : '—'],
        ['expired', info.expired ? 'true' : 'false'],
        ['signature', info.hasSignature ? 'sha256 / 64 hex' : '—'],
      ]
    : [['well_formed', 'false']];

  let html = rows
    .map(
      ([label, value]) =>
        `<div class="debug-row"><span class="debug-label">${label}</span><span class="debug-value">${value}</span></div>`,
    )
    .join('');

  if (verify) {
    html += `
      <div class="debug-sep"></div>
      <div class="debug-row"><span class="debug-label">valid</span><span class="debug-value">${verify.valid ? 'true' : 'false'}</span></div>
      <div class="debug-row"><span class="debug-label">reason</span><span class="debug-value">${escapeHtml(verify.reason || '(empty)')}</span></div>
      <div class="debug-row"><span class="debug-label">status</span><span class="debug-value">${escapeHtml(verify.status || '—')}</span></div>
      <div class="debug-row"><span class="debug-label">can_board</span><span class="debug-value">${verify.can_board ? 'true' : 'false'}</span></div>
      <div class="debug-row"><span class="debug-label">passenger</span><span class="debug-value">${escapeHtml(verify.passenger_name || '—')}</span></div>`;
  }

  html += `<div class="debug-raw">${escapeHtml(info.raw || '(فارغ)')}</div>`;
  box.innerHTML = html;
}

async function analyzeToken(verifyOnServer) {
  const input = $('#token-input');
  const box = $('#token-result');
  const info = decodeToken(input.value);

  if (!info.raw) {
    box.classList.add('hidden');
    return;
  }

  if (!verifyOnServer) {
    renderTokenResult(info, null);
    return;
  }

  const errorBox = $('#tools-error');
  errorBox.classList.add('hidden');
  try {
    const verify = await api.verifyTicketToken(info.raw);
    renderTokenResult(info, verify);
  } catch (error) {
    renderTokenResult(info, null);
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  }
}

// ------------------------------------------------------------------ utils --

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

// Display only. `formatTime` stays 24-hour because <input type="time"> will
// not accept anything else when the edit dialog is filled in.
function formatTripDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatClock(value) {
  if (!value) return '—';
  const [rawHour, rawMinute] = String(value).split(':');
  const hour = Number(rawHour);
  if (Number.isNaN(hour)) return '—';
  const minute = (rawMinute ?? '00').slice(0, 2);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${hour < 12 ? 'ص' : 'م'}`;
}

function formatStamp(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const two = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}`;
}

function paymentLabel(method) {
  if (method === 'subscription') {
    return '<span class="badge badge-ok">اشتراك</span>';
  }
  return method === 'app'
    ? '<span class="badge badge-info">تطبيق</span>'
    : '<span class="badge badge-warn">كاش</span>';
}

function statusBadge(status) {
  const map = {
    booked: ['badge-info', 'محجوزة'],
    completed: ['badge-ok', 'مكتملة'],
    no_show: ['badge-warn', 'غياب'],
    cancelled: ['badge-off', 'ملغاة'],
  };
  const [className, label] = map[status] || ['badge-off', escapeHtml(status || '—')];
  return `<span class="badge ${className}">${label}</span>`;
}

function setFormError(kind, message) {
  const node = document.querySelector(`[data-error-for="${kind}"]`);
  if (!node) return;
  node.textContent = message || '';
  node.classList.toggle('hidden', !message);
}

let toastTimer = null;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 3200);
}

// ------------------------------------------------------------------ events --

function bindStatic() {
  $('#btn-google').addEventListener('click', async () => {
    const button = $('#btn-google');
    const errorBox = $('#login-error');
    errorBox.classList.add('hidden');
    button.disabled = true;
    try {
      await api.signInWithGoogle();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
      button.disabled = false;
    }
  });

  $('#btn-unauth-refresh').addEventListener('click', async () => {
    try {
      renderGate(await api.fetchSession());
    } catch (error) {
      toast(error.message);
    }
  });

  const doSignOut = async () => {
    await api.signOut();
    window.location.hash = '';
    renderGate(null);
  };
  $('#btn-signout').addEventListener('click', doSignOut);
  $('#btn-unauth-signout').addEventListener('click', doSignOut);

  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      window.location.hash = item.dataset.view;
    });
  });
  window.addEventListener('hashchange', () => showView(currentView()));

  $('#btn-refresh-overview').addEventListener('click', (event) => loadOverview(event.currentTarget));
  $('#stats-range').addEventListener('click', (event) => {
    const button = event.target.closest('[data-range]');
    if (!button) return;
    state.statsRange = button.dataset.range;
    $$('#stats-range .segment').forEach((item) =>
      item.classList.toggle('is-active', item === button),
    );
    refreshStats(button);
  });
  $('#btn-refresh-users').addEventListener('click', (event) => loadUsers(event.currentTarget));
  $('#btn-refresh-support').addEventListener('click', (event) => loadSupport(event.currentTarget));
  $('#btn-refresh-tools').addEventListener('click', (event) => loadTools(event.currentTarget));
  $('#btn-decode').addEventListener('click', () => analyzeToken(false));
  $('#btn-verify').addEventListener('click', () => analyzeToken(true));
  $('#token-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      analyzeToken(true);
    }
  });
  $('#btn-add-route').addEventListener('click', () => openRouteDialog());
  $('#btn-add-inspector').addEventListener('click', () => openInspectorDialog());
  $('#btn-add-station').addEventListener('click', () => openStationDialog());
  $('#btn-add-vehicle').addEventListener('click', () => openVehicleDialog());
  $('#btn-add-governorate').addEventListener('click', () => openGovernorateDialog());
  $('#route-form').addEventListener('submit', saveRoute);
  $('#vehicle-form').addEventListener('submit', saveVehicle);
  $('#vehicle-form').vehicle_type.addEventListener('change', () => {
    populateVehicleCapacity($('#vehicle-form').vehicle_type.value);
    updateVehicleSeatPreview();
  });
  $('#vehicle-capacity').addEventListener('change', updateVehicleSeatPreview);
  $('#vehicle-form').plate_letters.addEventListener('input', (event) => {
    const formatted = formatPlateLetters(event.currentTarget.value);
    if (event.currentTarget.value !== formatted) {
      event.currentTarget.value = formatted;
    }
  });
  $('#vehicle-form').plate_numbers.addEventListener('input', (event) => {
    const formatted = toArabicDigits(
      normalizePlateDigits(event.currentTarget.value).slice(0, 4),
    );
    if (event.currentTarget.value !== formatted) {
      event.currentTarget.value = formatted;
    }
  });
  $('#station-form').addEventListener('submit', saveStation);
  $('#governorate-form').addEventListener('submit', saveGovernorate);
  $('#inspector-form').addEventListener('submit', saveInspector);
  $('#btn-add-stop').addEventListener('click', addRouteNode);
  $('#route-graph').addEventListener('click', (event) => {
    const node = event.target.closest('[data-graph-node]');
    if (!node) return;
    const nodes = $$('#route-graph [data-graph-node]');
    const index = nodes.indexOf(node);

    if (event.target.closest('[data-remove-node]')) {
      removeRouteNode(index);
      return;
    }
    const move = event.target.closest('[data-move-node]');
    if (move) moveRouteNode(index, Number(move.dataset.moveNode));
  });
  $('#route-graph').addEventListener('change', updateTripCostPreview);
  $('#route-graph').addEventListener('input', updateTripCostPreview);
  $('#trip-start').addEventListener('change', updateTripCostPreview);
  $('#trip-end').addEventListener('change', updateTripCostPreview);
  $('#route-vehicle-type').addEventListener('change', () => {
    clearRouteVehicle();
    openVehiclePicker();
  });
  $('#route-vehicle-search').addEventListener('focus', openVehiclePicker);
  $('#route-vehicle-search').addEventListener('input', () => {
    const hidden = $('#route-vehicle');
    if (hidden) hidden.value = '';
    openVehiclePicker();
  });
  $('#route-vehicle-list').addEventListener('click', (event) => {
    const option = event.target.closest('[data-vehicle-option]');
    if (!option) return;
    selectRouteVehicle(option.dataset.vehicleOption);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#route-vehicle-picker')) closeVehiclePicker();
  });
  $('#btn-apply-stations').addEventListener('click', () => {
    state.stationFilters = {
      search: $('#stations-search').value,
      governorate: $('#stations-governorate').value,
    };
    renderStations();
  });
  $('#stations-search').addEventListener('input', () => {
    state.stationFilters.search = $('#stations-search').value;
    renderStations();
  });
  $('#stations-governorate').addEventListener('change', () => {
    state.stationFilters.governorate = $('#stations-governorate').value;
    renderStations();
  });

  $$('#inspector-mode .segment').forEach((button) => {
    button.addEventListener('click', () => {
      setInspectorMode(button.dataset.mode);
      clearInspectorPreview();
      setFormError('inspector', null);
      const form = $('#inspector-form');
      const field = button.dataset.mode === 'id' ? form.user_id : form.email;
      if (!field.readOnly) field.focus();
    });
  });

  $('#inspector-form').user_id.addEventListener('change', (event) => {
    resolveInspectorUser(event.target.value);
  });

  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById(button.dataset.close).close();
    });
  });

  const routeSeatsDate = $('#route-seats-date');
  if (routeSeatsDate) {
    routeSeatsDate.addEventListener('change', () => {
      state.routeSeatDate = routeSeatsDate.value;
      loadRouteSeatBookings();
    });
  }

  const delayTrip = $('#btn-delay-trip');
  if (delayTrip) delayTrip.addEventListener('click', openTripDelayDialog);
  const tripDelayForm = $('#trip-delay-form');
  if (tripDelayForm) tripDelayForm.addEventListener('submit', saveTripDelay);

  $('#routes-body').addEventListener('click', async (event) => {
    const seats = event.target.closest('[data-open-seats]');
    const edit = event.target.closest('[data-edit-route]');
    const remove = event.target.closest('[data-delete-route]');
    const toggle = event.target.closest('[data-toggle-route]');

    if (seats) {
      const route = state.routes.find((item) => String(item.id) === seats.dataset.openSeats);
      if (route) openRouteSeatDialog(route);
      return;
    }

    if (edit) {
      const route = state.routes.find((item) => String(item.id) === edit.dataset.editRoute);
      if (route) openRouteDialog(route);
      return;
    }

    if (remove) {
      const route = state.routes.find((item) => String(item.id) === remove.dataset.deleteRoute);
      if (!route) return;
      if (!window.confirm(`حذف المسار ${route.code}؟`)) return;
      try {
        await api.deleteRoute(route.id);
        toast('تم حذف المسار.');
        await loadRoutes();
      } catch (error) {
        $('#routes-error').textContent = error.message;
        $('#routes-error').classList.remove('hidden');
      }
      return;
    }

    if (toggle) {
      const route = state.routes.find((item) => String(item.id) === toggle.dataset.toggleRoute);
      if (!route) return;
      try {
        await api.setRouteActive(route.id, !route.is_active);
        await loadRoutes();
      } catch (error) {
        $('#routes-error').textContent = error.message;
        $('#routes-error').classList.remove('hidden');
      }
      return;
    }

    const row = event.target.closest('[data-route-seats]');
    if (row && !event.target.closest('button, a, input, select')) {
      const route = state.routes.find((item) => String(item.id) === row.dataset.routeSeats);
      if (route) openRouteSeatDialog(route);
    }
  });

  $('#routes-body').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-route-seats]');
    if (!row) return;
    event.preventDefault();
    const route = state.routes.find((item) => String(item.id) === row.dataset.routeSeats);
    if (route) openRouteSeatDialog(route);
  });

  $('#stations-body').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-station]');
    const remove = event.target.closest('[data-delete-station]');
    const toggle = event.target.closest('[data-toggle-station]');

    if (edit) {
      const station = state.stations.find((item) => String(item.id) === edit.dataset.editStation);
      if (station) openStationDialog(station);
      return;
    }

    if (remove) {
      const station = state.stations.find((item) => String(item.id) === remove.dataset.deleteStation);
      if (!station) return;
      if (!window.confirm(`حذف المحطة ${station.name}؟ ستبقى محطات المسارات السابقة كنصوص.`)) return;
      try {
        await api.deleteStation(station.id);
        toast('تم حذف المحطة.');
        await loadStations();
      } catch (error) {
        $('#stations-error').textContent = error.message;
        $('#stations-error').classList.remove('hidden');
      }
      return;
    }

    if (toggle) {
      const station = state.stations.find((item) => String(item.id) === toggle.dataset.toggleStation);
      if (!station) return;
      try {
        await api.updateStation(station.id, { is_active: !station.is_active });
        await loadStations();
      } catch (error) {
        $('#stations-error').textContent = error.message;
        $('#stations-error').classList.remove('hidden');
      }
    }
  });

  $('#vehicles-body').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-vehicle]');
    const remove = event.target.closest('[data-delete-vehicle]');
    const toggle = event.target.closest('[data-toggle-vehicle]');

    if (edit) {
      const vehicle = state.vehicles.find((item) => String(item.id) === edit.dataset.editVehicle);
      if (vehicle) openVehicleDialog(vehicle);
      return;
    }

    if (remove) {
      const vehicle = state.vehicles.find((item) => String(item.id) === remove.dataset.deleteVehicle);
      if (vehicle) removeVehicle(vehicle.id);
      return;
    }

    if (toggle) {
      const vehicle = state.vehicles.find((item) => String(item.id) === toggle.dataset.toggleVehicle);
      if (vehicle) toggleVehicle(vehicle.id, !vehicle.is_active);
    }
  });

  $('#governorates-body').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-governorate]');
    const remove = event.target.closest('[data-delete-governorate]');

    if (edit) {
      const governorate = state.governorates.find(
        (item) => item.code === edit.dataset.editGovernorate,
      );
      if (governorate) openGovernorateDialog(governorate);
      return;
    }

    if (remove) {
      const governorate = state.governorates.find(
        (item) => item.code === remove.dataset.deleteGovernorate,
      );
      if (!governorate) return;
      if (!window.confirm(`حذف محافظة ${governorate.name_ar}؟`)) return;
      try {
        await api.deleteGovernorate(governorate.code);
        toast('تم حذف المحافظة.');
        await loadStations();
      } catch (error) {
        $('#governorates-error').textContent = error.message;
        $('#governorates-error').classList.remove('hidden');
      }
    }
  });

  $('#inspectors-body').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-inspector]');
    const remove = event.target.closest('[data-delete-inspector]');
    const toggle = event.target.closest('[data-toggle-inspector]');

    if (edit) {
      const row = state.inspectors.find((item) => item.id === edit.dataset.editInspector);
      if (row) openInspectorDialog(row);
      return;
    }

    if (remove) {
      const row = state.inspectors.find((item) => item.id === remove.dataset.deleteInspector);
      if (!row) return;
      if (!window.confirm(`حذف المفتش ${row.email}؟ لن يُلغى حسابه، فقط تنتهي صلاحيته.`)) return;
      try {
        await api.deleteInspector(row.id);
        toast('تم حذف المفتش.');
        await loadInspectors();
      } catch (error) {
        $('#inspectors-error').textContent = error.message;
        $('#inspectors-error').classList.remove('hidden');
      }
      return;
    }

    if (toggle) {
      const row = state.inspectors.find((item) => item.id === toggle.dataset.toggleInspector);
      if (!row) return;
      try {
        await api.setInspectorActive(row.id, !row.is_active);
        await loadInspectors();
      } catch (error) {
        $('#inspectors-error').textContent = error.message;
        $('#inspectors-error').classList.remove('hidden');
      }
    }
  });

  $$('#support-tabs .segment').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.supportTab === button.dataset.tab) return;
      state.supportTab = button.dataset.tab;
      $$('#support-tabs .segment').forEach((item) =>
        item.classList.toggle('is-active', item === button),
      );
      $('#support-panel').classList.toggle('hidden', state.supportTab !== 'support');
      $('#suggestions-panel').classList.toggle('hidden', state.supportTab !== 'suggestion');
      loadSupport();
    });
  });

  $('#support-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-support]');
    if (button) openSupportThread(button.dataset.openSupport);
  });

  $('#suggestions-body').addEventListener('change', async (event) => {
    const select = event.target.closest('[data-support-status]');
    if (!select) return;
    try {
      await api.updateSupport(select.dataset.supportStatus, { status: select.value });
      toast('تم تحديث الحالة.');
      await loadSupport();
    } catch (error) {
      toast(error.message);
    }
  });

  $('#support-dialog').addEventListener('close', () => {
    state.supportActive = null;
    state.supportThread = [];
    loadSupport();
  });

  $('#support-reply-form').addEventListener('submit', sendSupportReply);
  $('#support-status').addEventListener('change', (event) =>
    changeSupportField('status', event.target.value),
  );
  $('#support-priority').addEventListener('change', (event) =>
    changeSupportField('priority', event.target.value),
  );

  $('#users-body').addEventListener('click', (event) => {
    const save = event.target.closest('[data-save-role]');
    if (save) saveUserRole(save.dataset.saveRole);
    const remove = event.target.closest('[data-delete-user]');
    if (remove) deleteUserAccount(remove.dataset.deleteUser);
    const penalty = event.target.closest('[data-penalty-user]');
    if (penalty) {
      openPenaltyDialog(penalty.dataset.penaltyUser);
      return;
    }
    const person = event.target.closest('[data-person]');
    if (person) openPersonBookings(person.dataset.person);
  });

  $('#btn-forgive-penalty').addEventListener('click', forgivePenalty);

  $('#inspectors-body').addEventListener('click', (event) => {
    const person = event.target.closest('[data-person]');
    if (person) openPersonBookings(person.dataset.person);
  });

  // ------------------------------------------------------------ people filters
  const debounce = (fn, ms = 260) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  const readUserFilters = () => {
    state.peopleFilters.users = {
      search: $('#users-search').value.trim(),
      governorate: $('#users-governorate').value,
      role: $('#users-role').value,
      minCompliance: $('#users-compliance').value,
    };
  };
  const readInspectorFilters = () => {
    state.peopleFilters.inspectors = {
      search: $('#inspectors-search').value.trim(),
      governorate: $('#inspectors-governorate').value,
      minCompliance: $('#inspectors-compliance').value,
    };
  };

  const reloadUsers = debounce(() => loadUsers());
  const reloadInspectors = debounce(() => loadInspectors());

  $('#users-search').addEventListener('input', () => {
    readUserFilters();
    reloadUsers();
  });
  $('#users-governorate').addEventListener('change', () => {
    readUserFilters();
    loadUsers();
  });
  $('#users-role').addEventListener('change', () => {
    readUserFilters();
    loadUsers();
  });
  $('#users-compliance').addEventListener('input', () => {
    readUserFilters();
    reloadUsers();
  });
  $('#btn-apply-users').addEventListener('click', () => {
    readUserFilters();
    loadUsers();
  });

  $('#inspectors-search').addEventListener('input', () => {
    readInspectorFilters();
    reloadInspectors();
  });
  $('#inspectors-governorate').addEventListener('change', () => {
    readInspectorFilters();
    loadInspectors();
  });
  $('#inspectors-compliance').addEventListener('input', () => {
    readInspectorFilters();
    reloadInspectors();
  });
  $('#btn-apply-inspectors').addEventListener('click', () => {
    readInspectorFilters();
    loadInspectors();
  });

  // ----------------------------------------------------------- subscriptions
  $('#btn-refresh-subscriptions').addEventListener('click', (event) =>
    loadSubscriptions(event.currentTarget),
  );

  $$('#subscription-tabs .segment').forEach((button) => {
    button.addEventListener('click', () => {
      state.subscriptionTab = button.dataset.tab;
      $$('#subscription-tabs .segment').forEach((item) =>
        item.classList.toggle('is-active', item === button),
      );
      $('#subscription-requests-panel').classList.toggle(
        'hidden',
        state.subscriptionTab !== 'requests',
      );
      $('#subscription-plans-panel').classList.toggle(
        'hidden',
        state.subscriptionTab !== 'plans',
      );
    });
  });

  const readSubscriptionFilters = () => {
    state.subscriptionFilters = {
      status: $('#subscriptions-status').value,
      governorate: $('#subscriptions-governorate').value,
    };
  };
  $('#subscriptions-status').addEventListener('change', () => {
    readSubscriptionFilters();
    loadSubscriptions();
  });
  $('#subscriptions-governorate').addEventListener('change', () => {
    readSubscriptionFilters();
    loadSubscriptions();
  });
  $('#btn-apply-subscriptions').addEventListener('click', () => {
    readSubscriptionFilters();
    loadSubscriptions();
  });
  $('#subscriptions-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-collect-subscription]');
    if (button) collectSubscriptionRow(button.dataset.collectSubscription);
  });
  $('#plans-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-plan]');
    if (!button) return;
    const plan = state.subscriptionPlans.find(
      (item) => String(item.id) === button.dataset.editPlan,
    );
    if (plan) openPlanDialog(plan);
  });
  $('#plan-form').addEventListener('submit', savePlan);

  // --------------------------------------------------------------- charts
  $$('#earnings-range .segment').forEach((button) => {
    button.addEventListener('click', async () => {
      state.earningsRange = button.dataset.range;
      $$('#earnings-range .segment').forEach((item) =>
        item.classList.toggle('is-active', item === button),
      );
      try {
        const rows = await api.fetchEarnings(state.earningsRange);
        renderCharts(rows);
      } catch (error) {
        toast(error.message);
      }
    });
  });

  // --------------------------------------------------------- notifications
  $('#btn-notifications').addEventListener('click', (event) => {
    event.stopPropagation();
    const panel = $('#notif-panel');
    const willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willOpen);
    if (willOpen) {
      markNotificationsSeen();
      loadNotifications();
    }
  });
  $('#btn-enable-notifications').addEventListener('click', (event) => {
    event.stopPropagation();
    enableBrowserNotifications();
  });
  $('#notif-list').addEventListener('click', (event) => {
    const item = event.target.closest('[data-notif-id]');
    if (item) openNotification(item.dataset.notifId);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notif-wrap')) {
      $('#notif-panel').classList.add('hidden');
    }
  });
}

boot();
