import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const MathCanvasContext = createContext(null);

function newestCanvas(canvases) {
  let newest = null;
  for (const canvas of canvases.values()) {
    if (!newest || canvas.updatedAt > newest.updatedAt) newest = canvas;
  }
  return newest;
}

export function MathCanvasProvider({ children }) {
  const canvasesRef = useRef(new Map());
  const activeCanvasRef = useRef(null);
  const [activeCanvas, setActiveCanvas] = useState(null);

  const publishCanvas = useCallback((id, canvas) => {
    if (!id || !canvas?.dataUrl) return;
    const next = {
      id,
      dataUrl: canvas.dataUrl,
      mimeType: canvas.mimeType || 'image/png',
      name: canvas.name || 'Live math canvas',
      source: canvas.source || 'math-canvas',
      updatedAt: Date.now(),
    };
    canvasesRef.current.set(id, next);
    activeCanvasRef.current = next;
    setActiveCanvas(next);
  }, []);

  const removeCanvas = useCallback((id) => {
    if (!id) return;
    canvasesRef.current.delete(id);
    if (activeCanvasRef.current?.id !== id) return;
    const next = newestCanvas(canvasesRef.current);
    activeCanvasRef.current = next;
    setActiveCanvas(next);
  }, []);

  const getActiveCanvas = useCallback(() => activeCanvasRef.current, []);

  const value = useMemo(() => ({
    activeCanvas,
    publishCanvas,
    removeCanvas,
    getActiveCanvas,
  }), [activeCanvas, publishCanvas, removeCanvas, getActiveCanvas]);

  return (
    <MathCanvasContext.Provider value={value}>
      {children}
    </MathCanvasContext.Provider>
  );
}

export function useMathCanvas() {
  const ctx = useContext(MathCanvasContext);
  if (!ctx) throw new Error('useMathCanvas must be used within MathCanvasProvider');
  return ctx;
}

export function useMathCanvasOptional() {
  return useContext(MathCanvasContext);
}
