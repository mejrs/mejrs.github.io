'use strict';

var runescape_map = L.gameMap('map', {
        crs: L.CRS.Simple,
        maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
        maxBoundsViscosity: 0.5,
        zoomControl: false,
        fullscreenControl: true,

        zoom: 2,
        initialMapId: -1,
        plane: 0,
        x: 3232,
        y: 3232,
        minPlane: 0,
        maxPlane: 3,
        doubleClickZoom: false,
        iconMode: "",
        baseMaps: 'basemaps.json',
        loadMapData: true,
        showMapBorder: true,
        enableUrlLocation: true
    });

var main = L.tileLayer.main('layers/{source}{iconMode}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'map_squares',
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 4,
    }).addTo(runescape_map);

var icons = L.iconLayer({
        iconGridFile: "icon_grid.json",
        minZoom: 0,
		mNativeZoom: 2,
        maxNativeZoom: 2,
        maxZoom: 4,
		bounds:[[0,0],[12800,6400]],
    }).addTo(runescape_map);

L.control.plane().addTo(runescape_map);
L.control.mousePosition().addTo(runescape_map);
L.control.customZoom().addTo(runescape_map);
