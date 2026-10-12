const concept = document.body.dataset.concept;
const study = document.body.dataset.study || concept;
const app = document.querySelector('#app');
const layouts = [
  {id: 'fieldnotes', name: 'Docked studio', subtitle: 'Tool rail · object tree · editor · inspector', number: '01'},
  {id: 'atlas', name: 'Spatial canvas', subtitle: 'Object list · coordinate map · properties', number: '02'},
  {id: 'assembly', name: 'Review desk', subtitle: 'Proposal queue · comparison · working source', number: '03'},
  {id: 'focus', name: 'Adaptive detail', subtitle: 'Master/detail · property forms · bottom tools', number: '04'},
  {id: 'signal', name: 'Object browser', subtitle: 'Source table · field inspector · changes tray', number: '05'},
];
const adaptivePalettes = [
  {id: 'adaptive-graphite', palette: 'graphite', name: 'Graphite', subtitle: 'Neutral charcoal · subdued steel', number: 'A'},
  {id: 'adaptive-slate', palette: 'slate', name: 'Slate', subtitle: 'Blue-gray surfaces · muted steel-blue', number: 'B'},
  {id: 'adaptive-olive', palette: 'olive', name: 'Olive', subtitle: 'Charcoal green · restrained moss', number: 'C'},
  {id: 'adaptive-umber', palette: 'umber', name: 'Umber', subtitle: 'Warm brown-gray · subdued bronze', number: 'D'},
  {id: 'adaptive-fog', palette: 'fog', name: 'Fog', subtitle: 'Mid-dark gray · washed sage', number: 'E'},
];
const comparisonLayouts = document.body.dataset.paletteGallery ? adaptivePalettes : layouts;
const fields = [
  {id: 'character', name: 'Mara Venn', category: 'Characters', type: 'NPC', label: 'Description', path: ['npcs', 'Mara Venn', 'basicInfo'], icon: 'person'},
  {id: 'location', name: 'Brinehaven', category: 'Locations', type: 'Location', label: 'Description', path: ['locations', 'Brinehaven', 'basicInfo'], icon: 'pin'},
  {id: 'region', name: 'Lantern Coast', category: 'Regions', type: 'Region', label: 'Description', path: ['regions', 'Lantern Coast', 'basicInfo'], icon: 'map'},
  {id: 'opening', name: 'The Dark Lighthouse', category: 'Story starts', type: 'Story start', label: 'Opening text', path: ['storyStarts', 'The Dark Lighthouse', 'storyStart'], icon: 'book'},
  {id: 'lore', name: 'The Great Lamps', category: 'Lore', type: 'Lore', label: 'Lore text', path: ['worldLore', 'The Great Lamps', 'text'], icon: 'book'},
  {id: 'background', name: 'World background', category: 'Settings', type: 'Setting', label: 'World background', path: ['storySettings', 'worldBackground'], icon: 'world'},
  {id: 'voice', name: 'Narrator style', category: 'Settings', type: 'Setting', label: 'Narrator instructions', path: ['narratorStyle'], icon: 'sliders'},
];
const proposals = [
  {id: 'mara', field: 'character', title: 'Clarify Mara’s immediate goal', reason: 'Keep the supplied character; add a concrete prompt for her next conversation.', text: 'A lighthouse keeper who has lost contact with the offshore watch. Practical, exhausted, and unwilling to abandon her crew. She wants someone to investigate the dark offshore lamp while she keeps watch at Brinehaven.'},
  {id: 'voice', field: 'voice', title: 'Keep the player’s feelings open', reason: 'Make the existing player-agency instruction more specific.', text: 'Evocative maritime fantasy. Use concrete sensory details, grounded dialogue, and meaningful choices. Respect player agency. Describe what the player can perceive, but do not decide their feelings or actions.'},
];
const tools = [['world', 'World', 'world'], ['map', 'Map', 'map'], ['characters', 'Characters', 'person'], ['mods', 'Mod overlays', 'folder'], ['changes', 'Changes', 'source'], ['validation', 'Validation', 'review'], ['planning', 'Planning', 'chat'], ['review', 'Proposals', 'review'], ['artwork', 'Artwork', 'image'], ['publish', 'Publish', 'review'], ['base', 'Base template', 'book'], ['history', 'History', 'history'], ['providers', 'Models & agents', 'sliders'], ['voyage', 'Voyage sync', 'world'], ['connection', 'Connection', 'sliders']];
const paths = {
  world: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',
  pin: 'M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5M9 3v16M15 5v16',
  book: 'M3 4h7c2 0 2 2 2 2s0-2 2-2h7v16h-7c-2 0-2 1-2 1s0-1-2-1H3V4M12 6v15',
  sliders: 'M5 3v18M12 3v18M19 3v18M2 8h6M9 16h6M16 8h6',
  chat: 'M3 4h18v13H9l-6 4V4',
  review: 'M6 3v12a5 5 0 0 0 5 5h7M18 3v8M3 3h6M15 3h6M15 17l3 3-3 3',
  image: 'M3 3h18v18H3V3m0 14 6-6 5 5 3-3 4 4M16 7h.01',
  history: 'M3 11a9 9 0 1 1 2 7M3 3v8h8M12 7v5l3 2',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-2 4 7 7',
  folder: 'M3 6V4h7l2 3h9v13H3V6',
  save: 'M3 3h15l3 3v15H3V3M7 3v6h10V3M7 21v-8h10v8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  arrow: 'm9 5 7 7-7 7',
  back: 'm15 5-7 7 7 7',
  source: 'm8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18',
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.folder}"/></svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
let original;
let world;
let selected = concept === 'atlas' ? 'location' : 'character';
let activeTool = concept === 'assembly' ? 'review' : concept === 'atlas' ? 'map' : 'characters';
let editorTab = 'properties';
let selectedProposal = 'mara';
let decisions = {};
let drafts = {};
let checkpoints = [];
let dirty = false;
let mobilePane = concept === 'atlas' ? 'canvas' : 'detail';
let status = 'Fixture loaded';
let trayOpen = false;
let mapMode = 'region';
let artworkPurpose = 'cover';
let includedProposals = {};
let toastTimer;
const storageKey = `voyage-app-layout-v2-${study}`;
const currentField = () => fields.find(field => field.id === selected);
const readFrom = (source, field) => field.path.reduce((value, key) => value[key], source);
const read = field => drafts[field.id] ?? readFrom(world, field);
const fieldPath = field => field.path.join('.');
function write(field, value) {
  const parent = field.path.slice(0, -1).reduce((entry, key) => entry[key], world);
  parent[field.path.at(-1)] = value;
}
function record(field = currentField()) {
  return field.path.length === 3 ? world[field.path[0]][field.path[1]] : field.path.length === 2 ? world[field.path[0]] : {[field.path[0]]: read(field)};
}
function changes() {
  const changed = fields.filter(field => readFrom(original, field) !== readFrom(world, field)).map(field => ({name: field.name, path: fieldPath(field)}));
  for (const key of ['known', 'currentLocation']) {
    if (world.npcs['Mara Venn'][key] !== original.npcs['Mara Venn'][key]) changed.push({name: `Mara Venn · ${key}`, path: `npcs.Mara Venn.${key}`});
  }
  return changed;
}
function pendingCount() { return proposals.filter(proposal => !decisions[proposal.id]).length; }
function toolbarButton(action, label, iconName, className = '') {
  return `<button class="${className}" data-action="${action}" aria-label="${escapeHtml(label)}">${icon(iconName)}<span>${label}</span></button>`;
}
function layoutSelect(selectId = 'layout-select') {
  const options = entries => entries.map(layout => `<option value="${layout.id}" ${layout.id === study ? 'selected' : ''}>${layout.number} ${layout.name}</option>`).join('');
  return `<select id="${selectId}" aria-label="Compare application layouts"><optgroup label="Application layouts">${options(layouts)}</optgroup><optgroup label="Adaptive · muted palettes">${options(adaptivePalettes)}</optgroup></select>`;
}
function chrome() {
  return `<header class="appbar"><div class="app-identity">${icon('world', 20)}<strong>Voyage Workbench</strong></div><button class="project-button" data-action="projects">${icon('folder')}<span>Lantern Coast</span><span class="caret">⌄</span></button><div class="appbar-space"></div><span class="save-status" data-save-status>${status}</span>${toolbarButton('finder', 'Find', 'search', 'compact')}${toolbarButton('save', 'Save locally', 'save', 'primary compact')}${toolbarButton('more', 'More', 'more', 'icon-only')}<div class="layout-picker">${layoutSelect()}</div></header>`;
}
function toolNav(className = 'tool-navigation') {
  const visibleTools = className.includes('top-tools') ? tools.filter(([id]) => ['world', 'map', 'characters', 'planning', 'review', 'artwork'].includes(id)) : tools;
  return `<nav class="${className}" aria-label="Workspace tools">${visibleTools.map(([id, name, iconName]) => `<button data-tool="${id}" aria-label="${name}" aria-pressed="${activeTool === id}" title="${name}">${icon(iconName)}<span>${name}</span>${id === 'review' ? `<small>${pendingCount()}</small>` : ''}</button>`).join('')}${className.includes('top-tools') ? `<button data-action="more">${icon('more')}<span>All tools</span></button>` : ''}</nav>`;
}
function objectButton(field, tree = false) {
  return `<button class="object-row ${tree ? 'tree-row' : ''}" data-select="${field.id}" aria-pressed="${selected === field.id}">${icon(field.icon, 16)}<span>${field.name}</span>${tree ? '' : `<small>${field.type}</small>`}</button>`;
}
function objectPane(tree = false) {
  return `<aside class="object-pane"><div class="pane-heading"><strong>${tree ? 'World outline' : 'Objects'}</strong><span>${fields.length}</span></div><div class="filter-control">${icon('search', 15)}<input type="search" id="object-filter" aria-label="Filter world objects" placeholder="Filter objects"></div><div class="object-list" id="object-list">${objectList('', tree)}</div><div class="pane-foot">${icon('folder', 14)}lantern-coast.json</div></aside>`;
}
function objectList(query = '', tree = concept === 'fieldnotes') {
  const matches = fields.filter(field => `${field.name} ${field.category} ${fieldPath(field)}`.toLowerCase().includes(query.toLowerCase()));
  if (!matches.length) return '<div class="empty-state">No objects match this filter.</div>';
  if (!tree) return matches.map(field => objectButton(field)).join('');
  return [...new Set(matches.map(field => field.category))].map(category => `<section class="tree-group"><div class="tree-heading">⌄ ${category}<span>${matches.filter(field => field.category === category).length}</span></div>${matches.filter(field => field.category === category).map(field => objectButton(field, true)).join('')}</section>`).join('');
}
function tabs() {
  return `<div class="editor-tabs" role="tablist" aria-label="Object views">${[['properties', 'Properties'], ['source', 'JSON source'], ['references', 'References']].map(([id, label]) => `<button role="tab" id="tab-${id}" aria-controls="editor-tabpanel" aria-selected="${editorTab === id}" tabindex="${editorTab === id ? 0 : -1}" data-tab="${id}">${label}</button>`).join('')}</div>`;
}
function metadata() {
  if (selected === 'character') return `<div class="form-grid"><label>Name<input value="Mara Venn" readonly></label><label>Current location<select id="location-select" data-meta="currentLocation"><option>${escapeHtml(world.npcs['Mara Venn'].currentLocation)}</option>${Object.keys(world.locations).filter(name => name !== world.npcs['Mara Venn'].currentLocation).map(name => `<option>${escapeHtml(name)}</option>`).join('')}</select></label></div><label class="checkbox-row"><input type="checkbox" id="known-checkbox" data-meta="known" ${world.npcs['Mara Venn'].known ? 'checked' : ''}>Known to the player <span class="field-key">known</span></label>`;
  if (selected === 'location') {
    const location = world.locations.Brinehaven;
    return `<div class="form-grid"><label>Name<input value="Brinehaven" readonly></label><label>Parent region<input value="${escapeHtml(location.region)}" readonly></label></div>${concept === 'atlas' ? `<section class="map-property-fields"><h3>Local placement</h3><div class="mock-grid">${mockField('Local x (east)', location.x ?? 'Not set')}${mockField('Local y (north)', location.y ?? 'Not set')}</div>${disabledButton('Set position')}<div class="mock-grid">${mockField('Radius (coordinate units)', location.radius ?? '2 · default')}${mockSelect('Complexity', [location.complexityType || 'simple', 'complex', 'wilderness'])}${mockSelect('Detail', [location.detailType || 'basic', 'detailed'])}</div></section>` : ''}`;
  }
  if (selected === 'opening') return `<div class="form-grid"><label>Story start<input value="The Dark Lighthouse" readonly></label><label>Starting location<input value="Brinehaven" readonly></label></div>`;
  return `<div class="property-line"><span>Type</span><strong>${currentField().type}</strong></div>`;
}
function references() {
  const linked = selected === 'character' ? ['location'] : selected === 'location' ? ['region', 'character'] : selected === 'region' ? ['location'] : ['opening', 'lore'];
  return `<section class="reference-section"><h3>Related source objects</h3>${linked.map(id => `<button class="reference-link" data-select="${id}">${icon(fields.find(field => field.id === id).icon)}<span>${fields.find(field => field.id === id).name}</span>${icon('arrow', 14)}</button>`).join('')}<p class="help-text">Location and region links come from the fixture. Story and lore entries are shortcuts.</p></section>`;
}
function valueForm() {
  const field = currentField();
  return `${metadata()}<section class="field-section"><div class="field-label"><label for="source-editor">${field.label}</label><code>${field.path.at(-1)}</code></div><textarea id="source-editor" spellcheck="true" aria-label="${field.label}" aria-describedby="source-help">${escapeHtml(read(field))}</textarea><div class="help-row"><span id="source-help">Editable text value · retained in the complete JSON</span><span id="word-count">${read(field).trim().split(/\s+/u).filter(Boolean).length} words</span></div></section><section class="reference-section"><h3>Related objects</h3>${selected === 'character' ? `<button class="reference-link" data-select="location">${icon('pin')}<span>Brinehaven</span><small>currentLocation</small>${icon('arrow', 14)}</button><button class="reference-link" data-select="region">${icon('map')}<span>Lantern Coast</span><small>via Brinehaven</small>${icon('arrow', 14)}</button>` : `<button class="reference-link" data-select="character">${icon('person')}<span>Mara Venn</span>${icon('arrow', 14)}</button>`}</section>`;
}
function detailPane(extraClass = '') {
  const field = currentField();
  return `<section class="detail-pane ${extraClass}"><div class="document-strip">${icon(field.icon, 14)}<span>${field.name}</span><span class="document-type">${field.type}</span></div><div class="object-heading"><div class="object-symbol">${icon(field.icon, 24)}</div><div><h1>${field.name}</h1><p>${field.category} <span>/</span> ${field.path[0]}</p></div><button class="subtle mobile-back" data-action="browse">${icon('back')}Objects</button></div>${tabs()}<div class="editor-scroll" id="editor-tabpanel" role="tabpanel" aria-labelledby="tab-${editorTab}">${editorTab === 'source' ? `<div class="source-caption">${icon('source', 15)}Active source object <span>Drafts apply separately</span></div><pre class="source-code">${escapeHtml(JSON.stringify(record(), null, 2))}</pre>` : editorTab === 'references' ? references() : valueForm()}</div><div class="editor-actions"><span class="field-path">${drafts[selected] === undefined ? escapeHtml(fieldPath(field)) : 'Unapplied local draft'}</span><div class="draft-actions"><button data-action="discard" ${drafts[selected] === undefined ? 'disabled' : ''}>Discard</button><button class="primary" data-action="apply" ${drafts[selected] === undefined ? 'disabled' : ''}>Apply edit</button></div></div></section>`;
}
function propertyDock() {
  const field = currentField();
  return `<aside class="property-pane"><div class="pane-heading"><strong>Inspector</strong>${icon('sliders', 15)}</div><section class="inspector-section"><h3>Selection</h3><div class="property-line"><span>Object</span><strong>${field.name}</strong></div><div class="property-line"><span>Type</span><strong>${field.type}</strong></div><div class="property-line"><span>Value</span><strong>String</strong></div><div class="property-line"><span>Storage</span><strong>Local demo</strong></div></section><section class="inspector-section"><h3>Source path</h3><code class="wrap-code">${escapeHtml(fieldPath(field))}</code></section><section class="inspector-section"><h3>Suggested changes</h3><p class="help-text">${pendingCount()} demo proposals await a decision. No model is running.</p><button class="wide" data-tool="review">${icon('review', 16)}Review proposals</button></section><section class="inspector-section"><h3>Local edits</h3><div id="dock-changes">${changeList()}</div></section><div class="pane-foot">Changes affect this mockup only.</div></aside>`;
}
function changeList() {
  const changed = changes();
  return changed.length ? changed.map(change => `<div class="change-row">${icon('source', 14)}<span>${escapeHtml(change.name)}</span><small>M</small></div>`).join('') : '<p class="help-text">No changes to the supplied fixture.</p>';
}
function changeTray() {
  return `<section class="change-tray ${trayOpen ? 'is-open' : ''}"><button data-action="tray" class="tray-toggle" aria-expanded="${trayOpen}">${icon('source', 14)}Changes from fixture <span data-change-count>${changes().length}</span><span class="tray-chevron">${trayOpen ? '⌄' : '⌃'}</span></button>${trayOpen ? `<div class="tray-content" id="tray-content">${changeList()}</div>` : ''}</section>`;
}
function isFeatureTool() {
  return !['world', 'map', 'characters', 'review'].includes(activeTool);
}
function workspaceContent() {
  return isFeatureTool() ? featurePane() : activeTool === 'review' ? reviewPane() : activeTool === 'map' ? mapCanvas() : detailPane();
}
function checkpoint(label) {
  checkpoints.push({label, timestamp: new Date().toISOString(), world: structuredClone(world)});
}
function disabledButton(label) {
  return `<button disabled title="Backend action is not connected in this mockup">${label}</button>`;
}
function mockField(label, value = '', kind = 'input') {
  return `<label class="mock-field">${label}${kind === 'textarea' ? `<textarea readonly>${escapeHtml(value)}</textarea>` : `<input value="${escapeHtml(value)}" readonly>`}</label>`;
}
function mockSelect(label, options) {
  return `<label class="mock-field">${label}<select disabled>${options.map(option => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}
function featurePane() {
  const tool = tools.find(([id]) => id === activeTool);
  let content = '';
  if (activeTool === 'planning') content = `<div class="planning-columns"><section class="planning-chat"><div class="section-toolbar"><strong>Planning room</strong><span>Read only</span></div><div class="empty-log">${icon('chat', 28)}<strong>No planning conversation</strong><p>Choose an agent connection to discuss this world. No conversation is fabricated in the mockup.</p></div><label class="mock-field">Planning message<textarea readonly placeholder="What would you like to explore?"></textarea></label>${disabledButton('Send')}</section><section><h2>Work Order</h2><div class="mock-grid">${mockSelect('Stage', ['Building', 'Map layout'])}${mockSelect('Stage model', ['No connection selected'])}</div>${mockField('Objective', 'Clarify Mara Venn’s immediate goal')}${mockField('Requirements', 'Keep the existing character and location.\nDo not change narrator settings.', 'textarea')}${mockField('Allowed paths', '[["npcs", "Mara Venn", "basicInfo"]]', 'textarea')}<div class="feature-actions">${disabledButton('Plan Work Order')}${disabledButton('Run Work Order')}</div><h2>Persistent world-agent memory</h2>${mockField('Agent memory', '', 'textarea')}${disabledButton('Save agent memory')}</section></div>`;
  if (activeTool === 'mods') content = `<h2>Mod references</h2><p class="help-text">The fixture has no mod references. Production supports ordered references and version pinning.</p><div class="feature-empty">No references attached</div><div class="feature-actions">${disabledButton('Add mod reference')}${disabledButton('Apply mod stack')}${disabledButton('Browse / resolve Voyage mods')}${disabledButton('Export without references')}</div><h2>Attached mod sources</h2><div class="feature-empty">No local mod JSON attached</div>${disabledButton('Attach local mod JSON')}`;
  if (activeTool === 'changes') content = `<div class="section-toolbar"><strong>Changes from imported world</strong><span>${changes().length} changed fields</span></div><div class="feature-change-list">${changeList()}</div><p class="help-text">Comparison uses the supplied fixture as the import baseline. Unapplied editor drafts are not changes to the active world.</p>`;
  if (activeTool === 'validation') content = `<div class="feature-actions">${disabledButton('Local checks')}${disabledButton('Official draft validation')}${disabledButton('Official publish validation')}${disabledButton('Refresh community schema')}</div><div class="feature-empty">${icon('review', 28)}<strong>No validation report</strong><p>Validation has not run. Official reports require the production validation service.</p></div><h2>Selected source path</h2><code class="wrap-code">${escapeHtml(fieldPath(currentField()))}</code>`;
  if (activeTool === 'artwork') content = `<div class="feature-switch"><button data-artwork="cover" aria-pressed="${artworkPurpose === 'cover'}">Cover art & grading</button><button data-artwork="map" aria-pressed="${artworkPurpose === 'map'}">Map artwork</button></div>${artworkPurpose === 'cover' ? `<div class="artwork-columns"><section><h2>Cover art & rubric grading</h2>${mockSelect('Saved cover', ['New cover'])}${mockField('World title', 'Lantern Coast')}${mockField('Player fantasy / premise', world.storySettings.worldBackground, 'textarea')}${mockField('Cover art direction', '', 'textarea')}<div class="mock-grid">${mockSelect('Vision grader API profile', ['No configured provider'])}${mockField('Vision-capable text model', '')}</div><div class="feature-actions">${disabledButton('Generate cover & grade')}${disabledButton('Refine cover & regrade')}${disabledButton('Grade saved cover only')}</div></section><section><h2>Saved cover</h2><div class="image-empty">${icon('image', 28)}<span>No cover generated</span></div><h2>Grading evidence</h2><p class="help-text">Public crops, stress tests, and rubric reports appear after generation and grading. No scores are invented.</p></section></div>` : `<h2>Map artwork studio</h2>${mockSelect('Artwork plan', ['New plan'])}${mockField('Name', 'World map')}${mockField('Art direction', '', 'textarea')}<div class="mock-grid">${mockSelect('Strategy', ['Master image, then split', 'Generate individual tiles'])}${mockSelect('Image composition', ['Square', 'Landscape', 'Portrait'])}${mockSelect('Detail / tile density', ['Choose density'])}${mockField('Columns', '1')}${mockField('Rows', '1')}</div><div class="feature-actions">${disabledButton('Save artwork plan')}${disabledButton('Generate master image')}${disabledButton('Import master image')}${disabledButton('Split master into tiles')}${disabledButton('Export manifest')}</div>`}`;
  if (activeTool === 'publish') content = `<div class="feature-notice">Local world · no linked Voyage draft in this mockup</div><h2>Draft</h2><div class="feature-actions">${disabledButton('Create private draft')}${disabledButton('Save active world')}${disabledButton('Reconcile uncertain save')}</div><h2>Checks & moderation</h2><div class="feature-actions">${disabledButton('Publish checks')}${disabledButton('Moderation status')}${disabledButton('Run moderation')}</div><h2>Publication</h2><p class="help-text">Publication is separate from saving a draft and requires an explicit decision.</p><div class="feature-actions">${disabledButton('Publish saved draft')}${disabledButton('Unpublish')}${disabledButton('Image uploads & history')}</div><h2>Publication journal</h2><div class="feature-empty">No remote publication operations</div>${disabledButton('Reconcile / replay exact request')}`;
  if (activeTool === 'base') content = `<h2>Base world templates</h2><div class="feature-actions">${disabledButton('Derive from current world')}${disabledButton('Derive from JSON file')}${disabledButton('Reset to bundled template')}</div>${mockField('Candidate JSON', '', 'textarea')}<div class="feature-actions">${disabledButton('Save candidate')}${disabledButton('Official validation')}${disabledButton('Activate for new worlds')}${disabledButton('Minimize · up to 120 validation probes')}${disabledButton('Pause after current probe')}${disabledButton('Export candidate')}</div><p class="help-text">No candidate has been derived or activated in this mockup.</p>`;
  if (activeTool === 'history') content = `<h2>Project management</h2>${mockField('Project name', 'Lantern Coast')}<div class="feature-actions">${disabledButton('Rename project')}${disabledButton('Archive project')}${disabledButton('Move to trash')}${disabledButton('Export history')}</div><h2>Project history</h2><p class="help-text">These are actual checkpoints made by edits in this mockup, not invented production history.</p>${checkpoints.length ? checkpoints.map(entry => `<div class="checkpoint-row"><div><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.timestamp)}</small></div>${disabledButton('Review restore')}</div>`).join('') : '<div class="feature-empty">No mockup checkpoints yet. Apply an edit or accept a proposal to create one.</div>'}<h2>Proposal decisions</h2>${Object.entries(decisions).length ? Object.entries(decisions).map(([id, decision]) => `<div class="ledger-row">${proposals.find(proposal => proposal.id === id).title}<small>${decision}</small></div>`).join('') : '<p class="help-text">No decisions recorded.</p>'}`;
  if (activeTool === 'providers') content = `<h2>Stage routing</h2><p class="help-text">Each stage can use a separate connection and model. None is configured in this mockup.</p><div class="routing-table">${['Planning', 'Building', 'Map layout', 'Image generation'].map(stage => `<div><strong>${stage}</strong>${mockSelect('Connection', ['No connection'])}${mockField('Model', '')}</div>`).join('')}</div><h2>Connections</h2><div class="feature-actions">${disabledButton('Add connection')}${disabledButton('OpenAI API')}${disabledButton('Local endpoint')}${disabledButton('Refresh availability')}</div><div class="mock-grid">${mockField('Name', '')}${mockSelect('Provider / harness', ['Choose connection type'])}${mockField('Default text model', '')}${mockField('Default image model', '')}${mockField('API base URL', '')}${mockField('Executable path (optional)', '')}</div><label class="mock-field">API key<input type="password" disabled placeholder="Credentials are not collected in mockups"></label><div class="feature-actions">${disabledButton('Store key')}${disabledButton('Remove key')}${disabledButton('List models')}${disabledButton('Test connection')}${disabledButton('Save settings')}</div>`;
  if (activeTool === 'voyage') content = `<h2>Creator API connection</h2><div class="mock-grid">${mockSelect('Environment', ['Production', 'Staging'])}${mockField('Known world short ID', '')}</div><label class="mock-field">API key<input type="password" disabled placeholder="Use the production app to connect"></label><div class="feature-actions">${disabledButton('Connect / use saved key')}${disabledButton('Forget saved key')}${disabledButton('Download world')}</div><h2>Owned worlds</h2><div class="feature-empty">No remote listing loaded</div>${disabledButton('Load more')}<h2>Linked draft</h2><p class="help-text">No remote world, ETag, or revision is linked in this mockup. Refresh and reconcile protect against stale or uncertain saves.</p><div class="feature-actions">${disabledButton('Save to Voyage')}${disabledButton('Refresh linked world')}${disabledButton('Reconcile uncertain save')}</div>`;
  if (activeTool === 'connection') content = `<h2>Codex subscription</h2><div class="connection-state">${icon('sliders', 28)}<div><strong>Not connected in this mockup</strong><p>Use a subscription login or an existing CLI login in the production app.</p></div></div><div class="feature-actions">${disabledButton('Sign in')}${disabledButton('Use existing CLI login')}${disabledButton('Refresh status')}${disabledButton('Sign out')}${disabledButton('Open sign-in page')}</div>`;
  return `<section class="feature-pane detail-pane"><div class="document-strip">${icon(tool[2], 14)}<span>${tool[1]}</span><span class="document-type">Application feature mockup</span></div><div class="feature-heading"><h1>${tool[1]}</h1><span class="help-text">Backend controls are disconnected</span></div><div class="feature-scroll">${content}</div></section>`;
}
function mapCanvas() {
  const width = world.locationSettings.regionSize;
  const half = width / 2;
  return `<section class="canvas-pane"><div class="canvas-toolbar"><strong>World map</strong><span>Lantern Coast</span><button class="subtle" data-action="browse">${icon('search', 15)}Find object</button></div><div class="map-controls"><label>Realm<select disabled><option>No realms in fixture</option></select></label><label>Region<select disabled><option>Lantern Coast</option></select></label><label>Region width<input readonly value="${width}" aria-label="Region width"></label></div><div class="map-view-tabs"><button data-map-mode="realm" aria-pressed="${mapMode === 'realm'}">Realm grid</button><button data-map-mode="region" aria-pressed="${mapMode === 'region'}">Region map</button><span>North is +y</span></div><div class="coordinate-canvas"><div class="map-axis horizontal-axis"></div><div class="map-axis vertical-axis"></div><span class="coordinate north">+${half}</span><span class="coordinate south">−${half}</span><span class="coordinate west">−${half}</span><span class="coordinate east">+${half}</span><div class="map-empty">${icon('map', 32)}<strong>${mapMode === 'region' ? 'No placed locations' : 'No realm grid available'}</strong><p>${mapMode === 'region' ? 'Brinehaven has no authored coordinates. Place it in the production map editor.' : 'The supplied fixture has no realms. Regions must be assigned to a realm before grid placement.'}</p><button disabled title="Map placement is not connected in this mockup">${mapMode === 'region' ? 'Set location position' : '+ Realm'}</button></div></div><div class="unplaced-toolbar"><span>${mapMode === 'region' ? 'Unplaced location' : 'Unassigned region'}</span><button data-select="${mapMode === 'region' ? 'location' : 'region'}">${icon(mapMode === 'region' ? 'pin' : 'map', 15)}${mapMode === 'region' ? 'Brinehaven' : 'Lantern Coast'}${icon('arrow', 13)}</button></div><div class="canvas-bottom"><span>Placement controls: realm cells, local x/y, radius, parent region</span><button class="subtle mobile-inspect" data-action="inspect">Inspect selection${icon('arrow', 14)}</button></div></section>`;
}
function proposalQueue() {
  return `<aside class="queue-pane"><div class="pane-heading"><strong>Proposals</strong><span>${pendingCount()} pending</span></div><div class="queue-label">DEMO CHANGES / LANTERN COAST</div>${proposals.map(proposal => `<button class="queue-item" data-proposal="${proposal.id}" aria-pressed="${selectedProposal === proposal.id}"><span class="queue-mark">${decisions[proposal.id] ? '✓' : '○'}</span><span><strong>${proposal.title}</strong><small>${fields.find(field => field.id === proposal.field).name}</small><em>${decisions[proposal.id] || 'Needs review'}</em></span></button>`).join('')}<div class="queue-foot"><p>Authored examples only.<br>No agent run is being simulated.</p><button class="subtle" data-action="reset-review">Reset demo decisions</button></div></aside>`;
}
function reviewPane() {
  const proposal = proposals.find(entry => entry.id === selectedProposal);
  const field = fields.find(entry => entry.id === proposal.field);
  const decision = decisions[proposal.id];
  return `<section class="review-pane detail-pane"><div class="document-strip">${icon('review', 14)}<span>Proposals</span><span class="document-type">Demo</span></div><div class="review-heading"><div><h1>${proposal.title}</h1><p>${escapeHtml(fieldPath(field))}</p></div><span class="decision-state">${decision || 'Pending decision'}</span></div><div class="comparison-scroll"><label class="proposal-include"><input type="checkbox" data-include="${proposal.id}" ${includedProposals[proposal.id] === false ? '' : 'checked'} ${decision ? 'disabled' : ''}>Include this field change</label><div class="proposal-tools">${disabledButton('Check proposal')}<button data-action="export-candidate">Export candidate JSON</button></div><div class="diff-heading"><span>Original fixture</span><span>Suggested replacement</span></div><div class="diff-body"><div><span class="line-number">1</span><p>${escapeHtml(readFrom(original, field))}</p></div><div class="diff-added"><span class="line-number">1</span><p>${escapeHtml(proposal.text)}</p></div></div><div class="reason-box"><strong>Reason for this change</strong><p>${proposal.reason}</p></div><div class="scope-line">${icon('source', 14)}Scope: one text field · demo copy only</div></div><div class="review-actions"><button class="subtle mobile-back" data-action="browse">${icon('back')}Queue</button><button data-decision="rejected" ${decision ? 'disabled' : ''}>Reject</button><button class="primary" data-decision="accepted" ${decision || includedProposals[proposal.id] === false ? 'disabled' : ''}>Accept into demo</button></div></section>`;
}
function studio() {
  return `<main class="studio-workspace app-workspace">${toolNav('tool-rail')}${activeTool === 'review' ? proposalQueue() : objectPane(true)}<div class="studio-center">${workspaceContent()}${changeTray()}</div>${propertyDock()}</main>`;
}
function spatial() {
  return `${toolNav('top-tools')}<main class="spatial-workspace app-workspace">${activeTool === 'review' ? proposalQueue() : objectPane()}${isFeatureTool() ? featurePane() : activeTool === 'review' ? reviewPane() : mapCanvas()}${detailPane('spatial-inspector')}</main>`;
}
function reviewDesk() {
  return `<main class="review-workspace app-workspace"><aside class="module-pane"><div class="module-heading">Workspace</div>${toolNav('module-tools')}<div class="pane-foot">Local mockup</div></aside>${activeTool === 'review' ? proposalQueue() : objectPane()}${workspaceContent()}${activeTool === 'review' ? `<aside class="working-source property-pane"><div class="pane-heading"><strong>Working source</strong></div><div class="working-scroll"><p class="field-key">${currentField().name}</p><h3>${currentField().label}</h3><p class="working-copy" id="working-copy">${escapeHtml(readFrom(world, currentField()))}</p><div class="inspector-section"><h3>Decision ledger</h3>${Object.entries(decisions).length ? Object.entries(decisions).map(([id, decision]) => `<div class="ledger-row">${escapeHtml(proposals.find(proposal => proposal.id === id).title)}<small>${decision}</small></div>`).join('') : '<p class="help-text">No decisions yet.</p>'}</div></div></aside>` : propertyDock()}</main>`;
}
function adaptive() {
  return `${toolNav('top-tools adaptive-tools')}<main class="adaptive-workspace app-workspace">${activeTool === 'review' ? proposalQueue() : objectPane()}${workspaceContent()}<aside class="adaptive-context property-pane"><div class="pane-heading"><strong>Context</strong></div><section class="inspector-section"><h3>Lantern Coast</h3><p class="help-text">${escapeHtml(world.storySettings.worldBackground)}</p></section><section class="inspector-section"><h3>World lore</h3><strong class="context-title">The Great Lamps</strong><p class="help-text">${escapeHtml(world.worldLore['The Great Lamps'].text)}</p><button class="subtle" data-select="lore">Open lore${icon('arrow', 14)}</button></section><section class="inspector-section"><h3>Local changes</h3><div id="dock-changes">${changeList()}</div></section></aside></main>`;
}
function sourceTable(query = '') {
  const matches = fields.filter(field => `${field.name} ${field.category} ${fieldPath(field)}`.toLowerCase().includes(query.toLowerCase()));
  return `<table class="source-table"><thead><tr><th>Object</th><th>Type</th><th>Source field</th><th>State</th></tr></thead><tbody>${matches.map(field => `<tr class="${selected === field.id ? 'selected-row' : ''}"><td><button data-select="${field.id}">${icon(field.icon, 16)}${field.name}</button></td><td>${field.type}</td><td><code>${field.path.at(-1)}</code></td><td>${readFrom(original, field) === read(field) ? '<span class="muted">—</span>' : '<span class="modified">Modified</span>'}</td></tr>`).join('')}</tbody></table>${matches.length ? '' : '<div class="empty-state">No matching source objects.</div>'}`;
}
function browser() {
  return `${toolNav('top-tools')}<main class="browser-workspace app-workspace">${activeTool === 'review' ? proposalQueue() : objectPane(true)}<div class="browser-center">${isFeatureTool() ? featurePane() : activeTool === 'review' ? reviewPane() : activeTool === 'map' ? mapCanvas() : `<section class="table-pane"><div class="pane-heading"><strong>Source objects</strong><span>${fields.length} fields</span></div><div class="filter-control table-filter">${icon('search', 15)}<input type="search" id="table-filter" aria-label="Search source table" placeholder="Search object names or source paths"></div><div class="table-scroll" id="source-table">${sourceTable()}</div></section>`}${changeTray()}</div>${detailPane('browser-inspector')}</main>`;
}
function bottomNav() {
  return `<nav class="bottom-tools" aria-label="Mobile workspace tools">${[['world', 'World', 'world'], ['map', 'Map', 'map'], ['characters', 'People', 'person'], ['review', 'Review', 'review']].map(([id, name, iconName]) => `<button data-tool="${id}" aria-pressed="${activeTool === id}">${icon(iconName, 20)}<span>${name}</span></button>`).join('')}<button data-action="more">${icon('more', 20)}<span>More</span></button></nav>`;
}
function footer() {
  return `<footer class="statusbar"><span><i class="local-dot"></i>Mockup · local demo only</span><button data-action="tray">${icon('source', 12)}<span data-change-count>${changes().length}</span> edits from fixture</button><span data-save-status>${status}</span><span class="status-shortcuts">Ctrl/⌘ K · Find &nbsp; Ctrl/⌘ S · Save</span></footer>`;
}
function dialogs() {
  return `<dialog id="finder-dialog" aria-label="Find source object"><header><strong>Find source object</strong><button data-action="close-dialog" aria-label="Close dialog">×</button></header><input id="finder-search" type="search" placeholder="Name or source path" aria-label="Search source objects"><div id="finder-results"></div><footer>Ctrl/⌘ K · Escape to close</footer></dialog><dialog id="more-dialog" aria-label="All tools and project actions"><header><strong>All tools</strong><button data-action="close-dialog" aria-label="Close dialog">×</button></header>${toolNav('all-tools')}<div class="mockup-layout-switcher"><label for="mobile-layout-select">Mockup layout</label>${layoutSelect('mobile-layout-select')}</div><div class="dialog-actions">${toolbarButton('export', 'Export active demo JSON', 'source')}${toolbarButton('projects', 'Project', 'folder')}${toolbarButton('reset-review', 'Reset demo decisions', 'review')}</div><p class="help-text">Backend actions are disabled in the mockup, not replaced by fabricated success states.</p></dialog><dialog id="info-dialog" aria-label="Mockup information"><header><strong id="info-title"></strong><button data-action="close-dialog" aria-label="Close dialog">×</button></header><div id="info-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div>`;
}
function render() {
  document.body.dataset.mobile = mobilePane;
  document.body.dataset.tool = activeTool;
  document.body.dataset.feature = isFeatureTool() ? 'true' : 'false';
  app.innerHTML = `<div class="application">${chrome()}${({fieldnotes: studio, atlas: spatial, assembly: reviewDesk, focus: adaptive, signal: browser}[concept])()}${bottomNav()}${footer()}</div>${dialogs()}`;
}
function updateState() {
  dirty = true;
  status = 'Unsaved local edits';
  document.querySelectorAll('[data-save-status]').forEach(node => { node.textContent = status; });
  document.querySelectorAll('[data-change-count]').forEach(node => { node.textContent = changes().length; });
  const dock = document.querySelector('#dock-changes');
  if (dock) dock.innerHTML = changeList();
  const tray = document.querySelector('#tray-content');
  if (tray) tray.innerHTML = changeList();
}
function announce(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = message;
  toastTimer = setTimeout(() => { document.querySelector('#toast').textContent = ''; }, 3500);
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({world, decisions, drafts, checkpoints}));
    dirty = false;
    status = Object.keys(drafts).length ? 'Draft saved locally · not applied' : 'Saved in this browser';
    document.querySelectorAll('[data-save-status]').forEach(node => { node.textContent = status; });
    announce('Local demo saved. Production projects are unchanged.');
    return true;
  } catch { announce('Browser storage unavailable. Export JSON to keep your edits.'); return false; }
}
function selectField(id) {
  if (!fields.some(field => field.id === id)) return;
  selected = id;
  activeTool = id === 'character' ? 'characters' : 'world';
  editorTab = 'properties';
  mobilePane = 'detail';
  render();
}
function openDialog(id) {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.querySelector(`#${id}`).showModal();
}
function showInfo(title, html) {
  document.querySelector('#info-title').textContent = title;
  document.querySelector('#info-content').innerHTML = html;
  openDialog('info-dialog');
}
function finder(query = '') {
  const matches = fields.filter(field => `${field.name} ${fieldPath(field)}`.toLowerCase().includes(query.toLowerCase()));
  document.querySelector('#finder-results').innerHTML = matches.length ? matches.map(field => objectButton(field)).join('') : '<p class="empty-state">No matching objects.</p>';
}
function switchTool(id) {
  activeTool = id;
  if (id === 'world') selected = 'background';
  if (id === 'characters') selected = 'character';
  if (id === 'map') selected = 'region';
  if (id === 'review') selected = proposals.find(proposal => proposal.id === selectedProposal).field;
  mobilePane = id === 'map' ? 'canvas' : 'detail';
  render();
}
function showHistory() {
  const decided = proposals.filter(proposal => decisions[proposal.id]);
  showInfo('Local decision history', decided.length ? `<ol class="history-list">${decided.map(proposal => `<li>${proposal.title}<strong>${decisions[proposal.id]}</strong></li>`).join('')}</ol>` : '<p class="help-text">No decisions yet. Review a demo proposal to record one.</p>');
}
function exportWorld() {
  const blob = new Blob([JSON.stringify(world, null, 2) + '\n'], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lantern-coast-${study}-demo.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Exported the complete demo world JSON.');
}
function exportCandidate() {
  const candidate = structuredClone(world);
  const proposal = proposals.find(entry => entry.id === selectedProposal);
  const field = fields.find(entry => entry.id === proposal.field);
  if (includedProposals[proposal.id] !== false) {
    const parent = field.path.slice(0, -1).reduce((entry, key) => entry[key], candidate);
    parent[field.path.at(-1)] = proposal.text;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(candidate, null, 2) + '\n'], {type: 'application/json'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lantern-coast-${study}-candidate-demo.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Exported the selected candidate. Active source was not changed.');
}
function decide(statusValue) {
  if (decisions[selectedProposal] || (statusValue === 'accepted' && includedProposals[selectedProposal] === false)) return;
  if (Object.keys(drafts).length) { announce('Apply or discard editor drafts before reviewing a proposal.'); return; }
  const proposal = proposals.find(entry => entry.id === selectedProposal);
  selected = proposal.field;
  if (statusValue === 'accepted') { checkpoint(`Before accepting: ${proposal.title}`); write(currentField(), proposal.text); }
  decisions[selectedProposal] = statusValue;
  updateState();
  render();
  save();
}
function resetReview() {
  if (!confirm('Reset demo decisions and restore their two source fields to the supplied fixture?')) return;
  for (const proposal of proposals) {
    const field = fields.find(entry => entry.id === proposal.field);
    write(field, readFrom(original, field));
  }
  decisions = {};
  updateState();
  render();
  save();
}
function miniature(layout) {
  const arrangements = {
    fieldnotes: [[0, 0, 38, 280, 'rail'], [38, 0, 130, 280, 'side'], [168, 0, 260, 280, 'main'], [428, 0, 132, 280, 'side']],
    atlas: [[0, 0, 120, 280, 'side'], [120, 0, 300, 280, 'canvas'], [420, 0, 140, 280, 'main']],
    assembly: [[0, 0, 90, 280, 'rail'], [90, 0, 125, 280, 'side'], [215, 0, 230, 280, 'main'], [445, 0, 115, 280, 'side']],
    focus: [[0, 0, 140, 280, 'side'], [140, 0, 280, 280, 'main'], [420, 0, 140, 280, 'side']],
    signal: [[0, 0, 110, 280, 'side'], [110, 0, 270, 280, 'table'], [380, 0, 180, 280, 'main']],
  };
  return `<svg class="layout-schematic" viewBox="0 0 560 325" role="img" aria-label="${layout.name} pane arrangement"><rect class="sketch-top" width="560" height="35"/><g transform="translate(0 35)">${(arrangements[layout.id] || arrangements.focus).map(([left, top, width, height, kind]) => `<g><rect class="sketch-${kind}" x="${left}" y="${top}" width="${width}" height="${height}"/>${kind === 'canvas' ? `<path d="M${left + width / 2} 70v120"/><rect class="sketch-object" x="${left + width / 2 - 42}" y="45" width="84" height="36"/><rect class="sketch-object" x="${left + width / 2 - 42}" y="115" width="84" height="36"/><rect class="sketch-object" x="${left + width / 2 - 42}" y="185" width="84" height="36"/>` : Array.from({length: kind === 'rail' ? 6 : 7}, (_, index) => `<rect class="sketch-line" x="${left + 12}" y="${20 + index * 29}" width="${kind === 'main' ? Math.max(25, width - 50 - index % 3 * 18) : width - 25}" height="${kind === 'main' && index === 3 ? 48 : 6}"/>`).join('')}</g>`).join('')}</g><rect class="sketch-top" y="315" width="560" height="10"/></svg>`;
}
function gallery(selectedLayout = comparisonLayouts[0].id) {
  const layout = comparisonLayouts.find(entry => entry.id === selectedLayout);
  if (layout.palette) document.body.dataset.palette = layout.palette;
  app.innerHTML = `<div class="application launcher"><header class="appbar"><div class="app-identity">${icon('world', 20)}<strong>Voyage Workbench</strong><span class="muted">${document.body.dataset.paletteGallery ? 'Adaptive palettes' : 'Layout comparison'}</span></div><a class="launcher-link" href="${document.body.dataset.paletteGallery ? 'index.html' : 'adaptive.html'}">${document.body.dataset.paletteGallery ? 'Original layouts' : 'Dark adaptive variants'}</a></header><main class="launcher-workspace"><nav class="layout-list" aria-label="Application layout options"><div class="pane-heading"><strong>${document.body.dataset.paletteGallery ? 'Adaptive palettes' : 'Application layouts'}</strong><span>5</span></div>${comparisonLayouts.map(entry => `<button class="layout-choice" data-layout="${entry.id}" aria-pressed="${entry.id === selectedLayout}"><span>${entry.number}</span><div><strong>${entry.name}</strong><small>${entry.subtitle}</small></div>${icon('arrow', 14)}</button>`).join('')}</nav><section class="layout-preview"><div class="preview-toolbar"><h1>${layout.name}</h1><a class="primary button-link" href="${layout.id}.html">Open app mockup${icon('arrow', 15)}</a></div><div class="preview-stage">${miniature(layout)}</div><section class="preview-notes"><h2>${layout.palette ? 'Palette' : 'Pane arrangement'}</h2><p>${layout.subtitle}</p><h2>Comparison task</h2><p>Select Mara Venn, edit her description, inspect a demo proposal, and save the local copy.</p><p class="help-text">HTML is the mockup medium. These are application screens, not website concepts. No production project or provider is connected.</p></section></section></main><footer class="statusbar"><span>App-layout study · Lantern Coast fixture</span><a href="${layout.palette ? 'ADAPTIVE_PALETTES.md' : 'TOURNAMENT.md'}">Planning tournament</a></footer></div>`;
}
async function start() {
  if (concept === 'gallery') {
    gallery();
    app.addEventListener('click', event => { const button = event.target.closest('[data-layout]'); if (button) gallery(button.dataset.layout); });
    return;
  }
  const response = await fetch('lantern-coast.json');
  if (!response.ok) throw new Error('The source fixture could not be loaded.');
  original = await response.json();
  world = structuredClone(original);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.world && fields.every(field => typeof field.path.reduce((entry, key) => entry?.[key], saved.world) === 'string')) {
      world = saved.world;
      decisions = saved.decisions || {};
      drafts = saved.drafts || {};
      checkpoints = saved.checkpoints || [];
      status = 'Restored local copy';
    }
  } catch { status = 'Fixture loaded'; }
  render();
  app.addEventListener('input', event => {
    const target = event.target;
    if (target.matches('#source-editor')) {
      if (target.value === readFrom(world, currentField())) delete drafts[selected];
      else drafts[selected] = target.value;
      updateState();
      document.querySelector('#word-count').textContent = `${target.value.trim().split(/\s+/u).filter(Boolean).length} words`;
      document.querySelectorAll('[data-action="apply"],[data-action="discard"]').forEach(button => { button.disabled = drafts[selected] === undefined; });
      const pathLabel = document.querySelector('.detail-pane .field-path');
      if (pathLabel) pathLabel.textContent = drafts[selected] === undefined ? fieldPath(currentField()) : 'Unapplied local draft';
    }
    if (target.matches('#object-filter')) document.querySelector('#object-list').innerHTML = objectList(target.value);
    if (target.matches('#table-filter')) document.querySelector('#source-table').innerHTML = sourceTable(target.value);
    if (target.matches('#finder-search')) finder(target.value);
  });
  app.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('#layout-select,#mobile-layout-select')) {
      if (dirty && !confirm('Leave this layout without saving its local edits?')) { target.value = study; return; }
      location.href = `${target.value}.html`;
    }
    if (target.dataset.meta) {
      world.npcs['Mara Venn'][target.dataset.meta] = target.type === 'checkbox' ? target.checked : target.value;
      updateState();
    }
    if (target.dataset.include) { includedProposals[target.dataset.include] = target.checked; render(); }
  });
  app.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.select) selectField(button.dataset.select);
    else if (button.dataset.tool) switchTool(button.dataset.tool);
    else if (button.dataset.tab) { editorTab = button.dataset.tab; render(); document.querySelector(`#tab-${editorTab}`).focus(); }
    else if (button.dataset.mapMode) { mapMode = button.dataset.mapMode; render(); }
    else if (button.dataset.artwork) { artworkPurpose = button.dataset.artwork; render(); }
    else if (button.dataset.proposal) { selectedProposal = button.dataset.proposal; selected = proposals.find(proposal => proposal.id === selectedProposal).field; mobilePane = 'detail'; render(); }
    else if (button.dataset.decision) decide(button.dataset.decision);
    else {
      const action = button.dataset.action;
      if (action === 'save') save();
      if (action === 'apply' && drafts[selected] !== undefined) { checkpoint(`Before editing ${currentField().name}`); write(currentField(), drafts[selected]); delete drafts[selected]; updateState(); render(); }
      if (action === 'discard') { delete drafts[selected]; updateState(); render(); }
      if (action === 'export') exportWorld();
      if (action === 'export-candidate') exportCandidate();
      if (action === 'finder') { finder(); openDialog('finder-dialog'); document.querySelector('#finder-search').focus(); }
      if (action === 'more') openDialog('more-dialog');
      if (action === 'close-dialog') button.closest('dialog').close();
      if (action === 'projects') showInfo('Local project', `<div class="project-detail">${icon('folder', 24)}<div><strong>Lantern Coast</strong><p>Source: fixtures/lantern-coast.json</p></div></div><p class="help-text">This mockup has one supplied project. Project import and creation stay in the production app.</p>`);
      if (action === 'history') showHistory();
      if (action === 'reset-review') resetReview();
      if (action === 'browse') { mobilePane = 'list'; render(); if (matchMedia('(min-width: 761px)').matches) { finder(); openDialog('finder-dialog'); } }
      if (action === 'inspect') { mobilePane = 'detail'; render(); }
      if (action === 'tray') { trayOpen = !trayOpen; render(); if (!document.querySelector('.change-tray')) showInfo('Changes from fixture', changeList()); }
    }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['k', 's'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.key.toLowerCase() === 's') save();
      else { finder(); openDialog('finder-dialog'); document.querySelector('#finder-search').focus(); }
    }
    if (event.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const tabIds = ['properties', 'source', 'references'];
      editorTab = tabIds[(tabIds.indexOf(editorTab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
      render();
      document.querySelector(`#tab-${editorTab}`).focus();
    }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}
start().catch(error => { app.innerHTML = `<div class="load-error"><h1>Could not load the mockup</h1><p>${escapeHtml(error.message)}</p><p>Serve the directory over HTTP so the fixture can be loaded.</p><a href="index.html">Layout comparison</a></div>`; });
