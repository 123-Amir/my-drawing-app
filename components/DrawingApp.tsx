"use client";
import React, { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
type ToolType = "brush" | "eraser" | "rectangle" | "circle";
type DrawingAction = {
  type: ToolType;
  points: [number, number][];
  color: string;
  size: number;
  layer: number;
};
type Layer = {
  name: string;
  visible: boolean;
};

const TOOL_ICONS: Record<ToolType, string> = {
  brush: "🖌️",
  eraser: "🧽",
  rectangle: "▭",
  circle: "⚪",
};

const COLORS = [
  "#000000", "#e11d48", "#f59e42", "#fbbf24", "#22c55e", "#2563eb", "#a21caf", "#ffffff"
];

export default function DrawingApp() {
  // Responsive canvas size
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    function updateDims() {
      setCanvasDims({
        width: Math.round(window.innerWidth * 0.7),
        height: Math.round(window.innerHeight * 0.65),
      });
    }
    if (typeof window !== "undefined") {
      updateDims();
      window.addEventListener("resize", updateDims);
      return () => window.removeEventListener("resize", updateDims);
    }
  }, []);

  // Canvas refs & state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  // Drawing state
  const [tool, setTool] = useState<ToolType>("brush");
  const [color, setColor] = useState("#2563eb");
  const [brushSize, setBrushSize] = useState(12);
  const [actions, setActions] = useState<DrawingAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingAction[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);

  // Layers
  const [layers, setLayers] = useState<Layer[]>([
    { name: "Background", visible: true },
    { name: "Sketch", visible: true }
  ]);
  const [currentLayer, setCurrentLayer] = useState(1);

  // Export modal
  const [showExport, setShowExport] = useState(false);

  // Mouse position (for brush preview)
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  // Set canvas context after mount and canvas size ready
  useEffect(() => {
    if (canvasRef.current && canvasDims) {
      setCtx(canvasRef.current.getContext("2d"));
    }
  }, [canvasDims]);

  // Redraw all actions when ctx, actions, layers, or canvasDims change
  useEffect(() => {
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    layers.forEach((layer, idx) => {
      if (!layer.visible) return;
      actions
        .filter((a) => a.layer === idx)
        .forEach((action) => drawAction(ctx, action));
    });
  }, [ctx, actions, layers, canvasDims]);

  function drawAction(ctx: CanvasRenderingContext2D, action: DrawingAction) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = action.type === "eraser" ? "#fff" : action.color;
    ctx.lineWidth = action.size;
    ctx.globalAlpha = 1;
    if (action.type === "brush" || action.type === "eraser") {
      ctx.beginPath();
      action.points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (action.type === "rectangle" && action.points.length === 2) {
      const [x0, y0] = action.points[0];
      const [x1, y1] = action.points[1];
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    } else if (action.type === "circle" && action.points.length === 2) {
      const [x0, y0] = action.points[0];
      const [x1, y1] = action.points[1];
      const r = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
      ctx.beginPath();
      ctx.arc(x0, y0, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  function getCursorPosition(e: React.MouseEvent) {
    if (!canvasRef.current) return [0, 0] as [number, number];
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return [
      (e.clientX - rect.left) * dpr,
      (e.clientY - rect.top) * dpr,
    ] as [number, number];
  }

  function handlePointerDown(e: React.MouseEvent) {
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getCursorPosition(e);
    setStartPoint(pos);
    if (tool === "brush" || tool === "eraser") {
      setCurrentPoints([pos]);
    }
  }

  function handlePointerMove(e: React.MouseEvent) {
    if (!ctx) return;
    const pos = getCursorPosition(e);
    setMouse({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    if (!isDrawing) return;
    if (tool === "brush" || tool === "eraser") {
      setCurrentPoints((pts) => [...pts, pos]);
      ctx.save();
      ctx.strokeStyle = tool === "eraser" ? "#fff" : color;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      const prev = currentPoints.length ? currentPoints[currentPoints.length - 1] : pos;
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(pos[0], pos[1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  function handlePointerUp(e: React.MouseEvent) {
    if (!ctx) return;
    setIsDrawing(false);
    const pos = getCursorPosition(e);
    let action: DrawingAction | null = null;
    if (tool === "brush" || tool === "eraser") {
      action = {
        type: tool,
        points: [...currentPoints, pos],
        color,
        size: brushSize,
        layer: currentLayer,
      };
      setCurrentPoints([]);
    } else if ((tool === "rectangle" || tool === "circle") && startPoint) {
      action = {
        type: tool,
        points: [startPoint, pos],
        color,
        size: brushSize,
        layer: currentLayer,
      };
    }
    if (action) {
      setActions((prev) => [...prev, action!]);
      setRedoStack([]);
    }
    setStartPoint(null);
  }

  function handleUndo() {
    setActions((prev) => {
      if (prev.length === 0) return prev;
      setRedoStack((redo) => [...redo, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }
  function handleRedo() {
    setRedoStack((redo) => {
      if (redo.length === 0) return redo;
      setActions((prev) => [...prev, redo[redo.length - 1]]);
      return redo.slice(0, -1);
    });
  }
  function handleClear() {
    setActions((prev) => prev.filter((a) => a.layer !== currentLayer));
    setRedoStack([]);
  }
  function handleSaveImage() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = "artboard-pro.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    setShowExport(false);
  }
  function handleAddLayer() {
    setLayers((prev) => [
      ...prev,
      { name: `Layer ${prev.length + 1}`, visible: true },
    ]);
    setCurrentLayer(layers.length);
  }
  function handleToggleLayer(idx: number) {
    setLayers((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, visible: !l.visible } : l
      )
    );
  }

  function LayerThumb({ idx }: { idx: number }) {
    return (
      <div className="w-8 h-8 rounded bg-gradient-to-br from-gray-100 to-gray-300 border shadow-inner flex items-center justify-center text-xs font-bold text-gray-400">
        {idx + 1}
      </div>
    );
  }

  if (!canvasDims) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600 font-sans">
        Loading Drawing App...
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-pink-50 font-sans relative`}>
      {/* Navbar */}
      <motion.nav
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 w-full z-30 bg-white/70 backdrop-blur-lg shadow flex items-center px-8 py-3 justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎨</span>
          <span className="font-extrabold text-xl tracking-tight text-blue-600">Artboard Pro</span>
        </div>
        <span className="text-gray-500 hidden sm:block">Modern Drawing App for Creators</span>
      </motion.nav>

      {/* Floating Tool Panel (Left) */}
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="fixed top-24 left-8 z-20 bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-6 flex flex-col gap-6 w-72"
      >
        <div className="flex gap-2">
          <ToolButton
            icon={TOOL_ICONS.brush}
            label="Brush"
            selected={tool === "brush"}
            onClick={() => setTool("brush")}
          />
          <ToolButton
            icon={TOOL_ICONS.eraser}
            label="Eraser"
            selected={tool === "eraser"}
            onClick={() => setTool("eraser")}
          />
        </div>
        <div className="flex gap-2">
          <ToolButton
            icon={TOOL_ICONS.rectangle}
            label="Rectangle"
            selected={tool === "rectangle"}
            onClick={() => setTool("rectangle")}
          />
          <ToolButton
            icon={TOOL_ICONS.circle}
            label="Circle"
            selected={tool === "circle"}
            onClick={() => setTool("circle")}
          />
        </div>
        <div>
          <label className="font-bold text-sm text-gray-700 mb-1 block">Brush Color</label>
          <div className="flex gap-1 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`w-7 h-7 rounded-full border-2 ${color === c ? "border-blue-500 scale-110" : "border-white"} shadow transition`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-7 h-7 rounded-full border ml-2 p-0"
              title="Custom color"
            />
          </div>
        </div>
        <div>
          <label className="font-bold text-sm text-gray-700 mb-1 block">Brush Size: {brushSize}px</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={2}
              max={48}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="w-32 accent-blue-500"
            />
            {/* Live brush preview */}
            <div
              className="rounded-full border border-gray-300"
              style={{ width: brushSize, height: brushSize, background: color }}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn" onClick={handleUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button className="btn" onClick={handleRedo} title="Redo (Ctrl+Y)">↷ Redo</button>
          <button className="btn" onClick={handleClear} title="Clear Layer">🗑️</button>
        </div>
        <button
          className="btn-primary mt-2"
          onClick={() => setShowExport(true)}
        >
          Save / Export
        </button>
      </motion.div>

      {/* Floating Layers Panel (Right) */}
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="fixed top-24 right-8 z-20 bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-6 w-64"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-gray-700">Layers</span>
          <button
            className="btn-sm"
            onClick={handleAddLayer}
            title="Add Layer"
          >＋</button>
        </div>
        <ul className="space-y-2">
          {layers.map((layer, idx) => (
            <li
              key={idx}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition
                ${currentLayer === idx ? "bg-blue-100/80" : "hover:bg-gray-100/80"}
              `}
              onClick={() => setCurrentLayer(idx)}
            >
              <LayerThumb idx={idx} />
              <span className="flex-1 truncate">{layer.name}</span>
              <button
                className="btn-sm"
                onClick={e => { e.stopPropagation(); handleToggleLayer(idx); }}
                title={layer.visible ? "Hide Layer" : "Show Layer"}
              >
                {layer.visible ? "👁️" : "🚫"}
              </button>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Main Canvas Area */}
      <main className="flex flex-col items-center justify-center min-h-screen pt-32 pb-20">
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative rounded-2xl shadow-2xl border-4 border-white/60 overflow-hidden"
          style={{
            width: canvasDims.width,
            height: canvasDims.height,
            minWidth: 320,
            minHeight: 200,
            background: "#fff"
          }}
        >
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            className="bg-white rounded-2xl cursor-crosshair select-none"
            style={{ touchAction: "none", display: "block" }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={() => setIsDrawing(false)}
            width={canvasDims.width * (window.devicePixelRatio || 1)}
            height={canvasDims.height * (window.devicePixelRatio || 1)}
            tabIndex={0}
          />
          {/* Live brush cursor preview */}
          {mouse && !isDrawing && (
            <motion.div
              className="pointer-events-none absolute border-2 border-blue-400"
              style={{
                left: mouse.x - brushSize / 2,
                top: mouse.y - brushSize / 2,
                width: brushSize,
                height: brushSize,
                borderRadius: "50%",
                background: color + "33",
                zIndex: 10,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </motion.div>
      </main>

      {/* Export Modal */}
      <AnimatePresence>
        {showExport && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl p-8 w-[350px] flex flex-col items-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 className="font-bold text-xl mb-4 text-blue-600">Export Drawing</h2>
              <button
                className="btn-primary w-full mb-2"
                onClick={handleSaveImage}
              >
                Download PNG
              </button>
              <button
                className="btn w-full"
                onClick={() => setShowExport(false)}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 w-full bg-white/70 backdrop-blur-lg shadow flex items-center justify-center py-2 z-30 text-gray-600 text-sm">
        © {new Date().getFullYear()} Artboard Pro &middot; Made with ❤️ for your assignment
      </footer>

      {/* Custom Button Styles */}
      <style jsx global>{`
        .btn {
          @apply px-3 py-1 rounded-lg bg-gray-200 hover:bg-blue-100 transition font-medium text-gray-700 shadow;
        }
        .btn-primary {
          @apply px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-semibold shadow;
        }
        .btn-sm {
          @apply px-2 py-0.5 rounded bg-gray-100 hover:bg-blue-200 text-gray-600 text-xs shadow;
        }
      `}</style>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm shadow transition
        ${selected ? "bg-blue-500 text-white shadow-lg" : "bg-white hover:bg-blue-100 text-blue-600"}
      `}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="text-lg">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  );
}
