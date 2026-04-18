import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── Types ───
export interface NodeData {
  id: string;
  title: string;
  tags: string[];
  filePath: string;
  summary: string;
  connections: string[];
}

export interface QueryState {
  text: string;
  isProcessing: boolean;
  response: string | null;
}

export interface SystemStatus {
  llm: { name: string; status: 'connected' | 'disconnected' | 'loading' };
  vault: { name: string; syncStatus: 'active' | 'syncing' | 'offline' };
  audio: { active: boolean; amplitude: number };
}

export interface DashboardState {
  // Layer 2: Knowledge HUD
  selectedNode: NodeData | null;
  hudOpen: boolean;
  openHUD: (node: NodeData) => void;
  closeHUD: () => void;

  // Layer 1: Neural Interface
  query: QueryState;
  setQueryText: (text: string) => void;
  submitQuery: () => void;
  setProcessing: (isProcessing: boolean) => void;
  setResponse: (response: string) => void;

  // Layer 3: System Telemetry
  systemStatus: SystemStatus;
  updateAudioAmplitude: (amp: number) => void;
}

// ─── Context ───
const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

// ─── Provider ───
export function DashboardProvider({ children }: { children: ReactNode }) {
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [hudOpen, setHudOpen] = useState(false);

  const [query, setQuery] = useState<QueryState>({
    text: '',
    isProcessing: false,
    response: null,
  });

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    llm: { name: 'Gemma-4', status: 'connected' },
    vault: { name: 'Jamie_Personal_Vault', syncStatus: 'active' },
    audio: { active: false, amplitude: 0 },
  });

  const openHUD = useCallback((node: NodeData) => {
    setSelectedNode(node);
    setHudOpen(true);
  }, []);

  const closeHUD = useCallback(() => {
    setHudOpen(false);
    setTimeout(() => setSelectedNode(null), 300);
  }, []);

  const setQueryText = useCallback((text: string) => {
    setQuery((q) => ({ ...q, text }));
  }, []);

  const submitQuery = useCallback(() => {
    if (!query.text.trim()) return;
    setQuery((q) => ({ ...q, isProcessing: true, response: null }));
    // Simulate processing — in production this calls tRPC → LLM/RAG
    setTimeout(() => {
      setQuery((q) => ({
        ...q,
        isProcessing: false,
        response: `The Singularity has processed your query: "${q.text}". Analysis complete.`,
      }));
    }, 2000);
  }, [query.text]);

  const setProcessing = useCallback((isProcessing: boolean) => {
    setQuery((q) => ({ ...q, isProcessing }));
  }, []);

  const setResponse = useCallback((response: string) => {
    setQuery((q) => ({ ...q, response, isProcessing: false }));
  }, []);

  const updateAudioAmplitude = useCallback((amp: number) => {
    setSystemStatus((s) => ({
      ...s,
      audio: { active: amp > 0.05, amplitude: amp },
    }));
  }, []);

  const value: DashboardState = {
    selectedNode,
    hudOpen,
    openHUD,
    closeHUD,
    query,
    setQueryText,
    submitQuery,
    setProcessing,
    setResponse,
    systemStatus,
    updateAudioAmplitude,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
