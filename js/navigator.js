'use strict';

L.Navigator = L.Control.extend({
        options: {
            position: 'bottomright',
            emptyString: 'Unavailable',
        },

        initialize: function (options) {
            L.setOptions(this, options);
            this._map = null;

        },

        onAdd: function (map) {
            this._map = map;
            this.initMarkers(map);
            this._container = L.DomUtil.create('div', 'leaflet-control-navigator');
            L.DomEvent.disableClickPropagation(this._container);
            L.DomEvent.disableScrollPropagation(this._container);
            this._container.innerHTML = this.options.emptyString;

            if (this.options.messageBox) {
                this._messageContainer = L.DomUtil.create('div', 'leaflet-control-message-container');
                map._controlContainer.appendChild(this._messageContainer);
            }
            if (this.options.shadowTileUrl) {
                this.shadowLayer = L.tileLayer.main(this.options.shadowTileUrl, {
                        source: 'shadow_squares',
                        minZoom: -4,
                        maxNativeZoom: 2,
                        maxZoom: 5,
						errorTileUrl: this.options.shadowErrorTileUrl,
                    });

            }

            this.updatePath();
            return this._container;
        },

        addMessage: function (message) {
            if (this.options.messageBox) {
                let messageBox = L.DomUtil.create('div', 'leaflet-control-message-box');

                let messageContent = L.DomUtil.create('div', 'leaflet-control-message-content');
                messageContent.innerHTML = message;
                messageBox.appendChild(messageContent);

                let clearButton = L.DomUtil.create('div', 'leaflet-control-message-clear');
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

        path: [],

        initMarkers: function (map) {
            this.startMarker = L.pathfindermarker([this.options.initStart[2], this.options.initStart[1]], {
                    icon: L.startIcon({}),
                    draggable: true,
                    autoPan: true,
                    control: this,
                    plane: this.options.initStart[0],
                }).bindPopup("I'm the start").addTo(map);
            this.startMarker.bindTooltip("Start", {
                direction: "top"
            });

            this.endMarker = L.pathfindermarker([this.options.initEnd[2], this.options.initEnd[1]], {
                    icon: L.endIcon({}),
                    draggable: true,
                    autoPan: true,
                    control: this,
                    plane: this.options.initEnd[0],
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
            let startPlane = this.startMarker.getOldPlane();

            let end = this.endMarker.getLatLng();
            let endPlane = this.endMarker.getOldPlane();

            let startFeaturePromise = this.startMarker.getFeature();
            let endFeaturePromise = this.endMarker.getFeature();

            Promise.all([startFeaturePromise, endFeaturePromise])
            .then(features => {
                if (features[0] && features[1]) {
                    this.options.algorithm(startPlane, start.lng, start.lat, features[0], endPlane, end.lng, end.lat, features[1]).then(paths => {
                        this.drawPath.bind(this)(paths);
                        this.drawMaps.bind(this)(paths);
                    }).catch(err => {
                        this.addMessage(err);
                        console.error(err)
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

            var boundingBox = L.latLngBounds(path.solution).pad(0.05);
            let pathCenter = boundingBox.getCenter();
            let dimX = Math.floor(boundingBox.getEast() - boundingBox.getWest());
            let dimY = Math.floor(boundingBox.getNorth() - boundingBox.getSouth());

            let canvasZoom = 7 - Math.trunc(Math.log2(Math.max(16, dimX, dimY)));
            let gameTilesInCanvas = 256 * 2 ** -canvasZoom;

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
            let tiles = await Promise.all(iter.map(offset => L.Util.template(this.options.tileUrl, {
                            zoom: canvasZoom,
                            plane: path.start.plane,
                            x: originTileX + offset[0],
                            y: originTileY + offset[1],
                        })).map(this.getImage.bind(this)));

            for (const[[di, dj], tile]of(iter.map((k, i) => [k, tiles[i]]))) {
                //map tiles are 256px
                ctx.drawImage(tile, 256 * di - 128 - canvasOffsetX, -256 * dj + 128 + canvasOffsetY);
            }

            let localCanvasTransform = this.canvasTransform(pathCenter, canvasZoom);
            ctx.fillStyle = "red";

            for (const[lat, lng]of path.solution) {
                let {
                    cx,
                    cy,
                    dotSize,
                } = localCanvasTransform(lat, lng);

                ctx.fillRect(cx, cy, dotSize, dotSize);
            }

            canvas.onclick = () => {
                this._map.setPlane(path.start.plane);
                this._map.setView(pathCenter, canvasZoom + 1);
            };
            canvas.title = "Navigate to this path section.";
            return canvas;
        },

        canvasTransform: function (pathCenter, canvasZoom) {
            return function (lat, lng) {
                let cx = 128 + (lng - pathCenter.lng) * 2 ** canvasZoom;
                let cy = 128 - (lat - pathCenter.lat + 1) * 2 ** canvasZoom;
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
                let latlngs = path.solution.map(latlng => [latlng[0] + 0.5, latlng[1] + 0.5]);
                let section = L.polyline(latlngs, {
                        color: 'red'
                    }).addTo(this._map);
                this.path.push(section);
            });
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
            this._oldPlane = options.plane;
        },

        onAdd: function (map) {
            this._zoomAnimated = this._zoomAnimated && map.options.markerZoomAnimation;

            if (this._zoomAnimated) {
                map.on('zoomanim', this._animateZoom, this);
            }
            this.on("dragstart", this.dragStart, this);
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
                return this.fetchFeature(this._oldPlane, pos);
            }
        },

        fetchFeature: function (plane, latLng) {
            let key = this._generateDataKey(plane, latLng);
            let localX = latLng.lng & 0x3F;
            let localY = latLng.lat & 0x3F;
            return fetch(`data/collisions/-1/${key}.json`)
            .then(response => response.json())
            .then(data => data[localX][localY].f)
            .catch(e => undefined);
        },

        _oldLatLng: undefined,

        _oldPlane: undefined,

        setOldPlane: function (plane) {
            this._oldPlane = plane;
        },

        getOldPlane: function () {
            return this._oldPlane;
        },

        dragStart: function (e) {
			this.options.control.shadowLayer.addTo(this._map);
            let dragStartLocation = this.getLatLng();
            this.setOldLatLng(dragStartLocation);
        },

        plant: function (e) {
			this.options.control.shadowLayer.remove();
            let oldLatLng = this.getOldLatLng();
            let oldPlane = this.getOldPlane()

                let newLatLng = this.getLatLng();
            let newPlane = this._map.getPlane();

            let feature = this.fetchFeature(newPlane, newLatLng).then(feature => {
                    if (feature) {
                        this.setOldPlane(newPlane);
                        this.setFeature(feature);
                        this.setLatLng(this.centerOnTile(newLatLng));
                        this.setOldLatLng(newLatLng);
                        this.options.control.addMessage("Placed marker at " + Math.trunc(newLatLng.lng) + ", " + Math.trunc(newLatLng.lat) + " in feature " + newPlane + "_" + feature);
                        this.options.control.updatePath();
                    } else {
                        this.options.control.addMessage("That tile cannot be walked on.");
                        this.setLatLng(oldLatLng);
                    }
                });
        },

        _generateDataKey: function (plane, latlng) {
            return [plane, latlng.lng >> 6, latlng.lat >> 6].join("_");

        },

        centerOnTile: function (latlng) {
            let lat = Math.trunc(latlng.lat) + 0.5;
            let lng = Math.trunc(latlng.lng) + 0.5;
            return L.latLng(lat, lng);
        },

        getOldLatLng: function () {
            return this._oldLatLng;
        },
        setOldLatLng: function (latlng) {
            this._oldLatLng = latlng;
        },
    });

L.pathfindermarker = function (latlng, options) {
    return new L.Pathfindermarker(latlng, options);
}
