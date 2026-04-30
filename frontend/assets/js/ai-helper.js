function notify(message, type = "info") {
  if (window.showToast) {
    window.showToast(message, type);
    return;
  }

  window.alert(message);
}

function confirmAction(message) {
  return window.confirm(message);
}
async function askAI() {
  const input = document.getElementById("aiQuestion");
  const output = document.getElementById("aiAnswer");

  if (!input || !output) {
    notify("AI UI elements missing");
    return;
  }

  const question = input.value.trim();
  if (!question) {
    notify("Please type a question");
    return;
  }

  output.textContent = "Thinking...";

  try {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || !user.token) {
      output.textContent = "Session expired. Please log in again.";
      return;
    }

    const res = await fetch(`${API_URL}/ai/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`
      },
      body: JSON.stringify({ question })
    });

    const data = await res.json();

    if (!res.ok) {
      output.textContent = data.message || "AI error";
      return;
    }

    output.textContent = data.answer || "No answer returned.";

  } catch (err) {
    console.error("AI ERROR:", err);
    output.textContent = "Server error. Try again.";
  }
}

