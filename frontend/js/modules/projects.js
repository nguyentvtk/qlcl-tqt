import { projects, cpm, CPM_URL } from '../api.js';
import { esc, fmt, fmtDate, badge, toast } from '../utils.js';

// Dữ liệu Dự án là master data do CPM5.0 quản lý (cùng Google Sheets).
// WA chỉ hiển thị — thêm/sửa thực hiện trong CPM5.0 để tránh dữ liệu phân mảnh.

export async function renderProjects(container, _params) {
  container.innerHTML = `<div class="card">
    <div class="card-title">🏗️ Danh sách dự án
      <a class="btn btn-primary btn-sm" style="margin-left:auto" target="_blank"
         href="${CPM_URL}/?page=projects" title="Dữ liệu dự án do CPM5.0 quản lý">
        ✏️ Quản lý trong CPM5.0 ↗
      </a>
    </div>
    <div class="alert alert-info" style="margin-bottom:12px;font-size:12px">
      Dữ liệu dự án đồng bộ trực tiếp từ hệ thống <strong>CPM5.0</strong> (dùng chung Google Sheets).
      Để thêm/sửa dự án, dùng nút "Quản lý trong CPM5.0".
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Mã DA</th><th>Tên dự án</th><th>Loại DA</th>
          <th>Trạng thái</th><th>Tổng mức ĐT</th><th>Hành động</th>
        </tr></thead>
        <tbody id="project-tbody"><tr><td colspan="6" style="text-align:center">Đang tải...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Modal: Nhiệm vụ CPM5.0 của dự án -->
  <div class="modal-overlay hidden" id="cpm-tasks-modal">
    <div class="modal" style="max-width:820px;width:95%">
      <div class="modal-header">
        <h3>📋 Nhiệm vụ (CPM5.0) <span id="cpm-tasks-title" style="font-weight:400;font-size:13px;color:#6b7280"></span></h3>
        <button class="modal-close" onclick="closeModal('cpm-tasks-modal')">✕</button>
      </div>
      <div class="modal-body" id="cpm-tasks-body" style="max-height:65vh;overflow-y:auto">Đang tải...</div>
      <div class="modal-footer">
        <a class="btn btn-primary" target="_blank" href="${CPM_URL}/?page=tasks">✏️ Quản lý nhiệm vụ trong CPM5.0 ↗</a>
        <button class="btn btn-secondary" onclick="closeModal('cpm-tasks-modal')">Đóng</button>
      </div>
    </div>
  </div>`;

  await loadProjects();
}

async function loadProjects() {
  const tbody = document.getElementById('project-tbody');
  try {
    const list = await projects.list();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🏗️</div><p>Chưa có dự án nào — thêm dự án trong CPM5.0</p></div></td></tr>`;
      return;
    }
    const STATUS_BADGE = {
      'Đang thực hiện': 'background:#d1fae5;color:#065f46',
      'Tạm ngưng':      'background:#fef3c7;color:#92400e',
      'Tạm dừng':       'background:#fef3c7;color:#92400e',
      'Chưa triển khai':'background:#e5e7eb;color:#374151',
      'Hoàn thành':     'background:#dbeafe;color:#1e40af',
    };
    tbody.innerHTML = list.map(p => {
      const st = p.status || '';
      const stStyle = STATUS_BADGE[st] || 'background:#e5e7eb;color:#374151';
      const inv = p.total_investment ? Number(String(p.total_investment).replace(/[^0-9]/g,'')).toLocaleString('vi-VN') + ' đ' : '—';
      return `
      <tr>
        <td><strong>${esc(p.project_code)}</strong></td>
        <td>${esc(p.name)}</td>
        <td>${esc(p.project_type) || '—'}</td>
        <td>${st ? `<span style="padding:2px 8px;border-radius:4px;font-size:12px;${stStyle}">${esc(st)}</span>` : '—'}</td>
        <td style="white-space:nowrap">${inv}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="viewConstructions('${esc(p.id)}','${esc(p.name)}')">📋 Gói thầu</button>
          <button class="btn btn-secondary btn-sm" onclick="viewCpmTasks('${esc(p.id)}','${esc(p.name)}')">🗒 Nhiệm vụ</button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

window.viewConstructions = function(projectId, projectName) {
  window._currentProject = { id: projectId, name: projectName };
  window.navigate('constructions');
};

// ─── Nhiệm vụ CPM5.0 của dự án ───────────────────────────────────
const TASK_STATUS_STYLE = {
  'Hoàn thành':    'background:#dcfce7;color:#15803d',
  'Đang làm':      'background:#dbeafe;color:#1e40af',
  'Chưa bắt đầu':  'background:#e5e7eb;color:#374151',
  'Trễ':           'background:#fee2e2;color:#b91c1c',
};
const PRIORITY_STYLE = {
  'Khẩn cấp':   'color:#b91c1c;font-weight:700',
  'Cao':        'color:#c2410c;font-weight:600',
  'Trung bình': 'color:#374151',
  'Thấp':       'color:#6b7280',
};

window.viewCpmTasks = async function(projectId, projectName) {
  document.getElementById('cpm-tasks-modal').classList.remove('hidden');
  document.getElementById('cpm-tasks-title').textContent = `— ${projectName}`;
  const body = document.getElementById('cpm-tasks-body');
  body.innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280">⏳ Đang tải nhiệm vụ từ CPM5.0...</div>';

  try {
    const tasks = await cpm.tasks(projectId);
    if (!tasks.length) {
      body.innerHTML = `<div class="empty-state"><div class="icon">🗒</div><p>Dự án chưa có nhiệm vụ nào trong CPM5.0</p></div>`;
      return;
    }
    const done = tasks.filter(t => t.status === 'Hoàn thành').length;
    body.innerHTML = `
      <div style="font-size:13px;margin-bottom:10px">
        Tổng <strong>${tasks.length}</strong> nhiệm vụ — hoàn thành <strong>${done}</strong>
        (${Math.round(done / tasks.length * 100)}%)
      </div>
      <div class="table-wrapper"><table>
        <thead><tr><th>Nhiệm vụ</th><th>Nhóm</th><th>Người thực hiện</th><th>Ưu tiên</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead>
        <tbody>${tasks.map(t => `
          <tr>
            <td style="font-size:12px"><strong>${esc(t.id)}</strong>${t.name ? ` — ${esc(t.name)}` : ''}</td>
            <td style="font-size:12px">${esc(t.group) || '—'}</td>
            <td style="font-size:12px">${esc(t.assignee) || '—'}</td>
            <td style="font-size:12px"><span style="${PRIORITY_STYLE[t.priority] || ''}">${esc(t.priority) || '—'}</span></td>
            <td style="min-width:110px">
              <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden">
                <div style="width:${Math.min(100, t.progress || 0)}%;height:100%;background:${(t.progress || 0) >= 100 ? '#16a34a' : '#2563eb'}"></div>
              </div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px">${t.progress || 0}%</div>
            </td>
            <td><span style="padding:2px 8px;border-radius:12px;font-size:11px;${TASK_STATUS_STYLE[t.status] || 'background:#e5e7eb;color:#374151'}">${esc(t.status) || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">Không tải được nhiệm vụ: ${esc(err.message)}</div>`;
  }
};
