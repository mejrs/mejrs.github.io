"use strict";

import "../../js/leaflet.js";

import "../../js/plugins/leaflet.fullscreen.js";
import "../../js/plugins/leaflet.mapSelector.js";
import "../../js/plugins/leaflet.zoom.js";
import "../../js/plugins/leaflet.plane.js";
import "../../js/plugins/leaflet.position.js";
import "../../js/plugins/leaflet.displays.js";
import "../../js/plugins/leaflet.urllayers.js";
import "../../js/plugins/leaflet.dive.js";
import "../../js/plugins/leaflet.rect.js";
import "../../js/plugins/leaflet.maplabels.js";
import "../../js/plugins/leaflet.era.js";
import "../../js/layers.js";

import plot_map_labels from "../../js/plugins/leaflet.labels.js";
window.plot_map_labels = plot_map_labels;

void (function (global) {
    let runescape_map = (global.runescape_map = L.gameMap("map", {
        maxBounds: [
            [-1000, -1000],
            [12800 + 1000, 12800 + 1000],
        ],
        preferCanvas: false,
        maxBoundsViscosity: 0.5,

        customZoomControl: true,
        fullscreenControl: true,
        planeControl: true,
        positionControl: true,

        messageBox: true,

        initialMapId: -1,
        plane: 0,
        x: 3232,
		y: 3232,
        zoom: 2,
        minPlane: 0,
        maxPlane: 3,
        minZoom: -4,
        maxZoom: 6,
        doubleClickZoom: false,
        iconMode: "",
        era_structure: "data_rs3/era_structure.json",
        era: "rs2_2005_01_18",
        loadMapData: true,
        showMapBorder: true,
        enableUrlLocation: true,
    }));

    L.control.display.rect({}).addTo(runescape_map);

    let main = L.tileLayer
        .main("http://d3gljzx24m7f4r.cloudfront.net/{era}/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png", {
            source: "mapsquares",
            minZoom: -4,
            maxNativeZoom: 3,
            maxZoom: 6,
            attribution: '<a href="https://archive.openrs2.org/" title="The OpenRS2 Archive is a collection of caches and XTEA keys for all versions of RuneScape">OpenRS</a>',
            errorTileUrl: "layers/alpha_pixel.png",
        })
        .addTo(runescape_map)
        .bringToBack();

    let nomove = L.tileLayer.main("http://d3gljzx24m7f4r.cloudfront.net/{era}/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png", {
        source: "nomove",
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 6,
        errorTileUrl: "layers/alpha_pixel.png",
    });

    let objects = L.tileLayer.main("http://d3gljzx24m7f4r.cloudfront.net/{era}/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png", {
        source: "locations",
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 6,
        errorTileUrl: "layers/alpha_pixel.png",
    });

    let grid = L.grid({
        bounds: [
            [0, 0],
            [12800, 6400],
        ],
    });

    L.control.layers
        .urlParam(
            {},
            {
                nomove: nomove,
                objects: objects,
                grid: grid,
            },
            {
                collapsed: true,
                position: "bottomright",
            }
        )
        .addTo(runescape_map);
})(this || window);
