'use strict';

var runescape_map = L.gameMap('map', {
        crs: L.CRS.Simple,
        maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
        maxBoundsViscosity: 0.5,
        
		customZoomControl:true,	
        fullscreenControl: true,
		planeControl: true,
		mapSelectorControl: true,

		
        x: 3232,
		y: 3232,
        zoom: 2,
		initialMapId: 28,
		plane: 0,
		minPlane: 0,
		maxPlane: 3,
        doubleClickZoom: false,
		iconMode: "",
		baseMaps: 'data/rs3/basemaps.json',
		loadMapData: true,
		loadMarkers: false,
    });

var main = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/map_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 4,
		iconMode: "",
    }).addTo(runescape_map);

var icons = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/icon_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 4,
		iconMode: "",
   }).addTo(runescape_map);
