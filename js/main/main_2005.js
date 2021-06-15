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

    /* L.control.display.objects({
    folder: "data/osrs",
    show3d: true,
    displayLayer: L.objects.osrs
    }).addTo(runescape_map);
     */

    L.tileLayer.main('layers/{source}/-1/{zoom}/{plane}_{x}_{y}.png', {
        source: 'map_squares_osrs',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 8,
    }).addTo(runescape_map).bringToBack();

    let nomove = L.tileLayer.main('layers/{source}/-1/{zoom}/{plane}_{x}_{y}.png', {
        source: 'nomove_squares_2005',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 8,
    });

    let objects = L.tileLayer.main('layers/{source}/-1/{zoom}/{plane}_{x}_{y}.png', {
        source: 'object_squares_2005',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 8,
    });

    let height = L.tileLayer.main('layers/{source}/-1/{zoom}/{plane}_{x}_{y}.png', {
        source: 'height_squares_2005',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 8,
    });

    let grid = L.grid({
        bounds: [[0, 0], [12800, 6400]],
    });

    const defaults = {
        minZoom: -3,
        maxNativeZoom: 2,
        maxZoom: 6,

    }

    let chunks = L.tileLayer('layers/small_grid/{z}.png', defaults)

        L.control.layers.urlParam({}, {
        "nomove": nomove,
        "objects": objects,
        "height": height,
        "grid": grid,
        "chunks": chunks
    }, {
        collapsed: true,
        position: 'bottomright'
    }).addTo(runescape_map);

}
(this || window);
