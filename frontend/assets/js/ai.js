async function askAI() {
  const question = document.getElementById("aiQuestion").value;
  const answerBox = document.getElementById("aiAnswer");

  if (!question) return;

  const user = JSON.parse(localStorage.getItem("user"));

  const res = await fetch(`${API_URL}/ai/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.token}`
    },
    body: JSON.stringify({ question })
  });

  const data = await res.json();
  answerBox.textContent = data.answer || "No response";
}
