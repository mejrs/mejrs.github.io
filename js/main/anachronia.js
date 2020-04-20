'use strict';

var runescape_map = L.gameMap('map', {
        crs: L.CRS.Simple,
        maxBounds: L.latLngBounds([[2048, 5056], [2626,5762]]).pad(0.5),
        maxBoundsViscosity: 0.5,
		
		customZoomControl:true,	
        fullscreenControl: true,

		positionControl: true,


        zoom: 1,
        initialMapId: -1,
        plane: 0,
        x: (5056+5762)/2,
		y: (2048+2626)/2,
        minPlane: 0,
        maxPlane: 0,
    });

var main = L.tileLayer.main('layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'anachronia_squares',
        minZoom: 0,
        maxZoom: 4,
		//errorTileUrl: 'layers/ocean_pixel.png'
    }).addTo(runescape_map);




L.navigator().addTo(runescape_map);
