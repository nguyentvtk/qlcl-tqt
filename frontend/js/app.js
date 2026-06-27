/**
 * Main SPA entry point
 */
import { auth, setToken, getToken } from './api.js';
import { toast } from './utils.js';

import { renderDashboard } from './modules/dashboard.js';
import { renderOrganizations } from './modules/organizations.js';
import { renderProjects } from './modules/projects.js';
import { renderConstructions } from './modules/constructions.js';
import { renderDossiers } from './modules/dossiers.js';
import { renderContracts } from './modules/contracts.js';
import { renderSettlements } from './modules/settlements.js';

const PAGES = {
  dashboard:     { title: 'Dashboard', icon: '📊', render: renderDashboard },
  organizations: { title: 'Tổ chức', icon: '🏢', render: renderOrganizations },
  projects:      { title: 'Dự án', icon: '🏗️', render: renderProjects },
  constructions: { title: 'Hạng mục công trình', icon: '🏛️', render: renderConstructions },
  dossiers:      { title: 'Hồ sơ & Nghiệm thu', icon: '📁', render: renderDossiers },
  contracts:     { title: 'Hợp đồng & Thanh toán', icon: '💰', render: renderContracts },
  settlements:   { title: 'Quyết toán', icon: '📋', render: renderSettlements },
};

let _currentUser = null;

// ─── Auth ────────────────────────────────────────────────────────
async function tryAutoLogin() {
  const token = getToken();
  if (!token) return false;
  try {
    _currentUser = await auth.me();
    return true;
  } catch {
    setToken(null);
    return false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-err');
  const btn = document.getElementById('login-btn');

  errEl.style.display = 'none';
  btn.innerHTML = '<span class="spinner"></span> Đang đăng nhập...';
  btn.disabled = true;

  try {
    const res = await auth.login(email, password);
    setToken(res.access_token);
    _currentUser = res.user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.innerHTML = 'Đăng nhập';
    btn.disabled = false;
  }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  updateUserDisplay();
  navigate('dashboard');
}

function updateUserDisplay() {
  if (!_currentUser) return;
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = _currentUser.full_name;
  if (roleEl) roleEl.textContent = _ROLE_LABELS[_currentUser.role] || _currentUser.role;
  if (avatarEl) avatarEl.textContent = (_currentUser.full_name || 'U')[0].toUpperCase();
}

// ─── Navigation ──────────────────────────────────────────────────
window.navigate = function(page, _params = null) {
  const def = PAGES[page];
  if (!def) return;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update topbar title
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = `${def.icon} ${def.title}`;

  // Render page
  const content = document.getElementById('main-content');
  def.render(content, _params);
};

window.closeModal = function(id) {
  document.getElementById(id)?.classList.add('hidden');
};

window.logout = function() {
  setToken(null);
  _currentUser = null;
  document.getElementById('auth-screen').style.display = '';
  document.getElementById('app').classList.add('hidden');
};

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Login form
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);

  // Nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Try auto login from stored token
  const loggedIn = await tryAutoLogin();
  if (loggedIn) {
    showApp();
  }
});

const _ROLE_LABELS = {
  PROJECT_MANAGEMENT: 'Ban QLDA',
  SURVEY_CONTRACTOR: 'Nhà thầu Khảo sát',
  DESIGN_CONTRACTOR: 'Nhà thầu Thiết kế',
  CONSTRUCTION_CONTRACTOR: 'Nhà thầu Thi công',
  SUPERVISION_CONTRACTOR: 'Tư vấn Giám sát',
  EPC_CONTRACTOR: 'Nhà thầu EPC',
};
