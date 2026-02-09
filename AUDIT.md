# Audit - Session Folders

**Date** : 2026-02-08
**Verdict** : NEEDS FIXES

---

## Identite

| Champ | Valeur |
|-------|--------|
| ID | `com.simplyterm.folders` |
| Version | 1.0.0 |
| Permissions | `sessions_read`, `ui_sidebar`, `ui_context_menu`, `ui_notifications`, `ui_modals`, `fs_read`, `fs_write` |

## Fichiers

| Fichier | Role |
|---------|------|
| `manifest.json` | Metadata |
| `index.js` | Code principal (13 KB) |

## Manifest

Tous les champs obligatoires sont presents et valides.

## Permissions

| Permission | Declaree | Utilisee | Comment |
|------------|:--------:|:--------:|---------|
| `sessions_read` | Oui | Indirect | `api.getAllSessions()` -- pas de check cote API mais bonne pratique de declarer |
| `ui_sidebar` | Oui | Oui | `api.registerSidebarView()` |
| `ui_context_menu` | Oui | Oui | `api.registerContextMenuItem()` |
| `ui_notifications` | Oui | Oui | `api.showNotification()` |
| `ui_modals` | Oui | Oui | `api.showPrompt()` |
| `fs_read` | Oui | Oui | `api.storage.read()` |
| `fs_write` | Oui | Oui | `api.storage.write()` |

Toutes les 7 permissions sont justifiees.

## Securite

| Check | Resultat |
|-------|----------|
| `eval()` / `new Function()` | Absent |
| `__TAURI__` | Absent |
| URLs externes / `fetch` | Absent |
| Obfuscation | Absent |
| Echappement HTML | **Absent** |

Aucun red flag securite. Le framework DOMPurify mitigue le risque XSS, mais le plugin devrait echapper lui-meme.

## Issues

| # | Severite | Description |
|---|----------|-------------|
| 1 | **Medium** | Description du manifest mentionne "drag & drop support" mais aucun code D&D n'existe |
| 2 | **Medium** | `showMoveToFolderMenu` est un stub -- toggle entre root et `folders[0]` au lieu d'un vrai picker |
| 3 | **Medium** | `deleteFolder` n'orpheline pas les enfants -- les sous-dossiers deviennent invisibles si le parent est supprime |
| 4 | Low | Click sur une session = no-op (affiche "Connecting..." mais TODO dans le code) |
| 5 | Low | XSS via `innerHTML` : `folder.name` et `session.name` injectes sans echappement |

## Cleanup

| Ressource | Nettoyee |
|-----------|:--------:|
| Reference `api` | Oui |
| Donnees en memoire | Oui |
| Reference DOM | Oui |
| Set `expandedFolders` | Oui |
| `window.SimplyTermFoldersAPI` | Oui |

Cleanup adequat. Les event listeners sur les elements du container sont GC avec le DOM.
