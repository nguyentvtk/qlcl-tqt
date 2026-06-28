from fastapi import APIRouter, HTTPException, Depends
from models import Organization, OrganizationCreate
from middleware.auth import get_current_user
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/organizations", tags=["Tổ chức"])


def _map_nha_thau_row(r: dict) -> Organization | None:
    """Chuyển hàng sheet 'Nhà thầu' sang Organization model."""
    ma   = str(r.get("Mã số Nhà thầu", "")).strip()
    ten  = str(r.get("Tên Nhà thầu", "")).strip()
    if not ten:
        return None
    return Organization(
        id=ma or ten,
        name=ten,
        tax_code=ma or None,
        address=str(r.get("Địa chỉ", "")) or None,
        phone=str(r.get("Đại diện", "")) or None,   # dùng Đại diện làm phone tạm
    )


@router.get("", response_model=list[Organization])
async def list_organizations(_: dict = Depends(get_current_user)):
    # 1. Sheet "Nhà thầu" (dữ liệu gốc)
    result: list[Organization] = []
    seen_names: set[str] = set()
    for row in sm.read_sheet_by_name_raw("Nhà thầu"):
        o = _map_nha_thau_row(row)
        if o and o.name not in seen_names:
            result.append(o)
            seen_names.add(o.name)

    # 2. Bổ sung từ sheet "organizations" (app-created)
    for r in sm.read_all("organizations"):
        try:
            o = Organization(**r)
            if o.name not in seen_names:
                result.append(o)
                seen_names.add(o.name)
        except Exception:
            pass

    return result


@router.get("/{org_id}", response_model=Organization)
async def get_organization(org_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("organizations", org_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy tổ chức")
    return Organization(**r)


@router.post("", response_model=Organization, status_code=201)
async def create_organization(body: OrganizationCreate, _: dict = Depends(get_current_user)):
    if body.tax_code:
        existing = sm.read_where("organizations", tax_code=body.tax_code)
        if existing:
            raise HTTPException(400, "Mã số thuế đã tồn tại")
    record = sm.insert("organizations", body.model_dump())
    return Organization(**record)


@router.put("/{org_id}", response_model=Organization)
async def update_organization(org_id: str, body: OrganizationCreate, _: dict = Depends(get_current_user)):
    updated = sm.update("organizations", org_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Không tìm thấy tổ chức")
    return Organization(**updated)
