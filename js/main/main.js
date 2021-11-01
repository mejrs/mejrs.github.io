'use strict';

import "../../js/leaflet.js";
import "../../js/layers.js";
import "../../js/plugins/leaflet.fullscreen.js";
import "../../js/plugins/leaflet.mapSelector.js";
import "../../js/plugins/leaflet.zoom.js";
import "../../js/plugins/leaflet.plane.js";
import "../../js/plugins/leaflet.position.js";
import "../../js/plugins/leaflet.displays.js";
import "../../js/plugins/leaflet.urllayers.js";
import "../../js/plugins/leaflet.rect.js";
import "../../js/plugins/leaflet.clickcopy.js";

import plot_map_labels from "../../js/plugins/leaflet.labels.js";
window.plot_map_labels = plot_map_labels;



void function (global) {
    let runescape_map = global.runescape_map = L.gameMap('map', {

            maxBounds: [[-1000, -1000], [12800 + 1000, 12800 + 1000]],
            maxBoundsViscosity: 0.5,

            customZoomControl: true,
            fullscreenControl: true,
            planeControl: true,
            positionControl: true,
            messageBox: true,
			rect: true,
            initialMapId: -1,
            plane: 0,
            x: 3200,
            y: 3200,
            minPlane: 0,
            maxPlane: 3,
            minZoom: -4,
            maxZoom: 4,
            doubleClickZoom: false,
            baseMaps: 'data/rs3/basemaps.json',
            loadMapData: true,
            showMapBorder: true,
            enableUrlLocation: true
        });

     L.control.display.objects({
        folder: "data/rs3",
		displayLayer: L.objects,
    }).addTo(runescape_map);

    L.control.display.npcs({
        folder: "data/rs3"
    }).addTo(runescape_map);

    L.control.display.pathfinder().addTo(runescape_map);

    L.tileLayer.main('layers_rs3/mapsquares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
            minZoom: -4,
            maxNativeZoom: 3,
            maxZoom: 5,
        }).addTo(runescape_map).bringToBack();

    var icon_squares = L.tileLayer.main('layers_rs3/icon_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
            minZoom: -4,
            maxNativeZoom: 3,
            maxZoom: 5,
        });

    var areas = L.tileLayer.main('layers_rs3/areas_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
            minZoom: -4,
            maxNativeZoom: 2,
            maxZoom: 5,
        });

    var shadow = L.tileLayer.main('../mejrs.github.io./layers_rs3/shadow_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
            minZoom: -4,
            maxNativeZoom: 2,
            maxZoom: 5,
            errorTileUrl: '../mejrs.github.io./layers/shadow_squares/shadow_tile.png'
        });

    var grid = L.grid({
            bounds: [[0, 0], [12800, 6400]],
        });

    var zones = L.tileLayer.main('layers_rs3/zonemap_squares/{mapId}/{zoom}_0_{x}_{y}.png', {
            minZoom: -4,
            maxNativeZoom: 2,
            maxZoom: 4,
        });

    var watery = L.tileLayer.main('../mejrs.github.io./layers_rs3/watery_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
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

}
(this || window);
