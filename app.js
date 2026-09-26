const TOTAL = 10;
const STORAGE_KEY = 'the-unfolding-progress-v1';
const STOPS = [
  {name:'Abisko',x:391,y:60,side:'left'},
  {name:'Alesjaure',x:291,y:173,side:'right'},
  {name:'Sälka',x:272,y:267,side:'left'},
  {name:'Singi',x:271,y:314,side:'right'},
  {name:'Teusajaure',x:249,y:388,side:'left'},
  {name:'Vakkotavare',x:228,y:445,side:'right'},
  {name:'Saltoluokta',x:356,y:532,side:'left'},
  {name:'Sitojaure',x:332,y:607,side:'right'},
  {name:'Aktse',x:304,y:653,side:'left'},
  {name:'Pårte',x:205,y:701,side:'right'},
  {name:'Kvikkjokk',x:147,y:744,side:'right'}
];
const encoder = new TextEncoder();
const $ = (id) => document.getElementById(id);

function renderDescription(value) {
  const nodes = [];

  const effects = [
    'glow',
    'pulse',
    'wave',
    'flicker',
    'dark-pulse',
    'shake',
    'corrupt',
    'fade-black',
    'blood-glow',
    'ghost',
    'distort',
    'cursed'
  ];

  const effectPattern = effects.join('|');

  const token = new RegExp(
    `\\[\\[(${effectPattern}):([^\\]\\n]+)\\]\\]|\\*\\*([^*\\n]+)\\*\\*|\\*([^*\\n]+)\\*`,
    'g'
  );

  let cursor = 0;

  for (const match of value.matchAll(token)) {
    /*
     * Everything before the current token stays normal text.
     */
    nodes.push(
      document.createTextNode(
        value.slice(cursor, match.index)
      )
    );

    const effect = match[1];
    const effectText = match[2];
    const boldText = match[3];
    const italicText = match[4];

    /*
     * Special handling for the wave effect:
     * every character needs its own <span>.
     */
    if (effect === 'wave') {
      const animated = document.createElement('span');
      animated.className = 'fx-wave';
      animated.setAttribute('aria-hidden', 'true');

      Array.from(effectText).forEach((character, index) => {
        const letter = document.createElement('span');

        letter.className = 'fx-wave-letter';

        letter.textContent =
          character === ' '
            ? '\u00a0'
            : character;

        letter.style.animationDelay = `${index * 70}ms`;

        animated.append(letter);
      });

      /*
       * Screen readers receive the normal, unfragmented text.
       */
      const accessible = document.createElement('span');
      accessible.className = 'visually-hidden';
      accessible.textContent = effectText;

      nodes.push(animated, accessible);
    }

    /*
     * All the other effects only need one span.
     */
    else if (effect) {
      const element = document.createElement('span');

      element.className = `fx-${effect}`;
      element.textContent = effectText;

      nodes.push(element);
    }

    /*
     * Markdown-style bold.
     */
    else if (boldText !== undefined) {
      const element = document.createElement('strong');
      element.textContent = boldText;

      nodes.push(element);
    }

    /*
     * Markdown-style italic.
     */
    else {
      const element = document.createElement('em');
      element.textContent = italicText;

      nodes.push(element);
    }

    cursor = match.index + match[0].length;
  }

  /*
   * Remaining plain text after the final token.
   */
  nodes.push(
    document.createTextNode(
      value.slice(cursor)
    )
  );

  $('challenge-description').replaceChildren(...nodes);
}

let intro;
let stages = [];
let keys = [];
let selected = 0;
let inputUrl = null;

function decodeBase64(s) {
  const binary = atob(s);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
function encodeBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function normalized(answer) { return answer.trim().replace(/\r\n?/g, '\n'); }

async function deriveKey(answer, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(normalized(answer)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:decodeBase64(salt),iterations,hash:'SHA-256'}, material, 256));
}
async function decrypt(payload, rawKey) {
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:decodeBase64(payload.iv)},key,decodeBase64(payload.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
async function loadFile(n) {
  const response = await fetch(`data/stage${String(n).padStart(2,'0')}.json`);
  if (!response.ok) throw new Error(`Could not load stage ${n}`);
  return response.json();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,keys:keys.map(encodeBase64)})); }
  catch { setFeedback('This browser could not save your progress. Check its storage settings.', 'error'); }
}
function setFeedback(message, type='') {
  $('feedback').textContent=message;
  $('feedback').className=`feedback ${type}`;
}
async function restore() {
  intro=await loadFile(0);
  stages=[await loadFile(1)];
  let saved=[];
  try { const state=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(state?.version===1 && Array.isArray(state.keys)) saved=state.keys.slice(0,TOTAL); }
  catch { /* An invalid local save starts a new game. */ }
  for (const stored of saved) {
    try {
      const raw=decodeBase64(stored);
      if(raw.length!==32) break;
      const n=stages.length+1;
      const next=await decrypt(await loadFile(n),raw);
      if(next.stage!==n) break;
      keys.push(raw);
      stages.push(next);
    } catch { break; }
  }
  if(saved.length!==keys.length) save();
  selected=keys.length===0 ? 0 : Math.min(stages.length,TOTAL);
}
function render() {
  const solved=keys.length;
  $('route-reveal-rect').setAttribute('height',solved===0?'0':String(STOPS[solved].y));
  const nav=$('stage-nav');
  nav.replaceChildren();
  for(let n=0;n<=TOTAL;n++) {
    const stop=STOPS[n];
    const button=document.createElement('button');
    button.type='button';
    button.className=`route-stop side-${stop.side}${n===0?' intro':''}${n===selected?' active':''}${n>0&&n<=solved?' solved':''}`;
    button.style.setProperty('--x',`${stop.x/560*100}%`);
    button.style.setProperty('--y',`${stop.y/810*100}%`);
    button.disabled=n>stages.length;
    button.setAttribute('aria-label',n===0 ? 'Abisko, introduction' : `${stop.name}, stage ${n}, ${n<=solved?'solved':n<=stages.length?'open':'locked'}`);
    if(n===selected) button.setAttribute('aria-current','step');
    const marker=document.createElement('span');marker.className='stop-marker';marker.textContent=n===0?'0':String(n);
    const name=document.createElement('span');name.className='stop-name';name.textContent=stop.name;
    button.append(marker,name);
    button.addEventListener('click',()=>{selected=n;setFeedback('');render();});
    nav.append(button);
  }
  if(inputUrl) { URL.revokeObjectURL(inputUrl); inputUrl=null; }
  if(selected===0) {
    $('stage-label').textContent='TAPPA 00 / 10 · ABISKO';
    $('challenge-title').textContent=intro.title;
    renderDescription(intro.description);
    $('input-link').hidden=true;
    $('answer-form').hidden=true;
    setFeedback('');
    return;
  }
  const stage=stages[selected-1];
  $('stage-label').textContent=`TAPPA ${String(selected).padStart(2,'0')} / 10 · ${STOPS[selected-1].name.toUpperCase()} → ${STOPS[selected].name.toUpperCase()}`;
  $('challenge-title').textContent=stage.title;
  renderDescription(stage.description);
  inputUrl=URL.createObjectURL(new Blob([stage.input],{type:'text/plain;charset=utf-8'}));
  $('input-link').hidden=false;
  $('input-link').href=inputUrl;
  $('input-link').download=`stage-${String(selected).padStart(2,'0')}-input.txt`;
  const solvedBefore=selected<=solved;
  $('answer-form').hidden=solvedBefore;
  if(solvedBefore) setFeedback(solved===TOTAL&&selected===TOTAL ? stages[TOTAL].ending : 'Tappa raggiunta. Continua il tuo viaggio.','success');
  $('answer').value='';
}
async function submit(event) {
  event.preventDefault();
  if(selected<1 || selected!==stages.length || selected>TOTAL) return;
  const answer=normalized($('answer').value);
  if(!answer) return;
  const button=$('submit-button');
  button.disabled=true;
  setFeedback('Verifica in corso…');
  try {
    const n=selected+1;
    const payload=await loadFile(n);
    const raw=await deriveKey(answer,payload.salt,payload.iterations);
    const next=await decrypt(payload,raw);
    if(next.stage!==n) throw new Error('Wrong stage');
    keys.push(raw);
    stages.push(next);
    save();
    if(n<=TOTAL) selected=n;
    render();
    setFeedback(n===TOTAL+1?stages[TOTAL].ending:'Ottimo. Procedi.','success');
    if(n<=TOTAL) $('answer').focus();
  } catch(error) {
    if(error instanceof DOMException && error.name==='OperationError') setFeedback('La risposta che hai dato non è corretta.','error');
    else setFeedback('Controlla la tua connessione per continuare.','error');
  } finally { button.disabled=false; }
}

$('answer-form').addEventListener('submit',submit);
try { await restore(); render(); }
catch { $('challenge-title').textContent='Could not load the game'; $('challenge-description').textContent='Please refresh while connected to the internet. If you opened the HTML file directly, run a local web server first.'; $('answer-form').hidden=true; $('input-link').hidden=true; }
