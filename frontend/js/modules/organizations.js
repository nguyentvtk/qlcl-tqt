import { organizations } from '../api.js';
import { esc, fmtDate, toast } from '../utils.js';

export async function renderOrganizations(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">🏢 Quản lý tổ chức
        <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openOrgModal()">+ Thêm tổ chức</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Tên tổ chức</th><th>Mã số thuế</th><th>Địa chỉ</th>
            <th>Điện thoại</th><th>Ngày tạo</th><th>Hành động</th>
          </tr></thead>
          <tbody id="org-tbody"><tr><td colspan="6" style="text-align:center">Đang tải...</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="modal-overlay hidden" id="org-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="org-modal-title">Thêm tổ chức</h3>
          <button class="modal-close" onclick="closeModal('org-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
              <label>Tên tổ chức *</label>
              <input id="org-name" type="text" placeholder="Tên đầy đủ của tổ chức..." />
            </div>
            <div class="form-group">
              <label>Mã số thuế</label>
              <input id="org-tax" type="text" placeholder="0123456789" />
            </div>
            <div class="form-group">
              <label>Điện thoại</label>
              <input id="org-phone" type="text" placeholder="0901234567" />
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Địa chỉ</label>
              <textarea id="org-address" placeholder="Địa chỉ trụ sở..."></textarea>
            </div>
          </div>
          <div id="org-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('org-modal')">Hủy</button>
          <button class="btn btn-primary" onclick="saveOrg()">Lưu</button>
        </div>
      </div>
    </div>`;

  await loadOrgs();
}

async function loadOrgs() {
  const tbody = document.getElementById('org-tbody');
  try {
    const list = await organizations.list();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🏢</div><p>Chưa có tổ chức nào</p></div></td></tr>`;
    } else {
      tbody.innerHTML = list.map(o => `
        <tr>
          <td><strong>${esc(o.name)}</strong></td>
          <td>${esc(o.tax_code) || '—'}</td>
          <td>${esc(o.address) || '—'}</td>
          <td>${esc(o.phone) || '—'}</td>
          <td>${fmtDate(o.created_at)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="editOrg('${esc(o.id)}')">✏️ Sửa</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

window.openOrgModal = function(id = null) {
  document.getElementById('org-modal').classList.remove('hidden');
  document.getElementById('org-modal-title').textContent = id ? 'Sửa tổ chức' : 'Thêm tổ chức';
  document.getElementById('org-modal-err').style.display = 'none';
  if (!id) {
    ['org-name','org-tax','org-phone','org-address'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('org-modal').dataset.editId = '';
  }
};

window.editOrg = async function(id) {
  try {
    const o = await organizations.get(id);
    document.getElementById('org-name').value = o.name;
    document.getElementById('org-tax').value = o.tax_code || '';
    document.getElementById('org-phone').value = o.phone || '';
    document.getElementById('org-address').value = o.address || '';
    document.getElementById('org-modal').dataset.editId = id;
    openOrgModal(id);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.saveOrg = async function() {
  const errEl = document.getElementById('org-modal-err');
  errEl.style.display = 'none';
  const editId = document.getElementById('org-modal').dataset.editId;

  const data = {
    name: document.getElementById('org-name').value.trim(),
    tax_code: document.getElementById('org-tax').value.trim() || null,
    phone: document.getElementById('org-phone').value.trim() || null,
    address: document.getElementById('org-address').value.trim() || null,
  };

  if (!data.name) {
    errEl.textContent = 'Tên tổ chức không được trống';
    errEl.style.display = 'block';
    return;
  }

  try {
    if (editId) {
      await organizations.update(editId, data);
      toast('Cập nhật tổ chức thành công');
    } else {
      await organizations.create(data);
      toast('Thêm tổ chức thành công');
    }
    closeModal('org-modal');
    await loadOrgs();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};
