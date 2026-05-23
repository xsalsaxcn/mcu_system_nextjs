# -*- coding: utf-8 -*-
"""
core/pdf_service_gs_port.py

Drop-in PDF service untuk AI_MCU_Project.
Port konsep dari Google Apps Script pdf service.gs ke Python:
- cover -> certificate/kesimpulan -> fisik -> lab paginated -> penunjang
- 1 peserta = 1 PDF
- auto skip page kalau data penunjang tidak ada
- support sheet: KESIMPULAN & SARAN, FISIK, LAB, RONTGEN, AUDIO, SPIRO, TREADMILL/TREADMIL, USG, EKG
- render utama via Microsoft Edge/Chrome headless agar HTML/CSS mendekati contoh PDF.

Cara pakai di app/main.py:
    from core.pdf_service_gs_port import build_mcu_pdf_bytes_gs_port
    return build_mcu_pdf_bytes_gs_port(nama, rekap_rows, abn_rows, cond_rows, project_root=Path(__file__).resolve().parents[1])
"""

from __future__ import annotations

import base64
import html
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

LAB_MAX_UNITS_PER_PAGE = 46


# =========================
# CONFIG dari config.gs (dipindah ke Python)
# =========================

APP_CONFIG: Dict[str, Any] = {
    "outputFolderId": "18ewjJLUgQAFtN43HeVWnapF4LDOohqUi",
    "clinic": {
        "name": "inHARMONY",
        "city": "Jakarta",
        "doctorName": "dr. Olieve Indri Leksmana, SpOK",
        "logoUrl": "https://r2.image-upload.app/ptImg/BrzkxkdW.jpg",
        "address": "Percetakan Negara 51D, Jakarta",
        "phone": "021 4248790 / 021 4220214",
        "email": "info@inharmonyclinic.com",
        "website": "www.inharmonyclinic.com",
        "confidentialityLabel": "Rahasia",
        "summarySignatureTitle": "Koordinator MCU",
    },
    "identityHeaders": {
        "company": ["Nama PT", "PERUSAHAAN", "Perusahaan", "PT"],
        "mcuDate": ["Tanggal MCU", "TGLMCU", "TGL MCU", "TGL_MCU"],
        "issuedDate": ["Issueddate", "IssuedDate", "Issued Date"],
        "nomcu": ["NOMCU", "NO MCU", "No MCU", "MCU_ID", "NO.MCU", "NO MCU/NO. MCU"],
        "name": ["NAMA", "Nama", "NAME"],
        "gender": ["JK", "JENIS KELAMIN", "Gender", "Sex"],
        "dob": ["TGLLAHIR", "TGL LAHIR", "Tanggal Lahir", "DOB", "TANGGAL LAHIR"],
        "age": ["USIA", "Umur", "Age"],
        "packageName": ["PAKET", "Paket"],
        "category": ["KATEGORI", "Kategori"],
        "conclusion": ["KESIMPULAN", "Kesimpulan"],
        "suggestion": ["SARAN", "Saran"],
        "department": ["DEPARTEMEN", "Department", "Departemen", "BAGIAN", "Dept/Bagian", "DEPT/BAGIAN", "DEPT"],
        "fitStatus": ["FIT_STATUS", "FIT STATUS", "Fit Status", "STATUS", "KELAYAKAN"],
        "photoUrl": ["PhotoUrl", "PHOTOURL", "PHOTO URL", "PHOTO_URL", "Link Foto", "Foto URL", "URL FOTO"],
        "nik": ["NIK", "NIK/NRP/ID", "NRP", "ID"],
        "bagian": ["Bagian", "BAGIAN"],
        "jabatan": ["Jabatan", "JABATAN"],
    },
    "doctorHeaders": {
        "defaultDoctor": ["Dokter", "Doctor", "Nama Dokter", "Doctor Name", "Dokter MCU"],
        "summaryDoctor": ["Koordinator MCU", "Dokter Summary", "Summary Doctor", "Dokter Kesimpulan"],
        "labDoctor": ["dokterlab", "Dokter Lab", "Dokter Laboratorium", "Doctor Lab", "Laboratory Doctor", "Penanggung Jawab Lab", "Penanggung Jawab Laboratorium", "Nama Dokter Lab", "Petugas Lab", "Petugas Laboratorium"],
        "radiologyDoctor": ["dokterrad", "Dokter Rontgen", "Dokter Radiologi", "Doctor Radiology", "Radiology Doctor", "Penanggung Jawab Rontgen", "Nama Dokter Rontgen", "Dokter Thorax Foto", "Petugas Rontgen", "Petugas Radiologi"],
        "ekgDoctor": ["dokterekg", "Dokter EKG", "EKG Doctor", "Nama Dokter EKG", "Penanggung Jawab EKG", "Petugas EKG"],
        "usgDoctor": ["dokterusg", "Dokter USG", "USG Doctor", "Nama Dokter USG", "Penanggung Jawab USG", "Petugas USG"],
        "audiometryDoctor": ["dokteraudio", "Dokter Audiometri", "Audiometry Doctor", "Nama Dokter Audiometri", "Dokter Audio", "Penanggung Jawab Audiometri", "Petugas Audiometri", "Petugas Audio"],
        "treadmillDoctor": ["doktertreadmil", "doktertreadmill", "Dokter Treadmill", "Treadmill Doctor", "Nama Dokter Treadmill", "Penanggung Jawab Treadmill", "Petugas Treadmill", "Petugas Treadmil"],
        "spiroDoctor": ["dokterspiro", "Dokter Spiro", "Dokter Spirometri", "Spirometry Doctor", "Nama Dokter Spirometri", "Penanggung Jawab Spirometri", "Petugas Spirometri", "Petugas Spiro"],
    },
    "physicalHeaders": {
        "kelSkrg": ["FS:KelSkrg", "KelSkrg"],
        "rwKesKelg": ["FS:RwKesKelg", "RwKesKelg"],
        "hazardKerja": ["FS:HazardKerja", "HazardKerja"],
        "rwKesDulu": ["FS:RwKesDulu", "RwKesDulu"],
        "pnyHAV": ["FS:PnyHAV", "PnyHAV"],
        "pnyHpTensi": ["FS:PnyHpTensi", "PnyHpTensi"],
        "kopi": ["FS:Kopi", "Kopi"],
        "rokok": ["FS:Rokok", "Rokok"],
        "olahRaga": ["FS:OlahRaga", "OlahRaga"],
        "tb": ["FS:TB", "TB", "Tinggi Badan"],
        "bb": ["FS:BB", "BB", "Berat Badan"],
        "bbi": ["FS:BBI", "BBI", "Berat Badan Ideal"],
        "bmi": ["FS:BMI", "BMI"],
        "tensi": ["FS:Tensi", "Tensi", "Tekanan Darah", "TD"],
        "tensiAtas": ["FS:TensiAtas", "Sistol", "Sistolik", "Tensi Atas"],
        "tensiBawah": ["FS:TensiBawah", "Diastol", "Diastolik", "Tensi Bawah"],
        "nadi": ["FS:Nadi", "Nadi"],
        "nafas": ["FS:Nafas", "Nafas", "Pernafasan"],
        "lingkarPerut": ["FS:LPerut", "FS:LP", "Lingkar Perut"],
        "kcMata": ["FS:KcMata", "KcMata"],
        "tnpKcMata": ["FS:TnpKcMata", "TnpKcMata", "Tanpa Kacamata"],
        "dgnKcMata": ["FS:DgnKcMata", "DgnKcMata", "Dengan Kacamata"],
        "butaWarna": ["FS:ButaWarna", "ButaWarna"],
        "mataLain": ["FS:MataLain", "MataLain"],
        "thtTelinga": ["FS:ThtTelinga", "ThtTelinga", "Telinga"],
        "thtHidung": ["FS:ThtHidung", "ThtHidung", "Hidung"],
        "thtTenggor": ["FS:ThtTenggor", "ThtTenggor", "Tenggorokan"],
        "thtTonsil": ["FS:ThtTonsil", "ThtTonsil", "Tonsil"],
        "thtLain": ["FS:Thtlain", "Thtlain", "ThtLain"],
        "mltBibir": ["FS:MltBibir", "MltBibir", "Bibir"],
        "mltLidah": ["FS:MltLidah", "MltLidah", "Lidah"],
        "gigi": ["FS:Gigi", "Gigi"],
        "mltLain": ["FS:MltLain", "MltLain"],
        "lhrUmum": ["FS:LhrUmum", "LhrUmum"],
        "lhrTyroid": ["FS:LhrTyroid", "LhrTyroid", "Tyroid/Trachea"],
        "lhrLain": ["FS:LhrLain", "LhrLain"],
        "trxBentuk": ["FS:TrxBentuk", "TrxBentuk"],
        "trxParu": ["FS:TrxParu", "TrxParu", "Paru-paru"],
        "trxJtg": ["FS:TrxJtg", "TrxJtg", "Jantung"],
        "trxLain": ["FS:TrxLain", "TrxLain"],
        "abdBentuk": ["FS:AbdBentuk", "AbdBentuk"],
        "abdPalpasi": ["FS:AbdPalpasi", "AbdPalpasi", "Palpasi/Perkusi"],
        "abdHernia": ["FS:AbdHernia", "AbdHernia", "Hernia"],
        "abdHati": ["FS:AbdHati", "AbdHati", "Hati"],
        "abdLimpa": ["FS:AbdLimpa", "AbdLimpa", "Limpa"],
        "abdKetok": ["FS:AbdKetok", "AbdKetok", "Test Ketok"],
        "abdBall": ["FS:AbdBall", "AbdBall", "Ballotement"],
        "abdHmrhoid": ["FS:AbdHmrhoid", "AbdHmrhoid", "Haemorrhoid"],
        "abdLain": ["FS:AbdLain", "AbdLain"],
        "extTulang": ["FS:ExtTulang", "ExtTulang", "Tulang/Sendi"],
        "extOtot": ["FS:ExtOtot", "ExtOtot", "Otot-otot/Tonus"],
        "extJari": ["FS:ExtJari", "ExtJari", "Jari-jari/Kuku"],
        "nrMotorik": ["FS:NrMotorik", "NrMotorik", "Fungsi Motorik"],
        "nrSensorik": ["FS:NrSensorik", "NrSensorik", "Fungsi Sensorik"],
        "nrRefFisio": ["FS:NrRefFisio", "NrRefFisio", "Reflex Fisiologis"],
        "nrRefPato": ["FS:NrRefPato", "NrRefPato", "Reflex Patologis"],
        "nrLain": ["FS:NrLain", "NrLain"],
    },
    "labHeaders": {
        "hb": ["DL:Hb", "Hb", "Hemoglobin"], "leu": ["DL:Leu", "Leu", "Leukosit"], "ht": ["DL:Ht", "Ht", "Hematokrit"],
        "trom": ["DL:Trom", "Trom", "Trombosit"], "eri": ["DL:Eri", "Eri", "Eritrosit"], "rdw": ["DL:RDW", "RDW"],
        "pct": ["DL:PCT", "PCT"], "mcv": ["DL:MCV", "MCV"], "mch": ["DL:MCH", "MCH"], "mchc": ["DL:MCHC", "MCHC"], "led": ["DL:LED", "LED"],
        "bas": ["HJ:Bas", "Bas", "Basofil"], "eos": ["HJ:Eos", "Eos", "Eosinofil"], "batang": ["HJ:NBtg", "NBtg", "Batang", "Nitrofil Batang"],
        "neutrofil": ["HJ:NSeg", "NSeg", "Neutrofil", "Nitrofil Segmen"], "limfosit": ["HJ:Limfo", "Limfo", "Limfosit"], "mono": ["HJ:Mono", "Mono", "Monosit"],
        "chol": ["LD:Chol", "Chol", "Kolesterol", "Cholesterol"], "hdl": ["LD:HDL", "HDL"], "ldl": ["LD:LDL", "LDL"], "trig": ["LD:Trig", "TRIG", "Trig", "Trigliserida"],
        "gds": ["GD:Sewaktu", "GDS", "Sewaktu"], "gdp": ["GD:GDP", "GDP"], "pp2": ["GD:2PP", "2PP", "2 Jam PP"], "hba1c": ["GD:HbA1C", "HbA1C"],
        "ureum": ["FK:Ureum", "FG:Ureum", "Ureum"], "kreatinin": ["FK:Kreatinin", "FG:Creat", "FG:Kreatinin", "Kreatinin", "Creat"], "asamUrat": ["FK:AsamUrat", "FG:AsUr", "Asam Urat", "ASAM URAT"],
        "sgot": ["FH:SGOT", "SGOT"], "sgpt": ["FH:SGPT", "SGPT"], "alfos": ["FH:AlFos"], "biltot": ["FH:BilTot"], "bildir": ["FH:BilDir"], "bilind": ["FH:BilInd"], "ggt": ["FH:GGT"],
        "hbsag": ["HP:HBsAg", "HBsAg"],
        "urWarna": ["UR:Warna", "Warna"], "urJernih": ["UR:Jernih", "Jernih", "Kejernihan"], "urBj": ["UR:BJ", "BJ", "Berat Jenis"],
        "urErit1": ["UR:Erit1", "Erit1"], "urLeko1": ["UR:Leko1", "Leko1"], "urPh": ["UR:PH", "PH", "pH"], "urProt": ["UR:Prot", "Prot", "Protein"], "urGlu": ["UR:Glu", "Glu", "Glukosa"],
        "urKeton": ["UR:KetonUrn", "KetonUrn", "Keton Urine"], "urUrogen": ["UR:Urogen", "Urogen", "Urobilinogen"], "urBil": ["UR:Bil", "Bil", "Bilirubin"], "urUrobil": ["UR:Urobil", "Urobil"], "urNitrit": ["UR:Nitrit", "Nitrit"],
        "urLeko2": ["UR:Leko2", "Leko2"], "urErit2": ["UR:Erit2", "Erit2"], "urEpitel": ["UR:Epitel", "Epitel"], "urSlndr": ["UR:Slndr", "Slndr", "Silinder"],
        "urKristal": ["UR:Kristal", "Kristal"], "urAmUrat": ["UR:AmUrat", "AmUrat", "Amorf Urat"], "urAmPhos": ["UR:AmPhos", "AmPhos", "Amorf Phosphat"], "urUrAcid": ["UR:UrAcid", "UrAcid", "Uric Acid"], "urCaOxalat": ["UR:CaOxalat", "CaOxalat", "Calcium Oxalat"], "urTriPosp": ["UR:TriPosp", "TriPosp", "Triple Posphat"], "urBakteri": ["UR:Bakteri", "Bakteri"], "urKrisLain": ["UR:KrisLain", "KrisLain", "Lain-lain"],
    },
    "otherHeaders": {
        "thoraxFoto": ["Thorax Foto", "HASIL RONTGEN", "HASIL THORAX FOTO", "RONTGEN", "Kesimpulan Rontgen", "Kesimpulan Thorax", "Kesan Rontgen", "Kesan Thorax"],
        "thoraxResult": ["Hasilthorax", "Hasil Thorax", "Hasil Thorax Foto", "Thorax Foto", "Hasil Rontgen", "HASIL RONTGEN", "HASIL THORAX FOTO", "Result Thorax", "Result Rontgen"],
        "ekgConclusion": ["Elektrokardiographi", "Elektrokardiografi", "EKG", "HASIL EKG", "Kesimpulan EKG", "Interpretasi EKG"],
        "ekgResult": ["HasilEKG", "Hasil EKG", "Result EKG", "Hasil Elektrokardiografi", "Hasil Elektrokardiographi", "Result Elektrokardiografi", "Result Elektrokardiographi"],
        "usgConclusion": ["USG", "USG ABDOMEN", "Hasil USG", "HASIL USG", "HASIL USG ABDOMEN", "KESAN USG", "KESIMPULAN USG"],
        "usgResult": ["HasilUSG", "Result USG"],
        "audiometryConclusion": ["AUDIOMETRI", "Audiometri", "AUDIO"],
        "audiometryResult": ["HasilAudiometri", "Hasil Audiometri", "HASIL AUDIOMETRI", "Hasil Audio"],
        "treadmillConclusion": ["Treadmill", "TREADMILL", "TREADMIL", "KESIMPULAN TREADMILL"],
        "treadmillResult": ["HasilTreadmil", "Hasil Treadmil", "HasilTreadmill", "HASIL TREADMILL"],
        "spirometry": ["HASIL SPIROMETRI", "Spirometri", "SPIRO", "Hasil Spiro"],
        "xrayPhotoLink": ["Link Thorax", "Linkfotorontgen", "Link Foto Rontgen", "FotoRontgen", "XrayPhotoLink", "Foto Thorax", "Image", "Gambar"],
        "ekgImageLink": ["Link EKG", "Link Foto EKG", "Foto EKG", "Image EKG", "Gambar EKG", "EKG Link"],
        "usgImageLink": ["Link USG", "Link Foto USG", "Foto USG", "Image USG", "Gambar USG", "USG Link"],
        "audiometryImageLink": ["Link Audiometri", "Link Audio", "Foto Audiometri", "Image Audiometri", "Gambar Audiometri"],
        "treadmillImageLink": ["Link Treadmill", "Link Treadmil", "Foto Treadmill", "Image Treadmill", "Gambar Treadmill"],
        "spirometryImageLink": ["Link Spirometri", "Link Spiro", "Foto Spirometri", "Image Spirometri", "Gambar Spirometri"],
    },
    "labNormalRanges": {
        "Hemoglobin": "P:(13.2-17.3), W:(11.7-15.5)", "Leukosit": "P:(3.8-11.0), W:(3.6-11.0)", "Hematokrit": "P:(40-55), W:(36-48)", "Trombosit": "150 - 450", "Eritrosit": "P:(4.4-5.9), W:(3.8-5.2)", "RDW": "11.5 - 14.5", "PCT": "0.2 - 0.5", "MCV": "82 - 92", "MCH": "27 - 31", "MCHC": "32 - 36", "LED": "P:(0-15), W:(0-20)",
        "Basofil": "0 - 1", "Eosinofil": "1 - 5", "Nitrofil Batang": "2 - 6", "Nitrofil Segmen": "50 - 70", "Limfosit": "20 - 40", "Monosit": "2 - 8",
        "Kolesterol": "< 200", "HDL": "P:(40-65), W:(35-60)", "LDL": "< 130", "Trigliserida": "< 150",
        "Gula Darah Sewaktu": "< 180", "GDP": "70 - 110", "2 Jam PP": "< 140", "HbA1C": "< 5.7",
        "Ureum": "P:(10-50), W:(7-40)", "Kreatinin": "P:(0.5-1.5), W:(0.5-1.2)", "Asam Urat": "P:(3.4-7.0), W:(2.4-5.7)",
        "SGOT": "P:(<40), W:(<38)", "SGPT": "P:(<45), W:(<40)", "HBsAg": "Non reaktif",
        "Warna": "Kuning", "Kejernihan": "Jernih", "Berat Jenis": "1.005 - 1.030", "Eritrosit": "Negatif", "Leukosit": "Negatif", "pH": "5.0 - 8.0", "Protein": "Negatif", "Glukosa": "Negatif", "Keton Urine": "Negatif", "Urobilinogen": "Normal", "Bilirubin": "Negatif", "Urobilin": "Negatif", "Nitrit": "Negatif", "Epitel": "Positif1", "Silinder": "Negatif", "Amorf Urat": "Negatif", "Amorf Phosphat": "Negatif", "Uric Acid": "Negatif", "Calcium Oxalat": "Negatif", "Triple Posphat": "Negatif", "Bakteri": "Negatif", "Lain - lain": "Negatif",
    },
    "labUnits": {
        "Hemoglobin": "g/dl", "Leukosit": "10^3/uL", "Hematokrit": "%", "Trombosit": "10^3/uL", "Eritrosit": "10^6/uL", "RDW": "%", "PCT": "%", "MCV": "fL", "MCH": "Pg", "MCHC": "%", "LED": "mm/Jam",
        "Basofil": "%", "Eosinofil": "%", "Nitrofil Batang": "%", "Nitrofil Segmen": "%", "Limfosit": "%", "Monosit": "%",
        "Kolesterol": "mg/dL", "HDL": "mg/dL", "LDL": "mg/dL", "Trigliserida": "mg/dL", "Gula Darah Sewaktu": "mg/dL", "GDP": "mg/dL", "2 Jam PP": "mg/dL", "HbA1C": "%", "Ureum": "mg/dL", "Kreatinin": "mg/dL", "Asam Urat": "mg/dL", "SGOT": "U/L", "SGPT": "U/L",
    },
}


# =========================
# GENERAL HELPERS
# =========================

def _safe(v: Any) -> str:
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except Exception:
        pass

    s = str(v)

    # Excel sering menyimpan line break sebagai token XML seperti _x000D_.
    # Jangan tampilkan token ini di PDF; ubah menjadi newline yang rapi.
    s = re.sub(r"(?i)_?x000d_?", "\n", s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = s.strip()

    if s.lower() in {"nan", "none", "null", "-"}:
        return ""
    return s


def _e(v: Any) -> str:
    return html.escape(_safe(v), quote=True)


def _br(v: Any) -> str:
    # Tambahkan jarak setengah baris setelah enter agar hasil/kesimpulan
    # tidak terlalu rapat di PDF.
    return _e(v).replace("\n", '<br><span class="half-line"></span>')


def _has(v: Any) -> bool:
    return bool(_safe(v))


def _norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s or "").strip().lower())


def _normalize_fit_status_label(v: Any) -> str:
    """Normalize berbagai penulisan status kelayakan menjadi label PDF."""
    s = _safe(v)
    n = _norm(s)
    if not n:
        return ""
    if n in {"unfit", "tidakfit", "tidaklayak"}:
        return "UNFIT"
    if n in {"temporaryunfit", "tempunfit", "temporarilyunfit", "temporarynotfit", "sementaratidakfit", "sementarabelumfit"}:
        return "TEMPORARY UNFIT"
    if n in {"fitwithnote", "fitwithnotes", "fitnote", "fitnotes", "fitdengancatatan", "fitdgncatatan", "fitcatatan", "layakdengancatatan"}:
        return "FIT WITH NOTE"
    if n in {"fit", "layak", "sehat"}:
        return "FIT"
    # Toleransi jika ada teks panjang di sel status.
    if "temporary" in n and "unfit" in n:
        return "TEMPORARY UNFIT"
    if "unfit" in n:
        return "UNFIT"
    if "fit" in n and ("note" in n or "catatan" in n):
        return "FIT WITH NOTE"
    if "fit" in n or "layak" in n:
        return "FIT"
    return ""


def _is_neutral_health_text(v: Any) -> bool:
    """True bila teks hanya menyatakan normal/tidak ada kelainan."""
    s = _safe(v)
    if not s:
        return True
    n = _norm(s)
    if not n:
        return True
    neutral_exact = {
        "normal", "sehat", "baik", "fit", "tidakada", "tidakada kelainan", "tidakadakelainan",
        "dalambatasnormal", "dalam batas normal", "dbn", "within normal limit", "withinnormallimit",
        "parudanjantungtidakadakelainan", "tidakditemukankelainan", "nonreaktif", "negatif",
    }
    if n in {_norm(x) for x in neutral_exact}:
        return True
    neutral_phrases = [
        "tidak ada kelainan", "dalam batas normal", "within normal", "normal limit",
        "paru dan jantung tidak ada kelainan", "tidak ditemukan kelainan",
        "hasil normal", "fungsi spirometri normal", "pendengaran dalam batas normal",
    ]
    low = s.lower()
    # Kalau semua baris adalah frasa normal, jangan dianggap catatan.
    lines = [x.strip() for x in re.split(r"[\n;]+", low) if x.strip()]
    if lines and all(any(p in line for p in neutral_phrases) or _norm(line) in {_norm(x) for x in neutral_exact} for line in lines):
        return True
    return False


def _count_meaningful_note_lines(v: Any) -> int:
    s = _safe(v)
    if not s:
        return 0
    # Pecah per baris atau delimiter umum; baris normal murni tidak dihitung.
    parts = [x.strip(" -•\t") for x in re.split(r"[\n;]+", s) if x.strip(" -•\t")]
    count = 0
    for part in parts:
        if len(_norm(part)) < 3:
            continue
        if _is_neutral_health_text(part):
            continue
        # Abaikan saran generik tahunan jika berdiri sendiri.
        np = _norm(part)
        if np in {_norm("Lakukan pemeriksaan kesehatan berkala setidaknya 1 tahun sekali"), _norm("Pemeriksaan kesehatan berkala setidaknya 1 tahun sekali")}:
            continue
        count += 1
    return count


def _count_abnormal_lab_items(lab_pages: List[List[Dict[str, Any]]], identity: Dict[str, Any]) -> int:
    tmp_data = {"patient": identity}
    total = 0
    try:
        for page in lab_pages or []:
            for r in page or []:
                if r.get("type") != "item":
                    continue
                if _is_lab_value_abnormal(r.get("value"), r.get("normal"), tmp_data):
                    total += 1
    except Exception:
        return 0
    return total


def _support_has_meaningful_note(support: Dict[str, Dict[str, Any]]) -> bool:
    for sup in (support or {}).values():
        if not isinstance(sup, dict) or not sup.get("has_any"):
            continue
        # Penunjang yang hanya menyatakan normal tidak mengubah status.
        text = "\n".join([_safe(sup.get("result")), _safe(sup.get("conclusion"))]).strip()
        if text and not _is_neutral_health_text(text):
            return True
    return False


def _auto_fit_status(identity: Dict[str, Any], conditions: List[Dict[str, Any]], lab_pages: List[List[Dict[str, Any]]], support: Dict[str, Dict[str, Any]]) -> str:
    """Auto status: catatan/temuan kesehatan -> FIT WITH NOTE.

    Prioritas:
    1. Jika Excel jelas berisi UNFIT/TEMPORARY UNFIT/FIT WITH NOTE, pakai itu.
    2. Jika Excel kosong atau FIT tapi ada catatan/abnormal, jadikan FIT WITH NOTE.
    3. Jika tidak ada catatan, FIT.
    """
    explicit = _normalize_fit_status_label(identity.get("fitStatus"))

    if explicit in {"UNFIT", "TEMPORARY UNFIT", "FIT WITH NOTE"}:
        return explicit

    conclusion_notes = _count_meaningful_note_lines(identity.get("conclusion"))
    suggestion_notes = _count_meaningful_note_lines(identity.get("suggestion"))
    condition_notes = sum(1 for c in (conditions or []) if _safe(c.get("condition")) and not _is_neutral_health_text(c.get("condition")))
    abnormal_lab = _count_abnormal_lab_items(lab_pages, identity)
    support_note = _support_has_meaningful_note(support)

    if conclusion_notes or condition_notes or abnormal_lab or support_note:
        return "FIT WITH NOTE"

    # Jika kesimpulan kosong tapi saran spesifik ada, tetap beri catatan.
    if suggestion_notes:
        return "FIT WITH NOTE"

    return "FIT"


def _num_from_text(v: Any) -> Optional[float]:
    s = _safe(v)
    if not s:
        return None
    s = s.replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except Exception:
        return None


def _gender_key_from_data(data: Dict[str, Any]) -> str:
    g = _safe(data.get("patient", {}).get("gender") or data.get("patient", {}).get("genderAge"))
    ng = _norm(g)
    if any(x in ng for x in ["wanita", "perempuan", "female"]):
        return "W"
    if any(x in ng for x in ["pria", "lakilaki", "male"]):
        return "P"
    return ""


def _pick_gender_normal(normal_text: Any, gender_key: str) -> str:
    s = _safe(normal_text)
    if not s or not gender_key:
        return s
    # contoh: P:(13.2-17.3), W:(11.7-15.5) atau P:(<40), W:(<38)
    m = re.search(rf"{gender_key}\s*:\s*\(([^)]*)\)", s, flags=re.I)
    if m:
        return m.group(1).strip()
    return s


def _parse_normal_range_bounds(normal_text: Any) -> Optional[Tuple[float, float]]:
    """Parse normal range seperti '4.4-5.9' atau '150 - 450'.

    Versi sebelumnya memakai regex angka umum sehingga '4.4-5.9' terbaca
    sebagai 4.4 dan -5.9. Akibatnya nilai rendah/tinggi tidak selalu
    terdeteksi abnormal dan font merah tidak muncul.
    """
    s = _safe(normal_text)
    if not s:
        return None
    s = s.replace(",", ".").replace("–", "-").replace("—", "-")

    # Separator range eksplisit: 4.4-5.9, 4.4 - 5.9, 150 s/d 450, 150 sd 450.
    m = re.search(
        r"(-?\d+(?:\.\d+)?)\s*(?:-|s\s*/\s*d|sd|to)\s*(-?\d+(?:\.\d+)?)",
        s,
        flags=re.I,
    )
    if m:
        a = float(m.group(1))
        b = float(m.group(2))
        return (min(a, b), max(a, b))

    # Fallback untuk format aneh yang tetap berisi dua angka.
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", s)]
    if len(nums) >= 2:
        return (min(nums[0], nums[1]), max(nums[0], nums[1]))
    return None


def _lab_normal_for(group: str, subgroup: str, label: str) -> str:
    # Beberapa label dipakai di hematologi dan urine; normal range harus kontekstual.
    ng = _norm(group)
    nl = _norm(label)
    if ng == "hematology" and nl == "leukosit":
        return "P:(3.8-11.0), W:(3.6-11.0)"
    if ng == "hematology" and nl == "eritrosit":
        return "P:(4.4-5.9), W:(3.8-5.2)"
    if ng == "urineanalysis" and nl in {"leukosit", "eritrosit", "silinder", "nitrit", "protein", "glukosa", "ketonurine", "bilirubin", "urobilin"}:
        return "Negatif"
    return APP_CONFIG["labNormalRanges"].get(label, "")


def _is_lab_value_abnormal(result: Any, normal_text: Any, data: Dict[str, Any]) -> bool:
    value = _safe(result)
    normal = _safe(normal_text)
    if not value or not normal:
        return False

    gender_key = _gender_key_from_data(data)
    normal_for_eval = _pick_gender_normal(normal, gender_key)
    nv = _num_from_text(value)
    nn = normal_for_eval.replace(",", ".")

    if nv is not None:
        # normal: < 200, <40, <=5.7
        m = re.search(r"<=\s*(-?\d+(?:\.\d+)?)", nn)
        if m:
            return nv > float(m.group(1))
        m = re.search(r"<\s*(-?\d+(?:\.\d+)?)", nn)
        if m:
            return nv >= float(m.group(1))

        # normal: > 40 atau >=40
        m = re.search(r">=\s*(-?\d+(?:\.\d+)?)", nn)
        if m:
            return nv < float(m.group(1))
        m = re.search(r">\s*(-?\d+(?:\.\d+)?)", nn)
        if m:
            return nv <= float(m.group(1))

        # normal: 150 - 450 / 13.2-17.3
        bounds = _parse_normal_range_bounds(nn)
        if bounds:
            lo, hi = bounds
            return nv < lo or nv > hi
        return False

    vv = _norm(value)
    nnorm = _norm(normal_for_eval)

    # hasil teks dianggap abnormal bila tidak sesuai nilai normal teks umum.
    if nnorm in {"negatif", "nonreaktif", "normal", "jernih", "kuning"}:
        return vv != nnorm

    # contoh normal berisi beberapa pilihan teks; kalau value tidak termasuk, warnai.
    if nnorm and len(nnorm) <= 40:
        return vv != nnorm

    return False


def _pick(row: Dict[str, Any], aliases: List[str]) -> str:
    if not row:
        return ""
    key_map = {_norm(k): k for k in row.keys()}
    for a in aliases:
        n = _norm(a)
        if n in key_map:
            v = _safe(row.get(key_map[n]))
            if v:
                return v
    # partial contains fallback
    for a in aliases:
        n = _norm(a)
        for nk, original in key_map.items():
            if n and (n in nk or nk in n):
                v = _safe(row.get(original))
                if v:
                    return v
    return ""


def _pick_exact(row: Dict[str, Any], aliases: List[str]) -> str:
    """
    Pick hanya dengan exact normalized header.
    Dipakai untuk kolom dokter/petugas agar alias seperti "Nama Dokter Lab"
    tidak salah mengambil kolom "NAMA" pasien.
    """
    if not row:
        return ""
    key_map = {_norm(k): k for k in row.keys()}
    for a in aliases:
        n = _norm(a)
        if n in key_map:
            v = _safe(row.get(key_map[n]))
            if v:
                return v
    return ""


def _pick_from_rows_exact(rows: List[Dict[str, Any]], aliases: List[str]) -> str:
    for r in rows:
        v = _pick_exact(r, aliases)
        if _safe(v):
            return v
    return ""


def _df_records(df: Optional[pd.DataFrame]) -> List[Dict[str, Any]]:
    if df is None or df.empty:
        return []
    return [dict(r) for _, r in df.iterrows()]


def _merge_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    # prefer later non-empty? Here keep first non-empty, works with person multi-sheet data.
    for rec in records:
        for k, v in rec.items():
            if _safe(v) and not _safe(out.get(k)):
                out[k] = v
    return out


def _sheet_records(records: List[Dict[str, Any]], patterns: List[str]) -> List[Dict[str, Any]]:
    if not records:
        return []
    pats = [_norm(p) for p in patterns]
    out = []
    for r in records:
        s = _norm(r.get("_SheetName") or r.get("Sheet") or r.get("sheet") or "")
        if any(p in s or s in p for p in pats):
            out.append(r)
    return out


def _lab_alias_norms() -> set:
    """Semua normalized header LAB dari konfigurasi."""
    out = set()
    for aliases in APP_CONFIG.get("labHeaders", {}).values():
        for a in aliases:
            n = _norm(a)
            if n:
                out.add(n)
    return out


def _lab_value_count(row: Dict[str, Any]) -> int:
    """
    Hitung jumlah kolom LAB yang benar-benar berisi value pada sebuah row.

    Penting: data LAB kadang tidak berada di sheet bernama LAB, tetapi ikut
    muncul di sheet FISIK/rekap. Karena itu deteksi harus berdasarkan header
    seperti DL:, HJ:, UR:, FH:, dst, bukan nama sheet.
    """
    if not row:
        return 0

    prefixes = ("dl", "hj", "ld", "gd", "fk", "fg", "fh", "hp", "ur")
    alias_norms = _lab_alias_norms()
    skip = {"nama", "nomcu", "nik", "nrp", "id", "jk", "usia", "tgllahir", "tanggalahir", "paket"}

    hits = 0
    for col, val in row.items():
        if not _safe(val):
            continue
        nc = _norm(col)
        if not nc or nc in skip:
            continue
        if nc in alias_norms or any(nc.startswith(p) for p in prefixes):
            hits += 1
    return hits


def _record_has_lab_columns(row: Dict[str, Any]) -> bool:
    """
    Deteksi baris LAB dari struktur kolom, bukan hanya dari nama sheet.
    Minimal 2 kolom lab terisi agar tidak salah menganggap row identitas sebagai LAB.
    """
    return _lab_value_count(row) >= 2


def _select_lab_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Pilih row sumber LAB berdasarkan header, bukan nama sheet.

    Kasus nyata: kolom DL:/HJ:/UR: bisa berada di sheet FISIK, sementara sheet
    LAB kosong/tidak lengkap. Maka semua row per peserta yang punya kolom lab
    dikumpulkan dan diurutkan dari yang paling lengkap. Sheet bernama LAB hanya
    menjadi fallback kalau tidak ada row yang terdeteksi dari header.
    """
    if not records:
        return []

    lab_like = [(r, _lab_value_count(r)) for r in records]
    lab_like = [(r, cnt) for r, cnt in lab_like if cnt >= 2]

    if lab_like:
        lab_like.sort(key=lambda item: item[1], reverse=True)
        return [r for r, _cnt in lab_like]

    return _sheet_records(records, ["LAB", "LABORATORIUM"])


def _gender_text(g: str) -> str:
    s = _safe(g).lower()
    if s in {"l", "lk", "laki", "laki-laki", "pria", "male", "m"}:
        return "Pria"
    if s in {"p", "pr", "perempuan", "wanita", "female", "f", "w"}:
        return "Wanita"
    return _safe(g)


def _parse_bp(bp: str) -> Optional[Tuple[str, str]]:
    m = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", _safe(bp))
    if not m:
        return None
    return m.group(1), m.group(2)


def _data_uri(path: str, base_dir: Optional[Path] = None) -> str:
    src = _safe(path)
    if not src:
        return ""
    if src.startswith(("data:", "http://", "https://", "file:///")):
        return src
    p = Path(src)
    if not p.exists() and base_dir:
        p = base_dir / src
    if not p.exists():
        return src
    try:
        mime = "image/png"
        if p.suffix.lower() in {".jpg", ".jpeg"}:
            mime = "image/jpeg"
        b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception:
        return str(p)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _template_dir(project_root: Optional[Path] = None) -> Path:
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        candidates = [
            exe_dir / "_internal" / "Templates" / "pdf",
            exe_dir / "Templates" / "pdf",
            Path(getattr(sys, "_MEIPASS", exe_dir)) / "Templates" / "pdf",
        ]
        for c in candidates:
            if c.exists():
                return c
    return (project_root or _project_root()) / "Templates" / "pdf"


def _find_logo(template_dir: Path) -> str:
    assets = template_dir / "assets"
    if assets.exists():
        choices = list(assets.glob("*logo*.*")) + list(assets.glob("logo*.*")) + list(assets.glob("*.png")) + list(assets.glob("*.jpg")) + list(assets.glob("*.jpeg"))
        if choices:
            return _data_uri(str(choices[0]), template_dir)
    # fallback remote
    return APP_CONFIG["clinic"].get("logoUrl", "")


def _path_is_file(p: str) -> bool:
    """Return True only if p is an existing file path."""
    try:
        return bool(p) and Path(str(p).strip().strip('"')).exists() and Path(str(p).strip().strip('"')).is_file()
    except Exception:
        return False


def _find_browser_from_registry() -> Optional[str]:
    """Cari Microsoft Edge / Google Chrome dari Windows Registry."""
    if os.name != "nt":
        return None
    try:
        import winreg  # type: ignore
    except Exception:
        return None

    keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"),
    ]
    for hive, subkey in keys:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                val, _ = winreg.QueryValueEx(key, "")
                if _path_is_file(val):
                    return str(Path(val).resolve())
        except Exception:
            continue
    return None


def _force_pdf_browser_env() -> Optional[str]:
    """Pastikan renderer PDF punya path Edge/Chrome.

    Urutan:
    1) ENV existing: PDF_BROWSER_PATH / AI_MCU_BROWSER / CHROME_PATH / EDGE_PATH
    2) path umum Edge/Chrome Windows
    3) registry Windows
    4) PATH via shutil.which

    Kalau ketemu, set semua ENV yang biasa dipakai renderer.
    """
    env_keys = ["PDF_BROWSER_PATH", "AI_MCU_BROWSER", "CHROME_PATH", "EDGE_PATH", "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    for key in env_keys:
        val = str(os.environ.get(key) or "").strip().strip('"')
        if _path_is_file(val):
            browser = str(Path(val).resolve())
            os.environ["PDF_BROWSER_PATH"] = browser
            os.environ["AI_MCU_BROWSER"] = browser
            os.environ["CHROME_PATH"] = browser
            os.environ["EDGE_PATH"] = browser
            os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] = browser
            return browser

    local_appdata = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    if local_appdata:
        candidates.extend([
            str(Path(local_appdata) / "Microsoft" / "Edge" / "Application" / "msedge.exe"),
            str(Path(local_appdata) / "Google" / "Chrome" / "Application" / "chrome.exe"),
        ])

    for c in candidates:
        if _path_is_file(c):
            browser = str(Path(c).resolve())
            os.environ["PDF_BROWSER_PATH"] = browser
            os.environ["AI_MCU_BROWSER"] = browser
            os.environ["CHROME_PATH"] = browser
            os.environ["EDGE_PATH"] = browser
            os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] = browser
            return browser

    reg = _find_browser_from_registry()
    if reg and _path_is_file(reg):
        browser = str(Path(reg).resolve())
        os.environ["PDF_BROWSER_PATH"] = browser
        os.environ["AI_MCU_BROWSER"] = browser
        os.environ["CHROME_PATH"] = browser
        os.environ["EDGE_PATH"] = browser
        os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] = browser
        return browser

    for name in ["msedge.exe", "chrome.exe", "msedge", "chrome", "chromium"]:
        found = shutil.which(name)
        if found and _path_is_file(found):
            browser = str(Path(found).resolve())
            os.environ["PDF_BROWSER_PATH"] = browser
            os.environ["AI_MCU_BROWSER"] = browser
            os.environ["CHROME_PATH"] = browser
            os.environ["EDGE_PATH"] = browser
            os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] = browser
            return browser

    return None


def _pdf_debug_dir() -> Path:
    """Folder debug writable untuk log renderer."""
    base = os.environ.get("AI_MCU_OUTPUT_DIR") or os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.home())
    p = Path(base)
    if p.name.lower() != "pdf_debug":
        if p.name.lower() == "ai_mcu_project":
            p = p / "output" / "pdf_debug"
        else:
            p = p / "AI_MCU_Project" / "output" / "pdf_debug"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _write_pdf_debug_log(message: str) -> None:
    try:
        dbg = _pdf_debug_dir()
        with open(dbg / "pdf_renderer_error.log", "a", encoding="utf-8") as f:
            f.write("\n" + "=" * 80 + "\n")
            f.write(str(message) + "\n")
    except Exception:
        pass


def _find_browser() -> Optional[str]:
    return _force_pdf_browser_env()

def _html_to_pdf_bytes(html_text: str, base_dir: Path) -> bytes:
    """Render HTML -> PDF via Edge/Chrome headless.

    Fix final untuk kasus:
    - Edge/Chrome returncode 0 tetapi report.pdf belum muncul.
    - Temp folder/profile masih di-lock oleh Edge sehingga muncul PermissionError 13.
    - Source mode dan EXE mode tetap pakai template HTML/CSS yang sama.

    Jangan pakai TemporaryDirectory context manager di sini karena Edge kadang
    masih menahan lock pada profile/temp folder beberapa detik setelah proses
    utama selesai. Cleanup dilakukan best-effort saja.
    """
    browser = _find_browser()
    if not browser:
        msg = (
            "Browser Edge/Chrome tidak ditemukan. Set PDF_BROWSER_PATH ke path msedge.exe/chrome.exe.\n"
            f"PDF_BROWSER_PATH={os.environ.get('PDF_BROWSER_PATH', '-')}\n"
            f"CHROME_PATH={os.environ.get('CHROME_PATH', '-')}\n"
            f"AI_MCU_BROWSER={os.environ.get('AI_MCU_BROWSER', '-')}"
        )
        _write_pdf_debug_log(msg)
        raise RuntimeError(msg)

    dbg = _pdf_debug_dir()
    last_report_html = dbg / "last_report.html"
    try:
        last_report_html.write_text(html_text or "", encoding="utf-8")
    except Exception:
        pass

    temp_root = Path(tempfile.mkdtemp(prefix="ai_mcu_pdf_"))
    html_path = temp_root / "report.html"
    html_path.write_text(html_text or "", encoding="utf-8")
    url = html_path.as_uri()

    def _safe_decode(b: Any, limit: int = 6000) -> str:
        try:
            if b is None:
                return ""
            if isinstance(b, bytes):
                return b.decode("utf-8", errors="ignore")[:limit]
            return str(b)[:limit]
        except Exception:
            return ""

    def _wait_until_pdf_ready(path: Path, timeout_sec: float = 45.0) -> bool:
        """Tunggu sampai PDF ada, size > 1000, dan size stabil beberapa kali."""
        start = time.time()
        last_size = -1
        stable = 0
        while time.time() - start < timeout_sec:
            try:
                if path.exists():
                    size = path.stat().st_size
                    if size > 1000:
                        if size == last_size:
                            stable += 1
                        else:
                            stable = 0
                            last_size = size
                        if stable >= 3:
                            return True
            except PermissionError:
                pass
            except Exception:
                pass
            time.sleep(0.35)
        try:
            return path.exists() and path.stat().st_size > 1000
        except Exception:
            return False

    def _read_pdf_with_retry(path: Path, timeout_sec: float = 20.0) -> bytes:
        start = time.time()
        last_err = None
        while time.time() - start < timeout_sec:
            try:
                data = path.read_bytes()
                if data and len(data) > 1000:
                    return data
            except PermissionError as e:
                last_err = e
            except Exception as e:
                last_err = e
            time.sleep(0.30)
        if last_err:
            raise last_err
        raise RuntimeError("PDF kosong / tidak dapat dibaca.")

    def _cleanup_temp_later(path: Path) -> None:
        for _ in range(3):
            try:
                shutil.rmtree(path, ignore_errors=True)
                if not path.exists():
                    return
            except Exception:
                pass
            time.sleep(0.5)

    common_flags = [
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--disable-popup-blocking",
        "--no-first-run",
        "--no-default-browser-check",
        "--allow-file-access-from-files",
        "--disable-web-security",
        "--disable-dev-shm-usage",
        "--disable-features=TranslateUI,AudioServiceOutOfProcess",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=3000",
    ]

    variants = [
        ["--headless=new", "--no-pdf-header-footer"],
        ["--headless", "--no-pdf-header-footer"],
        ["--headless=new", "--print-to-pdf-no-header"],
        ["--headless", "--print-to-pdf-no-header"],
        ["--headless=new", "--no-sandbox", "--no-pdf-header-footer"],
        ["--headless", "--no-sandbox", "--print-to-pdf-no-header"],
    ]

    errors: List[str] = []

    try:
        for idx, variant_flags in enumerate(variants, start=1):
            pdf_path = temp_root / f"report_{idx}.pdf"
            profile_dir = temp_root / f"chrome_profile_{idx}"
            profile_dir.mkdir(parents=True, exist_ok=True)

            try:
                if pdf_path.exists():
                    pdf_path.unlink()
            except Exception:
                pass

            cmd = [
                browser,
                *variant_flags,
                *common_flags,
                f"--user-data-dir={str(profile_dir)}",
                f"--print-to-pdf={str(pdf_path)}",
                url,
            ]

            try:
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    creationflags=creationflags,
                )

                try:
                    stdout, stderr = proc.communicate(timeout=90)
                except subprocess.TimeoutExpired:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    stdout, stderr = proc.communicate()
                    raise RuntimeError("Edge/Chrome timeout saat render PDF.")

                pdf_ok = _wait_until_pdf_ready(pdf_path, timeout_sec=45)
                try:
                    pdf_size = pdf_path.stat().st_size if pdf_path.exists() else 0
                except Exception:
                    pdf_size = 0

                errors.append(
                    "CMD: " + " ".join(cmd) + "\n"
                    f"RETURNCODE: {proc.returncode}\n"
                    f"PDF_EXISTS: {pdf_path.exists()}\n"
                    f"PDF_SIZE: {pdf_size}\n"
                    f"STDOUT:\n{_safe_decode(stdout)}\n"
                    f"STDERR:\n{_safe_decode(stderr)}\n"
                )

                if pdf_ok:
                    return _read_pdf_with_retry(pdf_path, timeout_sec=20)

            except Exception as e:
                errors.append(
                    "CMD: " + " ".join(cmd) + "\n"
                    f"ERROR: {repr(e)}\n"
                )
                continue

        msg = (
            "HTML to PDF browser renderer gagal.\n"
            f"Browser: {browser}\n"
            f"Base dir: {base_dir}\n"
            f"Temp root: {temp_root}\n"
            f"Debug HTML: {last_report_html}\n\n"
            "--- ERRORS ---\n"
            + "\n\n".join(errors)
        )
        _write_pdf_debug_log(msg)
        raise RuntimeError(msg)

    finally:
        _cleanup_temp_later(temp_root)

def _is_empty_like(v: Any) -> bool:
    s = _safe(v)
    if not s:
        return True
    return s.strip().lower() in {
        "-", "—", "nan", "none", "null",
        "tidak diperiksa", "tidak dilakukan", "tdk dilakukan",
        "tidak ada data"
    }
 
 
_SUPPORT_SKIP_COLS = {
    "_sheetname", "sheet", "nama", "name", "nomcu", "mcu_id", "mcuid",
    "no", "no.", "no urut", "no. urut", "no urut mcu", "no. urut mcu",
    "nourut", "nourutmcu", "nomor urut", "nomor urut mcu", "urutan",
    "kode", "kode karyawan", "employee id", "employeeid",
    "nik", "nrp", "id", "nik nrp id", "nik/nrp/id", "jk", "gender", "sex",
    "tgllahir", "tanggal lahir", "dob", "usia", "umur", "age",
    "nama pt", "perusahaan", "company", "dept", "departemen",
    "dept bagian", "dept/bagian", "bagian", "jabatan", "tanggal mcu", "tgl mcu", "tglmcu",
    "wilmcu", "wil mcu", "wilayah mcu", "wilayah", "lokasi", "lokasi mcu", "site", "area",
    "cabang", "branch", "kota", "city",
    # Kolom metadata paket/kategori tidak boleh dianggap sebagai hasil pemeriksaan.
    # Tanpa ini, halaman AUDIO/SPIRO/RONTGEN bisa tetap dibuat walau kolom HASIL kosong.
    "paket", "package", "package name", "packagename",
    "kategori", "category",
}
 
 
def _is_attachment_col(col: str) -> bool:
    nk = _norm(col)
    if not nk:
        return False
    attachment_tokens = ["link", "url", "image", "gambar", "lampiran", "attachment"]
    return any(tok in nk for tok in attachment_tokens)


def _is_support_value_col(col: str) -> bool:
    nk = _norm(col)
    if not nk:
        return False
 
    # skip identitas / metadata peserta / metadata lokasi
    for skip in _SUPPORT_SKIP_COLS:
        if nk == _norm(skip):
            return False

    # Extra guard: jangan pernah tampilkan metadata seperti NO.URUT/WILMCU di halaman penunjang.
    metadata_tokens = (
        "nourut", "nomorurut", "urutmcu", "wilmcu", "wilayahmcu",
        "wilayah", "lokasimcu", "kodekaryawan", "niknrpid"
    )
    if any(tok in nk for tok in metadata_tokens):
        return False

    # kolom attachment/link tidak dihitung sebagai hasil utama pemeriksaan
    if _is_attachment_col(col):
        return False
 
    # skip kolom interpretasi umum / kesimpulan utama / saran utama / dokter / metadata internal.
    # Halaman penunjang tidak boleh mengambil Kesimpulan/Saran MCU umum,
    # karena isinya bisa bercampur ke Rontgen/EKG/USG/dll.
    general_result_tokens = (
        "kesimpulan", "saran", "rekomendasi", "anjuran", "nextstep",
        "kategorinterpretasi", "kategoriinterpretasi", "hasilinterpretasi",
        "kesimpulaninterpretasi", "saraninterpretasi", "catataninterpretasi"
    )
    if nk.endswith("interpretasi") or any(tok in nk for tok in general_result_tokens):
        return False
    if nk.startswith("dokter") or "doctor" in nk or "penanggungjawab" in nk:
        return False
    if nk in {"status", "fitstatus", "kelayakan"}:
        return False
 
    return True
 
 
def _sheet_records_exact_or_contains(records: List[Dict[str, Any]], sheet_names: List[str]) -> List[Dict[str, Any]]:
    """
    Ambil rows berdasarkan _SheetName.
    Contoh sheet_names:
    ["AUDIO", "AUDIOMETRI"]
    ["SPIRO", "SPIROMETRI"]
    ["TREADMILL", "TREADMIL"]
    """
    wanted = [_norm(x) for x in sheet_names]
    out = []
 
    for r in records:
        s = _safe(r.get("_SheetName") or r.get("Sheet") or r.get("sheet"))
        ns = _norm(s)
 
        if not ns:
            continue
 
        if any(w == ns or w in ns or ns in w for w in wanted):
            out.append(r)
 
    return out
 
 
def _filter_records_for_person(records: List[Dict[str, Any]], nama_fallback: str) -> List[Dict[str, Any]]:
    """
    Ambil hanya rows milik peserta yang sedang dibuat PDF-nya.

    Ini penting karena rekap_rows sering berisi seluruh peserta dari sheet FISIK/LAB/
    RONTGEN/AUDIO/SPIRO. Tanpa filter ini, jika peserta lain punya HASIL AUDIO
    atau HASIL SPIRO, halaman penunjang bisa ikut muncul untuk semua peserta.
    """
    if not records:
        return []

    target = _norm(nama_fallback)
    if not target:
        return records

    ih = APP_CONFIG["identityHeaders"]

    exact: List[Dict[str, Any]] = []
    for r in records:
        row_name = _norm(_pick(r, ih.get("name", [])))
        row_nomcu = _norm(_pick(r, ih.get("nomcu", [])))
        row_nik = _norm(_pick(r, ih.get("nik", [])))
        if target and target in {row_name, row_nomcu, row_nik}:
            exact.append(r)

    if exact:
        return exact

    # Fallback untuk input nama yang kadang berisi gabungan seperti "001 - LAELA FITRIANI".
    partial: List[Dict[str, Any]] = []
    for r in records:
        row_name = _norm(_pick(r, ih.get("name", [])))
        row_nomcu = _norm(_pick(r, ih.get("nomcu", [])))
        if row_name and (row_name in target or target in row_name):
            partial.append(r)
        elif row_nomcu and (row_nomcu in target or target in row_nomcu):
            partial.append(r)

    return partial or records


def _sheet_has_meaningful_data(rows: List[Dict[str, Any]]) -> bool:
    """
    Sheet dianggap ada pemeriksaan kalau row peserta punya minimal 1 value hasil
    non-identitas/non-metadata yang terisi.
    """
    if not rows:
        return False
 
    for r in rows:
        for col, val in r.items():
            if not _is_support_value_col(str(col)):
                continue
            if not _is_empty_like(val):
                return True
 
    return False
 
 
def _support_section_key(sheet_names: List[str], conclusion_key: str = "", result_key: str = "") -> str:
    joined = _norm(" ".join(sheet_names or []) + " " + conclusion_key + " " + result_key)
    if any(x in joined for x in ["rontgen", "thorax", "radiologi"]):
        return "radiology"
    if any(x in joined for x in ["ekg", "ecg", "elektrokardio"]):
        return "ekg"
    if "usg" in joined:
        return "usg"
    if any(x in joined for x in ["audio", "audiometri", "audiogram"]):
        return "audiometry"
    if "treadmil" in joined or "treadmill" in joined:
        return "treadmill"
    if "spiro" in joined or "spirometri" in joined:
        return "spiro"
    return ""


def _support_allowed_col(col: str, section_key: str) -> bool:
    """
    Fallback halaman penunjang harus ketat dan hanya mengambil kolom milik
    pemeriksaan tersebut. Ini mencegah Kesimpulan/Saran MCU umum, GDP/GDS,
    atau kolom fisik ikut muncul di halaman Rontgen/EKG/dll.
    """
    nk = _norm(col)
    if not nk:
        return False

    # Kolom generik yang masih boleh dipakai hanya pada sheet penunjang spesifik
    # ketika vendor memberi nama kolom sederhana seperti "Hasil" / "Result".
    generic_allowed = {
        "hasil", "result", "hasilpemeriksaan", "hasiltest", "hasilexam",
        "keterangan", "catatanhasil", "pemeriksaan"
    }

    token_map = {
        "radiology": ["thorax", "rontgen", "xray", "radiologi", "fotothorax", "hasilthorax", "hasilrontgen"],
        "ekg": ["ekg", "ecg", "elektrokardiografi", "elektrokardiographi", "hasilekg"],
        "usg": ["usg", "abdomen", "hasilusg"],
        "audiometry": ["audio", "audiometri", "audiogram", "telinga", "pendengaran"],
        "treadmill": ["treadmill", "treadmil", "tmt", "hasiltreadmill", "hasiltreadmil"],
        "spiro": ["spiro", "spirometri", "spirometry", "fungsi paru", "fungsiparu"],
    }

    if nk in generic_allowed:
        return True

    return any(tok in nk for tok in token_map.get(section_key, []))


def _collect_support_text_from_sheet(
    rows: List[Dict[str, Any]],
    skip_values: Optional[List[str]] = None,
    section_key: str = "",
) -> str:
    """
    Fallback kalau alias result/conclusion tidak ketemu.
    Hanya mengambil kolom yang benar-benar relevan dengan jenis pemeriksaan
    penunjang. Tidak lagi mengambil KESIMPULAN/SARAN MCU umum atau parameter lab.
    """
    lines = []
    seen = set()
    skip_norm_values = {_norm(x) for x in (skip_values or []) if _safe(x)}
 
    for r in rows:
        for col, val in r.items():
            col_s = str(col).strip()
            if not _is_support_value_col(col_s):
                continue
            if section_key and not _support_allowed_col(col_s, section_key):
                continue
            if _is_empty_like(val):
                continue
            if _norm(val) in skip_norm_values:
                continue
 
            key = f"{col_s}::{_safe(val)}"
            if key in seen:
                continue
            seen.add(key)
 
            # Untuk kolom generik "Hasil", tampilkan nilai saja agar halaman bersih.
            if _norm(col_s) in {"hasil", "result", "hasilpemeriksaan", "hasiltest", "hasilexam"}:
                lines.append(_safe(val))
            else:
                lines.append(f"{col_s} : {_safe(val)}")
 
    return "\n".join(lines)

def _pick_from_rows(rows: List[Dict[str, Any]], aliases: List[str]) -> str:
    """
    Cari value dari beberapa row sheet tertentu saja.
    """
    for r in rows:
        v = _pick(r, aliases)
        if _safe(v):
            return v
    return ""


def _looks_like_attachment_value(v: Any) -> bool:
    s = _safe(v)
    if not s:
        return False
    s_low = s.lower()
    if s_low.startswith(("http://", "https://", "file:///", "data:")):
        return True
    return Path(s).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".pdf"}


def _pick_generic_attachment_from_rows(rows: List[Dict[str, Any]]) -> str:
    for r in rows:
        for col, val in r.items():
            if not _is_attachment_col(str(col)):
                continue
            if _looks_like_attachment_value(val):
                return _safe(val)
    return ""
 
 
def _support_from_sheet_only(
    records: List[Dict[str, Any]],
    sheet_names: List[str],
    conclusion_key: str = "",
    result_key: str = "",
    image_key: str = "",
    doctor_aliases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Support page hanya boleh muncul kalau sheet-nya ada dan isinya ada.
    Tidak fallback ke allrow.

    Catatan:
    - kolom link/gambar dipakai hanya untuk halaman lampiran, bukan untuk menentukan
      apakah halaman hasil penunjang harus dibuat.
    - nama dokter support diambil dari sheet terkait; jika kosong isi "-".
    """
    rows = _sheet_records_exact_or_contains(records, sheet_names)
    section_key = _support_section_key(sheet_names, conclusion_key, result_key)

    if not rows:
        return {
            "has_sheet": False,
            "has_any": False,
            "conclusion": "",
            "result": "",
            "image": "",
            "doctor": "-",
        }

    conclusion = ""
    result = ""
    image = ""
    doctor = _pick_from_rows_exact(rows, doctor_aliases or []) or "-"

    if conclusion_key:
        conclusion = _pick_from_rows(rows, APP_CONFIG["otherHeaders"].get(conclusion_key, []))

    if result_key:
        result = _pick_from_rows(rows, APP_CONFIG["otherHeaders"].get(result_key, []))

    if image_key:
        image = _pick_from_rows(rows, APP_CONFIG["otherHeaders"].get(image_key, []))

    # fallback text untuk vendor header yang berbeda, tapi tetap dibatasi per jenis pemeriksaan.
    # Jangan pernah mengambil Kesimpulan/Saran MCU umum atau parameter lab ke halaman penunjang.
    generic_text = _collect_support_text_from_sheet(rows, skip_values=[conclusion, result], section_key=section_key)
    if not result and generic_text:
        result = generic_text

    # Untuk rontgen, bila file hanya punya 1 kolom Thorax Foto, tampilkan juga sebagai hasil
    # agar area "Hasil" tidak kosong, tetapi tetap tidak bercampur data lain.
    if not result and section_key == "radiology" and conclusion:
        result = f"Thorax Foto : {conclusion}"

    # fallback generic attachment kalau alias khusus belum ketemu
    if not image:
        image = _pick_generic_attachment_from_rows(rows)

    # halaman support hanya dibuat jika ada hasil/kesimpulan tekstual di row peserta
    has_any = bool(_safe(conclusion) or _safe(result))

    return {
        "has_sheet": True,
        "has_any": has_any,
        "conclusion": conclusion,
        "result": result,
        "image": image,
        "doctor": doctor,
    }

# =========================
# DATA BUILDERS
# =========================

def _build_identity(allrow: Dict[str, Any], nama_fallback: str) -> Dict[str, str]:
    ih = APP_CONFIG["identityHeaders"]
    gender = _gender_text(_pick(allrow, ih["gender"]))
    age = _pick(allrow, ih["age"])
    return {
        "companyName": _pick(allrow, ih["company"]),
        "mcuDate": _pick(allrow, ih["mcuDate"]),
        "issuedDate": _pick(allrow, ih["issuedDate"]) or _pick(allrow, ih["mcuDate"]),
        "nomcu": _pick(allrow, ih["nomcu"]),
        "name": _pick(allrow, ih["name"]) or _safe(nama_fallback),
        "gender": gender,
        "dob": _pick(allrow, ih["dob"]),
        "age": age,
        "genderAge": f"{gender} / {age} Thn." if gender or age else "",
        "packageName": _pick(allrow, ih["packageName"]),
        "category": _pick(allrow, ih["category"]),
        "conclusion": _pick(allrow, ih["conclusion"]),
        "suggestion": _pick(allrow, ih["suggestion"]),
        "department": _pick(allrow, ih["department"]),
        "fitStatus": _pick(allrow, ih["fitStatus"]) or "FIT",
        "photoUrl": _pick(allrow, ih["photoUrl"]),
        "nik": _pick(allrow, ih["nik"]),
        "bagian": _pick(allrow, ih["bagian"]) or "-",
        "jabatan": _pick(allrow, ih["jabatan"]) or "-",
    }


def _build_doctors(allrow: Dict[str, Any]) -> Dict[str, str]:
    return {k: _pick(allrow, aliases) for k, aliases in APP_CONFIG["doctorHeaders"].items()}


def _ph(data: Dict[str, Any], key: str) -> str:
    return _pick(data, APP_CONFIG["physicalHeaders"].get(key, []))


def _push_heading(rows: List[Dict[str, str]], text: str) -> None:
    rows.append({"type": "heading", "text": text})


def _push_item(rows: List[Dict[str, str]], label: str, value: Any, fallback: str = "") -> None:
    v = _safe(value) or _safe(fallback)
    if v:
        rows.append({"type": "item", "label": label, "value": v})


def build_physical_rows(data: Dict[str, Any]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    _push_heading(rows, "Anamnesa")
    _push_item(rows, "Keluhan saat ini", _ph(data, "kelSkrg"), "Tidak Ada")
    _push_item(rows, "Riwayat Penyakit Keluarga", _ph(data, "rwKesKelg"), "Tidak Ada")
    _push_item(rows, "Riwayat Bahaya Lingkungan Kerja", _ph(data, "hazardKerja"), "Tidak Ada")
    _push_item(rows, "Riwayat Kesehatan Dahulu", _ph(data, "rwKesDulu"), "Tidak Ada")
    _push_item(rows, "Riwayat Penyakit Hepatitis A", _ph(data, "pnyHAV"), "Tidak Ada")
    _push_item(rows, "Riwayat Penyakit Hipertensi", _ph(data, "pnyHpTensi"), "Tidak Ada")

    _push_heading(rows, "Kebiasaan")
    _push_item(rows, "Minum Kopi", _ph(data, "kopi"))
    _push_item(rows, "Merokok", _ph(data, "rokok"))
    _push_item(rows, "Olahraga", _ph(data, "olahRaga"))

    _push_heading(rows, "Tanda Vital")
    _push_item(rows, "Tinggi Badan", _ph(data, "tb"))
    _push_item(rows, "Berat Badan", _ph(data, "bb"))
    _push_item(rows, "Berat Badan Ideal", _ph(data, "bbi"))
    _push_item(rows, "BMI", _ph(data, "bmi"))
    _push_item(rows, "Lingkar Perut", _ph(data, "lingkarPerut"))
    bp_value = _ph(data, "tensi")
    if not bp_value and (_ph(data, "tensiAtas") or _ph(data, "tensiBawah")):
        bp_value = f"{_ph(data, 'tensiAtas')}/{_ph(data, 'tensiBawah')}".strip("/")
    _push_item(rows, "Tekanan Darah", bp_value)
    bp = _parse_bp(bp_value)
    if bp:
        _push_item(rows, "Sistolik", bp[0])
        _push_item(rows, "Diastolik", bp[1])
    _push_item(rows, "Nadi", _ph(data, "nadi"))
    _push_item(rows, "Pernafasan", _ph(data, "nafas"))

    _push_heading(rows, "Mata")
    _push_item(rows, "Memakai Kacamata", _ph(data, "kcMata"), "Tidak")
    _push_heading(rows, "Visus Mata")
    _push_item(rows, "Tanpa Kacamata", _ph(data, "tnpKcMata"))
    _push_item(rows, "Dengan Kacamata", _ph(data, "dgnKcMata"))
    _push_item(rows, "Buta Warna", _ph(data, "butaWarna"))
    _push_item(rows, "Lain-lain", _ph(data, "mataLain"), "Tidak Ada")

    _push_heading(rows, "Telinga, Hidung, Tenggorokan")
    _push_item(rows, "Telinga", _ph(data, "thtTelinga"))
    _push_item(rows, "Hidung", _ph(data, "thtHidung"))
    _push_item(rows, "Tenggorokan", _ph(data, "thtTenggor"))
    _push_item(rows, "Tonsil", _ph(data, "thtTonsil"))
    _push_item(rows, "Lain-lain", _ph(data, "thtLain"))

    _push_heading(rows, "Mulut")
    _push_item(rows, "Bibir", _ph(data, "mltBibir"))
    _push_item(rows, "Lidah", _ph(data, "mltLidah"))
    _push_item(rows, "Gigi", _ph(data, "gigi"))
    _push_item(rows, "Lain-lain", _ph(data, "mltLain"))

    _push_heading(rows, "Leher")
    _push_item(rows, "Umum", _ph(data, "lhrUmum"))
    _push_item(rows, "Tyroid/Trachea", _ph(data, "lhrTyroid"))
    _push_item(rows, "Lain-lain", _ph(data, "lhrLain"))

    _push_heading(rows, "Thorax")
    _push_item(rows, "Bentuk", _ph(data, "trxBentuk"))
    _push_item(rows, "Paru-paru", _ph(data, "trxParu"))
    _push_item(rows, "Jantung", _ph(data, "trxJtg"))
    _push_item(rows, "Lain-lain", _ph(data, "trxLain"))

    _push_heading(rows, "Abdomen")
    _push_item(rows, "Bentuk", _ph(data, "abdBentuk"))
    _push_item(rows, "Palpasi/Perkusi", _ph(data, "abdPalpasi"))
    _push_item(rows, "Hernia", _ph(data, "abdHernia"))
    _push_item(rows, "Hati", _ph(data, "abdHati"))
    _push_item(rows, "Limpa", _ph(data, "abdLimpa"))

    _push_heading(rows, "Ginjal")
    _push_item(rows, "Test Ketok", _ph(data, "abdKetok"))
    _push_item(rows, "Ballotement", _ph(data, "abdBall"))
    _push_item(rows, "Haemorrhoid", _ph(data, "abdHmrhoid"))
    _push_item(rows, "Lain-lain", _ph(data, "abdLain"))

    _push_heading(rows, "Extremitas Atas dan Bawah")
    _push_item(rows, "Tulang/Sendi", _ph(data, "extTulang"))
    _push_item(rows, "Otot-otot/Tonus", _ph(data, "extOtot"))
    _push_item(rows, "Jari-jari/Kuku", _ph(data, "extJari"))

    _push_heading(rows, "Neurologis")
    _push_item(rows, "Fungsi Motorik", _ph(data, "nrMotorik"))
    _push_item(rows, "Fungsi Sensorik", _ph(data, "nrSensorik"))
    _push_item(rows, "Reflex Fisiologis", _ph(data, "nrRefFisio"))
    _push_item(rows, "Reflex Patologis", _ph(data, "nrRefPato"))
    _push_item(rows, "Lain-lain", _ph(data, "nrLain"))
    return rows


def _physical_units(group: Dict[str, Any]) -> float:
    units = 2.0 if group.get("heading", {}).get("text") else 0.0
    for item in group.get("items", []):
        label_len = len(_safe(item.get("label")))
        value_len = len(_safe(item.get("value")))
        units += 1.15
        if label_len > 24: units += 0.15
        if value_len > 24: units += 0.20
        if value_len > 45: units += 0.30
        if value_len > 70: units += 0.40
    return units


def _build_physical_groups(rows: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    groups: List[Dict[str, Any]] = []
    current = None
    for r in rows:
        if r.get("type") == "heading":
            current = {"heading": r, "items": []}
            groups.append(current)
        elif current is not None:
            current["items"].append(r)
    for g in groups:
        g["units"] = _physical_units(g)
    return groups


def _split_physical_groups(groups: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, str]]]:
    total = sum(float(g.get("units", 0)) for g in groups)
    target = total / 2.0
    left: List[Dict[str, str]] = []
    right: List[Dict[str, str]] = []
    left_units = 0.0
    for g in groups:
        block = [g["heading"]] + list(g.get("items", []))
        units = float(g.get("units", 0))
        if (left_units + units <= target) or not left:
            left.extend(block)
            left_units += units
        else:
            right.extend(block)
    if not right and left:
        cut = math.ceil(len(left) / 2)
        right = left[cut:]
        left = left[:cut]
    return {"left": left, "right": right}


def _pick_lab_exact(row: Dict[str, Any], aliases: List[str]) -> str:
    """
    Ambil nilai LAB hanya dari header yang match exact setelah dinormalisasi.
    Jangan pakai partial/contains untuk LAB, karena alias pendek seperti Eos/Mono/Urogen
    bisa salah mengambil kolom identitas atau kolom lain, misalnya No MCU = 076.
    """
    if not row:
        return ""
    key_map = {_norm(k): k for k in row.keys()}
    for a in aliases:
        n = _norm(a)
        if n in key_map:
            v = _safe(row.get(key_map[n]))
            if v:
                return v
    return ""


def _lab_val(data: Dict[str, Any], key: str) -> str:
    return _pick_lab_exact(data, APP_CONFIG["labHeaders"].get(key, []))


def _make_lab_row(group: str, subgroup: str, label: str, value: str, source_key: str = "") -> Optional[Dict[str, str]]:
    if not _has(value):
        return None
    return {
        "group": group,
        "subgroup": subgroup or "",
        "label": label,
        "value": _safe(value),
        "normal": _lab_normal_for(group, subgroup, label),
        "unit": APP_CONFIG["labUnits"].get(label, ""),
        "source_key": _safe(source_key),
    }


LAB_ROW_SPECS: List[Tuple[str, str, str, str]] = [
    ("Hematology", "Darah Lengkap", "Hemoglobin", "hb"),
    ("Hematology", "Darah Lengkap", "Leukosit", "leu"),
    ("Hematology", "Darah Lengkap", "Hematokrit", "ht"),
    ("Hematology", "Darah Lengkap", "Trombosit", "trom"),
    ("Hematology", "Darah Lengkap", "Eritrosit", "eri"),
    ("Hematology", "Darah Lengkap", "RDW", "rdw"),
    ("Hematology", "Darah Lengkap", "PCT", "pct"),
    ("Hematology", "Darah Lengkap", "MCV", "mcv"),
    ("Hematology", "Darah Lengkap", "MCH", "mch"),
    ("Hematology", "Darah Lengkap", "MCHC", "mchc"),
    ("Hematology", "Hitung Jenis Lekosit", "Basofil", "bas"),
    ("Hematology", "Hitung Jenis Lekosit", "Eosinofil", "eos"),
    ("Hematology", "Hitung Jenis Lekosit", "Nitrofil Batang", "batang"),
    ("Hematology", "Hitung Jenis Lekosit", "Nitrofil Segmen", "neutrofil"),
    ("Hematology", "Hitung Jenis Lekosit", "Limfosit", "limfosit"),
    ("Hematology", "Hitung Jenis Lekosit", "Monosit", "mono"),
    ("Hematology", "", "LED", "led"),
    ("Kimia Darah", "Lemak Darah", "Kolesterol", "chol"),
    ("Kimia Darah", "Lemak Darah", "HDL", "hdl"),
    ("Kimia Darah", "Lemak Darah", "LDL", "ldl"),
    ("Kimia Darah", "Lemak Darah", "Trigliserida", "trig"),
    ("Kimia Darah", "Glukosa Darah", "Gula Darah Sewaktu", "gds"),
    ("Kimia Darah", "Glukosa Darah", "GDP", "gdp"),
    ("Kimia Darah", "Glukosa Darah", "2 Jam PP", "pp2"),
    ("Kimia Darah", "Glukosa Darah", "HbA1C", "hba1c"),
    ("Kimia Darah", "Fungsi Ginjal", "Ureum", "ureum"),
    ("Kimia Darah", "Fungsi Ginjal", "Kreatinin", "kreatinin"),
    ("Kimia Darah", "Fungsi Ginjal", "Asam Urat", "asamUrat"),
    ("Kimia Darah", "Fungsi Hati", "SGOT", "sgot"),
    ("Kimia Darah", "Fungsi Hati", "SGPT", "sgpt"),
    ("Kimia Darah", "Fungsi Hati", "Alkali Fosfatase", "alfos"),
    ("Kimia Darah", "Fungsi Hati", "Bilirubin Total", "biltot"),
    ("Kimia Darah", "Fungsi Hati", "Bilirubin Direk", "bildir"),
    ("Kimia Darah", "Fungsi Hati", "Bilirubin Indirek", "bilind"),
    ("Kimia Darah", "Fungsi Hati", "GGT", "ggt"),
    ("Serologi/Imunologi", "", "HBsAg", "hbsag"),
]

URINE_ROW_SPECS: List[Tuple[str, str, str, str]] = [
    ("Urine Analysis", "Makroskopis", "Warna", "urWarna"),
    ("Urine Analysis", "Makroskopis", "Kejernihan", "urJernih"),
    ("Urine Analysis", "Makroskopis", "Berat Jenis", "urBj"),
    ("Urine Analysis", "Makroskopis", "Eritrosit", "urErit1"),
    ("Urine Analysis", "Makroskopis", "Leukosit", "urLeko1"),
    ("Urine Analysis", "Makroskopis", "pH", "urPh"),
    ("Urine Analysis", "Makroskopis", "Protein", "urProt"),
    ("Urine Analysis", "Makroskopis", "Glukosa", "urGlu"),
    ("Urine Analysis", "Makroskopis", "Keton Urine", "urKeton"),
    ("Urine Analysis", "Makroskopis", "Urobilinogen", "urUrogen"),
    ("Urine Analysis", "Makroskopis", "Bilirubin", "urBil"),
    ("Urine Analysis", "Makroskopis", "Urobilin", "urUrobil"),
    ("Urine Analysis", "Makroskopis", "Nitrit", "urNitrit"),
    ("Urine Analysis", "Mikroskopis", "Leukosit", "urLeko2"),
    ("Urine Analysis", "Mikroskopis", "Eritrosit", "urErit2"),
    ("Urine Analysis", "Mikroskopis", "Epitel", "urEpitel"),
    ("Urine Analysis", "Mikroskopis", "Silinder", "urSlndr"),
    ("Urine Analysis", "Kristal", "Amorf Urat", "urAmUrat"),
    ("Urine Analysis", "Kristal", "Amorf Phosphat", "urAmPhos"),
    ("Urine Analysis", "Kristal", "Uric Acid", "urUrAcid"),
    ("Urine Analysis", "Kristal", "Calcium Oxalat", "urCaOxalat"),
    ("Urine Analysis", "Kristal", "Triple Posphat", "urTriPosp"),
    ("Urine Analysis", "Kristal", "Bakteri", "urBakteri"),
    ("Urine Analysis", "Kristal", "Lain - lain", "urKrisLain"),
]


def _add_lab_spec_rows(rows: List[Dict[str, str]], data: Dict[str, Any], specs: List[Tuple[str, str, str, str]]) -> None:
    for group, subgroup, label, key in specs:
        value = _lab_val(data, key)
        r = _make_lab_row(group, subgroup, label, value, source_key=key)
        if r:
            rows.append(r)


def build_main_lab_rows(data: Dict[str, Any]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    _add_lab_spec_rows(rows, data, LAB_ROW_SPECS)
    return rows


def build_urine_lab_rows(data: Dict[str, Any]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    _add_lab_spec_rows(rows, data, URINE_ROW_SPECS)
    return rows


def _configured_lab_header_norms() -> set:
    norms = set()
    for aliases in APP_CONFIG.get("labHeaders", {}).values():
        for a in aliases:
            norms.add(_norm(a))
    return norms


def _extra_lab_rows_from_prefixed_columns(data: Dict[str, Any], existing_rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Tambahkan parameter LAB yang belum ada di daftar standar, tetapi kolomnya ada di Excel.
    Ini mencegah hasil lab terlihat terlalu sedikit bila vendor menambah kolom baru.
    """
    if not data:
        return []

    configured = _configured_lab_header_norms()
    existing_labels = {(_norm(r.get("group")), _norm(r.get("subgroup")), _norm(r.get("label"))) for r in existing_rows}
    prefix_map = [
        ("dl", "Hematology", "Darah Lengkap"),
        ("hj", "Hematology", "Hitung Jenis Lekosit"),
        ("ld", "Kimia Darah", "Lemak Darah"),
        ("gd", "Kimia Darah", "Glukosa Darah"),
        ("fk", "Kimia Darah", "Fungsi Ginjal"),
        ("fg", "Kimia Darah", "Fungsi Ginjal"),
        ("fh", "Kimia Darah", "Fungsi Hati"),
        ("hp", "Serologi/Imunologi", ""),
        ("ur", "Urine Analysis", "Tambahan"),
    ]

    extras: List[Dict[str, str]] = []
    for col, val in data.items():
        if not _has(val):
            continue
        raw_col = _safe(col)
        nc = _norm(raw_col)
        if not nc or nc in configured:
            continue
        if "interpretasi" in nc or nc.startswith("kes") or nc.startswith("status"):
            continue

        group = subgroup = ""
        for prefix, g, sg in prefix_map:
            if nc.startswith(prefix):
                group, subgroup = g, sg
                break
        if not group:
            continue

        # Ambil label setelah ':' bila ada, agar DL:Ht -> Ht untuk kolom tambahan.
        label = raw_col.split(":", 1)[-1].strip() if ":" in raw_col else raw_col.strip()
        if not label:
            continue
        sig = (_norm(group), _norm(subgroup), _norm(label))
        if sig in existing_labels:
            continue
        r = _make_lab_row(group, subgroup, label, val, source_key=raw_col)
        if r:
            extras.append(r)
            existing_labels.add(sig)
    return extras


def build_all_lab_rows(data: Dict[str, Any]) -> List[Dict[str, str]]:
    rows = build_main_lab_rows(data) + build_urine_lab_rows(data)
    rows.extend(_extra_lab_rows_from_prefixed_columns(data, rows))
    return rows


def _lab_units(row: Dict[str, str], prev_group: str, prev_subgroup: str) -> float:
    """Estimasi bobot baris LAB untuk pagination manual.

    Versi sebelumnya terlalu konservatif sehingga halaman LAB cepat pecah dan
    menyisakan ruang kosong besar. Nilai ini dibuat lebih realistis terhadap
    CSS tabel: row normal = 1 unit, heading group/subgroup menambah sedikit.
    """
    units = 1.00
    if row.get("group") != prev_group:
        units += 0.70
    if row.get("subgroup") and row.get("subgroup") != prev_subgroup:
        units += 0.45
    if len(_safe(row.get("label"))) > 28:
        units += 0.10
    value_len = len(_safe(row.get("value")))
    if value_len > 24:
        units += 0.10
    if value_len > 48:
        units += 0.15
    return units


def _lab_page_units(page_rows: List[Dict[str, str]]) -> float:
    total = 0.0
    pg = ""
    ps = ""
    for rr in page_rows or []:
        total += _lab_units(rr, pg, ps)
        pg = rr.get("group", "")
        ps = rr.get("subgroup", "")
    return total


def _rebalance_lab_orphan_pages(pages: List[List[Dict[str, str]]], min_last_rows: int = 8) -> List[List[Dict[str, str]]]:
    """
    Hindari halaman LAB terakhir berisi 1-3 baris saja.

    Penyebab kasus seperti baris "Lain-lain" sendirian di halaman berikutnya:
    tabel HTML terlalu tinggi dan renderer memecah fisik halaman sendiri.
    Jadi jangan memaksa merge kalau melebihi kapasitas; lebih baik pindahkan beberapa
    baris dari halaman sebelumnya ke halaman terakhir agar halaman terakhir tetap bermakna.
    """
    if len(pages) < 2:
        return pages

    last = pages[-1]
    prev = pages[-2]

    if len(last) >= min_last_rows or len(prev) <= min_last_rows + 2:
        return pages

    # Kalau aman benar-benar muat, boleh merge. Jangan merge bila melewati batas,
    # karena itu membuat tabel overflow dan tanda tangan muncul di halaman yang salah.
    if _lab_page_units(prev + last) <= LAB_MAX_UNITS_PER_PAGE:
        pages[-2] = prev + last
        pages.pop()
        return pages

    # Jika tidak muat, rebalance. Ambil satu blok terakhir dari prev. Prioritas:
    # baris dengan subgroup yang sama (contoh seluruh blok Kristal), kalau tidak cukup
    # ambil beberapa baris terakhir sampai halaman terakhir tidak terlalu kosong.
    moved: List[Dict[str, str]] = []

    if prev:
        tail_subgroup = prev[-1].get("subgroup", "")
        tail_group = prev[-1].get("group", "")
        while prev and len(last) + len(moved) < min_last_rows:
            cand = prev[-1]
            same_block = (
                cand.get("group", "") == tail_group
                and cand.get("subgroup", "") == tail_subgroup
            )
            if moved and not same_block and len(last) + len(moved) >= 4:
                break
            moved.insert(0, prev.pop())

    # Kalau blok yang dipindah masih kurang, ambil beberapa baris terakhir lagi.
    while prev and len(last) + len(moved) < min_last_rows:
        moved.insert(0, prev.pop())

    if moved:
        pages[-2] = prev
        pages[-1] = moved + last

    return [pg for pg in pages if pg]


def paginate_lab_rows(rows: List[Dict[str, str]], max_units: int = LAB_MAX_UNITS_PER_PAGE) -> List[List[Dict[str, str]]]:
    pages: List[List[Dict[str, str]]] = []
    current: List[Dict[str, str]] = []
    used = 0.0
    prev_group = ""
    prev_subgroup = ""

    for row in rows:
        units = _lab_units(row, prev_group, prev_subgroup)
        if current and used + units > max_units:
            pages.append(current)
            current = []
            used = 0.0
            prev_group = ""
            prev_subgroup = ""
            units = _lab_units(row, prev_group, prev_subgroup)

        current.append(row)
        used += units
        prev_group = row.get("group", "")
        prev_subgroup = row.get("subgroup", "")

    if current:
        pages.append(current)

    # Rebalance terakhir supaya tidak ada satu-dua baris nyasar ke halaman baru.
    pages = _rebalance_lab_orphan_pages(pages, min_last_rows=8)
    return pages


def _support_value(allrow: Dict[str, Any], sheet_rows: List[Dict[str, Any]], key_conc: str, key_res: str, key_img: Optional[str] = None) -> Dict[str, str]:
    sheet = _merge_records(sheet_rows) if sheet_rows else {}
    conc = _pick(sheet, APP_CONFIG["otherHeaders"].get(key_conc, [])) or _pick(allrow, APP_CONFIG["otherHeaders"].get(key_conc, []))
    res = _pick(sheet, APP_CONFIG["otherHeaders"].get(key_res, [])) or _pick(allrow, APP_CONFIG["otherHeaders"].get(key_res, []))
    img = ""
    if key_img:
        img = _pick(sheet, APP_CONFIG["otherHeaders"].get(key_img, [])) or _pick(allrow, APP_CONFIG["otherHeaders"].get(key_img, []))
    return {"conclusion": conc, "result": res, "image": img}


def build_report_data(nama: str, rekap_rows: pd.DataFrame, abn_rows: Optional[pd.DataFrame], cond_rows: Optional[pd.DataFrame]) -> Dict[str, Any]:
    records_all = _df_records(rekap_rows)
    records = _filter_records_for_person(records_all, nama)
    allrow = _merge_records(records)

    fisik_rows = _sheet_records(records, ["FISIK", "FS"])

    # LAB sekarang dipilih dari HEADER, bukan dari nama sheet.
    # Jadi kalau DL:/HJ:/UR: berada di sheet FISIK, hasil tetap lengkap dan benar.
    lab_rows = _select_lab_records(records)

    fisik = _merge_records(fisik_rows) or allrow
    lab = _merge_records(lab_rows) if lab_rows else allrow

    identity = _build_identity(allrow, nama)
    doctors = _build_doctors(allrow)

    # Halaman kesimpulan koordinator selalu memakai dokter tetap klinik.
    doctors["summaryDoctor"] = APP_CONFIG["clinic"].get("doctorName", "")

    sheet_doctors = {
        "lab": _pick_from_rows_exact(lab_rows, APP_CONFIG["doctorHeaders"].get("labDoctor", [])) or "-",
        "physical": _pick_from_rows_exact(fisik_rows, APP_CONFIG["doctorHeaders"].get("defaultDoctor", [])) or "-",
    }

    conditions = []
    try:
        if cond_rows is not None and not cond_rows.empty:
            for _, rr in cond_rows.iterrows():
                conditions.append({
                    "condition": _safe(rr.get("Condition") or rr.get("condition")),
                    "severity": _safe(rr.get("Severity") or rr.get("severity")),
                    "score": _safe(rr.get("Score") or rr.get("score")),
                    "evidence": _safe(rr.get("Evidence") or rr.get("evidence")),
                })
    except Exception:
        conditions = []

    if not identity["conclusion"] and conditions:
        identity["conclusion"] = "\n".join([f"{c['condition']} ({c['evidence']})" for c in conditions if c.get("condition")])
    if not identity["suggestion"] and conditions:
        identity["suggestion"] = "Lakukan konsultasi dokter dan pemeriksaan kesehatan berkala sesuai temuan."

    physical_rows = build_physical_rows(fisik)
    physical = _split_physical_groups(_build_physical_groups(physical_rows))
    lab_pages = paginate_lab_rows(build_all_lab_rows(lab))

    support = {
        "radiology": _support_from_sheet_only(
            records=records,
            sheet_names=["RONTGEN", "THORAX", "RADIOLOGI"],
            conclusion_key="thoraxFoto",
            result_key="thoraxResult",
            image_key="xrayPhotoLink",
            doctor_aliases=APP_CONFIG["doctorHeaders"].get("radiologyDoctor", []),
        ),
        "ekg": _support_from_sheet_only(
            records=records,
            sheet_names=["EKG", "ECG", "ELEKTROKARDIOGRAFI", "ELEKTROKARDIOGRAPHI"],
            conclusion_key="ekgConclusion",
            result_key="ekgResult",
            image_key="ekgImageLink",
            doctor_aliases=APP_CONFIG["doctorHeaders"].get("ekgDoctor", []),
        ),
        "usg": _support_from_sheet_only(
            records=records,
            sheet_names=["USG"],
            conclusion_key="usgConclusion",
            result_key="usgResult",
            image_key="usgImageLink",
            doctor_aliases=APP_CONFIG["doctorHeaders"].get("usgDoctor", []),
        ),
        "audiometry": _support_from_sheet_only(
            records=records,
            sheet_names=["AUDIO", "AUDIOMETRI", "AUDIOGRAM"],
            conclusion_key="audiometryConclusion",
            result_key="audiometryResult",
            image_key="audiometryImageLink",
            doctor_aliases=APP_CONFIG["doctorHeaders"].get("audiometryDoctor", []),
        ),
        "treadmill": _support_from_sheet_only(
            records=records,
            sheet_names=["TREADMILL", "TREADMIL"],
            conclusion_key="treadmillConclusion",
            result_key="treadmillResult",
            image_key="treadmillImageLink",
            doctor_aliases=APP_CONFIG["doctorHeaders"].get("treadmillDoctor", []),
        ),
        "spiro": _support_from_sheet_only(
            records=records,
            sheet_names=["SPIRO", "SPIROMETRI"],
            conclusion_key="spirometry",
            result_key="spirometry",
            image_key="spirometryImageLink",
            doctor_aliases=APP_CONFIG["doctorHeaders"].get("spiroDoctor", []),
        ),
    }

    # Auto-detect FIT WITH NOTE bila ada temuan/catatan kesehatan, meskipun
    # kolom status kosong atau terisi FIT. Status explicit UNFIT/TEMPORARY
    # UNFIT/FIT WITH NOTE dari Excel tetap diprioritaskan.
    identity["fitStatus"] = _auto_fit_status(identity, conditions, lab_pages, support)

    return {
        "clinic": dict(APP_CONFIG["clinic"]),
        "patient": identity,
        "doctors": doctors,
        "sheetDoctors": sheet_doctors,
        "conditions": conditions,
        "physical": physical,
        "labPages": lab_pages,
        "support": support,
    }


# =========================
# HTML RENDERERS
# =========================

def _page_header(data: Dict[str, Any], title: str, page_no: int, page_count: int, tdir: Path, extra_class: str = "") -> str:
    clinic = data["clinic"]
    p = data["patient"]
    logo = _data_uri(clinic.get("logoDataUri") or _find_logo(tdir), tdir)
    return f"""
    <div class="page {extra_class}">
      <div class="top-brand">
        <div class="brand-left">{f'<img src="{logo}" alt="Logo">' if logo else ''}</div>
        <div class="brand-right">
          <div>{_e(clinic.get('address'))}</div>
          <div>{_e(clinic.get('phone'))}</div>
          <div>{_e(clinic.get('email'))}</div>
          <div>{_e(clinic.get('website'))}</div>
        </div>
      </div>
      <div class="header-box">
        <div class="page-title">{_e(title)}</div>
        <table class="identity-grid"><tr>
          <td class="identity-left-wrap"><table class="identity-table">
            <tr><td class="identity-label">PERUSAHAAN</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('companyName'))}</td></tr>
            <tr><td class="identity-label">NIK/NRP/ID</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('nik'))}</td></tr>
            <tr><td class="identity-label">DEPT/BAGIAN</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('department'))}</td></tr>
            <tr><td class="identity-label">TANGGAL MCU</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('mcuDate'))}</td></tr>
          </table></td>
          <td class="identity-right-wrap"><table class="identity-table">
            <tr><td class="identity-label">NAMA</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('name'))}</td></tr>
            <tr><td class="identity-label">TANGGAL LAHIR</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('dob'))}</td></tr>
            <tr><td class="identity-label">JK / USIA</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('genderAge'))}</td></tr>
            <tr><td class="identity-label">NO. MCU</td><td class="identity-colon">:</td><td class="identity-value">{_e(p.get('nomcu'))}</td></tr>
          </table></td>
        </tr></table>
      </div>
    """


def _page_footer(data: Dict[str, Any], page_no: int, page_count: int) -> str:
    return f"""
      <div class="footer"><table class="footer-table"><tr>
        <td class="footer-left">{_e(data['clinic'].get('confidentialityLabel') or 'Rahasia')}</td>
        <td class="footer-right">Hasil MCU, Hal. : {page_no} / {page_count}</td>
      </tr></table></div>
    </div>
    """


def _render_cover(data: Dict[str, Any], page_no: int, page_count: int, tdir: Path) -> str:
    clinic = data["clinic"]
    p = data["patient"]
    logo = _data_uri(clinic.get("logoDataUri") or _find_logo(tdir), tdir)
    photo = _data_uri(p.get("photoUrl") or "", tdir)
    rows = [("Nama", p.get("name")), ("Tanggal Lahir", p.get("dob")), ("Jenis Kelamin / Usia", p.get("genderAge")), ("No. MCU", p.get("nomcu")), ("Tanggal Mcu", p.get("mcuDate")), ("NIK/NRP/ID", p.get("nik")), ("Perusahaan", p.get("companyName")), ("Departement", p.get("department")), ("Bagian", p.get("bagian") or "-"), ("Jabatan", p.get("jabatan") or "-")]
    trs = "".join([f'<tr><td class="c-label">{_e(k)}</td><td class="c-colon">:</td><td class="c-value">{_e(v)}</td></tr>' for k, v in rows])
    return f"""
    <div class="page">
      <div class="cover-shell">
        <div>
          <div class="cover-top"><div class="cover-top-left"><div class="cover-logo-wrap">{f'<img src="{logo}" alt="Logo">' if logo else ''}</div></div>
          <div class="cover-top-right"><div class="cover-contact-box"><div>{_e(clinic.get('address'))}</div><div>{_e(clinic.get('phone'))}</div><div>{_e(clinic.get('email'))}</div><div>{_e(clinic.get('website'))}</div></div></div></div>
          <div class="cover-hero"><div class="cover-photo-col"><div class="cover-photo-box">{f'<img src="{photo}" alt="Foto Peserta">' if photo else ''}</div></div>
          <div class="cover-hero-right"><div class="cover-patient-name">{_e(p.get('name'))}</div><div class="cover-mini-label">No. Medical Record / NIK/NRP</div><div class="cover-mini-value">{_e(p.get('nomcu'))} / {_e(p.get('nik') or '-')}</div><div class="cover-mini-label">Tanggal Mcu</div><div class="cover-mini-value">{_e(p.get('mcuDate'))}</div></div></div>
          <div class="cover-main-title">Laporan Hasil Medical Check Up</div>
          <div class="cover-section-bar">Data Pasien</div>
          <table class="cover-patient-table">{trs}</table>
          <div class="cover-team-area"><div class="cover-section-bar">Team Medical Check Up</div><div class="cover-team-space"></div></div>
        </div>
      </div>
      <div class="cover-footer"><div class="cover-footer-line"></div><table class="cover-footer-table"><tr><td class="cover-footer-left">{_e(clinic.get('confidentialityLabel') or 'Rahasia')}</td><td class="cover-footer-right">Hasil MCU, Hal. : {page_no} / {page_count}</td></tr></table></div>
    </div>
    """


def _render_certificate(data: Dict[str, Any], page_no: int, page_count: int, tdir: Path) -> str:
    p = data["patient"]
    clinic = data["clinic"]
    doctors = data["doctors"]
    status = _normalize_fit_status_label(p.get("fitStatus")) or "FIT"
    def mark(label: str) -> str:
        return "☑" if status == _normalize_fit_status_label(label) else "☐"
    out = _page_header(data, "KESIMPULAN MEDICAL CHECK UP", page_no, page_count, tdir)
    out += f"""
      <div class="fit-box"><div class="fit-title">FIT STATUS</div><table class="fit-row"><tr>
        <td><span class="checkbox">{mark('FIT')}</span> FIT</td>
        <td><span class="checkbox">{mark('FIT WITH NOTE')}</span> Fit With Note</td>
        <td><span class="checkbox">{mark('TEMPORARY UNFIT')}</span> Temporary Unfit</td>
        <td><span class="checkbox">{mark('UNFIT')}</span> Unfit</td>
      </tr></table></div>
      <div><div class="summary-label">Kesimpulan</div><div class="summary-line"></div><div class="summary-content">{_br(p.get('conclusion'))}</div></div>
      <div style="margin-top:10px;"><div class="summary-label">Saran</div><div class="summary-line"></div><div class="summary-content">{_br(p.get('suggestion'))}</div></div>
      <div class="summary-sign"><div class="title">{_e(clinic.get('summarySignatureTitle') or 'Koordinator MCU')}</div><div class="line">{_e(clinic.get('doctorName') or 'dr. Olieve Indri Leksmana, SpOK')}</div></div>
    """
    out += _page_footer(data, page_no, page_count)
    return out


def _render_physical(data: Dict[str, Any], page_no: int, page_count: int, tdir: Path) -> str:
    def mini(rows: List[Dict[str, str]]) -> str:
        x = []
        for r in rows:
            if r.get("type") == "heading":
                x.append(f'<tr><td class="heading" colspan="2">{_e(r.get("text"))}</td></tr>')
            else:
                x.append(f'<tr><td class="label">{_e(r.get("label"))}</td><td class="value">{_e(r.get("value"))}</td></tr>')
        return "".join(x)
    out = _page_header(data, "HASIL PEMERIKSAAN FISIK", page_no, page_count, tdir)
    out += f"""
      <table class="physical-head-table"><tr><td>ITEM PEMERIKSAAN</td><td>H A S I L</td><td>ITEM PEMERIKSAAN</td><td>H A S I L</td></tr></table>
      <table class="physical-wrap"><tr><td><table class="physical-mini">{mini(data['physical']['left'])}</table></td><td><table class="physical-mini">{mini(data['physical']['right'])}</table></td></tr></table>
    """
    out += _page_footer(data, page_no, page_count)
    return out


def _render_lab_page(data: Dict[str, Any], rows: List[Dict[str, str]], page_no: int, page_count: int, tdir: Path, is_last: bool) -> str:
    out = _page_header(data, "HASIL PEMERIKSAAN LABORATORIUM", page_no, page_count, tdir, "page-lab")
    last_g = ""
    last_s = ""
    body = []
    for r in rows:
        if r.get("group") != last_g:
            last_g = r.get("group", "")
            last_s = ""
            body.append(f'<tr class="lab-group-row"><td colspan="5">{_e(last_g)}</td></tr>')
        if r.get("subgroup") and r.get("subgroup") != last_s:
            last_s = r.get("subgroup", "")
            body.append(f'<tr class="lab-subgroup-row"><td colspan="5">{_e(last_s)}</td></tr>')
        is_abnormal = _is_lab_value_abnormal(r.get("value"), r.get("normal"), data)
        result_cls = "center lab-result-abnormal" if is_abnormal else "center"
        # Inline style sengaja ditambahkan agar renderer HTML->PDF tetap mewarnai
        # hasil abnormal walaupun prioritas CSS class diabaikan.
        result_style = ' style="color:#c00000 !important; font-weight:bold !important;"' if is_abnormal else ""
        body.append(f'<tr><td>{_e(r.get("label"))}</td><td class="{result_cls}"{result_style}>{_e(r.get("value"))}</td><td class="center">{_e(r.get("normal"))}</td><td class="center">{_e(r.get("unit"))}</td><td class="center"></td></tr>')
    sig = ""
    if is_last:
        d = data.get("sheetDoctors", {}).get("lab") or "-"
        if _norm(d) == _norm(data.get("patient", {}).get("name")):
            d = "-"
        sig = f'<div class="support-signature">Penanggung Jawab : {_e(d)}</div>'
    out += f'<table class="lab-table"><tr><th style="width:25%;">ITEM PEMERIKSAAN</th><th style="width:16%;">H A S I L</th><th style="width:24%;">NILAI NORMAL</th><th style="width:11%;">UNIT</th><th style="width:24%;">KETERANGAN</th></tr>{"".join(body)}</table>{sig}'
    out += _page_footer(data, page_no, page_count)
    return out


def _render_support_page(data: Dict[str, Any], exam_name: str, sup: Dict[str, str], doctor_key: str, page_no: int, page_count: int, tdir: Path) -> str:
    out = _page_header(data, "HASIL PEMERIKSAAN PENUNJANG", page_no, page_count, tdir)
    doctor = _safe(sup.get("doctor")) or "-"
    if _norm(doctor) == _norm(data.get("patient", {}).get("name")):
        doctor = "-"
    out += f"""
      <div class="section-strip">{_e(exam_name)}</div>
      <div><div class="support-label">Hasil</div><div class="support-line"></div><div class="support-content">{_br(sup.get('result'))}</div></div>
      <div style="margin-top:12px;"><div class="support-label">Kesimpulan</div><div class="support-line"></div><div class="support-content">{_br(sup.get('conclusion'))}</div></div>
      <div class="support-signature">Penanggung Jawab : {_e(doctor)}</div>
    """
    out += _page_footer(data, page_no, page_count)
    return out


def _render_support_attachment(data: Dict[str, Any], exam_name: str, sup: Dict[str, str], page_no: int, page_count: int, template_dir: Path) -> str:
    img = _data_uri(sup.get("image") or "", template_dir)

    html_page = _page_header(
        data,
        "HASIL PEMERIKSAAN PENUNJANG",
        page_no,
        page_count,
        template_dir
    )

    img_html = f'<img src="{img}" alt="{_e(exam_name)}">' if img else '<div style="padding:20px; text-align:center; font-size:11px;">Lampiran tidak tersedia.</div>'

    html_page += (
        f'<div class="attached-title">Terlampir Hasil : {_e(exam_name)}</div>'
        f'<div class="xray-wrap">{img_html}</div>'
    )

    html_page += _page_footer(data, page_no, page_count)
    return html_page

def _build_pages(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    pages: List[Dict[str, Any]] = [
        {"type": "cover"},
        {"type": "certificate"},
    ]

    if data["physical"]["left"] or data["physical"]["right"]:
        pages.append({"type": "physical"})

    for idx, rows in enumerate(data["labPages"]):
        pages.append({
            "type": "lab",
            "rows": rows,
            "is_last": idx == len(data["labPages"]) - 1,
        })

    sup = data["support"]

    support_specs = [
        ("radiology", "THORAX FOTO", "radiologyDoctor"),
        ("ekg", "ELEKTROKARDIOGRAFI", "ekgDoctor"),
        ("treadmill", "TREADMILL", "treadmillDoctor"),
        ("usg", "USG", "usgDoctor"),
        ("audiometry", "AUDIOMETRI", "audiometryDoctor"),
        ("spiro", "SPIROMETRI", "spiroDoctor"),
    ]

    for section, exam_name, doctor_key in support_specs:
        item = sup.get(section, {})
        if not item.get("has_any"):
            continue

        pages.append({
            "type": "support",
            "section": section,
            "exam_name": exam_name,
            "sup": item,
            "doctor_key": doctor_key,
        })

        if _has(item.get("image")):
            pages.append({
                "type": "support_image",
                "section": section,
                "exam_name": exam_name,
                "sup": item,
            })

    return pages
 

def render_report_html(data: Dict[str, Any], project_root: Optional[Path] = None) -> str:
    tdir = _template_dir(project_root)
    css_path = tdir / "style.css"
    css = css_path.read_text(encoding="utf-8") if css_path.exists() else DEFAULT_CSS
    pages = _build_pages(data)
    count = len(pages)
    rendered = []
    for i, p in enumerate(pages, start=1):
        if p["type"] == "cover": rendered.append(_render_cover(data, i, count, tdir))
        elif p["type"] == "certificate": rendered.append(_render_certificate(data, i, count, tdir))
        elif p["type"] == "physical": rendered.append(_render_physical(data, i, count, tdir))
        elif p["type"] == "lab": rendered.append(_render_lab_page(data, p["rows"], i, count, tdir, p["is_last"]))
        elif p["type"] == "support": rendered.append(_render_support_page(data, p["exam_name"], p["sup"], p["doctor_key"], i, count, tdir))
        elif p["type"] == "support_image": rendered.append(_render_support_attachment(data, p["exam_name"], p["sup"], i, count, tdir))
    return f'<!doctype html><html><head><meta charset="utf-8"><base href="{tdir.as_uri()}/"><style>{css}</style></head><body>{"".join(rendered)}</body></html>'


DEFAULT_CSS = r"""
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; background: #fff; color:#111; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width:210mm; min-height:297mm; padding:5mm 7mm 10mm 7mm; page-break-after: always; position:relative; background:#fff; overflow:hidden; }
.page:last-child { page-break-after:auto; }
.top-brand { display:table; width:100%; margin-bottom:12px; }
.brand-left,.brand-right{ display:table-cell; vertical-align:top; }
.brand-left{ width:360px; }
.brand-left img{ max-width:340px; max-height:105px; width:auto; height:auto; display:block; }
.brand-right{ text-align:right; font-size:10.5px; color:#2f4f7f; font-weight:bold; line-height:1.35; }
.header-box{ border:1px solid #777; margin-bottom:0; }
.page-title{ background:#d9d9d9; border-bottom:1px solid #777; text-align:center; font-weight:bold; font-family:"Courier New", monospace; font-size:13px; letter-spacing:.8px; padding:4px 6px; }
.identity-grid{ width:100%; border-collapse:collapse; table-layout:fixed; }
.identity-grid td{ vertical-align:top; padding:6px 8px; }
.identity-left-wrap{ width:49%; }.identity-right-wrap{ width:51%; }
.identity-table{ width:100%; border-collapse:collapse; table-layout:fixed; }
.identity-table td{ font-size:10.4px; padding:2px 0; vertical-align:top; line-height:1.08; }
.identity-label{ width:105px; white-space:nowrap; }.identity-colon{ width:12px; text-align:center; }.identity-value{ font-weight:bold; word-break:normal; overflow-wrap:break-word; padding-left:2px!important; }
.section-strip{ background:#d9d9d9; border:1px solid #777; text-align:center; font-weight:bold; font-family:"Courier New", monospace; font-size:12px; letter-spacing:.7px; padding:4px 6px; margin:6px 0; }
.fit-box{ border:1px solid #777; margin:4px 0 8px 0; }.fit-title{ background:#d9d9d9; border-bottom:1px solid #777; text-align:center; font-weight:bold; font-family:"Courier New", monospace; font-size:12px; padding:4px; }
.fit-row{ width:100%; border-collapse:collapse; }.fit-row td{ font-size:11px; padding:9px 10px; text-align:center; font-weight:bold; }
.summary-label,.support-label{ display:inline-block; min-width:108px; padding:5px 9px; border:1px solid #9d9d9d; border-radius:3px; background:#efefef; font-style:italic; font-weight:bold; font-size:11.5px; }
.summary-line,.support-line{ border-top:1px solid #777; margin-top:-1px; margin-bottom:7px; }
.summary-content{ font-size:13px; line-height:1.85; min-height:150px; padding-left:8px; white-space:pre-wrap; }
.support-content{ font-size:13px; line-height:1.85; padding-left:8px; min-height:96px; white-space:pre-wrap; }
.summary-sign{ position:absolute; right:12mm; bottom:16mm; width:175px; text-align:center; font-size:10px; }.summary-sign .title{ margin-bottom:20px; }.summary-sign .line{ border-top:1px solid #000; padding-top:4px; font-weight:bold; }
.physical-head-table{ width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:0; }.physical-head-table td{ border:1px solid #777; background:#d9d9d9; text-align:center; font-weight:bold; font-family:"Courier New", monospace; font-size:11px; padding:5px 6px; }
.physical-wrap{ width:100%; border-collapse:collapse; table-layout:fixed; margin-top:2px; }.physical-wrap td{ width:50%; vertical-align:top; padding:0 8px; }
.physical-mini{ width:100%; border-collapse:collapse; table-layout:fixed; }.physical-mini tr{ page-break-inside:avoid; break-inside:avoid; }
.physical-mini td{ font-size:10px; line-height:1.25; padding:1.8px 0; vertical-align:top; }
.physical-mini .heading{ font-weight:bold; padding-top:5px; padding-bottom:2px; font-size:10.5px; }
.physical-mini .label{ width:45%; padding-right:6px; white-space:normal; word-break:break-word; }.physical-mini .value{ width:55%; border-bottom:1px solid #333; text-align:center; padding-bottom:1px; padding-left:3px; word-break:break-word; }
.lab-table{ width:100%; border-collapse:collapse; table-layout:fixed; }.lab-table tr{ page-break-inside:avoid; break-inside:avoid; }
.lab-table th,.lab-table td{ border:0; border-bottom:1px solid #333; padding:4.9px 6px; font-size:11.7px; line-height:1.52; vertical-align:middle; word-break:break-word; }
.lab-table th{ background:#d9d9d9; border:1px solid #777; text-align:center; font-weight:bold; font-family:"Courier New", monospace; font-size:11.3px; padding:4.8px 6px; line-height:1.35; }
.lab-group-row td{ font-weight:bold; background:#fff; border-bottom:0; padding-top:6px; padding-bottom:2px; font-size:11.5px; line-height:1.45; page-break-after:avoid; }
.lab-subgroup-row td{ font-weight:bold; background:#fff; border-bottom:0; padding-left:16px; padding-top:4.8px; padding-bottom:2px; font-size:11.2px; line-height:1.45; page-break-after:avoid; }
.center{text-align:center;}.half-line{display:block;height:6px;}.lab-result-abnormal{ color:#c00000!important; font-weight:700!important; }.support-signature{ margin-top:8px; text-align:right; font-size:10px; font-style:italic; font-weight:bold; }
.attached-title{ font-size:11px; font-style:italic; font-weight:bold; text-decoration:underline; margin:10px 0 10px 10px; }
.xray-wrap{ text-align:center; margin-top:8px; }.xray-wrap img{ max-width:88%; max-height:225mm; border:1px solid #888; padding:2px; }
.footer{ position:absolute; left:7mm; right:7mm; bottom:4mm; font-size:9px; color:#333; }
.footer-table{ width:100%; border-collapse:collapse; }.footer-left{text-align:center; font-style:italic;}.footer-right{text-align:right;}.checkbox{font-size:16px; line-height:1; vertical-align:middle; margin-right:6px;}
.cover-shell{ height:255mm; display:flex; flex-direction:column; justify-content:space-between; }
.cover-top{ display:flex; justify-content:space-between; align-items:flex-start; gap:10mm; margin-top:4mm; }.cover-top-left{ flex:0 0 38%; }.cover-top-right{ flex:0 0 58%; }
.cover-logo-wrap img{ max-width:320px; max-height:110px; width:auto; height:auto; display:block; }.cover-contact-box{ border:1px solid #ececec; background:#fafafa; padding:10px 14px; color:#2f4f7f; font-weight:700; font-size:10.5px; line-height:1.9; }
.cover-hero{ display:flex; align-items:center; justify-content:space-between; gap:18mm; margin:26mm 0 18mm 0; }
.cover-photo-col{ flex:0 0 34%; display:flex; justify-content:center; }.cover-photo-box{ width:58mm; height:72mm; border:2px solid #333; border-radius:4px; overflow:hidden; background:#fff; display:flex; align-items:center; justify-content:center; }.cover-photo-box img{ width:100%; height:100%; object-fit:cover; display:block; }
.cover-hero-right{ flex:0 0 56%; text-align:center; }.cover-patient-name{ font-size:28px; font-weight:700; margin-bottom:18px; }.cover-mini-label{ font-size:11px; font-style:italic; color:#333; margin-bottom:4px; }.cover-mini-value{ font-size:13px; font-weight:700; margin-bottom:12px; }
.cover-main-title{ text-align:center; font-size:24px; font-weight:700; margin:10mm 0 14px 0; }.cover-section-bar{ width:100%; background:#cfcfcf; border:1px solid #888; border-radius:3px; text-align:center; font-family:"Courier New", monospace; font-size:13px; font-weight:bold; letter-spacing:1px; padding:5px 10px; margin:12px 0; }
.cover-patient-table{ width:100%; max-width:560px; margin:0 auto; border-collapse:collapse; }.cover-patient-table td{ font-size:12px; padding:4px; vertical-align:top; }.cover-patient-table .c-label{ width:42%; text-align:right; white-space:nowrap; }.cover-patient-table .c-colon{ width:16px; text-align:center; }.cover-patient-table .c-value{ font-weight:700; }
.cover-team-area{ margin-top:12px; }.cover-team-space{ height:72mm; }.cover-footer{ position:absolute; left:7mm; right:7mm; bottom:4mm; font-size:9px; color:#333; }.cover-footer-table{ width:100%; border-collapse:collapse; }.cover-footer-left{text-align:center; font-style:italic;}.cover-footer-right{text-align:right;}.cover-footer-line{ border-top:1px solid #777; margin-bottom:4px; }
.page-lab{ padding-top:2mm; padding-bottom:8mm; }.page-lab .top-brand{ margin-bottom:2px; }.page-lab .brand-left{ width:230px; }.page-lab .brand-left img{ max-width:220px; max-height:58px; }.page-lab .brand-right{ font-size:9.4px; line-height:1.22; }.page-lab .header-box{ margin-bottom:4px; }.page-lab .page-title{ padding:2px 6px; font-size:12px; }.page-lab .identity-grid td{ padding:2.6px 8px; }.page-lab .identity-table td{ font-size:9.7px; padding:0.8px 0; line-height:1.0; }
"""


def build_mcu_pdf_bytes_gs_port(nama: str, rekap_rows: pd.DataFrame, abn_rows: Optional[pd.DataFrame] = None, cond_rows: Optional[pd.DataFrame] = None, project_root: Optional[Path | str] = None) -> bytes:
    """Drop-in replacement untuk _build_mcu_pdf_bytes di main.py."""
    root = Path(project_root) if project_root else _project_root()
    data = build_report_data(nama, rekap_rows, abn_rows, cond_rows)
    html_text = render_report_html(data, root)
    tdir = _template_dir(root)
    browser_error = ""
    try:
        return _html_to_pdf_bytes(html_text, tdir)
    except Exception as e:
        browser_error = str(e)
        _write_pdf_debug_log("[Browser renderer error] " + browser_error)
        # fallback xhtml2pdf, agar app tetap generate meskipun Edge/Chrome tidak ada
        try:
            import io
            from xhtml2pdf import pisa
            out = io.BytesIO()
            pisa_status = pisa.CreatePDF(src=html_text, dest=out, encoding="utf-8")
            if getattr(pisa_status, "err", 0):
                raise RuntimeError(f"xhtml2pdf error count: {getattr(pisa_status, 'err', '')}")
            pdf_bytes = out.getvalue()
            if pdf_bytes and len(pdf_bytes) > 1000:
                return pdf_bytes
            raise RuntimeError("xhtml2pdf menghasilkan PDF kosong/terlalu kecil")
        except Exception as e2:
            _write_pdf_debug_log("[xhtml2pdf error] " + str(e2))
            import io
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import mm
            from reportlab.pdfgen import canvas
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=A4)
            W, H = A4
            c.setFont("Helvetica-Bold", 14)
            c.drawString(20*mm, H-20*mm, "Hasil MCU")
            c.setFont("Helvetica", 10)
            c.drawString(20*mm, H-30*mm, f"Nama: {nama}")
            c.drawString(20*mm, H-38*mm, "HTML renderer gagal. Cek Edge/Chrome atau xhtml2pdf.")
            c.setFont("Helvetica", 7)
            c.drawString(20*mm, H-46*mm, "Log: %LOCALAPPDATA%\AI_MCU_Project\output\pdf_debug\pdf_renderer_error.log")
            c.showPage()
            c.save()
            buf.seek(0)
            return buf.getvalue()


# =========================
# PDF MERGE / PRINT HELPERS
# =========================

def _as_path_list(pdf_paths: List[Any]) -> List[Path]:
    """Normalize list path PDF, skip item kosong/tidak ada."""
    out: List[Path] = []
    for p in pdf_paths or []:
        pp = Path(p)
        if pp.exists() and pp.is_file() and pp.suffix.lower() == ".pdf":
            out.append(pp)
    return out


def merge_pdf_files(pdf_paths: List[Any], output_path: Any) -> Path:
    """
    Gabungkan beberapa PDF menjadi 1 file untuk kebutuhan print.

    Dependency:
        pip install pypdf

    Fallback juga mendukung PyPDF2 jika pypdf belum tersedia.
    """
    paths = _as_path_list(pdf_paths)
    if not paths:
        raise ValueError("Tidak ada file PDF valid untuk digabungkan.")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        from pypdf import PdfWriter
    except Exception:
        from PyPDF2 import PdfWriter  # type: ignore

    writer = PdfWriter()
    for pdf in paths:
        try:
            writer.append(str(pdf))
        except AttributeError:
            # Kompatibilitas PyPDF2 lama.
            from PyPDF2 import PdfReader  # type: ignore
            reader = PdfReader(str(pdf))
            for page in reader.pages:
                writer.add_page(page)

    with output.open("wb") as f:
        writer.write(f)

    try:
        writer.close()
    except Exception:
        pass

    return output


def split_pdf_paths_by_count(pdf_paths: List[Any], batch_size: int = 100) -> List[List[Path]]:
    """Pecah daftar PDF per jumlah peserta/file per bagian."""
    paths = _as_path_list(pdf_paths)
    try:
        batch = int(batch_size)
    except Exception:
        batch = 100
    batch = max(1, batch)
    return [paths[i:i + batch] for i in range(0, len(paths), batch)]


def merge_pdf_files_for_print(
    pdf_paths: List[Any],
    output_dir: Any,
    batch_size: int = 100,
    base_filename: str = "HASIL_MCU_PRINT",
) -> List[Path]:
    """
    Gabungkan PDF untuk print.

    Jika jumlah PDF <= batch_size, output hanya 1 file:
        HASIL_MCU_PRINT_ALL.pdf

    Jika jumlah PDF > batch_size, output dipecah:
        HASIL_MCU_PRINT_PART_001.pdf
        HASIL_MCU_PRINT_PART_002.pdf
        dst.

    Saran batch_size:
        - 50 jika banyak lampiran gambar rontgen/ekg.
        - 100 untuk data sedang.
        - 200 jika mayoritas PDF teks/lab saja.
    """
    paths = _as_path_list(pdf_paths)
    if not paths:
        return []

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    groups = split_pdf_paths_by_count(paths, batch_size=batch_size)
    outputs: List[Path] = []

    safe_base = re.sub(r"[^A-Za-z0-9_\-]+", "_", _safe(base_filename) or "HASIL_MCU_PRINT").strip("_")

    if len(groups) == 1:
        out = out_dir / f"{safe_base}_ALL.pdf"
        outputs.append(merge_pdf_files(groups[0], out))
        return outputs

    total = len(groups)
    for idx, group in enumerate(groups, start=1):
        out = out_dir / f"{safe_base}_PART_{idx:03d}_OF_{total:03d}.pdf"
        outputs.append(merge_pdf_files(group, out))

    return outputs
