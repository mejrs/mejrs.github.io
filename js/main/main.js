'use strict';

var runescape_map = L.gameMap('map', {
        crs: L.CRS.Simple,
        maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
        maxBoundsViscosity: 0.5,
		
		customZoomControl:true,	
        fullscreenControl: true,
		planeControl: true,
		positionControl: true,
		templateControl: true,
		mapSelectorControl: true,
		

        zoom: 2,
        initialMapId: -1,
        plane: 0,
        x: 3232,
        y: 3232,
        minPlane: 0,
        maxPlane: 3,
        doubleClickZoom: false,
        iconMode: "",
        baseMaps: 'data/basemaps.json',
        showMapBorder: true,

    });

var main = L.tileLayer.main('layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'map_icon_squares',
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 4,
    }).addTo(runescape_map);

var zones = L.tileLayer.main('layers/{source}/{mapId}/{zoom}_0_{x}_{y}.png', {
        source: 'zonemap_squares',
        minZoom: -4,
        maxNativeZoom: 2,
        maxZoom: 4,
    }).addTo(runescape_map);
