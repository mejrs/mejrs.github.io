'use strict';
import * as wasm_pathfinder from '../../wasm-pathfinder/pkg/wasm_pathfinder.js';

//Export wasm to global scope so it can be used from the dev console
window.wasm_pathfinder = wasm_pathfinder;

var runescape_map = L.gameMap('map', {
    renderer: L.canvas(),
    crs: L.CRS.Simple,
    maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
    maxBoundsViscosity: 0.5,

    customZoomControl: true,
    fullscreenControl: true,
    planeControl: true,
    positionControl: true,
    zoom: 2,
    initialMapId: -1,
    plane: 0,
    x: 3232,
    y: 3232,
    minPlane: 0,
    maxPlane: 3,
    doubleClickZoom: false,
    showMapBorder: true,
});

var main = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/mapsquares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
    minZoom: -4,
    maxNativeZoom: 3,
    maxZoom: 4,
}).addTo(runescape_map);

var zones = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/zonemap_squares/{mapId}/{zoom}_0_{x}_{y}.png', {
    source: '',
    minZoom: -4,
    maxNativeZoom: 2,
    maxZoom: 4,
}).addTo(runescape_map);

var areas = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/areas_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
    source: '',
    minZoom: -4,
    maxNativeZoom: 2,
    maxZoom: 4,
});

var transports = L.teleports({
    API_KEY: "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8",
    SHEET_ID: "1ZjKyAMUWa1qxFvBnmXwofNkRBkVfsizoGwp6rZylXXM",
    minZoom: -3,
    filterFn: item => item.type !== "teleport"
});

var teleports = L.teleports({
    API_KEY: "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8",
    SHEET_ID: "1ZjKyAMUWa1qxFvBnmXwofNkRBkVfsizoGwp6rZylXXM",
    minZoom: -3,
    filterFn: item => item.type === "teleport"
});

let pathfinder = L.dynamicNavigator({
    initStart: [0, 3220, 3218],
    initEnd: [0, 3339, 3230],
    init: wasm_pathfinder.default,
    algorithm: wasm_pathfinder.race,
    tileUrl: 'https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/mapsquares/-1/{zoom}/{plane}_{x}_{y}.png',
    errorTileUrl: 'TODO',
    shadowTileUrl: 'https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/shadow_squares/-1/{zoom}/{plane}_{x}_{y}.png',
    shadowErrorTileUrl: 'https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/shadow_squares/shadow_tile.png',
    messageBox: true
}).addTo(runescape_map);

L.control.layers({}, {
    zones: zones,
    areas: areas,
    transports: transports,
    teleports: teleports
}, {
    collapsed: false,
    position: 'bottomleft'
}).addTo(runescape_map);
