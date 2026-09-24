# FACTORY

Source of **[factory.apexpad.io](https://factory.apexpad.io)**: the ApexPad launch tool, its public proof pages and the launch catalogue.

Static site served by GitHub Pages behind Cloudflare.

| Path | Content |
|---|---|
| `index.html`, `<chain>.html` | Launch tool, one page per chain (8 chains, same factory address `0xB7DA71D51a6946f3c5616181Ec84e7501cb1A75c`) |
| `transparency-en.html` / `-fr` | Proofs: what the code guarantees, and what it does not |
| `catalog.html`, `catalog.json`, `tokenlist.json` | Every launch, regenerated automatically — do not edit by hand |
| `proofs/` | One proof page (and its JSON) per launched token, published after an on-chain check |
| `factory-v1.html` | The previous factory, before on-chain metadata |

Smart contract sources: [Factory-m3m3/factory-contracts](https://github.com/Factory-m3m3/factory-contracts).
