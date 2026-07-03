// Simple approach: use the OAuth token with the Anthropic API
// Reads rate-limit headers from a minimal request
// Cost: ~$0.00001 per check (one hundred-thousandth of a cent)

import { readFileSync } from "fs";
import { join } from "path";
import https from "https";

const home = process.env.USERPROFILE || process.env.HOME || "";
const credsPath = join(home, ".claude", ".credentials.json");

try {
  const creds = JSON.parse(readFileSync(credsPath, "utf-8"));
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) throw new Error("No access token");

  const body = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1,
    messages: [{ role: "user", content: "h" }],
  });

  const req = https.request(
    {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    },
    (res) => {
      const h = res.headers;
      const result = {
        five_hour: {
          utilization: Math.round((parseFloat(h["anthropic-ratelimit-unified-5h-utilization"]) || 0) * 100),
          resets_at: h["anthropic-ratelimit-unified-5h-reset"] || "",
        },
        seven_day: {
          utilization: Math.round((parseFloat(h["anthropic-ratelimit-unified-7d-utilization"]) || 0) * 100),
          resets_at: h["anthropic-ratelimit-unified-7d-reset"] || "",
        },
        seven_day_sonnet: { utilization: 0, resets_at: "" },
      };
      console.log(JSON.stringify(result));
      res.resume();
    }
  );

  req.on("error", (e) => {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  });

  req.write(body);
  req.end();
} catch (e) {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
}
