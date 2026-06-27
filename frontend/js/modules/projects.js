import { projects, organizations } from '../api.js';
import { esc, fmt, fmtDate, badge, toast, buildOptions } from '../utils.js';

export async function renderProjects(container, _params) {
  container.innerHTML = `<div class="card">
    <div class="card-title">🏗️ Danh sách dự án
      <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openProjectModal()">+ Thêm dự án</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Mã DA</th><th>Tên dự án</th><th>Địa điểm</th>
          <th>Quyết định đầu tư</th><th>Ngày tạo</th><th>Hành động</th>
        </tr></thead>
        <tbody id="project-tbody"><tr><td colspan="6" style="text-align:center">Đang tải...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Modal thêm/sửa dự án -->
  <div class="modal-overlay hidden" id="project-modal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="project-modal-title">Thêm dự án mới</h3>
        <button class="modal-close" onclick="closeModal('project-modal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label>Tên dự án *</label>
            <input id="p-name" type="text" placeholder="Tên dự án đầu tư xây dựng..." />
          </div>
          <div class="form-group">
            <label>Mã dự án *</label>
            <input id="p-code" type="text" placeholder="VD: DA-2026-001" />
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Địa điểm *</label>
            <input id="p-location" type="text" placeholder="Địa điểm xây dựng..." />
          </div>
          <div class="form-group">
            <label>Chủ đầu tư *</label>
            <select id="p-owner"></select>
          </div>
          <div class="form-group">
            <label>Số quyết định đầu tư</label>
            <input id="p-decision" type="text" placeholder="VD: 123/QĐ-UBND" />
          </div>
        </div>
        <div id="project-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('project-modal')">Hủy</button>
        <button class="btn btn-primary" onclick="saveProject()">Lưu dự án</button>
      </div>
    </div>
  </div>`;

  await loadProjects();
  await loadOrgOptions();
}

async function loadProjects() {
  const tbody = document.getElementById('project-tbody');
  try {
    const list = await projects.list();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🏗️</div><p>Chưa có dự án nào</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(p => `
      <tr>
        <td><strong>${esc(p.project_code)}</strong></td>
        <td>${esc(p.name)}</td>
        <td>${esc(p.location)}</td>
        <td>${esc(p.investment_decision_number) || '—'}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="viewConstructions('${esc(p.id)}','${esc(p.name)}')">📋 Hạng mục</button>
          <button class="btn btn-secondary btn-sm" onclick="editProject('${esc(p.id)}')">✏️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

async function loadOrgOptions() {
  try {
    const orgs = await organizations.list();
    const sel = document.getElementById('p-owner');
    if (sel) sel.innerHTML = `<option value="">-- Chọn chủ đầu tư --</option>` + buildOptions(orgs, 'id', 'name');
  } catch {}
}

window.openProjectModal = function(id = null) {
  document.getElementById('project-modal').classList.remove('hidden');
  document.getElementById('project-modal-title').textContent = id ? 'Sửa dự án' : 'Thêm dự án mới';
  document.getElementById('project-modal-err').style.display = 'none';
  if (!id) {
    ['p-name','p-code','p-location','p-decision'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('p-owner').value = '';
    document.getElementById('project-modal').dataset.editId = '';
  }
};

window.editProject = async function(id) {
  try {
    const p = await projects.get(id);
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-code').value = p.project_code;
    document.getElementById('p-location').value = p.location;
    document.getElementById('p-owner').value = p.owner_id;
    document.getElementById('p-decision').value = p.investment_decision_number || '';
    document.getElementById('project-modal').dataset.editId = id;
    openProjectModal(id);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.saveProject = async function() {
  const errEl = document.getElementById('project-modal-err');
  errEl.style.display = 'none';
  const editId = document.getElementById('project-modal').dataset.editId;

  const data = {
    name: document.getElementById('p-name').value.trim(),
    project_code: document.getElementById('p-code').value.trim(),
    location: document.getElementById('p-location').value.trim(),
    owner_id: document.getElementById('p-owner').value,
    investment_decision_number: document.getElementById('p-decision').value.trim(),
  };

  if (!data.name || !data.project_code || !data.location || !data.owner_id) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc (*)';
    errEl.style.display = 'block';
    return;
  }

  try {
    if (editId) {
      await projects.update(editId, data);
      toast('Cập nhật dự án thành công');
    } else {
      await projects.create(data);
      toast('Thêm dự án thành công');
    }
    closeModal('project-modal');
    await loadProjects();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.viewConstructions = function(projectId, projectName) {
  window._currentProject = { id: projectId, name: projectName };
  window.navigate('constructions');
};
