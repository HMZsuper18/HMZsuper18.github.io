import * as api from './api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const num = new Intl.NumberFormat('en-US');
const state = {
  session: null,
  routes: [],
  inspectors: [],
  users: [],
  support: [],
  supportTab: 'support',
  supportActive: null,
  supportThread: [],
  routeEditingId: null,
  inspectorEditingId: null,
  inspectorMode: 'id',
  inspectorUser: null,
};

// ------------------------------------------------------------------ boot --

async function boot() {
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
    views.push('overview', 'routes', 'inspectors', 'users');
  }
  if (session.canManage) views.push('feedback');
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
  $('#btn-add-inspector').classList.toggle('hidden', !session.canManage);
  $('#users-hint').textContent = session.canEditUsers
    ? 'دور واحد لكل حساب. لا يمكنك تغيير دورك بنفسك.'
    : 'عرض فقط. تغيير الأدوار غير متاح لهذا الحساب.';

  $('#account-email').textContent = session.email;
  $('#account-role').textContent = session.roleLabel;
  $('#app').classList.remove('hidden');
  showView(views.includes(currentView()) ? currentView() : views[0]);
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

const VIEWS = ['overview', 'routes', 'inspectors', 'feedback', 'users', 'tools'];

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
  if (target === 'inspectors') loadInspectors();
  if (target === 'feedback') loadSupport();
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
  ['today_bookings', 'حجوزات اليوم'],
  ['upcoming_bookings', 'حجوزات قادمة'],
  ['completed_today', 'صعود اليوم'],
  ['cancelled_today', 'إلغاءات اليوم'],
  ['no_shows_30d', 'غياب ٣٠ يوم'],
];

async function loadOverview(trigger = null) {
  const errorBox = $('#overview-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const [stats, bookings] = await Promise.all([api.fetchStats(), api.fetchRecentBookings()]);
      renderStats(stats);
      renderBookings(bookings.rows);
      renderListNotice('overview', bookings.rows.length, bookings.total);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function renderStats(stats) {
  const grid = $('#stat-grid');
  if (!stats) {
    grid.innerHTML = '<p class="empty">لا توجد بيانات.</p>';
    return;
  }

  const cards = STAT_LABELS.map(
    ([key, label]) => `
      <div class="stat">
        <span class="stat-value">${num.format(Number(stats[key] ?? 0))}</span>
        <span class="stat-label">${label}</span>
      </div>`,
  );

  cards.push(`
    <div class="stat stat-wide">
      <span class="stat-value">${num.format(Number(stats.app_revenue_today ?? 0))} <small>ج.م</small></span>
      <span class="stat-label">إيراد اليوم (تطبيق)</span>
    </div>`);

  grid.innerHTML = cards.join('');
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

function renderRoutes() {
  const body = $('#routes-body');
  const canManage = Boolean(state.session?.canManage);

  if (!state.routes.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">لا توجد مسارات. أضف أول مسار من الأعلى.</td></tr>';
    return;
  }

  body.innerHTML = state.routes
    .map(
      (route) => `
      <tr>
        <td><code>${escapeHtml(route.code)}</code></td>
        <td>${escapeHtml(route.origin)} ← ${escapeHtml(route.destination)}</td>
        <td>${formatClock(route.move_time)}</td>
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
          ${canManage
            ? `<button class="btn btn-mini" data-edit-route="${route.id}" type="button">تعديل</button>
               <button class="btn btn-mini btn-danger-ghost" data-delete-route="${route.id}" type="button">حذف</button>`
            : '<span class="muted small">—</span>'}
        </td>
      </tr>`,
    )
    .join('');
}

async function openRouteDialog(route = null) {
  const form = $('#route-form');
  form.reset();
  setFormError('route', null);
  state.routeEditingId = route?.id ?? null;

  $('#route-dialog-title').textContent = route ? 'تعديل المسار' : 'مسار جديد';
  $('#btn-save-route').textContent = route ? 'حفظ التعديلات' : 'إضافة المسار';

  if (route) {
    form.code.value = route.code;
    form.price.value = route.price;
    form.origin.value = route.origin;
    form.destination.value = route.destination;
    form.move_time.value = formatTime(route.move_time);
    form.seats.value = route.seats;
    form.is_active.checked = Boolean(route.is_active);
    form.stops.value = '';
    try {
      const stops = await api.fetchRouteStops(route.id);
      form.stops.value = stops
        .map((stop) => `${stop.name} | ${Number(stop.price)}`)
        .join('\n');
    } catch (_) {
      // Stops are optional here; an empty box keeps the current ones.
    }
  } else {
    form.is_active.checked = true;
    form.stops.value = '';
  }

  $('#route-dialog').showModal();
}

// One stop per line, `name | cumulative price from the first stop`.
function parseStops(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nameRaw, priceRaw] = line.split('|');
      const name = (nameRaw || '').trim();
      const parsed = Number((priceRaw || '0').trim());
      return { name, price: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 };
    })
    .filter((stop) => stop.name);
}

async function saveRoute(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveButton = $('#btn-save-route');
  setFormError('route', null);

  const stops = parseStops(form.stops.value);
  const hasStops = stops.length > 0;
  if (hasStops && stops.length < 2) {
    setFormError('route', 'أدخل محطتين على الأقل، كل محطة في سطر: الاسم | السعر.');
    return;
  }

  const last = hasStops ? stops[stops.length - 1] : null;
  const payload = {
    code: form.code.value.trim().toUpperCase(),
    price: hasStops ? last.price : Number(form.price.value),
    origin: hasStops ? stops[0].name : form.origin.value.trim(),
    destination: hasStops ? last.name : form.destination.value.trim(),
    move_time: form.move_time.value,
    seats: Number(form.seats.value),
    is_active: form.is_active.checked,
  };

  saveButton.disabled = true;
  try {
    const creating = state.routeEditingId == null;
    const route = creating
      ? await api.createRoute(payload)
      : await api.updateRoute(state.routeEditingId, payload);

    if (hasStops) {
      await api.replaceRouteStops(route.id, stops);
    } else if (creating) {
      await api.replaceRouteStops(route.id, [
        { name: payload.origin, price: 0 },
        { name: payload.destination, price: payload.price },
      ]);
    }

    toast(creating ? 'تمت إضافة المسار.' : 'تم حفظ التعديلات.');
    $('#route-dialog').close();
    await loadRoutes();
  } catch (error) {
    setFormError('route', error.message);
  } finally {
    saveButton.disabled = false;
  }
}

// ------------------------------------------------------------- inspectors --

async function loadInspectors(trigger = null) {
  const errorBox = $('#inspectors-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const { rows, total } = await api.fetchInspectors();
      const accounts = await api.fetchAccounts(rows.map((row) => row.email));
      state.inspectors = rows.map((row) => attachAccount(row, accounts));
      renderInspectors();
      renderListNotice('inspectors', rows.length, total);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    }
  });
}

function attachAccount(row, accounts) {
  const email = (row.email || '').toLowerCase();
  const account = accounts.find((item) => (item.email || '').toLowerCase() === email);
  return { ...row, account };
}

function renderInspectors() {
  const body = $('#inspectors-body');
  const canManage = Boolean(state.session?.canManage);

  if (!state.inspectors.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty">لا يوجد مفتشون بعد. انسخ رقم المستخدم من تطبيق المفتش ثمّ رقِّه.</td></tr>';
    return;
  }

  body.innerHTML = state.inspectors
    .map((row) => {
      const accountLabel = row.account
        ? row.account.role === 'inspector' || row.account.role === 'admin'
          ? '<span class="badge badge-ok">مفتش مفعّل</span>'
          : '<span class="badge badge-warn">حساب غير مفعّل</span>'
        : '<span class="badge badge-off">بانتظار أول تسجيل دخول</span>';

      return `
        <tr>
          <td><code>${escapeHtml(row.email)}</code></td>
          <td>${escapeHtml(row.full_name || '—')}</td>
          <td>${escapeHtml(row.phone || '—')}</td>
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

async function loadUsers(trigger = null) {
  const errorBox = $('#users-error');
  errorBox.classList.add('hidden');

  return withBusy(trigger, async () => {
    try {
      const { rows, total } = await api.fetchUsers();
      state.users = rows;
      renderUsers();
      renderListNotice('users', rows.length, total);
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

  if (!state.users.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">لا يوجد مستخدمون بعد.</td></tr>';
    return;
  }

  body.innerHTML = state.users
    .map((user) => {
      const isSelf = user.id === me;
      const editable = canEdit && !isSelf;
      const roleLabel = api.ROLE_LABELS[user.role] || user.role;

      const roleCell = editable
        ? `<select class="role-select" data-role-user="${user.id}">${api.ASSIGNABLE_ROLES.map(
            (role) =>
              `<option value="${role}" ${role === user.role ? 'selected' : ''}>${api.ROLE_LABELS[role] || role}</option>`,
          ).join('')}</select>`
        : `<span class="badge badge-off">${escapeHtml(roleLabel)}</span>`;

      return `
        <tr>
          <td>${escapeHtml(user.full_name || '—')}</td>
          <td><code>${escapeHtml(user.email || '—')}</code></td>
          <td>${escapeHtml(user.phone || '—')}</td>
          <td>${roleCell}</td>
          <td class="row-actions">
            ${editable
              ? `<button class="btn btn-mini" data-save-role="${user.id}" type="button">حفظ الدور</button>`
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
  $('#route-form').addEventListener('submit', saveRoute);
  $('#inspector-form').addEventListener('submit', saveInspector);

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

  $('#routes-body').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-route]');
    const remove = event.target.closest('[data-delete-route]');
    const toggle = event.target.closest('[data-toggle-route]');

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
  });
}

boot();
