import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cable,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cpu,
  GitBranch,
  Layers,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

type Bit = 0 | 1;
type LabMode = "gate" | "flipflop";
type GateType = "AND" | "OR" | "NOT" | "NAND" | "NOR" | "XOR" | "XNOR";
type SequentialType = "DFF" | "JKFF" | "TFF";
type ComponentType = "INPUT" | "OUTPUT" | GateType | SequentialType;
type ValidationTone = "ok" | "warn" | "error";

type CircuitNode = {
  id: string;
  type: ComponentType;
  label: string;
  x: number;
  y: number;
  inputIds: Array<string | null>;
};

type ValidationState = {
  tone: ValidationTone;
  message: string;
  detail: string;
};

type TruthRow = {
  inputs: Bit[];
  output: Bit;
};

const NODE_WIDTH = 142;
const NODE_HEIGHT = 84;

const gateTypes: GateType[] = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];
const sequentialTypes: SequentialType[] = ["DFF", "JKFF", "TFF"];

const kindLabels: Record<ComponentType, string> = {
  INPUT: "INPUT",
  OUTPUT: "OUTPUT",
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  NAND: "NAND",
  NOR: "NOR",
  XOR: "XOR",
  XNOR: "XNOR",
  DFF: "D FLIP-FLOP",
  JKFF: "JK FLIP-FLOP",
  TFF: "T FLIP-FLOP",
};

const kindDescriptions: Record<ComponentType, string> = {
  INPUT: "Binary source",
  OUTPUT: "Probe output",
  AND: "All high",
  OR: "Any high",
  NOT: "Invert signal",
  NAND: "AND inverted",
  NOR: "OR inverted",
  XOR: "One high",
  XNOR: "Equal inputs",
  DFF: "Data storage",
  JKFF: "Set / reset",
  TFF: "Toggle state",
};

const slotsFor = (type: ComponentType): string[] => {
  if (type === "INPUT" || type === "OUTPUT") return type === "OUTPUT" ? ["IN"] : [];
  if (type === "NOT") return ["IN"];
  if (gateTypes.includes(type as GateType)) return ["A", "B"];
  if (type === "DFF") return ["D", "CLK"];
  if (type === "JKFF") return ["J", "K", "CLK"];
  return ["T", "CLK"];
};

const isSequential = (type: ComponentType) => sequentialTypes.includes(type as SequentialType);
const isGate = (type: ComponentType) => gateTypes.includes(type as GateType);

function createNode(
  id: string,
  type: ComponentType,
  label: string,
  x: number,
  y: number,
  inputIds: Array<string | null> = [],
): CircuitNode {
  return { id, type, label, x, y, inputIds };
}

function createPreset(mode: LabMode): CircuitNode[] {
  if (mode === "flipflop") {
    return [
      createNode("input-d", "INPUT", "D", 42, 108),
      createNode("input-clk", "INPUT", "CLK", 42, 250),
      createNode("dff-1", "DFF", "DFF 1", 318, 178, ["input-d", "input-clk"]),
      createNode("output-q", "OUTPUT", "Q", 616, 178, ["dff-1"]),
    ];
  }

  return [
    createNode("input-a", "INPUT", "A", 42, 102),
    createNode("input-b", "INPUT", "B", 42, 248),
    createNode("gate-1", "AND", "AND 1", 318, 176, ["input-a", "input-b"]),
    createNode("output-z", "OUTPUT", "Z", 616, 176, ["gate-1"]),
  ];
}

function evaluateSignal(
  id: string,
  nodes: CircuitNode[],
  inputValues: Record<string, Bit>,
  ffStates: Record<string, Bit>,
  memo = new Map<string, Bit>(),
  visiting = new Set<string>(),
): Bit {
  if (memo.has(id)) return memo.get(id) ?? 0;
  if (visiting.has(id)) return 0;

  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) return 0;
  if (node.type === "INPUT") return inputValues[node.id] ?? 0;
  if (isSequential(node.type)) return ffStates[node.id] ?? 0;

  visiting.add(id);
  const values = node.inputIds.map((sourceId) =>
    sourceId ? evaluateSignal(sourceId, nodes, inputValues, ffStates, memo, visiting) : 0,
  );
  visiting.delete(id);

  let output: Bit = 0;
  if (node.type === "OUTPUT") {
    output = values[0] ?? 0;
  } else if (node.type === "AND") {
    output = values.every(Boolean) ? 1 : 0;
  } else if (node.type === "OR") {
    output = values.some(Boolean) ? 1 : 0;
  } else if (node.type === "NOT") {
    output = values[0] ? 0 : 1;
  } else if (node.type === "NAND") {
    output = values.every(Boolean) ? 0 : 1;
  } else if (node.type === "NOR") {
    output = values.some(Boolean) ? 0 : 1;
  } else if (node.type === "XOR") {
    output = values.filter(Boolean).length === 1 ? 1 : 0;
  } else if (node.type === "XNOR") {
    output = values.filter(Boolean).length === 1 ? 0 : 1;
  }

  memo.set(id, output);
  return output;
}

function findCycle(nodes: CircuitNode[]): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const node = nodes.find((candidate) => candidate.id === id);
    const hasCycle = Boolean(node?.inputIds.some((sourceId) => sourceId && visit(sourceId)));
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };

  return nodes.some((node) => visit(node.id));
}

function validateCircuit(nodes: CircuitNode[]): ValidationState {
  if (!nodes.some((node) => node.type === "OUTPUT")) {
    return { tone: "error", message: "No output probe", detail: "Add an OUTPUT component to observe the circuit result." };
  }
  if (findCycle(nodes)) {
    return { tone: "error", message: "Cyclic circuit detected", detail: "Break the feedback loop before running this simulation." };
  }
  const incomplete = nodes.find((node) => slotsFor(node.type).some((_, index) => !node.inputIds[index]));
  if (incomplete) {
    return {
      tone: "warn",
      message: `${kindLabels[incomplete.type]} needs a connection`,
      detail: `Select ${incomplete.label} and route every input before generating a complete result.`,
    };
  }
  return { tone: "ok", message: "Circuit valid", detail: "All required inputs are connected and ready to simulate." };
}

function bitLabel(value: Bit) {
  return value === 1 ? "HIGH" : "LOW";
}

function nodeClass(type: ComponentType) {
  if (type === "INPUT") return "node-input";
  if (type === "OUTPUT") return "node-output";
  if (isSequential(type)) return "node-memory";
  return "node-gate";
}

function wirePath(source: CircuitNode, target: CircuitNode, slotIndex: number) {
  const sourceX = source.x + NODE_WIDTH;
  const sourceY = source.y + 46;
  const targetX = target.x;
  const targetY = target.y + 34 + slotIndex * 18;
  const midX = sourceX + (targetX - sourceX) * 0.5;
  return `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
}

function getInputNodes(nodes: CircuitNode[]) {
  return nodes.filter((node) => node.type === "INPUT");
}

function initialInputValues(mode: LabMode): Record<string, Bit> {
  return mode === "flipflop" ? { "input-d": 0, "input-clk": 0 } : { "input-a": 0, "input-b": 0 };
}

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<LabMode>("gate");
  const [nodes, setNodes] = useState<CircuitNode[]>(() => createPreset("gate"));
  const [inputValues, setInputValues] = useState<Record<string, Bit>>(() => initialInputValues("gate"));
  const [ffStates, setFfStates] = useState<Record<string, Bit>>({});
  const [previousClocks, setPreviousClocks] = useState<Record<string, Bit>>({});
  const [selectedNodeId, setSelectedNodeId] = useState("gate-1");
  const [isRunning, setIsRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Ready to simulate");

  const validation = useMemo(() => validateCircuit(nodes), [nodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const outputNode = nodes.find((node) => node.type === "OUTPUT");
  const inputNodes = useMemo(() => getInputNodes(nodes), [nodes]);
  const signalValues = useMemo(() => {
    const values: Record<string, Bit> = {};
    nodes.forEach((node) => {
      values[node.id] = evaluateSignal(node.id, nodes, inputValues, ffStates);
    });
    return values;
  }, [nodes, inputValues, ffStates]);

  const truthRows = useMemo<TruthRow[]>(() => {
    if (mode === "flipflop") return [];
    if (validation.tone === "error" || inputNodes.length === 0 || !outputNode) return [];
    const totalRows = 2 ** inputNodes.length;
    return Array.from({ length: totalRows }, (_, index) => {
      const rowInputs = inputNodes.map((_, inputIndex) => ((index >> (inputNodes.length - inputIndex - 1)) & 1) as Bit);
      const rowValues = { ...inputValues };
      inputNodes.forEach((node, inputIndex) => {
        rowValues[node.id] = rowInputs[inputIndex];
      });
      return {
        inputs: rowInputs,
        output: evaluateSignal(outputNode.id, nodes, rowValues, {}),
      };
    });
  }, [mode, validation.tone, inputNodes, outputNode, inputValues, nodes]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      advanceSimulation();
    }, 850);
    return () => window.clearInterval(interval);
  });

  function loadPreset(nextMode: LabMode) {
    const presetNodes = createPreset(nextMode);
    setMode(nextMode);
    setNodes(presetNodes);
    setInputValues(initialInputValues(nextMode));
    setFfStates({});
    setPreviousClocks({});
    setSelectedNodeId(nextMode === "gate" ? "gate-1" : "dff-1");
    setIsRunning(false);
    setTick(0);
    setStatusMessage(nextMode === "gate" ? "AND demonstrator loaded" : "D flip-flop demonstrator loaded");
  }

  function toggleInput(nodeId: string) {
    const nextValue = inputValues[nodeId] === 1 ? 0 : 1;
    const nextInputs = { ...inputValues, [nodeId]: nextValue as Bit };
    setInputValues(nextInputs);

    const toggledNode = nodes.find((node) => node.id === nodeId);
    if (mode === "flipflop" && toggledNode?.label === "CLK") {
      const nextStates = { ...ffStates };
      const nextClocks = { ...previousClocks };
      nodes.filter((node) => isSequential(node.type)).forEach((node) => {
        const clockSource = node.inputIds[node.inputIds.length - 1];
        const clock = clockSource ? evaluateSignal(clockSource, nodes, nextInputs, ffStates) : 0;
        const priorClock = previousClocks[node.id] ?? 0;
        if (priorClock === 0 && clock === 1) {
          const values = node.inputIds.map((sourceId) => sourceId ? evaluateSignal(sourceId, nodes, nextInputs, ffStates) : 0);
          if (node.type === "DFF") nextStates[node.id] = values[0] as Bit;
          if (node.type === "JKFF") {
            const [j, k] = values;
            if (j === 0 && k === 1) nextStates[node.id] = 0;
            if (j === 1 && k === 0) nextStates[node.id] = 1;
            if (j === 1 && k === 1) nextStates[node.id] = nextStates[node.id] === 1 ? 0 : 1;
          }
          if (node.type === "TFF" && values[0] === 1) nextStates[node.id] = nextStates[node.id] === 1 ? 0 : 1;
        }
        nextClocks[node.id] = clock as Bit;
      });
      setFfStates(nextStates);
      setPreviousClocks(nextClocks);
      setTick((current) => current + 1);
      setStatusMessage(nextValue === 1 ? "Rising edge sampled" : "Clock returned low");
      return;
    }

    setStatusMessage("Input state updated");
  }

  function advanceSimulation() {
    if (validation.tone === "error") {
      setIsRunning(false);
      setStatusMessage(validation.message);
      return;
    }

    if (mode === "gate") {
      const nextIndex = (tick + 1) % Math.max(1, 2 ** inputNodes.length);
      const nextValues: Record<string, Bit> = { ...inputValues };
      inputNodes.forEach((node, inputIndex) => {
        nextValues[node.id] = ((nextIndex >> (inputNodes.length - inputIndex - 1)) & 1) as Bit;
      });
      setInputValues(nextValues);
      setTick((current) => current + 1);
      setStatusMessage("Applied next input vector");
      return;
    }

    const nextInputs = { ...inputValues };
    const clockNode = inputNodes.find((node) => node.label === "CLK");
    if (clockNode) nextInputs[clockNode.id] = nextInputs[clockNode.id] === 1 ? 0 : 1;
    const nextStates = { ...ffStates };
    const nextClocks = { ...previousClocks };

    nodes.filter((node) => isSequential(node.type)).forEach((node) => {
      const slots = node.inputIds;
      const clockSource = slots[slots.length - 1];
      const clock = clockSource ? evaluateSignal(clockSource, nodes, nextInputs, ffStates) : 0;
      const priorClock = previousClocks[node.id] ?? 0;
      const risingEdge = priorClock === 0 && clock === 1;
      if (risingEdge) {
        const values = slots.map((sourceId) => (sourceId ? evaluateSignal(sourceId, nodes, nextInputs, ffStates) : 0));
        if (node.type === "DFF") nextStates[node.id] = values[0] as Bit;
        if (node.type === "JKFF") {
          const [j, k] = values;
          if (j === 0 && k === 0) nextStates[node.id] = nextStates[node.id] ?? 0;
          if (j === 0 && k === 1) nextStates[node.id] = 0;
          if (j === 1 && k === 0) nextStates[node.id] = 1;
          if (j === 1 && k === 1) nextStates[node.id] = nextStates[node.id] === 1 ? 0 : 1;
        }
        if (node.type === "TFF" && values[0] === 1) nextStates[node.id] = nextStates[node.id] === 1 ? 0 : 1;
      }
      nextClocks[node.id] = clock as Bit;
    });

    setInputValues(nextInputs);
    setFfStates(nextStates);
    setPreviousClocks(nextClocks);
    setTick((current) => current + 1);
    setStatusMessage(clockNode && nextInputs[clockNode.id] === 1 ? "Rising edge sampled" : "Clock advanced");
  }

  function resetSimulation() {
    setIsRunning(false);
    setInputValues(initialInputValues(mode));
    setFfStates({});
    setPreviousClocks({});
    setTick(0);
    setStatusMessage("Simulation reset");
  }

  function addComponent(type: ComponentType) {
    const count = nodes.length;
    const id = `${type.toLowerCase()}-${Date.now()}`;
    const label = type === "INPUT" ? `IN ${count}` : type === "OUTPUT" ? `OUT ${count}` : `${kindLabels[type].split(" ")[0]} ${count}`;
    const x = type === "INPUT" ? 42 : type === "OUTPUT" ? 616 : 190 + ((count * 38) % 240);
    const y = 46 + ((count * 74) % 290);
    const newNode = createNode(id, type, label, x, y, Array(slotsFor(type).length).fill(null));
    setNodes((current) => [...current, newNode]);
    if (type === "INPUT") setInputValues((current) => ({ ...current, [id]: 0 }));
    if (isSequential(type)) setFfStates((current) => ({ ...current, [id]: 0 }));
    setSelectedNodeId(id);
    setStatusMessage(`${kindLabels[type]} added — route its inputs in the inspector`);
  }

  function removeSelectedNode() {
    if (!selectedNode || selectedNode.type === "INPUT" || selectedNode.type === "OUTPUT") {
      setStatusMessage("Input and output anchors stay in the workspace");
      return;
    }
    setNodes((current) =>
      current
        .filter((node) => node.id !== selectedNode.id)
        .map((node) => ({ ...node, inputIds: node.inputIds.map((sourceId) => (sourceId === selectedNode.id ? null : sourceId)) })),
    );
    setSelectedNodeId(nodes.find((node) => node.id !== selectedNode.id)?.id ?? "");
    setStatusMessage(`${selectedNode.label} removed`);
  }

  function connectNode(targetId: string, slotIndex: number, sourceId: string) {
    const nextNodes = nodes.map((node) =>
      node.id === targetId
        ? { ...node, inputIds: node.inputIds.map((current, index) => (index === slotIndex ? sourceId || null : current)) }
        : node,
    );
    if (findCycle(nextNodes)) {
      setStatusMessage("Connection rejected — it would create a cycle");
      return;
    }
    setNodes(nextNodes);
    setStatusMessage(sourceId ? "Signal route updated" : "Signal route cleared");
  }

  const outputValue = outputNode ? signalValues[outputNode.id] ?? 0 : 0;
  const currentClock = inputNodes.find((node) => node.label === "CLK");
  const currentClockValue = currentClock ? inputValues[currentClock.id] ?? 0 : 0;
  const sourceOptions = nodes.filter((node) => node.id !== selectedNode?.id && node.type !== "OUTPUT");

  return (
    <div className="logiclab-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">Logic<span>Lab</span></div>
            <div className="brand-subtitle">digital systems workbench</div>
          </div>
        </div>
        <nav className="top-nav" aria-label="Primary navigation">
          <a className="nav-item active" href="#workbench">Workbench</a>
          <a className="nav-item" href="#truth-table">Truth tables</a>
          <a className="nav-item" href="#reference">Reference</a>
        </nav>
        <div className="top-actions">
          <span className="status-pip"><span /> offline-ready</span>
          <button className="icon-button" onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle color theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="help-button" aria-label="Keyboard shortcuts"><CircleHelp size={16} /> <span>Shortcuts</span></button>
        </div>
      </header>

      <main className="page-wrap">
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> interactive logic simulator</div>
            <h1>Build. Toggle. <em>Understand.</em></h1>
            <p className="intro-copy">Trace a signal from input to output, then let the truth table prove what your circuit does.</p>
          </div>
          <div className="intro-stats">
            <div className="stat-card"><span>ACTIVE NODES</span><strong>{nodes.length}</strong></div>
            <div className="stat-card"><span>SIM TICK</span><strong>{String(tick).padStart(2, "0")}</strong></div>
            <div className={`output-stat ${outputValue ? "is-high" : ""}`}><span>OUTPUT Z</span><strong>{outputValue}</strong><small>{bitLabel(outputValue)}</small></div>
          </div>
        </section>

        <section className="lab-tabs" aria-label="Lab mode">
          <button className={`lab-tab ${mode === "gate" ? "active" : ""}`} onClick={() => loadPreset("gate")}>
            <GitBranch size={16} /> Gate lab <span>combinational</span>
          </button>
          <button className={`lab-tab ${mode === "flipflop" ? "active" : ""}`} onClick={() => loadPreset("flipflop")}>
            <Cpu size={16} /> Flip-flop lab <span>sequential</span>
          </button>
          <div className="lab-tab-meta"><span className="live-dot" /> {isRunning ? "simulation running" : "simulation paused"}</div>
        </section>

        <div className="lab-layout" id="workbench">
          <aside className="panel palette-panel">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">01 / BUILD</div>
                <h2>Component shelf</h2>
              </div>
              <Layers size={17} className="muted-icon" />
            </div>
            <p className="panel-intro">Drop a component into the canvas, then use the inspector to route its inputs.</p>

            <div className="palette-section">
              <div className="palette-label"><span>INPUTS & OUTPUTS</span><span className="count-badge">2</span></div>
              <PaletteButton type="INPUT" onAdd={addComponent} />
              <PaletteButton type="OUTPUT" onAdd={addComponent} />
            </div>
            <div className="palette-section">
              <div className="palette-label"><span>LOGIC GATES</span><span className="count-badge">7</span></div>
              {gateTypes.map((type) => <PaletteButton key={type} type={type} onAdd={addComponent} />)}
            </div>
            <div className="palette-section">
              <div className="palette-label"><span>MEMORY</span><span className="count-badge">3</span></div>
              {sequentialTypes.map((type) => <PaletteButton key={type} type={type} onAdd={addComponent} />)}
            </div>

            <div className="palette-tip"><Sparkles size={15} /><span>Tip: click inputs to toggle; click other nodes to inspect routes and live signal.</span></div>
          </aside>

          <section className="workspace-column">
            <div className="panel workspace-panel">
              <div className="workspace-header">
                <div>
                  <div className="section-kicker">02 / SIMULATE</div>
                  <div className="workspace-title-row"><h2>{mode === "gate" ? "AND demonstrator" : "D flip-flop demonstrator"}</h2><span className="ready-badge"><Check size={12} /> {validation.tone === "ok" ? "ready" : "needs review"}</span></div>
                </div>
                <div className="workspace-actions">
                  <button className={`run-button ${isRunning ? "running" : ""}`} onClick={() => setIsRunning((current) => !current)} disabled={validation.tone === "error"}>
                    {isRunning ? <Pause size={15} /> : <Play size={15} />} {isRunning ? "Pause" : "Run"}
                  </button>
                  <button className="toolbar-button" onClick={advanceSimulation} disabled={validation.tone === "error"}><SkipForward size={15} /> Step</button>
                  <button className="toolbar-button" onClick={resetSimulation}><RotateCcw size={15} /> Reset</button>
                </div>
              </div>
              <div className="control-strip">
                <div className="control-group"><span className="control-label"><Clock3 size={13} /> CLOCK</span><span className={`clock-state ${currentClockValue ? "high" : ""}`}>{mode === "flipflop" ? `${currentClockValue} · ${currentClockValue ? "HIGH" : "LOW"}` : "N/A"}</span></div>
                {mode === "flipflop" && currentClock && <button className="clock-button" onClick={() => toggleInput(currentClock.id)}><Zap size={14} /> Pulse clock</button>}
                <div className="control-spacer" />
                <div className="simulation-message"><span className="message-dot" /> {statusMessage}</div>
              </div>
              <div className="canvas-frame">
                <div className="canvas-ruler top-ruler"><span>0</span><span>200</span><span>400</span><span>600</span><span>760 px</span></div>
                <div className="circuit-canvas" role="application" aria-label="Interactive circuit canvas">
                  <svg className="wire-layer" viewBox="0 0 760 420" aria-hidden="true">
                    {nodes.flatMap((target) => target.inputIds.map((sourceId, slotIndex) => {
                      const source = sourceId ? nodes.find((node) => node.id === sourceId) : undefined;
                      if (!source) return null;
                      const live = signalValues[source.id] === 1;
                      return <path key={`${target.id}-${slotIndex}`} d={wirePath(source, target, slotIndex)} className={`signal-wire ${live ? "live" : ""}`} />;
                    }))}
                  </svg>
                  {nodes.map((node) => {
                    const value = signalValues[node.id] ?? 0;
                    const slots = slotsFor(node.type);
                    return (
                      <button
                        className={`circuit-node ${nodeClass(node.type)} ${selectedNodeId === node.id ? "selected" : ""}`}
                        style={{ left: node.x, top: node.y }}
                        key={node.id}
                        onClick={() => node.type === "INPUT" ? toggleInput(node.id) : setSelectedNodeId(node.id)}
                        aria-label={`Select ${node.label}`}
                      >
                        <span className="node-topline"><span className="node-kind">{kindLabels[node.type]}</span><span className={`node-signal ${value ? "high" : ""}`}>{value}</span></span>
                        <span className="node-name">{node.label}</span>
                        {slots.length > 0 && <span className="node-slots">{slots.map((slot, index) => <span className="node-slot" key={slot}><i />{slot}</span>)}</span>}
                        <span className="node-output-port"><i className={value ? "high" : ""} />{node.type === "OUTPUT" ? "PROBE" : node.type === "INPUT" ? "OUT" : "Q"}</span>
                        {node.type === "INPUT" && <span className="node-toggle-hint">click to toggle</span>}
                      </button>
                    );
                  })}
                  <div className="canvas-legend"><span><i className="legend-dot live" /> HIGH</span><span><i className="legend-dot" /> LOW</span><span><Cable size={13} /> signal path</span></div>
                </div>
              </div>
            </div>

            <div className="lower-grid">
              <section className="panel truth-panel" id="truth-table">
                <div className="panel-heading compact">
                  <div><div className="section-kicker">03 / PROVE</div><h2>{mode === "gate" ? "Truth table" : "State transition table"}</h2></div>
                  <span className="auto-badge"><Activity size={13} /> auto-generated</span>
                </div>
                {mode === "gate" ? (
                  truthRows.length > 0 ? (
                    <div className="table-wrap"><table><thead><tr>{inputNodes.map((node) => <th key={node.id}>{node.label}</th>)}<th className="output-th">Z <ArrowRight size={12} /></th></tr></thead><tbody>{truthRows.map((row, index) => <tr key={`${row.inputs.join("")}-${index}`}>{row.inputs.map((value, inputIndex) => <td key={`${inputIndex}-${value}`}><span className={`table-bit ${value ? "high" : ""}`}>{value}</span></td>)}<td><span className={`table-bit output-bit ${row.output ? "high" : ""}`}>{row.output}</span></td></tr>)}</tbody></table></div>
                  ) : <EmptyState title="Connect the circuit first" detail="A complete truth table appears when every required input is routed." />
                ) : <SequentialTable type={(nodes.find((node) => isSequential(node.type))?.type as SequentialType) ?? "DFF"} />}
                <div className="table-footnote"><span className="footnote-dot" /> {mode === "gate" ? `${truthRows.length || 0} input combinations evaluated` : "Clocked behavior assumes a rising-edge sample"}</div>
              </section>

              <section className="panel validation-panel" id="reference">
                <div className="panel-heading compact"><div><div className="section-kicker">SIGNAL MONITOR</div><h2>Inspector</h2></div><Settings2 size={16} className="muted-icon" /></div>
                <div className="inspector-selected"><span className={`selected-node-icon ${selectedNode ? nodeClass(selectedNode.type) : ""}`}>{selectedNode?.type === "INPUT" ? "I" : selectedNode?.type === "OUTPUT" ? "O" : selectedNode?.type?.slice(0, 2)}</span><div><strong>{selectedNode?.label ?? "Nothing selected"}</strong><span>{selectedNode ? kindDescriptions[selectedNode.type] : "Select a node on the canvas"}</span></div><span className={`inspector-value ${selectedNode && signalValues[selectedNode.id] ? "high" : ""}`}>{selectedNode ? signalValues[selectedNode.id] ?? 0 : "—"}</span></div>
                {selectedNode?.type === "INPUT" ? (
                  <div className="input-inspector"><span className="input-inspector-label">Binary input</span><button className={`big-toggle ${inputValues[selectedNode.id] ? "high" : ""}`} onClick={() => toggleInput(selectedNode.id)}><span>{inputValues[selectedNode.id] ?? 0}</span><span>{bitLabel(inputValues[selectedNode.id] ?? 0)}</span></button></div>
                ) : selectedNode ? (
                  <div className="route-editor"><div className="route-editor-label"><span>Signal routing</span><span>{slotsFor(selectedNode.type).length} input{slotsFor(selectedNode.type).length === 1 ? "" : "s"}</span></div>{slotsFor(selectedNode.type).map((slot, index) => <label className="route-row" key={`${selectedNode.id}-${slot}`}><span className="route-slot"><i />{slot}</span><ChevronDown size={13} /><select value={selectedNode.inputIds[index] ?? ""} onChange={(event) => connectNode(selectedNode.id, index, event.target.value)}><option value="">Unconnected</option>{sourceOptions.map((source) => <option value={source.id} key={source.id}>{source.label} · {kindLabels[source.type]}</option>)}</select></label>)}</div>
                ) : null}
                <div className={`validation-card ${validation.tone}`}><span className="validation-icon">{validation.tone === "ok" ? <Check size={15} /> : <AlertTriangle size={15} />}</span><div><strong>{validation.message}</strong><p>{validation.detail}</p></div></div>
                {selectedNode && selectedNode.type !== "INPUT" && selectedNode.type !== "OUTPUT" && <button className="remove-button" onClick={removeSelectedNode}><Trash2 size={14} /> Remove {selectedNode.label}</button>}
              </section>
            </div>
          </section>
        </div>

        <section className="reference-strip">
          <div className="reference-item"><span className="reference-icon"><Cable size={16} /></span><div><strong>Connect with intent</strong><span>Every wire represents a named signal route.</span></div></div>
          <div className="reference-item"><span className="reference-icon"><Zap size={16} /></span><div><strong>Live propagation</strong><span>HIGH signals glow through the circuit in real time.</span></div></div>
          <div className="reference-item"><span className="reference-icon"><CircleHelp size={16} /></span><div><strong>Need a refresher?</strong><span>Click a node to inspect its truth behavior.</span></div></div>
        </section>

        <footer className="page-footer"><span>LogicLab / v1.0</span><span>Made for curious circuits <span className="footer-dot">·</span> no login required</span><span>Built on binary</span></footer>
      </main>
    </div>
  );
}

function PaletteButton({ type, onAdd }: { type: ComponentType; onAdd: (type: ComponentType) => void }) {
  return <button className="palette-button" onClick={() => onAdd(type)}><span className={`palette-symbol ${nodeClass(type)}`}>{type === "INPUT" ? "I" : type === "OUTPUT" ? "O" : type === "DFF" ? "D" : type === "JKFF" ? "JK" : type === "TFF" ? "T" : type}</span><span><strong>{kindLabels[type]}</strong><small>{kindDescriptions[type]}</small></span><Plus size={14} /></button>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><AlertTriangle size={16} /><strong>{title}</strong><span>{detail}</span></div>;
}

function SequentialTable({ type }: { type: SequentialType }) {
  const rows = type === "JKFF"
    ? [
        [0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1],
      ]
    : type === "TFF"
      ? [[0, 0, 0], [1, 0, 1], [0, 1, 0], [1, 1, 1]]
      : [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]];
  const headings = type === "JKFF" ? ["J", "K", "Q next"] : type === "TFF" ? ["T", "CLK ↑", "Q next"] : ["D", "CLK ↑", "Q next"];
  return <div className="table-wrap"><table><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, valueIndex) => <td key={`${index}-${valueIndex}`}><span className={`table-bit ${value ? "high" : ""}`}>{value}</span></td>)}</tr>)}</tbody></table></div>;
}
