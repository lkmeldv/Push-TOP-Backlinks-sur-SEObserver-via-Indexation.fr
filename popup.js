const $ = (sel) => document.querySelector(sel);

const els = {
  balance: $("#balanceValue"),
  domain: $("#domainValue"),
  count: $("#countValue"),
  project: $("#projectSelect"),
  topN: $("#topN"),
  rescan: $("#rescanBtn"),
  submit: $("#submitBtn"),
  toggleUrls: $("#toggleUrls"),
  urls: $("#urlsList"),
  result: $("#result"),
  apiToken: $("#apiToken"),
  saveSettings: $("#saveSettings"),
  clearSettings: $("#clearSettings"),
  setupBanner: $("#setupBanner"),
  settingsPanel: $("#settingsPanel")
};

let cache = {
  urls: [],
  analyzedDomain: null,
  source: null
};

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp || { ok: false, error: "Pas de reponse" }));
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadFromContent() {
  const tab = await getActiveTab();
  if (!tab || !/^https:\/\/app\.seobserver\.com\/sites\/view\//.test(tab.url || "")) {
    return null;
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_BACKLINKS" }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        resolve(null);
      } else {
        resolve({
          urls: resp.urls || [],
          analyzedDomain: resp.analyzedDomain,
          source: tab.url
        });
      }
    });
  });
}

async function loadFromStorage() {
  const { lastScan } = await chrome.storage.local.get(["lastScan"]);
  if (!lastScan) return null;
  return {
    urls: lastScan.urls || [],
    analyzedDomain: lastScan.analyzedDomain,
    source: lastScan.source
  };
}

function renderCache() {
  els.domain.textContent = cache.analyzedDomain || "-";
  els.count.textContent = String(cache.urls.length);
  els.urls.replaceChildren();
  const limit = Math.min(cache.urls.length, 50);
  for (let i = 0; i < limit; i++) {
    const li = document.createElement("li");
    li.textContent = cache.urls[i];
    els.urls.appendChild(li);
  }
  if (cache.urls.length > limit) {
    const li = document.createElement("li");
    li.textContent = `(+${cache.urls.length - limit} autres)`;
    li.style.color = "#94a3b8";
    els.urls.appendChild(li);
  }
  els.submit.disabled = cache.urls.length === 0;
}

async function refresh() {
  const live = await loadFromContent();
  cache = live || (await loadFromStorage()) || cache;
  renderCache();
}

async function refreshBalance() {
  els.balance.textContent = "...";
  const r = await send({ type: "GET_BALANCE" });
  if (r.ok) {
    els.balance.textContent = formatNumber(r.balance);
  } else if (/token/i.test(r.error || "")) {
    els.balance.textContent = "?";
    els.balance.title = "Configure ton token API dans Reglages";
  } else {
    els.balance.textContent = "?";
  }
}

function formatNumber(n) {
  const num = Number(n);
  if (!isFinite(num)) return "?";
  return num.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

async function refreshProjects() {
  const r = await send({ type: "LIST_PROJECTS" });
  els.project.replaceChildren();
  const def = document.createElement("option");
  def.value = "";
  def.textContent = "- Aucun -";
  els.project.appendChild(def);
  if (!r.ok || !Array.isArray(r.projects)) return;
  for (const p of r.projects) {
    if (!p) continue;
    const opt = document.createElement("option");
    opt.value = String(p.id ?? p.project_id ?? "");
    const name = p.name || p.title || `Projet ${opt.value}`;
    const count = p.urls_count ?? p.url_count ?? p.count ?? null;
    opt.textContent = count != null ? `${name} (${count})` : name;
    els.project.appendChild(opt);
  }
  const { lastProject } = await chrome.storage.sync.get(["lastProject"]);
  if (lastProject) els.project.value = String(lastProject);
}

function showResult(ok, title, detail) {
  els.result.classList.remove("hidden", "ok", "err");
  els.result.classList.add(ok ? "ok" : "err");
  els.result.replaceChildren();
  const h = document.createElement("h3");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = detail || "";
  els.result.appendChild(h);
  els.result.appendChild(p);
}

async function onSubmit() {
  if (cache.urls.length === 0) return;
  const topN = Math.max(1, Math.min(1000, parseInt(els.topN.value || "100", 10)));
  const slice = cache.urls.slice(0, topN);
  const project_id = els.project.value || "";
  els.submit.disabled = true;
  els.submit.textContent = "Envoi en cours...";
  const r = await send({
    type: "SUBMIT_URLS",
    payload: { urls: slice, project_id: project_id || undefined }
  });
  els.submit.disabled = false;
  els.submit.textContent = "Envoyer a indexation.fr";
  if (r.ok) {
    await chrome.storage.sync.set({ lastProject: project_id });
    showResult(true, "Envoi reussi", `${r.result.total} URL(s) envoyee(s) en ${r.result.batches} batch(s).`);
    refreshBalance();
  } else {
    showResult(false, "Erreur", r.error || "Echec de l'envoi.");
  }
}

async function onRescan() {
  els.rescan.disabled = true;
  await refresh();
  els.rescan.disabled = false;
}

function onToggleUrls() {
  els.urls.classList.toggle("hidden");
  els.toggleUrls.textContent = els.urls.classList.contains("hidden") ? "Afficher" : "Masquer";
}

async function loadSettings() {
  const { apiToken } = await chrome.storage.sync.get(["apiToken"]);
  if (apiToken) els.apiToken.value = apiToken;
  toggleSetupBanner(!apiToken);
}

function toggleSetupBanner(show) {
  if (show) {
    els.setupBanner.classList.remove("hidden");
    els.settingsPanel.setAttribute("open", "");
  } else {
    els.setupBanner.classList.add("hidden");
  }
}

async function saveSettings() {
  const token = els.apiToken.value.trim();
  if (!token) {
    showResult(false, "Token vide", "Colle ton token API avant d'enregistrer.");
    return;
  }
  await chrome.storage.sync.set({ apiToken: token });
  els.saveSettings.textContent = "Enregistre";
  setTimeout(() => (els.saveSettings.textContent = "Enregistrer"), 1200);
  toggleSetupBanner(false);
  refreshBalance();
  refreshProjects();
}

async function clearSettings() {
  await chrome.storage.sync.remove(["apiToken"]);
  els.apiToken.value = "";
  toggleSetupBanner(true);
  els.balance.textContent = "?";
  showResult(true, "Token supprime", "Le token API a ete reinitialise.");
}

document.addEventListener("DOMContentLoaded", async () => {
  els.rescan.addEventListener("click", onRescan);
  els.submit.addEventListener("click", onSubmit);
  els.toggleUrls.addEventListener("click", onToggleUrls);
  els.saveSettings.addEventListener("click", saveSettings);
  els.clearSettings.addEventListener("click", clearSettings);

  await loadSettings();
  refreshBalance();
  refreshProjects();
  await refresh();
});
