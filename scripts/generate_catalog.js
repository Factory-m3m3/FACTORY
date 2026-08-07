#!/usr/bin/env node
/**
 * Régénère catalog.json et catalog.html à partir de tous les fichiers
 * proofs/data/*.json présents dans le repo. Exécuté automatiquement par
 * le GitHub Action à chaque nouveau commit dans proofs/data/.
 *
 * Usage: node scripts/generate_catalog.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "proofs", "data");
const CATALOG_JSON = path.join(ROOT, "catalog.json");
const CATALOG_HTML = path.join(ROOT, "catalog.html");

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
  const cards = entries
    .map(
      (e) => `
      <a class="card" href="${escapeHtml(e.proofUrl)}">
        ${e.network ? `<div class="card-chain">${escapeHtml(e.network.replace(" Mainnet", ""))}</div>` : ""}
        <div class="card-title">${escapeHtml(e.tokenName || "")}</div>
        <div class="card-ticker">$${escapeHtml(e.tokenSymbol || "")}</div>
        <div class="card-date">${escapeHtml(formatDate(e.launchDate))}</div>
      </a>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Catalogue des lancements — Factory</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0b0e14; color: #e6e6e6; margin: 0; padding: 2rem; }
  h1 { text-align: center; margin-bottom: 0.25rem; }
  .subtitle { text-align: center; color: #8a92a6; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; max-width: 1100px; margin: 0 auto; }
  .card { display: block; background: #131722; border-radius: 10px; padding: 1.25rem; text-decoration: none; color: inherit; border: 1px solid #232838; transition: border-color 0.15s ease; }
  .card:hover { border-color: #7cc4ff; }
  .card-chain { display: inline-block; font-size: 0.7rem; color: #8a92a6; background: #1a1f2e; border: 1px solid #232838; border-radius: 999px; padding: 0.15rem 0.55rem; margin-bottom: 0.5rem; }
  .card-title { font-weight: 600; margin-bottom: 0.25rem; }
  .card-ticker { color: #7cc4ff; font-size: 0.9rem; margin-bottom: 0.5rem; }
  .card-date { color: #8a92a6; font-size: 0.78rem; }
  .empty { text-align: center; color: #8a92a6; margin-top: 3rem; }
</style>
</head>
<body>
  <h1>Catalogue des lancements Factory</h1>
  <div class="subtitle">${entries.length} token(s) lancé(s) — mis à jour automatiquement</div>
  <div class="grid">
    ${cards || ""}
  </div>
  ${entries.length === 0 ? '<div class="empty">Aucun lancement pour le moment.</div>' : ""}
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
