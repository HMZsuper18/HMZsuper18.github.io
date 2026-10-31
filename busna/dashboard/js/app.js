import * as api from './api.js?v=20261101a';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const num = new Intl.NumberFormat('en-US');
const state = {
  session: null,
  routes: [],
  stations: [],
  governorates: [],
  stationFilters: { search: '', governorate: '' },
  stationEditingId: null,
  governorateEditingCode: null,
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
  earningsRange: 'day',
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
    views.push('overview', 'routes', 'stations', 'inspectors', 'users');
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
    const [statsRes, bookingsRes, summaryRes, earningsRes, collectionsRes] =
      await Promise.allSettled([
        api.fetchStats(),
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

function money(value) {
  return `${num.format(Number(value || 0))} ج.م`;
}

function renderStats(stats, summary = {}) {
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

  cards.push(
    `
    <div class="stat stat-wide">
      <span class="stat-value">${money(summary.today_revenue)}</span>
      <span class="stat-label">أرباح اليوم</span>
    </div>`,
    `
    <div class="stat">
      <span class="stat-value">${money(summary.week_revenue)}</span>
      <span class="stat-label">أرباح الأسبوع</span>
    </div>`,
    `
    <div class="stat">
      <span class="stat-value">${money(summary.month_revenue)}</span>
      <span class="stat-label">أرباح الشهر</span>
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

function vehicleLabel(value) {
  return value === 'microbus' ? 'ميكروباص' : 'باص';
}

function renderRoutes() {
  const body = $('#routes-body');
  const canManage = Boolean(state.session?.canManage);

  if (!state.routes.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">لا توجد مسارات. أضف أول مسار من الأعلى.</td></tr>';
    return;
  }

  body.innerHTML = state.routes
    .map(
      (route) => `
      <tr>
        <td><code>${escapeHtml(route.code)}</code></td>
        <td>${escapeHtml(route.origin)} ← ${escapeHtml(route.destination)}</td>
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
          ${canManage
            ? `<button class="btn btn-mini" data-edit-route="${route.id}" type="button">تعديل</button>
               <button class="btn btn-mini btn-danger-ghost" data-delete-route="${route.id}" type="button">حذف</button>`
            : '<span class="muted small">—</span>'}
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

function stopRowHtml(stop = {}, index = 0) {
  const stationId = stop.station_id ?? '';
  const price = Number.isFinite(Number(stop.price)) ? Number(stop.price) : 0;
  return `
    <div class="node-row" data-stop-row>
      <span class="node-index">${index + 1}</span>
      <select class="stop-station" aria-label="المحطة">${stationOptions(stationId)}</select>
      <input class="stop-price" type="number" min="0" step="1" value="${price}"
             aria-label="السعر التراكمي" placeholder="السعر">
      <div class="node-actions">
        <button type="button" class="btn btn-mini" data-move-stop="-1" title="أعلى">↑</button>
        <button type="button" class="btn btn-mini" data-move-stop="1" title="أسفل">↓</button>
        <button type="button" class="btn btn-mini btn-danger-ghost" data-remove-stop title="حذف">×</button>
      </div>
    </div>`;
}

function renumberStopRows() {
  $$('#route-stops-editor [data-stop-row]').forEach((row, index) => {
    row.querySelector('.node-index').textContent = String(index + 1);
  });
}

function renderStopEditor(stops) {
  const editor = $('#route-stops-editor');
  editor.innerHTML = stops.length
    ? stops.map((stop, index) => stopRowHtml(stop, index)).join('')
    : stopRowHtml({}, 0);
  renumberStopRows();
  updateSeatPreview();
}

function addStopRow() {
  const editor = $('#route-stops-editor');
  const count = $$('[data-stop-row]', editor).length;
  editor.insertAdjacentHTML('beforeend', stopRowHtml({}, count));
  const last = editor.lastElementChild;
  last?.querySelector('.stop-station')?.focus();
  updateSeatPreview();
}

function collectRouteStops() {
  const rows = $$('#route-stops-editor [data-stop-row]');
  const stops = rows.map((row) => {
    const stationId = Number(row.querySelector('.stop-station').value);
    const station = state.stations.find((item) => Number(item.id) === stationId);
    const price = Number(row.querySelector('.stop-price').value);
    return {
      station_id: station?.id ?? null,
      name: station?.name || '',
      governorate: station?.governorate || null,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
    };
  });

  if (stops.length < 2) {
    throw new Error('أضف محطتين على الأقل للمسار.');
  }
  if (stops.some((stop) => !stop.station_id)) {
    throw new Error('اختر محطة لكل صف في محرر المسار.');
  }
  const ids = stops.map((stop) => String(stop.station_id));
  if (new Set(ids).size !== ids.length) {
    throw new Error('لا يمكن تكرار المحطة نفسها في المسار.');
  }
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index].price < stops[index - 1].price) {
      throw new Error('يجب أن يكون السعر التراكمي غير متناقص من محطة لأخرى.');
    }
  }
  return stops;
}

function buildSeatRows(vehicle, total) {
  const rows = [];
  let seat = 1;
  if (vehicle === 'microbus') {
    const front = total >= 2 ? 2 : total;
    if (front > 0) {
      rows.push(
        Array.from({ length: front }, (_, index) => ({
          seat: seat++,
          kind: index === front - 1 && front > 1 ? 'middle' : 'window',
        })),
      );
    }
    let remaining = total - front;
    while (remaining > 0) {
      const count = Math.min(6, remaining);
      rows.push(
        Array.from({ length: count }, (_, index) => {
          let kind = 'aisle';
          if (count <= 1) kind = 'window';
          else if (index === 0 || index === count - 1) kind = 'window';
          else if (index === 1 || index === count - 2) kind = 'middle';
          return { seat: seat++, kind };
        }),
      );
      remaining -= count;
    }
    return rows;
  }

  const backRow = total >= 5 ? 5 : 0;
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
    rows.push([
      { seat: seat++, kind: 'window' },
      { seat: seat++, kind: 'aisle' },
      { gap: true },
      { seat: seat++, kind: 'aisle' },
      { seat: seat++, kind: 'middle' },
      { seat: seat++, kind: 'window' },
    ]);
  }
  return rows;
}

function updateSeatPreview() {
  const box = $('#seat-preview');
  if (!box) return;
  const form = $('#route-form');
  const vehicle = form.vehicle_type.value;
  const total = Math.max(1, Math.min(60, Number(form.seats.value) || 1));
  const rows = buildSeatRows(vehicle, total);
  const seatRows = rows
    .map(
      (row) => `
        <div class="seat-row">
          ${row
            .map((cell) =>
              cell.gap
                ? '<span class="seat-gap"></span>'
                : `<span class="seat-cell seat-${cell.kind}" title="${cell.kind}">${cell.seat}</span>`,
            )
            .join('')}
        </div>`,
    )
    .join('');

  box.innerHTML = `
    <div class="seat-preview-head">
      <strong>${vehicleLabel(vehicle)} · ${total} مقعد</strong>
      <span class="seat-legend">
        <i class="seat-dot seat-window"></i> شباك
        <i class="seat-dot seat-middle"></i> أوسط
        <i class="seat-dot seat-aisle"></i> ممر
      </span>
    </div>
    <div class="seat-vehicle">
      <div class="seat-driver">
        <img src="assets/steering-wheel.svg" alt="">
        <span>السائق</span>
      </div>
      <div class="seat-rows">${seatRows}</div>
    </div>`;
}

async function openRouteDialog(route = null) {
  const form = $('#route-form');
  form.reset();
  setFormError('route', null);
  state.routeEditingId = route?.id ?? null;

  try {
    await ensureStations();
  } catch (error) {
    setFormError('route', error.message);
    return;
  }

  $('#route-dialog-title').textContent = route ? 'تعديل المسار' : 'مسار جديد';
  $('#btn-save-route').textContent = route ? 'حفظ التعديلات' : 'إضافة المسار';

  let stops = [];
  if (route) {
    form.code.value = route.code;
    form.move_time.value = formatTime(route.move_time);
    form.seats.value = route.seats;
    form.vehicle_type.value = route.vehicle_type || 'bus';
    form.is_active.checked = Boolean(route.is_active);
    try {
      stops = await api.fetchRouteStops(route.id);
    } catch (_) {
      stops = [];
    }
  } else {
    form.is_active.checked = true;
    form.vehicle_type.value = 'bus';
    form.seats.value = 14;
  }

  renderStopEditor(
    stops.map((stop) => ({
      ...stop,
      station_id:
        stop.station_id ||
        state.stations.find(
          (station) =>
            station.name.trim() === String(stop.name || '').trim() &&
            (!stop.governorate || station.governorate === stop.governorate),
        )?.id,
    })),
  );
  updateSeatPreview();
  $('#route-dialog').showModal();
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

  const last = stops[stops.length - 1];
  const payload = {
    code: form.code.value.trim().toUpperCase(),
    price: last.price,
    origin: stops[0].name,
    destination: last.name,
    move_time: form.move_time.value,
    seats: Number(form.seats.value),
    vehicle_type: form.vehicle_type.value,
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
        <td>${escapeHtml(station.name)}</td>
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
    body.innerHTML = '<tr><td colspan="7" class="empty">لا يوجد مستخدمون مطابقون.</td></tr>';
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
          <td><button class="btn btn-mini" data-person="${user.id}" type="button">عرض</button></td>
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
  $('#btn-add-governorate').addEventListener('click', () => openGovernorateDialog());
  $('#route-form').addEventListener('submit', saveRoute);
  $('#station-form').addEventListener('submit', saveStation);
  $('#governorate-form').addEventListener('submit', saveGovernorate);
  $('#inspector-form').addEventListener('submit', saveInspector);
  $('#btn-add-stop').addEventListener('click', addStopRow);
  $('#route-stops-editor').addEventListener('click', (event) => {
    const row = event.target.closest('[data-stop-row]');
    if (!row) return;
    const remove = event.target.closest('[data-remove-stop]');
    if (remove) {
      row.remove();
      if (!$$('#route-stops-editor [data-stop-row]').length) addStopRow();
      renumberStopRows();
      updateSeatPreview();
      return;
    }
    const move = event.target.closest('[data-move-stop]');
    if (move) {
      const direction = Number(move.dataset.moveStop);
      if (direction < 0 && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      } else if (direction > 0 && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }
      renumberStopRows();
      updateSeatPreview();
    }
  });
  $('#route-stops-editor').addEventListener('change', updateSeatPreview);
  $('#route-stops-editor').addEventListener('input', updateSeatPreview);
  $('#route-form').vehicle_type.addEventListener('change', updateSeatPreview);
  $('#route-form').seats.addEventListener('input', updateSeatPreview);
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
    const person = event.target.closest('[data-person]');
    if (person) openPersonBookings(person.dataset.person);
  });

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
