import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabaseClient'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#000000']
const LINE_WIDTHS = [1, 2, 4, 8]
const FONT_SIZES = [20, 28, 36, 44]
const ERASE_RADIUS_PX = 12
const TEXT_HIT_RADIUS_PX = 20
const TWO_PAGE_MIN_WIDTH = 640
const SWIPE_THRESHOLD_RATIO = 0.2

function PdfViewer({ url, chartId, currentUserId, canDrawShared, onClose }) {
  const viewportRef = useRef(null) // outer, overflow-hidden window onto the track
  const trackRef = useRef(null) // horizontal flex strip holding every page slot
  const pageWrappersRef = useRef({}) // page_number -> wrapper div (sized as a slot)
  const overlaysRef = useRef({}) // page_number -> overlay canvas element
  const annotationsRef = useRef({}) // page_number -> array of annotation rows (with id)
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
  const [tool, setTool] = useState('view') // 'view' | 'draw' | 'text' | 'erase'
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
  // track to the current page.
  const layoutPages = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const viewportWidth = viewport.clientWidth
    const perView = viewportWidth >= TWO_PAGE_MIN_WIDTH ? 2 : 1
    const maxHeight = window.innerHeight * (fullscreenRef.current ? 0.85 : 0.7)

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
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Swipe/drag to turn pages, one page at a time. Only active in 'view' —
  // drawing tools capture the pointer on their own overlay instead.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let startX = null
    let baseIndex = 0
    let deltaX = 0

    const onPointerDown = (e) => {
      if (toolRef.current !== 'view') return
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

  const redrawPage = (pageNumber) => {
    const canvas = overlaysRef.current[pageNumber]
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const ann of annotationsRef.current[pageNumber] ?? []) {
      renderAnnotation(ctx, canvas, ann)
    }
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

  const findHit = (canvas, pageNumber, pos) => {
    const px = pos[0] * canvas.width
    const py = pos[1] * canvas.height
    const annotations = annotationsRef.current[pageNumber] ?? []
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

  const eraseAnnotation = async (pageNumber, ann) => {
    const list = annotationsRef.current[pageNumber] ?? []
    annotationsRef.current[pageNumber] = list.filter((a) => a.id !== ann.id)
    redrawPage(pageNumber)

    const { data, error: deleteError } = await supabase
      .from('annotations')
      .delete()
      .eq('id', ann.id)
      .select()

    if (deleteError || !data || data.length === 0) {
      annotationsRef.current[pageNumber] = [...annotationsRef.current[pageNumber], ann]
      redrawPage(pageNumber)
      alert(deleteError ? `Could not erase: ${deleteError.message}` : 'You can only erase annotations you created.')
    }
  }

  const attachDrawing = (overlay, pageNumber) => {
    let drawing = false
    let erasing = false
    let points = []

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
        const hit = findHit(overlay, pageNumber, pos)
        if (hit) eraseAnnotation(pageNumber, hit)
        return
      }

      if (tool_ === 'text') {
        const label = window.prompt('Note text:')
        if (label) insertAnnotation(pageNumber, 'text', [pos], label, fontSizeRef.current)
        return
      }

      drawing = true
      points = [pos]
      overlay.setPointerCapture(e.pointerId)
    })

    overlay.addEventListener('pointermove', (e) => {
      const pos = getPos(e)

      if (erasing) {
        const hit = findHit(overlay, pageNumber, pos)
        if (hit) eraseAnnotation(pageNumber, hit)
        return
      }

      if (!drawing) return
      points.push(pos)
      redrawPage(pageNumber)
      renderAnnotation(overlay.getContext('2d'), overlay, {
        type: 'stroke',
        points,
        color: colorRef.current,
        size: lineWidthRef.current,
      })
    })

    overlay.addEventListener('pointerup', () => {
      erasing = false
      if (!drawing) return
      drawing = false
      if (points.length < 2) {
        points = []
        return
      }
      const strokePoints = points
      points = []
      insertAnnotation(pageNumber, 'stroke', strokePoints, null, lineWidthRef.current)
    })
  }

  const insertAnnotation = async (pageNumber, type, points, text, size) => {
    const visibility_ = visibilityRef.current
    const color_ = colorRef.current

    const optimistic = { type, points, text, color: color_, size, visibility: visibility_, created_by: currentUserId }
    annotationsRef.current[pageNumber] = [...(annotationsRef.current[pageNumber] ?? []), optimistic]
    redrawPage(pageNumber)

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
      annotationsRef.current[pageNumber] = annotationsRef.current[pageNumber].filter((a) => a !== optimistic)
      redrawPage(pageNumber)
      return
    }
    optimistic.id = data.id
  }

  const loadAnnotations = () => {
    supabase
      .from('annotations')
      .select('id, page_number, type, visibility, points, text, color, size, created_by')
      .eq('chart_id', chartId)
      .then(({ data }) => {
        for (const row of data ?? []) {
          const list = annotationsRef.current[row.page_number]
          if (list) list.push(row)
        }
        Object.keys(annotationsRef.current).forEach((p) => redrawPage(Number(p)))
      })
  }

  useEffect(() => {
    let cancelled = false
    const track = trackRef.current
    track.innerHTML = ''
    pageWrappersRef.current = {}
    overlaysRef.current = {}
    annotationsRef.current = {}
    currentIndexRef.current = 0
    setCurrentIndex(0)

    pdfjsLib
      .getDocument({ url })
      .promise.then(async (pdf) => {
        numPagesRef.current = pdf.numPages
        setNumPages(pdf.numPages)

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return
          const page = await pdf.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.5 })
          if (pageNumber === 1) pageAspectRef.current = viewport.height / viewport.width

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

          pageWrappersRef.current[pageNumber] = pageWrapper
          overlaysRef.current[pageNumber] = overlay
          annotationsRef.current[pageNumber] = []
          attachDrawing(overlay, pageNumber)
        }

        if (!cancelled) {
          layoutPages()
          loadAnnotations()
        }
      })
      .catch((err) => setError(err.message))

    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    const channel = supabase
      .channel(`annotations-${chartId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'annotations', filter: `chart_id=eq.${chartId}` },
        (payload) => {
          const row = payload.new
          if (row.created_by === currentUserId) return
          const list = annotationsRef.current[row.page_number]
          if (list) {
            list.push(row)
            redrawPage(row.page_number)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'annotations', filter: `chart_id=eq.${chartId}` },
        (payload) => {
          const oldRow = payload.old
          const list = annotationsRef.current[oldRow.page_number]
          if (list) {
            annotationsRef.current[oldRow.page_number] = list.filter((a) => a.id !== oldRow.id)
            redrawPage(oldRow.page_number)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chartId, currentUserId])

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
              background: 'white',
              padding: '1rem',
              overflowY: 'auto',
            }
          : { marginTop: '1rem', border: '1px solid #ccc', padding: '1rem' }
      }
    >
      {fullscreen && (
        <button
          onClick={() => setFullscreen(false)}
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
        >
          Back to regular size
        </button>
      )}

      <div>
        <button onClick={onClose}>Close</button>{' '}
        <button onClick={() => setTool('view')} disabled={tool === 'view'}>
          View
        </button>{' '}
        <button onClick={() => setTool('draw')} disabled={tool === 'draw'}>
          Draw
        </button>{' '}
        <button onClick={() => setTool('text')} disabled={tool === 'text'}>
          Text
        </button>{' '}
        <button onClick={() => setTool('erase')} disabled={tool === 'erase'}>
          Erase
        </button>{' '}
        {!fullscreen && <button onClick={() => setFullscreen(true)}>Expand</button>}
      </div>

      {(tool === 'draw' || tool === 'text') && (
        <div style={{ marginTop: '0.5rem' }}>
          <label>
            <input
              type="radio"
              checked={visibility === 'personal'}
              onChange={() => setVisibility('personal')}
            />{' '}
            Just me
          </label>{' '}
          {canDrawShared && (
            <label>
              <input
                type="radio"
                checked={visibility === 'shared'}
                onChange={() => setVisibility('shared')}
              />{' '}
              Everyone
            </label>
          )}{' '}
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                background: c,
                width: '1.5rem',
                height: '1.5rem',
                border: color === c ? '2px solid black' : '1px solid #ccc',
                verticalAlign: 'middle',
              }}
            />
          ))}
          {tool === 'draw' && (
            <span style={{ marginLeft: '0.5rem' }}>
              {LINE_WIDTHS.map((w) => (
                <button key={w} onClick={() => setLineWidth(w)} disabled={lineWidth === w}>
                  {w}px
                </button>
              ))}
            </span>
          )}
          {tool === 'text' && (
            <span style={{ marginLeft: '0.5rem' }}>
              {FONT_SIZES.map((s) => (
                <button key={s} onClick={() => setFontSize(s)} disabled={fontSize === s}>
                  {s}px
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {error && <p style={{ color: 'red' }}>Could not render PDF: {error}</p>}

      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={goPrev} disabled={currentIndex === 0}>
          ‹ Prev
        </button>
        {numPages > 0 && (
          <span>
            {pagesPerViewRef.current === 2 && currentIndex + 2 <= numPages
              ? `Pages ${currentIndex + 1}-${currentIndex + 2} of ${numPages}`
              : `Page ${currentIndex + 1} of ${numPages}`}
          </span>
        )}
        <button onClick={goNext} disabled={currentIndex >= numPages - 1}>
          Next ›
        </button>
      </div>

      <div ref={viewportRef} style={{ marginTop: '0.5rem', overflow: 'hidden', touchAction: 'pan-y' }}>
        <div ref={trackRef} style={{ display: 'flex' }} />
      </div>
    </div>
  )
}

export default PdfViewer
