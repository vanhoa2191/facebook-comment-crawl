(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.CommentSheet=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const enc=new TextEncoder();
function xml(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));}
function col(n){let s="";for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function create(sheets){const data=[];const ss=(Array.isArray(sheets)?sheets:[]).slice(0,8).map((s,i)=>({name:String(s.name||("Sheet"+(i+1))).replace(/[\[\]:*?\/\\]/g," ").slice(0,31),rows:(s.rows||[]).slice(0,50001)}));if(!ss.length)ss.push({name:"Data",rows:[]});
const sheetNames=ss.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("");
const relationships=ss.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("");
const overrides=ss.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("");
data.push(["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+overrides+'</Types>']);
data.push(["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
data.push(["xl/workbook.xml",'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheetNames+'</sheets></workbook>']);
data.push(["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+relationships+'</Relationships>']);
ss.forEach((s,i)=>{let rows="";s.rows.forEach((r,ri)=>{let cells="";(Array.isArray(r)?r:[]).slice(0,50).forEach((v,ci)=>{cells+='<c r="'+col(ci)+(ri+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';});rows+='<row r="'+(ri+1)+'">'+cells+'</row>';});data.push(["xl/worksheets/sheet"+(i+1)+".xml",'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows+'</sheetData></worksheet>']);});
const local=[],central=[];let offset=0;data.forEach(([name,content])=>{const nb=enc.encode(name),db=enc.encode(content),sum=crc(db),lh=new Uint8Array(30+nb.length),lv=new DataView(lh.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint32(14,sum,true);lv.setUint32(18,db.length,true);lv.setUint32(22,db.length,true);lv.setUint16(26,nb.length,true);lh.set(nb,30);local.push(lh,db);const ch=new Uint8Array(46+nb.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,sum,true);cv.setUint32(20,db.length,true);cv.setUint32(24,db.length,true);cv.setUint16(28,nb.length,true);cv.setUint32(42,offset,true);ch.set(nb,46);central.push(ch);offset+=lh.length+db.length;});const centralSize=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22),dv=new DataView(end.buffer);dv.setUint32(0,0x06054b50,true);dv.setUint16(8,data.length,true);dv.setUint16(10,data.length,true);dv.setUint32(12,centralSize,true);dv.setUint32(16,offset,true);const parts=local.concat(central,[end]),size=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(size);let pos=0;parts.forEach(b=>{out.set(b,pos);pos+=b.length;});return new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});}

async function inflateRaw(bytes){if(typeof DecompressionStream!=="function")throw Error("Trình duyệt chưa hỗ trợ đọc XLSX nén; hãy lưu Excel thành CSV UTF-8.");try{return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());}catch(_){throw Error("Không giải nén được XLSX. Hãy lưu Excel thành CSV UTF-8 rồi nhập lại.");}}
async function readXlsx(file){
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);
 const min=Math.max(0,bytes.length-65557);let eocd=-1;
 for(let i=bytes.length-22;i>=min;i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
 if(eocd<0)throw Error("Tệp không phải XLSX hợp lệ.");
 const count=view.getUint16(eocd+10,true),directory=view.getUint32(eocd+16,true);
 if(count>1000)throw Error("XLSX có quá nhiều thành phần.");
 const entries=new Map();let cursor=directory;
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)throw Error("Cấu trúc ZIP của XLSX không hợp lệ.");
  const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressedSize=view.getUint32(cursor+20,true),expandedSize=view.getUint32(cursor+24,true);
  const nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true),localOffset=view.getUint32(cursor+42,true);
  const name=new TextDecoder().decode(bytes.slice(cursor+46,cursor+46+nameLength));cursor+=46+nameLength+extraLength+commentLength;
  if(flags&1)throw Error("Không hỗ trợ XLSX được mã hóa bằng mật khẩu.");
  if(expandedSize>20000000||localOffset+30>bytes.length)throw Error("Thành phần XLSX vượt quá giới hạn.");
  const localNameLength=view.getUint16(localOffset+26,true),localExtraLength=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLength+localExtraLength;
  if(start+compressedSize>bytes.length)throw Error("Dữ liệu XLSX bị cắt hoặc hỏng.");
  const compressed=bytes.slice(start,start+compressedSize);let content;
  if(method===0)content=compressed;else if(method===8)content=await inflateRaw(compressed);else throw Error("XLSX dùng kiểu nén chưa hỗ trợ.");
  if(content.length>20000000)throw Error("Một thành phần XLSX vượt quá 20 MB.");
  entries.set(name,content);
 }
 const decoder=new TextDecoder();
 function xml(path){const raw=entries.get(path);if(!raw)return null;const doc=new DOMParser().parseFromString(decoder.decode(raw),"application/xml");if(doc.getElementsByTagName("parsererror").length)throw Error("XML trong XLSX không hợp lệ.");return doc;}
 const workbook=xml("xl/workbook.xml");if(!workbook)throw Error("Không tìm thấy workbook.");
 const sheet=workbook.getElementsByTagName("sheet")[0];if(!sheet)throw Error("Workbook không có sheet.");
 const relationId=sheet.getAttribute("r:id")||sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
 const relations=xml("xl/_rels/workbook.xml.rels");let target="worksheets/sheet1.xml";
 if(relations){for(const rel of Array.from(relations.getElementsByTagName("Relationship"))){if(rel.getAttribute("Id")===relationId){target=rel.getAttribute("Target")||target;break;}}}
 target=target.replace(/^\/+/,"");if(!target.startsWith("xl/"))target="xl/"+target.replace(/^(\.\.\/)+/,"");
 const worksheet=xml(target);if(!worksheet)throw Error("Không tìm thấy worksheet đầu tiên.");
 const sharedDoc=xml("xl/sharedStrings.xml"),shared=[];
 if(sharedDoc){for(const item of Array.from(sharedDoc.getElementsByTagName("si"))){shared.push(Array.from(item.getElementsByTagName("t")).map(n=>n.textContent||"").join(""));}}
 function columnIndex(ref){const m=String(ref||"").match(/^[A-Z]+/i);if(!m)return 0;let n=0;for(const ch of m[0].toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1;}
 const output=[];
 for(const rowNode of Array.from(worksheet.getElementsByTagName("row")).slice(0,50001)){
  const row=[];
  for(const cell of Array.from(rowNode.getElementsByTagName("c"))){const index=columnIndex(cell.getAttribute("r"));if(index>=50)continue;const type=cell.getAttribute("t");let value="";
   if(type==="inlineStr")value=Array.from(cell.getElementsByTagName("t")).map(n=>n.textContent||"").join("");
   else{const v=cell.getElementsByTagName("v")[0];value=v?v.textContent||"":"";if(type==="s")value=shared[Number(value)]||"";else if(type==="b")value=value==="1"?"TRUE":"FALSE";}
   row[index]=value;
  }
  for(let i=0;i<Math.min(50,row.length);i++)if(row[i]===undefined)row[i]="";
  if(row.some(value=>String(value||"").trim()))output.push(row);
 }
 return output;
}

return {create,readXlsx};});