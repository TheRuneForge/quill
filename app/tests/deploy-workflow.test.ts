import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
);
const configuredJob = workflow.split("\\n  deploy:")[0];

test("Deploy requires token, account ID, and public host before starting", () => {
  assert.ok(configuredJob.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"));
  assert.ok(configuredJob.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"));
  assert.ok(configuredJob.includes("PUBLIC_HOST: ${{ secrets.PUBLIC_HOST }}"));
  assert.ok(configuredJob.includes(
    'if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ] && [ -n "$PUBLIC_HOST" ]; then',
  ));
});
