let csrfToken = "";
let editingId = null;
let products = [];
let orders = [];
let selectedImage = null;

function escapeAdmin(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}
function adminMoney(value) { return "₦" + Number(value || 0).toLocaleString("en-NG"); }
function categoryName(value) { return String(value || "").replace(/\b\w/g, (character) => character.toUpperCase()); }

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    window.location.replace("/admin-login.html");
    throw new Error("Admin sign-in required.");
  }
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

async function migrateBrowserData() {
  if (localStorage.getItem("byRukyyahServerMigrationDone") === "true") return;
  const parseLegacy = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  };
  const result = await apiRequest("/api/admin/migrate-local-data", {
    method: "POST",
    body: JSON.stringify({ products: parseLegacy("byRukyyahProducts"), orders: parseLegacy("byRukyyahOrders") || [] })
  });
  if (result.migrated || result.reason === "already-migrated") localStorage.setItem("byRukyyahServerMigrationDone", "true");
}

async function loadDashboard() {
  const sessionInfo = await fetch("/api/admin/session", { headers: { Accept: "application/json" } }).then((response) => response.json());
  if (!sessionInfo.authenticated) return window.location.replace("/admin-login.html");
  csrfToken = sessionInfo.csrfToken;
  await migrateBrowserData();
  [products, orders] = await Promise.all([
    apiRequest("/api/products"),
    apiRequest("/api/admin/orders")
  ]);
  renderProducts();
  renderOrders();
  renderInbox();
  renderStats();
  renderSales();
}

function renderStats() {
  document.getElementById("statProducts").textContent = products.length;
  document.getElementById("statAvailable").textContent = products.filter((item) => !item.soldOut).length;
  document.getElementById("statSoldOut").textContent = products.filter((item) => item.soldOut).length;
  document.getElementById("statValue").textContent = adminMoney(products.reduce((sum, item) => sum + Number(item.price || 0), 0));
}

function filteredProducts() {
  const search = document.getElementById("adminSearch").value.trim().toLowerCase();
  const category = document.getElementById("adminCategoryFilter").value;
  const availability = document.getElementById("adminAvailabilityFilter").value;
  return products.filter((product) => (!search || product.name.toLowerCase().includes(search)) &&
    (category === "all" || product.category === category) &&
    (availability === "all" || (availability === "available" ? !product.soldOut : product.soldOut)));
}

function renderProducts() {
  const grid = document.getElementById("adminProductGrid");
  const visible = filteredProducts();
  if (!visible.length) {
    grid.innerHTML = '<div class="empty-state">No products match your current filters.</div>';
    return;
  }
  grid.innerHTML = visible.map((product) => `
    <article class="admin-product-card">
      <img src="${escapeAdmin(product.image || "images/product-1.jpg")}" alt="${escapeAdmin(product.name)}">
      <div class="product-card-body">
        <div class="product-tag-row"><span class="product-category">${escapeAdmin(categoryName(product.category))}</span><span class="product-status ${product.soldOut ? "soldout" : "available"}">${product.soldOut ? "Sold Out" : "Available"}</span></div>
        <h3>${escapeAdmin(product.name)}</h3><p class="product-price">${adminMoney(product.price)}</p>
        <p class="product-desc">${escapeAdmin(product.description || "Curated for the BY_RUKAYYAH collection.")}</p>
        <div class="card-actions">
          <button class="secondary-btn" type="button" data-action="edit" data-id="${escapeAdmin(product.id)}">Edit</button>
          <button class="danger-btn" type="button" data-action="delete" data-id="${escapeAdmin(product.id)}">Delete</button>
          <button class="status-btn" type="button" data-action="toggle" data-id="${escapeAdmin(product.id)}">${product.soldOut ? "Mark Available" : "Mark Sold Out"}</button>
        </div>
      </div>
    </article>
  `).join("");
  grid.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleProductAction));
}

async function refreshData() {
  [products, orders] = await Promise.all([apiRequest("/api/products"), apiRequest("/api/admin/orders")]);
  renderProducts();
  renderOrders();
  renderInbox();
  renderStats();
  renderSales();
}

async function handleProductAction(event) {
  const { action, id } = event.currentTarget.dataset;
  const product = products.find((item) => item.id === id);
  if (!product) return;
  try {
    if (action === "edit") {
      editingId = id;
      document.getElementById("productName").value = product.name;
      document.getElementById("productPrice").value = product.price;
      document.getElementById("productCategory").value = product.category;
      document.getElementById("productDescription").value = product.description || "";
      document.getElementById("productAvailability").value = product.soldOut ? "soldOut" : "available";
      const photoBox = document.getElementById("uploadBox");
      let preview = photoBox.querySelector("img");
      if (!preview) { preview = document.createElement("img"); photoBox.appendChild(preview); }
      preview.src = product.image;
      photoBox.classList.add("has-image");
      document.querySelector("#productForm button[type='submit']").textContent = "Update Product";
      document.getElementById("productName").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Delete ${product.name}?`)) return;
      await apiRequest(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (editingId === id) resetProductForm();
    }
    if (action === "toggle") {
      await apiRequest(`/api/admin/products/${encodeURIComponent(id)}/availability`, {
        method: "PATCH", body: JSON.stringify({ soldOut: !product.soldOut })
      });
    }
    await refreshData();
  } catch (error) { window.alert(error.message); }
}

function resetProductForm() {
  const form = document.getElementById("productForm");
  form.reset();
  selectedImage = null;
  editingId = null;
  document.getElementById("productCategory").value = "kaftans";
  document.getElementById("productAvailability").value = "available";
  const uploadBox = document.getElementById("uploadBox");
  uploadBox.querySelector("img")?.remove();
  uploadBox.classList.remove("has-image");
  form.querySelector("button[type='submit']").textContent = "Add Product";
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = new FormData();
  payload.set("name", document.getElementById("productName").value.trim());
  payload.set("price", document.getElementById("productPrice").value);
  payload.set("category", document.getElementById("productCategory").value);
  payload.set("description", document.getElementById("productDescription").value.trim());
  payload.set("soldOut", String(document.getElementById("productAvailability").value === "soldOut"));
  if (selectedImage) payload.set("image", selectedImage);
  if (!editingId && !selectedImage) {
    window.alert("Upload a product photo from your device.");
    return;
  }
  try {
    await apiRequest(editingId ? `/api/admin/products/${encodeURIComponent(editingId)}` : "/api/admin/products", {
      method: editingId ? "PUT" : "POST", body: payload
    });
    resetProductForm();
    await refreshData();
  } catch (error) { window.alert(error.message); }
}

function renderOrders() {
  const container = document.getElementById("ordersList");
  if (!orders.length) {
    container.innerHTML = '<div class="empty-state">No orders yet. Customer checkout activity will appear here.</div>';
    return;
  }
  container.innerHTML = orders.map((order) => `
    <article class="order-card">
      <div class="order-card-head"><span class="order-id">Order #${escapeAdmin(order.id)}</span><span class="order-status processing">${escapeAdmin(order.status)}</span></div>
      <div class="order-grid">
        <div><strong>Customer</strong>${escapeAdmin(order.customerName)}</div><div><strong>Phone</strong>${escapeAdmin(order.customerPhone)}</div>
        <div><strong>Address</strong>${escapeAdmin(`${order.customerAddress}, ${order.customerCity}`)}</div><div><strong>Amount</strong>${adminMoney(order.total)}</div>
      </div>
      <div class="order-items"><strong>Order Details</strong>${order.items.map((item) => `<span>${escapeAdmin(item.name)} × ${item.quantity} — ${adminMoney(item.price * item.quantity)}</span>`).join("")}</div>
      <small>${new Date(order.date).toLocaleString("en-NG")}</small>
    </article>
  `).join("");
}

function renderInbox() {
  const container = document.getElementById("inboxList");
  if (!orders.length) {
    container.innerHTML = '<div class="empty-state">Inbox is clear. New customer orders will appear here.</div>';
    return;
  }
  container.innerHTML = orders.map((order) => `
    <article class="inbox-item"><div class="inbox-top"><h3>${escapeAdmin(order.customerName)}</h3><span class="inbox-label">Order ${escapeAdmin(order.id)}</span></div>
      <p><strong>${order.items.map((item) => `${escapeAdmin(item.name)} × ${item.quantity}`).join(", ")}</strong></p>
      <p>${escapeAdmin(order.customerPhone)} · ${escapeAdmin(order.customerAddress)}, ${escapeAdmin(order.customerCity)}</p>
      <p>${new Date(order.date).toLocaleString("en-NG")}</p>
    </article>
  `).join("");
}

function renderSales() {
  const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const quantities = {};
  orders.forEach((order) => order.items.forEach((item) => { quantities[item.name] = (quantities[item.name] || 0) + Number(item.quantity || 0); }));
  const topProduct = Object.entries(quantities).sort((first, second) => second[1] - first[1])[0];
  const metrics = [
    ["Gross Revenue", adminMoney(revenue)],
    ["Orders", orders.length],
    ["Average Order", adminMoney(orders.length ? revenue / orders.length : 0)],
    ["Best Seller", topProduct ? `${topProduct[0]} (${topProduct[1]})` : "No sales yet"]
  ];
  document.getElementById("salesSummary").innerHTML = metrics.map(([label, value]) => `<div class="sales-metric"><span>${label}</span><strong>${escapeAdmin(value)}</strong></div>`).join("");
}

function connectAdminControls() {
  document.getElementById("productImage").addEventListener("change", (event) => {
    selectedImage = event.target.files[0] || null;
    if (!selectedImage) return;
    const reader = new FileReader();
    reader.onload = () => {
      const box = document.getElementById("uploadBox");
      let preview = box.querySelector("img");
      if (!preview) { preview = document.createElement("img"); box.appendChild(preview); }
      preview.src = reader.result;
      box.classList.add("has-image");
    };
    reader.readAsDataURL(selectedImage);
  });
  document.getElementById("productForm").addEventListener("submit", saveProduct);
  document.getElementById("adminSearch").addEventListener("input", renderProducts);
  document.getElementById("adminCategoryFilter").addEventListener("change", renderProducts);
  document.getElementById("adminAvailabilityFilter").addEventListener("change", renderProducts);
  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await apiRequest("/api/admin/logout", { method: "POST", body: "{}" });
      window.location.replace("/admin-login.html");
    } catch (error) { window.alert(error.message); }
  });
  document.getElementById("cancelEdit").addEventListener("click", resetProductForm);
  const navTargets = ["overview", "products-section", "orders-section", "inbox-section"];
  document.querySelectorAll(".nav-item").forEach((button, index) => button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(navTargets[index])?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

document.addEventListener("DOMContentLoaded", async () => {
  connectAdminControls();
  try { await loadDashboard(); }
  catch (error) { if (!error.message.includes("Admin sign-in required")) window.alert(error.message); }
});
