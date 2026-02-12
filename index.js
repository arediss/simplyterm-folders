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
 * Load expanded folder state from plugin storage
 */
async function loadExpandedFolders() {
  try {
    const content = await api.storage.read('expanded-folders.json');
    const ids = JSON.parse(content);
    expandedFolders = new Set(ids);
  } catch (e) {
    // First run - will expand all by default
  }
}

/**
 * Save expanded folder state to plugin storage
 */
async function saveExpandedFolders() {
  try {
    await api.storage.write('expanded-folders.json', JSON.stringify([...expandedFolders]));
  } catch (e) {
    console.error('[Folders] Failed to save expanded state:', e);
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
  window.dispatchEvent(new CustomEvent('simplyterm-folders-changed'));

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
  if (updates.parentId !== undefined) {
    // Prevent circular references
    if (updates.parentId && (updates.parentId === id || getDescendantFolderIds(id).includes(updates.parentId))) {
      console.warn('[Folders] Cannot set parent: would create circular reference');
      return null;
    }
    folder.parentId = updates.parentId;
  }
  if (updates.order !== undefined) folder.order = updates.order;

  await saveFolders();
  renderList();
  window.dispatchEvent(new CustomEvent('simplyterm-folders-changed'));

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
  window.dispatchEvent(new CustomEvent('simplyterm-folders-changed'));
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
  window.dispatchEvent(new CustomEvent('simplyterm-folders-changed'));
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
  saveExpandedFolders();
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
        <div class="session-in-folder flex items-center gap-2 px-2 py-1.5 rounded"
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
        <div class="session-item flex items-center gap-2 px-2 py-1.5 rounded"
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

}

/**
 * Create an SVG icon element using safe DOM methods
 */
function createSvgIcon(type, size) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size || 13));
  svg.setAttribute('height', String(size || 13));
  svg.setAttribute('viewBox', '0 0 24 24');

  if (type === 'list') {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    var lines = [
      ['8','6','21','6'], ['8','12','21','12'], ['8','18','21','18'],
      ['3','6','3.01','6'], ['3','12','3.01','12'], ['3','18','3.01','18'],
    ];
    lines.forEach(function(coords) {
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', coords[0]); line.setAttribute('y1', coords[1]);
      line.setAttribute('x2', coords[2]); line.setAttribute('y2', coords[3]);
      svg.appendChild(line);
    });
  } else if (type === 'folder') {
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('stroke', 'none');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3 7v13h18V7H3zm0-2h7l2 2h9v2H3V5z');
    svg.appendChild(path);
  } else if (type === 'pencil') {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    var pPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pPath.setAttribute('d', 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z');
    svg.appendChild(pPath);
  } else if (type === 'trash') {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    var tParts = [
      { tag: 'polyline', attrs: { points: '3 6 5 6 21 6' } },
      { tag: 'path', attrs: { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' } },
    ];
    tParts.forEach(function(p) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', p.tag);
      Object.keys(p.attrs).forEach(function(k) { el.setAttribute(k, p.attrs[k]); });
      svg.appendChild(el);
    });
  }
  return svg;
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

  // Build options with safe DOM methods
  const contentEl = document.createElement('div');
  contentEl.className = 'space-y-1';

  // "No folder" option
  const noFolderOpt = document.createElement('div');
  noFolderOpt.className = 'px-3 py-2 rounded hover:bg-surface-0/50 cursor-pointer transition-colors text-sm '
    + (!currentFolderId ? 'text-accent font-medium' : 'text-text');
  noFolderOpt.textContent = '(No folder)';
  noFolderOpt.addEventListener('click', async () => {
    await moveSessionToFolder(sessionId, null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  contentEl.appendChild(noFolderOpt);

  // Folder options
  folders.forEach(f => {
    const opt = document.createElement('div');
    opt.className = 'px-3 py-2 rounded hover:bg-surface-0/50 cursor-pointer transition-colors flex items-center gap-2 text-sm '
      + (currentFolderId === f.id ? 'text-accent font-medium' : 'text-text');

    const iconSpan = document.createElement('span');
    iconSpan.style.color = currentFolderId === f.id ? '' : f.color;
    if (currentFolderId === f.id) iconSpan.className = 'text-accent';
    iconSpan.appendChild(createSvgIcon('folder', 14));
    opt.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = f.name;
    opt.appendChild(nameSpan);

    opt.addEventListener('click', async () => {
      await moveSessionToFolder(sessionId, f.id);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    contentEl.appendChild(opt);
  });

  await api.showModal({
    title: 'Move to folder',
    content: contentEl,
    buttons: [
      { label: 'Cancel', variant: 'secondary' },
    ],
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
  await loadExpandedFolders();

  // Expand all folders by default if no saved state
  if (expandedFolders.size === 0) {
    folders.forEach(f => expandedFolders.add(f.id));
  }

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

  // Home panel folder filter state
  var activeFolderFilter = null; // null = "All"

  function dispatchFolderFilter(folderId, folderName) {
    activeFolderFilter = folderId;
    var sessionIds = null;
    if (folderId) {
      sessionIds = Object.keys(sessionFolders).filter(function(sid) {
        return sessionFolders[sid] === folderId;
      });
    }
    globalThis.dispatchEvent(new CustomEvent('home-panel-session-filter', {
      detail: { sessionIds: sessionIds, label: folderName || null },
    }));
  }

  /**
   * Show a context menu for a folder tab in the home panel
   */
  function showFolderContextMenu(folder, x, y, onRefresh) {
    // Close any existing context menu
    globalThis.dispatchEvent(new CustomEvent('closeContextMenus'));

    var menu = document.createElement('div');
    menu.className = 'fixed z-[100] min-w-[140px] bg-crust border border-surface-0/50 rounded-lg shadow-xl py-1';
    menu.style.left = '0';
    menu.style.top = '0';
    menu.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;

    // Rename
    var renameBtn = document.createElement('button');
    renameBtn.className = 'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-0/50 transition-colors';
    var renameIcon = document.createElement('span');
    renameIcon.appendChild(createSvgIcon('pencil', 12));
    renameBtn.appendChild(renameIcon);
    var renameLabel = document.createElement('span');
    renameLabel.textContent = 'Rename';
    renameBtn.appendChild(renameLabel);
    renameBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      closeMenu();
      api.showPrompt({
        title: 'Rename Folder',
        message: 'Enter a new name',
        placeholder: 'Folder name...',
        defaultValue: folder.name,
        confirmLabel: 'Rename',
        cancelLabel: 'Cancel',
      }).then(function(newName) {
        if (newName && newName.trim()) {
          updateFolder(folder.id, { name: newName.trim() });
          // Update filter label if this folder is active
          if (activeFolderFilter === folder.id) {
            dispatchFolderFilter(folder.id, newName.trim());
          }
          onRefresh();
        }
      });
    });
    menu.appendChild(renameBtn);

    // Separator
    var sep = document.createElement('div');
    sep.className = 'h-px bg-surface-0/30 my-1';
    menu.appendChild(sep);

    // Delete
    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-error hover:bg-error/10 transition-colors';
    var deleteIcon = document.createElement('span');
    deleteIcon.appendChild(createSvgIcon('trash', 12));
    deleteBtn.appendChild(deleteIcon);
    var deleteLabel = document.createElement('span');
    deleteLabel.textContent = 'Delete';
    deleteBtn.appendChild(deleteLabel);
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      closeMenu();
      var childCount = getDescendantFolderIds(folder.id).length;
      var sessionCount = Object.values(sessionFolders).filter(function(id) { return id === folder.id; }).length;
      var message = 'Delete folder "' + folder.name + '"?';
      if (childCount > 0) message += ' This will also delete ' + childCount + ' sub-folder(s).';
      if (sessionCount > 0) message += ' ' + sessionCount + ' session(s) will be moved to root.';

      api.showModal({
        title: 'Delete folder',
        content: message,
        buttons: [
          { label: 'Cancel', variant: 'secondary' },
          { label: 'Delete', variant: 'danger', onClick: function() { return true; } },
        ],
      }).then(function(result) {
        if (result) {
          if (activeFolderFilter === folder.id) {
            dispatchFolderFilter(null, null);
          }
          deleteFolder(folder.id).then(function() { onRefresh(); });
        }
      }).catch(function() {});
    });
    menu.appendChild(deleteBtn);

    // Close helpers
    function closeMenu() {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener('click', onDocClick);
      globalThis.removeEventListener('closeContextMenus', closeMenu);
    }
    function onDocClick() { closeMenu(); }

    document.addEventListener('click', onDocClick);
    globalThis.addEventListener('closeContextMenus', closeMenu);

    menu.addEventListener('click', function(e) { e.stopPropagation(); });
    menu.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeMenu(); });

    document.body.appendChild(menu);
    menu.focus();
  }

  // Register home panel column
  api.registerHomePanelColumn({
    config: {
      id: 'folders',
      title: 'Folders',
      icon: 'folder',
      order: 10,
      onAdd: showAddFolderPrompt,
    },
    render: function(container) {
      var el = document.createElement('div');
      el.className = 'folders-home-panel space-y-0.5';
      container.appendChild(el);

      function renderHomeFolders() {
        var rootFolders = folders.filter(function(f) { return !f.parentId; }).sort(function(a, b) { return a.order - b.order; });

        el.textContent = '';

        // "All" tab
        var isAllActive = !activeFolderFilter;
        var allRow = document.createElement('div');
        allRow.className = 'flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs '
          + (isAllActive ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:bg-white/5 hover:text-text');

        var allIcon = document.createElement('span');
        allIcon.appendChild(createSvgIcon('list', 13));
        allRow.appendChild(allIcon);

        var allLabel = document.createElement('span');
        allLabel.className = 'flex-1 truncate';
        allLabel.textContent = 'All';
        allRow.appendChild(allLabel);

        var allCount = document.createElement('span');
        allCount.className = 'text-[10px] ' + (isAllActive ? 'text-accent/70' : 'text-text-muted');
        allCount.textContent = String(api.getAllSessions().length);
        allRow.appendChild(allCount);

        allRow.addEventListener('click', function() {
          dispatchFolderFilter(null, null);
          renderHomeFolders();
        });
        el.appendChild(allRow);

        if (rootFolders.length === 0) {
          var emptyMsg = document.createElement('div');
          emptyMsg.className = 'text-[10px] text-text-muted text-center py-3 opacity-60';
          emptyMsg.textContent = 'No folders yet';
          el.appendChild(emptyMsg);
          return;
        }

        // Separator
        var sep = document.createElement('div');
        sep.className = 'h-px bg-surface-0/30 my-1.5';
        el.appendChild(sep);

        // Folder tabs
        rootFolders.forEach(function(folder) {
          var count = Object.values(sessionFolders).filter(function(id) { return id === folder.id; }).length;
          var isActive = activeFolderFilter === folder.id;

          var row = document.createElement('div');
          row.className = 'flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs '
            + (isActive ? 'bg-accent/15 text-accent font-medium' : 'text-text hover:bg-white/5');

          var iconSpan = document.createElement('span');
          if (isActive) {
            iconSpan.className = 'text-accent';
          } else {
            iconSpan.style.color = folder.color;
          }
          iconSpan.appendChild(createSvgIcon('folder', 13));
          row.appendChild(iconSpan);

          var nameSpan = document.createElement('span');
          nameSpan.className = 'flex-1 truncate';
          nameSpan.textContent = folder.name;
          row.appendChild(nameSpan);

          var countSpan = document.createElement('span');
          countSpan.className = 'text-[10px] ' + (isActive ? 'text-accent/70' : 'text-text-muted');
          countSpan.textContent = String(count);
          row.appendChild(countSpan);

          // Context menu (right-click)
          row.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showFolderContextMenu(folder, e.clientX, e.clientY, renderHomeFolders);
          });

          row.addEventListener('click', function() {
            dispatchFolderFilter(folder.id, folder.name);
            renderHomeFolders();
          });

          el.appendChild(row);
        });
      }

      renderHomeFolders();

      // Re-render when folders change
      var onChanged = function() { renderHomeFolders(); };
      window.addEventListener('simplyterm-folders-changed', onChanged);

      return function() {
        window.removeEventListener('simplyterm-folders-changed', onChanged);
        // Reset filter on unmount
        if (activeFolderFilter) {
          dispatchFolderFilter(null, null);
        }
      };
    },
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
