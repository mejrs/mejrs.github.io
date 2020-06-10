'use strict';

L.Navigator = L.Control.extend({
        options: {
            position: 'bottomright',
            emptyString: 'Unavailable',
            prefix: "",
            startCoordinate: L.latLng(3218, 3220),
            endCoordinate: L.latLng(3232, 3232),

        },

        initialize: function (options) {
            L.setOptions(this, options);
            this._map = null;

        },

        onAdd: function (map) {
            this._map = map;
            this.initMarkers(map);

            this.greyed = L.tileLayer.main('layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
                    source: 'pathfinding_squares',
                    minZoom: 0,
                    maxNativeZoom: 2,
                    maxZoom: 4,
                    errorTileUrl: 'layers/grey_pixel.png'

                });

            this._container = L.DomUtil.create('div', 'leaflet-control-navigator');
            L.DomEvent.disableClickPropagation(this._container);
            L.DomEvent.disableScrollPropagation(this._container);
            this._container.innerHTML = this.options.emptyString;
            this.updatePath();
            return this._container;
        },

        path: [],

        initMarkers: function (map) {
            this.startMarker = L.pathfindermarker(this.options.startCoordinate, {
                    icon: L.startIcon({}),
                    draggable: true,
                    autoPan: true,
                    control: this,
                }).bindPopup("I'm the start").addTo(map);
            this.startMarker.bindTooltip("Start", {
                direction: "top"
            });

            this.endMarker = L.pathfindermarker(this.options.endCoordinate, {
                    icon: L.endIcon({}),
                    draggable: true,
                    autoPan: true,
                    control: this,
                }).bindPopup("I'm the end").addTo(map);
            this.endMarker.bindTooltip("End", {
                direction: "top"
            });
        },

        updatePath: function () {
            if (this.path) {
                this.path.forEach(section => section.remove());
            };
            this.path = [];
            this.calculatePath();
        },

        calculatePath: function () {
            let start = this.startMarker.getLatLng();
            let end = this.endMarker.getLatLng();
            let startFeaturePromise = this.startMarker.getFeature();
            let endFeaturePromise = this.endMarker.getFeature();

            Promise.all([startFeaturePromise, endFeaturePromise])
            .then(features => {
                if (features[0] && features[1]) {
                    this.options.algoritm(0, start.lng, start.lat, features[0], 0, end.lng, end.lat, features[1]).then(paths => {
                        this.drawPath.bind(this)(paths);
                        this.drawMaps.bind(this)(paths);
                    });
                } else {
                    console.error(features, "is not valid.")
                };

            });

        },

        drawMaps: function (paths) {
            this._container.innerHTML = "";
            let minimaps = Promise.all(paths.map(this.drawMap.bind(this)))
                .then(minimaps => minimaps.forEach(minimap => {
                        this._container.appendChild(minimap)
                    }));

        },

        drawMap: async function (path) {
            var canvas = document.createElement('canvas');
            let ctx = canvas.getContext('2d');

            canvas.className = "leaflet-control-navigator-map";
            canvas.height = 256;
            canvas.width = 256;

            var boundingBox = L.latLngBounds(path).pad(0.2);
            let pathCenter = boundingBox.getCenter();
            let dimX = Math.floor(boundingBox.getEast() - boundingBox.getWest());
            let dimY = Math.floor(boundingBox.getNorth() - boundingBox.getSouth());

            let canvasZoom = 7 - Math.trunc(Math.log2(Math.max(16, dimX, dimY)));
            let gameTilesInCanvas = 256 * 2 ** -canvasZoom;

            //console.log(canvasZoom, gameTilesInCanvas);

            let originTileX = (pathCenter.lng - 128 * 2 ** -canvasZoom) >> (8 - canvasZoom);
            let originTileY = (pathCenter.lat - 128 * 2 ** -canvasZoom) >> (8 - canvasZoom);

            let canvasCenter = {
                x: (originTileX + 1) << (8 - canvasZoom),
                y: (originTileY + 1) << (8 - canvasZoom)
            };

            let canvasOffsetX = Math.trunc((pathCenter.lng - canvasCenter.x) * (256 / gameTilesInCanvas));
            let canvasOffsetY = Math.trunc((pathCenter.lat - canvasCenter.y) * (256 / gameTilesInCanvas));

            //console.log(canvasOffsetX, canvasOffsetY);

            let iter = [[0, 0], [0, 1], [1, 0], [1, 1]];
            let tiles = await Promise.all(iter.map(offset => L.Util.template(this.options.tileSource, {
                            zoom: canvasZoom,
                            plane: 0,
                            x: originTileX + offset[0],
                            y: originTileY + offset[1],
                        })).map(this.getImage.bind(this))).catch(console.error);

            for (const[[di, dj], tile]of(iter.map((k, i) => [k, tiles[i]]))) {
                //map tiles are 256px
                ctx.drawImage(tile, 256 * di - 128 - canvasOffsetX, -256 * dj + 128 + canvasOffsetY);
            }
			
            let localCanvasTransform = this.canvasTransform(canvasCenter, pathCenter, canvasZoom);
            ctx.fillStyle = "red";

            for (const[lat, lng]of path) {
                let {
                    cx,
                    cy,
                    dotSize,
                } = localCanvasTransform(lat, lng);
                // console.log(cx, cy);
                ctx.fillRect(cx, cy, dotSize, dotSize);
            }

            canvas.onclick = () => this._map.flyTo(pathCenter, canvasZoom + 1);
            canvas.title = "Navigate to this path section.";
            return canvas;
        },

        canvasTransform: function (canvasCenter, pathCenter, canvasZoom) {
            return function (lat, lng) {
                let cx = 128 + (lng - pathCenter.lng) * 2 ** canvasZoom;
                let cy = 128 - (lat - pathCenter.lat) * 2 ** canvasZoom - 2 ** canvasZoom;
                let dotSize = 4
                    return {
                    cx: cx,
                    cy: cy,
                    dotSize: dotSize,
                }
            }
        },

        getImage: function (url) {
            return new Promise((resolve, reject) => {
                let img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(new Image());
                img.src = url;
            })
        },

        getErrorTile: function () {
            return Promise.resolve();
        },

        drawPath: function (paths) {
            paths.forEach(path => {
                let latlngs = path.map(latlng => [latlng[0] + 0.5, latlng[1] + 0.5]);
                let section = L.polyline(latlngs, {
                        color: 'red'
                    }).addTo(this._map);
                this.path.push(section);
            });
        },
				
		msg: function(messageText){
			let box = document.createElement("div"); 
			box.className = "leaflet-control-message-box";
			box.innerHTML = messageText;
			document.body.appendChild(box);
			setTimeout(() => document.body.removeChild(box), 3000);
			
			
		},

    });

L.navigator = function (options) {
    return new L.Navigator(options);
}

L.StartIcon = L.Icon.extend({

        options: {
            iconUrl: 'images/marker-icon.png',
            shadowUrl: 'images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            tooltipAnchor: [16, -28],
            shadowSize: [41, 41]
        }
    });

L.startIcon = function (options) {
    return new L.StartIcon(options);
}

L.EndIcon = L.Icon.extend({

        options: {
            iconUrl: 'images/marker-icon-greyscale.png',
            shadowUrl: 'images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            tooltipAnchor: [16, -28],
            shadowSize: [41, 41]
        }
    });

L.endIcon = function (options) {
    return new L.EndIcon(options);
}

L.Pathfindermarker = L.Marker.extend({
        initialize: function (latlng, options) {
            L.setOptions(this, options);
            this._latlng = this.centerOnTile(L.latLng(latlng));
        },

        onAdd: function (map) {
            this._zoomAnimated = this._zoomAnimated && map.options.markerZoomAnimation;

            if (this._zoomAnimated) {
                map.on('zoomanim', this._animateZoom, this);
            }
            this.on("dragstart", this.cacheOldLocation, this);
            this.on("dragend", this.plant, this);

            this._initIcon();
            this.update();
        },

        onRemove: function (map) {
            if (this.dragging && this.dragging.enabled()) {
                this.options.draggable = true;
                this.dragging.removeHooks();
            }
            delete this.dragging;

            if (this._zoomAnimated) {
                map.off('zoomanim', this._animateZoom, this);
            }

            this._removeIcon();
            this._removeShadow();
        },

        _feature: undefined,

        setFeature: function (f) {
            this._feature = f;
        },

        getFeature: function () {
            if (this._feature) {
                return Promise.resolve(this._feature);
            } else {
                let pos = this.getLatLng();
                return this.fetchFeature(pos);
            }
        },

        fetchFeature: function (latLng) {
            let key = this._generateDataKey(latLng);
            let localX = latLng.lng & 0x3F;
            let localY = latLng.lat & 0x3F;
            return fetch(`data/collisions/-1/${key}.json`)
            .then(response => response.json())
            .then(data => data[localX][localY].f)
            .catch(e => undefined);
        },

        _oldLatLng: undefined,

        cacheOldLocation: function (e) {
            let dragStartLocation = this.getLatLng();
            this.setOldLatLng(dragStartLocation);
        },

        plant: function (e) {
            let oldLatLng = this.getOldLatLng();
            let newLatLng = this.getLatLng();
            let feature = this.fetchFeature(newLatLng).then(feature => {
                    
                    if (feature) {
                        this.setFeature(feature);
                        this.setLatLng(this.centerOnTile(newLatLng));
                        this.setOldLatLng(newLatLng);
						this.options.control.msg("Placed marker at " + Math.round(newLatLng.lng) +", " + Math.round(newLatLng.lat) +" in feature " + feature);
                        this.options.control.updatePath();
                    } else {
						this.options.control.msg("That tile cannot be walked on.");
                        this.setLatLng(oldLatLng);
                    }

                });
        },

        _generateDataKey: function (...args) {
            args = args.flat();

            //args is a sequence of integers
            if (args.every(Number.isInteger)) {
                return args.join("_");
            } else if (args.length === 1) {
                args = args[0];
                //is latlng
                if ("lat" in args && "lng" in args) {
                    return [this._map.getPlane(), args.lng >> 6, args.lat >> 6].join("_");
                }
                //is some data with p,x,y coordinates
                if ("p" in args && "x" in args && "y" in args)
                    return [args.p, args.x >> 6, args.y >> 6].join("_");
            }
            throw new Error(args, "could not be converted to a datakey");
        },
        quantize: function () {
            let lat = Math.floor(this.lat);
            let lng = Math.floor(this.lng);
            return L.latLng(lat, lng);
        },

        centerOnTile: function (latlng) {
            let lat = Math.floor(latlng.lat) + 0.5;
            let lng = Math.floor(latlng.lng) + 0.5;
            return L.latLng(lat, lng);
        },

        getOldLatLng: function () {
            return this._oldLatLng;
        },
        setOldLatLng: function (latLng) {
            this._oldLatLng = latLng;
        },


    });

L.pathfindermarker = function (latlng, options) {
    return new L.Pathfindermarker(latlng, options);
}

L.MessageBox = L.Control.extend({
        onAdd: function (map) {
            this._map = map;

            this._container = L.DomUtil.create('div', 'leaflet-control-message-box');
            this._container.innerHTML = this.options.message;
            return this._container;
        },
    });

L.messageBox = function (options) {
    return new L.MessageBox(options);
}
