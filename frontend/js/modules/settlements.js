import { settlements, projects, contracts } from '../api.js';
import { esc, fmt, fmtDate, badge, toast } from '../utils.js';

// Map trạng thái từ sheet VN → badge key
const STATUS_QT = {
  'PREPARING': 'PREPARING', 'Đang chuẩn bị': 'PREPARING',
  'AUDITED':   'AUDITED',   'Đã kiểm toán':  'AUDITED',   'Đang thẩm tra': 'AUDITED',
  'APPROVED':  'APPROVED',  'Đã phê duyệt':  'APPROVED',
  'REJECTED':  'REJECTED',  'Từ chối':        'REJECTED',
};

function badgeQT(status) {
  return badge(STATUS_QT[status] || status);
}

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
              <th>Dự án</th>
              <th>Số QT / Tờ trình</th>
              <th>Đề nghị QT</th>
              <th>Đã kiểm toán</th>
              <th>Đã phê duyệt</th>
              <th>Ngày lập</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr></thead>
            <tbody id="sett-tbody"><tr><td colspan="8" style="text-align:center">Đang tải...</td></tr></tbody>
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
          Gửi tối đa <strong>3 lần cảnh báo</strong> (Mẫu 02-QTDA). Sau 3 lần không phản hồi → được lập quyết toán độc lập.
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
        <div class="form-grid" style="max-width:480px;margin-bottom:16px">
          <div class="form-group">
            <label>Chọn hồ sơ quyết toán</label>
            <select id="penalty-sett-select" onchange="calcPenalty()">
              <option value="">-- Chọn quyết toán --</option>
            </select>
          </div>
          <div class="form-group">
            <label>Hoặc nhập Deadline thủ công</label>
            <input type="date" id="penalty-deadline-manual" onchange="calcPenaltyManual()" />
          </div>
          <div class="form-group">
            <label>Giá trị phê duyệt (VNĐ)</label>
            <input type="number" id="penalty-amount-manual" placeholder="0" onchange="calcPenaltyManual()" />
          </div>
        </div>
        <div id="penalty-result"></div>
      </div>
    </div>

    <!-- ─── Modal: Lập quyết toán ─── -->
    <div class="modal-overlay hidden" id="sett-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>📊 Lập hồ sơ quyết toán</h3>
          <button class="modal-close" onclick="closeModal('sett-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Dự án *</label>
              <select id="sm-project" onchange="autoDeadline()"></select>
            </div>
            <div class="form-group">
              <label>Nhóm dự án (để tính deadline)</label>
              <select id="sm-group">
                <option value="">-- Chọn nhóm --</option>
                <option value="C">Nhóm C — 6 tháng</option>
                <option value="B">Nhóm B — 9 tháng</option>
                <option value="A">Nhóm A — 12 tháng</option>
              </select>
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
              <label>Cơ quan phê duyệt</label>
              <input id="sm-approver" type="text" placeholder="VD: Sở Xây dựng tỉnh X..." />
            </div>
            <div class="form-group">
              <label>Cơ quan thẩm tra</label>
              <input id="sm-verifier" type="text" placeholder="VD: Kiểm toán Nhà nước..." />
            </div>
          </div>
          <div id="sett-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('sett-modal')">Hủy</button>
          <button class="btn btn-primary" onclick="saveSettlement()">📊 Lập quyết toán</button>
        </div>
      </div>
    </div>

    <!-- ─── Modal: Kiểm toán ─── -->
    <div class="modal-overlay hidden" id="audit-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>🔍 Kết quả kiểm toán</h3>
          <button class="modal-close" onclick="closeModal('audit-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div id="audit-info" style="background:var(--bg-secondary);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px"></div>
          <div class="form-group">
            <label>Số tiền sau kiểm toán (VNĐ) *</label>
            <input id="audit-amount" type="number" placeholder="0" />
          </div>
          <div id="audit-err" class="alert alert-danger" style="display:none;margin-top:8px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('audit-modal')">Hủy</button>
          <button class="btn btn-primary" onclick="submitAudit()">✓ Xác nhận kiểm toán</button>
        </div>
      </div>
    </div>

    <!-- ─── Modal: Phê duyệt ─── -->
    <div class="modal-overlay hidden" id="approve-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>✓ Phê duyệt quyết toán</h3>
          <button class="modal-close" onclick="closeModal('approve-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div id="approve-info" style="background:var(--bg-secondary);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px"></div>
          <div class="form-grid">
            <div class="form-group">
              <label>Số tiền phê duyệt (VNĐ) *</label>
              <input id="approve-amount" type="number" placeholder="0" />
            </div>
            <div class="form-group">
              <label>Số quyết định phê duyệt *</label>
              <input id="approve-decno" type="text" placeholder="VD: 123/QĐ-UBND" />
            </div>
          </div>
          <div id="approve-err" class="alert alert-danger" style="display:none;margin-top:8px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('approve-modal')">Hủy</button>
          <button class="btn btn-success" onclick="submitApprove()">✓ Phê duyệt</button>
        </div>
      </div>
    </div>

    <!-- ─── Modal: Cảnh báo ─── -->
    <div class="modal-overlay hidden" id="warning-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>📢 Gửi cảnh báo nhà thầu</h3>
          <button class="modal-close" onclick="closeModal('warning-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
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
              <label>URL Mẫu 02-QTDA</label>
              <input id="wm-url" type="text" placeholder="https://drive.google.com/... (tuỳ chọn)" />
            </div>
          </div>
          <div id="warning-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('warning-modal')">Hủy</button>
          <button class="btn btn-warning" onclick="saveWarning()">📢 Gửi cảnh báo</button>
        </div>
      </div>
    </div>`;

  await Promise.all([loadSettlements(), loadWarnings()]);
  await loadFormOptions();
}

// ─── State ────────────────────────────────────────────────────────
let _settList = [];
let _auditId  = null;
let _approveId = null;
let _contractMap = {}; // id → label

// ─── Load dữ liệu ────────────────────────────────────────────────
async function loadSettlements() {
  const tbody = document.getElementById('sett-tbody');
  try {
    _settList = await settlements.list();

    if (!_settList.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📊</div><p>Chưa có hồ sơ quyết toán</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = _settList.map(s => {
      const projLabel = s.project_name
        ? `<div style="font-weight:600;font-size:12px">${esc(s.project_name)}</div><div style="font-size:11px;color:#6b7280">${esc(s.project_id)}</div>`
        : `<div style="font-weight:600;font-size:12px">${esc(s.project_id)}</div>`;

      const maQt = s.settlement_number || s.approved_decision_number || '—';

      const isSheet = !!s.project_name; // Dữ liệu từ sheet có project_name
      const canAudit   = !isSheet && s.status === 'PREPARING';
      const canApprove = !isSheet && s.status === 'AUDITED';

      return `
      <tr>
        <td>${projLabel}</td>
        <td style="font-size:12px">${esc(maQt)}</td>
        <td class="currency">${fmt(s.proposed_settlement_amount)}</td>
        <td class="currency">${s.audited_amount  ? fmt(s.audited_amount)  : '<span style="color:#9ca3af">—</span>'}</td>
        <td class="currency">${s.approved_amount ? fmt(s.approved_amount) : '<span style="color:#9ca3af">—</span>'}</td>
        <td style="font-size:12px">${fmtDate(s.submission_deadline)}</td>
        <td>${badgeQT(s.status)}</td>
        <td style="white-space:nowrap">
          ${canAudit   ? `<button class="btn btn-primary btn-sm" onclick="openAuditModal('${esc(s.id)}')">🔍 Kiểm toán</button> ` : ''}
          ${canApprove ? `<button class="btn btn-success btn-sm" onclick="openApproveModal('${esc(s.id)}')">✓ Phê duyệt</button> ` : ''}
          <button class="btn btn-secondary btn-sm" onclick="viewPenalty('${esc(s.id)}')">💸 Phạt</button>
        </td>
      </tr>`;
    }).join('');

    // Populate penalty select
    const penSel = document.getElementById('penalty-sett-select');
    if (penSel) {
      penSel.innerHTML = `<option value="">-- Chọn quyết toán --</option>` +
        _settList.map(s => `<option value="${esc(s.id)}">${esc(s.project_name || s.project_id)} — ${fmt(s.proposed_settlement_amount)}</option>`).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

async function loadWarnings() {
  const tbody = document.getElementById('warning-tbody');
  try {
    const list = await settlements.listWarnings();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📢</div><p>Chưa có cảnh báo nào</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(w => {
      const contractLabel = _contractMap[w.contract_id] || w.contract_id;
      const today = new Date();
      const deadline = w.response_deadline ? new Date(w.response_deadline) : null;
      const isOverdue = deadline && today > deadline && w.contractor_response_status === 'NO_RESPONSE';
      return `
      <tr${isOverdue ? ' style="background:rgba(239,68,68,0.05)"' : ''}>
        <td style="font-size:12px">${esc(contractLabel)}</td>
        <td><strong>Lần ${esc(String(w.warning_number))}</strong></td>
        <td>${fmtDate(w.sent_date)}</td>
        <td${isOverdue ? ' style="color:var(--danger);font-weight:600"' : ''}>${fmtDate(w.response_deadline)}${isOverdue ? ' ⚠' : ''}</td>
        <td>${w.is_delivered === 'TRUE' || w.is_delivered === true
          ? '<span style="color:var(--success)">✅ Đã giao</span>'
          : `<button class="btn btn-secondary btn-sm" onclick="markDelivered('${esc(w.id)}')">Xác nhận giao</button>`}</td>
        <td>${badge(w.contractor_response_status)}</td>
        <td>
          <select onchange="updateResponse('${esc(w.id)}',this.value)"
            style="padding:4px;border:1px solid var(--border);border-radius:5px;font-size:12px">
            <option value="">Cập nhật...</option>
            <option value="NO_RESPONSE">Chưa phản hồi</option>
            <option value="PARTIAL_RESPONSE">Phản hồi một phần</option>
            <option value="FULL_RESPONSE">Đã phản hồi đầy đủ</option>
          </select>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

async function loadFormOptions() {
  try {
    const [projs, contractList] = await Promise.all([projects.list(), contracts.list()]);

    // Dropdown dự án trong form lập quyết toán
    const smSel = document.getElementById('sm-project');
    if (smSel) smSel.innerHTML = `<option value="">-- Chọn dự án --</option>` +
      projs.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.project_code || p.id)})</option>`).join('');

    // Dropdown hợp đồng trong form cảnh báo — hiển thị đầy đủ thông tin
    _contractMap = {};
    const wmSel = document.getElementById('wm-contract');
    if (wmSel) {
      wmSel.innerHTML = `<option value="">-- Chọn hợp đồng --</option>` +
        contractList.map(c => {
          const label = [
            c.contract_number,
            c.contract_name  ? `– ${c.contract_name}` : '',
            c.project_code   ? `(${c.project_code})` : '',
          ].filter(Boolean).join(' ');
          _contractMap[c.id] = label;
          return `<option value="${esc(c.id)}">${esc(label)}</option>`;
        }).join('');
    }
  } catch {}
}

// ─── Tab switch ───────────────────────────────────────────────────
window.switchSettTab = function(tab, el) {
  ['main','warnings','penalty'].forEach(t => document.getElementById(`tab-${t}`)?.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  el.classList.add('active');
};

// ─── Modal: Lập quyết toán ────────────────────────────────────────
window.openSettModal = function() {
  document.getElementById('sett-modal').classList.remove('hidden');
  ['sm-amount','sm-approver','sm-verifier'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('sm-project').value = '';
  document.getElementById('sm-group').value = '';
  document.getElementById('sm-deadline').value = '';
  document.getElementById('sett-modal-err').style.display = 'none';
};

// Tự tính deadline khi chọn nhóm dự án
window.autoDeadline = function() {
  const group = document.getElementById('sm-group').value;
  if (!group) return;
  const months = { 'C': 6, 'B': 9, 'A': 12 };
  const d = new Date();
  d.setMonth(d.getMonth() + (months[group] || 6));
  document.getElementById('sm-deadline').value = d.toISOString().split('T')[0];
};

window.saveSettlement = async function() {
  const errEl = document.getElementById('sett-modal-err');
  errEl.style.display = 'none';

  const data = {
    project_id: document.getElementById('sm-project').value,
    proposed_settlement_amount: parseFloat(document.getElementById('sm-amount').value) || 0,
    submission_deadline: document.getElementById('sm-deadline').value,
    approver_org_id: document.getElementById('sm-approver').value.trim() || null,
    verifier_org_id: document.getElementById('sm-verifier').value.trim() || null,
    contract_group: document.getElementById('sm-group').value || null,
  };

  if (!data.project_id || !data.proposed_settlement_amount) {
    errEl.textContent = 'Vui lòng chọn dự án và nhập số tiền đề nghị quyết toán';
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

// ─── Modal: Kiểm toán ─────────────────────────────────────────────
window.openAuditModal = function(id) {
  _auditId = id;
  const s = _settList.find(x => x.id === id);
  const infoEl = document.getElementById('audit-info');
  if (infoEl && s) {
    infoEl.innerHTML = `
      <strong>${esc(s.project_name || s.project_id)}</strong><br>
      Số đề nghị QT: <strong>${fmt(s.proposed_settlement_amount)}</strong>
    `;
  }
  document.getElementById('audit-amount').value = s?.proposed_settlement_amount || '';
  document.getElementById('audit-err').style.display = 'none';
  document.getElementById('audit-modal').classList.remove('hidden');
};

window.submitAudit = async function() {
  const errEl = document.getElementById('audit-err');
  const amount = parseFloat(document.getElementById('audit-amount').value);
  if (!amount || amount <= 0) {
    errEl.textContent = 'Vui lòng nhập số tiền hợp lệ';
    errEl.style.display = 'block';
    return;
  }
  try {
    await settlements.audit(_auditId, amount);
    toast('Cập nhật kết quả kiểm toán thành công');
    closeModal('audit-modal');
    await loadSettlements();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

// ─── Modal: Phê duyệt ────────────────────────────────────────────
window.openApproveModal = function(id) {
  _approveId = id;
  const s = _settList.find(x => x.id === id);
  const infoEl = document.getElementById('approve-info');
  if (infoEl && s) {
    infoEl.innerHTML = `
      <strong>${esc(s.project_name || s.project_id)}</strong><br>
      Đề nghị: ${fmt(s.proposed_settlement_amount)} |
      Kiểm toán: <strong>${fmt(s.audited_amount)}</strong>
    `;
  }
  document.getElementById('approve-amount').value = s?.audited_amount || s?.proposed_settlement_amount || '';
  document.getElementById('approve-decno').value = '';
  document.getElementById('approve-err').style.display = 'none';
  document.getElementById('approve-modal').classList.remove('hidden');
};

window.submitApprove = async function() {
  const errEl = document.getElementById('approve-err');
  const amount = parseFloat(document.getElementById('approve-amount').value);
  const decNo  = document.getElementById('approve-decno').value.trim();

  if (!amount || amount <= 0) {
    errEl.textContent = 'Vui lòng nhập số tiền phê duyệt hợp lệ';
    errEl.style.display = 'block';
    return;
  }
  if (!decNo) {
    errEl.textContent = 'Vui lòng nhập số quyết định phê duyệt';
    errEl.style.display = 'block';
    return;
  }
  try {
    await settlements.approve(_approveId, amount, decNo);
    toast('Phê duyệt quyết toán thành công');
    closeModal('approve-modal');
    await loadSettlements();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

// ─── Tab Phạt chậm nộp ───────────────────────────────────────────
window.calcPenalty = async function() {
  const id = document.getElementById('penalty-sett-select').value;
  if (!id) return;
  await viewPenalty(id);
};

window.calcPenaltyManual = function() {
  const deadline = document.getElementById('penalty-deadline-manual').value;
  const amount   = parseFloat(document.getElementById('penalty-amount-manual').value) || 0;
  if (!deadline || !amount) return;
  _renderPenaltyResult({ deadline, amount });
};

window.viewPenalty = async function(id) {
  // Chuyển sang tab phạt
  const penTab = document.querySelectorAll('.tab')[2];
  if (penTab) switchSettTab('penalty', penTab);

  const penSel = document.getElementById('penalty-sett-select');
  if (penSel) penSel.value = id;

  // Thử lấy từ API (chỉ hoạt động với app-created settlements)
  try {
    const r = await settlements.penalty(id);
    _renderPenaltyResult({ deadline: r.deadline, amount: r.settlement_amount, overdue_days: r.overdue_days, penalty_vnd: r.penalty_vnd, today: r.today });
    return;
  } catch (_) {}

  // Fallback: tính client-side từ dữ liệu đã có trong _settList
  const s = _settList.find(x => x.id === id);
  if (!s || !s.submission_deadline) {
    document.getElementById('penalty-result').innerHTML =
      `<div class="alert alert-info">Hồ sơ này chưa có deadline quyết toán. Nhập thủ công bên trên để tính.</div>`;
    if (s) {
      document.getElementById('penalty-amount-manual').value = s.approved_amount || s.proposed_settlement_amount || '';
    }
    return;
  }
  _renderPenaltyResult({ deadline: s.submission_deadline, amount: s.approved_amount || s.proposed_settlement_amount });
};

function _renderPenaltyResult({ deadline, amount, overdue_days, penalty_vnd, today }) {
  const el = document.getElementById('penalty-result');
  if (!el) return;

  const todayDate = today ? new Date(today) : new Date();
  const deadlineDate = new Date(deadline);

  // Xử lý DD/MM/YYYY từ sheet
  let parsedDeadline = deadlineDate;
  if (isNaN(deadlineDate.getTime())) {
    const parts = deadline.split('/');
    if (parts.length === 3) parsedDeadline = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`);
  }

  const overdue = overdue_days !== undefined
    ? overdue_days
    : Math.max(0, Math.floor((todayDate - parsedDeadline) / 86400000));
  const penalty = penalty_vnd !== undefined
    ? penalty_vnd
    : amount * 0.0005 * overdue;

  if (overdue === 0) {
    el.innerHTML = `<div class="alert alert-success">
      ✓ Quyết toán chưa quá hạn.<br>
      Deadline: <strong>${fmtDate(deadline)}</strong>
    </div>`;
  } else {
    el.innerHTML = `
      <div class="alert alert-danger">
        <strong>⚠️ Quá hạn ${overdue} ngày!</strong><br>
        Deadline: ${fmtDate(deadline)} — Hôm nay: ${todayDate.toLocaleDateString('vi-VN')}
      </div>
      <div class="card" style="margin-top:8px">
        <table><tbody>
          <tr><td style="padding:8px 16px">Giá trị quyết toán</td>
              <td class="currency" style="padding:8px 16px"><strong>${fmt(amount)}</strong></td></tr>
          <tr><td style="padding:8px 16px">Mức phạt</td>
              <td style="padding:8px 16px">0,05%/ngày</td></tr>
          <tr><td style="padding:8px 16px">Số ngày quá hạn</td>
              <td style="padding:8px 16px"><strong style="color:var(--danger)">${overdue} ngày</strong></td></tr>
          <tr style="background:rgba(239,68,68,0.07)">
              <td style="padding:12px 16px"><strong>Tiền phạt chậm nộp</strong></td>
              <td class="currency" style="padding:12px 16px">
                <strong style="color:var(--danger);font-size:18px">${fmt(penalty)}</strong>
              </td></tr>
        </tbody></table>
      </div>`;
  }
}

// ─── Modal: Cảnh báo ─────────────────────────────────────────────
window.openWarningModal = function() {
  document.getElementById('warning-modal').classList.remove('hidden');
  document.getElementById('warning-modal-err').style.display = 'none';
  document.getElementById('wm-url').value = '';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('wm-sent').value = today;
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 15);
  document.getElementById('wm-deadline').value = deadline.toISOString().split('T')[0];
};

window.saveWarning = async function() {
  const errEl = document.getElementById('warning-modal-err');
  errEl.style.display = 'none';

  const data = {
    contract_id:       document.getElementById('wm-contract').value,
    warning_number:    parseInt(document.getElementById('wm-num').value),
    sent_date:         document.getElementById('wm-sent').value,
    response_deadline: document.getElementById('wm-deadline').value,
    mau_02_qtda_url:   document.getElementById('wm-url').value.trim() || 'N/A',
  };

  if (!data.contract_id || !data.sent_date || !data.response_deadline) {
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
