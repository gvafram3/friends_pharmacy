
const CUR = "GH₵"; // Ghana cedi symbol
const TAX = 0;   // tax rate in %, e.g. 5
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => CUR + (+n).toFixed(2);
const dayOff = d => { const t = new Date(); t.setDate(t.getDate() + d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const today = () => dayOff(0);
const daysLeft = e => Math.ceil((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5);
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const uid = () => Math.random().toString(36).slice(2, 9);

const seed = () => [
["Paracetamol 500mg (strip)","Paracetamol","Pain",3,1.5,300,60,400,0],
["Paracetamol Syrup 60ml","Paracetamol","Pain",12,7,60,15,300,0],
["Ibuprofen 400mg","Ibuprofen","Pain",6,3.2,150,30,300,0],
["Diclofenac 50mg","Diclofenac","Pain",7,3.8,120,30,420,0],
["Diclofenac Gel 30g","Diclofenac","Pain",25,15,30,8,500,0],
["Aspirin 75mg","Aspirin","Pain",5,2.5,100,25,450,0],
["Tramadol 50mg","Tramadol","Pain",15,8,40,10,380,1],
["Amoxicillin 500mg","Amoxicillin","Antibiotic",15,8.5,140,30,450,1],
["Amoxicillin/Clavulanate 625mg","Co-amoxiclav","Antibiotic",35,20,60,15,400,1],
["Azithromycin 500mg","Azithromycin","Antibiotic",30,17,45,12,360,1],
["Ciprofloxacin 500mg","Ciprofloxacin","Antibiotic",18,10,12,20,250,1],
["Metronidazole 400mg","Metronidazole","Antibiotic",8,4,160,30,500,1],
["Cefuroxime 500mg","Cefuroxime","Antibiotic",45,27,35,10,420,1],
["Doxycycline 100mg","Doxycycline","Antibiotic",10,5.5,90,20,480,1],
["Cotrimoxazole 480mg","Cotrimoxazole","Antibiotic",6,3,110,25,520,1],
["Flucloxacillin 500mg","Flucloxacillin","Antibiotic",22,12,50,12,300,1],
["Artemether/Lumefantrine 80/480","Antimalarial","Antimalarial",25,14,90,25,420,1],
["Artesunate/Amodiaquine","Antimalarial","Antimalarial",22,12,70,20,380,1],
["Dihydroartemisinin/Piperaquine","Antimalarial","Antimalarial",35,20,40,10,450,1],
["Sulfadoxine/Pyrimethamine","SP","Antimalarial",8,4,60,15,560,1],
["Malaria Rapid Test Kit","RDT","Antimalarial",10,6,80,20,600,0],
["Metformin 500mg","Metformin","Diabetes",10,5.5,150,40,600,1],
["Glibenclamide 5mg","Glibenclamide","Diabetes",6,3,100,25,540,1],
["Gliclazide 80mg","Gliclazide","Diabetes",14,8,70,20,480,1],
["Insulin (Mixtard 30) 10ml","Insulin","Diabetes",90,65,20,6,150,1],
["Glucometer Test Strips (50)","Test strips","Diabetes",85,55,25,6,320,0],
["Amlodipine 5mg","Amlodipine","Heart",8,4,90,30,450,1],
["Lisinopril 10mg","Lisinopril","Heart",10,5.5,80,25,500,1],
["Losartan 50mg","Losartan","Heart",14,8,75,20,520,1],
["Atenolol 50mg","Atenolol","Heart",7,3.5,85,20,470,1],
["Hydrochlorothiazide 25mg","HCTZ","Heart",6,3,60,15,560,1],
["Atorvastatin 20mg","Atorvastatin","Heart",20,11,70,20,430,1],
["Nifedipine 20mg","Nifedipine","Heart",9,5,55,15,410,1],
["Cetirizine 10mg","Cetirizine","Allergy",5,2.5,7,20,200,0],
["Loratadine 10mg","Loratadine","Allergy",6,3,60,20,18,0],
["Chlorpheniramine 4mg","Chlorpheniramine","Allergy",3,1.5,120,30,600,0],
["Promethazine 25mg","Promethazine","Allergy",6,3.2,50,15,420,0],
["Omeprazole 20mg","Omeprazole","Stomach",10,5.5,110,30,380,0],
["Ranitidine 150mg","Ranitidine","Stomach",6,3,60,20,300,0],
["Antacid Tablets (strip)","Aluminium/Magnesium","Stomach",3,1.5,150,40,650,0],
["Oral Rehydration Salts","ORS","Stomach",2.5,1.2,220,50,700,0],
["Loperamide 2mg","Loperamide","Stomach",5,2.5,80,20,500,0],
["Hyoscine 10mg (Buscopan)","Hyoscine","Stomach",9,5,70,20,440,0],
["Zinc Sulphate 20mg","Zinc","Stomach",4,2,100,25,560,0],
["Bisacodyl 5mg","Bisacodyl","Stomach",4,2,60,15,-6,0],
["Vitamin C 1000mg","Ascorbic acid","Vitamins",15,8,80,20,550,0],
["Multivitamin Tablets (30)","Multivitamin","Vitamins",30,17,60,15,600,0],
["Folic Acid 5mg","Folic acid","Vitamins",3,1.4,150,30,700,0],
["Ferrous Sulphate 200mg","Iron","Vitamins",4,2,130,30,640,0],
["Vitamin B Complex","B complex","Vitamins",8,4,90,20,580,0],
["Calcium + Vitamin D3","Calcium","Vitamins",28,16,45,12,520,0],
["Cough Syrup 100ml","Dextromethorphan","Cough & Cold",18,10,35,15,-6,0],
["Ambroxol Syrup 100ml","Ambroxol","Cough & Cold",20,11,40,12,380,0],
["Salbutamol Inhaler","Salbutamol","Cough & Cold",35,21,25,8,400,1],
["Salbutamol 4mg","Salbutamol","Cough & Cold",5,2.5,60,15,460,1],
["Cold & Flu Tablets (strip)","Paracetamol/Phenylephrine","Cough & Cold",6,3,140,30,500,0],
["Throat Lozenges","Strepsils type","Cough & Cold",8,4.5,90,20,600,0],
["Prednisolone 5mg","Prednisolone","Steroid",8,4,60,15,440,1],
["Hydrocortisone Cream 1%","Hydrocortisone","Skin",14,8,45,12,480,0],
["Clotrimazole Cream","Clotrimazole","Skin",12,6.5,50,12,520,0],
["Fluconazole 150mg","Fluconazole","Skin",15,8,40,10,450,1],
["Calamine Lotion 100ml","Calamine","Skin",10,5.5,30,10,700,0],
["Antiseptic Solution 100ml","Chlorhexidine","First aid",9,5,60,15,800,0],
["Povidone Iodine 60ml","Povidone iodine","First aid",12,7,50,12,700,0],
["Bandage Roll","Bandage","First aid",4,2,120,25,900,0],
["Adhesive Plasters (20)","Plasters","First aid",8,4,80,20,900,0],
["Cotton Wool 100g","Cotton wool","First aid",7,3.5,50,12,900,0],
["Surgical Gloves (box 100)","Gloves","First aid",55,35,20,6,700,0],
["Digital Thermometer","Thermometer","Devices",30,18,20,5,900,0],
["BP Monitor (digital)","BP monitor","Devices",220,150,8,3,900,0],
["Face Masks (box 50)","Masks","Devices",35,20,30,8,700,0],
["Pregnancy Test Strip","hCG test","Sexual health",6,3,100,25,500,0],
["Male Condoms (3 pack)","Condoms","Sexual health",5,2.5,140,30,600,0],
["Emergency Contraceptive 1.5mg","Levonorgestrel","Sexual health",25,14,30,8,480,0],
["Combined Oral Contraceptive","Levonorgestrel/EE","Sexual health",20,11,45,12,520,1],
["Albendazole 400mg","Albendazole","Deworming",6,3,90,20,560,0],
["Mebendazole 100mg","Mebendazole","Deworming",5,2.5,80,20,500,0],
["Eye Drops (Chloramphenicol)","Chloramphenicol","Eye & Ear",14,8,35,10,300,1],
["Ear Drops","Ciprofloxacin","Eye & Ear",18,10,25,8,330,1],
["Baby Diapers (pack)","Diapers","Baby care",45,30,30,8,900,0],
["Infant Formula 400g","Formula","Baby care",75,55,25,6,300,0]
].map((r, i) => ({ id: uid(), sku: "PH" + String(1001 + i), name: r[0], generic: r[1], cat: r[2], price: r[3], cost: r[4], batches: [{ id: uid(), qty: r[5], cost: r[4], exp: dayOff(r[7]) }], min: r[6], rx: !!r[8] }));

let S = { user: null, branches: [], branchId: "", role: "", products: [], sales: [], salesSummary: {}, activity: [], cart: [], tab: "sell", q: "", disc: 0, pay: "Cash", tender: "", patient: "", prescriber: "" };
let publicConfig = { currency: "GHS", paystackEnabled: false };
let requestInFlight = false;
let recoveryToken = "";
let checkoutKey = "";
let checkoutFingerprint = "";
async function api(path, options = {}, retry = true) {
  const response = await fetch(`/api${path}`, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  if (response.status === 401 && retry && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) return api(path, options, false);
    S.user = null;
    S.branches = [];
    render();
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || result.msg || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return result;
}
function vManage() {
  const branches = S.branches.map(branch => `<tr><td>${esc(branch.name)}</td><td>${esc(branch.code || "—")}</td><td>${esc(branch.role)}</td></tr>`).join("");
  return `<div class="manage-grid">
    <section class="card"><h2>Branches</h2><p class="mute">Add a branch to this pharmacy organization.</p>
      <form class="auth-form" onsubmit="createBranch(event)">
        <label>Branch name<input id="branch-name" maxlength="120" required></label>
        <label>Branch code<input id="branch-code" maxlength="24" required></label>
        <button class="btn" type="submit">Add branch</button>
      </form>
      <div class="tbl"><table><tr><th>Branch</th><th>Code</th><th>Your role</th></tr>${branches}</table></div>
    </section>
    <section class="card"><h2>Invite staff</h2><p class="mute">The invitee receives an account setup email.</p>
      <form class="auth-form" onsubmit="inviteStaff(event)">
        <label>Staff email<input id="staff-email" type="email" required></label>
        <label>Role<select id="staff-role"><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
        <fieldset class="branch-checks"><legend>Branch access</legend>${S.branches.map(branch => `<label><input type="checkbox" name="staff-branch" value="${branch.id}" ${branch.id === S.branchId ? "checked" : ""}>${esc(branch.name)}</label>`).join("")}</fieldset>
        <button class="btn" type="submit">Send invitation</button>
      </form>
    </section>
  </div>`;
}
async function createBranch(event) {
  event.preventDefault();
  try {
    await api("/branches", { method: "POST", body: { name: $("#branch-name").value, code: $("#branch-code").value } });
    const workspace = await api("/me");
    S.branches = workspace.branches;
    render();
    toast("Branch created.");
  } catch (error) { toast(error.message); }
}
async function inviteStaff(event) {
  event.preventDefault();
  const branchIds = [...document.querySelectorAll('input[name="staff-branch"]:checked')].map(input => input.value);
  if (!branchIds.length) return toast("Select at least one branch for this staff member.");
  try {
    await api("/staff/invite", { method: "POST", body: {
      email: $("#staff-email").value, role: $("#staff-role").value, branch_ids: branchIds
    } });
    event.target.reset();
    toast("Staff invitation sent.");
  } catch (error) { toast(error.message); }
}
async function login(event) {
  event.preventDefault();
  if (requestInFlight) return;
  requestInFlight = true;
  try {
    await api("/auth/login", { method: "POST", body: { email: $("#login-email").value, password: $("#login-password").value } }, false);
    await loadWorkspace();
  } catch (error) {
    toast(error.message);
  } finally {
    requestInFlight = false;
  }
}
async function recoverPassword(event) {
  event.preventDefault();
  try {
    const result = await api("/auth/recovery", { method: "POST", body: { email: $("#login-email").value } }, false);
    toast(result.message);
  } catch (error) { toast(error.message); }
}
async function logout() {
  try { await api("/auth/logout", { method: "POST" }, false); }
  catch (error) { console.error("Sign-out request failed.", error); }
  S = { user: null, branches: [], branchId: "", role: "", products: [], sales: [], salesSummary: {}, activity: [], cart: [], tab: "sell", q: "", disc: 0, pay: "Cash", tender: "", patient: "", prescriber: "" };
  render();
}
async function loadWorkspace() {
  try {
    const { user, branches } = await api("/me");
    S.user = user;
    S.branches = branches;
    if (!branches.length) {
      S.tab = "setup";
      render();
      return;
    }
    if (!branches.some(branch => branch.id === S.branchId)) S.branchId = branches[0].id;
    await loadBranchData();
    const reference = new URLSearchParams(location.search).get("reference");
    if (reference) {
      const payment = await api(`/payments/verify?reference=${encodeURIComponent(reference)}`);
      history.replaceState(null, "", location.pathname);
      toast(payment.status === "completed" ? `Payment confirmed. Receipt #${payment.receipt_number}.` :
        payment.status === "pending_payment" ? "Payment is still processing. Check Sales again shortly." : "Payment was not completed.");
      await loadBranchData();
    }
  } catch (error) {
    S.user = null;
    S.branches = [];
    if (!error.message.includes("Sign in") && !error.message.includes("session")) toast(error.message);
  }
  render();
}
async function loadBranchData() {
  if (!S.branchId) return;
  const branch = encodeURIComponent(S.branchId);
  const [products, sales, activity] = await Promise.all([
    api(`/products?branch_id=${branch}`), api(`/sales?branch_id=${branch}`), api(`/activity?branch_id=${branch}`)
  ]);
  S.products = products.products.map(product => ({
    ...product, cat: product.category, price: Number(product.price), min: Number(product.min), qty: Number(product.qty),
    available: Number(product.available), batches: product.batches.map(batch => ({
      ...batch, qty: Number(batch.qty), reserved: Number(batch.reserved), available: Number(batch.available), cost: Number(batch.cost)
    }))
  }));
  S.sales = sales.sales.map(sale => ({
    ...sale, no: Number(sale.no), total: Number(sale.total), disc: Number(sale.disc || 0),
    pay: sale.pay === "cash" ? "Cash" : sale.pay === "card" ? "Card" : "Mobile money",
    tender: Number(sale.tender || 0), items: sale.items.map(item => ({
      ...item, qty: Number(item.qty), price: Number(item.price), cost: Number(item.cost || 0)
    }))
  }));
  S.salesSummary = sales.summary;
  S.activity = activity.activity;
  S.role = S.branches.find(item => item.id === S.branchId)?.role || "";
}
async function changeBranch(id) {
  const previousBranchId = S.branchId;
  S.branchId = id;
  S.cart = [];
  S.q = "";
  S.disc = 0;
  S.tender = "";
  try { await loadBranchData(); render(); }
  catch (error) { S.branchId = previousBranchId; render(); toast(error.message); }
}
const toast = m => { const t = $("#toast"); t.textContent = m; t.style.display = "block"; clearTimeout(t._t); t._t = setTimeout(() => t.style.display = "none", 2600); };
const P = id => S.products.find(p => p.id === id);
const quantity = p => p.batches.reduce((sum, b) => sum + b.qty, 0);
const sellable = p => p.available ?? p.batches.filter(b => b.qty > 0 && daysLeft(b.exp) >= 0).reduce((sum, b) => sum + b.available, 0);
const expiredBatches = () => S.products.flatMap(p => p.batches.filter(b => b.qty > 0 && daysLeft(b.exp) < 0).map(b => ({ product: p, batch: b })));
const nearBatches = () => S.products.flatMap(p => p.batches.filter(b => b.qty > 0 && daysLeft(b.exp) >= 0 && daysLeft(b.exp) <= 90).map(b => ({ product: p, batch: b })));
const low = p => sellable(p) <= p.min;
const canManageStock = () => ["owner", "admin", "manager"].includes(S.role);
const alerts = () => expiredBatches().length + nearBatches().length + S.products.filter(low).length;

function totals() {
  const sub = S.cart.reduce((a, l) => a + P(l.id).price * l.qty, 0);
  const d = sub * Math.min(Math.max(+S.disc || 0, 0), 100) / 100;
  const tax = (sub - d) * TAX / 100;
  return { sub, d, tax, total: sub - d + tax };
}

function nav() {
  if (!S.user) { $("#nav").innerHTML = ""; return; }
  const tabs = [["sell", "Sell"], ["stock", "Stock"], ["alerts", "Alerts"], ["sales", "Sales"], ["activity", "Activity"]];
  if (["owner", "admin"].includes(S.role)) tabs.push(["manage", "Manage"]);
  $("#nav").innerHTML = `<select class="branch-picker" aria-label="Pharmacy branch" onchange="changeBranch(this.value)">${S.branches.map(branch => `<option value="${branch.id}" ${branch.id === S.branchId ? "selected" : ""}>${esc(branch.name)}</option>`).join("")}</select>` +
    tabs.map(([k, l]) => `<button class="${S.tab === k ? "on" : ""}" onclick="go('${k}')">${l}${k === "alerts" && alerts() ? `<span class="badge">${alerts()}</span>` : ""}</button>`).join("") +
    `<span class="nav-user">${esc(S.user.email)}</span><button onclick="logout()">Sign out</button>`;
}
const go = t => { S.tab = t; render(); };

function vLogin() {
  return `<section class="card auth-card"><h1>Sign in</h1><p class="mute">Use your pharmacy staff account to access sales and inventory.</p>
    <form class="auth-form" onsubmit="login(event)">
      <label>Email<input id="login-email" type="email" autocomplete="username" required></label>
      <label>Password<input id="login-password" type="password" autocomplete="current-password" required></label>
      <button class="btn" type="submit">Sign in</button>
    </form>
    <form class="recovery-form" onsubmit="recoverPassword(event)">
      <label>Forgot your password? Enter your email above, then <button class="link-button" type="submit">send a recovery link</button>.</label>
    </form></section>`;
}
function vPasswordRecovery() {
  return `<section class="card auth-card"><h1>Choose a new password</h1><p class="mute">Use at least 8 characters.</p>
    <form class="auth-form" onsubmit="updatePassword(event)">
      <label>New password<input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="256" required></label>
      <button class="btn" type="submit">Update password</button>
    </form></section>`;
}
async function updatePassword(event) {
  event.preventDefault();
  try {
    await api("/auth/password", { method: "POST", body: { access_token: recoveryToken, password: $("#new-password").value } }, false);
    recoveryToken = "";
    toast("Password updated. Sign in with your new password.");
    render();
  } catch (error) { toast(error.message); }
}
function vSetup() {
  return `<section class="card auth-card"><h1>Set up your pharmacy</h1><p class="mute">Create the organization and first branch for the initial administrator.</p>
    <form class="auth-form" onsubmit="initializeSetup(event)">
      <label>Pharmacy name<input id="setup-organization" maxlength="120" required></label>
      <label>First branch name<input id="setup-branch" maxlength="120" required></label>
      <button class="btn" type="submit">Complete initial setup</button>
      <button class="btn alt" type="button" onclick="logout()">Sign out</button>
    </form></section>`;
}
async function initializeSetup(event) {
  event.preventDefault();
  try {
    await api("/setup", { method: "POST", body: {
      organization_name: $("#setup-organization").value,
      branch_name: $("#setup-branch").value
    } });
    await loadWorkspace();
  } catch (error) { toast(error.message); }
}
function render() {
  nav();
  $("#app").innerHTML = recoveryToken ? vPasswordRecovery() : !S.user ? vLogin() :
    S.tab === "setup" ? vSetup() :
      S.tab === "manage" ? vManage() :
      ({ sell: vSell, stock: vStock, alerts: vAlerts, sales: vSales, activity: vActivity })[S.tab]();
  $("#app").classList.remove("page-enter");
  void $("#app").offsetWidth;
  $("#app").classList.add("page-enter");
}

/* ---------- SELL ---------- */
function productCards() {
  const ql = S.q.toLowerCase();
  const list = S.products.filter(p => !ql || [p.name, p.generic, p.sku, p.cat].some(x => x.toLowerCase().includes(ql)));
  return list.map(p => {
    const available = sellable(p), total = quantity(p), bad = available <= 0;
    return `<button class="prod" ${bad ? "disabled" : ""} onclick="add('${p.id}')">
      <b>${esc(p.name)}</b><small>${esc(p.generic)} · ${esc(p.sku)}</small>
      <span>${p.rx ? '<span class="tag rx">Rx</span>' : ""}${total > 0 && available === 0 ? '<span class="tag rx">No unexpired stock</span>' : available === 0 ? '<span class="tag rx">Out of stock</span>' : low(p) ? `<span class="tag w">Low: ${available}</span>` : `<span class="tag">${available} in stock</span>`}</span>
      <b class="product-price">${money(p.price)}</b></button>`;
  }).join("") || '<div class="empty">No medicine matches. Check the spelling or add it under Stock.</div>';
}
function refreshProductCards() {
  const grid = $("#product-grid");
  if (grid) grid.innerHTML = productCards();
}
function vSell() {
  const hasRx = S.cart.some(l => P(l.id).rx);
  return `<div class="sell">
  <section class="card">
    <input id="q" type="search" placeholder="Search by name, generic, category or scan barcode / SKU" value="${esc(S.q)}" oninput="S.q=this.value;refreshProductCards()" onkeydown="if(event.key==='Enter')scanEnter()" autofocus>
    <div class="grid" id="product-grid">${productCards()}</div>
  </section>
  <aside class="card">
    <div class="row sp"><h2>Current sale</h2>${S.cart.length ? '<button class="btn alt sm" onclick="S.cart=[];render()">Clear</button>' : ""}</div>
    ${S.cart.length ? S.cart.map(l => { const p = P(l.id); return `<div class="cart-line">
      <div><b>${esc(p.name)}</b> ${p.rx ? '<span class="tag rx">Rx</span>' : ""}<br><small class="mute">${money(p.price)} each</small></div>
      <div class="qty"><button onclick="chg('${l.id}',-1)" aria-label="Decrease">−</button><b>${l.qty}</b><button onclick="chg('${l.id}',1)" aria-label="Increase">+</button></div>
      <b>${money(p.price * l.qty)}</b></div>`; }).join("") : '<div class="empty">The cart is empty. Select a medicine to start a sale.</div>'}
    ${hasRx ? `<div class="form patient-details"><label class="full">Patient name (required for Rx items)<input value="${esc(S.patient)}" oninput="S.patient=this.value;chk()"></label><label class="full">Prescriber<input value="${esc(S.prescriber)}" oninput="S.prescriber=this.value"></label></div>` : ""}
    <div class="form sale-fields">
      <label>Discount %<input id="discount" type="number" min="0" max="100" value="${S.disc}" oninput="S.disc=this.value;refreshSaleSummary()"></label>
      <label>Payment<select onchange="S.pay=this.value;render()">${["Cash", ...(publicConfig.paystackEnabled ? ["Card", "Mobile money"] : [])].map(x => `<option ${S.pay === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      ${S.pay === "Cash" ? `<label class="full">Cash received<input id="tender" type="number" min="0" step="0.01" value="${esc(S.tender)}" oninput="S.tender=this.value;refreshSaleSummary()"></label>` : ""}
    </div>
    <div id="sale-summary">${saleSummary()}</div>
  </aside></div>`;
}
function saleSummary() {
  const t = totals(), tender = +S.tender || 0;
  const hasRx = S.cart.some(l => P(l.id)?.rx);
  const ready = S.cart.length && (S.pay !== "Cash" || tender >= t.total) && (!hasRx || S.patient.trim());
  return `<div class="row sp mute"><span>Subtotal</span><span>${money(t.sub)}</span></div>
    ${t.d ? `<div class="row sp mute"><span>Discount</span><span>−${money(t.d)}</span></div>` : ""}
    ${TAX ? `<div class="row sp mute"><span>Tax ${TAX}%</span><span>${money(t.tax)}</span></div>` : ""}
    <div class="row sp"><b>Total</b><span class="tot">${money(t.total)}</span></div>
    ${S.pay === "Cash" && tender >= t.total && S.cart.length ? `<div class="row sp"><span>Change</span><b>${money(tender - t.total)}</b></div>` : ""}
    <button class="btn checkout-btn" id="pay" ${ready ? "" : "disabled"} onclick="checkout()">Complete sale</button>`;
}
function refreshSaleSummary() { const summary = $("#sale-summary"); if (summary) summary.innerHTML = saleSummary(); }
function chk() { refreshSaleSummary(); }
function upd() { refreshSaleSummary(); }
function scanEnter() {
  const m = S.products.filter(p => p.sku.toLowerCase() === S.q.toLowerCase().trim());
  if (m.length) { add(m[0].id); S.q = ""; render(); }
}
function add(id) {
  const p = P(id), l = S.cart.find(x => x.id === id);
  if (!p) return toast("This product is no longer available.");
  if ((l ? l.qty : 0) + 1 > sellable(p)) return toast("Only " + sellable(p) + " unexpired units are in stock.");
  l ? l.qty++ : S.cart.push({ id, qty: 1 });
  render();
}
function chg(id, d) {
  const l = S.cart.find(x => x.id === id), p = P(id);
  if (!l || !p) return toast("This product is no longer available.");
  if (d > 0 && l.qty + 1 > sellable(p)) return toast("Only " + sellable(p) + " unexpired units are in stock.");
  l.qty += d; if (l.qty <= 0) S.cart = S.cart.filter(x => x.id !== id);
  render();
}
async function checkout() {
  if (!S.cart.length) return toast("Add at least one product before completing a sale.");
  for (const line of S.cart) {
    const p = P(line.id);
    if (!p) return toast("A product in this sale is no longer available.");
    if (!Number.isInteger(line.qty) || line.qty <= 0) return toast("Sale quantities must be whole numbers greater than zero.");
    if (line.qty > sellable(p)) return toast("Only " + sellable(p) + " unexpired units of " + p.name + " are in stock.");
    if (!(Number.isFinite(p.price) && p.price > 0)) return toast(p.name + " has an invalid selling price.");
  }
  const hasRx = S.cart.some(l => P(l.id).rx);
  if (hasRx && !S.patient.trim()) return toast("Enter the patient's name before selling prescription-only items.");
  if (!["Cash", "Card", "Mobile money"].includes(S.pay)) return toast("Select a valid payment method.");
  const t = totals();
  if (S.pay === "Cash" && (!Number.isFinite(+S.tender) || +S.tender < t.total)) return toast("Cash received must cover the sale total.");
  if (requestInFlight) return;
  requestInFlight = true;
  const checkoutButton = $("#pay");
  if (checkoutButton) checkoutButton.disabled = true;
  const paymentMethod = S.pay === "Cash" ? "cash" : S.pay === "Card" ? "card" : "mobile_money";
  try {
    const checkoutData = {
      branch_id: S.branchId,
      items: S.cart.map(line => ({ product_id: line.id, quantity: line.qty })),
      discount_percent: Number(S.disc) || 0,
      tendered: S.pay === "Cash" ? Number(S.tender) : null,
      patient_name: S.patient.trim(),
      prescriber: S.prescriber.trim(),
      payment_method: paymentMethod
    };
    const fingerprint = JSON.stringify(checkoutData);
    if (!checkoutKey || fingerprint !== checkoutFingerprint) {
      checkoutKey = crypto.randomUUID();
      checkoutFingerprint = fingerprint;
    }
    const body = { ...checkoutData, idempotency_key: checkoutKey };
    if (paymentMethod === "cash") {
      const { sale } = await api("/sales", { method: "POST", body });
      await loadBranchData();
      const completed = S.sales.find(item => item.id === sale.id);
      Object.assign(S, { cart: [], disc: 0, tender: "", patient: "", prescriber: "", pay: "Cash" });
      checkoutKey = checkoutFingerprint = "";
      render();
      if (completed) showReceipt(completed);
      else toast(`Sale completed. Receipt #${sale.receipt_number}.`);
    } else {
      const payment = await api("/payments/initialize", { method: "POST", body });
      if (payment.sale.status === "completed") {
        await loadBranchData();
        Object.assign(S, { cart: [], disc: 0, tender: "", patient: "", prescriber: "", pay: "Cash" });
        checkoutKey = checkoutFingerprint = "";
        render();
        toast(`Payment already completed. Receipt #${payment.sale.receipt_number}.`);
      } else {
        if (typeof payment.authorization_url !== "string" || !payment.authorization_url) {
          throw new Error("Payment was reserved, but Paystack did not return a checkout link. Contact an administrator before retrying.");
        }
        location.assign(payment.authorization_url);
      }
    }
  } catch (error) {
    toast(error.message);
    if (error.status === 409) checkoutKey = checkoutFingerprint = "";
    if (checkoutButton) checkoutButton.disabled = false;
  } finally {
    requestInFlight = false;
  }
}
function showReceipt(s) {
  const d = $("#dlg");
  d.innerHTML = `<div id="rcpt" class="receipt"><div class="receipt-header"><b>FRIENDS PHARMACY</b><br>Receipt #${s.no}<br>${new Date(s.at).toLocaleString()}</div><hr>
  ${s.items.map(i => `${esc(i.name)}${i.rx ? " (Rx)" : ""}<div class="row sp"><span>${i.qty} × ${money(i.price)}</span><span>${money(i.qty * i.price)}</span></div>`).join("")}<hr>
  ${s.disc ? `<div class="row sp"><span>Discount</span><span>−${money(s.disc)}</span></div>` : ""}${s.tax ? `<div class="row sp"><span>Tax</span><span>${money(s.tax)}</span></div>` : ""}
  <div class="row sp"><b>TOTAL</b><b>${money(s.total)}</b></div><div class="row sp"><span>${esc(s.pay)}</span><span>${money(s.tender)}</span></div>
  ${s.pay === "Cash" ? `<div class="row sp"><span>Change</span><span>${money(s.tender - s.total)}</span></div>` : ""}
  ${s.patient ? `<hr>Patient: ${esc(s.patient)}${s.prescriber ? "<br>Prescriber: " + esc(s.prescriber) : ""}` : ""}<hr><div class="receipt-footer">Thank you. Take medicines as directed.</div></div>
  <div class="row dialog-actions"><button class="btn" onclick="window.print()">Print</button><button class="btn alt" onclick="$('#dlg').close()">Close</button></div>`;
  d.showModal();
}

/* ---------- STOCK ---------- */
function statusTags(p) {
  const active = p.batches.filter(b => b.qty > 0);
  const firstExpiry = active.filter(b => daysLeft(b.exp) >= 0).sort((a, b) => a.exp.localeCompare(b.exp))[0];
  return (active.some(b => daysLeft(b.exp) < 0) ? '<span class="tag rx">Expired batch</span>' : "") +
    (firstExpiry && daysLeft(firstExpiry.exp) <= 90 ? `<span class="tag w">Expires in ${daysLeft(firstExpiry.exp)}d</span>` : "") +
    (low(p) ? '<span class="tag w">Low stock</span>' : "") + (p.rx ? '<span class="tag rx">Rx</span>' : "");
}
function vStock() {
  const val = S.products.reduce((a, p) => a + p.batches.reduce((v, b) => v + b.qty * b.cost, 0), 0);
  const units = S.products.reduce((a, p) => a + quantity(p), 0);
  return `<div class="stats"><div class="card stat"><b>${S.products.length}</b><span>Products</span></div><div class="card stat"><b>${units}</b><span>Units on shelf</span></div><div class="card stat"><b>${canManageStock() ? money(val) : "Restricted"}</b><span>Stock value at cost</span></div><div class="card stat"><b>${alerts()}</b><span>Need attention</span></div></div>
  <div class="card"><div class="row stock-toolbar"><input class="stock-filter" id="stock-filter" placeholder="Filter stock" value="${esc(S.q)}" oninput="S.q=this.value;refreshStockTable()">${canManageStock() ? '<button class="btn" onclick="editP()">Add product</button>' : ""}</div>
  <div id="stock-table">${stockTable()}</div></div>`;
}
function stockTable() {
  const ql = S.q.toLowerCase();
  const list = S.products.filter(p => !ql || [p.name, p.generic, p.sku].some(x => x.toLowerCase().includes(ql)));
  return `<div class="tbl"><table><tr><th>SKU</th><th>Medicine</th><th>Category</th><th>Price</th><th>Qty</th><th>Next expiry</th><th>Status</th>${canManageStock() ? "<th></th>" : ""}</tr>
  ${list.map(p => {
    const batches = p.batches.filter(b => b.qty > 0).sort((a, b) => a.exp.localeCompare(b.exp));
    return `<tr><td>${esc(p.sku)}</td><td><b>${esc(p.name)}</b><br><small class="mute">${esc(p.generic)} · ${batches.length} batch${batches.length === 1 ? "" : "es"}</small></td><td>${esc(p.cat)}</td><td>${money(p.price)}</td><td>${quantity(p)}</td><td>${batches.length ? esc(batches[0].exp) : "—"}</td><td>${statusTags(p)}</td>
    ${canManageStock() ? `<td class="table-actions"><button class="btn alt sm" onclick="restock('${p.id}')">Restock</button> <button class="btn alt sm" onclick="editP('${p.id}')">Edit</button> <button class="btn danger sm" onclick="delP('${p.id}')">Delete</button></td>` : ""}</tr>`;
  }).join("")}</table></div>`;
}
function refreshStockTable() {
  const table = $("#stock-table");
  if (table) table.innerHTML = stockTable();
}
function editP(id) {
  const p = id ? { ...P(id), cost: P(id).batches[0]?.cost ?? "" } :
    { name: "", generic: "", cat: "", sku: "PH" + (1001 + S.products.length), price: "", cost: "", min: 10, rx: false };
  const f = (k, l, t = "text", full) => `<label class="${full ? "full" : ""}">${l}<input id="f_${k}" type="${t}" ${t === "number" ? 'step="0.01" min="0"' : ""} value="${esc(p[k])}"></label>`;
  $("#dlg").innerHTML = `<h3>${id ? "Edit" : "Add"} product</h3><div class="form modal-form">${f("name", "Medicine name", "text", 1)}${f("generic", "Generic name")}${f("cat", "Category")}${f("sku", "SKU / barcode")}${f("price", "Selling price", "number")}${id ? "" : f("cost", "Default batch cost", "number")}${f("min", "Low-stock level", "number")}
  ${id ? `<p class="full mute">Stock quantity and expiry are managed as separate batches. Current stock: ${quantity(p)}.</p>` : `${f("opening_qty", "Opening quantity", "number")}${f("opening_exp", "Opening batch expiry", "date")}`}
  <label class="full checkbox-label"><input type="checkbox" id="f_rx" ${p.rx ? "checked" : ""}>Prescription only</label></div>
  <div class="row dialog-actions"><button class="btn" onclick="saveP('${id || ""}')">Save product</button><button class="btn alt" onclick="$('#dlg').close()">Cancel</button></div>`;
  $("#dlg").showModal();
}
async function saveP(id) {
  const g = k => $("#f_" + k).value.trim();
  const o = { name: g("name"), generic: g("generic") || g("name"), category: g("cat") || "General", sku: g("sku"), selling_price: Number(g("price")), unit_cost: id ? 0 : Number(g("cost")), min_stock: Number(g("min")), prescription_only: $("#f_rx").checked };
  const qty = id ? 0 : Number(g("opening_qty")), exp = id ? "" : g("opening_exp");
  if (!o.name || !o.sku) return toast("Enter a product name and SKU.");
  if (!id && !validDate(exp)) return toast("Enter a valid expiry date for the opening batch.");
  if (!g("price") || (!id && !g("cost")) || !g("min") || (!id && !g("opening_qty"))) return toast("Complete all required product and stock fields.");
  if (!(Number.isFinite(o.selling_price) && o.selling_price > 0) || !(Number.isFinite(o.unit_cost) && o.unit_cost >= 0)) return toast("Enter a selling price above 0 and a valid cost price.");
  if ((!id && (!Number.isInteger(qty) || qty < 0)) || !Number.isInteger(o.min_stock) || o.min_stock < 0) return toast("Quantity and low-stock level must be whole numbers at least 0.");
  if (S.products.some(p => p.sku.toLowerCase() === o.sku.toLowerCase() && p.id !== id)) return toast("That SKU is already used by another product.");
  try {
    if (id) {
      await api(`/products/${encodeURIComponent(id)}?branch_id=${encodeURIComponent(S.branchId)}`, {
        method: "PATCH", body: { ...o, opening_quantity: 0, expires_on: today() }
      });
    } else {
      await api("/products", { method: "POST", body: { ...o, branch_id: S.branchId, opening_quantity: qty, expires_on: exp } });
    }
    await loadBranchData();
    $("#dlg").close();
    render();
    toast("Product saved.");
  } catch (error) {
    toast(error.message);
  }
}
function restock(id) {
  const p = P(id);
  if (!p) return toast("This product is no longer available.");
  $("#dlg").innerHTML = `<h3>Receive ${esc(p.name)}</h3><div class="form modal-form"><label>Units received<input id="r_q" type="number" min="1" step="1" value="50"></label><label>Batch expiry date<input id="r_e" type="date" value="${dayOff(365)}"></label><label class="full">Cost per unit<input id="r_cost" type="number" min="0" step="0.01" value="${p.batches[0]?.cost ?? 0}"></label></div><p class="mute">Current stock: ${quantity(p)}. This delivery will be tracked as a separate batch.</p>
  <div class="row dialog-actions"><button class="btn" onclick="doRestock('${id}')">Add stock</button><button class="btn alt" onclick="$('#dlg').close()">Cancel</button></div>`;
  $("#dlg").showModal();
}
async function doRestock(id) {
  const q = Number($("#r_q").value), exp = $("#r_e").value, cost = Number($("#r_cost").value), p = P(id);
  if (!p) return toast("This product is no longer available.");
  if (!Number.isInteger(q) || q <= 0) return toast("Enter a whole number of units greater than zero.");
  if (!validDate(exp)) return toast("Enter a valid expiry date for the received stock.");
  if (!Number.isFinite(cost) || cost < 0) return toast("Enter a valid non-negative cost per unit.");
  try {
    await api("/stock/receive", { method: "POST", body: {
      branch_id: S.branchId, product_id: id, quantity: q, unit_cost: cost, expires_on: exp
    } });
    await loadBranchData();
    $("#dlg").close();
    render();
    toast("New stock batch received.");
  } catch (error) { toast(error.message); }
}
async function delP(id) {
  const p = P(id);
  if (p && confirm(`Archive ${p.name}? Past sales will stay in history.`)) {
    try {
      await api(`/products/${encodeURIComponent(id)}?branch_id=${encodeURIComponent(S.branchId)}`, { method: "DELETE" });
      await loadBranchData();
      render();
      toast("Product archived.");
    } catch (error) { toast(error.message); }
  }
}

/* ---------- ALERTS ---------- */
function vAlerts() {
  const groups = [["Expired batches: remove from shelf", expiredBatches()], ["Expiring within 90 days", nearBatches()]];
  const batchCards = groups.map(([title, rows]) => `<section class="card alert-card"><h3>${title} (${rows.length})</h3>${rows.length ? `<div class="tbl"><table><tr><th>Medicine</th><th>Batch expiry</th><th>Units</th>${canManageStock() ? "<th></th>" : ""}</tr>${rows.map(({ product, batch }) => `<tr><td><b>${esc(product.name)}</b></td><td>${esc(batch.exp)}</td><td>${batch.qty}</td>${canManageStock() ? `<td class="align-right"><button class="btn alt sm" onclick="restock('${product.id}')">Receive stock</button></td>` : ""}</tr>`).join("")}</table></div>` : '<div class="empty">Nothing here.</div>'}</section>`).join("");
  const lowProducts = S.products.filter(low);
  const lowCard = `<section class="card"><h3>Low stock: reorder (${lowProducts.length})</h3>${lowProducts.length ? `<div class="tbl"><table><tr><th>Medicine</th><th>Available</th><th>Minimum</th>${canManageStock() ? "<th></th>" : ""}</tr>${lowProducts.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${sellable(p)}</td><td>${p.min}</td>${canManageStock() ? `<td class="align-right"><button class="btn alt sm" onclick="restock('${p.id}')">Receive stock</button></td>` : ""}</tr>`).join("")}</table></div>` : '<div class="empty">Nothing here. Stock looks healthy.</div>'}</section>`;
  return batchCards + lowCard;
}

/* ---------- SALES ---------- */
function vSales() {
  const completedSales = S.sales.filter(s => s.status === "completed");
  const summary = S.salesSummary;
  return `<div class="stats"><div class="card stat"><b>${money(summary.today_total || 0)}</b><span>Sales today (${summary.today_count || 0})</span></div><div class="card stat"><b>${summary.today_profit == null ? "Restricted" : money(summary.today_profit)}</b><span>Profit today</span></div><div class="card stat"><b>${money(summary.all_time_total || 0)}</b><span>All-time sales</span></div><div class="card stat"><b>${summary.best_seller ? esc(summary.best_seller) : "None yet"}</b><span>Best seller${summary.best_seller ? ` (${summary.best_seller_quantity} sold)` : ""}</span></div></div>
  <div class="card"><div class="row sp sales-toolbar"><h3>Sales history (latest 500)</h3><button class="btn alt sm" onclick="exportCsv()">Export CSV</button></div>
  ${completedSales.length ? `<div class="tbl"><table><tr><th>#</th><th>Date</th><th>Items</th><th>Payment</th><th>Patient</th><th>Total</th><th></th></tr>${completedSales.map(s => `<tr><td>${s.no}</td><td>${new Date(s.at).toLocaleString()}</td><td>${s.items.reduce((a, i) => a + i.qty, 0)}</td><td>${esc(s.pay)}</td><td>${esc(s.patient) || "-"}</td><td><b>${money(s.total)}</b></td><td><button class="btn alt sm" onclick="showReceipt(S.sales.find(x=>x.id==='${s.id}'))">Receipt</button></td></tr>`).join("")}</table></div>` : '<div class="empty">No completed sales yet. Complete a sale on the Sell tab and it will appear here.</div>'}</div>`;
}
function exportCsv() {
  const rows = [["Receipt", "Date", "Payment", "Patient", "Item", "Qty", "Price", "Sale total"]];
  S.sales.filter(s => s.status === "completed").forEach(s => s.items.forEach(i => rows.push([s.no, s.at, s.pay, s.patient, i.name, i.qty, i.price, s.total])));
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
  const b = new Blob([csv], { type: "text/csv" }), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = "sales.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function vActivity() {
  const actions = `<div class="row wrap activity-actions"><button class="btn alt" onclick="exportCsv()">Export sales CSV</button></div>`;
  const rows = S.activity.map(event => `<tr><td>${new Date(event.at).toLocaleString()}</td><td><span class="tag">${esc(event.type)}</span></td><td>${esc(event.message)}</td></tr>`).join("");
  return `<section class="card">${actions}<h2>Recent activity</h2><p class="mute">Recent actions are recorded on the server for this branch. Configure database backups in your Supabase project.</p>${rows ? `<div class="tbl"><table><tr><th>Date</th><th>Activity</th><th>Details</th></tr>${rows}</table></div>` : '<div class="empty">No activity recorded yet.</div>'}</section>`;
}

async function startApp() {
  try {
    const authFragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (authFragment.get("type") === "recovery" && authFragment.get("access_token")) {
      recoveryToken = authFragment.get("access_token");
      history.replaceState(null, "", location.pathname);
    }
    publicConfig = await api("/config", {}, false);
    if (recoveryToken) { render(); return; }
    await loadWorkspace();
  } catch (error) {
    console.error("Could not initialize pharmacy application.", error);
    $("#app").innerHTML = `<section class="card auth-card"><h1>Unable to connect</h1><p>${esc(error.message)}</p><button class="btn" onclick="startApp()">Try again</button></section>`;
  }
}
startApp();
