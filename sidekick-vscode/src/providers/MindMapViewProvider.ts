/**
 * @fileoverview Mind map webview provider for session activity visualization.
 *
 * This provider manages a sidebar webview that displays session activity
 * as an interactive D3.js force-directed graph. It shows files touched,
 * tools used, TODOs extracted, and subagents spawned.
 *
 * Features:
 * - D3.js force-directed graph layout
 * - Node type differentiation (files, tools, TODOs, subagents)
 * - Drag, zoom, and pan interactions
 * - Real-time updates from SessionMonitor
 *
 * @module providers/MindMapViewProvider
 */

import * as vscode from 'vscode';
import type { SessionMonitor } from '../services/SessionMonitor';
import { MindMapDataService } from '../services/MindMapDataService';
import type { MindMapState, MindMapMessage, WebviewMindMapMessage } from '../types/mindMap';
import { log } from '../services/Logger';

/**
 * WebviewViewProvider for the session mind map visualization.
 *
 * Renders a sidebar panel with an interactive D3.js force-directed graph
 * showing files, tools, TODOs, and subagents from active Claude Code sessions.
 *
 * @example
 * ```typescript
 * const provider = new MindMapViewProvider(context.extensionUri, sessionMonitor);
 * vscode.window.registerWebviewViewProvider('sidekick.mindMap', provider);
 * ```
 */
export class MindMapViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  /** View type identifier for VS Code registration */
  public static readonly viewType = 'sidekick.mindMap';

  /** Current webview view instance */
  private _view?: vscode.WebviewView;

  /** Disposables for cleanup */
  private _disposables: vscode.Disposable[] = [];

  /** Current mind map state */
  private _state: MindMapState;

  /**
   * Creates a new MindMapViewProvider.
   *
   * @param _extensionUri - URI of the extension directory
   * @param _sessionMonitor - SessionMonitor instance for session events
   */
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _sessionMonitor: SessionMonitor
  ) {
    // Initialize empty state
    this._state = {
      graph: { nodes: [], links: [] },
      sessionActive: false,
      lastUpdated: new Date().toISOString()
    };

    // Subscribe to session events
    this._disposables.push(
      this._sessionMonitor.onTokenUsage(() => this._updateGraph())
    );

    this._disposables.push(
      this._sessionMonitor.onToolCall(() => this._updateGraph())
    );

    this._disposables.push(
      this._sessionMonitor.onSessionStart(path => this._handleSessionStart(path))
    );

    this._disposables.push(
      this._sessionMonitor.onSessionEnd(() => this._handleSessionEnd())
    );

    // Initialize state from existing session if active
    if (this._sessionMonitor.isActive()) {
      this._syncFromSessionMonitor();
    }

    log('MindMapViewProvider initialized');
  }

  /**
   * Resolves the webview view when it becomes visible.
   *
   * Called by VS Code when the view needs to be rendered.
   *
   * @param webviewView - The webview view to resolve
   * @param _context - Context for the webview
   * @param _token - Cancellation token
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'out', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'images')
      ]
    };

    // Set HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMindMapMessage) => this._handleWebviewMessage(message),
      undefined,
      this._disposables
    );

    // Resend state when view becomes visible
    webviewView.onDidChangeVisibility(
      () => {
        if (webviewView.visible) {
          this._sendStateToWebview();
        }
      },
      undefined,
      this._disposables
    );

    log('Mind map webview resolved');
  }

  /**
   * Handles messages from the webview.
   *
   * @param message - Message from webview
   */
  private _handleWebviewMessage(message: WebviewMindMapMessage): void {
    switch (message.type) {
      case 'webviewReady':
        log('Mind map webview ready, sending initial state');
        this._sendStateToWebview();
        break;

      case 'requestGraph':
        this._syncFromSessionMonitor();
        this._sendStateToWebview();
        break;

      case 'nodeClicked':
        this._handleNodeClick(message.nodeId);
        break;
    }
  }

  /**
   * Handles node click events from webview.
   *
   * If clicked node is a file, opens the file in the editor.
   * If clicked node is a URL, opens the URL in the default browser.
   *
   * @param nodeId - ID of the clicked node
   */
  private _handleNodeClick(nodeId: string): void {
    // If it's a file node, try to open the file
    if (nodeId.startsWith('file-')) {
      const filePath = nodeId.replace('file-', '');
      const uri = vscode.Uri.file(filePath);
      vscode.workspace.openTextDocument(uri).then(
        doc => vscode.window.showTextDocument(doc),
        () => log(`Could not open file: ${filePath}`)
      );
    }
    // If it's a URL node, open in browser
    else if (nodeId.startsWith('url-')) {
      const urlOrQuery = nodeId.replace('url-', '');
      try {
        // Check if it's a valid URL
        const url = new URL(urlOrQuery);
        vscode.env.openExternal(vscode.Uri.parse(url.href));
      } catch {
        // It's a search query, open as a web search
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(urlOrQuery)}`;
        vscode.env.openExternal(vscode.Uri.parse(searchUrl));
      }
    }
  }

  /**
   * Updates graph from current session data.
   */
  private _updateGraph(): void {
    this._syncFromSessionMonitor();
    this._sendStateToWebview();
  }

  /**
   * Handles session start events.
   *
   * @param sessionPath - Path to the session file
   */
  private _handleSessionStart(sessionPath: string): void {
    log(`Mind map: session started at ${sessionPath}`);
    this._state.sessionActive = true;
    this._syncFromSessionMonitor();
    this._postMessage({ type: 'sessionStart', sessionPath });
    this._sendStateToWebview();
  }

  /**
   * Handles session end events.
   */
  private _handleSessionEnd(): void {
    log('Mind map: session ended');
    this._state.sessionActive = false;
    this._postMessage({ type: 'sessionEnd' });
    this._sendStateToWebview();
  }

  /**
   * Syncs state from SessionMonitor.
   */
  private _syncFromSessionMonitor(): void {
    const stats = this._sessionMonitor.getStats();
    const subagents = this._sessionMonitor.getSubagentStats();
    this._state.graph = MindMapDataService.buildGraph(stats, subagents);
    this._state.sessionActive = this._sessionMonitor.isActive();
    this._state.lastUpdated = new Date().toISOString();
  }

  /**
   * Sends current state to the webview.
   */
  private _sendStateToWebview(): void {
    this._postMessage({ type: 'updateGraph', state: this._state });
  }

  /**
   * Posts a message to the webview.
   *
   * @param message - Message to post
   */
  private _postMessage(message: MindMapMessage): void {
    this._view?.webview.postMessage(message);
  }

  /**
   * Generates HTML content for the webview.
   *
   * @param webview - The webview to generate HTML for
   * @returns HTML string for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'images', 'icon.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 img-src ${webview.cspSource};
                 script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
  <title>Session Mind Map</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header img {
      width: 20px;
      height: 20px;
    }

    .header h1 {
      font-size: 13px;
      font-weight: 600;
    }

    .status {
      margin-left: auto;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .status.active {
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-editor-background);
    }

    #graph-container {
      width: 100%;
      height: calc(100vh - 45px);
    }

    #graph-container svg {
      width: 100%;
      height: 100%;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: calc(100vh - 45px);
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 20px;
    }

    .empty-state p {
      margin-top: 8px;
      font-size: 12px;
    }

    /* Node styling */
    .node {
      cursor: grab;
    }

    .node:active {
      cursor: grabbing;
    }

    /* Clickable nodes (files and URLs) */
    .node.clickable {
      cursor: pointer;
    }

    .node.clickable:hover {
      filter: brightness(1.3);
    }

    .node-label {
      font-size: 9px;
      fill: var(--vscode-foreground);
      pointer-events: none;
      text-anchor: middle;
    }

    .change-label {
      font-size: 8px;
      pointer-events: none;
      text-anchor: middle;
      font-family: var(--vscode-editor-font-family);
    }

    .change-label .add {
      fill: var(--vscode-charts-green, #4caf50);
    }

    .change-label .del {
      fill: var(--vscode-charts-red, #f44336);
    }

    .link {
      stroke: var(--vscode-panel-border);
      stroke-opacity: 0.6;
    }

    .link.latest {
      stroke: var(--vscode-charts-yellow, #FFD700);
      stroke-opacity: 1;
      stroke-width: 3;
      filter: drop-shadow(0 0 4px var(--vscode-charts-yellow, #FFD700));
    }

    /* Tooltip */
    .tooltip {
      position: absolute;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 11px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 1000;
      max-width: 300px;
      word-wrap: break-word;
      white-space: pre-line;
    }

    .tooltip .additions {
      color: var(--vscode-charts-green, #4caf50);
    }

    .tooltip .deletions {
      color: var(--vscode-charts-red, #f44336);
    }

    .tooltip.visible {
      opacity: 1;
    }

    .legend {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      padding: 8px;
      font-size: 10px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .legend-item:last-child {
      margin-bottom: 0;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${iconUri}" alt="Sidekick" />
    <h1>Mind Map</h1>
    <span id="status" class="status">No Session</span>
  </div>

  <div id="empty-state" class="empty-state">
    <p>No active Claude Code session detected.</p>
    <p>Start a session to see the mind map.</p>
  </div>

  <div id="graph-container" style="display: none;">
    <svg id="graph"></svg>
  </div>

  <div class="tooltip" id="tooltip"></div>

  <div class="legend" id="legend" style="display: none;">
    <div class="legend-item">
      <span class="legend-dot" style="background: #9B9B9B;"></span>
      <span>Session</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #4A90E2;"></span>
      <span>File</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #7ED321;"></span>
      <span>Tool</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #F5A623;"></span>
      <span>TODO</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #BD10E0;"></span>
      <span>Subagent</span>
    </div>
  </div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // Node colors by type
      const NODE_COLORS = {
        session: '#9B9B9B',
        file: '#4A90E2',
        tool: '#7ED321',
        todo: '#F5A623',
        subagent: '#BD10E0',
        url: '#50E3C2'
      };

      // Sizing configuration for dynamic node sizes
      const SIZING_CONFIG = {
        session:  { base: 16, min: 16, max: 16, scale: 0 },     // Fixed
        file:     { base: 8,  min: 6,  max: 18, scale: 3 },     // Scales with touches
        tool:     { base: 6,  min: 5,  max: 16, scale: 2.5 },   // Scales with calls
        todo:     { base: 6,  min: 6,  max: 6,  scale: 0 },     // Fixed
        subagent: { base: 8,  min: 6,  max: 14, scale: 2 },     // Scales with events
        url:      { base: 7,  min: 5,  max: 14, scale: 2 }      // Scales with accesses
      };

      function calculateNodeSize(d) {
        var config = SIZING_CONFIG[d.type] || SIZING_CONFIG.file;
        if (!d.count || config.scale === 0) return config.base;
        var scaled = config.base + config.scale * Math.log2(d.count + 1);
        return Math.min(config.max, Math.max(config.min, scaled));
      }

      // DOM elements
      const statusEl = document.getElementById('status');
      const emptyEl = document.getElementById('empty-state');
      const containerEl = document.getElementById('graph-container');
      const legendEl = document.getElementById('legend');
      const tooltipEl = document.getElementById('tooltip');

      // D3 elements
      let svg, g, simulation, linkGroup, nodeGroup, labelGroup, changeGroup;
      let currentNodes = [];
      let currentLinks = [];

      /**
       * Initializes the D3 force simulation.
       */
      function initGraph() {
        const width = containerEl.clientWidth;
        const height = containerEl.clientHeight;

        svg = d3.select('#graph')
          .attr('width', width)
          .attr('height', height);

        // Container for zoomable content
        g = svg.append('g');

        // Zoom behavior
        const zoom = d3.zoom()
          .scaleExtent([0.1, 10])
          .on('zoom', (event) => {
            g.attr('transform', event.transform);
          });

        svg.call(zoom);

        // Groups for layering (links below nodes)
        linkGroup = g.append('g').attr('class', 'links');
        nodeGroup = g.append('g').attr('class', 'nodes');
        labelGroup = g.append('g').attr('class', 'labels');
        changeGroup = g.append('g').attr('class', 'changes');

        // Initialize simulation
        simulation = d3.forceSimulation()
          .force('link', d3.forceLink()
            .id(function(d) { return d.id; })
            .distance(80))
          .force('charge', d3.forceManyBody()
            .strength(-200))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .force('collide', d3.forceCollide()
            .radius(function(d) { return calculateNodeSize(d) + 15; })
            .iterations(2));

        simulation.on('tick', ticked);
      }

      /**
       * Updates positions on each simulation tick.
       */
      function ticked() {
        linkGroup.selectAll('line')
          .attr('x1', function(d) { return d.source.x; })
          .attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; })
          .attr('y2', function(d) { return d.target.y; });

        nodeGroup.selectAll('circle')
          .attr('cx', function(d) { return d.x; })
          .attr('cy', function(d) { return d.y; });

        labelGroup.selectAll('text')
          .attr('x', function(d) { return d.x; })
          .attr('y', function(d) { return d.y + calculateNodeSize(d) + 12; });

        changeGroup.selectAll('text')
          .attr('x', function(d) { return d.x; })
          .attr('y', function(d) { return d.y + calculateNodeSize(d) + 22; });
      }

      /**
       * Creates drag behavior for nodes.
       */
      function drag(simulation) {
        function dragstarted(event) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        }

        function dragged(event) {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        }

        function dragended(event) {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }

        return d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended);
      }

      /**
       * Updates the graph with new data.
       */
      function updateGraph(state) {
        if (!state.graph || state.graph.nodes.length === 0) {
          showEmpty(true);
          return;
        }

        showEmpty(false);

        const nodes = state.graph.nodes;
        const links = state.graph.links;

        // Preserve existing positions for nodes that haven't changed
        const oldPositions = new Map();
        currentNodes.forEach(function(n) {
          if (n.x !== undefined && n.y !== undefined) {
            oldPositions.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
          }
        });

        nodes.forEach(function(n) {
          const old = oldPositions.get(n.id);
          if (old) {
            n.x = old.x;
            n.y = old.y;
            n.vx = old.vx;
            n.vy = old.vy;
          }
        });

        currentNodes = nodes;
        currentLinks = links;

        // Update links
        const link = linkGroup.selectAll('line')
          .data(links, function(d) { return d.source + '-' + d.target; });

        link.exit().remove();

        link.enter()
          .append('line')
          .attr('class', function(d) { return d.isLatest ? 'link latest' : 'link'; })
          .attr('stroke-width', function(d) { return d.isLatest ? 3 : 1.5; });

        // Update class on existing links
        linkGroup.selectAll('line')
          .attr('class', function(d) { return d.isLatest ? 'link latest' : 'link'; })
          .attr('stroke-width', function(d) { return d.isLatest ? 3 : 1.5; });

        // Raise latest link to render on top
        linkGroup.selectAll('line.latest').raise();

        // Update nodes
        const node = nodeGroup.selectAll('circle')
          .data(nodes, function(d) { return d.id; });

        node.exit().remove();

        node.enter()
          .append('circle')
          .attr('class', function(d) {
            const isClickable = d.type === 'file' || d.type === 'url';
            return isClickable ? 'node clickable' : 'node';
          })
          .attr('r', function(d) { return calculateNodeSize(d); })
          .attr('fill', function(d) { return NODE_COLORS[d.type]; })
          .call(drag(simulation))
          .on('click', function(event, d) {
            vscode.postMessage({ type: 'nodeClicked', nodeId: d.id });
          })
          .on('mouseover', function(event, d) {
            var label = d.fullPath || d.label;
            // Build tooltip content
            if (d.type === 'file') {
              // For files, show touches and line changes
              var firstLine = label;
              if (d.count) {
                firstLine += ' (' + d.count + ' touch' + (d.count > 1 ? 'es' : '') + ')';
              }
              // Show line changes if any exist
              var hasChanges = (d.additions && d.additions > 0) || (d.deletions && d.deletions > 0);
              if (hasChanges) {
                var adds = d.additions || 0;
                var dels = d.deletions || 0;
                tooltipEl.innerHTML = firstLine + '<br><span class="additions">+' + adds + '</span> / <span class="deletions">-' + dels + '</span> lines';
              } else {
                tooltipEl.textContent = firstLine;
              }
            } else {
              // For other nodes, show count if available
              var count = d.count ? ' (' + d.count + ')' : '';
              tooltipEl.textContent = label + count;
            }
            tooltipEl.classList.add('visible');
          })
          .on('mousemove', function(event) {
            tooltipEl.style.left = (event.pageX + 10) + 'px';
            tooltipEl.style.top = (event.pageY - 10) + 'px';
          })
          .on('mouseout', function() {
            tooltipEl.classList.remove('visible');
          });

        // Update labels
        const label = labelGroup.selectAll('text')
          .data(nodes, function(d) { return d.id; });

        label.exit().remove();

        label.enter()
          .append('text')
          .attr('class', 'node-label')
          .text(function(d) { return d.label; });

        // Update change labels (for file nodes with +/- changes)
        var fileNodesWithChanges = nodes.filter(function(d) {
          return d.type === 'file' && ((d.additions && d.additions > 0) || (d.deletions && d.deletions > 0));
        });

        var changeLabel = changeGroup.selectAll('text')
          .data(fileNodesWithChanges, function(d) { return d.id; });

        changeLabel.exit().remove();

        changeLabel.enter()
          .append('text')
          .attr('class', 'change-label')
          .html(function(d) {
            var adds = d.additions || 0;
            var dels = d.deletions || 0;
            return '<tspan class="add">+' + adds + '</tspan> <tspan class="del">-' + dels + '</tspan>';
          });

        // Update merged selections
        nodeGroup.selectAll('circle')
          .attr('r', function(d) { return calculateNodeSize(d); })
          .attr('fill', function(d) { return NODE_COLORS[d.type]; });

        labelGroup.selectAll('text')
          .text(function(d) { return d.label; });

        changeGroup.selectAll('text')
          .html(function(d) {
            var adds = d.additions || 0;
            var dels = d.deletions || 0;
            return '<tspan class="add">+' + adds + '</tspan> <tspan class="del">-' + dels + '</tspan>';
          });

        // Update simulation
        simulation.nodes(nodes);
        simulation.force('link').links(links);
        simulation.alpha(0.3).restart();
      }

      /**
       * Shows or hides empty state.
       */
      function showEmpty(show) {
        emptyEl.style.display = show ? 'flex' : 'none';
        containerEl.style.display = show ? 'none' : 'block';
        legendEl.style.display = show ? 'none' : 'block';
      }

      /**
       * Updates status indicator.
       */
      function updateStatus(active) {
        if (active) {
          statusEl.textContent = 'Active';
          statusEl.className = 'status active';
        } else {
          statusEl.textContent = 'No Session';
          statusEl.className = 'status';
        }
      }

      // Handle messages from extension
      window.addEventListener('message', function(event) {
        const message = event.data;

        switch (message.type) {
          case 'updateGraph':
            updateStatus(message.state.sessionActive);
            updateGraph(message.state);
            break;

          case 'sessionStart':
            updateStatus(true);
            break;

          case 'sessionEnd':
            updateStatus(false);
            break;
        }
      });

      // Handle window resize
      window.addEventListener('resize', function() {
        if (simulation) {
          const width = containerEl.clientWidth;
          const height = containerEl.clientHeight;
          svg.attr('width', width).attr('height', height);
          simulation.force('center', d3.forceCenter(width / 2, height / 2));
          simulation.alpha(0.3).restart();
        }
      });

      // Initialize and signal ready
      initGraph();
      vscode.postMessage({ type: 'webviewReady' });
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Disposes of all resources.
   */
  dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
    log('MindMapViewProvider disposed');
  }
}

/**
 * Generates a random nonce for CSP.
 * @returns 32-character random string
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
