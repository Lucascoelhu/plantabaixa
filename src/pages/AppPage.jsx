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
const SCALE = 0.02
const GRID  = 1

export default function AppPage() {
  const { user, isPro, logout } = useAuth()
  const navigate   = useNavigate()
  const wrapRef    = useRef(null)
  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const drawRef    = useRef({
    active:false, startX:0, startY:0,
    pinching:false, pinchDist:null, pinchMidX:0, pinchMidY:0,
    pointerDown:false, dragEl:null, dragOff:null,
    panning:false, panStart:null, panOrigin:null,
  })

  const [tool, setToolState]      = useState('pan')
  const [color, setColor]         = useState('#3a3a50')
  const [thickness, setThick]     = useState(2)
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
  const [lastWallEnd, setLastWallEnd] = useState(null)
  const [continueModal, setContinueModal] = useState(false)
  const [continuePending, setContinuePending] = useState(null)
  const [accumulatedLength, setAccumulatedLength] = useState(0)
  const [resizeHandle, setResizeHandle] = useState(null) // {el, handle: 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'}
  const [sizeModal, setSizeModal] = useState(false)
  const [sizePending, setSizePending] = useState(null)
  const [doorWidth, setDoorWidth] = useState(0.80)
  const [windowWidth, setWindowWidth] = useState(1.20)
  const hintTimer = useRef(null)

  const stateRef = useRef({})
  stateRef.current = { tool, color, thickness, freeMode, user, isPro, roomColorIdx, pan, zoom, elements, lastWallEnd, accumulatedLength, resizeHandle, selectedEl }

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
      select:'Toque num elemento para selecionar e mover',
      delete:'Toque num elemento para apagar',
      pan:'Arraste para mover a tela',
    }
    toast(hints[t] || '')
  }

  async function saveProject() {
    if (!user || !projectName.trim()) return
    setSaveBusy(true)
    try {
      await setDoc(doc(db, 'users', user.uid, 'projects', projectName.trim()), {
        name: projectName.trim(), elements, updatedAt: serverTimestamp(),
      })
      toast('Projeto salvo!')
      setSaveModal(false); setProjectName('')
    } catch(e) { toast('Erro ao salvar: ' + e.message) }
    finally { setSaveBusy(false) }
  }

  async function openLoadModal() {
    if (!user) return
    const snap = await getDocs(collection(db, 'users', user.uid, 'projects'))
    setProjects(snap.docs.map(d => d.data()))
    setLoadModal(true)
  }

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
    return { x:Math.round(x/GRID)*GRID, y:Math.round(y/GRID)*GRID }
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

    function getPinchData(touches) {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      const r = canvas.getBoundingClientRect()
      return {
        dist: Math.sqrt(dx*dx+dy*dy),
        midX: (touches[0].clientX + touches[1].clientX)/2 - r.left,
        midY: (touches[0].clientY + touches[1].clientY)/2 - r.top,
      }
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        e.preventDefault()
        drawRef.current.active = false
        drawRef.current.panning = false
        const pd = getPinchData(e.touches)
        drawRef.current.pinching = true
        drawRef.current.pinchDist = pd.dist
        drawRef.current.pinchMidX = pd.midX
        drawRef.current.pinchMidY = pd.midY
        drawRef.current.panOrigin = { x: stateRef.current.pan.x, y: stateRef.current.pan.y }
      }
    }

    function onTouchMove(e) {
      if (e.touches.length === 2 && drawRef.current.pinching) {
        e.preventDefault()
        const pd = getPinchData(e.touches)
        const ratio = pd.dist / drawRef.current.pinchDist
        const panDX = pd.midX - drawRef.current.pinchMidX
        const panDY = pd.midY - drawRef.current.pinchMidY
        setZoom(z => {
          const nz = Math.min(4, Math.max(0.2, z * ratio))
          setPan(p => ({
            x: pd.midX - (drawRef.current.pinchMidX - p.x) * (nz/z) + panDX * (nz/z),
            y: pd.midY - (drawRef.current.pinchMidY - p.y) * (nz/z) + panDY * (nz/z),
          }))
          return nz
        })
        drawRef.current.pinchDist = pd.dist
        drawRef.current.pinchMidX = pd.midX
        drawRef.current.pinchMidY = pd.midY
      }
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) drawRef.current.pinching = false
    }

    function onDown(e) {
      if (drawRef.current.pinching) return
      if (e.touches?.length > 1) return
      e.preventDefault()
      drawRef.current.pointerDown = true
      const s = stateRef.current

      if (s.tool === 'pan') {
        drawRef.current.panning = true
        drawRef.current.panStart = getRawScreen(e)
        drawRef.current.panOrigin = { x: s.pan.x, y: s.pan.y }
        return
      }

      const pos = getPos(e)
      if (s.tool === 'text') { setTextPending(pos); setTextModal(true); return }
      if (s.tool === 'select') {
        const el = hitTest(s.elements, pos.x, pos.y, s.zoom)

        // Check if clicking a resize handle on selected room
        if (s.selectedEl && s.selectedEl.type === 'room') {
          const handle = getResizeHandle(s.selectedEl, pos.x, pos.y, s.zoom)
          if (handle) {
            drawRef.current.dragEl = s.selectedEl
            drawRef.current.resizeHandle = handle
            drawRef.current.dragOff = { x: pos.x, y: pos.y }
            drawRef.current.origEl = { ...s.selectedEl }
            return
          }
        }

        setSelectedEl(el || null)
        setResizeHandle(null)
        if (el) {
          drawRef.current.dragEl = el
          drawRef.current.resizeHandle = null
          drawRef.current.dragOff = {
            x: pos.x - (el.x1 ?? el.x ?? 0),
            y: pos.y - (el.y1 ?? el.y ?? 0),
          }
        }
        return
      }
      if (s.tool === 'delete') {
        const el = hitTest(s.elements, pos.x, pos.y, s.zoom)
        if (el) { saveHistory(); setElements(prev => prev.filter(e => e !== el)); toast('Apagado') }
        return
      }
      drawRef.current.active = true
      // Magnetic snap: se comecar perto do fim de uma parede, gruda
      let snapX = pos.x, snapY = pos.y
      if (s.tool === 'wall') {
        const MAGNET = 30 / s.zoom
        for (const el of s.elements) {
          if (el.type !== 'wall') continue
          for (const [ex, ey] of [[el.x1,el.y1],[el.x2,el.y2]]) {
            const d = Math.sqrt((pos.x-ex)**2 + (pos.y-ey)**2)
            if (d < MAGNET) { snapX = ex; snapY = ey; break }
          }
        }
      }
      drawRef.current.startX = snapX
      drawRef.current.startY = snapY
    }

    function onMove(e) {
      if (drawRef.current.pinching) return
      if (!drawRef.current.pointerDown) return
      e.preventDefault()
      const s = stateRef.current

      if (drawRef.current.panning) {
        const cur = getRawScreen(e)
        setPan({
          x: drawRef.current.panOrigin.x + cur.x - drawRef.current.panStart.x,
          y: drawRef.current.panOrigin.y + cur.y - drawRef.current.panStart.y,
        })
        return
      }

      if (s.tool === 'select' && drawRef.current.dragEl) {
        const pos = getPos(e)
        const el = drawRef.current.dragEl

        // Resize room
        if (drawRef.current.resizeHandle && el.type === 'room') {
          const orig = drawRef.current.origEl
          const dx = pos.x - drawRef.current.dragOff.x
          const dy = pos.y - drawRef.current.dragOff.y
          const h = drawRef.current.resizeHandle
          let {x1,y1,x2,y2} = orig
          if (h.includes('n')) y1 = orig.y1 + dy
          if (h.includes('s')) y2 = orig.y2 + dy
          if (h.includes('w')) x1 = orig.x1 + dx
          if (h.includes('e')) x2 = orig.x2 + dx
          setElements(prev => prev.map(e => e !== el ? e : {...e, x1, y1, x2, y2}))
          setSelectedEl(prev => ({...prev, x1, y1, x2, y2}))
          return
        }

        const dx = pos.x - drawRef.current.dragOff.x
        const dy = pos.y - drawRef.current.dragOff.y
        const mw = (el.x2 ?? 0) - (el.x1 ?? el.x ?? 0)
        const mh = (el.y2 ?? 0) - (el.y1 ?? el.y ?? 0)
        setElements(prev => prev.map(e => {
          if (e !== el) return e
          if (e.x1 !== undefined) return { ...e, x1:dx, y1:dy, x2:dx+mw, y2:dy+mh }
          return { ...e, x:dx, y:dy }
        }))
        return
      }

      if (drawRef.current.active) {
        const pos = getPos(e)
        const snapped = orthoSnap(drawRef.current.startX, drawRef.current.startY, pos.x, pos.y)
        const oc = getOCtx(); if (!oc) return
        oc.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
        oc.save()
        oc.translate(s.pan.x, s.pan.y)
        oc.scale(s.zoom, s.zoom)
        oc.globalAlpha = 0.6
        drawEl(oc, {
          type: s.tool,
          x1: drawRef.current.startX, y1: drawRef.current.startY,
          x2: snapped.x, y2: snapped.y,
          color: s.color, thickness: s.thickness,
          fill: ROOM_COLORS[s.roomColorIdx % ROOM_COLORS.length],
        }, SCALE)
        oc.restore()
      }
    }

    function onUp(e) {
      if (drawRef.current.pinching) return
      drawRef.current.dragEl = null
      drawRef.current.resizeHandle = null
      drawRef.current.origEl = null
      if (drawRef.current.panning) {
        drawRef.current.panning = false
        drawRef.current.pointerDown = false
        return
      }
      if (!drawRef.current.active) { drawRef.current.pointerDown = false; return }
      drawRef.current.active = false
      drawRef.current.pointerDown = false

      const s = stateRef.current
      const pos = getPos(e)
      const snapped = orthoSnap(drawRef.current.startX, drawRef.current.startY, pos.x, pos.y)
      const dx = snapped.x - drawRef.current.startX
      const dy = snapped.y - drawRef.current.startY
      if (Math.sqrt(dx*dx + dy*dy) < 5) { clearOverlay(); return }

      if (!canAddElement(s.user, s.elements.length)) {
        setUpsellMsg('O plano Free permite ate 10 elementos.')
        setUpsellModal(true); clearOverlay(); return
      }

      // Magnetic snap no ponto final tambem
      if (s.tool === 'wall') {
        const MAGNET = 30 / s.zoom
        for (const el of s.elements) {
          if (el.type !== 'wall') continue
          for (const [ex, ey] of [[el.x1,el.y1],[el.x2,el.y2]]) {
            const d = Math.sqrt((snapped.x-ex)**2 + (snapped.y-ey)**2)
            if (d < MAGNET) { snapped.x = ex; snapped.y = ey; break }
          }
        }
      }

      // Door/window: size modal
      if (s.tool === 'door' || s.tool === 'window') {
        setSizePending({
          type: s.tool,
          x1: drawRef.current.startX, y1: drawRef.current.startY,
          x2: snapped.x, y2: snapped.y,
          color: s.color, thickness: s.thickness,
        })
        setSizeModal(true)
        clearOverlay()
        return
      }

      saveHistory()
      const el = makeEl(s.tool, drawRef.current.startX, drawRef.current.startY,
        snapped.x, snapped.y, s.color, s.thickness, s.roomColorIdx)
      if (el) {
        setElements(prev => [...prev, el])
        if (s.tool === 'room') setRoomColorIdx(i => i+1)
        if (s.tool === 'wall') {
          setLastWallEnd({ x: snapped.x, y: snapped.y })
          setAccumulatedLength(Math.sqrt(dx*dx+dy*dy))
        }
      }
      clearOverlay()
    }

    canvas.addEventListener('pointerdown', onDown, {passive:false})
    canvas.addEventListener('pointermove', onMove, {passive:false})
    canvas.addEventListener('pointerup', onUp, {passive:false})
    canvas.addEventListener('pointercancel', onUp, {passive:false})
    canvas.addEventListener('touchstart', onTouchStart, {passive:false})
    canvas.addEventListener('touchmove', onTouchMove, {passive:false})
    canvas.addEventListener('touchend', onTouchEnd, {passive:false})
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  function confirmSize() {
    if (!sizePending) return
    saveHistory()
    setElements(prev => [...prev, {
      ...sizePending,
      doorWidth: sizePending.type === 'door' ? doorWidth : undefined,
      windowWidth: sizePending.type === 'window' ? windowWidth : undefined,
    }])
    setSizeModal(false); setSizePending(null)
    toast((sizePending.type === 'door' ? 'Porta' : 'Janela') + ' adicionada!')
  }

  function render() {
    const ctx = getCtx(); if (!ctx) return
    const c = canvasRef.current
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    drawGrid(ctx, c.width, c.height, pan, zoom)
    const rooms = elements.filter(e => e.type === 'room')
    const rest  = elements.filter(e => e.type !== 'room')
    ;[...rooms, ...rest].forEach(el => drawEl(ctx, el, SCALE))
    if (selectedEl) {
      ctx.strokeStyle = 'rgba(71,196,255,0.9)'
      ctx.lineWidth = 2 / zoom; ctx.setLineDash([6/zoom, 4/zoom])

      if (selectedEl.type === 'room') {
        // Draw dashed border
        const minX=Math.min(selectedEl.x1,selectedEl.x2)
        const minY=Math.min(selectedEl.y1,selectedEl.y2)
        const w=Math.abs(selectedEl.x2-selectedEl.x1)
        const h=Math.abs(selectedEl.y2-selectedEl.y1)
        ctx.strokeRect(minX-2/zoom, minY-2/zoom, w+4/zoom, h+4/zoom)
        ctx.setLineDash([])

        // Draw resize handles
        const hs = 8/zoom
        const handles = [
          {x:minX,     y:minY,     id:'nw'},
          {x:minX+w/2, y:minY,     id:'n'},
          {x:minX+w,   y:minY,     id:'ne'},
          {x:minX+w,   y:minY+h/2, id:'e'},
          {x:minX+w,   y:minY+h,   id:'se'},
          {x:minX+w/2, y:minY+h,   id:'s'},
          {x:minX,     y:minY+h,   id:'sw'},
          {x:minX,     y:minY+h/2, id:'w'},
        ]
        handles.forEach(h => {
          ctx.fillStyle = 'var(--accent2, #47c4ff)'
          ctx.fillRect(h.x-hs/2, h.y-hs/2, hs, hs)
          ctx.strokeStyle = '#0f0f12'
          ctx.lineWidth = 1/zoom
          ctx.strokeRect(h.x-hs/2, h.y-hs/2, hs, hs)
        })
      } else if (selectedEl.x1 !== undefined) {
        for (const [px,py] of [[selectedEl.x1,selectedEl.y1],[selectedEl.x2,selectedEl.y2]]) {
          ctx.beginPath(); ctx.arc(px, py, 8/zoom, 0, Math.PI*2); ctx.stroke()
        }
      }
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  function saveHistory() {
    setHistory(h => [...h.slice(-49), elements.map(e => ({...e}))])
  }
  function undo() {
    if (!elements.length) return
    saveHistory()
    setElements(prev => prev.slice(0, -1))
    toast('Ultimo elemento removido')
  }

  function doExport() {
    if (!canExport(user)) { setUpsellMsg('Exportar PNG e exclusivo do plano PRO.'); setUpsellModal(true); return }
    exportPNG(elements, SCALE); toast('PNG exportado!')
  }

  function confirmText() {
    if (!textVal.trim() || !textPending) { setTextModal(false); return }
    saveHistory()
    setElements(prev => [...prev, {type:'text', x:textPending.x, y:textPending.y, text:textVal, size:textSize, textColor}])
    setTextModal(false); setTextVal(''); toast('Texto adicionado')
  }

  const TOOLS = [
    {id:'wall',    icon:'▬',  label:'Parede',  desc:'Desenha paredes'},
    {id:'room',    icon:'⬜',  label:'Comodo',  desc:'Cria ambientes'},
    {id:'door',    icon:'🚪', label:'Porta',   desc:'Insere porta com tamanho', pro:true},
    {id:'window',  icon:'⬛',  label:'Janela',  desc:'Insere janela com tamanho', pro:true},
    {id:'measure', icon:'📏', label:'Medida',  desc:'Linha de cota', pro:true},
    {id:'stair',   icon:'🪜', label:'Escada',  desc:'Adiciona escada', pro:true},
    {id:'text',    icon:'T',  label:'Texto',   desc:'Etiqueta', pro:true},
  ]

  const ACTIONS = [
    {id:'pan',    icon:'✋', label:'Mover Tela', desc:'Move a tela (ou 2 dedos)'},
    {id:'select', icon:'↖',  label:'Editar',     desc:'Seleciona e move elementos'},
    {id:'delete', icon:'🧹', label:'Borracha',   desc:'Toque num elemento para apagar'},
  ]

  const activeTool = [...TOOLS, ...ACTIONS].find(t => t && t.id === tool)

  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg)'}}>

      {/* HEADER */}
      <header style={{height:50,background:'var(--surface)',borderBottom:'1px solid var(--border)',
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 10px',
        flexShrink:0,position:'relative',zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:8,height:8,background:'var(--accent)',borderRadius:'50%',boxShadow:'0 0 8px var(--accent)'}}/>
          <span style={{fontSize:14,fontWeight:800,letterSpacing:-0.5}}>PLANTA PRO</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <button onClick={()=>setSaveModal(true)} style={hdrBtn} title="Salvar projeto">💾</button>
          <button onClick={openLoadModal} style={hdrBtn} title="Carregar projeto">📂</button>
          <button onClick={()=>setHelpModal(true)} style={{...hdrBtn,fontSize:13,fontWeight:700,color:'var(--text2)'}} title="Ajuda">?</button>
          <div onClick={()=>navigate('/pricing')} style={{
            padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:800,
            fontFamily:'monospace',cursor:'pointer',border:'2px solid',
            ...(isPro
              ? {background:'rgba(232,255,71,0.2)',color:'var(--accent)',borderColor:'var(--accent)',boxShadow:'0 0 8px rgba(232,255,71,0.3)'}
              : {background:'var(--surface2)',color:'var(--text2)',borderColor:'var(--border)'}
            )}}>
            {isPro ? 'PRO' : 'FREE'}
          </div>
          <div onClick={()=>setUserMenu(m=>!m)} style={{width:32,height:32,borderRadius:'50%',
            background: isPro ? 'rgba(232,255,71,0.15)' : 'var(--surface2)',
            border:'2px solid '+(isPro?'var(--accent)':'var(--border)'),
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:13,fontWeight:700,cursor:'pointer',overflow:'hidden'}}>
            {user?.photoURL
              ? <img src={user.photoURL} style={{width:'100%',height:'100%',borderRadius:'50%'}}/>
              : (user?.name||user?.email||'?')[0].toUpperCase()}
          </div>
        </div>
        {userMenu && (
          <div onClick={()=>setUserMenu(false)} style={{position:'absolute',top:50,right:0,
            background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:'0 0 0 14px',padding:16,minWidth:210,zIndex:200,
            boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
            <p style={{fontSize:13,fontWeight:700,marginBottom:2}}>{user?.name||'Usuario'}</p>
            <p style={{fontSize:11,color:'var(--text2)',marginBottom:8}}>{user?.email}</p>
            {isPro && (
              <div style={{padding:'6px 10px',background:'rgba(232,255,71,0.1)',
                border:'1px solid rgba(232,255,71,0.3)',borderRadius:8,
                fontSize:12,color:'var(--accent)',fontWeight:700,marginBottom:10,textAlign:'center'}}>
                Plano PRO Ativo
              </div>
            )}
            <button onClick={()=>navigate('/pricing')} style={menuBtnStyle}>
              {isPro ? 'Gerenciar plano' : 'Fazer upgrade PRO'}
            </button>
            <button onClick={logout} style={{...menuBtnStyle,color:'var(--accent3)'}}>Sair</button>
          </div>
        )}
      </header>

      {/* TOOLBAR */}
      <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'stretch',padding:'6px 8px',
          overflowX:'auto',scrollbarWidth:'none',gap:6}}>

          {/* Drawing group */}
          <div style={{display:'flex',flexDirection:'column',gap:2,flexShrink:0}}>
            <span style={{fontSize:8,color:'var(--text2)',fontFamily:'monospace',
              letterSpacing:1,textTransform:'uppercase',paddingLeft:2}}>Desenhar</span>
            <div style={{display:'flex',gap:4}}>
              {TOOLS.map(t => {
                const locked = t.pro && !isPro
                const active = tool === t.id
                return (
                  <button key={t.id} onClick={()=>trySetTool(t.id)} title={t.desc} style={{
                    width:48,height:46,border:'2px solid',borderRadius:10,
                    display:'flex',flexDirection:'column',alignItems:'center',
                    justifyContent:'center',gap:1,cursor:'pointer',
                    position:'relative',transition:'all 0.12s',flexShrink:0,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'rgba(232,255,71,0.15)' : 'var(--surface2)',
                    color: active ? 'var(--accent)' : locked ? 'var(--text2)' : 'var(--text)',
                    opacity: locked ? 0.55 : 1,
                    boxShadow: active ? '0 0 8px rgba(232,255,71,0.2)' : 'none',
                  }}>
                    <span style={{fontSize:15,lineHeight:1}}>{t.icon}</span>
                    <span style={{fontSize:7,fontWeight:700,letterSpacing:0.3}}>{t.label}</span>
                    {locked && (
                      <span style={{position:'absolute',top:-6,right:-6,
                        background:'var(--accent)',color:'#0f0f12',
                        fontSize:6,fontWeight:800,fontFamily:'monospace',
                        padding:'1px 3px',borderRadius:3,lineHeight:1.4}}>PRO</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{width:1,background:'var(--border)',flexShrink:0,alignSelf:'stretch',margin:'0 2px'}}/>

          {/* Action group */}
          <div style={{display:'flex',flexDirection:'column',gap:2,flexShrink:0}}>
            <span style={{fontSize:8,color:'var(--text2)',fontFamily:'monospace',
              letterSpacing:1,textTransform:'uppercase',paddingLeft:2}}>Acao</span>
            <div style={{display:'flex',gap:4}}>
              {ACTIONS.map(t => {
                const active = tool === t.id
                return (
                  <button key={t.id} onClick={()=>trySetTool(t.id)} title={t.desc} style={{
                    width:54,height:46,border:'2px solid',borderRadius:10,
                    display:'flex',flexDirection:'column',alignItems:'center',
                    justifyContent:'center',gap:1,cursor:'pointer',
                    transition:'all 0.12s',flexShrink:0,
                    borderColor: active ? 'var(--accent2)' : 'var(--border)',
                    background: active ? 'rgba(71,196,255,0.15)' : 'var(--surface2)',
                    color: active ? 'var(--accent2)' : 'var(--text)',
                    boxShadow: active ? '0 0 8px rgba(71,196,255,0.2)' : 'none',
                  }}>
                    <span style={{fontSize:15,lineHeight:1}}>{t.icon}</span>
                    <span style={{fontSize:7,fontWeight:700,textAlign:'center',lineHeight:1.2}}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Options row */}
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px 6px',
          borderTop:'1px solid var(--border)',overflowX:'auto',scrollbarWidth:'none'}}>

          <div style={{display:'flex',background:'var(--surface2)',
            border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',flexShrink:0}}>
            <button onClick={()=>setFreeMode(false)} style={{
              padding:'5px 10px',border:'none',cursor:'pointer',fontSize:10,
              fontFamily:'monospace',fontWeight:800,
              background: !freeMode ? 'var(--accent)' : 'transparent',
              color: !freeMode ? '#0f0f12' : 'var(--text2)',
            }}>RETO</button>
            <button onClick={()=>setFreeMode(true)} style={{
              padding:'5px 10px',border:'none',cursor:'pointer',fontSize:10,
              fontFamily:'monospace',fontWeight:800,
              background: freeMode ? 'var(--accent3)' : 'transparent',
              color: freeMode ? 'white' : 'var(--text2)',
            }}>LIVRE</button>
          </div>

          <span style={labelStyle}>Esp.</span>
          <input type="range" min="1" max="20" value={thickness} style={{width:50,flexShrink:0}}
            onChange={e=>setThick(+e.target.value)}/>
          <span style={{...labelStyle,color:'var(--accent2)',fontFamily:'monospace',minWidth:14,flexShrink:0}}>{thickness}</span>

          {['#3a3a50','#5a4a3a','#2a4a3a','#4a2a2a','#2a3a5a','#e8ff47'].map(c=>(
            <div key={c} onClick={()=>setColor(c)} style={{
              width:18,height:18,borderRadius:5,background:c,cursor:'pointer',flexShrink:0,
              border:'2px solid '+(color===c?'white':'transparent'),
              transform:color===c?'scale(1.2)':'scale(1)',transition:'all 0.12s'}}/>
          ))}

          <div style={{flex:1}}/>
          <button onClick={undo} style={actionBtn} title="Desfazer (remove ultimo elemento)">↩</button>
          <button onClick={doExport} style={actionBtn} title="Exportar PNG">↗</button>
          <button onClick={()=>{if(confirm('Limpar tudo?')){saveHistory();setElements([])}}}
            style={{...actionBtn,color:'var(--accent3)',borderColor:'rgba(255,107,71,0.3)'}}>✕</button>
        </div>
      </div>

      {/* CANVAS */}
      <div ref={wrapRef} style={{flex:1,position:'relative',overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{position:'absolute',top:0,left:0}}/>
        <canvas ref={overlayRef} style={{position:'absolute',top:0,left:0,
          touchAction:'none',cursor: tool==='pan' ? 'grab' : 'crosshair'}}/>

        <div style={{position:'absolute',bottom:14,right:14,display:'flex',
          flexDirection:'column',gap:4,zIndex:10}}>
          <button onClick={()=>trySetTool('pan')} title="Mover tela" style={{
            width:44,height:44,borderRadius:12,
            background: tool==='pan' ? 'var(--accent)' : 'var(--surface)',
            border:'2px solid '+(tool==='pan'?'var(--accent)':'var(--border)'),
            color: tool==='pan' ? '#0f0f12' : 'var(--text)',
            fontSize:20,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 2px 10px rgba(0,0,0,0.5)',marginBottom:4,
          }}>✋</button>
          <button onClick={()=>setZoom(z=>Math.min(4,z*1.25))} style={zoomBtn}>+</button>
          <button onClick={()=>setZoom(z=>Math.max(0.2,z/1.25))} style={zoomBtn}>-</button>
          <button onClick={()=>{setZoom(1);setPan({x:40,y:40})}}
            style={{...zoomBtn,fontSize:8,fontFamily:'monospace'}}>CTR</button>
        </div>

        {activeTool && (
          <div style={{position:'absolute',bottom:14,left:14,
            background:'rgba(15,15,18,0.85)',border:'1px solid var(--border)',
            borderRadius:10,padding:'6px 10px',display:'flex',alignItems:'center',gap:6,
            fontSize:11,color:'var(--text2)',fontFamily:'monospace',zIndex:10}}>
            <span style={{fontSize:14}}>{activeTool.icon}</span>
            <span>{activeTool.label}</span>
            <span style={{color: freeMode?'var(--accent3)':'var(--accent)',fontSize:10}}>
              {freeMode?'LIVRE':'RETO'}
            </span>
          </div>
        )}

        {!isPro && elements.length >= 8 && (
          <div style={{position:'absolute',top:14,left:'50%',transform:'translateX(-50%)',
            background:'rgba(255,107,71,0.15)',border:'1px solid rgba(255,107,71,0.5)',
            borderRadius:20,padding:'6px 14px',display:'flex',alignItems:'center',
            gap:8,fontSize:11,color:'var(--accent3)',zIndex:10,whiteSpace:'nowrap'}}>
            {elements.length}/10 elementos
            <button onClick={()=>navigate('/pricing')} style={{
              background:'var(--accent3)',border:'none',color:'white',
              fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:6,cursor:'pointer'}}>
              Upgrade PRO
            </button>
          </div>
        )}
      </div>

      {/* STATUS BAR */}
      <div style={{height:24,background:'var(--bg)',borderTop:'1px solid var(--border)',
        display:'flex',alignItems:'center',padding:'0 10px',gap:12,flexShrink:0}}>
        <span style={statusItem}>Ferr: <b style={{color:'var(--accent2)'}}>{tool}</b></span>
        <span style={statusItem}>Linha: <b style={{color: freeMode?'var(--accent3)':'var(--accent2)'}}>{freeMode?'Livre':'Reta'}</b></span>
        <span style={statusItem}>Zoom: <b style={{color:'var(--accent2)'}}>{Math.round(zoom*100)}%</b></span>
        <span style={statusItem}>Elem: <b style={{color:'var(--accent2)'}}>{elements.length}{!isPro?'/10':''}</b></span>
        {isPro && <span style={{marginLeft:'auto',fontSize:10,color:'var(--accent)',fontFamily:'monospace',fontWeight:700}}>PRO</span>}
      </div>

      {/* HINT */}
      <div style={{position:'fixed',top:110,left:'50%',transform:'translateX(-50%)',
        background:'rgba(232,255,71,0.12)',border:'1px solid var(--accent)',color:'var(--accent)',
        fontFamily:'monospace',fontSize:11,padding:'6px 14px',borderRadius:20,
        pointerEvents:'none',zIndex:500,whiteSpace:'nowrap',
        opacity:showHint?1:0,transition:'opacity 0.3s'}}>{hint}</div>

      {/* CONTINUE WALL MODAL */}
      {continueModal && continuePending && (
        <div style={overlayStyle} onClick={()=>setContinueModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:800,marginBottom:8}}>Continuar parede?</h3>
            <p style={{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.6}}>
              Esta parede comeca perto do fim da anterior.<br/>
              Total acumulado: <b style={{color:'var(--accent)'}}>{(accumulatedLength * SCALE).toFixed(2)}m</b>
            </p>
            <button onClick={()=>{
              saveHistory()
              const el = makeEl('wall', continuePending.x1, continuePending.y1,
                continuePending.x2, continuePending.y2, continuePending.color, continuePending.thickness, 0)
              setElements(prev=>[...prev,el])
              setLastWallEnd({x:continuePending.x2, y:continuePending.y2})
              setContinueModal(false); setContinuePending(null)
              toast('Total: ' + (accumulatedLength * SCALE).toFixed(2) + 'm')
            }} style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>
              Sim, continuar parede
            </button>
            <button onClick={()=>{
              saveHistory()
              const el = makeEl('wall', continuePending.x1, continuePending.y1,
                continuePending.x2, continuePending.y2, continuePending.color, continuePending.thickness, 0)
              setElements(prev=>[...prev,el])
              setLastWallEnd({x:continuePending.x2, y:continuePending.y2})
              setAccumulatedLength(0)
              setContinueModal(false); setContinuePending(null)
              toast('Nova parede iniciada')
            }} style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--border)'}}>
              Nao, nova parede
            </button>
            <button onClick={()=>{
              setContinueModal(false); setContinuePending(null)
              setAccumulatedLength(0); setLastWallEnd(null)
            }} style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* SIZE MODAL */}
      {sizeModal && sizePending && (
        <div style={overlayStyle} onClick={()=>setSizeModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:800,marginBottom:4}}>
              {sizePending.type==='door' ? 'Tamanho da Porta' : 'Tamanho da Janela'}
            </h3>
            <p style={{fontSize:12,color:'var(--text2)',marginBottom:20}}>Escolha a largura em metros</p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
              {(sizePending.type==='door'
                ? [0.60, 0.70, 0.80, 0.90, 1.00, 1.20]
                : [0.60, 0.80, 1.00, 1.20, 1.50, 2.00]
              ).map(v => (
                <button key={v} onClick={()=>sizePending.type==='door'?setDoorWidth(v):setWindowWidth(v)}
                  style={{
                    flex:1,minWidth:60,padding:'10px 6px',borderRadius:10,
                    border:'2px solid',cursor:'pointer',fontSize:13,fontWeight:700,
                    borderColor: (sizePending.type==='door'?doorWidth:windowWidth)===v ? 'var(--accent)' : 'var(--border)',
                    background: (sizePending.type==='door'?doorWidth:windowWidth)===v ? 'rgba(232,255,71,0.15)' : 'var(--surface2)',
                    color: (sizePending.type==='door'?doorWidth:windowWidth)===v ? 'var(--accent)' : 'var(--text)',
                  }}>
                  {v.toFixed(2)}m
                </button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:20}}>
              <span style={{fontSize:12,color:'var(--text2)'}}>Personalizado:</span>
              <input type="number" step="0.05" min="0.30" max="5.00"
                value={sizePending.type==='door'?doorWidth:windowWidth}
                onChange={e=>sizePending.type==='door'?setDoorWidth(+e.target.value):setWindowWidth(+e.target.value)}
                style={{...inputStyle,width:100,textAlign:'center'}}/>
              <span style={{fontSize:12,color:'var(--text2)'}}>metros</span>
            </div>
            <button onClick={confirmSize}
              style={{...modalBtnStyle,background:'var(--accent)',color:'#0f0f12'}}>
              Adicionar {sizePending.type==='door'?'Porta':'Janela'} de {(sizePending.type==='door'?doorWidth:windowWidth).toFixed(2)}m
            </button>
            <button onClick={()=>setSizeModal(false)}
              style={{...modalBtnStyle,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* UPSELL MODAL */}
      {upsellModal && (
        <div style={overlayStyle} onClick={()=>setUpsellModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <div style={{fontSize:32,textAlign:'center',marginBottom:10}}>!</div>
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
      {textModal && (
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
      {saveModal && (
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
      {loadModal && (
        <div style={overlayStyle} onClick={()=>setLoadModal(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Meus Projetos</h3>
            {projects.length === 0
              ? <p style={{color:'var(--text2)',textAlign:'center',fontSize:13,marginBottom:16}}>
                  Nenhum projeto salvo ainda.
                </p>
              : <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                  {projects.map(p => (
                    <button key={p.name} onClick={()=>loadProject(p.name)} style={{
                      padding:'12px 16px',background:'var(--surface2)',
                      border:'1px solid var(--border)',borderRadius:10,
                      color:'var(--text)',fontSize:14,cursor:'pointer',textAlign:'left',
                      display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontWeight:600}}>{p.name}</span>
                      <span style={{fontSize:11,color:'var(--text2)'}}>{p.elements?.length||0} elem</span>
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
      {helpModal && (
        <div style={{...overlayStyle,alignItems:'flex-start',overflowY:'auto',paddingTop:20}}
          onClick={()=>setHelpModal(false)}>
          <div style={{...modalStyle,borderRadius:20,margin:'0 auto 20px',maxHeight:'none'}}
            onClick={e=>e.stopPropagation()}>
            <div style={handleStyle}/>
            <h3 style={{fontSize:18,fontWeight:800,marginBottom:4}}>Como usar o Planta Pro</h3>
            <p style={{fontSize:12,color:'var(--text2)',marginBottom:20}}>Guia de todas as funcionalidades</p>
            {[
              {icon:'▬',  title:'Parede',       desc:'Arraste para desenhar uma parede. No modo RETO fica sempre horizontal ou vertical. No LIVRE pode ser em qualquer angulo.'},
              {icon:'⬜',  title:'Comodo',       desc:'Arraste para criar um comodo (retangulo colorido). Exibe largura e altura em metros automaticamente.'},
              {icon:'🚪', title:'Porta (PRO)',   desc:'Arraste e escolha o tamanho (0.60m a 1.20m). Aparece com arco de abertura para indicar o sentido.'},
              {icon:'⬛',  title:'Janela (PRO)', desc:'Arraste e escolha o tamanho. Inserida na parede com detalhes visuais.'},
              {icon:'📏', title:'Medida (PRO)',  desc:'Arraste para criar uma linha de cota e medir distancias em metros.'},
              {icon:'🪜', title:'Escada (PRO)',  desc:'Arraste para criar uma escada com degraus e seta indicando subida.'},
              {icon:'T',  title:'Texto (PRO)',   desc:'Toque em qualquer lugar para adicionar uma etiqueta.'},
              {icon:'✋', title:'Mover Tela',    desc:'Arraste para navegar pelo canvas. Tambem funciona com 2 dedos em qualquer modo.'},
              {icon:'↖',  title:'Editar',        desc:'Toque num elemento para selecionar e arraste para mover.'},
              {icon:'🧹', title:'Borracha',      desc:'Toque em qualquer elemento para remove-lo do canvas.'},
              {icon:'RETO/LIVRE', title:'Modo de Linha', desc:'RETO: sempre horizontal ou vertical. LIVRE: qualquer direcao.'},
              {icon:'↩',  title:'Desfazer',      desc:'Remove o ultimo elemento adicionado.'},
              {icon:'↗',  title:'PNG (PRO)',      desc:'Exporta a planta como imagem PNG em alta resolucao.'},
              {icon:'💾', title:'Salvar',         desc:'Salva o projeto na nuvem com um nome.'},
              {icon:'📂', title:'Carregar',       desc:'Abre projetos salvos anteriormente.'},
              {icon:'+/-',title:'Zoom',           desc:'Aumenta ou diminui o zoom. CTR centraliza. Pinca com 2 dedos tambem faz zoom.'},
            ].map((item,i) => (
              <div key={i} style={{display:'flex',gap:12,marginBottom:12,
                padding:12,background:'var(--surface2)',borderRadius:12,border:'1px solid var(--border)'}}>
                <div style={{fontSize:18,flexShrink:0,width:30,textAlign:'center',fontFamily:'monospace'}}>{item.icon}</div>
                <div>
                  <p style={{fontSize:13,fontWeight:700,marginBottom:2}}>{item.title}</p>
                  <p style={{fontSize:11,color:'var(--text2)',lineHeight:1.5}}>{item.desc}</p>
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

const labelStyle    = {fontSize:10,fontFamily:'monospace',color:'var(--text2)',flexShrink:0}
const statusItem    = {fontSize:10,fontFamily:'monospace',color:'var(--text2)'}
const menuBtnStyle  = {display:'block',width:'100%',padding:'9px 12px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,cursor:'pointer',marginBottom:6,textAlign:'left'}
const overlayStyle  = {position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}
const modalStyle    = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'20px 20px 0 0',padding:20,width:'100%',maxWidth:460,maxHeight:'88dvh',overflowY:'auto'}
const handleStyle   = {width:40,height:4,background:'var(--border)',borderRadius:2,margin:'0 auto 16px'}
const modalBtnStyle = {display:'block',width:'100%',padding:13,border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:8}
const inputStyle    = {padding:'10px 12px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)',fontSize:14,outline:'none'}
const hdrBtn        = {width:32,height:32,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text)'}
const actionBtn     = {width:30,height:30,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer',color:'var(--text2)',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}
const zoomBtn       = {width:36,height:36,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:9,fontSize:18,fontFamily:'monospace',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}

function drawGrid(ctx,W,H,pan,zoom){
  const g=20,ox=-pan.x/zoom,oy=-pan.y/zoom,fw=W/zoom,fh=H/zoom
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=0.5
  const sx=Math.floor(ox/g)*g,sy=Math.floor(oy/g)*g
  for(let x=sx;x<ox+fw+g;x+=g){ctx.beginPath();ctx.moveTo(x,oy);ctx.lineTo(x,oy+fh);ctx.stroke()}
  for(let y=sy;y<oy+fh+g;y+=g){ctx.beginPath();ctx.moveTo(ox,y);ctx.lineTo(ox+fw,y);ctx.stroke()}
  ctx.strokeStyle='rgba(232,255,71,0.1)';ctx.lineWidth=1
  ctx.beginPath();ctx.moveTo(0,oy);ctx.lineTo(0,oy+fh);ctx.stroke()
  ctx.beginPath();ctx.moveTo(ox,0);ctx.lineTo(ox+fw,0);ctx.stroke()
}

function drawEl(ctx,el,scale){
  const {type,x1,y1,x2,y2,color,thickness}=el
  ctx.save()
  if(type==='wall'){
    ctx.strokeStyle=color||'#3a3a50';ctx.lineWidth=thickness||2
    ctx.lineCap='square';ctx.lineJoin='miter'
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()
    drawMeasLabel(ctx,x1,y1,x2,y2,scale)
  }else if(type==='room'){
    const minX=Math.min(x1,x2),minY=Math.min(y1,y2)
    const w=Math.abs(x2-x1),h=Math.abs(y2-y1)
    ctx.fillStyle=el.fill||'rgba(232,255,71,0.08)'
    ctx.fillRect(minX,minY,w,h)
    ctx.strokeStyle=color||'#3a3a50';ctx.lineWidth=thickness||2
    ctx.strokeRect(minX,minY,w,h)
    if(w>40&&h>40)drawRectMeasures(ctx,minX,minY,w,h,scale)
  }else if(type==='door'){
    const len=el.doorWidth?el.doorWidth/scale:Math.sqrt((x2-x1)**2+(y2-y1)**2)
    const angle=Math.atan2(y2-y1,x2-x1)
    const ex=x1+Math.cos(angle)*len,ey=y1+Math.sin(angle)*len
    ctx.strokeStyle='#e8a847';ctx.lineWidth=2
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(ex,ey);ctx.stroke()
    ctx.strokeStyle='rgba(232,168,71,0.35)';ctx.lineWidth=1;ctx.setLineDash([4,4])
    ctx.beginPath();ctx.arc(x1,y1,len,angle,angle-Math.PI/2,true);ctx.stroke()
    ctx.setLineDash([])
    drawMeasLabel(ctx,x1,y1,ex,ey,scale,'#e8a847')
  }else if(type==='window'){
    const len=el.windowWidth?el.windowWidth/scale:Math.sqrt((x2-x1)**2+(y2-y1)**2)
    const angle=Math.atan2(y2-y1,x2-x1)
    const ex=x1+Math.cos(angle)*len,ey=y1+Math.sin(angle)*len
    const perp=angle+Math.PI/2
    ctx.strokeStyle='#47c4ff';ctx.lineWidth=3
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(ex,ey);ctx.stroke()
    ctx.strokeStyle='rgba(71,196,255,0.5)';ctx.lineWidth=1
    for(let t=0.2;t<=0.8;t+=0.3){
      const px=x1+Math.cos(angle)*len*t,py=y1+Math.sin(angle)*len*t
      ctx.beginPath()
      ctx.moveTo(px+Math.cos(perp)*5,py+Math.sin(perp)*5)
      ctx.lineTo(px-Math.cos(perp)*5,py-Math.sin(perp)*5)
      ctx.stroke()
    }
    drawMeasLabel(ctx,x1,y1,ex,ey,scale,'#47c4ff')
  }else if(type==='measure'){
    ctx.strokeStyle='rgba(232,255,71,0.5)';ctx.lineWidth=1;ctx.setLineDash([5,4])
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])
    const angle=Math.atan2(y2-y1,x2-x1),perp=angle+Math.PI/2
    ctx.strokeStyle='rgba(232,255,71,0.5)';ctx.lineWidth=1.5
    for(const[px,py]of[[x1,y1],[x2,y2]]){
      ctx.beginPath()
      ctx.moveTo(px+Math.cos(perp)*5,py+Math.sin(perp)*5)
      ctx.lineTo(px-Math.cos(perp)*5,py-Math.sin(perp)*5)
      ctx.stroke()
    }
    drawMeasLabel(ctx,x1,y1,x2,y2,scale,'rgba(232,255,71,0.7)',true)
  }else if(type==='stair'){
    const minX=Math.min(x1,x2),minY=Math.min(y1,y2)
    const w=Math.abs(x2-x1),h=Math.abs(y2-y1)
    ctx.strokeStyle=color||'#8888a0';ctx.lineWidth=1
    ctx.strokeRect(minX,minY,w,h)
    const horiz=w>h,steps=Math.max(3,Math.round(horiz?w/15:h/15))
    ctx.lineWidth=0.6
    for(let i=1;i<steps;i++){
      ctx.beginPath()
      if(horiz){const sx=minX+w*i/steps;ctx.moveTo(sx,minY);ctx.lineTo(sx,minY+h)}
      else{const sy=minY+h*i/steps;ctx.moveTo(minX,sy);ctx.lineTo(minX+w,sy)}
      ctx.stroke()
    }
    ctx.strokeStyle='rgba(232,255,71,0.5)';ctx.lineWidth=1
    const ax=minX+w/2,ay1=minY+6,ay2=minY+h-6
    ctx.beginPath();ctx.moveTo(ax,ay1);ctx.lineTo(ax,ay2)
    ctx.moveTo(ax-4,ay2-6);ctx.lineTo(ax,ay2);ctx.lineTo(ax+4,ay2-6)
    ctx.stroke()
  }else if(type==='text'){
    ctx.font=(el.size||14)+'px Syne,sans-serif'
    ctx.fillStyle=el.textColor||'#f0f0f5';ctx.textAlign='left'
    ctx.fillText(el.text||'',el.x,el.y)
  }
  ctx.restore()
}

function drawMeasLabel(ctx,x1,y1,x2,y2,scale,col,force){
  const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)
  if(len<15&&!force)return
  const m=(len*scale).toFixed(2)+'m'
  const mx=(x1+x2)/2,my=(y1+y2)/2
  const angle=Math.atan2(dy,dx),perp=angle-Math.PI/2,off=10
  ctx.save()
  ctx.translate(mx+Math.cos(perp)*off,my+Math.sin(perp)*off)
  if(Math.abs(angle)>Math.PI/2)ctx.rotate(angle+Math.PI);else ctx.rotate(angle)
  ctx.font='8px monospace'
  const tw=ctx.measureText(m).width
  ctx.fillStyle='rgba(15,15,18,0.65)'
  ctx.fillRect(-tw/2-2,-7,tw+4,10)
  ctx.fillStyle=col||'rgba(232,255,71,0.65)'
  ctx.textAlign='center';ctx.fillText(m,0,0)
  ctx.restore()
}

function drawRectMeasures(ctx,minX,minY,w,h,scale){
  const mw=(w*scale).toFixed(2)+'m',mh=(h*scale).toFixed(2)+'m'
  ctx.font='8px monospace'
  const tww=ctx.measureText(mw).width
  ctx.fillStyle='rgba(15,15,18,0.65)'
  ctx.fillRect(minX+w/2-tww/2-2,minY-12,tww+4,10)
  ctx.fillStyle='rgba(232,255,71,0.65)'
  ctx.textAlign='center';ctx.fillText(mw,minX+w/2,minY-4)
  ctx.save()
  ctx.translate(minX+w+11,minY+h/2);ctx.rotate(Math.PI/2)
  const twh=ctx.measureText(mh).width
  ctx.fillStyle='rgba(15,15,18,0.65)'
  ctx.fillRect(-twh/2-2,-10,twh+4,10)
  ctx.fillStyle='rgba(232,255,71,0.65)'
  ctx.fillText(mh,0,0);ctx.restore()
}

function getResizeHandle(el, x, y, zoom) {
  if (el.type !== 'room') return null
  const minX=Math.min(el.x1,el.x2), minY=Math.min(el.y1,el.y2)
  const w=Math.abs(el.x2-el.x1), h=Math.abs(el.y2-el.y1)
  const hs = 12/zoom
  const handles = [
    {x:minX,     y:minY,     id:'nw'},
    {x:minX+w/2, y:minY,     id:'n'},
    {x:minX+w,   y:minY,     id:'ne'},
    {x:minX+w,   y:minY+h/2, id:'e'},
    {x:minX+w,   y:minY+h,   id:'se'},
    {x:minX+w/2, y:minY+h,   id:'s'},
    {x:minX,     y:minY+h,   id:'sw'},
    {x:minX,     y:minY+h/2, id:'w'},
  ]
  for (const h of handles) {
    if (Math.abs(x-h.x) < hs && Math.abs(y-h.y) < hs) return h.id
  }
  return null
}

function hitTest(elements,x,y,zoom){
  const threshold=14/zoom
  for(let i=elements.length-1;i>=0;i--){
    const el=elements[i]
    if(el.type==='text'){
      if(Math.abs(x-el.x)<60&&Math.abs(y-el.y)<24)return el
    }else if(el.type==='room'||el.type==='stair'){
      const minX=Math.min(el.x1,el.x2),minY=Math.min(el.y1,el.y2)
      const w=Math.abs(el.x2-el.x1),h=Math.abs(el.y2-el.y1)
      if(x>=minX&&x<=minX+w&&y>=minY&&y<=minY+h)return el
    }else if(el.x1!==undefined){
      if(segDist(x,y,el.x1,el.y1,el.x2,el.y2)<threshold)return el
    }
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
  const pad=60
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  elements.forEach(el=>{
    if(el.x1!==undefined){
      minX=Math.min(minX,el.x1,el.x2);minY=Math.min(minY,el.y1,el.y2)
      maxX=Math.max(maxX,el.x1,el.x2);maxY=Math.max(maxY,el.y1,el.y2)
    }else if(el.x!==undefined){
      minX=Math.min(minX,el.x);minY=Math.min(minY,el.y)
      maxX=Math.max(maxX,el.x+100);maxY=Math.max(maxY,el.y+30)
    }
  })
  if(minX===Infinity)return
  const W=maxX-minX+pad*2,H=maxY-minY+pad*2
  const exp=document.createElement('canvas')
  exp.width=W*2;exp.height=H*2
  const ec=exp.getContext('2d')
  ec.scale(2,2);ec.fillStyle='#0f0f12';ec.fillRect(0,0,W,H)
  ec.save();ec.translate(pad-minX,pad-minY)
  const rooms=elements.filter(e=>e.type==='room')
  const rest=elements.filter(e=>e.type!=='room')
  ;[...rooms,...rest].forEach(el=>drawEl(ec,el,scale))
  ec.restore()
  ec.fillStyle='rgba(232,255,71,0.4)';ec.font='bold 10px monospace'
  ec.fillText('PLANTA PRO',12,H-8)
  const a=document.createElement('a')
  a.download='planta-baixa.png';a.href=exp.toDataURL();a.click()
}
