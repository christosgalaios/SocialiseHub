import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface Props {
  height?: number;
}

export function TerminalPanel({ height = 260 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

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
    <div
      style={{
        height,
        borderTop: '2px solid #1a1a2e',
        background: '#0d0d1a',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
