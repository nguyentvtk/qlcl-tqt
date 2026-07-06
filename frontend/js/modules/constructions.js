import { projects, CPM_URL } from '../api.js';
import { esc, fmtDate, badge, toast, buildOptions } from '../utils.js';

// Gói thầu là master data do CPM5.0 quản lý — WA chỉ hiển thị.

export async function renderConstructions(container) {
  const proj = window._currentProject || {};
  const title = proj.name ? `Gói thầu — ${proj.name}` : 'Gói thầu';

  container.innerHTML = `
    ${proj.id ? `<div class="breadcrumb"><a href="#" onclick="navigate('projects')">Dự án</a> › <strong>${esc(proj.name)}</strong></div>` : ''}
    <div class="card">
      <div class="card-title">🏛️ ${title}
        <a class="btn btn-primary btn-sm" style="margin-left:auto" target="_blank"
           href="${CPM_URL}/?page=projects" title="Gói thầu do CPM5.0 quản lý">✏️ Quản lý trong CPM5.0 ↗</a>
      </div>
      <div class="alert alert-info" style="margin-bottom:12px;font-size:12px">
        Gói thầu đồng bộ từ <strong>CPM5.0</strong> (dùng chung Google Sheets). Thêm/sửa gói thầu trong CPM5.0.
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Mã GT</th><th>Tên gói thầu</th><th>Mã DA</th>
            <th>Loại GT</th><th>Giá gói thầu</th><th>Trạng thái</th><th>Hành động</th>
          </tr></thead>
          <tbody id="const-tbody"><tr><td colspan="7" style="text-align:center">Đang tải...</td></tr></tbody>
        </table>
      </div>
    </div>

    `;

  await loadConstructions();
}

async function loadConstructions() {
  const tbody = document.getElementById('const-tbody');
  const proj = window._currentProject || {};
  try {
    const list = proj.id
      ? await projects.listConstructions(proj.id)
      : await projects.listAllConstructions();

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🏛️</div><p>Chưa có gói thầu nào${proj.id ? ' cho dự án này' : ''}</p></div></td></tr>`;
      return;
    }

    const STATUS_GT = {
      'Đang thực hiện': 'background:#d1fae5;color:#065f46',
      'Hoàn thành':     'background:#dbeafe;color:#1e40af',
      'Tạm ngưng':      'background:#fef3c7;color:#92400e',
      'Chưa triển khai':'background:#e5e7eb;color:#374151',
    };
    tbody.innerHTML = list.map(c => {
      const stStyle = STATUS_GT[c.status] || 'background:#e5e7eb;color:#374151';
      const stLabel = c.status || '—';
      return `
      <tr>
        <td><strong>${esc(c.construction_code) || '—'}</strong></td>
        <td>${esc(c.name)}</td>
        <td><span style="font-size:12px;color:#6b7280">${esc(c.project_id) || '—'}</span></td>
        <td>${esc(c.construction_type) || '—'}</td>
        <td style="text-align:right">${esc(c.contract_value) || '—'}</td>
        <td><span style="padding:2px 8px;border-radius:12px;font-size:12px;${stStyle}">${esc(stLabel)}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="viewDossiers('${esc(c.id)}','${esc(c.name)}')">📁 Hồ sơ</button>
          <button class="btn btn-secondary btn-sm" onclick="viewContracts('${esc(c.id)}','${esc(c.name)}')">📄 HĐ</button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

window.viewDossiers = function(cid, cname) {
  window._currentConstruction = { id: cid, name: cname };
  window.navigate('dossiers');
};

window.viewContracts = function(cid, cname) {
  window._currentConstruction = { id: cid, name: cname };
  window.navigate('contracts');
};
