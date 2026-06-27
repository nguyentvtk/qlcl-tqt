from fastapi import APIRouter, Depends, HTTPException
from models import LoginRequest, UserCreate, TokenResponse, User
from middleware.auth import hash_password, create_token, get_current_user
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    users = sm.read_where("users", email=body.email)
    if not users:
        raise HTTPException(status_code=401, detail="Email không tồn tại")

    user = users[0]
    if user.get("password_hash") != hash_password(body.password):
        raise HTTPException(status_code=401, detail="Mật khẩu không đúng")

    token_data = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "full_name": user["full_name"],
        "organization_id": str(user.get("organization_id", "")),
    }
    token = create_token(token_data)

    return TokenResponse(
        access_token=token,
        user=User(
            id=str(user["id"]),
            organization_id=str(user.get("organization_id", "")),
            full_name=user["full_name"],
            email=user["email"],
            phone=user.get("phone", ""),
            role=user["role"],
            professional_certificate_code=user.get("professional_certificate_code"),
            created_at=user.get("created_at"),
        )
    )


@router.post("/register", response_model=User, status_code=201)
async def register(body: UserCreate):
    existing = sm.read_where("users", email=body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email đã được đăng ký")

    data = body.model_dump()
    data["password_hash"] = hash_password(data.pop("password"))

    record = sm.insert("users", data)
    record.pop("password_hash", None)
    return User(**record)


@router.get("/me", response_model=User)
async def me(current_user: dict = Depends(get_current_user)):
    users = sm.read_where("users", email=current_user["email"])
    if not users:
        raise HTTPException(status_code=404, detail="Người dùng không tìm thấy")
    u = users[0]
    u.pop("password_hash", None)
    return User(**u)
