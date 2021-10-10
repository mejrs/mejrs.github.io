import "../leaflet.js";

(function (factory) {
    var L;
    if (typeof define === "function" && define.amd) {
        define(["leaflet"], factory)
    } else if (typeof module !== "undefined") {
        L = require("leaflet");
        module.exports = factory(L)
    } else {
        if (typeof window.L === "undefined") {
            throw new Error("Leaflet must be loaded first")
        }
        factory(window.L)
    }
})(function (L) {
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
                this._container = L.DomUtil.create('div', 'leaflet-control-navigator');
                L.DomEvent.disableClickPropagation(this._container);
                L.DomEvent.disableScrollPropagation(this._container);
                this._container.innerHTML = this.options.emptyString;

                this.makePath();
                return this._container;
            },

            makePath: function () {
                fetch(this.options.dataUrl)
                .then(res => res.ok ? res.json() : new Error(res))
                .then(solution => {

                    this.drawPath.bind(this)(solution);
                    this.drawNavigationPanels.bind(this)(solution);
                })
                .catch(console.error);
            },

            drawNavigationPanels: function (solution) {
                this._container.innerHTML = "";

                let hide = L.DomUtil.create('div', 'leaflet-control-navigator-hide');
                hide.innerHTML = "collapse <br> > <br> > <br> > <br> > <br> >";
                this._container.appendChild(hide);

                let content = L.DomUtil.create('div', 'leaflet-control-navigator-content');
                Promise.all(solution.route.map(this.drawPanel.bind(this)))
                    .then(panels => panels.forEach(panel => {
                            content.appendChild(panel)
                        }));

                hide.onclick = () => {
                    if (content.style.display !== "none") {
                        content.style.display = "none";
                        hide.innerHTML = "show <br> < <br> < <br> < <br> < <br> <";
                    } else {
                        content.style.display = "block";
                        hide.innerHTML = "collapse <br> > <br> > <br> > <br> > <br> >";
                    }
                };

                this._container.appendChild(content);

            },

            drawPanel: async function (path) {
                let panel = L.DomUtil.create('div', 'leaflet-control-navigator-panel');

                let title = L.DomUtil.create('p', 'leaflet-control-navigator-title');
                title.innerHTML = path.title;
                panel.appendChild(title);

                let description = L.DomUtil.create('p', 'leaflet-control-navigator-description');
                description.innerHTML = path.description;
                panel.appendChild(description);

                if (path.requirements) {
                    let requirements = L.DomUtil.create('p', 'leaflet-control-navigator-requirements');
                    requirements.innerHTML = path.requirements;
                    panel.appendChild(requirements);
                }

                let minimap = await this.drawCanvas(path);
                panel.appendChild(minimap);

                return panel;
            },

            drawCanvas: async function (path) {

                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');

                canvas.className = "leaflet-control-navigator-map";
                canvas.height = 256;
                canvas.width = 256;

                var boundingBox = L.bounds(path.coords);
                let pathCenter = boundingBox.getCenter();
                let size = boundingBox.getSize();

                let canvasZoom = 7 - Math.trunc(Math.log2(Math.max(16, size.x, size.y)));
                let gameTilesInCanvas = 256 * 2 ** -canvasZoom;

                let originTileX = (pathCenter.x - 128 * 2 ** -canvasZoom) >> (8 - canvasZoom);
                let originTileY = (pathCenter.y - 128 * 2 ** -canvasZoom) >> (8 - canvasZoom);

                let canvasCenter = {
                    x: (originTileX + 1) << (8 - canvasZoom),
                    y: (originTileY + 1) << (8 - canvasZoom)
                };

                let canvasOffsetX = Math.trunc((pathCenter.x - canvasCenter.x) * (256 / gameTilesInCanvas));
                let canvasOffsetY = Math.trunc((pathCenter.y - canvasCenter.y) * (256 / gameTilesInCanvas));

                let iter = [[0, 0], [0, 1], [1, 0], [1, 1]];
                let tiles = await Promise.all(iter.map(offset => L.Util.template(this.options.tileUrl, {
                                zoom: canvasZoom,
                                plane: path.coords[0].z,
                                x: originTileX + offset[0],
                                y: originTileY + offset[1],
                            })).map(this.getImage.bind(this)));

                for (const[[di, dj], tile]of(iter.map((k, i) => [k, tiles[i]]))) {
                    //map tiles are 256px
                    ctx.drawImage(tile, 256 * di - 128 - canvasOffsetX, -256 * dj + 128 + canvasOffsetY);
                }

                let localCanvasTransform = this.canvasTransform(pathCenter, canvasZoom);
                ctx.fillStyle = "red";

                for (const coordinate of path.coords) {
                    let {
                        cx,
                        cy,
                        dotSize,
                    } = localCanvasTransform(coordinate);

                    ctx.fillRect(cx, cy, dotSize, dotSize);
                }

                canvas.onclick = () => {
                    this._map.setPlane(path.coords[0].z);
                    this._map.setView([pathCenter.y, pathCenter.x], canvasZoom + 1);
                };
                canvas.title = "Navigate to this path section.";
                return canvas;
            },

            canvasTransform: function (pathCenter, canvasZoom) {
                return function (coordinate) {
                    let cx = 128 + (coordinate.x - pathCenter.x) * 2 ** canvasZoom;
                    let cy = 128 - (1 + coordinate.y - pathCenter.y) * 2 ** canvasZoom;
                    let dotSize = 4
                        return {
                        cx: cx,
                        cy: cy,
                        dotSize: dotSize,
                    }
                }
            },

            getImage: function (url) {
                return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
                    let img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(new Image());
                    img.src = url;
                })
            },

            getErrorTile: function () {
                return Promise.resolve();
            },

            path: [],

            drawPath: function (solution) {
                solution.route.forEach(route_section => {
                    let latlngs = route_section.coords.map(coord => [coord.y + 0.5, coord.x + 0.5]);
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

    L.DynamicNavigator = L.Navigator.extend({
            initialize: function (options) {
                L.setOptions(this, options);

                //CSS Transform not supported (for centering messages)
                if (L.Browser.ielt9) {
                    this.options.messageBox = false;
                }

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
                }
                this.path = [];
                this.getPath();
            },

            getPath: function () {
                let start = this.startMarker.getLatLng();
                let startPlane = this.startMarker.getOldPlane();

                let end = this.endMarker.getLatLng();
                let endPlane = this.endMarker.getOldPlane();

                let startFeaturePromise = this.startMarker.getFeature();
                let endFeaturePromise = this.endMarker.getFeature();

                Promise.all([startFeaturePromise, endFeaturePromise, this.instantiateWasmModule()])
                .then(features => {
                    if (features[0] && features[1]) {
                        this.options.algorithm(startPlane, start.lng, start.lat, features[0], endPlane, end.lng, end.lat, features[1])
                        .then(solution => {
                            this.drawPath.bind(this)(solution);
                            this.drawNavigationPanels.bind(this)(solution);
                        }).catch(err => {
                            this.addMessage(err);
                            console.error(err)
                        });
                    } else {
                        console.error(features, "is not valid.")
                    }

                });

            },

            instantiateWasmModule: function () {
                if (this.initDone) {
                    return Promise.resolve();
                } else if (this.options.init) {
                    return this.options.init().then(() => {
                        this.initDone = true;
                    });
                } else {
                    throw new Error("No wasm module initialization function was given.");
                }
            },

            initDone: false,

        });

    L.dynamicNavigator = function (options) {
        return new L.DynamicNavigator(options);
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
                L.Marker.prototype.remove.call(this, map);
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
                return fetch(`wasm-pathfinder/wasm-pathfinder-data/collisions/-1/${key}.json`)
                .then(response => response.json())
                .then(data => data[localX][localY].f)
                .catch(() => undefined);
            },

            _oldLatLng: undefined,

            _oldPlane: undefined,

            setOldPlane: function (plane) {
                this._oldPlane = plane;
            },

            getOldPlane: function () {
                return this._oldPlane;
            },

            dragStart: function () {
                if (this.options.control.shadowLayer) {
                    this.options.control.shadowLayer.addTo(this._map);
                }
                let dragStartLocation = this.getLatLng();
                this.setOldLatLng(dragStartLocation);
            },

            plant: function () {
                if (this.options.control.shadowLayer) {
                    this.options.control.shadowLayer.remove();
                }
                let oldLatLng = this.getOldLatLng();
                let oldPlane = this.getOldPlane();

                let newLatLng = this.getLatLng();
                let newPlane = this._map.getPlane();

                this.fetchFeature(newPlane, newLatLng).then(feature => {
                        if (feature) {
                            this.setOldPlane(newPlane);
                            this.setFeature(feature);
                            this.setLatLng(this.centerOnTile(newLatLng));
                            this.setOldLatLng(newLatLng);
                            this.options.control.addMessage("Placed marker at " + Math.trunc(newLatLng.lng) + ", " + Math.trunc(newLatLng.lat) + " in feature " + newPlane + "_" + feature);
                            this.options.control.updatePath();
                        } else {
                            this.options.control.addMessage("That tile cannot be walked on.");
							this.setPlane(oldPlane);
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
});
