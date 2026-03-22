import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { canAddElement, canExport, PRO_TOOLS } from '../lib/plans'

const ROOM_COLORS = [
  'rgba(232,255,71,0.08)','rgba(71,196,255,0.08)',
  'rgba(255,107,71,0.08)','rgba(107,255,71,0.08)',
  'rgba(200,71,255,0.08)','rgba(255,200,71,0.08)',
]

export default function AppPage() {
  const { user, isPro, logout } = useAuth()
  const navigate   = useNavigate()
  const wrapRef    = useRef(null)
  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const drawRef    = useRef({ active:false, startX:0, startY:0, pinching:false, pinchDist:null, pointerDown:false, dragEl:null, dragOff:null })

  const [tool, setToolState]     = useState('wall')
  const [color, setColor]        = useState('#3a3a50')
  const [thickness, setThick]    = useState(8)
  const [snapOn, setSnapOn]      = useState(true)
  const [scale]                  = useState(0.05)
  const [elements, setElements]  = useState([])
  const [history, setHistory]    = useState([])
  const [selectedEl, setSelectedEl] = useState(null)
  const [zoom, setZoom]          = useState(1)
  const [pan, setPan]            = useState({ x:40, y:40 })
  const [hint, setHint]          = useState('')
  const [showHint, setShowHint]  = useState(false)
  const [upsellModal, setUpsellModal] = useState(false)
  const [upsellMsg, setUpsellMsg]     = useState('')
  const [textModal, setTextModal]     = useState(false)
  const [textPending, setTextPending] = useState(null)
  const [textVal, setTextVal]    = useState('')
  const [textSize, setTextSize]  = useState(14)
  const [textColor, setTextColor]= useState('#f0f0f5')
  const [userMenu, setUserMenu]  = useState(false)
  const [roomColorIdx, setRoomColorIdx] = useState(0)
  const hintTimer = useRef(null)

  function toast(msg) {
    setHint(msg); setShowHint(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setShowHint(false), 2500)
  }

  function trySetTool(t) {
    if (PRO_TOOLS.includes(t) && !isPro) {
      setUpsellMsg('A ferramenta "' + t + '" é exclusiva do plano PRO.')
      setUpsellModal(true)
      return
    }
    setToolState(t)
    drawRef.current.active = false
    setSelectedEl(null)
    clearOverlay()
    const hints = {
      wall:'Arraste para desenhar paredes', room:'Arraste para criar um cômodo',
      door:'Arraste para inserir uma porta', window:'Arraste para inserir uma janela',
      measure:'Arraste para medir distâncias', stair:'Arraste para adicionar escada',
      text:'Toque onde deseja inserir texto', select:'Toque em um elemento para mover',
      delete:'Toque em um elemento para apagar',
    }
    toast(hints[t] || '')
  }

  useEffect(() => {
    function resize() {
      const w = wrapRef.current.clientWidth, h = wrapRef.current.clientHeight
      ;[canvasRef.current, overlayRef.current].forEach(c => { if(c){c.width=w;c.height=h} })
      render()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => { render() }, [elements, zoom, pan, selectedEl])

  function getCtx()  { return canvasRef.current?.getContext('2d') }
  function getOCtx() { return overlayRef.current?.getContext('2d') }
  function clearOverlay() { const c=overlayRef.current; if(c) getOCtx().clearRect(0,0,c.width,c.height) }
  function screenToWorld(sx, sy) { return { x:(sx-pan.x)/zoom, y:(sy-pan.y)/zoom } }
  function snap(x, y) {
    if (!snapOn) return {x,y}
    const g=20; return { x:Math.round(x/g)*g, y:Math.round(y/g)*g }
  }

  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return

    function getPos(e) {
      const r = canvas.getBoundingClientRect()
      const cl = e.touches ? e.touches[0].clientX : e.clientX
      const ct = e.touches ? e.touches[0].clientY : e.clientY
      const w = screenToWorld(cl-r.left, ct-r.top)
      return snap(w.x, w.y)
    }

    function pinchDist(t) {
      const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY
      return Math.sqrt(dx*dx+dy*dy)
    }

    function onDown(e) {
      if (e.touches?.length===2) {
        drawRef.current.pinching=true; drawRef.current.active=false
        drawRef.current.pinchDist=pinchDist(e.touches); return
      }
      e.preventDefault()
      drawRef.current.pointerDown=true
      const pos=getPos(e)
      if (tool==='text') { setTextPending(pos); setTextModal(true); return }
      if (tool==='select') {
        const el=hitTest(elements,pos.x,pos.y,zoom)
        setSelectedEl(el||null)
        if (el) { drawRef.current.dragEl=el; drawRef.current.dragOff={x:pos.x-(el.x1??el.x??0), y:pos.y-(el.y1??el.y??0)} }
        return
      }
      if (tool==='delete') {
        const el=hitTest(elements,pos.x,pos.y,zoom)
        if (el) { saveHistory(); setElements(prev=>prev.filter(e=>e!==el)); toast('Apagado') }
        return
      }
      drawRef.current.active=true
      drawRef.current.startX=pos.x; drawRef.current.startY=pos.y
    }

    function onMove(e) {
      if (e.touches?.length===2 && drawRef.current.pinching) {
        e.preventDefault()
        const d=pinchDist(e.touches), ratio=d/drawRef.current.pinchDist
        const r=canvas.getBoundingClientRect()
        const mid={x:(e.touches[0].clientX+e.touches[1].clientX)/2-r.left, y:(e.touches[0].clientY+e.touches[1].clientY)/2-r.top}
        setZoom(z=>{const nz=Math.min(4,Math.max(0.2,z*ratio)); setPan(p=>({x:mid.x-(mid.x-p.x)*(nz/z),y:mid.y-(mid.y-p.y)*(nz/z)})); return nz})
        drawRef.current.pinchDist=d; return
      }
      if (!drawRef.current.pointerDown) return
      e.preventDefault()
      const pos=getPos(e)
      if (tool==='select' && drawRef.current.dragEl) {
        const el=drawRef.current.dragEl
        const dx=pos.x-drawRef.current.dragOff.x, dy=pos.y-drawRef.current.dragOff.y
        const mw=(el.x2??0)-(el.x1??el.x??0), mh=(el.y2??0)-(el.y1??el.y??0)
        setElements(prev=>prev.map(e=>e!==el?e:e.x1!==undefined?{...e,x1:dx,y1:dy,x2:dx+mw,y2:dy+mh}:{...e,x:dx,y:dy}))
        return
      }
      if (drawRef.current.active) {
        const oc=getOCtx(); if(!oc) return
        oc.clearRect(0,0,overlayRef.current.width,overlayRef.current.height)
        oc.save(); oc.translate(pan.x,pan.y); oc.scale(zoom,zoom); oc.globalAlpha=0.6
        drawEl(oc,{type:tool,x1:drawRef.current.startX,y1:drawRef.current.startY,x2:pos.x,y2:pos.y,
          color,thickness,fill:ROOM_COLORS[roomColorIdx%ROOM_COLORS.length]},scale)
        oc.restore()
      }
    }

    function onUp(e) {
      drawRef.current.pinching=false; drawRef.current.dragEl=null
      if (!drawRef.current.active) { drawRef.current.pointerDown=false; return }
      drawRef.current.active=false; drawRef.current.pointerDown=false
      const pos=getPos(e)
      const dx=pos.x-drawRef.current.startX, dy=pos.y-drawRef.current.startY
      if (Math.sqrt(dx*dx+dy*dy)<5) { clearOverlay(); return }
      if (!canAddElement(user,elements.length)) {
        setUpsellMsg('O plano Free permite até 10 elementos. Faça upgrade para ilimitado!')
        setUpsellModal(true); clearOverlay(); return
      }
      saveHistory()
      const el=makeEl(tool,drawRef.current.startX,drawRef.current.startY,pos.x,pos.y,color,thickness,roomColorIdx)
      if (el) { setElements(prev=>[...prev,el]); if(tool==='room') setRoomColorIdx(i=>i+1) }
      clearOverlay()
    }

    canvas.addEventListener('pointerdown',onDown,{passive:false})
    canvas.addEventListener('pointermove',onMove,{passive:false})
    canvas.addEventListener('pointerup',onUp,{passive:false})
    canvas.addEventListener('pointercancel',onUp,{passive:false})
    canvas.addEventListener('touchstart',onDown,{passive:false})
    canvas.addEventListener('touchmove',onMove,{passive:false})
    canvas.addEventListener('touchend',onUp,{passive:false})
    return ()=>{
      canvas.removeEventListener('pointerdown',onDown)
      canvas.removeEventListener('pointermove',onMove)
      canvas.removeEventListener('pointerup',onUp)
      canvas.removeEventListener('pointercancel',onUp)
      canvas.removeEventListener('touchstart',onDown)
      canvas.removeEventListener('touchmove',onMove)
      canvas.removeEventListener('touchend',onUp)
    }
  }, [tool,elements,zoom,pan,color,thickness,snapOn,scale,user,isPro,roomColorIdx])

  function render() {
    const ctx=getCtx(); if(!ctx) return
    const c=canvasRef.current
    ctx.clearRect(0,0,c.width,c.height)
    ctx.save(); ctx.translate(pan.x,pan.y); ctx.scale(zoom,zoom)
    drawGrid(ctx,c.width,c.height,pan,zoom)
    const rooms=elements.filter(e=>e.type==='room'), rest=elements.filter(e=>e.type!=='room')
    ;[...rooms,...rest].forEach(el=>drawEl(ctx,el,scale))
    if (selectedEl) {
      ctx.strokeStyle='rgba(71,196,255,0.8)'; ctx.lineWidth=2; ctx.setLineDash([6,4])
      if (selectedEl.x1!==undefined) {
        for(const[px,py] of [[selectedEl.x1,selectedEl.y1],[selectedEl.x2,selectedEl.y2]]) {
          ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.stroke()
        }
      }
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  function saveHistory() { setHistory(h=>[...h.slice(-49),elements.map(e=>({...e}))]) }
  function undo() { if(!history.length) return; setElements(history[history.length-1]); setHistory(h=>h.slice(0,-1)); toast('Desfeito') }

  function doExport() {
    if (!canExport(user)) { setUpsellMsg('Exportar PNG é exclusivo do plano PRO.'); setUpsellModal(true); return }
    exportPNG(elements,scale); toast('PNG exportado!')
  }

  function confirmText() {
    if (!textVal.trim()||!textPending) { setTextModal(false); return }
    saveHistory()
    setElements(prev=>[...prev,{type:'text',x:textPending.x,y:textPending.y,text:textVal,size:textSize,textColor}])
    setTextModal(false); setTextVal(''); toast('Texto adicionado')
  }

  const TOOLS = [
    {id:'wall',icon:'▬',label:'PAREDE'},
    {id:'room',icon:'⬜',label:'CÔMODO'},
    {id:'door',icon:'🚪',label:'PORTA',pro:true},
    {id:'window',icon:'⬛',label:'JANELA',pro:true},
    {id:'measure',icon:'📏',label:'MEDIDA',pro:true},
    {id:'stair',icon:'🪜',label:'ESCADA',pro:true},
    {id:'text',icon:'T',label:'TEXTO',pro:true},
    null,
    {id:'select',icon:'↖',label:'MOVER'},
    {id:'delete',icon:'✕',label:'APAGAR'},
  ]

  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg)'}}>
      <header style={{height:52,background:'var(--surface)',borderBottom:'1px solid var(--border)',
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',
        flexShrink:0,position:'relative',zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:9,height:9,background:'var(--accent)',borderRadius:'50%',boxShadow:'0 0 8px var(--accent)'}}/>
          <span style={{fontSize:16,fontWeight:800,letterSpacing:-0.5}}>PLANTA PRO</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div onClick={()=>navigate('/pricing')} style={{padding:'4px 10px',borderRadius:20,fontSize:11,
            fontWeight:700,fontFamily:'monospace',cursor:'pointer',border:'1px solid',
            ...(isPro?{background:'rgba(232,255,71,0.15)',color:'var(--accent)',borderColor:'rgba(232,255,71,0.3)'}
                     :{background:'var(--surface2)',color:'var(--text2)',borderColor:'var(--border)'})}}>
            {isPro?'⚡ PRO':'FREE'}
          </div>
          <div onClick={()=>setUserMenu(m=>!m)} style={{width:34,height:34,borderRadius:'50%',
            background:'var(--surface2)',border:'1px solid var(--border)',display:'flex',
            alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,cursor:'pointer',overflow:'hidden'}}>
            {user?.photoURL
              ?<img src={user.photoURL} style={{width:'100%',height:'100%',borderRadius:'50%'}}/>
              :(user?.name||user?.email||'?')[0].toUpperCase()}
          </div>
        </div>
        {userMenu&&(
          <div onClick={()=>setUserMenu(false)} style={{position:'absolute',top:52,right:0,
            background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'0 0 0 12px',
            padding:16,minWidth:200,zIndex:200}}>
            <p style={{fontSize:13,fontWeight:700,marginBottom:2}}>{user?.name||'Usuário'}</p>
            <p style={{fontSize:11,color:'var(--text2)',marginBottom:12}}>{user?.email}</p>
            <button onClick={()=>navigate('/pricing')} style={menuBtnStyle}>{isPro?'⚡ Conta PRO':'🚀 Upgrade PRO'}</button>
            <button onClick={logout} style={{...menuBtnStyle,color:'var(--accent3)'}}>Sair</button>
          </div>
        )}
      </header>

      <div style={{height:64,background:'var(--surface)',borderBottom:'1px solid var(--border)',
        display:'flex',alignItems:'center',gap:5,padding:'0 10px',overflowX:'auto',scrollbarWidth:'none',flexShrink:0}}>
        {TOOLS.map((t,i)=>{
          if(!t) return <div key={i} style={{width:1,height:30,background:'var(--border)',flexShrink:0,margin:'0 2px'}}/>
          const locked=t.pro&&!isPro
          return (
            <button key={t.id} onClick={()=>trySetTool(t.id)} style={{
              flexShrink:0,height:46,minWidth:52,padding:'0 8px',border:'1px solid var(--border)',
              background:'var(--surface2)',color:'var(--text2)',borderRadius:10,display:'flex',
              flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,cursor:'pointer',position:'relative',
              ...(tool===t.id?{borderColor:'var(--accent)',background:'rgba(232,255,71,0.1)',color:'var(--accent)'}:{}),
              ...(locked?{opacity:0.5}:{}),
            }}>
              <span style={{fontSize:17}}>{t.icon}</span>
              <span style={{fontSize:8}}>{t.label}</span>
              {locked&&<span style={{position:'absolute',top:-5,right:-5,background:'var(--accent)',
                color:'#0f0f12',fontSize:7,fontWeight:800,fontFamily:'monospace',padding:'1px 4px',borderRadius:4}}>PRO</span>}
            </button>
          )
        })}
      </div>

      <div ref={wrapRef} style={{flex:1,position:'relative',overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{position:'absolute',top:0,left:0}}/>
        <canvas ref={overlayRef} style={{position:'absolute',top:0,left:0,touchAction:'none'}}/>
        <div style={{position:'absolute',bottom:14,right:14,display:'flex',flexDirection:'column',gap:4,zIndex:10}}>
          {[{l:'+',f:()=>setZoom(z=>Math.min(4,z*1.25))},{l:'−',f:()=>setZoom(z=>Math.max(0.2,z/1.25))},{l:'FIT',f:()=>{setZoom(1);setPan({x:40,y:40})}}].map(b=>(
            <button key={b.l} onClick={b.f} style={{width:38,height:38,background:'var(--surface)',
              border:'1px solid var(--border)',color:'var(--text)',borderRadius:9,
              fontSize:b.l==='FIT'?10:18,fontFamily:'monospace',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center'}}>{b.l}</button>
          ))}
        </div>
        {!isPro&&elements.length>=8&&(
          <div style={{position:'absolute',bottom:14,left:14,background:'rgba(255,107,71,0.15)',
            border:'1px solid rgba(255,107,71,0.4)',borderRadius:10,padding:'7px 12px',
            display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--accent3)'}}>
            {elements.length}/10 elementos
            <button onClick={()=>navigate('/pricing')} style={{background:'var(--accent3)',border:'none',
              color:'white',fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:6,cursor:'pointer'}}>Upgrade →</button>
          </div>
        )}
      </div>

      <div style={{background:'var(--surface)',borderTop:'1px solid var(--border)',padding:'10px 12px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={labelStyle}>Espessura</span>
          <input type="range" min="2" max="30" value={thickness} style={{width:70}} onChange={e=>setThick(+e.target.value)}/>
          <span style={{...labelStyle,color:'var(--accent2)',fontFamily:'monospace'}}>{thickness}</span>
          <span style={{...labelStyle,marginLeft:8}}>Cor</span>
          {['#3a3a50','#5a4a3a','#2a4a3a','#4a2a2a','#2a3a5a','#e8ff47'].map(c=>(
            <div key={c} onClick={()=>setColor(c)} style={{width:18,height:18,borderRadius:5,background:c,cursor:'pointer',flexShrink:0,
              border:'2px solid '+(color===c?'var(--accent)':'transparent'),transform:color===c?'scale(1.2)':'scale(1)'}}/>
          ))}
          <span style={{...labelStyle,marginLeft:8}}>Snap</span>
          <input type="checkbox" checked={snapOn} onChange={e=>setSnapOn(e.target.checked)} style={{width:14,height:14,accentColor:'var(--accent)'}}/>
          <button onClick={undo} style={iconBtnStyle} title="Desfazer">↩</button>
          <button onClick={doExport} style={iconBtnStyle} title="Exportar PNG">↗</button>
          <button onClick={()=>{if(confirm('Limpar tudo?')){saveHistory();setElements([])}}} style={{...iconBtnStyle,color:'var(--accent3)'}} title="Limpar">⌫</button>
        </div>
      </div>

      <div style={{height:28,background:'var(--bg)',borderTop:'1px solid var(--border)',
        display:'flex',alignItems:'center',padding:'0 12px',gap:14,flexShrink:0}}>
        {[{i:'🔧',v:tool.toUpperCase()},{i:'🔍',v:Math.round(zoom*100)+'%'},{i:'📦',v:elements.length+(!isPro?'/10':'')+' elem'}].map(s=>(
          <span key={s.i} style={{display:'flex',alignItems:'center',gap:5,fontSize:10}}>
            <span style={{color:'var(--text2)'}}>{s.i}</span>
            <span style={{color:'var(--accent2)',fontFamily:'monospace'}}>{s.v}</span>
          </span>
        ))}
      </div>

      <div style={{position:'fixed',top:120,left:'50%',transform:'translateX(-50%)',
        background:'rgba(232,255,71,0.12)',border:'1px solid var(--accent)',color:'var(--accent)',
        fontFamily:'monospace',fontSize:11,padding:'7px 14px',borderRadius:20,
        pointerEvents:'none',zIndex:500,whiteSpace:'nowrap',opacity:showHint?1:0,transition:'opacity 0.3s'}}>{hint}</div>

      {upsellModal&&(
        <div style={overlayStyle} onClick={()=>setUpsellModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>⚡</div>
            <h3 style={{fontSize:20,fontWeight:800,textAlign:'center',marginBottom:8}}>Recurso PRO</h3>
            <p style={{color:'var(--text2)',fontSize:13,textAlign:'center',marginBottom:24,lineHeight:1.6}}>{upsellMsg}</p>
            <button onClick={()=>{setUpsellModal(false);navigate('/pricing')}} style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>Ver planos →</button>
            <button onClick={()=>setUpsellModal(false)} style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>Agora não</button>
          </div>
        </div>
      )}

      {textModal&&(
        <div style={overlayStyle} onClick={()=>setTextModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Adicionar Texto</h3>
            <input placeholder="Ex: Sala de Estar" value={textVal} onChange={e=>setTextVal(e.target.value)} autoFocus
              style={{...inputStyle,marginBottom:10,width:'100%'}}/>
            <div style={{display:'flex',gap:10,marginBottom:16}}>
              <div style={{flex:1}}>
                <p style={{fontSize:10,color:'var(--text2)',marginBottom:4}}>TAMANHO</p>
                <input type="number" value={textSize} min={8} max={48} onChange={e=>setTextSize(+e.target.value)} style={{...inputStyle,width:'100%'}}/>
              </div>
              <div style={{flex:1}}>
                <p style={{fontSize:10,color:'var(--text2)',marginBottom:4}}>COR</p>
                <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} style={{...inputStyle,padding:4,height:40,width:'100%'}}/>
              </div>
            </div>
            <button onClick={confirmText} style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>ADICIONAR</button>
            <button onClick={()=>setTextModal(false)} style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle    = {fontSize:10,fontFamily:'monospace',color:'var(--text2)',letterSpacing:0.5}
const iconBtnStyle  = {width:30,height:30,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,cursor:'pointer',color:'var(--text2)',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}
const menuBtnStyle  = {display:'block',width:'100%',padding:'10px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,cursor:'pointer',marginBottom:6,textAlign:'left'}
const overlayStyle  = {position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}
const modalStyle    = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'20px 20px 0 0',padding:20,width:'100%',maxWidth:460,maxHeight:'80dvh',overflowY:'auto'}
const handleStyle   = {width:40,height:4,background:'var(--border)',borderRadius:2,margin:'0 auto 16px'}
const modalBtnStyle = {display:'block',width:'100%',padding:14,border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:8}
const inputStyle    = {padding:'11px 13px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)',fontSize:14,outline:'none'}

function drawGrid(ctx,W,H,pan,zoom){
  const g=20,ox=-pan.x/zoom,oy=-pan.y/zoom,fw=W/zoom,fh=H/zoom
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=0.5
  const sx=Math.floor(ox/g)*g,sy=Math.floor(oy/g)*g
  for(let x=sx;x<ox+fw+g;x+=g){ctx.beginPath();ctx.moveTo(x,oy);ctx.lineTo(x,oy+fh);ctx.stroke()}
  for(let y=sy;y<oy+fh+g;y+=g){ctx.beginPath();ctx.moveTo(ox,y);ctx.lineTo(ox+fw,y);ctx.stroke()}
  ctx.strokeStyle='rgba(232,255,71,0.12)';ctx.lineWidth=1
  ctx.beginPath();ctx.moveTo(0,oy);ctx.lineTo(0,oy+fh);ctx.stroke()
  ctx.beginPath();ctx.moveTo(ox,0);ctx.lineTo(ox+fw,0);ctx.stroke()
}

function drawEl(ctx,el,scale){
  const {type,x1,y1,x2,y2,color,thickness}=el
  ctx.save()
  if(type==='wall'){
    ctx.strokeStyle=color||'#3a3a50';ctx.lineWidth=thickness||8;ctx.lineCap='square';ctx.lineJoin='miter'
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    drawMeasLabel(ctx,x1,y1,x2,y2,thickness||8,scale)
  }else if(type==='room'){
    const minX=Math.min(x1,x2),minY=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1)
    ctx.fillStyle=el.fill||'rgba(232,255,71,0.08)';ctx.fillRect(minX,minY,w,h)
    ctx.strokeStyle=color||'#3a3a50';ctx.lineWidth=thickness||8;ctx.strokeRect(minX,minY,w,h)
    if(w>30&&h>30)drawRectMeasures(ctx,minX,minY,w,h,scale)
  }else if(type==='door'){
    ctx.strokeStyle='#e8a847';ctx.lineWidth=3
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    const len=Math.sqrt((x2-x1)**2+(y2-y1)**2),angle=Math.atan2(y2-y1,x2-x1)
    ctx.strokeStyle='rgba(232,168,71,0.4)';ctx.lineWidth=1.5;ctx.setLineDash([4,4])
    ctx.beginPath();ctx.arc(x1,y1,len,angle,angle-Math.PI/2,true);ctx.stroke();ctx.setLineDash([])
    drawMeasLabel(ctx,x1,y1,x2,y2,3,scale)
  }else if(type==='window'){
    ctx.strokeStyle='#47c4ff';ctx.lineWidth=4
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    const angle=Math.atan2(y2-y1,x2-x1),len=Math.sqrt((x2-x1)**2+(y2-y1)**2),perp=angle+Math.PI/2
    ctx.strokeStyle='rgba(71,196,255,0.6)';ctx.lineWidth=1
    for(let t=0.2;t<=0.8;t+=0.3){
      const px=x1+Math.cos(angle)*len*t,py=y1+Math.sin(angle)*len*t
      ctx.beginPath();ctx.moveTo(px+Math.cos(perp)*4,py+Math.sin(perp)*4);ctx.lineTo(px-Math.cos(perp)*4,py-Math.sin(perp)*4);ctx.stroke()
    }
    drawMeasLabel(ctx,x1,y1,x2,y2,4,scale)
  }else if(type==='measure'){
    ctx.strokeStyle='#e8ff47';ctx.lineWidth=1.5;ctx.setLineDash([6,4])
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])
    const angle=Math.atan2(y2-y1,x2-x1),perp=angle+Math.PI/2
    ctx.lineWidth=2
    for(const[px,py]of[[x1,y1],[x2,y2]]){ctx.beginPath();ctx.moveTo(px+Math.cos(perp)*6,py+Math.sin(perp)*6);ctx.lineTo(px-Math.cos(perp)*6,py-Math.sin(perp)*6);ctx.stroke()}
    drawMeasLabel(ctx,x1,y1,x2,y2,2,scale,'#e8ff47',true)
  }else if(type==='stair'){
    const minX=Math.min(x1,x2),minY=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1)
    ctx.strokeStyle=color||'#8888a0';ctx.lineWidth=1;ctx.strokeRect(minX,minY,w,h)
    const horiz=w>h,steps=Math.max(3,Math.round(horiz?w/15:h/15))
    ctx.lineWidth=0.8
    for(let i=1;i<steps;i++){ctx.beginPath();if(horiz){const sx=minX+w*i/steps;ctx.moveTo(sx,minY);ctx.lineTo(sx,minY+h)}else{const sy=minY+h*i/steps;ctx.moveTo(minX,sy);ctx.lineTo(minX+w,sy)};ctx.stroke()}
    ctx.strokeStyle='#e8ff47';ctx.lineWidth=1.5
    const ax=minX+w/2,ay1=minY+6,ay2=minY+h-6
    ctx.beginPath();ctx.moveTo(ax,ay1);ctx.lineTo(ax,ay2);ctx.moveTo(ax-4,ay2-6);ctx.lineTo(ax,ay2);ctx.lineTo(ax+4,ay2-6);ctx.stroke()
  }else if(type==='text'){
    ctx.font=(el.size||14)+'px Syne,sans-serif';ctx.fillStyle=el.textColor||'#f0f0f5';ctx.textAlign='left'
    ctx.fillText(el.text||'',el.x,el.y)
  }
  ctx.restore()
}

function drawMeasLabel(ctx,x1,y1,x2,y2,thick,scale,col,force){
  const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)
  if(len<20&&!force)return
  const m=(len*scale).toFixed(2)+'m',mx=(x1+x2)/2,my=(y1+y2)/2
  const angle=Math.atan2(dy,dx),perp=angle-Math.PI/2,off=thick/2+10
  ctx.save();ctx.translate(mx+Math.cos(perp)*off,my+Math.sin(perp)*off)
  if(Math.abs(angle)>Math.PI/2)ctx.rotate(angle+Math.PI);else ctx.rotate(angle)
  ctx.font='bold 10px monospace';const tw=ctx.measureText(m).width
  ctx.fillStyle='rgba(15,15,18,0.85)';ctx.fillRect(-tw/2-3,-9,tw+6,13)
  ctx.fillStyle=col||'#e8ff47';ctx.textAlign='center';ctx.fillText(m,0,0)
  ctx.restore()
}

function drawRectMeasures(ctx,minX,minY,w,h,scale){
  const mw=(w*scale).toFixed(2)+'m',mh=(h*scale).toFixed(2)+'m'
  ctx.font='bold 10px monospace'
  const tww=ctx.measureText(mw).width
  ctx.fillStyle='rgba(15,15,18,0.85)';ctx.fillRect(minX+w/2-tww/2-3,minY-14,tww+6,13)
  ctx.fillStyle='#e8ff47';ctx.textAlign='center';ctx.fillText(mw,minX+w/2,minY-4)
  ctx.save();ctx.translate(minX+w+14,minY+h/2);ctx.rotate(Math.PI/2)
  const twh=ctx.measureText(mh).width
  ctx.fillStyle='rgba(15,15,18,0.85)';ctx.fillRect(-twh/2-3,-12,twh+6,13)
  ctx.fillStyle='#e8ff47';ctx.fillText(mh,0,0);ctx.restore()
}

function hitTest(elements,x,y,zoom){
  const threshold=12/zoom
  for(let i=elements.length-1;i>=0;i--){
    const el=elements[i]
    if(el.type==='text'){if(Math.abs(x-el.x)<50&&Math.abs(y-el.y)<20)return el}
    else if(el.type==='room'){const minX=Math.min(el.x1,el.x2),minY=Math.min(el.y1,el.y2);if(x>=minX&&x<=minX+Math.abs(el.x2-el.x1)&&y>=minY&&y<=minY+Math.abs(el.y2-el.y1))return el}
    else if(el.x1!==undefined){if(segDist(x,y,el.x1,el.y1,el.x2,el.y2)<threshold)return el}
  }
  return null
}

function segDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy
  if(!len2)return Math.sqrt((px-x1)**2+(py-y1)**2)
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2))
  return Math.sqrt((px-(x1+t*dx))**2+(py-(y1+t*dy))**2)
}

function makeEl(type,x1,y1,x2,y2,color,thickness,colorIdx){
  const base={type,x1,y1,x2,y2,color,thickness}
  return type==='room'?{...base,fill:ROOM_COLORS[colorIdx%ROOM_COLORS.length]}:base
}

function exportPNG(elements,scale){
  const pad=60;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  elements.forEach(el=>{
    if(el.x1!==undefined){minX=Math.min(minX,el.x1,el.x2);minY=Math.min(minY,el.y1,el.y2);maxX=Math.max(maxX,el.x1,el.x2);maxY=Math.max(maxY,el.y1,el.y2)}
    else if(el.x!==undefined){minX=Math.min(minX,el.x);minY=Math.min(minY,el.y);maxX=Math.max(maxX,el.x+100);maxY=Math.max(maxY,el.y+30)}
  })
  if(minX===Infinity)return
  const W=maxX-minX+pad*2,H=maxY-minY+pad*2
  const exp=document.createElement('canvas');exp.width=W*2;exp.height=H*2
  const ec=exp.getContext('2d');ec.scale(2,2);ec.fillStyle='#0f0f12';ec.fillRect(0,0,W,H)
  ec.strokeStyle='rgba(255,255,255,0.03)';ec.lineWidth=0.5
  for(let x=0;x<W;x+=20){ec.beginPath();ec.moveTo(x,0);ec.lineTo(x,H);ec.stroke()}
  for(let y=0;y<H;y+=20){ec.beginPath();ec.moveTo(0,y);ec.lineTo(W,y);ec.stroke()}
  ec.save();ec.translate(pad-minX,pad-minY)
  const rooms=elements.filter(e=>e.type==='room'),rest=elements.filter(e=>e.type!=='room')
  ;[...rooms,...rest].forEach(el=>drawEl(ec,el,scale))
  ec.restore();ec.fillStyle='rgba(232,255,71,0.4)';ec.font='bold 10px monospace';ec.fillText('PLANTA PRO',12,H-8)
  const a=document.createElement('a');a.download='planta-baixa.png';a.href=exp.toDataURL();a.click()
}
