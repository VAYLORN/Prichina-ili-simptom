# Patches the built «Причина или симптом?» (Desktop\Prichina-ili-simptom): splash without the board,
# louder sound, random cases, projector fits any screen, background music and a break screen.
# Backs up the original files first; refuses to write if any target is missing.
$ErrorActionPreference = 'Stop'
$d = 'C:\Users\81095849\Desktop\Prichina-ili-simptom'
$ver = 'v6'
$jsPath = "$d\dist\assets\index-DbLt-kn9.js"
$cssPath = "$d\dist\assets\index-Dwl3E4Wa.css"
$srvPath = "$d\server\index.mjs"
$utf8 = New-Object Text.UTF8Encoding $false
$nl = "`n"

$backup = "$d\_backup-before-patch"
if (-not (Test-Path $backup)) {
  New-Item -ItemType Directory $backup | Out-Null
  Copy-Item $jsPath, $cssPath, $srvPath, "$d\data\game.json" $backup
}

function Swap([string]$text, [string]$old, [string]$new, [int]$expect, [string]$what) {
  $n = ([regex]::Matches($text, [regex]::Escape($old))).Count
  if ($n -ne $expect) { throw "$what : found $n, expected $expect" }
  return $text.Replace($old, $new)
}

# Always patch from the pristine backup, so running the script twice gives the same result.
$js = [IO.File]::ReadAllText("$backup\index-DbLt-kn9.js")
$css = [IO.File]::ReadAllText("$backup\index-Dwl3E4Wa.css")
$srv = [IO.File]::ReadAllText("$backup\index.mjs")

# --- sound: steeper volume curve, compressor + makeup gain + limiter ---
$js = Swap $js '(Math.max(0,Math.min(100,e))/100)**1.6*1.6' '(Math.max(0,Math.min(100,e))/100)**1.3*4' 2 'gain'
$js = Swap $js 'n.threshold.value=-14,n.ratio.value=3,t.connect(n).connect(e.destination);' 'n.threshold.value=-24,n.knee.value=8,n.ratio.value=4,n.attack.value=.003,n.release.value=.25;let __mk=e.createGain();__mk.gain.value=2.2;let __lim=e.createDynamicsCompressor();__lim.threshold.value=-1.5,__lim.knee.value=0,__lim.ratio.value=20,__lim.attack.value=.001,__lim.release.value=.1,t.connect(n).connect(__mk).connect(__lim).connect(e.destination);' 1 'compressor'

# --- background music: the host's mp3 tracks one after another in a loop, own volume, fades in and out.
# It goes straight to the speakers through its own limiter, so the game sounds' volume does not touch it. ---
$music = @'
return window.__gameSynth={synth:{c:e,dry:o,wet:a,noise:s},master:t}}window.__music=(()=>{const list=[`/theme/music-1.mp3`,`/theme/music-2.mp3`];let el=null,gain=null,want=!1,vol=60,stopT=null,idx=0;function ensure(){const g=window.__gameSynth;if(!g)return!1;if(!el){el=new Audio(list[0]);el.preload=`auto`;el.addEventListener(`ended`,()=>{idx=(idx+1)%list.length;el.src=list[idx];want&&el.play().catch(()=>{})});window.__musicEl=el;const c=g.synth.c;try{const src=c.createMediaElementSource(el),lim=c.createDynamicsCompressor();lim.threshold.value=-2;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.003;lim.release.value=.15;gain=c.createGain();gain.gain.value=0;src.connect(gain).connect(lim).connect(c.destination)}catch(x){gain=null;el.volume=0}}return!0}return(on,v)=>{want=!!on;if(v!=null)vol=v;if(!ensure())return;const target=want?Math.pow(Math.max(0,Math.min(100,vol))/100,1.5)*1.6:0;if(gain){const c=window.__gameSynth.synth.c,now=c.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.setTargetAtTime(target,now,want?.8:.4)}else el.volume=Math.min(1,target);clearTimeout(stopT);if(want){el.paused&&el.play().catch(()=>{})}else stopT=setTimeout(()=>{want||el.pause()},2500)}})();function Fo(
'@.Trim()
$js = Swap $js 'return{synth:{c:e,dry:o,wet:a,noise:s},master:t}}function Fo(' $music 1 'synth + music'
# The projector plays music while the game says so and sound is unlocked.
$js = Swap $js 'let[e,t]=(0,d.useState)(70),n=Fo({volume:e}),{state:r,offset:i,connected:a}=At(n.enabled,e=>n.play(e));' 'let[e,t]=(0,d.useState)(70),n=Fo({volume:e}),{state:r,offset:i,connected:a}=At(n.enabled,e=>n.play(e));(0,d.useEffect)(()=>{window.__music&&window.__music(!!(r&&r.music)&&n.enabled,r?r.musicVolume:void 0)},[r&&r.music,n.enabled,r&&r.musicVolume]);' 1 'screen music effect'

# --- host: music volume in «Подготовка» → «Звуки», separate from the game sounds ---
$js = Swap $js 'i=e.settings.soundVolume??70,[a,o]=(0,d.useState)(i);(0,d.useEffect)(()=>o(i),[i]);' 'i=e.settings.soundVolume??70,[a,o]=(0,d.useState)(i);(0,d.useEffect)(()=>o(i),[i]);let __mv=e.settings.musicVolume??60,[__m,__sm]=(0,d.useState)(__mv);(0,d.useEffect)(()=>__sm(__mv),[__mv]);let __mc=()=>{__m!==__mv&&t({type:`setSettings`,settings:{musicVolume:__m}})};' 1 'music volume state'
$js = Swap $js '(0,N.jsx)(P,{name:a?`Volume2`:`VolumeX`,size:18}),`Громкость`,' '(0,N.jsx)(P,{name:a?`Volume2`:`VolumeX`,size:18}),`Громкость звуков`,' 1 'sound volume label'
$js = Swap $js '(0,N.jsxs)(`b`,{children:[a,`%`]})]}),(0,N.jsx)(`div`,{className:`sound-grid`' '(0,N.jsxs)(`b`,{children:[a,`%`]})]}),(0,N.jsxs)(`label`,{className:`volume`,children:[(0,N.jsx)(P,{name:__m?`Volume2`:`VolumeX`,size:18}),`Громкость музыки`,(0,N.jsx)(`input`,{type:`range`,min:0,max:100,step:5,value:__m,onChange:e=>__sm(Number(e.target.value)),onPointerUp:__mc,onKeyUp:__mc,onBlur:__mc}),(0,N.jsxs)(`b`,{children:[__m,`%`]})]}),(0,N.jsx)(`div`,{className:`sound-grid`' 1 'music volume slider'

# --- splash and break: «Заставка» and «Перерыв» are full screens of their own, the board appears later ---
$js = Swap $js 'i=e.view===`welcome`||e.view===`board`' 'i=e.view===`board`' 1 'stage board views'
$splash = @'
children:[(0,N.jsx)(`div`,{className:`stage-bg`}),e.view===`welcome`||e.view===`pause`?(0,N.jsxs)(`div`,{className:`splash${e.view===`pause`?` is-pause`:``}`,children:[e.view===`pause`?(0,N.jsx)(__Pause,{state:e}):(0,N.jsx)(Ls,{state:e}),(0,N.jsx)(`div`,{className:`splash-photos`,children:[[`supply`,`Поставки`,`#E2483A`],[`production`,`Производство`,`#2C67DE`],[`quality`,`Качество`,`#22A05A`],[`people`,`Персонал`,`#F08A1C`]].map(([s,l,c],k)=>(0,N.jsxs)(`div`,{className:`splash-photo`,style:{"--c":c,"--i":k},children:[(0,N.jsx)(`i`,{style:{backgroundImage:`url(/theme/hero-${s}.jpg)`}}),(0,N.jsxs)(`span`,{children:[(0,N.jsx)(`img`,{src:`/theme/icons/sector-${s}.webp`,alt:``}),l]})]},s))})]}):i?(0,N.jsxs)(N.Fragment,
'@.Trim()
$js = Swap $js 'children:[(0,N.jsx)(`div`,{className:`stage-bg`}),i?(0,N.jsxs)(N.Fragment,' $splash 1 'stage branch'
$pause = @'
function __Pause({state:e}){let t=[...e.table].sort((a,b)=>a.place-b.place||b.total-a.total),n=e.rounds.filter(r=>r.phase===`done`).length,r=e.rounds.length;return(0,N.jsxs)(`div`,{className:`welcome`,children:[(0,N.jsx)(`span`,{className:`kicker`,children:`Причина или симптом?`}),(0,N.jsxs)(`h1`,{children:[`Перерыв`,(0,N.jsx)(`span`,{children:`скоро продолжим`})]}),(0,N.jsx)(`p`,{className:`tagline`,children:n?`Сыграно ${n} из ${r} ${Mt(r,`кейса`,`кейсов`,`кейсов`)}`:`Игра скоро начнётся`}),(0,N.jsxs)(`div`,{className:`welcome-teams`,children:[(0,N.jsx)(`span`,{className:`kicker kicker-dim`,children:n?`Рейтинг команд`:`Команды`}),t.map(o=>{let a=e.teams.find(x=>x.id===o.teamId);return a?(0,N.jsxs)(`div`,{className:`welcome-team`,style:{"--c":a.color},children:[(0,N.jsx)(As,{state:e,team:a,size:48}),(0,N.jsx)(`b`,{children:ks(a)}),n?(0,N.jsx)(`em`,{className:`pause-pts`,children:o.total}):null]},a.id):null})]})]})}function Rs({state:e}){
'@.Trim()
$js = Swap $js 'function Rs({state:e}){' $pause 1 'pause screen'
$js = Swap $js 'round:`Раунд`,scores:`Табло`,debrief:`Итоги`},Bt=' 'round:`Раунд`,scores:`Табло`,debrief:`Итоги`,pause:`Перерыв`},Bt=' 1 'view names'
$js = Swap $js 'scores:`ChartColumn`,debrief:`Trophy`};function Cc(' 'scores:`ChartColumn`,debrief:`Trophy`,pause:`Coffee`};function Cc(' 1 'view icons'

# --- host texts ---
$js = Swap $js 'switch(e.view){case`welcome`:return`заставка игры — поле и команды`;' 'switch(e.view){case`pause`:return`перерыв — фоновая музыка и рейтинг команд`;case`welcome`:return`заставка игры — название и команды, играет фоновая музыка`;' 1 'host screen text'
$js = Swap $js '`Поприветствуйте участников. Команды рассаживаются за столы — на экране поле и список команд.`' '`Поприветствуйте участников. На экране заставка и играет фоновая музыка — она сама стихнет, когда начнётся первый кейс.`' 1 'host todo 1'
$js = Swap $js '`Проверьте звук проектора: кнопка «Звук» в шапке.`' '`Музыка — кнопка «♪ Музыка» в ленте сверху. На перерыв — «☕ Перерыв» в ленте между раундами: экран перерыва и музыка.`' 1 'host todo 2'

# --- host round strip: a music switch at the start, a break between the middle rounds ---
$js = Swap $js 'function uc(){let{game:e,run:t}=lo(),n=Gt(e.rounds),' 'function uc(){let{game:e,run:t}=lo(),__run=t,n=Gt(e.rounds),' 1 'strip run'
$js = Swap $js 'let a=e.current>=0,o=a?lc.length:lc.findIndex(t=>t.view===e.view);' 'let a=e.current>=0,o=a?lc.length:lc.findIndex(t=>t.view===e.view),__nb=i.filter(g=>g.key!==`final`).length,__br=__nb>1?Math.ceil(__nb/2)-1:-1;' 1 'strip break index'
$musicChip = @'
(0,N.jsxs)(`span`,{className:`rs-cases`,children:[(0,N.jsx)(`button`,{className:`rs-case rs-word rs-music${e.music?` is-on`:``}`,title:`Фоновая музыка на проекторе: включить или выключить`,onClick:()=>__run({type:`setMusic`,on:!e.music}),children:e.music?`♪ Музыка играет`:`♪ Музыка`},`music`),lc.map((e,n)=>
'@.Trim()
$js = Swap $js '(0,N.jsx)(`span`,{className:`rs-cases`,children:lc.map((e,n)=>' $musicChip 1 'strip music chip'
$js = Swap $js 'children:e.label},e.view))})]}),i.map(t=>(0,N.jsxs)(`div`,{className:`rs-group${t.items.includes(e.current)?` is-active`:``}`' 'children:e.label},e.view))]})]}),i.flatMap((t,__k)=>[(0,N.jsxs)(`div`,{className:`rs-group${t.items.includes(e.current)?` is-active`:``}`' 1 'strip groups'
$pauseGroup = @'
},i.id)})})]},t.key),__k===__br?(0,N.jsxs)(`div`,{className:`rs-group rs-pause${e.view===`pause`?` is-active`:``}`,style:{"--c":`#9A6B1F`},children:[(0,N.jsxs)(`span`,{className:`rs-title`,children:[(0,N.jsx)(P,{name:`Coffee`,size:15}),` Перерыв`]}),(0,N.jsx)(`span`,{className:`rs-cases`,children:(0,N.jsx)(`button`,{className:`rs-case rs-word${e.view===`pause`?` is-active`:``}`,title:`Экран «Перерыв» и фоновая музыка`,onClick:()=>__run({type:`setView`,view:`pause`}),children:`☕ Перерыв ♪`})})]},`pause`):null])]})}
'@.Trim()
$js = Swap $js '},i.id)})})]},t.key))]})}' $pauseGroup 1 'strip break group'

# --- host header: music switch next to «Экран игроков» ---
$headerBtn = @'
(0,N.jsxs)(`button`,{className:`btn music-btn${t.game.music?` is-on`:``}`,title:`Фоновая музыка на проекторе`,onClick:()=>u({type:`setMusic`,on:!t.game.music}),children:[(0,N.jsx)(P,{name:t.game.music?`Volume2`:`VolumeX`,size:17}),t.game.music?` ♪ Музыка играет`:` ♪ Музыка выкл.`]}),(0,N.jsxs)(`label`,{className:`music-vol`,title:`Громкость музыки — отдельно от звуков игры`,children:[(0,N.jsx)(`input`,{type:`range`,min:0,max:100,step:5,defaultValue:t.game.settings.musicVolume??60,onPointerUp:e=>u({type:`setSettings`,settings:{musicVolume:Number(e.currentTarget.value)}}),onKeyUp:e=>u({type:`setSettings`,settings:{musicVolume:Number(e.currentTarget.value)}})},`mv${t.game.settings.musicVolume??60}`),(0,N.jsxs)(`small`,{children:[t.game.settings.musicVolume??60,`%`]})]}),(0,N.jsxs)(`a`,{className:`btn`,href:`/screen`
'@.Trim()
$js = Swap $js '(0,N.jsxs)(`a`,{className:`btn`,href:`/screen`' $headerBtn 1 'header music button'

# --- projector fills any screen: the stage takes the window's shape (4:3 … 21:9) instead of a fixed 16:9 ---
$js = Swap $js 'function tc({children:e,className:t=``}){let n=(0,d.useRef)(null),[r,i]=(0,d.useState)({scale:.1,x:0,y:0});' 'function tc({children:e,className:t=``}){let __fit=t.includes(`screen-fit`),n=(0,d.useRef)(null),[r,i]=(0,d.useState)({scale:.1,x:0,y:0,w:1920,h:1080});' 1 'scaled state'
$js = Swap $js 'let t=Math.min(e.clientWidth/1920,e.clientHeight/1080);i({scale:t,x:(e.clientWidth-1920*t)/2,y:(e.clientHeight-1080*t)/2})' 'let a=__fit?Math.min(Math.max(e.clientWidth/Math.max(1,e.clientHeight),4/3),21/9):16/9,w=Math.max(1920,Math.round(1080*a)),h=Math.max(1080,Math.round(1920/a)),t=Math.min(e.clientWidth/w,e.clientHeight/h);i({scale:t,x:(e.clientWidth-w*t)/2,y:(e.clientHeight-h*t)/2,w,h})' 1 'scaled fit'
$js = Swap $js '(0,N.jsx)(`div`,{className:`scaled-inner`,style:{transform:`translate(${r.x}px, ${r.y}px) scale(${r.scale})`},children:e})' '(0,N.jsx)(`div`,{className:`scaled-inner`,style:{transform:`translate(${r.x}px, ${r.y}px) scale(${r.scale})`,width:r.w,height:r.h,"--dx":`${(r.w-1920)/2}px`,"--dy":`${(r.h-1080)/2}px`},children:e})' 1 'scaled inner'

$css += @'

.scaled-inner>.stage{width:100%;height:100%}
.scaled-inner .stage-board,.scaled-inner .stage-side{translate:var(--dx,0px) var(--dy,0px)}
.splash{position:absolute;inset:0;display:grid;grid-template-columns:1010px 1fr}
.splash .welcome{position:relative;z-index:1;box-sizing:border-box;height:100%;padding:92px 0 70px 104px;animation:splash-rise .9s cubic-bezier(.2,.8,.2,1) both}
.splash .welcome h1{font-size:138px;margin-top:30px}
.splash .welcome h1 span{font-size:68px;margin-top:18px}
.splash .tagline{font-size:42px;margin-top:32px}
.splash .motto span{font-size:22px;padding:15px 26px}
.splash .welcome-facts{max-width:780px}
.splash .welcome-teams{grid-template-columns:repeat(2,minmax(0,380px))}
.splash .welcome-teams .kicker{grid-column:1/-1}
.splash.is-pause .welcome h1{font-size:146px}
.splash.is-pause .welcome-team{padding-right:26px}
.pause-pts{margin-left:auto;font:800 30px/1 var(--font-display);color:var(--gold);font-style:normal}
.splash-photos{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:-60px 30px -60px 0;transform:skewX(-9deg)}
.splash-photo{position:relative;overflow:hidden;border-radius:22px;box-shadow:0 30px 70px #00000073;animation:splash-in 1s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(.25s + var(--i)*.13s)}
.splash-photo i{position:absolute;inset:0 -40%;background:center/cover no-repeat;transform:skewX(9deg)}
.splash-photo:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,var(--c) 0%,color-mix(in srgb,var(--c) 45%,transparent) 38%,#080d1926 75%)}
.splash-photo span{position:absolute;z-index:1;left:50%;bottom:150px;display:flex;align-items:center;gap:18px;white-space:nowrap;transform:skewX(9deg) translateX(-50%);writing-mode:vertical-rl;rotate:180deg;font:800 44px/1 var(--font-display);text-transform:uppercase;letter-spacing:.06em;color:#fff;text-shadow:0 3px 14px #00000059}
.splash-photo span img{width:68px;height:68px;rotate:90deg;filter:drop-shadow(0 4px 10px #0006)}
@keyframes splash-rise{from{opacity:0;transform:translateY(30px)}}
@keyframes splash-in{from{opacity:0;transform:translateY(80px)}}
.rs-case.rs-music{--c:#15803d}
.rs-case.rs-music.is-on{background:var(--c);border-color:var(--c);color:#fff}
.music-btn.is-on{background:#e8f7f0;border-color:#16a34a;color:#15803d}
.music-vol{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#5b6478;white-space:nowrap}
.music-vol input{width:90px;accent-color:#16a34a;cursor:pointer}
.music-vol small{min-width:30px;font-size:12px}
'@

# --- server: random situations in every new plan, louder by default ---
$srv = Swap $srv 'const found = inSector.find((c) => c.level === "hard") ?? inSector[0];' 'const withHidden = inSector.filter((c) => c.hidden.length > 0); const pool = withHidden.length ? withHidden : inSector; const found = pool[Math.floor(Math.random() * pool.length)];' 1 'defaultPlan pick'
$srv = Swap $srv 'soundVolume: 70,' ('soundVolume: 100,' + $nl + '  musicVolume: 60,') 1 'default volume'
$srv = Swap $srv '      soundVolume: external_exports.number().int().min(0).max(100),' ('      soundVolume: external_exports.number().int().min(0).max(100),' + $nl + '      musicVolume: external_exports.number().int().min(0).max(100),') 1 'music volume schema'
$srv = Swap $srv 'soundVolume: state.settings.soundVolume ?? 70' 'soundVolume: state.settings.soundVolume ?? 100' 1 'public volume'

# --- server: music flag and the break screen. Music plays before the start and on «Перерыв»,
# and fades out by itself when a case begins; the host can switch it at any time. ---
$srv = Swap $srv ("    current: -1," + $nl + "    view: `"welcome`",") ("    current: -1," + $nl + "    music: true," + $nl + "    view: `"welcome`",") 1 'new game music'
$srv = Swap $srv ("  `"score`"," + $nl + "  `"penalty`"" + $nl + "];") ("  `"score`"," + $nl + "  `"penalty`"," + $nl + "  `"setMusic`"" + $nl + "];") 1 'quiet command'
$srv = Swap $srv ("    case `"setView`":" + $nl + "      s.view = cmd.view;") ("    case `"setMusic`":" + $nl + "      s.music = !!cmd.on;" + $nl + "      break;" + $nl + "    case `"setView`":" + $nl + "      s.view = cmd.view;" + $nl + "      if (cmd.view === `"pause`" || cmd.view === `"welcome`" && s.current < 0) s.music = true;") 1 'setMusic command'
$srv = Swap $srv ("      enterRound(s, next, now);" + $nl + "      s.view = `"board`";") ("      enterRound(s, next, now);" + $nl + "      s.music = false;" + $nl + "      s.view = `"board`";") 1 'music off: next case'
$srv = Swap $srv ("  r.phase = `"situation`";" + $nl + "  s.view = `"round`";") ("  r.phase = `"situation`";" + $nl + "  s.music = false;" + $nl + "  s.view = `"round`";") 1 'music off: situation'
$srv = Swap $srv ("      r.phase = `"discussion`";" + $nl + "      s.view = `"round`";") ("      r.phase = `"discussion`";" + $nl + "      s.music = false;" + $nl + "      s.view = `"round`";") 1 'music off: discussion'
$srv = Swap $srv "      r.reporterId = team.id;" ("      r.reporterId = team.id;" + $nl + "      s.music = false;") 1 'music off: report'
$srv = Swap $srv ("      s.view = `"welcome`";" + $nl + "      s.slide = 0;") ("      s.view = `"welcome`";" + $nl + "      s.music = true;" + $nl + "      s.slide = 0;") 1 'music on: reset'
$srv = Swap $srv ("    view: state.view," + $nl + "    slide: state.slide,") ("    view: state.view," + $nl + "    music: !!state.music," + $nl + "    musicVolume: state.settings.musicVolume ?? 60," + $nl + "    slide: state.slide,") 1 'public music'
$srv = Swap $srv 'var view = external_exports.enum(["welcome", "board", "rules", "roles", "round", "scores", "debrief"]);' 'var view = external_exports.enum(["welcome", "board", "rules", "roles", "round", "scores", "debrief", "pause"]);' 1 'view schema'
$srv = Swap $srv 'external_exports.object({ type: external_exports.literal("setTitle"), title: text(120) }),' ('external_exports.object({ type: external_exports.literal("setTitle"), title: text(120) }),' + $nl + '  external_exports.object({ type: external_exports.literal("setMusic"), on: external_exports.boolean() }),') 1 'setMusic schema'
$srv = Swap $srv ('var COMMAND_LABELS = {' + $nl + '  setView:') ('var COMMAND_LABELS = {' + $nl + '  setMusic: "музыка",' + $nl + '  setView:') 1 'command label'

# Assets are served as immutable for a year, so a browser that has opened the game keeps the old
# files under the old names: the patched ones get new names, and index.html points to them.
$htmlPath = "$d\dist\index.html"
if (-not (Test-Path "$backup\index.html")) { Copy-Item $htmlPath $backup }
$html = [IO.File]::ReadAllText("$backup\index.html")
$html = Swap $html '/assets/index-DbLt-kn9.js' "/assets/index-DbLt-kn9-$ver.js" 1 'html js'
$html = Swap $html '/assets/index-Dwl3E4Wa.css' "/assets/index-Dwl3E4Wa-$ver.css" 1 'html css'

Copy-Item "$backup\index-DbLt-kn9.js" $jsPath -Force
Copy-Item "$backup\index-Dwl3E4Wa.css" $cssPath -Force
[IO.File]::WriteAllText("$d\dist\assets\index-DbLt-kn9-$ver.js", $js, $utf8)
[IO.File]::WriteAllText("$d\dist\assets\index-Dwl3E4Wa-$ver.css", $css, $utf8)
[IO.File]::WriteAllText($htmlPath, $html, $utf8)
[IO.File]::WriteAllText($srvPath, $srv, $utf8)
Copy-Item "$backup\music-wait.mp3" "$d\dist\theme\music-1.mp3" -Force
Copy-Item "$backup\music-wait-2.mp3" "$d\dist\theme\music-2.mp3" -Force
Get-ChildItem "$d\dist\assets\index-*-v*.*" | Where-Object { $_.Name -notlike "*-$ver.*" } | Remove-Item
'patched OK'
