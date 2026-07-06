"""
Webapp Quản lý chất lượng thi công & Thanh quyết toán
Theo Nghị định 207/2026/NĐ-CP, 193/2026/NĐ-CP, 254/2025/NĐ-CP
Backend: FastAPI | Storage: Google Sheets API v4
"""
import sys
import os

# Vercel runs from /var/task (repo root); add backend/ so local imports resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Literal

from config import ALLOWED_ORIGINS, SKIP_MIGRATION
from middleware.auth import get_current_user
import sheets_manager as sm
from schema_definitions import DEFAULT_DOSSIER_GROUPS, DEFAULT_DOSSIER_TEMPLATES
from services.stamp_overlay import overlay_stamp

from routers import (
    auth as auth_router,
    organizations as org_router,
    projects as project_router,
    dossiers as dossier_router,
    contracts as contract_router,
    settlements as settlement_router,
    cpm as cpm_router,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: migrate schema, seed master data."""
    if SKIP_MIGRATION:
        print("ℹ️  Schema migration bị bỏ qua (SKIP_MIGRATION=true)")
        yield
        return

    print("⏳ Đang migrate schema Google Sheets...")
    try:
        added = sm.ensure_all_schemas()
        for sheet, cols in added.items():
            if cols:
                print(f"  ✅ [{sheet}] Đã thêm cột: {cols}")
            else:
                print(f"  ✓  [{sheet}] Schema đã đủ")

        _seed_master_data()
        print("✅ Startup hoàn tất")
    except Exception as e:
        print(f"⚠️  Lỗi startup: {e}")
        print("   Kiểm tra credentials/service_account.json và SPREADSHEET_ID")
    yield


def _seed_master_data():
    groups = sm.read_all("dossier_groups")
    if not groups:
        print("  📦 Seeding dossier_groups...")
        for g in DEFAULT_DOSSIER_GROUPS:
            sm.insert("dossier_groups", g)

    templates = sm.read_all("dossier_templates")
    if not templates:
        print("  📦 Seeding dossier_templates...")
        for t in DEFAULT_DOSSIER_TEMPLATES:
            sm.insert("dossier_templates", t)


app = FastAPI(
    title="WA Quản lý Chất lượng & Thanh Quyết toán",
    description="Webapp theo Nghị định 207/2026/NĐ-CP",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router.router)
app.include_router(org_router.router)
app.include_router(project_router.router)
app.include_router(dossier_router.router)
app.include_router(contract_router.router)
app.include_router(settlement_router.router)
app.include_router(cpm_router.router)


# ─── As-Built Stamp Overlay ──────────────────────────────────────
@app.post("/api/v1/dossiers/as-built-stamp", status_code=201, tags=["Dấu hoàn công"])
async def api_overlay_as_built_stamp(
    file: UploadFile = File(...),
    pattern: int = Form(...),
    contractor_name: str = Form(...),
    day: str = Form(...),
    month: str = Form(...),
    year: str = Form(...),
    signer_1: str = Form(...),
    signer_2: str = Form(...),
    signer_3: str = Form(...),
    signer_4: Optional[str] = Form(None),
    pages_option: str = Form("all"),
    _: dict = Depends(get_current_user)
):
    if pattern not in (1, 2):
        raise HTTPException(400, "pattern phải là 1 (thông thường) hoặc 2 (EPC)")
    if pages_option not in ("all", "last"):
        raise HTTPException(400, "pages_option phải là 'all' hoặc 'last'")

    content = await file.read()
    if not content:
        raise HTTPException(400, "File không được rỗng")

    try:
        result_bytes = overlay_stamp(
            input_pdf_bytes=content,
            pattern=pattern,
            contractor_name=contractor_name,
            day=day, month=month, year=year,
            signer_1=signer_1, signer_2=signer_2, signer_3=signer_3,
            signer_4=signer_4,
            pages_option=pages_option,
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, f"Lỗi xử lý PDF: {e}")

    filename = f"hoanCong_{file.filename}"
    return Response(
        content=result_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─── Dashboard ───────────────────────────────────────────────────
@app.get("/api/v1/dashboard", tags=["Dashboard"])
async def dashboard(_: dict = Depends(get_current_user)):
    """Thống kê tổng hợp cho dashboard — đọc trực tiếp từ sheet gốc tiếng Việt."""
    def safe_read_vi(sheet_name: str) -> list:
        try:
            return sm.read_sheet_by_name_raw(sheet_name)
        except Exception:
            return []

    def safe_read_app(sheet_name: str) -> list:
        try:
            return sm.read_all(sheet_name)
        except Exception:
            return []

    # Sheet gốc (tiếng Việt)
    du_an_rows      = safe_read_vi("Dự án")
    goi_thau_rows   = safe_read_vi("Gói thầu")
    hop_dong_rows   = safe_read_vi("Hợp đồng")
    nghiem_thu_rows = safe_read_vi("Nghiệm thu")
    nha_thau_rows   = safe_read_vi("Nhà thầu")
    quyet_toan_rows = safe_read_vi("Quyết toán DAHT")

    # App-managed (bổ sung)
    app_projects      = safe_read_app("projects")
    app_constructions = safe_read_app("constructions")
    app_dossiers      = safe_read_app("construction_dossiers")
    app_payments      = safe_read_app("payment_requests")
    warnings          = safe_read_app("contractor_settlement_warnings")

    # Tổng hợp không trùng
    vi_project_codes = {str(r.get("Mã DA", "")).strip() for r in du_an_rows if r.get("Mã DA")}
    app_project_codes = {str(r.get("project_code", "")).strip() for r in app_projects}
    total_projects = len(vi_project_codes | app_project_codes)

    vi_gt_ids = {f"{str(r.get('Mã DA','')).strip()}_{str(r.get('Mã GT','')).strip()}" for r in goi_thau_rows if r.get("Mã GT")}
    app_gt_ids = {str(r.get("id", "")).strip() for r in app_constructions}
    total_constructions = len(vi_gt_ids | app_gt_ids)

    total_contracts = len(hop_dong_rows) + len(app_payments)  # contract count
    active_contracts = len([r for r in hop_dong_rows if str(r.get("Trạng thái HĐ","")).strip() not in ("Đã hết hạn","Đã quyết toán","Thanh lý")])

    total_nt = len(nghiem_thu_rows) + len(app_dossiers)
    pending_nt = len([r for r in nghiem_thu_rows if "Chờ" in str(r.get("Trạng thái HSNT",""))]) + \
                 len([d for d in app_dossiers if d.get("status") == "PENDING"])
    approved_nt = len([r for r in nghiem_thu_rows if "Đã thanh toán" in str(r.get("Trạng thái HSNT",""))]) + \
                  len([d for d in app_dossiers if d.get("status") == "APPROVED"])

    total_organizations = len([r for r in nha_thau_rows if r.get("Tên Nhà thầu")])

    payments_draft = len([p for p in app_payments if p.get("internal_status") == "DRAFT"])
    unresponded_warnings = len([w for w in warnings if w.get("contractor_response_status") == "NO_RESPONSE"])

    return {
        "projects_total": total_projects,
        "constructions_total": total_constructions,
        "contracts_total": len(hop_dong_rows),
        "contracts_active": active_contracts,
        "dossiers_total": total_nt,
        "dossiers_pending": pending_nt,
        "dossiers_approved": approved_nt,
        "organizations_total": total_organizations,
        "settlements_total": len([r for r in quyet_toan_rows if r.get("Mã QT")]),
        "payments_total": len(app_payments),
        "payments_draft": payments_draft,
        "warnings_unresponded": unresponded_warnings,
    }


# ─── Health check ────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "app": "WA QLCL-TQT", "version": "1.0.0"}


# ─── Serve frontend static files ─────────────────────────────────
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
