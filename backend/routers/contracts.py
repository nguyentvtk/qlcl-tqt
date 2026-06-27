"""
Module Thanh toán: Hợp đồng & Yêu cầu thanh toán
Business rules:
- Phải thu hồi tạm ứng đủ trước khi thanh toán quyết toán
- KBNN SLA: 1 ngày làm việc
- Ghi log trạng thái KBNN
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from models import (
    Contract, ContractCreate,
    PaymentRequest, PaymentRequestCreate,
    TreasuryStatusUpdate,
)
from middleware.auth import get_current_user
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/contracts", tags=["Hợp đồng & Thanh toán"])


# ─── Contracts ──────────────────────────────────────────────────────
@router.get("", response_model=list[Contract])
async def list_contracts(
    construction_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    if construction_id:
        records = sm.read_where("contracts", construction_id=construction_id)
    else:
        records = sm.read_all("contracts")
    return [Contract(**r) for r in records]


@router.get("/{contract_id}", response_model=Contract)
async def get_contract(contract_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("contracts", contract_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy hợp đồng")
    return Contract(**r)


@router.post("", response_model=Contract, status_code=201)
async def create_contract(body: ContractCreate, _: dict = Depends(get_current_user)):
    existing = sm.read_where("contracts", contract_number=body.contract_number)
    if existing:
        raise HTTPException(400, "Số hợp đồng đã tồn tại")
    record = sm.insert("contracts", body.model_dump())
    return Contract(**record)


@router.put("/{contract_id}", response_model=Contract)
async def update_contract(contract_id: str, body: ContractCreate, _: dict = Depends(get_current_user)):
    updated = sm.update("contracts", contract_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Không tìm thấy hợp đồng")
    return Contract(**updated)


# ─── Payment Requests ──────────────────────────────────────────────
@router.get("/{contract_id}/payments", response_model=list[PaymentRequest])
async def list_payments(contract_id: str, _: dict = Depends(get_current_user)):
    records = sm.read_where("payment_requests", contract_id=contract_id)
    return [PaymentRequest(**r) for r in records]


@router.post("/{contract_id}/payments", response_model=PaymentRequest, status_code=201)
async def create_payment(
    contract_id: str, body: PaymentRequestCreate, _: dict = Depends(get_current_user)
):
    contract = sm.read_by_id("contracts", contract_id)
    if not contract:
        raise HTTPException(404, "Không tìm thấy hợp đồng")

    # Business rule: kiểm tra thu hồi tạm ứng trước khi thanh toán
    if body.request_type == "VOLUME_PAYMENT":
        advance_recovery_required = _check_advance_recovery(contract, body.proposed_payment_vnd)
        if advance_recovery_required > body.proposed_advance_recovery_vnd:
            raise HTTPException(
                400,
                f"Phải thu hồi tối thiểu {advance_recovery_required:,.0f} VNĐ tạm ứng trước khi thanh toán"
            )

    data = body.model_dump()
    data["contract_id"] = contract_id
    data["internal_status"] = "DRAFT"
    data["treasury_status"] = "NOT_SENT"

    record = sm.insert("payment_requests", data)
    return PaymentRequest(**record)


@router.put("/{contract_id}/payments/{payment_id}/submit")
async def submit_to_treasury(
    contract_id: str,
    payment_id: str,
    _: dict = Depends(get_current_user)
):
    """Nộp hồ sơ lên Kho bạc Nhà nước, tự động tính SLA deadline."""
    payment = sm.read_by_id("payment_requests", payment_id)
    if not payment:
        raise HTTPException(404, "Không tìm thấy yêu cầu thanh toán")
    if payment.get("treasury_status") != "NOT_SENT":
        raise HTTPException(400, "Hồ sơ đã được nộp lên KBNN")

    sla_deadline = _next_working_day(datetime.utcnow(), days=1)

    sm.update("payment_requests", payment_id, {
        "treasury_status": "SENT",
        "treasury_sla_deadline": sla_deadline.isoformat(),
        "internal_status": "SUBMITTED",
    })

    return {"message": "Đã nộp hồ sơ lên KBNN", "sla_deadline": sla_deadline.isoformat()}


@router.put("/{contract_id}/payments/{payment_id}/treasury-status")
async def update_treasury_status(
    contract_id: str,
    payment_id: str,
    body: TreasuryStatusUpdate,
    _: dict = Depends(get_current_user)
):
    """Cập nhật kết quả phản hồi từ Kho bạc Nhà nước."""
    payment = sm.read_by_id("payment_requests", payment_id)
    if not payment:
        raise HTTPException(404, "Không tìm thấy yêu cầu thanh toán")

    update_data = {
        "treasury_status": body.treasury_status,
        "processed_at": datetime.utcnow().isoformat(),
    }
    if body.treasury_rejection_reason:
        update_data["treasury_rejection_reason"] = body.treasury_rejection_reason

    if body.treasury_status == "APPROVED":
        # Cập nhật tổng đã thanh toán trong hợp đồng
        contract = sm.read_by_id("contracts", contract_id)
        if contract:
            current_paid = float(contract.get("total_paid_volume_vnd", 0) or 0)
            proposed = float(payment.get("proposed_payment_vnd", 0) or 0)
            sm.update("contracts", contract_id, {
                "total_paid_volume_vnd": str(current_paid + proposed)
            })

    sm.update("payment_requests", payment_id, update_data)
    return {"message": f"Cập nhật trạng thái KBNN: {body.treasury_status}"}


@router.get("/payments/sla-overdue")
async def sla_overdue_payments(_: dict = Depends(get_current_user)):
    """Danh sách hồ sơ thanh toán đã quá hạn SLA của KBNN."""
    all_payments = sm.read_all("payment_requests")
    now = datetime.utcnow()
    overdue = []
    for p in all_payments:
        if p.get("treasury_status") in ("SENT", "PROCESSING") and p.get("treasury_sla_deadline"):
            try:
                deadline = datetime.fromisoformat(p["treasury_sla_deadline"])
                if now > deadline:
                    p["overdue_hours"] = round((now - deadline).total_seconds() / 3600, 1)
                    overdue.append(p)
            except ValueError:
                pass
    return overdue


def _check_advance_recovery(contract: dict, payment_amount: float) -> float:
    """Tính số tiền tạm ứng phải thu hồi khi thanh toán (theo quy định 30% mỗi lần)."""
    advance_pct = float(contract.get("advance_percentage", 0) or 0) / 100
    contract_value = float(contract.get("contract_value_vnd", 0) or 0)
    total_advanced = float(contract.get("total_advanced_vnd", 0) or 0)

    if advance_pct == 0 or total_advanced == 0:
        return 0

    # Thu hồi tỷ lệ tương ứng với phần thanh toán
    recovery_rate = payment_amount / contract_value if contract_value > 0 else 0
    required = total_advanced * recovery_rate
    return round(required, 2)


def _next_working_day(dt: datetime, days: int = 1) -> datetime:
    """Tính ngày làm việc tiếp theo (bỏ Thứ 7, Chủ nhật)."""
    count = 0
    result = dt
    while count < days:
        result += timedelta(days=1)
        if result.weekday() < 5:  # 0-4 = Thứ 2 đến Thứ 6
            count += 1
    return result
