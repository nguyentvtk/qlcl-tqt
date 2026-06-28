import { dashboard } from '../api.js';
import { fmt } from '../utils.js';

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="stats-grid" id="stats-grid">
      ${[...Array(8)].map(() => `<div class="stat-card"><div class="stat-value">—</div><div class="stat-label">Đang tải...</div></div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-title">📋 Hồ sơ chờ duyệt</div>
        <div id="pending-list">Đang tải...</div>
      </div>
      <div class="card">
        <div class="card-title">⚠️ Cảnh báo SLA & Quyết toán</div>
        <div id="alert-list">Đang tải...</div>
      </div>
    </div>
  `;

  try {
    const data = await dashboard.get();

    document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card" style="cursor:pointer" onclick="navigate('projects')">
        <div class="stat-value">${data.projects_total ?? 0}</div>
        <div class="stat-label">📁 Dự án</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigate('constructions')">
        <div class="stat-value">${data.constructions_total ?? 0}</div>
        <div class="stat-label">🏛️ Gói thầu</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigate('contracts')">
        <div class="stat-value">${data.contracts_total ?? 0}</div>
        <div class="stat-label">💰 Hợp đồng <small style="font-size:11px;color:var(--success)">${data.contracts_active ?? 0} đang hiệu lực</small></div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigate('organizations')">
        <div class="stat-value">${data.organizations_total ?? 0}</div>
        <div class="stat-label">🏢 Nhà thầu</div>
      </div>
      <div class="stat-card warning-card" style="cursor:pointer" onclick="navigate('dossiers')">
        <div class="stat-value" style="color:var(--warning)">${data.dossiers_pending ?? 0}</div>
        <div class="stat-label">📁 Nghiệm thu chờ duyệt</div>
      </div>
      <div class="stat-card success-card">
        <div class="stat-value" style="color:var(--success)">${data.dossiers_approved ?? 0}</div>
        <div class="stat-label">✅ Nghiệm thu đã duyệt</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigate('settlements')">
        <div class="stat-value">${data.settlements_total ?? 0}</div>
        <div class="stat-label">📋 Quyết toán</div>
      </div>
      <div class="stat-card danger-card">
        <div class="stat-value" style="color:var(--danger)">${data.warnings_unresponded ?? 0}</div>
        <div class="stat-label">⚠️ Cảnh báo tồn đọng</div>
      </div>
    `;

    document.getElementById('pending-list').innerHTML = data.dossiers_pending > 0
      ? `<div class="alert alert-warning">Có <strong>${data.dossiers_pending}</strong> hồ sơ đang chờ phê duyệt.</div>
         <a href="#" onclick="navigate('dossiers','status=PENDING')" class="btn btn-warning btn-sm">Xem hồ sơ chờ duyệt →</a>`
      : `<div class="alert alert-success">✓ Không có hồ sơ nào chờ duyệt.</div>`;

    document.getElementById('alert-list').innerHTML = data.warnings_unresponded > 0
      ? `<div class="alert alert-danger">⚠️ <strong>${data.warnings_unresponded}</strong> cảnh báo nhà thầu chưa được phản hồi.</div>
         <a href="#" onclick="navigate('settlements')" class="btn btn-danger btn-sm">Xem cảnh báo →</a>`
      : `<div class="alert alert-success">✓ Không có cảnh báo nào tồn đọng.</div>`;

  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">Lỗi tải dashboard: ${err.message}</div>`;
  }
}
