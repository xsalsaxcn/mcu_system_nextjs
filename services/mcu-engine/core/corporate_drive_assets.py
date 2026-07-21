# -*- coding: utf-8 -*-
"""Google Drive storage khusus aset MCU Corporate.

File biner (foto profil, rontgen, EKG, treadmill, spirometri, audiometri,
dan USG) disimpan langsung ke Google Drive. Modul ini sengaja terpisah
dari alur CAPASKA, Vaksinasi, dan Wellness.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
FOLDER_MIME = "application/vnd.google-apps.folder"


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _safe_folder_name(value: Any, fallback: str = "-") -> str:
    text = _clean(value) or fallback
    text = re.sub(r'[\\/:*?"<>|]+', "-", text)
    text = re.sub(r"\s+", " ", text).strip(" .-")
    return (text or fallback)[:150]


def extract_drive_file_id(value: Any) -> str:
    text = _clean(value)
    if not text:
        return ""
    if text.lower().startswith("gdrive://"):
        return text[9:].split("?")[0].split("#")[0].strip("/")
    patterns = [
        r"drive\.google\.com/file/d/([^/?#]+)",
        r"drive\.google\.com/open\?id=([^&#]+)",
        r"drive\.google\.com/uc\?.*?[?&]id=([^&#]+)",
        r"drive\.google\.com/thumbnail\?.*?[?&]id=([^&#]+)",
        r"[?&]id=([^&#]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return match.group(1).strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{10,}", text):
        return text
    return ""


def extract_folder_id(value: Any) -> str:
    text = _clean(value)
    if not text:
        return ""
    match = re.search(r"drive\.google\.com/drive/(?:u/\d+/)?folders/([^/?#]+)", text, flags=re.I)
    if match:
        return match.group(1).strip()
    return extract_drive_file_id(text)


def _credentials_from_env(app_root: Optional[Path] = None):
    raw = _clean(os.environ.get("GDRIVE_CREDENTIALS"))
    google_raw = _clean(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))
    candidates = []

    if raw:
        if raw.startswith("{"):
            info = json.loads(raw)
            return service_account.Credentials.from_service_account_info(info, scopes=[DRIVE_SCOPE])
        try:
            decoded = base64.b64decode(raw, validate=True).decode("utf-8")
            if decoded.lstrip().startswith("{"):
                info = json.loads(decoded)
                return service_account.Credentials.from_service_account_info(info, scopes=[DRIVE_SCOPE])
        except Exception:
            pass
        candidates.append(Path(raw))

    if google_raw:
        candidates.append(Path(google_raw))

    root = Path(app_root or Path(__file__).resolve().parents[1])
    candidates.extend([
        root / "credentials.json",
        root / "core" / "credentials.json",
        Path.cwd() / "credentials.json",
    ])

    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_file():
                return service_account.Credentials.from_service_account_file(str(candidate), scopes=[DRIVE_SCOPE])
        except Exception:
            continue

    raise RuntimeError(
        "Kredensial Google Drive belum ditemukan. Gunakan GDRIVE_CREDENTIALS "
        "(path/JSON/base64 JSON) atau GOOGLE_APPLICATION_CREDENTIALS pada Python MCU Engine."
    )


def get_drive_service(app_root: Optional[Path] = None):
    credentials = _credentials_from_env(app_root)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def resolve_base_folder_id(explicit: Any = "", fallback: Any = "") -> str:
    candidates = [
        explicit,
        os.environ.get("AI_MCU_GOOGLE_DRIVE_FOLDER_ID"),
        os.environ.get("AI_MCU_GOOGLE_DRIVE_FOLDER_URL"),
        os.environ.get("AI_MCU_GDRIVE_BASE_FOLDER"),
        os.environ.get("GDRIVE_BASE_FOLDER"),
        os.environ.get("GOOGLE_DRIVE_FOLDER_ID"),
        os.environ.get("GOOGLE_DRIVE_FOLDER_URL"),
        fallback,
    ]
    for candidate in candidates:
        folder_id = extract_folder_id(candidate)
        if folder_id:
            return folder_id
    raise RuntimeError(
        "Folder induk Google Drive MCU belum ditemukan. Gunakan folder yang sudah disetting "
        "melalui AI_MCU_GOOGLE_DRIVE_FOLDER_ID/URL atau GDRIVE_BASE_FOLDER pada Python MCU Engine."
    )


def _escape_query(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def find_or_create_folder(service, parent_id: str, folder_name: str) -> str:
    name = _safe_folder_name(folder_name)
    query = (
        f"name = '{_escape_query(name)}' and mimeType = '{FOLDER_MIME}' "
        f"and '{_escape_query(parent_id)}' in parents and trashed = false"
    )
    result = service.files().list(
        q=query,
        spaces="drive",
        fields="files(id,name)",
        pageSize=10,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    files = result.get("files") or []
    if files:
        return str(files[0]["id"])
    created = service.files().create(
        body={"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]},
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return str(created["id"])


def ensure_folder_path(service, base_folder_id: str, parts: list[str]) -> Tuple[str, str]:
    current = base_folder_id
    cleaned_parts = []
    for part in parts:
        safe = _safe_folder_name(part)
        current = find_or_create_folder(service, current, safe)
        cleaned_parts.append(safe)
    return current, " / ".join(cleaned_parts)


def _find_file(service, folder_id: str, filename: str) -> Optional[Dict[str, Any]]:
    query = (
        f"name = '{_escape_query(filename)}' and '{_escape_query(folder_id)}' in parents "
        "and trashed = false"
    )
    result = service.files().list(
        q=query,
        spaces="drive",
        fields="files(id,name,webViewLink,mimeType)",
        pageSize=10,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    files = result.get("files") or []
    return files[0] if files else None


def upload_or_replace_bytes(
    service,
    folder_id: str,
    filename: str,
    content: bytes,
    mime_type: str,
    description: str = "",
) -> Dict[str, Any]:
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=True)
    existing = _find_file(service, folder_id, filename)
    body: Dict[str, Any] = {"name": filename, "description": description}

    if existing:
        item = service.files().update(
            fileId=existing["id"],
            body=body,
            media_body=media,
            fields="id,name,mimeType,size,webViewLink,thumbnailLink,modifiedTime",
            supportsAllDrives=True,
        ).execute()
    else:
        body["parents"] = [folder_id]
        item = service.files().create(
            body=body,
            media_body=media,
            fields="id,name,mimeType,size,webViewLink,thumbnailLink,modifiedTime",
            supportsAllDrives=True,
        ).execute()

    file_id = str(item["id"])
    item["storageRef"] = f"gdrive://{file_id}"
    item["driveUrl"] = item.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"
    item["directViewUrl"] = f"https://drive.google.com/uc?export=view&id={file_id}"
    return item


def download_file_bytes(file_id_or_url: Any, app_root: Optional[Path] = None) -> Tuple[bytes, str]:
    file_id = extract_drive_file_id(file_id_or_url)
    if not file_id:
        raise ValueError("Google Drive file ID tidak valid.")
    service = get_drive_service(app_root)
    metadata = service.files().get(
        fileId=file_id,
        fields="id,name,mimeType,size",
        supportsAllDrives=True,
    ).execute()
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _status, done = downloader.next_chunk()
    return buffer.getvalue(), _clean(metadata.get("mimeType")) or "application/octet-stream"
