// WELLNESS_MEMBER_MONITORING_SCOPE_PARITY_V126M55_4
// Read-only monitoring loader. Uses the same canonical helpers as Participant/Coach.
import { loadCanonicalNutritionHistories } from "@/lib/wellness/nutritionHistory";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";
import { buildEffectiveTargetTimeline, effectiveTargetsForDate, targetTimelineSummary } from "@/lib/wellness/effectiveDatedTargets";
import {
  buildWellnessStreakSummary,
  wellnessJakartaDate,
  wellnessStreakSteps,
  wellnessStreakWorkoutCalories,
} from "@/lib/wellness/streak";
import { canonicalParticipantGroupName, matchingCoachAssignment, participantScopeIds, type CoachGroupUnitMap } from "@/lib/wellness/coachGroupAccess";

function clean(v:any){return String(v??"").trim()}
function num(v:any){const n=Number(v);return Number.isFinite(n)?n:0}
function pid(r:any){return num(r?.id||r?.participant_id||r?.wellness_participant_id)}
function pname(r:any){return clean(r?.name||r?.employee_name||r?.full_name||r?.nama||"-")}
function pcode(r:any){return clean(r?.code||r?.employee_code||r?.kode_karyawan||r?.no_karyawan||r?.nik||"-")}
function companyId(r:any){return num(r?.wellness_company_id||r?.company_id)}
function jakartaDay(offset=0){const d=new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(d)}
// WELLNESS_MASTER_WORKOUT_ADMIN_EXPORT_RANGE_V126M97_3
function validDateKey(v:any){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s}
function dateKeys(from:any,to:any){
  const start=clean(from),end=clean(to);
  if(!validDateKey(start)||!validDateKey(end)||start>end)return[];
  const a=new Date(`${start}T00:00:00Z`).getTime(),b=new Date(`${end}T00:00:00Z`).getTime();
  const days=Math.floor((b-a)/86400000)+1;
  if(days<1||days>366)return[];
  return Array.from({length:days},(_,i)=>new Date(a+i*86400000).toISOString().slice(0,10));
}
function chunks<T>(rows:T[],size:number){const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out}

async function pagedRows(supabase:any, table:string, ids:number[], orders:string[]){
  const all:any[]=[];
  for(const idChunk of chunks([...new Set(ids.filter(Boolean))],80)){
    let offset=0;
    for(;;){
      let q=supabase.from(table).select("*").in("participant_id",idChunk);
      for(const column of orders) q=q.order(column,{ascending:true,nullsFirst:false});
      const res=await q.range(offset,offset+999);
      if(res?.error) throw res.error;
      const rows=res?.data||[]; all.push(...rows);
      if(rows.length<1000) break;
      offset+=1000;
      if(offset>=150000) throw new Error(`${table} melewati safety cap; monitoring dihentikan agar data tidak terpotong.`);
    }
  }
  return all;
}

// WELLNESS_MEMBER_MONITORING_RECENT_ACTIVITY_V126M55_2
// Activity monitoring is about the newest 7-day window. Keep the newest rows per
// participant so >2,000 historical sync rows cannot cut off the latest day.
function latest2000(rows:any[], fields:string[]){
  const map=new Map<number,any[]>();
  for(const row of rows){const id=num(row?.participant_id);if(!id)continue;if(!map.has(id))map.set(id,[]);map.get(id)!.push(row)}
  for(const [id,list] of map){list.sort((a,b)=>{const da=fields.map(k=>clean(a?.[k])).find(Boolean)||"";const db=fields.map(k=>clean(b?.[k])).find(Boolean)||"";return db.localeCompare(da)||num(b?.id)-num(a?.id)});map.set(id,list.slice(0,2000))}
  return map;
}

// Preserve the existing target-note selection behavior.
function first2000(rows:any[], fields:string[]){
  const map=new Map<number,any[]>();
  for(const row of rows){const id=num(row?.participant_id);if(!id)continue;if(!map.has(id))map.set(id,[]);map.get(id)!.push(row)}
  for(const [id,list] of map){list.sort((a,b)=>{const da=fields.map(k=>clean(a?.[k])).find(Boolean)||"";const db=fields.map(k=>clean(b?.[k])).find(Boolean)||"";return da.localeCompare(db)||num(a?.id)-num(b?.id)});map.set(id,list.slice(0,2000))}
  return map;
}

// WELLNESS_ADMIN_MONITORING_HISTORY_NAKES_RANGE_V126M110_PERIOD_ROWS
// buildWellnessStreakSummary intentionally exposes only its latest 7 display days.
// Admin date-range reports may point to an older period, so build only the requested
// period rows here from the same canonical inputs/metric resolvers. The existing
// live/current streak summary remains untouched.
function monitoringRaw(row:any){
  const raw=row?.raw_payload;
  if(!raw)return{};
  if(typeof raw==="string"){try{return JSON.parse(raw)}catch{return{}}}
  return typeof raw==="object"?raw:{};
}
function monitoringNutritionCalories(row:any){
  const raw=monitoringRaw(row);
  return num(
    row?.total_calories ??
    row?.calories ??
    row?.estimated_calories ??
    row?.calorie_total ??
    raw?.["Kalori Makanan"] ??
    0
  );
}
function monitoringActivityDate(row:any){
  const raw=monitoringRaw(row);
  return wellnessJakartaDate(
    row?.log_date || row?.date || row?.tanggal || raw?.log_date ||
    row?.started_at || row?.start_date_local || raw?.start_date_local ||
    raw?.last_sync_at || raw?.health_connect_last_sync_at ||
    row?.updated_at || row?.created_at
  );
}
function monitoringDayLabel(date:string){
  if(!date)return "-";
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("id-ID",{weekday:"short",timeZone:"Asia/Jakarta"}).replace(/\./g,"").slice(0,3);
}
function requestedPeriodDaysV126M110(opts:{dates:string[];nutritionRows:any[];activityRows:any[];timeline:any;fallbackWorkout:number}){
  const nutritionByDate=new Map<string,{count:number;calories:number}>();
  const activityByDate=new Map<string,{workout:number;steps:number}>();

  for(const row of opts.nutritionRows||[]){
    const date=wellnessJakartaDate(row?.log_date||row?.date||row?.created_at||row?.updated_at);
    if(!date)continue;
    const current=nutritionByDate.get(date)||{count:0,calories:0};
    current.count+=1;
    current.calories+=monitoringNutritionCalories(row);
    nutritionByDate.set(date,current);
  }

  for(const row of opts.activityRows||[]){
    const date=monitoringActivityDate(row);
    if(!date)continue;
    const current=activityByDate.get(date)||{workout:0,steps:0};
    current.workout+=wellnessStreakWorkoutCalories(row);
    current.steps+=wellnessStreakSteps(row);
    activityByDate.set(date,current);
  }

  return (opts.dates||[]).map((date)=>{
    const nutrition=nutritionByDate.get(date)||{count:0,calories:0};
    const activity=activityByDate.get(date)||{workout:0,steps:0};
    const datedTargets=effectiveTargetsForDate(opts.timeline,date);
    const workoutTarget=Math.round(num(datedTargets?.workout)||num(opts.fallbackWorkout));
    const workoutCalories=Math.round(activity.workout||0);
    const revision=opts.timeline?.revisions?.filter((item:any)=>clean(item?.effective_from)<=date).at(-1);
    return{
      date,
      label:monitoringDayLabel(date),
      nutrition_count:nutrition.count,
      nutrition_calories:Math.round(nutrition.calories||0),
      workout_calories:workoutCalories,
      steps:Math.round(activity.steps||0),
      workout_target_calories:workoutTarget,
      target_effective_from:clean(revision?.effective_from)||null,
      success:nutrition.count>=3&&(workoutTarget>0?workoutCalories>=workoutTarget:workoutCalories>0),
    };
  });
}

function status(day:any){
  const n=num(day?.nutrition_count), w=num(day?.workout_calories), t=num(day?.workout_target_calories), s=num(day?.steps);
  if(n===0&&w===0&&s===0)return{key:"not_updated",label:"Belum Update",reason:"Belum ada input nutrisi atau aktivitas pada tanggal ini."};
  if(day?.success)return{key:"on_track",label:"On Track",reason:"Target nutrisi dan workout untuk streak tercapai."};
  if(n<3&&w<t)return{key:"follow_up",label:"Perlu Follow Up",reason:`Nutrisi ${n}/3 dan workout ${Math.round(w)}/${Math.round(t)} kkal belum tercapai.`};
  if(n<3)return{key:"follow_up",label:"Perlu Follow Up",reason:`Input nutrisi baru ${n}/3.`};
  return{key:"follow_up",label:"Perlu Follow Up",reason:`Workout ${Math.round(w)}/${Math.round(t)} kkal belum mencapai target.`};
}

export async function loadWellnessMemberMonitoring(opts:{supabase:any;participants:any[];groupUnitMap?:CoachGroupUnitMap;companyNameById?:Map<number,string>;coachAssignments?:any[];fromDate?:string;toDate?:string}){
  const participants=(opts.participants||[]).filter(x=>pid(x)>0).sort((a,b)=>pname(a).localeCompare(pname(b),"id"));
  const ids=participants.map(pid);
  const requestedDates=dateKeys(opts.fromDate,opts.toDate);
  const dates=requestedDates.length?requestedDates:Array.from({length:7},(_,i)=>jakartaDay(i-6));
  const today=dates.at(-1)||jakartaDay();
  if(!ids.length)return{generated_at:new Date().toISOString(),today,dates,summary:{total_participants:0,on_track:0,follow_up:0,not_updated:0,streak_success_today:0},participants:[],source_contract:"participant_coach_canonical"};

  const [controlMap,nutritionHistory,activitiesAll,notesAll]=await Promise.all([
    loadParticipantControlMap(opts.supabase,ids),
    loadCanonicalNutritionHistories({supabase:opts.supabase,participants}),
    pagedRows(opts.supabase,"wellness_activity_logs",ids,["participant_id","log_date","id"]),
    pagedRows(opts.supabase,"wellness_coach_notes",ids,["participant_id","session_date","created_at","id"]),
  ]);
  const activities=latest2000(activitiesAll,["log_date","started_at","updated_at","created_at"]);
  const notes=first2000(notesAll,["session_date","created_at","updated_at"]);

  const result=participants.map(participant=>{
    const id=pid(participant);
    const activityRows=filterOperationalRowsForProgram(participant,filterActivityRowsByFitnessSource(activities.get(id)||[],controlMap),"","",["log_date","started_at","created_at"]);
    const nutrition=nutritionHistory.byParticipantId.get(id);
    const nutritionRows=filterOperationalRowsForProgram(participant,nutrition?.logs||[],"","",["log_date","created_at"]);
    const timeline=buildEffectiveTargetTimeline({participant,notes:notes.get(id)||[]});
    const streak=buildWellnessStreakSummary({nutritionRows,activityRows,workoutTargetCalories:num(timeline.current.workout)||300,targetTimeline:timeline});
    const periodSourceDays=requestedDates.length
      ? requestedPeriodDaysV126M110({
          dates,
          nutritionRows,
          activityRows,
          timeline,
          fallbackWorkout:num(timeline.current.workout)||300,
        })
      : (streak.days||[]);
    const byDate=new Map(periodSourceDays.map((d:any)=>[clean(d.date),d]));
    const days=dates.map(date=>{const d:any=byDate.get(date)||{date,nutrition_count:0,nutrition_calories:0,workout_calories:0,steps:0,workout_target_calories:num(timeline.current.workout)||300,target_effective_from:null,success:false};return{...d,status:status(d)}});
    const avg=(field:string)=>Math.round(days.reduce((sum:number,d:any)=>sum+num(d?.[field]),0)/Math.max(days.length,1));
    const company=companyId(participant); const control=controlMap.get(id)||participant?.wellness_control||{};
    const accessGroupIds=opts.groupUnitMap?participantScopeIds(participant,opts.groupUnitMap):[];
    const assigned=opts.groupUnitMap&&opts.coachAssignments?matchingCoachAssignment(participant,opts.coachAssignments,opts.groupUnitMap):null;
    return{
      id,name:pname(participant),code:pcode(participant),company_id:company||null,
      company_name:opts.companyNameById?.get(company)||clean(participant?.company_name||participant?.company||participant?.nama_perusahaan)||"-",
      group_name:opts.groupUnitMap?canonicalParticipantGroupName(participant,opts.groupUnitMap):clean(participant?.group_unit_name||participant?.group_name||participant?.kelompok_name)||"-",
      group_scope_ids:accessGroupIds,access_group_ids:accessGroupIds,
      assigned_group_name:clean(assigned?.group_name||""),assigned_group_unit_id:clean(assigned?.wellness_group_unit_id||"")||null,
      fitness_source:clean(control?.fitness_source||"none").toLowerCase().replace(/-/g,"_"),
      streak:{current_streak:num(streak.current_streak),longest_streak:num(streak.longest_streak),success_dates:streak.success_dates||[]},
      target:{nutrition:num(timeline.current.nutrition),workout:num(timeline.current.workout)||300,steps:num(timeline.current.steps),timeline:targetTimelineSummary(timeline)},
      today:days.at(-1),days,
      weekly:{success_days:days.filter((d:any)=>d.success).length,completion_percent:Math.round(days.filter((d:any)=>d.success).length/Math.max(days.length,1)*100),period_days:days.length,average_nutrition_calories:avg("nutrition_calories"),average_workout_calories:avg("workout_calories"),average_steps:avg("steps")},
      sources:{nutrition:nutrition?.sources||null,nutrition_rows:nutritionRows.length,activity_rows:activityRows.length,fitness_source:clean(control?.fitness_source||"none")},
    };
  });
  const summary=result.reduce((a:any,item:any)=>{const k=clean(item?.today?.status?.key);if(k==="on_track")a.on_track++;else if(k==="not_updated")a.not_updated++;else a.follow_up++;if(item?.today?.success)a.streak_success_today++;return a},{total_participants:result.length,on_track:0,follow_up:0,not_updated:0,streak_success_today:0});
  return{generated_at:new Date().toISOString(),today,dates,period:{from:dates[0]||today,to:dates.at(-1)||today,days:dates.length},summary,participants:result,source_contract:"participant_coach_canonical",source_markers:{nutrition:"loadCanonicalNutritionHistories",activity:"filterActivityRowsByFitnessSource + filterOperationalRowsForProgram",targets:"buildEffectiveTargetTimeline",streak:"buildWellnessStreakSummary"}};
}
