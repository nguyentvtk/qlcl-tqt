"""
Module Quyết toán dự án
Business rules (Nghị định 193/2026/NĐ-CP):
- 3 lần cảnh báo nhà thầu (Mẫu 02-QTDA) trước khi lập quyết toán độc lập
- Deadline quyết toán: 6/9/12 tháng sau khi hoàn thành (nhóm C/B/A)
- Phạt chậm nộp: 0.05%/ngày trên giá trị quyết toán
"""
from datetime import datetime, date, timedelta
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from models import (
    Settlement, SettlementCreate,
    Warning, WarningCreate,
)
from middleware.auth import get_current_user
from config import SETTLEMENT_DEADLINE_MONTHS
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/settlements", tags=["Quyết toán"])


# ─── Project Settlements ────────────────────────────────────────────
@router.get("", response_model=list[Settlement])
async def list_settlements(
    project_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    if project_id:
        records = sm.read_where("project_settlements", project_id=project_id)
    else:
        records = sm.read_all("project_settlements")
    return [Settlement(**r) for r in records]


@router.get("/{settlement_id}", response_model=Settlement)
async def get_settlement(settlement_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("project_settlements", settlement_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")
    return Settlement(**r)


@router.post("", response_model=Settlement, status_code=201)
async def create_settlement(body: SettlementCreate, _: dict = Depends(get_current_user)):
    existing = sm.read_where("project_settlements", project_id=body.project_id)
    if existing and any(s["status"] not in ("REJECTED",) for s in existing):
        raise HTTPException(400, "Dự án đã có hồ sơ quyết toán đang xử lý")
    record = sm.insert("project_settlements", body.model_dump())
    return Settlement(**record)


@router.put("/{settlement_id}/audit")
async def audit_settlement(
    settlement_id: str,
    audited_amount: float,
    _: dict = Depends(get_current_user)
):
    """Kiểm toán quyết toán."""
    updated = sm.update("project_settlements", settlement_id, {
        "audited_amount": str(audited_amount),
        "status": "AUDITED",
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")
    return updated


@router.put("/{settlement_id}/approve")
async def approve_settlement(
    settlement_id: str,
    approved_amount: float,
    approved_decision_number: str,
    _: dict = Depends(get_current_user)
):
    """Phê duyệt quyết toán."""
    updated = sm.update("project_settlements", settlement_id, {
        "approved_amount": str(approved_amount),
        "approved_decision_number": approved_decision_number,
        "approved_decision_date": datetime.utcnow().date().isoformat(),
        "status": "APPROVED",
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")
    return updated


@router.get("/{settlement_id}/penalty")
async def calculate_penalty(settlement_id: str, _: dict = Depends(get_current_user)):
    """
    Tính phạt chậm nộp quyết toán (0.05%/ngày trên giá trị quyết toán).
    """
    settlement = sm.read_by_id("project_settlements", settlement_id)
    if not settlement:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")

    deadline_str = settlement.get("submission_deadline")
    approved_amount = float(settlement.get("approved_amount") or settlement.get("proposed_settlement_amount") or 0)

    if not deadline_str:
        return {"penalty_vnd": 0, "overdue_days": 0, "message": "Chưa có deadline quyết toán"}

    try:
        deadline = date.fromisoformat(deadline_str)
    except ValueError:
        return {"penalty_vnd": 0, "overdue_days": 0, "message": "Định dạng ngày không hợp lệ"}

    today = date.today()
    overdue_days = max(0, (today - deadline).days)
    penalty = approved_amount * 0.0005 * overdue_days  # 0.05%/ngày

    return {
        "settlement_id": settlement_id,
        "deadline": deadline_str,
        "today": today.isoformat(),
        "overdue_days": overdue_days,
        "settlement_amount": approved_amount,
        "penalty_rate": "0.05%/ngày",
        "penalty_vnd": round(penalty, 2),
    }


# ─── Contractor Settlement Warnings ────────────────────────────────
@router.get("/warnings", response_model=list[Warning])
async def list_warnings(
    contract_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    if contract_id:
        records = sm.read_where("contractor_settlement_warnings", contract_id=contract_id)
    else:
        records = sm.read_all("contractor_settlement_warnings")
    return [Warning(**r) for r in records]


@router.post("/warnings", response_model=Warning, status_code=201)
async def create_warning(body: WarningCreate, _: dict = Depends(get_current_user)):
    """
    Gửi cảnh báo nhà thầu (tối đa 3 lần).
    Sau 3 lần mà không có phản hồi → lập quyết toán độc lập.
    """
    existing = sm.read_where("contractor_settlement_warnings", contract_id=body.contract_id)
    current_warnings = [w for w in existing if w.get("warning_number") == str(body.warning_number)]
    if current_warnings:
        raise HTTPException(400, f"Cảnh báo lần {body.warning_number} đã được gửi")

    if len(existing) >= 3:
        raise HTTPException(400, "Đã gửi đủ 3 cảnh báo. Có thể lập quyết toán độc lập.")

    record = sm.insert("contractor_settlement_warnings", body.model_dump())
    return Warning(**record)


@router.put("/warnings/{warning_id}/delivered")
async def mark_warning_delivered(warning_id: str, _: dict = Depends(get_current_user)):
    updated = sm.update("contractor_settlement_warnings", warning_id, {
        "is_delivered": "TRUE"
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


@router.put("/warnings/{warning_id}/response")
async def update_warning_response(
    warning_id: str,
    response_status: str,
    _: dict = Depends(get_current_user)
):
    valid_statuses = ["NO_RESPONSE", "PARTIAL_RESPONSE", "FULL_RESPONSE"]
    if response_status not in valid_statuses:
        raise HTTPException(400, f"Trạng thái phải là: {', '.join(valid_statuses)}")

    updated = sm.update("contractor_settlement_warnings", warning_id, {
        "contractor_response_status": response_status
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


@router.get("/warnings/overdue")
async def overdue_warnings(_: dict = Depends(get_current_user)):
    """Danh sách cảnh báo đã quá hạn phản hồi nhưng không có phản hồi."""
    all_warnings = sm.read_all("contractor_settlement_warnings")
    today = date.today()
    overdue = []
    for w in all_warnings:
        if (w.get("contractor_response_status") == "NO_RESPONSE"
                and w.get("response_deadline")):
            try:
                deadline = date.fromisoformat(w["response_deadline"])
                if today > deadline:
                    w["overdue_days"] = (today - deadline).days
                    overdue.append(w)
            except ValueError:
                pass
    return overdue
