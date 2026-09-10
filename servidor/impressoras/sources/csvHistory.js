const fs = require("fs/promises");
const path = require("path");
const xml2js = require("xml2js");

const parser = new xml2js.Parser();
// Usado apenas quando o contador CMYK exato não está disponível.
const INK_ML_PER_M2 = Number(process.env.PRINTER2_INK_ML_PER_M2 || 3);

function compact(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\.prt$/i,"").replace(/[^a-z0-9]+/g,"");
}

async function bmpSize(file){
  let h;
  try{
    h=await fs.open(file,"r");
    const b=Buffer.alloc(54);
    const {bytesRead}=await h.read(b,0,b.length,0);
    if(bytesRead<26||b[0]!==0x42||b[1]!==0x4d)return null;
    return {width:Math.abs(b.readInt32LE(18)),height:Math.abs(b.readInt32LE(22))};
  }catch{return null}
  finally{if(h)await h.close()}
}

async function previewEstimator(machine,jobMeta){
  if(!machine.previewDir)return null;
  let names=[];
  try{names=await fs.readdir(machine.previewDir)}catch{return null}
  const clips=names.filter(n=>/_clip\.bmp$/i.test(n));
  let calibration=null;

  for(const meta of jobMeta.values()){
    if(!(meta.widthM>0)||!(meta.printLength>0))continue;
    const key=compact(meta.task);
    const file=clips.find(n=>compact(n.replace(/_\d+_clip\.bmp$/i,""))===key);
    if(!file)continue;
    const size=await bmpSize(path.join(machine.previewDir,file));
    if(size?.width>0&&size?.height>0){
      calibration={metersPerPixelX:meta.widthM/size.width,metersPerPixelY:meta.printLength/size.height};
      break;
    }
  }
  if(!calibration)return null;

  return async task=>{
    const key=compact(task);
    const file=clips.find(n=>compact(n.replace(/_\d+_clip\.bmp$/i,""))===key);
    if(!file)return null;
    const size=await bmpSize(path.join(machine.previewDir,file));
    if(!size)return null;
    const widthM=size.width*calibration.metersPerPixelX;
    const printLength=size.height*calibration.metersPerPixelY;
    return {widthM,printLength,printArea:widthM*printLength,previewRef:file};
  };
}

function parseCsvLine(line) {
  const p = line.split(",");
  if (p.length < 7) return null;
  const [start, end, cost, fileName, isClipOrTile, widthInch, heightInch] = p;
  return {
    start: start.trim(),
    end: end.trim(),
    cost: parseFloat(cost) || 0,
    fileName: fileName.trim(),
    isClipOrTile: isClipOrTile.trim().toLowerCase() === "true",
    widthInch: parseFloat(widthInch) || 0,
    heightInch: parseFloat(heightInch) || 0
  };
}

function parseUsDateTime(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let [, month, day, year, hour, minute, second, ap] = m;
  month=Number(month); day=Number(day); year=Number(year);
  hour=Number(hour); minute=Number(minute); second=Number(second);
  ap=ap.toUpperCase();
  if(ap==="PM" && hour!==12) hour+=12;
  if(ap==="AM" && hour===12) hour=0;
  return new Date(year,month-1,day,hour,minute,second);
}

function localDateParts(dt) {
  const y=dt.getFullYear();
  const m=String(dt.getMonth()+1).padStart(2,"0");
  const d=String(dt.getDate()).padStart(2,"0");
  const hh=String(dt.getHours()).padStart(2,"0");
  const mm=String(dt.getMinutes()).padStart(2,"0");
  const ss=String(dt.getSeconds()).padStart(2,"0");
  return {date:`${y}-${m}-${d}`,time:`${hh}:${mm}:${ss}`,dateTime:`${y}-${m}-${d} ${hh}:${mm}:${ss}`};
}

function num(v,fallback=0){
  const raw=Array.isArray(v)?v[0]:v;
  const n=Number(raw);
  return Number.isFinite(n)?n:fallback;
}

async function loadJobListMeta(machine){
  if(!machine.jobListPath) return new Map();
  try{
    const raw=await fs.readFile(machine.jobListPath,"utf8");
    const parsed=await parser.parseStringPromise(raw);
    const jobs=parsed?.JobList?.UIJob||[];
    const meta=new Map();

    for(const job of jobs){
      const strings=Array.isArray(job.string)?job.string.map(String):[];
      const task=path.basename(strings[0]||strings[1]||"");
      if(!task) continue;

      const fre=job.SPrtFileInfo?.[0]?.sFreSetting?.[0]||{};
      const resX=num(fre.nResolutionX);
      const resY=num(fre.nResolutionY);

      const clip=job.JobClip?.[0]||{};
      const ints=Array.isArray(clip.int)?clip.int.map(Number):[];
      const widthDots=Number(ints[0]||0);
      const heightDots=Number(ints[1]||0);

      const widthM=resX>0&&widthDots>0 ? widthDots/resX/39.37 : 0;
      const printLength=resY>0&&heightDots>0 ? heightDots/resY/39.37 : 0;
      const previewRef=strings.find(s=>/\.(bmp|jpg|jpeg|png|webp)$/i.test(s))||task;

      meta.set(task.toLowerCase(),{
        task,widthM,printLength,printArea:widthM*printLength,previewRef,resX,resY,widthDots,heightDots
      });
    }
    return meta;
  }catch{
    return new Map();
  }
}

async function readRange(machine,start,end){
  const [raw,jobMeta]=await Promise.all([
    fs.readFile(machine.historyPath,"utf8"),
    loadJobListMeta(machine)
  ]);

  const lines=raw.split(/\r?\n/).filter(Boolean);
  if(lines.length) lines.shift();
  const out=[];
  // O PrinterManager repete o mesmo Start para todas as cópias de uma
  // tiragem e grava End/Cost acumulados. Para cada cópia seguinte, o início
  // real é o End da linha anterior do mesmo trabalho/tiragem.
  const lastEndByRun=new Map();
  const estimateFromPreview=await previewEstimator(machine,jobMeta);
  const previewEstimates=new Map();
  if(estimateFromPreview){
    const tasks=[...new Set(lines.map(parseCsvLine).filter(Boolean).map(r=>path.basename(r.fileName)))];
    for(const task of tasks) previewEstimates.set(task.toLowerCase(),await estimateFromPreview(task));
  }

  lines.forEach((line,index)=>{
    const reg=parseCsvLine(line);
    if(!reg) return;

    const startDt=parseUsDateTime(reg.start);
    const endDt=parseUsDateTime(reg.end);
    if(!startDt) return;

    const task=path.basename(reg.fileName);
    const runKey=`${reg.start}|${task.toLowerCase()}`;
    const effectiveStart=lastEndByRun.get(runKey)||startDt;
    if(endDt) lastEndByRun.set(runKey,endDt);

    const parts=localDateParts(effectiveStart);
    if(parts.date<start||parts.date>end) return;

    const meta=jobMeta.get(task.toLowerCase());

    let printLength=reg.heightInch/39.37;
    let widthM=reg.widthInch/39.37;
    let printArea=printLength*widthM;
    let metricSource="history-csv";
    let metricEstimated=false;

    if(reg.isClipOrTile && (!(printLength>0)||!(widthM>0)) && meta?.printLength>0){
      printLength=meta.printLength;
      widthM=meta.widthM;
      printArea=meta.printArea;
      metricSource="joblist";
    }

    if(reg.isClipOrTile&&(!(printLength>0)||!(widthM>0))&&estimateFromPreview){
      const estimated=previewEstimates.get(task.toLowerCase());
      if(estimated?.printLength>0&&estimated?.widthM>0){
        printLength=estimated.printLength;
        widthM=estimated.widthM;
        printArea=estimated.printArea;
        metricSource="preview-estimado";
        metricEstimated=true;
      }
    }

    const endParts=endDt?localDateParts(endDt):null;
    const timeSeconds=endDt
      ? Math.max(0,Math.round((endDt-effectiveStart)/1000))
      : Math.max(0,Math.round(reg.cost));

    out.push({
      id:`${machine.id}|${index}|${reg.start}|${task}`,
      machineId:machine.id,
      machineName:machine.name,
      sourceType:machine.type,
      dateTime:parts.dateTime,
      date:parts.date,
      time:parts.time,
      endDateTime:endParts?.dateTime||"",
      task,
      pass:null,
      status:"Concluído",
      cancelled:false,
      error:false,
      printArea,
      printLength,
      widthM,
      finish:null,
      total:null,
      timeSeconds,
      inkMl:printArea>0?printArea*INK_ML_PER_M2:0,
      inkExperimental:printArea>0,
      previewRef:meta?.previewRef||task,
      isClipOrTile:reg.isClipOrTile,
      metricSource,
      metricEstimated,
      metricUnknown:!(printLength>0)
    });
  });

  return out;
}

async function signature(machine){
  const stat=await fs.stat(machine.historyPath);
  let jobSig="";
  if(machine.jobListPath){
    try{
      const js=await fs.stat(machine.jobListPath);
      jobSig=`:${js.size}:${js.mtimeMs}`;
    }catch{}
  }
  return `${stat.size}:${stat.mtimeMs}${jobSig}`;
}

module.exports={readRange,signature,loadJobListMeta};
