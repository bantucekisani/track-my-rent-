(function initToastSystem() {
  function ensureStack() {
    let stack = document.getElementById("toastStack");

    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toastStack";
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }

    return stack;
  }

  function ensureConfirmDialog() {
    let overlay = document.getElementById("confirmOverlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "confirmOverlay";
      overlay.className = "confirm-overlay";
      overlay.innerHTML = `
        <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <h3 id="confirmTitle">Please confirm</h3>
          <p id="confirmMessage"></p>
          <div class="confirm-actions">
            <button id="confirmCancelBtn" type="button" class="confirm-btn cancel">Cancel</button>
            <button id="confirmAcceptBtn" type="button" class="confirm-btn accept">Continue</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    return overlay;
  }

  window.showToast = function showToast(message, type = "info", duration = 2800) {
    const stack = ensureStack();
    const toast = document.createElement("div");

    toast.className = `toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 200);
    }, duration);
  };

  window.showConfirmDialog = function showConfirmDialog(message, options = {}) {
    const overlay = ensureConfirmDialog();
    const title = overlay.querySelector("#confirmTitle");
    const messageEl = overlay.querySelector("#confirmMessage");
    const acceptBtn = overlay.querySelector("#confirmAcceptBtn");
    const cancelBtn = overlay.querySelector("#confirmCancelBtn");

    title.textContent = options.title || "Please confirm";
    messageEl.textContent = message;
    acceptBtn.textContent = options.confirmLabel || "Continue";
    cancelBtn.textContent = options.cancelLabel || "Cancel";

    overlay.classList.add("show");

    return new Promise(resolve => {
      const cleanup = result => {
        overlay.classList.remove("show");
        acceptBtn.removeEventListener("click", onAccept);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onOverlayClick);
        document.removeEventListener("keydown", onKeyDown);
        resolve(result);
      };

      const onAccept = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onOverlayClick = event => {
        if (event.target === overlay) {
          cleanup(false);
        }
      };
      const onKeyDown = event => {
        if (event.key === "Escape") {
          cleanup(false);
        }
      };

      acceptBtn.addEventListener("click", onAccept);
      cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeyDown);
    });
  };
})();
