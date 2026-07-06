import { organizations, CPM_URL } from '../api.js';
import { esc, fmtDate, toast } from '../utils.js';

// Nhà thầu là master data do CPM5.0 quản lý (tab "Nhà thầu" trong Google Sheets chung).
// WA chỉ hiển thị — thêm/sửa thực hiện trong CPM5.0.

export async function renderOrganizations(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">🏢 Danh sách Nhà thầu
        <a class="btn btn-primary btn-sm" style="margin-left:auto" target="_blank"
           href="${CPM_URL}/?page=contractors" title="Nhà thầu do CPM5.0 quản lý">✏️ Quản lý trong CPM5.0 ↗</a>
      </div>
      <div class="alert alert-info" style="margin-bottom:12px;font-size:12px">
        Danh sách nhà thầu đồng bộ từ <strong>CPM5.0</strong> (dùng chung Google Sheets).
        Thêm/sửa nhà thầu trong CPM5.0.
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Tên nhà thầu</th><th>Mã số thuế</th><th>Địa chỉ</th><th>Đại diện</th>
          </tr></thead>
          <tbody id="org-tbody"><tr><td colspan="4" style="text-align:center">Đang tải...</td></tr></tbody>
        </table>
      </div>
    </div>`;

  await loadOrgs();
}

async function loadOrgs() {
  const tbody = document.getElementById('org-tbody');
  try {
    const list = await organizations.list();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">🏢</div><p>Chưa có nhà thầu nào — thêm trong CPM5.0</p></div></td></tr>`;
    } else {
      tbody.innerHTML = list.map(o => `
        <tr>
          <td><strong>${esc(o.name)}</strong></td>
          <td>${esc(o.tax_code) || '—'}</td>
          <td>${esc(o.address) || '—'}</td>
          <td>${esc(o.phone) || '—'}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}
