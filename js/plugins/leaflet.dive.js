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
    L.Dive = L.Marker.extend({
            options: {
                ...L.Marker.prototype.options,
                ...{
                    draggable: true
                }
            },
            initialize: function (latlng, options) {
                return L.Marker.prototype.initialize.call(this, latlng, options);
            },

            onAdd: function (map) {

                if (this._latlng === undefined || typeof this._latlng === "undefined") {
                    this._latlng = map.getCenter();
                }
                this._latlng = this.centerOnTile(this._latlng);
                this.on("dragstart", this.dragStart, this);
                this.on("dragend", this.plant, this);

                if (this.options.shadowTileUrl) {
                    this.shadowLayer = L.tileLayer.main(this.options.shadowTileUrl, {
                            source: 'shadow_squares',
                            minZoom: -4,
                            maxNativeZoom: 2,
                            maxZoom: 5,
                            errorTileUrl: this.options.shadowErrorTileUrl,
                        });
                }

                L.Marker.prototype.onAdd.call(this, map)
            },

            onRemove: function (map) {
                return L.Marker.prototype.onRemove.call(this, map);
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
                //trivial collisions don't have a data file, this is expected to happen
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
                if (this.shadowLayer) {
                    this.shadowLayer.addTo(this._map);
                }
                let dragStartLocation = this.getLatLng();
                this.setOldLatLng(dragStartLocation);
            },

            plant: function (e) {
                if (this.shadowLayer) {
                    this.shadowLayer.remove();
                }
                let oldLatLng = this.getOldLatLng();
                let oldPlane = this.getOldPlane();

                let newLatLng = this.getLatLng();
                let newPlane = this._map.getPlane();

                let feature = this.fetchFeature(newPlane, newLatLng).then(feature => {
                        if (feature) {
                            this.setOldPlane(newPlane);
                            this.setFeature(feature);
                            this.setLatLng(this.centerOnTile(newLatLng));
                            this.setOldLatLng(newLatLng);
                            this._map.addMessage("Placed marker at " + Math.trunc(newLatLng.lng) + ", " + Math.trunc(newLatLng.lat) + " in feature " + newPlane + "_" + feature);
                            this._updateDives(newPlane, Math.trunc(newLatLng.lng), Math.trunc(newLatLng.lat), feature)
                        } else {
                            this._map.addMessage("That tile cannot be walked on.");
                            this.setLatLng(oldLatLng);
                        }
                    });
            },

            _updateDives: async function (plane, x, y, feature) {
				await this.instantiateWasmModule();
				if (this.dives){
					this.dives.forEach(dive => dive.remove());
				}
                let dive_locations = await this.options.dive(plane, x, y, feature);
				this.dives = dive_locations
					.map(dive => L.latLngBounds([[dive.y,dive.x],[dive.y + 1,dive.x + 1]]))
					.map(dive_bound => L.rectangle(dive_bound,{color: "#ff7800", weight: 1,fillOpacity:0.8}))

				this.dives.forEach(dive => dive.addTo(this._map));
				
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
            instantiateWasmModule: function () {
                if (this.initDone) {
                    return Promise.resolve();
                } else if (this.options.init) {
                    return this.options.init().then(_ => {
                        this.initDone = true;
                    });
                } else {
                    throw new Error("No wasm module initialization function was given.");
                }
            },

            initDone: false,

        });

    L.dive = function (...args) {
        return new L.Dive(...args);
    };
});
