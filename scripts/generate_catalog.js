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
 * 11/09/2026 — Factory à métadonnées : le Worker v2 écrit désormais dans
 * proofs/data/<chainId>/<adresse>.json (sous-dossier par chaîne). La lecture
 * est donc RÉCURSIVE ; les anciens fichiers à plat (proofs/data/<ticker>.json)
 * restent lus tels quels. Les cartes affichent le logo quand le Worker l'a
 * contrôlé (logoCheck.status === "ok") — sinon l'image ApexPad Forge du site —
 * et un badge « metadata on-chain ».
 *
 * Usage: node scripts/generate_catalog.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "proofs", "data");
const CATALOG_JSON = path.join(ROOT, "catalog.json");
const CATALOG_HTML = path.join(ROOT, "catalog.html");
const TOKENLIST_JSON = path.join(ROOT, "tokenlist.json");
// Base publique du site, utilisée pour les URL absolues de tokenlist.json
// (un agrégateur lit ce fichier depuis chez lui : les chemins relatifs
// ne lui servent à rien).
const SITE = "https://factory.apexpad.io";

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
  { key: "arc", label: "Arc", chainId: 5042 }, // ajouté le 17/09/2026 (Factory Arc dédiée)
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
    fs.writeFileSync(TOKENLIST_JSON, renderTokenList([]));
    return;
  }

  const files = listJsonFiles(DATA_DIR);

  const entries = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(f, "utf8"));
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
  fs.writeFileSync(TOKENLIST_JSON, renderTokenList(entries));

  console.log(`Catalogue régénéré: ${entries.length} token(s).`);
  console.log(`tokenlist.json régénéré depuis les mêmes entrées.`);
}

function listJsonFiles(dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...listJsonFiles(full));
    else if (d.isFile() && d.name.endsWith(".json")) out.push(full);
  }
  return out.sort();
}

// N'affiche un logo que s'il a été contrôlé par le Worker (PNG 256×256
// ≤ 100 Ko, servi par Arweave/IPFS) — jamais une URL arbitraire.
function logoFor(e) {
  const c = e.logoCheck;
  // Sans logo contrôlé (ou lancement de l'ancienne Factory) : image ApexPad
  // Forge du site, affichage seulement.
  const FORGE = "apexpad-forge-logo.png";
  if (!c || c.status !== "ok" || typeof c.gatewayUrl !== "string") return FORGE;
  if (!/^https:\/\/(arweave\.net|ipfs\.io)\//.test(c.gatewayUrl)) return FORGE;
  return c.gatewayUrl;
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
        <img class="card-logo" src="${escapeHtml(logoFor(e))}" alt="" loading="lazy" width="40" height="40">
        <div class="card-title">${escapeHtml(e.tokenName || "")}</div>
        <div class="card-ticker">$${escapeHtml(e.tokenSymbol || "")}</div>
        <div class="card-date">${escapeHtml(formatDate(e.launchDate))}</div>
        ${e.schema >= 2 ? '<div class="card-badge">metadata on-chain</div>' : ""}
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
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-55GLFJLMM8"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-55GLFJLMM8');</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Launch Catalog — Factory</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0b0e14; color: #e6e6e6; margin: 0; padding: 2rem; }
  h1 { text-align: center; margin-bottom: 0.25rem; }
  .forge-banner { display: block; width: 100%; max-width: 1100px; height: auto; aspect-ratio: 1794 / 592; object-fit: cover; margin: 0 auto 1.5rem; border-radius: 14px; border: 1px solid #232838; }
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
  .card-logo { width: 40px; height: 40px; border-radius: 10px; float: right; object-fit: cover; border: 1px solid #232838; }
  .card-badge { display: inline-block; margin-top: 0.5rem; font-size: 0.68rem; color: #6fd39a; border: 1px solid #2d4a3a; border-radius: 999px; padding: 0.1rem 0.5rem; }
  .empty { text-align: center; color: #8a92a6; margin-top: 3rem; }
</style>
</head>
<body>
  <img class="forge-banner" src="apexpad-forge-banner.jpg" alt="ApexPad Forge" width="1794" height="592">
  <h1>Factory Launch Catalog</h1>
  <div class="subtitle">${entries.length} token(s) launched in total — updated automatically</div>
  <div class="subtitle" style="margin-top:10px"><a href="https://apexpad.io/">Launch a token</a> &middot; <a href="transparency-en.html">Proofs &amp; guarantees</a> &middot; <a href="transparency-fr.html">Preuves (FR)</a></div>
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

// ═══════════════════════════════════════════════════════════════════════
//  tokenlist.json — format Uniswap Token List (schéma tokenlist.org)
//
//  POURQUOI CE FICHIER EXISTE
//  catalog.json est un format maison. Aucun agrégateur n'écrira un
//  adaptateur pour un format qu'il est seul à rencontrer : c'est
//  exactement le frein constaté chez Bitquery, Mobula et DexScreener.
//  tokenlist.json contient les MÊMES données dans l'emballage que tout
//  le monde sait déjà lire (portefeuilles, DEX, agrégateurs, Ave.ai).
//  La demande d'intégration cesse d'être « écrivez un décodeur pour
//  nous » et devient « voici un fichier standard, servez-vous ».
//
//  URL stable attendue : https://factory.apexpad.io/tokenlist.json
//
//  Deux conversions obligatoires, sinon le fichier est inutilisable :
//   1. Le logo est stocké on-chain en ar:// (choix délibéré : contenu
//      adressé, il ne peut pas changer après le lancement). Aucun
//      consommateur de token list ne sait résoudre ar:// — on publie
//      donc l'URL de passerelle https, qui sert exactement le même
//      octet-pour-octet puisque l'identifiant EST l'empreinte.
//   2. Le schéma tokenlist impose des motifs stricts sur `name` et
//      `symbol`. Un nom on-chain qui sort du motif ne doit pas rendre
//      TOUT le fichier invalide : on nettoie ce champ-là, on ne jette
//      pas le jeton.
// ═══════════════════════════════════════════════════════════════════════

// ar://<43 car.> et ipfs://<cid> → URL https. Même contenu, adresse
// lisible par un client HTTP ordinaire.
function gatewayUrlFor(uri) {
  if (typeof uri !== "string") return "";
  const ar = /^ar:\/\/([A-Za-z0-9_-]{43})$/.exec(uri);
  if (ar) return "https://arweave.net/" + ar[1];
  const ip = /^ipfs:\/\/([A-Za-z0-9]+(?:\/[A-Za-z0-9._-]+)*)$/.exec(uri);
  if (ip) return "https://ipfs.io/ipfs/" + ip[1];
  return "";
}

// Motif `name` du schéma tokenlist, longueur max 40.
function tokenListName(v) {
  return String(v || "")
    .replace(/[^ \w.'+\-%/:&\[\]()À-ÖØ-öø-ÿ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

// Motif `symbol` du schéma tokenlist, longueur max 20.
function tokenListSymbol(v) {
  return String(v || "").replace(/[^a-zA-Z0-9+\-%/$.]/g, "").slice(0, 20);
}

// `extensions` est plafonné à 10 clés par le schéma : on garde ce qu'un
// intégrateur utilise vraiment, dans cet ordre de priorité.
function tokenListExtensions(e) {
  const md = e.metadata || {};
  const so = md.socials || {};
  const ext = { launchpad: "ApexPad" };
  if (e.factoryAddress) ext.factory = String(e.factoryAddress).toLowerCase();
  if (e.poolAddress) ext.pool = String(e.poolAddress).toLowerCase();
  const tx = e.launchTxHash || e.txHashPositionTransfer;
  if (tx) ext.launchTx = String(tx).toLowerCase();
  if (e.proofUrl) ext.proof = SITE + "/" + String(e.proofUrl).replace(/^\/+/, "");
  if (so.website) ext.website = so.website;
  if (so.twitter) ext.twitter = so.twitter;
  if (so.telegram) ext.telegram = so.telegram;
  return ext;
}

function renderTokenList(entries) {
  const tokens = entries
    .map((e) => {
      const address = String(e.tokenAddress || "").toLowerCase();
      const name = tokenListName(e.tokenName);
      const symbol = tokenListSymbol(e.tokenSymbol);
      if (!/^0x[a-f0-9]{40}$/.test(address) || !name || !symbol) return null;
      const t = {
        chainId: Number(e.chainId),
        address,
        name,
        symbol,
        decimals: e.decimals == null ? 18 : Number(e.decimals),
      };
      // Le logo n'est publié que s'il est content-addressé (ar:// ou
      // ipfs://), c'est-à-dire tel que le contrat l'a figé. On ne
      // remplace jamais par l'image générique du site : une token list
      // qui prétend qu'un jeton a un logo alors qu'il n'en a pas est
      // pire qu'une entrée sans logo.
      const logo = gatewayUrlFor((e.metadata || {}).logo);
      if (logo) t.logoURI = logo;
      t.extensions = tokenListExtensions(e);
      return t;
    })
    .filter(Boolean);

  // L'horodatage vient du lancement le plus récent, PAS de Date.now().
  // Sinon chaque exécution du GitHub Action produirait un diff et donc
  // un commit, même sans nouveau jeton.
  let latest = 0;
  for (const e of entries) {
    const d = Date.parse(e.launchDate || "");
    if (!Number.isNaN(d) && d > latest) latest = d;
  }

  const list = {
    name: "ApexPad Forge",
    timestamp: new Date(latest || 0).toISOString(),
    // `minor` = nombre de jetons : croît mécaniquement à chaque
    // lancement, donc pas d'état à conserver entre deux exécutions.
    version: { major: 1, minor: tokens.length, patch: 0 },
    logoURI: SITE + "/apexpad-forge-logo.png",
    keywords: ["apexpad", "launchpad", "memecoin", "multichain", "fair launch"],
    tokens,
  };
  return JSON.stringify(list, null, 2) + "\n";
}

main();
