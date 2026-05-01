(() => {
  const CONTAINER_SELECTOR = "#site_view_top_backlinks";

  function isExtAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function safeStorageSet(data) {
    if (!isExtAlive()) return false;
    try {
      chrome.storage.local.set(data);
      return true;
    } catch {
      return false;
    }
  }

  function getContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

  function getAnalyzedDomain(container) {
    if (container) {
      const id = container.getAttribute("data-site-id");
      if (id) return id.toLowerCase();
    }
    const m = location.pathname.match(/\/sites\/view\/([^/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]).toLowerCase();
    return null;
  }

  function isHttpUrl(s) {
    return typeof s === "string" && /^https?:\/\//i.test(s.trim());
  }

  function extractTopBacklinks() {
    const container = getContainer();
    const analyzedDomain = getAnalyzedDomain(container);
    const urls = [];
    const seen = new Set();

    if (!container) {
      return { analyzedDomain, urls, found: false };
    }

    // Source primaire : data-complete-string (URL non tronquee)
    const cells = container.querySelectorAll("td[data-complete-string]");
    cells.forEach((td) => {
      const raw = (td.getAttribute("data-complete-string") || "").trim();
      if (!isHttpUrl(raw)) return;
      const cleaned = raw.split("#")[0];
      if (seen.has(cleaned)) return;
      seen.add(cleaned);
      urls.push(cleaned);
    });

    // Fallback : anchors .lasturl si jamais data-complete-string manque
    if (urls.length === 0) {
      const anchors = container.querySelectorAll("a.lasturl[href^='http']");
      anchors.forEach((a) => {
        const href = (a.getAttribute("href") || "").trim();
        if (!isHttpUrl(href)) return;
        const cleaned = href.split("#")[0];
        if (seen.has(cleaned)) return;
        seen.add(cleaned);
        urls.push(cleaned);
      });
    }

    return { analyzedDomain, urls, found: true };
  }

  function injectFloatingButton() {
    if (document.getElementById("idxfr-fab")) return;
    const fab = document.createElement("button");
    fab.id = "idxfr-fab";
    fab.type = "button";
    fab.title = "Envoyer les top backlinks a indexation.fr";
    const dot = document.createElement("span");
    dot.className = "idxfr-dot";
    const label = document.createElement("span");
    label.className = "idxfr-label";
    label.textContent = "Indexer top backlinks";
    fab.appendChild(dot);
    fab.appendChild(label);
    fab.addEventListener("click", async () => {
      if (fab.dataset.busy === "1") return;
      if (!isExtAlive()) {
        flashToast("Extension rechargee. Recharge la page SEObserver (F5).", "warn");
        return;
      }
      const { urls, analyzedDomain, found } = extractTopBacklinks();
      safeStorageSet({
        lastScan: { when: Date.now(), source: location.href, analyzedDomain, urls, found }
      });
      if (!found) {
        flashToast("Bloc Top Backlinks introuvable sur cette page.", "warn");
        return;
      }
      if (urls.length === 0) {
        flashToast("Aucune URL detectee dans Top Backlinks.", "warn");
        return;
      }
      fab.dataset.busy = "1";
      const originalText = label.textContent;
      label.textContent = `Envoi ${urls.length} URL${urls.length > 1 ? "s" : ""}...`;
      flashToast(`Envoi de ${urls.length} URL${urls.length > 1 ? "s" : ""} a indexation.fr...`, "info");
      try {
        const resp = await sendMessage({
          type: "SUBMIT_TOP_BACKLINKS",
          payload: { urls, analyzedDomain }
        });
        if (resp?.ok) {
          const projectName = resp.project?.name || "Seobserver";
          flashToast(`OK - ${resp.result?.total || urls.length} URLs envoyees au projet "${projectName}".`, "ok");
        } else {
          flashToast(`Erreur: ${resp?.error || "envoi echoue"}`, "err");
        }
      } catch (e) {
        flashToast(`Erreur: ${e?.message || e}`, "err");
      } finally {
        label.textContent = originalText;
        fab.dataset.busy = "0";
      }
    });
    document.body.appendChild(fab);
  }

  function flashToast(text, kind) {
    let t = document.getElementById("idxfr-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "idxfr-toast";
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.remove("ok", "err", "warn", "info");
    if (kind) t.classList.add(kind);
    t.classList.add("show");
    clearTimeout(window.__idxfrToastTimer);
    const dur = kind === "err" ? 6000 : 4000;
    window.__idxfrToastTimer = setTimeout(() => t.classList.remove("show"), dur);
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      if (!isExtAlive()) {
        resolve({ ok: false, error: "Extension context invalidated" });
        return;
      }
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { ok: false, error: "Pas de reponse" });
          }
        });
      } catch (e) {
        resolve({ ok: false, error: e?.message || String(e) });
      }
    });
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "EXTRACT_BACKLINKS") {
        const data = extractTopBacklinks();
        sendResponse({ ok: true, ...data });
      }
    });
  } catch {}

  function initialScan() {
    if (!isExtAlive()) {
      stopObserver();
      return;
    }
    const { urls, analyzedDomain, found } = extractTopBacklinks();
    safeStorageSet({
      lastScan: {
        when: Date.now(),
        source: location.href,
        analyzedDomain,
        urls,
        found
      }
    });
  }

  setTimeout(() => {
    injectFloatingButton();
    initialScan();
  }, 1200);

  let mutTimer = null;
  let obs = null;

  function stopObserver() {
    if (obs) {
      try { obs.disconnect(); } catch {}
      obs = null;
    }
    if (mutTimer) {
      clearTimeout(mutTimer);
      mutTimer = null;
    }
  }

  obs = new MutationObserver(() => {
    if (!isExtAlive()) {
      stopObserver();
      return;
    }
    if (mutTimer) clearTimeout(mutTimer);
    mutTimer = setTimeout(initialScan, 1500);
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
