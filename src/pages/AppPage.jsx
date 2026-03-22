import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { canAddElement, canExport, PRO_TOOLS } from '../lib/plans'
import { doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

const ROOM_COLORS = [
  'rgba(232,255,71,0.08)','rgba(71,196,255,0.08)',
  'rgba(255,107,71,0.08)','rgba(107,255,71,0.08)',
  'rgba(200,71,255,0.08)','rgba(255,200,71,0.08)',
]

const SCALE = 0.02 // 1px = 0.02m (antes era 0.05) — escala maior visualmente

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

  const [tool, setToolState]      = useState('pan')
  const [color, setColor]         = useState('#3a3a50')
  const [thickness, setThick]     = useState(2)
  const [snapOn, setSnapOn]       = useState(true)
  const [freeMode, setFreeMode]   = useState(false)
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
  const [helpModal, setHelpModal] = useState(false)
  const [saveModal, setSaveModal] = useState(false)
  const [loadModal, setLoadModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projects, setProjects]   = useState([])
  const [saveBusy, setSaveBusy]   = useState(false)
  const [roomColorIdx, setRoomColorIdx] = useState(0)
  const hintTimer = useRef(null)

  const stateRef = useRef({})
  stateRef.current = { tool, color, thickness, snapOn, freeMode, user, isPro, roomColorIdx, pan, zoom, elements }

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
      wall:'Arraste para desenhar paredes',
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

  // Save project
  async function saveProject() {
    if (!user || !projectName.trim()) return
    setSaveBusy(true)
    try {
      await setDoc(doc(db, 'users', user.uid, 'projects', projectName.trim()), {
        name: projectName.trim(),
        elements,
        updatedAt: serverTimestamp(),
      })
      toast('Projeto salvo!')
      setSaveModal(false)
      setProjectName('')
    } catch(e) { toast('Erro ao salvar') }
    finally { setSaveBusy(false) }
  }

  // Load projects list
  async function openLoadModal() {
    if (!user) return
    const snap = await getDocs(collection(db, 'users', user.uid, 'projects'))
    setProjects(snap.docs.map(d => d.data()))
    setLoadModal(true)
  }

  // Load a project
  async function loadProject(name) {
    const snap = await getDoc(doc(db, 'users', user.uid, 'projects', name))
    if (snap.exists()) {
      saveHistory()
      setElements(snap.data().elements || [])
      setLoadModal(false)
      toast('Projeto carregado!')
    }
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
        setPan({
          x: drawRef.current.panOrigin.x + cur.x - drawRef.current.panStart.x,
          y: drawRef.current.panOrigin.y + cur.y - drawRef.current.panStart.y,
        })
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
          fill:ROOM_COLORS[s.roomColorIdx%ROOM_COLORS.length]},SCALE)
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
        setUpsellMsg('O plano Free permite ate 10 elementos. Faca upgrade!')
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
    ;[...rooms,...rest].forEach(el=>drawEl(ctx,el,SCALE))
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
    exportPNG(elements,SCALE); toast('PNG exportado!')
  }

  function confirmText() {
    if (!textVal.trim()||!textPending) { setTextModal(false); return }
    saveHistory()
    setElements(prev=>[...prev,{type:'text',x:textPending.x,y:textPending.y,text:textVal,size:textSize,textColor}])
    setTextModal(false); setTextVal(''); toast('Texto adicionado')
  }

  const TOOLS = [
    {id:'wall',   icon:'▬', label:'Parede',  desc:'Desenha paredes'},
    {id:'room',   icon:'⬜', label:'Comodo',  desc:'Cria ambientes'},
    {id:'door',   icon:'🚪', label:'Porta',   desc:'Insere porta',   pro:true},
    {id:'window', icon:'⬛', label:'Janela',  desc:'Insere janela',  pro:true},
    {id:'measure',icon:'📏', label:'Medida',  desc:'Linha de cota',  pro:true},
    {id:'stair',  icon:'🪜', label:'Escada',  desc:'Adiciona escada',pro:true},
    {id:'text',   icon:'T',  label:'Texto',   desc:'Etiqueta',       pro:true},
  ]

  const ACTIONS = [
    {id:'pan',    icon:'✋', label:'Mover',   desc:'Move a tela'},
    {id:'select', icon:'↖',  label:'Editar',  desc:'Move elementos'},
    {id:'delete', icon:'✕',  label:'Apagar',  desc:'Apaga elementos'},
  ]

  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg)'}}>

      {/* HEADER */}
      <header style={{height:52,background:'var(--surface)',borderBottom:'1px solid var(--border)',
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',
        flexShrink:0,position:'relative',zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:9,height:9,background:'var(--accent)',borderRadius:'50%',boxShadow:'0 0 8px var(--accent)'}}/>
          <span style={{fontSize:15,fontWeight:800,letterSpacing:-0.5}}>PLANTA PRO</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {/* Salvar */}
          <button onClick={()=>setSaveModal(true)} style={{...hdrBtn, color:'var(--accent2)'}}>💾</button>
          {/* Carregar */}
          <button onClick={openLoadModal} style={{...hdrBtn, color:'var(--accent2)'}}>📂</button>
          {/* Ajuda */}
          <button onClick={()=>setHelpModal(true)} style={{...hdrBtn, color:'var(--text2)'}}>?</button>
          {/* Plano */}
          <div onClick={()=>navigate('/pricing')} style={{padding:'4px 8px',borderRadius:20,fontSize:10,
            fontWeight:700,fontFamily:'monospace',cursor:'pointer',border:'1px solid',
            ...(isPro?{background:'rgba(232,255,71,0.15)',color:'var(--accent)',borderColor:'rgba(232,255,71,0.3)'}
                     :{background:'var(--surface2)',color:'var(--text2)',borderColor:'var(--border)'})}}>
            {isPro?'PRO':'FREE'}
          </div>
          {/* Avatar */}
          <div onClick={()=>setUserMenu(m=>!m)} style={{width:32,height:32,borderRadius:'50%',
            background:'var(--surface2)',border:'1px solid var(--border)',display:'flex',
            alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,cursor:'pointer',overflow:'hidden'}}>
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

      {/* TOOLBAR */}
      <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',
        display:'flex',flexDirection:'column',flexShrink:0}}>

        {/* Drawing tools */}
        <div style={{display:'flex',alignItems:'center',gap:4,padding:'6px 10px',
          overflowX:'auto',scrollbarWidth:'none'}}>
          <span style={{fontSize:9,color:'var(--text2)',fontFamily:'monospace',
            flexShrink:0,marginRight:2}}>DESENHAR</span>
          {TOOLS.map(t=>{
            const locked=t.pro&&!isPro
            return (
              <button key={t.id} onClick={()=>trySetTool(t.id)} title={t.desc} style={{
                flexShrink:0,height:44,minWidth:50,padding:'0 6px',
                border:'2px solid',borderRadius:10,display:'flex',
                flexDirection:'column',alignItems:'center',justifyContent:'center',
                gap:2,cursor:'pointer',position:'relative',transition:'all 0.15s',
                borderColor: tool===t.id ? 'var(--accent)' : 'var(--border)',
                background: tool===t.id ? 'rgba(232,255,71,0.12)' : 'var(--surface2)',
                color: tool===t.id ? 'var(--accent)' : locked ? 'var(--text2)' : 'var(--text)',
                opacity: locked ? 0.5 : 1,
              }}>
                <span style={{fontSize:16}}>{t.icon}</span>
                <span style={{fontSize:8,fontWeight:600}}>{t.label}</span>
                {locked&&<span style={{position:'absolute',top:-5,right:-5,background:'var(--accent)',
                  color:'#0f0f12',fontSize:7,fontWeight:800,fontFamily:'monospace',
                  padding:'1px 4px',borderRadius:4}}>PRO</span>}
              </button>
            )
          })}

          <div style={{width:1,height:30,background:'var(--border)',flexShrink:0,margin:'0 2px'}}/>

          {/* Action tools */}
          <span style={{fontSize:9,color:'var(--text2)',fontFamily:'monospace',
            flexShrink:0,marginRight:2}}>ACAO</span>
          {ACTIONS.map(t=>(
            <button key={t.id} onClick={()=>trySetTool(t.id)} title={t.desc} style={{
              flexShrink:0,height:44,minWidth:50,padding:'0 6px',
              border:'2px solid',borderRadius:10,display:'flex',
              flexDirection:'column',alignItems:'center',justifyContent:'center',
              gap:2,cursor:'pointer',transition:'all 0.15s',
              borderColor: tool===t.id ? 'var(--accent2)' : 'var(--border)',
              background: tool===t.id ? 'rgba(71,196,255,0.12)' : 'var(--surface2)',
              color: tool===t.id ? 'var(--accent2)' : 'var(--text)',
            }}>
              <span style={{fontSize:16}}>{t.icon}</span>
              <span style={{fontSize:8,fontWeight:600}}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Options bar */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 10px 6px',
          borderTop:'1px solid var(--border)',flexWrap:'wrap'}}>

          {/* Espessura */}
          <span style={labelStyle}>Esp.</span>
          <input type="range" min="1" max="20" value={thickness} style={{width:55}}
            onChange={e=>setThick(+e.target.value)}/>
          <span style={{...labelStyle,color:'var(--accent2)',fontFamily:'monospace',minWidth:14}}>{thickness}</span>

          {/* Cor */}
          <span style={{...labelStyle,marginLeft:4}}>Cor</span>
          {['#3a3a50','#5a4a3a','#2a4a3a','#4a2a2a','#2a3a5a','#e8ff47'].map(c=>(
            <div key={c} onClick={()=>setColor(c)} style={{width:16,height:16,borderRadius:4,background:c,cursor:'pointer',flexShrink:0,
              border:'2px solid '+(color===c?'var(--accent)':'transparent'),
              transform:color===c?'scale(1.2)':'scale(1)',transition:'all 0.15s'}}/>
          ))}

          {/* Modo linha */}
          <div style={{display:'flex',alignItems:'center',gap:4,marginLeft:4,
            background:'var(--surface2)',border:'1px solid var(--border)',
            borderRadius:8,padding:'2px 4px'}}>
            <button onClick={()=>setFreeMode(false)} style={{
              padding:'3px 8px',borderRadius:6,fontSize:10,fontFamily:'monospace',
              border:'none',cursor:'pointer',fontWeight:700,
              background: !freeMode ? 'var(--accent)' : 'transparent',
              color: !freeMode ? '#0f0f12' : 'var(--text2)',
            }}>RETO</button>
            <button onClick={()=>setFreeMode(true)} style={{
              padding:'3px 8px',borderRadius:6,fontSize:10,fontFamily:'monospace',
              border:'none',cursor:'pointer',fontWeight:700,
              background: freeMode ? 'var(--accent3)' : 'transparent',
              color: freeMode ? 'white' : 'var(--text2)',
            }}>LIVRE</button>
          </div>

          {/* Desfazer */}
          <button onClick={undo} style={{...actionBtn, marginLeft:4}} title="Desfazer (Ctrl+Z)">
            ↩ Desfazer
          </button>

          {/* Exportar */}
          <button onClick={doExport} style={actionBtn} title="Exportar PNG">
            ↗ PNG
          </button>

          {/* Limpar */}
          <button onClick={()=>{if(confirm('Limpar tudo?')){saveHistory();setElements([])}}}
            style={{...actionBtn,color:'var(--accent3)',borderColor:'rgba(255,107,71,0.3)'}}>
            ✕ Limpar
          </button>
        </div>
      </div>

      {/* CANVAS */}
      <div ref={wrapRef} style={{flex:1,position:'relative',overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{position:'absolute',top:0,left:0}}/>
        <canvas ref={overlayRef} style={{position:'absolute',top:0,left:0,
          touchAction:'none',cursor:tool==='pan'?'grab':'crosshair'}}/>

        {/* Mover tela — sempre visivel */}
        <button onClick={()=>trySetTool('pan')} style={{
          position:'absolute',bottom:60,right:14,
          width:48,height:48,borderRadius:14,
          background: tool==='pan' ? 'var(--accent)' : 'var(--surface)',
          border:'2px solid '+(tool==='pan'?'var(--accent)':'var(--border)'),
          color: tool==='pan' ? '#0f0f12' : 'var(--text)',
          fontSize:22,cursor:'pointer',zIndex:10,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:'0 4px 12px rgba(0,0,0,0.4)',
        }}>✋</button>

        {/* Zoom controls */}
        <div style={{position:'absolute',bottom:14,right:14,display:'flex',flexDirection:'column',gap:4,zIndex:10}}>
          <button onClick={()=>setZoom(z=>Math.min(4,z*1.25))} style={zoomBtn}>+</button>
          <button onClick={()=>setZoom(z=>Math.max(0.2,z/1.25))} style={zoomBtn}>−</button>
          <button onClick={()=>{setZoom(1);setPan({x:40,y:40})}}
            style={{...zoomBtn,fontSize:8,fontFamily:'monospace',padding:'0 4px'}}>
            CTR
          </button>
        </div>

        {/* Free limit */}
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

      {/* STATUS */}
      <div style={{height:26,background:'var(--bg)',borderTop:'1px solid var(--border)',
        display:'flex',alignItems:'center',padding:'0 12px',gap:12,flexShrink:0}}>
        <span style={statusItem}><span style={{color:'var(--text2)'}}>Ferr:</span> {tool}</span>
        <span style={statusItem}><span style={{color:'var(--text2)'}}>Linha:</span> {freeMode?'Livre':'Reta'}</span>
        <span style={statusItem}><span style={{color:'var(--text2)'}}>Zoom:</span> {Math.round(zoom*100)}%</span>
        <span style={statusItem}><span style={{color:'var(--text2)'}}>Elem:</span> {elements.length}{!isPro?'/10':''}</span>
      </div>

      {/* HINT */}
      <div style={{position:'fixed',top:110,left:'50%',transform:'translateX(-50%)',
        background:'rgba(232,255,71,0.12)',border:'1px solid var(--accent)',color:'var(--accent)',
        fontFamily:'monospace',fontSize:11,padding:'6px 14px',borderRadius:20,
        pointerEvents:'none',zIndex:500,whiteSpace:'nowrap',
        opacity:showHint?1:0,transition:'opacity 0.3s'}}>{hint}</div>

      {/* UPSELL MODAL */}
      {upsellModal&&(
        <div style={overlayStyle} onClick={()=>setUpsellModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <div style={{fontSize:32,textAlign:'center',marginBottom:10}}>⚡</div>
            <h3 style={{fontSize:18,fontWeight:800,textAlign:'center',marginBottom:8}}>Recurso PRO</h3>
            <p style={{color:'var(--text2)',fontSize:13,textAlign:'center',marginBottom:20,lineHeight:1.6}}>{upsellMsg}</p>
            <button onClick={()=>{setUpsellModal(false);navigate('/pricing')}}
              style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>Ver planos</button>
            <button onClick={()=>setUpsellModal(false)}
              style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>
              Agora nao</button>
          </div>
        </div>
      )}

      {/* TEXT MODAL */}
      {textModal&&(
        <div style={overlayStyle} onClick={()=>setTextModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Adicionar Texto</h3>
            <input placeholder="Ex: Sala de Estar" value={textVal}
              onChange={e=>setTextVal(e.target.value)} autoFocus
              style={{...inputStyle,marginBottom:10,width:'100%'}}/>
            <div style={{display:'flex',gap:10,marginBottom:16}}>
              <div style={{flex:1}}>
                <p style={{fontSize:10,color:'var(--text2)',marginBottom:4}}>TAMANHO</p>
                <input type="number" value={textSize} min={8} max={48}
                  onChange={e=>setTextSize(+e.target.value)} style={{...inputStyle,width:'100%'}}/>
              </div>
              <div style={{flex:1}}>
                <p style={{fontSize:10,color:'var(--text2)',marginBottom:4}}>COR</p>
                <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)}
                  style={{...inputStyle,padding:4,height:40,width:'100%'}}/>
              </div>
            </div>
            <button onClick={confirmText}
              style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>ADICIONAR</button>
            <button onClick={()=>setTextModal(false)}
              style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>
              Cancelar</button>
          </div>
        </div>
      )}

      {/* SAVE MODAL */}
      {saveModal&&(
        <div style={overlayStyle} onClick={()=>setSaveModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Salvar Projeto</h3>
            <input placeholder="Nome do projeto (ex: Casa Principal)"
              value={projectName} onChange={e=>setProjectName(e.target.value)} autoFocus
              style={{...inputStyle,marginBottom:16,width:'100%'}}/>
            <button onClick={saveProject} disabled={saveBusy||!projectName.trim()}
              style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12',
                opacity:saveBusy||!projectName.trim()?0.6:1}}>
              {saveBusy?'Salvando...':'Salvar'}
            </button>
            <button onClick={()=>setSaveModal(false)}
              style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>
              Cancelar</button>
          </div>
        </div>
      )}

      {/* LOAD MODAL */}
      {loadModal&&(
        <div style={overlayStyle} onClick={()=>setLoadModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Meus Projetos</h3>
            {projects.length===0
              ? <p style={{color:'var(--text2)',textAlign:'center',fontSize:13,marginBottom:16}}>
                  Nenhum projeto salvo ainda.
                </p>
              : <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                  {projects.map(p=>(
                    <button key={p.name} onClick={()=>loadProject(p.name)} style={{
                      padding:'12px 16px',background:'var(--surface2)',
                      border:'1px solid var(--border)',borderRadius:10,
                      color:'var(--text)',fontSize:14,cursor:'pointer',textAlign:'left',
                      display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span>{p.name}</span>
                      <span style={{fontSize:11,color:'var(--text2)'}}>
                        {p.elements?.length||0} elem
                      </span>
                    </button>
                  ))}
                </div>
            }
            <button onClick={()=>setLoadModal(false)}
              style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>
              Fechar</button>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {helpModal&&(
        <div style={{...overlayStyle,alignItems:'flex-start',overflowY:'auto'}}
          onClick={()=>setHelpModal(false)}>
          <div style={{...modalStyle,borderRadius:20,margin:'20px auto',maxHeight:'none'}}
            onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:800,marginBottom:4}}>Como usar o Planta Pro</h3>
            <p style={{fontSize:12,color:'var(--text2)',marginBottom:20}}>Guia completo de funcionalidades</p>

            {[
              { icon:'▬', title:'Parede', desc:'Arraste para desenhar uma parede. No modo RETO, a linha fica sempre horizontal ou vertical. No modo LIVRE, pode ser em qualquer angulo.' },
              { icon:'⬜', title:'Comodo', desc:'Arraste para criar um comodo (retangulo). Mostra as medidas em metros automaticamente.' },
              { icon:'🚪', title:'Porta (PRO)', desc:'Arraste para inserir uma porta. Aparece com o arco de abertura para indicar o sentido.' },
              { icon:'⬛', title:'Janela (PRO)', desc:'Arraste para inserir uma janela na parede.' },
              { icon:'📏', title:'Medida (PRO)', desc:'Arraste para criar uma linha de cota e medir distancias em metros.' },
              { icon:'🪜', title:'Escada (PRO)', desc:'Arraste para criar uma escada com degraus e seta de subida.' },
              { icon:'T', title:'Texto (PRO)', desc:'Toque em qualquer lugar para adicionar uma etiqueta de texto (ex: nome do comodo).' },
              { icon:'✋', title:'Mover Tela', desc:'Arraste para navegar pelo canvas sem desenhar. Tambem pode usar 2 dedos para mover e pincar para zoom.' },
              { icon:'↖', title:'Editar Elemento', desc:'Toque em um elemento para seleciona-lo e depois arraste para mover de lugar.' },
              { icon:'✕', title:'Apagar', desc:'Toque em qualquer elemento para remove-lo do canvas.' },
              { icon:'↩', title:'Desfazer', desc:'Desfaz a ultima acao. Pode desfazer ate 50 acoes.' },
              { icon:'↗', title:'Exportar PNG (PRO)', desc:'Salva a planta como imagem PNG em alta resolucao.' },
              { icon:'💾', title:'Salvar Projeto', desc:'Salva o projeto na nuvem com um nome. Voce pode ter varios projetos.' },
              { icon:'📂', title:'Carregar Projeto', desc:'Abre um projeto salvo anteriormente.' },
              { icon:'RETO/LIVRE', title:'Modo de Linha', desc:'RETO: paredes e linhas ficam sempre em angulo reto (horizontal ou vertical). LIVRE: pode desenhar em qualquer direcao.' },
              { icon:'+/−', title:'Zoom', desc:'Aumenta ou diminui o zoom do canvas. CTR centraliza a visao.' },
            ].map((item,i)=>(
              <div key={i} style={{display:'flex',gap:14,marginBottom:16,
                padding:12,background:'var(--surface2)',borderRadius:12,
                border:'1px solid var(--border)'}}>
                <div style={{fontSize:20,flexShrink:0,width:32,textAlign:'center',
                  paddingTop:2,fontFamily:'monospace'}}>{item.icon}</div>
                <div>
                  <p style={{fontSize:13,fontWeight:700,marginBottom:3}}>{item.title}</p>
                  <p style={{fontSize:12,color:'var(--text2)',lineHeight:1.5}}>{item.desc}</p>
                </div>
              </div>
            ))}

            <button onClick={()=>setHelpModal(false)}
              style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>
              Entendi!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const labelStyle    = {fontSize:10,fontFamily:'monospace',color:'var(--text2)',letterSpacing:0.3,flexShrink:0}
const statusItem    = {fontSize:10,fontFamily:'monospace',color:'var(--accent2)'}
const menuBtnStyle  = {display:'block',width:'100%',padding:'10px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,cursor:'pointer',marginBottom:6,textAlign:'left'}
const overlayStyle  = {position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}
const modalStyle    = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'20px 20px 0 0',padding:20,width:'100%',maxWidth:460,maxHeight:'85dvh',overflowY:'auto'}
const handleStyle   = {width:40,height:4,background:'var(--border)',borderRadius:2,margin:'0 auto 16px'}
const modalBtnStyle = {display:'block',width:'100%',padding:14,border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:8}
const inputStyle    = {padding:'11px 13px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)',fontSize:14,outline:'none'}
const hdrBtn        = {width:32,height:32,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}
const actionBtn     = {padding:'4px 10px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text2)',fontSize:11,fontFamily:'monospace',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',gap:4}
const zoomBtn       = {width:36,height:36,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:9,fontSize:18,fontFamily:'monospace',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}

// ─── Drawing functions ─────────────────────────────────────────────────────────
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
    ctx.strokeStyle=color||'#3a3a50';ctx.lineWidth=thickness||2;ctx.lineCap='square';ctx.lineJoin='miter'
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    drawMeasLabel(ctx,x1,y1,x2,y2,thickness||2,scale)
  }else if(type==='room'){
    const minX=Math.min(x1,x2),minY=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1)
    ctx.fillStyle=el.fill||'rgba(232,255,71,0.08)';ctx.fillRect(minX,minY,w,h)
    ctx.strokeStyle=color||'#3a3a50';ctx.lineWidth=thickness||2;ctx.strokeRect(minX,minY,w,h)
    if(w>30&&h>30)drawRectMeasures(ctx,minX,minY,w,h,scale)
  }else if(type==='door'){
    ctx.strokeStyle='#e8a847';ctx.lineWidth=2
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    const len=Math.sqrt((x2-x1)**2+(y2-y1)**2),angle=Math.atan2(y2-y1,x2-x1)
    ctx.strokeStyle='rgba(232,168,71,0.4)';ctx.lineWidth=1;ctx.setLineDash([4,4])
    ctx.beginPath();ctx.arc(x1,y1,len,angle,angle-Math.PI/2,true);ctx.stroke();ctx.setLineDash([])
    drawMeasLabel(ctx,x1,y1,x2,y2,2,scale)
  }else if(type==='window'){
    ctx.strokeStyle='#47c4ff';ctx.lineWidth=3
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    const angle=Math.atan2(y2-y1,x2-x1),len=Math.sqrt((x2-x1)**2+(y2-y1)**2),perp=angle+Math.PI/2
    ctx.strokeStyle='rgba(71,196,255,0.5)';ctx.lineWidth=1
    for(let t=0.2;t<=0.8;t+=0.3){
      const px=x1+Math.cos(angle)*len*t,py=y1+Math.sin(angle)*len*t
      ctx.beginPath();ctx.moveTo(px+Math.cos(perp)*4,py+Math.sin(perp)*4)
      ctx.lineTo(px-Math.cos(perp)*4,py-Math.sin(perp)*4);ctx.stroke()
    }
    drawMeasLabel(ctx,x1,y1,x2,y2,3,scale)
  }else if(type==='measure'){
    ctx.strokeStyle='rgba(232,255,71,0.6)';ctx.lineWidth=1;ctx.setLineDash([5,4])
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])
    const angle=Math.atan2(y2-y1,x2-x1),perp=angle+Math.PI/2
    ctx.lineWidth=1.5
    for(const[px,py]of[[x1,y1],[x2,y2]]){
      ctx.beginPath();ctx.moveTo(px+Math.cos(perp)*5,py+Math.sin(perp)*5)
      ctx.lineTo(px-Math.cos(perp)*5,py-Math.sin(perp)*5);ctx.stroke()
    }
    drawMeasLabel(ctx,x1,y1,x2,y2,1,scale,'rgba(232,255,71,0.8)',true)
  }else if(type==='stair'){
    const minX=Math.min(x1,x2),minY=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1)
    ctx.strokeStyle=color||'#8888a0';ctx.lineWidth=1;ctx.strokeRect(minX,minY,w,h)
    const horiz=w>h,steps=Math.max(3,Math.round(horiz?w/15:h/15))
    ctx.lineWidth=0.6
    for(let i=1;i<steps;i++){
      ctx.beginPath()
      if(horiz){const sx=minX+w*i/steps;ctx.moveTo(sx,minY);ctx.lineTo(sx,minY+h)}
      else{const sy=minY+h*i/steps;ctx.moveTo(minX,sy);ctx.lineTo(minX+w,sy)}
      ctx.stroke()
    }
    ctx.strokeStyle='rgba(232,255,71,0.6)';ctx.lineWidth=1
    const ax=minX+w/2,ay1=minY+6,ay2=minY+h-6
    ctx.beginPath();ctx.moveTo(ax,ay1);ctx.lineTo(ax,ay2)
    ctx.moveTo(ax-4,ay2-6);ctx.lineTo(ax,ay2);ctx.lineTo(ax+4,ay2-6);ctx.stroke()
  }else if(type==='text'){
    ctx.font=(el.size||14)+'px Syne,sans-serif'
    ctx.fillStyle=el.textColor||'#f0f0f5';ctx.textAlign='left'
    ctx.fillText(el.text||'',el.x,el.y)
  }
  ctx.restore()
}

function drawMeasLabel(ctx,x1,y1,x2,y2,thick,scale,col,force){
  const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)
  if(len<20&&!force)return
  const m=(len*scale).toFixed(2)+'m',mx=(x1+x2)/2,my=(y1+y2)/2
  const angle=Math.atan2(dy,dx),perp=angle-Math.PI/2,off=thick/2+8
  ctx.save();ctx.translate(mx+Math.cos(perp)*off,my+Math.sin(perp)*off)
  if(Math.abs(angle)>Math.PI/2)ctx.rotate(angle+Math.PI);else ctx.rotate(angle)
  ctx.font='9px monospace'
  const tw=ctx.measureText(m).width
  ctx.fillStyle='rgba(15,15,18,0.7)'
  ctx.fillRect(-tw/2-2,-8,tw+4,11)
  ctx.fillStyle=col||'rgba(232,255,71,0.7)'
  ctx.textAlign='center';ctx.fillText(m,0,0)
  ctx.restore()
}

function drawRectMeasures(ctx,minX,minY,w,h,scale){
  const mw=(w*scale).toFixed(2)+'m',mh=(h*scale).toFixed(2)+'m'
  ctx.font='9px monospace'
  const tww=ctx.measureText(mw).width
  ctx.fillStyle='rgba(15,15,18,0.7)'
  ctx.fillRect(minX+w/2-tww/2-2,minY-13,tww+4,11)
  ctx.fillStyle='rgba(232,255,71,0.7)'
  ctx.textAlign='center';ctx.fillText(mw,minX+w/2,minY-4)
  ctx.save();ctx.translate(minX+w+12,minY+h/2);ctx.rotate(Math.PI/2)
  const twh=ctx.measureText(mh).width
  ctx.fillStyle='rgba(15,15,18,0.7)'
  ctx.fillRect(-twh/2-2,-11,twh+4,11)
  ctx.fillStyle='rgba(232,255,71,0.7)'
  ctx.fillText(mh,0,0);ctx.restore()
}

function hitTest(elements,x,y,zoom){
  const threshold=12/zoom
  for(let i=elements.length-1;i>=0;i--){
    const el=elements[i]
    if(el.type==='text'){if(Math.abs(x-el.x)<50&&Math.abs(y-el.y)<20)return el}
    else if(el.type==='room'){
      const minX=Math.min(el.x1,el.x2),minY=Math.min(el.y1,el.y2)
      if(x>=minX&&x<=minX+Math.abs(el.x2-el.x1)&&y>=minY&&y<=minY+Math.abs(el.y2-el.y1))return el
    }else if(el.x1!==undefined){if(segDist(x,y,el.x1,el.y1,el.x2,el.y2)<threshold)return el}
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
  ec.save();ec.translate(pad-minX,pad-minY)
  const rooms=elements.filter(e=>e.type==='room'),rest=elements.filter(e=>e.type!=='room')
  ;[...rooms,...rest].forEach(el=>drawEl(ec,el,scale))
  ec.restore();ec.fillStyle='rgba(232,255,71,0.4)';ec.font='bold 10px monospace'
  ec.fillText('PLANTA PRO',12,H-8)
  const a=document.createElement('a');a.download='planta-baixa.png';a.href=exp.toDataURL();a.click()
}
