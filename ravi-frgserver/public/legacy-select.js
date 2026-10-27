// Keep the native select as the source of truth so all existing validation,
// conditional fields, plate handlers and draft restoration keep working.
const searchKey=s=>s.normalize('NFKC').replace(/ي|ى/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u200c]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
let sequence=0;
const closeAll=(except=null)=>document.querySelectorAll('.searchable-select-field.is-picker-open').forEach(root=>{
 if(root===except)return;root.classList.remove('is-picker-open');root.querySelector('.searchable-select-trigger').setAttribute('aria-expanded','false');
});
document.addEventListener('click',event=>{if(!event.target.closest('.searchable-select-field'))closeAll()});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;const root=document.querySelector('.searchable-select-field.is-picker-open');
 if(root){event.preventDefault();event.stopImmediatePropagation();closeAll();root.querySelector('.searchable-select-trigger').focus()}
},true);
export function enhanceSelects(container){
 for(const select of container.querySelectorAll('select:not([multiple])')){
  if(select.closest('.searchable-select-field'))continue;
  const root=document.createElement('div');root.className='searchable-select-field';
  select.before(root);root.append(select);select.classList.add('legacy-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const id=select.id||`legacy-select-${++sequence}`;select.id=id;
  const label=select.labels?.[0]?.textContent||select.getAttribute('aria-label')||'انتخاب گزینه';
  root.insertAdjacentHTML('beforeend',`<button type="button" class="searchable-select-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="searchable-select-trigger-copy"></span><svg class="searchable-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="searchable-select-menu"><div class="searchable-select-search-wrap"><svg class="searchable-select-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" class="searchable-select-search" autocomplete="off" placeholder="جست‌وجو" aria-label="جست‌وجو در گزینه‌ها"></div><div class="searchable-select-options" role="listbox"></div><p class="searchable-select-empty" role="status" hidden>گزینه‌ای پیدا نشد.</p></div>`);
  const trigger=root.querySelector('.searchable-select-trigger'),copy=root.querySelector('.searchable-select-trigger-copy'),search=root.querySelector('input'),options=root.querySelector('[role=listbox]'),empty=root.querySelector('.searchable-select-empty');
  trigger.id=id+'-picker';options.id=id+'-options';options.setAttribute('aria-label',label);trigger.setAttribute('aria-controls',options.id);trigger.disabled=select.disabled;
  for(const nativeLabel of [...(select.labels||[])])nativeLabel.htmlFor=trigger.id;
  select.addEventListener('focus',()=>trigger.focus());
  const buttons=[...select.options].map(option=>{
   const button=document.createElement('button');button.type='button';button.className='searchable-select-option';button.setAttribute('role','option');button.tabIndex=-1;button.disabled=option.disabled;button.dataset.search=searchKey(option.textContent);
   const name=document.createElement('span');name.className='searchable-select-option-name';name.textContent=option.textContent;button.append(name);options.append(button);
   // A mouse press moves focus out of the search box before the click lands.
   // The focusout handler then closes the menu, and the click arrives at
   // nothing — the list could only be used with a keyboard. Holding focus
   // where it is keeps the menu open long enough for the click to happen.
   button.addEventListener('mousedown',event=>event.preventDefault());
   button.addEventListener('click',()=>{
    select.value=option.value;sync();closeAll();select.dispatchEvent(new Event('change',{bubbles:true}));
    // A change may render a new conditional page, so focus its replacement.
    (document.getElementById(id+'-picker')||document.getElementById(id))?.focus();
   });return button;
  });
  function sync(){copy.textContent=select.selectedOptions[0]?.textContent||'انتخاب کنید';trigger.setAttribute('aria-label',`${label}: ${copy.textContent}`);buttons.forEach((button,i)=>{button.classList.toggle('selected',select.options[i].selected);button.setAttribute('aria-selected',String(select.options[i].selected))})}
  function filter(){const query=searchKey(search.value);buttons.forEach(button=>button.hidden=!button.dataset.search.includes(query));empty.hidden=buttons.some(button=>!button.hidden)}
  function open(){closeAll(root);root.classList.add('is-picker-open');trigger.setAttribute('aria-expanded','true');search.value='';filter();search.focus()}
  trigger.addEventListener('click',()=>root.classList.contains('is-picker-open')?closeAll():open());
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open()}});
  search.addEventListener('input',filter);
  root.addEventListener('keydown',event=>{
   if(!root.classList.contains('is-picker-open')||!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key))return;
   if(event.key==='Enter'&&event.target!==search)return;
   if(['Home','End'].includes(event.key)&&event.target===search)return;
   const visible=buttons.filter(button=>!button.hidden&&!button.disabled);if(!visible.length)return;
   event.preventDefault();const index=visible.indexOf(document.activeElement);
   if(event.key==='Enter'){visible[0].click();return}
   const next=event.key==='Home'?0:event.key==='End'?visible.length-1:event.key==='ArrowUp'?(index<0?visible.length-1:Math.max(0,index-1)):Math.min(visible.length-1,index+1);visible[next].focus();
  });
  root.addEventListener('focusout',()=>queueMicrotask(()=>{if(root.isConnected&&!root.contains(document.activeElement))closeAll()}));
  select.addEventListener('change',sync);sync();
 }
}
