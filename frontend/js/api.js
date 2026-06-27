/**
 * API client — tất cả request tới FastAPI backend
 */
const API_BASE = window.location.origin;

let _token = localStorage.getItem('token') || null;

export function setToken(token) {
  _token = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getToken() { return _token; }

async function request(method, path, body = null, isForm = false) {
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const opts = { method, headers };

  if (body !== null) {
    if (isForm) {
      opts.body = body; // FormData
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({ detail: res.statusText }));

  if (!res.ok) {
    const msg = data?.detail || JSON.stringify(data);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);
const postForm = (path, formData) => request('POST', path, formData, true);
const putForm = (path, formData) => request('PUT', path, formData, true);

// ─── Auth ────────────────────────────────────────────────────────
export const auth = {
  login: (email, password) => post('/api/v1/auth/login', { email, password }),
  me: () => get('/api/v1/auth/me'),
};

// ─── Dashboard ───────────────────────────────────────────────────
export const dashboard = {
  get: () => get('/api/v1/dashboard'),
};

// ─── Organizations ────────────────────────────────────────────────
export const organizations = {
  list: () => get('/api/v1/organizations'),
  get: (id) => get(`/api/v1/organizations/${id}`),
  create: (data) => post('/api/v1/organizations', data),
  update: (id, data) => put(`/api/v1/organizations/${id}`, data),
};

// ─── Projects ─────────────────────────────────────────────────────
export const projects = {
  list: () => get('/api/v1/projects'),
  get: (id) => get(`/api/v1/projects/${id}`),
  create: (data) => post('/api/v1/projects', data),
  update: (id, data) => put(`/api/v1/projects/${id}`, data),

  listConstructions: (pid) => get(`/api/v1/projects/${pid}/constructions`),
  createConstruction: (pid, data) => post(`/api/v1/projects/${pid}/constructions`, data),
  getConstruction: (cid) => get(`/api/v1/projects/constructions/${cid}`),

  listParticipants: (pid) => get(`/api/v1/projects/${pid}/participants`),
  addParticipant: (pid, data) => post(`/api/v1/projects/${pid}/participants`, data),
};

// ─── Dossiers ─────────────────────────────────────────────────────
export const dossiers = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/api/v1/dossiers${qs ? '?' + qs : ''}`);
  },
  get: (id) => get(`/api/v1/dossiers/${id}`),
  upload: (formData) => postForm('/api/v1/dossiers', formData),
  action: (id, data) => post(`/api/v1/dossiers/${id}/action`, data),
  history: (id) => get(`/api/v1/dossiers/${id}/history`),
  fileUrl: (id) => `${API_BASE}/api/v1/dossiers/${id}/file`,
  templates: () => get('/api/v1/dossiers/templates'),
  groups: () => get('/api/v1/dossiers/groups'),
  addSignature: (id, data) => post(`/api/v1/dossiers/${id}/signatures`, data),
  signatures: (id) => get(`/api/v1/dossiers/${id}/signatures`),
  stampOverlay: (formData) => postForm('/api/v1/dossiers/as-built-stamp', formData),
};

// ─── Contracts ────────────────────────────────────────────────────
export const contracts = {
  list: (constructionId) => get(`/api/v1/contracts${constructionId ? '?construction_id=' + constructionId : ''}`),
  get: (id) => get(`/api/v1/contracts/${id}`),
  create: (data) => post('/api/v1/contracts', data),
  update: (id, data) => put(`/api/v1/contracts/${id}`, data),

  listPayments: (cid) => get(`/api/v1/contracts/${cid}/payments`),
  createPayment: (cid, data) => post(`/api/v1/contracts/${cid}/payments`, data),
  submitToTreasury: (cid, pid) => put(`/api/v1/contracts/${cid}/payments/${pid}/submit`, {}),
  updateTreasuryStatus: (cid, pid, data) => put(`/api/v1/contracts/${cid}/payments/${pid}/treasury-status`, data),
  slaOverdue: () => get('/api/v1/contracts/payments/sla-overdue'),
};

// ─── Settlements ──────────────────────────────────────────────────
export const settlements = {
  list: (projectId) => get(`/api/v1/settlements${projectId ? '?project_id=' + projectId : ''}`),
  get: (id) => get(`/api/v1/settlements/${id}`),
  create: (data) => post('/api/v1/settlements', data),
  audit: (id, amount) => put(`/api/v1/settlements/${id}/audit?audited_amount=${amount}`, {}),
  approve: (id, amount, decisionNo) => put(
    `/api/v1/settlements/${id}/approve?approved_amount=${amount}&approved_decision_number=${encodeURIComponent(decisionNo)}`, {}
  ),
  penalty: (id) => get(`/api/v1/settlements/${id}/penalty`),

  listWarnings: (contractId) => get(`/api/v1/settlements/warnings${contractId ? '?contract_id=' + contractId : ''}`),
  createWarning: (data) => post('/api/v1/settlements/warnings', data),
  markDelivered: (id) => put(`/api/v1/settlements/warnings/${id}/delivered`, {}),
  updateResponse: (id, status) => put(`/api/v1/settlements/warnings/${id}/response?response_status=${status}`, {}),
  overdueWarnings: () => get('/api/v1/settlements/warnings/overdue'),
};
