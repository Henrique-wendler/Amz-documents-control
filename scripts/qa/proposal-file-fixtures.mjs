import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
export const pdf=()=>{const head='%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';return Buffer.from(head+`xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Root 1 0 R /Size 2 >>\nstartxref\n${Buffer.byteLength(head)}\n%%EOF\n`);};
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
export function xlsx(extra={},compressed=true){
 const entries={'[Content_Types].xml':'<Types><Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
 '_rels/.rels':'<Relationships><Relationship Type="officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook><sheets/></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet><sheetData/></worksheet>',...extra};
 let offset=0;const locals=[],centers=[];
 for(const[name,text]of Object.entries(entries)){
  const key=Buffer.from(name),data=Buffer.from(text),body=compressed?deflateRawSync(data):data,crc=crc32(data),method=compressed?8:0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(key.length,26);
  const center=Buffer.alloc(46);center.writeUInt32LE(0x02014b50);center.writeUInt16LE(20,6);center.writeUInt16LE(method,10);center.writeUInt32LE(crc,16);center.writeUInt32LE(body.length,20);center.writeUInt32LE(data.length,24);center.writeUInt16LE(key.length,28);center.writeUInt32LE(offset,42);
  locals.push(local,key,body);centers.push(center,key);offset+=local.length+key.length+body.length;
 }
 const central=Buffer.concat(centers),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,central,end]);
}
