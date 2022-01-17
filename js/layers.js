"use strict";
import MD5 from "./MD5.js";
import "./leaflet.js";

(function (factory) {
    var L;
    if (typeof define === "function" && define.amd) {
        define(["leaflet"], factory);
    } else if (typeof module !== "undefined") {
        L = require("leaflet");
        module.exports = factory(L);
    } else {
        if (typeof window.L === "undefined") {
            throw new Error("Leaflet must be loaded first");
        }
        factory(window.L);
    }
})(function (L) {
    // see https://stackoverflow.com/a/60391674
    L.Map.include({
        _initControlPos: function () {
            var corners = (this._controlCorners = {}),
                l = "leaflet-",
                container = (this._controlContainer = L.DomUtil.create("div", l + "control-container", this._container));

            function createCorner(vSide, hSide) {
                var className = l + vSide + " " + l + hSide;

                corners[vSide + hSide] = L.DomUtil.create("div", className, container);
            }

            createCorner("top", "left");
            createCorner("top", "right");
            createCorner("bottom", "left");
            createCorner("bottom", "right");

            createCorner("top", "center");
            createCorner("middle", "center");
            createCorner("middle", "left");
            createCorner("middle", "right");
            createCorner("bottom", "center");
        },
    });

    L.GameMap = L.Map.extend({
        initialize: function (id, options) {
            // (HTMLElement or String, Object)

            let parsedUrl = new URL(window.location.href);

            options.zoom = Number(parsedUrl.searchParams.get("zoom") || parsedUrl.searchParams.get("z") || this._limitZoom(options.zoom) || 0);

            this._plane = Number(parsedUrl.searchParams.get("plane") || parsedUrl.searchParams.get("p") || this._limitPlane(options.plane) || 0);

            this._mapId = Number(parsedUrl.searchParams.get("mapId") || parsedUrl.searchParams.get("mapid") || parsedUrl.searchParams.get("m") || options.initialMapId || -1);
            this._era = parsedUrl.searchParams.get("era") || options.era || null;
            options.x = Number(parsedUrl.searchParams.get("x")) || options.x || 3232;
            options.y = Number(parsedUrl.searchParams.get("y")) || options.y || 3232;
            options.center = [options.y, options.x];

            options.crs = L.CRS.Simple;

            L.Map.prototype.initialize.call(this, id, options);

            this.on("moveend planechange mapidchange erachange", this.setSearchParams);

            if (this.options.baseMaps) {
                fetch(this.options.baseMaps)
                    .then((response) => response.json())
                    .then((data) => {
                        this._baseMaps = Array.isArray(data) ? this.castBaseMaps(data) : data;
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
            }

            if (options.messageBox) {
                this._messageContainer = L.DomUtil.create("div", "leaflet-control-message-container");
                this._controlContainer.appendChild(this._messageContainer);
            }
        },

        addMessage: function (message) {
            if (this.options.messageBox) {
                let messageBox = L.DomUtil.create("div", "leaflet-control-message-box");

                let messageContent = L.DomUtil.create("div", "leaflet-control-message-content");
                messageContent.innerHTML = message;
                messageBox.appendChild(messageContent);

                let clearButton = L.DomUtil.create("div", "leaflet-control-message-clear");
                clearButton.innerHTML = "[dismiss]";
                clearButton.onclick = () => this._messageContainer.removeChild(messageBox);
                messageBox.appendChild(clearButton);

                this._messageContainer.appendChild(messageBox);
                setTimeout(() => {
                    if (this._messageContainer.contains(messageBox)) {
                        this._messageContainer.removeChild(messageBox);
                    }
                }, 4000);
                return messageBox;
            } else {
                console.log(message);
            }
        },

        castBaseMaps: function (data) {
            let baseMaps = {};
            for (let i in data) {
                baseMaps[data[i].mapId] = data[i];
            }
            return baseMaps;
        },

        setSearchParams: function (
            e,
            parameters = {
                era: this._era,
                m: this._mapId,
                z: this._zoom,
                p: this._plane,
                x: Math.round(this.getCenter().lng),
                y: Math.round(this.getCenter().lat),
            }
        ) {
            let url = new URL(window.location.href);
            let params = url.searchParams;

            for (const param in ["mapId", "mapid", "zoom", "plane", "era"]) {
                params.delete(param);
            }

            for (let [key, value] of Object.entries(parameters)) {
                if (value !== null) {params.set(key, value);}
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
                console.error("No basemaps found");
                return this._mapId;
            } else if (this._allowedMapIds.includes(parsedMapId)) {
                return parsedMapId;
            } else {
                console.warn("Not a valid mapId");
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
            this.fire("maxplanechange", {
                newMaxPlane: newMaxPlane,
            });
        },

        setPlane: function (_plane) {
            let newPlane = this._limitPlane(_plane);
            let oldPlane = this._plane;
            if (oldPlane !== newPlane) {
                this.fire("preplanechange", {
                    oldPlane: oldPlane,
                    newPlane: newPlane,
                });
                this.fire("viewprereset");
                this._plane = newPlane;
                this.fire("viewreset");
                this.fire("planechange", {
                    oldPlane: oldPlane,
                    newPlane: newPlane,
                });
                return this;
            }
        },

        setMapId: function (_mapId) {
            let newMapId = this._validateMapId(_mapId);
            let oldMapId = this._mapId;
            if (oldMapId !== newMapId) {
                this.fire("premapidchange", {
                    oldMapId: oldMapId,
                    newMapId: newMapId,
                });
                this.fire("viewprereset");
                this._mapId = newMapId;

                this.fire("viewreset");
                this.fire("mapidchange", {
                    oldMapId: oldMapId,
                    newMapId: newMapId,
                });
                this.setMapIdBounds(newMapId);

                return this;
            }
        },

        setEra: function (newEra) {
            let oldEra = this._era;

            if (oldEra !== newEra) {
                this.fire("preerachange", {
                    oldEra: oldEra,
                    newEra: newEra,
                });
                this._era = newEra.key;

                this.fire("erachange", {
                    oldEra: oldEra,
                    newEra: newEra,
                });

                return this;
            }
        },

        getMapIdBounds: function (mapId) {
            let [[west, south], [east, north]] = this._baseMaps[mapId].bounds;
            return L.latLngBounds([
                [south, west],
                [north, east],
            ]);
        },

        setMapIdBounds: function (newMapId) {
            let bounds = this.getMapIdBounds(newMapId);

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
    };

    L.TileLayer.Main = L.TileLayer.extend({
        initialize: function (url, options) {
            this._url = url;

            
            L.setOptions(this, options);
        },

        onAdd: function (map) {
            if (!(this.options.errorTileUrl)){
                console.warn(`The ${this.options.source} layer did not have its errorTileUrl option set. This is needed to stop flickering.`);
            }
            this.options.resolved_error_url = new URL(this.options.errorTileUrl, document.location).href  ;

            map.on("erachange", (e) => {
                this.refresh(map._era);
            });
            return L.TileLayer.prototype.onAdd.call(this, map);
        },

        getTileUrl: function (coords) {
            return L.Util.template(this._url, {
                source: this.options.source,
                mapId: this._map._mapId,
                zoom: coords.z,
                plane: this._map._plane || 0,
                x: coords.x,
                y: -(1 + coords.y),
                era: this._map._era || this._map.options.default_era,
            });
        },

        // Suppress 404 errors for loading tiles
        // These are expected as trivial tiles are not included to save on storage space
        createTile: function (coords, done) {
            let tile = L.TileLayer.prototype.createTile.call(this, coords, done);
            tile.onerror = (error) => error.preventDefault();
            return tile;
        },

        // "fix" for flickering:
        //
        // https://github.com/Leaflet/Leaflet/issues/6659
        // using impl from https://gist.github.com/barryhunter/e42f0c4756e34d5d07db4a170c7ec680
        _refreshTileUrl: function (layer, tile, url, sentinel1, sentinel2) {
            //use a image in background, so that only replace the actual tile, once image is loaded in cache!
            let img = new Image();
              
            img.onload = () => {
                L.Util.requestAnimFrame(() => {
                    if (sentinel1 === sentinel2) {
                        tile.el.src = url;
                    } else{
                        // a newer map is already loading, do nothing
                    }
                });
            };
            img.onerror = () => {
                L.Util.requestAnimFrame(() => {
                    if( (sentinel1 === sentinel2) && (tile.el.src !== this.options.resolved_error_url)){
                        tile.el.src = layer.errorTileUrl;
                    } else{
                        // a newer map is already loading, do nothing
                    }
                });
            };
            img.src = url;
        },
        refresh: function (sentinel) {
            //prevent _tileOnLoad/_tileReady re-triggering a opacity animation
            let wasAnimated = this._map._fadeAnimated;
            this._map._fadeAnimated = false;
            let sentinel_ref = `${sentinel}`;

            for (let tile of Object.values(this._tiles)) {
                if (tile.current && tile.active) {
                    let newsrc = this.getTileUrl(tile.coords);
                    this._refreshTileUrl(this, tile, newsrc, sentinel, sentinel_ref);
                }
            }

            if (wasAnimated)
                setTimeout(function () {
                    map._fadeAnimated = wasAnimated;
                }, 5000);
        },
    });

    L.tileLayer.main = function (url, options) {
        return new L.TileLayer.Main(url, options);
    };

    L.Grid = L.GridLayer.extend({
        initialize: function (options) {
            options.maxNativeZoom = 2;
            options.minNativeZoom = 2;
            options.minZoom = 1;
            L.setOptions(this, options);
        },

        createTile: function (coords) {
            let tile = L.DomUtil.create("div", "grid");
            tile.innerHTML = [coords.x, -(1 + coords.y)].join(", ");
            return tile;
        },

        _update: function (center) {
            if (this._map.getZoom() >= this.options.minZoom) {
                return L.GridLayer.prototype._update.call(this, center);
            }
        },
    });

    L.grid = function (options) {
        return new L.Grid(options);
    };

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

            if (this.options.npcs.length || this.options.ids) {
                this.fetchData(this.options.npcs, this.options.ids, this.options.range);
            }
        },

        remove: function () {
            this._markers.forEach((marker) => marker.remove());
            L.GridLayer.prototype.remove.call(this);
        },

        getIds: function (names, ids) {
            return (
                Promise.resolve(
                    ids && ids.length
                        ? ids
                        : fetch(`${this.options.folder}/npc_name_collection.json`)
                              .then((response) => response.json())

                              .then((name_collection) => names.flatMap((name) => name_collection[name]))

                              //remove any names not found
                              .then((namedIds) => namedIds.filter(Number.isInteger))
                )

                    .then((namedIds) =>
                        fetch(`${this.options.folder}/npc_morph_collection.json`)
                            .then((res) => res.json())
                            .then((morphs) => namedIds.flatMap((id) => [...(morphs[id] ?? []), id]))
                    )
                    //unique elements
                    .then((ids) => Array.from(new Set(ids)))
            );
        },

        fetchData: function (npcNames, npcIds, range) {
            this.getIds(npcNames, npcIds).then((ids) => {
                Promise.allSettled(ids.map((id) => fetch(`${this.options.folder}/npcids/npcid=${id}.json`)))

                    .then((responses) => Promise.all(responses.filter((res) => res.status === "fulfilled" && res.value.ok).map((res) => res.value.json())))
                    .then((data) => (data.length !== 0 ? data : Promise.reject(new Error("Unable to find any npcids."))))
                    .then((data) => data.flat())

                    //finds the map squares required
                    .then((npcs) => {
                        let keys = this.array.unique(npcs.flatMap((npc) => this.getRange(npc, range)));

                        //fetch collision data for these map squares
                        Promise.allSettled(keys.map((key) => fetch(`${this.options.folder}/collisions/-1/${key}.json`)))
                            .then((responses) => Promise.all(responses.filter((res) => res.status === "fulfilled" && res.value.ok).map((res) => res.value.json())))
                            .then((mapData) => {
                                //calculate all the data
                                this.constructDataCache(mapData, keys, npcs);

                                //start drawing tiles
                                this.fire("heatdataready", {
                                    keys: this._heatData,
                                });
                            })
                            .finally(this._map.addMessage(`Found ${npcs.length} instances of this npc`));
                    })
                    .catch((error) => {
                        console.log(error);
                        this._map.addMessage(`Unable to find instances of this npc.`);
                    });
            });
        },

        _collisionData: undefined,

        _heatData: undefined,

        constructDataCache: function (mapData, keys, npcs) {
            this._collisionData = this.array.toObject(keys, mapData);

            this.constructNpcCache(keys, npcs);

            if (this.options.showHeat) {
                let heat = keys.map((key) => this.createHeatmap(key));
                this._heatData = this.array.toObject(keys, heat);

                this._maxHeat = this._eachMaxHeat.length ? Math.max.apply(null, this._eachMaxHeat) : undefined;
            }
        },

        constructNpcCache: function (keys, npcs) {
            npcs.forEach((npc) => this.getFeature(npc));

            if (this._npcIcons) {
                npcs.forEach((npc) => this.getIconUrl(npc));
            }
            this._markers = npcs.map((npc) => this.addMarker(npc, this._map));
            this._npcData = npcs.filter((npc) => npc.feature);

            this._featureCollection = this.array.unique(npcs.flatMap((npc) => npc.feature));
        },
        isInRange: function (key, npc, range) {
            return this.getRange(npc, range).includes(key);
        },
        _eachMaxHeat: [],

        createHeatmap: function (key) {
            let mapData = this._collisionData[key];

            let range = this.options.range;
            let npcs = this._npcData.filter((npc) => this.isInRange(key, npc, range));

            if (mapData === undefined || npcs.length === 0) {
                return undefined;
            }
            let {
                plane, // eslint-disable-line
                i,
                j,
            } = this._decodeDataKey(key);
            //console.log(this._npcData, npcs);

            let npcsHeat = npcs.map((npc) => {
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
            this._eachMaxHeat.push(Math.max.apply(null, totalHeat.flat()));
            return totalHeat;
            //console.log(key, npcsHeat);
        },

        //various functions acting on arrays
        array: {
            //Finds the value
            maxValue: function (item) {
                if (Array.isArray(item) && Array.isArray(item[0])) {
                    return this.maxValue(item.flat());
                } else {
                    return Math.max.apply(null, item);
                }
            },

            //similar to Python's numpy.zeros()
            zeros: function (size) {
                return Array(size)
                    .fill(0)
                    .map(() => Array(size).fill(0));
            },

            add: function (arrays) {
                let newArray = this.zeros(64);
                if (arrays.length === 0) {
                    console.log("No arrays were given");
                    return newArray;
                }
                return this.starMap(newArray, (_, i, j) => arrays.map((array) => array[i][j]).reduce((a, b) => a + b, 0));
            },

            //maps function fn over a 2d array, returning the resulting array
            starMap: function (array, fn) {
                return array.map((subarray, index, array) => subarray.map((value, jndex) => fn(value, index, jndex, array)));
            },

            //similar to Python's itertools.combinations()
            combinations: function (plane, array1, array2) {
                return array1.flatMap((d) => array2.map((v) => [plane, d, v]));
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
                return keys.reduce(
                    (obj, k, i) => ({
                        ...obj,
                        [k]: values[i],
                    }),
                    {}
                );
            },
        },

        colors: {},

        getColor: function (tileData) {
            let key = tileData.toString();
            if (!this.colors[key]) {
                this.colors[key] = "rgba(" + parseInt((255 * tileData) / this._maxHeat) + ",0, 0, " + parseInt((100 * tileData) / this._maxHeat) / 100 + ")";
            }
            return this.colors[key];
        },

        textColors: {},

        getTextColor: function (tileData) {
            let key = tileData.toString();
            if (!this.textColors[key]) {
                //this.colors[key] = '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6) + "E6";
                this.textColors[key] = "rgba( 255 ,255, 255, " + parseInt((100 * tileData) / this._maxHeat) / 100 + ")";
            }
            return this.textColors[key];
        },

        getIconUrl: function (npc) {
            let filename = this._npcIcons[npc.name] + ".png";
            if (filename) {
                var hash = MD5.md5(filename);
                npc.iconUrl = "https://runescape.wiki/images/" + hash.substr(0, 1) + "/" + hash.substr(0, 2) + "/" + filename;
            }
        },

        _markers: [],

        addMarker: function (npc, map) {
            let icon = L.icon({
                iconUrl: "images/marker-icon.png",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41],
            });
            let greyscaleIcon = L.icon({
                iconUrl: "images/marker-icon-greyscale.png",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41],
            });

            let marker = L.marker([npc.y + 0.5, npc.x + 0.5], {
                icon: npc.p === this._map.getPlane() ? icon : greyscaleIcon,
            });

            this._map.on("planechange", function (e) {
                marker.setIcon(npc.p === e.newPlane ? icon : greyscaleIcon);
            });

            let popUpText = Object.entries(npc)
                .map((x) => x.map((i) => (typeof i !== "string" ? JSON.stringify(i) : i)).join(" = "))
                .join("<br>");
            marker.bindPopup(popUpText, {
                autoPan: false,
            });
            marker.addTo(map);

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
            let allKeys = this.array.combinations(plane, radiusX, radiusY).map((tile) => this._generateDataKey(tile));

            return allKeys;
        },

        radius: function (center, radius) {
            let start = (center - radius) >> this.options.bitShift;
            let end = (center + radius) >> this.options.bitShift;
            return Array.apply(null, Array(end - start + 1)).map((_, index) => index + start);
        },

        createTile: function (coords, done) {
            var tileSize = this.getTileSize();
            var tile = document.createElement("canvas");
            tile.setAttribute("width", tileSize.x);
            tile.setAttribute("height", tileSize.y);

            let plane = this._map.getPlane();
            let properX = coords.x >> (coords.z - 2);
            let properY = -(1 + coords.y) >> (coords.z - 2);

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
                    if (e.keys && e.keys[key]) {
                        this._drawTile(tile, coords, e.keys[key]);
                        //console.info("Successfully instantiated tile at", coords);
                        done(error, tile);
                    } else {
                        error = "tile not in cache";
                        //console.info("Cancelled tile at", coords);
                        done(error, tile);
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
            let startY = (-(1 + coords.y) & modifier) * gameTilesInTile;

            var ctx = tile.getContext("2d");

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
                throw new RangeError("tried writing at " + i + "," + j);
            }

            //Transform from y increasing down to increasing up and account for zoom scale
            let x = (i - startX) * pixelsInGameTile;
            let y = this.getTileSize().y - (j + 1 - startY) * pixelsInGameTile;

            ctx.fillStyle = this.getColor(tileData);
            ctx.fillRect(x, y, pixelsInGameTile, pixelsInGameTile);
            ctx.font = pixelsInGameTile + "px serif";

            ctx.textBaseline = "middle";
            ctx.textAlign = "center";

            ctx.fillStyle = this.getTextColor(tileData);
            ctx.fillText(tileData, x + 0.5 * pixelsInGameTile, y + 0.5 * pixelsInGameTile);
        },

        _generateDataKey: function (...args) {
            args = args.flat();

            if (typeof args[0] !== "object") {
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
                j: numbers[2],
            };
        },
    });

    L.heatmap = function (options) {
        return new L.Heatmap(options);
    };

    // @factory L.DynamicIcons(options?: DynamicIcons options)
    // Creates a new layer  with the supplied options.

    L.DynamicIcons = L.Layer.extend({
        options: {
            updateWhenIdle: L.Browser.mobile,
            updateWhenZooming: true,
            updateInterval: 200,
            zIndex: 1,
            bounds: null,
            minZoom: undefined,
            maxZoom: undefined,

            // @option nativeZoom: Number
            // The zoom level at which one tile corresponds to one unit of granularity of the icon data
            nativeZoom: 2,

            // @option nativeZoomTileSize: Number
            // Px size of one tile at nativeZoom. Use a number if width and height are equal, or `L.point(width, height)` otherwise.
            nativeTileSize: 256,

            className: "",
            keepBuffer: 2,

            // @option filterFn: Function
            // Function applied by .filter() on icon data
            filterFn: undefined,

            // @option mapFn: Function
            // Function applied by .map() on icon data
            mapFn: undefined,

            // @option show3d: boolean
            // If true, shows a greyed marker if the marker is on a different plane
            show3d: true,
        },

        initialize: function (options) {
            L.setOptions(this, options);
        },

        onAdd: function (map) {
            // eslint-disable-line no-unused-vars
            if (this.options.dataPath) {
                fetch(this.options.dataPath)
                    .then((response) => response.json())
                    .then((response) => {
                        if (this.options.filterFn) {
                            response = response.filter(this.options.filterFn);
                        }

                        if (this.options.mapFn) {
                            response = response.map(this.options.mapFn);
                        }

                        this._icon_data = this.parseData(response);
                        this._icons = {};
                        this._resetView();
                        this._update();
                    })
                    .catch(console.error);
            } else {
                throw new Error("No dataPath specified");
            }
        },

        parseData: function (data) {
            data.forEach(
                (item) =>
                    (item.key = this._tileCoordsToKey({
                        plane: item.p ?? item.plane,
                        x: item.x >> 6,
                        y: -(item.y >> 6),
                    }))
            );

            let icon_data = {};
            data.forEach((item) => {
                if (!(item.key in icon_data)) {
                    icon_data[item.key] = [];
                }
                icon_data[item.key].push(item);
            });

            console.info("Added", data.length, "items");
            return icon_data;
        },

        onRemove: function (map) {
            // eslint-disable-line
            this._removeAllIcons();

            this._tileZoom = undefined;
        },

        // @method setZIndex(zIndex: Number): this
        // Changes the [zIndex](#gridlayer-zindex) of the grid layer.
        setZIndex: function (zIndex) {
            return L.GridLayer.prototype.setZIndex.call(this, zIndex);
        },

        // @method isLoading: Boolean
        // Returns `true` if any tile in the grid layer has not finished loading.
        isLoading: function () {
            return this._loading;
        },

        // @method redraw: this
        // Causes the layer to clear all the tiles and request them again.
        redraw: function () {
            if (this._map) {
                this._removeAllIcons();
                this._update();
            }
            return this;
        },

        getEvents: function () {
            return L.GridLayer.prototype.getEvents.call(this);
        },

        // @section
        // @method getTileSize: Point
        // Normalizes the [tileSize option](#gridlayer-tilesize) into a point. Used by the `createTile()` method.
        getTileSize: function () {
            var s = this.options.nativeTileSize;
            return s instanceof L.Point ? s : new L.Point(s, s);
        },

        _updateZIndex: function () {
            if (this._container && this.options.zIndex !== undefined && this.options.zIndex !== null) {
                this._container.style.zIndex = this.options.zIndex;
            }
        },

        _setAutoZIndex: function (compare) {
            return L.GridLayer.prototype._setAutoZIndex.call(this, compare);
        },

        _pruneIcons: function () {
            if (!this._map) {
                return;
            }

            var key, icons;

            var zoom = this._map.getZoom();
            if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
                this._removeAllIcons();
                return;
            }

            for (key in this._icons) {
                icons = this._icons[key];
                icons.retain = icons.current;
            }

            for (key in this._icons) {
                let tile = this._icons[key];
                if (tile.current && !tile.active) {
                    var coords = tile.coords;
                    if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5)) {
                        this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2);
                    }
                }
            }

            for (key in this._icons) {
                if (!this._icons[key].retain) {
                    this._removeIcons(key);
                }
            }
        },

        _removeTilesAtZoom: function (zoom) {
            for (var key in this._icons) {
                if (this._icons[key].coords.z !== zoom) {
                    continue;
                }
                this._removeIcons(key);
            }
        },

        _removeAllIcons: function () {
            for (var key in this._icons) {
                this._removeIcons(key);
            }
        },

        _invalidateAll: function () {
            this._removeAllIcons();

            this._tileZoom = undefined;
        },

        _retainParent: function (x, y, z, minZoom) {
            var x2 = Math.floor(x / 2),
                y2 = Math.floor(y / 2),
                z2 = z - 1,
                coords2 = new L.Point(+x2, +y2);
            coords2.z = +z2;

            var key = this._tileCoordsToKey(coords2),
                tile = this._icons[key];

            if (tile && tile.active) {
                tile.retain = true;
                return true;
            } else if (tile && tile.loaded) {
                tile.retain = true;
            }

            if (z2 > minZoom) {
                return this._retainParent(x2, y2, z2, minZoom);
            }

            return false;
        },

        _retainChildren: function (x, y, z, maxZoom) {
            for (var i = 2 * x; i < 2 * x + 2; i++) {
                for (var j = 2 * y; j < 2 * y + 2; j++) {
                    var coords = new L.Point(i, j);
                    coords.z = z + 1;

                    var key = this._tileCoordsToKey(coords),
                        tile = this._icons[key];

                    if (tile && tile.active) {
                        tile.retain = true;
                        continue;
                    } else if (tile && tile.loaded) {
                        tile.retain = true;
                    }

                    if (z + 1 < maxZoom) {
                        this._retainChildren(i, j, z + 1, maxZoom);
                    }
                }
            }
        },

        _resetView: function (e) {
            return L.GridLayer.prototype._resetView.call(this, e);
        },

        _animateZoom: function (e) {
            return L.GridLayer.prototype._resetView.call(this, e);
        },

        _setView: function (center, zoom, noPrune, noUpdate) {
            var tileZoom = this.options.nativeZoom;

            if ((this.options.maxZoom !== undefined && zoom > this.options.maxZoom) || (this.options.minZoom !== undefined && zoom < this.options.minZoom)) {
                tileZoom = undefined;
            }

            var tileZoomChanged = this.options.updateWhenZooming && tileZoom !== this._tileZoom;
            if (!noUpdate || tileZoomChanged) {
                this._tileZoom = tileZoom;

                if (this._abortLoading) {
                    this._abortLoading();
                }

                this._resetGrid();

                if (tileZoom !== undefined) {
                    this._update(center);
                }

                if (!noPrune) {
                    this._pruneIcons();
                }

                this._noPrune = !!noPrune;
            }
        },
        _onMoveEnd: function () {
            return L.GridLayer.prototype._onMoveEnd.call(this);
        },

        _resetGrid: function () {
            return L.GridLayer.prototype._resetGrid.call(this);
        },

        _pxBoundsToTileRange: function (bounds) {
            var tileSize = this.getTileSize();
            return new L.Bounds(bounds.min.unscaleBy(tileSize).floor(), bounds.max.unscaleBy(tileSize).ceil());
        },

        _getTiledPixelBounds: function (center) {
            return L.GridLayer.prototype._getTiledPixelBounds.call(this, center);
        },

        // Private method to load icons in the grid's active zoom level according to map bounds
        _update: function (center) {
            var map = this._map;
            if (!map) {
                return;
            }
            var zoom = this.options.nativeZoom;

            if (center === undefined) {
                center = map.getCenter();
            }
            if (this._tileZoom === undefined) {
                return;
            } // if out of minzoom/maxzoom

            var pixelBounds = this._getTiledPixelBounds(center),
                tileRange = this._pxBoundsToTileRange(pixelBounds),
                tileCenter = tileRange.getCenter(),
                queue = [],
                margin = this.options.keepBuffer,
                noPruneRange = new L.Bounds(tileRange.getBottomLeft().subtract([margin, -margin]), tileRange.getTopRight().add([margin, -margin]));

            // Sanity check: panic if the tile range contains Infinity somewhere.
            if (!(isFinite(tileRange.min.x) && isFinite(tileRange.min.y) && isFinite(tileRange.max.x) && isFinite(tileRange.max.y))) {
                throw new Error("Attempted to load an infinite number of tiles");
            }

            for (var key in this._icons) {
                var c = this._icons[key].coords;

                if (c.z !== this._tileZoom || !noPruneRange.contains(new L.Point(c.x, c.y))) {
                    this._icons[key].current = false;
                    this._removeIcons(key);
                }
            }

            // _update just loads more tiles. If the tile zoom level differs too much
            // from the map's, let _setView reset levels and prune old tiles.
            if (Math.abs(zoom - this._tileZoom) > 1) {
                this._setView(center, zoom);
                return;
            }

            // create a queue of coordinates to load icons for
            for (var j = tileRange.min.y; j <= tileRange.max.y; j++) {
                for (var i = tileRange.min.x; i <= tileRange.max.x; i++) {
                    var coords = new L.Point(i, j);
                    coords.z = this._tileZoom;
                    coords.plane = this._map.getPlane();

                    if (!this._isValidTile(coords)) {
                        continue;
                    }

                    var tile = this._icons ? this._icons[this._tileCoordsToKey(coords)] : undefined;
                    if (tile) {
                        tile.current = true;
                    } else {
                        var dataKey = this._tileCoordsToKey(coords);

                        if (this._icon_data && dataKey in this._icon_data) {
                            queue.push(coords);
                        }
                    }
                }
            }

            // Not really necessary for icons
            // sort tile queue to load tiles in order of their distance to center
            // queue.sort((a, b) => a.distanceTo(tileCenter) - b.distanceTo(tileCenter));

            if (queue.length !== 0) {
                // if it's the first batch of tiles to load
                if (!this._loading) {
                    this._loading = true;
                    // @event loading: Event
                    // Fired when the grid layer starts loading tiles.
                    this.fire("loading");
                }

                queue.forEach((coord) => this._addIcons(coord));
                this._loading = false;
            }
        },

        _isValidTile: function (coords) {
            return L.GridLayer.prototype._isValidTile.call(this, coords);
        },

        _keyToBounds: function (key) {
            return this._tileCoordsToBounds(this._keyToTileCoords(key));
        },

        _tileCoordsToNwSe: function (coords) {
            return L.GridLayer.prototype._tileCoordsToNwSe.call(this, coords);
        },

        // converts tile coordinates to its geographical bounds
        _tileCoordsToBounds: function (coords) {
            return L.GridLayer.prototype._tileCoordsToBounds.call(this, coords);
        },
        // converts tile coordinates to key for the tile cache
        _tileCoordsToKey: function (coords) {
            try {
                return (this.options.show3d ? 0 : coords.plane) + ":" + coords.x + ":" + coords.y;
            } catch {
                throw new Error("Error parsing " + JSON.stringify(coords));
            }
        },

        // converts tile cache key to coordinates
        _keyToTileCoords: function (key) {
            var k = key.split(":");

            return {
                plane: this.options.show3d ? 0 : +k[0],
                x: +k[1],
                y: +k[2],
            };
        },

        _removeIcons: function (key) {
            var icons = this._icons[key].icons;

            if (!icons) {
                return;
            }

            icons.forEach((item) => this._map.removeLayer(item));

            delete this._icons[key];

            // Fired when a group of icons is removed
            this.fire("iconunload", {
                coords: this._keyToTileCoords(key),
            });
        },

        _getTilePos: function (coords) {
            return L.GridLayer.prototype._getTilePos.call(this, coords);
        },

        getAverageLatLng: function (icons) {
            let latlngs = icons.map((icon) => icon.getLatLng());
            let lat = latlngs.map((latlng) => latlng.lat).reduce((a, b) => a + b, 0) / icons.length;
            let lng = latlngs.map((latlng) => latlng.lng).reduce((a, b) => a + b, 0) / icons.length;
            return new L.LatLng(lat, lng);
        },

        createIcon: function (item) {
            let icon = L.icon({
                iconUrl: "images/marker-icon.png",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41],
            });
            let greyscaleIcon = L.icon({
                iconUrl: "images/marker-icon-greyscale.png",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41],
            });

            let marker = L.marker([item.y + 0.5, item.x + 0.5], {
                icon: (item.p ?? item.plane) === this._map.getPlane() ? icon : greyscaleIcon,
            });

            this._map.on("planechange", function (e) {
                marker.setIcon((item.p ?? item.plane) === e.newPlane ? icon : greyscaleIcon);
            });

            let popUpText = Object.entries(item)
                .map((x) => x.map((i) => (typeof i !== "string" ? JSON.stringify(i) : i)).join(" = "))
                .join("<br>");
            marker.bindPopup(popUpText, {
                autoPan: false,
            });

            return marker;
        },

        createPopupBody: function (mode, map, item) {
            let wrapper = document.createElement("div");

            let nav = item.start && item.destination ? this.createNavigator(mode, map, item) : document.createElement("div");

            let info = document.createElement("div");
            info.innerHTML = Object.entries(item)
                .map((x) => x.map((i) => (typeof i !== "string" ? JSON.stringify(i) : i)).join(" = "))
                .join("<br>");

            wrapper.appendChild(nav);
            wrapper.appendChild(info);
            return wrapper;
        },

        _addIcons: function (coords) {
            //var tilePos = this._getTilePos(coords);
            var key = this._tileCoordsToKey(coords);
            var dataKey = this._tileCoordsToKey(coords);
            var data = this._icon_data[dataKey];
            var icons = [];

            data.forEach((item) => {
                var icon = this.createIcon(item);
                this._map.addLayer(icon);
                icons.push(icon);
            });
            this._icons[key] = {
                icons: icons,
                coords: coords,
                current: true,
            };
        },
    });

    L.dynamicIcons = function (options) {
        return new L.DynamicIcons(options);
    };

    L.Teleports = L.DynamicIcons.extend({
        options: {
            updateWhenIdle: L.Browser.mobile,
            updateWhenZooming: true,
            updateInterval: 200,
            zIndex: 1,
            bounds: null,
            minZoom: undefined,
            maxZoom: undefined,

            // @option nativeZoom: Number
            // The zoom level at which one tile corresponds to one unit of granularity of the icon data
            nativeZoom: 2,

            // @option nativeZoomTileSize: Number
            // Px size of one tile at nativeZoom. Use a number if width and height are equal, or ` L.point(width, height)` otherwise.
            nativeTileSize: 256,

            className: "",
            keepBuffer: 2,

            // @option filterFn: Function
            // Function applied by .filter() on icon data
            filterFn: undefined,

            // @option mapFn: Function
            // Function applied by .map() on icon data
            mapFn: undefined,

            // @option fanRadius: Number
            // Distance between fanned icons (a.k.a. sides of the n-sided polygon)
            fanRadius: 3,

            // @option fanZoom: Number
            // Enable fanning out at a zoom level at or greater than this
            fanZoom: 2,
        },

        //to be replaced by preprocessing the data like this
        parseData: function (data, watery) {
            let dataCollection = this.parseSheet(data)
                .map(this.parseItems.bind(this))
                .flatMap((group) => group.items)
                .filter(Boolean)
                .map((item) => {
                    item.plane = watery[item.x >> 6][item.y >> 6].includes((item.x << 14) + item.y) ? item.plane - 1 : item.plane;
                    if ("destination" in item) {
                        item.destination.plane = watery[item.destination.x >> 6][item.destination.y >> 6].includes((item.destination.x << 14) + item.destination.y)
                            ? item.destination.plane - 1
                            : item.destination.plane;
                    }
                    if ("start" in item) {
                        item.start.plane = watery[item.start.x >> 6][item.start.y >> 6].includes((item.start.x << 14) + item.start.y) ? item.start.plane - 1 : item.start.plane;
                    }
                    return item;
                });

            let transits = dataCollection.filter((item) => "start" in item && "destination" in item);
            let transits_a = transits.map((item) =>
                Object.assign(
                    {
                        ...item,
                    },
                    item.start,
                    {
                        mode: "start",
                    }
                )
            );
            let transits_b = transits.map((item) =>
                Object.assign(
                    {
                        ...item,
                    },
                    item.destination,
                    {
                        mode: "destination",
                    }
                )
            );

            let teleports = dataCollection.filter((item) => !("start" in item) && "destination" in item && !("type" in item));
            teleports.forEach((item) => (item.type = "teleport"));
            teleports.forEach((item) => (item = Object.assign(item, item.destination)));

            let all_icons = [...transits_a, ...transits_b, ...teleports];

            all_icons.forEach((item) => (item.watery = watery[item.x >> 6][item.y >> 6].includes((item.x << 14) + item.y)));

            all_icons.forEach(
                (item) =>
                    (item.key = this._tileCoordsToKey({
                        plane: item.plane,
                        x: item.x >> 6,
                        y: -(item.y >> 6),
                    }))
            );

            all_icons.forEach((item) => {
                let json = JSON.stringify(item).toLowerCase();
                if (json.includes("template") || json.includes("instance")) {
                    item.actuallyInstance = true;
                }
            });

            all_icons.forEach((item) => this.getIconUrl(item));

            if (this.options.filterFn) {
                all_icons = all_icons.filter((item) => this.options.filterFn(item));
            }

            if (this.options.mapFn) {
                all_icons = all_icons.map((item) => this.options.mapFn(item));
            }

            let icon_data = {};
            all_icons.forEach((item) => {
                if (!(item.key in icon_data)) {
                    icon_data[item.key] = [];
                }
                icon_data[item.key].push(item);
            });

            console.info("Parsed", all_icons.length, "icons");
            return icon_data;
        },

        getIconUrl: function (item) {
            let filename = item.icon ? item.icon.trim() + ".png" : undefined;
            if (filename) {
                var hash = MD5.md5(filename);
                item.iconUrl = "https://runescape.wiki/images/" + hash.substr(0, 1) + "/" + hash.substr(0, 2) + "/" + filename;
            } else if (item.actuallyInstance) {
                item.iconUrl = "sprites/31407-0.png";
            } else if (JSON.stringify(item).includes("agility") || JSON.stringify(item).includes("Agility")) {
                //shortcut icon
                item.iconUrl = "sprites/20763-0.png";
            } else {
                //travel icon
                item.iconUrl = "sprites/20764-0.png";
            }
        },

        onAdd: function (map) {
            // eslint-disable-line no-unused-vars
            if (this.options.API_KEY && this.options.SHEET_ID) {
                const dataPromise = fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.options.SHEET_ID}/values/A:Z?key=${this.options.API_KEY}`).then((response) =>
                    response.ok ? response.json().then((sheet) => sheet.values) : response.json().then((oopsie) => Promise.reject(new Error(oopsie.error.message)).then(() => {}, console.error))
                );

                const wateryPromise = fetch(`data_rs3/keyed_watery.json`)
                    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status + " Error fetching " + response.url))))
                    .catch(console.error);

                const allData = Promise.all([dataPromise, wateryPromise]);

                allData.then((responses) => {
                    if (this._map && !responses.includes(undefined)) {
                        this._icon_data = this.parseData(...responses);
                        this._icons = {};
                        this._resetView();
                        this._update();
                    }
                });

                allData.catch(console.error);
            } else {
                throw new Error("No API_KEY and/or SHEET_ID specified");
            }
        },

        onRemove() {
            this.fanEvents.removeAll();
            return L.DynamicIcons.prototype.onRemove.call(this);
        },

        applyFanOut: function (original_marker, marker, zoom) {
            let bounds = original_marker.getLatLng();
            return marker._item.type === "teleport" && marker.fanned !== true && marker.getLatLng().equals(bounds, 1.5 * 2 ** (4 - zoom));
        },

        fanOut: function (original_marker) {
            let zoom = this._map.getZoom();
            if (original_marker.fanned === true || zoom < this.options.fanZoom) {
                return;
            }
            let key = original_marker._item.key;
            let affectedIcons = this._icons[key].icons.filter((marker) => this.applyFanOut(original_marker, marker, zoom));

            let nSides = affectedIcons.length;
            if (nSides < 2) {
                return;
            }

            let radius = (2 ** (4 - zoom) * this.options.fanRadius) / (2 * Math.sin(Math.PI / nSides));

            let polygonPoints = Array.from(Array(nSides).keys(), (x, index) => ({
                lng: radius * Math.sin((2 * index * Math.PI) / nSides),
                lat: radius * Math.cos((2 * index * Math.PI) / nSides),
            }));
            let polygonCenter = this.getAverageLatLng(affectedIcons);

            affectedIcons.forEach((marker, index) => this.fan(polygonCenter, marker, polygonPoints[index]));

            let eventFn = (e) => this.checkUnFan(e, polygonCenter, radius, eventFn, () => this.unFanAll(affectedIcons));

            this._map.on("mousemove", eventFn);
            this.fanEvents.current.push({
                obj: this._map,
                ev: "mousemove",
                fn: eventFn,
            });
        },

        fanEvents: {
            current: [],
            remove: function (obj, ev, fn) {
                let index = this.current.findIndex((element) => element.obj === obj && element.ev === ev && element.fn === fn);
                obj.off(ev, fn);
                if (index !== -1) {
                    this.current.splice(index, 1);
                }
            },
            removeAll: function () {
                this.current.forEach((item) => item.obj.off(item.ev, item.fn));
                this.current.length = 0;
            },
        },

        checkUnFan(e, polygonCenter, radius, eventFn, unFanFn) {
            if (this._map.options.crs.distance(e.latlng, polygonCenter) > 1.5 * radius) {
                this.fanEvents.remove(this._map, "mousemove", eventFn);
                unFanFn();
            }
        },

        getAverageLatLng: function (icons) {
            let latlngs = icons.map((icon) => icon.getLatLng());
            let lat = latlngs.map((latlng) => latlng.lat).reduce((a, b) => a + b, 0) / icons.length;
            let lng = latlngs.map((latlng) => latlng.lng).reduce((a, b) => a + b, 0) / icons.length;
            return new L.LatLng(lat, lng);
        },

        unFanAll: function (affectedIcons) {
            affectedIcons.forEach((marker) => {
                this.unFan(marker);
            });
        },

        fan: function (polygonCenter, marker, transform) {
            marker.cachedPosition = marker.getLatLng();

            marker.fanned = true;
            marker.setLatLng([polygonCenter.lat + transform.lat, polygonCenter.lng + transform.lng]);
        },

        unFan: function (marker) {
            if (marker) {
                marker.setLatLng(marker.cachedPosition);
                marker.fanned = false;
            }
        },

        createIcon: function (item) {
            let destinationMarker;
            if (item.iconUrl) {
                let teleclass = item.type === "teleport" ? " teleport-icon" : "";
                var thisIcon = L.divIcon({
                    html: '<img class="map-icon plane-' + item.plane + teleclass + '" src="' + item.iconUrl + '" alt="' + item.name + '">',
                    iconSize: [0, 0], //default marker is a 12x12 white box, this makes it not appear
                });
                destinationMarker = L.marker([item.y + 0.4 + 0.2 * Math.random(), item.x + 0.4 + 0.2 * Math.random()], {
                    icon: thisIcon,
                    alt: item.name,
                    riseOnHover: true,
                });
            } else {
                destinationMarker = L.marker([item.y + 0.5, item.x + 0.5]);
            }

            let popUpBody = this.createPopupBody(item.mode, this._map, item);
            destinationMarker.bindPopup(popUpBody);

            destinationMarker
                .bindTooltip(item.name + (item.Keybind ? "<br>Keybind: " + item.Keybind : ""), {
                    direction: "top",
                    offset: [0, -10],
                })
                .openTooltip();

            if (item.type === "teleport") {
                destinationMarker.once("mouseover", () => {
                    this.fanOut(destinationMarker);
                });

                destinationMarker.on("mouseout", () => {
                    //Prevent mouseover event from firing continuously if/when the icon changes
                    destinationMarker.once("mouseover", () => {
                        this.fanOut(destinationMarker);
                    });
                });
            }

            if ("start" in item && "destination" in item) {
                destinationMarker.on("mouseover", function () {
                    let points = [
                        [item.start.y + 0.5, item.start.x + 0.5],
                        [item.destination.y + 0.5, item.destination.x + 0.5],
                    ];
                    let travel = L.polyline(points, {
                        color: "white",
                    });
                    this._map.addLayer(travel);
                    window.setTimeout(travel.remove.bind(travel), 60000);
                });
            }
            destinationMarker._item = item;

            return destinationMarker;
        },

        createPopupBody: function (mode, map, item) {
            let wrapper = document.createElement("div");

            let nav = item.start && item.destination ? this.createNavigator(mode, map, item) : document.createElement("div");

            let info = document.createElement("div");
            info.innerHTML = Object.entries(item)
                .map((x) => x.map((i) => (typeof i !== "string" ? JSON.stringify(i) : i)).join(" = "))
                .join("<br>");

            wrapper.appendChild(nav);
            wrapper.appendChild(info);
            return wrapper;
        },

        _addIcons: function (coords) {
            var key = this._tileCoordsToKey(coords);
            var dataKey = this._tileCoordsToKey(coords);
            var data = this._icon_data[dataKey];
            var icons = [];

            data.forEach((item) => {
                var icon = this.createIcon(item);
                this._map.addLayer(icon);
                icons.push(icon);
            });
            this._icons[key] = {
                icons: icons,
                coords: coords,
                current: true,
            };
        },
        createNavigator: function (mode, map, item) {
            let newButton = document.createElement("button");
            newButton.innerHTML = "Navigate to link";
            newButton.onclick = function () {
                var plane;
                var x;
                var y;

                switch (mode) {
                    case "start":
                        ({ plane, x, y } = item.destination);
                        break;
                    case "destination":
                        ({ plane, x, y } = item.start);
                        break;
                    default:
                        throw mode + " is not an expected value!";
                }
                console.info("navigating to", plane, x, y);
                map.setPlane(plane);
                map.flyTo([y, x], 3, {
                    duration: 3,
                });
            };
            return newButton;
        },
        detectNewHeader: function (row, previousRow) {
            if (typeof previousRow !== undefined && previousRow.length === 0) {
                if (typeof row !== undefined && row.length > 1) {
                    return true;
                }
            }
            return false;
        },
        parseSheet: function (sheet) {
            let keys;
            let groupName;

            let group = [];
            sheet.forEach((row, rowNumber, array) => {
                let previousRow = array[rowNumber - 1] ?? [];

                if (this.detectNewHeader(row, previousRow)) {
                    keys = row;
                    groupName = row[0];
                    row[0] = "name";
                    let newGroup = {
                        rowNumber: rowNumber,
                        groupName: groupName,
                        items: [],
                    };
                    group.push(newGroup);
                    return;
                }
                if (groupName && row.length !== 0) {
                    let item = {};
                    item.rowNumber = rowNumber + 1; //starting at 1
                    item.groupName = groupName;
                    keys.forEach((key, colNumber) => {
                        item[key] = row[colNumber];
                    });
                    group[group.length - 1].items.push(item);
                    //console.log(rowNumber,row);
                }

                //console.log(name, keys);
            });
            return group;
        },

        parseItems: function (group) {
            //console.log(group);
            group.items = group.items.map((item) => {
                let endPos = item["Pos (End)"] ?? item["Pos"];
                let endLook = item["Look (End)"] ?? item["Look"];
                if (!endPos || !endLook || endPos === "-" || endLook === "-") {
                    return;
                }
                let destination = this.parseCoord(item, endPos, endLook);
                item.destination = destination;

                let startPos = item["Pos (Start)"] ?? item["Pos"];
                let startLook = item["Look (Start)"] ?? item["Look"];
                if (startPos && startLook && startPos !== "-" && startPos !== "" && startLook !== "-" && startLook !== "" && (startPos !== endPos || startLook !== endLook)) {
                    let start = this.parseCoord(item, startPos, startLook);
                    item.start = start;
                }

                return item;
            });

            return group;
        },

        parseCoord: function (item, pos, look) {
            let _plane = Number(pos);

            try {
                var [, _i, _j, _x, _y, ...rest] = look.match(/\d+/g).map(Number);
            } catch (error) {
                throw new Error("error parsing", JSON.stringify(item));
            }
            if ([_i, _j, _x, _y].includes(undefined) || rest.length !== 0) {
                console.warn(look, "is not a proper coordinate");
            }

            if (_i > 100 || _j >> 200 || _x > 63 || _y > 63) {
                console.warn(look, "is outside the bounds of the map");
            }

            let destination = {
                plane: _plane,
                x: (_i << 6) | _x,
                y: (_j << 6) | _y,
            };

            return destination;
        },
    });

    // @factory L.teleports(options?: Teleports options)
    // Creates a new instance of Teleports with the supplied options.
    L.teleports = function (options) {
        return new L.Teleports(options);
    };

    L.CustomParseTeleports = L.Teleports.extend({
        onAdd: function (map) {
            // eslint-disable-line no-unused-vars
            if (this.options.API_KEY && this.options.SHEET_ID) {
                const dataPromise = fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.options.SHEET_ID}/values/A:Z?key=${this.options.API_KEY}`).then((response) =>
                    response.ok ? response.json().then((sheet) => sheet.values) : response.json().then((e) => Promise.reject(new Error(e.error.message)).then(() => {}, console.error))
                );

                Promise.all([dataPromise])
                    .then((responses) => {
                        if (!responses.includes(undefined)) {
                            this._icon_data = this.options.parseFn(...responses);
                            this._icons = {};
                            this._resetView();
                            this._update();
                        }
                    })
                    .catch(console.error);
            } else {
                throw new Error("No API_KEY and/or SHEET_ID specified");
            }
        },

        createIcon: function (item) {
            let icon =
                item.plane === this._map.getPlane()
                    ? L.icon({
                          iconUrl: "images/marker-icon.png",
                          iconSize: [25, 41],
                          iconAnchor: [12, 41],
                          popupAnchor: [1, -34],
                          tooltipAnchor: [16, -28],
                          shadowSize: [41, 41],
                      })
                    : L.icon({
                          iconUrl: "images/marker-icon-greyscale.png",
                          iconSize: [25, 41],
                          iconAnchor: [12, 41],
                          popupAnchor: [1, -34],
                          tooltipAnchor: [16, -28],
                          shadowSize: [41, 41],
                      });

            var destinationMarker = L.marker([item.y + 0.4 + 0.2 * Math.random(), item.x + 0.4 + 0.2 * Math.random()], {
                icon: icon,
                riseOnHover: true,
            });

            let popUpBody = this.createPopupBody(item.mode, this._map, item);
            destinationMarker.bindPopup(popUpBody);

            if ("start" in item && "destination" in item) {
                destinationMarker.once("mouseover", function () {
                    let points = [
                        [item.start.y + 0.5, item.start.x + 0.5],
                        [item.destination.y + 0.5, item.destination.x + 0.5],
                    ];
                    let travel = L.polyline(points, {
                        color: "white",
                    });
                    this._map.addLayer(travel);
                    window.setTimeout(function () {
                        travel.remove();
                    }, 20000);
                });

                destinationMarker.on("mouseout", function () {
                    //Prevent mouseover event from firing continuously if/when the icon changes
                    destinationMarker.once("mouseover", function () {
                        let points = [
                            [item.start.y + 0.5, item.start.x + 0.5],
                            [item.destination.y + 0.5, item.destination.x + 0.5],
                        ];
                        let travel = L.polyline(points, {
                            color: "white",
                        });
                        this._map.addLayer(travel);
                        window.setTimeout(function () {
                            travel.remove();
                        }, 60000);
                    });
                });
            }
            destinationMarker._item = item;

            return destinationMarker;
        },

        _tileCoordsToKey: function (coords) {
            try {
                return coords.x + ":" + coords.y;
            } catch {
                throw new Error("Error parsing " + JSON.stringify(coords));
            }
        },

        // converts tile cache key to coordinates
        _keyToTileCoords: function (key) {
            var k = key.split(":");
            var coords = {
                x: +k[1],
                y: +k[2],
            };
            return coords;
        },
    });

    L.customParseTeleports = function (options) {
        return new L.CustomParseTeleports(options);
    };

    let rect = L.DivIcon.extend({
        options: {
            iconSize: new L.Point(8, 8),
        },
    });
    L.CrowdSourceMovement = L.DynamicIcons.extend({
        onAdd: function (map) {
            // eslint-disable-line no-unused-vars
            if (this.options.data === undefined) {
                throw new Error("Location of data file not given");
            }

            fetch(this.options.data)
                .then((res) => res.json())
                .then((data) => {
                    this._icon_data = this.parseData(data);
                    this._icons = {};
                    this._resetView();
                    this._update();
                })
                .catch(console.error);
        },

        parseData: function (data) {
            function average(nums) {
                return nums.reduce((a, b) => a + b) / nums.length;
            }
            data.forEach((item) => {
                if (item.type === "TRANSPORT") {
                    Object.assign(item, item.start);
                } else if (item.type === "TELEPORT") {
                    let averageDest = {
                        p: average(item.destinations.map((item) => item.p ?? item.plane)),
                        x: average(item.destinations.map((item) => item.x)),
                        y: average(item.destinations.map((item) => item.y)),
                    };
                    if (!Number.isInteger(averageDest.p)) {
                        console.log(item);
                        throw new Error("averaged plane is not integer");
                    }
                    Object.assign(item, averageDest);
                } else {
                    Object.assign(item, item.start);
                }
            });

            data.forEach(
                (item) =>
                    (item.key = this._tileCoordsToKey({
                        plane: item.p ?? item.plane,
                        x: item.x >> 6,
                        y: -(item.y >> 6),
                    }))
            );

            let icon_data = {};
            data.forEach((item) => {
                if (!(item.key in icon_data)) {
                    icon_data[item.key] = [];
                }
                icon_data[item.key].push(item);
            });
            console.info("Parsed", data.length, "icons");
            return icon_data;
        },
        createIcon: function (item) {
            if (item.type === "TRANSPORT") {
                return this.createTransportIcon(item);
            } else if (item.type === "TELEPORT") {
                return this.createTeleportIcon(item);
            } else {
                return this.createTransportIcon(item);
            }
        },

        createTeleportIcon: function (item) {
            let teleportMarker = L.marker([item.y + 0.5, item.x + 0.5]);

            if ("destinations" in item) {
                teleportMarker.on("mouseover", () => {
                    item.destinations.forEach((destination) => {
                        let VertexIcon = L.DivIcon.extend({
                            options: {
                                iconSize: new L.Point(8, 8),
                            },
                        });
                        let destmarker = L.marker([destination.y + 0.5, destination.x + 0.5], {
                            icon: new VertexIcon(),
                        }).addTo(this._map);
                        window.setTimeout(destmarker.remove.bind(destmarker), 60000);
                        let points = [
                            [item.y + 0.5, item.x + 0.5],
                            [destination.y + 0.5, destination.x + 0.5],
                        ];
                        let travel = L.polyline(points, {
                            color: "white",
                        });
                        this._map.addLayer(travel);
                        window.setTimeout(travel.remove.bind(travel), 60000);
                        travel.on("click", () => {
                            this._map.setPlane(destination.p);
                            this._map.flyTo([destination.y + 0.5, destination.x + 0.5]);
                        });
                    });
                });
            }
            let popUp = this.createPopup(item.mode, this._map, item);
            teleportMarker.bindPopup(popUp);

            teleportMarker._item = item;

            return teleportMarker;
        },

        createTransportIcon: function (item) {
            var icon = new L.Icon.Default();
            icon.options.shadowSize = [0, 0];

            let startMarker = L.marker([item.y + 0.5, item.x + 0.5], {
                icon: icon,
            });

            let popUp = this.createPopup(item.mode, this._map, item);
            startMarker.bindPopup(popUp);

            if ("destinations" in item) {
                startMarker.on("mouseover", () => {
                    item.destinations.forEach((destination) => {
                        let VertexIcon = L.DivIcon.extend({
                            options: {
                                iconSize: new L.Point(8, 8),
                            },
                        });
                        let destmarker = L.marker([destination.y + 0.5, destination.x + 0.5], {
                            icon: new VertexIcon(),
                        }).addTo(this._map);
                        window.setTimeout(destmarker.remove.bind(destmarker), 60000);

                        let points = [
                            [item.start.y + 0.5, item.start.x + 0.5],
                            [destination.y + 0.5, destination.x + 0.5],
                        ];

                        let travel = L.polyline(points, {
                            color: "white",
                        });
                        this._map.addLayer(travel);
                        window.setTimeout(travel.remove.bind(travel), 60000);
                        travel.on("click", () => {
                            this._map.setPlane(destination.p);
                            this._map.flyTo([destination.y + 0.5, destination.x + 0.5]);
                        });
                    });
                });
            }
            startMarker._item = item;

            return startMarker;
        },

        getIconUrl: function (name) {
            let hash = MD5.md5(`${name}.png`);
            let iconUrl = `https://runescape.wiki/images/${hash.substr(0, 1)}/${hash.substr(0, 2)}/${name}.png`;
            return iconUrl;
        },

        createPopup: function (mode, map, item) {
            let wrapper = document.createElement("div");

            let nav = item.from_coordinate && item.to_coordinate ? this.createNavigator(mode, map, item) : document.createElement("div");

            let info = document.createElement("div");
            info.innerHTML = Object.entries(item)
                .map((x) => x.map((i) => (typeof i !== "string" ? JSON.stringify(i) : i)).join(" = "))
                .join("<br>");

            wrapper.appendChild(nav);
            wrapper.appendChild(info);
            let popup = L.popup({
                autoPan: false,
            }).setContent(wrapper);
            return popup;
        },
        createNavigator: function (mode, map, item) {
            let newButton = document.createElement("button");
            newButton.innerHTML = "Navigate to link";
            newButton.onclick = function () {
                console.info("navigating to", item.to_coordinate.p, item.to_coordinate.x, item.to_coordinate.y);
                map.setPlane(item.to_coordinate.p);
                map.setView([item.to_coordinate.y, item.to_coordinate.x]);
            };
            return newButton;
        },
    });

    L.crowdSourceMovement = function (options) {
        return new L.CrowdSourceMovement(options);
    };

    L.Varbit = L.DynamicIcons.extend({
        onAdd: function (map) {
            // eslint-disable-line no-unused-vars
            let url;
            console.log(this.options);
            if (this.options.varp !== undefined && this.options.varp !== "") {
                url = this.options.varvalue
                    ? `https://chisel.weirdgloop.org/varbs/mapdata?varplayer=${this.options.varp}&varvalue=${this.options.varvalue}`
                    : `https://chisel.weirdgloop.org/varbs/mapdata?varplayer=${this.options.varp}`;
            } else if (this.options.varbit !== undefined && this.options.varbit !== "") {
                url = this.options.varvalue
                    ? `https://chisel.weirdgloop.org/varbs/mapdata?varbit=${this.options.varbit}&varvalue=${this.options.varvalue}`
                    : `https://chisel.weirdgloop.org/varbs/mapdata?varbit=${this.options.varbit}`;
            } else {
                throw new Error("No varp/varbit specified");
            }
            fetch(url)
                .then((res) => res.json())
                .then((data) => {
                    this._icon_data = this.parseData(data);
                    this._icons = {};
                    this._resetView();
                    this._update();
                })
                .catch(console.error);
        },

        parseData: function (data) {
            let linear_data = data.map((item) => Object.assign(item, item.location));

            linear_data.forEach(
                (item) =>
                    (item.key = this._tileCoordsToKey({
                        plane: item.p ?? item.plane,
                        x: item.x >> 6,
                        y: -(item.y >> 6),
                    }))
            );

            let icon_data = {};
            linear_data.forEach((item) => {
                if (!(item.key in icon_data)) {
                    icon_data[item.key] = [];
                }
                icon_data[item.key].push(item);
            });

            let reallyLoadEverything = linear_data.length < 10000 ? true : confirm(`Really load ${linear_data.length} markers?`);
            if (reallyLoadEverything) {
                this._map.addMessage(`Found ${linear_data.length} locations of this varp/varbit.`);
                return icon_data;
            } else {
                return [];
            }
        },
    });

    L.varbit = function (options) {
        return new L.Varbit(options);
    };
});
