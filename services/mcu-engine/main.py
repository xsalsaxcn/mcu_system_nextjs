from __future__ import annotations

import html
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



# CAPASKA_PDF_DETAILED_TEMPLATE_V341
def _clean_capaska_pdf_value_v341(value: Any) -> str:
    text = str(value if value is not None else "").replace("\r", " ").replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    if not text or text.lower() in {"-", "nan", "none", "null", "undefined"}:
        return ""
    return text


def _is_capaska_payload_v341(payload: Dict[str, Any], rekap_df: pd.DataFrame) -> bool:
    pieces: List[str] = [
        str(payload.get("template") or ""),
        str(payload.get("program") or ""),
        str(payload.get("company") or ""),
    ]
    if not rekap_df.empty:
        for col in ["KATEGORI", "Kategori", "PAKET", "Paket", "PERUSAHAAN", "Perusahaan", "Nama PT"]:
            if col in rekap_df.columns:
                pieces.extend([str(x) for x in rekap_df[col].head(20).tolist()])
    return any("capaska" in p.lower() for p in pieces)


def _filter_capaska_rows_v341(capaska_df: pd.DataFrame, nama: str, rekap_rows: pd.DataFrame) -> pd.DataFrame:
    if capaska_df is None or capaska_df.empty:
        return pd.DataFrame()
    name = str(nama or "").strip().lower()
    mcu_values: List[str] = []
    for col in ["NOMCU", "NO MCU", "NO.MCU", "No MCU"]:
        if rekap_rows is not None and not rekap_rows.empty and col in rekap_rows.columns:
            mcu_values.extend([str(x).strip().lower() for x in rekap_rows[col].dropna().tolist() if str(x).strip()])
    df = capaska_df.copy()
    masks = []
    if "name" in df.columns and name:
        masks.append(df["name"].astype(str).str.strip().str.lower().eq(name))
    if "Nama" in df.columns and name:
        masks.append(df["Nama"].astype(str).str.strip().str.lower().eq(name))
    if mcu_values:
        if "mcuId" in df.columns:
            masks.append(df["mcuId"].astype(str).str.strip().str.lower().isin(mcu_values))
        if "No MCU" in df.columns:
            masks.append(df["No MCU"].astype(str).str.strip().str.lower().isin(mcu_values))
    if not masks:
        return df
    mask = masks[0]
    for m in masks[1:]:
        mask = mask | m
    return df.loc[mask].copy()


def _capaska_identity_v341(nama: str, rekap_rows: pd.DataFrame) -> Dict[str, str]:
    row = rekap_rows.iloc[0].to_dict() if rekap_rows is not None and not rekap_rows.empty else {}
    def pick(*keys: str) -> str:
        for k in keys:
            v = _clean_capaska_pdf_value_v341(row.get(k))
            if v:
                return v
        return ""
    return {
        "Nama": pick("NAMA", "Nama") or nama,
        "No MCU": pick("NOMCU", "NO MCU", "NO.MCU", "No MCU"),
        "NIK/ID": pick("NIK/NRP/ID", "NIK", "NRP", "ID"),
        "Perusahaan": pick("PERUSAHAAN", "Perusahaan", "Nama PT") or "BPIP / CAPASKA",
        "Tanggal MCU": pick("Tanggal MCU", "TANGGAL_MCU", "TGL MCU"),
        "Jenis Kelamin / Usia": (pick("JK", "Gender", "JENIS KELAMIN") + (" / " + pick("USIA", "Usia", "Age") if pick("USIA", "Usia", "Age") else "")).strip(" /"),
        "Tanggal Lahir": pick("TGLLAHIR", "Tanggal Lahir", "TANGGAL LAHIR"),
        "Paket": pick("PAKET", "Paket"),
    }


def _capaska_status_from_rows_v341(rows: List[Dict[str, Any]]) -> Tuple[str, int, List[str], List[str]]:
    total = 0
    notes: List[str] = []
    reds: List[str] = []
    for r in rows:
        score_text = _clean_capaska_pdf_value_v341(r.get("score"))
        try:
            score = int(float(score_text)) if score_text else 0
        except Exception:
            score = 0
        total += score
        param = _clean_capaska_pdf_value_v341(r.get("parameter"))
        value = _clean_capaska_pdf_value_v341(r.get("value"))
        post = _clean_capaska_pdf_value_v341(r.get("postName"))
        if not param or not value:
            continue
        lower = value.lower()
        normal = lower in {"normal", "tidak", "tidak ada", "negatif", "negative", "ta", "0", "0 caries", "0 karies", "0 tumpatan", "0 gigi"}
        if score <= -10 or "tidak direkom" in lower:
            reds.append(f"{post}: {param}: {value}")
        elif not normal and score < 0:
            notes.append(f"{post}: {param}: {value}")
    if reds:
        return "Tidak Direkomendasikan", total, notes, reds
    if notes:
        return "Dengan Catatan", total, notes, reds
    return "Direkomendasikan", total, notes, reds


def _build_capaska_pdf_bytes_v343(nama: str, rekap_rows: pd.DataFrame, capaska_rows: pd.DataFrame) -> bytes:
    import io
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=12*mm, leftMargin=12*mm, topMargin=12*mm, bottomMargin=10*mm)
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("capaska-normal", parent=styles["Normal"], fontName="Helvetica", fontSize=8.2, leading=10)
    small = ParagraphStyle("capaska-small", parent=styles["Normal"], fontName="Helvetica", fontSize=7.3, leading=8.6)
    title = ParagraphStyle("capaska-title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=13, leading=15, alignment=1)
    section = ParagraphStyle("capaska-section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10, leading=12, spaceBefore=8, spaceAfter=4)

    identity = _capaska_identity_v341(nama, rekap_rows)
    rows = capaska_rows.to_dict("records") if capaska_rows is not None and not capaska_rows.empty else []
    status, total_score, notes, reds = _capaska_status_from_rows_v341(rows)

    def P(v: Any, st=normal):
        return Paragraph(html.escape(_clean_capaska_pdf_value_v341(v)), st)

    story: List[Any] = []
    story.append(Paragraph("LAPORAN HASIL SELEKSI KESEHATAN CAPASKA", title))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Format khusus CAPASKA - tidak mengubah template PDF corporate.", small))
    story.append(Spacer(1, 6))

    id_data = [
        [P("Nama"), P(identity.get("Nama")), P("No MCU"), P(identity.get("No MCU"))],
        [P("NIK/ID"), P(identity.get("NIK/ID")), P("Tanggal MCU"), P(identity.get("Tanggal MCU"))],
        [P("Perusahaan"), P(identity.get("Perusahaan")), P("JK / Usia"), P(identity.get("Jenis Kelamin / Usia"))],
        [P("Paket"), P(identity.get("Paket")), P("Tanggal Lahir"), P(identity.get("Tanggal Lahir"))],
    ]
    t = Table(id_data, colWidths=[28*mm, 62*mm, 28*mm, 62*mm])
    t.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
        ("BACKGROUND", (0,0), (0,-1), colors.whitesmoke),
        ("BACKGROUND", (2,0), (2,-1), colors.whitesmoke),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))

    summary_data = [[P("Status Akhir"), P(status), P("Total Skor"), P(str(total_score))]]
    t = Table(summary_data, colWidths=[36*mm, 62*mm, 28*mm, 54*mm])
    t.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
        ("BACKGROUND", (0,0), (0,-1), colors.lightgrey),
        ("BACKGROUND", (2,0), (2,-1), colors.lightgrey),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story.append(t)
    story.append(Spacer(1, 6))

    if reds:
        story.append(Paragraph("Temuan Merah / Tidak Direkomendasikan", section))
        story.append(Paragraph("<br/>".join(html.escape(x) for x in reds[:40]), small))
        story.append(Spacer(1, 5))
    if notes:
        story.append(Paragraph("Ringkasan Catatan", section))
        story.append(Paragraph("<br/>".join(html.escape(x) for x in notes[:60]), small))
        story.append(Spacer(1, 5))

    story.append(Paragraph("Hasil Pemeriksaan Per Post", section))
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        post = _clean_capaska_pdf_value_v341(r.get("postName")) or "Lainnya"
        grouped.setdefault(post, []).append(r)

    if not grouped:
        story.append(Paragraph("Belum ada detail hasil CAPASKA yang diterima engine.", normal))
    else:
        for post, items in grouped.items():
            story.append(Paragraph(post, section))
            doctor_names = []
            for it in items:
                raw_docs = it.get("doctorNames")
                if isinstance(raw_docs, list):
                    doctor_names.extend([_clean_capaska_pdf_value_v341(x) for x in raw_docs])
            doctor_names = [x for i, x in enumerate(doctor_names) if x and x not in doctor_names[:i]]
            if doctor_names:
                story.append(Paragraph("Dokter/Pemeriksa: " + html.escape(", ".join(doctor_names)), small))
                story.append(Spacer(1, 3))
            table_data = [[P("Parameter", small), P("Hasil", small), P("Skor", small)]]
            for it in items:
                table_data.append([P(it.get("parameter"), small), P(it.get("value"), small), P(it.get("score"), small)])
            tbl = Table(table_data, colWidths=[78*mm, 78*mm, 18*mm], repeatRows=1)
            tbl.setStyle(TableStyle([
                ("GRID", (0,0), (-1,-1), 0.25, colors.grey),
                ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("LEFTPADDING", (0,0), (-1,-1), 3),
                ("RIGHTPADDING", (0,0), (-1,-1), 3),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 5))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Dokumen ini dibuat otomatis dari data pemeriksaan CAPASKA.", small))
    doc.build(story)
    return buf.getvalue()


# CAPASKA_PDF_EXCEL_STYLE_V343
# Format PDF khusus CAPASKA seperti rekap tabel seleksi kesehatan.
# Corporate/basic MCU tetap memakai template lama.
def _capaska_clean_v343(value: Any) -> str:
    text = str(value if value is not None else "").replace("\r", " ").replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    if not text or text.lower() in {"-", "nan", "none", "null", "undefined"}:
        return ""
    return text


def _capaska_num_v343(value: Any) -> Optional[float]:
    text = _capaska_clean_v343(value).replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", text)
    if not m:
        return None
    try:
        return float(m.group(0))
    except Exception:
        return None


def _is_capaska_payload_v343(payload: Dict[str, Any], rekap_df: pd.DataFrame) -> bool:
    pieces: List[str] = [
        str(payload.get("template") or ""),
        str(payload.get("program") or ""),
        str(payload.get("company") or ""),
    ]
    if rekap_df is not None and not rekap_df.empty:
        for col in ["KATEGORI", "Kategori", "PAKET", "Paket", "PERUSAHAAN", "Perusahaan", "Nama PT"]:
            if col in rekap_df.columns:
                pieces.extend([str(x) for x in rekap_df[col].head(20).tolist()])
    return any("capaska" in p.lower() for p in pieces)


def _capaska_pick_from_rekap_v343(row: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = _capaska_clean_v343(row.get(key))
        if value:
            return value
    return ""


def _capaska_identity_v343(nama: str, rekap_rows: pd.DataFrame) -> Dict[str, str]:
    row = rekap_rows.iloc[0].to_dict() if rekap_rows is not None and not rekap_rows.empty else {}
    return {
        "Nama": _capaska_pick_from_rekap_v343(row, "NAMA", "Nama") or _capaska_clean_v343(nama),
        "No MCU": _capaska_pick_from_rekap_v343(row, "NOMCU", "NO MCU", "NO.MCU", "No MCU"),
        "NIK/ID": _capaska_pick_from_rekap_v343(row, "NIK/NRP/ID", "NIK", "NRP", "ID"),
        "Perusahaan": _capaska_pick_from_rekap_v343(row, "PERUSAHAAN", "Perusahaan", "Nama PT") or "BPIP / CAPASKA",
        "Tanggal MCU": _capaska_pick_from_rekap_v343(row, "Tanggal MCU", "TANGGAL_MCU", "TGL MCU"),
        "Jenis Kelamin": _capaska_pick_from_rekap_v343(row, "JK", "Gender", "JENIS KELAMIN"),
        "Usia": _capaska_pick_from_rekap_v343(row, "USIA", "Usia", "Age"),
        "Tanggal Lahir": _capaska_pick_from_rekap_v343(row, "TGLLAHIR", "Tanggal Lahir", "TANGGAL LAHIR"),
        "Paket": _capaska_pick_from_rekap_v343(row, "PAKET", "Paket"),
    }


def _filter_capaska_rows_v343(capaska_df: pd.DataFrame, nama: str, rekap_rows: pd.DataFrame) -> pd.DataFrame:
    if capaska_df is None or capaska_df.empty:
        return pd.DataFrame()
    name = _capaska_clean_v343(nama).lower()
    mcu_values: List[str] = []
    if rekap_rows is not None and not rekap_rows.empty:
        for col in ["NOMCU", "NO MCU", "NO.MCU", "No MCU"]:
            if col in rekap_rows.columns:
                mcu_values.extend([_capaska_clean_v343(x).lower() for x in rekap_rows[col].dropna().tolist() if _capaska_clean_v343(x)])
    df = capaska_df.copy()
    masks = []
    for col in ["name", "Nama", "NAMA"]:
        if col in df.columns and name:
            masks.append(df[col].astype(str).str.strip().str.lower().eq(name))
    for col in ["mcuId", "No MCU", "NOMCU", "NO MCU"]:
        if col in df.columns and mcu_values:
            masks.append(df[col].astype(str).str.strip().str.lower().isin(mcu_values))
    if not masks:
        return df
    mask = masks[0]
    for m in masks[1:]:
        mask = mask | m
    return df.loc[mask].copy()


def _capaska_stage_key_v343(row: Dict[str, Any]) -> str:
    post_id = int(_capaska_num_v343(row.get("postId")) or _capaska_num_v343(row.get("post_id")) or 0)
    mapping = {4: "mata", 7: "tht", 6: "gigi", 5: "penyakit_dalam", 8: "jantung", 9: "ortopedi", 10: "radiologi"}
    if post_id in mapping:
        return mapping[post_id]
    text = " ".join([_capaska_clean_v343(row.get(k)) for k in ["postName", "category", "parameter"]]).lower()
    if "radiologi" in text or "rontgen" in text or "whole spine" in text:
        return "radiologi"
    if "ortopedi" in text or "orthop" in text or "pes planus" in text or "hallux" in text or "hammer" in text:
        return "ortopedi"
    if "gigi" in text or "caries" in text or "karies" in text or "panor" in text:
        return "gigi"
    if "tht" in text or "tonsil" in text or "serumen" in text:
        return "tht"
    if "jantung" in text or "ekg" in text:
        return "jantung"
    if "mata" in text or "visus" in text or "buta warna" in text:
        return "mata"
    if "penyakit dalam" in text or "hemoroid" in text or "tanda vital" in text:
        return "penyakit_dalam"
    return "lainnya"


def _capaska_is_normal_value_v343(parameter: str, value: str, score: Optional[float]) -> bool:
    p = parameter.lower()
    v = value.lower().strip()
    compact = re.sub(r"\s+", "", v)
    if not v or v in {"-", "normal", "ta", "t/a", "sesuai", "sesuai juknis", "intak", "tidak", "tidak ada", "negative", "negatif", "(-)"}:
        return True
    if "tidak ada" in v and "catatan" not in p:
        return True
    if "0 caries" in v or "0 karies" in v or "0 tumpatan" in v or "0 gigi" in v or "0 impaksi" in v:
        return True
    if ("catatan" in p or "kondisi khusus" in p) and v in {"tidak", "tidak ada", "negative", "negatif"}:
        return True
    if score is not None and score > 0:
        red_words = ["tidak normal", "tidak sesuai", "ada", "positif", "buta warna", "caries", "karies", "kelainan", "t2", "t3", "ringan", "sedang", "berat"]
        if not any(x in v for x in red_words):
            return True
    return False


def _capaska_stage_summaries_v343(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int, str, List[str]]:
    stage_defs = [
        ("mata", "Mata", 12),
        ("tht", "THT", 10),
        ("gigi", "Gigi", 16),
        ("penyakit_dalam", "Penyakit Dalam", 28),
        ("jantung", "Jantung", 12),
        ("ortopedi", "Ortopedi", 16),
        ("radiologi", "Radiologi", 6),
    ]
    grouped: Dict[str, List[Dict[str, Any]]] = {k: [] for k, _, _ in stage_defs}
    for r in rows:
        key = _capaska_stage_key_v343(r)
        if key in grouped:
            grouped[key].append(r)

    stage_rows: List[Dict[str, Any]] = []
    total_score = 0
    all_reds: List[str] = []
    all_notes: List[str] = []
    for key, label, max_score in stage_defs:
        items = grouped.get(key, [])
        score_sum = 0
        notes: List[str] = []
        reds: List[str] = []
        for it in items:
            param = _capaska_clean_v343(it.get("parameter"))
            value = _capaska_clean_v343(it.get("value"))
            if not param or not value:
                continue
            score = _capaska_num_v343(it.get("score"))
            if score is not None:
                score_sum += int(score)
            is_red = False
            lower = value.lower()
            if score is not None and score <= -10:
                is_red = True
            if "tidak direkom" in lower:
                is_red = True
            if key == "radiologi" and ("sedang" in lower or "berat" in lower):
                is_red = True
            if not _capaska_is_normal_value_v343(param, value, score):
                note = f"{param}: {value}"
                if is_red:
                    reds.append(note)
                    all_reds.append(f"{label}: {note}")
                else:
                    notes.append(note)
                    all_notes.append(f"{label}: {note}")
        if score_sum == 0 and not items:
            # Jika tidak ada data, tampilkan kosong/0 agar terlihat belum ada hasil.
            result_text = ""
        elif reds:
            result_text = "\n".join(reds + notes)
        elif notes:
            result_text = "\n".join(notes)
        else:
            result_text = "Normal"
        total_score += score_sum
        stage_rows.append({
            "key": key,
            "label": label,
            "result": result_text,
            "score": score_sum,
            "max": max_score,
            "red": bool(reds),
            "note": bool(notes),
        })
    status = "Tidak Direkomendasikan" if all_reds else ("Dengan Catatan" if all_notes else "Direkomendasikan")
    reasons = all_reds if all_reds else all_notes
    return stage_rows, total_score, status, reasons


def _capaska_height_weight_v343(rows: List[Dict[str, Any]]) -> Tuple[str, str]:
    tinggi = ""
    berat = ""
    for it in rows:
        name = _capaska_clean_v343(it.get("parameter")).lower()
        value = _capaska_clean_v343(it.get("value"))
        if not value:
            continue
        if not tinggi and ("tinggi" in name or name in {"tb", "tb (cm)", "tb. (cm)"} or "tb" == name.replace(".", "").strip()):
            tinggi = value
        if not berat and ("berat" in name or name in {"bb", "bb (kg)", "bb. (kg)"}):
            berat = value
    return tinggi, berat


def _build_capaska_pdf_bytes_v343(nama: str, rekap_rows: pd.DataFrame, capaska_rows: pd.DataFrame) -> bytes:
    import io
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=10*mm, leftMargin=10*mm, topMargin=10*mm, bottomMargin=9*mm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("capaska-v343-title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=12, leading=14, alignment=1)
    small = ParagraphStyle("capaska-v343-small", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, leading=8.8)
    small_bold = ParagraphStyle("capaska-v343-small-bold", parent=small, fontName="Helvetica-Bold")
    white = ParagraphStyle("capaska-v343-white", parent=small, fontName="Helvetica-Bold", textColor=colors.white)

    def P(value: Any, st=small):
        txt = _capaska_clean_v343(value).replace("\n", "<br/>")
        return Paragraph(html.escape(txt).replace("&lt;br/&gt;", "<br/>"), st)

    identity = _capaska_identity_v343(nama, rekap_rows)
    rows = capaska_rows.to_dict("records") if capaska_rows is not None and not capaska_rows.empty else []
    stage_rows, total_score, status, reasons = _capaska_stage_summaries_v343(rows)
    tinggi, berat = _capaska_height_weight_v343(rows)

    story: List[Any] = []
    story.append(Paragraph("HASIL SELEKSI KESEHATAN CAPASKA", title))
    story.append(Spacer(1, 4))

    header_rows = [
        [P("Nama", small_bold), P(identity.get("Nama"), small_bold), P("No MCU", small_bold), P(identity.get("No MCU"), small_bold)],
        [P("NIK/ID", small_bold), P(identity.get("NIK/ID")), P("Tanggal MCU", small_bold), P(identity.get("Tanggal MCU"))],
        [P("Perusahaan", small_bold), P(identity.get("Perusahaan")), P("JK / Usia", small_bold), P((identity.get("Jenis Kelamin") + " / " + identity.get("Usia")).strip(" /"))],
    ]
    ht = Table(header_rows, colWidths=[26*mm, 72*mm, 30*mm, 48*mm])
    ht.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.5, colors.black),
        ("BACKGROUND", (0,0), (0,-1), colors.whitesmoke),
        ("BACKGROUND", (2,0), (2,-1), colors.whitesmoke),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(ht)
    story.append(Spacer(1, 6))

    table_data: List[List[Any]] = [[P("No", small_bold), P("Item Pemeriksaan", small_bold), P("Hasil", small_bold), P("Skor", small_bold), P("Skor Max", small_bold)]]
    table_data.append([P("1"), P("Nama"), P(identity.get("Nama")), P(""), P("")])
    table_data.append([P("2"), P("Tinggi Badan"), P(tinggi), P(""), P("")])
    table_data.append([P("3"), P("Berat Badan"), P(berat), P(""), P("")])
    idx = 4
    for st in stage_rows:
        para_style = white if st.get("red") else small
        table_data.append([P(str(idx)), P(st["label"], small_bold), P(st["result"], para_style), P(str(st["score"])), P(str(st["max"]))])
        idx += 1
    table_data.append([P(""), P("Total Score", small_bold), P(""), P(str(total_score), small_bold), P("100", small_bold)])
    status_style = white if status == "Tidak Direkomendasikan" else small_bold
    table_data.append([P(""), P("Kesimpulan Kesehatan", small_bold), P(status, status_style), P(""), P("")])
    table_data.append([P(""), P("Alasan", small_bold), P("; ".join(reasons[:20]), status_style if status == "Tidak Direkomendasikan" else small), P(""), P("")])

    tbl = Table(table_data, colWidths=[10*mm, 42*mm, 92*mm, 18*mm, 18*mm], repeatRows=1)
    style_cmds = [
        ("GRID", (0,0), (-1,-1), 0.5, colors.black),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 3),
        ("RIGHTPADDING", (0,0), (-1,-1), 3),
        ("ALIGN", (0,0), (0,-1), "CENTER"),
        ("ALIGN", (3,0), (4,-1), "CENTER"),
    ]
    # Stage rows start at index 4 in table_data.
    for i, st in enumerate(stage_rows, start=4):
        if st.get("red"):
            style_cmds.append(("BACKGROUND", (2,i), (2,i), colors.red))
            style_cmds.append(("TEXTCOLOR", (2,i), (2,i), colors.white))
        elif st.get("note"):
            style_cmds.append(("BACKGROUND", (2,i), (2,i), colors.Color(1, 0.94, 0.55)))
    status_row_idx = len(table_data) - 2
    reason_row_idx = len(table_data) - 1
    if status == "Tidak Direkomendasikan":
        style_cmds.append(("BACKGROUND", (2,status_row_idx), (2,reason_row_idx), colors.red))
        style_cmds.append(("TEXTCOLOR", (2,status_row_idx), (2,reason_row_idx), colors.white))
    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)
    story.append(Spacer(1, 5))
    story.append(Paragraph("Keterangan: PDF ini memakai template khusus CAPASKA. Template corporate tidak diubah.", small))
    doc.build(story)
    return buf.getvalue()


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
        # CAPASKA_PDF_DETAILED_TEMPLATE_V341
        capaska_df = _as_records_df(payload.get("capaskaRows"))
        is_capaska_pdf_v341 = _is_capaska_payload_v341(payload, rekap_df)

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
            # CAPASKA_PDF_DETAILED_TEMPLATE_V341
            if is_capaska_pdf_v341:
                capaska_rows = _filter_capaska_rows_v341(capaska_df, str(nm), rekap_rows)
                pdf_bytes = _build_capaska_pdf_bytes_v343(str(nm), rekap_rows, capaska_rows)
            else:
                # CAPASKA_PDF_EXCEL_STYLE_V343_DIRECT_CALL
            if _is_capaska_payload_v343(payload, rekap_df):
                capaska_df_v343 = _as_records_df(payload.get("capaskaRows"))
                capaska_rows_v343 = _filter_capaska_rows_v343(capaska_df_v343, str(nm), rekap_rows)
                pdf_bytes = _build_capaska_pdf_bytes_v343(str(nm), rekap_rows, capaska_rows_v343)
            else:
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
