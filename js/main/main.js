'use strict';

var runescape_map = L.gameMap('map', {

        maxBounds: [[-1000, -1000], [12800 + 1000, 12800 + 1000]],
        maxBoundsViscosity: 0.5,

        customZoomControl: true,
        fullscreenControl: true,
        planeControl: true,
        positionControl: true,
        displayObjects: true,
        displayNPCs: true,
        displayPathfinder: true,
        messageBox: true,

        initialMapId: -1,
        plane: 0,
        x: 2332,
        y: 5732,
        minPlane: 0,
        maxPlane: 3,
        minZoom: -4,
        maxZoom: 4,
        doubleClickZoom: false,
        iconMode: "",
        baseMaps: '../mejrs.github.io/data/basemaps.json',
        loadMapData: true,
        showMapBorder: true,
        enableUrlLocation: true
    });

var main = L.tileLayer.main('layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'map_squares',
        minZoom: -4,
        maxNativeZoom: 4,
        maxZoom: 5,
    }).addTo(runescape_map).bringToBack();

var icon_squares = L.tileLayer.main('layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'icon_squares',
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 5,
    });

var areas = L.tileLayer.main('../mejrs.github.io/layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'areas_squares',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 5,
    });

var shadow = L.tileLayer.main('../mejrs.github.io./layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'shadow_squares',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 5,
		errorTileUrl: '../mejrs.github.io./layers/shadow_squares/shadow_tile.png'
    });


var grid = L.grid({
        bounds: [[0, 0], [12800, 6400]],
    });

var zones = L.tileLayer.main('layers/{source}/{mapId}/{zoom}_0_{x}_{y}.png', {
        source: 'zonemap_squares',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 4,
    });


var watery = L.tileLayer.main('../mejrs.github.io./layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'watery_squares',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 5,
    });

var teleports = L.teleports({
        API_KEY: "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8",
        SHEET_ID: "1ZjKyAMUWa1qxFvBnmXwofNkRBkVfsizoGwp6rZylXXM",
        minZoom: -3,
        filterFn: item => item.type === "teleport"

    });

var transports = L.teleports({
        API_KEY: "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8",
        SHEET_ID: "1ZjKyAMUWa1qxFvBnmXwofNkRBkVfsizoGwp6rZylXXM",
        minZoom: -3,
        filterFn: item => item.type !== "teleport"

    });

L.control.layers.urlParam({}, {
    'Icons': icon_squares,
    'Areas': areas,
    'Areas (inverted)': shadow,
    'Grid': grid,
    'Map zones': zones,
    'Teleports': teleports,
    'Transports': transports,
    '0x2': watery,
}, {
    collapsed: true,
    position: 'bottomright'
}).addTo(runescape_map);

L.control.objects().addTo(runescape_map);

