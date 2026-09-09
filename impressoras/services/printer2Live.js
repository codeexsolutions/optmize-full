const fs = require("fs/promises");
const { loadJobListMeta } = require("../sources/csvHistory");
const { backfillAborts, startAbortWatcher, currentSessionState } = require("./printer2Cancel");
const { startPrinter2InkAlerts } = require("./printer2InkAlerts");

const POLL_MS=Number(process.env.PRINTER2_LIVE_POLL_MS||1000);
const JOB_RE=/Printing job\[(.+?)\],copies=\[(.*?)\]/g;
const state=new Map();

function baseName(value){
  const p=String(value||"").trim().split(/[\\/]/);
  return p[p.length-1]||"";
}

// Todos os inícios contidos no trecho lido, na ordem. Num tick que traga
// dois de uma vez, pegar só o último perderia o do meio.
function allJobs(text){
  JOB_RE.lastIndex=0;
  const out=[];
  let m;
  while((m=JOB_RE.exec(text))) out.push({task:baseName(m[1]),copies:m[2]});
  return out;
}

async function readNew(file,offset){
  const stat=await fs.stat(file);
  if(stat.size<offset) offset=0;
  if(stat.size===offset) return {text:"",offset,size:stat.size,mtimeMs:stat.mtimeMs};

  const len=stat.size-offset;
  const h=await fs.open(file,"r");
  try{
    const b=Buffer.allocUnsafe(len);
    const {bytesRead}=await h.read(b,0,len,offset);
    return {text:b.subarray(0,bytesRead).toString("utf8"),offset:offset+bytesRead,size:stat.size,mtimeMs:stat.mtimeMs};
  }finally{
    await h.close();
  }
}

async function metaFor(machine,task){
  try{
    const map=await loadJobListMeta(machine);
    return map.get(String(task||"").toLowerCase())||null;
  }catch{return null}
}

function makeProgress(machine,task,meta){
  return {
    id:`${machine.id}|live`,
    machineId:machine.id,
    machineName:machine.name,
    sourceType:"printer2-live",
    task,
    status:"Em impressão",
    cancelled:false,
    error:false,
    finish:null,
    total:null,
    printLength:Number(meta?.printLength||0),
    printArea:Number(meta?.printArea||0),
    progressPercent:null,
    progressState:"printing",
    progressMode:"indeterminate",
    previewRef:meta?.previewRef||task,
    progressAt:Date.now()
  };
}

function startPrinter2Live(io,loadMachines){
  let running=false;

  async function tickMachine(machine){
    const prev=state.get(machine.id);

    if(!prev){
      const stat=await fs.stat(machine.liveLogFile);
      let progress=null;
      try{
        const active=await currentSessionState(machine);
        if(active?.printing&&active.job){
          const meta=await metaFor(machine,active.job);
          progress={...makeProgress(machine,active.job,meta),suppressStartNotification:true};
          io.emit("print-progress",progress);
          console.log(`[printer2-live] ${machine.id}: reconheceu "${active.job}" já em andamento (sem aviso de início)`);
        }
      }catch(error){
        console.warn(`[printer2-live] ${machine.id}: não consegui reconstruir o trabalho inicial: ${error.message}`);
      }
      state.set(machine.id,{offset:stat.size,progress,online:true});
      console.log(`[printer2-live] acompanhando ${machine.id} a partir do byte ${stat.size}`);
      // Importa os cancelamentos que já estão nos logs de sessão. Roda em
      // segundo plano: são centenas de MB na primeira vez e não pode
      // atrasar o acompanhamento ao vivo.
      backfillAborts(io,machine).catch(e=>console.warn(`[printer2-cancel] varredura falhou: ${e.message}`));
      return;
    }

    const chunk=await readNew(machine.liveLogFile,Number(prev.offset||0));
    if(!chunk.text){
      state.set(machine.id,{...prev,offset:chunk.offset,online:true});
      return;
    }

    const jobs=allJobs(chunk.text);
    if(!jobs.length){
      state.set(machine.id,{...prev,offset:chunk.offset,online:true});
      return;
    }


    const found=jobs[jobs.length-1];
    const meta=await metaFor(machine,found.task);
    const progress=makeProgress(machine,found.task,meta);

    state.set(machine.id,{offset:chunk.offset,progress,online:true});
    io.emit("print-progress",progress);
    console.log(`[printer2-live] ${machine.id}: iniciou "${found.task}"`);
  }

  async function tick(){
    if(running) return;
    running=true;
    try{
      const machines=await loadMachines();
      for(const machine of machines.filter(m=>m.type==="csv"&&m.liveLogFile&&m.enabled!==false)){
        try{await tickMachine(machine)}
        catch(error){
          const prev=state.get(machine.id);
          state.set(machine.id,{...(prev||{}),online:false});
          console.warn(`[printer2-live] ${machine.id}: ${error.message}`);
        }
      }
    }finally{running=false}
  }

  setInterval(tick,POLL_MS);
  tick();
  startAbortWatcher(io,loadMachines);
  startPrinter2InkAlerts(io,loadMachines);
}

function getPrinter2LiveSnapshot(){
  const out=[];
  for(const entry of state.values()){
    if(entry?.progress?.progressState==="printing"){
      out.push({...entry.progress,progressAt:Date.now()});
    }
  }
  return out;
}

module.exports={startPrinter2Live,getPrinter2LiveSnapshot};
