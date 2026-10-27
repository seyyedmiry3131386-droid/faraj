export const asciiDigits=value=>String(value??'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
export const numericInput=(value,max=20)=>asciiDigits(value).replace(/\D/g,'').slice(0,max);
export function normalizeFieldInput(field,value){return field?.numeric?numericInput(value,field.max):String(value).slice(0,field?.max||300)}
export function numericErrors(field,value){
 if(!String(value??'').trim())return [];
 const v=asciiDigits(value);
 if(!/^\d+$/.test(v)||(field.max&&v.length>field.max))return [`«${field.label}» فقط تا ${field.max} رقم می‌پذیرد.`];
 if(field.exact&&v.length!==field.exact)return [`«${field.label}» باید ${field.exact} رقم باشد؛ اگر نمی‌دانید خالی بگذارید.`];
 if(field.min!==undefined&&Number(v)<field.min||field.limit!==undefined&&Number(v)>field.limit)return [`مقدار «${field.label}» را بررسی کنید.`];
 return [];
}
