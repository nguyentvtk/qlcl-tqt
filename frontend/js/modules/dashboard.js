import { dashboard } from '../api.js';
import { fmt } from '../utils.js';

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="stats-grid" id="stats-grid">
      ${[...Array(4)].map(() => `<div class="stat-card"><div class="stat-value">—</div><div class="stat-label">Đang tải...</div></div>`).join('')}
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
      <div class="stat-card">
        <div class="stat-value">${data.projects_total}</div>
        <div class="stat-label">Dự án</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.constructions_total}</div>
        <div class="stat-label">Hạng mục công trình</div>
      </div>
      <div class="stat-card warning-card">
        <div class="stat-value" style="color:var(--warning)">${data.dossiers_pending}</div>
        <div class="stat-label">Hồ sơ chờ duyệt</div>
      </div>
      <div class="stat-card success-card">
        <div class="stat-value" style="color:var(--success)">${data.dossiers_approved}</div>
        <div class="stat-label">Hồ sơ đã duyệt</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.payments_total}</div>
        <div class="stat-label">Yêu cầu thanh toán</div>
      </div>
      <div class="stat-card danger-card">
        <div class="stat-value" style="color:var(--danger)">${data.warnings_unresponded}</div>
        <div class="stat-label">Cảnh báo chưa phản hồi</div>
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
