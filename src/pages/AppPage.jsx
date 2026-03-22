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
  const drawRef    = useRef({
    active:false, startX:0, startY:0,
    pinching:false, pinchDist:null,
    pointerDown:false, dragEl:null, dragOff:null,
    panning:false, panStart:null, panOrigin:null,
  })

  const [tool, setToolState]      = useState('wall')
  const [color, setColor]         = useState('#3a3a50')
  const [thickness, setThick]     = useState(8)
  const [snapOn, setSnapOn]       = useState(true)
  const [freeMode, setFreeMode]   = useState(false)
  const [scale]                   = useState(0.05)
  const [elements, setElements]   = useState([])
  const [history, setHistory]     = useState([])
  const [selectedEl, setSelectedEl] = useState(null)
  const [zoom, setZoom]           = useState(1)
  const [pan, setPan]             = useState({ x:40, y:40 })
  const [hint, setHint]           = useState('')
  const [showHint, setShowHint]   = useState(false)
  const [upsellModal, setUpsellModal] = useState(false)
  const [upsellMsg, setUpsellMsg]     = useState('')
  const [textModal, setTextModal]     = useState(false)
  const [textPending, setTextPending] = useState(null)
  const [textVal, setTextVal]     = useState('')
  const [textSize, setTextSize]   = useState(14)
  const [textColor, setTextColor] = useState('#f0f0f5')
  const [userMenu, setUserMenu]   = useState(false)
  const [roomColorIdx, setRoomColorIdx] = useState(0)
  const hintTimer = useRef(null)

  const stateRef = useRef({})
  stateRef.current = { tool, color, thickness, snapOn, freeMode, scale, user, isPro, roomColorIdx, pan, zoom, elements }

  function toast(msg) {
    setHint(msg); setShowHint(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setShowHint(false), 2500)
  }

  function trySetTool(t) {
    if (PRO_TOOLS.includes(t) && !isPro) {
      setUpsellMsg('A ferramenta "' + t + '" e exclusiva do plano PRO.')
      setUpsellModal(true)
      return
    }
    setToolState(t)
    drawRef.current.active = false
    setSelectedEl(null)
    clearOverlay()
    const hints = {
      wall:'Arraste para desenhar paredes (linhas retas)',
      room:'Arraste para criar um comodo',
      door:'Arraste para inserir uma porta',
      window:'Arraste para inserir uma janela',
      measure:'Arraste para medir distancias',
      stair:'Arraste para adicionar escada',
      text:'Toque onde deseja inserir texto',
      select:'Toque em um elemento para mover',
      delete:'Toque em um elemento para apagar',
      pan:'Arraste para mover a tela',
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

  function screenToWorld(sx, sy) {
    const s = stateRef.current
    return { x:(sx-s.pan.x)/s.zoom, y:(sy-s.pan.y)/s.zoom }
  }

  function snapPos(x, y) {
    const s = stateRef.current
    if (!s.snapOn) return {x,y}
    const g=20
    return { x:Math.round(x/g)*g, y:Math.round(y/g)*g }
  }

  function orthoSnap(startX, startY, x, y) {
    const s = stateRef.current
    if (s.freeMode) return {x, y}
    const dx = Math.abs(x - startX), dy = Math.abs(y - startY)
    if (dx >= dy) return { x, y:startY }
    return { x:startX, y }
  }

  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return

    function getPos(e) {
      const r = canvas.getBoundingClientRect()
      const cl = e.touches ? e.touches[0].clientX : e.clientX
      const ct = e.touches ? e.touches[0].clientY : e.clientY
      const w = screenToWorld(cl-r.left, ct-r.top)
      return snapPos(w.x, w.y)
    }

    function getRawScreen(e) {
      const r = canvas.getBoundingClientRect()
      const cl = e.touches ? e.touches[0].clientX : e.clientX
      const ct = e.touches ? e.touches[0].clientY : e.clientY
      return { x: cl - r.left, y: ct - r.top }
    }

    function pinchDist(t) {
      const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY
      return Math.sqrt(dx*dx+dy*dy)
    }

    function onDown(e) {
      if (e.touches?.length===2) {
        drawRef.current.pinching=true; drawRef.current.active=false
        drawRef.current.panning=false
        drawRef.current.pinchDist=pinchDist(e.touches); return
      }
      e.preventDefault()
      drawRef.current.pointerDown=true
      const s = stateRef.current

      if (s.tool === 'pan') {
        drawRef.current.panning = true
        drawRef.current.panStart = getRawScreen(e)
        drawRef.current.panOrigin = { x: s.pan.x, y: s.pan.y }
        return
      }

      const pos=getPos(e)
      if (s.tool==='text') { setTextPending(pos); setTextModal(true); return }
      if (s.tool==='select') {
        const el=hitTest(s.elements,pos.x,pos.y,s.zoom)
        setSelectedEl(el||null)
        if (el) { drawRef.current.dragEl=el; drawRef.current.dragOff={x:pos.x-(el.x1??el.x??0), y:pos.y-(el.y1??el.y??0)} }
        return
      }
      if (s.tool==='delete') {
        const el=hitTest(s.elements,pos.x,pos.y,s.zoom)
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

      if (drawRef.current.panning) {
        const cur = getRawScreen(e)
        const ox = drawRef.current.panOrigin.x + cur.x - drawRef.current.panStart.x
        const oy = drawRef.current.panOrigin.y + cur.y - drawRef.current.panStart.y
        setPan({ x: ox, y: oy })
        return
      }

      const s = stateRef.current
      const pos=getPos(e)
      if (s.tool==='select' && drawRef.current.dragEl) {
        const el=drawRef.current.dragEl
        const dx=pos.x-drawRef.current.dragOff.x, dy=pos.y-drawRef.current.dragOff.y
        const mw=(el.x2??0)-(el.x1??el.x??0), mh=(el.y2??0)-(el.y1??el.y??0)
        setElements(prev=>prev.map(e=>e!==el?e:e.x1!==undefined?{...e,x1:dx,y1:dy,x2:dx+mw,y2:dy+mh}:{...e,x:dx,y:dy}))
        return
      }
      if (drawRef.current.active) {
        const snapped = orthoSnap(drawRef.current.startX, drawRef.current.startY, pos.x, pos.y)
        const oc=getOCtx(); if(!oc) return
        oc.clearRect(0,0,overlayRef.current.width,overlayRef.current.height)
        oc.save(); oc.translate(s.pan.x,s.pan.y); oc.scale(s.zoom,s.zoom); oc.globalAlpha=0.6
        drawEl(oc,{type:s.tool,x1:drawRef.current.startX,y1:drawRef.current.startY,
          x2:snapped.x,y2:snapped.y,color:s.color,thickness:s.thickness,
          fill:ROOM_COLORS[s.roomColorIdx%ROOM_COLORS.length]},s.scale)
        oc.restore()
      }
    }

    function onUp(e) {
      drawRef.current.pinching=false; drawRef.current.dragEl=null
      if (drawRef.current.panning) { drawRef.current.panning=false; drawRef.current.pointerDown=false; return }
      if (!drawRef.current.active) { drawRef.current.pointerDown=false; return }
      drawRef.current.active=false; drawRef.current.pointerDown=false
      const s = stateRef.current
      const pos=getPos(e)
      const snapped = orthoSnap(drawRef.current.startX, drawRef.current.startY, pos.x, pos.y)
      const dx=snapped.x-drawRef.current.startX, dy=snapped.y-drawRef.current.startY
      if (Math.sqrt(dx*dx+dy*dy)<5) { clearOverlay(); return }
      if (!canAddElement(s.user,s.elements.length)) {
        setUpsellMsg('O plano Free permite ate 10 elementos. Faca upgrade para ilimitado!')
        setUpsellModal(true); clearOverlay(); return
      }
      saveHistory()
      const el=makeEl(s.tool,drawRef.current.startX,drawRef.current.startY,snapped.x,snapped.y,s.color,s.thickness,s.roomColorIdx)
      if (el) { setElements(prev=>[...prev,el]); if(s.tool==='room') setRoomColorIdx(i=>i+1) }
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
  }, [])

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
    if (!canExport(user)) { setUpsellMsg('Exportar PNG e exclusivo do plano PRO.'); setUpsellModal(true); return }
    exportPNG(elements,scale); toast('PNG exportado!')
  }

  function confirmText() {
    if (!textVal.trim()||!textPending) { setTextModal(false); return }
    saveHistory()
    setElements(prev=>[...prev,{type:'text',x:textPending.x,y:textPending.y,text:textVal,size:textSize,textColor}])
    setTextModal(false); setTextVal(''); toast('Texto adicionado')
  }

  const TOOLS = [
    {id:'wall',   icon:'▬', label:'PAREDE'},
    {id:'room',   icon:'⬜', label:'COMODO'},
    {id:'door',   icon:'🚪', label:'PORTA',  pro:true},
    {id:'window', icon:'⬛', label:'JANELA', pro:true},
    {id:'measure',icon:'📏', label:'MEDIDA', pro:true},
    {id:'stair',  icon:'🪜', label:'ESCADA', pro:true},
    {id:'text',   icon:'T',  label:'TEXTO',  pro:true},
    null,
    {id:'pan',    icon:'✋', label:'MOVER TELA'},
    {id:'select', icon:'↖',  label:'MOVER EL'},
    {id:'delete', icon:'✕',  label:'APAGAR'},
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
            {isPro?'PRO':'FREE'}
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
            <p style={{fontSize:13,fontWeight:700,marginBottom:2}}>{user?.name||'Usuario'}</p>
            <p style={{fontSize:11,color:'var(--text2)',marginBottom:12}}>{user?.email}</p>
            <button onClick={()=>navigate('/pricing')} style={menuBtnStyle}>{isPro?'Conta PRO':'Upgrade PRO'}</button>
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
              flexShrink:0,height:46,minWidth:52,padding:'0 6px',border:'1px solid var(--border)',
              background:'var(--surface2)',color:'var(--text2)',borderRadius:10,display:'flex',
              flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,cursor:'pointer',position:'relative',
              ...(tool===t.id?{borderColor:'var(--accent)',background:'rgba(232,255,71,0.1)',color:'var(--accent)'}:{}),
              ...(locked?{opacity:0.5}:{}),
            }}>
              <span style={{fontSize:17}}>{t.icon}</span>
              <span style={{fontSize:7,textAlign:'center',lineHeight:1.2}}>{t.label}</span>
              {locked&&<span style={{position:'absolute',top:-5,right:-5,background:'var(--accent)',
                color:'#0f0f12',fontSize:7,fontWeight:800,fontFamily:'monospace',padding:'1px 4px',borderRadius:4}}>PRO</span>}
            </button>
          )
        })}
      </div>

      <div ref={wrapRef} style={{flex:1,position:'relative',overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{position:'absolute',top:0,left:0}}/>
        <canvas ref={overlayRef} style={{position:'absolute',top:0,left:0,
          touchAction:'none',cursor:tool==='pan'?'grab':'crosshair'}}/>
        <div style={{position:'absolute',bottom:14,right:14,display:'flex',flexDirection:'column',gap:4,zIndex:10}}>
          {[{l:'+',f:()=>setZoom(z=>Math.min(4,z*1.25))},
            {l:'-',f:()=>setZoom(z=>Math.max(0.2,z/1.25))},
            {l:'FIT',f:()=>{setZoom(1);setPan({x:40,y:40})}}].map(b=>(
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
            {elements.length}/10
            <button onClick={()=>navigate('/pricing')} style={{background:'var(--accent3)',border:'none',
              color:'white',fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:6,cursor:'pointer'}}>PRO</button>
          </div>
        )}
      </div>

      <div style={{background:'var(--surface)',borderTop:'1px solid var(--bord
