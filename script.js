const CART_KEY = "byRukyyahCart";
const PRODUCT_KEY = "byRukyyahProducts";

const defaultProducts = [
  { name: "Elegant Kaftan", price: 35000, image: "images/product-1.jpg", category: "kaftans", description: "Statement style for special moments.", soldOut: false },
  { name: "Luxury Kaftan", price: 45000, image: "images/product-2.jpg", category: "kaftans", description: "Effortless elegance with a premium feel.", soldOut: false },
  { name: "Beauty Collection", price: 18000, image: "images/product-3.jpg", category: "makeup", description: "Beauty essentials for your everyday look.", soldOut: false },
  { name: "Signature Jewellery", price: 12500, image: "images/product-4.jpg", category: "jewellery", description: "Elegant finishing touches for every outfit.", soldOut: false },
  { name: "Premium Phone Accessory", price: 8500, image: "images/product-5.jpg", category: "accessories", description: "Style and protection for your everyday device.", soldOut: false },
  { name: "Signature Accessory", price: 10000, image: "images/product-6.jpg", category: "accessories", description: "A polished addition to your collection.", soldOut: false }
];

function getProducts(){
  try {
    const saved = localStorage.getItem(PRODUCT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((product) => !(product.name === "Kafta" && Number(product.price || 0) === 0))
          .map((product) => ({
            name: product.name,
            price: Number(product.price || 0),
            image: product.image || "images/product-1.jpg",
            category: product.category || "kaftans",
            description: product.description || "Curated for the BY_RUKAYYAH collection.",
            soldOut: Boolean(product.soldOut)
          }));
        if (normalized.length) return normalized;
      }
    }
  } catch (error) {
    console.warn("Failed to load store products:", error);
  }

  localStorage.setItem(PRODUCT_KEY, JSON.stringify(defaultProducts));
  return defaultProducts;
}

function saveProducts(products){
  localStorage.setItem(PRODUCT_KEY, JSON.stringify(products));
}

function getCart(){
  try{
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  }catch(e){
    return [];
  }
}

function saveCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function updateBagCount(){
  const cart = getCart();
  const count = cart.reduce((total,item)=>total + item.quantity,0);
  document.querySelectorAll("#bagCount").forEach(el=>{
    el.textContent = count;
  });
}

function renderShopProducts(){
  const shopContainer = document.getElementById("products");
  if (!shopContainer) return;

  const products = getProducts();

  shopContainer.innerHTML = products.map((product) => `
    <article class="product-card" data-category="${product.category}" data-name="${product.name}">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}">
        <span>${product.category.toUpperCase()}</span>
      </div>
      <div class="product-info">
        <h2>${product.name}</h2>
        <p>${product.description || "Curated for the BY_RUKAYYAH collection."}</p>
        <strong>₦${Number(product.price).toLocaleString("en-NG")}</strong>
        <a class="product-view" href="product.html?product=${encodeURIComponent(product.name)}">VIEW PRODUCT</a>
        <button class="add-cart" data-name="${product.name}" data-price="${product.price}" data-image="${product.image}" ${product.soldOut ? "disabled aria-disabled='true'" : ""}>
          ${product.soldOut ? "SOLD OUT" : "ADD TO BAG"}
        </button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".add-cart").forEach((button) => {
    button.addEventListener("click", () => addToBag(button));
  });

  const filters = document.querySelectorAll(".filter");
  const searchInput = document.querySelector("#searchInput");
  const filterProducts = () => {
    const active = document.querySelector(".filter.active")?.dataset.category || "all";
    const search = (searchInput?.value || "").toLowerCase().trim();
    const cards = document.querySelectorAll(".product-card");

    cards.forEach((card) => {
      const category = card.dataset.category;
      const name = (card.dataset.name || "").toLowerCase();
      const categoryMatch = active === "all" || category === active;
      const searchMatch = !search || name.includes(search);
      card.style.display = categoryMatch && searchMatch ? "" : "none";
    });
  };

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      filters.forEach((item) => item.classList.remove("active"));
      filter.classList.add("active");
      filterProducts();
    });
  });

  searchInput?.addEventListener("input", filterProducts);
}

function renderProductDetail(){
  const productNameEl = document.getElementById("productName");
  const productPriceEl = document.getElementById("productPrice");
  const productImageEl = document.getElementById("productImage");
  const productCategoryEl = document.getElementById("productCategory");
  const addProductBtn = document.getElementById("addProduct");
  const productDescription = document.querySelector(".product-description");

  if (!productNameEl || !productPriceEl || !productImageEl || !productCategoryEl || !addProductBtn) return;

  const params = new URLSearchParams(window.location.search);
  const requestedName = params.get("product");
  const products = getProducts();
  const selectedProduct = products.find((product) => product.name === decodeURIComponent(requestedName || "")) || products[0];

  if (!selectedProduct) return;

  productNameEl.textContent = selectedProduct.name;
  productPriceEl.textContent = "₦" + Number(selectedProduct.price || 0).toLocaleString("en-NG");
  productImageEl.src = selectedProduct.image || "images/product-1.jpg";
  productImageEl.alt = selectedProduct.name;
  productCategoryEl.textContent = selectedProduct.category.toUpperCase();
  if (productDescription) {
    productDescription.textContent = selectedProduct.description || "Curated for the BY_RUKAYYAH collection.";
  }

  if (selectedProduct.soldOut) {
    addProductBtn.textContent = "SOLD OUT";
    addProductBtn.disabled = true;
    addProductBtn.style.opacity = "0.7";
    addProductBtn.style.cursor = "not-allowed";
    addProductBtn.title = "This product is sold out";
    return;
  }

  addProductBtn.textContent = "ADD TO BAG";
  addProductBtn.disabled = false;
  addProductBtn.title = "";
  addProductBtn.style.opacity = "1";
  addProductBtn.style.cursor = "pointer";
}

function addToBag(button){
  const name = button.dataset.name;
  const price = Number(button.dataset.price);
  const image = button.dataset.image;
  const product = getProducts().find((item) => item.name === name);

  if (product && product.soldOut) {
    alert("This item is sold out and cannot be added to the bag.");
    return;
  }

  const cart = getCart();
  const existing = cart.find(item=>item.name === name);

  if(existing){
    existing.quantity += 1;
  }else{
    cart.push({
      name,
      price,
      image,
      quantity:1
    });
  }

  saveCart(cart);
  updateBagCount();

  const original = button.textContent;
  button.textContent = "ADDED ✓";

  setTimeout(()=>{
    button.textContent = original;
  },1200);
}

document.addEventListener("DOMContentLoaded",()=>{
  updateBagCount();

  const shopContainer = document.getElementById("products");
  if (shopContainer) {
    renderShopProducts();
  }

  renderProductDetail();

  document.querySelectorAll(".add-cart").forEach(button=>{
    button.addEventListener("click",()=>{
      addToBag(button);
    });
  });

  const filters = document.querySelectorAll(".filter");
  const products = document.querySelectorAll(".product-card");
  const searchInput = document.querySelector("#searchInput");

  function filterProducts(){
    const active = document.querySelector(".filter.active")?.dataset.category || "all";
    const search = (searchInput?.value || "").toLowerCase().trim();

    products.forEach(product=>{
      const category = product.dataset.category;
      const name = (product.dataset.name || "").toLowerCase();

      const categoryMatch = active === "all" || category === active;
      const searchMatch = !search || name.includes(search);

      product.style.display = categoryMatch && searchMatch ? "" : "none";
    });
  }

  filters.forEach(filter=>{
    filter.addEventListener("click",()=>{
      filters.forEach(item=>item.classList.remove("active"));
      filter.classList.add("active");
      filterProducts();
    });
  });

  searchInput?.addEventListener("input",filterProducts);

  const addProductButton = document.getElementById("addProduct");
  if (addProductButton) {
    addProductButton.addEventListener("click", () => {
      const params = new URLSearchParams(window.location.search);
      const requestedName = params.get("product");
      const selectedProduct = getProducts().find((product) => product.name === decodeURIComponent(requestedName || "")) || getProducts()[0];
      if (!selectedProduct) return;
      if (selectedProduct.soldOut) {
        alert("This product is sold out and cannot be added to the bag.");
        return;
      }

      const cart = getCart();
      const existing = cart.find(item => item.name === selectedProduct.name);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({
          name: selectedProduct.name,
          price: Number(selectedProduct.price || 0),
          image: selectedProduct.image || "images/product-1.jpg",
          quantity: 1
        });
      }

      saveCart(cart);
      updateBagCount();

      addProductButton.textContent = "ADDED ✓";
      setTimeout(() => {
        addProductButton.textContent = selectedProduct.soldOut ? "SOLD OUT" : "ADD TO BAG";
      }, 1200);
    });
  }
});

// Hidden admin access: double-click the last homepage photo

document.addEventListener("DOMContentLoaded",()=>{
  const adminPhoto = document.querySelector(".last-home-image");
  if(!adminPhoto) return;

  adminPhoto.addEventListener("dblclick",()=>{
    window.location.href = "admin.html";
  });
});
