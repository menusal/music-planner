import { useState, useEffect, useRef } from 'react';
import { XMarkIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

// Version number - increment this when deploying a new version
const DEBUG_PANEL_VERSION = '1.0.6';

const DebugPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const maxLogs = 100;

  useEffect(() => {
    // Listen for debug events
    const handleDebugLog = (event: CustomEvent<{ level: 'info' | 'warn' | 'error'; message: string }>) => {
      const { level, message } = event.detail;
      const logEntry: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      };
      
      setLogs((prevLogs) => {
        const newLogs = [...prevLogs, logEntry];
        // Keep only the last maxLogs entries
        return newLogs.slice(-maxLogs);
      });
    };

    window.addEventListener('debug-log' as any, handleDebugLog as EventListener);

    return () => {
      window.removeEventListener('debug-log' as any, handleDebugLog as EventListener);
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs are added
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const copyLogs = () => {
    const logsText = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`)
      .join('\n');
    
    navigator.clipboard.writeText(logsText).then(() => {
      // Show feedback
      const button = document.getElementById('copy-logs-btn');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          if (button) button.textContent = originalText;
        }, 2000);
      }
    }).catch((err) => {
      console.error('Failed to copy logs:', err);
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium"
        aria-label="Open Debug Panel"
        title={`Debug Panel v${DEBUG_PANEL_VERSION}`}
      >
        Debug v{DEBUG_PANEL_VERSION}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Debug Logs v{DEBUG_PANEL_VERSION}</h3>
        <div className="flex items-center space-x-2">
          <button
            id="copy-logs-btn"
            onClick={copyLogs}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Copy Logs"
            title="Copy Logs"
          >
            <ClipboardDocumentIcon className="w-5 h-5" />
          </button>
          <button
            onClick={clearLogs}
            className="text-gray-400 hover:text-white text-xs px-2 py-1"
            aria-label="Clear Logs"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Close Debug Panel"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No logs yet</p>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`text-xs font-mono p-2 rounded ${
                log.level === 'error'
                  ? 'bg-red-900/30 text-red-300'
                  : log.level === 'warn'
                  ? 'bg-yellow-900/30 text-yellow-300'
                  : 'bg-gray-800 text-gray-300'
              }`}
            >
              <span className="text-gray-500">[{log.timestamp}]</span>{' '}
              <span className="font-semibold">{log.level.toUpperCase()}:</span>{' '}
              <span>{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

// Helper function to log debug messages
export const debugLog = (level: 'info' | 'warn' | 'error', message: string) => {
  const event = new CustomEvent('debug-log', {
    detail: { level, message },
  });
  window.dispatchEvent(event);
  // Also log to console
  if (level === 'error') {
    console.error(`[DEBUG] ${message}`);
  } else if (level === 'warn') {
    console.warn(`[DEBUG] ${message}`);
  } else {
    console.log(`[DEBUG] ${message}`);
  }
};

export default DebugPanel;

