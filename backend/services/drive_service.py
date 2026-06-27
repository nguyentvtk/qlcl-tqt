"""
Google Drive upload service.
Uploads files to a shared Drive folder, makes them publicly readable,
and returns the shareable view/download links.
"""
import io
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2.service_account import Credentials

import config

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


def _service():
    creds = Credentials.from_service_account_file(config.GOOGLE_CREDENTIALS_FILE, scopes=_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def upload_file(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    """
    Upload file to configured Drive folder.
    Returns dict: { id, webViewLink, webContentLink }
    """
    svc = _service()

    metadata = {"name": filename}
    if config.GOOGLE_DRIVE_FOLDER_ID:
        metadata["parents"] = [config.GOOGLE_DRIVE_FOLDER_ID]

    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=True)
    uploaded = svc.files().create(
        body=metadata,
        media_body=media,
        fields="id,webViewLink,webContentLink",
    ).execute()

    # Public read-only so anyone with the link can view
    svc.permissions().create(
        fileId=uploaded["id"],
        body={"type": "anyone", "role": "reader"},
    ).execute()

    return uploaded


def delete_file(file_id: str) -> None:
    """Delete a Drive file by ID (soft cleanup, does not raise on failure)."""
    try:
        _service().files().delete(fileId=file_id).execute()
    except Exception:
        pass
