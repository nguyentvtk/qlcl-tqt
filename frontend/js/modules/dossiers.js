import { dossiers } from '../api.js';
import { esc, fmtDate, fmtDateTime, badge, toast, slaStatus, buildOptions } from '../utils.js';

let _templates = [];

export async function renderDossiers(container) {
  const construction = window._currentConstruction || {};

  container.innerHTML = `
    ${construction.id ? `<div class="breadcrumb"><a href="#" onclick="navigate('constructions')">Hạng mục</a> › <strong>${esc(construction.name)}</strong></div>` : ''}
    <div class="tabs">
      <div class="tab active" onclick="switchDossierTab('list',this)">📋 Danh sách hồ sơ</div>
      <div class="tab" onclick="switchDossierTab('upload',this)">📤 Nộp hồ sơ</div>
      <div class="tab" onclick="switchDossierTab('stamp',this)">🔖 Dấu hoàn công</div>
    </div>

    <!-- Tab: Danh sách -->
    <div id="tab-list" class="page-section active">
      <div class="card">
        <div class="card-title">📁 Hồ sơ xây dựng
          <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
            <select id="filter-status" onchange="filterDossiers()" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Từ chối</option>
            </select>
          </div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Mã HSNT</th><th>Tên hồ sơ</th><th>Mã HĐ</th>
              <th>Lần NT</th><th>Ngày NT</th><th>Giá trị NT</th>
              <th>Nhà thầu</th><th>Trạng thái</th><th>Hành động</th>
            </tr></thead>
            <tbody id="dossier-tbody"><tr><td colspan="9" style="text-align:center">Đang tải...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab: Upload -->
    <div id="tab-upload" class="page-section">
      <div class="card">
        <div class="card-title">📤 Nộp hồ sơ mới</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Loại hồ sơ (mẫu) *</label>
            <select id="d-template"></select>
          </div>
          <div class="form-group">
            <label>Tên hồ sơ *</label>
            <input id="d-name" type="text" placeholder="Tên tài liệu..." />
          </div>
          <div class="form-group">
            <label>Số/ký hiệu tài liệu</label>
            <input id="d-number" type="text" placeholder="VD: BB-NT-001/2026" />
          </div>
          <div class="form-group">
            <label>Ngày ký/ban hành</label>
            <input id="d-sign-date" type="date" />
          </div>
          <div class="form-group">
            <label>Định dạng *</label>
            <select id="d-format">
              <option value="">-- Chọn định dạng --</option>
              <option value="ORIGINAL_PAPER">Bản gốc giấy</option>
              <option value="SCAN_PDF">Bản scan PDF</option>
              <option value="DIGITAL_SIGNED">Chữ ký số</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>File đính kèm *</label>
            <div class="upload-zone" id="upload-zone" onclick="document.getElementById('d-file').click()">
              <div style="font-size:32px;margin-bottom:8px">📎</div>
              <div id="upload-zone-text">Nhấn để chọn file hoặc kéo thả vào đây</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">PDF, Word, Excel, JPEG, PNG — tối đa 50MB</div>
            </div>
            <input id="d-file" type="file" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onchange="handleFileSelect(this)" />
          </div>
        </div>
        <div id="upload-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="submitDossier()">📤 Nộp hồ sơ</button>
        </div>
      </div>
    </div>

    <!-- Tab: Dấu hoàn công -->
    <div id="tab-stamp" class="page-section">
      <div class="card">
        <div class="card-title">🔖 Tạo dấu hoàn công</div>
        <div class="alert alert-info" style="margin-bottom:16px">
          <strong>Mẫu số 1:</strong> Hợp đồng thông thường (4 chữ ký: BQLDA, TVGS, NTC, TKGS)<br>
          <strong>Mẫu số 2:</strong> Hợp đồng EPC / Thầu phụ (3 chữ ký: BQLDA, TVGS, NTC)
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Mẫu dấu *</label>
            <select id="stamp-pattern">
              <option value="1">Mẫu số 1 — Hợp đồng thông thường</option>
              <option value="2">Mẫu số 2 — EPC / Thầu phụ</option>
            </select>
          </div>
          <div class="form-group">
            <label>Tên nhà thầu *</label>
            <input id="stamp-contractor" type="text" placeholder="Tên công ty nhà thầu..." />
          </div>
          <div class="form-group">
            <label>Ngày</label>
            <input id="stamp-day" type="text" placeholder="01" maxlength="2" style="width:80px" />
          </div>
          <div class="form-group">
            <label>Tháng</label>
            <input id="stamp-month" type="text" placeholder="06" maxlength="2" style="width:80px" />
          </div>
          <div class="form-group">
            <label>Năm</label>
            <input id="stamp-year" type="text" placeholder="2026" maxlength="4" style="width:100px" />
          </div>
          <div class="form-group">
            <label>Chữ ký 1 — BQLDA *</label>
            <input id="stamp-s1" type="text" placeholder="Họ tên đại diện BQLDA..." />
          </div>
          <div class="form-group">
            <label>Chữ ký 2 — TVGS *</label>
            <input id="stamp-s2" type="text" placeholder="Họ tên đại diện TVGS..." />
          </div>
          <div class="form-group">
            <label>Chữ ký 3 — Nhà thầu TC *</label>
            <input id="stamp-s3" type="text" placeholder="Họ tên đại diện NTC..." />
          </div>
          <div class="form-group" id="stamp-s4-group">
            <label>Chữ ký 4 — TKGS (Mẫu 1)</label>
            <input id="stamp-s4" type="text" placeholder="Họ tên đại diện TKGS..." />
          </div>
          <div class="form-group">
            <label>Trang áp dấu</label>
            <select id="stamp-pages">
              <option value="all">Tất cả các trang</option>
              <option value="last">Chỉ trang cuối</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>File PDF bản vẽ *</label>
            <div class="upload-zone" onclick="document.getElementById('stamp-file').click()">
              <div style="font-size:32px;margin-bottom:8px">📐</div>
              <div id="stamp-file-text">Nhấn để chọn file PDF bản vẽ</div>
            </div>
            <input id="stamp-file" type="file" style="display:none" accept=".pdf" onchange="document.getElementById('stamp-file-text').textContent=this.files[0]?.name||'Chưa chọn'" />
          </div>
        </div>
        <div id="stamp-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        <div style="margin-top:16px">
          <button class="btn btn-success" onclick="createStamp()">🔖 Tạo dấu hoàn công & Tải xuống</button>
        </div>
      </div>
    </div>

    <!-- Modal: Phê duyệt hồ sơ -->
    <div class="modal-overlay hidden" id="approval-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 id="approval-title">Phê duyệt hồ sơ</h3>
          <button class="modal-close" onclick="closeModal('approval-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nhận xét / Lý do (nếu từ chối)</label>
            <textarea id="approval-comment" placeholder="Nhận xét..."></textarea>
          </div>
          <div id="approval-err" class="alert alert-danger" style="display:none;margin-top:8px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('approval-modal')">Hủy</button>
          <button class="btn btn-danger" onclick="doApproval('REJECT')">✗ Từ chối</button>
          <button class="btn btn-success" onclick="doApproval('APPROVE')">✓ Duyệt</button>
        </div>
      </div>
    </div>`;

  document.getElementById('stamp-pattern').addEventListener('change', function() {
    document.getElementById('stamp-s4-group').style.display = this.value === '1' ? '' : 'none';
  });

  // Preset date
  const now = new Date();
  document.getElementById('stamp-day').value = String(now.getDate()).padStart(2, '0');
  document.getElementById('stamp-month').value = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('stamp-year').value = now.getFullYear();

  await Promise.all([loadDossiers(), loadTemplateOptions()]);
}

async function loadTemplateOptions() {
  try {
    _templates = await dossiers.templates();
    const sel = document.getElementById('d-template');
    if (sel) {
      sel.innerHTML = `<option value="">-- Chọn loại hồ sơ --</option>` +
        _templates.map(t => `<option value="${esc(t.id)}">[Nhóm ${esc(t.group?.code || '')}] ${esc(t.name)}</option>`).join('');
    }
  } catch {}
}

async function loadDossiers() {
  const tbody = document.getElementById('dossier-tbody');
  if (!tbody) return;
  const construction = window._currentConstruction || {};
  try {
    const params = {};
    if (construction.id) params.construction_id = construction.id;
    const list = await dossiers.list(params);

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📁</div><p>Chưa có hồ sơ nghiệm thu nào</p></div></td></tr>`;
      return;
    }

    const tpl = Object.fromEntries(_templates.map(t => [t.id, t]));

    tbody.innerHTML = list.map(d => `
      <tr>
        <td><strong>${esc(d.document_number || d.id)}</strong></td>
        <td>${esc(d.document_name)}</td>
        <td>${esc(d.contract_id) || '—'}</td>
        <td>${esc(d.acceptance_round) ? `Lần ${esc(d.acceptance_round)}` : '—'}</td>
        <td>${fmtDate(d.sign_date) || fmtDate(d.request_date) || '—'}</td>
        <td style="text-align:right">${esc(d.payment_amount) || '—'}</td>
        <td>${esc(d.contractor_name) || '—'}</td>
        <td>${badge(d.status)}</td>
        <td>
          ${d.file_path ? `<a href="${dossiers.fileUrl(d.id)}" target="_blank" class="btn btn-secondary btn-sm">📎</a>` : ''}
          ${d.status === 'PENDING' ? `<button class="btn btn-primary btn-sm" onclick="openApproval('${esc(d.id)}')">✓/✗</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="viewHistory('${esc(d.id)}')">📜</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

window.filterDossiers = loadDossiers;

window.switchDossierTab = function(tab, el) {
  document.querySelectorAll('#tab-list,#tab-upload,#tab-stamp').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  el.classList.add('active');
};

window.handleFileSelect = function(input) {
  const file = input.files[0];
  if (file) document.getElementById('upload-zone-text').textContent = file.name;
};

window.submitDossier = async function() {
  const errEl = document.getElementById('upload-err');
  errEl.style.display = 'none';
  const construction = window._currentConstruction || {};

  if (!construction.id) {
    errEl.textContent = 'Chưa chọn hạng mục công trình';
    errEl.style.display = 'block';
    return;
  }

  const file = document.getElementById('d-file').files[0];
  if (!file) { errEl.textContent = 'Vui lòng chọn file'; errEl.style.display = 'block'; return; }

  const fd = new FormData();
  fd.append('construction_id', construction.id);
  fd.append('template_id', document.getElementById('d-template').value || '');
  fd.append('document_name', document.getElementById('d-name').value.trim());
  fd.append('document_number', document.getElementById('d-number').value.trim());
  fd.append('sign_date', document.getElementById('d-sign-date').value);
  fd.append('format_type', document.getElementById('d-format').value);
  fd.append('file', file);

  if (!fd.get('template_id') || !fd.get('document_name') || !fd.get('format_type')) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc (*)';
    errEl.style.display = 'block';
    return;
  }

  try {
    await dossiers.upload(fd);
    toast('Nộp hồ sơ thành công — SLA 24 giờ bắt đầu tính');
    switchDossierTab('list', document.querySelector('.tab'));
    await loadDossiers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

let _approvalId = null;
window.openApproval = function(id) {
  _approvalId = id;
  document.getElementById('approval-modal').classList.remove('hidden');
  document.getElementById('approval-comment').value = '';
  document.getElementById('approval-err').style.display = 'none';
};

window.doApproval = async function(action) {
  const errEl = document.getElementById('approval-err');
  try {
    await dossiers.action(_approvalId, {
      action,
      comment: document.getElementById('approval-comment').value.trim()
    });
    toast(action === 'APPROVE' ? 'Đã phê duyệt hồ sơ' : 'Đã từ chối hồ sơ', action === 'APPROVE' ? 'success' : 'warning');
    closeModal('approval-modal');
    await loadDossiers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
};

window.viewHistory = async function(id) {
  try {
    const h = await dossiers.history(id);
    const logs = h.approval_logs || [];
    const slaLogs = h.sla_logs || [];
    alert(
      'Lịch sử phê duyệt:\n' +
      logs.map(l => `${fmtDateTime(l.action_at)} — ${l.action} — ${l.comment || ''}`).join('\n') +
      '\n\nSLA:\n' +
      slaLogs.map(s => `Deadline: ${fmtDateTime(s.deadline_at)} | Hoàn tất: ${fmtDateTime(s.completed_at)} | Quá hạn: ${s.is_overdue}`).join('\n')
    );
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.createStamp = async function() {
  const errEl = document.getElementById('stamp-err');
  errEl.style.display = 'none';

  const file = document.getElementById('stamp-file').files[0];
  if (!file) { errEl.textContent = 'Vui lòng chọn file PDF bản vẽ'; errEl.style.display = 'block'; return; }

  const pattern = document.getElementById('stamp-pattern').value;
  const s1 = document.getElementById('stamp-s1').value.trim();
  const s2 = document.getElementById('stamp-s2').value.trim();
  const s3 = document.getElementById('stamp-s3').value.trim();

  if (!s1 || !s2 || !s3) {
    errEl.textContent = 'Vui lòng điền đủ 3 chữ ký bắt buộc';
    errEl.style.display = 'block';
    return;
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('pattern', pattern);
  fd.append('contractor_name', document.getElementById('stamp-contractor').value.trim());
  fd.append('day', document.getElementById('stamp-day').value);
  fd.append('month', document.getElementById('stamp-month').value);
  fd.append('year', document.getElementById('stamp-year').value);
  fd.append('signer_1', s1);
  fd.append('signer_2', s2);
  fd.append('signer_3', s3);
  if (pattern === '1') fd.append('signer_4', document.getElementById('stamp-s4').value.trim());
  fd.append('pages_option', document.getElementById('stamp-pages').value);

  try {
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang xử lý...';

    const token = (await import('../api.js')).getToken();
    const res = await fetch('/api/v1/dossiers/as-built-stamp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: fd,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Lỗi server');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hoanCong_${file.name}`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Tải file PDF với dấu hoàn công thành công');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    const btn = document.querySelector('#tab-stamp .btn-success');
    if (btn) { btn.disabled = false; btn.textContent = '🔖 Tạo dấu hoàn công & Tải xuống'; }
  }
};

function _formatType(t) {
  return { ORIGINAL_PAPER: '📄 Bản gốc', SCAN_PDF: '📎 Scan PDF', DIGITAL_SIGNED: '🔐 Chữ ký số' }[t] || t;
}

function _add24h(isoStr) {
  const d = new Date(isoStr);
  d.setHours(d.getHours() + 24);
  return d.toISOString();
}
