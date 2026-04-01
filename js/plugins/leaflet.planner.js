'use strict';

import { fetchJsonCached } from "../data/json-cache.js";

/**
 * League Task Planner
 * Adds a "Planner" tab to the task panel.
 * Features:
 *  - Add tasks from active list or inline search
 *  - Drop a pin on the map for each task
 *  - Coloured pins by task tier (Easy/Medium/Hard/Elite/Master)
 *  - Running cumulative points total next to each entry
 *  - Per-task comments / step notes
 *  - Polylines between pinned tasks (show | hide)
 *  - Drag-and-drop reordering within the planner list
 *  - Drag tasks from the active list drop zone into planner
 */

const PLANNER_KEY    = 'league_planner_v1';
const ROUTES_KEY     = 'league_planner_routes_v1';
const DEFAULT_GROUP_NAME = 'Main';

// ─── Tier colour helpers ──────────────────────────────────────────
const TIERS = [
    { min: 400, name: 'Master', color: '#ffd700' },
    { min: 200, name: 'Elite',  color: '#cc66ff' },
    { min: 80,  name: 'Hard',   color: '#ff8800' },
    { min: 30,  name: 'Medium', color: '#4488ff' },
    { min: 0,   name: 'Easy',   color: '#44cc44' },
];

function tierFor(points) {
    return TIERS.find(t => (points || 0) >= t.min) || TIERS[TIERS.length - 1];
}

const VIRTUAL_COLOR = '#00cccc'; // teal – visually distinct from all tier colours

// ─── State ────────────────────────────────────────────────────────
let plannerGroups = [];  // [{ id, name, collapsed, showPins, items:[{ id, taskName, ... }] }]
let allTasksRef  = [];   // mirror of allTasks from leaflet.tasks.js
let allTasksByName = new Map();
let allTasksById   = new Map();
let plannerMap   = null;
let plannerLinesVisible = true;
let plannerPinsVisible = true;
let plannerSelectedId  = null;       // highlighted item id
let pinningMode        = false;
let pinningItemId      = null;
let plannerPinsLayer   = null;
let plannerLinesLayer  = null;
let plannerSuggLayer   = null;   // orange suggestion-location pins for selected card
let dragSrcId          = null;
let dragGroupSrcId     = null;  // group.id being dragged to reorder
let groupDragFromHandle = false; // true only when drag initiated from the handle
let plannerAddSearchQuery = '';
let plannerAddSearchShouldFocus = false;
let plannerAddTargetGroupId = null;
let userRoutes         = [];     // [{ id, name, sections }] — user-created plans persisted in localStorage
let activeUserRouteId  = null;   // id of currently loaded user route (null = viewing a preset)
let activeRouteName    = null;   // null = showing user route; string = read-only preset name
let _presetManifest    = null;   // cached [{name,file}] from route_jsons/manifest.json

function normalizePlannerItem(raw) {
    let taskName = raw && raw.taskName ? raw.taskName : null;
    if (!taskName && raw && raw.taskId != null) {
        const task = allTasksById.get(raw.taskId);
        if (task) taskName = task.name;
    }
    return {
        ...raw,
        id: raw && raw.id ? raw.id : genId(),
        taskName: taskName,
        comments: Array.isArray(raw && raw.comments) ? raw.comments : [],
    };
}

function makePlannerGroup(name, items) {
    return {
        id: genId(),
        name: (name || '').trim() || DEFAULT_GROUP_NAME,
        collapsed: false,
        showPins: true,
        items: (items || []).map(normalizePlannerItem),
    };
}

function ensurePlannerGroups() {
    if (!Array.isArray(plannerGroups)) plannerGroups = [];
    plannerGroups = plannerGroups.map(g => ({
        id: g && g.id ? g.id : genId(),
        name: (g && g.name ? g.name : DEFAULT_GROUP_NAME),
        collapsed: !!(g && g.collapsed),
        showPins: !(g && g.showPins === false),
        items: Array.isArray(g && g.items) ? g.items.map(normalizePlannerItem) : [],
    }));
    if (plannerGroups.length === 0) {
        plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
    }
    if (!plannerAddTargetGroupId || !plannerGroups.some(g => g.id === plannerAddTargetGroupId)) {
        plannerAddTargetGroupId = plannerGroups[0].id;
    }
}

function allPlannerItems() {
    return plannerGroups.flatMap(g => g.items);
}

function findGroupById(groupId) {
    return plannerGroups.find(g => g.id === groupId) || null;
}

function findItemContext(itemId) {
    for (let gi = 0; gi < plannerGroups.length; gi++) {
        const group = plannerGroups[gi];
        const ii = group.items.findIndex(i => i.id === itemId);
        if (ii !== -1) {
            return { group, groupIdx: gi, itemIdx: ii, item: group.items[ii] };
        }
    }
    return null;
}

function removeItemById(itemId) {
    const ctx = findItemContext(itemId);
    if (!ctx) return null;
    const [removed] = ctx.group.items.splice(ctx.itemIdx, 1);
    return removed || null;
}

// ─── Persistence ──────────────────────────────────────────────────
// ─── Preset route manifest ───────────────────────────────────────
async function loadPresetManifest() {
    if (_presetManifest !== null) return _presetManifest;
    try {
        _presetManifest = await fetchJsonCached('route_jsons/manifest.json', { fallback: [] });
    } catch (_) {
        _presetManifest = [];
    }
    return _presetManifest;
}

function applyPlanData(parsed) {
    if (Array.isArray(parsed)) {
        // v1: bare array of items
        plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, parsed)];
    } else if (parsed && Array.isArray(parsed.sections)) {
        // v3+: sections key
        plannerGroups = parsed.sections;
    } else if (parsed && Array.isArray(parsed.groups)) {
        // v2 backwards compat: groups key
        plannerGroups = parsed.groups;
    } else {
        return false;
    }
    ensurePlannerGroups();
    return true;
}

// ─── Persistence ──────────────────────────────────────────────────
function loadAllRoutes() {
    userRoutes = [];
    activeUserRouteId = null;
    try {
        const raw = localStorage.getItem(ROUTES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.routes)) {
                userRoutes = parsed.routes.map(r => ({
                    id: String(r.id || genId()),
                    name: String(r.name || 'My Plan'),
                    // support both 'sections' (v3+) and legacy 'groups' key
                    sections: Array.isArray(r.sections) ? r.sections : (Array.isArray(r.groups) ? r.groups : []),
                }));
                activeUserRouteId = parsed.activeRouteId || null;
                if (activeUserRouteId && !userRoutes.find(r => r.id === activeUserRouteId)) {
                    activeUserRouteId = userRoutes[0] ? userRoutes[0].id : null;
                }
            }
        }
    } catch (_) {}
    // Migrate old single-plan format if no routes saved yet
    if (userRoutes.length === 0) {
        try {
            const oldRaw = localStorage.getItem(PLANNER_KEY);
            if (oldRaw) {
                const oldParsed = JSON.parse(oldRaw);
                let groups = null;
                if (Array.isArray(oldParsed)) {
                    groups = [makePlannerGroup(DEFAULT_GROUP_NAME, oldParsed)];
                } else if (oldParsed && Array.isArray(oldParsed.sections)) {
                    const hasItems = oldParsed.sections.some(g => g.items && g.items.length > 0);
                    if (hasItems) groups = oldParsed.sections;
                } else if (oldParsed && Array.isArray(oldParsed.groups)) {
                    // legacy key
                    const hasItems = oldParsed.groups.some(g => g.items && g.items.length > 0);
                    if (hasItems) groups = oldParsed.groups;
                }
                if (groups) {
                    const migrated = { id: genId(), name: 'My Plan', sections: groups };
                    userRoutes = [migrated];
                    activeUserRouteId = migrated.id;
                }
            }
        } catch (_) {}
    }
}

function saveAllRoutes() {
    try {
        localStorage.setItem(ROUTES_KEY, JSON.stringify({
            routes: userRoutes,
            activeRouteId: activeUserRouteId,
        }));
    } catch (_) {}
}

function loadPlanner() {
    let route = activeUserRouteId ? userRoutes.find(r => r.id === activeUserRouteId) : null;
    if (!route && userRoutes.length > 0) {
        route = userRoutes[0];
        activeUserRouteId = route.id;
    }
    plannerGroups = route ? route.sections : [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
    ensurePlannerGroups();
    if (route) route.sections = plannerGroups;
}

function savePlanner() {
    if (activeRouteName) return; // viewing a read-only preset — don't overwrite user data
    ensurePlannerGroups();
    const route = activeUserRouteId ? userRoutes.find(r => r.id === activeUserRouteId) : null;
    if (route) {
        route.sections = plannerGroups;
        saveAllRoutes();
    }
}

function buildExportSections() {
    ensurePlannerGroups();
    return plannerGroups.map(group => ({
        ...group,
        items: group.items.map(item => {
            if (item.virtual) return { ...item };
            const task = getTask(item.taskName);
            const out = { ...item };
            delete out.id;
            out.taskId = task && task.taskId != null ? task.taskId : null;
            return out;
        }),
    }));
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Task lookup ──────────────────────────────────────────────────
function getTask(name) {
    return allTasksByName.get(name) || null;
}

// ─── Strategy location clustering ─────────────────────────────────
const CLUSTER_RADIUS = 10;

// Core clustering: accepts [{x,y}] coords, returns centroid clusters.
function clusterCoords(coords) {
    if (coords.length === 0) return [];
    const assigned = new Array(coords.length).fill(false);
    const clusters = [];
    for (let i = 0; i < coords.length; i++) {
        if (assigned[i]) continue;
        const members = [coords[i]];
        assigned[i] = true;
        let changed = true;
        while (changed) {
            changed = false;
            for (let j = 0; j < coords.length; j++) {
                if (assigned[j]) continue;
                const inRange = members.some(m =>
                    Math.max(Math.abs(coords[j].x - m.x), Math.abs(coords[j].y - m.y)) <= CLUSTER_RADIUS
                );
                if (inRange) { members.push(coords[j]); assigned[j] = true; changed = true; }
            }
        }
        const cx = Math.round(members.reduce((s, m) => s + m.x, 0) / members.length);
        const cy = Math.round(members.reduce((s, m) => s + m.y, 0) / members.length);
        clusters.push({ lat: cy + 0.5, lng: cx + 0.5, x: cx, y: cy, count: members.length });
    }
    return clusters;
}

// Sync: cluster strategy.points (explicit coords in the task JSON).
function clusterStrategyPoints(task) {
    if (!task || !task.strategy || !task.strategy.points) return [];
    const raw = task.strategy.points.trim();
    if (!raw || raw.toLowerCase() === 'n/a') return [];
    const nums = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const coords = [];
    for (let i = 0; i + 1 < nums.length; i += 2) coords.push({ x: nums[i], y: nums[i + 1] });
    return clusterCoords(coords);
}

// ─── Async location lookup from data files ────────────────────────
const _plannerJsonCache = {};
async function _plannerFetchJson(url) {
    if (_plannerJsonCache[url]) return _plannerJsonCache[url];
    try { _plannerJsonCache[url] = await fetchJsonCached(url); }
    catch (e) { _plannerJsonCache[url] = []; }
    return _plannerJsonCache[url];
}

// Async: builds clusters from strategy.search by searching monsters +
// item_spawns data files.  Falls back to strategy.points if that yields
// nothing.  Respects the current enabled regions.
async function loadSuggestedClusters(task) {
    // Prefer explicit points first (sync, no fetch needed)
    const staticClusters = clusterStrategyPoints(task);
    if (staticClusters.length > 0) return staticClusters;

    const searchRaw = task && task.strategy && task.strategy.search ? task.strategy.search.trim() : '';
    if (!searchRaw || searchRaw.toLowerCase() === 'n/a') return [];

    const strict = /^".*"$/.test(searchRaw);
    const searchLower = (strict ? searchRaw.slice(1, -1) : searchRaw).toLowerCase();
    if (!searchLower) return [];

    const regions = window._getCurrentRegions ? window._getCurrentRegions() : null;
    const regionSet = regions && Array.isArray(regions)
        ? new Set(regions.map(r => String(r).toLowerCase()))
        : null;

    const [monsters, spawns, scenery] = await Promise.all([
        _plannerFetchJson('data_osrs/monsters.json'),
        _plannerFetchJson('data_osrs/item_spawns.json'),
        _plannerFetchJson('data_osrs/scenery.json'),
    ]);

    const allCoords = [];
    function extract(data) {
        data.forEach(entry => {
            if (!entry.page_name || !entry.coordinates) return;
            const nl = entry.page_name.toLowerCase();
            if (strict ? nl !== searchLower : !nl.includes(searchLower)) return;
            if (regionSet) {
                const er = entry.leagueregion || [];
                if (er.length > 0 && !er.some(r => regionSet.has(r.toLowerCase()))) return;
            }
            entry.coordinates.forEach(c => allCoords.push({ x: Math.round(c[0]), y: Math.round(c[1]) }));
        });
    }
    extract(monsters);
    extract(spawns);
    extract(scenery);

    return clusterCoords(allCoords);
}

const SUGG_VISIBLE = 5; // how many location buttons to show before collapsing

// Render suggestion buttons into the card's .planner-card-suggestions element
// once the async data is ready.  Does nothing if the card has been removed.
function renderSuggButtons(container, clusters, item) {
    container.innerHTML = '';
    if (clusters.length === 0) {
        container.style.display = 'none';
        return;
    }

    const label = document.createElement('span');
    label.className = 'planner-sugg-label';
    label.textContent = 'Suggested location' + (clusters.length > 1 ? 's:' : ':');
    container.appendChild(label);

    const overflow = document.createElement('div');
    overflow.className = 'planner-sugg-overflow';

    clusters.forEach((c, i) => {
        const isActive = item.pinCoords
            && Math.abs(item.pinCoords.lng - c.lng) < 1
            && Math.abs(item.pinCoords.lat - c.lat) < 1;
        const countPart = c.count > 1 ? ` (${c.count}${clusters.length === 1 ? ' nearby' : ''})` : '';
        const labelText = clusters.length === 1
            ? `${c.x}, ${c.y}${countPart}`
            : `${i + 1}: ${c.x}, ${c.y}${countPart}`;
        const btn = document.createElement('button');
        btn.className = 'planner-sugg-btn' + (isActive ? ' planner-sugg-active' : '');
        btn.textContent = labelText;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            item.pinCoords = { lat: c.lat, lng: c.lng };
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
            if (plannerMap) plannerMap.setView([c.lat, c.lng], Math.max(plannerMap.getZoom(), 0));
        });
        if (i < SUGG_VISIBLE) {
            container.appendChild(btn);
        } else {
            overflow.appendChild(btn);
        }
    });

    if (overflow.childElementCount > 0) {
        container.appendChild(overflow);

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'planner-sugg-toggle';
        let expanded = false;
        const update = () => {
            const remaining = overflow.childElementCount;
            toggleBtn.textContent = expanded
                ? '▴ Show less'
                : `▾ ${remaining} more…`;
            overflow.classList.toggle('planner-sugg-overflow-open', expanded);
        };
        update();
        toggleBtn.addEventListener('click', e => {
            e.stopPropagation();
            expanded = !expanded;
            update();
        });
        container.appendChild(toggleBtn);
    }
}

async function populateSuggestionsAsync(item, task, card) {
    const container = card.querySelector('.planner-card-suggestions');
    if (!container) return;
    const clusters = await loadSuggestedClusters(task);
    // Card may have been replaced by a re-render — check it's still in the DOM
    if (!card.isConnected) return;
    renderSuggButtons(container, clusters, item);
}

// Emits the container shell; populateSuggestionsAsync always fills it.
function buildSuggestionsHtml(item, task) {
    if (item.virtual || !task) return '';
    const hasSearch = task.strategy && task.strategy.search
        && task.strategy.search.trim().toLowerCase() !== 'n/a';
    const hasPoints = task.strategy && task.strategy.points
        && task.strategy.points.trim().toLowerCase() !== 'n/a';
    if (!hasSearch && !hasPoints) return '';
    return '<div class="planner-card-suggestions"><span class="planner-sugg-label">Suggested locations:</span><span class="planner-sugg-loading">⟳</span></div>';
}

function buildPlannerSkillReqsHtml(task) {
    if (!task || !Array.isArray(task.skills) || task.skills.length === 0) return '';
    return `<div class="planner-card-skill-reqs">` +
        task.skills.map(s =>
            `<span class="planner-card-skill-chip" title="${esc(s.skill)} ${s.level}">` +
                `<img class="planner-card-skill-icon" src="${esc(s.iconUrl || '')}" alt="${esc(s.skill)} icon" loading="lazy"/>` +
                `<span class="planner-card-skill-level">${s.level}</span>` +
            `</span>`
        ).join('') +
    `</div>`;
}

// ─── HTML escaping ────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── SVG pin icon ─────────────────────────────────────────────────
function makeSuggPinIcon() {
    const svg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30" viewBox="0 0 20 30">` +
        `<path d="M10 0C4.5 0 0 4.5 0 10c0 6 10 20 10 20S20 16 20 10C20 4.5 15.5 0 10 0z" fill="#ff8800" stroke="#7a3000" stroke-width="1.5"/>` +
        `<circle cx="10" cy="10" r="4" fill="#000" opacity="0.3"/>` +
        `</svg>`
    );
    return window.L && L.icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + svg,
        iconSize:    [20, 30],
        iconAnchor:  [10, 30],
        popupAnchor: [0, -32],
    });
}

function makePinIcon(color, number) {
    const numSvg = number != null
        ? `<text x="12" y="15" font-size="9" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${number}</text>`
        : '';
    const svg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">` +
        `<path d="M14 0C6.3 0 0 6.3 0 14c0 8.4 14 26 14 26S28 22.4 28 14C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#1a1000" stroke-width="1.5"/>` +
        `<circle cx="14" cy="14" r="6" fill="#000" opacity="0.25"/>` +
        numSvg +
        `</svg>`
    );
    return window.L && L.icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + svg,
        iconSize:    [28, 40],
        iconAnchor:  [14, 40],
        popupAnchor: [0, -42],
    });
}

// ─── Map overlay ──────────────────────────────────────────────────
function redrawMapOverlays() {
    const L   = window.L;
    const map = plannerMap;
    if (!L || !map) return;

    if (plannerPinsLayer)  { map.removeLayer(plannerPinsLayer);  plannerPinsLayer  = null; }
    if (plannerLinesLayer) { map.removeLayer(plannerLinesLayer); plannerLinesLayer = null; }
    if (plannerSuggLayer)  { map.removeLayer(plannerSuggLayer);  plannerSuggLayer  = null; }

    const orderById = new Map(allPlannerItems().map((item, idx) => [item.id, idx]));
    const pinned = plannerGroups
        .flatMap(group => group.items.map(item => ({
            group,
            item,
            idx: orderById.get(item.id) || 0,
            task: getTask(item.taskName),
        })))
        .filter(x => x.item.pinCoords);

    if (pinned.length === 0) return;

    const visiblePinned = pinned.filter(x => x.group.showPins);

    if (plannerPinsVisible && visiblePinned.length > 0) {
        plannerPinsLayer = L.layerGroup();

        visiblePinned.forEach(({ item, idx, task }) => {
            const isVirtual = !!item.virtual;
            const pts   = isVirtual ? (item.customPoints || 0) : (task ? (task.points || 10) : 10);
            const tier  = isVirtual ? { name: 'Custom step', color: VIRTUAL_COLOR } : tierFor(pts);
            const displayName = isVirtual ? (item.customName || 'Unnamed step') : (task ? task.name : item.taskName);
            const displayDesc = isVirtual ? (item.customDesc || '') : (task ? task.task : '');
            const icon  = makePinIcon(tier.color, idx + 1);
            if (!icon) return;

            const commentsHtml = item.comments.length
                ? '<ul style="margin:4px 0 0 0;padding-left:16px;color:#c8b880;">'
                  + item.comments.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>'
                : '';

            const marker = L.marker([item.pinCoords.lat, item.pinCoords.lng], {
                icon,
                zIndexOffset: 200,
                draggable: isVirtual,
            });
            if (isVirtual) {
                const capturedId = item.id;
                marker.on('dragend', (e) => {
                    const pos = e.target.getLatLng();
                    // Always look up the live item by ID — the closure's `item` reference
                    // may be stale if ensurePlannerGroups() rebuilt the array since creation.
                    const ctx = findItemContext(capturedId);
                    if (!ctx) return;
                    ctx.item.pinCoords = { lat: pos.lat, lng: pos.lng };
                    savePlanner();
                    setTimeout(() => { redrawMapOverlays(); renderPlanner(); }, 0);
                });
            }
            marker.bindPopup(
                `<div class="osrs-popup-inner">` +
                `<b>#${idx + 1} ${esc(displayName)}</b><br>` +
                `<span style="color:${tier.color};font-weight:bold;">${tier.name}</span>` +
                (isVirtual ? '' : ` · <span style="color:#e8d5a0;">${pts} pts</span>`) + `<br>` +
                (displayDesc ? `<span style="color:#c8b880;">${esc(displayDesc)}</span>` : '') +
                commentsHtml +
                `</div>`,
                { autoPan: false, className: 'osrs-popup' }
            );
            // Clicking the pin opens the popup AND selects the item in the planner pane
            marker.on('click', () => selectPlannerItem(item.id));
            plannerPinsLayer.addLayer(marker);
        });

        plannerPinsLayer.addTo(map);
    } // end plannerPinsVisible

    // Lines
    if (plannerLinesVisible && visiblePinned.length >= 2) {
        plannerLinesLayer = L.layerGroup();

        const pairs = [];
        for (let i = 0; i < visiblePinned.length - 1; i++) pairs.push([visiblePinned[i], visiblePinned[i + 1]]);

        pairs.forEach(([a, b]) => {
            L.polyline(
                [[a.item.pinCoords.lat, a.item.pinCoords.lng], [b.item.pinCoords.lat, b.item.pinCoords.lng]],
                { color: '#ffd700', weight: 2, opacity: 0.75, dashArray: '6 5' }
            ).addTo(plannerLinesLayer);
        });

        plannerLinesLayer.addTo(map);
    }

    // Suggestion pins drawn async after main layers are set
    redrawSuggestionPins();
}

// ─── Suggestion location pins (shown when a card is selected) ─────
async function redrawSuggestionPins() {
    const L   = window.L;
    const map = plannerMap;
    if (!L || !map) return;
    if (plannerSuggLayer) { map.removeLayer(plannerSuggLayer); plannerSuggLayer = null; }
    if (!plannerSelectedId) return;

    const itemCtx = findItemContext(plannerSelectedId);
    const item = itemCtx ? itemCtx.item : null;
    if (!item || item.virtual) return;
    const task = getTask(item.taskName);
    if (!task) return;

    const capturedSelectedId = plannerSelectedId;
    const clusters = await loadSuggestedClusters(task);
    if (!clusters.length || plannerSelectedId !== capturedSelectedId) return;

    plannerSuggLayer = L.layerGroup();
    const icon = makeSuggPinIcon();
    if (!icon) return;

    clusters.forEach((c, i) => {
        const countPart = c.count > 1 ? ` (${c.count} nearby)` : '';
        const labelText = clusters.length === 1
            ? `${c.x}, ${c.y}${countPart}`
            : `${i + 1}: ${c.x}, ${c.y}${countPart}`;
        const marker = L.marker([c.lat, c.lng], { icon, zIndexOffset: 100 });
        marker.bindPopup(
            `<div class="osrs-popup-inner">` +
            `<b>${esc(item.taskName)}</b><br>` +
            `<span style="color:#ff8800;font-weight:bold;">Suggested location</span><br>` +
            `<span class="popup-coords">${esc(labelText)}</span><br>` +
            `<small style="color:#c8b880;">Click pin to set as task location</small>` +
            `</div>`,
            { autoPan: false, className: 'osrs-popup' }
        );
        marker.on('click', e => {
            L.DomEvent.stopPropagation(e);
            item.pinCoords = { lat: c.lat, lng: c.lng };
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        });
        plannerSuggLayer.addLayer(marker);
    });

    plannerSuggLayer.addTo(map);
}

// ─── Auto-route ──────────────────────────────────────────────────
// Nearest-neighbor routing within a single group.
// Starting point: the first item that already has a pinCoords.
// Items with 0 candidate locations are pushed to the end.
// Items with multiple candidates get pinned to the one closest to
// their predecessor in the resulting order.
async function autoRouteGroup(group) {
    const items = group.items;
    if (items.length < 2) return;

    // Load candidate locations for every item in parallel.
    // Pinned items keep their pin as the sole candidate.
    const candidates = await Promise.all(items.map(async (item) => {
        if (item.pinCoords) return [{ lat: item.pinCoords.lat, lng: item.pinCoords.lng }];
        if (item.virtual) return [];
        const task = getTask(item.taskName);
        if (!task) return [];
        const clusters = await loadSuggestedClusters(task);
        return clusters.map(c => ({ lat: c.lat, lng: c.lng }));
    }));

    // Find the starting point — first item with a pin
    const startIdx = items.findIndex(i => i.pinCoords);
    if (startIdx === -1) return; // nothing pinned, nothing to route from

    // Split into routable (has at least one candidate) vs unroutable
    const routable = [];
    const unroutable = [];
    items.forEach((item, i) => {
        if (candidates[i].length > 0) {
            routable.push({ item, candidates: candidates[i], originalIdx: i });
        } else {
            unroutable.push(item);
        }
    });
    if (routable.length < 2) return;

    // Seed the walk with the first pinned item
    const startEntry = routable.find(r => r.originalIdx === startIdx);
    const ordered = [startEntry];
    const remaining = new Set(routable.filter(r => r !== startEntry));
    let currentPos = startEntry.candidates[0];

    // Greedy nearest-neighbour: at each step pick the unvisited task
    // whose closest candidate location is nearest to currentPos.
    while (remaining.size > 0) {
        let bestDist = Infinity;
        let bestEntry = null;
        let bestCoord = null;

        for (const entry of remaining) {
            for (const coord of entry.candidates) {
                const d = (coord.lat - currentPos.lat) ** 2
                        + (coord.lng - currentPos.lng) ** 2;
                if (d < bestDist) {
                    bestDist = d;
                    bestEntry = entry;
                    bestCoord = coord;
                }
            }
        }

        // Auto-assign pin to the chosen location if the item wasn't pinned
        if (!bestEntry.item.pinCoords) {
            bestEntry.item.pinCoords = { lat: bestCoord.lat, lng: bestCoord.lng };
        }

        ordered.push(bestEntry);
        remaining.delete(bestEntry);
        currentPos = bestCoord;
    }

    // Rebuild: routed items in order, then unroutable at the end
    group.items = [...ordered.map(r => r.item), ...unroutable];
}

async function autoRouteAll() {
    for (const group of plannerGroups) {
        await autoRouteGroup(group);
    }
    savePlanner();
    redrawMapOverlays();
    renderPlanner();
}

// ─── Pinning mode ─────────────────────────────────────────────────
function startPinning(itemId) {
    cancelPinning();
    pinningMode   = true;
    pinningItemId = itemId;

    const map = plannerMap;
    if (!map) return;
    map.getContainer().style.cursor = 'crosshair';

    // Use a native capturing listener on the container so it fires BEFORE
    // Leaflet dispatches to any marker (which would open a popup instead).
    map._plannerPinHandler = function (e) {
        e.stopPropagation();   // prevent marker popup
        e.preventDefault();
        const latlng = map.mouseEventToLatLng(e);
        const pinCtx = findItemContext(pinningItemId);
        const item = pinCtx ? pinCtx.item : null;
        if (item) {
            item.pinCoords = { lat: latlng.lat, lng: latlng.lng };
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        }
        cancelPinning();
    };
    map.getContainer().addEventListener('click', map._plannerPinHandler, { capture: true });

    document.querySelectorAll('.planner-card').forEach(c => {
        c.classList.toggle('planner-card-pinning', c.dataset.id === itemId);
    });
    updateStatusBanner('Click on the map to place the pin. Press Esc to cancel.');
}

function cancelPinning() {
    pinningMode   = false;
    pinningItemId = null;
    const map = plannerMap;
    if (map) {
        map.getContainer().style.cursor = '';
        if (map._plannerPinHandler) {
            map.getContainer().removeEventListener('click', map._plannerPinHandler, { capture: true });
            map._plannerPinHandler = null;
        }
    }
    document.querySelectorAll('.planner-card').forEach(c => c.classList.remove('planner-card-pinning'));
    updateStatusBanner(null);
}

// ─── Map context menu ─────────────────────────────────────────────
let _mapContextMenuLatLng = null;

function showMapContextMenu(latlng, clientX, clientY) {
    hideMapContextMenu();
    _mapContextMenuLatLng = latlng;

    const menu = document.createElement('div');
    menu.id = 'planner-map-ctx-menu';
    menu.className = 'planner-map-ctx-menu';
    menu.innerHTML =
        '<div class="planner-ctx-section-label">Custom step</div>' +
        '<div class="planner-ctx-row">' +
            '<input id="planner-ctx-custom-input" class="planner-ctx-input" type="text" placeholder="Step name\u2026" autocomplete="off"/>' +
            '<button class="planner-line-btn" id="planner-ctx-custom-add">+ Add</button>' +
        '</div>' +
        '<div class="planner-ctx-divider"></div>' +
        '<div class="planner-ctx-section-label">Add task</div>' +
        '<input id="planner-ctx-search-input" class="planner-ctx-input" type="text" placeholder="Search tasks\u2026" autocomplete="off"/>' +
        '<div id="planner-ctx-search-results" class="planner-ctx-results"></div>';

    menu.style.left = clientX + 'px';
    menu.style.top  = clientY + 'px';
    document.body.appendChild(menu);

    // Nudge off-screen edges
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right  > window.innerWidth)  menu.style.left = (clientX - rect.width)  + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top  = (clientY - rect.height) + 'px';
    });

    const addItemWithPin = (item) => {
        ensurePlannerGroups();
        item.pinCoords = { lat: latlng.lat, lng: latlng.lng };
        // Insert after the currently selected item if one exists, otherwise append
        const selCtx = plannerSelectedId ? findItemContext(plannerSelectedId) : null;
        if (selCtx) {
            selCtx.group.items.splice(selCtx.itemIdx + 1, 0, item);
        } else {
            const group = findGroupById(plannerAddTargetGroupId) || plannerGroups[0];
            if (!group) return;
            group.items.push(item);
        }
        savePlanner();
        redrawMapOverlays();
        renderPlanner();
        hideMapContextMenu();
    };

    const customInput = menu.querySelector('#planner-ctx-custom-input');
    menu.querySelector('#planner-ctx-custom-add').addEventListener('click', () => {
        const name = customInput.value.trim();
        if (!name) return;
        addItemWithPin({ id: genId(), virtual: true, customName: name, customDesc: '', comments: [] });
    });
    customInput.addEventListener('keydown', e => {
        if (e.key === 'Enter')  menu.querySelector('#planner-ctx-custom-add').click();
        if (e.key === 'Escape') hideMapContextMenu();
    });

    const searchInput   = menu.querySelector('#planner-ctx-search-input');
    const searchResults = menu.querySelector('#planner-ctx-search-results');
    searchInput.addEventListener('input', () => _renderCtxSearchResults(searchInput.value, searchResults, addItemWithPin));
    searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') hideMapContextMenu(); });

    requestAnimationFrame(() => customInput.focus());
}

function hideMapContextMenu() {
    const existing = document.getElementById('planner-map-ctx-menu');
    if (existing) existing.remove();
    _mapContextMenuLatLng = null;
}

function _renderCtxSearchResults(query, container, onAdd) {
    container.innerHTML = '';
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return;
    if (!allTasksRef || !allTasksRef.length) return;

    const addedNames = new Set(allPlannerItems().filter(i => !i.virtual).map(i => i.taskName));
    const regions    = window._getCurrentRegions ? window._getCurrentRegions() : null;
    const regionSet  = regions && Array.isArray(regions)
        ? new Set(regions.map(r => String(r).toLowerCase()))
        : null;

    const matches = allTasksRef.filter(t => {
        if (regionSet && t.area && !regionSet.has(String(t.area).toLowerCase())) return false;
        return `${t.name} ${t.task || ''} ${t.wikiNotes || ''} ${t.area || ''}`.toLowerCase().includes(q);
    }).slice(0, 50);

    matches.forEach(task => {
        const tier = tierFor(task.points || 10);
        const row  = document.createElement('div');
        row.className = 'planner-ctx-result' + (addedNames.has(task.name) ? ' planner-ctx-result-added' : '');
        row.innerHTML =
            `<span class="planner-search-tier-dot" style="background:${tier.color}"></span>` +
            `<span class="planner-ctx-result-name">${esc(task.name)}</span>` +
            `<span class="planner-search-result-pts" style="color:${tier.color}">${task.points}pts</span>`;
        row.addEventListener('click', () =>
            onAdd({ id: genId(), taskName: task.name, comments: [] })
        );
        container.appendChild(row);
    });
}

// ─── Status banner ────────────────────────────────────────────────
function updateStatusBanner(msg) {
    const el = document.getElementById('planner-status');
    if (!el) return;
    if (msg) {
        el.textContent = msg;
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

// ─── Render planner list ──────────────────────────────────────────
function renderPlanner() {
    const container = document.getElementById('planner-list');
    if (!container) return;

    ensurePlannerGroups();
    const flatItems = allPlannerItems();

    // Preserve scroll position
    const scrollTop = container.scrollTop;

    container.innerHTML = '';

    // Controls bar
    const ctrl = document.createElement('div');
    ctrl.id = 'planner-controls';
    ctrl.className = 'planner-controls';
    const pinnedCount = flatItems.filter(i => i.pinCoords).length;
    let runningTotal = flatItems.reduce((s, i) => {
        if (i.virtual) return s + (i.customPoints || 0);
        const t = getTask(i.taskName);
        return s + (t ? (t.points || 10) : 10);
    }, 0);
    const presets = _presetManifest || [];
    const userRoutesOpts = userRoutes.length > 0
        ? `<optgroup label="My Routes">` +
          userRoutes.map(r =>
              `<option value="user:${esc(r.id)}"${activeUserRouteId === r.id && !activeRouteName ? ' selected' : ''}>${esc(r.name)}</option>`
          ).join('') +
          `</optgroup>`
        : '';
    const presetOpts = presets.length > 0
        ? `<optgroup label="Preset Routes">` +
          presets.map(p =>
              `<option value="preset:${esc(p.file)}"${activeRouteName === p.name ? ' selected' : ''}>${esc(p.name)}</option>`
          ).join('') +
          `</optgroup>`
        : '';
    ctrl.innerHTML =
        `<div class="planner-controls-row planner-route-row">` +
            `<span class="planner-ctrl-label">Route:</span>` +
            `<select id="planner-route-select" class="planner-route-select">${userRoutesOpts}${presetOpts}</select>` +
        `</div>` +
        `<div class="planner-controls-row">` +
            `<button class="planner-line-btn${plannerLinesVisible ? ' planner-line-btn-active' : ''}" id="planner-lines-toggle">Lines</button>` +
            `<span class="planner-ctrl-sep"></span>` +
            `<button class="planner-line-btn${plannerPinsVisible ? ' planner-line-btn-active' : ''}" id="planner-pins-toggle">Pins</button>` +
            `<span class="planner-ctrl-sep"></span>` +
            `<span class="planner-ctrl-label">${flatItems.length} tasks · ${pinnedCount} pinned · ${runningTotal} pts total</span>` +
        `</div>` +
        `<div class="planner-controls-row">` +
            `<button class="planner-line-btn" id="planner-export-btn" title="Download planner as JSON">⬇ Export JSON</button>` +
            `<button class="planner-line-btn" id="planner-import-btn" title="Load planner from JSON file">⬆ Import JSON</button>` +
            `<input type="file" id="planner-import-input" accept=".json,application/json" style="display:none"/>` +
            `<button class="planner-line-btn" id="planner-new-route-btn" title="Create a new empty route">+ New Route</button>` +
            `<button class="planner-line-btn" id="planner-autoroute-btn" title="Reorder tasks by nearest-neighbour from the first pinned task">⟳ Auto-route</button>` +
            `<button class="planner-line-btn" id="planner-clear-btn" title="Clear all tasks from the current route">✕ Clear</button>` +
        `</div>`;
    const linesToggle = ctrl.querySelector('#planner-lines-toggle');
    if (linesToggle) {
        linesToggle.addEventListener('click', () => {
            plannerLinesVisible = !plannerLinesVisible;
            redrawMapOverlays();
            renderPlanner();
        });
    }
    // Route selector
    const routeSelect = ctrl.querySelector('#planner-route-select');
    if (routeSelect) {
        routeSelect.addEventListener('change', async () => {
            const val = routeSelect.value;
            if (val.startsWith('user:')) {
                const id = val.slice(5);
                const route = userRoutes.find(r => r.id === id);
                if (!route) return;
                activeUserRouteId = id;
                activeRouteName = null;
                plannerGroups = route.sections;
                ensurePlannerGroups();
                route.sections = plannerGroups;
                saveAllRoutes();
                redrawMapOverlays();
                renderPlanner();
            } else if (val.startsWith('preset:')) {
                const file = val.slice(7);
                const preset = (_presetManifest || []).find(p => p.file === file);
                const name = preset ? preset.name : file;
                try {
                    const data = await fetchJsonCached(`route_jsons/${file}`);
                    if (!applyPlanData(data)) { alert('Unrecognised plan format.'); return; }
                    activeRouteName = name;
                    redrawMapOverlays();
                    renderPlanner();
                } catch (e) {
                    alert('Failed to load preset: ' + e.message);
                }
            }
        });
        if (!_presetManifest) {
            loadPresetManifest().then(() => renderPlanner());
        }
    }

    const pinsToggle = ctrl.querySelector('#planner-pins-toggle');
    if (pinsToggle) {
        pinsToggle.addEventListener('click', () => {
            plannerPinsVisible = !plannerPinsVisible;
            redrawMapOverlays();
            renderPlanner();
        });
    }
    const exportBtn = ctrl.querySelector('#planner-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const sections = buildExportSections();
            const data = JSON.stringify({ version: 3, taskType: 'LEAGUE_5', source: 'GrootsLeagueMap', sections }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `planner-${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    const importBtn   = ctrl.querySelector('#planner-import-btn');
    const importInput = ctrl.querySelector('#planner-import-input');
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', () => {
            const file = importInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!applyPlanData(parsed)) {
                        alert('Unrecognised planner file format.');
                        return;
                    }
                    activeRouteName = null;
                    // Save into active user route, creating one first if none exists
                    if (!activeUserRouteId || !userRoutes.find(r => r.id === activeUserRouteId)) {
                        const nr = { id: genId(), name: 'Imported Plan', sections: plannerGroups };
                        userRoutes.push(nr);
                        activeUserRouteId = nr.id;
                    }
                    savePlanner();
                    redrawMapOverlays();
                    renderPlanner();
                } catch (err) {
                    alert('Failed to parse JSON: ' + err.message);
                }
                importInput.value = ''; // allow re-importing same file
            };
            reader.readAsText(file);
        });
    }
    const clearBtn = ctrl.querySelector('#planner-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const route = activeUserRouteId ? userRoutes.find(r => r.id === activeUserRouteId) : null;
            const label = activeRouteName || (route && route.name) || 'this route';
            if (!confirm(`Clear all tasks from "${label}"?`)) return;
            plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
            ensurePlannerGroups();
            if (!activeRouteName && route) {
                route.sections = plannerGroups;
                saveAllRoutes();
            }
            redrawMapOverlays();
            renderPlanner();
        });
    }
    const newRouteBtn = ctrl.querySelector('#planner-new-route-btn');
    if (newRouteBtn) {
        newRouteBtn.addEventListener('click', () => {
            const name = prompt('Route name:', `Route ${userRoutes.length + 1}`);
            if (!name || !name.trim()) return;
            const newRoute = { id: genId(), name: name.trim(), sections: [makePlannerGroup(DEFAULT_GROUP_NAME, [])] };
            userRoutes.push(newRoute);
            activeUserRouteId = newRoute.id;
            activeRouteName = null;
            plannerGroups = newRoute.sections;
            ensurePlannerGroups();
            newRoute.sections = plannerGroups;
            saveAllRoutes();
            redrawMapOverlays();
            renderPlanner();
        });
    }
    const autoRouteBtn = ctrl.querySelector('#planner-autoroute-btn');
    if (autoRouteBtn) {
        autoRouteBtn.addEventListener('click', async () => {
            const hasPinnedItem = allPlannerItems().some(i => i.pinCoords);
            if (!hasPinnedItem) {
                alert('Pin at least one task first — auto-route starts from the first pinned task.');
                return;
            }
            if (!confirm('Auto-route will reorder all tasks and overwrite your current task order. This cannot be undone. Continue?')) return;
            autoRouteBtn.disabled = true;
            autoRouteBtn.textContent = '⟳ Routing…';
            try {
                await autoRouteAll();
            } finally {
                autoRouteBtn.disabled = false;
                autoRouteBtn.textContent = '⟳ Auto-route';
            }
        });
    }
    container.appendChild(ctrl);

    if (activeRouteName) {
        const banner = document.createElement('div');
        banner.className = 'planner-preset-banner';
        banner.innerHTML =
            `<span class="planner-preset-banner-label">Viewing: <b>${esc(activeRouteName)}</b></span>` +
            `<button class="planner-preset-save-btn">&#128190; Save as My Plan</button>` +
            `<button class="planner-preset-back-btn">&#8592; My Routes</button>`;
        banner.querySelector('.planner-preset-save-btn').addEventListener('click', () => {
            ensurePlannerGroups();
            const existingRoute = activeUserRouteId ? userRoutes.find(r => r.id === activeUserRouteId) : null;
            if (existingRoute) {
                existingRoute.sections = plannerGroups;
            } else {
                const nr = { id: genId(), name: activeRouteName || 'My Plan', sections: plannerGroups };
                userRoutes.push(nr);
                activeUserRouteId = nr.id;
            }
            activeRouteName = null;
            saveAllRoutes();
            renderPlanner();
        });
        banner.querySelector('.planner-preset-back-btn').addEventListener('click', () => {
            activeRouteName = null;
            const route = activeUserRouteId ? userRoutes.find(r => r.id === activeUserRouteId) : null;
            if (route) {
                plannerGroups = route.sections;
                ensurePlannerGroups();
            } else if (userRoutes.length > 0) {
                activeUserRouteId = userRoutes[0].id;
                plannerGroups = userRoutes[0].sections;
                ensurePlannerGroups();
            } else {
                plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
                ensurePlannerGroups();
            }
            redrawMapOverlays();
            renderPlanner();
        });
        container.appendChild(banner);
    }
    if (flatItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'task-panel-empty';
        empty.innerHTML = 'No tasks planned yet.<br><small style="color:#5a4a20;">Use the Task Search panel to find and add tasks.</small>';
        container.appendChild(empty);
    }

    const orderById = new Map();
    const runPtsById = new Map();
    let runPts = 0;
    flatItems.forEach((item, idx) => {
        const task = item.virtual ? null : getTask(item.taskName);
        const pts  = item.virtual ? (item.customPoints || 0) : (task ? (task.points || 10) : 10);
        runPts += pts;
        orderById.set(item.id, idx + 1);
        runPtsById.set(item.id, runPts);
    });

    // Group drop zone helper — one before each group, one at the very end
    const makeGroupDropZone = (insertIdx) => {
        const gdz = document.createElement('div');
        gdz.className = 'planner-group-drop-zone';
        wireGroupDrop(gdz, insertIdx);
        return gdz;
    };

    plannerGroups.forEach((group, gi) => {
        container.appendChild(makeGroupDropZone(gi));
        container.appendChild(buildPlannerGroup(group, orderById, runPtsById));
    });
    container.appendChild(makeGroupDropZone(plannerGroups.length));

    // Add-task search section
    container.appendChild(buildAddSection());

    container.scrollTop = scrollTop;
}

function buildPlannerGroup(group, orderById, runPtsById) {
    const wrap = document.createElement('div');
    wrap.className = 'planner-group';
    wrap.dataset.groupId = group.id;

    const itemCount = group.items.length;
    const pinnedCount = group.items.filter(i => i.pinCoords).length;
    const groupPts = group.items.reduce((s, i) => {
        if (i.virtual) return s + (i.customPoints || 0);
        const t = getTask(i.taskName);
        return s + (t ? (t.points || 10) : 10);
    }, 0);
    const taskIndexes = group.items
        .map(i => orderById.get(i.id))
        .filter(n => Number.isFinite(n));
    let collapsedRange = `${itemCount} tasks`;
    if (taskIndexes.length > 0) {
        const startIdx = Math.min(...taskIndexes);
        const endIdx = Math.max(...taskIndexes);
        collapsedRange += ` (${startIdx}..${endIdx})`;
    }
    const groupMeta = group.collapsed
        ? collapsedRange
        : `${itemCount} tasks · ${pinnedCount} pinned · ${groupPts} pts`;

    const canRemove = plannerGroups.length > 1;
    const toggleLabel = group.collapsed ? '▸' : '▾';
    const toggleText = group.collapsed ? '👁' : '👁̶';
    const toggleTextTitle = group.collapsed ? 'Show group items' : 'Hide group items';
    const pinsChecked = group.showPins ? 'checked' : '';
    wrap.innerHTML =
        `<div class="planner-group-header">` +
            `<span class="planner-group-drag-handle" title="Drag to reorder group">⠿</span>` +
            `<button class="planner-group-toggle" title="Expand/collapse group">${toggleLabel}</button>` +
            `<input class="planner-group-name" value="${esc(group.name)}" aria-label="Group name"/>` +
            `<span class="planner-group-meta">${groupMeta}</span>` +
            `<label class="planner-group-pin-toggle-wrap" title="Show pins from this group">` +
                `<input type="checkbox" class="planner-group-pin-toggle" ${pinsChecked}>` +
                `<span>Pins</span>` +
            `</label>` +
            `<button class="planner-group-toggle-text" title="${toggleTextTitle}">${toggleText}</button>` +
            (canRemove ? `<button class="planner-group-remove" title="Delete group (moves tasks)">✕</button>` : '') +
        `</div>`;

    const groupId = group.id;
    const header = wrap.querySelector('.planner-group-header');
    const toggleBtn = wrap.querySelector('.planner-group-toggle');
    const toggleTextBtn = wrap.querySelector('.planner-group-toggle-text');
    const pinsToggle = wrap.querySelector('.planner-group-pin-toggle');
    const nameInput = wrap.querySelector('.planner-group-name');
    const removeBtn = wrap.querySelector('.planner-group-remove');

    const toggleGroupCollapsed = () => {
        const liveGroup = findGroupById(groupId);
        if (!liveGroup) return;
        liveGroup.collapsed = !liveGroup.collapsed;
        savePlanner();
        renderPlanner();
    };

    toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleGroupCollapsed();
    });
    toggleTextBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleGroupCollapsed();
    });

    header.addEventListener('click', e => {
        if (e.target.closest('.planner-group-name, .planner-group-remove, .planner-group-toggle, .planner-group-toggle-text, .planner-group-drag-handle, .planner-group-pin-toggle-wrap')) return;
        toggleGroupCollapsed();
    });

    if (pinsToggle) {
        pinsToggle.addEventListener('click', e => e.stopPropagation());
        pinsToggle.addEventListener('change', e => {
            const liveGroup = findGroupById(groupId);
            if (!liveGroup) return;
            liveGroup.showPins = !!e.target.checked;
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        });
    }

    // ── Group reorder drag ───────────────────────────────────────
    const dragHandle = wrap.querySelector('.planner-group-drag-handle');
    dragHandle.addEventListener('mousedown', () => { groupDragFromHandle = true; });
    wrap.draggable = true;
    wrap.addEventListener('dragstart', e => {
        if (!groupDragFromHandle) { return; }
        groupDragFromHandle = false;
        dragGroupSrcId = groupId;
        dragSrcId = null;
        wrap.classList.add('planner-group-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
    });
    wrap.addEventListener('dragend', () => {
        groupDragFromHandle = false;
        dragGroupSrcId = null;
        wrap.classList.remove('planner-group-dragging');
    });

    nameInput.addEventListener('click', e => e.stopPropagation());
    nameInput.addEventListener('input', () => {
        const liveGroup = findGroupById(groupId);
        if (!liveGroup) return;
        liveGroup.name = nameInput.value;
        savePlanner();
    });
    nameInput.addEventListener('blur', () => {
        const liveGroup = findGroupById(groupId);
        if (!liveGroup) return;
        const next = nameInput.value.trim() || DEFAULT_GROUP_NAME;
        if (next !== liveGroup.name) {
            liveGroup.name = next;
            savePlanner();
            renderPlanner();
        }
    });
    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameInput.blur();
        }
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (plannerGroups.length <= 1) return;
            const liveGroup = findGroupById(groupId);
            if (!liveGroup) return;
            const fallbackGroup = plannerGroups.find(g => g.id !== groupId);
            if (!fallbackGroup) return;
            fallbackGroup.items = fallbackGroup.items.concat(liveGroup.items);
            plannerGroups = plannerGroups.filter(g => g.id !== groupId);
            if (plannerAddTargetGroupId === groupId) plannerAddTargetGroupId = fallbackGroup.id;
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        });
    }

    if (group.collapsed) {
        return wrap;
    }

    const body = document.createElement('div');
    body.className = 'planner-group-body';

    const dropTop = document.createElement('div');
    dropTop.className = 'planner-drop-zone planner-drop-top';
    dropTop.textContent = '+ Drop task here';
    wireExternalDrop(dropTop, group.id, 0);
    body.appendChild(dropTop);

    group.items.forEach((item, idxInGroup) => {
        const task = item.virtual ? null : getTask(item.taskName);
        const pts  = item.virtual ? (item.customPoints || 0) : (task ? (task.points || 10) : 10);
        const orderNum = orderById.get(item.id) || 0;
        const runPts = runPtsById.get(item.id) || 0;
        body.appendChild(buildPlannerCard(item, task, pts, runPts, orderNum));

        const dz = document.createElement('div');
        dz.className = 'planner-drop-zone';
        dz.textContent = '↓';
        wireExternalDrop(dz, group.id, idxInGroup + 1);
        body.appendChild(dz);
    });

    wrap.appendChild(body);
    return wrap;
}

function wireGroupDrop(el, insertIdx) {
    el.addEventListener('dragover', e => {
        if (!dragGroupSrcId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('planner-group-drop-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('planner-group-drop-over'));
    el.addEventListener('drop', e => {
        if (!dragGroupSrcId) return;
        e.preventDefault();
        el.classList.remove('planner-group-drop-over');
        const srcIdx = plannerGroups.findIndex(g => g.id === dragGroupSrcId);
        if (srcIdx === -1) return;
        let target = insertIdx;
        if (srcIdx < target) target--;
        const [moved] = plannerGroups.splice(srcIdx, 1);
        plannerGroups.splice(target, 0, moved);
        savePlanner();
        redrawMapOverlays();
        renderPlanner();
    });
}

function wireExternalDrop(el, targetGroupId, insertIdx) {
    el.addEventListener('dragover', e => {
        if (dragGroupSrcId) return;  // ignore when a group is being dragged
        e.preventDefault();
        // Internal reorder uses 'move'; external drags from task list use 'copy'
        e.dataTransfer.dropEffect = dragSrcId ? 'move' : 'copy';
        el.classList.add('planner-drop-zone-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('planner-drop-zone-over'));
    el.addEventListener('drop', e => {
        if (dragGroupSrcId) return;  // ignore when a group is being dragged
        e.preventDefault();
        el.classList.remove('planner-drop-zone-over');

        // Internal reorder
        const srcId = dragSrcId;
        if (srcId) {
            const srcCtx = findItemContext(srcId);
            const targetGroup = findGroupById(targetGroupId);
            if (srcCtx && targetGroup) {
                let target = insertIdx;
                if (srcCtx.group.id === targetGroupId && srcCtx.itemIdx < target) target--;
                const [moved] = srcCtx.group.items.splice(srcCtx.itemIdx, 1);
                targetGroup.items.splice(target, 0, moved);
                savePlanner();
                redrawMapOverlays();
                renderPlanner();
                return;
            }
        }

        // External drop from task list
        const taskName = e.dataTransfer.getData('text/plain');
        const targetGroup = findGroupById(targetGroupId);
        if (taskName && targetGroup && !allPlannerItems().some(i => i.taskName === taskName)) {
            const newItem = { id: genId(), taskName, pinCoords: null, comments: [] };
            targetGroup.items.splice(insertIdx, 0, newItem);
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        }
    });
}

function buildPlannerCard(item, task, pts, runPts, orderNum) {
    const isVirtual = !!item.virtual;
    const tier  = isVirtual ? { name: 'Custom step', color: VIRTUAL_COLOR } : tierFor(pts);
    const color = tier.color;

    const isCompleted = !isVirtual && window._completedTasks && window._completedTasks.has(item.taskName);

    const card = document.createElement('div');
    card.className = 'planner-card' + (isVirtual ? ' planner-card-virtual' : '') + (isCompleted ? ' planner-card-done' : '');
    if (plannerSelectedId === item.id) card.classList.add('planner-card-selected');
    card.dataset.id   = item.id;
    card.draggable    = true;
    card.style.borderLeftColor = color;

    const pinLabel = item.pinCoords
        ? `📍 ${Math.round(item.pinCoords.lng)}, ${Math.round(item.pinCoords.lat)}`
        : '📍 Set pin';

    const commentsHtml = item.comments.length
        ? item.comments.map((c, ci) =>
            `<div class="planner-comment-item">` +
            `<span class="planner-comment-text">${esc(c)}</span>` +
            `<button class="planner-comment-del" data-id="${item.id}" data-ci="${ci}" title="Remove">✕</button>` +
            `</div>`
          ).join('')
        : '';

    const headerMiddle = isVirtual
        ? `<span class="planner-virtual-badge">custom</span>` +
          `<input class="planner-virtual-name" value="${esc(item.customName || '')}" placeholder="Step name..." data-id="${item.id}"/>` +
          `<span class="planner-virtual-pts" data-id="${item.id}" title="Click to set points" style="color:${color}">${pts} pts</span>`
        : `<span class="planner-card-name">${esc(task ? task.name : item.taskName)}</span>` +
          `<span class="planner-card-pts" style="color:${color}">${pts} pts</span>`;

    const completedCheckHtml = !isVirtual
        ? `<label class="planner-card-done-label" title="Mark as completed" onclick="event.stopPropagation();">` +
          `<input type="checkbox" class="planner-card-done-checkbox" data-taskname="${esc(item.taskName)}" ${isCompleted ? 'checked' : ''}/>` +
          `</label>`
        : '';

    card.innerHTML =
        `<div class="planner-card-header">` +
            `<span class="planner-drag-handle" title="Drag to reorder">⠿</span>` +
            `<span class="planner-order-num">${orderNum}</span>` +
            `<span class="planner-tier-dot" style="background:${color}" title="${tier.name} (${pts} pts)"></span>` +
            headerMiddle +
            `<span class="planner-running-pts" title="Running total">${runPts} pts</span>` +
            completedCheckHtml +
            `<button class="planner-remove-btn" data-id="${item.id}" title="Remove from planner">✕</button>` +
        `</div>` +
        (isVirtual
            ? `<input class="planner-virtual-desc" value="${esc(item.customDesc || '')}" placeholder="Description (optional)..." data-id="${item.id}"/>`
            : (task ? `<div class="planner-card-desc">${esc(task.task)}</div>` : '')) +
        (isVirtual ? '' : buildPlannerSkillReqsHtml(task)) +
        buildSuggestionsHtml(item, task) +
        `<div class="planner-card-pin-row">` +
            `<button class="planner-pin-btn${item.pinCoords ? ' planner-pin-set' : ''}" data-id="${item.id}">${pinLabel}</button>` +
            (item.pinCoords ? `<button class="planner-pin-clear-btn" data-id="${item.id}" title="Clear pin">✕</button>` : '') +
        `</div>` +
        (commentsHtml ? `<div class="planner-comments">${commentsHtml}</div>` : '') +
        `<div class="planner-add-comment-row">` +
            `<input class="planner-comment-input" type="text" placeholder="Add step/note..." data-id="${item.id}" autocomplete="off"/>` +
            `<button class="planner-comment-add-btn" data-id="${item.id}">＋</button>` +
        `</div>`;

    // ── Suggested location buttons ────────────────────────────
    if (!isVirtual && task) {
        populateSuggestionsAsync(item, task, card);
    }

    // ── Virtual name/desc inline editing ────────────────────────
    if (isVirtual) {
        const nameInput = card.querySelector('.planner-virtual-name');
        const descInput = card.querySelector('.planner-virtual-desc');
        const itemId = item.id;
        const saveVirtual = () => {
            const ctx = findItemContext(itemId);
            const liveItem = ctx ? ctx.item : null;
            if (!liveItem) return;
            const nextName = nameInput.value.trim();
            const nextDesc = descInput.value.trim();
            const changed = liveItem.customName !== nextName || liveItem.customDesc !== nextDesc;
            liveItem.customName = nextName;
            liveItem.customDesc = nextDesc;
            if (changed) {
                savePlanner();
                redrawMapOverlays();
            }
        };
        nameInput.addEventListener('input', saveVirtual);
        descInput.addEventListener('input', saveVirtual);
        nameInput.addEventListener('change', saveVirtual);
        descInput.addEventListener('change', saveVirtual);
        nameInput.addEventListener('blur', saveVirtual);
        nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });
        nameInput.addEventListener('click', e => e.stopPropagation());
        descInput.addEventListener('blur', saveVirtual);
        descInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); descInput.blur(); } });
        descInput.addEventListener('click', e => e.stopPropagation());

        // Points badge — click to edit
        const ptsSpan = card.querySelector('.planner-virtual-pts');
        if (ptsSpan) {
            ptsSpan.addEventListener('click', e => {
                e.stopPropagation();
                const currentVal = findItemContext(itemId)?.item?.customPoints || 0;
                const ptsInput = document.createElement('input');
                ptsInput.type = 'number';
                ptsInput.className = 'planner-virtual-pts-input';
                ptsInput.value = currentVal;
                ptsInput.min = '0';
                ptsInput.step = '1';
                ptsSpan.replaceWith(ptsInput);
                ptsInput.focus();
                ptsInput.select();
                const commitPts = () => {
                    const newPts = Math.max(0, parseInt(ptsInput.value, 10) || 0);
                    const ctx = findItemContext(itemId);
                    if (ctx) {
                        ctx.item.customPoints = newPts;
                        savePlanner();
                    }
                    renderPlanner();
                };
                ptsInput.addEventListener('blur', commitPts);
                ptsInput.addEventListener('keydown', e2 => {
                    if (e2.key === 'Enter') { e2.preventDefault(); ptsInput.blur(); }
                    if (e2.key === 'Escape') { renderPlanner(); }
                });
                ptsInput.addEventListener('click', e2 => e2.stopPropagation());
            });
        }
    }

    // ── Drag (internal reorder) ──────────────────────────────────
    card.addEventListener('dragstart', e => {
        dragSrcId = item.id;
        card.classList.add('planner-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.taskName);
    });
    card.addEventListener('dragend', () => {
        dragSrcId = null;
        card.classList.remove('planner-dragging');
    });

    // ── Selection (for suggestion pins) ──────────────────────────
    card.addEventListener('click', e => {
        if (e.target.closest('button, input')) return;
        plannerSelectedId = (plannerSelectedId === item.id) ? null : item.id;
        redrawMapOverlays();
        document.querySelectorAll('.planner-card').forEach(c => {
            c.classList.toggle('planner-card-selected', c.dataset.id === plannerSelectedId);
        });
        // Center map on pinned task's location
        if (item.pinCoords && plannerMap) {
            plannerMap.setView([item.pinCoords.lat, item.pinCoords.lng], Math.max(plannerMap.getZoom(), 0));
        }
    });

    // ── Completion toggle ─────────────────────────────────────────
    const doneCheckbox = card.querySelector('.planner-card-done-checkbox');
    if (doneCheckbox) {
        doneCheckbox.addEventListener('change', e => {
            e.stopPropagation();
            const name = e.target.dataset.taskname;
            const nowDone = e.target.checked;
            if (window._completedTasks) {
                if (nowDone) window._completedTasks.add(name);
                else window._completedTasks.delete(name);
            }
            if (window._saveCompleted) window._saveCompleted();
            if (window._renderStats) window._renderStats();
            // Update only this card in-place instead of rebuilding the whole planner
            card.classList.toggle('planner-card-done', nowDone);
            const nameEl = card.querySelector('.planner-card-name');
            if (nameEl) nameEl.style.textDecoration = nowDone ? 'line-through' : '';
        });
    }

    // ── Remove ───────────────────────────────────────────────────
    card.querySelector('.planner-remove-btn').addEventListener('click', e => {
        e.stopPropagation();
        removeItemById(item.id);
        if (plannerSelectedId === item.id) plannerSelectedId = null;
        savePlanner();
        redrawMapOverlays();
        renderPlanner();
    });

    // ── Pin button ───────────────────────────────────────────────
    card.querySelector('.planner-pin-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (pinningItemId === item.id) {
            cancelPinning();
        } else {
            startPinning(item.id);
        }
    });

    const clearPinBtn = card.querySelector('.planner-pin-clear-btn');
    if (clearPinBtn) {
        clearPinBtn.addEventListener('click', e => {
            e.stopPropagation();
            const ctx = findItemContext(item.id);
            const liveItem = ctx ? ctx.item : null;
            if (!liveItem) return;
            liveItem.pinCoords = null;
            savePlanner();
            redrawMapOverlays();
            renderPlanner();
        });
    }

    // ── Comments ─────────────────────────────────────────────────
    card.querySelectorAll('.planner-comment-del').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const ci = parseInt(btn.dataset.ci, 10);
            item.comments.splice(ci, 1);
            savePlanner();
            renderPlanner();
        });
    });

    const commentInput = card.querySelector('.planner-comment-input');
    const addCommentBtn = card.querySelector('.planner-comment-add-btn');
    const submitComment = () => {
        const val = commentInput.value.trim();
        if (!val) return;
        item.comments.push(val);
        commentInput.value = '';
        savePlanner();
        renderPlanner();
    };
    addCommentBtn.addEventListener('click', e => { e.stopPropagation(); submitComment(); });
    commentInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitComment(); });
    commentInput.addEventListener('click', e => e.stopPropagation());

    return card;
}

function buildAddSection() {
    const wrap = document.createElement('div');
    ensurePlannerGroups();
    wrap.className = 'planner-add-section';
    const groupOptionsHtml = plannerGroups.map(g =>
        `<option value="${g.id}"${g.id === plannerAddTargetGroupId ? ' selected' : ''}>${esc(g.name)}</option>`
    ).join('');
    wrap.innerHTML =
        `<div class="planner-add-label">Add league tasks:</div>` +
        `<select id="planner-target-group" class="planner-search-input planner-target-group">${groupOptionsHtml}</select>` +
        `<input id="planner-search-input" class="planner-search-input" type="text" placeholder="Search tasks..." autocomplete="off"/>` +
        `<div id="planner-search-results" class="planner-search-results"></div>` +
        `<div class="planner-add-divider"></div>` +
        `<div class="planner-add-label">Add custom step:</div>` +
        `<div class="planner-virtual-create-row">` +
            `<input id="planner-virtual-name-input" class="planner-search-input" type="text" placeholder="Step name (e.g. Buy stew from shop)" autocomplete="off"/>` +
            `<input id="planner-virtual-desc-input" class="planner-search-input planner-virtual-desc-input" type="text" placeholder="Description (optional)" autocomplete="off"/>` +
            `<button id="planner-virtual-add-btn" class="planner-virtual-add-btn">+ Add custom step</button>` +
        `</div>` +
        `<div class="planner-add-divider"></div>` +
        `<button id="planner-group-add" class="planner-line-btn planner-group-add-btn">+ New Group</button>`;

    // ── League task search ────────────────────────────────────────
    const groupSelect = wrap.querySelector('#planner-target-group');
    const input   = wrap.querySelector('#planner-search-input');
    const results = wrap.querySelector('#planner-search-results');
    input.value = plannerAddSearchQuery;

    const getTargetGroup = () => {
        const current = findGroupById(plannerAddTargetGroupId);
        if (current) return current;
        ensurePlannerGroups();
        return plannerGroups[0];
    };

    groupSelect.addEventListener('change', () => {
        plannerAddTargetGroupId = groupSelect.value;
        savePlanner();
    });

    function renderSearchResults() {
        const q = plannerAddSearchQuery.trim().toLowerCase();
        results.innerHTML = '';
        if (!q || q.length < 2) return;

        const existingTaskNames = new Set(allPlannerItems().filter(i => !i.virtual && i.taskName).map(i => i.taskName));
        const regions = window._getCurrentRegions ? window._getCurrentRegions() : null;
        const matches = allTasksRef.filter(t => {
            // Region filter: match enabled regions (null = all; tasks with no area are general, always included)
            if (regions !== null) {
                if (t.area && !regions.includes(t.area)) return false;
            }
            if (existingTaskNames.has(t.name)) return false;
            const hay = `${t.name} ${t.task || ''} ${t.wikiNotes || ''} ${t.area || ''}`.toLowerCase();
            return hay.includes(q);
        }).sort((a, b) => {
            const pct = s => parseFloat((s && s.completion || '0').replace('%', '')) || 0;
            return pct(b) - pct(a);
        }).slice(0, 200);

        if (matches.length === 0) {
            results.innerHTML = '<div class="planner-no-results">No tasks found.</div>';
            return;
        }

        matches.forEach(task => {
            const tier = tierFor(task.points || 10);
            const row = document.createElement('div');
            row.className = 'planner-search-result';
            row.draggable = true;
            row.innerHTML =
                `<span class="planner-search-tier-dot" style="background:${tier.color}"></span>` +
                `<span class="planner-search-result-name">${esc(task.name)}</span>` +
                `<span class="planner-search-result-pts" style="color:${tier.color}">${task.points} pts</span>` +
                `<span class="planner-search-result-completion" title="Player completion rate">${task.completion || ''}</span>` +
                `<button class="planner-search-add-btn">+ Add</button>`;

            row.querySelector('.planner-search-add-btn').addEventListener('click', () => {
                const targetGroup = getTargetGroup();
                if (!targetGroup) return;
                targetGroup.items.push({ id: genId(), taskName: task.name, pinCoords: null, comments: [] });
                savePlanner();
                plannerAddSearchShouldFocus = true;
                redrawMapOverlays();
                renderPlanner();
            });
            // Allow dragging from search results directly onto the drop zones
            row.addEventListener('dragstart', e => {
                dragSrcId = null;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', task.name);
            });
            results.appendChild(row);
        });
    }

    input.addEventListener('input', () => {
        plannerAddSearchQuery = input.value;
        renderSearchResults();
    });

    renderSearchResults();
    if (plannerAddSearchShouldFocus) {
        plannerAddSearchShouldFocus = false;
        requestAnimationFrame(() => {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
    }

    // ── Custom step creation ──────────────────────────────────────
    const virtualNameInput = wrap.querySelector('#planner-virtual-name-input');
    const virtualDescInput = wrap.querySelector('#planner-virtual-desc-input');
    const virtualAddBtn    = wrap.querySelector('#planner-virtual-add-btn');
    const createVirtualStep = () => {
        const name = virtualNameInput.value.trim();
        if (!name) { virtualNameInput.focus(); return; }
        const targetGroup = getTargetGroup();
        if (!targetGroup) return;
        targetGroup.items.push({
            id: genId(),
            virtual: true,
            customName: name,
            customDesc: virtualDescInput.value.trim(),
            pinCoords: null,
            comments: []
        });
        virtualNameInput.value = '';
        virtualDescInput.value = '';
        savePlanner();
        redrawMapOverlays();
        renderPlanner();
    };
    virtualAddBtn.addEventListener('click', createVirtualStep);
    virtualNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createVirtualStep(); });
    virtualDescInput.addEventListener('keydown', e => { if (e.key === 'Enter') createVirtualStep(); });

    // ── Add group ─────────────────────────────────────────────────
    const addGroupBtn = wrap.querySelector('#planner-group-add');
    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', () => {
            const name = (window.prompt('Group name?', '') || '').trim();
            if (!name) return;
            const newGroup = makePlannerGroup(name, []);
            plannerGroups.push(newGroup);
            plannerAddTargetGroupId = newGroup.id;
            savePlanner();
            renderPlanner();
        });
    }

    return wrap;
}

// ─── Public API ───────────────────────────────────────────────────
// Called by leaflet.tasks.js to add a task from the active list
window._plannerAddTask = function(taskName) {
    if (allPlannerItems().some(i => i.taskName === taskName)) {
        // Already added – just switch to planner tab
        activatePlannerTab();
        return;
    }
    ensurePlannerGroups();
    const targetGroup = findGroupById(plannerAddTargetGroupId) || plannerGroups[0];
    targetGroup.items.push({ id: genId(), taskName, pinCoords: null, comments: [] });
    savePlanner();
    redrawMapOverlays();
    activatePlannerTab();
};

function activatePlannerTab() {
    renderPlanner();
}

function selectPlannerItem(itemId) {
    plannerSelectedId = itemId;
    // Expand the group containing this item
    const ctx = findItemContext(itemId);
    if (ctx && ctx.group.collapsed) {
        ctx.group.collapsed = false;
        savePlanner();
    }
    renderPlanner();
    // Scroll after a brief yield so the DOM has been rebuilt
    setTimeout(() => {
        const card = document.querySelector(`.planner-card[data-id="${CSS.escape(itemId)}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

// ─── Tab integration (removed — planner is always visible) ──────────────────

// ─── Escape to cancel pinning / close context menu ────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (pinningMode) cancelPinning();
        hideMapContextMenu();
    }
});

// ─── Bootstrap ────────────────────────────────────────────────────
(async () => {
    loadAllRoutes();
    const manifest = await loadPresetManifest();
    const defaultPreset = manifest && manifest[0];
    if (userRoutes.length > 0) {
        // User has saved routes — load the active one
        loadPlanner();
    } else if (defaultPreset) {
        // No user routes yet — show the default preset
        try {
            const data = await fetchJsonCached(`route_jsons/${defaultPreset.file}`);
            if (applyPlanData(data)) {
                activeRouteName = defaultPreset.name;
            } else {
                plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
                ensurePlannerGroups();
            }
        } catch (_) {
            plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
            ensurePlannerGroups();
        }
    } else {
        plannerGroups = [makePlannerGroup(DEFAULT_GROUP_NAME, [])];
        ensurePlannerGroups();
    }
    window._renderPlanner = renderPlanner;
    window._getPlannerTaskNames = () => new Set(allPlannerItems().filter(i => !i.virtual).map(i => i.taskName));
    // Re-draw now that plannerGroups are populated
    redrawMapOverlays();
    renderPlanner();
})();

function initPlanner(map) {
    plannerMap = map;

    // Right-click on map → context menu
    map.getContainer().addEventListener('contextmenu', (e) => {
        if (pinningMode) return;
        e.preventDefault();
        e.stopPropagation();
        const latlng = map.mouseEventToLatLng(e);
        showMapContextMenu(latlng, e.clientX, e.clientY);
    });

    // Any click on the map body (not inside the menu) dismisses the menu
    map.getContainer().addEventListener('click', () => hideMapContextMenu());

    // Try to get allTasks; retry until leaflet.tasks.js populates it
    function tryGetTasks() {
        if (window._allTasksRef && window._allTasksRef.length > 0) {
            allTasksRef = window._allTasksRef;
            allTasksByName = new Map(allTasksRef.map(task => [task.name, task]));
            allTasksById = new Map(allTasksRef.filter(t => t.taskId != null).map(task => [task.taskId, task]));
            // Always redraw map overlays so saved pins appear immediately on load
            redrawMapOverlays();
            // Also render the UI if the planner tab is already active
            if (document.querySelector('.planner-card') !== null ||
                document.querySelector('.task-tab[data-tab="planner"]')?.classList.contains('task-tab-active')) {
                renderPlanner();
            }
        } else {
            setTimeout(tryGetTasks, 250);
        }
    }
    tryGetTasks();
}

if (window.runescape_map) {
    initPlanner(window.runescape_map);
} else {
    // Poll for map — main_osrs.js assigns it synchronously so it's typically ready
    let attempts = 0;
    const mapPoll = setInterval(() => {
        if (window.runescape_map || ++attempts > 40) {
            clearInterval(mapPoll);
            if (window.runescape_map) initPlanner(window.runescape_map);
        }
    }, 200);
}
