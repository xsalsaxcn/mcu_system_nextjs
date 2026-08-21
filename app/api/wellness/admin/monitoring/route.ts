// WELLNESS_ADMIN_MEMBER_MONITORING_V126M55
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { buildCoachGroupUnitMap, dedupeCoachParticipants } from "@/lib/wellness/coachGroupAccess";
import { loadWellnessMemberMonitoring } from "@/lib/wellness/memberMonitoringServer";
export const dynamic="force-dynamic"; export const runtime="nodejs"; export const maxDuration=60;
const ROLES=new Set(["admin","super_admin","supervisor","doctor","wellness_admin"]);
function clean(v:any){return String(v??"").trim()}
function active(v:any){return ![false,0,"0","false","inactive","nonaktif"].includes(typeof v==="string"?v.toLowerCase():v)}
// WELLNESS_MASTER_WORKOUT_ADMIN_EXPORT_RANGE_V126M97_3
function validDate(v:any){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s}
function rangeDays(from:string,to:string){return Math.floor((new Date(`${to}T00:00:00Z`).getTime()-new Date(`${from}T00:00:00Z`).getTime())/86400000)+1}
export async function GET(req:NextRequest){
  try{
    const user:any=getSessionUser(req);
    if(!user)return NextResponse.json({ok:false,message:"Session Admin belum aktif."},{status:401});
    if(!ROLES.has(clean(user.role).toLowerCase()))return NextResponse.json({ok:false,message:"Akun ini tidak memiliki akses Portal Admin."},{status:403});

    const from=clean(req.nextUrl.searchParams.get("from"));
    const to=clean(req.nextUrl.searchParams.get("to"));
    if(Boolean(from)!==Boolean(to)){
      return NextResponse.json({ok:false,message:"Tanggal mulai dan tanggal akhir harus diisi bersama."},{status:400});
    }
    if(from&&to){
      if(!validDate(from)||!validDate(to))return NextResponse.json({ok:false,message:"Format tanggal harus YYYY-MM-DD."},{status:400});
      if(from>to)return NextResponse.json({ok:false,message:"Tanggal mulai tidak boleh setelah tanggal akhir."},{status:400});
      const days=rangeDays(from,to);
      if(days<1||days>366)return NextResponse.json({ok:false,message:"Range monitoring maksimal 366 hari."},{status:400});
    }

    const s=getSupabaseAdmin();
    const [pr,cr,gr]=await Promise.all([
      s.from("wellness_participants").select("*").limit(10000),
      s.from("wellness_companies").select("id,name,is_active").limit(2000),
      s.from("wellness_group_units").select("*").limit(5000),
    ]);
    if(pr.error)throw pr.error;
    if(cr.error)throw cr.error;
    if(gr.error)throw gr.error;

    const map=buildCoachGroupUnitMap(gr.data||[]);
    const companies=new Map<number,string>((cr.data||[]).map((r:any)=>[Number(r.id),clean(r.name)]));
    const participants=dedupeCoachParticipants(pr.data||[]).filter((r:any)=>active(r?.is_active));

    const monitoring=await loadWellnessMemberMonitoring({
      supabase:s,
      participants,
      groupUnitMap:map,
      companyNameById:companies,
      fromDate:from||undefined,
      toDate:to||undefined,
    });

    return NextResponse.json({
      ok:true,
      admin:{id:user.id,name:clean(user.name||user.full_name||user.username||"Admin"),role:clean(user.role)},
      companies:(cr.data||[]).filter((r:any)=>active(r?.is_active)).map((r:any)=>({id:Number(r.id),name:clean(r.name)})),
      groups:(gr.data||[]).map((r:any)=>({id:clean(r.id),name:clean(r.name),company_id:Number(r.company_id||r.wellness_company_id||0)||null,parent_id:clean(r.parent_id)||null,unit_type:clean(r.unit_type)})),
      ...monitoring,
    },{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e:any){
    return NextResponse.json({ok:false,message:e?.message||"Gagal memuat monitoring Admin."},{status:500});
  }
}
