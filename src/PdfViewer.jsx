import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabaseClient'
import { colors, buttonStyle, primaryButtonStyle } from './theme'
import { ChevronUpIcon, ChevronDownIcon } from './icons'

const PING_FLASH_MS = 5000
const NOTIFICATION_MS = 8000
const MIN_SECTION_SIZE = 0.02 // normalized; drags smaller than this are ignored, not saved as junk sections

const toolButtonStyle = (active) => (active ? primaryButtonStyle : buttonStyle)

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#000000']
const LINE_WIDTHS = [1, 2, 4, 8]
const FONT_SIZES = [20, 28, 36, 44]
const ERASE_RADIUS_PX = 12
const TEXT_HIT_RADIUS_PX = 20
const TWO_PAGE_MIN_WIDTH = 640
const SWIPE_THRESHOLD_RATIO = 0.2

// `charts` is a list of { id, url } in display order — one entry for a
// single chart, or a whole session's charts back to back for a combined,
// continuously page-turning view. A page "slot" is keyed by
// `${chartId}:${pageNumber}` throughout, since the same page_number can
// occur in more than one chart.
function PdfViewer({ charts, currentUserId, canDrawShared, onClose }) {
  const chartsKey = charts.map((c) => c.id).join(',')

  const viewportRef = useRef(null) // outer, overflow-hidden window onto the track
  const trackRef = useRef(null) // horizontal flex strip holding every page slot
  const pageWrappersRef = useRef({}) // pageKey -> wrapper div (sized as a slot)
  const overlaysRef = useRef({}) // pageKey -> overlay canvas element
  const annotationsRef = useRef({}) // pageKey -> array of annotation rows (with id)
  const chartSectionsRef = useRef({}) // pageKey -> array of drag-selected section rows { id, x0, y0, x1, y1 }
  const pageOrderRef = useRef([]) // pageKey list in track order, for jumping to a pinged page
  const pingFlashRef = useRef({}) // pageKey -> { sectionIndex, timeoutId } for the temporary ping highlight
  const channelRef = useRef(null) // the realtime channel, so double-click can broadcast a ping on it
  const toolRef = useRef('view')
  const visibilityRef = useRef('personal')
  const colorRef = useRef(COLORS[0])
  const lineWidthRef = useRef(LINE_WIDTHS[1])
  const fontSizeRef = useRef(FONT_SIZES[1])
  const currentIndexRef = useRef(0)
  const numPagesRef = useRef(0)
  const pagesPerViewRef = useRef(2)
  const slotWidthRef = useRef(0)
  const pageAspectRef = useRef(1.3) // page height / width, from the first rendered page
  const fullscreenRef = useRef(false)
  const [error, setError] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [tool, setTool] = useState('view') // 'view' | 'draw' | 'text' | 'erase' | 'markSections' | 'eraseSections'
  const [notifications, setNotifications] = useState([]) // [{ id, pageKey, sectionIndex, chartTitle }]
  const [visibility, setVisibility] = useState('personal') // 'personal' | 'shared'
  const [color, setColor] = useState(COLORS[0])
  const [lineWidth, setLineWidth] = useState(LINE_WIDTHS[1])
  const [fontSize, setFontSize] = useState(FONT_SIZES[1])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [numPages, setNumPages] = useState(0)

  useEffect(() => {
    toolRef.current = tool
    Object.values(overlaysRef.current).forEach((overlay) => {
      overlay.style.pointerEvents = tool === 'view' ? 'none' : 'auto'
      overlay.style.touchAction = tool === 'view' ? 'auto' : 'none'
    })
    // toggles the ping-line bands on/off when entering or leaving that tool
    Object.keys(overlaysRef.current).forEach((pageKey) => redrawPage(pageKey))
  }, [tool])

  useEffect(() => {
    visibilityRef.current = visibility
  }, [visibility])

  useEffect(() => {
    colorRef.current = color
  }, [color])

  useEffect(() => {
    lineWidthRef.current = lineWidth
  }, [lineWidth])

  useEffect(() => {
    fontSizeRef.current = fontSize
  }, [fontSize])

  useEffect(() => {
    currentIndexRef.current = currentIndex
    if (trackRef.current) {
      trackRef.current.style.transition = 'transform 0.25s ease'
      trackRef.current.style.transform = `translateX(${-currentIndex * slotWidthRef.current}px)`
    }
  }, [currentIndex])

  // Sizes every page slot to fit the available width (1 or 2 pages across,
  // depending on screen width) and the available height, then snaps the
  // track to the current page. Height is measured from the viewport's
  // actual current position, so collapsing the toolbar (or fullscreen)
  // immediately gives the PDF the reclaimed space instead of a fixed cap.
  const layoutPages = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const viewportWidth = viewport.clientWidth
    const perView = viewportWidth >= TWO_PAGE_MIN_WIDTH ? 2 : 1
    const top = viewport.getBoundingClientRect().top
    const maxHeight = window.innerHeight - top - 16

    const widthConstrained = viewportWidth / perView
    const heightConstrained = maxHeight / pageAspectRef.current
    const slotWidth = Math.min(widthConstrained, heightConstrained)

    pagesPerViewRef.current = perView
    slotWidthRef.current = slotWidth

    Object.values(pageWrappersRef.current).forEach((wrapper) => {
      wrapper.style.width = `${slotWidth}px`
    })

    const clampedIndex = Math.min(currentIndexRef.current, Math.max(numPagesRef.current - 1, 0))
    currentIndexRef.current = clampedIndex
    setCurrentIndex(clampedIndex)
    if (trackRef.current) {
      trackRef.current.style.transition = 'none'
      trackRef.current.style.transform = `translateX(${-clampedIndex * slotWidth}px)`
    }
  }

  useEffect(() => {
    window.addEventListener('resize', layoutPages)
    return () => window.removeEventListener('resize', layoutPages)
  }, [])

  useEffect(() => {
    fullscreenRef.current = fullscreen
    document.body.style.overflow = fullscreen ? 'hidden' : ''
    // wait a frame so the container has its new size before measuring it
    const id = requestAnimationFrame(layoutPages)
    return () => cancelAnimationFrame(id)
  }, [fullscreen])

  useEffect(() => {
    const id = requestAnimationFrame(layoutPages)
    return () => cancelAnimationFrame(id)
  }, [toolbarVisible])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Finds which page slot a viewport-relative point falls on, and the
  // position within that page (normalized 0..1) — used to resolve a
  // double-click/tap to a specific page + section, independent of which
  // page is currently scrolled into view.
  const findPageAtPoint = (clientX, clientY) => {
    for (const [pageKey, wrapper] of Object.entries(pageWrappersRef.current)) {
      const rect = wrapper.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { pageKey, pos: [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height] }
      }
    }
    return null
  }

  // Swipe/drag to turn pages, one page at a time. Only active in 'view' —
  // drawing tools capture the pointer on their own overlay instead.
  //
  // Double-click/double-tap-to-ping is detected manually here from raw
  // pointerdown timing/position, rather than relying on the browser's
  // native 'dblclick' event — dblclick was unreliable for mouse input,
  // most likely because `setPointerCapture` below redirects where the
  // browser resolves the click target, but touch (which synthesizes
  // clicks differently) wasn't affected. Detecting it ourselves from
  // pointer events works identically for mouse and touch.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let startX = null
    let baseIndex = 0
    let deltaX = 0
    let lastTapTime = 0
    let lastTapPos = null
    const DOUBLE_TAP_MS = 350
    const DOUBLE_TAP_RADIUS_PX = 20

    const onPointerDown = (e) => {
      if (toolRef.current !== 'view') return

      const now = Date.now()
      const isDoubleTap =
        lastTapPos &&
        now - lastTapTime < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - lastTapPos[0], e.clientY - lastTapPos[1]) < DOUBLE_TAP_RADIUS_PX
      lastTapTime = now
      lastTapPos = [e.clientX, e.clientY]

      if (isDoubleTap && canDrawShared) {
        lastTapPos = null
        const hit = findPageAtPoint(e.clientX, e.clientY)
        if (hit) {
          const sections = chartSectionsRef.current[hit.pageKey] ?? []
          const sectionIndex = sections.findIndex(
            (s) => hit.pos[0] >= s.x0 && hit.pos[0] <= s.x1 && hit.pos[1] >= s.y0 && hit.pos[1] <= s.y1
          )
          if (sectionIndex !== -1) {
            sendPing(hit.pageKey, sectionIndex)
            return
          }
        }
      }

      startX = e.clientX
      baseIndex = currentIndexRef.current
      deltaX = 0
      viewport.setPointerCapture(e.pointerId)
      if (trackRef.current) trackRef.current.style.transition = 'none'
    }

    const onPointerMove = (e) => {
      if (startX === null) return
      deltaX = e.clientX - startX
      if (trackRef.current) {
        const baseOffset = -baseIndex * slotWidthRef.current
        trackRef.current.style.transform = `translateX(${baseOffset + deltaX}px)`
      }
    }

    const onPointerUp = () => {
      if (startX === null) return
      const threshold = slotWidthRef.current * SWIPE_THRESHOLD_RATIO
      let newIndex = baseIndex
      if (deltaX < -threshold) newIndex = Math.min(baseIndex + 1, Math.max(numPagesRef.current - 1, 0))
      else if (deltaX > threshold) newIndex = Math.max(baseIndex - 1, 0)
      startX = null
      setCurrentIndex(newIndex)
    }

    viewport.addEventListener('pointerdown', onPointerDown)
    viewport.addEventListener('pointermove', onPointerMove)
    viewport.addEventListener('pointerup', onPointerUp)
    viewport.addEventListener('pointercancel', onPointerUp)
    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown)
      viewport.removeEventListener('pointermove', onPointerMove)
      viewport.removeEventListener('pointerup', onPointerUp)
      viewport.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  // Sections are drag-selected rectangles (normalized 0..1), like a
  // screenshot tool — a host/editor marks each pingable region once via
  // the Mark Sections tool. Automatic text-based detection doesn't work
  // here — this chart's chords/lyrics/measure numbers are vector shapes or
  // custom-font glyphs, not extractable text.
  const rectsOverlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

  const findSectionAt = (pageKey, pos) => {
    const sections = chartSectionsRef.current[pageKey] ?? []
    return sections.find((s) => pos[0] >= s.x0 && pos[0] <= s.x1 && pos[1] >= s.y0 && pos[1] <= s.y1)
  }

  const drawSections = (ctx, canvas, pageKey) => {
    for (const s of chartSectionsRef.current[pageKey] ?? []) {
      ctx.strokeStyle = '#e63946'
      ctx.lineWidth = 2
      ctx.strokeRect(s.x0 * canvas.width, s.y0 * canvas.height, (s.x1 - s.x0) * canvas.width, (s.y1 - s.y0) * canvas.height)
    }
  }

  // Highlights the section under the pointer while in the Erase Sections
  // tool, so it's clear what a tap will remove.
  const drawEraseHighlight = (ctx, canvas, pageKey, pos) => {
    const hit = findSectionAt(pageKey, pos)
    if (!hit) return
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)'
    ctx.fillRect(hit.x0 * canvas.width, hit.y0 * canvas.height, (hit.x1 - hit.x0) * canvas.width, (hit.y1 - hit.y0) * canvas.height)
  }

  const drawSectionPreview = (ctx, canvas, start, current) => {
    const x0 = Math.min(start[0], current[0]) * canvas.width
    const y0 = Math.min(start[1], current[1]) * canvas.height
    const w = Math.abs(current[0] - start[0]) * canvas.width
    const h = Math.abs(current[1] - start[1]) * canvas.height
    ctx.fillStyle = 'rgba(0, 140, 255, 0.2)'
    ctx.fillRect(x0, y0, w, h)
    ctx.strokeStyle = '#0088ff'
    ctx.lineWidth = 2
    ctx.strokeRect(x0, y0, w, h)
  }

  const addSection = async (chartId, pageNumber, pageKey, rect) => {
    const existingSections = chartSectionsRef.current[pageKey] ?? []
    if (existingSections.some((s) => rectsOverlap(s, rect))) {
      alert("This overlaps an existing section — sections can't overlap.")
      redrawPage(pageKey)
      return
    }

    const optimistic = { ...rect }
    chartSectionsRef.current[pageKey] = [...existingSections, optimistic]
    redrawPage(pageKey)

    const { data, error: insertError } = await supabase
      .from('chart_sections')
      .insert({ chart_id: chartId, page_number: pageNumber, ...rect, created_by: currentUserId })
      .select()
      .single()

    if (insertError) {
      alert(`Could not save section: ${insertError.message}`)
      chartSectionsRef.current[pageKey] = chartSectionsRef.current[pageKey].filter((s) => s !== optimistic)
      redrawPage(pageKey)
      return
    }
    optimistic.id = data.id
  }

  const removeSection = async (pageKey, section) => {
    chartSectionsRef.current[pageKey] = (chartSectionsRef.current[pageKey] ?? []).filter((s) => s !== section)
    redrawPage(pageKey)
    const { error: deleteError } = await supabase.from('chart_sections').delete().eq('id', section.id)
    if (deleteError) alert(`Could not remove section: ${deleteError.message}`)
  }

  // Briefly outlines a pinged section for everyone (including the sender),
  // independent of whatever tool is active. Outline only — the inside
  // stays blank so the chart content underneath is still fully readable.
  const drawPingFlash = (ctx, canvas, pageKey) => {
    const flash = pingFlashRef.current[pageKey]
    if (!flash) return
    const section = (chartSectionsRef.current[pageKey] ?? [])[flash.sectionIndex]
    if (!section) return
    ctx.strokeStyle = colors.ping
    ctx.lineWidth = 4
    ctx.strokeRect(
      section.x0 * canvas.width,
      section.y0 * canvas.height,
      (section.x1 - section.x0) * canvas.width,
      (section.y1 - section.y0) * canvas.height
    )
  }

  const showPingFlash = (pageKey, sectionIndex) => {
    const existing = pingFlashRef.current[pageKey]
    if (existing) clearTimeout(existing.timeoutId)
    const timeoutId = setTimeout(() => {
      delete pingFlashRef.current[pageKey]
      redrawPage(pageKey)
    }, PING_FLASH_MS)
    pingFlashRef.current[pageKey] = { sectionIndex, timeoutId }
    redrawPage(pageKey)
  }

  const jumpToPageKey = (pageKey) => {
    const idx = pageOrderRef.current.indexOf(pageKey)
    if (idx !== -1) setCurrentIndex(idx)
  }

  // Shows the flash + notification immediately on the sender's own screen
  // (an optimistic local update, same pattern as everywhere else in this
  // file) rather than waiting on the broadcast to round-trip back — that
  // round-trip depends on `broadcast.self`, which is not something to
  // build the sender's own feedback on top of.
  const sendPing = (pageKey, sectionIndex) => {
    showPingFlash(pageKey, sectionIndex)
    addNotification(pageKey, sectionIndex)
    channelRef.current?.send({ type: 'broadcast', event: 'ping', payload: { pageKey, sectionIndex } })
  }

  const chartTitleFor = (chartId) => charts.find((c) => c.id === chartId)?.title ?? 'a chart'

  const addNotification = (pageKey, sectionIndex) => {
    const [chartId] = pageKey.split(':')
    const id = `${pageKey}-${sectionIndex}-${Date.now()}`
    setNotifications((list) => [...list, { id, pageKey, sectionIndex, chartTitle: chartTitleFor(chartId) }])
    setTimeout(() => {
      setNotifications((list) => list.filter((n) => n.id !== id))
    }, NOTIFICATION_MS)
  }

  const dismissNotification = (id) => {
    setNotifications((list) => list.filter((n) => n.id !== id))
  }

  const goToNotification = (n) => {
    jumpToPageKey(n.pageKey)
    showPingFlash(n.pageKey, n.sectionIndex)
    dismissNotification(n.id)
  }

  const redrawPage = (pageKey) => {
    const canvas = overlaysRef.current[pageKey]
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const ann of annotationsRef.current[pageKey] ?? []) {
      renderAnnotation(ctx, canvas, ann)
    }
    if (toolRef.current === 'markSections' || toolRef.current === 'eraseSections') {
      drawSections(ctx, canvas, pageKey)
    }
    drawPingFlash(ctx, canvas, pageKey)
  }

  const renderAnnotation = (ctx, canvas, ann) => {
    if (ann.type === 'text') {
      const [x, y] = ann.points[0]
      ctx.fillStyle = ann.color
      ctx.font = `${ann.size ?? 16}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(ann.text, x * canvas.width, y * canvas.height)
      return
    }
    ctx.strokeStyle = ann.color
    ctx.lineWidth = ann.size ?? 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ann.points.forEach(([x, y], i) => {
      const px = x * canvas.width
      const py = y * canvas.height
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  }

  const findHit = (canvas, pageKey, pos) => {
    const px = pos[0] * canvas.width
    const py = pos[1] * canvas.height
    const annotations = annotationsRef.current[pageKey] ?? []
    return annotations.find((ann) => {
      if (ann.type === 'text') {
        const [x, y] = ann.points[0]
        return Math.hypot(x * canvas.width - px, y * canvas.height - py) < TEXT_HIT_RADIUS_PX
      }
      return ann.points.some(
        ([x, y]) => Math.hypot(x * canvas.width - px, y * canvas.height - py) < ERASE_RADIUS_PX
      )
    })
  }

  const eraseAnnotation = async (pageKey, ann) => {
    const list = annotationsRef.current[pageKey] ?? []
    annotationsRef.current[pageKey] = list.filter((a) => a.id !== ann.id)
    redrawPage(pageKey)

    const { data, error: deleteError } = await supabase
      .from('annotations')
      .delete()
      .eq('id', ann.id)
      .select()

    if (deleteError || !data || data.length === 0) {
      annotationsRef.current[pageKey] = [...annotationsRef.current[pageKey], ann]
      redrawPage(pageKey)
      alert(deleteError ? `Could not erase: ${deleteError.message}` : 'You can only erase annotations you created.')
    }
  }

  const attachDrawing = (overlay, chartId, pageNumber, pageKey) => {
    let drawing = false
    let erasing = false
    let points = []
    let markStart = null

    const getPos = (e) => {
      const rect = overlay.getBoundingClientRect()
      return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
    }

    overlay.addEventListener('pointerdown', (e) => {
      const tool_ = toolRef.current
      if (tool_ === 'view') return
      const pos = getPos(e)

      if (tool_ === 'erase') {
        erasing = true
        overlay.setPointerCapture(e.pointerId)
        const hit = findHit(overlay, pageKey, pos)
        if (hit) eraseAnnotation(pageKey, hit)
        return
      }

      if (tool_ === 'text') {
        const label = window.prompt('Note text:')
        if (label) insertAnnotation(chartId, pageNumber, pageKey, 'text', [pos], label, fontSizeRef.current)
        return
      }

      if (tool_ === 'markSections') {
        markStart = pos
        overlay.setPointerCapture(e.pointerId)
        return
      }

      if (tool_ === 'eraseSections') {
        const hit = findSectionAt(pageKey, pos)
        if (hit) removeSection(pageKey, hit)
        return
      }

      drawing = true
      points = [pos]
      overlay.setPointerCapture(e.pointerId)
    })

    overlay.addEventListener('pointermove', (e) => {
      const pos = getPos(e)

      if (erasing) {
        const hit = findHit(overlay, pageKey, pos)
        if (hit) eraseAnnotation(pageKey, hit)
        return
      }

      if (markStart) {
        redrawPage(pageKey)
        drawSectionPreview(overlay.getContext('2d'), overlay, markStart, pos)
        return
      }

      if (toolRef.current === 'eraseSections') {
        redrawPage(pageKey)
        drawEraseHighlight(overlay.getContext('2d'), overlay, pageKey, pos)
        return
      }

      if (!drawing) return
      points.push(pos)
      redrawPage(pageKey)
      renderAnnotation(overlay.getContext('2d'), overlay, {
        type: 'stroke',
        points,
        color: colorRef.current,
        size: lineWidthRef.current,
      })
    })

    overlay.addEventListener('pointerup', (e) => {
      erasing = false

      if (markStart) {
        const start = markStart
        markStart = null
        const pos = getPos(e)
        const rect = {
          x0: Math.min(start[0], pos[0]),
          x1: Math.max(start[0], pos[0]),
          y0: Math.min(start[1], pos[1]),
          y1: Math.max(start[1], pos[1]),
        }

        if (rect.x1 - rect.x0 < MIN_SECTION_SIZE || rect.y1 - rect.y0 < MIN_SECTION_SIZE) {
          redrawPage(pageKey)
          return
        }

        addSection(chartId, pageNumber, pageKey, rect)
        return
      }

      if (!drawing) return
      drawing = false
      if (points.length < 2) {
        points = []
        return
      }
      const strokePoints = points
      points = []
      insertAnnotation(chartId, pageNumber, pageKey, 'stroke', strokePoints, null, lineWidthRef.current)
    })
  }

  const insertAnnotation = async (chartId, pageNumber, pageKey, type, points, text, size) => {
    const visibility_ = visibilityRef.current
    const color_ = colorRef.current

    const optimistic = { type, points, text, color: color_, size, visibility: visibility_, created_by: currentUserId }
    annotationsRef.current[pageKey] = [...(annotationsRef.current[pageKey] ?? []), optimistic]
    redrawPage(pageKey)

    const { data, error: insertError } = await supabase
      .from('annotations')
      .insert({
        chart_id: chartId,
        page_number: pageNumber,
        type,
        visibility: visibility_,
        points,
        text,
        color: color_,
        size,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (insertError) {
      alert(`Could not save annotation: ${insertError.message}`)
      annotationsRef.current[pageKey] = annotationsRef.current[pageKey].filter((a) => a !== optimistic)
      redrawPage(pageKey)
      return
    }
    optimistic.id = data.id
  }

  const loadAnnotations = () => {
    supabase
      .from('annotations')
      .select('id, chart_id, page_number, type, visibility, points, text, color, size, created_by')
      .in('chart_id', charts.map((c) => c.id))
      .then(({ data }) => {
        for (const row of data ?? []) {
          const pageKey = `${row.chart_id}:${row.page_number}`
          const list = annotationsRef.current[pageKey]
          if (list) list.push(row)
        }
        Object.keys(annotationsRef.current).forEach((k) => redrawPage(k))
      })
  }

  const loadChartSections = () => {
    supabase
      .from('chart_sections')
      .select('id, chart_id, page_number, x0, y0, x1, y1')
      .in('chart_id', charts.map((c) => c.id))
      .then(({ data }) => {
        for (const row of data ?? []) {
          const pageKey = `${row.chart_id}:${row.page_number}`
          const list = chartSectionsRef.current[pageKey]
          if (list) list.push({ id: row.id, x0: row.x0, y0: row.y0, x1: row.x1, y1: row.y1 })
        }
        Object.keys(chartSectionsRef.current).forEach((k) => redrawPage(k))
      })
  }

  useEffect(() => {
    let cancelled = false
    const track = trackRef.current
    track.innerHTML = ''
    pageWrappersRef.current = {}
    overlaysRef.current = {}
    annotationsRef.current = {}
    chartSectionsRef.current = {}
    pageOrderRef.current = []
    currentIndexRef.current = 0
    setCurrentIndex(0)

    const buildChart = async (chart) => {
      const pdf = await pdfjsLib.getDocument({ url: chart.url }).promise
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (cancelled) return
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1.5 })
        if (!pageAspectRef.current || pageAspectRef.current === 1.3) {
          pageAspectRef.current = viewport.height / viewport.width
        }

        const pageKey = `${chart.id}:${pageNumber}`
        const pageWrapper = document.createElement('div')
        pageWrapper.style.position = 'relative'
        pageWrapper.style.flex = '0 0 auto'

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.width = '100%'

        const overlay = document.createElement('canvas')
        overlay.width = viewport.width
        overlay.height = viewport.height
        overlay.style.position = 'absolute'
        overlay.style.top = '0'
        overlay.style.left = '0'
        overlay.style.width = '100%'
        overlay.style.height = '100%'
        overlay.style.pointerEvents = toolRef.current === 'view' ? 'none' : 'auto'

        pageWrapper.appendChild(canvas)
        pageWrapper.appendChild(overlay)
        track.appendChild(pageWrapper)

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        if (cancelled) return

        pageWrappersRef.current[pageKey] = pageWrapper
        overlaysRef.current[pageKey] = overlay
        annotationsRef.current[pageKey] = []
        chartSectionsRef.current[pageKey] = []
        pageOrderRef.current.push(pageKey)
        attachDrawing(overlay, chart.id, pageNumber, pageKey)
        numPagesRef.current += 1
        setNumPages(numPagesRef.current)
      }
    }

    numPagesRef.current = 0
    setNumPages(0)
    ;(async () => {
      for (const chart of charts) {
        if (cancelled) return
        await buildChart(chart)
      }
      if (!cancelled) {
        layoutPages()
        loadAnnotations()
        loadChartSections()
      }
    })().catch((err) => setError(err.message))

    return () => {
      cancelled = true
    }
  }, [chartsKey])

  useEffect(() => {
    const chartIds = charts.map((c) => c.id)
    const channel = supabase
      .channel(`annotations-${chartsKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'annotations', filter: `chart_id=in.(${chartIds.join(',')})` },
        (payload) => {
          const row = payload.new
          if (row.created_by === currentUserId) return
          const pageKey = `${row.chart_id}:${row.page_number}`
          const list = annotationsRef.current[pageKey]
          if (list) {
            list.push(row)
            redrawPage(pageKey)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'annotations', filter: `chart_id=in.(${chartIds.join(',')})` },
        (payload) => {
          const oldRow = payload.old
          const pageKey = `${oldRow.chart_id}:${oldRow.page_number}`
          const list = annotationsRef.current[pageKey]
          if (list) {
            annotationsRef.current[pageKey] = list.filter((a) => a.id !== oldRow.id)
            redrawPage(pageKey)
          }
        }
      )
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        showPingFlash(payload.pageKey, payload.sectionIndex)
        addNotification(payload.pageKey, payload.sectionIndex)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [chartsKey, currentUserId])

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1))
  const goNext = () => setCurrentIndex((i) => Math.min(Math.max(numPages - 1, 0), i + 1))

  return (
    <div
      style={
        fullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: colors.bg,
              color: colors.text,
              padding: '1rem',
              overflowY: 'auto',
            }
          : { marginTop: '1rem', background: colors.card, color: colors.text, borderRadius: '16px', padding: '1rem' }
      }
    >
      {fullscreen && (
        <button
          onClick={() => setFullscreen(false)}
          style={{ ...primaryButtonStyle, position: 'absolute', bottom: '0.5rem', right: '0.5rem' }}
        >
          Back to regular size
        </button>
      )}

      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                background: colors.card,
                border: `2px solid ${colors.ping}`,
                borderRadius: '12px',
                padding: '0.75rem 1rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                maxWidth: '280px',
              }}
            >
              <button
                onClick={() => goToNotification(n)}
                style={{ background: 'none', border: 'none', color: colors.text, textAlign: 'left', cursor: 'pointer', padding: 0, flex: 1 }}
              >
                <strong>📍 Ping</strong>
                <div style={{ fontSize: '0.85rem', color: colors.subtext }}>{n.chartTitle} — tap to go there</div>
              </button>
              <button
                onClick={() => dismissNotification(n.id)}
                style={{ background: 'none', border: 'none', color: colors.subtext, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={onClose} style={buttonStyle}>
          Close
        </button>
        <button
          onClick={() => setToolbarVisible((v) => !v)}
          style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {toolbarVisible ? <ChevronUpIcon /> : <ChevronDownIcon />}
          {toolbarVisible ? 'Hide controls' : 'Show controls'}
        </button>
      </div>

      {toolbarVisible && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setTool('view')} style={toolButtonStyle(tool === 'view')}>
              View
            </button>
            <button onClick={() => setTool('draw')} style={toolButtonStyle(tool === 'draw')}>
              Draw
            </button>
            <button onClick={() => setTool('text')} style={toolButtonStyle(tool === 'text')}>
              Text
            </button>
            <button onClick={() => setTool('erase')} style={toolButtonStyle(tool === 'erase')}>
              Erase
            </button>
            {canDrawShared && (
              <button onClick={() => setTool('markSections')} style={toolButtonStyle(tool === 'markSections')}>
                Mark Sections
              </button>
            )}
            {canDrawShared && (
              <button onClick={() => setTool('eraseSections')} style={toolButtonStyle(tool === 'eraseSections')}>
                Erase Sections
              </button>
            )}
            {!fullscreen && (
              <button onClick={() => setFullscreen(true)} style={buttonStyle}>
                Expand
              </button>
            )}
          </div>

          {tool === 'markSections' && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: colors.subtext }}>
              Drag to select a region, like a screenshot tool. Sections can't overlap. Once marked,
              switch to View and double-click/double-tap a section to ping everyone currently
              viewing this chart to that spot.
            </p>
          )}
          {tool === 'eraseSections' && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: colors.subtext }}>
              Tap a section to remove it.
            </p>
          )}
          {canDrawShared && tool === 'view' && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: colors.subtext }}>
              Double-click/double-tap a marked section to ping everyone viewing this chart.
            </p>
          )}

          {(tool === 'draw' || tool === 'text') && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <label>
                <input
                  type="radio"
                  checked={visibility === 'personal'}
                  onChange={() => setVisibility('personal')}
                />{' '}
                Just me
              </label>
              {canDrawShared && (
                <label>
                  <input
                    type="radio"
                    checked={visibility === 'shared'}
                    onChange={() => setVisibility('shared')}
                  />{' '}
                  Everyone
                </label>
              )}
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    background: c,
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '6px',
                    border: color === c ? `2px solid ${colors.text}` : `1px solid ${colors.border}`,
                    verticalAlign: 'middle',
                    cursor: 'pointer',
                  }}
                />
              ))}
              {tool === 'draw' && (
                <span style={{ display: 'flex', gap: '0.4rem' }}>
                  {LINE_WIDTHS.map((w) => (
                    <button key={w} onClick={() => setLineWidth(w)} style={toolButtonStyle(lineWidth === w)}>
                      {w}px
                    </button>
                  ))}
                </span>
              )}
              {tool === 'text' && (
                <span style={{ display: 'flex', gap: '0.4rem' }}>
                  {FONT_SIZES.map((s) => (
                    <button key={s} onClick={() => setFontSize(s)} style={toolButtonStyle(fontSize === s)}>
                      {s}px
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}

          {error && <p style={{ color: colors.danger }}>Could not render PDF: {error}</p>}

          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={goPrev} disabled={currentIndex === 0} style={buttonStyle}>
              ‹ Prev
            </button>
            {numPages > 0 && (
              <span style={{ color: colors.subtext, fontSize: '0.9rem' }}>
                {pagesPerViewRef.current === 2 && currentIndex + 2 <= numPages
                  ? `Pages ${currentIndex + 1}-${currentIndex + 2} of ${numPages}`
                  : `Page ${currentIndex + 1} of ${numPages}`}
              </span>
            )}
            <button onClick={goNext} disabled={currentIndex >= numPages - 1} style={buttonStyle}>
              Next ›
            </button>
          </div>
        </>
      )}

      <div ref={viewportRef} style={{ marginTop: '0.5rem', overflow: 'hidden', touchAction: 'pan-y' }}>
        <div ref={trackRef} style={{ display: 'flex' }} />
      </div>
    </div>
  )
}

export default PdfViewer
