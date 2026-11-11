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

test("staff creation generates a temporary password, confirms the account, and assigns branch access", async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const supabaseUrl = "https://supabase.example";
  const actorId = "11111111-1111-4111-8111-111111111111";
  const staffId = "22222222-2222-4222-8222-222222222222";
  const branchId = "33333333-3333-4333-8333-333333333333";
  let createBody;
  let membershipBody;
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.origin !== supabaseUrl) return originalFetch(input, options);
    if (url.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: actorId, email: "owner@example.com" }), { status: 200 });
    }
    if (url.pathname === "/rest/v1/rpc/get_branch_role") {
      return new Response(JSON.stringify("owner"), { status: 200 });
    }
    if (url.pathname === "/auth/v1/admin/users" && options.method === "POST") {
      createBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: staffId }), { status: 200 });
    }
    if (url.pathname === "/rest/v1/rpc/create_staff_membership") {
      membershipBody = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected mocked Supabase route: ${url.pathname} ${options.method || "GET"}`);
  };

  try {
    const response = await originalFetch(`${baseUrl}/api/staff/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
        Cookie: "fp_access=test-token"
      },
      body: JSON.stringify({ email: "staff@example.com", role: "cashier", branch_ids: [branchId] })
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.created, true);
    assert.equal(result.email, "staff@example.com");
    assert.equal(typeof result.temporary_password, "string");
    assert.ok(result.temporary_password.length >= 24);
    assert.equal(createBody.email, "staff@example.com");
    assert.equal(createBody.email_confirm, true);
    assert.equal(createBody.password, result.temporary_password);
    assert.deepEqual(createBody.app_metadata, { must_change_password: true });
    assert.deepEqual(membershipBody, {
      p_actor_id: actorId,
      p_new_user_id: staffId,
      p_branch_ids: [branchId],
      p_role: "cashier"
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("temporary-password accounts cannot access workspace until they change their password", async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const supabaseUrl = "https://supabase.example";
  const staffId = "22222222-2222-4222-8222-222222222222";
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.origin !== supabaseUrl) return originalFetch(input, options);
    if (url.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({
        id: staffId, email: "staff@example.com", app_metadata: { must_change_password: true }
      }), { status: 200 });
    }
    throw new Error(`Unexpected mocked Supabase route: ${url.pathname}`);
  };

  try {
    const me = await originalFetch(`${baseUrl}/api/me`, {
      headers: { Cookie: "fp_access=test-token" }
    });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      user: { id: staffId, email: "staff@example.com", must_change_password: true },
      branches: []
    });

    const blocked = await originalFetch(`${baseUrl}/api/branches`, {
      headers: { Cookie: "fp_access=test-token" }
    });
    assert.equal(blocked.status, 403);
    assert.match((await blocked.json()).error, /Set a new password/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("changing a temporary password removes the server-side reset requirement", async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const supabaseUrl = "https://supabase.example";
  const staffId = "22222222-2222-4222-8222-222222222222";
  let updatedMetadata;
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.origin !== supabaseUrl) return originalFetch(input, options);
    if (url.pathname === "/auth/v1/user" && options.method === "GET") {
      return new Response(JSON.stringify({
        id: staffId, email: "staff@example.com", app_metadata: { must_change_password: true }
      }), { status: 200 });
    }
    if (url.pathname === "/auth/v1/user" && options.method === "PUT") {
      return new Response(JSON.stringify({ id: staffId }), { status: 200 });
    }
    if (url.pathname === `/auth/v1/admin/users/${staffId}` && options.method === "PUT") {
      updatedMetadata = JSON.parse(options.body).app_metadata;
      return new Response(JSON.stringify({ id: staffId }), { status: 200 });
    }
    throw new Error(`Unexpected mocked Supabase route: ${url.pathname} ${options.method || "GET"}`);
  };

  try {
    const response = await originalFetch(`${baseUrl}/api/auth/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
        Cookie: "fp_access=test-token"
      },
      body: JSON.stringify({ password: "A-new-strong-password" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { password_updated: true });
    assert.deepEqual(updatedMetadata, {});
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
