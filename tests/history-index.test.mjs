import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHistoryIndex,
  extractCjkBigrams,
  splitCodeTokens,
  normalizePlatformPath,
  toPathCompareKey,
  isAbsoluteLocalPath
} from "../plugins/gravity-hub/sidecars/dashboard/history-index.mjs";
import { GUARDRAIL_TEMPLATES, initSuiteExtensions } from "../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs";
import { DatabaseSync } from "node:sqlite";

function makeTempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ag-hist-test-"));
  const dataDir = path.join(root, "data");
  const appDataDir = path.join(root, "appData");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(appDataDir, { recursive: true });
  return { root, dataDir, appDataDir };
}

function writeTranscriptLines(appDataDir, convId, records, append = false) {
  const logDir = path.join(appDataDir, "brain", convId, ".system_generated", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const p = path.join(logDir, "transcript.jsonl");
  const body = records.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n") + "\n";
  if (append && fs.existsSync(p)) {
    fs.appendFileSync(p, body, "utf8");
  } else {
    fs.writeFileSync(p, body, "utf8");
  }
  return p;
}

test("CJK bigrams and code token splitting", () => {
  assert.deepEqual(extractCjkBigrams("修复跨月额度重置"), ["修复", "复跨", "跨月", "月额", "额度", "度重", "重置"]);
  const toks = splitCodeTokens("parseTranscriptIncremental /api/suite-history/overview");
  assert.ok(toks.includes("parsetranscriptincremental"));
  assert.ok(toks.includes("parse"));
  assert.ok(toks.includes("transcript"));
  assert.ok(toks.includes("incremental"));
  assert.ok(toks.includes("overview"));
});

test("Incremental byte-offset sync, half-line protection, reopen, and truncate rebuild", () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-inc-001";
  try {
    const p = writeTranscriptLines(appDataDir, convId, [
      {
        step_index: 0,
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-11-27T01:00:00Z",
        content: "<USER_REQUEST>\n修复跨月额度重置 bug，查看 scanner.mjs\n</USER_REQUEST>"
      },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: "2026-11-27T01:00:05Z",
        input_tokens: 20000,
        cache_read_tokens: 16000,
        output_tokens: 300,
        thinking: "SECRET_THINKING_ONLY_TOKEN",
        tool_calls: [{ name: "read_file", args: { Path: "\"/repo/plugins/gravity-vault/sidecars/dock/scanner.mjs\"" } }]
      },
      {
        step_index: 2,
        type: "GENERIC",
        status: "DONE",
        created_at: "2026-11-27T01:00:06Z",
        content: "Showing lines 1-50 of 317"
      }
    ]);

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const s1 = idx.syncConversation(convId);
    assert.equal(s1.ok, true);
    assert.equal(s1.turnCount, 1);
    assert.ok(s1.bytesRead > 0);

    // 再次无变化同步应直接命中缓存，bytesRead === 0
    const s1Again = idx.syncConversation(convId);
    assert.equal(s1Again.bytesRead, 0);
    assert.equal(s1Again.cacheHit, true);

    // 追加半行不完整 JSON（无换行符）应保护不消费
    const halfLine = JSON.stringify({
      step_index: 3,
      type: "USER_INPUT",
      status: "DONE",
      created_at: "2026-11-27T01:01:00Z",
      content: "半行测试 ENOENT"
    }).slice(0, 40);
    fs.appendFileSync(p, halfLine, "utf8");
    const sHalf = idx.syncConversation(convId);
    assert.equal(sHalf.turnCount, 1);

    // 补全半行并加换行符，应仅增量读取尾部并识别出第 2 轮
    const fullSecond = JSON.stringify({
      step_index: 3,
      type: "USER_INPUT",
      status: "DONE",
      created_at: "2026-11-27T01:01:00Z",
      content: "排查 ENOENT 报错 HTTP 403"
    });
    const curBuf = fs.readFileSync(p);
    const trimmedBuf = curBuf.subarray(0, curBuf.length - Buffer.byteLength(halfLine, "utf8"));
    fs.writeFileSync(p, Buffer.concat([trimmedBuf, Buffer.from(fullSecond + "\n", "utf8")]));

    // 模拟重启重建实例后从 SQLite 游标续读
    idx.close();
    const idx2 = createHistoryIndex({ dataDir, appDataDir });
    const s2 = idx2.syncConversation(convId);
    assert.equal(s2.turnCount, 2);
    assert.equal(s2.rebuilt, false);
    assert.ok(s2.bytesRead > 0 && s2.bytesRead < fs.statSync(p).size);

    // 验证 thinking 不入索引
    const thinkHits = idx2.searchTurns({ conversationId: convId, query: "SECRET_THINKING_ONLY_TOKEN" });
    assert.equal(thinkHits.items.length, 0);

    // 验证中文双字、文件路径与错误码检索
    assert.equal(idx2.searchTurns({ conversationId: convId, query: "跨月" }).items.length, 1);
    assert.equal(idx2.searchTurns({ conversationId: convId, query: "scanner.mjs" }).items.length, 1);
    assert.equal(idx2.searchTurns({ conversationId: convId, query: "ENOENT" }).items.length, 1);
    assert.equal(idx2.searchTurns({ conversationId: convId, query: "403" }).items.length, 1);

    // 文件截断重建测试
    writeTranscriptLines(appDataDir, convId, [
      { step_index: 0, type: "USER_INPUT", status: "DONE", created_at: "2026-11-27T02:00:00Z", content: "截断后唯一轮次" }
    ]);
    const sTrunc = idx2.syncConversation(convId);
    assert.equal(sTrunc.rebuilt, true);
    assert.equal(sTrunc.turnCount, 1);
    assert.equal(idx2.searchTurns({ conversationId: convId, query: "ENOENT" }).items.length, 0);
    idx2.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Anti-hallucination evidence classification, detail slice read, and missing transcript fallback", () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-ev-002";
  try {
    writeTranscriptLines(appDataDir, convId, [
      {
        step_index: 0,
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-11-27T03:00:00Z",
        content: "只执行了工具调用但结果被截断"
      },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: "2026-11-27T03:00:02Z",
        input_tokens: 40000,
        cache_read_tokens: 8000,
        output_tokens: 150,
        tool_calls: [{ name: "run_command", args: { CommandLine: "npm test" } }]
      },
      {
        step_index: 2,
        type: "GENERIC",
        status: "DONE",
        created_at: "2026-11-27T03:00:05Z",
        content: "truncated output",
        truncated_fields: ["content"]
      },
      {
        step_index: 3,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: "2026-11-27T03:00:07Z",
        input_tokens: 42000,
        cache_read_tokens: 37800,
        output_tokens: 200,
        content: "已修复该问题"
      }
    ]);

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const ov = idx.getOverview(convId);
    assert.equal(ov.turnCount, 1);
    const turn = ov.items[0];
    assert.ok(turn.evidenceTypes.includes("tool_called"));
    assert.ok(!turn.evidenceTypes.includes("tool_verified"), "truncated tool output must NOT be marked tool_verified");
    assert.ok(turn.evidenceTypes.includes("assistant_note"));

    // 缓存命中率校验：最后一轮 uncached=42000, cache=37800, total=79800 -> 37800/79800 = 47.4% -> warm
    assert.equal(ov.cacheStats.lastTotalContextTokens, 79800);
    assert.equal(ov.cacheStats.lastUncachedInputTokens, 42000);
    assert.equal(ov.cacheStats.lastHitRatePct, 47.4);
    assert.equal(ov.cacheStats.status, "warm");

    // 单轮定点详情读取
    const det = idx.getTurnDetail({ conversationId: convId, turnIndex: 1 });
    assert.equal(det.ok, true);
    assert.equal(det.tools[0].status, "called");
    assert.ok(det.assistantText.includes("已修复"));

    // 缺失转录降级
    const missingOv = idx.getOverview("conv-does-not-exist");
    assert.equal(missingOv.ok, true);
    assert.equal(missingOv.schemaStatus, "missing_transcript");
    assert.equal(missingOv.turnCount, 0);
    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("10,000-turn benchmark: search P95 <= 200 ms", async () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-bench-10k";
  try {
    const logDir = path.join(appDataDir, "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const p = path.join(logDir, "transcript.jsonl");
    const ws = fs.createWriteStream(p, { encoding: "utf8" });

    for (let i = 1; i <= 10000; i++) {
      const topic = i % 250 === 0 ? "跨月额度重置规则核对" : i % 170 === 0 ? "排查 SQLITE_BUSY 与 403 鉴权" : `常规工程任务第 ${i} 轮代码检查`;
      const u = {
        step_index: (i - 1) * 2,
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-11-27T04:00:00Z",
        content: `${topic} file_${i % 100}.mjs`
      };
      const a = {
        step_index: (i - 1) * 2 + 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: "2026-11-27T04:00:02Z",
        input_tokens: 30000,
        cache_read_tokens: 25000,
        output_tokens: 120,
        content: `检查完成 parseTranscriptIncremental turn_${i}`
      };
      ws.write(JSON.stringify(u) + "\n" + JSON.stringify(a) + "\n");
    }
    ws.end();

    await new Promise((resolve, reject) => {
      ws.on("finish", resolve);
      ws.on("error", reject);
    });

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const tSync0 = performance.now();
    const syncRes = idx.syncConversation(convId);
    const syncMs = Math.round((performance.now() - tSync0) * 100) / 100;
    assert.equal(syncRes.turnCount, 10000);

    const queries = ["跨月", "额度", "SQLITE_BUSY", "403", "file_42.mjs", "parseTranscriptIncremental"];
    const latencies = [];
    for (let round = 0; round < 30; round++) {
      const q = queries[round % queries.length];
      const res = idx.searchTurns({ conversationId: convId, query: q, limit: 50 });
      assert.ok(res.items.length > 0, `expected hits for ${q}`);
      latencies.push(res.elapsedMs);
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    console.log(`[10k-bench] sync=${syncMs}ms, search_p50=${p50}ms, search_p95=${p95}ms`);
    assert.ok(p95 <= 200, `P95 search latency ${p95}ms exceeded 200ms`);
    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 2: Turn pins survive resetIndex, real-time file drift detection, and vault pins integration", () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-stage2-001";
  try {
    const srcDir = path.join(root, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const fileA = path.join(srcDir, "quota.mjs");
    const fileB = path.join(srcDir, "deleted.mjs");
    fs.writeFileSync(fileA, "export const limit = 100;\n", "utf8");
    fs.writeFileSync(fileB, "export const tmp = 1;\n", "utf8");

    // 模拟引力文库 pins.json
    const vaultDir = path.join(appDataDir, "plugin_data", "gravity-vault");
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(vaultDir, "pins.json"),
      JSON.stringify({ [fileA]: { path: fileA, name: "quota.mjs", pinnedAt: Date.now() } }),
      "utf8"
    );

    writeTranscriptLines(appDataDir, convId, [
      {
        step_index: 0,
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-11-27T01:00:00Z",
        content: `检查跨月规则 ${fileA} 和 ${fileB}`
      },
      {
        step_index: 1,
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-11-27T01:05:00Z",
        content: "检查跨月次要轮次"
      }
    ]);

    const idx = createHistoryIndex({ dataDir, appDataDir });
    idx.syncConversation(convId);

    // 1. 刚索引后文件未变，且 fileA 关联文库收藏
    const v1 = idx.verifyTurnFiles({ conversationId: convId, turnIndex: 1 });
    assert.equal(v1.ok, true);
    assert.equal(v1.summary.unchanged, 2);
    assert.equal(v1.summary.vaultPinnedCount, 1);
    assert.equal(v1.summary.hasDrift, false);

    // 2. 收藏 Turn #1，验证搜索置顶且重建本会话后收藏仍保留
    const pinRes = idx.toggleTurnPin({ conversationId: convId, turnIndex: 1, customTitle: "核心跨月口径", pinned: true });
    assert.equal(pinRes.pinned, true);

    const searchPinned = idx.searchTurns({ conversationId: convId, query: "跨月", pinnedOnly: true });
    assert.equal(searchPinned.items.length, 1);
    assert.equal(searchPinned.items[0].turnIndex, 1);
    assert.equal(searchPinned.items[0].displayTitle, "核心跨月口径");

    idx.resetIndex(convId);
    const afterReset = idx.searchTurns({ conversationId: convId, query: "", pinnedOnly: true });
    assert.equal(afterReset.items.length, 1);
    assert.equal(afterReset.items[0].turnIndex, 1);

    // 3. 修改 fileA 与删除 fileB 后，实时漂移校验应识别 changed 和 missing
    fs.writeFileSync(fileA, "export const limit = 200; // modified\n", "utf8");
    const futureTime = new Date(Date.now() + 5000);
    fs.utimesSync(fileA, futureTime, futureTime);
    fs.rmSync(fileB);

    const v2 = idx.verifyTurnFiles({ conversationId: convId, turnIndex: 1 });
    assert.equal(v2.summary.changed, 1);
    assert.equal(v2.summary.missing, 1);
    assert.equal(v2.summary.hasDrift, true);
    const statA = v2.files.find((f) => f.basename === "quota.mjs");
    const statB = v2.files.find((f) => f.basename === "deleted.mjs");
    assert.equal(statA.status, "changed");
    assert.equal(statA.vaultPinned, true);
    assert.equal(statB.status, "missing");

    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 2: Stable prefix excerpt pack enforces 3-item / 1200B budget and determinism", () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const convId = "conv-pack-003";
  try {
    const longBody = "这是一段非常长的历史决策描述，用于测试 UTF-8 字节预算严格截断机制，".repeat(8);
    const lines = [];
    for (let i = 1; i <= 5; i++) {
      lines.push({
        step_index: (i - 1) * 2,
        type: "USER_INPUT",
        status: "DONE",
        created_at: `2026-11-27T0${i}:00:00Z`,
        content: `第 ${i} 轮决策：${longBody}`
      });
      lines.push({
        step_index: (i - 1) * 2 + 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: `2026-11-27T0${i}:00:05Z`,
        input_tokens: 130000,
        cache_read_tokens: 20000,
        output_tokens: 100,
        content: `处理完成第 ${i} 轮`
      });
    }
    writeTranscriptLines(appDataDir, convId, lines);

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const ov = idx.getOverview(convId);
    assert.equal(ov.cacheStats.status, "cold");
    assert.equal(ov.cacheStats.advisory.level, "cold_high_ctx");

    const pack1 = idx.buildExcerptPack({
      conversationId: convId,
      turnIndices: [5, 2, 1, 4],
      taskHint: "继续实现新接口"
    });
    const pack2 = idx.buildExcerptPack({
      conversationId: convId,
      turnIndices: [1, 4, 2, 5],
      taskHint: "继续实现新接口"
    });

    assert.equal(pack1.ok, true);
    assert.equal(pack1.itemCount, 3);
    assert.equal(pack1.overDefaultItems, true);
    assert.ok(pack1.utf8Bytes <= 1200, `pack bytes ${pack1.utf8Bytes} exceeded 1200`);
    assert.equal(pack1.text, pack2.text, "pack output must be byte-deterministic regardless of selection order");
    assert.ok(pack1.text.includes("仅作历史出处参考"));
    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 2: Guardrail templates include lite tier, frugal discipline, and reduced size", () => {
  const strictBytes = Buffer.byteLength(GUARDRAIL_TEMPLATES.strict, "utf8");
  const standardBytes = Buffer.byteLength(GUARDRAIL_TEMPLATES.standard, "utf8");
  const liteBytes = Buffer.byteLength(GUARDRAIL_TEMPLATES.lite, "utf8");
  assert.ok(liteBytes < standardBytes && standardBytes < strictBytes);
  assert.ok(strictBytes < 1200, `strict template should stay compact (${strictBytes}B)`);
  assert.ok(GUARDRAIL_TEMPLATES.strict.includes("节俭检索纪律"));
  assert.ok(GUARDRAIL_TEMPLATES.lite.includes("aura-guardrail-tier: lite"));
});

test("Stage 3: Windows path normalization, UNC/drive matching, and route noise filtering", () => {
  assert.equal(normalizePlatformPath("file:///C:/Users/Test/My%20Repo/", "win32"), "C:\\Users\\Test\\My Repo");
  assert.equal(normalizePlatformPath("file://fileserver/share/docs/", "win32"), "\\\\fileserver\\share\\docs");
  assert.equal(
    toPathCompareKey("C:\\Users\\Dev\\Proj\\", "win32"),
    toPathCompareKey("file:///c:/users/dev/proj", "win32")
  );
  assert.equal(isAbsoluteLocalPath("C:\\repo\\app.mjs", "win32"), true);
  assert.equal(isAbsoluteLocalPath("\\\\server\\share\\a.txt", "win32"), true);
  assert.equal(isAbsoluteLocalPath("C:\\repo\\app.mjs", "darwin"), false);
  assert.equal(isAbsoluteLocalPath("/Users/dev/app.mjs", "darwin"), true);

  // HTTP / 前端路由不得误判为本地文件
  assert.equal(isAbsoluteLocalPath("/api/suite-history/overview", "darwin"), false);
  assert.equal(isAbsoluteLocalPath("/c/82a77598-1bc0-439f-bac5-f9bf9f46ebe0", "darwin"), false);
  assert.equal(isAbsoluteLocalPath("//cdn.example.com/a.js", "darwin"), false);
});

test("Stage 3: Same-project cross-session isolation, Windows workspace matching, and cross-project pack rejection", () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  try {
    // 构造模拟 conversation_summaries.db，含 Windows file:///C:/ 与 c:\ 写法
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
    ins.run("conv-p1-cur", "当前会话 P1", "2026-11-27T10:00:00Z", JSON.stringify(["file:///C:/Users/Dev/ProjA"]), "proj-a");
    ins.run("conv-p1-old", "历史会话 P1", "2026-11-26T10:00:00Z", JSON.stringify(["c:\\users\\dev\\proja\\"]), "proj-a");
    ins.run("conv-p2-other", "其他项目 P2", "2026-11-27T09:00:00Z", JSON.stringify(["file:///C:/Users/Dev/ProjB"]), "proj-b");
    ins.run("conv-orphan", "无归属会话", "2026-11-27T08:00:00Z", "[]", "outside-of-project");
    sdb.close();

    writeTranscriptLines(appDataDir, "conv-p1-cur", [
      { step_index: 0, type: "USER_INPUT", status: "DONE", created_at: "2026-11-27T10:00:00Z", content: "当前会话排查 /api/suite-history/overview 接口" }
    ]);
    writeTranscriptLines(appDataDir, "conv-p1-old", [
      { step_index: 0, type: "USER_INPUT", status: "DONE", created_at: "2026-11-26T10:00:00Z", content: "历史决定：跨月配额校验采用 UTC 时间，报错码 ECONNREFUSED" }
    ]);
    writeTranscriptLines(appDataDir, "conv-p2-other", [
      { step_index: 0, type: "USER_INPUT", status: "DONE", created_at: "2026-11-27T09:00:00Z", content: "跨项目机密：跨月绝不能被 P1 搜到" }
    ]);
    writeTranscriptLines(appDataDir, "conv-orphan", [
      { step_index: 0, type: "USER_INPUT", status: "DONE", created_at: "2026-11-27T08:00:00Z", content: "无归属会话：跨月也不能被搜到" }
    ]);

    const idx = createHistoryIndex({ dataDir, appDataDir });
    const scopeInfo = idx.listSameProjectConversations("conv-p1-cur");
    assert.equal(scopeInfo.scopeConfirmed, true);
    const sids = scopeInfo.sessions.map((s) => s.conversationId);
    assert.deepEqual(sids, ["conv-p1-cur", "conv-p1-old"]);

    // 跨会话检索能命中同项目历史，但严格排除其他项目与无归属会话
    const res = idx.searchTurns({ conversationId: "conv-p1-cur", query: "跨月", scope: "project" });
    assert.equal(res.scopeUsed, "project");
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].conversationId, "conv-p1-old");
    assert.equal(res.items[0].isCurrentSession, false);
    assert.equal(res.items[0].sessionTitle, "历史会话 P1");

    // 路由 /api/... 过滤验证：当前会话不该把 /api/suite-history/overview 当成缺失本地文件
    const verifyCur = idx.verifyTurnFiles({ conversationId: "conv-p1-cur", turnIndex: 1 });
    assert.equal(verifyCur.summary.missing, 0);

    // 无归属会话强制收敛为单会话
    const orphanRes = idx.searchTurns({ conversationId: "conv-orphan", query: "跨月", scope: "project" });
    assert.equal(orphanRes.scopeUsed, "session");
    assert.equal(orphanRes.scopeFallback, true);
    assert.equal(orphanRes.items.length, 1);

    // 跨会话打包白名单：试图混入 conv-p2-other 必须被拒绝过滤
    const pack = idx.buildExcerptPack({
      conversationId: "conv-p1-cur",
      selections: [
        { conversationId: "conv-p1-old", turnIndex: 1 },
        { conversationId: "conv-p2-other", turnIndex: 1 }
      ]
    });
    assert.equal(pack.itemCount, 1);
    assert.equal(pack.items[0].conversationId, "conv-p1-old");
    assert.ok(!pack.text.includes("跨项目机密"));

    idx.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 3: Sidecar enforces crossSessionEnabled gate and increments accountEpoch on account switch", async () => {
  const { root, dataDir, appDataDir } = makeTempEnv();
  const prevAppDir = process.env.ANTIGRAVITY_APP_DATA_DIR;
  process.env.ANTIGRAVITY_APP_DATA_DIR = appDataDir;

  let currentEmail = "user1@example.com";
  const ext = initSuiteExtensions({
    dataDir,
    pluginRoot: path.join(root, "plugin"),
    accountVault: {
      listAccounts: () => ({ currentEmail, accounts: [{ email: "user1@example.com" }, { email: "user2@example.com" }] }),
      switchAccount: (email) => { currentEmail = email; return { email }; }
    }
  });

  try {
    // 等待本地 bridgeServer 绑定端口
    let bridge = null;
    for (let i = 0; i < 40; i++) {
      bridge = ext.getBridgeInfo();
      if (bridge) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(bridge?.origin && bridge?.token);

    const callBridge = (p, opts = {}) =>
      fetch(`${bridge.origin}${p}`, {
        ...opts,
        headers: { "X-Suite-Token": bridge.token, "Content-Type": "application/json", ...(opts.headers || {}) }
      }).then((r) => r.json());

    // 默认关闭跨会话，即使请求 scope=project 也应收敛回 session
    const p0 = await callBridge("/api/suite-history/prefs");
    assert.equal(p0.crossSessionEnabled, false);
    const s0 = await callBridge("/api/suite-history/search?conversationId=x1&q=abc&scope=project");
    assert.equal(s0.crossSessionEnabled, false);

    // 首次上报 user1 配额，epoch 保持 1
    await callBridge("/api/suite-quota", {
      method: "POST",
      body: JSON.stringify({ email: "user1@example.com", groups: [] })
    });
    const p1 = await callBridge("/api/suite-history/prefs");
    assert.equal(p1.accountEpoch, 1);

    // 切换为 user2，accountEpoch 必须递增（通知前端立即清空旧视图）
    await callBridge("/api/suite-quota", {
      method: "POST",
      body: JSON.stringify({ email: "user2@example.com", groups: [] })
    });
    const p2 = await callBridge("/api/suite-history/prefs");
    assert.equal(p2.accountEpoch, 2);
    assert.equal(p2.lastAccountEmail, "user2@example.com");
  } finally {
    ext.closeBridge();
    if (prevAppDir === undefined) delete process.env.ANTIGRAVITY_APP_DATA_DIR;
    else process.env.ANTIGRAVITY_APP_DATA_DIR = prevAppDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
