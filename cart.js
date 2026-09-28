const CART_KEY = "byRukyyahCart";

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function formatPrice(value) { return "₦" + Number(value || 0).toLocaleString("en-NG"); }
function escapeCartText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function updateCount(cart) {
  const count = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll("#bagCount").forEach((element) => { element.textContent = count; });
}

async function refreshCartProducts(cart) {
  if (!cart.length) return cart;
  const response = await fetch("/api/products");
  if (!response.ok) return cart;
  const products = await response.json();
  return cart.map((item) => {
    const product = products.find((entry) => entry.id === item.productId || (!item.productId && entry.name === item.name));
    return product ? { ...item, productId: product.id, name: product.name, price: product.price, image: product.image, soldOut: product.soldOut, unavailable: false } : { ...item, soldOut: true, unavailable: true };
  });
}

async function renderCart() {
  const container = document.getElementById("cartItems");
  let cart = readCart();
  cart = await refreshCartProducts(cart);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCount(cart);
  if (!cart.length) {
    container.innerHTML = '<div class="empty-cart"><div>YOUR BAG IS EMPTY</div><p>Discover something beautiful from our collection.</p><a href="shop.html" class="btn btn-dark">SHOP NOW</a></div>';
    document.getElementById("cartSubtotal").textContent = "₦0";
    document.getElementById("cartTotal").textContent = "₦0";
    return;
  }
  container.innerHTML = cart.map((item, index) => `
    <article class="cart-item">
      <img src="${escapeCartText(item.image)}" alt="${escapeCartText(item.name)}">
      <div class="cart-item-info">
        <p class="cart-category">${item.unavailable ? "NO LONGER AVAILABLE" : item.soldOut ? "SOLD OUT" : "BY_RUKAYYAH"}</p>
        <h2>${escapeCartText(item.name)}</h2><strong>${formatPrice(item.price)}</strong>
        <div class="quantity"><button type="button" data-action="minus" data-index="${index}" aria-label="Decrease quantity">−</button><span>${Number(item.quantity)}</span><button type="button" data-action="plus" data-index="${index}" aria-label="Increase quantity">+</button></div>
        <button class="remove-item" type="button" data-action="remove" data-index="${index}">REMOVE</button>
      </div>
    </article>
  `).join("");
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  document.getElementById("cartSubtotal").textContent = formatPrice(subtotal);
  document.getElementById("cartTotal").textContent = formatPrice(subtotal);
  container.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const current = readCart();
    const index = Number(button.dataset.index);
    if (button.dataset.action === "remove") current.splice(index, 1);
    if (button.dataset.action === "plus") current[index].quantity = Number(current[index].quantity) + 1;
    if (button.dataset.action === "minus") {
      current[index].quantity = Number(current[index].quantity) - 1;
      if (current[index].quantity <= 0) current.splice(index, 1);
    }
    localStorage.setItem(CART_KEY, JSON.stringify(current));
    renderCart();
  }));
}

async function submitOrder() {
  const cart = readCart();
  if (!cart.length) return window.alert("Your bag is empty.");
  if (cart.some((item) => item.soldOut || item.unavailable)) return window.alert("Remove unavailable or sold-out items before checkout.");
  const customer = {
    customerName: document.getElementById("customerName").value.trim(),
    customerPhone: document.getElementById("customerPhone").value.trim(),
    customerAddress: document.getElementById("customerAddress").value.trim(),
    customerCity: document.getElementById("customerCity").value.trim(),
    items: cart.map(({ productId, name, quantity }) => ({ productId, name, quantity }))
  };
  if ([customer.customerName, customer.customerPhone, customer.customerAddress, customer.customerCity].some((value) => !value)) return window.alert("Please fill in all delivery details before placing your order.");
  const whatsappWindow = window.open("about:blank", "_blank");
  const button = document.getElementById("whatsappOrder");
  button.disabled = true;
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(customer)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Your order could not be placed.");
    const orderItems = result.items.map((item) => `${item.name} × ${item.quantity} — ${formatPrice(item.price * item.quantity)}`).join("\n");
    const message = `BY_RUKAYYAH ORDER\nOrder: ${result.id}\n\n${orderItems}\n\nTotal: ${formatPrice(result.total)}\n\nDELIVERY DETAILS\nName: ${customer.customerName}\nPhone: ${customer.customerPhone}\nAddress: ${customer.customerAddress}\nCity / Location: ${customer.customerCity}\n\nThank you for shopping with BY_RUKAYYAH.`;
    localStorage.removeItem(CART_KEY);
    if (whatsappWindow) whatsappWindow.location.href = `https://wa.me/2347035106484?text=${encodeURIComponent(message)}`;
    await renderCart();
  } catch (error) {
    if (whatsappWindow) whatsappWindow.close();
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderCart();
  document.getElementById("whatsappOrder")?.addEventListener("click", submitOrder);
});
