// YG Studio preview widget - self-serve edit mode + suggest-a-note mode + guided tour
(function(){

  // Load YG fonts
  if(!document.getElementById('yg-fonts')){
    var fl=document.createElement('link');
    fl.id='yg-fonts'; fl.rel='stylesheet';
    fl.href='https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=Instrument+Serif:ital@0;1&display=swap';
    document.head.appendChild(fl);
  }

  // Brand tokens
  var P='#6d4deb',P2='#5b3dd4',PD='#4c1d95',PT='#f5f2ff',PS='#8b7cf6',
      BK='#0a0a0a',GR='#737373',BG='#fafafa',BD='#e5e5e5',
      FF='DM Sans,system-ui,sans-serif',FS='Instrument Serif,Georgia,serif';

  // API + ref
  var API='https://wyrframeweb.netlify.app';
  var REF=(window.__YG_REF||'DEMO');
  var DEMO=(REF==='DEMO');
  // Post-submission client edit loop is retired: the Cloudflare preview is a
  // clean read-only site. READONLY gates every editing/note/tour surface below;
  // the data-route nav handler above is the only interactive part that still runs.
  var READONLY=true;

  // Injected styles: tour anim + edit-mode affordances (classes, so element
  // style attributes stay clean for outerHTML capture).
  if(!document.getElementById('yg-style')){
    var st=document.createElement('style'); st.id='yg-style';
    st.textContent=
      '@keyframes yg-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
      +'.yg-editable{outline:1px dashed rgba(139,124,246,.55)!important;outline-offset:2px;cursor:pointer!important}'
      +'.yg-editable:hover{outline:2px solid '+PS+'!important}'
      +'.yg-elsel{outline:2px solid '+P+'!important;outline-offset:2px}'
      +'.yg-imgedit{cursor:pointer!important;outline:2px solid '+PS+'!important;outline-offset:2px}'
      +'.yg-secsel{outline:2px solid '+P+'!important;outline-offset:-2px}'
      +'.yg-tophidden{padding-top:46px!important}';
    document.head.appendChild(st);
  }

  // Nav routing (suppressed in edit mode so nav text becomes editable)
  document.addEventListener('click',function(e){
    if(editMode) return;
    var t=e.target&&e.target.closest?e.target.closest('[data-route]'):null;
    if(!t) return;
    e.preventDefault();
    window.location.href=t.getAttribute('data-route');
  });
  document.querySelectorAll('[data-route]').forEach(function(el){ el.style.cursor='pointer'; });

  // Jump-to-section: the client preview page (wyrframeweb.netlify.app/preview/<token>)
  // embeds this site in an iframe and posts {type:'yg-jump', section} when a note is
  // clicked. Runs even in READONLY — it's just scroll + a brief highlight, no editing.
  if(!document.getElementById('yg-jump-style')){
    var jst=document.createElement('style'); jst.id='yg-jump-style';
    jst.textContent='.yg-jump-flash{animation:ygJumpFlash 1.6s ease}'
      +'@keyframes ygJumpFlash{0%,100%{box-shadow:inset 0 0 0 0 rgba(109,77,235,0)}15%{box-shadow:inset 0 0 0 4px rgba(109,77,235,.9)}}';
    document.head.appendChild(jst);
  }
  window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.type!=='yg-jump'||!d.section) return;
    var el=document.querySelector('[data-section="'+d.section+'"]');
    if(!el) return;
    el.scrollIntoView({behavior:'smooth',block:'start'});
    el.classList.remove('yg-jump-flash'); void el.offsetWidth; el.classList.add('yg-jump-flash');
  });

  var PAGE_LABELS={
    home:'Home',index:'Home',services:'Services','our-work':'Our Work',
    quote:'Get a Quote',contact:'Contact',
    'index.html':'Home','services.html':'Services','contact.html':'Contact'
  };
  var SECTION_LABELS={
    nav:'Navigation',welcome:'Hero','trust-bar':'Trust Bar',
    about:'About / Process',services:'Services',gallery:'Gallery',
    trust:'Testimonials',faq:'FAQ',cta:'Call to Action',footer:'Footer'
  };
  // 6 categories: things the client CANNOT do in Edit page themselves.
  // Text, spelling, colour, image and section removal are now self-serve.
  var CATEGORIES=[
    {id:'layout',      label:'Change the layout'},
    {id:'add-section', label:'Add a new section'},
    {id:'add-page',    label:'Add or remove a page'},
    {id:'style',       label:'Change the overall style'},
    {id:'content',     label:'Add more copy / content'},
    {id:'other',       label:'Something else'}
  ];

  var feedbackMode=false,draft=[],activeSection=null,popover=null,sending=false;

  function currentPage(){
    var p=window.location.pathname.split('/').pop()||'index.html';
    return (p===''||p==='demo-site')?'home':p.replace('.html','')||'home';
  }
  function pageLabel(k){ return PAGE_LABELS[k]||PAGE_LABELS[k+'.html']||k; }
  function sectionLabel(k){ return SECTION_LABELS[k]||k; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function loadDraft(){ try{ var s=localStorage.getItem('yg-draft'); if(s) draft=JSON.parse(s); }catch(e){} }
  function saveDraft(){ try{ localStorage.setItem('yg-draft',JSON.stringify(draft)); }catch(e){} }
  function clearDraft(){ try{ localStorage.removeItem('yg-draft'); }catch(e){} }
  loadDraft();

  // Scrim (tour)
  var scrim=document.createElement('div');
  scrim.style.cssText='display:none;position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,0.52);pointer-events:none;transition:opacity .2s';
  document.body.appendChild(scrim);

  function tourLock(on){
    scrim.style.pointerEvents=on?'all':'none';
    scrim.style.cursor=on?'default':'';
    helpBtn.style.pointerEvents=on?'none':'';
    if(topbar) topbar.style.pointerEvents=on?'none':'';
    // miniBar and secBar float above the scrim, so lock them explicitly too
    if(miniBar) miniBar.style.pointerEvents=on?'none':'';
    if(secBar) secBar.style.pointerEvents=on?'none':'';
  }

  // ============================ NOTE MODE (Tier 2) ============================
  // Instruction strip — sits just below the persistent top bar, shown only while
  // notes mode is active. The mode is toggled from the top bar, not a floating button.
  var banner=document.createElement('div');
  banner.style.cssText='display:none;position:fixed;top:46px;left:0;right:0;z-index:99996;background:'+P+';color:#fff;font-family:'+FF+';font-size:13px;font-weight:600;text-align:center;padding:9px 48px;letter-spacing:.01em;box-shadow:0 2px 8px rgba(109,77,235,.3)';
  banner.textContent="Click any section on the page to add a note.";
  document.body.appendChild(banner);

  // Float-free: the "Suggest changes" toggle now lives in the persistent top bar.
  // updateTriggerLabel is kept as a thin alias so existing call sites stay valid.
  function updateTriggerLabel(){ updateTopbar(); }

  var helpBtn=document.createElement('button');
  helpBtn.type='button'; helpBtn.title='How to use this';
  helpBtn.style.cssText='position:fixed;bottom:20px;right:20px;z-index:99999;background:#fff;color:'+P+';border:2px solid '+P+';border-radius:999px;width:40px;height:40px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(109,77,235,.2);font-family:'+FF+';display:flex;align-items:center;justify-content:center;transition:all .15s';
  helpBtn.textContent='?';
  helpBtn.addEventListener('mouseenter',function(){ this.style.background=PT; });
  helpBtn.addEventListener('mouseleave',function(){ this.style.background='#fff'; });
  helpBtn.addEventListener('click',function(){ replayTour(); });
  // Read-only preview: no editing tour, so no floating help launcher.
  if(!READONLY) document.body.appendChild(helpBtn);

  var draftPanel=document.createElement('div');
  draftPanel.style.cssText='display:none;position:fixed;bottom:72px;right:20px;z-index:99999;width:320px;max-width:90vw;background:#fff;border:1px solid '+BD+';border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.14);font-family:'+FF+';color:'+BK+';overflow:hidden';
  document.body.appendChild(draftPanel);

  function renderDraftPanel(){
    if(!feedbackMode){ draftPanel.style.display='none'; return; }
    draftPanel.style.display='block';
    var body=draft.length===0
      ? '<p style="font-size:13px;color:'+GR+';margin:0;padding:16px">No notes yet - click any section on the page above.</p>'
      : draft.map(function(item,i){
          return '<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-bottom:1px solid #f5f5f5">'
            +'<div style="flex:1;min-width:0">'
            +'<span style="font-size:10px;font-weight:700;color:'+P+';letter-spacing:.05em;text-transform:uppercase">'+pageLabel(item.page)+' - '+sectionLabel(item.section)+' ('+item.category+')</span>'
            +'<p style="font-size:12px;color:'+BK+';margin:3px 0 0;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">"'+esc(item.detail)+'"</p>'
            +'</div>'
            +'<button data-remove="'+i+'" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:#c4b5fd;font-size:17px;padding:0;line-height:1" title="Remove">x</button>'
            +'</div>';
        }).join('');
    var footer=draft.length>0
      ? '<div style="padding:12px 14px">'
          +'<p style="font-size:12px;color:'+GR+';margin:0;line-height:1.5">Tap &times; to remove a note. When you\'re ready, hit <b>Submit to YG Studio</b> in the top bar.</p>'
        +'</div>'
      : '';
    draftPanel.innerHTML=
      '<div style="background:'+BK+';padding:13px 16px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-size:13px;font-weight:700;color:#fff;font-family:'+FF+'">Your notes'+(draft.length?' ('+draft.length+')':'')+'</span>'
        +'<button id="yg-close-panel" style="background:none;border:none;cursor:pointer;font-size:19px;color:rgba(255,255,255,.5);padding:0;line-height:1" title="Close">x</button>'
      +'</div>'+body+footer;
    draftPanel.querySelector('#yg-close-panel').addEventListener('click',exitFeedbackMode);
    draftPanel.querySelectorAll('[data-remove]').forEach(function(btn){
      btn.addEventListener('click',function(){
        draft.splice(parseInt(btn.getAttribute('data-remove')),1);
        saveDraft(); renderDraftPanel(); updateTopbar();
      });
    });
  }

  var toast=null;
  function showToast(msg){
    if(toast){ toast.remove(); toast=null; }
    toast=document.createElement('div');
    toast.style.cssText='position:fixed;bottom:20px;left:20px;z-index:99999;background:'+BK+';color:#fff;font-family:'+FF+';font-size:13px;font-weight:500;padding:11px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:yg-in .2s ease;pointer-events:none;max-width:260px;line-height:1.4';
    toast.textContent=msg; document.body.appendChild(toast);
    setTimeout(function(){ if(toast){ toast.remove(); toast=null; } },3000);
  }

  function showPopover(sectionEl){
    closePopover();
    activeSection=sectionEl;
    sectionEl.style.outline='2px solid '+P; sectionEl.style.outlineOffset='-2px';
    document.querySelectorAll('[data-section]').forEach(function(el){ if(el!==sectionEl) el.style.opacity='0.3'; });
    var sk=sectionEl.getAttribute('data-section')||'',pk=currentPage(),selCat=null;
    popover=document.createElement('div'); popover.id='yg-popover';
    popover.style.cssText='position:absolute;z-index:100000;width:292px;max-width:92vw;background:#fff;border:1px solid '+BD+';border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.14);padding:16px;font-family:'+FF+';color:'+BK;
    var rect=sectionEl.getBoundingClientRect();
    var top=Math.min(rect.top+window.scrollY+12,window.scrollY+window.innerHeight-460); top=Math.max(top,window.scrollY+64);
    var left=Math.min(rect.left+12,window.innerWidth-312); left=Math.max(left,8);
    popover.style.top=top+'px'; popover.style.left=left+'px';
    var chips=CATEGORIES.map(function(c,i){
      var span='';
      return '<button data-cat="'+c.id+'" style="'+span+'display:block;text-align:center;padding:8px 0;border-radius:8px;border:1px solid '+BD+';background:'+BG+';font-size:12px;font-weight:500;cursor:pointer;font-family:'+FF+';transition:all .1s;width:100%">'+c.label+'</button>';
    }).join('');
    popover.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        +'<span style="font-size:11px;font-weight:700;color:'+P+';letter-spacing:.05em;text-transform:uppercase">'+pageLabel(pk)+' - '+sectionLabel(sk)+'</span>'
        +'<button id="yg-pop-x" style="background:none;border:none;cursor:pointer;font-size:18px;color:#c4b5fd;padding:0;line-height:1" title="Cancel">x</button>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">'+chips+'</div>'
      +'<textarea id="yg-pop-ta" rows="3" placeholder="Describe the change in your own words..." style="width:100%;box-sizing:border-box;resize:vertical;border:1px solid '+BD+';border-radius:10px;padding:9px 12px;font-size:13px;font-family:'+FF+';margin-bottom:4px;display:block;outline:none;transition:border-color .15s"></textarea>'
      +'<p style="font-size:11px;color:'+GR+';margin:0 0 10px;line-height:1.4">Keep it simple, e.g. "Make the headline bigger"</p>'
      +'<div id="yg-pop-err" style="display:none;color:#dc2626;font-size:12px;margin-bottom:8px">Please pick a category and describe the change.</div>'
      +'<button id="yg-pop-add" style="width:100%;background:'+P+';color:#fff;border:none;border-radius:10px;padding:10px 0;font-size:13px;font-weight:600;cursor:pointer;font-family:'+FF+';transition:background .15s">Add note</button>';
    document.body.appendChild(popover);
    var ta=popover.querySelector('#yg-pop-ta');
    ta.addEventListener('focus',function(){ this.style.borderColor=P; });
    ta.addEventListener('blur',function(){ this.style.borderColor=BD; });
    popover.querySelector('#yg-pop-x').addEventListener('click',function(){ closePopover(); tourDismissPopover(); });
    var addBtn=popover.querySelector('#yg-pop-add');
    addBtn.addEventListener('mouseenter',function(){ this.style.background=P2; });
    addBtn.addEventListener('mouseleave',function(){ this.style.background=P; });
    popover.querySelectorAll('[data-cat]').forEach(function(btn){
      btn.addEventListener('mouseenter',function(){ if(!btn.classList.contains('sel')){ btn.style.background=PT; btn.style.borderColor=PS; } });
      btn.addEventListener('mouseleave',function(){ if(!btn.classList.contains('sel')){ btn.style.background=BG; btn.style.borderColor=BD; } });
      btn.addEventListener('click',function(){
        selCat=btn.getAttribute('data-cat');
        popover.querySelectorAll('[data-cat]').forEach(function(b){ b.classList.remove('sel'); b.style.background=BG; b.style.borderColor=BD; b.style.color=BK; b.style.fontWeight='500'; });
        btn.classList.add('sel'); btn.style.background=P; btn.style.borderColor=P; btn.style.color='#fff'; btn.style.fontWeight='700';
      });
    });
    addBtn.addEventListener('click',function(){
      var detail=(popover.querySelector('#yg-pop-ta').value||'').trim();
      if(!selCat||!detail){ popover.querySelector('#yg-pop-err').style.display='block'; return; }
      draft.push({page:pk,section:sk,category:selCat,detail:detail});
      saveDraft(); closePopover(); renderDraftPanel(); updateTriggerLabel();
      showToast('Note added. Click any other section to add another.');
    });
    setTimeout(function(){ document.addEventListener('click',outsideClick); },0);
    tourOnSectionClicked();
  }
  function outsideClick(e){ if(popover&&!popover.contains(e.target)&&e.target!==activeSection){ closePopover(); tourDismissPopover(); } }
  function closePopover(){
    if(popover){ popover.remove(); popover=null; }
    if(activeSection){ activeSection.style.outline=''; activeSection.style.outlineOffset=''; activeSection=null; }
    document.querySelectorAll('[data-section]').forEach(function(el){ el.style.opacity=''; });
    document.removeEventListener('click',outsideClick);
  }
  function onEnter(){ if(feedbackMode&&this!==activeSection){ this.style.outline='2px dashed '+P; this.style.outlineOffset='-2px'; } }
  function onLeave(){ if(this!==activeSection){ this.style.outline=''; this.style.outlineOffset=''; } }
  function onClick(e){ if(!feedbackMode) return; e.stopPropagation(); showPopover(this); }
  function attach(){ document.querySelectorAll('[data-section]').forEach(function(el){ el.style.cursor='pointer'; el.addEventListener('mouseenter',onEnter); el.addEventListener('mouseleave',onLeave); el.addEventListener('click',onClick); }); }
  function detach(){ document.querySelectorAll('[data-section]').forEach(function(el){ el.style.cursor=''; el.style.outline=''; el.style.outlineOffset=''; el.removeEventListener('mouseenter',onEnter); el.removeEventListener('mouseleave',onLeave); el.removeEventListener('click',onClick); }); }

  function enterFeedbackMode(){
    if(editMode) exitEditMode();
    feedbackMode=true;
    banner.style.display='block'; attach(); renderDraftPanel(); updateTopbar();
    sessionStorage.setItem('yg-fb-mode','1');
  }
  function exitFeedbackMode(){
    feedbackMode=false; sending=false; closePopover(); detach();
    banner.style.display='none'; draftPanel.style.display='none'; updateTopbar();
    sessionStorage.setItem('yg-fb-mode','0');
  }
  function toggleFeedbackMode(){ if(feedbackMode) exitFeedbackMode(); else enterFeedbackMode(); }

  // No beforeunload guard: draft + edits are persisted to localStorage on every
  // change (loadDraft/loadEdits restore them on the next page), so page-to-page
  // nav and tab-close lose nothing. The prompt only fired as a false alarm.

  // ============================ EDIT MODE (Tier 1) ============================
  var editMode=false,edits=[],editTray=null,topbar=null,
      selEl=null,selSec=null,miniBar=null,secBar=null,colourPanel=null;

  function loadEdits(){ try{ var s=localStorage.getItem('yg-edits'); if(s) edits=JSON.parse(s); }catch(e){} }
  function saveEdits(){ try{ localStorage.setItem('yg-edits',JSON.stringify(edits)); }catch(e){} }
  function clearEdits(){ try{ localStorage.removeItem('yg-edits'); }catch(e){} }
  loadEdits();

  function findOp(pred){ for(var i=0;i<edits.length;i++) if(pred(edits[i])) return edits[i]; return null; }
  function persist(){ saveEdits(); updateTopbar(); renderEditTray(); }
  function reHex(h){ return new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); }

  // Strip edit chrome so captured outerHTML is the clean, deployable markup.
  function stripYg(node){
    if(node.removeAttribute){ node.removeAttribute('contenteditable'); node.removeAttribute('spellcheck'); node.removeAttribute('data-yg-id'); node.removeAttribute('data-yg-before'); }
    if(node.classList){ ['yg-editable','yg-elsel','yg-imgedit','yg-secsel'].forEach(function(c){ node.classList.remove(c); }); if(node.classList.length===0&&node.getAttribute&&node.getAttribute('class')!==null) node.removeAttribute('class'); }
  }
  function cleanOuterHTML(el){
    var c=el.cloneNode(true); stripYg(c);
    if(c.querySelectorAll) c.querySelectorAll('[contenteditable],[data-yg-id],.yg-editable,.yg-elsel').forEach(stripYg);
    return c.outerHTML;
  }

  var EDIT_TAGS='h1,h2,h3,h4,h5,h6,p,li,button,span,a,cite,blockquote,td,label,div';
  function isLeaf(el){
    if(!el||!el.matches) return false;
    if(!el.matches(EDIT_TAGS)) return false;
    if(el.children.length) return false;
    if(!el.textContent.trim()) return false;
    if(!el.closest('[data-section]')) return false;
    return true;
  }

  // updateEditLabel kept as a thin alias — the edit toggle now lives in the top bar.
  function updateEditLabel(){ updateTopbar(); }
  function toggleEditMode(){ editMode?exitEditMode():enterEditMode(); }

  // ---- Persistent top bar ----
  // Built once on load and always visible. Houses page tabs, the Edit content /
  // Suggest changes toggles, contextual edit tools, a combined counter and the
  // single "Submit to YG Studio" button that flushes both edits and notes.
  function buildTopbar(){
    if(topbar) return;
    topbar=document.createElement('div');
    topbar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99997;background:#fff;border-bottom:1px solid '+BD+';box-shadow:0 2px 10px rgba(0,0,0,.06);font-family:'+FF+';min-height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;gap:12px';
    document.body.appendChild(topbar);
    document.body.classList.add('yg-tophidden');
  }
  function pagesFromNav(){
    var seen={},out=[];
    document.querySelectorAll('[data-section="nav"] [data-route]').forEach(function(a){
      var r=a.getAttribute('data-route'); if(!r||seen[r]) return; seen[r]=1;
      out.push({route:r,label:(a.textContent||'').trim()||r});
    });
    return out;
  }
  function updateTopbar(){
    if(!topbar) return;
    var pages=pagesFromNav();
    var curRoute=window.location.pathname.split('/').pop()||'index.html';
    var isHome=(curRoute==='index.html'||curRoute===''||curRoute==='home');
    var sw=pages.map(function(p){
      var active=(p.route===curRoute);
      return '<button data-go="'+esc(p.route)+'" style="background:'+(active?P:'#fff')+';color:'+(active?'#fff':BK)+';border:1px solid '+(active?P:BD)+';border-radius:7px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'+FF+'">'+esc(p.label)+'</button>';
    }).join('');
    var fsStyle='background:none;color:'+GR+';border:1px solid '+BD+';border-radius:6px;padding:5px 8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'+FF;
    // Mode toggle styling — filled purple when that mode is active.
    function toggle(id,label,on){
      return '<button id="'+id+'" style="background:'+(on?P:'#fff')+';color:'+(on?'#fff':P)+';border:1px solid '+P+';border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:'+FF+';white-space:nowrap;flex-shrink:0">'+label+'</button>';
    }
    // Edit-mode-only contextual tools.
    var editTools = editMode
      ? '<button id="yg-tb-addpage" title="Add a page" style="background:none;color:'+P+';border:1px dashed '+PS+';border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:'+FF+';white-space:nowrap;flex-shrink:0">+ Page</button>'
        +(!isHome?'<button id="yg-tb-removepage" title="Remove this page" style="background:none;color:#ef4444;border:1px solid #fecaca;border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:'+FF+';white-space:nowrap;flex-shrink:0">Remove page</button>':'')
        +'<button id="yg-tb-fsm" title="Smaller text" style="'+fsStyle+'">Aa-</button>'
        +'<button id="yg-tb-fsp" title="Bigger text" style="'+fsStyle+'">Aa+</button>'
        +(edits.length>0?'<button id="yg-tb-undo" title="Undo last change" style="background:none;color:'+GR+';border:1px solid '+BD+';border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'+FF+'">Undo</button>':'')
      : '';
    // Combined counter — "N change(s) · M note(s)".
    var parts=[];
    if(edits.length) parts.push(edits.length+' change'+(edits.length===1?'':'s'));
    if(draft.length) parts.push(draft.length+' note'+(draft.length===1?'':'s'));
    var countLabel=parts.length?parts.join(' · '):'No changes yet';
    topbar.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden">'
        +'<span style="font-size:12px;font-weight:800;color:'+P+';white-space:nowrap">YG Studio</span>'
        +'<div style="display:flex;gap:6px;overflow:auto">'+sw+'</div>'
        +editTools
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'
        +toggle('yg-tb-edit','Edit content',editMode)
        +toggle('yg-tb-suggest','Suggest changes',feedbackMode)
        +'<button id="yg-tb-count" style="background:'+PT+';color:'+P+';border:none;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:'+FF+';white-space:nowrap">'+countLabel+'</button>'
        +'<button id="yg-tb-submit" style="background:'+BK+';color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:'+FF+';white-space:nowrap">Submit to YG Studio &rarr;</button>'
      +'</div>';
    topbar.querySelectorAll('[data-go]').forEach(function(b){ b.addEventListener('click',function(){ window.location.href=b.getAttribute('data-go'); }); });
    topbar.querySelector('#yg-tb-edit').addEventListener('click',toggleEditMode);
    topbar.querySelector('#yg-tb-suggest').addEventListener('click',toggleFeedbackMode);
    topbar.querySelector('#yg-tb-submit').addEventListener('click',submitAll);
    topbar.querySelector('#yg-tb-count').addEventListener('click',function(){
      if(feedbackMode){ renderDraftPanel(); }
      else if(editMode){ trayOpen=!trayOpen; renderEditTray(); }
    });
    if(editMode){
      var undoBtn=topbar.querySelector('#yg-tb-undo');
      if(undoBtn){ undoBtn.addEventListener('click',function(){ if(edits.length>0) undoOp(edits.length-1); }); }
      topbar.querySelector('#yg-tb-addpage').addEventListener('click',addPage);
      var rpBtn=topbar.querySelector('#yg-tb-removepage');
      if(rpBtn){ rpBtn.addEventListener('click',removePage); }
      topbar.querySelector('#yg-tb-fsm').addEventListener('click',function(){ bumpFontScale(-1); });
      topbar.querySelector('#yg-tb-fsp').addEventListener('click',function(){ bumpFontScale(1); });
    }
  }

  // ---- Page add / remove ----
  function addPage(){
    var label=(prompt('Page name?\n(e.g. Gallery, Pricing, Team, FAQ)')||'').trim();
    if(!label) return;
    var key=label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(!key) return;
    var route=key+'.html';
    if(DEMO){
      showEditToast('"'+label+'" page added. Navigate to it with the switcher.');
    } else {
      window.location.href=route;
    }
    edits.push({op:'add-page',page:key,label:label});
    persist();
  }
  function removePage(){
    var curRoute=window.location.pathname.split('/').pop()||'index.html';
    var isHome=(curRoute==='index.html'||curRoute===''||curRoute==='home');
    if(isHome){ showEditToast('The home page cannot be removed.'); return; }
    var pg=curRoute.replace('.html','');
    if(!confirm('Remove this page? You can undo it in the changes list before submitting.')) return;
    edits.push({op:'remove-page',page:pg});
    persist();
    window.location.href='index.html';
  }

  // ---- Global font scale (mirrors intake Aa-/Aa/Aa+) ----
  var _fontScalePct=100;
  function bumpFontScale(dir){
    _fontScalePct=Math.max(70,Math.min(150,_fontScalePct+dir*10));
    var pct=_fontScalePct;
    document.querySelectorAll('[data-section] h1,[data-section] h2,[data-section] h3,[data-section] h4,[data-section] h5,[data-section] h6').forEach(function(el){
      var base=parseFloat(el.dataset.ygFsBase||(el.dataset.ygFsBase=window.getComputedStyle(el).fontSize));
      el.style.fontSize=Math.round(base*pct/100)+'px';
    });
    showEditToast('Font scale '+pct+'%');
  }

  // ---- Selection ----
  function onDocClickEdit(e){
    if(!editMode||tourActive) return;
    var t=e.target;
    if(miniBar&&miniBar.contains(t)) return;
    if(secBar&&secBar.contains(t)) return;
    if(colourPanel&&colourPanel.contains(t)) return;
    if(topbar&&topbar.contains(t)) return;
    if(editTray&&editTray.contains(t)) return;
    if(t.tagName==='IMG'&&t.closest('[data-section]')) return;
    var leaf=t.closest&&t.closest('[data-section]')?(isLeaf(t)?t:null):null;
    if(leaf){ e.preventDefault(); e.stopPropagation(); selectElement(leaf); return; }
    var sec=t.closest&&t.closest('[data-section]');
    if(sec){ e.preventDefault(); selectSection(sec); return; }
    deselectAll();
  }
  function deselectAll(){ deselectElement(); deselectSection(); }

  // ---- Element editing ----
  function selectElement(el){
    deselectSection();
    if(selEl&&selEl!==el) deselectElement();
    selEl=el; el.classList.add('yg-elsel');
    var sec=el.closest('[data-section]'),sk=sec?sec.getAttribute('data-section'):'',pg=currentPage();
    if(!el.dataset.ygBefore){
      var cur=cleanOuterHTML(el);
      var existing=findOp(function(o){ return o.op==='element'&&o.section===sk&&o.page===pg&&o.after===cur; });
      el.dataset.ygBefore=existing?existing.before:cur;
    }
    el.contentEditable='true'; el.spellcheck=false;
    el.addEventListener('input',onElInput);
    el.focus();
    buildMiniBar(el); positionMiniBar(el);
  }
  function deselectElement(){
    if(!selEl) return;
    selEl.classList.remove('yg-elsel');
    selEl.contentEditable='false';
    selEl.removeEventListener('input',onElInput);
    selEl=null;
    if(miniBar){ miniBar.remove(); miniBar=null; }
  }
  function onElInput(){ recordElement(selEl); }

  function recordElement(el){
    if(!el) return;
    var sec=el.closest('[data-section]'),sk=sec?sec.getAttribute('data-section'):'',pg=currentPage();
    var before=el.dataset.ygBefore,after=cleanOuterHTML(el);
    var op=findOp(function(o){ return o.op==='element'&&o.section===sk&&o.page===pg&&o.before===before; });
    if(after===before){ if(op){ edits.splice(edits.indexOf(op),1); persist(); } return; }
    if(op){ op.after=after; } else { edits.push({op:'element',page:pg,section:sk,before:before,after:after}); }
    persist();
  }

  function curFontPx(el){ return parseFloat(window.getComputedStyle(el).fontSize)||16; }
  function bumpFont(el,dir){ var s=Math.round(curFontPx(el)*(dir>0?1.1:0.9)); el.style.fontSize=s+'px'; recordElement(el); positionMiniBar(el); }
  function setAlign(el,a){ el.style.textAlign=a; recordElement(el); }
  function bumpSpace(el,dir){
    var cs=window.getComputedStyle(el);
    var mt=(parseFloat(cs.marginTop)||0)+dir*6, mb=(parseFloat(cs.marginBottom)||0)+dir*6;
    el.style.marginTop=Math.max(0,mt)+'px'; el.style.marginBottom=Math.max(0,mb)+'px';
    recordElement(el); positionMiniBar(el);
  }
  function setTextColour(el,hex){ el.style.color=hex; recordElement(el); }

  function miniBtn(label,title){ return '<button data-mb="'+label+'" title="'+title+'" style="background:none;border:none;color:#fff;font-size:13px;font-weight:700;padding:6px 9px;border-radius:6px;cursor:pointer;font-family:'+FF+';min-width:30px">'+label+'</button>'; }
  function buildMiniBar(el){
    if(miniBar) miniBar.remove();
    miniBar=document.createElement('div');
    miniBar.style.cssText='position:absolute;z-index:100001;background:'+BK+';border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);padding:4px;display:flex;align-items:center;gap:2px;font-family:'+FF+'';
    var div='<span style="width:1px;height:18px;background:rgba(255,255,255,.2);margin:0 3px"></span>';
    var curCol=rgbToHex(window.getComputedStyle(el).color)||'#000000';
    miniBar.innerHTML=
      miniBtn('A-','Smaller text')+miniBtn('A+','Bigger text')+div
      +miniBtn('L','Align left')+miniBtn('C','Centre')+miniBtn('R','Align right')+div
      +'<label title="Text colour" style="display:flex;align-items:center;cursor:pointer;padding:0 4px"><span style="width:18px;height:18px;border-radius:5px;border:2px solid #fff;background:'+curCol+';display:inline-block"></span><input id="yg-mb-col" type="color" value="'+curCol+'" style="width:0;height:0;opacity:0;position:absolute"></label>'
      +div+miniBtn('-','Less space')+miniBtn('+','More space');
    document.body.appendChild(miniBar);
    miniBar.querySelectorAll('[data-mb]').forEach(function(b){
      b.addEventListener('mousedown',function(e){ e.preventDefault(); });
      b.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        var k=b.getAttribute('data-mb');
        if(k==='A-') bumpFont(selEl,-1);
        else if(k==='A+') bumpFont(selEl,1);
        else if(k==='L') setAlign(selEl,'left');
        else if(k==='C') setAlign(selEl,'center');
        else if(k==='R') setAlign(selEl,'right');
        else if(k==='-') bumpSpace(selEl,-1);
        else if(k==='+') bumpSpace(selEl,1);
      });
    });
    var ci=miniBar.querySelector('#yg-mb-col');
    ci.addEventListener('input',function(){
      setTextColour(selEl,ci.value);
      var sw=ci.previousSibling; if(sw&&sw.style) sw.style.background=ci.value;
    });
  }
  function positionMiniBar(el){
    if(!miniBar||!el) return;
    var r=el.getBoundingClientRect();
    var top=r.top+window.scrollY-46; if(top<window.scrollY+50) top=r.bottom+window.scrollY+8;
    var left=Math.max(8,Math.min(r.left+window.scrollX, window.innerWidth-miniBar.offsetWidth-8));
    miniBar.style.top=top+'px'; miniBar.style.left=left+'px';
  }

  // ---- Section editing ----
  function selectSection(sec){
    deselectElement();
    if(selSec&&selSec!==sec) deselectSection();
    selSec=sec; sec.classList.add('yg-secsel');
    buildSecBar(sec); positionSecBar(sec);
  }
  function deselectSection(){
    if(!selSec) return;
    selSec.classList.remove('yg-secsel'); selSec=null;
    if(secBar){ secBar.remove(); secBar=null; }
    closeColourPanel();
  }
  function buildSecBar(sec){
    if(secBar) secBar.remove();
    secBar=document.createElement('div');
    secBar.style.cssText='position:absolute;z-index:100001;background:'+BK+';border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);padding:4px;display:flex;align-items:center;gap:2px;font-family:'+FF+'';
    function sb(act,label){ return '<button data-sb="'+act+'" style="background:none;border:none;color:'+(act==='remove'?'#fca5a5':'#fff')+';font-size:12px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer;font-family:'+FF+'">'+label+'</button>'; }
    secBar.innerHTML=sb('colour','Background')+sb('up','Move up')+sb('down','Move down')+sb('remove','Remove');
    document.body.appendChild(secBar);
    secBar.querySelector('[data-sb="colour"]').addEventListener('click',function(e){ e.stopPropagation(); openSectionColour(sec); });
    secBar.querySelector('[data-sb="up"]').addEventListener('click',function(e){ e.stopPropagation(); moveSection(sec,-1); });
    secBar.querySelector('[data-sb="down"]').addEventListener('click',function(e){ e.stopPropagation(); moveSection(sec,1); });
    secBar.querySelector('[data-sb="remove"]').addEventListener('click',function(e){ e.stopPropagation(); removeSection(sec); });
  }
  function positionSecBar(sec){
    if(!secBar||!sec) return;
    var r=sec.getBoundingClientRect();
    var top=r.top+window.scrollY+6; if(top<window.scrollY+50) top=window.scrollY+50;
    var left=Math.max(8,r.right+window.scrollX-secBar.offsetWidth-8);
    secBar.style.top=top+'px'; secBar.style.left=left+'px';
  }
  function moveSection(sec,dir){
    var all=Array.prototype.slice.call(document.querySelectorAll('[data-section]'));
    var i=all.indexOf(sec),j=dir<0?i-1:i+1;
    if(j<0||j>=all.length) return;
    if(dir<0) sec.parentNode.insertBefore(sec,all[j]); else all[j].parentNode.insertBefore(all[j],sec);
    var order=Array.prototype.slice.call(document.querySelectorAll('[data-section]')).map(function(s){ return s.getAttribute('data-section'); });
    var pg=currentPage(),op=findOp(function(o){ return o.op==='reorder-sections'&&o.page===pg; });
    if(op) op.order=order; else edits.push({op:'reorder-sections',page:pg,order:order});
    persist(); positionSecBar(sec); showEditToast('Section moved.');
  }
  function removeSection(sec){
    if(!confirm('Remove this section? You can undo it in the changes list before submitting.')) return;
    var sk=sec.getAttribute('data-section'),pg=currentPage();
    sec.style.display='none'; deselectSection();
    if(!findOp(function(o){ return o.op==='remove-section'&&o.section===sk&&o.page===pg; })) edits.push({op:'remove-section',page:pg,section:sk});
    persist(); showEditToast('Section removed.');
  }

  // ---- Colour ----
  function rgbToHex(c){
    if(!c) return null;
    if(c[0]==='#') return c.length===4?('#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]):c;
    var m=c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); if(!m) return null;
    function h(n){ n=parseInt(n).toString(16); return n.length<2?'0'+n:n; }
    return '#'+h(m[1])+h(m[2])+h(m[3]);
  }
  function uniqueHexes(sec){
    var set={},m,re=/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,html=sec.getAttribute('style')||'';
    sec.querySelectorAll('[style]').forEach(function(el){ html+=';'+el.getAttribute('style'); });
    while((m=re.exec(html))){ var h=m[0].toLowerCase(); if(h.length===4) h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3]; set[h]=1; }
    return Object.keys(set).slice(0,14);
  }
  function applyColourDom(sec,before,after){
    if(before.toLowerCase()===after.toLowerCase()) return;
    if(sec.getAttribute('style')) sec.setAttribute('style',sec.getAttribute('style').replace(reHex(before),after));
    sec.querySelectorAll('[style]').forEach(function(el){ el.setAttribute('style',el.getAttribute('style').replace(reHex(before),after)); });
  }
  function openSectionColour(sec){
    closeColourPanel();
    var sk=sec.getAttribute('data-section'),pg=currentPage(),hexes=uniqueHexes(sec);
    colourPanel=document.createElement('div');
    colourPanel.style.cssText='position:absolute;z-index:100002;background:#fff;border:1px solid '+BD+';border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.16);padding:14px;font-family:'+FF+';width:240px';
    var r=sec.getBoundingClientRect();
    colourPanel.style.top=(r.top+window.scrollY+40)+'px';
    colourPanel.style.left=(Math.max(8,r.right+window.scrollX-246))+'px';
    var rows=hexes.length?hexes.map(function(h){
      return '<label style="display:flex;align-items:center;gap:10px;padding:5px 0;cursor:pointer">'
        +'<input type="color" value="'+h+'" data-orig="'+h+'" data-cur="'+h+'" style="width:30px;height:24px;border:none;background:none;cursor:pointer;padding:0">'
        +'<span style="font-size:12px;color:'+GR+'">'+h+'</span></label>';
    }).join(''):'<p style="font-size:12px;color:'+GR+';margin:0;line-height:1.5">No editable colours here. Use <b>Suggest changes</b> to ask us.</p>';
    colourPanel.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        +'<span style="font-size:11px;font-weight:700;color:'+P+';letter-spacing:.05em;text-transform:uppercase">'+sectionLabel(sk)+' colours</span>'
        +'<button id="yg-col-x" style="background:none;border:none;cursor:pointer;font-size:16px;color:#c4b5fd;padding:0;line-height:1">x</button>'
      +'</div>'+rows;
    document.body.appendChild(colourPanel);
    colourPanel.querySelector('#yg-col-x').addEventListener('click',closeColourPanel);
    colourPanel.querySelectorAll('input[type=color]').forEach(function(ci){
      ci.addEventListener('input',function(){
        var orig=ci.getAttribute('data-orig'),cur=ci.getAttribute('data-cur'),next=ci.value;
        applyColourDom(sec,cur,next); ci.setAttribute('data-cur',next);
        var op=findOp(function(o){ return o.op==='colour'&&o.section===sk&&o.page===pg&&o.beforeHex===orig; });
        if(op){ op.afterHex=next; } else { edits.push({op:'colour',page:pg,section:sk,beforeHex:orig,afterHex:next}); }
        persist();
      });
    });
  }
  function closeColourPanel(){ if(colourPanel){ colourPanel.remove(); colourPanel=null; } }

  // ---- Image replace ----
  function onImgClick(e){
    if(!editMode||tourActive) return;
    e.preventDefault(); e.stopPropagation();
    var img=this;
    var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.addEventListener('change',function(){
      var f=inp.files&&inp.files[0]; if(!f) return;
      var sec=img.closest('[data-section]'),sk=sec?sec.getAttribute('data-section'):'';
      img.style.opacity='.5';
      if(DEMO){ var url=URL.createObjectURL(f); img.src=url; img.style.opacity='1'; recordImage(img,sk,url); return; }
      var fd=new FormData(); fd.append('file',f); fd.append('ref',REF); fd.append('slot',sk||'image');
      fetch(API+'/api/upload-image',{method:'POST',body:fd}).then(function(r){ return r.json(); }).then(function(j){
        img.style.opacity='1';
        if(j&&j.url){ img.src=j.url; recordImage(img,sk,j.url); } else showEditToast('Upload failed - please try again.');
      }).catch(function(){ img.style.opacity='1'; showEditToast('Upload failed - please try again.'); });
    });
    inp.click();
  }
  function recordImage(img,sk,url){
    var before=img.dataset.ygOrigSrc,pg=currentPage();
    var op=findOp(function(o){ return o.op==='image'&&o.section===sk&&o.page===pg&&o.beforeSrc===before; });
    if(op){ op.afterSrc=url; } else { edits.push({op:'image',page:pg,section:sk,beforeSrc:before,afterSrc:url}); }
    persist(); showEditToast('Photo replaced.');
  }

  // ---- Edit toast ----
  var editToast=null;
  function showEditToast(msg){
    if(editToast){ editToast.remove(); editToast=null; }
    editToast=document.createElement('div');
    editToast.style.cssText='position:fixed;bottom:84px;left:20px;z-index:99998;background:'+BK+';color:#fff;font-family:'+FF+';font-size:13px;font-weight:500;padding:11px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:yg-in .2s ease;pointer-events:none;max-width:260px;line-height:1.4';
    editToast.textContent=msg; document.body.appendChild(editToast);
    setTimeout(function(){ if(editToast){ editToast.remove(); editToast=null; } },2600);
  }

  // ---- Changes tray ----
  var trayOpen=false;
  function opSummary(o){
    if(o.op==='element') return 'Edited: "'+esc((o.after||'').replace(/<[^>]+>/g,'').trim().slice(0,38))+'"';
    if(o.op==='image')  return 'Photo replaced';
    if(o.op==='colour') return 'Colour '+o.beforeHex+' to '+o.afterHex;
    if(o.op==='remove-section') return 'Section removed';
    if(o.op==='reorder-sections') return 'Sections reordered';
    if(o.op==='add-page') return 'Page added: '+esc(o.label||o.page);
    if(o.op==='remove-page') return 'Page removed: '+esc(o.page);
    return o.op;
  }
  function renderEditTray(){
    if(!editMode||!trayOpen){ if(editTray) editTray.style.display='none'; return; }
    if(!editTray){
      editTray=document.createElement('div');
      editTray.style.cssText='position:fixed;bottom:72px;left:20px;z-index:99999;width:330px;max-width:90vw;background:#fff;border:1px solid '+BD+';border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.14);font-family:'+FF+';color:'+BK+';overflow:hidden';
      document.body.appendChild(editTray);
    }
    editTray.style.display='block';
    var body=edits.length===0
      ? '<p style="font-size:13px;color:'+GR+';margin:0;padding:16px">No changes yet - click any text, photo or section to start.</p>'
      : edits.map(function(o,i){
          return '<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-bottom:1px solid #f5f5f5">'
            +'<div style="flex:1;min-width:0">'
            +'<span style="font-size:10px;font-weight:700;color:'+P+';letter-spacing:.05em;text-transform:uppercase">'+pageLabel(o.page)+(o.section?' - '+sectionLabel(o.section):'')+'</span>'
            +'<p style="font-size:12px;color:'+BK+';margin:3px 0 0;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px">'+opSummary(o)+'</p>'
            +'</div>'
            +'<button data-undo="'+i+'" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:#c4b5fd;font-size:17px;padding:0;line-height:1" title="Undo">x</button>'
            +'</div>';
        }).join('');
    var footer=edits.length>0
      ? '<div style="padding:12px 14px">'
          +'<p style="font-size:12px;color:'+GR+';margin:0;line-height:1.5">Tap &times; to undo a change. When you\'re ready, hit <b>Submit to YG Studio</b> in the top bar.</p>'
        +'</div>'
      : '';
    editTray.innerHTML=
      '<div style="background:'+BK+';padding:13px 16px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-size:13px;font-weight:700;color:#fff;font-family:'+FF+'">Your changes'+(edits.length?' ('+edits.length+')':'')+'</span>'
        +'<button id="yg-edit-close" style="background:none;border:none;cursor:pointer;font-size:19px;color:rgba(255,255,255,.5);padding:0;line-height:1">x</button>'
      +'</div>'+body+footer;
    editTray.querySelector('#yg-edit-close').addEventListener('click',function(){ trayOpen=false; renderEditTray(); });
    editTray.querySelectorAll('[data-undo]').forEach(function(b){ b.addEventListener('click',function(){ undoOp(parseInt(b.getAttribute('data-undo'))); }); });
  }

  function undoOp(i){
    var o=edits[i]; if(!o) return;
    var sec=(o.page===currentPage()&&o.section)?document.querySelector('[data-section="'+o.section+'"]'):null;
    if(o.op==='element'&&sec){ sec.querySelectorAll('*').forEach(function(el){ if(!el.children.length&&cleanOuterHTML(el)===o.after) el.outerHTML=o.before; }); deselectElement(); }
    if(o.op==='image'&&sec){ sec.querySelectorAll('img').forEach(function(im){ if(im.getAttribute('src')===o.afterSrc){ im.setAttribute('src',o.beforeSrc); im.dataset.ygOrigSrc=o.beforeSrc; } }); }
    if(o.op==='colour'&&sec){ applyColourDom(sec,o.afterHex,o.beforeHex); }
    if(o.op==='remove-section'&&sec){ sec.style.display=''; }
    edits.splice(i,1); persist();
  }

  // Single submit — flushes self-serve edits AND change-request notes together.
  // Edits go to /api/apply-edits (silent rebuild); notes go to /api/preview-feedback.
  function submitAll(){
    if(sending) return;
    if(!edits.length && !draft.length){ showEditToast('Make a change or leave a note first.'); return; }
    var btn=topbar&&topbar.querySelector('#yg-tb-submit');
    if(btn){ btn.textContent='Submitting…'; btn.style.opacity='.7'; btn.disabled=true; }
    sending=true;
    function restore(){ sending=false; if(btn){ btn.innerHTML='Submit to YG Studio &rarr;'; btn.style.opacity='1'; btn.disabled=false; } }
    function done(){
      clearEdits(); clearDraft(); edits=[]; draft=[]; trayOpen=false; sending=false;
      if(editMode) exitEditMode(); if(feedbackMode) exitFeedbackMode();
      updateTopbar(); showCombinedSubmitted();
    }
    if(DEMO){ setTimeout(done,800); return; }
    var jobs=[];
    if(edits.length){
      jobs.push(fetch(API+'/api/apply-edits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:REF,edits:edits})})
        .then(function(r){ if(!r.ok) throw new Error('apply-edits'); }));
    }
    if(draft.length){
      jobs.push(fetch(API+'/api/preview-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:REF,items:draft})})
        .then(function(r){ if(!r.ok) throw new Error('preview-feedback'); }));
    }
    Promise.all(jobs).then(done).catch(function(){ restore(); showEditToast('Could not submit — please try again.'); });
  }
  function showCombinedSubmitted(){
    var panel=document.createElement('div');
    panel.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100004;width:340px;max-width:92vw;background:#fff;border:1px solid '+BD+';border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:'+FF+';padding:24px 18px;text-align:center;animation:yg-in .2s ease';
    panel.innerHTML=
      '<div style="width:48px;height:48px;border-radius:50%;background:'+PT+';display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;color:'+P+'">&#10003;</div>'
      +'<p style="font-size:15px;font-weight:700;color:'+BK+';margin:0 0 6px">Sent to YG Studio!</p>'
      +'<p style="font-size:13px;color:'+GR+';margin:0 0 18px;line-height:1.5">Your designer will review everything and refresh your preview shortly.</p>'
      +'<button id="yg-es-x" style="background:'+PT+';color:'+P+';border:none;border-radius:10px;padding:9px 24px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Close</button>';
    document.body.appendChild(panel);
    panel.querySelector('#yg-es-x').addEventListener('click',function(){ panel.remove(); });
    setTimeout(function(){ if(panel.parentNode) panel.remove(); },6000);
  }

  // ---- Enter / exit edit mode ----
  function enterEditMode(){
    if(feedbackMode) exitFeedbackMode();
    editMode=true;
    updateTopbar();
    document.querySelectorAll('[data-section] img').forEach(function(img){ img.dataset.ygOrigSrc=img.dataset.ygOrigSrc||img.getAttribute('src')||''; img.classList.add('yg-imgedit'); img.addEventListener('click',onImgClick); });
    document.querySelectorAll(EDIT_TAGS.split(',').map(function(t){ return '[data-section] '+t; }).join(',')).forEach(function(el){ if(isLeaf(el)) el.classList.add('yg-editable'); });
    document.addEventListener('click',onDocClickEdit,true);
    window.addEventListener('scroll',onEditScroll,true);
    trayOpen=true; renderEditTray();
    sessionStorage.setItem('yg-edit-mode','1');
  }
  function exitEditMode(){
    editMode=false;
    deselectAll();
    document.removeEventListener('click',onDocClickEdit,true);
    window.removeEventListener('scroll',onEditScroll,true);
    document.querySelectorAll('.yg-editable').forEach(function(el){ el.classList.remove('yg-editable'); });
    document.querySelectorAll('.yg-imgedit').forEach(function(img){ img.classList.remove('yg-imgedit'); img.removeEventListener('click',onImgClick); });
    if(editTray) editTray.style.display='none';
    updateTopbar();
    sessionStorage.setItem('yg-edit-mode','0');
  }
  function onEditScroll(){ if(selEl) positionMiniBar(selEl); if(selSec) positionSecBar(selSec); }

  // ---- Re-apply pending edits on page load ----
  function reapplyEdits(){
    var pg=currentPage();
    var ro=findOp(function(o){ return o.op==='reorder-sections'&&o.page===pg; });
    if(ro){ ro.order.forEach(function(id){ var s=document.querySelector('[data-section="'+id+'"]'); if(s) s.parentNode.appendChild(s); }); }
    edits.forEach(function(o){
      if(o.page!==pg) return;
      var sec=o.section?document.querySelector('[data-section="'+o.section+'"]'):null;
      if(o.op==='remove-section'&&sec){ sec.style.display='none'; return; }
      if(!sec) return;
      if(o.op==='element'){ sec.querySelectorAll('*').forEach(function(el){ if(!el.children.length&&el.outerHTML===o.before) el.outerHTML=o.after; }); }
      if(o.op==='image'){ sec.querySelectorAll('img').forEach(function(im){ if(im.getAttribute('src')===o.beforeSrc){ im.setAttribute('src',o.afterSrc); im.dataset.ygOrigSrc=o.beforeSrc; } }); }
      if(o.op==='colour'){ applyColourDom(sec,o.beforeHex,o.afterHex); }
    });
  }
  if(!READONLY){
    reapplyEdits();
    // Build the persistent top bar up front so it's present on every page load.
    buildTopbar(); updateTopbar();
    if(sessionStorage.getItem('yg-fb-mode')==='1') enterFeedbackMode();
    if(sessionStorage.getItem('yg-edit-mode')==='1') enterEditMode();
  }

  // ============================ GUIDED TOUR ============================
  var TOTAL=6,tourEl=null,tourStep=0,tourActive=false,tourHighlighted=null;

  function dots(current){
    var s='<div style="display:flex;gap:5px;align-items:center">';
    for(var i=0;i<TOTAL;i++) s+='<span style="width:7px;height:7px;border-radius:50%;background:'+(i<current?P:BD)+';display:inline-block;transition:background .2s"></span>';
    return s+'</div>';
  }
  function liftEl(el){
    if(!el) return;
    el._ygZ=el.style.zIndex; el._ygP=el.style.position; el._ygS=el.style.boxShadow;
    if(el.style.position!=='fixed') el.style.position='relative';
    el.style.zIndex='100005';
    el.style.boxShadow=(el.style.boxShadow?el.style.boxShadow+',':'')+'0 0 0 4px '+P+',0 0 0 10px rgba(109,77,235,.18)';
    tourHighlighted=el;
  }
  function dropEl(){ var el=tourHighlighted; if(!el) return; el.style.zIndex=el._ygZ||''; el.style.position=el._ygP||''; el.style.boxShadow=el._ygS||''; tourHighlighted=null; }
  function removeTourEl(){ if(tourEl){ tourEl.remove(); tourEl=null; } dropEl(); }

  function makeTip(stepNum,body,cta,onCta,showSkip){
    removeTourEl();
    tourEl=document.createElement('div');
    tourEl.style.cssText='position:absolute;z-index:100006;width:300px;background:#fff;border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.28);padding:22px;font-family:'+FF+';color:'+BK+';pointer-events:auto;animation:yg-in .22s ease';
    var skipHtml=showSkip!==false?'<button id="yg-tip-skip" style="background:none;border:none;cursor:pointer;font-size:12px;color:'+GR+';padding:0;font-family:'+FF+';text-decoration:underline">Skip</button>':'';
    tourEl.innerHTML=
      '<!-- YG logo goes here -->'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+dots(stepNum)+(skipHtml||'<span></span>')+'</div>'
      +'<p style="font-size:15px;line-height:1.65;margin:0 0 20px;color:'+BK+'">'+body+'</p>'
      +'<button id="yg-tip-cta" style="width:100%;background:'+P+';color:#fff;border:none;border-radius:10px;padding:13px 0;font-size:14px;font-weight:700;cursor:pointer;font-family:'+FF+';letter-spacing:.01em;transition:background .15s">'+cta+'</button>';
    document.body.appendChild(tourEl);
    var b=tourEl.querySelector('#yg-tip-cta');
    b.addEventListener('mouseenter',function(){ this.style.background=P2; });
    b.addEventListener('mouseleave',function(){ this.style.background=P; });
    b.addEventListener('click',onCta);
    var sk=tourEl.querySelector('#yg-tip-skip'); if(sk) sk.addEventListener('click',endTour);
  }
  function centerTip(){ if(tourEl){ tourEl.style.position='fixed'; tourEl.style.top='50%'; tourEl.style.left='50%'; tourEl.style.transform='translate(-50%,-50%)'; } }
  function posTip(anchor,sides){
    if(!anchor||!tourEl){ centerTip(); return; }
    var rect=anchor.getBoundingClientRect();
    var tw=300,th=tourEl.offsetHeight||200,gap=16,vw=window.innerWidth,vh=window.innerHeight;
    tourEl.style.position='absolute'; tourEl.style.transform='';
    var pos={
      above:{top:rect.top+window.scrollY-th-gap,left:rect.left+window.scrollX+rect.width/2-tw/2},
      below:{top:rect.bottom+window.scrollY+gap,left:rect.left+window.scrollX+rect.width/2-tw/2},
      right:{top:rect.top+window.scrollY+rect.height/2-th/2,left:rect.right+window.scrollX+gap},
      left:{top:rect.top+window.scrollY+rect.height/2-th/2,left:rect.left+window.scrollX-tw-gap},
      'above-right':{top:rect.top+window.scrollY-th-gap,left:rect.right+window.scrollX-tw}
    };
    var chosen=null;
    (sides||['above','right','below','left']).forEach(function(s){
      if(chosen||!pos[s]) return; var p=pos[s];
      var cl=Math.max(8,Math.min(p.left,vw-tw-8));
      var ct=Math.max(window.scrollY+52,Math.min(p.top,window.scrollY+vh-th-8));
      chosen={top:ct,left:cl};
    });
    if(!chosen){ centerTip(); return; }
    tourEl.style.top=chosen.top+'px'; tourEl.style.left=chosen.left+'px';
  }

  function ts1(){
    tourActive=true; tourStep=1;
    if(editMode) exitEditMode(); if(feedbackMode) exitFeedbackMode();
    scrim.style.display='block'; tourLock(true);
    makeTip(0,'Welcome to your website preview! You can change things yourself, or leave notes for our team. It only takes a moment to learn.','Show me how',ts2,false);
    centerTip();
  }
  function ts2(){
    tourStep=2; scrim.style.display='block'; tourLock(true);
    var editToggle=topbar&&topbar.querySelector('#yg-tb-edit');
    liftEl(editToggle||topbar);
    makeTip(1,'This is <b>Edit content</b>. Click it to change text, photos and colours on your site yourself.','Next',ts3,'Skip');
    posTip(editToggle||topbar,['below','left']);
  }
  function ts3(){
    tourStep=3;
    if(!editMode) enterEditMode();
    scrim.style.display='block'; tourLock(true);
    liftEl(topbar);
    makeTip(2,'This bar stays with you on every page — <b>switch pages</b>, make changes, and use <b>Submit to YG Studio</b> when you\'re done. Everything is saved as you go.','Next',ts4,'Skip');
    posTip(topbar,['below']);
  }
  function ts4(){
    tourStep=4; scrim.style.display='block'; tourLock(true);
    var target=document.querySelector('[data-section="welcome"] h1')||document.querySelector('[data-section] h1')||document.querySelector('[data-section] h2');
    if(!target){ ts6(); return; }
    target.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(function(){
      tourActive=false; selectElement(target); tourActive=true;
      if(miniBar){ miniBar.style.display='none'; miniBar.style.pointerEvents='none'; }
      liftEl(target);
      makeTip(3,'Click any text to edit it. Type to change the words. A mini toolbar appears so you can resize, recolour or align it.','Show me the toolbar',ts5,'Skip');
      posTip(target,['right','below','above','left']);
    },350);
  }
  function ts5(){
    tourStep=5; scrim.style.display='block'; tourLock(true);
    if(!miniBar){ ts6(); return; }
    miniBar.style.display='flex'; miniBar.style.pointerEvents='none';
    liftEl(miniBar);
    makeTip(4,'<b>A- / A+</b> resize text. <b>L C R</b> align it. The colour swatch changes text colour. <b>- / +</b> adjusts spacing. When done, click Done in the top bar.','Got it',ts6,'Skip');
    posTip(miniBar,['below','above','right']);
  }
  function ts6(){
    tourStep=6; deselectAll();
    if(editMode) exitEditMode();
    scrim.style.display='block'; tourLock(true);
    var suggestToggle=topbar&&topbar.querySelector('#yg-tb-suggest');
    liftEl(suggestToggle||topbar);
    makeTip(5,'For bigger requests - new sections, layout changes - click <b>Suggest changes</b> to leave a note. Then hit <b>Submit to YG Studio</b> to send everything at once.','Finish',endTour,false);
    posTip(suggestToggle||topbar,['below','left']);
  }
  function endTour(){ tourActive=false; removeTourEl(); scrim.style.display='none'; tourLock(false); deselectAll(); if(editMode) exitEditMode(); try{ localStorage.setItem('yg-tour-done','1'); }catch(e){} }
  function replayTour(){ endTour(); setTimeout(function(){ try{ localStorage.removeItem('yg-tour-done'); }catch(e){} ts1(); },100); }

  function tourOnSectionClicked(){}
  function tourDismissPopover(){}

  var tourDone=false; try{ tourDone=!!localStorage.getItem('yg-tour-done'); }catch(e){}
  if(!READONLY && !tourDone) setTimeout(ts1,600);

})();
