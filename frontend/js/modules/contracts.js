import { contracts } from '../api.js';
import { esc, fmt, fmtDate, fmtDateTime, badge, toast, slaStatus, buildOptions } from '../utils.js';

export async function renderContracts(container) {
  const construction = window._currentConstruction || {};

  container.innerHTML = `
    ${construction.id ? `<div class="breadcrumb"><a href="#" onclick="navigate('constructions')">Hạng mục</a> › <strong>${esc(construction.name)}</strong></div>` : ''}
    <div class="tabs">
      <div class="tab active" onclick="switchContractTab('contracts',this)">📄 Hợp đồng</div>
      <div class="tab" onclick="switchContractTab('payments',this)">💰 Thanh toán</div>
      <div class="tab" onclick="switchContractTab('sla',this)">⏰ SLA KBNN</div>
    </div>

    <!-- Tab: Hợp đồng -->
    <div id="tab-contracts" class="page-section active">
      <div class="card">
        <div class="card-title">📄 Danh sách hợp đồng
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openContractModal()">+ Thêm HĐ</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Số HĐ</th><th>Ngày ký</th><th>Giá trị HĐ</th>
              <th>Tạm ứng %</th><th>Giảm trừ %</th><th>Trạng thái</th><th>Hành động</th>
            </tr></thead>
            <tbody id="contract-tbody"><tr><td colspan="7" style="text-align:center">Đang tải...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab: Thanh toán -->
    <div id="tab-payments" class="page-section">
      <div class="card">
        <div class="card-title">💰 Yêu cầu thanh toán
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openPaymentModal()">+ Lập YC thanh toán</button>
        </div>
        <div class="form-group" style="max-width:300px;margin-bottom:16px">
          <label>Chọn hợp đồng</label>
          <select id="payment-contract-filter" onchange="loadPayments()">
            <option value="">-- Chọn hợp đồng --</option>
          </select>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Kỳ TT</th><th>Loại</th><th>Số tiền đề nghị</th>
              <th>Thu hồi TU</th><th>Trạng thái nội bộ</th><th>Trạng thái KBNN</th>
              <th>SLA KBNN</th><th>Hành động</th>
            </tr></thead>
            <tbody id="payment-tbody"><tr><td colspan="8" style="text-align:center">Chọn hợp đồng để xem</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Form tạo YC thanh toán -->
      <div class="modal-overlay hidden" id="payment-modal">
        <div class="modal">
          <div class="modal-header">
            <h3>Lập yêu cầu thanh toán</h3>
            <button class="modal-close" onclick="closeModal('payment-modal')">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Hợp đồng *</label>
                <select id="pm-contract"></select>
              </div>
              <div class="form-group">
                <label>Kỳ thanh toán *</label>
                <input id="pm-period" type="text" placeholder="VD: Tháng 6/2026" />
              </div>
              <div class="form-group">
                <label>Loại đề nghị *</label>
                <select id="pm-type">
                  <option value="">-- Chọn loại --</option>
                  <option value="ADVANCE">Tạm ứng</option>
                  <option value="VOLUME_PAYMENT">Thanh toán khối lượng</option>
                  <option value="RECOVERY">Thu hồi tạm ứng</option>
                </select>
              </div>
              <div class="form-group">
                <label>Số tiền đề nghị (VNĐ) *</label>
                <input id="pm-amount" type="number" placeholder="0" />
              </div>
              <div class="form-group">
                <label>Thu hồi tạm ứng (VNĐ)</label>
                <input id="pm-recovery" type="number" placeholder="0" />
              </div>
              <div class="form-group">
                <label>URL Mẫu 03A (bảng kê)</label>
                <input id="pm-03a" type="text" placeholder="https://..." />
              </div>
              <div class="form-group">
                <label>URL Mẫu 04A (đề nghị TT)</label>
                <input id="pm-04a" type="text" placeholder="https://..." />
              </div>
              <div class="form-group">
                <label>URL Mẫu 09 QLDA</label>
                <input id="pm-09" type="text" placeholder="https://..." />
              </div>
            </div>
            <div id="payment-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('payment-modal')">Hủy</button>
            <button class="btn btn-primary" onclick="savePayment()">Lưu</button>
          </div>
        </div>
      </div>

      <!-- Modal: Cập nhật trạng thái KBNN -->
      <div class="modal-overlay hidden" id="treasury-modal">
        <div class="modal">
          <div class="modal-header">
            <h3>Cập nhật phản hồi KBNN</h3>
            <button class="modal-close" onclick="closeModal('treasury-modal')">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group" style="grid-column:1/-1">
                <label>Kết quả KBNN *</label>
                <select id="ts-status">
                  <option value="PROCESSING">Đang xử lý</option>
                  <option value="APPROVED">Đã duyệt chi</option>
                  <option value="REJECTED">Từ chối</option>
                </select>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Lý do (nếu từ chối)</label>
                <textarea id="ts-reason" placeholder="Lý do từ chối của KBNN..."></textarea>
              </div>
            </div>
            <div id="treasury-modal-err" class="alert alert-danger" style="display:none;margin-top:8px"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('treasury-modal')">Hủy</button>
            <button class="btn btn-primary" onclick="saveTreasuryStatus()">Lưu</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: SLA -->
    <div id="tab-sla" class="page-section">
      <div class="card">
        <div class="card-title">⏰ Hồ sơ quá hạn SLA KBNN</div>
        <div id="sla-list">Đang tải...</div>
      </div>
    </div>

    <!-- Modal: Thêm HĐ -->
    <div class="modal-overlay hidden" id="contract-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>Thêm hợp đồng</h3>
          <button class="modal-close" onclick="closeModal('contract-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Số hợp đồng *</label>
              <input id="ct-number" type="text" placeholder="VD: HĐ-TC-001/2026" />
            </div>
            <div class="form-group">
              <label>Ngày ký *</label>
              <input id="ct-sign" type="date" />
            </div>
            <div class="form-group">
              <label>Giá trị HĐ (VNĐ) *</label>
              <input id="ct-value" type="number" placeholder="0" />
            </div>
            <div class="form-group">
              <label>Tỷ lệ tạm ứng (%)</label>
              <input id="ct-advance-pct" type="number" placeholder="30" min="0" max="100" />
            </div>
            <div class="form-group">
              <label>Tỷ lệ giảm trừ bảo hành (%)</label>
              <input id="ct-retention-pct" type="number" placeholder="5" min="0" max="100" />
            </div>
            <div class="form-group">
              <label>Số tài khoản bảo hành</label>
              <input id="ct-retention-acc" type="text" placeholder="..." />
            </div>
          </div>
          <div id="contract-modal-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('contract-modal')">Hủy</button>
          <button class="btn btn-primary" onclick="saveContract()">Lưu</button>
        </div>
      </div>
    </div>`;

  await loadContracts();
}

let _contractList = [];

async function loadContracts() {
  const tbody = document.getElementById('contract-tbody');
  const construction = window._currentConstruction || {};
  try {
    _contractList = await contracts.list(construction.id || '');
    if (!_contractList.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📄</div><p>Chưa có hợp đồng</p></div></td></tr>`;
    } else {
      tbody.innerHTML = _contractList.map(c => `
        <tr>
          <td><strong>${esc(c.contract_number)}</strong></td>
          <td>${fmtDate(c.sign_date)}</td>
          <td class="currency">${fmt(c.contract_value_vnd)}</td>
          <td>${c.advance_percentage || 0}%</td>
          <td>${c.retention_percentage || 0}%</td>
          <td>${badge(c.contract_status || 'ACTIVE')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window._paymentContractId='${esc(c.id)}';switchContractTab('payments',document.querySelectorAll('.tab')[1]);loadPaymentsForContract('${esc(c.id)}')">💰 TT</button>
          </td>
        </tr>
      `).join('');
    }

    // Populate contract filter
    const sel = document.getElementById('payment-contract-filter');
    const pmSel = document.getElementById('pm-contract');
    if (sel) sel.innerHTML = `<option value="">-- Chọn hợp đồng --</option>` + buildOptions(_contractList, 'id', 'contract_number');
    if (pmSel) pmSel.innerHTML = `<option value="">-- Chọn hợp đồng --</option>` + buildOptions(_contractList, 'id', 'contract_number');
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

window.loadPayments = async function() {
  const cid = document.getElementById('payment-contract-filter')?.value;
  if (!cid) return;
  await loadPaymentsForContract(cid);
};

window.loadPaymentsForContract = async function(cid) {
  const tbody = document.getElementById('payment-tbody');
  if (!tbody) return;
  try {
    const list = await contracts.listPayments(cid);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">💰</div><p>Chưa có yêu cầu thanh toán</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(p => `
      <tr>
        <td>${esc(p.request_period)}</td>
        <td>${_paymentTypeLabel(p.request_type)}</td>
        <td class="currency">${fmt(p.proposed_payment_vnd)}</td>
        <td class="currency">${fmt(p.proposed_advance_recovery_vnd)}</td>
        <td>${badge(p.internal_status)}</td>
        <td>${badge(p.treasury_status)}</td>
        <td>${p.treasury_status === 'SENT' || p.treasury_status === 'PROCESSING' ? slaStatus(p.treasury_sla_deadline) : '—'}</td>
        <td>
          ${p.internal_status === 'DRAFT' ? `<button class="btn btn-warning btn-sm" onclick="submitToTreasury('${esc(cid)}','${esc(p.id)}')">📨 Nộp KBNN</button>` : ''}
          ${p.treasury_status === 'SENT' || p.treasury_status === 'PROCESSING' ? `<button class="btn btn-secondary btn-sm" onclick="openTreasuryModal('${esc(cid)}','${esc(p.id)}')">📝 Cập nhật</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
};

window.switchContractTab = function(tab, el) {
  ['contracts','payments','sla'].forEach(t => {
    const el2 = document.getElementById(`tab-${t}`);
    if (el2) el2.classList.remove('active');
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  el.classList.add('active');
  if (tab === 'sla') loadSlaList();
};

async function loadSlaList() {
  const el = document.getElementById('sla-list');
  try {
    const list = await contracts.slaOverdue();
    if (!list.length) {
      el.innerHTML = `<div class="alert alert-success">✓ Không có hồ sơ thanh toán nào quá hạn SLA KBNN</div>`;
    } else {
      el.innerHTML = `<div class="alert alert-danger" style="margin-bottom:12px">⚠️ Có ${list.length} hồ sơ quá hạn SLA KBNN</div>
        <table><thead><tr><th>Kỳ TT</th><th>Hợp đồng</th><th>SLA Deadline</th><th>Quá hạn</th></tr></thead>
        <tbody>${list.map(p => `<tr>
          <td>${esc(p.request_period)}</td>
          <td>${esc(p.contract_id)}</td>
          <td>${fmtDateTime(p.treasury_sla_deadline)}</td>
          <td><span class="sla-overdue">+${p.overdue_hours}h</span></td>
        </tr>`).join('')}</tbody></table>`;
    }
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

window.openContractModal = function() {
  document.getElementById('contract-modal').classList.remove('hidden');
  ['ct-number','ct-sign','ct-value','ct-advance-pct','ct-retention-pct','ct-retention-acc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('contract-modal-err').style.display = 'none';
};

window.saveContract = async function() {
  const errEl = document.getElementById('contract-modal-err');
  errEl.style.display = 'none';
  const construction = window._currentConstruction || {};

  const data = {
    construction_id: construction.id || '',
    contract_number: document.getElementById('ct-number').value.trim(),
    sign_date: document.getElementById('ct-sign').value,
    contract_value_vnd: parseFloat(document.getElementById('ct-value').value) || 0,
    advance_percentage: parseFloat(document.getElementById('ct-advance-pct').value) || 0,
    retention_percentage: parseFloat(document.getElementById('ct-retention-pct').value) || 0,
    retention_account_number: document.getElementById('ct-retention-acc').value.trim(),
  };

  if (!data.contract_number || !data.sign_date || !data.contract_value_vnd) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc';
    errEl.style.display = 'block';
    return;
  }

  try {
    await contracts.create(data);
    toast('Thêm hợp đồng thành công');
    closeModal('contract-modal');
    await loadContracts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.openPaymentModal = function() {
  document.getElementById('payment-modal').classList.remove('hidden');
};

window.savePayment = async function() {
  const errEl = document.getElementById('payment-modal-err');
  errEl.style.display = 'none';
  const cid = document.getElementById('pm-contract').value;
  if (!cid) { errEl.textContent = 'Chọn hợp đồng'; errEl.style.display = 'block'; return; }

  const data = {
    contract_id: cid,
    request_period: document.getElementById('pm-period').value.trim(),
    request_type: document.getElementById('pm-type').value,
    proposed_payment_vnd: parseFloat(document.getElementById('pm-amount').value) || 0,
    proposed_advance_recovery_vnd: parseFloat(document.getElementById('pm-recovery').value) || 0,
    mau_03a_url: document.getElementById('pm-03a').value.trim(),
    mau_04a_url: document.getElementById('pm-04a').value.trim(),
    mau_09_qlda_url: document.getElementById('pm-09').value.trim(),
  };

  try {
    await contracts.createPayment(cid, data);
    toast('Lập yêu cầu thanh toán thành công');
    closeModal('payment-modal');
    await loadPaymentsForContract(cid);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.submitToTreasury = async function(cid, pid) {
  try {
    const res = await contracts.submitToTreasury(cid, pid);
    toast(`Đã nộp KBNN — SLA: ${new Date(res.sla_deadline).toLocaleString('vi-VN')}`);
    await loadPaymentsForContract(cid);
  } catch (err) {
    toast(err.message, 'error');
  }
};

let _treasuryCid = null, _treasuryPid = null;
window.openTreasuryModal = function(cid, pid) {
  _treasuryCid = cid; _treasuryPid = pid;
  document.getElementById('treasury-modal').classList.remove('hidden');
  document.getElementById('ts-status').value = 'PROCESSING';
  document.getElementById('ts-reason').value = '';
  document.getElementById('treasury-modal-err').style.display = 'none';
};

window.saveTreasuryStatus = async function() {
  const errEl = document.getElementById('treasury-modal-err');
  try {
    await contracts.updateTreasuryStatus(_treasuryCid, _treasuryPid, {
      treasury_status: document.getElementById('ts-status').value,
      treasury_rejection_reason: document.getElementById('ts-reason').value.trim() || null,
    });
    toast('Cập nhật trạng thái KBNN thành công');
    closeModal('treasury-modal');
    await loadPaymentsForContract(_treasuryCid);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

function _paymentTypeLabel(t) {
  return { ADVANCE: '🔵 Tạm ứng', VOLUME_PAYMENT: '🟢 Thanh toán KL', RECOVERY: '🔴 Thu hồi TU' }[t] || t;
}
