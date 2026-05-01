const API_BASE = "https://indexation.fr/api/v1";
const PROJECT_NAME = "Seobserver index top backlinks";
const PROJECT_COLOR = "#1e3a8a";

async function getToken() {
  const { apiToken } = await chrome.storage.sync.get(["apiToken"]);
  if (!apiToken) {
    throw new Error("Token API manquant. Ouvre l'extension > Reglages pour le configurer.");
  }
  return apiToken;
}

async function apiFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function getBalance() {
  try {
    const tx = await apiFetch("/credits/transactions?page=1");
    const items = tx?.data || tx?.transactions || [];
    if (Array.isArray(items) && items.length > 0 && items[0].balance_after != null) {
      return Number(items[0].balance_after);
    }
  } catch {}
  const bal = await apiFetch("/credits/balance");
  return Number(bal?.balance ?? 0);
}

async function listAllProjects() {
  const all = [];
  let page = 1;
  for (let i = 0; i < 20; i++) {
    const resp = await apiFetch(`/projects?page=${page}`);
    const items = resp?.data || resp?.projects || (Array.isArray(resp) ? resp : []);
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    const lastPage = resp?.last_page;
    if (lastPage && page >= lastPage) break;
    if (items.length < 50 && !lastPage) break;
    page++;
  }
  return all;
}

async function findProjectByName(name) {
  const projects = await listAllProjects();
  const target = String(name).trim().toLowerCase();
  return projects.find(p => String(p?.name || "").trim().toLowerCase() === target) || null;
}

async function createProject(name) {
  return apiFetch("/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      color: PROJECT_COLOR,
      auto_index: true
    })
  });
}

async function ensureProject(name) {
  const cacheKey = `projectCache:${name}`;
  const cache = await chrome.storage.local.get([cacheKey]);
  const cached = cache[cacheKey];
  if (cached?.ulid) {
    return cached;
  }
  let project = await findProjectByName(name);
  if (!project) {
    const created = await createProject(name);
    project = created?.data || created?.project || created;
  }
  if (project?.ulid) {
    await chrome.storage.local.set({
      [cacheKey]: { ulid: project.ulid, id: project.id, name: project.name }
    });
  }
  return project;
}

async function submitUrls({ urls, project_id, site_id }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("Aucune URL a envoyer.");
  }
  const batches = [];
  for (let i = 0; i < urls.length; i += 500) {
    batches.push(urls.slice(i, i + 500));
  }
  const results = [];
  for (const batch of batches) {
    const body = { urls: batch };
    if (project_id) body.project_id = String(project_id);
    if (site_id) body.site_id = String(site_id);
    const res = await apiFetch("/urls", {
      method: "POST",
      body: JSON.stringify(body)
    });
    results.push(res);
  }
  return { batches: results.length, total: urls.length, responses: results };
}

async function submitTopBacklinks({ urls }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("Aucune URL extraite.");
  }
  const project = await ensureProject(PROJECT_NAME);
  if (!project?.ulid) {
    throw new Error("Impossible de creer/trouver le projet (ULID manquant).");
  }
  const result = await submitUrls({ urls, project_id: project.ulid });
  return { project, result };
}

async function listProjects() {
  return listAllProjects();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "GET_BALANCE": {
          const balance = await getBalance();
          sendResponse({ ok: true, balance });
          break;
        }
        case "LIST_PROJECTS": {
          const projects = await listProjects();
          sendResponse({ ok: true, projects });
          break;
        }
        case "SUBMIT_URLS": {
          const result = await submitUrls(msg.payload || {});
          sendResponse({ ok: true, result });
          break;
        }
        case "SUBMIT_TOP_BACKLINKS": {
          const out = await submitTopBacklinks(msg.payload || {});
          sendResponse({ ok: true, ...out });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Type inconnu" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
