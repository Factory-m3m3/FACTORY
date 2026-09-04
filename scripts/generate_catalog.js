#!/usr/bin/env node
/**
 * Régénère catalog.json et catalog.html à partir de tous les fichiers
 * proofs/data/*.json présents dans le repo. Exécuté automatiquement par
 * le GitHub Action à chaque nouveau commit dans proofs/data/.
 *
 * catalog.json reste une liste plate (inchangé, rétro-compatible avec
 * tout ce qui le lit déjà). catalog.html, lui, regroupe désormais les
 * lancements par chaîne (onglets cliquables, filtrage 100% côté client,
 * un seul fichier, pas de duplication de pages).
 *
 * Usage: node scripts/generate_catalog.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "proofs", "data");
const CATALOG_JSON = path.join(ROOT, "catalog.json");
const CATALOG_HTML = path.join(ROOT, "catalog.html");

// Chaînes du projet, dans l'ordre d'affichage des onglets. Un onglet est
// toujours affiché même à 0 lancement — ça sert de "réservation de place"
// pour les chaînes pas encore actives (Uniswap V3 : Ethereum/Arbitrum/
// Base/Polygon/Optimism), pour enchaîner sans retoucher ce fichier.
// La clé sert d'identifiant interne stable (slug d'onglet).
const CHAINS = [
  { key: "robinhood", label: "Robinhood Chain", chainId: 4663 },
  { key: "bsc", label: "BSC", chainId: 56 },
  { key: "ethereum", label: "Ethereum", chainId: 1 },
  { key: "arbitrum", label: "Arbitrum", chainId: 42161 },
  { key: "base", label: "Base", chainId: 8453 },
  { key: "polygon", label: "Polygon", chainId: 137 },
  { key: "optimism", label: "Optimism", chainId: 10 },
];

function chainKeyFor(entry) {
  const match = CHAINS.find((c) => c.chainId === Number(entry.chainId));
  return match ? match.key : "other";
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`Aucun dossier ${DATA_DIR} trouvé, rien à générer.`);
    fs.writeFileSync(CATALOG_JSON, JSON.stringify([], null, 2));
    fs.writeFileSync(CATALOG_HTML, renderCatalogHtml([]));
    return;
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"));

  const entries = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      } catch (err) {
        console.error(`Fichier invalide ignoré: ${f} (${err.message})`);
        return null;
      }
    })
    .filter(Boolean)
    // Les plus récents en premier
    .sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));

  fs.writeFileSync(CATALOG_JSON, JSON.stringify(entries, null, 2));
  fs.writeFileSync(CATALOG_HTML, renderCatalogHtml(entries));

  console.log(`Catalogue régénéré: ${entries.length} token(s).`);
}

function renderCatalogHtml(entries) {
  // Regroupe les entrées par chaîne connue ; tout chainId non reconnu
  // atterrit dans un onglet "Autres" plutôt que de disparaître.
  const groups = {};
  for (const c of CHAINS) groups[c.key] = [];
  groups.other = [];

  for (const e of entries) {
    groups[chainKeyFor(e)].push(e);
  }

  const tabsConfig = [...CHAINS, { key: "other", label: "Autres", chainId: null }];

  const tabButtons = tabsConfig
    .map(
      (c, i) => `
      <button class="tab${i === 0 ? " active" : ""}" data-tab="${c.key}" onclick="showTab('${c.key}')">
        ${escapeHtml(c.label)} <span class="count">${groups[c.key].length}</span>
      </button>`
    )
    .join("\n");

  const tabPanels = tabsConfig
    .map((c, i) => {
      const list = groups[c.key];
      const cards = list
        .map(
          (e) => `
      <a class="card" href="${escapeHtml(e.proofUrl)}">
        <div class="card-title">${escapeHtml(e.tokenName || "")}</div>
        <div class="card-ticker">$${escapeHtml(e.tokenSymbol || "")}</div>
        <div class="card-date">${escapeHtml(formatDate(e.launchDate))}</div>
      </a>`
        )
        .join("\n");

      return `
    <div class="panel${i === 0 ? " active" : ""}" id="panel-${c.key}">
      <div class="grid">
        ${cards || ""}
      </div>
      ${list.length === 0 ? '<div class="empty">Aucun lancement sur cette chaîne pour le moment.</div>' : ""}
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Launch Catalog — Factory</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0b0e14; color: #e6e6e6; margin: 0; padding: 2rem; }
  h1 { text-align: center; margin-bottom: 0.25rem; }
  .subtitle { text-align: center; color: #8a92a6; margin-bottom: 1.75rem; }
  .tabs { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; max-width: 1100px; margin: 0 auto 2rem; }
  .tab { font-family: inherit; font-size: 0.85rem; background: #131722; color: #8a92a6; border: 1px solid #232838; border-radius: 999px; padding: 0.5rem 1rem; cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease; }
  .tab:hover { color: #e6e6e6; border-color: #3a4258; }
  .tab.active { color: #0b0e14; background: #7cc4ff; border-color: #7cc4ff; font-weight: 600; }
  .tab .count { opacity: 0.7; margin-left: 0.15rem; }
  .panel { display: none; }
  .panel.active { display: block; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; max-width: 1100px; margin: 0 auto; }
  .card { display: block; background: #131722; border-radius: 10px; padding: 1.25rem; text-decoration: none; color: inherit; border: 1px solid #232838; transition: border-color 0.15s ease; }
  .card:hover { border-color: #7cc4ff; }
  .card-title { font-weight: 600; margin-bottom: 0.25rem; }
  .card-ticker { color: #7cc4ff; font-size: 0.9rem; margin-bottom: 0.5rem; }
  .card-date { color: #8a92a6; font-size: 0.78rem; }
  .empty { text-align: center; color: #8a92a6; margin-top: 3rem; }
</style>
</head>
<body>
  <h1>Factory Launch Catalog</h1>
  <div class="subtitle">${entries.length} token(s) launched in total — updated automatically</div>
  <div class="subtitle" style="margin-top:10px"><a href="index.html">Launch a token</a> &middot; <a href="transparency-en.html">Proofs &amp; guarantees</a> &middot; <a href="transparency-fr.html">Preuves (FR)</a></div>
  <div class="tabs">
    ${tabButtons}
  </div>
  ${tabPanels}
  <script>
    function showTab(key) {
      document.querySelectorAll('.tab').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === key);
      });
      document.querySelectorAll('.panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.id === 'panel-' + key);
      });
    }
  </script>
</body>
</html>`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main();
