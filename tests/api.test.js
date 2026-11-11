import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import handler from "../api/[...path].js";

const server = createServer(handler);
let baseUrl;

before(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("public configuration omits secrets", async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { currency: "GHS", paystackEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY) });
});

test("workspace access requires a session", async () => {
  const response = await fetch(`${baseUrl}/api/me`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Sign in to continue.");
});

test("mutating auth requests reject cross-origin origins", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ email: "person@example.com", password: "example-password" })
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "Cross-origin request rejected.");
});

test("malformed request bodies return a client error", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Request body must be valid JSON.");
});
