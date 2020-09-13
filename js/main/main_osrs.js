'use strict';

import "../../js/leaflet.js";
import "../../js/plugins/leaflet.fullscreen.js";
import "../../js/plugins/leaflet.template.js";
import "../../js/plugins/leaflet.mapSelector.js";
import "../../js/plugins/leaflet.zoom.js";
import "../../js/plugins/leaflet.plane.js";
import "../../js/plugins/leaflet.position.js";
import "../../js/plugins/leaflet.displays.js";
import "../../js/plugins/leaflet.urllayers.js";
import "../../js/plugins/leaflet.dive.js";
import "../../js/layers.js";
import "../../js/other.js";

void function (global) {
    let runescape_map = global.runescape_map = L.gameMap('map', {

            maxBounds: [[-1000, -1000], [12800 + 1000, 12800 + 1000]],
            maxBoundsViscosity: 0.5,

            customZoomControl: true,
            fullscreenControl: true,
            planeControl: true,
            positionControl: true,
            messageBox: true,

            initialMapId: -1,
            plane: 0,
            x: 3200,
            y: 3200,
            minPlane: 0,
            maxPlane: 3,
            minZoom: -4,
            maxZoom: 6,
            doubleClickZoom: false,
            showMapBorder: true,
            enableUrlLocation: true
        });

    var template = 'layers/{source}/-1/{zoom}/{plane}_{x}_{y}.png';

    L.tileLayer.main(template, {
        source: 'map_squares_osrs',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 6,
    }).addTo(runescape_map).bringToBack();

    let nomove = L.tileLayer.main(template, {
            source: 'nomove_squares_osrs',
            minZoom: -4,
            maxNativeZoom: 2,
            maxZoom: 6,
        });

    let objects = L.tileLayer.main(template, {
            source: 'object_squares_osrs',
            minZoom: -4,
            maxNativeZoom: 2,
            maxZoom: 6,
        });

    let grid = L.grid({
            bounds: [[0, 0], [12800, 6400]],
        });

    let crowdsource = L.crowdSourceMovement({
            data: "data/osrs_moves.json",
            show3d: false,
            minZoom: 0
        });
    let crowdsourceFiltered = L.crowdSourceMovement({
            data: "data/osrs_moves_filtered.json",
            show3d: false,
            minZoom: 0
        });

    L.control.display.objects({
        folder: "data/osrs"
    }).addTo(runescape_map);

    L.control.layers.urlParam({}, {
        crowdsource: crowdsource,
        crowdsource_filtered: crowdsourceFiltered,
        "nomove": nomove,
        "objects": objects,

        "grid": grid
    }, {
        collapsed: true,
        position: 'bottomright'
    }).addTo(runescape_map);

}
(this || window);
