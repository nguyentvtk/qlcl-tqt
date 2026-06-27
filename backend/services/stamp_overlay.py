"""
Dấu hoàn công overlay service.
- Mẫu số 1: Hợp đồng thông thường (4 chữ ký: BQLDA, TVGS, NTC, TKGS)
- Mẫu số 2: Hợp đồng EPC / Thầu phụ (3 chữ ký)
- Overlay lên tất cả trang hoặc trang cuối
"""
import io
import os
from datetime import datetime
from typing import Literal, Optional

try:
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    HAS_PDF_LIBS = True
except ImportError:
    HAS_PDF_LIBS = False


STAMP_WIDTH = 120 * mm
STAMP_HEIGHT = 55 * mm
MARGIN_RIGHT = 15 * mm
MARGIN_BOTTOM = 15 * mm


def _build_stamp_pdf(
    pattern: Literal[1, 2],
    contractor_name: str,
    day: str, month: str, year: str,
    signer_1: str, signer_2: str, signer_3: str,
    signer_4: Optional[str] = None,
    page_size=(A4[0], A4[1])
) -> bytes:
    """Tạo PDF chứa dấu hoàn công để overlay."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=page_size)

    # Vị trí dấu (góc dưới bên phải)
    x = page_size[0] - STAMP_WIDTH - MARGIN_RIGHT
    y = MARGIN_BOTTOM

    # Khung dấu
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.5)
    c.rect(x, y, STAMP_WIDTH, STAMP_HEIGHT)

    # Tiêu đề
    c.setFont("Helvetica-Bold", 7)
    title = "BẢN VẼ HOÀN CÔNG" if pattern == 1 else "BẢN VẼ HOÀN CÔNG (EPC)"
    c.drawCentredString(x + STAMP_WIDTH / 2, y + STAMP_HEIGHT - 8 * mm, title)

    # Nhà thầu
    c.setFont("Helvetica", 6)
    c.drawString(x + 2 * mm, y + STAMP_HEIGHT - 14 * mm, f"Nhà thầu: {contractor_name}")

    # Ngày tháng
    date_str = f"Ngày {day} tháng {month} năm {year}"
    c.drawString(x + 2 * mm, y + STAMP_HEIGHT - 20 * mm, date_str)

    # Đường kẻ ngang chia cột chữ ký
    c.line(x, y + 28 * mm, x + STAMP_WIDTH, y + 28 * mm)

    # Chữ ký
    if pattern == 1:
        labels = [
            ("BQLDA", signer_1, x + STAMP_WIDTH * 0.125),
            ("TVGS", signer_2, x + STAMP_WIDTH * 0.375),
            ("NTC", signer_3, x + STAMP_WIDTH * 0.625),
            ("TKGS", signer_4 or "", x + STAMP_WIDTH * 0.875),
        ]
    else:
        labels = [
            ("BQLDA", signer_1, x + STAMP_WIDTH * 0.167),
            ("TVGS", signer_2, x + STAMP_WIDTH * 0.5),
            ("NTC", signer_3, x + STAMP_WIDTH * 0.833),
        ]

    for label, name, cx in labels:
        c.setFont("Helvetica-Bold", 5.5)
        c.drawCentredString(cx, y + 24 * mm, label)
        c.setFont("Helvetica", 5)
        c.drawCentredString(cx, y + 10 * mm, name[:20] if name else "")

    # Đường kẻ dọc phân cách
    n_cols = 4 if pattern == 1 else 3
    for i in range(1, n_cols):
        col_x = x + STAMP_WIDTH * i / n_cols
        c.line(col_x, y, col_x, y + 28 * mm)

    c.save()
    packet.seek(0)
    return packet.read()


def overlay_stamp(
    input_pdf_bytes: bytes,
    pattern: Literal[1, 2],
    contractor_name: str,
    day: str, month: str, year: str,
    signer_1: str, signer_2: str, signer_3: str,
    signer_4: Optional[str] = None,
    pages_option: Literal["all", "last"] = "all"
) -> bytes:
    """
    Overlay dấu hoàn công lên PDF.
    Trả về PDF mới dưới dạng bytes.
    """
    if not HAS_PDF_LIBS:
        raise RuntimeError(
            "Thiếu thư viện PDF. Chạy: pip install pypdf reportlab"
        )

    reader = PdfReader(io.BytesIO(input_pdf_bytes))
    writer = PdfWriter()

    total_pages = len(reader.pages)
    stamp_pages = set(range(total_pages)) if pages_option == "all" else {total_pages - 1}

    for page_idx in range(total_pages):
        page = reader.pages[page_idx]
        page_w = float(page.mediabox.width)
        page_h = float(page.mediabox.height)

        if page_idx in stamp_pages:
            stamp_bytes = _build_stamp_pdf(
                pattern, contractor_name, day, month, year,
                signer_1, signer_2, signer_3, signer_4,
                page_size=(page_w, page_h)
            )
            stamp_reader = PdfReader(io.BytesIO(stamp_bytes))
            page.merge_page(stamp_reader.pages[0])

        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output.read()
