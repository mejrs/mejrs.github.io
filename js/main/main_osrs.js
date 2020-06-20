'use strict';

var runescape_map = L.gameMap('map', {
        crs: L.CRS.Simple,
        maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
        maxBoundsViscosity: 0.5,
        zoomControl: false,
        fullscreenControl: true,
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

//L.control.mapTemplate().addTo(runescape_map);
L.control.plane().addTo(runescape_map);
L.control.position().addTo(runescape_map);
L.control.customZoom().addTo(runescape_map);
