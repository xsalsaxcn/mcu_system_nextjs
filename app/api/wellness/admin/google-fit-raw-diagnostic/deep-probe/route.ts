import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WELLNESS_GOOGLE_FIT_ADMIN_DEEP_PROBE_V126M58_2_1
// Admin-only + READ ONLY. No Supabase write and no Google Fit write.

const ADMIN_ROLES = new Set(["admin", "super_admin", "supervisor", "doctor", "wellness_admin"]);
const TZ = "Asia/Jakarta";
const TYPES = [
  "com.google.step_count.delta",
  "com.google.distance.delta",
  "com.google.calories.expended",
  "com.google.active_minutes",
] as const;

function clean(v: any) { return String(v ?? "").trim(); }
function num(v: any) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function adminUser(req: NextRequest) {
  const u: any = getSessionUser(req);
  return u && ADMIN_ROLES.has(clean(u?.role).toLowerCase()) ? u : null;
}
function json(payload: any, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control":"no-store, no-cache, must-revalidate, max-age=0", Pragma:"no-cache", Expires:"0" } });
}
function jakartaDateKey(ms: number) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date(ms));
  const y=p.find(x=>x.type==="year")?.value,m=p.find(x=>x.type==="month")?.value,d=p.find(x=>x.type==="day")?.value;
  return y&&m&&d?`${y}-${m}-${d}`:new Date(ms).toISOString().slice(0,10);
}
function jakartaStart(key: string) { const [y,m,d]=key.split("-").map(Number); return new Date(Date.UTC(y,m-1,d,-7,0,0,0)); }
function addDays(key:string,n:number){ return jakartaDateKey(jakartaStart(key).getTime()+n*86400000); }
function fitValue(v:any){ if(!v)return 0; if(v.intVal!=null)return num(v.intVal); if(v.fpVal!=null)return num(v.fpVal); if(v.stringVal!=null)return num(v.stringVal); return 0; }
function pointValue(p:any){ return (Array.isArray(p?.value)?p.value:[]).reduce((s:number,x:any)=>s+fitValue(x),0); }

async function ephemeralAccessToken(integration:any){
  const stored=clean(integration?.access_token); const expires=integration?.expires_at?new Date(integration.expires_at).getTime():0;
  if(stored&&(!expires||expires>Date.now()+60000)) return {token:stored,mode:"stored_access_token"};
  const refresh=clean(integration?.refresh_token); if(!refresh)throw new Error("TOKEN_ERROR: refresh_token Google Fit tidak tersedia.");
  const clientId=clean(process.env.GOOGLE_FIT_CLIENT_ID)||clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret=clean(process.env.GOOGLE_FIT_CLIENT_SECRET)||clean(process.env.GOOGLE_CLIENT_SECRET);
  if(!clientId||!clientSecret)throw new Error("Konfigurasi Google Fit server belum lengkap.");
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:"refresh_token"});
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body.toString(),cache:"no-store"});
  const j:any=await r.json().catch(()=>({})); if(!r.ok||!clean(j?.access_token))throw new Error(`TOKEN_ERROR: ${clean(j?.error_description||j?.error)||"gagal refresh token"}`);
  return {token:clean(j.access_token),mode:"ephemeral_refresh_not_persisted"};
}

async function probeJson(url:string,token:string,init?:RequestInit){
  const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers||{})},cache:"no-store"});
  const body:any=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, status_text:r.statusText, body, error:r.ok?null:clean(body?.error?.message||body?.error_description||body?.error)||`Google HTTP ${r.status}` };
}
function aggregateSummary(body:any){
  const buckets=Array.isArray(body?.bucket)?body.bucket:[]; let datasets=0,points=0,total=0;
  const bucket_summary=buckets.map((b:any)=>{
    let bp=0,bt=0,bd=0;
    for(const ds of Array.isArray(b?.dataset)?b.dataset:[]){ datasets++;bd++; for(const p of Array.isArray(ds?.point)?ds.point:[]){points++;bp++;const v=pointValue(p);total+=v;bt+=v;} }
    return {start_time_millis:clean(b?.startTimeMillis),end_time_millis:clean(b?.endTimeMillis),dataset_count:bd,point_count:bp,total:Math.round(bt*100)/100};
  });
  return {bucket_count:buckets.length,dataset_count:datasets,point_count:points,total:Math.round(total*100)/100,bucket_summary};
}
async function aggregateProbe(token:string,type:string,start:Date,end:Date,mode:"period"|"duration"){
  const bucketByTime=mode==="period"?{period:{type:"day",value:1,timeZoneId:TZ}}:{durationMillis:86400000};
  const p=await probeJson("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",token,{method:"POST",body:JSON.stringify({aggregateBy:[{dataTypeName:type}],bucketByTime,startTimeMillis:start.getTime(),endTimeMillis:end.getTime()})});
  return {http_status:p.status,http_ok:p.ok,error:p.error,...aggregateSummary(p.body),raw_keys:Object.keys(p.body||{})};
}
async function sourceProbe(token:string,type?:string){
  const u=new URL("https://www.googleapis.com/fitness/v1/users/me/dataSources"); if(type)u.searchParams.set("dataTypeName",type);
  const p=await probeJson(u.toString(),token); const rows=Array.isArray(p.body?.dataSource)?p.body.dataSource:[];
  return {http_status:p.status,http_ok:p.ok,error:p.error,count:rows.length,samples:rows.slice(0,20).map((s:any)=>({data_stream_id:clean(s?.dataStreamId),data_stream_name:clean(s?.dataStreamName),data_type:clean(s?.dataType?.name),type:clean(s?.type),application:{name:clean(s?.application?.name),package_name:clean(s?.application?.packageName)},device:s?.device?{manufacturer:clean(s.device.manufacturer),model:clean(s.device.model),type:clean(s.device.type)}:null}))};
}
async function sessionProbe(token:string,start:Date,end:Date){
  const u=new URL("https://www.googleapis.com/fitness/v1/users/me/sessions");u.searchParams.set("startTime",start.toISOString());u.searchParams.set("endTime",end.toISOString());
  const p=await probeJson(u.toString(),token);const rows=Array.isArray(p.body?.session)?p.body.session:[];
  return {http_status:p.status,http_ok:p.ok,error:p.error,count:rows.length,samples:rows.slice(0,20).map((s:any)=>({id:clean(s?.id),name:clean(s?.name),activity_type:s?.activityType??null,start_time_millis:clean(s?.startTimeMillis),end_time_millis:clean(s?.endTimeMillis),application:{name:clean(s?.application?.name),package_name:clean(s?.application?.packageName)}}))};
}

export async function GET(req:NextRequest){
  if(!adminUser(req))return json({ok:false,message:"Akses Admin Wellness diperlukan."},401);
  const participantId=Number(req.nextUrl.searchParams.get("participant_id")||0); if(!participantId)return json({ok:false,message:"participant_id wajib diisi."},400);
  const exact=clean(req.nextUrl.searchParams.get("date"))||jakartaDateKey(Date.now()); if(!/^\d{4}-\d{2}-\d{2}$/.test(exact))return json({ok:false,message:"date harus YYYY-MM-DD."},400);
  const supabase=getSupabaseAdmin();
  try{
    const [pr,ir,db]=await Promise.all([
      supabase.from("wellness_participants").select("*").eq("id",participantId).maybeSingle(),
      supabase.from("wellness_integrations").select("*").eq("participant_id",participantId).eq("provider","google_fit").order("updated_at",{ascending:false}).limit(1).maybeSingle(),
      supabase.from("wellness_activity_logs").select("id,log_date,started_at,steps,calories,duration_minutes,distance_km,external_activity_id,raw_payload,created_at,updated_at").eq("participant_id",participantId).eq("source","google_fit").eq("log_date",exact).order("updated_at",{ascending:false}),
    ]);
    if(pr.error)throw pr.error;if(ir.error)throw ir.error;if(db.error)throw db.error;if(!pr.data)return json({ok:false,message:"Peserta tidak ditemukan."},404);if(!ir.data)return json({ok:false,message:"Google Fit belum terkoneksi."},409);
    const ti=await ephemeralAccessToken(ir.data); const start=jakartaStart(exact),end=jakartaStart(addDays(exact,1));
    const userinfo=await probeJson("https://openidconnect.googleapis.com/v1/userinfo",ti.token);
    const tokeninfo=await probeJson(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(ti.token)}`,ti.token);
    const perType:any={};
    await Promise.all(TYPES.map(async(type)=>{ const [period,duration,sources]=await Promise.all([aggregateProbe(ti.token,type,start,end,"period"),aggregateProbe(ti.token,type,start,end,"duration"),sourceProbe(ti.token,type)]); perType[type]={period,duration,sources}; }));
    const [allSources,sessions]=await Promise.all([sourceProbe(ti.token),sessionProbe(ti.token,start,end)]);
    const dbRows=Array.isArray(db.data)?db.data:[];
    const perTypeValues = Object.values(perType) as any[];
    const aggregatePoints: number = perTypeValues.reduce<number>(
      (s, x) => s + num(x?.period?.point_count) + num(x?.duration?.point_count),
      0,
    );
    const aggregateTotals: number = perTypeValues.reduce<number>(
      (s, x) => s + Math.abs(num(x?.period?.total)) + Math.abs(num(x?.duration?.total)),
      0,
    );
    const anyApiError = perTypeValues.some(
      (x) => !x?.period?.http_ok || !x?.duration?.http_ok || !x?.sources?.http_ok,
    ) || !allSources.http_ok || !sessions.http_ok;
    let verdict="API_HTTP_OK_EMPTY_DATA";
    if(anyApiError)verdict="GOOGLE_API_ERROR_OR_PERMISSION";
    else if(aggregatePoints>0||aggregateTotals>0||allSources.count>0||sessions.count>0)verdict=dbRows.length?"GOOGLE_DATA_VISIBLE_AND_DB_HAS_ROW":"GOOGLE_DATA_VISIBLE_BUT_DB_EMPTY";
    else if(dbRows.length)verdict="DB_HAS_DATA_BUT_GOOGLE_NOW_EMPTY";
    return json({ok:true,marker:"WELLNESS_GOOGLE_FIT_ADMIN_DEEP_PROBE_V126M58_2",read_only:true,participant:{id:Number(pr.data.id),code:clean(pr.data.code),name:clean(pr.data.name),email:clean(pr.data.email)},date:exact,timezone:TZ,utc_window:{start:start.toISOString(),end:end.toISOString()},oauth:{email:clean(userinfo.body?.email),name:clean(userinfo.body?.name),userinfo_http:userinfo.status,tokeninfo_http:tokeninfo.status,scope:clean(tokeninfo.body?.scope)||clean(ir.data?.raw_payload?.scope)||clean(ir.data?.scope),audience:clean(tokeninfo.body?.audience),token_mode:ti.mode},integration:{id:ir.data.id,is_active:![false,0,"0"].includes(ir.data.is_active),connected_at:ir.data.connected_at||null,last_sync_at:ir.data.last_sync_at||null,updated_at:ir.data.updated_at||null},verdict,signals:{aggregate_point_count:aggregatePoints,aggregate_total_signal:Math.round(aggregateTotals*100)/100,all_source_count:allSources.count,session_count:sessions.count,db_row_count:dbRows.length,all_google_calls_http_ok:!anyApiError},google:{per_type:perType,all_sources:allSources,sessions},db_rows:dbRows,note:"READ ONLY. Probe exact day. Tidak ada sync, update DB, atau write Google Fit."});
  }catch(e:any){const m=e?.message||"Deep probe gagal.";return json({ok:false,marker:"WELLNESS_GOOGLE_FIT_ADMIN_DEEP_PROBE_V126M58_2",read_only:true,message:m},/TOKEN_ERROR|invalid_grant|unauthorized/i.test(m)?409:500);}
}
