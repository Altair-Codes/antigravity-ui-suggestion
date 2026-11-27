import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseOutlineFromText, extractFileOutline } from "../plugins/gravity-explorer/sidecars/panel/explorer-core.mjs";

test("parseOutlineFromText handles JS/ESM, Sidecar API routes, and CRLF line endings", () => {
  const jsSrc = [
    "import fs from 'node:fs';",
    "",
    "export function helperFn(a) {",
    "  const x = a + 1;",
    "  return x;",
    "}",
    "",
    "class DemoService {",
    "  run() { return true; }",
    "}",
    "",
    "app.api('/api/outline', (data) => {",
    "  return { ok: true };",
    "});"
  ].join("\r\n");

  const res = parseOutlineFromText(jsSrc, ".mjs");
  assert.equal(res.totalLines, 14);
  assert.deepEqual(
    res.items.map((x) => [x.kind, x.name, x.lineStart, x.lineEnd]),
    [
      ["fn", "helperFn", 3, 6],
      ["class", "DemoService", 8, 10],
      ["api", "/api/outline", 12, 14]
    ]
  );
});

test("parseOutlineFromText handles Markdown headings and skips fenced code blocks", () => {
  const md = [
    "# 一级标题",
    "正文",
    "```bash",
    "# 这不是标题",
    "## 这也不是标题",
    "```",
    "## 二级标题 A",
    "内容 A",
    "### 三级标题 A1",
    "## 二级标题 B",
    "内容 B"
  ].join("\n");

  const res = parseOutlineFromText(md, ".md");
  assert.deepEqual(
    res.items.map((x) => [x.kind, x.name, x.lineStart, x.lineEnd]),
    [
      ["H1", "一级标题", 1, 11],
      ["H2", "二级标题 A", 7, 9],
      ["H3", "三级标题 A1", 9, 9],
      ["H2", "二级标题 B", 10, 11]
    ]
  );
});

test("parseOutlineFromText supports Python and Go outlines", () => {
  const py = [
    "class Worker:",
    "    def run(self):",
    "        return 1",
    "",
    "async def main():",
    "    pass"
  ].join("\n");
  const pyRes = parseOutlineFromText(py, ".py");
  assert.deepEqual(
    pyRes.items.map((x) => [x.kind, x.name, x.lineStart, x.lineEnd]),
    [
      ["class", "Worker", 1, 3],
      ["def", "run", 2, 3],
      ["def", "main", 5, 6]
    ]
  );

  const go = [
    "type Config struct {",
    "  Port int",
    "}",
    "",
    "func (c *Config) Start() {",
    "  println(c.Port)",
    "}"
  ].join("\n");
  const goRes = parseOutlineFromText(go, ".go");
  assert.deepEqual(
    goRes.items.map((x) => [x.kind, x.name, x.lineStart, x.lineEnd]),
    [
      ["struct", "Config", 1, 3],
      ["func", "Start", 5, 7]
    ]
  );
});

test("extractFileOutline uses mtime cache and rejects workspace escape", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ag-outline-test-"));
  try {
    const f = path.join(tmp, "sample.js");
    fs.writeFileSync(f, "function alpha() {\n  return 1;\n}\n", "utf8");

    const r1 = extractFileOutline({ root: tmp, path: "sample.js" });
    assert.equal(r1.ok, true);
    assert.equal(r1.cacheHit, false);
    assert.equal(r1.items.length, 1);

    const r2 = extractFileOutline({ root: tmp, path: "sample.js" });
    assert.equal(r2.cacheHit, true);

    const escRes = extractFileOutline({ root: tmp, path: "../../etc/passwd" });
    assert.equal(escRes.ok, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
