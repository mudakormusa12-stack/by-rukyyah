document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("ordersList");
  try {
    const response = await fetch("/api/admin/orders", { headers: { Accept: "application/json" } });
    if (response.status === 401) return window.location.replace("/admin-login.html");
    if (!response.ok) throw new Error("Orders could not be loaded.");
    const orders = await response.json();
    if (!orders.length) {
      container.innerHTML = '<div class="empty-cart"><h2>NO ORDERS YET</h2><p>Customer checkout activity will appear here.</p></div>';
      return;
    }
    container.innerHTML = orders.map((order) => `
      <article class="order-card">
        <div class="order-top"><div><span class="order-label">ORDER</span><h2>#${order.id}</h2></div><strong>₦${Number(order.total).toLocaleString("en-NG")}</strong></div>
        <div class="order-customer">
          <p><b>Name:</b> ${escapeOrder(order.customerName)}</p>
          <p><b>Phone:</b> ${escapeOrder(order.customerPhone)}</p>
          <p><b>Address:</b> ${escapeOrder(order.customerAddress)}</p>
          <p><b>City:</b> ${escapeOrder(order.customerCity)}</p>
          <p><b>Status:</b> ${escapeOrder(order.status)}</p>
        </div>
        <div class="order-items"><h3>ITEMS</h3>${order.items.map((item) => `<p>${escapeOrder(item.name)} × ${item.quantity} — ₦${(item.price * item.quantity).toLocaleString("en-NG")}</p>`).join("")}</div>
        <p class="order-date">${new Date(order.date).toLocaleString("en-NG")}</p>
      </article>
    `).join("");
  } catch (error) {
    container.textContent = error.message;
  }
});

function escapeOrder(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}
