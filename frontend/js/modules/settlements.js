import { settlements, projects, contracts } from '../api.js';
import { esc, fmt, fmtDate, badge, toast } from '../utils.js';

export async function renderSettlements(container) {
  container.innerHTML = `
    <div class="tabs">
      <div class="tab active" onclick="switchSettTab('main',this)">📊 Quyết toán dự án</div>
      <div class="tab" onclick="switchSettTab('warnings',this)">📢 Cảnh báo nhà thầu</div>
      <div class="tab" onclick="switchSettTab('penalty',this)">💸 Phạt chậm nộp</div>
    </div>

    <!-- Tab: Quyết toán -->
    <div id="tab-main" class="page-section active">
      <div class="card">
        <div class="card-title">📊 Danh sách quyết toán
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openSettModal()">+ Lập quyết toán</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Dự án</th><th>Số đề nghị QT</th><th>Số đã kiểm toán</th>
              <th>Số đã phê duyệt</th><th>Deadline</th><th>Trạng thái</th><th>Hành động</th>
            </tr></thead>
            <tbody id="sett-tbody"><tr><td colspan="7" style="text-align:center">Đang tải...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab: Cảnh báo -->
    <div id="tab-warnings" class="page-section">
      <div class="card">
        <div class="card-title">📢 Cảnh báo nhà thầu về quyết toán
          <button class="btn btn-warning btn-sm" style="margin-left:auto" onclick="openWarningModal()">+ Gửi cảnh báo</button>
        </div>
        <div class="alert alert-info" style="margin-bottom:12px">
          Gửi tối đa 3 lần cảnh báo (Mẫu 02-QTDA). Sau 3 lần không phản hồi → lập quyết toán độc lập.
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Hợp đồng</th><th>Lần</th><th>Ngày gửi</th>
              <th>Hạn phản hồi</th><th>Đã giao</th><th>Phản hồi</th><th>Hành động</th>
            </tr></thead>
            <tbody id="warning-tbody"><tr><td colspan="7" style="text-align:center">Đang tải...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab: Phạt -->
    <div id="tab-penalty" class="page-section">
      <div class="card">
        <div class="card-title">💸 Tính phạt chậm nộp quyết toán</div>
        <div class="alert alert-warning" style="margin-bottom:12px">
          Mức phạt: <strong>0,05%/ngày</strong> trên giá trị quyết toán được phê duyệt (theo Nghị định 193/2026/NĐ-CP)
        </div>
        <div class="form-group" style="max-width:300px;margin-bottom:16px">
          <label>Chọn hồ sơ quyết toán</label>
          <select id="penalty-sett-select" onchange="calcPenalty()">
            <option value="">-- Chọn quyết toán --</option>
          </select>
        </div>
        <div id="penalty-result"></div>
      </div>
    </div>

    <!-- Modal: Lập quyết toán -->
    <div class="modal-overlay hidden" id="sett-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>Lập hồ sơ quyết toán</h3>
          <button class="modal-close" onclick="closeModal('sett-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Dự án *</label>
              <select id="sm-project"></select>
            </div>
            <div class="form-group">
              <label>Số tiền đề nghị quyết toán (VNĐ) *</label>
              <input id="sm-amount" type="number" placeholder="0" />
            </div>
            <div class="form-group">
              <label>Deadline nộp quyết toán</label>
              <input id="sm-deadline" type="date" />
            </div>
            <div class="form-group">
              <label>Cơ quan phê duyệt *</label>
              <input id="sm-approver" type="text" placeholder="Mã tổ chức phê duyệt..." />
            </div>
            <div class="form-group">
              <label>Cơ quan thẩm tra *</label>
              <input id="sm-verifier" type="text" placeholder="Mã tổ chức thẩm tra..." />
            </div>
          </div>
          <div id="sett-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('sett-modal')">Hủy</button>
          <button class="btn btn-primary" onclick="saveSettlement()">Lập quyết toán</button>
        </div>
      </div>
    </div>

    <!-- Modal: Cảnh báo -->
    <div class="modal-overlay hidden" id="warning-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>Gửi cảnh báo nhà thầu</h3>
          <button class="modal-close" onclick="closeModal('warning-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Hợp đồng *</label>
              <select id="wm-contract"></select>
            </div>
            <div class="form-group">
              <label>Lần cảnh báo *</label>
              <select id="wm-num">
                <option value="1">Lần 1</option>
                <option value="2">Lần 2</option>
                <option value="3">Lần 3</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ngày gửi *</label>
              <input id="wm-sent" type="date" />
            </div>
            <div class="form-group">
              <label>Hạn phản hồi *</label>
              <input id="wm-deadline" type="date" />
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>URL Mẫu 02-QTDA *</label>
              <input id="wm-url" type="text" placeholder="https://drive.google.com/..." />
            </div>
          </div>
          <div id="warning-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('warning-modal')">Hủy</button>
          <button class="btn btn-warning" onclick="saveWarning()">Gửi cảnh báo</button>
        </div>
      </div>
    </div>`;

  await Promise.all([loadSettlements(), loadWarnings()]);
  await loadFormOptions();
}

let _settList = [];

async function loadSettlements() {
  const tbody = document.getElementById('sett-tbody');
  try {
    _settList = await settlements.list();
    const projs = await projects.list();
    const projMap = Object.fromEntries(projs.map(p => [p.id, p.name]));

    if (!_settList.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📊</div><p>Chưa có hồ sơ quyết toán</p></div></td></tr>`;
    } else {
      tbody.innerHTML = _settList.map(s => `
        <tr>
          <td>${esc(projMap[s.project_id] || s.project_id)}</td>
          <td class="currency">${fmt(s.proposed_settlement_amount)}</td>
          <td class="currency">${fmt(s.audited_amount)}</td>
          <td class="currency">${fmt(s.approved_amount)}</td>
          <td>${fmtDate(s.submission_deadline)}</td>
          <td>${badge(s.status)}</td>
          <td>
            ${s.status === 'PREPARING' ? `<button class="btn btn-primary btn-sm" onclick="auditSettlement('${esc(s.id)}')">🔍 Kiểm toán</button>` : ''}
            ${s.status === 'AUDITED' ? `<button class="btn btn-success btn-sm" onclick="approveSettlement('${esc(s.id)}')">✓ Phê duyệt</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="viewPenalty('${esc(s.id)}')">💸 Phạt</button>
          </td>
        </tr>
      `).join('');
    }

    // Populate penalty select
    const penSel = document.getElementById('penalty-sett-select');
    if (penSel) {
      penSel.innerHTML = `<option value="">-- Chọn quyết toán --</option>` +
        _settList.map(s => `<option value="${esc(s.id)}">${esc(projMap[s.project_id] || s.project_id)} — ${fmt(s.proposed_settlement_amount)}</option>`).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

async function loadWarnings() {
  const tbody = document.getElementById('warning-tbody');
  try {
    const list = await settlements.listWarnings();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📢</div><p>Chưa có cảnh báo nào</p></div></td></tr>`;
    } else {
      tbody.innerHTML = list.map(w => `
        <tr>
          <td>${esc(w.contract_id)}</td>
          <td><strong>Lần ${esc(w.warning_number)}</strong></td>
          <td>${fmtDate(w.sent_date)}</td>
          <td>${fmtDate(w.response_deadline)}</td>
          <td>${w.is_delivered === 'TRUE' || w.is_delivered === true ? '✅' : `<button class="btn btn-secondary btn-sm" onclick="markDelivered('${esc(w.id)}')">Xác nhận giao</button>`}</td>
          <td>${badge(w.contractor_response_status)}</td>
          <td>
            <select onchange="updateResponse('${esc(w.id)}',this.value)" style="padding:4px;border:1px solid var(--border);border-radius:5px;font-size:12px">
              <option value="">Cập nhật...</option>
              <option value="NO_RESPONSE">Chưa phản hồi</option>
              <option value="PARTIAL_RESPONSE">Phản hồi một phần</option>
              <option value="FULL_RESPONSE">Đã phản hồi</option>
            </select>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

async function loadFormOptions() {
  try {
    const projs = await projects.list();
    const smSel = document.getElementById('sm-project');
    if (smSel) smSel.innerHTML = `<option value="">-- Chọn dự án --</option>` +
      projs.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

    const contractList = await contracts.list();
    const wmSel = document.getElementById('wm-contract');
    if (wmSel) wmSel.innerHTML = `<option value="">-- Chọn hợp đồng --</option>` +
      contractList.map(c => `<option value="${esc(c.id)}">${esc(c.contract_number)}</option>`).join('');
  } catch {}
}

window.switchSettTab = function(tab, el) {
  ['main','warnings','penalty'].forEach(t => document.getElementById(`tab-${t}`)?.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  el.classList.add('active');
};

window.openSettModal = function() {
  document.getElementById('sett-modal').classList.remove('hidden');
  ['sm-amount','sm-deadline','sm-approver','sm-verifier'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('sm-project').value = '';
  document.getElementById('sett-modal-err').style.display = 'none';
};

window.saveSettlement = async function() {
  const errEl = document.getElementById('sett-modal-err');
  errEl.style.display = 'none';

  const data = {
    project_id: document.getElementById('sm-project').value,
    proposed_settlement_amount: parseFloat(document.getElementById('sm-amount').value) || 0,
    submission_deadline: document.getElementById('sm-deadline').value,
    approver_org_id: document.getElementById('sm-approver').value.trim(),
    verifier_org_id: document.getElementById('sm-verifier').value.trim(),
  };

  if (!data.project_id || !data.proposed_settlement_amount) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc';
    errEl.style.display = 'block';
    return;
  }

  try {
    await settlements.create(data);
    toast('Lập hồ sơ quyết toán thành công');
    closeModal('sett-modal');
    await loadSettlements();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.auditSettlement = async function(id) {
  const amount = prompt('Nhập số tiền sau kiểm toán (VNĐ):');
  if (!amount) return;
  try {
    await settlements.audit(id, parseFloat(amount));
    toast('Cập nhật kiểm toán thành công');
    await loadSettlements();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.approveSettlement = async function(id) {
  const amount = prompt('Số tiền phê duyệt (VNĐ):');
  if (!amount) return;
  const decNo = prompt('Số quyết định phê duyệt:');
  if (!decNo) return;
  try {
    await settlements.approve(id, parseFloat(amount), decNo);
    toast('Phê duyệt quyết toán thành công');
    await loadSettlements();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.calcPenalty = async function() {
  const id = document.getElementById('penalty-sett-select').value;
  if (!id) return;
  await viewPenalty(id);
};

window.viewPenalty = async function(id) {
  const el = document.getElementById('penalty-result');
  if (!el) {
    switchSettTab('penalty', document.querySelectorAll('.tab')[2]);
    document.getElementById('penalty-sett-select').value = id;
  }
  try {
    const r = await settlements.penalty(id);
    const penaltyEl = document.getElementById('penalty-result');
    if (!penaltyEl) return;

    if (r.overdue_days === 0) {
      penaltyEl.innerHTML = `<div class="alert alert-success">✓ Quyết toán chưa quá hạn. Deadline: ${fmtDate(r.deadline)}</div>`;
    } else {
      penaltyEl.innerHTML = `
        <div class="alert alert-danger">
          <strong>⚠️ Quá hạn ${r.overdue_days} ngày!</strong><br>
          Deadline: ${fmtDate(r.deadline)} | Hôm nay: ${fmtDate(r.today)}
        </div>
        <div class="card">
          <table><tbody>
            <tr><td>Giá trị quyết toán được duyệt</td><td class="currency"><strong>${fmt(r.settlement_amount)}</strong></td></tr>
            <tr><td>Mức phạt</td><td>${r.penalty_rate}</td></tr>
            <tr><td>Số ngày quá hạn</td><td><strong style="color:var(--danger)">${r.overdue_days} ngày</strong></td></tr>
            <tr><td><strong>Tiền phạt chậm nộp</strong></td><td class="currency"><strong style="color:var(--danger);font-size:18px">${fmt(r.penalty_vnd)}</strong></td></tr>
          </tbody></table>
        </div>`;
    }
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.openWarningModal = function() {
  document.getElementById('warning-modal').classList.remove('hidden');
  document.getElementById('warning-modal-err').style.display = 'none';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('wm-sent').value = today;
  // Deadline mặc định 15 ngày sau
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 15);
  document.getElementById('wm-deadline').value = deadline.toISOString().split('T')[0];
};

window.saveWarning = async function() {
  const errEl = document.getElementById('warning-modal-err');
  errEl.style.display = 'none';

  const data = {
    contract_id: document.getElementById('wm-contract').value,
    warning_number: parseInt(document.getElementById('wm-num').value),
    sent_date: document.getElementById('wm-sent').value,
    response_deadline: document.getElementById('wm-deadline').value,
    mau_02_qtda_url: document.getElementById('wm-url').value.trim(),
  };

  if (!data.contract_id || !data.sent_date || !data.response_deadline || !data.mau_02_qtda_url) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc';
    errEl.style.display = 'block';
    return;
  }

  try {
    await settlements.createWarning(data);
    toast(`Đã gửi cảnh báo lần ${data.warning_number} đến nhà thầu`);
    closeModal('warning-modal');
    await loadWarnings();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.markDelivered = async function(id) {
  try {
    await settlements.markDelivered(id);
    toast('Xác nhận đã giao cảnh báo');
    await loadWarnings();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.updateResponse = async function(id, status) {
  if (!status) return;
  try {
    await settlements.updateResponse(id, status);
    toast('Cập nhật phản hồi thành công');
    await loadWarnings();
  } catch (err) {
    toast(err.message, 'error');
  }
};
