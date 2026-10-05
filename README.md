# bb-plugin-vault

<p align="center">
  <strong>read-only markdown vaults, as a page, a thread panel, and a 3D graph.</strong>
</p>

<p align="center">
  <a href="#install">install</a> · <a href="#what-it-does">what it does</a> · <a href="#related">related</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-666666?labelColor=333333" alt="MIT license" /></a>
</p>

---

A BB plugin that browses markdown folders and never writes. Add vault folders in Settings, then drag to set tab order.

- **page / panel** — nav panel plus a thread side-panel tab; open notes as rendered markdown
- **graph** — 3D wiki-link graph; click a node to open the file
- **agents** — `::vault-file` and `::vault-graph` directives open the thread panel without leaving chat
- **reduced motion** — skips enter/leave animation when the host asks for it

## install

Requires [bb](https://getbb.app) with a compatible Plugin SDK (`engines` in `package.json`).

From a clone:

```bash
git clone https://github.com/HIJKM/bb-plugin-vault.git
cd bb-plugin-vault
bb plugin install . --yes
```

Or from GitHub:

```bash
bb plugin install 'git:https://github.com/HIJKM/bb-plugin-vault.git@main' --yes
```

Plugin id: `vault`.

## what it does

Registers `navPanel` `docs`, `threadPanelAction`, a settings section, and message directives in `app.tsx`. Agents can also open the thread panel through plugin tools.

## related

| plugin | role |
| --- | --- |
| `codes` | workspace files and git graph |
| `finder` | disk tree without claiming the file opener |

## license

MIT. See [LICENSE](LICENSE).
