import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.8; // max 80% of viewport
const DEFAULT_HEIGHT = 260;

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Drag-to-resize handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;
  }, [height]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = dragStartY.current - e.clientY; // dragging up = larger
      const maxH = Math.floor(window.innerHeight * MAX_HEIGHT_RATIO);
      const newHeight = Math.max(MIN_HEIGHT, Math.min(dragStartHeight.current + delta, maxH));
      setHeight(newHeight);
    };

    const handleMouseUp = () => setDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electronAPI is injected by Electron preload
    const api = (window as Record<string, any>).electronAPI;
    if (!api?.terminalCreate) return;

    const term = new Terminal({
      theme: {
        background: '#0d0d1a',
        foreground: '#d4d4d4',
        cursor: '#E2725B',
        cursorAccent: '#0d0d1a',
        selectionBackground: 'rgba(226,114,91,0.25)',
        black: '#1a1a2e',
        red: '#E2725B',
        green: '#2D5F5D',
        yellow: '#d4a373',
        blue: '#5b8dbf',
        magenta: '#b58dae',
        cyan: '#5dafaf',
        white: '#d4d4d4',
        brightBlack: '#555',
        brightRed: '#f5937f',
        brightGreen: '#6bb5b2',
        brightYellow: '#e8c594',
        brightBlue: '#7fb0d8',
        brightMagenta: '#d0adc9',
        brightCyan: '#7fc5c5',
        brightWhite: '#ffffff',
      },
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Fit after render
    requestAnimationFrame(() => fitAddon.fit());
    xtermRef.current = term;

    // Create PTY
    api.terminalCreate();

    // Data from PTY → terminal UI
    const cleanupData = api.onTerminalData((data: string) => {
      term.write(data);
    });

    // PTY exit
    const cleanupExit = api.onTerminalExit(() => {
      term.write('\r\n\x1b[38;5;208m[Process exited — press any key to restart]\x1b[0m\r\n');
      const disposable = term.onKey(() => {
        disposable.dispose();
        api.terminalCreate();
      });
    });

    // Terminal UI → PTY
    const inputDisposable = term.onData((data) => {
      api.terminalInput(data);
    });

    // Resize tracking
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      api.terminalResize(term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cleanupData();
      cleanupExit();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      api.terminalDestroy();
      term.dispose();
    };
  }, []);

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Transparent overlay during drag to prevent terminal stealing mouse events */}
      {dragging && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'row-resize' }} />
      )}
      {/* Drag handle */}
      <div
        style={{
          height: 6,
          background: '#1a1a2e',
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseDown={handleDragStart}
      >
        <div style={{
          width: 40,
          height: 3,
          borderRadius: 2,
          background: '#333',
        }} />
      </div>
      <div
        style={{
          height,
          background: '#0d0d1a',
          overflow: 'hidden',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
