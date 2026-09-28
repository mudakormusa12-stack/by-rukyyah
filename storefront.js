const CART_KEY = "byRukyyahCart";

function escapeStoreText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function storeMoney(value) {
  return "₦" + Number(value || 0).toLocaleString("en-NG");
}

async function fetchStoreProducts() {
  const response = await fetch("/api/products", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("The shop catalogue could not be loaded.");
  return response.json();
}

function readBag() {
  try {
    const bag = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(bag) ? bag : [];
  } catch {
    return [];
  }
}

function updateBagCount() {
  const count = readBag().reduce((total, item) => total + Number(item.quantity || 0), 0);
  document.querySelectorAll("#bagCount").forEach((element) => { element.textContent = count; });
}

async function addProductToBag(productId, button) {
  const originalText = button.textContent;
  button.disabled = true;
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}`);
    if (!response.ok) throw new Error("This item is no longer available.");
    const product = await response.json();
    if (product.soldOut) throw new Error("This product is sold out and cannot be added to the bag.");
    const bag = readBag();
    const existing = bag.find((item) => item.productId === product.id || (!item.productId && item.name === product.name));
    if (existing) {
      Object.assign(existing, { productId: product.id, name: product.name, price: product.price, image: product.image, quantity: Number(existing.quantity || 0) + 1 });
    } else {
      bag.push({ productId: product.id, name: product.name, price: product.price, image: product.image, quantity: 1 });
    }
    localStorage.setItem(CART_KEY, JSON.stringify(bag));
    updateBagCount();
    button.textContent = "ADDED ✓";
    window.setTimeout(() => { button.textContent = originalText; button.disabled = false; }, 1200);
  } catch (error) {
    window.alert(error.message);
    button.disabled = false;
  }
}

async function renderShopProducts() {
  const container = document.getElementById("products");
  if (!container) return;
  try {
    const products = await fetchStoreProducts();
    container.innerHTML = products.map((product) => `
      <article class="product-card" data-category="${escapeStoreText(product.category)}" data-name="${escapeStoreText(product.name)}">
        <div class="product-image"><img src="${escapeStoreText(product.image)}" alt="${escapeStoreText(product.name)}"><span>${escapeStoreText(product.category.toUpperCase())}</span></div>
        <div class="product-info">
          <h2>${escapeStoreText(product.name)}</h2>
          <p>${escapeStoreText(product.description || "Curated for the BY_RUKAYYAH collection.")}</p>
          <strong>${storeMoney(product.price)}</strong>
          <a class="product-view" href="product.html?product=${encodeURIComponent(product.name)}">VIEW PRODUCT</a>
          <button class="add-cart" data-product-id="${escapeStoreText(product.id)}" ${product.soldOut ? "disabled aria-disabled=\"true\"" : ""}>${product.soldOut ? "SOLD OUT" : "ADD TO BAG"}</button>
        </div>
      </article>
    `).join("") || '<p class="store-message">Our collection is being refreshed. Please check back soon.</p>';
    container.querySelectorAll(".add-cart:not(:disabled)").forEach((button) => button.addEventListener("click", () => addProductToBag(button.dataset.productId, button)));
    applyShopFilters();
  } catch (error) {
    container.innerHTML = `<p class="store-message">${escapeStoreText(error.message)} Please refresh to try again.</p>`;
  }
}

function applyShopFilters() {
  const activeCategory = document.querySelector(".filter.active")?.dataset.category || "all";
  const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  document.querySelectorAll("#products .product-card").forEach((card) => {
    const categoryMatch = activeCategory === "all" || card.dataset.category === activeCategory;
    const searchMatch = !search || card.dataset.name.toLowerCase().includes(search);
    card.hidden = !(categoryMatch && searchMatch);
  });
}

async function renderProductDetail() {
  const title = document.getElementById("productName");
  const addButton = document.getElementById("addProduct");
  if (!title || !addButton) return;
  const requestedName = new URLSearchParams(window.location.search).get("product");
  try {
    const products = await fetchStoreProducts();
    const product = products.find((entry) => entry.name === requestedName) || products[0];
    if (!product) throw new Error("No products are currently listed.");
    document.title = `${product.name} | BY_RUKAYYAH`;
    title.textContent = product.name;
    document.getElementById("productPrice").textContent = storeMoney(product.price);
    const image = document.getElementById("productImage");
    image.src = product.image;
    image.alt = product.name;
    document.getElementById("productCategory").textContent = product.category.toUpperCase();
    const description = document.querySelector(".product-description");
    if (description) description.textContent = product.description || "Curated for the BY_RUKAYYAH collection.";
    addButton.disabled = Boolean(product.soldOut);
    addButton.textContent = product.soldOut ? "SOLD OUT" : "ADD TO BAG";
    addButton.addEventListener("click", () => addProductToBag(product.id, addButton));
  } catch (error) {
    title.textContent = error.message;
    addButton.disabled = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateBagCount();
  renderShopProducts();
  renderProductDetail();
  document.querySelectorAll(".filter").forEach((filter) => filter.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    filter.classList.add("active");
    applyShopFilters();
  }));
  document.getElementById("searchInput")?.addEventListener("input", applyShopFilters);
});
