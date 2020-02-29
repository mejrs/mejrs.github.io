
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

            this._mapId = Number(parsedUrl.searchParams.get('mapId') || parsedUrl.searchParams.get('mapid') || parsedUrl.searchParams.get('m') || this.options.initialMapId || -1);
            this.options.x = Number(parsedUrl.searchParams.get('x')) || this.options.x || 0;
            this.options.y = Number(parsedUrl.searchParams.get('y')) || this.options.y || 0;

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
            attribution: '<a href="http://runescape.wiki.com">RuneScape Wiki</a>',

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
