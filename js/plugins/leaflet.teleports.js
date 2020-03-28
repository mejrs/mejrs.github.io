L.Teleports = L.Layer.extend({
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

            className: '',
            keepBuffer: 2,
            filterFn: undefined,
            mapFn: undefined,
            fanRadius: 3,
            fanZoom: 2
        },

        initialize: function (options) {
            L.setOptions(this, options);
        },

        //to be replaced by preprocessing the data like this
        _parseData: function (data) {
            let collection = parseSheet(data.values).map(parseItems);
            let le_map = collection.flatMap(group => group.items).filter(item => item !== undefined);

            let transits = le_map.filter(item => "start" in item && "destination" in item);
            let transits_a = transits.map(item => Object.assign({
                        ...item
                    }, item.start));
            let transits_b = transits.map(item => Object.assign({
                        ...item
                    }, item.destination));

            transits_a.forEach(item => item.mode = "start");
            transits_b.forEach(item => item.mode = "destination");

            let teleports = le_map.filter(item => !("start" in item) && "destination" in item && !("type" in item));
            teleports.forEach(item => item.type = "teleport");
            teleports.forEach(item => item = Object.assign(item, item.destination));

            let all_icons = Array.prototype.concat.call(transits_a, transits_b, teleports);

            all_icons.forEach(item => item.key = this._tileCoordsToKey({
                        plane: item.plane,
                        x: (item.x >> 6),
                        y:  - (item.y >> 6)
                    }));
            all_icons.forEach(item => this.getIconUrl(item));

            if (this.options.filterFn) {
                all_icons = all_icons.filter(item => this.options.filterFn(item));
            }

            if (this.options.mapFn) {
                all_icons = all_icons.map(item => this.options.mapFn(item));
            }

            let icon_data = {};
            all_icons.forEach(item => {
                if (!(item.key in icon_data)) {
                    icon_data[item.key] = [];
                }
                icon_data[item.key].push(item);
            });
            console.log("parsed", all_icons.length, "icons");
            return icon_data;
        },

        getIconUrl: function (item) {
            let filename = item.icon ? item.icon.trim() + ".png" : undefined;
            if (filename) {
                var hash = MD5.md5(filename);
                item.iconUrl = 'https://runescape.wiki/images/' + hash.substr(0, 1) + '/' + hash.substr(0, 2) + '/' + filename;

            } else if (JSON.stringify(item).includes("agility") || JSON.stringify(item).includes("Agility")) {
                item.iconUrl = '../mejrs.github.io/layers/sprites/20763-0.png';
            } else {
                item.iconUrl = '../mejrs.github.io/layers/sprites/20764-0.png';
            }
        },

        onAdd: function (map) {
            if (this.options.API_KEY && this.options.SHEET_ID) {
                let url = `https://sheets.googleapis.com/v4/spreadsheets/${this.options.SHEET_ID}/values/A:Z?key=${this.options.API_KEY}`;
                const dataPromise = fetch(url);
                dataPromise.then(response => response.json()).then(data => {
                    if ("error" in data) {
                        throw new Error(data.error.message);
                    }

                    this._icon_data = this._parseData(data);
                    this._icons = {};
                    this._resetView();
                    this._update();

                });

            } else {
                throw new Error("No API_KEY and/or SHEET_ID specified");
            }
        },

        onRemove: function (map) {
            this._removeAllIcons();
            this._tileZoom = undefined;
        },

        // @method setZIndex(zIndex: Number): this
        // Changes the [zIndex](#gridlayer-zindex) of the grid layer.
        setZIndex: function (zIndex) {
            return L.GridLayer.prototype.setZIndex.call(this);
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

            var key,
            icons;

            var zoom = this._map.getZoom();
            if (zoom > this.options.maxZoom ||
                zoom < this.options.minZoom) {
                this._removeAllIcons();
                return;
            }

            for (key in this._icons) {
                icons = this._icons[key];
                icons.retain = icons.current;
            }

            for (key in this._icons) {
                tile = this._icons[key];
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

        _clampZoom: function (zoom) {
            return this.options.nativeZoom;
        },

        _setView: function (center, zoom, noPrune, noUpdate) {
            var tileZoom = this._clampZoom(Math.round(zoom));

            if ((this.options.maxZoom !== undefined && zoom > this.options.maxZoom) ||
                (this.options.minZoom !== undefined && zoom < this.options.minZoom)) {
                tileZoom = undefined;
            }

            var tileZoomChanged = this.options.updateWhenZooming && (tileZoom !== this._tileZoom);
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
            return new L.Bounds(
                bounds.min.unscaleBy(tileSize).floor(),
                bounds.max.unscaleBy(tileSize).ceil());
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
            var zoom = this._clampZoom(map.getZoom());

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
            noPruneRange = new L.Bounds(tileRange.getBottomLeft().subtract([margin, -margin]),
                    tileRange.getTopRight().add([margin, -margin]));

            // Sanity check: panic if the tile range contains Infinity somewhere.
            if (!(isFinite(tileRange.min.x) &&
                    isFinite(tileRange.min.y) &&
                    isFinite(tileRange.max.x) &&
                    isFinite(tileRange.max.y))) {
                throw new Error('Attempted to load an infinite number of tiles');
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

                        if (this._icon_data && this._icon_data.hasOwnProperty(dataKey)) {
                            queue.push(coords);
                        }
                    }
                }
            }

            // sort tile queue to load tiles in order of their distance to center
            queue.sort((a, b) => a.distanceTo(tileCenter) - b.distanceTo(tileCenter));

            if (queue.length !== 0) {
                // if it's the first batch of tiles to load
                if (!this._loading) {
                    this._loading = true;
                    // @event loading: Event
                    // Fired when the grid layer starts loading tiles.
                    this.fire('loading');
                }

                queue.forEach(coord => this._addIcons(coord));
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
            return coords.plane + ':' + coords.x + ':' + coords.y;

        },

        // converts tile cache key to coordinates
        _keyToTileCoords: function (key) {

            var k = key.split(':');
            var coords = {
                plane: +k[0],
                x: +k[1],
                y: +k[2]
            };
            return coords;
        },

        _removeIcons: function (key) {
            var icons = this._icons[key].icons;

            if (!icons) {
                return;
            }

            icons.forEach(item => this._map.removeLayer(item));

            delete this._icons[key];

            // Fired when a group of icons is removed
            this.fire('iconunload', {
                coords: this._keyToTileCoords(key)
            });
        },

        _getTilePos: function (coords) {
            return coords;
        },

        applyFanOut: function (original_marker, marker, zoom) {
            let bounds = original_marker.getLatLng();
            return marker._item.type === "teleport" && marker.fanned !== true && marker.getLatLng().equals(bounds, 1.5*2**(4-zoom));
        },

        fanOut: function (original_marker) {
			let zoom = this._map.getZoom();
            if (original_marker.fanned === true || zoom < this.options.fanZoom) {
                return
            }
            let key = original_marker._item.key
                let affectedIcons = this._icons[key].icons.filter(marker => this.applyFanOut(original_marker, marker, zoom));

            let nSides = affectedIcons.length;
            if (nSides < 2) {
                return;
            }
			
            let radius = 2**(4-zoom) * this.options.fanRadius / (2 * Math.sin(Math.PI / nSides));

            let a = Array.from(Array(nSides).keys(), (x, index) => ({
                        lng: radius * Math.sin(2 * index * Math.PI / nSides),
                        lat: radius * Math.cos(2 * index * Math.PI / nSides)
                    }));
            let oPos = this.getAverageLatLng(affectedIcons);
			
            affectedIcons.forEach((marker, index) => this.fan(oPos, marker, a[index]));
			
			let eventFn = (e) => this.checkUnFan(e, oPos, radius, eventFn, () => this.unFanAll(affectedIcons));
			
			this._map.on('mousemove', eventFn);
			
        },
		
		checkUnFan(e, oPos, radius, eventFn, unFanFn){
			if (this._map.options.crs.distance(e.latlng, oPos) > 1.5*radius){
				this._map.off('mousemove', eventFn);
				unFanFn();
			};
			
		},
		
		getAverageLatLng: function (icons){
			let latlngs = icons.map(icon => icon.getLatLng());
			let lat = latlngs.map(latlng => latlng.lat).reduce((a, b) => a + b, 0)/icons.length;
			let lng = latlngs.map(latlng => latlng.lng).reduce((a, b) => a + b, 0)/icons.length;
			return new L.LatLng(lat, lng)
		},
		
		unFanAll: function (affectedIcons){
			 affectedIcons.forEach(marker => {
                    this.unFan(marker);
                    marker.fanned = false;
                })
		},

        fan: function (oPos, marker, transform) {

            marker.cachedPosition = marker.getLatLng();

            marker.fanned = true;
            marker.setLatLng([oPos.lat + transform.lat, oPos.lng + transform.lng]);

        },

        unFan: function (marker) {
            if (marker) {
                marker.setLatLng(marker.cachedPosition);
            }
        },

        createIcon: function (item) {
            let this_controller = this;
            if (item.iconUrl) {
                let teleclass = (item.type === 'teleport') ? ' teleport-icon' : '';
                var thisIcon = L.divIcon({
                        html: '<img class="map-icon plane-' + item.plane + teleclass + '" src="' + item.iconUrl + '" alt="' + item.name + '">',
                        iconSize: [0, 0]//default marker is a 12x12 white box, this makes it not appear
                    });
                var destinationMarker = L.marker([item.y + 0.5, item.x + 0.5], {
                        icon: thisIcon,
                        alt: item.name,
                        riseOnHover: true
                    });

            } else {
                var destinationMarker = L.marker([item.y + 0.5, item.x + 0.5])
            }

            let popUpBody = this.createPopupBody(item.mode, this._map, item);
            destinationMarker.bindPopup(popUpBody);

            destinationMarker.bindTooltip(item.name + (item.Keybind ? '<br>Keybind: ' + item.Keybind : ''), {
                direction: "top",
                offset: [0, -10]
            }).openTooltip();

            if (item.type === "teleport") {
                destinationMarker.once('mouseover', function () {
                    this_controller.fanOut(destinationMarker);
                });

                destinationMarker.on('mouseout', function () {
                    //Prevent mouseover event from firing continuously if/when the icon changes
                    destinationMarker.once('mouseover', function () {
                        this_controller.fanOut(destinationMarker);

                    });
                });
            }

            if ("start" in item && "destination" in item) {
                destinationMarker.once('mouseover', function () {
                    let points = [[item.start.y + 0.5, item.start.x + 0.5], [item.destination.y + 0.5, item.destination.x + 0.5]];
                    let travel = L.polyline(points, {
                            color: 'white'
                        });
                    this._map.addLayer(travel);
                    window.setTimeout(function () {
                        travel.remove()
                    }, 20000)

                });

                destinationMarker.on('mouseout', function () {
                    //Prevent mouseover event from firing continuously if/when the icon changes
                    destinationMarker.once('mouseover', function () {
                        let points = [[item.start.y + 0.5, item.start.x + 0.5], [item.destination.y + 0.5, item.destination.x + 0.5]];
                        let travel = L.polyline(points, {
                                color: 'white'
                            });
                        this._map.addLayer(travel);
                        window.setTimeout(function () {
                            travel.remove()
                        }, 20000)

                    });
                });
            }
            destinationMarker._item = item;

            return destinationMarker;
        },

        createPopupBody: function (mode, map, item) {
            let wrapper = document.createElement('div');

            let nav = (item.start && item.destination) ? this.createNavigator(mode, map, item) : document.createElement('div');

            let info = document.createElement('div');
            info.innerHTML = Object.entries(item).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");

            wrapper.appendChild(nav);
            wrapper.appendChild(info);
            return wrapper;
        },

        _addIcons: function (coords) {

            var tilePos = this._getTilePos(coords);
            var key = this._tileCoordsToKey(coords);
            var dataKey = this._tileCoordsToKey(coords);
            var data = this._icon_data[dataKey];
            var icons = [];

            data.forEach(item => {

                var icon = this.createIcon(item);
                this._map.addLayer(icon);
                icons.push(icon);

            });
            this._icons[key] = {
                icons: icons,
                coords: coords,
                current: true
            };
        },
        createNavigator: function (mode, map, item) {

            let newButton = document.createElement("button");
            newButton.innerHTML = "Navigate to link";
            newButton.onclick = function () {
                switch (mode) {
                case 'start':
                    var {
                        plane,
                        x,
                        y
                    } = item.destination;
                    break;
                case 'destination':
                    var {
                        plane,
                        x,
                        y
                    } = item.start;
                    break;
                default:
                    throw mode + " is not an expected value!";
                    break;
                }
                console.log("navigating to", plane, x, y);
                map.setPlane(plane);
                map.flyTo([y, x], 3, {
                    duration: 3
                })
            };
            return newButton;
        },
    });

// @factory L.teleports(options?: Teleports options)
// Creates a new instance of Teleports with the supplied options.
L.teleports = function (options) {
    return new L.Teleports(options);
}

function detectNewHeader(row, previousRow) {

    if (typeof previousRow !== undefined && previousRow.length === 0) {
        if (typeof row !== undefined && row.length > 1) {
            return true;
        }

    }
    return false;
}

function parseSheet(sheet) {
    let keys;
    let groupName;

    let group = [];
    sheet.forEach((row, rowNumber, array) => {
        let previousRow = array[rowNumber - 1] ?? [];

        if (detectNewHeader(row, previousRow)) {

            keys = row;
            groupName = row[0];
            row[0] = "name";
            let newGroup = {
                rowNumber: rowNumber,
                groupName: groupName,
                items: []
            };
            group.push(newGroup);

            //console.log(rowNumber,keys);

            return;

        }
        if (groupName && row.length !== 0) {

            let item = {};
            item.rowNumber = rowNumber + 1; //starting at 1
            item.groupName = groupName
                keys.forEach((key, colNumber) => {
                    item[key] = row[colNumber];
                })
                group[group.length - 1].items.push(item);
            //console.log(rowNumber,row);
        }

        //console.log(name, keys);

    });
    return group;

}

function parseItems(group) {
    //console.log(group);
    group.items = group.items.map(item => {
            let endPos = item["Pos (End)"] ?? item["Pos"];
            let endLook = item["Look (End)"] ?? item["Look"];
            if (!endPos || !endLook) {
                return
            }
            let destination = parseCoord(item, endPos, endLook);
            item.destination = destination;

            let startPos = item["Pos (Start)"] ?? item["Pos"];
            let startLook = item["Look (Start)"] ?? item["Look"];
            if (startPos && startLook && startPos !== "-" && startPos !== "" && startLook !== "-" && startLook !== "" && (startPos !== endPos || startLook !== endLook)) {
                let start = parseCoord(item, startPos, startLook);
                item.start = start;
            }

            return item
        });

    return group;

}

function parseCoord(item, pos, look) {

    let _plane = Number(pos);

    try {
        var[, _i, _j, _x, _y, p, ...rest] = look.match(/\d+/g).map(Number);
    } catch (error) {
        throw new Error("error parsing", item);

    };
    if ([_i, _j, _x, _y].includes(undefined) || rest.length !== 0) {
        console.log(look, "is not a proper coordinate");
    }

    let destination = {
        plane: _plane,
        x: _i << 6 | _x,
        y: _j << 6 | _y
    }
    return destination;
}

console.log("Teleport layer loaded")
