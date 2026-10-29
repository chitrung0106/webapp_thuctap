import type { CsvDocument, DataRow } from '../types/dataset';

// State survives chunk boundaries, including escaped quotes and CRLF pairs.
export function createCsvStreamParser() {
  const rows:DataRow[]=[];let delimiter='',probe='',field='',values:string[]=[],state='start',line=1,sourceLine=1,pending=false,skipLF=false,first=true,nonWhitespace=false;
  function finishField(){values.push(field);field='';state='start';}
  function finishRow(){finishField();rows.push({id:rows.length,sourceLine,values});values=[];pending=false;}
  function consume(text:string){for(const char of text){
    if(skipLF){skipLF=false;if(char==='\n')continue;}
    if(char==='\0')throw Error('Tệp chứa dữ liệu nhị phân, không phải CSV văn bản UTF-8.');
    if(char.trim())nonWhitespace=true;
    if(state==='quoted'){
      if(char==='"')state='closed';
      else if(char==='\r'||char==='\n'){field+='\n';line++;skipLF=char==='\r';}
      else field+=char;
      pending=true;continue;
    }
    if(state==='closed'&&char==='"'){field+='"';state='quoted';pending=true;continue;}
    if(char===delimiter){finishField();pending=true;continue;}
    if(char==='\r'||char==='\n'){finishRow();line++;sourceLine=line;skipLF=char==='\r';continue;}
    if(state==='closed')throw Error(`CSV sai ở dòng ${line}: có ký tự sau dấu nháy đóng.`);
    if(char==='"'){if(state!=='start')throw Error(`CSV sai ở dòng ${line}: dấu nháy phải nằm đầu ô dữ liệu.`);state='quoted';}
    else{field+=char;state='plain';}pending=true;
  }}
  const counts=[0,0,0],separators=[',',';','\t'];let probeQuoted=false,probeQuotePending=false;
  function chooseDelimiter(){delimiter=separators[counts.indexOf(Math.max(...counts))];const text=probe;probe='';consume(text);}
  function detect(text:string){for(const c of text){
    if(c==='"'){if(probeQuoted){probeQuotePending=!probeQuotePending;}else{probeQuoted=true;probeQuotePending=false;}continue;}
    if(probeQuotePending){probeQuoted=false;probeQuotePending=false;}
    if(!probeQuoted){if(c==='\n'||c==='\r'){chooseDelimiter();return;}const j=separators.indexOf(c);if(j>=0)counts[j]++;}
  }}
  return {
    push(text:string){if(first&&text.length){text=text.replace(/^\uFEFF/,'');first=false;}if(!delimiter){probe+=text;detect(text);}else consume(text);},
    finish():CsvDocument{if(!delimiter)chooseDelimiter();if(!nonWhitespace)throw Error('Tệp CSV trống, vui lòng chọn tệp có dữ liệu.');if(state==='quoted')throw Error(`CSV sai: ô bắt đầu ở dòng ${sourceLine} chưa đóng dấu nháy.`);if(pending||values.length)finishRow();
      const columnCount=rows[0].values.length;let paddedRows=0;for(const row of rows){if(row.values.length>columnCount)throw Error(`Dòng ${row.sourceLine} có ${row.values.length} cột, trong khi dòng đầu có ${columnCount}. Kiểm tra dấu phân cách hoặc dấu nháy.`);if(row.values.length<columnCount){paddedRows++;row.values.push(...Array<string>(columnCount-row.values.length).fill(''));}}
      return{rows,columnCount,delimiter,paddedRows};}
  };
}
