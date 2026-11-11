import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const API_PREFIX = "/api";
const MAX_BODY_BYTES = 1024 * 1024;
const ROLES = new Set(["owner", "admin", "manager", "cashier"]);

function getConfig() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw Object.assign(new Error("Server configuration is incomplete. Set the Supabase environment variables."), { status: 503 });
  }
  return {
    url: SUPABASE_URL.replace(/\/+$/, ""),
    anon: SUPABASE_ANON_KEY,
    service: SUPABASE_SERVICE_ROLE_KEY
  };
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function getCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(part => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function setSessionCookies(res, session) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const accessMaxAge = Math.max(60, Number(session.expires_in) || 3600);
  const refreshMaxAge = Math.max(accessMaxAge, Number(session.refresh_expires_in) || 2592000);
  res.setHeader("Set-Cookie", [
    `fp_access=${encodeURIComponent(session.access_token)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${accessMaxAge}${secure}`,
    `fp_refresh=${encodeURIComponent(session.refresh_token)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${refreshMaxAge}${secure}`
  ]);
}

function clearSessionCookies(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `fp_access=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
    `fp_refresh=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  ]);
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    throw Object.assign(new Error("Cross-origin request rejected."), { status: 403 });
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    throw Object.assign(new Error("Cross-origin request rejected."), { status: 403 });
  }
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  if (!raw.length) return { raw, value: {} };
  try {
    return { raw, value: JSON.parse(raw.toString("utf8")) };
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

async function request(path, { method = "GET", body, token, anon = false, headers = {} } = {}) {
  const cfg = getConfig();
  const response = await fetch(`${cfg.url}${path}`, {
    method,
    headers: {
      apikey: anon ? cfg.anon : cfg.service,
      Authorization: `Bearer ${token || (anon ? cfg.anon : cfg.service)}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.hint || data?.details || "The backend request failed.");
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, { method: "POST", body });
const authRequest = (path, body, token) => request(`/auth/v1/${path}`, { method: "POST", body, token, anon: true });

async function authenticatedUser(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || getCookies(req).fp_access;
  if (!token) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  const user = await request("/auth/v1/user", { token, anon: true });
  if (!user?.id || !user.email) throw Object.assign(new Error("Your session is invalid. Sign in again."), { status: 401 });
  return { user, token };
}

async function requireBranch(userId, branchId, roles = ROLES) {
  if (!branchId) throw Object.assign(new Error("Select a pharmacy branch."), { status: 400 });
  if (!validUuid(branchId)) throw Object.assign(new Error("Select a valid pharmacy branch."), { status: 400 });
  const role = await rpc("get_branch_role", { p_user_id: userId, p_branch_id: branchId });
  if (!roles.has(role)) throw Object.assign(new Error("You do not have permission to access this branch or action."), { status: 403 });
  return role;
}

function validUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requiredText(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw Object.assign(new Error(`${label} is required and must be at most ${max} characters.`), { status: 400 });
  }
  return value.trim();
}

function productInput(body) {
  const sellingPrice = Number(body.selling_price);
  const cost = Number(body.unit_cost);
  const min = Number(body.min_stock);
  const openingQuantity = Number(body.opening_quantity);
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0 ||
      !Number.isFinite(cost) || cost < 0 ||
      !Number.isInteger(min) || min < 0 ||
      !Number.isInteger(openingQuantity) || openingQuantity < 0) {
    throw Object.assign(new Error("Enter valid prices and whole-number stock values."), { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.expires_on || "") ||
      Number.isNaN(Date.parse(`${body.expires_on}T00:00:00Z`)) ||
      new Date(`${body.expires_on}T00:00:00Z`).toISOString().slice(0, 10) !== body.expires_on) {
    throw Object.assign(new Error("Enter a valid expiry date."), { status: 400 });
  }
  return {
    sku: requiredText(body.sku, "SKU", 80),
    name: requiredText(body.name, "Product name", 200),
    generic: String(body.generic || "").trim().slice(0, 200),
    category: String(body.category || "General").trim().slice(0, 100),
    sellingPrice, cost, min, openingQuantity,
    expiresOn: body.expires_on,
    prescriptionOnly: body.prescription_only === true
  };
}

async function createSale(user, branchId, body, paymentMethod) {
  await requireBranch(user.id, branchId);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw Object.assign(new Error("A sale must contain between 1 and 100 products."), { status: 400 });
  }
  const items = body.items.map(item => {
    if (!validUuid(item.product_id) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw Object.assign(new Error("Each sale item needs a valid product and a whole-number quantity."), { status: 400 });
    }
    return { product_id: item.product_id, quantity: item.quantity };
  });
  const discount = Number(body.discount_percent || 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw Object.assign(new Error("Discount must be between 0 and 100 percent."), { status: 400 });
  }
  const key = body.idempotency_key || randomUUID();
  if (!validUuid(key)) throw Object.assign(new Error("Invalid checkout request identifier."), { status: 400 });
  const tendered = paymentMethod === "cash" ? Number(body.tendered) : null;
  if (paymentMethod === "cash" && (!Number.isFinite(tendered) || tendered < 0)) {
    throw Object.assign(new Error("Enter a valid cash amount received."), { status: 400 });
  }
  const patient = String(body.patient_name || "").trim().slice(0, 160);
  const prescriber = String(body.prescriber || "").trim().slice(0, 160);
  return rpc("create_sale", {
    p_user_id: user.id,
    p_branch_id: branchId,
    p_items: items,
    p_discount_percent: discount,
    p_payment_method: paymentMethod,
    p_tendered: tendered,
    p_patient_name: patient,
    p_prescriber: prescriber,
    p_idempotency_key: key,
    p_paystack_reference: paymentMethod === "cash" ? null : key
  });
}

async function paystackVerify(reference) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw Object.assign(new Error("Paystack is not configured on the server."), { status: 503 });
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const result = await response.json();
  if (!response.ok || !result.status || !result.data) {
    throw Object.assign(new Error("Paystack could not verify this transaction."), { status: 502 });
  }
  return result.data;
}

async function confirmPayment(reference) {
  const result = await paystackVerify(reference);
  if (result.reference !== reference || !Number.isSafeInteger(Number(result.amount)) ||
      !result.id || typeof result.currency !== "string") {
    throw Object.assign(new Error("Paystack returned transaction details that do not match this checkout."), { status: 502 });
  }
  if (result.status === "failed" || result.status === "abandoned") {
    await rpc("release_paystack_payment", { p_reference: reference, p_reason: `Paystack status: ${result.status}` });
    return { status: "payment_failed" };
  }
  if (result.status !== "success") return { status: "pending_payment" };
  return rpc("confirm_paystack_payment", {
    p_reference: reference,
    p_transaction_id: String(result.id),
    p_amount_minor: Number(result.amount),
    p_currency: String(result.currency)
  });
}

async function route(req, res, url, path, body, rawBody) {
  const method = req.method || "GET";
  if (path === "/config" && method === "GET") {
    return send(res, 200, { currency: "GHS", paystackEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY) });
  }
  if (path === "/auth/login" && method === "POST") {
    assertSameOrigin(req);
    const email = requiredText(body.email, "Email", 254).toLowerCase();
    if (typeof body.password !== "string" || !body.password.length || body.password.length > 256) {
      throw Object.assign(new Error("Enter a password of at most 256 characters."), { status: 400 });
    }
    const password = body.password;
    const session = await authRequest("token?grant_type=password", { email, password });
    setSessionCookies(res, session);
    return send(res, 200, { user: { id: session.user.id, email: session.user.email }, expires_in: session.expires_in });
  }
  if (path === "/auth/refresh" && method === "POST") {
    assertSameOrigin(req);
    const refreshToken = getCookies(req).fp_refresh;
    if (!refreshToken) throw Object.assign(new Error("Your session expired. Sign in again."), { status: 401 });
    const session = await authRequest("token?grant_type=refresh_token", { refresh_token: refreshToken });
    setSessionCookies(res, session);
    return send(res, 200, { refreshed: true });
  }
  if (path === "/auth/recovery" && method === "POST") {
    assertSameOrigin(req);
    const email = requiredText(body.email, "Email", 254).toLowerCase();
    await authRequest("recover", { email, redirect_to: process.env.APP_URL });
    return send(res, 200, { message: "If the account exists, a password recovery email will be sent." });
  }
  if (path === "/auth/password" && method === "POST") {
    assertSameOrigin(req);
    const accessToken = requiredText(body.access_token, "Recovery token", 4096);
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 256) {
      throw Object.assign(new Error("Password must be between 8 and 256 characters."), { status: 400 });
    }
    await request("/auth/v1/user", { method: "PUT", body: { password: body.password }, token: accessToken, anon: true });
    return send(res, 200, { password_updated: true });
  }
  if (path === "/auth/logout" && method === "POST") {
    assertSameOrigin(req);
    const token = getCookies(req).fp_access;
    try {
      if (token) await request("/auth/v1/logout", { method: "POST", token, anon: true });
    } finally { clearSessionCookies(res); }
    return send(res, 200, { logged_out: true });
  }

  if (path === "/payments/webhook" && method === "POST") {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers["x-paystack-signature"];
    if (!secret || typeof signature !== "string") return send(res, 401, { error: "Invalid webhook signature." });
    const expected = createHmac("sha512", secret).update(rawBody).digest();
    let received;
    try { received = Buffer.from(signature, "hex"); } catch { return send(res, 401, { error: "Invalid webhook signature." }); }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return send(res, 401, { error: "Invalid webhook signature." });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    if (event.event === "charge.success" && typeof event.data?.reference === "string") {
      await confirmPayment(event.data.reference);
    }
    return send(res, 200, { received: true });
  }

  if (method !== "GET" && path !== "/cron/expire-payments") assertSameOrigin(req);
  if (path === "/cron/expire-payments" && method === "GET") {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return send(res, 401, { error: "Unauthorized." });
    }
    return send(res, 200, { expired: await rpc("expire_pending_payments", {}) });
  }

  const { user } = await authenticatedUser(req);
  if (path === "/me" && method === "GET") {
    const branches = await rpc("get_my_branches", { p_user_id: user.id });
    return send(res, 200, { user: { id: user.id, email: user.email }, branches });
  }
  if (path === "/setup" && method === "POST") {
    const allowedEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    if (!allowedEmail || user.email.toLowerCase() !== allowedEmail) {
      return send(res, 403, { error: "This account is not permitted to initialize pharmacy setup." });
    }
    const result = await rpc("bootstrap_first_owner", {
      p_user_id: user.id, p_email: user.email,
      p_organization_name: requiredText(body.organization_name, "Pharmacy name", 120),
      p_branch_name: requiredText(body.branch_name, "First branch name", 120)
    });
    return send(res, 201, result);
  }
  if (path === "/branches" && method === "GET") {
    return send(res, 200, { branches: await rpc("get_my_branches", { p_user_id: user.id }) });
  }
  if (path === "/branches" && method === "POST") {
    const result = await rpc("create_branch", {
      p_user_id: user.id, p_branch_name: requiredText(body.name, "Branch name", 120),
      p_code: requiredText(body.code, "Branch code", 24)
    });
    return send(res, 201, result);
  }
  if (path === "/staff/invite" && method === "POST") {
    const branchIds = body.branch_ids;
    if (!Array.isArray(branchIds) || !branchIds.length || branchIds.some(id => !validUuid(id))) {
      throw Object.assign(new Error("Select one or more valid branches."), { status: 400 });
    }
    await requireBranch(user.id, branchIds[0], new Set(["owner", "admin"]));
    const role = body.role;
    if (!["admin", "manager", "cashier"].includes(role)) throw Object.assign(new Error("Invalid staff role."), { status: 400 });
    const email = requiredText(body.email, "Staff email", 254).toLowerCase();
    const invitation = await request("/auth/v1/invite", {
      method: "POST",
      body: { email, data: { full_name: String(body.full_name || "").trim().slice(0, 120) } }
    });
    await rpc("invite_staff_membership", { p_actor_id: user.id, p_new_user_id: invitation.id, p_branch_ids: branchIds, p_role: role });
    return send(res, 201, { invited: true, email });
  }

  const branchId = url.searchParams.get("branch_id") || body.branch_id;
  if (path === "/products" && method === "GET") {
    await requireBranch(user.id, branchId);
    return send(res, 200, { products: await rpc("get_branch_products", { p_user_id: user.id, p_branch_id: branchId }) });
  }
  if (path === "/products" && method === "POST") {
    await requireBranch(user.id, branchId, new Set(["owner", "admin", "manager"]));
    const product = productInput(body);
    const result = await rpc("create_product", {
      p_user_id: user.id, p_branch_id: branchId, p_sku: product.sku, p_name: product.name,
      p_generic: product.generic, p_category: product.category, p_selling_price: product.sellingPrice,
      p_min_stock: product.min, p_prescription_only: product.prescriptionOnly,
      p_opening_quantity: product.openingQuantity, p_unit_cost: product.cost, p_expires_on: product.expiresOn
    });
    return send(res, 201, result);
  }
  const productMatch = path.match(/^\/products\/([0-9a-f-]+)$/i);
  if (productMatch && method === "PATCH") {
    if (!validUuid(productMatch[1])) throw Object.assign(new Error("Invalid product identifier."), { status: 400 });
    await requireBranch(user.id, branchId, new Set(["owner", "admin", "manager"]));
    const product = productInput({ ...body, opening_quantity: Number.isInteger(body.opening_quantity) ? body.opening_quantity : 0,
      expires_on: body.expires_on || "2000-01-01" });
    await rpc("update_product", {
      p_user_id: user.id, p_branch_id: branchId, p_product_id: productMatch[1],
      p_sku: product.sku, p_name: product.name, p_generic: product.generic, p_category: product.category,
      p_selling_price: product.sellingPrice, p_min_stock: product.min, p_prescription_only: product.prescriptionOnly
    });
    return send(res, 200, { updated: true });
  }
  if (productMatch && method === "DELETE") {
    if (!validUuid(productMatch[1])) throw Object.assign(new Error("Invalid product identifier."), { status: 400 });
    await requireBranch(user.id, branchId, new Set(["owner", "admin", "manager"]));
    await rpc("deactivate_product", { p_user_id: user.id, p_branch_id: branchId, p_product_id: productMatch[1] });
    return send(res, 200, { deactivated: true });
  }
  if (path === "/stock/receive" && method === "POST") {
    await requireBranch(user.id, branchId, new Set(["owner", "admin", "manager"]));
    if (!validUuid(body.product_id)) throw Object.assign(new Error("Select a valid product."), { status: 400 });
    const quantity = Number(body.quantity), unitCost = Number(body.unit_cost);
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      throw Object.assign(new Error("Enter a positive whole-number quantity and valid unit cost."), { status: 400 });
    }
    const expiresOn = body.expires_on;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn || "") ||
        Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`)) ||
        new Date(`${expiresOn}T00:00:00Z`).toISOString().slice(0, 10) !== expiresOn) {
      throw Object.assign(new Error("Enter a valid expiry date."), { status: 400 });
    }
    return send(res, 201, await rpc("receive_stock", {
      p_user_id: user.id, p_branch_id: branchId, p_product_id: body.product_id,
      p_quantity: quantity, p_unit_cost: unitCost, p_expires_on: expiresOn,
      p_batch_number: String(body.batch_number || "").trim().slice(0, 80)
    }));
  }
  if (path === "/sales" && method === "GET") {
    await requireBranch(user.id, branchId);
    const [sales, summary] = await Promise.all([
      rpc("get_branch_sales", { p_user_id: user.id, p_branch_id: branchId }),
      rpc("get_branch_sales_summary", { p_user_id: user.id, p_branch_id: branchId })
    ]);
    return send(res, 200, { sales, summary });
  }
  if (path === "/sales" && method === "POST") {
    const sale = await createSale(user, branchId, body, "cash");
    return send(res, 201, { sale });
  }
  if (path === "/payments/initialize" && method === "POST") {
    if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error("Paystack has not been configured."), { status: 503 });
    if (!["card", "mobile_money"].includes(body.payment_method)) throw Object.assign(new Error("Choose card or mobile money for Paystack."), { status: 400 });
    const sale = await createSale(user, branchId, body, body.payment_method);
    if (sale.status === "completed") return send(res, 200, { sale });
    if (sale.status !== "pending_payment") {
      throw Object.assign(new Error("This payment checkout is no longer active. Start a new checkout."), { status: 409 });
    }
    if (sale.payment_url) return send(res, 200, { sale, authorization_url: sale.payment_url });
    let appUrl;
    try { appUrl = new URL(process.env.APP_URL || url.origin); }
    catch { throw Object.assign(new Error("APP_URL must be a valid absolute URL."), { status: 503 }); }
    if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") {
      throw Object.assign(new Error("APP_URL must use HTTPS in production."), { status: 503 });
    }
    const payment = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(Number(sale.total) * 100),
        currency: "GHS",
        channels: [body.payment_method === "card" ? "card" : "mobile_money"],
        reference: sale.reference,
        callback_url: `${appUrl.origin}/?payment=paystack`
      })
    });
    const result = await payment.json();
    if (!payment.ok || !result.status || !result.data?.authorization_url) {
      await rpc("release_paystack_payment", { p_reference: sale.reference, p_reason: "Paystack initialization failed" });
      throw Object.assign(new Error(result.message || "Paystack could not start this payment."), { status: 502 });
    }
    let authorizationUrl;
    try { authorizationUrl = new URL(result.data.authorization_url); }
    catch { throw Object.assign(new Error("Paystack returned an invalid checkout link."), { status: 502 }); }
    if (authorizationUrl.protocol !== "https:" || !authorizationUrl.hostname.endsWith(".paystack.com")) {
      throw Object.assign(new Error("Paystack returned an untrusted checkout link."), { status: 502 });
    }
    await rpc("set_payment_url", { p_reference: sale.reference, p_payment_url: authorizationUrl.href });
    return send(res, 200, { sale, authorization_url: authorizationUrl.href });
  }
  if (path === "/payments/verify" && method === "GET") {
    const reference = requiredText(url.searchParams.get("reference"), "Payment reference", 128);
    const rows = await request(`/rest/v1/sales?paystack_reference=eq.${encodeURIComponent(reference)}&select=id,branch_id,status,receipt_number,total&limit=1`);
    const sale = rows?.[0];
    if (!sale) throw Object.assign(new Error("Payment reference not found."), { status: 404 });
    await requireBranch(user.id, sale.branch_id);
    return send(res, 200, await confirmPayment(reference));
  }
  if (path === "/activity" && method === "GET") {
    await requireBranch(user.id, branchId);
    return send(res, 200, { activity: await rpc("get_branch_activity", { p_user_id: user.id, p_branch_id: branchId }) });
  }

  return send(res, 404, { error: "API endpoint not found." });
}

export default async function handler(req, res) {
  let rawBody = Buffer.alloc(0);
  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
    const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) || "/" : url.pathname;
    const parsed = req.method === "GET" || req.method === "HEAD" ? { value: {}, raw: rawBody } : await readBody(req);
    rawBody = parsed.raw;
    return await route(req, res, url, path, parsed.value, rawBody);
  } catch (error) {
    console.error("API request failed:", error.message);
    const status = Number.isInteger(error.status) ? error.status : 500;
    return send(res, status, { error: status >= 500 ? (status === 503 ? error.message : "The request could not be completed.") : error.message });
  }
}

export const config = { api: { bodyParser: false } };
