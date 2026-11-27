import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHistoryIndex } from "../plugins/gravity-hub/sidecars/dashboard/history-index.mjs";
import { initSuiteExtensions } from "../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs";

function makeTempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ag-v220-verify-"));
  const dataDir = path.join(root, "data");
  const appDataDir = path.join(root, "appData");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(appDataDir, { recursive: true });
  return { root, dataDir, appDataDir };
}

function appendTurnRecords(streamOrPath, turnStart, turnEnd, isStream = true) {
  const writeLine = (obj) => {
    const line = JSON.stringify(obj) + "\n";
    if (isStream) streamOrPath.write(line);
    else fs.appendFileSync(streamOrPath, line, "utf8");
  };
  for (let i = turnStart; i <= turnEnd; i++) {
    const topic =
      i % 200 === 0
        ? "跨月配额重置口径确认"
        : i % 150 === 0
        ? "排查 SQLITE_BUSY 与 HTTP 403 报错"
        : i % 120 === 0
        ? "优化 prefixCacheHitRate 前缀缓存命中率"
        : `常规模块重构与单测校验 第${i}轮`;
    writeLine({
      step_index: (i - 1) * 3,
      type: "USER_INPUT",
      status: "DONE",
      created_at: "2026-11-27T05:00:00Z",
      content: `${topic} src/module_${i % 80}.mjs`
    });
    writeLine({
      step_index: (i - 1) * 3 + 1,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      created_at: "2026-11-27T05:00:02Z",
      input_tokens: 4500,
      cache_read_tokens: 40500,
      output_tokens: 180,
      thinking: `INTERNAL_THOUGHT_ONLY_${i}`,
      tool_calls: [{ name: "read_file", args: { Path: `/repo/src/module_${i % 80}.mjs` } }]
    });
    writeLine({
      step_index: (i - 1) * 3 + 2,
      type: "GENERIC",
      status: "DONE",
      created_at: "2026-11-27T05:00:03Z",
      content: `Showing lines 1-60 of 180`
    });
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[idx] * 100) / 100;
}

test("v2.2.0 Stress Benchmark: 10,000 turns + 500 incremental append + 100 queries + 30 slice details", async () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-stress-10k-500";
  try {
    const logDir = path.join(appDataDir, "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const tPath = path.join(logDir, "transcript.jsonl");
    const ws = fs.createWriteStream(tPath, { encoding: "utf8" });
    appendTurnRecords(ws, 1, 10000, true);
    ws.end();
    await new Promise((resolve, reject) => {
      ws.on("finish", resolve);
      ws.on("error", reject);
    });

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const t0 = performance.now();
    const sInit = idx.syncConversation(convId);
    const initMs = Math.round((performance.now() - t0) * 100) / 100;
    assert.equal(sInit.turnCount, 10000);

    // 追加 500 轮增量写入，验证非全量重建且 bytesRead 仅占尾部增量
    const totalBefore = fs.statSync(tPath).size;
    appendTurnRecords(tPath, 10001, 10500, false);
    const totalAfter = fs.statSync(tPath).size;
    const expectedDelta = totalAfter - totalBefore;

    const tInc0 = performance.now();
    const sInc = idx.syncConversation(convId);
    const incMs = Math.round((performance.now() - tInc0) * 100) / 100;
    assert.equal(sInc.rebuilt, false);
    assert.equal(sInc.turnCount, 10500);
    assert.equal(sInc.bytesRead, expectedDelta);
    assert.ok(sInc.bytesRead < totalAfter * 0.1, "incremental sync should read <10% of total file");

    // 100 次混合检索压测
    const queries = [
      { q: "跨月", type: "all" },
      { q: "缓存", type: "all" },
      { q: "配额重置", type: "user_confirm" },
      { q: "SQLITE_BUSY", type: "all" },
      { q: "403", type: "all" },
      { q: "prefixCacheHitRate", type: "all" },
      { q: "module_15.mjs", type: "tool_verified" },
      { q: "重构", type: "all" },
      { q: "命中率", type: "all" },
      { q: "src/module_42.mjs", type: "all" }
    ];
    const searchLatencies = [];
    for (let i = 0; i < 100; i++) {
      const item = queries[i % queries.length];
      const r = idx.searchTurns({ conversationId: convId, query: item.q, evidenceType: item.type, limit: 50 });
      assert.ok(r.ok && r.items.length > 0, `expected hits for ${item.q}`);
      searchLatencies.push(r.elapsedMs);
    }
    searchLatencies.sort((a, b) => a - b);

    // 30 次跨首/中/尾轮次的按字节偏移切片展开压测
    const detailLatencies = [];
    const targetTurns = [1, 250, 1500, 3600, 5200, 7800, 9999, 10200, 10499, 10500];
    for (let i = 0; i < 30; i++) {
      const ti = targetTurns[i % targetTurns.length];
      const td0 = performance.now();
      const det = idx.getTurnDetail({ conversationId: convId, turnIndex: ti });
      const elapsed = performance.now() - td0;
      assert.equal(det.ok, true);
      assert.equal(det.turn.turnIndex, ti);
      detailLatencies.push(elapsed);
    }
    detailLatencies.sort((a, b) => a - b);

    const report = {
      init10kMs: initMs,
      inc500Ms: incMs,
      incBytesRead: sInc.bytesRead,
      searchP50Ms: percentile(searchLatencies, 0.5),
      searchP95Ms: percentile(searchLatencies, 0.95),
      searchP99Ms: percentile(searchLatencies, 0.99),
      detailP50Ms: percentile(detailLatencies, 0.5),
      detailP95Ms: percentile(detailLatencies, 0.95)
    };
    console.log("STRESS_REPORT:", JSON.stringify(report));
    assert.ok(report.searchP95Ms <= 200, `search P95 ${report.searchP95Ms}ms > 200ms`);
    assert.ok(report.detailP95Ms <= 15, `detail slice P95 ${report.detailP95Ms}ms > 15ms`);
    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.2.0 Anti-Hallucination Audit: zero false verified claims, drift warnings, and cross-project/account isolation", async () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const prevAppDir = process.env.ANTIGRAVITY_APP_DATA_DIR;
  process.env.ANTIGRAVITY_APP_DATA_DIR = appDataDir;

  try {
    const workDir = path.join(root, "repo");
    fs.mkdirSync(workDir, { recursive: true });
    const fUnchanged = path.join(workDir, "stable.mjs");
    const fChanged = path.join(workDir, "edited.mjs");
    const fDeleted = path.join(workDir, "removed.mjs");
    fs.writeFileSync(fUnchanged, "export const a = 1;\n", "utf8");
    fs.writeFileSync(fChanged, "export const b = 1;\n", "utf8");
    fs.writeFileSync(fDeleted, "export const c = 1;\n", "utf8");

    // 构造多项目会话库
    const sdb = new DatabaseSync(path.join(appDataDir, "conversation_summaries.db"));
    sdb.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT,
        last_modified_time TEXT,
        workspace_uris TEXT,
        project_id TEXT,
        killed INTEGER DEFAULT 0
      )
    `);
    const ins = sdb.prepare("INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, 0)");
    ins.run("conv-audit-main", "主审计会话", "2026-11-27T10:00:00Z", JSON.stringify([`file://${workDir}`]), "audit-p1");
    ins.run("conv-audit-other", "异项目机密", "2026-11-27T09:00:00Z", JSON.stringify(["/other/secret-project"]), "audit-p2");
    sdb.close();

    // 写入 4 种防幻读边界轮次
    const logDir = path.join(appDataDir, "brain", "conv-audit-main", ".system_generated", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, "transcript.jsonl"),
      [
        // Turn 1: 工具调用无返回 -> 只能是 tool_called
        JSON.stringify({ step_index: 0, type: "USER_INPUT", created_at: "2026-11-27T09:00:00Z", content: `核对无返回调用 ${fUnchanged}` }),
        JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", created_at: "2026-11-27T09:00:01Z", tool_calls: [{ name: "run_command", args: { CommandLine: "npm test" } }] }),
        // Turn 2: 工具输出被截断 -> 只能是 tool_called
        JSON.stringify({ step_index: 2, type: "USER_INPUT", created_at: "2026-11-27T09:01:00Z", content: `核对截断输出 ${fChanged}` }),
        JSON.stringify({ step_index: 3, type: "PLANNER_RESPONSE", created_at: "2026-11-27T09:01:01Z", tool_calls: [{ name: "run_command", args: { CommandLine: "npm test" } }] }),
        JSON.stringify({ step_index: 4, type: "GENERIC", status: "DONE", created_at: "2026-11-27T09:01:02Z", content: "partial...", truncated_fields: ["content"] }),
        // Turn 3: 工具返回非零退出码 -> 只能是 tool_called
        JSON.stringify({ step_index: 5, type: "USER_INPUT", created_at: "2026-11-27T09:02:00Z", content: `核对失败命令 ${fDeleted}` }),
        JSON.stringify({ step_index: 6, type: "PLANNER_RESPONSE", created_at: "2026-11-27T09:02:01Z", tool_calls: [{ name: "run_command", args: { CommandLine: "node test.mjs" } }] }),
        JSON.stringify({ step_index: 7, type: "GENERIC", status: "DONE", created_at: "2026-11-27T09:02:02Z", content: "Command exited with code 1\nAssertionError" }),
        // Turn 4: 助手口头声称“已修复并验证通过”但无工具调用 -> 只能是 assistant_note
        JSON.stringify({ step_index: 8, type: "USER_INPUT", created_at: "2026-11-27T09:03:00Z", content: "口头声明检查" }),
        JSON.stringify({ step_index: 9, type: "PLANNER_RESPONSE", created_at: "2026-11-27T09:03:01Z", content: "已修复并验证通过全部测试" })
      ].join("\n") + "\n",
      "utf8"
    );

    const otherDir = path.join(appDataDir, "brain", "conv-audit-other", ".system_generated", "logs");
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(
      path.join(otherDir, "transcript.jsonl"),
      JSON.stringify({ step_index: 0, type: "USER_INPUT", created_at: "2026-11-27T09:00:00Z", content: "SECRET_OTHER_PROJECT_TOKEN" }) + "\n",
      "utf8"
    );

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const ov = idx.getOverview("conv-audit-main");
    assert.equal(ov.turnCount, 4);

    // 校验没有任何一轮被误标为 tool_verified
    let falseVerified = 0;
    for (const t of ov.items) {
      if (t.evidenceTypes.includes("tool_verified")) falseVerified += 1;
    }
    assert.equal(falseVerified, 0, "0 turns without clean verified tool output may be marked tool_verified");

    // 触发文件修改与删除，校验漂移识别与摘录警示
    fs.writeFileSync(fChanged, "export const b = 2; // changed\n", "utf8");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(fChanged, future, future);
    fs.rmSync(fDeleted);

    const v1 = idx.verifyTurnFiles({ conversationId: "conv-audit-main", turnIndex: 1 });
    const v2 = idx.verifyTurnFiles({ conversationId: "conv-audit-main", turnIndex: 2 });
    const v3 = idx.verifyTurnFiles({ conversationId: "conv-audit-main", turnIndex: 3 });
    assert.equal(v1.summary.unchanged, 1);
    assert.equal(v2.summary.changed, 1);
    assert.equal(v3.summary.missing, 1);

    const pack = idx.buildExcerptPack({
      conversationId: "conv-audit-main",
      selections: [
        { conversationId: "conv-audit-main", turnIndex: 2 },
        { conversationId: "conv-audit-main", turnIndex: 3 },
        { conversationId: "conv-audit-other", turnIndex: 1 } // 异项目越权尝试
      ]
    });
    assert.equal(pack.itemCount, 2);
    assert.ok(pack.text.includes("仅作历史出处参考"));
    assert.ok(pack.text.includes("⚠"));
    assert.ok(pack.text.includes("✕"));
    assert.ok(!pack.text.includes("SECRET_OTHER_PROJECT_TOKEN"));

    // 跨项目搜索泄漏校验
    const leak = idx.searchTurns({ conversationId: "conv-audit-main", query: "SECRET_OTHER_PROJECT_TOKEN", scope: "project" });
    assert.equal(leak.items.length, 0);

    idx.close();

    // 切号 epoch 隔离验证
    const ext = initSuiteExtensions({ dataDir, pluginRoot: path.join(root, "plugin") });
    let bridge = null;
    for (let i = 0; i < 40; i++) {
      bridge = ext.getBridgeInfo();
      if (bridge) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const call = (p, body) =>
      fetch(`${bridge.origin}${p}`, {
        method: body ? "POST" : "GET",
        headers: { "X-Suite-Token": bridge.token, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      }).then((r) => r.json());

    await call("/api/suite-quota", { email: "alpha@test.com", groups: [] });
    const e1 = (await call("/api/suite-history/prefs")).accountEpoch;
    await call("/api/suite-quota", { email: "beta@test.com", groups: [] });
    const e2 = (await call("/api/suite-history/prefs")).accountEpoch;
    ext.closeBridge();
    assert.ok(e2 > e1, "accountEpoch must increment on account switch");

    console.log("ANTI_HALLUCINATION_AUDIT:", JSON.stringify({
      falseVerified,
      unchangedOk: v1.summary.unchanged === 1,
      changedOk: v2.summary.changed === 1,
      missingOk: v3.summary.missing === 1,
      crossProjectLeaks: leak.items.length,
      crossPackRejected: pack.itemCount === 2,
      accountEpochIncremented: e2 > e1
    }));
  } finally {
    if (prevAppDir === undefined) delete process.env.ANTIGRAVITY_APP_DATA_DIR;
    else process.env.ANTIGRAVITY_APP_DATA_DIR = prevAppDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.2.0 Retrieval Accuracy: 12 positive query classes = 100% recall, 0 false positives, FTS5 special chars safe", () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-recall-001";
  try {
    const logDir = path.join(appDataDir, "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, "transcript.jsonl"),
      [
        JSON.stringify({ step_index: 0, type: "USER_INPUT", created_at: "2026-11-27T01:00:00Z", content: "修复跨月额度重置口径与防幻觉护栏" }),
        JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", created_at: "2026-11-27T01:00:02Z", thinking: "PRIVATE_THINK_SECRET_999", content: "已检查前缀缓存命中率" }),
        JSON.stringify({ step_index: 2, type: "USER_INPUT", created_at: "2026-11-27T02:00:00Z", content: "排查 plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs 的 parseTranscriptIncremental 报错 ENOENT" }),
        JSON.stringify({ step_index: 3, type: "PLANNER_RESPONSE", created_at: "2026-11-27T02:00:02Z", content: "请求 /api/suite-history/overview 返回 HTTP 403 与 SQLITE_BUSY" }),
        JSON.stringify({ step_index: 4, type: "USER_INPUT", created_at: "2026-11-27T03:00:00Z", content: "单字锁测试" })
      ].join("\n") + "\n",
      "utf8"
    );

    const idx = createHistoryIndex({ dataDir, appDataDir });
    idx.syncConversation(convId);

    const positiveQueries = [
      "跨月",
      "幻觉",
      "缓存",
      "额度重置",
      "suite-extensions.mjs",
      "plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs",
      "/api/suite-history/overview",
      "parseTranscriptIncremental",
      "ENOENT",
      "SQLITE_BUSY",
      "403",
      "锁"
    ];

    let hits = 0;
    for (const q of positiveQueries) {
      const r = idx.searchTurns({ conversationId: convId, query: q });
      assert.ok(r.ok && r.items.length >= 1, `positive query failed: ${q}`);
      hits += 1;
    }

    const negativeQueries = [
      "PRIVATE_THINK_SECRET_999",
      "COMPLETELY_NON_EXISTENT_XYZ_987",
      'a-b:c*d/e"f(g)',
      "OR AND NOT *"
    ];
    let falseHits = 0;
    for (const q of negativeQueries) {
      const r = idx.searchTurns({ conversationId: convId, query: q });
      assert.equal(r.ok, true, `special query threw error: ${q}`);
      falseHits += r.items.length;
    }
    assert.equal(falseHits, 0);

    console.log("RETRIEVAL_AUDIT:", JSON.stringify({
      positiveTested: positiveQueries.length,
      positiveHits: hits,
      recallPct: Math.round((hits / positiveQueries.length) * 100),
      negativeTested: negativeQueries.length,
      falsePositives: falseHits
    }));
    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
