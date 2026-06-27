from fastapi import APIRouter, HTTPException, Depends
from models import (
    Project, ProjectCreate,
    Construction, ConstructionCreate,
    Participant, ParticipantCreate,
)
from middleware.auth import get_current_user
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/projects", tags=["Dự án"])


# ─── Projects ──────────────────────────────────────────────────────
@router.get("", response_model=list[Project])
async def list_projects(_: dict = Depends(get_current_user)):
    return [Project(**r) for r in sm.read_all("projects")]


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("projects", project_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy dự án")
    return Project(**r)


@router.post("", response_model=Project, status_code=201)
async def create_project(body: ProjectCreate, user: dict = Depends(get_current_user)):
    existing = sm.read_where("projects", project_code=body.project_code)
    if existing:
        raise HTTPException(400, "Mã dự án đã tồn tại")
    record = sm.insert("projects", body.model_dump())
    return Project(**record)


@router.put("/{project_id}", response_model=Project)
async def update_project(project_id: str, body: ProjectCreate, _: dict = Depends(get_current_user)):
    updated = sm.update("projects", project_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Không tìm thấy dự án")
    return Project(**updated)


# ─── Constructions ─────────────────────────────────────────────────
@router.get("/{project_id}/constructions", response_model=list[Construction])
async def list_constructions(project_id: str, _: dict = Depends(get_current_user)):
    records = sm.read_where("constructions", project_id=project_id)
    return [Construction(**r) for r in records]


@router.post("/{project_id}/constructions", response_model=Construction, status_code=201)
async def create_construction(
    project_id: str, body: ConstructionCreate, _: dict = Depends(get_current_user)
):
    # Xác nhận dự án tồn tại
    project = sm.read_by_id("projects", project_id)
    if not project:
        raise HTTPException(404, "Không tìm thấy dự án")

    data = body.model_dump()
    data["project_id"] = project_id
    record = sm.insert("constructions", data)
    return Construction(**record)


@router.get("/constructions/{construction_id}", response_model=Construction)
async def get_construction(construction_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("constructions", construction_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy hạng mục công trình")
    return Construction(**r)


@router.put("/constructions/{construction_id}", response_model=Construction)
async def update_construction(
    construction_id: str, body: ConstructionCreate, _: dict = Depends(get_current_user)
):
    updated = sm.update("constructions", construction_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Không tìm thấy hạng mục công trình")
    return Construction(**updated)


# ─── Project Participants ──────────────────────────────────────────
@router.get("/{project_id}/participants", response_model=list[Participant])
async def list_participants(project_id: str, _: dict = Depends(get_current_user)):
    records = sm.read_where("project_participants", project_id=project_id)
    return [Participant(**r) for r in records]


@router.post("/{project_id}/participants", response_model=Participant, status_code=201)
async def add_participant(
    project_id: str, body: ParticipantCreate, _: dict = Depends(get_current_user)
):
    data = body.model_dump()
    data["project_id"] = project_id
    record = sm.insert("project_participants", data)
    return Participant(**record)
