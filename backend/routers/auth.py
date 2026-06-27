from fastapi import APIRouter, Depends, HTTPException
from models import LoginRequest, UserCreate, TokenResponse, User
from middleware.auth import hash_password, create_token, get_current_user
from config import NHANSU_GID
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


def _find_nhansu_user(login_id: str, password: str) -> dict | None:
    """
    Tìm user trong sheet Nhân sự (gid=NHANSU_GID).
    Col A(0)=Mã NV  B(1)=Họ tên  C(2)=Email  D(3)=SĐT  H(7)=Mật khẩu
    Hỗ trợ cả SHA-256 hash lẫn plain-text password.
    """
    try:
        rows = sm.read_raw_values_by_gid(NHANSU_GID)
    except Exception:
        return None

    if not rows or len(rows) < 2:
        return None

    login_norm = login_id.strip().lower()

    for row in rows[1:]:          # bỏ qua header row
        if len(row) < 8:
            continue
        ma_nv  = row[0].strip()
        ho_ten = row[1].strip() if len(row) > 1 else ""
        email  = row[2].strip()
        phone  = row[3].strip()
        pwd    = row[7].strip()

        if not pwd:
            continue

        # Khớp theo Mã NV, Email, hoặc SĐT
        if login_norm not in (ma_nv.lower(), email.lower(), phone.lower()):
            continue

        # Kiểm tra mật khẩu — thử SHA-256 trước rồi plain text
        if pwd == hash_password(password) or pwd == password:
            return {
                "id": ma_nv or email,
                "email": email,
                "phone": phone,
                "full_name": ho_ten,
                "role": "PROJECT_MANAGEMENT",
                "organization_id": "",
            }

    return None


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    # 1. Thử sheet Nhân sự (Mã NV / Email / SĐT)
    nhansu = _find_nhansu_user(body.email, body.password)
    if nhansu:
        token_data = {
            "sub":             nhansu["id"],
            "email":           nhansu["email"],
            "role":            nhansu["role"],
            "full_name":       nhansu["full_name"],
            "organization_id": nhansu["organization_id"],
            "phone":           nhansu["phone"],
        }
        return TokenResponse(
            access_token=create_token(token_data),
            user=User(
                id=nhansu["id"],
                organization_id=nhansu["organization_id"],
                full_name=nhansu["full_name"],
                email=nhansu["email"],
                phone=nhansu["phone"],
                role=nhansu["role"],
                professional_certificate_code=None,
                created_at=None,
            )
        )

    # 2. Fallback: sheet users (tài khoản tạo trong app)
    try:
        users = sm.read_where("users", email=body.email)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="Chưa cấu hình Google Credentials. Vào Vercel → Settings → Environment Variables → thêm GOOGLE_CREDENTIALS_JSON."
        )
    if not users:
        raise HTTPException(status_code=401, detail="Không tìm thấy tài khoản")

    user = users[0]
    if user.get("password_hash") != hash_password(body.password):
        raise HTTPException(status_code=401, detail="Mật khẩu không đúng")

    token_data = {
        "sub":             str(user["id"]),
        "email":           user["email"],
        "role":            user["role"],
        "full_name":       user["full_name"],
        "organization_id": str(user.get("organization_id", "")),
    }
    return TokenResponse(
        access_token=create_token(token_data),
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
    # Thử sheet users trước
    users = sm.read_where("users", email=current_user["email"])
    if users:
        u = users[0]
        u.pop("password_hash", None)
        return User(**u)

    # Fallback: dùng thông tin trong JWT (đăng nhập qua sheet Nhân sự)
    return User(
        id=current_user.get("sub", ""),
        organization_id=current_user.get("organization_id", ""),
        full_name=current_user.get("full_name", ""),
        email=current_user.get("email", ""),
        phone=current_user.get("phone", ""),
        role=current_user.get("role", "PROJECT_MANAGEMENT"),
        professional_certificate_code=None,
        created_at=None,
    )
