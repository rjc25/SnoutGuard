'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';

export interface GraphNode {
  id: string;
  label: string;
  group?: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

interface DependencyGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
}

const GROUP_COLORS: Record<string, string> = {
  core: '#6366f1',
  api: '#3b82f6',
  ui: '#22c55e',
  util: '#f59e0b',
  external: '#94a3b8',
  default: '#8b5cf6',
};

function getGroupColor(group?: string): string {
  return GROUP_COLORS[group || 'default'] || GROUP_COLORS.default;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function DependencyGraph({
  nodes,
  edges,
  width = 800,
  height = 600,
}: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const animRef = useRef<number | null>(null);

  // Initialize nodes with random positions
  useEffect(() => {
    const initialized: SimNode[] = nodes.map((node, i) => ({
      ...node,
      x: node.x ?? width / 2 + Math.cos((2 * Math.PI * i) / nodes.length) * 200,
      y: node.y ?? height / 2 + Math.sin((2 * Math.PI * i) / nodes.length) * 200,
      vx: 0,
      vy: 0,
    }));
    setSimNodes(initialized);
  }, [nodes, width, height]);

  // Simple force simulation
  useEffect(() => {
    if (simNodes.length === 0) return;

    let iteration = 0;
    const maxIterations = 100;

    function tick() {
      if (iteration >= maxIterations) return;
      iteration++;

      setSimNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const k = 0.01;

        // Repulsion between all nodes
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = 5000 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx;
            next[i].vy -= fy;
            next[j].vx += fx;
            next[j].vy += fy;
          }
        }

        // Attraction along edges
        for (const edge of edges) {
          const source = next.find((n) => n.id === edge.source);
          const target = next.find((n) => n.id === edge.target);
          if (!source || !target) continue;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const force = (dist - 150) * k;
          const fx = (dx / Math.max(dist, 1)) * force;
          const fy = (dy / Math.max(dist, 1)) * force;
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        }

        // Center gravity
        for (const node of next) {
          node.vx += (width / 2 - node.x) * 0.001;
          node.vy += (height / 2 - node.y) * 0.001;
        }

        // Apply velocities with damping
        for (const node of next) {
          node.vx *= 0.6;
          node.vy *= 0.6;
          node.x += node.vx;
          node.y += node.vy;
          // Clamp to bounds
          node.x = Math.max(40, Math.min(width - 40, node.x));
          node.y = Math.max(40, Math.min(height - 40, node.y));
        }

        return next;
      });

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [simNodes.length, edges, width, height]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.2, 3)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.2, 0.3)), []);
  const toggleFullscreen = useCallback(() => setIsFullscreen((f) => !f), []);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400 text-sm">
        No dependency data available. Connect a repository to visualize dependencies.
      </div>
    );
  }

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-white p-4' : 'relative'}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-1.5 rounded-md bg-white shadow-sm border border-gray-200 hover:bg-gray-50"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-xs text-gray-500 px-1 tabular-nums">{(zoom * 100).toFixed(0)}%</span>
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-1.5 rounded-md bg-white shadow-sm border border-gray-200 hover:bg-gray-50"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4 text-gray-600" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-1.5 rounded-md bg-white shadow-sm border border-gray-200 hover:bg-gray-50 ml-1"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-gray-600" />
          ) : (
            <Maximize2 className="w-4 h-4 text-gray-600" />
          )}
        </button>
      </div>

      {/* SVG Graph */}
      <svg
        ref={svgRef}
        width="100%"
        height={isFullscreen ? '100%' : height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-gray-200 rounded-lg bg-gray-50/50"
      >
        <g transform={`scale(${zoom})`}>
          {/* Edges */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
            </marker>
          </defs>
          {edges.map((edge, i) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            return (
              <g key={`edge-${i}`}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  markerEnd="url(#arrowhead)"
                />
                {edge.label && (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 6}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#94a3b8"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {simNodes.map((node) => {
            const color = getGroupColor(node.group);
            return (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r={20} fill={color} opacity={0.15} />
                <circle cx={node.x} cy={node.y} r={14} fill={color} opacity={0.9} />
                <text
                  x={node.x}
                  y={node.y + 28}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={500}
                  fill="#475569"
                >
                  {node.label}
                </text>
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill="#ffffff"
                >
                  {node.label.slice(0, 3).toUpperCase()}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
        {Object.entries(GROUP_COLORS)
          .filter(([key]) => key !== 'default')
          .map(([group, color]) => (
            <span key={group} className="flex items-center gap-1.5 capitalize">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              {group}
            </span>
          ))}
      </div>
    </div>
  );
}
