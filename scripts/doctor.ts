#!/usr/bin/env bun
/**
 * uiMatch Doctor — quick environment checks to speed up debugging.
 * - Verifies .env loading
 * - Checks Figma REST (if FIGMA_ACCESS_TOKEN + sample ids provided)
 * - Checks MCP endpoint reachability (optional)
 * - Sanity-checks Playwright (Chromium launch + basic page)
 */

// Load environment variables from .env file
import 'dotenv/config';

import { chromium } from 'playwright';

const log = (ok: boolean, msg: string) => console.log(`${ok ? '✅' : '❌'} ${msg}`);

async function checkEnv() {
  console.log('\n[1] Environment');
  const bun = (process.versions as { bun?: string }).bun ?? 'unknown';
  const node = process.versions?.node ?? 'unknown';
  log(true, `Bun: ${bun} | Node: ${node}`);

  const hasPat = !!process.env.FIGMA_ACCESS_TOKEN;
  log(hasPat, `FIGMA_ACCESS_TOKEN ${hasPat ? 'present' : 'missing'}`);

  const mcp = process.env.FIGMA_MCP_URL ?? 'http://127.0.0.1:3845/mcp';
  log(true, `FIGMA_MCP_URL: ${mcp}`);
  return { hasPat, mcp };
}

async function checkFigmaREST() {
  console.log('\n[2] Figma REST (optional)');
  const token = process.env.FIGMA_ACCESS_TOKEN;
  const fileKey = process.env.DOCTOR_FIGMA_FILE_KEY;
  const nodeId = process.env.DOCTOR_FIGMA_NODE_ID;

  if (!token || !fileKey || !nodeId) {
    log(
      true,
      'Skipped (provide FIGMA_ACCESS_TOKEN + DOCTOR_FIGMA_FILE_KEY + DOCTOR_FIGMA_NODE_ID to test)'
    );
    return;
  }

  const q = new URLSearchParams({
    ids: nodeId,
    format: 'png',
    scale: '2',
    use_absolute_bounds: 'true',
  });
  const url = `https://api.figma.com/v1/images/${fileKey}?${q}`;

  const r = await fetch(url, { headers: { 'X-Figma-Token': token } });
  if (!r.ok) {
    log(false, `REST /images failed: ${r.status} ${r.statusText}`);
    const text = await r.text().catch(() => '');
    if (text) console.log(text.slice(0, 500));
    return;
  }
  const data = (await r.json().catch(() => ({}) as Record<string, never>)) as {
    images?: Record<string, string>;
  };
  const variants = new Set([nodeId, nodeId.replace(/:/g, '-'), nodeId.replace(/-/g, ':')]);
  let imageUrl: string | undefined;
  for (const k of variants) imageUrl ||= data.images?.[k];
  log(!!imageUrl, `Image URL ${imageUrl ? 'resolved' : 'not found'} (nodeId variants tried)`);
}

async function checkMCP(mcpUrl: string) {
  console.log('\n[3] MCP endpoint (optional reachability)');
  try {
    // A simple POST—real MCP requires JSON-RPC initialize + SSE; we only check reachability.
    const r = await fetch(mcpUrl, { method: 'POST' });
    log(true, `Reachable (${r.status})`);
  } catch (e) {
    log(false, `Cannot reach MCP at ${mcpUrl}`);
  }
}

async function checkPlaywright() {
  console.log('\n[4] Playwright sanity');
  const headless = process.env.UIMATCH_HEADLESS !== 'false';
  try {
    const browser = await chromium.launch({ headless });
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await ctx.newPage();
    await page.setContent(
      "<html><body><div id='box' style='width:100px;height:100px;background:#f00'></div></body></html>"
    );
    const el = await page.$('#box');
    const ok = !!el;
    await ctx.close();
    await browser.close();
    log(ok, `Chromium launch + element capture ${ok ? 'OK' : 'FAILED'}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(false, `Chromium launch failed: ${message}`);
  }
}

async function main() {
  const { mcp } = await checkEnv();
  await checkFigmaREST();
  await checkMCP(mcp);
  await checkPlaywright();

  console.log('\nTips:');
  console.log('- If REST is OK, expect [uimatch] mode: REST when PAT is set.');
  console.log(
    '- Always quote Figma URL arg: figma="https://www.figma.com/design/...&node-id=13-1023"'
  );
  console.log('- For MCP-only runs, use figma=current (Desktop selection).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
