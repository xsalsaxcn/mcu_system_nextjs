import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}
function clean(v: any) {
  const s = String(v ?? "").trim();
  if (!s || ["null", "undefined", "nan", "-"].includes(s.toLowerCase())) return "";
  return s;
}
function norm(v: any) { return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
const ALIASES: Record<string,string[]> = {
  MCU_ID:["mcu id","nomcu","no mcu","no.mcu","nomor mcu","barcode","no peserta","no"],
  NOMCU:["mcu id","nomcu","no mcu","no.mcu","nomor mcu","barcode","no peserta","no"],
  NAMA:["nama","nama peserta","nama karyawan","nama lengkap","name","patient name"],
  NIK:["nik","nik/nrp/id","ktp","nrp","id karyawan","employee id"],
  JK:["jk","jenis kelamin","gender","sex"], TGLLAHIR:["tgllahir","tanggal lahir","tgl lahir","birth date","dob"],
  USIA:["usia","umur","age"], DEPT:["dept","departemen","department","bagian","unit","divisi"],
  PAKET:["paket","package"], KATEGORI:["kategori","status fit","fit status","status"],
  KESIMPULAN:["kesimpulan","conclusion"], SARAN:["saran","recommendation","rekomendasi"]

  MEDICAL_RECORD_NO:["no medical record","no. medical record","medical record","no mr","no. mr","mr","no rekam medis","no. rekam medis","nomor rekam medis","rekam medis"],
  NO_MR:["no medical record","no. medical record","medical record","no mr","no. mr","mr","no rekam medis","no. rekam medis","nomor rekam medis","rekam medis"],
  TANGGAL_MCU:["tanggal mcu","tgl mcu","tglmcu","mcu date","tanggal pemeriksaan","tgl pemeriksaan"],
  PERUSAHAAN:["nama pt","perusahaan","company","company name","pt"],
  DEPARTEMEN:["departemen","department","dept"],
  BAGIAN:["bagian","section","unit","dept/bagian","department/bagian","division","divisi"],
  JABATAN:["jabatan","position","job title","posisi"],
};
const HEADER_WORDS = Object.entries(ALIASES).flatMap(([k,a])=>[k,...a]).map(norm).filter(Boolean);
function scoreHeader(row:any[], next:any[][]=[]) {
  const vals=row.map(clean).filter(Boolean); if(vals.length<3) return 0;
  let score=0, exact=0;
  for(const val of vals){ const n=norm(val); if(HEADER_WORDS.includes(n)){score+=14; exact++} else if(HEADER_WORDS.some(a=>a.length>=3&&(n.includes(a)||a.includes(n)))) score+=4; }
  const density=next.slice(0,6).map(r=>r.map(clean).filter(Boolean).length).filter(c=>c>=Math.min(vals.length,5)).length;
  score += Math.min(vals.length,30)*0.5 + density*2 + (exact>=2?30:0) + (exact>=4?40:0);
  score -= vals.filter(v=>v.length>45).length*8;
  return score;
}
function detectHeader(raw:any[][]){ let bi=0, bs=-999; for(let i=0;i<Math.min(raw.length,160);i++){ const s=scoreHeader(raw[i]||[], raw.slice(i+1,i+8)); if(s>bs){bs=s;bi=i;} } return bi; }
function uniqueHeaders(row:any[]){ const used=new Map<string,number>(); return row.map((c,i)=>{ const b=(clean(c)||`__EMPTY_${i+1}`).replace(/\s+/g," "); const n=used.get(b)||0; used.set(b,n+1); return n?`${b}__${n+1}`:b; }); }
function rowObj(headers:string[], row:any[]){ const o:Record<string,any>={}; headers.forEach((h,i)=>o[h]=row?.[i]??""); return o; }
function autoMap(headers:string[]){ const m:Record<string,string>={}; for(const [target,aliases] of Object.entries(ALIASES)){ const all=[target,...aliases].map(norm); let found=""; for(const h of headers){ if(all.includes(norm(h))){found=h;break;} } if(!found){ for(const h of headers){ const nh=norm(h); if(all.some(a=>a.length>=3&&(nh.includes(a)||a.includes(nh)))){found=h;break;} } } if(found)m[target]=found; } return m; }
function val(row:Record<string,any>, mapping:Record<string,string>, key:string){ const h=mapping[key]; return h?clean(row[h]):""; }
function canonical(row:Record<string,any>, mapping:Record<string,string>, ctx:any, index:number){
  const out:Record<string,any>={...row}; Object.entries(mapping).forEach(([k,h])=>out[k]=row[h]??"");
  const name=val(row,mapping,"NAMA")||clean(out.NAMA)||clean(out.Nama); const mcu=val(row,mapping,"MCU_ID")||val(row,mapping,"NOMCU")||clean(out.MCU_ID)||clean(out.NOMCU)||clean(out["NO MCU"])||`${ctx.databaseName}-${index+1}`; const nik=val(row,mapping,"NIK")||clean(out.NIK)||clean(out["NIK/NRP/ID"]);
  out.MCU_ID=mcu; out.NOMCU=mcu; out["NO MCU"]=mcu; out.NAMA=name; out.Nama=name; out.NIK=nik; out.DEPT=out.DEPT||out.DEPARTEMEN||val(row,mapping,"DEPT"); out.DEPARTEMEN=out.DEPARTEMEN||out.DEPT; out["Nama PT"]=ctx.companyName; out.DATABASE_NAME=ctx.databaseName; out.PROGRAM_TYPE=ctx.programType; out._AI_MCU_FIELD_MAPPING=mapping;
    // v241 fix: corporate MCU identity fields from Excel. Additive only; existing fields are preserved.
  const medicalRecordNo = val(row,mapping,"MEDICAL_RECORD_NO") || val(row,mapping,"NO_MR") || clean(out.MEDICAL_RECORD_NO) || clean(out.NO_MR) || clean(out["No. Medical Record"]) || clean(out["No Medical Record"]) || clean(out["No MR"]) || clean(out["NO MR"]) || clean(out["No Rekam Medis"]);
  const tanggalMcu = val(row,mapping,"TANGGAL_MCU") || clean(out.TANGGAL_MCU) || clean(out["Tanggal MCU"]) || clean(out["Tgl MCU"]) || clean(out["Tanggal Pemeriksaan"]);
  const perusahaan = val(row,mapping,"PERUSAHAAN") || clean(out.PERUSAHAAN) || clean(out.Perusahaan) || clean(out["Nama PT"]) || clean(ctx.companyName);
  const departemen = val(row,mapping,"DEPARTEMEN") || val(row,mapping,"DEPT") || clean(out.DEPARTEMEN) || clean(out.DEPT) || clean(out.Department) || clean(out.Departemen);
  const bagian = val(row,mapping,"BAGIAN") || clean(out.BAGIAN) || clean(out.Bagian) || clean(out["Dept/Bagian"]) || clean(out.Unit);
  const jabatan = val(row,mapping,"JABATAN") || clean(out.JABATAN) || clean(out.Jabatan) || clean(out.Position) || clean(out["Job Title"]);
  out.MEDICAL_RECORD_NO = medicalRecordNo; out.NO_MR = medicalRecordNo; out["No. Medical Record"] = medicalRecordNo; out["No Medical Record"] = medicalRecordNo; out["No MR"] = medicalRecordNo; out["No Rekam Medis"] = medicalRecordNo;
  out.TANGGAL_MCU = tanggalMcu; out["Tanggal MCU"] = tanggalMcu;
  if (perusahaan) { out.PERUSAHAAN = perusahaan; out.Perusahaan = perusahaan; out["Nama PT"] = perusahaan; }
  if (departemen) { out.DEPT = departemen; out.DEPARTEMEN = departemen; out.Department = departemen; }
  if (bagian) { out.BAGIAN = bagian; out.Bagian = bagian; }
  if (jabatan) { out.JABATAN = jabatan; out.Jabatan = jabatan; }
  return {row:out,name,mcu,nik};
}
async function parseExcel(file:File, ctx:any){
  const wb=XLSX.read(Buffer.from(await file.arrayBuffer()),{type:"buffer",cellDates:true,raw:false}); const sheetName=wb.SheetNames?.[0]; if(!sheetName) return {sheetName:"",headerRowIndex:0,mapping:{},headers:[],rows:[] as any[]};
  const raw=XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName],{header:1,defval:"",raw:false,blankrows:false}); if(!raw.length) return {sheetName,headerRowIndex:0,mapping:{},headers:[],rows:[] as any[]};
  const headerRowIndex=detectHeader(raw); const headers=uniqueHeaders(raw[headerRowIndex]||[]); const mapping=autoMap(headers);
  const rows=raw.slice(headerRowIndex+1).map((r,i)=>({raw:rowObj(headers,r||[]),rowIndex:headerRowIndex+i+2})).filter(x=>Object.values(x.raw).some(v=>clean(v))).map((x,i)=>({...canonical(x.raw,mapping,ctx,i),rowIndex:x.rowIndex})).filter(x=>x.name||x.mcu);
  return {sheetName,headerRowIndex,mapping,headers,rows};
}
async function findOrCreateCompany(supabase:any,name:string){ const e=await supabase.from("companies").select("id,name").eq("name",name).maybeSingle(); if(e.data?.id)return e.data; const i=await supabase.from("companies").insert({name}).select("id,name").single(); return i.data||null; }
async function findOrCreateSource(supabase:any,p:any){ const e=await supabase.from("participant_sources").select("id,name,institution_name,program_type").eq("name",p.name).eq("program_type",p.program_type).maybeSingle(); if(e.data?.id)return e.data; const i=await supabase.from("participant_sources").insert(p).select("id,name,institution_name,program_type").single(); if(i.error)throw new Error(i.error.message); return i.data; }
export async function POST(req: NextRequest){
  try{
    const user=getSessionUser(req); if(!user)return fail("Unauthorized",401);
    const form=await req.formData(); const programType=clean(form.get("programType"))||"corporate"; const companyName=clean(form.get("companyName")); const databaseName=clean(form.get("databaseName")); const oldFile=form.get("oldFile"); const newFile=form.get("newFile");
    if(!companyName)return fail("Nama perusahaan / instansi wajib diisi."); if(!databaseName)return fail("Nama database wajib diisi."); if(!(newFile instanceof File))return fail("Upload MCU Baru wajib diisi.");
    const supabase=getSupabaseAdmin(); const company=await findOrCreateCompany(supabase,companyName); const source=await findOrCreateSource(supabase,{name:databaseName,institution_name:companyName,program_type:programType}); const batchId=`ai-mcu-${Date.now()}`; const ctx={companyName,databaseName,programType};
    const parsedNew=await parseExcel(newFile,ctx); const parsedOld=oldFile instanceof File ? await parseExcel(oldFile,ctx) : null; if(!parsedNew.rows.length)return fail("MCU Baru tidak memiliki data peserta. Pastikan ada kolom Nama / No MCU.");
    const participants=parsedNew.rows.map((r:any,i:number)=>({source_id:source.id,company_id:company?.id||null,program_type:programType,name:r.name||`Peserta ${i+1}`,mcu_id:r.mcu,external_id:r.nik||r.mcu,nik:r.nik||null,gender:r.row.JK||null,birth_date:r.row.TGLLAHIR||null,department:r.row.DEPT||r.row.DEPARTEMEN||null}));
    const insP=await supabase.from("participants").insert(participants).select("id,name,mcu_id,nik,external_id"); if(insP.error)return fail(insP.error.message,500);
    const pRows=insP.data||[];
    const newRows=parsedNew.rows.map((r:any,i:number)=>({source_id:source.id,participant_id:pRows[i]?.id||null,program_type:programType,company_name:companyName,database_name:databaseName,dataset_role:"new",upload_batch_id:batchId,source_file_name:newFile.name,sheet_name:parsedNew.sheetName,row_index:r.rowIndex,header_row_index:parsedNew.headerRowIndex,field_mapping:parsedNew.mapping,participant_name:r.name,mcu_id:r.mcu,nik:r.nik,row_data:r.row,analysis_meta:{headers:parsedNew.headers}}));
    const oldRows=(parsedOld?.rows||[]).map((r:any)=>({source_id:source.id,participant_id:null,program_type:programType,company_name:companyName,database_name:databaseName,dataset_role:"old",upload_batch_id:batchId,source_file_name:oldFile instanceof File ? oldFile.name : "",sheet_name:parsedOld?.sheetName||"",row_index:r.rowIndex,header_row_index:parsedOld?.headerRowIndex||0,field_mapping:parsedOld?.mapping||{},participant_name:r.name,mcu_id:r.mcu,nik:r.nik,row_data:r.row,analysis_meta:{headers:parsedOld?.headers||[]}}));
    const ins=await supabase.from("ai_mcu_import_rows").insert([...oldRows,...newRows]).select("id"); if(ins.error)return fail(ins.error.message,500,{hint:"Jalankan SQL patch ai_mcu_import_rows terlebih dahulu."});
    return NextResponse.json({ok:true,message:"Upload MCU lama/baru berhasil. Data siap dianalisis seperti workbook Perbandingan.",source,uploadBatchId:batchId,newRows:parsedNew.rows.length,oldRows:parsedOld?.rows.length||0,totalParticipants:pRows.length,headerInfo:{new:{sheetName:parsedNew.sheetName,headerRowIndex:parsedNew.headerRowIndex,mapped:Object.keys(parsedNew.mapping).length},old:parsedOld?{sheetName:parsedOld.sheetName,headerRowIndex:parsedOld.headerRowIndex,mapped:Object.keys(parsedOld.mapping).length}:null}});
  }catch(error:any){ return fail(error?.message||"Upload AI MCU gagal.",500); }
}
