from fastapi import APIRouter, HTTPException, Depends
from models import Organization, OrganizationCreate
from middleware.auth import get_current_user
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/organizations", tags=["Tổ chức"])


@router.get("", response_model=list[Organization])
async def list_organizations(_: dict = Depends(get_current_user)):
    records = sm.read_all("organizations")
    return [Organization(**r) for r in records]


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
