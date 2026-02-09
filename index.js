/**
 * SimplyTerm Folders Plugin
 *
 * Provides folder organization for sessions:
 * - Hierarchical folder structure
 * - Folder colors
 * - Collapsible folders
 * - Context menu to move sessions between folders
 */

const PLUGIN_ID = 'com.simplyterm.folders';

// Plugin state
let folders = [];
let sessionFolders = {}; // sessionId -> folderId
let api = null;
let containerElement = null;
let expandedFolders = new Set();

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escape attribute value
 */
function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Load folders from plugin storage
 */
async function loadFolders() {
  try {
    const content = await api.storage.read('folders.json');
    folders = JSON.parse(content);
  } catch (e) {
    folders = [];
  }
}

/**
 * Save folders to plugin storage
 */
async function saveFolders() {
  try {
    await api.storage.write('folders.json', JSON.stringify(folders, null, 2));
  } catch (e) {
    console.error('[Folders] Failed to save folders:', e);
  }
}

/**
 * Load session-folder mappings
 */
async function loadSessionFolders() {
  try {
    const content = await api.storage.read('session-folders.json');
    sessionFolders = JSON.parse(content);
  } catch (e) {
    sessionFolders = {};
  }
}

/**
 * Save session-folder mappings
 */
async function saveSessionFolders() {
  try {
    await api.storage.write('session-folders.json', JSON.stringify(sessionFolders, null, 2));
  } catch (e) {
    console.error('[Folders] Failed to save session-folders:', e);
  }
}

/**
 * Create a new folder
 */
async function createFolder(name, color = null, parentId = null) {
  const id = `folder-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  const folder = {
    id,
    name,
    color: color || '#6c7086',
    parentId,
    order: folders.filter(f => f.parentId === parentId).length,
  };

  folders.push(folder);
  expandedFolders.add(id);
  await saveFolders();
  renderList();

  return folder;
}

/**
 * Update a folder (only allowed fields)
 */
async function updateFolder(id, updates) {
  const folder = folders.find(f => f.id === id);
  if (!folder) return null;

  if (updates.name !== undefined) folder.name = updates.name;
  if (updates.color !== undefined) folder.color = updates.color;
  if (updates.parentId !== undefined) folder.parentId = updates.parentId;
  if (updates.order !== undefined) folder.order = updates.order;

  await saveFolders();
  renderList();

  return folder;
}

/**
 * Get all descendant folder IDs (recursive)
 */
function getDescendantFolderIds(folderId) {
  const ids = [];
  const children = folders.filter(f => f.parentId === folderId);
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantFolderIds(child.id));
  }
  return ids;
}

/**
 * Delete a folder and all its descendants
 */
async function deleteFolder(id) {
  // Get all descendant folder IDs
  const allFolderIds = [id, ...getDescendantFolderIds(id)];

  // Move sessions from all deleted folders to root
  for (const [sessionId, folderId] of Object.entries(sessionFolders)) {
    if (allFolderIds.includes(folderId)) {
      delete sessionFolders[sessionId];
    }
  }
  await saveSessionFolders();

  // Remove all folders (the target and its descendants)
  folders = folders.filter(f => !allFolderIds.includes(f.id));
  await saveFolders();
  renderList();
}

/**
 * Move session to folder
 */
async function moveSessionToFolder(sessionId, folderId) {
  if (folderId) {
    sessionFolders[sessionId] = folderId;
  } else {
    delete sessionFolders[sessionId];
  }
  await saveSessionFolders();
  renderList();
}

/**
 * Get folder for a session
 */
function getSessionFolder(sessionId) {
  return sessionFolders[sessionId] || null;
}

/**
 * Get all folders
 */
function getFolders() {
  return folders;
}

/**
 * Toggle folder expanded state
 */
function toggleFolder(folderId) {
  if (expandedFolders.has(folderId)) {
    expandedFolders.delete(folderId);
  } else {
    expandedFolders.add(folderId);
  }
  renderList();
}

/**
 * Render folder item (recursive)
 */
function renderFolderItem(folder, sessions, depth = 0) {
  const isExpanded = expandedFolders.has(folder.id);
  const folderSessions = sessions.filter(s => sessionFolders[s.id] === folder.id);
  const childFolders = folders.filter(f => f.parentId === folder.id);
  const hasContent = folderSessions.length > 0 || childFolders.length > 0;

  let html = `
    <div class="folder-item" data-folder-id="${escapeAttr(folder.id)}" style="padding-left: ${depth * 12}px">
      <div class="folder-header flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer group"
           data-folder-id="${escapeAttr(folder.id)}">
        <span class="expand-icon text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}" style="width: 12px">
          ${hasContent ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>` : ''}
        </span>
        <span class="folder-icon" style="color: ${escapeAttr(folder.color)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M3 7v13h18V7H3zm0-2h7l2 2h9v2H3V5z"/>
          </svg>
        </span>
        <span class="flex-1 text-xs font-medium text-text truncate">${escapeHtml(folder.name)}</span>
        <span class="folder-count text-[10px] text-text-muted">${folderSessions.length}</span>
        <button class="delete-folder-btn opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-error/20 text-text-muted hover:text-error transition-all"
                data-folder-id="${escapeAttr(folder.id)}" title="Delete folder">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
  `;

  if (isExpanded && hasContent) {
    html += `<div class="folder-content">`;

    // Render child folders
    for (const child of childFolders.sort((a, b) => a.order - b.order)) {
      html += renderFolderItem(child, sessions, depth + 1);
    }

    // Render sessions in this folder
    for (const session of folderSessions) {
      html += `
        <div class="session-in-folder flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
             style="padding-left: ${(depth + 1) * 12 + 8}px"
             data-session-id="${escapeAttr(session.id)}">
          <span class="text-accent">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </span>
          <span class="text-xs text-text truncate">${escapeHtml(session.name || session.id)}</span>
        </div>
      `;
    }

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Render the folders tree
 */
function renderList() {
  if (!containerElement) return;

  const listEl = containerElement.querySelector('.folders-list');
  if (!listEl) return;

  // Get all sessions from the app
  const sessions = api.getAllSessions();

  // Get root folders (no parent)
  const rootFolders = folders.filter(f => !f.parentId).sort((a, b) => a.order - b.order);

  // Get sessions without a folder
  const unfolderedSessions = sessions.filter(s => !sessionFolders[s.id]);

  let html = '';

  // Render folders
  for (const folder of rootFolders) {
    html += renderFolderItem(folder, sessions);
  }

  // Render unfoldered sessions under "Uncategorized" if there are folders
  if (folders.length > 0 && unfolderedSessions.length > 0) {
    html += `
      <div class="uncategorized-section mt-2 pt-2 border-t border-surface-0/30">
        <div class="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1">Uncategorized</div>
    `;
    for (const session of unfolderedSessions) {
      html += `
        <div class="session-item flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
             data-session-id="${escapeAttr(session.id)}">
          <span class="text-accent">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </span>
          <span class="text-xs text-text truncate">${escapeHtml(session.name || session.id)}</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  if (folders.length === 0) {
    html = `
      <div class="text-xs text-text-muted text-center py-2 opacity-60">
        No folders yet
      </div>
    `;
  }

  listEl.innerHTML = html;

  // Add event listeners for folders
  listEl.querySelectorAll('.folder-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.delete-folder-btn')) return;
      const folderId = header.dataset.folderId;
      toggleFolder(folderId);
    });
  });

  // Add event listeners for delete buttons
  listEl.querySelectorAll('.delete-folder-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.folderId;
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return;

      const childCount = getDescendantFolderIds(folderId).length;
      const sessionCount = Object.values(sessionFolders).filter(id => id === folderId).length;
      let message = `Delete folder "${escapeHtml(folder.name)}"?`;
      if (childCount > 0) message += ` This will also delete ${childCount} sub-folder(s).`;
      if (sessionCount > 0) message += ` ${sessionCount} session(s) will be moved to root.`;

      try {
        const result = await api.showModal({
          title: 'Delete folder',
          content: message,
          buttons: [
            { label: 'Cancel', variant: 'secondary' },
            { label: 'Delete', variant: 'danger', onClick: () => true },
          ],
        });
        if (result) {
          await deleteFolder(folderId);
        }
      } catch {
        // Modal cancelled
      }
    });
  });

  // Add event listeners for sessions (connect on click)
  listEl.querySelectorAll('[data-session-id]').forEach(item => {
    item.addEventListener('click', () => {
      const sessionId = item.dataset.sessionId;
      api.showNotification(`Connecting to session...`, 'info');
    });
  });
}

/**
 * Show add folder prompt
 */
async function showAddFolderPrompt() {
  const name = await api.showPrompt({
    title: 'New Folder',
    message: 'Enter a name for the new folder',
    placeholder: 'Folder name...',
    confirmLabel: 'Create',
    cancelLabel: 'Cancel',
  });

  if (name && name.trim()) {
    await createFolder(name.trim());
  }
}

/**
 * Show folder picker modal for moving a session
 */
async function showMoveToFolderMenu(sessionId) {
  if (folders.length === 0) {
    api.showNotification('Create a folder first to organize sessions', 'info');
    return;
  }

  const currentFolderId = sessionFolders[sessionId];

  // Build options HTML
  const optionsHtml = [
    `<div class="folder-option px-3 py-2 rounded hover:bg-surface-0/50 cursor-pointer transition-colors ${!currentFolderId ? 'text-accent font-medium' : 'text-text'}"
          data-folder-id="">
      (No folder)
    </div>`,
    ...folders.map(f => `
      <div class="folder-option px-3 py-2 rounded hover:bg-surface-0/50 cursor-pointer transition-colors flex items-center gap-2 ${currentFolderId === f.id ? 'text-accent font-medium' : 'text-text'}"
           data-folder-id="${escapeAttr(f.id)}">
        <span style="color: ${escapeAttr(f.color)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M3 7v13h18V7H3zm0-2h7l2 2h9v2H3V5z"/>
          </svg>
        </span>
        <span class="text-sm">${escapeHtml(f.name)}</span>
      </div>
    `),
  ].join('');

  // Create a container element for the modal content
  const contentEl = document.createElement('div');
  contentEl.className = 'space-y-1';
  contentEl.innerHTML = optionsHtml;

  // Use a Promise to handle selection
  return new Promise((resolve) => {
    // Add click handlers
    contentEl.querySelectorAll('.folder-option').forEach(opt => {
      opt.addEventListener('click', async () => {
        const folderId = opt.dataset.folderId || null;
        await moveSessionToFolder(sessionId, folderId);
        const folderName = folderId ? folders.find(f => f.id === folderId)?.name : 'root';
        api.showNotification(`Moved to ${folderName}`, 'success');
        resolve(true);
      });
    });

    api.showModal({
      title: 'Move to folder',
      content: contentEl,
      buttons: [
        { label: 'Cancel', variant: 'secondary' },
      ],
    }).then(() => resolve(false)).catch(() => resolve(false));
  });
}

/**
 * Handle context menu action for moving session to folder
 */
function handleMoveToFolder(context) {
  if (context.type === 'session' && context.targetId) {
    showMoveToFolderMenu(context.targetId);
  }
}

/**
 * Render sidebar section
 */
function renderSidebarSection(container) {
  containerElement = container;

  container.innerHTML = `
    <div class="folders-plugin" data-plugin="${PLUGIN_ID}">
      <div class="flex items-center justify-between px-2 mb-1">
        <button class="add-folder-btn text-[10px] text-text-muted hover:text-accent transition-colors">
          + New Folder
        </button>
      </div>
      <div class="folders-list"></div>
    </div>
  `;

  // Add folder button
  container.querySelector('.add-folder-btn').addEventListener('click', showAddFolderPrompt);

  // Initial render
  renderList();

  return () => {
    containerElement = null;
  };
}

/**
 * Plugin initialization
 */
async function init(pluginApi) {
  api = pluginApi;

  // Load data
  await loadFolders();
  await loadSessionFolders();

  // Expand all folders by default
  folders.forEach(f => expandedFolders.add(f.id));

  // Register sidebar view (tab)
  api.registerSidebarView({
    config: {
      id: 'folders',
      label: 'Folders',
      icon: 'folder',
      order: 10,
    },
    render: renderSidebarSection,
  });

  // Register context menu item for sessions
  api.registerContextMenuItem({
    id: 'move-to-folder',
    label: 'Move to folder',
    icon: 'folder',
    onClick: handleMoveToFolder,
  });

  // Expose API globally
  window.SimplyTermFoldersAPI = {
    getFolders,
    getSessionFolder,
    moveSessionToFolder,
    createFolder,
  };
}

/**
 * Plugin cleanup
 */
function cleanup() {
  api = null;
  folders = [];
  sessionFolders = {};
  containerElement = null;
  expandedFolders.clear();
  delete window.SimplyTermFoldersAPI;
}

// Register plugin for SimplyTerm plugin loader
(function() {
  window.SimplyTermPlugins = window.SimplyTermPlugins || {};
  window.SimplyTermPlugins[PLUGIN_ID] = {
    init: init,
    cleanup: cleanup
  };
})();
