
'use strict';

L.GameMap = L.Map.extend({
        //adding inithook would be better but I want to avoid setting map variables twice
        initialize: function (id, options) { // (HTMLElement or String, Object)
            options = L.setOptions(this, options);

            // Make sure to assign internal flags at the beginning,
            // to avoid inconsistent state in some edge cases.
            this._handlers = [];
            this._layers = {};
            this._zoomBoundLayers = {};
            this._sizeChanged = true;

            this._initContainer(id);
            this._initLayout();
            this._baseMaps = undefined;

            // hack for https://github.com/Leaflet/Leaflet/issues/1980
            this._onResize = L.bind(this._onResize, this);

            this._initEvents();

            if (options.maxBounds) {
                this.setMaxBounds(options.maxBounds);
            }

            let parsedUrl = new URL(window.location.href);

            this._zoom = Number(parsedUrl.searchParams.get('zoom') || parsedUrl.searchParams.get('z') || this._limitZoom(options.zoom) || 2);

            this._plane = Number(parsedUrl.searchParams.get('plane') || parsedUrl.searchParams.get('p') || this._limitPlane(options.plane));

            this._mapId = this.options.loadMapData ? (Number(parsedUrl.searchParams.get('mapId') || parsedUrl.searchParams.get('mapid') || parsedUrl.searchParams.get('m') || this.options.initialMapId || -1)) : -1;
            this.options.x = Number(parsedUrl.searchParams.get('x')) || this.options.x || 3232;
            this.options.y = Number(parsedUrl.searchParams.get('y')) || this.options.y || 3232;

            this.setView([this.options.y, this.options.x], this._zoom, {
                reset: true,

            });

            if (this.options.baseMaps) {
                const dataPromise = fetch(this.options.baseMaps);
                dataPromise.then(response => response.json()).then(data => {
                    this._baseMaps = data;
                    this._allowedMapIds = Object.keys(this._baseMaps).map(Number);
                    let bounds = this.getMapIdBounds(this._mapId);

                    if (options.showMapBorder) {
                        this.boundsRect = L.rectangle(bounds, {
                                color: "#ffffff",
                                weight: 1,
                                fill: false,
                                smoothFactor: 1,
                            }).addTo(this);
                    }

                    let paddedBounds = bounds.pad(0.1);
                    this.setMaxBounds(paddedBounds);

                });
                dataPromise.catch(() => console.log("Unable to fetch " + this.options.baseMaps));
            }

            this.on('moveend planechange mapidchange', this.setSearchParams)

            this.callInitHooks();

            // don't animate on browsers without hardware-accelerated transitions or old Android/Opera
            this._zoomAnimated = L.DomUtil.TRANSITION && L.Browser.any3d && !L.Browser.mobileOpera && this.options.zoomAnimation;

            // zoom transitions run with the same duration for all layers, so if one of transitionend events
            // happens after starting zoom animation (propagating to the map pane), we know that it ended globally
            if (this._zoomAnimated) {
                this._createAnimProxy();
                L.DomEvent.on(this._proxy, L.DomUtil.TRANSITION_END, this._catchTransitionEnd, this);
            }

            this._addLayers(this.options.layers);
        },

        setSearchParams: function (e, parameters = {
                m: this._mapId,
                z: this._zoom,
                p: this._plane,
                x: Math.round(this.getCenter().lng),
                y: Math.round(this.getCenter().lat)
            }) {
            let url = new URL(window.location.href);
            let params = url.searchParams;

            for (const param in["mapId", "mapid", "zoom", "plane"]) {
                params.delete(param)
            }

            for (let[key, value]of Object.entries(parameters)) {
                params.set(key, value);
            }
            url.search = params;
            history.replaceState(0, "Location", url);

        },

        _limitPlane: function (plane) {
            //todo process allowedPlanes in basemap data
            var min = this.getMinPlane();
            var max = this.getMaxPlane();
            return Math.max(min, Math.min(max, plane));
        },

        _validateMapId: function (_mapId) {
            const parsedMapId = parseInt(_mapId);
            if (!this._allowedMapIds) {
                console.log("No basemaps found")
                return this._mapId
            } else if (this._allowedMapIds.includes(parsedMapId)) {
                return parsedMapId;
            } else {
                console.log("Not a valid mapId");
                return this._mapId;
            }

        },

        getPlane: function () {
            return this._plane;
        },

        getMapId: function () {
            return this._mapId;
        },

        getMinPlane: function () {
            return this.options.minPlane || 0;
        },

        getMaxPlane: function () {
            return this.options.maxPlane || 3;

        },

        setMaxPlane: function (newMaxPlane) {
            this.options.maxPlane = newMaxPlane;
            this.fire('maxplanechange', {
                newMaxPlane: newMaxPlane
            });
        },

        setPlane: function (_plane) {
            let newPlane = this._limitPlane(_plane);
            let oldPlane = this._plane
                if (oldPlane !== newPlane) {
                    this.fire('preplanechange', {
                        oldPlane: oldPlane,
                        newPlane: newPlane
                    });
                    this.fire('viewprereset');
                    this._plane = newPlane;
                    this.fire('viewreset');
                    this.fire('planechange', {
                        oldPlane: oldPlane,
                        newPlane: newPlane
                    });
                    return this;
                }
        },

        setMapId: function (_mapId) {
            let newMapId = this._validateMapId(_mapId);
            let oldMapId = this._mapId
                if (oldMapId !== newMapId) {

                    this.fire('premapidchange', {
                        oldMapId: oldMapId,
                        newMapId: newMapId
                    });
                    this.fire('viewprereset');
                    this._mapId = newMapId;

                    this.fire('viewreset');
                    this.fire('mapidchange', {
                        oldMapId: oldMapId,
                        newMapId: newMapId
                    });
                    this.setMapIdBounds(newMapId);

                    return this;
                }
        },

        getMapIdBounds: function (mapId) {
            let[[west, south], [east, north]] = this._baseMaps[mapId].bounds;
            return L.latLngBounds([[south, west], [north, east]]);
        },

        setMapIdBounds: function (newMapId) {

            let bounds = this.getMapIdBounds(this._mapId);

            if (this.options.showMapBorder) {
                this.boundsRect.setBounds(bounds);
            }

            let paddedBounds = bounds.pad(0.1);
            this.setMaxBounds(paddedBounds);

            this.fitWorld(bounds);

        },

    });

L.gameMap = function (id, options) {
    return new L.GameMap(id, options);
}

L.TileLayer.Main = L.TileLayer.extend({
        initialize: function (url, options) {
            this._url = url;
            L.setOptions(this, options);
        },

        getTileUrl: function (coords) {
            return L.Util.template(this._url, {
                source: this.options.source,
                iconMode: this._map.options.iconMode,
                mapId: this._map._mapId,
                zoom: coords.z,
                plane: this._map._plane || 0,
                x: coords.x,
                y:  - (1 + coords.y),
            });
        },

        options: {
            errorTileUrl: 'layers/alpha_pixel.png',
            attribution: '<a href="https://runescape.wiki/w/User:Mejrs/mejrs.github.io">Documentation</a>',

        }

    });

L.tileLayer.main = function (url, options) {
    return new L.TileLayer.Main(url, options);
}

L.TileLayer.Grid = L.TileLayer.extend({
        initialize: function (folder, options) {
            L.setOptions(this, options);
            this.folder = folder;
        },

        getTileUrl: function (coords) {
            let x = coords.x;
            let y = coords.y;

            switch (coords.z) {
            case 1:
                return this.folder + "2xsquare.png";
            case 2:
                return this.folder + "square.png";
            case 3:
                if ((x & 0x1) === 0x1 && (y & 0x1) === 0x1) {
                    return this.folder + "bottomright.png";
                }
                if ((x & 0x1) === 0x0 && (y & 0x1) === 0x0) {
                    return this.folder + "topleft.png";
                }
                if ((x & 0x1) === 0x0 && (y & 0x1) === 0x1) {
                    return this.folder + "bottomleft.png";
                }
                if ((x & 0x1) === 0x1 && (y & 0x1) === 0x0) {
                    return this.folder + "topright.png";
                }
            case 4:
                if ((x & 0x3) === 0x3 && (y & 0x3) === 0x3) {
                    return this.folder + "bottomright.png";
                }
                if ((x & 0x3) === 0x0 && (y & 0x3) === 0x0) {
                    return this.folder + "topleft.png";
                }
                if ((x & 0x3) === 0x0 && (y & 0x3) === 0x3) {
                    return this.folder + "bottomleft.png";
                }
                if ((x & 0x3) === 0x3 && (y & 0x3) === 0x0) {
                    return this.folder + "topright.png";
                }
                if ((x & 0x3) === 0x3) {
                    return this.folder + "right.png";
                }
                if ((x & 0x3) === 0x0) {
                    return this.folder + "left.png";
                }
                if ((y & 0x3) === 0x3) {
                    return this.folder + "bottom.png";
                }
                if ((y & 0x3) === 0x0) {
                    return this.folder + "top.png";
                }

            }

        },

        options: {
            attribution: '<a href="http://runescape.wiki.com">RuneScape Wiki</a>',
        }

    });

L.tileLayer.grid = function (folder, options) {
    return new L.TileLayer.Grid(folder, options);
}

L.Heatmap = L.GridLayer.extend({
        initialize: function (options = {}) {

            options.minZoom = 2;

            //the zoom level at which 1 piece of collision data = 1 game square
            options.granularity = 2;
            //size of game square grid, must be 2^n
            options.gridSize = 64;
            options.bitShift = (options.gridSize - 1).toString(2).length;
            //size of one game tile in px at above zoom
            options.gameTilePx = 4;
            options.tileSize = options.gameTilePx * options.gridSize;

            options.maxRange = 100;

            if (options.npcs && options.icons) {
                this._npcIcons = this.array.toObject(options.npcs, options.icons);
            }

            L.setOptions(this, options);
        },

        onAdd: function (map) {
            L.GridLayer.prototype.onAdd.call(this, map);

            if (this.options.npcs.length) {
                this.fetchData(this.options.npcs, this.options.range);
            }
        },

        remove: function () {
            this._markers.forEach(marker => marker.remove());
            L.GridLayer.prototype.remove.call(this);
        },

        fetchData: function (npcNames, range) {
            //note: if changing how data is collected, do that and pass the data using this.constructDataCache(mapData, keys, npcs) and fire the event if async

            //fetch data linking npc names to ids
            fetch("npcname_id_map.json")
			
            .then(res => res.json())

            //maps npc names to ids
            .then(data => npcNames.flatMap(name => data[name] || []))
			
            //fetch location(s) of all the npc(s)
			
            .then(idData => Promise.all(idData.map(id => fetch(`npcids/npcid=${id}.json`))))
            .then(instances => Promise.all(instances.map(res => res.json())))
            .then(data => data.flat())
	
            //finds the map squares required
            .then(npcs => {
				
                let keys = this.array.unique(npcs.flatMap(npc => this.getRange(npc, range)));

                //fetch collision data for these map squares
                Promise.allSettled(keys.map(key => fetch(`collisions/-1/${key}.json`)))
                .then(responses => Promise.all(responses.map(res => res.status === "fulfilled" && res.value.ok ? res.value.json() : undefined)))
                .then(mapData => {
					

                    //calculate all the data
                    this.constructDataCache(mapData, keys, npcs);

                    //start drawing tiles
                    this.fire("heatdataready", {
                        keys: this._heatData
                    });
                });
            });

        },

        constructDataCache: function (mapData, keys, npcs) {

            this._collisionData = this.array.toObject(keys, mapData);

            this.constructNpcCache(keys, npcs, this.options.range);

            let heat = keys.map(key => this.createHeatmap(key));
            this._heatData = this.array.toObject(keys, heat);

            this._maxHeat = this._eachMaxHeat.length ? Math.max.apply(null, this._eachMaxHeat) : null;
           console.log("Max heat is", this._maxHeat);

        },

        constructNpcCache: function (keys, npcs, range) {
            npcs.forEach(npc => this.getFeature(npc));
            npcs.forEach(npc => this.getIconUrl(npc));
            this._markers = npcs.map(npc => this.addMarker(npc, this._map));
            this._npcData = npcs.filter(npc => npc.feature);

            this._featureCollection = this.array.unique(npcs.flatMap(npc => npc.feature));

            


        },
        isInRange: function (key, npc, range) {
            return this.getRange(npc, range).includes(key);

        },
        _eachMaxHeat: [],

        createHeatmap: function (key) {

            let mapData = this._collisionData[key];

            let range = this.options.range;
            let npcs = this._npcData.filter(npc => this.isInRange(key, npc, range));

            if (mapData === undefined || npcs.length === 0) {

                return undefined;
            }
            let {
                plane,
                i,
                j
            } = this._decodeDataKey(key);
            //console.log(this._npcData, npcs);

            let npcsHeat = npcs.map(npc => {

                    let npcHeat = this.array.zeros(64);
                    let localNpcX = npc.x - 64 * i;
                    let localNpcY = npc.y - 64 * j;
                    let drawRange = {
                        minX: Math.max(0, localNpcX - range),
                        maxX: Math.min(63, localNpcX + range),
                        minY: Math.max(0, localNpcY - range),
                        maxY: Math.min(63, localNpcY + range),
                    };

                    for (let i = drawRange.minX; i < drawRange.maxX + 1; i++) {
                        for (let j = drawRange.minY; j < drawRange.maxY + 1; j++) {
                            npcHeat[i][j] = mapData[i][j].f === npc.feature ? 1 : 0;
                        }
                    }
                    return npcHeat;
                });
            let totalHeat = this.array.add(npcsHeat);
            this._eachMaxHeat.push(Math.max.apply(null, totalHeat.flat()))
            return totalHeat
            //console.log(key, npcsHeat);
        },

        //various functions acting on arrays
        array: {
            //Finds the value
            maxValue: function (item) {
                if (Array.isArray(item) && Array.isArray(item[0])) {
                    return this.maxValue(item.flat())
                } else {
                    return Math.max.apply(null, item)
                }
            },

            //similar to Python's numpy.zeros()
            zeros: function (size) {
                return Array(size).fill(0).map(x => Array(size).fill(0));
            },

            add: function (arrays) {
                let newArray = this.zeros(64);
                if (arrays.length === 0) {
                    console.log("No arrays were given");
                    return newArray;
                }
                return this.starMap(newArray, (_, i, j) => arrays.map(array => array[i][j]).reduce((a, b) => a + b, 0));
            },

            //maps function fn over a 2d array, returning the resulting array (NOT functools.starmap())
            starMap: function (array, fn) {
                return array.map((subarray, index, array) => subarray.map((value, jndex) => fn(value, index, jndex, array)));
            },

            //similar to Python's itertools.combinations()
            combinations: function (plane, array1, array2) {
                return array1.flatMap(d => array2.map(v => [plane, d, v]))
            },

            //runs function fn over a 2d array
            starEach: function (array, fn) {
                return array.forEach((subarray, index, array) => subarray.forEach((value, jndex) => fn(value, index, jndex, array)));
            },

            //similar to Python's numpy.unique()
            unique: function (array) {
                return Array.from(new Set(array));
            },

            //turns two arrays into a object of key:value pairs
            toObject: function (keys, values) {
                return keys.reduce((obj, k, i) => ({
                        ...obj,
                        [k]: values[i]
                    }), {});
            }
        },

        colors: {},

        getColor: function (tileData) {

            let key = tileData.toString();
            if (!this.colors[key]) {
                //this.colors[key] = '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6) + "E6";
                this.colors[key] = 'rgba(' + parseInt(255 * tileData / this._maxHeat) + ',0, 0, ' + parseInt(100*tileData / this._maxHeat)/100 + ')'

            }
            return this.colors[key];
        },
		
		textColors: {},
		
		getTextColor: function (tileData) {

            let key = tileData.toString();
            if (!this.textColors[key]) {
                //this.colors[key] = '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6) + "E6";
                this.textColors[key] = 'rgba( 255 ,255, 255, ' + parseInt(100*tileData / this._maxHeat)/100 + ')'

            }
            return this.textColors[key];
        },

        getIconUrl: function (npc) {
            let filename = this._npcIcons[npc.name] + ".png";
            if (filename) {
                var hash = MD5.md5(filename);
                //let map.config.wikiImageURL = 'https://runescape.wiki/images/';
                npc.iconUrl = 'https://runescape.wiki/images/' + hash.substr(0, 1) + '/' + hash.substr(0, 2) + '/' + filename;
            }
        },

        _markers: [],

        addMarker: function (npc, map) {
            let icon = L.icon({
                    iconUrl: this._npcIcons[npc.name] ? npc.iconUrl : '../mejrs.github.io/images/marker-icon.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    tooltipAnchor: [16, -28],
                    shadowSize: [41, 41]
                });

            let marker = L.marker([(npc.y + 0.5), (npc.x + 0.5)], {
                    icon: icon,
					alt: npc.name
                });

            map.on('planechange', function (e) {
                if (npc.p === e.newPlane) {
                    marker.addTo(map);
                } else {
                    marker.remove();
                }
            });

            //debug text, replace with something user facing
            {
                let popUpText = Object.entries(npc).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
                marker.bindPopup(popUpText);
            }

            if (npc.p === map.getPlane()) {
                marker.addTo(map);
            }
            return marker;

        },

        getFeature: function (npc) {
            let key = this._generateDataKey(npc);
            npc.feature = this._collisionData[key] ? this._collisionData[key][npc.x & (this.options.gridSize - 1)][npc.y & (this.options.gridSize - 1)].f : null;
        },

        getRange: function (npc, range) {
            let plane = npc.p;
            let radiusX = this.radius(npc.x, range);
            let radiusY = this.radius(npc.y, range);
            let allKeys = this.array.combinations(plane, radiusX, radiusY).map(tile => this._generateDataKey(tile));

            return allKeys;
        },

        radius: function (center, radius) {
            let start = (center - radius) >> this.options.bitShift;
            let end = (center + radius) >> this.options.bitShift;
            return Array.apply(null, Array(end - start + 1)).map((_, index) => index + start);
        },

        createTile: function (coords, done) {
            var tileSize = this.getTileSize();
            var tile = document.createElement('canvas');
            tile.setAttribute('width', tileSize.x);
            tile.setAttribute('height', tileSize.y);

            let plane = this._map.getPlane();
            let properX = coords.x >> (coords.z - 2);
            let properY =  - (1 + coords.y) >> (coords.z - 2);

            var error;

            let key = this._generateDataKey(plane, properX, properY);

            if (this._heatData) {

                if (this._heatData[key] !== undefined) {
                    this._drawTile(tile, coords, this._heatData[key]);
                } else {
                    error = "tile not in cache";
                }

                //immediate callback
                window.setTimeout(() => {
                    done(error, tile);
                }, 0);

            } else {

                //defer drawing the tiles until data has loaded...
                this.once("heatdataready", (e) => {
                    if (e.keys[key]) {
                        this._drawTile(tile, coords, e.keys[key]);
                        //console.log(key, "successfully instantiated");
                        done(error, tile);
                    } else {
                        error = "tile not in cache";
                        done(error, tile);
                        //console.log(key, "has failed successfully")

                    }
                });
            }

            return tile;

        },

        _drawTile: function (tile, coords, data) {

            let pixelsInGameTile = this.options.gameTilePx * 2 ** (coords.z - this.options.granularity);
            let gameTilesInTile = this.options.gridSize * 2 ** (this.options.granularity - coords.z);
            let modifier = 2 ** (coords.z - this.options.granularity) - 1;

            let startX = (coords.x & modifier) * gameTilesInTile;
            let startY = ( - (1 + coords.y) & modifier) * gameTilesInTile;

            var ctx = tile.getContext('2d');

            for (let i = startX; i < startX + gameTilesInTile; i++) {
                for (let j = startY; j < startY + gameTilesInTile; j++) {

                    let tileData = data[i][j];
                    if (tileData) {
                        this._drawRect(ctx, startX, startY, i, j, pixelsInGameTile, tileData);
                    }

                }
            }

        },

        _drawRect: function (ctx, startX, startY, i, j, pixelsInGameTile, tileData) {
            if (i < 0 || j < 0 || i > 63 || j > 63) {
                console.log("tried writing at", i, j);
            }

            //Transform from y increasing down to increasing up and account for zoom scale
            let x = (i - startX) * pixelsInGameTile;
            let y = this.getTileSize().y - ((j + 1) - startY) * pixelsInGameTile;

            ctx.fillStyle = this.getColor(tileData);
            ctx.fillRect(x, y, pixelsInGameTile, pixelsInGameTile);
            ctx.font = pixelsInGameTile + 'px serif';

            ctx.textBaseline = 'middle';
            ctx.textAlign = "center";

            ctx.fillStyle = this.getTextColor(tileData);
            ctx.fillText(tileData, x + 0.5 * pixelsInGameTile, y + 0.5 * pixelsInGameTile);

        },

        _generateDataKey: function (...args) {
            args = args.flat();

            if (typeof args[0] !== 'object') {

                return args.join("_");
            } else {
                return [args[0].p, args[0].x >> this.options.bitShift, args[0].y >> this.options.bitShift].join("_");
            }

        },

        _decodeDataKey: function (input) {
            let numbers = input.match(/\d+/g).map(Number);

            return {
                plane: numbers[0],
                i: numbers[1],
                j: numbers[2]
            };
        },

    });

L.heatmap = function (options) {
    return new L.Heatmap(options);
};


const MD5 = (function () {
    return class MD5 {
        static md5cycle(x, k) {
            var a = x[0],
            b = x[1],
            c = x[2],
            d = x[3];

            a = this.ff(a, b, c, d, k[0], 7, -680876936);
            d = this.ff(d, a, b, c, k[1], 12, -389564586);
            c = this.ff(c, d, a, b, k[2], 17, 606105819);
            b = this.ff(b, c, d, a, k[3], 22, -1044525330);
            a = this.ff(a, b, c, d, k[4], 7, -176418897);
            d = this.ff(d, a, b, c, k[5], 12, 1200080426);
            c = this.ff(c, d, a, b, k[6], 17, -1473231341);
            b = this.ff(b, c, d, a, k[7], 22, -45705983);
            a = this.ff(a, b, c, d, k[8], 7, 1770035416);
            d = this.ff(d, a, b, c, k[9], 12, -1958414417);
            c = this.ff(c, d, a, b, k[10], 17, -42063);
            b = this.ff(b, c, d, a, k[11], 22, -1990404162);
            a = this.ff(a, b, c, d, k[12], 7, 1804603682);
            d = this.ff(d, a, b, c, k[13], 12, -40341101);
            c = this.ff(c, d, a, b, k[14], 17, -1502002290);
            b = this.ff(b, c, d, a, k[15], 22, 1236535329);

            a = this.gg(a, b, c, d, k[1], 5, -165796510);
            d = this.gg(d, a, b, c, k[6], 9, -1069501632);
            c = this.gg(c, d, a, b, k[11], 14, 643717713);
            b = this.gg(b, c, d, a, k[0], 20, -373897302);
            a = this.gg(a, b, c, d, k[5], 5, -701558691);
            d = this.gg(d, a, b, c, k[10], 9, 38016083);
            c = this.gg(c, d, a, b, k[15], 14, -660478335);
            b = this.gg(b, c, d, a, k[4], 20, -405537848);
            a = this.gg(a, b, c, d, k[9], 5, 568446438);
            d = this.gg(d, a, b, c, k[14], 9, -1019803690);
            c = this.gg(c, d, a, b, k[3], 14, -187363961);
            b = this.gg(b, c, d, a, k[8], 20, 1163531501);
            a = this.gg(a, b, c, d, k[13], 5, -1444681467);
            d = this.gg(d, a, b, c, k[2], 9, -51403784);
            c = this.gg(c, d, a, b, k[7], 14, 1735328473);
            b = this.gg(b, c, d, a, k[12], 20, -1926607734);

            a = this.hh(a, b, c, d, k[5], 4, -378558);
            d = this.hh(d, a, b, c, k[8], 11, -2022574463);
            c = this.hh(c, d, a, b, k[11], 16, 1839030562);
            b = this.hh(b, c, d, a, k[14], 23, -35309556);
            a = this.hh(a, b, c, d, k[1], 4, -1530992060);
            d = this.hh(d, a, b, c, k[4], 11, 1272893353);
            c = this.hh(c, d, a, b, k[7], 16, -155497632);
            b = this.hh(b, c, d, a, k[10], 23, -1094730640);
            a = this.hh(a, b, c, d, k[13], 4, 681279174);
            d = this.hh(d, a, b, c, k[0], 11, -358537222);
            c = this.hh(c, d, a, b, k[3], 16, -722521979);
            b = this.hh(b, c, d, a, k[6], 23, 76029189);
            a = this.hh(a, b, c, d, k[9], 4, -640364487);
            d = this.hh(d, a, b, c, k[12], 11, -421815835);
            c = this.hh(c, d, a, b, k[15], 16, 530742520);
            b = this.hh(b, c, d, a, k[2], 23, -995338651);

            a = this.ii(a, b, c, d, k[0], 6, -198630844);
            d = this.ii(d, a, b, c, k[7], 10, 1126891415);
            c = this.ii(c, d, a, b, k[14], 15, -1416354905);
            b = this.ii(b, c, d, a, k[5], 21, -57434055);
            a = this.ii(a, b, c, d, k[12], 6, 1700485571);
            d = this.ii(d, a, b, c, k[3], 10, -1894986606);
            c = this.ii(c, d, a, b, k[10], 15, -1051523);
            b = this.ii(b, c, d, a, k[1], 21, -2054922799);
            a = this.ii(a, b, c, d, k[8], 6, 1873313359);
            d = this.ii(d, a, b, c, k[15], 10, -30611744);
            c = this.ii(c, d, a, b, k[6], 15, -1560198380);
            b = this.ii(b, c, d, a, k[13], 21, 1309151649);
            a = this.ii(a, b, c, d, k[4], 6, -145523070);
            d = this.ii(d, a, b, c, k[11], 10, -1120210379);
            c = this.ii(c, d, a, b, k[2], 15, 718787259);
            b = this.ii(b, c, d, a, k[9], 21, -343485551);

            x[0] = this.add32(a, x[0]);
            x[1] = this.add32(b, x[1]);
            x[2] = this.add32(c, x[2]);
            x[3] = this.add32(d, x[3]);
        }

        static cmn(q, a, b, x, s, t) {
            a = this.add32(this.add32(a, q), this.add32(x, t));
            return this.add32((a << s) | (a >>> (32 - s)), b);
        }

        static ff(a, b, c, d, x, s, t) {
            return this.cmn((b & c) | ((~b) & d), a, b, x, s, t);
        }

        static gg(a, b, c, d, x, s, t) {
            return this.cmn((b & d) | (c & (~d)), a, b, x, s, t);
        }

        static hh(a, b, c, d, x, s, t) {
            return this.cmn(b ^ c ^ d, a, b, x, s, t);
        }

        static ii(a, b, c, d, x, s, t) {
            return this.cmn(c ^ (b | (~d)), a, b, x, s, t);
        }

        static md51(s) {
            var txt = '';
            var n = s.length,
            state = [1732584193, -271733879, -1732584194, 271733878],
            i;
            for (i = 64; i <= s.length; i += 64) {
                this.md5cycle(state, this.md5blk(s.substring(i - 64, i)));
            }
            s = s.substring(i - 64);
            // eslint-disable-next-line comma-spacing
            var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (i = 0; i < s.length; i++) {
                tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
            }
            tail[i >> 2] |= 0x80 << ((i % 4) << 3);
            if (i > 55) {
                this.md5cycle(state, tail);
                for (i = 0; i < 16; i++) {
                    tail[i] = 0;
                }
            }
            tail[14] = n * 8;
            this.md5cycle(state, tail);
            return state;
        }

        /* there needs to be support for Unicode here,
         * unless we pretend that we can redefine the MD-5
         * algorithm for multi-byte characters (perhaps
         * by adding every four 16-bit characters and
         * shortening the sum to 32 bits). Otherwise
         * I suggest performing MD-5 as if every character
         * was two bytes--e.g., 0040 0025 = @%--but then
         * how will an ordinary MD-5 sum be matched?
         * There is no way to standardize text to something
         * like UTF-8 before transformation; speed cost is
         * utterly prohibitive. The JavaScript standard
         * itself needs to look at this: it should start
         * providing access to strings as preformed UTF-8
         * 8-bit unsigned value arrays.
         */
        static md5blk(s) { /* I figured global was faster.   */
            var md5blks = [],
            i; /* Andy King said do it this way. */
            for (i = 0; i < 64; i += 4) {
                md5blks[i >> 2] = s.charCodeAt(i) +
                    (s.charCodeAt(i + 1) << 8) +
                    (s.charCodeAt(i + 2) << 16) +
                    (s.charCodeAt(i + 3) << 24);
            }
            return md5blks;
        }

        static rhex(n) {
            var s = '',
            j = 0;
            for (; j < 4; j++) {
                s += this.hex_chr[(n >> (j * 8 + 4)) & 0x0F] +
                this.hex_chr[(n >> (j * 8)) & 0x0F];
            }
            return s;
        }

        static hex(x) {
            // eslint-disable-next-line camelcase
            this.hex_chr = '0123456789abcdef'.split('');
            for (var i = 0; i < x.length; i++) {
                x[i] = this.rhex(x[i]);
            }
            return x.join('');
        }

        static md5(s) {
            return this.hex(this.md51(s));
        }

        static add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }
    };
}
    ());


function show_data(map, path, fn) {

    var markerPromise = fetch(path);
    const currentPlane = map.getPlane();
    markerPromise.then(response => response.json()).then(data => fn(data)).then(data => {
        var markerCollection = L.layerGroup();

        data.forEach(item => {

            let icon = L.icon({
                    iconUrl: '../mejrs.github.io/images/marker-icon.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    tooltipAnchor: [16, -28],
                    shadowSize: [41, 41]
                });
            let greyscaleIcon = L.icon({
                    iconUrl: '../mejrs.github.io/images/marker-icon-greyscale.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    tooltipAnchor: [16, -28],
                    shadowSize: [41, 41]
                });

            let marker = L.marker([(item.y + 0.5), (item.x + 0.5)], {
                    icon: item.p === currentPlane ? icon : greyscaleIcon,
                });

            map.on('planechange', function (e) {
                marker.setIcon(item.p === e.newPlane ? icon : greyscaleIcon);
            });
			
			let popUpText = Object.entries(item).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
			marker.bindPopup(popUpText)
            markerCollection.addLayer(marker)
            
        });

        markerCollection.addTo(map);

        return;
    });

    markerPromise.catch(function (resolve, reject) {
        return 0;
    });

}

