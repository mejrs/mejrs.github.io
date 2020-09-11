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
    var runescape_map = global.runescape_map = L.gameMap('map', {
            crs: L.CRS.Simple,
            maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
            maxBoundsViscosity: 0.5,
            customZoomControl: true,
            fullscreenControl: true,
            planeControl: true,
            positionControl: true,
            messageBox: true,
            zoom: 2,
            plane: 0,
            x: 3232,
            y: 3232,
            minPlane: 0,
            maxPlane: 3,
            doubleClickZoom: false,
            iconMode: "",
            showMapBorder: true,
            enableUrlLocation: true
        });

    var main = L.tileLayer.main('layers/{source}/-1/{zoom}/{plane}_{x}_{y}.png', {
            source: 'map_squares_osrs',
            minZoom: -4,
            maxNativeZoom: 2,
            maxZoom: 4,

        }).addTo(runescape_map);

    L.control.display.objects({
        folder: "data/osrs"
    }).addTo(runescape_map);
}
(this || window);
