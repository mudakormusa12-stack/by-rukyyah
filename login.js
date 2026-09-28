const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("loginError");

document.getElementById("togglePassword").addEventListener("click", (event) => {
  const visible = passwordInput.type === "password";
  passwordInput.type = visible ? "text" : "password";
  event.currentTarget.textContent = visible ? "Hide" : "Show";
  event.currentTarget.setAttribute("aria-pressed", String(visible));
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.textContent = "";
  const button = event.currentTarget.querySelector(".submit");
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password: passwordInput.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign in could not be completed.");
    window.location.replace("/admin.html");
  } catch (error) {
    errorMessage.textContent = error.message;
    passwordInput.select();
  } finally {
    button.disabled = false;
  }
});
