const $=s=>document.querySelector(s);
const map=L.map('map',{zoomControl:false}).setView([36.5,-117],6);
window.__map=map;
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap © CARTO',maxZoom:19}).addTo(map);
let routeLine=null,layer=L.layerGroup().addTo(map),ST=[],routeCoords=[],mode=localStorage.evMode||'all';
const KEY=()=>localStorage.nrelKey||'DEMO_KEY';
const isTesla=s=>/tesla/i.test(s.ev_network||'');
async function geo(q){if(/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q)){const [la,lo]=q.split(',').map(Number);return [la,lo,'My location'];}const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us,ca&q='+encodeURIComponent(q));const j=await r.json();if(!j.length)throw new Error('Could not find "'+q+'"');return [+j[0].lat,+j[0].lon,j[0].display_name];}
function hav(a,b){const R=3958.8,t=x=>x*Math.PI/180,dl=t(b[0]-a[0]),dn=t(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function simplify(c,n){if(c.length<=n)return c;const s=(c.length-1)/(n-1),o=[];for(let i=0;i<n;i++)o.push(c[Math.round(i*s)]);return o;}
function milesAlong(lat,lon){let best=1e9,bi=0;for(let i=0;i<routeCoords.length;i+=3){const d=hav([lat,lon],routeCoords[i]);if(d<best){best=d;bi=i}}return cum[bi]||0;}
let cum=[];
function maxKw(s){let m=0;for(const u of s.ev_charging_units||[])for(const k in u.connectors){const p=u.connectors[k].power_kw;if(p&&u.connectors[k].port_count&&p>m)m=p}return m||null;}
function conns(s){return (s.ev_connector_types||[]).map(c=>({J1772COMBO:'CCS1',TESLA:'NACS (Tesla)',CHADEMO:'CHAdeMO',J3400:'NACS (J3400)',J1772:'J1772'}[c]||c)).join(', ');}
function usable(s){const c=s.ev_connector_types||[];return isTesla(s)||c.includes('J1772COMBO')||c.includes('J3400');}
async function go(e){e&&e.preventDefault();const a=$('#from').value.trim(),b=$('#to').value.trim();if(!a||!b)return;
 status('Finding places…');try{
 const [A,B]=await Promise.all([geo(a),geo(b)]);status('Routing…');
 const r=await (await fetch(`https://router.project-osrm.org/route/v1/driving/${A[1]},${A[0]};${B[1]},${B[0]}?overview=full&geometries=geojson`)).json();
 if(!r.routes||!r.routes.length)throw new Error('No driving route found');
 const rt=r.routes[0];routeCoords=rt.geometry.coordinates.map(c=>[c[1],c[0]]);cum=[0];for(let i=1;i<routeCoords.length;i++)cum.push(cum[i-1]+hav(routeCoords[i-1],routeCoords[i]));
 if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(routeCoords,{color:'#3b82f6',weight:5,opacity:.9}).addTo(map);map.fitBounds(routeLine.getBounds(),{padding:[30,30]});if(typeof watchId!=='undefined'&&watchId!==null){follow=false;rc.style.display='block'}
 $('#sum').innerHTML=`<b>${(rt.distance/1609.34).toFixed(0)} mi</b> · ${Math.floor(rt.duration/3600)}h ${Math.round(rt.duration%3600/60)}m`;
 status('Loading chargers…');
 const wkt='LINESTRING('+simplify(routeCoords,180).map(c=>c[1].toFixed(4)+' '+c[0].toFixed(4)).join(', ')+')';
 const body=new URLSearchParams({route:wkt,distance:$('#dist').value,fuel_type:'ELEC',ev_charging_level:'dc_fast',status:'E',access:'public',limit:'all'});
 const res=await fetch('https://developer.nlr.gov/api/alt-fuel-stations/v1/nearby-route.json?api_key='+KEY(),{method:'POST',body});
 const j=await res.json();if(!res.ok)throw new Error((j.error&&j.error.message)||('Charger API error '+res.status)+(KEY()==='DEMO_KEY'?' — the shared DEMO_KEY allows ~10 searches/hour; add your free key in ⚙':''));
 ST=(j.fuel_stations||[]).filter(usable).map(s=>({...s,_t:isTesla(s),_kw:maxKw(s),_mi:milesAlong(s.latitude,s.longitude)})).sort((x,y)=>x._mi-y._mi);
 await classify(ST);
 render();status('');}catch(err){status('⚠ '+err.message,1)}}
let SCI=null;
async function scinfo(){if(SCI)return SCI;try{const r=await fetch('https://supercharge.info/service/supercharge/allSites');SCI=(await r.json()).filter(x=>x.gps&&x.status!=='CLOSED_PERM'&&x.status!=='PLAN')}catch(e){SCI=[]}return SCI}
async function classify(list){const need=[];for(const s of list){if(!s._t)continue;const a=s.access_days_time||'';
 if(/NACS partner/i.test(a)){s._open='yes';s._src='AFDC: NACS partner enabled'}else if(/Teslas only/i.test(a)){s._open='no';s._src='AFDC: Open to Teslas only'}else need.push(s)}
 if(need.length){const sc=await scinfo();for(const s of need){let b=null,bd=1e9;for(const x of sc){const d=hav([s.latitude,s.longitude],[x.gps.latitude,x.gps.longitude]);if(d<bd){bd=d;b=x}}
  if(b&&bd<0.25){s._open=b.otherEVs?'yes':'no';s._src='supercharge.info: '+(b.otherEVs?'open to other EVs':'Tesla only')}else{s._open='unknown';s._src='No data on non-Tesla access'}}}}
const shown=s=>!s._t||s._open==='yes'||showTO;let showTO=localStorage.evShowTO==='1';
function status(t,err){const el=$('#status');el.textContent=t;el.className=err?'err':'';el.style.display=t?'block':'none'}
function vis(){return ST.filter(shown).filter(s=>mode==='all'||(mode==='tesla'?s._t:!s._t));}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function popup(s){return `<div class="pp"><div class="pt">${esc(s.station_name)}</div>
<div class="pa">${esc(s.street_address)}, ${esc(s.city)}, ${esc(s.state)} ${esc(s.zip)}</div>
<div class="tag ${s._t?'t':'n'}">${esc(s.ev_network||'Non-networked')}</div>
<table class="pk"><tr><td>Max power</td><td>${s._kw?s._kw+' kW':'n/a'}</td></tr><tr><td>Connectors</td><td>${esc(conns(s))}</td></tr>
<tr><td>Total stalls</td><td><b>${s.ev_dc_fast_num||'?'}</b></td></tr><tr><td>Open now</td><td class="na">Live slot count unavailable — no free real-time feed. Total stalls shown.</td></tr>
<tr><td>Along route</td><td>mile ${s._mi.toFixed(0)}</td></tr><tr><td>Hours</td><td>${esc(s.access_days_time||'')}</td></tr></table>
${s._t?(s._open==='yes'?'<div class="note">✅ Open to non-Teslas ('+esc(s._src)+'). Ford: use your NACS adapter; pay in the Tesla or FordPass app.</div>':'<div class="note" style="color:#fbbf24">⛔ '+(s._open==='no'?'Tesla-only site':'Non-Tesla access unconfirmed')+' ('+esc(s._src)+') — your truck likely can’t charge here.</div>'):''}
<a target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}">Navigate ↗</a></div>`}
function render(){layer.clearLayers();const v=vis();
 for(const s of v){const m=L.circleMarker([s.latitude,s.longitude],{radius:8,color:'#fff',weight:1.5,fillColor:s._t?(s._open==='yes'?'#e31937':'#6b7280'):'#22c55e',fillOpacity:.95}).bindPopup(popup(s),{maxWidth:300});m.addTo(layer);s._m=m;}
 const t=ST.filter(s=>s._t&&s._open==='yes').length,tx=ST.filter(s=>s._t&&s._open!=='yes').length,o=ST.filter(s=>!s._t).length;$('#cnt').innerHTML=`<span class="dot t"></span>Tesla (Ford OK) ${t} · <span class="dot n"></span>Other ${o}`+(tx?` · <span class="dot" style="background:#6b7280"></span>${tx} Tesla-only ${showTO?'shown':'hidden'}`:'');
 $('#tb').innerHTML=v.map((s,i)=>`<tr data-i="${ST.indexOf(s)}"><td data-v="${s._mi}">${s._mi.toFixed(0)}</td><td>${esc(s.station_name)}</td><td>${esc(s.city)}, ${esc(s.state)}</td><td><span class="dot ${s._t?'t':'n'}" style="${s._t&&s._open!=='yes'?'background:#6b7280':''}"></span>${esc(s.ev_network)}</td><td data-v="${s._kw||0}">${s._kw||''}</td><td>${esc(conns(s))}</td><td data-v="${s.ev_dc_fast_num||0}">${s.ev_dc_fast_num||''}</td></tr>`).join('')||'<tr><td colspan=7>No chargers</td></tr>';
 document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.m===mode));}
$('#tb').addEventListener('click',e=>{const tr=e.target.closest('tr[data-i]');if(!tr)return;const s=ST[tr.dataset.i];map.setView([s.latitude,s.longitude],13);s._m&&s._m.openPopup();window.scrollTo({top:0,behavior:'smooth'})});
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{mode=localStorage.evMode=b.dataset.m;render()});
$('#f').onsubmit=go;$('#swap').onclick=()=>{const t=$('#from').value;$('#from').value=$('#to').value;$('#to').value=t};
$('#gear').onclick=()=>{const k=prompt('Optional free NREL/NLR API key (developer.nlr.gov/signup). Blank = DEMO_KEY',localStorage.nrelKey||'');if(k!==null){k.trim()?localStorage.nrelKey=k.trim():localStorage.removeItem('nrelKey')}};
/* resizable columns */
document.querySelectorAll('#tbl th').forEach(th=>{const h=document.createElement('span');h.className='rz';th.appendChild(h);h.addEventListener('click',e=>e.stopPropagation());
 h.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const x=e.clientX,w=th.offsetWidth;document.getElementById('tbl').style.tableLayout='fixed';
  const mv=ev=>{th.style.width=Math.max(40,w+ev.clientX-x)+'px'},up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};addEventListener('pointermove',mv);addEventListener('pointerup',up)})});
render();

$('#loc').onclick=()=>{if(!navigator.geolocation)return status('Location not supported',1);if(window.__lastPos){$('#from').value=__lastPos[0].toFixed(5)+','+__lastPos[1].toFixed(5);return status('')}status('Getting your location…');
navigator.geolocation.getCurrentPosition(p=>{$('#from').value=p.coords.latitude.toFixed(5)+','+p.coords.longitude.toFixed(5);status('')},e=>status('⚠ Location: '+e.message,1),{enableHighAccuracy:true,timeout:15000});};
/* live tracking */
let me=null,acc=null,follow=true,watchId=null,wake=null,lastHd=0;
const meIcon=hd=>L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],html:`<div class="me"><div class="hd" style="transform:rotate(${hd}deg)"></div><div class="md"></div></div>`});
const rc=document.createElement('button');rc.id='recenter';rc.textContent='◎ Recenter';rc.style.display='none';document.getElementById('map').appendChild(rc);
L.DomEvent.disableClickPropagation(rc);
rc.onclick=()=>{follow=true;rc.style.display='none';if(me)map.setView(me.getLatLng(),Math.max(map.getZoom(),15))};
map.on('dragstart',()=>{if(watchId!==null){follow=false;rc.style.display='block'}});
async function keepAwake(){try{if('wakeLock' in navigator&&!wake){wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>wake=null)}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&watchId!==null)keepAwake()});
function track(){if(!navigator.geolocation||watchId!==null)return;let first=true;
 watchId=navigator.geolocation.watchPosition(p=>{const ll=[p.coords.latitude,p.coords.longitude];if(p.coords.heading!=null&&!isNaN(p.coords.heading))lastHd=p.coords.heading;
  if(!me){me=L.marker(ll,{icon:meIcon(lastHd),zIndexOffset:1000}).addTo(map);acc=L.circle(ll,{radius:p.coords.accuracy,color:'#3b82f6',weight:1,fillOpacity:.12}).addTo(map)}
  else{me.setLatLng(ll);me.setIcon(meIcon(lastHd));acc.setLatLng(ll).setRadius(p.coords.accuracy)}
  window.__lastPos=ll;if(follow)first?(map.setView(ll,15),first=false):map.panTo(ll,{animate:true});},
  e=>status('⚠ Location: '+e.message,1),{enableHighAccuracy:true,maximumAge:2000,timeout:20000});keepAwake();}
track();
$('#showto').checked=showTO;$('#showto').onchange=e=>{showTO=e.target.checked;localStorage.evShowTO=showTO?'1':'0';render()};
