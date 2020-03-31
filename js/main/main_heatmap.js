'use strict';

var runescape_map = L.gameMap('map', {
        crs: L.CRS.Simple,
        maxBounds: [[-1000, -1000], [12800 + 1000, 6400 + 1000]],
        maxBoundsViscosity: 0.5,
		
        customZoomControl:true,	
        fullscreenControl: true,
		planeControl: true,
		positionControl: true,

        x: 3232,
        y: 3232,
        zoom: 2,
        initialMapId: -1,
        plane: 0,
        minPlane: 0,
        maxPlane: 3,
        doubleClickZoom: false,
        iconMode: "",
        baseMaps: 'data/basemaps.json',
        loadMapData: true,
        loadMarkers: false,
    });

var main = L.tileLayer.main('layers/{source}{iconMode}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        source: 'map_icon_squares',
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 5,
        iconMode: "",

    }).addTo(runescape_map);


let parsedUrl = new URL(window.location.href);
let npcParams = parsedUrl.searchParams.getAll('npc');
let range = Number(parsedUrl.searchParams.get('range') || 0);
if (isNaN(range) || range < 0) {
    throw new Error(parsedUrl.searchParams.get('range') + " is invalid");
}

let iconParams = parsedUrl.searchParams.getAll('icon');
let heatmap = L.heatmap({
        npcs: npcParams,
        icons: iconParams,
        range: range + 1,

    }).addTo(runescape_map);

L.control.layers({
}, {

   heat:heatmap

}, {
    collapsed: false,
    position: 'bottomright'
}).addTo(runescape_map);
