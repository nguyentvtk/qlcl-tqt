/**
 * Utility functions
 */

/** Format VNĐ */
export function fmt(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('vi-VN') + ' ₫';
}

/** Format date — hỗ trợ DD/MM/YYYY (Google Sheets) và ISO */
export function fmtDate(s) {
  if (!s || s === 'None' || s === 'null') return '—';
  const str = String(s).trim();
  // Định dạng DD/MM/YYYY hoặc D/M/YYYY từ Google Sheets → trả về nguyên
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str;
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('vi-VN');
  } catch { return str; }
}

/** Format datetime */
export function fmtDateTime(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('vi-VN');
  } catch { return s; }
}

/** Status badge */
export function badge(status) {
  const map = {
    PENDING:          ['badge-pending',   'Chờ duyệt'],
    APPROVED:         ['badge-approved',  'Đã duyệt'],
    REJECTED:         ['badge-rejected',  'Từ chối'],
    DRAFT:            ['badge-draft',     'Nháp'],
    SUBMITTED:        ['badge-submitted', 'Đã nộp'],
    ACTIVE:           ['badge-active',    'Hoạt động'],
    NOT_SENT:         ['badge-draft',     'Chưa nộp KBNN'],
    SENT:             ['badge-submitted', 'Đã nộp KBNN'],
    PROCESSING:       ['badge-pending',   'KBNN đang xử lý'],
    TREASURY_APPROVED:['badge-approved',  'KBNN đã duyệt'],
    TREASURY_REJECTED:['badge-rejected',  'KBNN từ chối'],
    PREPARING:        ['badge-draft',     'Đang chuẩn bị'],
    AUDITED:          ['badge-pending',   'Đã kiểm toán'],
    NO_RESPONSE:      ['badge-rejected',  'Chưa phản hồi'],
    PARTIAL_RESPONSE: ['badge-pending',   'Phản hồi một phần'],
    FULL_RESPONSE:    ['badge-approved',  'Đã phản hồi'],
  };
  const [cls, label] = map[status] || ['badge-draft', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

/** Show toast notification */
export function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : '⚠'}</span>${message}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/** SLA status indicator */
export function slaStatus(deadlineStr) {
  if (!deadlineStr) return '';
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffH = (deadline - now) / 36e5;
  if (diffH < 0) return `<span class="sla-overdue">⏰ Quá hạn ${Math.abs(diffH).toFixed(0)}h</span>`;
  if (diffH < 4) return `<span class="sla-warning">⚠ Còn ${diffH.toFixed(1)}h</span>`;
  return `<span class="sla-ok">✓ Còn ${diffH.toFixed(0)}h</span>`;
}

/** Escape HTML to prevent XSS */
export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Role label in Vietnamese */
export function roleLabel(role) {
  const map = {
    PROJECT_MANAGEMENT: 'Ban QLDA',
    SURVEY_CONTRACTOR: 'Nhà thầu KS',
    DESIGN_CONTRACTOR: 'Nhà thầu TK',
    CONSTRUCTION_CONTRACTOR: 'Nhà thầu TC',
    SUPERVISION_CONTRACTOR: 'Nhà thầu TVGS',
    EPC_CONTRACTOR: 'Nhà thầu EPC',
  };
  return map[role] || role;
}

/** Build HTML select options from array */
export function buildOptions(arr, valueKey, labelKey, selected = '') {
  return arr.map(item =>
    `<option value="${esc(item[valueKey])}" ${item[valueKey] == selected ? 'selected' : ''}>${esc(item[labelKey])}</option>`
  ).join('');
}
