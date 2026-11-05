import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const hook = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "hooks", "update-skills-on-stop.mjs");

function runHook(cwd, env) {
  const output = execFileSync(process.execPath, [hook], {
    cwd,
    env,
    input: JSON.stringify({ status: "completed", loop_count: 0 }),
    encoding: "utf8",
  });
  return JSON.parse(output);
}

test("reports changed files whose names git would quote", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "skills-on-stop-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  // Use git's defaults (core.quotePath=true) regardless of the user's config.
  const env = { ...process.env, HOME: repo, XDG_CONFIG_HOME: repo, GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", args, { cwd: repo, env, stdio: "ignore" });

  git("init", "-q");
  mkdirSync(join(repo, "src", "components"), { recursive: true });
  writeFileSync(join(repo, "src", "components", "Café.tsx"), "export {};\n");
  git("add", "-A");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "init");

  appendFileSync(join(repo, "src", "components", "Café.tsx"), "// edited\n");
  writeFileSync(join(repo, "src", "components", "Ünïcode.tsx"), "export {};\n");
  if (process.platform !== "win32") {
    writeFileSync(join(repo, "src", "components", 'Say "hi".tsx'), "export {};\n");
  }

  const result = runHook(repo, env);
  assert.ok(result.followup_message, "expected a follow-up message");
  assert.match(result.followup_message, /^- src\/components\/Café\.tsx$/m);
  assert.match(result.followup_message, /^- src\/components\/Ünïcode\.tsx$/m);
  if (process.platform !== "win32") {
    assert.match(result.followup_message, /^- src\/components\/Say "hi"\.tsx$/m);
  }
});

test("reports plain changed files", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "skills-on-stop-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const env = { ...process.env, HOME: repo, XDG_CONFIG_HOME: repo, GIT_CONFIG_NOSYSTEM: "1" };
  execFileSync("git", ["init", "-q"], { cwd: repo, env, stdio: "ignore" });
  mkdirSync(join(repo, "prisma"), { recursive: true });
  writeFileSync(join(repo, "prisma", "schema.prisma"), "\n");

  const result = runHook(repo, env);
  assert.match(result.followup_message, /^- prisma\/schema\.prisma$/m);
});
