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
import "../../js/plugins/leaflet.maplabels.js";

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
        maxZoom: 8,
        doubleClickZoom: false,
        showMapBorder: true,
        enableUrlLocation: true
    });

    L.control.display.OSRSvarbits({
        show3d: true,
    }).addTo(runescape_map);

    L.control.display.objects({
        folder: "data_osrs",
        show3d: true,
        displayLayer: L.objects.osrs
    }).addTo(runescape_map);

    L.control.display.npcs({
        folder: "data_osrs",
        show3d: true,
    }).addTo(runescape_map);

    L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_osrs/refs/heads/master/mapsquares/-1/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 4,
        maxZoom: 8,
    }).addTo(runescape_map).bringToBack();

    let nomove = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_osrs/refs/heads/master/nomove/-1/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 8,
    });

    let objects = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_osrs/refs/heads/master/locations/-1/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 8,
    });

    let grid = L.grid({
        bounds: [[0, 0], [12800, 6400]],
    });

    let crowdsourcetransports = L.crowdSourceMovement({
        data: "data_osrs/transports_osrs.json",
        show3d: false,
        minZoom: -4
    });
    let crowdsourceteles = L.crowdSourceMovement({
        data: "data_osrs/teleports_osrs.json",
        show3d: false,
        minZoom: -4
    });

    let npcs = L.dynamicIcons({
        dataPath: "data_osrs/NPCList_OSRS.json",
        minZoom: -3,
    });

    let labels = L.maplabelGroup({
        API_KEY: "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8",
        SHEET_ID: "1859HuKw5dXqmfakFd6e6kQ_PEXQA02namB4aNVQ0qpY",
    });


    const defaults = {
        minZoom: -3,
        maxNativeZoom: 2,
        maxZoom: 6,

    };


    let chunks = L.tileLayer('layers/small_grid/{z}.png', defaults);

    L.control.layers.urlParam({}, {
        "labels": labels,
        "crowdsourcetransports": crowdsourcetransports,
        "crowdsourceteles": crowdsourceteles,
        "nomove": nomove,
        "objects": objects,
        "npcs": npcs,
        "grid": grid,
        "chunks": chunks
    }, {
        collapsed: true,
        position: 'bottomright'
    }).addTo(runescape_map);

}
(this || window);
