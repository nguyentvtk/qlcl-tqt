from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import date, datetime


# ─── Organizations ───────────────────────────────────────────────
class OrganizationCreate(BaseModel):
    name: str
    tax_code: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None


class Organization(OrganizationCreate):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ─── Users ───────────────────────────────────────────────────────
class UserCreate(BaseModel):
    organization_id: str
    full_name: str
    email: str
    phone: str
    professional_certificate_code: Optional[str] = None
    role: Literal[
        "PROJECT_MANAGEMENT", "SURVEY_CONTRACTOR", "DESIGN_CONTRACTOR",
        "CONSTRUCTION_CONTRACTOR", "SUPERVISION_CONTRACTOR", "EPC_CONTRACTOR"
    ]
    password: str


class User(BaseModel):
    id: str
    organization_id: str
    full_name: str
    email: str
    phone: str
    professional_certificate_code: Optional[str] = None
    role: str
    created_at: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ─── Projects ────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    project_code: str
    location: Optional[str] = None
    owner_id: Optional[str] = None
    investment_decision_number: Optional[str] = None
    # Trường mở rộng từ sheet "Dự án"
    description: Optional[str] = None
    project_type: Optional[str] = None          # Loại Dự án
    status: Optional[str] = None                # Trạng thái dự án
    total_investment: Optional[str] = None      # Tổng mức đầu tư
    start_date: Optional[str] = None            # Ngày bắt đầu
    end_date: Optional[str] = None              # Ngày kết thúc
    disbursed_amount: Optional[str] = None      # Số giải ngân


class Project(ProjectCreate):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ─── Constructions ───────────────────────────────────────────────
class ConstructionCreate(BaseModel):
    project_id: str
    name: str
    construction_code: Optional[str] = None
    construction_type: Optional[str] = None
    construction_grade: Optional[Literal["I", "II", "III", "IV", "V"]] = None
    technical_specs: Optional[str] = None   # Dùng cho Hình thức LCNT
    start_date: Optional[str] = None
    expected_end_date: Optional[str] = None
    # Mở rộng từ sheet "Gói thầu"
    status: Optional[str] = None            # Trạng thái GT
    contract_value: Optional[str] = None    # Giá gói thầu


class Construction(ConstructionCreate):
    id: str
    actual_end_date: Optional[str] = None
    created_at: Optional[str] = None


# ─── Project Participants ─────────────────────────────────────────
class ParticipantCreate(BaseModel):
    project_id: str
    organization_id: str
    role: str
    is_lead_member: bool = False
    joint_venture_agreement_url: Optional[str] = None


class Participant(ParticipantCreate):
    id: str
    created_at: Optional[str] = None


# ─── Construction Dossiers ────────────────────────────────────────
class DossierCreate(BaseModel):
    construction_id: Optional[str] = None
    template_id: Optional[str] = None
    document_name: str
    document_number: Optional[str] = None
    sign_date: Optional[str] = None
    file_path: Optional[str] = None
    format_type: Optional[Literal["ORIGINAL_PAPER", "SCAN_PDF", "DIGITAL_SIGNED"]] = None
    # Mở rộng từ sheet "Nghiệm thu"
    project_code: Optional[str] = None         # Mã DA
    contract_id: Optional[str] = None          # Mã HĐ
    bid_package_code: Optional[str] = None     # Mã GT (join từ sheet Hợp đồng)
    acceptance_round: Optional[str] = None     # Lần NT
    request_date: Optional[str] = None         # Ngày đề nghị
    payment_amount: Optional[str] = None       # Giá trị NT
    payment_pct: Optional[str] = None          # % Giá trị NT
    project_name: Optional[str] = None         # Tên DA
    contractor_name: Optional[str] = None      # Nhà thầu


class Dossier(DossierCreate):
    id: str
    status: str = "PENDING"
    uploaded_by: Optional[str] = None
    uploaded_at: Optional[str] = None
    updated_at: Optional[str] = None


class DossierAction(BaseModel):
    action: Literal["APPROVE", "REJECT"]
    comment: Optional[str] = None


# ─── Document Signatures ──────────────────────────────────────────
class SignatureCreate(BaseModel):
    dossier_id: str
    signer_role: str
    signature_hash: str


class Signature(SignatureCreate):
    id: str
    signer_id: str
    signing_time: str
    is_valid_signature: bool = True
    created_at: Optional[str] = None


# ─── Contracts ───────────────────────────────────────────────────
class ContractCreate(BaseModel):
    construction_id: Optional[str] = None
    contract_number: str
    sign_date: Optional[str] = None
    contract_value_vnd: Optional[float] = None
    advance_percentage: Optional[float] = None
    retention_percentage: float = 0
    retention_account_number: Optional[str] = None
    mau_02a_url: Optional[str] = None
    # Mở rộng từ sheet "Hợp đồng"
    project_code: Optional[str] = None         # Mã DA
    bid_package_code: Optional[str] = None     # Mã GT
    contract_name: Optional[str] = None        # Tên HĐ
    contract_type: Optional[str] = None        # Loại HĐ
    contractor_name: Optional[str] = None      # Nhà thầu
    settlement_value: Optional[float] = None   # Giá quyết toán
    duration_days: Optional[str] = None        # Thời gian HĐ
    effective_date: Optional[str] = None       # Ngày hiệu lực
    expiry_date: Optional[str] = None          # Ngày hết hạn


class Contract(ContractCreate):
    id: str
    total_advanced_vnd: float = 0
    total_paid_volume_vnd: float = 0
    contract_status: str = "ACTIVE"
    created_at: Optional[str] = None


# ─── Payment Requests ─────────────────────────────────────────────
class PaymentRequestCreate(BaseModel):
    contract_id: str
    request_period: str
    request_type: Literal["ADVANCE", "VOLUME_PAYMENT", "RECOVERY"]
    proposed_payment_vnd: float
    proposed_advance_recovery_vnd: float = 0
    mau_03a_url: Optional[str] = None
    mau_04a_url: Optional[str] = None
    mau_05a_url: Optional[str] = None
    mau_04b_url: Optional[str] = None
    mau_09_qlda_url: Optional[str] = None


class PaymentRequest(PaymentRequestCreate):
    id: str
    internal_status: str = "DRAFT"
    treasury_status: str = "NOT_SENT"
    treasury_rejection_reason: Optional[str] = None
    treasury_sla_deadline: Optional[str] = None
    processed_at: Optional[str] = None
    created_at: Optional[str] = None


class TreasuryStatusUpdate(BaseModel):
    treasury_status: Literal["NOT_SENT", "SENT", "PROCESSING", "APPROVED", "REJECTED"]
    treasury_rejection_reason: Optional[str] = None


# ─── Settlement Warnings ──────────────────────────────────────────
class WarningCreate(BaseModel):
    contract_id: str
    warning_number: Literal[1, 2, 3]
    sent_date: str
    response_deadline: str
    mau_02_qtda_url: str


class Warning(WarningCreate):
    id: str
    contractor_response_status: str = "NO_RESPONSE"
    is_delivered: bool = False
    created_at: Optional[str] = None


# ─── Project Settlements ──────────────────────────────────────────
class SettlementCreate(BaseModel):
    project_id: str
    proposed_settlement_amount: float = 0
    approver_org_id: Optional[str] = None
    verifier_org_id: Optional[str] = None
    submission_deadline: Optional[str] = None
    # Mở rộng từ sheet "Quyết toán DAHT"
    project_name: Optional[str] = None          # Tên DA
    settlement_number: Optional[str] = None     # Số tờ trình / Mã QT
    contract_group: Optional[str] = None        # Nhóm dự án (A/B/C)
    attached_forms: Optional[str] = None        # Mẫu biểu TT 73/2026/TT-BTC (vd: "01/QTDA,02/QTDA")


class Settlement(SettlementCreate):
    id: str
    audited_amount: Optional[float] = None
    approved_amount: Optional[float] = None
    status: str = "PREPARING"
    approved_decision_number: Optional[str] = None
    approved_decision_date: Optional[str] = None
    created_at: Optional[str] = None
