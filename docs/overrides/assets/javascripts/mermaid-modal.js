/**
 * Expand-to-modal for mermaid diagrams.
 *
 * Mermaid v11 renders SVGs inside a closed Shadow DOM, making them
 * inaccessible to JS (can't clone or re-render). Instead, this script
 * physically moves the rendered element into a fullscreen overlay on
 * expand, then moves it back on close.
 */
(function () {
  function addButtons() {
    document.querySelectorAll(".mermaid").forEach(function (el) {
      if (el.dataset.mermaidExpand) return;
      el.dataset.mermaidExpand = "true";

      // Wrap in a positioned container for the button overlay
      var wrapper = document.createElement("div");
      wrapper.className = "mermaid-wrapper";
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);

      var btn = document.createElement("button");
      btn.className = "mermaid-expand-btn";
      btn.title = "Expand diagram";
      btn.innerHTML = "&#x2922;";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openModal(el, wrapper);
      });
      wrapper.appendChild(btn);
    });
  }

  function openModal(mermaidEl, wrapper) {
    // Placeholder marks the original position
    var placeholder = document.createElement("div");
    placeholder.style.display = "none";
    wrapper.insertBefore(placeholder, mermaidEl);

    // Build overlay
    var overlay = document.createElement("div");
    overlay.className = "mermaid-modal-overlay";

    var closeBtn = document.createElement("button");
    closeBtn.className = "mermaid-modal-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", function () { cleanup(); });

    var content = document.createElement("div");
    content.className = "mermaid-modal-content";

    // Move the live element (with its closed shadow root) into the modal
    content.appendChild(mermaidEl);

    overlay.appendChild(closeBtn);
    overlay.appendChild(content);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) cleanup();
    });

    document.body.appendChild(overlay);

    function cleanup() {
      // Move element back to its original position
      wrapper.insertBefore(mermaidEl, placeholder);
      placeholder.remove();
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") cleanup();
    }
    document.addEventListener("keydown", onKey);
  }

  // --- Init: poll for mermaid render completion, observe SPA navigations ---
  function init() {
    [300, 800, 1500, 3000].forEach(function (ms) {
      setTimeout(addButtons, ms);
    });

    var observer = new MutationObserver(function () {
      setTimeout(addButtons, 300);
    });
    var target = document.querySelector(".md-content") || document.body;
    observer.observe(target, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
