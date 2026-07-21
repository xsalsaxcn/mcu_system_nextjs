from __future__ import annotations

import math
import os
import re
import sys
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# =========================================================
# AI MCU PDF Engine API untuk Next.js
# =========================================================
# File ini TIDAK mengganti main.py Streamlit lama.
# Fungsinya hanya bridge API agar Next.js bisa memanggil fitur yang sudah benar:
# - core/pdf_service_gs_port.py sebagai renderer PDF final
# - 1 peserta = 1 PDF
# - PDF gabungan untuk print
# - upload Google Drive via core/gdrive_api.py
# - penamaan file memakai NIK/Kode + Nama + No Urut/No MCU
# =========================================================

APP_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = APP_ROOT / "storage" / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from core.pdf_service_gs_port import build_mcu_pdf_bytes_gs_port

GDRIVE_OK = False
GDRIVE_UPLOAD_OK = False
_GDRIVE_IMPORT_ERROR = ""
_GDRIVE_UPLOAD_IMPORT_ERROR = ""

try:
    from core.gdrive_api import get_drive_service, extract_folder_id, find_or_create_folder
    GDRIVE_OK = True
except Exception as e:
    _GDRIVE_IMPORT_ERROR = str(e)

try:
    from googleapiclient.http import MediaFileUpload
    GDRIVE_UPLOAD_OK = True
except Exception as e:
    _GDRIVE_UPLOAD_IMPORT_ERROR = str(e)

app = FastAPI(title="AI MCU PDF Engine", version="1.0.0")
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")

from core.ml_routes import router as ml_router
app.include_router(ml_router)

def _safe_filename(name: str) -> str:
    s = re.sub(r'[\\/:*?"<>|]+', "_", str(name or "")).strip()
    s = re.sub(r"\s+", " ", s).strip()
    return s[:180] if len(s) > 180 else s


def _clean_filename_part(value: Any, fallback: str = "-") -> str:
    s = str(value or "").strip()
    if not s or s.lower() in {"nan", "none", "null"}:
        s = fallback
    s = re.sub(r'[\\/:*?"<>|]+', "_", s)
    s = re.sub(r"\s+", "_", s).strip("_")
    return s or fallback


def _norm_col(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _pick_first_value_from_df(df: pd.DataFrame, aliases: List[str], fallback: str = "") -> str:
    if df is None or df.empty:
        return fallback

    col_map = {_norm_col(c): c for c in df.columns}

    for alias in aliases:
        key = _norm_col(alias)
        if key in col_map:
            col = col_map[key]
            for val in df[col].tolist():
                s = str(val or "").strip()
                if s and s.lower() not in {"nan", "none", "null", "-"}:
                    return s

    for alias in aliases:
        key = _norm_col(alias)
        for ncol, original in col_map.items():
            if key and (key in ncol or ncol in key):
                for val in df[original].tolist():
                    s = str(val or "").strip()
                    if s and s.lower() not in {"nan", "none", "null", "-"}:
                        return s

    return fallback


def _find_name_column(df: pd.DataFrame) -> Optional[str]:
    if df is None or df.empty:
        return None
    for col in df.columns:
        n = _norm_col(col)
        if n in {"nama", "name", "namapeserta", "patientname"}:
            return col
    for col in df.columns:
        if "nama" in _norm_col(col):
            return col
    return None


def _filter_df_by_name(df: pd.DataFrame, name: str) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    name_col = _find_name_column(df)
    if not name_col:
        return df.copy()
    target = str(name or "").strip().lower()
    mask = df[name_col].astype(str).str.strip().str.lower() == target
    out = df.loc[mask].copy()
    if not out.empty:
        return out
    mask = df[name_col].astype(str).str.lower().str.contains(re.escape(target), na=False)
    out = df.loc[mask].copy()
    return out if not out.empty else df.copy()


def _unique_names_from_df(df: pd.DataFrame) -> List[str]:
    name_col = _find_name_column(df)
    if not name_col:
        return []
    return (
        df[name_col]
        .dropna()
        .astype(str)
        .map(lambda x: x.strip())
        .loc[lambda s: s.ne("")]
        .drop_duplicates()
        .tolist()
    )


def _make_pdf_filename_for_print(nm: str, rekap_rows: pd.DataFrame) -> str:
    kode_karyawan = _pick_first_value_from_df(
        rekap_rows,
        ["NIK/NRP/ID", "NIK NRP ID", "NIK", "NRP", "ID", "KODE KARYAWAN", "Kode Karyawan"],
        fallback="-",
    )
    no_urut_mcu = _pick_first_value_from_df(
        rekap_rows,
        ["NO.URUT", "NO URUT", "NO.URUT MCU", "NO URUT MCU", "NOMOR URUT", "NOMOR URUT MCU", "URUT MCU"],
        fallback="",
    )
    if not no_urut_mcu:
        no_urut_mcu = _pick_first_value_from_df(rekap_rows, ["NOMCU", "NO MCU", "NO.MCU", "MCU_ID"], fallback="-")
    nama_file = _clean_filename_part(nm, "-")
    return _safe_filename(f"{kode_karyawan}_{nama_file}_{no_urut_mcu}.pdf")


def _as_records_df(rows: Any) -> pd.DataFrame:
    if rows is None:
        return pd.DataFrame()
    if isinstance(rows, pd.DataFrame):
        return rows.copy()
    if isinstance(rows, list):
        return pd.DataFrame(rows)
    if isinstance(rows, dict):
        if isinstance(rows.get("rows"), list):
            return pd.DataFrame(rows["rows"])
        merged = []
        for sheet_name, sheet_rows in rows.items():
            if isinstance(sheet_rows, list):
                for r in sheet_rows:
                    if isinstance(r, dict):
                        rr = dict(r)
                        rr.setdefault("_SheetName", sheet_name)
                        merged.append(rr)
        return pd.DataFrame(merged)
    return pd.DataFrame()


def _auto_set_gdrive_credentials_env() -> None:
    if os.environ.get("GDRIVE_CREDENTIALS"):
        return
    candidates = [
        Path.cwd() / "credentials.json",
        APP_ROOT / "credentials.json",
        APP_ROOT / "core" / "credentials.json",
        Path(sys.executable).parent / "credentials.json",
    ]
    if getattr(sys, "frozen", False) and getattr(sys, "_MEIPASS", None):
        candidates += [
            Path(sys._MEIPASS) / "credentials.json",
            Path(sys._MEIPASS) / "app" / "credentials.json",
            Path(sys._MEIPASS) / "core" / "credentials.json",
        ]
    for p in candidates:
        try:
            if p.exists() and p.is_file():
                os.environ["GDRIVE_CREDENTIALS"] = str(p)
                return
        except Exception:
            continue


def _find_or_create_folder_compat(service, base_id: str, folder_name: str) -> str:
    if not GDRIVE_OK:
        raise RuntimeError(f"Google Drive module belum siap: {_GDRIVE_IMPORT_ERROR}")
    try:
        import inspect
        sig = inspect.signature(find_or_create_folder)
        params = sig.parameters
        kwargs: Dict[str, Any] = {}
        if "parent_id" in params:
            kwargs["parent_id"] = base_id
        elif "base_id" in params:
            kwargs["base_id"] = base_id
        elif "folder_id" in params:
            kwargs["folder_id"] = base_id
        elif "parent_folder_id" in params:
            kwargs["parent_folder_id"] = base_id
        elif "base_folder_id" in params:
            kwargs["base_folder_id"] = base_id
        if "folder_name" in params:
            kwargs["folder_name"] = folder_name
        elif "name" in params:
            kwargs["name"] = folder_name
        elif "title" in params:
            kwargs["title"] = folder_name
        if kwargs and any(k in kwargs for k in ("folder_name", "name", "title")):
            return find_or_create_folder(service, **kwargs)
    except Exception:
        pass
    for args in [(service, base_id, folder_name), (service, folder_name, base_id), (service, base_id, folder_name, True), (service, folder_name, base_id, True)]:
        try:
            return find_or_create_folder(*args)
        except TypeError:
            continue
    return find_or_create_folder(service, base_id, folder_name)


def _drive_upload_file(service, folder_id: str, file_path: str, filename: str) -> dict:
    if not GDRIVE_UPLOAD_OK:
        raise RuntimeError("googleapiclient belum siap. Install: pip install google-api-python-client")
    media = MediaFileUpload(file_path, mimetype="application/pdf", resumable=True)
    body = {"name": filename, "parents": [folder_id]}
    return service.files().create(body=body, media_body=media, fields="id, webViewLink, name").execute()


def _merge_pdf_files_for_print(pdf_paths: List[Path], output_dir: Path, batch_size: int = 100, base_filename: str = "HASIL_MCU_PRINT") -> List[Path]:
    clean_paths = []
    for p in pdf_paths or []:
        pp = Path(p)
        if pp.exists() and pp.is_file() and pp.suffix.lower() == ".pdf" and pp.stat().st_size > 0:
            clean_paths.append(pp)
    if not clean_paths:
        return []
    batch_size = int(batch_size or 100)
    if batch_size <= 0:
        batch_size = 100
    output_dir.mkdir(parents=True, exist_ok=True)
    total_parts = math.ceil(len(clean_paths) / batch_size)
    merged_paths: List[Path] = []
    try:
        from pypdf import PdfWriter
        for part_idx in range(total_parts):
            chunk = clean_paths[part_idx * batch_size : (part_idx + 1) * batch_size]
            writer = PdfWriter()
            for fp in chunk:
                writer.append(str(fp))
            out_name = f"{base_filename}_ALL.pdf" if total_parts == 1 else f"{base_filename}_PART_{part_idx + 1:03d}_OF_{total_parts:03d}.pdf"
            out_path = output_dir / _safe_filename(out_name)
            with open(out_path, "wb") as f:
                writer.write(f)
            merged_paths.append(out_path)
        return merged_paths
    except ImportError:
        from PyPDF2 import PdfMerger
        for part_idx in range(total_parts):
            chunk = clean_paths[part_idx * batch_size : (part_idx + 1) * batch_size]
            merger = PdfMerger()
            try:
                for fp in chunk:
                    merger.append(str(fp))
                out_name = f"{base_filename}_ALL.pdf" if total_parts == 1 else f"{base_filename}_PART_{part_idx + 1:03d}_OF_{total_parts:03d}.pdf"
                out_path = output_dir / _safe_filename(out_name)
                with open(out_path, "wb") as f:
                    merger.write(f)
                merged_paths.append(out_path)
            finally:
                merger.close()
        return merged_paths


def _build_mcu_pdf_bytes(nama: str, rekap_rows: pd.DataFrame, abn_rows: Optional[pd.DataFrame] = None, cond_rows: Optional[pd.DataFrame] = None) -> bytes:
    return build_mcu_pdf_bytes_gs_port(
        nama=nama,
        rekap_rows=rekap_rows if rekap_rows is not None else pd.DataFrame(),
        abn_rows=abn_rows if abn_rows is not None else pd.DataFrame(),
        cond_rows=cond_rows if cond_rows is not None else pd.DataFrame(),
        project_root=APP_ROOT,
    )


def _sample_rekap_rows() -> pd.DataFrame:
    return pd.DataFrame([
        {"_SheetName": "FISIK", "Nama PT": "PT CONTOH SEHAT", "Tanggal MCU": "12 Mei 2026", "Issueddate": "12 Mei 2026", "NOMCU": "MCU-001", "NAMA": "BUDI SANTOSO", "JK": "L", "TGLLAHIR": "01 Januari 1991", "USIA": "35", "NIK": "317100000001", "DEPARTEMEN": "Operasional", "PAKET": "MCU Corporate Basic", "KATEGORI": "Corporate", "KESIMPULAN": "Terdapat peningkatan SGOT dan SGPT.\nOverweight berdasarkan BMI.", "SARAN": "Disarankan konsultasi dokter, evaluasi fungsi hati, menjaga pola makan, dan olahraga teratur.", "FIT_STATUS": "FIT WITH NOTE", "FS:TB": "170", "FS:BB": "78", "FS:BBI": "65", "FS:BMI": "26.99", "FS:Tensi": "130/85", "FS:Nadi": "82", "FS:Nafas": "20", "FS:ButaWarna": "Tidak", "FS:TnpKcMata": "6/6", "FS:TrxParu": "Normal", "FS:TrxJtg": "Normal", "FS:Gigi": "Karies ringan"},
        {"_SheetName": "LAB", "NAMA": "BUDI SANTOSO", "NOMCU": "MCU-001", "JK": "L", "DL:Hb": "14.5", "DL:Leu": "7.2", "DL:Ht": "43", "DL:Trom": "280", "DL:Eri": "5.1", "HJ:Bas": "0", "HJ:Eos": "2", "HJ:NBtg": "3", "HJ:NSeg": "60", "HJ:Limfo": "30", "HJ:Mono": "5", "LD:Chol": "205", "LD:HDL": "42", "LD:LDL": "135", "LD:Trig": "160", "GD:Sewaktu": "120", "GD:GDP": "95", "FK:Ureum": "28", "FK:Kreatinin": "1.0", "FK:AsamUrat": "6.2", "FH:SGOT": "50", "FH:SGPT": "52", "HP:HBsAg": "Non reaktif", "UR:Warna": "Kuning", "UR:Jernih": "Jernih", "UR:BJ": "1.020", "UR:PH": "6.0", "UR:Prot": "Negatif", "UR:Glu": "Negatif", "UR:KetonUrn": "Negatif", "UR:Nitrit": "Negatif", "UR:Bakteri": "Negatif"},
        {"_SheetName": "RONTGEN", "NAMA": "BUDI SANTOSO", "NOMCU": "MCU-001", "Thorax Foto": "Cor dan pulmo dalam batas normal.", "Hasilthorax": "Tidak tampak kelainan aktif pada paru dan jantung."},
    ])


def _sample_conditions() -> pd.DataFrame:
    return pd.DataFrame([
        {"Nama": "BUDI SANTOSO", "Condition": "Peningkatan enzim hati", "Severity": "Mild", "Score": 2, "Evidence": "SGOT 50, SGPT 52"},
        {"Nama": "BUDI SANTOSO", "Condition": "Overweight", "Severity": "Mild", "Score": 1, "Evidence": "BMI 26.99"},
    ])


@app.get("/health")
def health():
    _auto_set_gdrive_credentials_env()
    return {"ok": True, "message": "AI MCU PDF Engine aktif.", "appRoot": str(APP_ROOT), "outputDir": str(OUTPUT_DIR), "gdriveOk": GDRIVE_OK, "gdriveUploadOk": GDRIVE_UPLOAD_OK, "gdriveCredentials": os.environ.get("GDRIVE_CREDENTIALS", "")}


@app.post("/generate-pdf")
def generate_pdf(payload: Dict[str, Any]):
    try:
        _auto_set_gdrive_credentials_env()
        mode = str(payload.get("mode") or "single")
        upload_drive = bool(payload.get("uploadDrive"))
        merge_pdf = bool(payload.get("mergePdf"))
        batch_size = int(payload.get("batchSize") or 100)
        company = str(payload.get("company") or "AI MCU").strip() or "AI MCU"
        year = int(payload.get("year") or time.strftime("%Y"))
        base_folder = str(payload.get("baseFolder") or "").strip()
        base_url = str(payload.get("baseUrl") or "").rstrip("/") or "http://127.0.0.1:8001"

        rekap_df = _as_records_df(payload.get("rekapRows"))
        abn_df = _as_records_df(payload.get("abnRows"))
        cond_df = _as_records_df(payload.get("condRows"))

        if rekap_df.empty:
            rekap_df = _sample_rekap_rows()
            cond_df = _sample_conditions()

        names = payload.get("names")
        if isinstance(names, str):
            names = [names]
        if not isinstance(names, list) or not names:
            names = _unique_names_from_df(rekap_df)
        names = [str(x).strip() for x in names if str(x).strip()]
        if not names:
            names = [str(payload.get("name") or "BUDI SANTOSO").strip()]
        if mode == "single":
            names = names[:1]

        timestamp = time.strftime("%Y%m%d_%H%M%S")
        job_id = f"pdf-{timestamp}-{int(time.time())}"
        job_dir = OUTPUT_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        abn_by = {k: v.copy() for k, v in abn_df.groupby(abn_df["Nama"].astype(str))} if (not abn_df.empty and "Nama" in abn_df.columns) else {}
        cond_by = {k: v.copy() for k, v in cond_df.groupby(cond_df["Nama"].astype(str))} if (not cond_df.empty and "Nama" in cond_df.columns) else {}

        pdf_paths: List[Path] = []
        for nm in names:
            rekap_rows = _filter_df_by_name(rekap_df, nm)
            abn_rows = abn_by.get(str(nm), pd.DataFrame())
            cond_rows = cond_by.get(str(nm), pd.DataFrame())
            pdf_bytes = _build_mcu_pdf_bytes(str(nm), rekap_rows, abn_rows, cond_rows)
            if not pdf_bytes or len(pdf_bytes) < 1000:
                raise RuntimeError(f"PDF kosong atau gagal dibuat untuk peserta: {nm}")
            file_name = _make_pdf_filename_for_print(str(nm), rekap_rows)
            out_path = job_dir / file_name
            out_path.write_bytes(pdf_bytes)
            pdf_paths.append(out_path)

        merged_paths: List[Path] = []
        if merge_pdf:
            merged_paths = _merge_pdf_files_for_print(pdf_paths, job_dir, batch_size, f"HASIL_MCU_PRINT_{_safe_filename(company)}_{year}")

        uploaded: List[dict] = []
        target_folder_id = ""
        target_folder_name = f"{company} - {year}"
        if upload_drive:
            if not base_folder:
                raise RuntimeError("baseFolder wajib diisi jika uploadDrive=true.")
            if not GDRIVE_OK:
                raise RuntimeError(f"Google Drive belum siap: {_GDRIVE_IMPORT_ERROR}")
            if not GDRIVE_UPLOAD_OK:
                raise RuntimeError(f"Google Drive upload belum siap: {_GDRIVE_UPLOAD_IMPORT_ERROR}")
            service = get_drive_service(app_root=APP_ROOT)
            base_id = extract_folder_id(base_folder)
            target_folder_id = _find_or_create_folder_compat(service, base_id, target_folder_name)
            for fp in list(pdf_paths) + list(merged_paths):
                uploaded.append(_drive_upload_file(service, target_folder_id, str(fp), fp.name))

        zip_path = job_dir / f"{_safe_filename(company)}_{year}_{job_id}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for fp in pdf_paths + merged_paths:
                z.write(fp, arcname=fp.name)

        def public_url(path: Path) -> str:
            rel = path.relative_to(OUTPUT_DIR).as_posix()
            return f"{base_url}/files/{rel}"

        pdf_files = [{"name": p.name, "url": public_url(p), "size": p.stat().st_size} for p in pdf_paths]
        merged_files = [{"name": p.name, "url": public_url(p), "size": p.stat().st_size} for p in merged_paths]

        return {"ok": True, "message": "PDF berhasil digenerate oleh Python AI MCU Engine.", "jobId": job_id, "engineMode": "python-engine", "mode": mode, "count": len(pdf_paths), "pdfFiles": pdf_files, "mergedFiles": merged_files, "zipFile": {"name": zip_path.name, "url": public_url(zip_path), "size": zip_path.stat().st_size}, "fileName": pdf_files[0]["name"] if pdf_files else "", "pdfUrl": pdf_files[0]["url"] if pdf_files else "", "mergedPdfUrl": merged_files[0]["url"] if merged_files else "", "targetFolderName": target_folder_name if upload_drive else "", "targetFolderId": target_folder_id, "uploaded": uploaded[:50]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "message": str(e)})


@app.get("/files/{job_id}/{file_name}")
def get_file_nested(job_id: str, file_name: str):
    path = OUTPUT_DIR / job_id / file_name
    if not path.exists():
        return JSONResponse(status_code=404, content={"ok": False, "message": "File tidak ditemukan."})
    media_type = "application/zip" if file_name.lower().endswith(".zip") else "application/pdf"
    return FileResponse(str(path), media_type=media_type, filename=file_name)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
