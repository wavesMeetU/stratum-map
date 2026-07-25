import{W as K,V as q,p as Z,z as J}from"./webgpu-points-renderer-DSA689ba.js";import"./geoarrow.es-CduQfizF.js";const Q="https://tiny-rice-8ab6.tarangrathod1.workers.dev/?file=towers.bin",ee=1397903170,te=12,j=["NR","LTE","UMTS","GSM"],ne=[{color:[.2,.6,1,1],sizePx:6},{color:[0,.8,.4,1],sizePx:5},{color:[1,.6,0,1],sizePx:4.5},{color:[.75,.35,.15,1],sizePx:4}],oe={r:.006,g:.008,b:.018,a:1},se=[11131949e-1,680012375e-2],V=3;async function ie(n){n(0,"Fetching tower data...");const v=await fetch(Q);if(!v.ok)throw new Error(`Fetch failed: ${v.status}`);const B=v.headers.get("content-length"),S=B?parseInt(B,10):0,R=v.body.getReader(),C=[];let x=0;for(;;){const{done:h,value:E}=await R.read();if(h)break;if(C.push(E),x+=E.length,S>0){const F=Math.min(Math.round(x/S*80),80);n(F,`Loading ${(x/1e6).toFixed(1)} MB...`)}}n(82,"Parsing binary...");const p=new ArrayBuffer(x),u=new Uint8Array(p);let g=0;for(const h of C)u.set(h,g),g+=h.length;const o=new DataView(p);if(o.getUint32(0,!0)!==ee)throw new Error("Bad binary magic");const I=o.getUint32(4,!0);if(I!==1)throw new Error(`Unsupported version: ${I}`);const y=o.getUint32(8,!0),M=o.getUint32(12,!0),L=o.getUint32(16,!0),H=o.getUint32(20,!0);n(90,`Decoding ${y.toLocaleString()} towers...`);const f=new Float32Array(p,M,y*2),U=new Uint32Array(p,L,y),k=L+y*4,t=new Uint16Array(p,k,y);function D(h){if(h<0||h>=y)return null;const E=H+h*te;return{radio:j[o.getUint8(E)]??"GSM",mcc:String(o.getUint16(E+2,!0)),net:String(o.getUint16(E+4,!0)),range:o.getFloat32(E+8,!0).toFixed(0)}}return n(100,"Ready"),{pointCount:y,positions:f,featureIds:U,styleIds:t,metaView:o,metaOffset:H,getTowerMeta:D}}function re(n,v){const B=Math.pow(1.08,Math.max(v-V,0));return ne.map((S,R)=>{const C=n[R];return{color:[...S.color.slice(0,3),C?S.color[3]:0],sizePx:C?S.sizePx*B:.5}})}function ae(){const n=document.getElementById("gpu-canvas"),v=document.getElementById("loading"),B=document.getElementById("loading-status"),S=document.getElementById("loading-progress-bar"),R=document.getElementById("tower-count"),C=document.getElementById("fps"),x=document.getElementById("zoom"),p=document.getElementById("popup");let u,g,o,w=!0;const I=[!0,!0,!0,!0];let y=!1,M=0,L=0,H=0;const f=[],U=1e3;let k=!1,t={fpsHistory:[],frameTimeHistory:[],cpuRenderTimeHistory:[],currentLodStride:1,benchmarkStartTime:0,benchmarkResults:[]};function D(){const r=document.createElement("div");r.id="benchmark-panel",r.style.cssText=`
      position: fixed;
      top: 16px;
      left: 16px;
      background: rgba(2, 8, 18, 0.95);
      border: 1px solid rgba(0, 229, 255, 0.3);
      border-radius: 4px;
      backdrop-filter: blur(12px);
      padding: 12px;
      font: 11px/1.5 system-ui, -apple-system, sans-serif;
      color: #b4c1d8;
      min-width: 220px;
      z-index: 100;
      display: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `,document.body.appendChild(r)}function h(){const r=document.getElementById("benchmark-panel");if(!r||!u)return;const m=u.getStats(),z=t.fpsHistory.length>0?t.fpsHistory[t.fpsHistory.length-1]:0,T=t.fpsHistory.length>0?t.fpsHistory.reduce((i,a)=>i+a,0)/t.fpsHistory.length:0,e=t.frameTimeHistory.length>0?t.frameTimeHistory.reduce((i,a)=>i+a,0)/t.frameTimeHistory.length:0,s=t.cpuRenderTimeHistory.length>0?t.cpuRenderTimeHistory.reduce((i,a)=>i+a,0)/t.cpuRenderTimeHistory.length:0;r.innerHTML=`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 600; color: #00d5ff;">BENCHMARK MODE</span>
        <span style="font-size: 9px; background: rgba(0, 229, 255, 0.15); color: #00d5ff; padding: 2px 6px; border-radius: 3px;">ACTIVE</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">FPS:</span>
        <span style="font-variant-numeric: tabular-nums; font-weight: 500;">${z.toFixed(1)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">Avg FPS (5s):</span>
        <span style="font-variant-numeric: tabular-nums;">${T.toFixed(1)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">Frame Time:</span>
        <span style="font-variant-numeric: tabular-nums;">${e.toFixed(2)} ms</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">CPU Render:</span>
        <span style="font-variant-numeric: tabular-nums;">${s.toFixed(2)} ms</span>
      </div>
      <div style="height: 1px; background: rgba(80, 120, 200, 0.12); margin: 8px 0;"></div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">Total Dataset:</span>
        <span style="font-variant-numeric: tabular-nums;">${m.totalInstances.toLocaleString()}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">Visible:</span>
        <span style="font-variant-numeric: tabular-nums; color: #00d5ff;">${m.visibleInstances.toLocaleString()}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">LOD Stride:</span>
        <span style="font-variant-numeric: tabular-nums;">${m.lodStride}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">Draw Calls:</span>
        <span style="font-variant-numeric: tabular-nums;">${m.drawCalls}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6a7a8e;">Chunks:</span>
        <span style="font-variant-numeric: tabular-nums;">${m.chunkCount}</span>
      </div>
      <div style="height: 1px; background: rgba(80, 120, 200, 0.12); margin: 8px 0;"></div>
      <div style="font-size: 10px; color: #6a7a8e;">
        Press 1-4: Change LOD stride<br>
        Press B: Toggle benchmark mode
      </div>
    `}function E(){k=!k;const r=document.getElementById("benchmark-panel");k?(r.style.display="block",t.fpsHistory=[],t.frameTimeHistory=[],t.cpuRenderTimeHistory=[],t.benchmarkStartTime=performance.now(),console.log("🔧 BENCHMARK MODE ENABLED")):(r.style.display="none",G())}function F(r){u&&(t.currentLodStride=r,u.setLodStride(r),h(),console.log(`🔧 LOD stride set to ${r}`))}function G(){if(t.benchmarkResults.length===0){console.log("📊 No benchmark results collected");return}console.log(`
📊 BENCHMARK SUMMARY`),console.log("═".repeat(60)),console.log("│ Stride │ Visible Instances │ Avg FPS │ Avg Frame Time │"),console.log("────────┼──────────────────┼─────────┼─────────────────");for(const T of t.benchmarkResults){const e=Math.floor(5181123/T.stride);console.log(`│ ${T.stride.toString().padStart(6)} │ ${e.toLocaleString().padStart(16)} │ ${T.avgFps.toFixed(1).padStart(7)} │ ${T.avgFrameTime.toFixed(2).padStart(15)} │`)}console.log("═".repeat(60));const r=t.benchmarkResults[0],m=t.benchmarkResults[t.benchmarkResults.length-1],z=((m.avgFps-r.avgFps)/r.avgFps*100).toFixed(1);console.log(`
📈 FPS Improvement: ${z}% (stride ${r.stride} → ${m.stride})`)}let A=null,O=null,N=0,_=0;function P(r,m){S.style.width=`${r}%`,B.textContent=m}function $(){if(!u)return;const r=re(I,o.zoom);u.setStyleTable(r),u.setLodStride(k?t.currentLodStride:1),w=!0}function Y(r){const m=n.getBoundingClientRect();return[(r.clientX-m.left)/m.width*n.width,(r.clientY-m.top)/m.height*n.height]}(async()=>{if(!navigator.gpu){P(0,"WebGPU not available in this browser");return}try{u=await K.create({canvas:n,additiveBlending:!0,alphaMode:"premultiplied",clearColor:oe})}catch(e){P(0,`WebGPU init failed: ${e instanceof Error?e.message:String(e)}`);return}u.useSingleGeometryLayout(),u.setPickPointDiameterPx(20);const r=window.devicePixelRatio??1;n.width=n.clientWidth*r,n.height=n.clientHeight*r,u.resizeBackingStore(n.width,n.height),o=new q(se,V,0,[n.clientWidth,n.clientHeight]),$();try{g=await ie(P),R.textContent=g.pointCount.toLocaleString();const e=[0,0,0,0],s=g.styleIds;for(let a=0;a<s.length;a++)e[s[a]]++;const i=["count-nr","count-lte","count-umts","count-gsm"];for(let a=0;a<4;a++)document.getElementById(i[a]).textContent=e[a].toLocaleString();u.setGeometry({buffer:{positions:g.positions,featureIds:g.featureIds,styleIds:g.styleIds},vertexCount:g.pointCount})}catch(e){P(0,`Load failed: ${e instanceof Error?e.message:String(e)}`),console.error(e);return}v.classList.add("fade-out"),setTimeout(()=>v.remove(),400),D(),w=!0;function m(e){if(k||w){const s=performance.now();for(u.renderWithViewState(o,{timeMs:e}),f.push(s);f.length>0&&f[0]<=s-U;)f.shift();if(s-H>=200){let i=0;if(f.length>=2){const a=f[0],l=f[f.length-1]-a;i=l>0?(f.length-1)*1e3/l:0}C.textContent=Math.round(i).toString(),H=s}if(k){let i=0;if(f.length>=2){const c=f[0],d=f[f.length-1]-c;i=d>0?(f.length-1)*1e3/d:0}if(t.fpsHistory.push(i),t.frameTimeHistory.push(s-H),t.cpuRenderTimeHistory.push(0),t.fpsHistory.length>5&&(t.fpsHistory.shift(),t.frameTimeHistory.shift(),t.cpuRenderTimeHistory.shift()),h(),s-t.benchmarkStartTime>=1e4){const c=t.fpsHistory.reduce((d,b)=>d+b,0)/t.fpsHistory.length,l=t.frameTimeHistory.reduce((d,b)=>d+b,0)/t.frameTimeHistory.length;t.benchmarkResults.push({stride:t.currentLodStride,avgFps:c,avgFrameTime:l}),console.log(`📊 Stride ${t.currentLodStride}: ${c.toFixed(1)} FPS, ${l.toFixed(2)} ms frame time`),t.fpsHistory=[],t.frameTimeHistory=[],t.cpuRenderTimeHistory=[],t.benchmarkStartTime=s}}w=!1}requestAnimationFrame(m)}requestAnimationFrame(m),new ResizeObserver(()=>{const e=window.devicePixelRatio??1;n.width=n.clientWidth*e,n.height=n.clientHeight*e,u.resizeBackingStore(n.width,n.height),o=o.resize(n.clientWidth,n.clientHeight),w=!0}).observe(n),n.addEventListener("pointerdown",e=>{e.button===0&&(y=!0,M=e.clientX,L=e.clientY,n.setPointerCapture(e.pointerId))}),n.addEventListener("pointermove",e=>{if(!y)return;const s=e.clientX-M,i=e.clientY-L;(Math.abs(s)>0||Math.abs(i)>0)&&(o=Z(o,-s,i),w=!0,x.textContent=o.zoom.toFixed(2)),M=e.clientX,L=e.clientY}),n.addEventListener("pointerup",()=>{y=!1}),n.addEventListener("pointercancel",()=>{y=!1}),n.addEventListener("wheel",e=>{e.preventDefault();const s=e.deltaY>0?1/1.15:1.15,i=n.getBoundingClientRect(),a=e.clientX-i.left,c=e.clientY-i.top,l=o.getResolution(),d=o.viewportSize[0],b=o.viewportSize[1],W=o.center[0]+(a-d/2)*l,X=o.center[1]-(c-b/2)*l;o=J(o,s,W,X),x.textContent=o.zoom.toFixed(2),$()},{passive:!1}),n.addEventListener("click",async e=>{if(!g)return;const[s,i]=Y(e),a=await u.pickFeatureIdAtCanvasPixel(Math.floor(s),Math.floor(i));if(a===null){p.classList.remove("visible");return}const c=g.getTowerMeta(a);if(!c){p.classList.remove("visible");return}const l=document.getElementById("popup-radio-badge");l.textContent=c.radio,l.setAttribute("data-radio",c.radio),document.getElementById("popup-mcc").textContent=c.mcc,document.getElementById("popup-net").textContent=c.net,document.getElementById("popup-range").textContent=`${c.range} m`,p.classList.add("visible")});function T(e,s){let l=e+12,d=s+12;l+200>window.innerWidth-16&&(l=e-200-12),d+120>window.innerHeight-16&&(d=s-120-12),p.style.left=`${l}px`,p.style.top=`${d}px`;const b=l>e,W=d>s;p.dataset.pointerRight=String(b),p.dataset.pointerBottom=String(W)}n.addEventListener("pointermove",e=>{if(!g||y)return;N=e.clientX,_=e.clientY;const[s,i]=Y(e),a=Math.floor(s),c=Math.floor(i);A!==null&&clearTimeout(A),A=window.setTimeout(async()=>{const l=await u.pickFeatureIdAtCanvasPixel(a,c);if(l===O)return;if(O=l,l==null){p.classList.remove("visible");return}const d=g.getTowerMeta(l);if(!d){p.classList.remove("visible");return}const b=document.getElementById("popup-radio-badge");b.textContent=d.radio,b.setAttribute("data-radio",d.radio),document.getElementById("popup-mcc").textContent=d.mcc,document.getElementById("popup-net").textContent=d.net,document.getElementById("popup-range").textContent=`${d.range} m`,T(N,_),p.classList.add("visible")},100)}),n.addEventListener("pointerleave",()=>{A!==null&&clearTimeout(A),O=null,p.classList.remove("visible")}),document.querySelectorAll(".legend-item").forEach(e=>{e.addEventListener("click",()=>{const s=parseInt(e.getAttribute("data-style")||"0",10),i=j[s];I[s]=!I[s],e.classList.toggle("dimmed",!I[s]),$();const a=document.getElementById(`count-${i.toLowerCase()}`),c=document.getElementById("popup-radio-badge");c.textContent=i,c.setAttribute("data-radio",i),document.getElementById("popup-mcc").textContent="—",document.getElementById("popup-net").textContent=a.textContent+" towers",document.getElementById("popup-range").textContent=I[s]?"visible":"hidden",p.classList.add("visible")})}),document.addEventListener("keydown",e=>{if(e.key==="b"||e.key==="B"){E();return}if(e.key==="1"){F(1);return}if(e.key==="2"){F(2);return}if(e.key==="3"){F(4);return}if(e.key==="4"){F(8);return}e.key==="+"||e.key==="="?(o=o.zoomBy(.3),x.textContent=o.zoom.toFixed(2),$(),w=!0):e.key==="-"&&(o=o.zoomBy(-.3),x.textContent=o.zoom.toFixed(2),$(),w=!0)})})()}ae();
//# sourceMappingURL=global-cell-towers-C2xm1aC8.js.map
