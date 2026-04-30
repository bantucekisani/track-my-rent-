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

function getApiBase() {
  if (typeof window.API_URL === "string" && window.API_URL) {
    return window.API_URL;
  }

  const { protocol, hostname, origin, port } = window.location;
  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocalHost && port && port !== "5000") {
    return `${protocol}//${hostname}:5000/api`;
  }

  return `${origin}/api`;
}

const API_URL = getApiBase();

const canvas = document.getElementById("signatureCanvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let signToken = null;

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  signToken = params.get("token");

  if (!signToken) {
    notify("Invalid or expired signing link");
    window.location.href = "invalid-link.html"; // optional
    return;
  }

  resizeCanvas();
  attachCanvasEvents();
});

/* =========================
   CANVAS SETUP
========================= */
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;

  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000";
}

function attachCanvasEvents() {
  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDraw);
  canvas.addEventListener("mouseleave", stopDraw);

  canvas.addEventListener("touchstart", startDraw);
  canvas.addEventListener("touchmove", draw);
  canvas.addEventListener("touchend", stopDraw);
}

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  ctx.beginPath();
  const pos = getPosition(e);
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!drawing) return;
  e.preventDefault();
  const pos = getPosition(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function stopDraw() {
  drawing = false;
  ctx.closePath();
}

function getPosition(e) {
  const rect = canvas.getBoundingClientRect();

  if (e.touches && e.touches[0]) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    };
  }

  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

/* =========================
   CLEAR SIGNATURE
========================= */
function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
window.clearSignature = clearSignature;

/* =========================
   SUBMIT SIGNATURE
========================= */
async function submitSignature() {
  if (!signToken) {
    notify("Invalid signing session");
    return;
  }

  // Prevent blank signature
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;

  if (canvas.toDataURL() === blank.toDataURL()) {
    notify("Please sign before submitting");
    return;
  }

  const signature = canvas.toDataURL("image/png");

  try {
    const res = await fetch(`${API_URL}/leases/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: signToken,
        signature
      })
    });

    const data = await res.json();

    if (!res.ok) {
      notify(data.message || "Failed to sign lease");
      return;
    }

    // Success page
    window.location.href = "signed.html";

  } catch (err) {
    console.error("SIGN ERROR:", err);
    notify("Server error while signing lease");
  }
}

window.submitSignature = submitSignature;

