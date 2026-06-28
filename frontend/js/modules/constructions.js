import { projects } from '../api.js';
import { esc, fmtDate, badge, toast, buildOptions } from '../utils.js';

export async function renderConstructions(container) {
  const proj = window._currentProject || {};
  const title = proj.name ? `Gói thầu — ${proj.name}` : 'Gói thầu';

  container.innerHTML = `
    ${proj.id ? `<div class="breadcrumb"><a href="#" onclick="navigate('projects')">Dự án</a> › <strong>${esc(proj.name)}</strong></div>` : ''}
    <div class="card">
      <div class="card-title">🏛️ ${title}
        <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openConstModal()">+ Thêm gói thầu</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Mã GT</th><th>Tên gói thầu</th><th>Loại GT</th>
            <th>Hình thức LCNT</th><th>Giá gói thầu</th><th>Trạng thái</th><th>Hành động</th>
          </tr></thead>
          <tbody id="const-tbody"><tr><td colspan="7" style="text-align:center">Đang tải...</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal-overlay hidden" id="const-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>Thêm gói thầu</h3>
          <button class="modal-close" onclick="closeModal('const-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
              <label>Tên hạng mục *</label>
              <input id="c-name" type="text" placeholder="Tên hạng mục công trình..." />
            </div>
            <div class="form-group">
              <label>Mã gói thầu</label>
              <input id="c-code" type="text" placeholder="VD: GT-001" />
            </div>
            <div class="form-group">
              <label>Loại công trình *</label>
              <input id="c-type" type="text" placeholder="VD: Dân dụng, Giao thông..." />
            </div>
            <div class="form-group">
              <label>Cấp công trình *</label>
              <select id="c-grade">
                <option value="">-- Chọn cấp --</option>
                <option value="I">Cấp I</option>
                <option value="II">Cấp II</option>
                <option value="III">Cấp III</option>
                <option value="IV">Cấp IV</option>
                <option value="V">Cấp V</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ngày khởi công</label>
              <input id="c-start" type="date" />
            </div>
            <div class="form-group">
              <label>Ngày hoàn thành dự kiến</label>
              <input id="c-end" type="date" />
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Tiêu chuẩn kỹ thuật áp dụng</label>
              <textarea id="c-specs" placeholder="TCVN, QCVN áp dụng..."></textarea>
            </div>
          </div>
          <div id="const-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('const-modal')">Hủy</button>
          <button class="btn btn-primary" onclick="saveConstruction()">Lưu</button>
        </div>
      </div>
    </div>`;

  await loadConstructions();
}

async function loadConstructions() {
  const tbody = document.getElementById('const-tbody');
  const proj = window._currentProject || {};
  try {
    const list = proj.id
      ? await projects.listConstructions(proj.id)
      : [];

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
        <td>${esc(c.construction_type) || '—'}</td>
        <td>${esc(c.technical_specs) || '—'}</td>
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

window.openConstModal = function() {
  document.getElementById('const-modal').classList.remove('hidden');
  ['c-name','c-code','c-type','c-start','c-end','c-specs'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  document.getElementById('c-grade').value = '';
  document.getElementById('const-modal-err').style.display = 'none';
};

window.saveConstruction = async function() {
  const errEl = document.getElementById('const-modal-err');
  errEl.style.display = 'none';
  const proj = window._currentProject || {};

  if (!proj.id) {
    errEl.textContent = 'Vui lòng chọn dự án trước';
    errEl.style.display = 'block';
    return;
  }

  const data = {
    project_id: proj.id,
    name: document.getElementById('c-name').value.trim(),
    construction_code: document.getElementById('c-code').value.trim(),
    construction_type: document.getElementById('c-type').value.trim(),
    construction_grade: document.getElementById('c-grade').value,
    technical_specs: document.getElementById('c-specs').value.trim(),
    start_date: document.getElementById('c-start').value,
    expected_end_date: document.getElementById('c-end').value,
  };

  if (!data.name || !data.construction_type || !data.construction_grade) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc (*)';
    errEl.style.display = 'block';
    return;
  }

  try {
    await projects.createConstruction(proj.id, data);
    toast('Thêm gói thầu thành công');
    closeModal('const-modal');
    await loadConstructions();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.viewDossiers = function(cid, cname) {
  window._currentConstruction = { id: cid, name: cname };
  window.navigate('dossiers');
};

window.viewContracts = function(cid, cname) {
  window._currentConstruction = { id: cid, name: cname };
  window.navigate('contracts');
};
