"use client";

import { useMemo, useState } from "react";

type Field = { key:string; label:string; aliases:string[]; required?:boolean; group:string };

const PROGRAMS = [
  { value: "corporate", label: "Corporate" },
  { value: "capaska", label: "CAPASKA" },
];

const GROUPS = ["Semua","Identitas","Fisik","Laboratorium","Penunjang","Output PDF"] as const;

const FIELDS: Field[] = [
  {key:"NAMA",label:"Nama Peserta",required:true,group:"Identitas",aliases:["nama","nama peserta","nama karyawan","nama lengkap","name"]},
  {key:"NOMCU",label:"No MCU",required:true,group:"Identitas",aliases:["nomcu","no mcu","no.mcu","nomor mcu","mcu id","barcode","no peserta","no urut","no"]},
  {key:"NIK",label:"NIK / NRP / ID",group:"Identitas",aliases:["nik","ktp","nik/nrp/id","nrp","employee id","id karyawan"]},
  {key:"JK",label:"Jenis Kelamin",group:"Identitas",aliases:["jk","jenis kelamin","gender","sex"]},
  {key:"TGLLAHIR",label:"Tanggal Lahir",group:"Identitas",aliases:["tgllahir","tanggal lahir","tgl lahir","birth date","dob"]},
  {key:"USIA",label:"Usia",group:"Identitas",aliases:["usia","umur","age"]},
  {key:"DEPARTEMEN",label:"Departemen / Unit",group:"Identitas",aliases:["departemen","department","bagian","unit","divisi"]},
  {key:"PAKET",label:"Paket MCU",group:"Identitas",aliases:["paket","package","paket pemeriksaan"]},

  {key:"FS:TB",label:"Tinggi Badan",group:"Fisik",aliases:["tb","tinggi badan","height","fs:tb"]},
  {key:"FS:BB",label:"Berat Badan",group:"Fisik",aliases:["bb","berat badan","weight","fs:bb"]},
  {key:"FS:BMI",label:"BMI / IMT",group:"Fisik",aliases:["bmi","imt","fs:bmi"]},
  {key:"FS:Tensi",label:"Tekanan Darah / Tensi",group:"Fisik",aliases:["tensi","td","tekanan darah","blood pressure","fs:tensi"]},
  {key:"FS:Nadi",label:"Nadi",group:"Fisik",aliases:["nadi","pulse","fs:nadi"]},
  {key:"FS:Nafas",label:"Nafas",group:"Fisik",aliases:["nafas","respirasi","respiration","fs:nafas"]},
  {key:"FS:ButaWarna",label:"Buta Warna",group:"Fisik",aliases:["buta warna","color blind","fs:butawarna"]},

  {key:"DL:Hb",label:"Hemoglobin / Hb",group:"Laboratorium",aliases:["hb","hemoglobin","dl:hb"]},
  {key:"DL:Leu",label:"Leukosit",group:"Laboratorium",aliases:["leukosit","leukocyte","leu","wbc","dl:leu"]},
  {key:"DL:Ht",label:"Hematokrit",group:"Laboratorium",aliases:["hematokrit","ht","hct","dl:ht"]},
  {key:"DL:Trom",label:"Trombosit",group:"Laboratorium",aliases:["trombosit","platelet","trom","plt","dl:trom"]},
  {key:"DL:Eri",label:"Eritrosit",group:"Laboratorium",aliases:["eritrosit","rbc","eri","dl:eri"]},
  {key:"GD:GDP",label:"Gula Darah Puasa / GDP",group:"Laboratorium",aliases:["gdp","gula darah puasa","glukosa puasa","gd:gdp"]},
  {key:"GD:Sewaktu",label:"Gula Darah Sewaktu / GDS",group:"Laboratorium",aliases:["gds","gula darah sewaktu","glukosa sewaktu","gd:sewaktu"]},
  {key:"LD:Chol",label:"Kolesterol Total",group:"Laboratorium",aliases:["chol","kolesterol","kolesterol total","ld:chol"]},
  {key:"LD:HDL",label:"HDL",group:"Laboratorium",aliases:["hdl","ld:hdl"]},
  {key:"LD:LDL",label:"LDL",group:"Laboratorium",aliases:["ldl","ld:ldl"]},
  {key:"LD:Trig",label:"Trigliserida",group:"Laboratorium",aliases:["trigliserida","trig","ld:trig"]},
  {key:"FK:Ureum",label:"Ureum",group:"Laboratorium",aliases:["ureum","fk:ureum"]},
  {key:"FK:Kreatinin",label:"Kreatinin",group:"Laboratorium",aliases:["kreatinin","creatinine","creat","fk:kreatinin"]},
  {key:"FK:AsamUrat",label:"Asam Urat",group:"Laboratorium",aliases:["asam urat","uric acid","fk:asamurat"]},
  {key:"FH:SGOT",label:"SGOT / AST",group:"Laboratorium",aliases:["sgot","ast","fh:sgot"]},
  {key:"FH:SGPT",label:"SGPT / ALT",group:"Laboratorium",aliases:["sgpt","alt","fh:sgpt"]},
  {key:"HP:HBsAg",label:"HBsAg",group:"Laboratorium",aliases:["hbsag","hp:hbsag"]},

  {key:"Thorax Foto",label:"Thorax Foto",group:"Penunjang",aliases:["thorax","rontgen","thorax foto","foto thorax"]},
  {key:"Hasilthorax",label:"Hasil Thorax",group:"Penunjang",aliases:["hasil thorax","hasilthorax","kesan thorax"]},
  {key:"KESIMPULAN",label:"Kesimpulan",group:"Output PDF",aliases:["kesimpulan","conclusion"]},
  {key:"SARAN",label:"Saran",group:"Output PDF",aliases:["saran","recommendation","rekomendasi"]},
  {key:"FIT_STATUS",label:"Status Fit",group:"Output PDF",aliases:["fit status","fit_status","status fit","status"]},
];

function norm(v:any){return String(v??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");}
function txt(v:any){const s=String(v??"").trim(); return (!s||["null","undefined","nan"].includes(s.toLowerCase()))?"":s;}
const aliasSet = Array.from(new Set(FIELDS.flatMap(f=>[f.key,f.label,...f.aliases]).map(norm).filter(Boolean)));

function uniqueHeaders(row:any[]){
  const seen = new Map<string,number>();
  return row.map((cell,i)=>{
    const raw = txt(cell) || `__EMPTY_${i+1}`;
    const base = raw.replace(/\s+/g," ").trim();
    const n = seen.get(base)||0;
    seen.set(base,n+1);
    return n ? `${base}__${n+1}` : base;
  });
}

function rowObj(headers:string[], row:any[]){
  const o:Record<string,any> = {};
  headers.forEach((h,i)=>{ o[h]=row?.[i]??""; });
  return o;
}

function scoreHeader(row:any[], nextRows:any[][]=[]){
  const vals = row.map(txt).filter(Boolean);
  if(vals.length < 3) return 0;
  let score = Math.min(vals.length, 25) * 0.5;
  let exact = 0;
  for(const v of vals){
    const n = norm(v);
    if(aliasSet.includes(n)){ score += 12; exact++; continue; }
    if(aliasSet.some(a=>a.length>=3 && (n.includes(a)||a.includes(n)))) score += 3;
    if(v.length > 40) score -= 6;
  }
  const denseNext = nextRows.slice(0,5)
    .map(r=>r.map(txt).filter(Boolean).length)
    .filter(c=>c>=Math.min(vals.length,5)).length;
  score += denseNext*2;
  if(exact>=2) score+=25;
  if(exact>=4) score+=25;
  return score;
}

function detectHeader(rows:any[][]){
  let best = 0, bestScore = -999;
  for(let i=0;i<Math.min(rows.length,120);i++){
    const s = scoreHeader(rows[i]||[], rows.slice(i+1,i+8));
    if(s>bestScore){ best=i; bestScore=s; }
  }
  return best;
}

function parseFromHeader(rows:any[][], headerIndex:number){
  const idx = Math.max(0, Math.min(headerIndex, rows.length-1));
  const headers = uniqueHeaders(rows[idx]||[]);
  const data = rows.slice(idx+1)
    .map(r=>rowObj(headers,r||[]))
    .filter(r=>Object.values(r).some(v=>Boolean(txt(v))));
  return { headers, data };
}

function autoDetect(headers:string[]){
  const map:Record<string,string> = {};
  for(const f of FIELDS){
    const aliases = f.aliases.map(norm);
    let found = "";
    for(const h of headers){
      const hn = norm(h);
      if(hn===norm(f.key) || aliases.includes(hn)){ found=h; break; }
    }
    if(!found){
      for(const h of headers){
        const hn = norm(h);
        if(aliases.some(a=>a.length>=3 && (hn.includes(a)||a.includes(hn)))){ found=h; break; }
      }
    }
    if(found) map[f.key]=found;
  }
  return map;
}

function firstVal(rows:Record<string,any>[], header?:string){
  if(!header) return "";
  for(const r of rows){ const v=txt(r?.[header]); if(v) return v; }
  return "";
}

function rowSummary(row:any[], idx:number){
  const text = row.map(txt).filter(Boolean).slice(0,12).join(" | ");
  return `Baris ${idx+1}: ${text || "(kosong)"}`;
}

export default function AiMcuUploadPage(){
  const [stage,setStage] = useState<"upload"|"mapping"|"done">("upload");
  const [programType,setProgramType] = useState("corporate");
  const [companyName,setCompanyName] = useState("");
  const [databaseName,setDatabaseName] = useState("");
  const [presetMapping,setPresetMapping] = useState("auto");
  const [file,setFile] = useState<File|null>(null);

  const [sheetName,setSheetName] = useState("");
  const [rawRows,setRawRows] = useState<any[][]>([]);
  const [headerRowIndex,setHeaderRowIndex] = useState(0);
  const [headers,setHeaders] = useState<string[]>([]);
  const [sampleRows,setSampleRows] = useState<Record<string,any>[]>([]);
  const [fieldMapping,setFieldMapping] = useState<Record<string,string>>({});
  const [groupFilter,setGroupFilter] = useState<(typeof GROUPS)[number]>("Identitas");

  const [loadingPreview,setLoadingPreview] = useState(false);
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState("");
  const [result,setResult] = useState<any>(null);

  const filteredFields = useMemo(()=>groupFilter==="Semua" ? FIELDS : FIELDS.filter(f=>f.group===groupFilter),[groupFilter]);
  const mappedCount = useMemo(()=>FIELDS.filter(f=>Boolean(fieldMapping[f.key])).length,[fieldMapping]);
  const missing = useMemo(()=>FIELDS.filter(f=>f.required && !fieldMapping[f.key]),[fieldMapping]);

  const candidates = useMemo(()=>{
    return rawRows.map((row,index)=>({row,index,score:scoreHeader(row, rawRows.slice(index+1,index+8))}))
      .filter(x=>x.row.map(txt).filter(Boolean).length>=2)
      .sort((a,b)=>b.score-a.score)
      .slice(0,30)
      .sort((a,b)=>a.index-b.index);
  },[rawRows]);

  function applyHeader(index:number, rows=rawRows){
    const parsed = parseFromHeader(rows,index);
    const map = autoDetect(parsed.headers);
    setHeaderRowIndex(index);
    setHeaders(parsed.headers);
    setSampleRows(parsed.data.slice(0,10));
    setFieldMapping(map);
    setMessage(`Header dipakai: baris ${index+1}. Header terbaca: ${parsed.headers.length}. Auto mapping: ${Object.keys(map).length} field.`);
  }

  async function readExcelForMapping(){
    setMessage("");
    setResult(null);
    if(!companyName.trim()){ setMessage("Nama perusahaan / instansi wajib diisi."); return; }
    if(!databaseName.trim()){ setMessage("Nama database wajib diisi."); return; }
    if(!file){ setMessage("Pilih file Excel terlebih dahulu."); return; }

    setLoadingPreview(true);
    try{
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer,{type:"array", cellDates:true, raw:false});
      const firstSheet = workbook.SheetNames?.[0];
      if(!firstSheet){ setMessage("Sheet Excel tidak ditemukan."); return; }
      const sheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet,{header:1, defval:"", raw:false, blankrows:false});
      if(!rows.length){ setMessage("Excel kosong atau tidak terbaca."); return; }

      const detected = detectHeader(rows);
      setSheetName(firstSheet);
      setRawRows(rows);
      setStage("mapping");
      applyHeader(detected, rows);
    }catch(err:any){
      setMessage(err?.message || "Gagal membaca Excel.");
    }finally{
      setLoadingPreview(false);
    }
  }

  function updateMapping(key:string,value:string){
    setFieldMapping(cur=>({...cur,[key]:value}));
  }

  function resetAutoMapping(){ setFieldMapping(autoDetect(headers)); }

  function resetUpload(){
    setStage("upload");
    setRawRows([]);
    setHeaders([]);
    setSampleRows([]);
    setFieldMapping({});
    setResult(null);
    setMessage("");
  }

  async function saveUpload(){
    setMessage("");
    setResult(null);
    if(missing.length){ setMessage(`Mapping wajib belum lengkap: ${missing.map(x=>x.label).join(", ")}.`); return; }
    if(!file){ setMessage("File Excel tidak ditemukan. Kembali ke step upload dan pilih file lagi."); return; }

    const form = new FormData();
    form.append("programType", programType);
    form.append("companyName", companyName.trim());
    form.append("databaseName", databaseName.trim());
    form.append("presetMapping", presetMapping);
    form.append("fieldMapping", JSON.stringify(fieldMapping));
    form.append("sheetName", sheetName);
    form.append("headerRowIndex", String(headerRowIndex));
    form.append("file", file);

    setLoading(true);
    setMessage("Menyimpan data Excel dan mapping ke database AI MCU...");
    try{
      const res = await fetch("/api/ai-mcu/upload",{method:"POST",body:form});
      const json = await res.json();
      if(!res.ok || !json.ok){ setMessage(json.message || "Upload Excel gagal."); setResult(json); return; }
      setResult(json);
      setStage("done");
      setMessage(json.message || "Excel berhasil diupload.");
    }catch(err:any){
      setMessage(err?.message || "Upload Excel gagal.");
    }finally{
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Upload Excel AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Upload Excel dulu, sistem mencari baris header tabel secara otomatis. Kalau belum pas, pilih baris header manual sebelum simpan mapping.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/ai-mcu" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">☰ Menu AI MCU</a>
            <a href="/ai-mcu" className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Kembali</a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[["upload","1. Upload Excel"],["mapping","2. Mapping Header"],["done","3. Selesai"]].map(([key,label])=>(
            <div key={key} className={`rounded-xl border px-4 py-3 text-sm font-black ${stage===key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              {label}
            </div>
          ))}
        </div>

        {stage==="upload" ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="text-lg font-bold">Informasi Database</h2>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-slate-700">Jenis Program</label>
                <select value={programType} onChange={(e)=>setProgramType(e.target.value)} disabled={loadingPreview} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
                  {PROGRAMS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-slate-700">Nama Perusahaan / Instansi</label>
                <input value={companyName} onChange={(e)=>setCompanyName(e.target.value)} disabled={loadingPreview} placeholder="Contoh: PT Sehat Sentosa / BPIP" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" />
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-slate-700">Nama Database</label>
                <input value={databaseName} onChange={(e)=>setDatabaseName(e.target.value)} disabled={loadingPreview} placeholder="Contoh: MCU PT Sehat Mei 2026" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" />
                <div className="mt-2 text-xs text-slate-500">Nama ini akan muncul di dropdown database pada Analisis MCU dan Generate PDF.</div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5">
              <h2 className="text-lg font-bold">File Excel</h2>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-slate-700">File Excel</label>
                <input type="file" accept=".xlsx,.xls" disabled={loadingPreview} onChange={(e)=>{
                  setFile(e.target.files?.[0] || null);
                  setRawRows([]); setHeaders([]); setSampleRows([]); setFieldMapping({}); setMessage("");
                }} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" />
                <div className="mt-2 text-xs text-slate-500">File boleh punya kop/logo/judul di atas tabel. Sistem akan mencari baris header data.</div>
              </div>
              <div className="mt-5">
                <label className="mb-2 block text-sm font-bold text-slate-700">Preset Mapping</label>
                <select value={presetMapping} onChange={(e)=>setPresetMapping(e.target.value)} disabled={loadingPreview} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
                  <option value="auto">Auto Detect</option>
                  <option value="manual">Manual Mapping</option>
                </select>
              </div>
              <button type="button" onClick={readExcelForMapping} disabled={loadingPreview} className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {loadingPreview ? "Membaca Header..." : "Upload Excel & Lanjut Mapping"}
              </button>
            </section>
          </div>
        ) : null}

        {stage==="mapping" ? (
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold">Mapping Header ke Parameter</h2>
                <p className="mt-1 text-sm text-slate-600">Pastikan baris header yang dipilih adalah baris tabel berisi NAMA, NOMCU, NIK, parameter lab/fisik, dan seterusnya.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={resetUpload} disabled={loading} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Kembali Edit Upload</button>
                <button type="button" onClick={resetAutoMapping} disabled={!headers.length || loading} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Auto Detect Ulang</button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.5fr]">
              <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                <div>File: <b>{file?.name || "-"}</b></div>
                <div>Sheet: <b>{sheetName || "-"}</b></div>
                <div>Database: <b>{databaseName}</b> · Perusahaan: <b>{companyName}</b></div>
                <div>Header terbaca: <b>{headers.length}</b> · Mapped: <b>{mappedCount}</b>/{FIELDS.length}</div>
              </div>

              <div className="rounded-xl border bg-white p-3">
                <label className="mb-2 block text-xs font-black uppercase text-slate-500">Pilih Baris Header Tabel</label>
                <select value={headerRowIndex} onChange={(e)=>applyHeader(Number(e.target.value))} disabled={loading} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  {candidates.map(item=><option key={item.index} value={item.index}>{rowSummary(item.row,item.index)}</option>)}
                </select>
              </div>

              <div className="rounded-xl border bg-white p-3">
                <label className="mb-2 block text-xs font-black uppercase text-slate-500">Filter Grup</label>
                <select value={groupFilter} onChange={(e)=>setGroupFilter(e.target.value as any)} disabled={loading} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  {GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {missing.length ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                Mapping wajib belum lengkap: {missing.map(x=>x.label).join(", ")}. Kalau header masih aneh, ganti pilihan <b>Baris Header Tabel</b> di atas.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                Mapping wajib sudah lengkap. Data siap disimpan ke database AI MCU.
              </div>
            )}

            <div className="mt-4 overflow-hidden rounded-2xl border">
              <div className="grid grid-cols-[0.85fr_1.2fr_1fr_120px] bg-slate-100 px-3 py-3 text-xs font-black uppercase text-slate-600">
                <div>Parameter AI MCU</div><div>Header Excel</div><div>Contoh Isi</div><div>Grup</div>
              </div>
              <div className="max-h-[520px] divide-y overflow-auto bg-white">
                {filteredFields.map(field=>{
                  const selected = fieldMapping[field.key] || "";
                  const preview = firstVal(sampleRows, selected);
                  return (
                    <div key={field.key} className="grid grid-cols-[0.85fr_1.2fr_1fr_120px] items-center gap-3 px-3 py-3 text-sm">
                      <div>
                        <div className="font-bold text-slate-900">{field.label}{field.required ? <span className="text-red-600"> *</span> : null}</div>
                        <div className="mt-1 text-xs text-slate-400">{field.key}</div>
                      </div>
                      <select value={selected} onChange={(e)=>updateMapping(field.key,e.target.value)} disabled={loading} className={`w-full rounded-xl border bg-white px-3 py-2 text-sm ${field.required && !selected ? "border-red-300" : "border-slate-300"}`}>
                        <option value="">-- Tidak dipakai --</option>
                        {headers.map(h=><option key={`${field.key}-${h}`} value={h}>{h}</option>)}
                      </select>
                      <div className="truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" title={preview}>{preview || "-"}</div>
                      <div className="text-xs font-bold text-slate-500">{field.group}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <details className="mt-4 rounded-2xl border bg-slate-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-800">Preview Data Setelah Baris Header</summary>
              <div className="overflow-auto border-t bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>{headers.slice(0,14).map(h=><th key={h} className="whitespace-nowrap p-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {sampleRows.slice(0,8).map((row,i)=>(
                      <tr key={i}>{headers.slice(0,14).map(h=><td key={`${i}-${h}`} className="whitespace-nowrap p-2">{String(row[h] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <button type="button" onClick={saveUpload} disabled={loading || !!missing.length} className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Menyimpan..." : "Simpan Mapping & Masukkan ke Database"}
            </button>
          </section>
        ) : null}

        {stage==="done" && result?.ok ? (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="text-lg font-bold text-emerald-900">Upload Berhasil</h2>
            <div className="mt-3 grid gap-2 text-sm text-emerald-800 md:grid-cols-2">
              <div>Database: <b>{result.source?.name}</b></div>
              <div>Program: <b>{result.source?.program_type}</b></div>
              <div>Perusahaan/Instansi: <b>{result.source?.institution_name}</b></div>
              <div>Peserta tersimpan: <b>{result.totalParticipants}</b></div>
              <div>Row Excel terbaca: <b>{result.totalExcelRows}</b></div>
              <div>Row data MCU tersimpan: <b>{result.totalStoredRows}</b></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="/ai-mcu/analyze" className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-700">Lanjut Analisis MCU</a>
              <a href="/ai-mcu/generate" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">Lanjut Generate PDF</a>
              <a href="/ai-mcu/preview" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Preview Data</a>
            </div>
          </section>
        ) : null}

        {message ? (
          <div className={`mt-5 rounded-xl border p-4 text-sm font-semibold ${result?.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {message}
          </div>
        ) : null}

        {result && !result.ok ? (
          <pre className="mt-5 max-h-72 overflow-auto rounded-xl border bg-slate-50 p-4 text-xs text-slate-700">{JSON.stringify(result,null,2)}</pre>
        ) : null}
      </div>
    </main>
  );
}
