'use strict';
L.Navigator = L.Control.extend({
        options: {
            position: 'bottomright',
            emptyString: 'Unavailable',
            prefix: "",
            startCoordinate: L.latLng(2338, 5431),
            endCoordinate: L.latLng(2376, 5200),

        },

        initialize: function (options) {

            L.setOptions(this, options);
            this.options.startCoordinate = this.centerOnTile.apply(this.options.startCoordinate);
            this.options.endCoordinate = this.centerOnTile.apply(this.options.endCoordinate);
            this._map = null;

        },

        onAdd: function (map) {
            this._map = map;
            this.initMarkers(map);
			this.drawPath();
            this.greyed = L.tileLayer.main('layers/{source}/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
                    source: 'pathfinding_squares',
                    minZoom: 0,
                    maxNativeZoom: 2,
                    maxZoom: 4,
                    errorTileUrl: 'layers/grey_pixel.png'

                });

            this._container = L.DomUtil.create('div', 'leaflet-control-navigator');
            this._container.innerHTML = this.options.emptyString;

            return this._container;
        },

        dataCache: {},

        getOldLatLng: function () {
            return this._oldLatLng;
        },
        setOldLatLng: function (latLng) {
            this._oldLatLng = latLng;
        },

        initMarkers: function (map) {

            this.startMarker = L.marker(this.options.startCoordinate, {
                    icon: L.navigatorIcon({}),
                    draggable: true
                }).bindPopup("I'm the start").addTo(map);

            this.startMarker.on('dragstart', this.dragStart, this.startMarker);
            this.startMarker.on('dragend', this.dragEnd, this.startMarker);
            this.startMarker.control = this;
            Reflect.apply(this.setOldLatLng, this.startMarker, this.options.startCoordinate);

            this.endMarker = L.marker(this.options.endCoordinate, {
                    icon: L.navigatorIcon({}),
                    draggable: true
                }).bindPopup("I'm the end").addTo(map);
            this.endMarker.on('dragstart', this.dragStart, this.endMarker);
            this.endMarker.on('dragend', this.dragEnd, this.endMarker);
            this.endMarker.control = this;
            Reflect.apply(this.setOldLatLng, this.endMarker, this.options.endCoordinate);

        },

        dragStart: function (e) {
            let dragStartLocation = this.control.quantize.apply(e.target.getLatLng());
            Reflect.apply(this.control.setOldLatLng, this, [dragStartLocation]);
            this.control.greyed.addTo(this.control._map);

        },

        dragEnd: function (e) {
            this.control.greyed.remove();

            let newLatLng = this.control.quantize.apply(e.target.getLatLng());

            if (newLatLng.equals(this._oldLatLng)) {
                return
            };

            //feature is a Promise returning the feature number of the tile at newLatLng
            let featurePromise = Reflect.apply(this.control.getFeature, this.control, [newLatLng])
                .then(feature => feature ? feature : -1)
                .catch(_ => -1)
                .then(feature => Reflect.apply(this.control.doStuffWithFeature, this, [feature, newLatLng])); //this.control.doStuffWithFeature(feature, newLatLng));


        },

        doStuffWithFeature: function (feature, newLatLng) {
            if (feature === 0) {
                //should not be possible
                throw new Error("Malformed feature " + feature + " at " + newLatLng.lng + ", " + newLatLng.lat)
            }
            if (feature > 0) {
                this.setLatLng(this.control.centerOnTile.apply(newLatLng));
                this.control.drawPath();
            } else {
                let[otherFeature, otherNewLatLng] = Reflect.apply(this.control.findOtherFeature, this.control, [feature, newLatLng]);
                if (otherFeature) {
                    console.log("snapped to", otherFeature, otherNewLatLng);
                    this.setLatLng(this.control.centerOnTile.apply(otherNewLatLng));
                    this.control.drawPath();
                } else {
                    this.setLatLng(this.control.centerOnTile.apply(Reflect.apply(this.control.getOldLatLng, this, [])));
                };
            }
        },

        findOtherFeature: function (feature, newLatLng) {
            let key = this._generateDataKey(newLatLng);
            let localX = newLatLng.lng & 0x3F;
            let localY = newLatLng.lat & 0x3F;
            let data = this.dataCache[key];

            let iterator = [{
                    x: 0,
                    y: 1
                }, {
                    x: 1,
                    y: 0
                }, {
                    x: -1,
                    y: 0
                }, {
                    x: 0,
                    y: -1
                }, {
                    x: -1,
                    y: 1
                }, {
                    x: 1,
                    y: -1
                }, {
                    x: 1,
                    y: 1
                }, {
                    x: -1,
                    y: -1
                }
            ];

            let snap = iterator.find(clip => {
                    let x = localX + clip.x;
                    let y = localY + clip.y;
                    return 0 <= x && x <= 63 && 0 <= y && y <= 63 && data[x][y].f;
                }) || {
                x: 0,
                y: 0
            };

            let newFeature = data[localX + snap.x][localY + snap.y].f;
            console.log(newFeature);

            return [newFeature, L.latLng(newLatLng.lat + snap.y, newLatLng.lng + snap.x)];
        },

        quantize: function () {
            let lat = Math.floor(this.lat);
            let lng = Math.floor(this.lng);
            return L.latLng(lat, lng);
        },

        centerOnTile: function () {
            let lat = Math.floor(this.lat) + 0.5;
            let lng = Math.floor(this.lng) + 0.5;
            return L.latLng(lat, lng);
        },
        getFeature: function (latLng) {
            let key = this._generateDataKey(latLng);
            let localX = latLng.lng & 0x3F;
            let localY = latLng.lat & 0x3F;
            if (key in this.dataCache) {
                return Promise.resolve(this.dataCache[key][localX][localY].f);
            }

            //returns the feature number of tile at that location
            else {
                return fetch(`data/collisions/-1/${key}.json`)
                .then(response => response.json())
                .then(data => {
                    this.dataCache[key] = data;
                    return data[localX][localY].f;
                });
            }
        },

        _generateDataKey: function (...args) {
            args = args.flat();

            //args is a sequence of integers
            if (args.every(element => Number.isInteger(element))) {
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

        drawPath: function () {
            let start = this.startMarker.getLatLng();
            let end = this.endMarker.getLatLng();
            if (this.path) {
                this.path.remove()
            };
            this.path = L.polyline([start, end], {
                    color: 'red'
                }).addTo(this._map);
        }

    });

L.navigator = function (options) {
    return new L.Navigator(options);
}

L.NavigatorIcon = L.Icon.extend({

        options: {
            iconUrl: 'images/marker-icon.png',
            iconRetinaUrl: 'images/marker-icon-2x.png',
            shadowUrl: 'images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            tooltipAnchor: [16, -28],
            shadowSize: [41, 41]
        }
    });

L.navigatorIcon = function (options) {
    return new L.NavigatorIcon(options);
}
