#!/usr/bin/env node
'use strict';

const fs = require('fs');

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error('Usage: ua-tour-analyze.js <input.json> <output.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const nodes = raw.nodes || [];
  const edges = raw.edges || [];
  const layers = raw.layers || [];

  const nodeIds = new Set(nodes.map(n => n.id));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Only consider edges between real nodes for fan metrics (skip function: targets not in node set
  // but keep them too — fan-in/out uses all edges where endpoints exist as nodes).
  // We'll count metrics only over edges whose both endpoints are in the node set,
  // so function-level pseudo-nodes (not in nodes) don't pollute counts.
  const fanIn = {};
  const fanOut = {};
  for (const id of nodeIds) { fanIn[id] = 0; fanOut[id] = 0; }

  for (const e of edges) {
    if (nodeIds.has(e.source)) fanOut[e.source] = (fanOut[e.source] || 0) + (nodeIds.has(e.target) ? 1 : 0);
    if (nodeIds.has(e.target)) fanIn[e.target] = (fanIn[e.target] || 0) + (nodeIds.has(e.source) ? 1 : 0);
  }

  const nameOf = id => (nodeById.get(id) ? nodeById.get(id).name : id);
  const summaryOf = id => (nodeById.get(id) ? (nodeById.get(id).summary || '') : '');
  const typeOf = id => (nodeById.get(id) ? nodeById.get(id).type : 'unknown');

  const fanInRanking = Object.keys(fanIn)
    .map(id => ({ id, fanIn: fanIn[id], name: nameOf(id) }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 20);

  const fanOutRanking = Object.keys(fanOut)
    .map(id => ({ id, fanOut: fanOut[id], name: nameOf(id) }))
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 20);

  // Entry point detection
  const codeEntryNames = new Set([
    'index.ts','index.js','main.ts','main.js','app.ts','app.js','server.ts','server.js',
    'mod.rs','main.go','main.py','main.rs','manage.py','app.py','wsgi.py','asgi.py','run.py',
    '__main__.py','Application.java','Main.java','Program.cs','config.ru','index.php','App.swift',
    'Application.kt','main.cpp','main.c'
  ]);

  const fanOutValues = Object.values(fanOut).sort((a, b) => a - b);
  const fanInValues = Object.values(fanIn).sort((a, b) => a - b);
  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  const fanOutTop10 = pct(fanOutValues, 0.9);
  const fanInBottom25 = pct(fanInValues, 0.25);

  const entryScores = [];
  for (const n of nodes) {
    let score = 0;
    const fp = n.filePath || '';
    const depth = fp.split('/').length;
    if (n.type === 'document') {
      if (n.name === 'README.md' && depth === 1) score += 5;
      else if (/\.md$/.test(n.name) && depth === 1) score += 2;
    } else if (n.type === 'file') {
      if (codeEntryNames.has(n.name)) score += 3;
      if (depth <= 2) score += 1;
      if ((fanOut[n.id] || 0) >= fanOutTop10 && fanOutTop10 > 0) score += 1;
      if ((fanIn[n.id] || 0) <= fanInBottom25) score += 1;
    }
    if (score > 0) entryScores.push({ id: n.id, score, name: n.name, summary: n.summary || '' });
  }
  entryScores.sort((a, b) => b.score - a.score);
  const entryPointCandidates = entryScores.slice(0, 5);

  // BFS from top code entry point
  const codeEntry = entryScores.find(e => typeOf(e.id) === 'file') || entryScores[0];
  const startNode = codeEntry ? codeEntry.id : (nodes[0] && nodes[0].id);

  // adjacency for imports + calls forward
  const adj = {};
  for (const id of nodeIds) adj[id] = [];
  for (const e of edges) {
    if ((e.type === 'imports' || e.type === 'calls') && nodeIds.has(e.source) && nodeIds.has(e.target)) {
      adj[e.source].push(e.target);
    }
  }
  const order = [];
  const depthMap = {};
  if (startNode && nodeIds.has(startNode)) {
    const q = [startNode];
    depthMap[startNode] = 0;
    while (q.length) {
      const cur = q.shift();
      order.push(cur);
      for (const nxt of adj[cur]) {
        if (!(nxt in depthMap)) {
          depthMap[nxt] = depthMap[cur] + 1;
          q.push(nxt);
        }
      }
    }
  }
  const byDepth = {};
  for (const id of order) {
    const d = String(depthMap[id]);
    (byDepth[d] = byDepth[d] || []).push(id);
  }

  // Non-code inventory
  const nonCodeFiles = { documentation: [], infrastructure: [], data: [], config: [] };
  for (const n of nodes) {
    const item = { id: n.id, name: n.name, type: n.type, summary: n.summary || '' };
    if (n.type === 'document') nonCodeFiles.documentation.push(item);
    else if (n.type === 'service' || n.type === 'pipeline' || n.type === 'resource') nonCodeFiles.infrastructure.push(item);
    else if (n.type === 'table' || n.type === 'schema' || n.type === 'endpoint') nonCodeFiles.data.push(item);
    else if (n.type === 'config') nonCodeFiles.config.push(item);
  }

  // Clusters: bidirectional imports/calls + expansion
  const pairKey = (a, b) => [a, b].sort().join('|||');
  const directed = new Set();
  for (const e of edges) {
    if ((e.type === 'imports' || e.type === 'calls' || e.type === 'depends_on' || e.type === 'related') &&
        nodeIds.has(e.source) && nodeIds.has(e.target)) {
      directed.add(e.source + '->' + e.target);
    }
  }
  const clustersMap = new Map();
  for (const e of edges) {
    if (!(nodeIds.has(e.source) && nodeIds.has(e.target))) continue;
    if (e.source === e.target) continue;
    if (directed.has(e.target + '->' + e.source) && directed.has(e.source + '->' + e.target)) {
      const k = pairKey(e.source, e.target);
      if (!clustersMap.has(k)) clustersMap.set(k, new Set([e.source, e.target]));
    }
  }
  // count undirected edge multiplicity between node pairs to find tightly coupled groups
  const undirectedCount = {};
  for (const e of edges) {
    if (!(nodeIds.has(e.source) && nodeIds.has(e.target))) continue;
    if (e.source === e.target) continue;
    const k = pairKey(e.source, e.target);
    undirectedCount[k] = (undirectedCount[k] || 0) + 1;
  }
  // Build clusters greedily from highest-multiplicity pairs
  const sortedPairs = Object.keys(undirectedCount)
    .map(k => ({ k, n: undirectedCount[k], nodes: k.split('|||') }))
    .filter(p => p.n >= 2)
    .sort((a, b) => b.n - a.n);

  const used = new Set();
  const clusters = [];
  // adjacency for expansion (any relation)
  const anyAdj = {};
  for (const id of nodeIds) anyAdj[id] = new Set();
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target) {
      anyAdj[e.source].add(e.target);
      anyAdj[e.target].add(e.source);
    }
  }
  for (const p of sortedPairs) {
    if (p.nodes.some(n => used.has(n))) continue;
    const cluster = new Set(p.nodes);
    // expand: add nodes connected to 2+ cluster members
    let changed = true;
    while (changed && cluster.size < 5) {
      changed = false;
      const candidates = {};
      for (const member of cluster) {
        for (const nb of anyAdj[member]) {
          if (cluster.has(nb) || used.has(nb)) continue;
          candidates[nb] = (candidates[nb] || 0) + 1;
        }
      }
      for (const c of Object.keys(candidates)) {
        if (candidates[c] >= 2 && cluster.size < 5) { cluster.add(c); changed = true; }
      }
    }
    // edge count within cluster
    let edgeCount = 0;
    const arr = [...cluster];
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        edgeCount += undirectedCount[pairKey(arr[i], arr[j])] || 0;
    for (const n of cluster) used.add(n);
    clusters.push({ nodes: arr, edgeCount });
    if (clusters.length >= 10) break;
  }
  clusters.sort((a, b) => b.edgeCount - a.edgeCount);

  // Node summary index
  const nodeSummaryIndex = {};
  for (const n of nodes) {
    nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary || '' };
  }

  const result = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal: { startNode, order, depthMap, byDepth },
    nonCodeFiles,
    clusters: clusters.slice(0, 10),
    layers: { count: layers.length, list: layers.map(l => ({ id: l.id, name: l.name, description: l.description })) },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  process.exit(0);
}

try { main(); } catch (err) { console.error(err && err.stack ? err.stack : String(err)); process.exit(1); }
