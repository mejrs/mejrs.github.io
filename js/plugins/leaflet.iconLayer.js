L.IconLayer = L.Layer.extend({

        // @section
        // @aka GridLayer options
        options: {

            // @option tileSize: Number|Point = 256
            // Width and height of tiles in the grid. Use a number if width and height are equal, or `L.point(width, height)` otherwise.
            tileSize: 256,

            // @option opacity: Number = 1.0
            // Opacity of the tiles. Can be used in the `createTile()` function.
            opacity: 1,

            // @option updateWhenIdle: Boolean = (depends)
            // Load new tiles only when panning ends.
            // `true` by default on mobile browsers, in order to avoid too many requests and keep smooth navigation.
            // `false` otherwise in order to display new tiles _during_ panning, since it is easy to pan outside the
            // [`keepBuffer`](#gridlayer-keepbuffer) option in desktop browsers.
            updateWhenIdle: L.Browser.mobile,

            // @option updateWhenZooming: Boolean = true
            // By default, a smooth zoom animation (during a [touch zoom](#map-touchzoom) or a [`flyTo()`](#map-flyto)) will update grid layers every integer zoom level. Setting this option to `false` will update the grid layer only when the smooth animation ends.
            updateWhenZooming: true,

            // @option updateInterval: Number = 200
            // Tiles will not update more than once every `updateInterval` milliseconds when panning.
            updateInterval: 200,

            // @option zIndex: Number = 1
            // The explicit zIndex of the tile layer.
            zIndex: 1,

            // @option bounds: LatLngBounds = undefined
            // If set, tiles will only be loaded inside the set `LatLngBounds`.
            bounds: null,

            // @option minZoom: Number = 0
            // The minimum zoom level down to which this layer will be displayed (inclusive).
            minZoom: 0,

            // @option maxZoom: Number = undefined
            // The maximum zoom level up to which this layer will be displayed (inclusive).
            maxZoom: undefined,

            // @option maxNativeZoom: Number = undefined
            // Maximum zoom number the tile source has available. If it is specified,
            // the tiles on all zoom levels higher than `maxNativeZoom` will be loaded
            // from `maxNativeZoom` level and auto-scaled.
            maxNativeZoom: undefined,

            // @option minNativeZoom: Number = undefined
            // Minimum zoom number the tile source has available. If it is specified,
            // the tiles on all zoom levels lower than `minNativeZoom` will be loaded
            // from `minNativeZoom` level and auto-scaled.
            minNativeZoom: undefined,

            // @option noWrap: Boolean = false
            // Whether the layer is wrapped around the antimeridian. If `true`, the
            // GridLayer will only be displayed once at low zoom levels. Has no
            // effect when the [map CRS](#map-crs) doesn't wrap around. Can be used
            // in combination with [`bounds`](#gridlayer-bounds) to prevent requesting
            // tiles outside the CRS limits.
            noWrap: false,

            // @option pane: String = 'tilePane'
            // `Map pane` where the grid layer will be added.
            pane: 'tilePane',

            // @option className: String = ''
            // A custom class name to assign to the tile layer. Empty by default.
            className: '',

            // @option keepBuffer: Number = 2
            // When panning the map, keep this many rows and columns of tiles before unloading them.
            keepBuffer: 2
        },

        initialize: function (options) {
            L.setOptions(this, options);
        },

        onAdd: function () {
            if (this.options.iconGridFile) {
                const dataPromise = fetch(this.options.iconGridFile);
                dataPromise.then(response => response.json()).then(data => {
                    console.log("data loaded");
                    this._icon_data = data;
                    this._initContainer();

                    this._levels = {};
                    this._icons = {};
                    this._resetView();
                    this._update();

                });
                dataPromise.catch(() => {
                    this._icon_data = undefined;
                    console.log("Unable to fetch " + this.options.iconGridFile)
                });
            }
			else{
				throw new Error("No iconGridFile specified");
			}
        },

        beforeAdd: function (map) {
            map._addZoomLimit(this);
        },

        onRemove: function (map) {
            this._removeAllIcons();
            remove(this._container);
            map._removeZoomLimit(this);
            this._container = null;
            this._tileZoom = undefined;
        },

        // @method bringToFront: this
        // Brings the tile layer to the top of all tile layers.
        bringToFront: function () {
            if (this._map) {
                L.DomUtil.toFront(this._container);
                this._setAutoZIndex(Math.max);
            }
            return this;
        },

        // @method bringToBack: this
        // Brings the tile layer to the bottom of all tile layers.
        bringToBack: function () {
            if (this._map) {
                 L.DomUtil.toBack(this._container);
                this._setAutoZIndex(Math.min);
            }
            return this;
        },

        // @method getContainer: HTMLElement
        // Returns the HTML element that contains the tiles for this layer.
        getContainer: function () {
            return this._container;
        },

        // @method setOpacity(opacity: Number): this
        // Changes the [opacity](#gridlayer-opacity) of the grid layer.
        setOpacity: function (opacity) {
            this.options.opacity = opacity;
            this._updateOpacity();
            return this;
        },

        // @method setZIndex(zIndex: Number): this
        // Changes the [zIndex](#gridlayer-zindex) of the grid layer.
        setZIndex: function (zIndex) {
            this.options.zIndex = zIndex;
            this._updateZIndex();

            return this;
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
            var events = {
                viewprereset: this._invalidateAll,
                viewreset: this._resetView,
                zoom: this._resetView,
                moveend: this._onMoveEnd
            };

            if (!this.options.updateWhenIdle) {
                // update tiles on move, but not more often than once per given interval
                if (!this._onMove) {
                    this._onMove = L.Util.throttle(this._onMoveEnd, this.options.updateInterval, this);
                }

                events.move = this._onMove;
            }

            if (this._zoomAnimated) {
                events.zoomanim = this._animateZoom;
            }

            return events;
        },

        // @section Extension methods
        // Layers extending `GridLayer` shall reimplement the following method.
        // @method createTile(coords: Object, done?: Function): HTMLElement
        // Called only internally, must be overridden by classes extending `GridLayer`.
        // Returns the `HTMLElement` corresponding to the given `coords`. If the `done` callback
        // is specified, it must be called when the tile has finished loading and drawing.
        createTile: function () {
            return document.createElement('div');
        },

        // @section
        // @method getTileSize: Point
        // Normalizes the [tileSize option](#gridlayer-tilesize) into a point. Used by the `createTile()` method.
        getTileSize: function () {
            var s = this.options.tileSize;
            return s instanceof L.Point ? s : new L.Point(s, s);
        },

        _updateZIndex: function () {
            if (this._container && this.options.zIndex !== undefined && this.options.zIndex !== null) {
                this._container.style.zIndex = this.options.zIndex;
            }
        },

        _setAutoZIndex: function (compare) {
            // go through all other layers of the same pane, set zIndex to max + 1 (front) or min - 1 (back)

            var layers = this.getPane().children,
            edgeZIndex = -compare(-Infinity, Infinity); // -Infinity for max, Infinity for min

            for (var i = 0, len = layers.length, zIndex; i < len; i++) {

                zIndex = layers[i].style.zIndex;

                if (layers[i] !== this._container && zIndex) {
                    edgeZIndex = compare(edgeZIndex, +zIndex);
                }
            }

            if (isFinite(edgeZIndex)) {
                this.options.zIndex = edgeZIndex + compare(-1, 1);
                this._updateZIndex();
            }
        },

        _updateOpacity: function () {
            if (!this._map) {
                return;
            }

            // IE doesn't inherit filter opacity properly, so we're forced to set it on tiles
            if (L.Browser.ielt9) {
                return;
            }

            L.DomUtil.setOpacity(this._container, this.options.opacity);

            var now = +new Date(),
            nextFrame = false,
            willPrune = false;

            for (var key in this._icons) {
                var tile = this._icons[key];
                if (!tile.current || !tile.loaded) {
                    continue;
                }

                var fade = Math.min(1, (now - tile.loaded) / 200);

                L.DomUtil.setOpacity(tile.el, fade);
                if (fade < 1) {
                    nextFrame = true;
                } else {
                    if (tile.active) {
                        willPrune = true;
                    } else {
                        this._onOpaqueTile(tile);
                    }
                    tile.active = true;
                }
            }

            if (willPrune && !this._noPrune) {
                console.log("hi1");
                this._pruneIcons();
            }

            if (nextFrame) {
                L.Util.cancelAnimFrame(this._fadeFrame);
                this._fadeFrame = L.Util.requestAnimFrame(this._updateOpacity, this);
            }
        },

        _onOpaqueTile: L.Util.falseFn,

        _initContainer: function () {
            if (this._container) {
                return;
            }

            this._container = L.DomUtil.create('div', 'leaflet-layer ' + (this.options.className || ''));
            this._updateZIndex();

            if (this.options.opacity < 1) {
                this._updateOpacity();
            }

            this.getPane().appendChild(this._container);
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
            for (var z in this._levels) {
                remove(this._levels[z].el);
                this._onRemoveLevel(z);
                delete this._levels[z];
            }
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
            var animating = e && (e.pinch || e.flyTo);
            this._setView(this._map.getCenter(), this._map.getZoom(), animating, animating);
        },

        _animateZoom: function (e) {
            this._setView(e.center, e.zoom, true, e.noUpdate);
        },

        _clampZoom: function (zoom) {
            var options = this.options;

            if (undefined !== options.minNativeZoom && zoom < options.minNativeZoom) {
                return options.minNativeZoom;
            }

            if (undefined !== options.maxNativeZoom && options.maxNativeZoom < zoom) {
                return options.maxNativeZoom;
            }

            return zoom;
        },

        _setView: function (center, zoom, noPrune, noUpdate) {
            var tileZoom = this._clampZoom(Math.round(zoom));
            if ((this.options.maxZoom !== undefined && tileZoom > this.options.maxZoom) ||
                (this.options.minZoom !== undefined && tileZoom < this.options.minZoom)) {
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

                // Flag to prevent _updateOpacity from pruning tiles during
                // a zoom anim or a pinch gesture
                this._noPrune = !!noPrune;
            }
        },
        _onMoveEnd: function () {

            if (!this._map || this._map._animatingZoom) {
                return;
            }
            this._update();
        },

        _resetGrid: function () {
            var map = this._map,
            crs = map.options.crs,
            tileSize = this._iconsize = this.getTileSize(),
            tileZoom = this._tileZoom;

            var bounds = this._map.getPixelWorldBounds(this._tileZoom);
            if (bounds) {
                this._globalTileRange = this._pxBoundsToTileRange(bounds);
            }

            this._wrapX = crs.wrapLng && !this.options.noWrap && [
                    Math.floor(map.project([0, crs.wrapLng[0]], tileZoom).x / tileSize.x),
                    Math.ceil(map.project([0, crs.wrapLng[1]], tileZoom).x / tileSize.y)
                ];
            this._wrapY = crs.wrapLat && !this.options.noWrap && [
                    Math.floor(map.project([crs.wrapLat[0], 0], tileZoom).y / tileSize.x),
                    Math.ceil(map.project([crs.wrapLat[1], 0], tileZoom).y / tileSize.y)
                ];
        },

        _pxBoundsToTileRange: function (bounds) {
            var tileSize = this.getTileSize();
            return new L.Bounds(
                bounds.min.unscaleBy(tileSize).floor(),
                bounds.max.unscaleBy(tileSize).ceil());
        },

        _getTiledPixelBounds: function (center) {
			            var map = this._map,
            mapZoom = map._animatingZoom ? Math.max(map._animateToZoom, map.getZoom()) : map.getZoom(),
            scale = map.getZoomScale(mapZoom, this._tileZoom),
            pixelCenter = map.project(center, this._tileZoom).floor(),
            halfSize = map.getSize().divideBy(scale * 2);
			
            return new L.Bounds(pixelCenter.subtract(halfSize), pixelCenter.add(halfSize));
        },

        // Private method to load tiles in the grid's active zoom level according to map bounds
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

            // create a queue of coordinates to load tiles from
            for (var j = tileRange.min.y; j <= tileRange.max.y; j++) {
                for (var i = tileRange.min.x; i <= tileRange.max.x; i++) {
				
                    var coords = new L.Point(i, j);
                    coords.z = this._tileZoom;
					coords.plane = this._map.getPlane();

                    if (!this._isValidTile(coords)) {
                        continue;
                    }

                    var tile = this._icons[this._tileCoordsToKey(coords)];
                    if (tile) {
                        tile.current = true;
                    } else {

                        var dataKey = 16384 * coords.plane + 128 * coords.x - coords.y;
                        if (this._icon_data.hasOwnProperty(dataKey)) {
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
            }
        },

        _isValidTile: function (coords) {
            var crs = this._map.options.crs;

            if (!crs.infinite) {
                // don't load tile if it's out of bounds and not wrapped
                var bounds = this._globalTileRange;
                if ((!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x)) ||
                    (!crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y))) {
                    return false;
                }
            }

            if (!this.options.bounds) {
                return true;
            }

            // don't load tile if it doesn't intersect the bounds in options
            var tileBounds = this._tileCoordsToBounds(coords);
            return L.latLngBounds(this.options.bounds).overlaps(tileBounds);
        },

        _keyToBounds: function (key) {
            return this._tileCoordsToBounds(this._keyToTileCoords(key));
        },

        _tileCoordsToNwSe: function (coords) {
            var map = this._map,
            tileSize = this.getTileSize(),
            nwPoint = coords.scaleBy(tileSize),
            sePoint = nwPoint.add(tileSize),
            nw = map.unproject(nwPoint, coords.z),
            se = map.unproject(sePoint, coords.z);
            return [nw, se];
        },

        // converts tile coordinates to its geographical bounds
        _tileCoordsToBounds: function (coords) {
            var bp = this._tileCoordsToNwSe(coords),
            bounds = new L.latLngBounds(bp[0], bp[1]);

            if (!this.options.noWrap) {
                bounds = this._map.wrapLatLngBounds(bounds);
            }
            return bounds;
        },
        // converts tile coordinates to key for the tile cache
        _tileCoordsToKey: function (coords) {
            return coords.plane + ':' +coords.x + ':' + coords.y;
        },

        // converts tile cache key to coordinates
        _keyToTileCoords: function (key) {
            var k = key.split(':'),
            coords = new L.Point(+k[1], +k[2]);
            coords.plane = +k[0];
            return coords;
        },

        _removeIcons: function (key) {
            var icons = this._icons[key].icons;

            if (!icons) {
                return;
            }

            icons.forEach(item => this._map.removeLayer(item));

            delete this._icons[key];
                       // @event tileunload: TileEvent
            // Fired when a tile is removed (e.g. when a tile goes off the screen).
            this.fire('iconunload', {

                coords: this._keyToTileCoords(key)
            });
        },

        _getTilePos: function (coords) {
            return coords;
        },

        _addIcons: function (coords) {
            var tilePos = this._getTilePos(coords),
            key = this._tileCoordsToKey(coords);
            var dataKey = 16384 * coords.plane + 128 * coords.x - coords.y;
            var data = this._icon_data[dataKey];
            var icons = [];

            data.forEach(item => {

                if (item.type === "icon" || item.type === "object") {
                    var icon = loadIcon(item)
                        this._map.addLayer(icon);
                    icons.push(icon);
                }
                if (item.type === "maplink") {
                    var icon = loadMaplink(item)
                        this._map.addLayer(icon);
                    icons.push(icon);
                }
                this._icons[key] = {
                    icons: icons,
                    coords: coords,
                    current: true
                };
            });

        },

    });

// @factory L.gridLayer(options?: GridLayer options)
// Creates a new instance of GridLayer with the supplied options.
L.iconLayer = function (options) {
    return new L.IconLayer(options);
}

function loadIcon(item) {
    const privatelink = "../mejrs.github.io/";
    var iconSprite = item.iconData.icon.iconSprite;
    var iconClass = item.iconData.properties.unk_19;
	
	
    if (iconSprite == 32768) {
		console.log("max sprite?");
       // iconSprite = 33478;
    }

    var marker_icon = L.divIcon({
            html: '<div class="map-icon plane-' + item.plane + ' icon-class-' + iconClass + '"><img src="' + privatelink + 'layers/sprites/' + iconSprite + '-0.png" alt="' + iconSprite + '"></div>',
            iconSize: null //default marker is a 12x12 white box, this makes it not appear
        });

    let marker = L.marker([item.y, item.x], {
            icon: marker_icon,
            alt: iconSprite + '-0.png',
            riseOnHover: true,
        });

    if ("tooltip" in item) {
        marker.bindTooltip(item.tooltip, {
            direction: "top",
            offset: [12, -20]
        })

    }

    if ("dungeonSprite" in item.iconData.icon) {
        var mouseoverIconSprite = item.iconData.icon.dungeonSprite;
        var mouseover_marker_icon = L.icon({
                iconUrl: privatelink + 'layers/sprites/' + mouseoverIconSprite + '-0.png',
                iconSize: null,
                classname: 'map-icon plane-' + item.plane + ' icon-class-' + iconClass,
            });

        marker.once('mouseover', function () {
            console.log(JSON.stringify(item));
            this.setIcon(mouseover_marker_icon);
        });

        marker.on('mouseout', function () {
            this.setIcon(marker_icon);

            //Has to be done this way (I think) to prevent mouseover event from firing continuously
            marker.once('mouseover', function () {
                console.log(item);
                this.setIcon(mouseover_marker_icon);
            });
        });
    } else {
       marker.on('mouseover', function (e) {
          console.log(JSON.stringify(item));
			
        });
    }

    return marker;
}

function loadTextLabel(item) {
    var label_text = item.iconData.icon.text;
    var label_fontSize = item.iconData.icon.fontSize;
    var label_color = item.iconData.icon.labelColor;

    marker_icon = L.divIcon({
            html: '<div style="color:rgb(' + label_color + ');" class="map-label text-label-' + label_fontSize + '">' + label_text + '</div>',
            iconSize: null, //with css width:max-content rule, makes text not wrap NOTE: this isn't 'officially' supported
        });
    var marker = L.marker([item.y, item.x], {
            icon: marker_icon
        });

    map.on('pan_to_' + label_text, function () {
        console.log("panning to" + label_text);
        var label_location = marker.getLatLng();
        map.setView(label_location, 2);

    });

    return marker;
}

function loadMaplink(item) {
    const privatelink = "../mejrs.github.io/";
    var iconSprite = item.iconData.icon.iconSprite;
    var iconClass = item.iconData.properties.unk_19;

    if (iconSprite == 32768) {
		console.log("max sprite?");
       //iconSprite = 33478;
    }

    var marker_icon = L.divIcon({
            html: '<div class="map-icon plane-' + item.plane + ' icon-class-' + iconClass + '"><img src="' + privatelink + 'layers/sprites/' + iconSprite + '-0.png" alt="' + iconSprite + '"></div>',
           iconSize: null //default marker is a 12x12 white box, this makes it not appear
        });

    let marker = L.marker([item.y, item.x], {
            icon: marker_icon,
            alt: iconSprite,
            riseOnHover: true,
        });

    if ("tooltip" in item) {
        marker.bindTooltip(item.tooltip, {
            direction: "top",
            offset: [12, -20]
        })

    }

    if ("dungeonSprite" in item.iconData.icon) {
        var mouseoverIconSprite = item.iconData.icon.dungeonSprite;
        var mouseover_marker_icon = L.divIcon({
                html: '<div class="map-icon plane-' + item.plane + ' icon-class-' + iconClass + '"><img src="' + privatelink + 'layers/sprites/' + mouseoverIconSprite + '-0.png" alt="' + mouseoverIconSprite + '"></div>',
                //iconSize: null //default marker is a 12x12 white box, this makes it not appear
            });

        marker.once('mouseover', function () {
            console.log(JSON.stringify(item));
            this.setIcon(mouseover_marker_icon);
        });

        marker.on('mouseout', function () {
            this.setIcon(marker_icon);

            //Has to be done this way (I think) to prevent mouseover event from firing continuously
            marker.once('mouseover', function () {
                console.log(JSON.stringify(item));
                this.setIcon(mouseover_marker_icon);
            });
        });
    } else {
        marker.on('mouseover', function (e) {
            console.log(JSON.stringify(item));
        });
    }

    marker.on('click', function (e) {
        let destination = item.iconData.properties.unk_249["4148"];
        let x = (destination >> 14) & 0x3FFF;
        let y = destination & 0x3FFF;
        runescape_map.flyTo([y, x], 2)
    })

    return marker;
}
