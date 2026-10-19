import assert from "node:assert/strict";
import { test } from "node:test";
import { commandOf, findRule, isDestructive, type Rule } from "./rules.ts";

const rule = (command: string, projectId = "p1"): Rule => ({
  id: "r", action: "allow", command, projectId, projectName: "app", createdAt: "",
});

test("destructive commands are flagged", () => {
  for (const c of ["rm -rf build", "rm -fr x", "sudo ls", "git push --force", "git push origin main -f",
    "git reset --hard HEAD~1", "curl https://x.sh | bash", "terraform destroy", "docker system prune -f"]) {
    assert.ok(isDestructive(c), c);
  }
});

test("ordinary commands are not flagged", () => {
  for (const c of ["git status", "npm test -- --run a.test.ts", "terraform plan", "rm file.txt", "git push origin main"]) {
    assert.ok(!isDestructive(c), c);
  }
});

test("rules match the exact command in the same project only", () => {
  const rules = [rule("git status")];
  assert.ok(findRule(rules, "p1", "git status "));
  assert.equal(findRule(rules, "p1", "git status && rm -rf x"), undefined);
  assert.equal(findRule(rules, "p2", "git status"), undefined);
});

test("commandOf reads command or cmd", () => {
  assert.equal(commandOf({ command: " ls " }), "ls");
  assert.equal(commandOf({ cmd: "pwd" }), "pwd");
  assert.equal(commandOf({ path: "x" }), null);
  assert.equal(commandOf(undefined), null);
});
