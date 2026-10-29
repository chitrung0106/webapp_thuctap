import {createCsvStreamParser} from '../utils/csvStream';
self.onmessage=async({data}:{data:{file:File}})=>{
  try{const file=data.file,parser=createCsvStreamParser(),decoder=new TextDecoder('utf-8',{fatal:true});const size=512*1024;
    for(let offset=0;offset<file.size;offset+=size){let text:string;try{text=decoder.decode(await file.slice(offset,offset+size).arrayBuffer(),{stream:true});}catch{throw Error('Tệp CSV phải dùng mã hóa UTF-8. Hãy lưu lại bằng UTF-8 rồi chọn lại.');}parser.push(text);self.postMessage({progress:Math.min(file.size,offset+size),total:file.size});}
    let tail:string;try{tail=decoder.decode();}catch{throw Error('Tệp CSV phải dùng mã hóa UTF-8. Hãy lưu lại bằng UTF-8 rồi chọn lại.');}parser.push(tail);self.postMessage({document:parser.finish()});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:'Không thể đọc CSV.'});}
};
