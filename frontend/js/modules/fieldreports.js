/**
 * Biên bản hiện trường (NĐ 207/2026/NĐ-CP)
 * - Lập trên điện thoại / máy tính bảng khi đi kiểm tra hiện trường
 * - Đính kèm ảnh (nhúng vào PDF) + video (upload kèm)
 * - Các thành phần ký qua màn hình cảm ứng (canvas)
 * - PDF render bằng html2pdf (font tiếng Việt chuẩn) → lưu Drive: {dự án}/BienBan
 */
import { projects, fieldReports } from '../api.js';
import { esc, fmtDate, fmtDateTime, toast } from '../utils.js';

const PHASES = [
  ['01_ChuanBiDauTu',     'GĐ1 — Chuẩn bị đầu tư'],
  ['02_ThucHienDauTu',    'GĐ2 — Thực hiện đầu tư'],
  ['03_NghiemThuHoanCong','GĐ3 — Nghiệm thu hoàn công'],
  ['04_QuyetToan',        'GĐ4 — Quyết toán'],
];

let _projects = [];
let _participants = [];   // {name, role, signature(dataURL|null)}
let _photos = [];         // {name, dataURL}
let _videoFiles = [];     // File[]
let _sigIndex = null;     // participant đang ký

export async function renderFieldReports(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">📝 Biên bản hiện trường
        <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openFRModal()">+ Lập biên bản</button>
      </div>
      <div class="alert alert-info" style="margin-bottom:12px;font-size:12px">
        Lập biên bản ngay tại hiện trường bằng điện thoại/máy tính bảng — chụp ảnh, quay video,
        các thành phần <strong>ký trực tiếp trên màn hình cảm ứng</strong>. Biên bản PDF được lưu tự động
        vào thư mục <strong>BienBan</strong> của dự án trên Google Drive.
      </div>
      <div class="form-group" style="max-width:360px;margin-bottom:12px">
        <label>Lọc theo dự án</label>
        <select id="fr-filter" onchange="loadFieldReports()"><option value="">Tất cả dự án</option></select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Ngày kiểm tra</th><th>Dự án</th><th>Giai đoạn</th><th>Địa điểm</th>
            <th>Người lập</th><th>Thành phần</th><th>Tài liệu</th>
          </tr></thead>
          <tbody id="fr-tbody"><tr><td colspan="7" style="text-align:center">Đang tải...</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- ─── Modal: Lập biên bản ─── -->
    <div class="modal-overlay hidden" id="fr-modal">
      <div class="modal" style="max-width:760px;width:96%">
        <div class="modal-header">
          <h3>📝 Lập biên bản hiện trường</h3>
          <button class="modal-close" onclick="closeModal('fr-modal')">✕</button>
        </div>
        <div class="modal-body" style="max-height:72vh;overflow-y:auto">
          <div class="form-grid">
            <div class="form-group">
              <label>Dự án *</label>
              <select id="fr-project" onchange="frLoadConstructions()"></select>
            </div>
            <div class="form-group">
              <label>Gói thầu (nếu có)</label>
              <select id="fr-construction"><option value="">-- Không chọn --</option></select>
            </div>
            <div class="form-group">
              <label>Giai đoạn *</label>
              <select id="fr-phase">${PHASES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label>Thời gian kiểm tra *</label>
              <input id="fr-date" type="datetime-local" />
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Địa điểm / vị trí kiểm tra</label>
              <input id="fr-location" type="text" placeholder="VD: Km2+300 tuyến đường..., hạng mục móng M5..." />
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Nội dung kiểm tra hiện trường *</label>
              <textarea id="fr-content" rows="4" placeholder="Mô tả hiện trạng, khối lượng, chất lượng thi công, tồn tại phát hiện..."></textarea>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Kết luận / yêu cầu xử lý</label>
              <textarea id="fr-conclusion" rows="3" placeholder="Kết luận của đoàn kiểm tra, yêu cầu và thời hạn khắc phục..."></textarea>
            </div>
          </div>

          <!-- Thành phần tham gia + chữ ký -->
          <div style="margin-top:14px">
            <label style="font-weight:600">👥 Thành phần tham gia & chữ ký *</label>
            <div id="fr-participants" style="margin-top:6px"></div>
            <button class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="frAddParticipant()">+ Thêm người</button>
          </div>

          <!-- Ảnh hiện trường -->
          <div style="margin-top:14px">
            <label style="font-weight:600">📷 Ảnh hiện trường (nhúng vào biên bản)</label>
            <input id="fr-photo-input" type="file" accept="image/*" capture="environment" multiple
                   style="display:none" onchange="frAddPhotos(this)" />
            <div style="margin-top:6px">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('fr-photo-input').click()">📷 Chụp / chọn ảnh</button>
            </div>
            <div id="fr-photo-previews" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
          </div>

          <!-- Video hiện trường -->
          <div style="margin-top:14px">
            <label style="font-weight:600">🎬 Video hiện trường (lưu kèm vào thư mục BienBan)</label>
            <input id="fr-video-input" type="file" accept="video/*" capture="environment" multiple
                   style="display:none" onchange="frAddVideos(this)" />
            <div style="margin-top:6px">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('fr-video-input').click()">🎬 Quay / chọn video</button>
            </div>
            <div id="fr-video-list" style="font-size:12px;color:#6b7280;margin-top:6px"></div>
          </div>

          <div id="fr-err" class="alert alert-danger" style="display:none;margin-top:12px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('fr-modal')">Hủy</button>
          <button class="btn btn-primary" id="fr-save-btn" onclick="saveFieldReport()">📄 Tạo biên bản & Lưu</button>
        </div>
      </div>
    </div>

    <!-- ─── Modal: Ký cảm ứng ─── -->
    <div class="modal-overlay hidden" id="sig-modal">
      <div class="modal" style="max-width:520px;width:96%">
        <div class="modal-header">
          <h3>✍️ Ký biên bản <span id="sig-who" style="font-weight:400;font-size:13px;color:#6b7280"></span></h3>
          <button class="modal-close" onclick="closeModal('sig-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Ký bằng ngón tay / bút cảm ứng vào khung bên dưới</div>
          <canvas id="sig-canvas" width="460" height="200"
                  style="border:2px dashed var(--border,#cbd5e1);border-radius:10px;width:100%;touch-action:none;background:#fff"></canvas>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="clearSignature()">🧹 Ký lại</button>
          <button class="btn btn-primary" onclick="confirmSignature()">✓ Xác nhận chữ ký</button>
        </div>
      </div>
    </div>

    <!-- Vùng render PDF ẩn -->
    <div id="fr-print-area" style="position:fixed;left:-10000px;top:0;background:#fff"></div>`;

  await Promise.all([loadFRProjects(), loadFieldReports()]);
}

// ─── Danh sách ────────────────────────────────────────────────────
async function loadFRProjects() {
  try {
    _projects = await projects.list();
    const opts = _projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.project_code || p.id)})</option>`).join('');
    const filterSel = document.getElementById('fr-filter');
    if (filterSel) filterSel.innerHTML = `<option value="">Tất cả dự án</option>` + opts;
    const formSel = document.getElementById('fr-project');
    if (formSel) formSel.innerHTML = `<option value="">-- Chọn dự án --</option>` + opts;
  } catch {}
}

window.loadFieldReports = async function() {
  const tbody = document.getElementById('fr-tbody');
  if (!tbody) return;
  try {
    const pid = document.getElementById('fr-filter')?.value || '';
    const list = await fieldReports.list(pid);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📝</div><p>Chưa có biên bản hiện trường nào</p></div></td></tr>`;
      return;
    }
    const phaseLabel = Object.fromEntries(PHASES);
    tbody.innerHTML = list.map(r => {
      let nParts = 0;
      try { nParts = (JSON.parse(r.participants || '[]') || []).length; } catch {}
      const videos = (r.video_urls || '').split(',').filter(Boolean);
      return `
      <tr>
        <td style="font-size:12px">${fmtDateTime(r.report_date)}</td>
        <td style="font-size:12px"><strong>${esc(r.project_id)}</strong>${r.construction_id ? `<div style="color:#6b7280">${esc(r.construction_id)}</div>` : ''}</td>
        <td style="font-size:12px">${esc(phaseLabel[r.phase] || r.phase)}</td>
        <td style="font-size:12px">${esc(r.location) || '—'}</td>
        <td style="font-size:12px">${esc(r.created_by) || '—'}</td>
        <td style="font-size:12px">${nParts} người</td>
        <td style="white-space:nowrap">
          ${r.pdf_url ? `<a href="${esc(r.pdf_url)}" target="_blank" class="btn btn-secondary btn-sm" title="Mở biên bản PDF">📄 PDF</a>` : '—'}
          ${videos.map((v, i) => `<a href="${esc(v)}" target="_blank" class="btn btn-secondary btn-sm" title="Video ${i + 1}">🎬${videos.length > 1 ? i + 1 : ''}</a>`).join(' ')}
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
};

// ─── Modal lập biên bản ───────────────────────────────────────────
window.openFRModal = function() {
  _participants = [{ name: '', role: 'Cán bộ QLDA', signature: null }];
  _photos = [];
  _videoFiles = [];
  document.getElementById('fr-modal').classList.remove('hidden');
  document.getElementById('fr-err').style.display = 'none';
  ['fr-location', 'fr-content', 'fr-conclusion'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fr-project').value = '';
  document.getElementById('fr-phase').value = '02_ThucHienDauTu';
  // Giờ địa phương hiện tại cho datetime-local
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('fr-date').value = now.toISOString().slice(0, 16);
  document.getElementById('fr-photo-previews').innerHTML = '';
  document.getElementById('fr-video-list').innerHTML = '';
  renderParticipants();
};

window.frLoadConstructions = async function() {
  const pid = document.getElementById('fr-project').value;
  const sel = document.getElementById('fr-construction');
  sel.innerHTML = `<option value="">-- Không chọn --</option>`;
  if (!pid) return;
  try {
    const list = await projects.listConstructions(pid);
    sel.innerHTML += list.map(c => `<option value="${esc(c.id)}">${esc(c.construction_code || c.id)} — ${esc(c.name)}</option>`).join('');
  } catch {}
};

// ─── Thành phần + chữ ký ─────────────────────────────────────────
function renderParticipants() {
  const box = document.getElementById('fr-participants');
  if (!box) return;
  box.innerHTML = _participants.map((p, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <input type="text" placeholder="Họ tên" value="${esc(p.name)}" style="flex:2;min-width:130px"
             onchange="window._frParts[${i}].name=this.value" />
      <input type="text" placeholder="Chức danh / đơn vị" value="${esc(p.role)}" style="flex:2;min-width:130px"
             onchange="window._frParts[${i}].role=this.value" />
      ${p.signature
        ? `<img src="${p.signature}" style="height:34px;border:1px solid var(--border);border-radius:6px;background:#fff" alt="chữ ký" />
           <button class="btn btn-secondary btn-sm" onclick="openSignature(${i})" title="Ký lại">✍️</button>`
        : `<button class="btn btn-warning btn-sm" onclick="openSignature(${i})">✍️ Ký</button>`}
      <button class="btn btn-secondary btn-sm" onclick="frRemoveParticipant(${i})" title="Xóa">✕</button>
    </div>`).join('');
  window._frParts = _participants;
}

window.frAddParticipant = function() {
  _participants.push({ name: '', role: '', signature: null });
  renderParticipants();
};

window.frRemoveParticipant = function(i) {
  _participants.splice(i, 1);
  renderParticipants();
};

// Canvas ký cảm ứng (hỗ trợ cả chuột lẫn chạm)
let _sigDrawing = false;

function _sigPos(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * (canvas.width / rect.width),
    y: (src.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function _setupSigCanvas() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas || canvas._ready) return;
  canvas._ready = true;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1e3a8a';

  const start = (e) => { e.preventDefault(); _sigDrawing = true; const p = _sigPos(canvas, e); ctx.beginPath(); ctx.moveTo(p.x, p.y); canvas._signed = true; };
  const move  = (e) => { if (!_sigDrawing) return; e.preventDefault(); const p = _sigPos(canvas, e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end   = () => { _sigDrawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

window.openSignature = function(i) {
  _sigIndex = i;
  const p = _participants[i];
  document.getElementById('sig-who').textContent = `— ${p.name || 'Người ký ' + (i + 1)}${p.role ? ' (' + p.role + ')' : ''}`;
  document.getElementById('sig-modal').classList.remove('hidden');
  _setupSigCanvas();
  clearSignature();
};

window.clearSignature = function() {
  const canvas = document.getElementById('sig-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas._signed = false;
};

window.confirmSignature = function() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas._signed) { toast('Chưa có chữ ký trên khung', 'error'); return; }
  _participants[_sigIndex].signature = canvas.toDataURL('image/png');
  closeModal('sig-modal');
  renderParticipants();
};

// ─── Ảnh & video ─────────────────────────────────────────────────
window.frAddPhotos = function(input) {
  [...input.files].forEach(f => {
    const reader = new FileReader();
    reader.onload = () => {
      _photos.push({ name: f.name, dataURL: reader.result });
      const box = document.getElementById('fr-photo-previews');
      box.innerHTML = _photos.map((p, i) => `
        <div style="position:relative">
          <img src="${p.dataURL}" style="width:86px;height:86px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
          <button onclick="frRemovePhoto(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--danger,#dc2626);color:#fff;font-size:11px;cursor:pointer">✕</button>
        </div>`).join('');
    };
    reader.readAsDataURL(f);
  });
  input.value = '';
};

window.frRemovePhoto = function(i) {
  _photos.splice(i, 1);
  const box = document.getElementById('fr-photo-previews');
  box.innerHTML = _photos.map((p, j) => `
    <div style="position:relative">
      <img src="${p.dataURL}" style="width:86px;height:86px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
      <button onclick="frRemovePhoto(${j})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--danger,#dc2626);color:#fff;font-size:11px;cursor:pointer">✕</button>
    </div>`).join('');
};

window.frAddVideos = function(input) {
  _videoFiles = [..._videoFiles, ...input.files].slice(0, 5); // tối đa 5 video / biên bản
  document.getElementById('fr-video-list').innerHTML =
    _videoFiles.map(f => `🎬 ${esc(f.name)} (${(f.size / 1048576).toFixed(1)} MB)`).join('<br>');
  input.value = '';
};

// ─── Tạo PDF & lưu ────────────────────────────────────────────────
async function _ensureHtml2pdf() {
  if (window.html2pdf) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Không tải được thư viện tạo PDF — kiểm tra kết nối mạng'));
    document.head.appendChild(s);
  });
}

function _buildPrintHTML(data) {
  const phaseLabel = Object.fromEntries(PHASES);
  const proj = _projects.find(p => p.id === data.project_id) || {};
  const dt = new Date(data.report_date);
  const dateStr = `hồi ${String(dt.getHours()).padStart(2,'0')} giờ ${String(dt.getMinutes()).padStart(2,'0')}, ngày ${String(dt.getDate()).padStart(2,'0')} tháng ${String(dt.getMonth()+1).padStart(2,'0')} năm ${dt.getFullYear()}`;

  return `
  <div style="font-family:'Times New Roman',serif;color:#000;width:190mm;padding:10mm;font-size:13pt;line-height:1.45">
    <div style="display:flex;justify-content:space-between;font-size:11.5pt">
      <div style="text-align:center;width:46%">
        <div>${esc(proj.owner_id || 'CHỦ ĐẦU TƯ')}</div>
        <div style="font-weight:bold">BAN QUẢN LÝ DỰ ÁN</div>
        <div>―――――――</div>
      </div>
      <div style="text-align:center;width:52%">
        <div style="font-weight:bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div style="font-weight:bold">Độc lập - Tự do - Hạnh phúc</div>
        <div>――――――――――――――</div>
      </div>
    </div>

    <h2 style="text-align:center;margin:18px 0 4px;font-size:15pt">BIÊN BẢN KIỂM TRA HIỆN TRƯỜNG</h2>
    <div style="text-align:center;font-style:italic;font-size:11.5pt;margin-bottom:14px">
      (Giai đoạn: ${esc(phaseLabel[data.phase] || data.phase)} — theo Nghị định số 207/2026/NĐ-CP)
    </div>

    <p><strong>Dự án:</strong> ${esc(proj.name || data.project_id)} (Mã DA: ${esc(proj.project_code || data.project_id)})</p>
    ${data.construction_label ? `<p><strong>Gói thầu / hạng mục:</strong> ${esc(data.construction_label)}</p>` : ''}
    <p><strong>Thời gian kiểm tra:</strong> ${dateStr}</p>
    ${data.location ? `<p><strong>Địa điểm / vị trí:</strong> ${esc(data.location)}</p>` : ''}

    <p style="margin-top:10px"><strong>I. THÀNH PHẦN THAM GIA:</strong></p>
    ${data.participants.map((p, i) => `<p style="margin:2px 0 2px 14px">${i + 1}. Ông/Bà <strong>${esc(p.name)}</strong>${p.role ? ' — ' + esc(p.role) : ''}</p>`).join('')}

    <p style="margin-top:10px"><strong>II. NỘI DUNG KIỂM TRA:</strong></p>
    <p style="margin-left:14px;white-space:pre-wrap">${esc(data.content)}</p>

    ${data.conclusion ? `
    <p style="margin-top:10px"><strong>III. KẾT LUẬN / YÊU CẦU XỬ LÝ:</strong></p>
    <p style="margin-left:14px;white-space:pre-wrap">${esc(data.conclusion)}</p>` : ''}

    <p style="margin-top:12px;font-style:italic">
      Biên bản được lập ${dateStr}, các thành phần tham gia thống nhất ký tên dưới đây.
      ${_photos.length ? `Kèm theo ${_photos.length} ảnh hiện trường.` : ''}
      ${data.video_count ? ` Kèm theo ${data.video_count} video hiện trường (lưu trong hồ sơ điện tử của dự án).` : ''}
    </p>

    <div style="display:flex;flex-wrap:wrap;margin-top:14px">
      ${data.participants.map(p => `
        <div style="width:50%;text-align:center;margin-bottom:14px">
          <div style="font-weight:bold;font-size:11.5pt">${esc((p.role || 'NGƯỜI KÝ').toUpperCase())}</div>
          ${p.signature
            ? `<img src="${p.signature}" style="height:56px;margin:6px 0" />`
            : `<div style="height:56px"></div>`}
          <div style="font-weight:bold">${esc(p.name)}</div>
        </div>`).join('')}
    </div>

    ${_photos.length ? `
    <div style="page-break-before:always"></div>
    <h3 style="text-align:center;font-size:13.5pt">PHỤ LỤC ẢNH HIỆN TRƯỜNG</h3>
    <div style="display:flex;flex-wrap:wrap;gap:6mm;justify-content:center">
      ${_photos.map((p, i) => `
        <div style="text-align:center;width:85mm">
          <img src="${p.dataURL}" style="width:85mm;max-height:70mm;object-fit:contain;border:1px solid #999" />
          <div style="font-size:10pt;font-style:italic">Ảnh ${i + 1}</div>
        </div>`).join('')}
    </div>` : ''}
  </div>`;
}

window.saveFieldReport = async function() {
  const errEl = document.getElementById('fr-err');
  errEl.style.display = 'none';

  const data = {
    project_id: document.getElementById('fr-project').value,
    construction_id: document.getElementById('fr-construction').value,
    construction_label: document.getElementById('fr-construction').selectedOptions[0]?.textContent?.trim(),
    phase: document.getElementById('fr-phase').value,
    report_date: document.getElementById('fr-date').value,
    location: document.getElementById('fr-location').value.trim(),
    content: document.getElementById('fr-content').value.trim(),
    conclusion: document.getElementById('fr-conclusion').value.trim(),
    participants: _participants.filter(p => p.name.trim()),
    video_count: _videoFiles.length,
  };
  if (data.construction_label === '-- Không chọn --') data.construction_label = '';

  if (!data.project_id || !data.report_date || !data.content) {
    errEl.textContent = 'Vui lòng chọn dự án, thời gian và nhập nội dung kiểm tra';
    errEl.style.display = 'block';
    return;
  }
  if (!data.participants.length) {
    errEl.textContent = 'Cần ít nhất 1 thành phần tham gia (có họ tên)';
    errEl.style.display = 'block';
    return;
  }
  const unsigned = data.participants.filter(p => !p.signature);
  if (unsigned.length) {
    errEl.textContent = `Còn ${unsigned.length} người chưa ký: ${unsigned.map(p => p.name).join(', ')}`;
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('fr-save-btn');
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang tạo PDF...';
    await _ensureHtml2pdf();

    const printArea = document.getElementById('fr-print-area');
    printArea.innerHTML = _buildPrintHTML(data);

    const pdfBlob = await html2pdf().set({
      margin: 8,
      image: { type: 'jpeg', quality: 0.9 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'avoid-all'] },
    }).from(printArea.firstElementChild).outputPdf('blob');
    printArea.innerHTML = '';

    btn.innerHTML = '<span class="spinner"></span> Đang lưu lên Drive...';
    const fd = new FormData();
    fd.append('project_id', data.project_id);
    fd.append('construction_id', data.construction_id || '');
    fd.append('phase', data.phase);
    fd.append('report_date', data.report_date);
    fd.append('location', data.location);
    fd.append('content', data.content);
    fd.append('conclusion', data.conclusion);
    fd.append('participants', JSON.stringify(data.participants.map(p => ({ name: p.name, role: p.role }))));
    fd.append('pdf', pdfBlob, 'bienban.pdf');
    _videoFiles.forEach(f => fd.append('videos', f));

    await fieldReports.create(fd);
    toast('Đã lập biên bản và lưu vào thư mục BienBan của dự án');
    closeModal('fr-modal');
    await loadFieldReports();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '📄 Tạo biên bản & Lưu';
  }
};
