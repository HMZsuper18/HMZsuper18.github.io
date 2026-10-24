import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const SESSION_ERROR = 'انتهت الجلسة. سجّل الدخول مرة أخرى.';
const PERMISSION_ERROR = 'لا تملك صلاحية لهذا الإجراء.';
const GENERIC_ERROR = 'حدث خطأ. حاول مرة أخرى.';

export function mapError(error) {
  const code = error?.code || '';
  const message = error?.message || '';
  const upper = message.toUpperCase();

  if (upper.includes('NOT_ALLOWED') || upper.includes('NOT_ADMIN')) return PERMISSION_ERROR;
  if (upper.includes('CANNOT_CHANGE_SELF')) return 'لا يمكنك تغيير دور حسابك بنفسك.';
  if (upper.includes('USER_NOT_FOUND')) return 'لا يوجد حساب بهذا المعرّف.';
  if (upper.startsWith('INVALID_ROLE')) return 'قيمة الدور غير صحيحة.';
  if (code === '42501' || message.includes('permission denied')) return PERMISSION_ERROR;
  if (code === 'PGRST301' || message.includes('JWT')) return SESSION_ERROR;
  if (code === '23505') return 'هذا البريد أو الكود مستخدم من قبل.';
  if (code === '23503') return 'لا يمكن الحذف لوجود حجوزات مرتبطة.';
  if (code === '22P02' || message.includes('invalid input syntax')) {
    return 'صيغة البيانات غير صحيحة. راجع الحقول.';
  }
  return GENERIC_ERROR;
}

// ---------------------------------------------------------------- session --

export const ROLE_LABELS = {
  student: 'طالب',
  analyst: 'محلل',
  inspector: 'مفتش',
  admin: 'مدير',
};

// Roles that can be granted from the role manager. Anything else is decided
// in SQL and is not offered here.
export const ASSIGNABLE_ROLES = ['student', 'analyst', 'inspector', 'admin'];

export async function fetchSession() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const authUser = data.user;
  const { data: row, error: roleError } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (roleError) throw new Error(mapError(roleError));

  // Capabilities come from the server so the client never branches on a role
  // string it should not know about.
  const { data: caps, error: capsError } = await supabase.rpc('my_capabilities');
  if (capsError) throw new Error(mapError(capsError));

  const role = row?.role || 'student';
  const grants = caps?.[0] || {};

  return {
    id: authUser.id,
    email: row?.email || authUser.email || '',
    fullName: row?.full_name || authUser.user_metadata?.full_name || '',
    role,
    // Roles outside the table above are handled entirely in SQL and are
    // reported as the same label as the ordinary manager.
    roleLabel: ROLE_LABELS[role] || 'مدير',
    isAnalyst: role === 'analyst',
    canViewOverview: Boolean(grants.can_view_overview),
    canManage: Boolean(grants.can_manage),
    canEditUsers: Boolean(grants.can_edit_users),
    canUseTools: Boolean(grants.can_use_tools),
  };
}

export async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw new Error(mapError(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------- overview --

export async function fetchStats() {
  const { data, error } = await supabase.rpc('admin_dashboard_stats');
  if (error) throw new Error(mapError(error));
  return data?.[0] || null;
}

export async function fetchRecentBookings(limit = 12) {
  const columns =
    'id, seat_num, travel_date, payment_method, paid, status, created_at, ' +
    'users(full_name, phone), routes(code, origin, destination, move_time, price)';
  const [result, countResult] = await Promise.all([
    supabase.from('bookings').select(columns).order('created_at', { ascending: false }).limit(limit),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
  ]);
  if (result.error) throw new Error(mapError(result.error));
  if (countResult.error) throw new Error(mapError(countResult.error));
  return { rows: result.data || [], total: countResult.count ?? 0 };
}

// ------------------------------------------------------------------ routes --

const ROUTE_COLUMNS = 'id, code, price, origin, destination, seats, move_time, is_active';

export async function fetchRoutes() {
  const [result, countResult] = await Promise.all([
    supabase
      .from('routes')
      .select(ROUTE_COLUMNS)
      .order('is_active', { ascending: false })
      .order('code', { ascending: true }),
    supabase.from('routes').select('*', { count: 'exact', head: true }),
  ]);
  if (result.error) throw new Error(mapError(result.error));
  if (countResult.error) throw new Error(mapError(countResult.error));
  return { rows: result.data || [], total: countResult.count ?? 0 };
}

export async function createRoute(payload) {
  const { data, error } = await supabase.from('routes').insert(payload).select(ROUTE_COLUMNS).single();
  if (error) throw new Error(mapError(error));
  return data;
}

export async function updateRoute(id, payload) {
  const { data, error } = await supabase
    .from('routes')
    .update(payload)
    .eq('id', id)
    .select(ROUTE_COLUMNS)
    .single();
  if (error) throw new Error(mapError(error));
  return data;
}

export async function setRouteActive(id, isActive) {
  const { error } = await supabase.from('routes').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(mapError(error));
}

export async function deleteRoute(id) {
  const { error } = await supabase.from('routes').delete().eq('id', id);
  if (error) throw new Error(mapError(error));
}

// -------------------------------------------------------------- inspectors --

export async function fetchInspectors() {
  const [result, countResult] = await Promise.all([
    supabase
      .from('inspectors')
      .select('id, email, full_name, phone, is_active, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('inspectors').select('*', { count: 'exact', head: true }),
  ]);
  if (result.error) throw new Error(mapError(result.error));
  if (countResult.error) throw new Error(mapError(countResult.error));
  return { rows: result.data || [], total: countResult.count ?? 0 };
}

export async function fetchAccounts(emails) {
  if (!emails.length) return [];
  const { data, error } = await supabase.from('users').select('email, role').in('email', emails);
  if (error) throw new Error(mapError(error));
  return data || [];
}

// Look up an app account by the id shown in the app's About screen.
export async function fetchUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .eq('id', id.trim())
    .maybeSingle();
  if (error) throw new Error(mapError(error));
  if (!data) return null;
  if (!data.email) throw new Error('هذا الحساب ليس له بريد إلكتروني، لذلك لا يمكن تفعيله كمفتش.');
  return data;
}

// The directory's unique key is lower(email), not a plain column, so upsert by hand.
export async function upsertInspector({ email, fullName, isActive = true }) {
  const { data: existing, error: findError } = await supabase
    .from('inspectors')
    .select('id, email, full_name, is_active')
    .limit(1000);
  if (findError) throw new Error(mapError(findError));

  const match = (existing || []).find((row) => (row.email || '').toLowerCase() === email.toLowerCase());

  if (match) {
    const { error } = await supabase
      .from('inspectors')
      .update({ full_name: fullName || match.full_name || '', is_active: isActive })
      .eq('id', match.id);
    if (error) throw new Error(mapError(error));
    return { promoted: isActive && !match.is_active, already: true };
  }

  const { error } = await supabase
    .from('inspectors')
    .insert({ email, full_name: fullName || '', is_active: isActive });
  if (error) throw new Error(mapError(error));
  return { promoted: true, already: false };
}

export async function updateInspector(id, payload) {
  const { error } = await supabase.from('inspectors').update(payload).eq('id', id);
  if (error) throw new Error(mapError(error));
}

export async function setInspectorActive(id, isActive) {
  const { error } = await supabase.from('inspectors').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(mapError(error));
}

export async function deleteInspector(id) {
  const { error } = await supabase.from('inspectors').delete().eq('id', id);
  if (error) throw new Error(mapError(error));
}

// ------------------------------------------------------------------- users --

export async function fetchUsers(limit = 200) {
  const [result, countResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email, phone, role, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('users').select('*', { count: 'exact', head: true }),
  ]);
  if (result.error) throw new Error(mapError(result.error));
  if (countResult.error) throw new Error(mapError(countResult.error));
  return { rows: result.data || [], total: countResult.count ?? 0 };
}

// Role manager only. Mirrors the directory so demotions stay in sync.
export async function setUserRole(userId, role) {
  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new Error(mapError(error));
  return data?.[0] || null;
}

// ------------------------------------------------------------------- tools --

// Tools screen: every booking for the current travel day.
export async function fetchBoardingLog() {
  const { data, error } = await supabase.rpc('dashboard_boarding_log');
  if (error) throw new Error(mapError(error));
  return data || [];
}

// The scanner reuses the inspector verification RPC.
export async function verifyTicketToken(token) {
  const { data, error } = await supabase.rpc('inspector_verify_ticket', {
    p_token: token,
  });
  if (error) throw new Error(mapError(error));
  return data?.[0] || null;
}
