import { dossiers, projects } from '../api.js';
import { esc, fmtDate, fmtDateTime, badge, toast, slaStatus, buildOptions } from '../utils.js';

let _templates = [];
let _constructions = [];

export async function renderDossiers(container) {
  const construction = window._currentConstruction || {};

  container.innerHTML = `
    ${construction.id ? `<div class="breadcrumb"><a href="#" onclick="navigate('constructions')">Gói thầu</a> › <strong>${esc(construction.name)}</strong> <a href="#" onclick="clearDossierFilter()" style="margin-left:8px;font-size:12px">✕ Xem tất cả hồ sơ</a></div>` : ''}
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
              <th>Mã HSNT</th>
              <th>Dự án / Gói thầu</th>
              <th>Mã HĐ</th>
              <th>Lần NT</th><th>Ngày NT</th><th>Giá trị NT</th>
              <th>Trạng thái</th><th>Hành động</th>
            </tr></thead>
            <tbody id="dossier-tbody"><tr><td colspan="8" style="text-align:center">Đang tải...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab: Upload -->
    <div id="tab-upload" class="page-section">
      <div class="card">
        <div class="card-title">📤 Nộp hồ sơ mới</div>
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label>Gói thầu / Hạng mục *</label>
            <select id="d-construction"><option value="">Đang tải danh sách gói thầu...</option></select>
          </div>
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

  _setupDropZone();
  await Promise.all([loadDossiers(), loadTemplateOptions(), loadConstructionOptions()]);
}

// Kéo-thả file vào upload-zone
function _setupDropZone() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('d-file');
  if (!zone || !input) return;
  ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary, #2563eb)';
    zone.style.background = 'rgba(37,99,235,0.05)';
  }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';
  }));
  zone.addEventListener('drop', e => {
    const files = e.dataTransfer?.files;
    if (files?.length) {
      input.files = files;
      handleFileSelect(input);
    }
  });
}

// Dropdown Gói thầu trong tab Nộp hồ sơ
async function loadConstructionOptions() {
  const sel = document.getElementById('d-construction');
  if (!sel) return;
  try {
    _constructions = await projects.listAllConstructions();
    const current = window._currentConstruction || {};
    sel.innerHTML = `<option value="">-- Chọn gói thầu --</option>` +
      _constructions.map(c => {
        const label = [c.construction_code || c.id, c.name, c.project_id ? `(${c.project_id})` : '']
          .filter(Boolean).join(' — ');
        return `<option value="${esc(c.id)}" ${c.id === current.id ? 'selected' : ''}>${esc(label)}</option>`;
      }).join('');
    // Đi từ nút 📁 Hồ sơ của Gói thầu → chọn sẵn gói thầu đó
    if (current.id && !_constructions.some(c => c.id === current.id)) {
      sel.innerHTML += `<option value="${esc(current.id)}" selected>${esc(current.name || current.id)}</option>`;
    }
  } catch {
    sel.innerHTML = `<option value="">-- Không tải được danh sách gói thầu --</option>`;
  }
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
    const statusFilter = document.getElementById('filter-status')?.value;
    if (statusFilter) params.status = statusFilter;
    const list = await dossiers.list(params);

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📁</div><p>Chưa có hồ sơ nghiệm thu nào</p></div></td></tr>`;
      return;
    }

    const tpl = Object.fromEntries(_templates.map(t => [t.id, t]));

    tbody.innerHTML = list.map(d => {
      // Dòng "Dự án / Gói thầu": dòng 1 = Mã DA / Tên DA, dòng 2 = Tên gói thầu
      const daGt = [
        d.project_code  ? `<span style="font-weight:600">${esc(d.project_code)}</span>` : '',
        d.document_name ? `<span style="color:#374151"> / ${esc(d.document_name)}</span>` : '',
      ].filter(Boolean).join('');
      const projectLine = daGt
        ? `<div style="font-size:12px">${daGt}</div>`
        : '';
      const nameLine = d.project_name
        ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(d.project_name)}</div>`
        : '';

      return `
      <tr>
        <td><strong>${esc(d.document_number || d.id)}</strong></td>
        <td>${projectLine}${nameLine}</td>
        <td style="font-size:12px">${esc(d.contract_id) || '—'}</td>
        <td>${esc(d.acceptance_round) ? `Lần ${esc(d.acceptance_round)}` : '—'}</td>
        <td>${fmtDate(d.sign_date) || fmtDate(d.request_date) || '—'}</td>
        <td style="text-align:right;font-size:12px">${esc(d.payment_amount) || '—'}</td>
        <td>${badge(d.status)}</td>
        <td>
          ${d.file_path ? `<a href="${dossiers.fileUrl(d.id)}" target="_blank" class="btn btn-secondary btn-sm">📎</a>` : ''}
          ${d.status === 'PENDING' ? `<button class="btn btn-primary btn-sm" onclick="openApproval('${esc(d.id)}')">✓/✗</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="viewHistory('${esc(d.id)}')">📜</button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

window.filterDossiers = loadDossiers;

window.clearDossierFilter = function() {
  window._currentConstruction = null;
  window.navigate('dossiers');
};

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

  const constructionId = document.getElementById('d-construction')?.value
    || (window._currentConstruction || {}).id || '';
  if (!constructionId) {
    errEl.textContent = 'Vui lòng chọn Gói thầu / Hạng mục';
    errEl.style.display = 'block';
    return;
  }

  const file = document.getElementById('d-file').files[0];
  if (!file) { errEl.textContent = 'Vui lòng chọn file'; errEl.style.display = 'block'; return; }
  if (file.size > 50 * 1024 * 1024) {
    errEl.textContent = 'File vượt quá 50MB';
    errEl.style.display = 'block';
    return;
  }

  const fd = new FormData();
  fd.append('construction_id', constructionId);
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

  const btn = document.querySelector('#tab-upload .btn-primary');
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang tải lên...'; }
    await dossiers.upload(fd);
    toast('Nộp hồ sơ thành công — SLA 24 giờ bắt đầu tính');
    // Reset form
    ['d-name', 'd-number', 'd-sign-date'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('d-template').value = '';
    document.getElementById('d-format').value = '';
    document.getElementById('d-file').value = '';
    document.getElementById('upload-zone-text').textContent = 'Nhấn để chọn file hoặc kéo thả vào đây';
    switchDossierTab('list', document.querySelector('.tab'));
    await loadDossiers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Nộp hồ sơ'; }
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
