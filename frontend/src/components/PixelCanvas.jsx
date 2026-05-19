import { useCallback, useEffect, useRef, useState } from "react";

const GRID_SIZE = 100;
const BASE_SIZE = 500;
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TOUCH_MOVE_THRESHOLD = 8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sameCell = (left, right) => left?.x === right?.x && left?.y === right?.y;

const getLineCells = (from, to) => {
  const cells = [];
  let x = from.x;
  let y = from.y;
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = deltaX - deltaY;

  while (true) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) {
      break;
    }

    const doubleError = error * 2;
    if (doubleError > -deltaY) {
      error -= deltaY;
      x += stepX;
    }
    if (doubleError < deltaX) {
      error += deltaX;
      y += stepY;
    }
  }

  return cells;
};

export const PixelCanvas = ({ canvas, onPaint }) => {
  const viewportRef = useRef(null);
  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const mouseActionRef = useRef(null);
  const lastPaintedCellRef = useRef(null);
  const touchStartRef = useRef(null);
  const didGestureRef = useRef(false);
  const touchMovedRef = useRef(false);
  const spacePressedRef = useRef(false);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const fitTransform = useCallback((candidate) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return candidate;
    }

    const { width, height } = viewport.getBoundingClientRect();
    const scale = clamp(candidate.scale, MIN_SCALE, MAX_SCALE);
    const minX = Math.min(0, width - width * scale);
    const minY = Math.min(0, height - height * scale);

    return {
      scale,
      x: clamp(candidate.x, minX, 0),
      y: clamp(candidate.y, minY, 0)
    };
  }, []);

  const setFittedTransform = useCallback((updater) => {
    setTransform((current) => fitTransform(typeof updater === "function" ? updater(current) : updater));
  }, [fitTransform]);

  useEffect(() => {
    const element = canvasRef.current;
    const context = element.getContext("2d");
    const cell = BASE_SIZE / GRID_SIZE;

    context.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
    canvas.forEach((color, index) => {
      const x = index % GRID_SIZE;
      const y = Math.floor(index / GRID_SIZE);
      context.fillStyle = color || "#ffffff";
      context.fillRect(x * cell, y * cell, cell, cell);
    });

    context.strokeStyle = "rgba(15, 23, 42, 0.08)";
    context.lineWidth = 1;
    for (let index = 0; index <= GRID_SIZE; index += 1) {
      const pos = index * cell;
      context.beginPath();
      context.moveTo(pos, 0);
      context.lineTo(pos, BASE_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, pos);
      context.lineTo(BASE_SIZE, pos);
      context.stroke();
    }
  }, [canvas]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const observer = new ResizeObserver(() => setFittedTransform((current) => current));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [setFittedTransform]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        spacePressedRef.current = true;
        setIsSpacePressed(true);
      }
    };
    const onKeyUp = (event) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
        setIsSpacePressed(false);
      }
    };
    const onBlur = () => {
      spacePressedRef.current = false;
      setIsSpacePressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const pointerPosition = (event) => ({
    x: event.clientX,
    y: event.clientY
  });

  const viewportPoint = (clientPoint) => {
    const rect = viewportRef.current.getBoundingClientRect();
    return {
      x: clientPoint.x - rect.left,
      y: clientPoint.y - rect.top
    };
  };

  const toCell = (event) => {
    const rect = boardRef.current.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return null;
    }

    const localX = ((event.clientX - rect.left) / rect.width) * GRID_SIZE;
    const localY = ((event.clientY - rect.top) / rect.height) * GRID_SIZE;
    return {
      x: clamp(Math.floor(localX), 0, GRID_SIZE - 1),
      y: clamp(Math.floor(localY), 0, GRID_SIZE - 1)
    };
  };

  const paintCell = (cell) => {
    if (!cell || sameCell(lastPaintedCellRef.current, cell)) {
      return;
    }

    lastPaintedCellRef.current = cell;
    onPaint(cell);
  };

  const paintToCell = (cell) => {
    if (!cell) {
      return;
    }

    if (!lastPaintedCellRef.current) {
      paintCell(cell);
      return;
    }

    getLineCells(lastPaintedCellRef.current, cell).forEach(paintCell);
  };

  const zoomAround = (nextScale, anchor) => {
    setFittedTransform((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const localX = (anchor.x - current.x) / current.scale;
      const localY = (anchor.y - current.y) / current.scale;
      return {
        scale,
        x: anchor.x - localX * scale,
        y: anchor.y - localY * scale
      };
    });
  };

  const zoomFromCenter = (multiplier) => {
    const rect = viewportRef.current.getBoundingClientRect();
    zoomAround(transform.scale * multiplier, {
      x: rect.width / 2,
      y: rect.height / 2
    });
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = pointerPosition(event);
    pointersRef.current.set(event.pointerId, position);

    if (event.pointerType === "mouse") {
      if (event.button === 0 && !spacePressedRef.current) {
        mouseActionRef.current = { mode: "draw", pointerId: event.pointerId };
        paintCell(toCell(event));
      } else if (event.button === 1 || event.button === 2 || spacePressedRef.current) {
        mouseActionRef.current = {
          mode: "pan",
          pointerId: event.pointerId,
          start: viewportPoint(position),
          transform
        };
      }
      return;
    }

    if (pointersRef.current.size === 1) {
      touchStartRef.current = position;
      touchMovedRef.current = false;
    }

    if (pointersRef.current.size === 2) {
      didGestureRef.current = true;
      const [first, second] = [...pointersRef.current.values()];
      const midpoint = viewportPoint({
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2
      });
      gestureRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        midpoint,
        transform
      };
    }
  };

  const onPointerMove = (event) => {
    if (event.pointerType === "mouse") {
      setHoverCell(toCell(event));
    }

    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const position = pointerPosition(event);
    pointersRef.current.set(event.pointerId, position);

    if (event.pointerType === "mouse") {
      const action = mouseActionRef.current;
      if (!action || action.pointerId !== event.pointerId) {
        return;
      }

      if (action.mode === "draw") {
        paintToCell(toCell(event));
      }

      if (action.mode === "pan") {
        const current = viewportPoint(position);
        setFittedTransform({
          ...action.transform,
          x: action.transform.x + current.x - action.start.x,
          y: action.transform.y + current.y - action.start.y
        });
      }
      return;
    }

    if (pointersRef.current.size === 1 && touchStartRef.current) {
      touchMovedRef.current =
        touchMovedRef.current ||
        Math.hypot(position.x - touchStartRef.current.x, position.y - touchStartRef.current.y) >
          TOUCH_MOVE_THRESHOLD;
    }

    if (pointersRef.current.size !== 2 || !gestureRef.current) {
      return;
    }

    const [first, second] = [...pointersRef.current.values()];
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const midpoint = viewportPoint({
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    });
    const nextScale = clamp(
      gestureRef.current.transform.scale * (distance / gestureRef.current.distance),
      MIN_SCALE,
      MAX_SCALE
    );
    const localX = (gestureRef.current.midpoint.x - gestureRef.current.transform.x) / gestureRef.current.transform.scale;
    const localY = (gestureRef.current.midpoint.y - gestureRef.current.transform.y) / gestureRef.current.transform.scale;

    setFittedTransform({
      scale: nextScale,
      x: midpoint.x - localX * nextScale,
      y: midpoint.y - localY * nextScale
    });
  };

  const onPointerUp = (event) => {
    const hadSinglePointer = pointersRef.current.size === 1;
    pointersRef.current.delete(event.pointerId);

    if (event.pointerType === "mouse") {
      mouseActionRef.current = null;
      lastPaintedCellRef.current = null;
      return;
    }

    if (hadSinglePointer && !didGestureRef.current && !touchMovedRef.current) {
      const cell = toCell(event);
      if (cell) {
        onPaint(cell);
      }
    }

    if (pointersRef.current.size < 2) {
      gestureRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      didGestureRef.current = false;
      touchMovedRef.current = false;
      touchStartRef.current = null;
    }
  };

  const onWheel = (event) => {
    event.preventDefault();
    const anchor = viewportPoint(pointerPosition(event));
    zoomAround(transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), anchor);
  };

  const resetView = () => setTransform({ scale: 1, x: 0, y: 0 });

  return (
    <div className="pixel-canvas-shell">
      <div className="pixel-toolbar">
        <span>{hoverCell ? `坐标 ${hoverCell.x}, ${hoverCell.y}` : "移动到画布上查看坐标"}</span>
        <div>
          <button type="button" onClick={() => zoomFromCenter(0.8)} aria-label="缩小画布">
            −
          </button>
          <strong>{Math.round(transform.scale * 100)}%</strong>
          <button type="button" onClick={() => zoomFromCenter(1.25)} aria-label="放大画布">
            +
          </button>
          <button type="button" onClick={resetView}>
            复位
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className={isSpacePressed ? "pixel-viewport is-panning" : "pixel-viewport"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoverCell(null)}
        onWheel={onWheel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          ref={boardRef}
          className="pixel-board"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
          }}
        >
          <canvas ref={canvasRef} width={BASE_SIZE} height={BASE_SIZE} />
          {hoverCell && (
            <span
              className="pixel-hover-cell"
              style={{
                left: `${hoverCell.x}%`,
                top: `${hoverCell.y}%`
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
