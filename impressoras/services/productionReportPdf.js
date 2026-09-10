const PDFDocument = require("pdfkit");
const { addDays, brDate } = require("../utils/date");

const COLORS = { navy:"#071a38", blue:"#1468e5", cyan:"#00a9cf", text:"#172033", muted:"#68758a", line:"#d8e1ee", soft:"#f3f7fc", orange:"#c56a12", white:"#ffffff" };
// As margens visuais são desenhadas manualmente. Margem automática zero evita
// que o PDFKit crie uma página extra ao escrever o rodapé perto do limite.
const PAGE_OPTIONS = { size:"A4", layout:"landscape", margin:0 };

function completed(items){ return items.filter(r => !r.cancelled && !r.error); }
function isReposicao(record){return String(record.task||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes("reposic");}
function sum(items,key){ return items.reduce((total,item) => total + Number(item[key] || 0), 0); }
function duration(seconds){
  seconds=Math.max(0,Math.round(Number(seconds||0)));
  const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
  return h?`${h}h ${String(m).padStart(2,"0")}min`:m?`${m}min ${String(s).padStart(2,"0")}s`:`${s}s`;
}
function number(value,digits=2){ return Number(value||0).toLocaleString("pt-BR",{minimumFractionDigits:digits,maximumFractionDigits:digits}); }
function periodSeconds(end,days,today){
  let total=0;
  for(let offset=days-1;offset>=0;offset--){
    const date=addDays(end,-offset),[year,month,day]=date.split("-").map(Number);
    if(new Date(year,month-1,day).getDay()===0)continue;
    if(date===today){const now=new Date();total+=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();}
    else total+=86400;
  }
  return total;
}
function inkChannels(items){
  const out={K:0,C:0,M:0,Y:0};
  for(const record of items)for(const channel of Array.isArray(record.inkChannels)?record.inkChannels:[]){
    const raw=String(channel.code||channel.color||"").toUpperCase();
    const key=raw.startsWith("K")||raw.includes("BLACK")||raw.includes("PRETO")?"K":raw.startsWith("C")||raw.includes("CYAN")||raw.includes("CIANO")?"C":raw.startsWith("M")?"M":raw.startsWith("Y")||raw.includes("YELLOW")||raw.includes("AMARELO")?"Y":null;
    if(key)out[key]+=Number(channel.ml||0);
  }
  out.total=sum(items,"inkMl");out.known=out.K+out.C+out.M+out.Y;out.unallocated=Math.max(0,out.total-out.known);
  return out;
}
function summarize(records,start,end,days,machineCount,today){
  const all=records.filter(r=>r.date>=start&&r.date<=end),ok=completed(all);
  const available=periodSeconds(end,days,today)*Math.max(1,machineCount);
  const printing=Math.min(available,sum(ok,"timeSeconds")),meters=sum(ok,"printLength");
  const stopped=Math.max(0,available-printing)/Math.max(1,machineCount);
  return {jobs:ok.length,cancelled:all.filter(r=>r.cancelled).length,errors:all.filter(r=>r.error).length,meters,area:sum(ok,"printArea"),printing,stopped,speedH:printing?meters/printing*3600:0,speedS:printing?meters/printing:0,ink:inkChannels(ok)};
}
function rounded(doc,x,y,w,h,r,fill,stroke=COLORS.line){doc.roundedRect(x,y,w,h,r).fillAndStroke(fill,stroke);}
function text(doc,value,x,y,options={}){doc.fillColor(options.color||COLORS.text).font(options.bold?"Helvetica-Bold":"Helvetica").fontSize(options.size||9).text(String(value),x,y,{width:options.width,align:options.align||"left",lineBreak:options.lineBreak!==false});}
function footer(doc,page){const y=doc.page.height-45;text(doc,`Sublime  |  Relatório gerado em ${new Date().toLocaleString("pt-BR")}`,36,y,{size:7,color:COLORS.muted,width:620,lineBreak:false});text(doc,`Página ${page}`,doc.page.width-90,y,{size:7,color:COLORS.muted,width:54,align:"right",lineBreak:false});}
function header(doc,title,subtitle){
  doc.rect(0,0,doc.page.width,72).fill(COLORS.navy);doc.roundedRect(34,18,36,36,10).fill(COLORS.blue);text(doc,"A",34,27,{size:17,bold:true,color:COLORS.white,width:36,align:"center"});
  text(doc,"SUBLIME",82,18,{size:15,bold:true,color:COLORS.white,width:180});text(doc,"CENTRAL DE IMPRESSÃO",82,39,{size:7,bold:true,color:"#91b7ee",width:180});
  text(doc,title,330,16,{size:16,bold:true,color:COLORS.white,width:470,align:"right"});text(doc,subtitle,330,40,{size:8,color:"#b9cbe6",width:470,align:"right"});
}
function metric(doc,label,value,x,y,w,color=COLORS.text){text(doc,label.toUpperCase(),x,y,{size:6,bold:true,color:COLORS.muted,width:w});text(doc,value,x,y+13,{size:12,bold:true,color,width:w});}
function periodCard(doc,period,x,y,w,h){
  rounded(doc,x,y,w,h,12,COLORS.white);text(doc,"PERÍODO",x+14,y+13,{size:6,bold:true,color:COLORS.blue,width:w-28});text(doc,period.label,x+14,y+26,{size:13,bold:true,width:w-28});text(doc,period.range,x+14,y+46,{size:7,color:COLORS.muted,width:w-28});doc.moveTo(x+14,y+62).lineTo(x+w-14,y+62).strokeColor(COLORS.line).stroke();
  const half=(w-38)/2;metric(doc,"Metros impressos",`${number(period.data.meters)} m`,x+14,y+75,half);metric(doc,"Tinta total",`${number(period.data.ink.total)} mL`,x+24+half,y+75,half);metric(doc,"Velocidade média",`${number(period.data.speedH)} m/h`,x+14,y+116,half);metric(doc,"Metros por segundo",`${number(period.data.speedS,4)} m/s`,x+24+half,y+116,half);metric(doc,"Tempo imprimindo",duration(period.data.printing),x+14,y+157,half);metric(doc,"Parada média / máquina",duration(period.data.stopped),x+24+half,y+157,half,COLORS.orange);
  text(doc,"TINTA POR COR",x+14,y+200,{size:6,bold:true,color:COLORS.muted,width:w-28});const labels=[["K",period.data.ink.K,"#303746"],["C",period.data.ink.C,COLORS.cyan],["M",period.data.ink.M,"#c43c88"],["Y",period.data.ink.Y,"#b48900"]];labels.forEach((item,i)=>{const bx=x+14+i*((w-28)/4),bw=(w-34)/4;doc.roundedRect(bx,y+213,bw,24,5).fill("#f5f8fc");text(doc,`${item[0]}  ${number(item[1])}`,bx+4,y+221,{size:7,bold:true,color:item[2],width:bw-8,align:"center"});});
  if(period.data.ink.unallocated>.01)text(doc,`Sem divisão por cor: ${number(period.data.ink.unallocated)} mL`,x+14,y+245,{size:7,color:COLORS.orange,width:w-28});
  text(doc,`${period.data.jobs} concluído(s)  |  ${period.data.cancelled} cancelado(s)  |  ${period.data.errors} erro(s)`,x+14,y+h-24,{size:7,color:COLORS.muted,width:w-28});
}
function tableHeader(doc,x,y,widths){const labels=["MÁQUINA","PERÍODO","METROS","VELOCIDADE","TINTA / CMYK","IMPRIMINDO","PARADA","CONCLUÍDOS"];let cx=x;doc.rect(x,y,widths.reduce((a,b)=>a+b,0),24).fill(COLORS.navy);labels.forEach((label,i)=>{text(doc,label,cx+5,y+8,{size:6,bold:true,color:COLORS.white,width:widths[i]-10});cx+=widths[i];});}
function detailPage(doc,machines,definitions,records,end,today,page){
  doc.addPage(PAGE_OPTIONS);header(doc,"Detalhamento por máquina",`Dia, semana e mês - referência ${brDate(end)}`);let y=91;const x=34,widths=[92,82,70,86,170,82,78,70];tableHeader(doc,x,y,widths);y+=24;
  for(const machine of machines){
    if(y+151>doc.page.height-58){footer(doc,page++);doc.addPage(PAGE_OPTIONS);header(doc,"Detalhamento por máquina","Continuação");y=91;tableHeader(doc,x,y,widths);y+=24;}
    const own=records.filter(r=>r.machineId===machine.id);
    definitions.forEach((period,index)=>{
      const s=summarize(own,period.start,end,period.days,1,today),rowH=48;let cx=x;doc.rect(x,y,widths.reduce((a,b)=>a+b,0),rowH).fill(index%2?"#f8fafd":"#ffffff").stroke(COLORS.line);
      const cells=[index===0?machine.name:"",period.label,`${number(s.meters)} m`,`${number(s.speedH)} m/h\n${number(s.speedS,4)} m/s`,`Total ${number(s.ink.total)} mL\nK ${number(s.ink.K)}  C ${number(s.ink.C)}  M ${number(s.ink.M)}  Y ${number(s.ink.Y)}`,duration(s.printing),duration(s.stopped),String(s.jobs)];
      cells.forEach((value,i)=>{text(doc,value,cx+5,y+9,{size:i===4?6.5:7,bold:i===0||i===2,color:i===6?COLORS.orange:COLORS.text,width:widths[i]-10});cx+=widths[i];});y+=rowH;
    });y+=7;
  }
  footer(doc,page);return page;
}
function reposicaoHeader(doc,x,y,widths){const labels=["DATA","HORA","MÁQUINA","TRABALHO DE REPOSIÇÃO","METROS","STATUS"];let cx=x;doc.rect(x,y,widths.reduce((a,b)=>a+b,0),24).fill(COLORS.navy);labels.forEach((label,index)=>{text(doc,label,cx+5,y+8,{size:6,bold:true,color:COLORS.white,width:widths[index]-10});cx+=widths[index];});}
function reposicaoPages(doc,records,machines,start,end,page){
  const items=records.filter(isReposicao).sort((a,b)=>String(b.dateTime).localeCompare(String(a.dateTime))),x=34,widths=[66,54,92,430,72,60];
  const newPage=continuation=>{doc.addPage(PAGE_OPTIONS);header(doc,"Reposições por máquina",continuation?"Continuação":`${brDate(start)} a ${brDate(end)}`);};
  newPage(false);let y=91;
  const machineTotals=machines.map(machine=>{const own=items.filter(item=>item.machineId===machine.id);return {name:machine.name,count:own.length,meters:sum(own,"printLength")};}).filter(item=>item.count);
  text(doc,"RESUMO DAS REPOSIÇÕES",34,y,{size:8,bold:true,color:COLORS.blue,width:260});text(doc,`${items.length} registro(s)  |  ${number(sum(items,"printLength"))} m no total`,550,y,{size:9,bold:true,width:256,align:"right"});y+=22;
  if(machineTotals.length){const gap=8,w=(774-gap*(machineTotals.length-1))/machineTotals.length;machineTotals.forEach((item,index)=>{const bx=x+index*(w+gap);rounded(doc,bx,y,w,48,8,COLORS.soft);text(doc,item.name,bx+9,y+9,{size:7,bold:true,color:COLORS.muted,width:w-18});text(doc,`${item.count} reposição(ões)  |  ${number(item.meters)} m`,bx+9,y+27,{size:8,bold:true,width:w-18});});y+=62;}
  reposicaoHeader(doc,x,y,widths);y+=24;
  if(!items.length){text(doc,"Nenhuma reposição encontrada nos últimos 30 dias.",x,y+20,{size:10,color:COLORS.muted,width:774,align:"center"});footer(doc,page);return page;}
  items.forEach((item,index)=>{
    if(y+26>doc.page.height-58){footer(doc,page++);newPage(true);y=91;reposicaoHeader(doc,x,y,widths);y+=24;}
    let cx=x;doc.rect(x,y,774,26).fill(index%2?COLORS.soft:COLORS.white).stroke(COLORS.line);const values=[brDate(item.date),item.time||"-",item.machineName||"",item.task||"",`${number(item.printLength)} m`,item.cancelled?"Cancelado":item.error?"Erro":item.status||"Concluído"];
    values.forEach((value,i)=>{text(doc,value,cx+5,y+8,{size:i===3?6.5:7,bold:i===2,color:i===5&&(item.cancelled||item.error)?COLORS.orange:COLORS.text,width:widths[i]-10,lineBreak:false});cx+=widths[i];});y+=26;
  });footer(doc,page);return page;
}
function buildProductionReportPdf({records,machines,end,today}){
  const doc=new PDFDocument({size:"A4",layout:"landscape",margin:0,bufferPages:true,autoFirstPage:false,info:{Title:`Relatório de produção - ${end}`,Author:"Sublime — Central de Impressão"}});
  const definitions=[{label:"Dia",start:end,days:1},{label:"Últimos 7 dias",start:addDays(end,-6),days:7},{label:"Últimos 30 dias",start:addDays(end,-29),days:30}];
  doc.addPage(PAGE_OPTIONS);
  header(doc,"Relatório de produção",`Data de referência: ${brDate(end)}  |  ${machines.length} máquina(s)`);text(doc,"RESUMO EXECUTIVO",34,91,{size:8,bold:true,color:COLORS.blue,width:300});text(doc,"Indicadores calculados com trabalhos válidos. A parada é a média por máquina e os domingos não entram no tempo disponível.",34,107,{size:8,color:COLORS.muted,width:760});
  const gap=12,w=(doc.page.width-68-gap*2)/3,y=137,h=315;definitions.forEach((period,index)=>periodCard(doc,{...period,range:period.start===end?brDate(end):`${brDate(period.start)} a ${brDate(end)}`,data:summarize(records,period.start,end,period.days,machines.length,today)},34+index*(w+gap),y,w,h));footer(doc,1);
  const lastDetailPage=detailPage(doc,machines,definitions,records,end,today,2);
  reposicaoPages(doc,records,machines,addDays(end,-29),end,lastDetailPage+1);
  return doc;
}

module.exports={buildProductionReportPdf};
