"""
Định nghĩa schema cho từng sheet trong Google Sheets.
- Thứ tự cột phải khớp với thứ tự trong PDF spec
- Khi migrate: chỉ APPEND cột mới vào CUỐI (không chen giữa)
"""

SPREADSHEET_ID = ""  # Sẽ đọc từ config

# Tên sheet và danh sách cột theo thứ tự
SHEET_SCHEMAS: dict[str, list[str]] = {
    "organizations": [
        "id", "name", "tax_code", "address", "phone",
        "created_at", "updated_at"
    ],
    "users": [
        "id", "organization_id", "full_name", "email", "phone",
        "professional_certificate_code", "role", "password_hash", "created_at"
    ],
    "projects": [
        "id", "name", "project_code", "location", "owner_id",
        "investment_decision_number", "created_at", "updated_at"
    ],
    "constructions": [
        "id", "project_id", "name", "construction_code", "construction_type",
        "construction_grade", "technical_specs", "start_date",
        "expected_end_date", "actual_end_date", "created_at"
    ],
    "project_participants": [
        "id", "project_id", "organization_id", "role", "is_lead_member",
        "joint_venture_agreement_url", "created_at"
    ],
    "dossier_groups": [
        "id", "code", "name"
    ],
    "dossier_templates": [
        "id", "group_id", "item_index", "name", "required_for_all",
        "default_uploader_role", "created_at"
    ],
    "construction_dossiers": [
        "id", "construction_id", "template_id", "document_name",
        "document_number", "sign_date", "file_path", "format_type",
        "status", "uploaded_by", "uploaded_at", "updated_at",
        "phase", "submission_round"  # Giai đoạn + Lần nộp (APPEND cuối)
    ],
    "document_signatures": [
        "id", "dossier_id", "signer_id", "signer_role", "signature_hash",
        "signing_time", "is_valid_signature", "created_at"
    ],
    "dossier_approval_logs": [
        "id", "dossier_id", "actor_id", "action", "comment", "action_at"
    ],
    "contracts": [
        "id", "construction_id", "contract_number", "sign_date",
        "contract_value_vnd", "advance_percentage", "total_advanced_vnd",
        "total_paid_volume_vnd", "retention_percentage",
        "retention_account_number", "contract_status", "mau_02a_url", "created_at"
    ],
    "payment_requests": [
        "id", "contract_id", "request_period", "request_type",
        "proposed_payment_vnd", "proposed_advance_recovery_vnd",
        "mau_03a_url", "mau_04a_url", "mau_05a_url", "mau_04b_url",
        "mau_09_qlda_url", "internal_status", "treasury_status",
        "treasury_rejection_reason", "treasury_sla_deadline",
        "processed_at", "created_at"
    ],
    "contractor_settlement_warnings": [
        "id", "contract_id", "warning_number", "sent_date",
        "response_deadline", "mau_02_qtda_url",
        "contractor_response_status", "is_delivered", "created_at"
    ],
    "project_settlements": [
        "id", "project_id", "proposed_settlement_amount",
        "audited_amount", "approved_amount", "approver_org_id",
        "verifier_org_id", "status", "submission_deadline",
        "approved_decision_number", "approved_decision_date", "created_at",
        "attached_forms"  # Mẫu biểu TT 73/2026/TT-BTC đính kèm (APPEND cuối — không chen giữa)
    ],
    "inspection_sla_logs": [
        "id", "dossier_id", "requested_by", "requested_at",
        "deadline_at", "completed_at", "is_overdue", "created_at"
    ],
    "field_reports": [
        "id", "project_id", "construction_id", "phase", "report_date",
        "location", "content", "conclusion", "participants",
        "pdf_url", "video_urls", "created_by", "created_at"
    ],
}

# Master data mặc định cho dossier_groups — theo 4 giai đoạn dự án (NĐ 207/2026/NĐ-CP)
DEFAULT_DOSSIER_GROUPS = [
    {"id": "1", "code": "I",   "name": "Nhóm I – Pháp lý & chuẩn bị đầu tư (GĐ1)"},
    {"id": "2", "code": "II",  "name": "Nhóm II – Quản lý chất lượng thi công (GĐ2-3)"},
    {"id": "3", "code": "III", "name": "Nhóm III – Nghiệm thu & hoàn công (GĐ3)"},
    {"id": "4", "code": "IV",  "name": "Nhóm IV – LCNT & khởi công xây dựng (GĐ2)"},
    {"id": "5", "code": "V",   "name": "Nhóm V – Thanh toán & quyết toán (GĐ4)"},
]

# Master data mặc định cho dossier_templates
# Danh mục theo NĐ 207/2026/NĐ-CP (hồ sơ hoàn thành công trình, khởi công Đ.48,
# nghiệm thu Đ.57, bàn giao Đ.58) + TT 73/2026/TT-BTC (quyết toán)
DEFAULT_DOSSIER_TEMPLATES = [
    # Nhóm I — GĐ1 Chuẩn bị đầu tư
    {"id": "1", "group_id": "1", "item_index": "1", "name": "Quyết định phê duyệt dự án đầu tư", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "2", "group_id": "1", "item_index": "2", "name": "Hồ sơ thiết kế bản vẽ thi công được duyệt", "required_for_all": "TRUE", "default_uploader_role": "DESIGN_CONTRACTOR"},
    {"id": "3", "group_id": "1", "item_index": "3", "name": "Giấy phép xây dựng (nếu có)", "required_for_all": "FALSE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "12", "group_id": "1", "item_index": "4", "name": "Quyết định phê duyệt chủ trương đầu tư", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "13", "group_id": "1", "item_index": "5", "name": "Báo cáo khảo sát xây dựng được nghiệm thu", "required_for_all": "TRUE", "default_uploader_role": "SURVEY_CONTRACTOR"},
    {"id": "14", "group_id": "1", "item_index": "6", "name": "Dự toán xây dựng được phê duyệt", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "15", "group_id": "1", "item_index": "7", "name": "Hồ sơ môi trường / PCCC được thẩm duyệt (nếu có)", "required_for_all": "FALSE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    # Nhóm II — GĐ2-3 Quản lý chất lượng thi công
    {"id": "4", "group_id": "2", "item_index": "1", "name": "Nhật ký thi công", "required_for_all": "TRUE", "default_uploader_role": "CONSTRUCTION_CONTRACTOR"},
    {"id": "5", "group_id": "2", "item_index": "2", "name": "Biên bản kiểm tra vật liệu đầu vào", "required_for_all": "TRUE", "default_uploader_role": "CONSTRUCTION_CONTRACTOR"},
    {"id": "6", "group_id": "2", "item_index": "3", "name": "Kết quả thí nghiệm vật liệu", "required_for_all": "TRUE", "default_uploader_role": "CONSTRUCTION_CONTRACTOR"},
    {"id": "7", "group_id": "2", "item_index": "4", "name": "Biên bản nghiệm thu công việc xây dựng", "required_for_all": "TRUE", "default_uploader_role": "SUPERVISION_CONTRACTOR"},
    {"id": "8", "group_id": "2", "item_index": "5", "name": "Bản vẽ hoàn công", "required_for_all": "TRUE", "default_uploader_role": "CONSTRUCTION_CONTRACTOR"},
    {"id": "16", "group_id": "2", "item_index": "6", "name": "Biện pháp thi công & kế hoạch an toàn được chấp thuận (Đ.51 Luật XD)", "required_for_all": "TRUE", "default_uploader_role": "CONSTRUCTION_CONTRACTOR"},
    {"id": "17", "group_id": "2", "item_index": "7", "name": "Biên bản hiện trường / biên bản xử lý kỹ thuật", "required_for_all": "FALSE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    # Nhóm III — GĐ3 Nghiệm thu & hoàn công
    {"id": "9", "group_id": "3", "item_index": "1", "name": "Biên bản nghiệm thu bộ phận công trình", "required_for_all": "TRUE", "default_uploader_role": "SUPERVISION_CONTRACTOR"},
    {"id": "10", "group_id": "3", "item_index": "2", "name": "Biên bản nghiệm thu hoàn thành hạng mục công trình", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "11", "group_id": "3", "item_index": "3", "name": "Biên bản nghiệm thu hoàn thành công trình đưa vào sử dụng", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "18", "group_id": "3", "item_index": "4", "name": "Văn bản chấp thuận kết quả nghiệm thu của cơ quan chuyên môn (Đ.57 NĐ 207)", "required_for_all": "FALSE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "19", "group_id": "3", "item_index": "5", "name": "Biên bản bàn giao công trình đưa vào sử dụng (Đ.58 NĐ 207)", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "20", "group_id": "3", "item_index": "6", "name": "Hồ sơ hoàn thành công trình (Đ.42 NĐ 207)", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    # Nhóm IV — GĐ2 LCNT & khởi công
    {"id": "21", "group_id": "4", "item_index": "1", "name": "Kế hoạch lựa chọn nhà thầu được phê duyệt", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "22", "group_id": "4", "item_index": "2", "name": "Quyết định phê duyệt kết quả lựa chọn nhà thầu", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "23", "group_id": "4", "item_index": "3", "name": "Hợp đồng xây dựng & bảo đảm thực hiện hợp đồng", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "24", "group_id": "4", "item_index": "4", "name": "Thông báo khởi công xây dựng (Đ.48 Luật XD)", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "25", "group_id": "4", "item_index": "5", "name": "Biên bản bàn giao mặt bằng thi công", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    # Nhóm V — GĐ4 Thanh toán & quyết toán
    {"id": "26", "group_id": "5", "item_index": "1", "name": "Hồ sơ thanh toán khối lượng hoàn thành (Mẫu 03A/04A)", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "27", "group_id": "5", "item_index": "2", "name": "Biên bản nghiệm thu thanh lý hợp đồng", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "28", "group_id": "5", "item_index": "3", "name": "Báo cáo quyết toán Mẫu 01–07/QTDA (TT 73/2026/TT-BTC)", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "29", "group_id": "5", "item_index": "4", "name": "Báo cáo kiểm toán độc lập (nếu có)", "required_for_all": "FALSE", "default_uploader_role": "PROJECT_MANAGEMENT"},
    {"id": "30", "group_id": "5", "item_index": "5", "name": "Quyết định phê duyệt quyết toán (Mẫu 10/QTDA)", "required_for_all": "TRUE", "default_uploader_role": "PROJECT_MANAGEMENT"},
]

ROLES = [
    "PROJECT_MANAGEMENT",
    "SURVEY_CONTRACTOR",
    "DESIGN_CONTRACTOR",
    "CONSTRUCTION_CONTRACTOR",
    "SUPERVISION_CONTRACTOR",
    "EPC_CONTRACTOR",
]
