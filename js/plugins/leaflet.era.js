import "../leaflet.js";

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
    L.Control.EraSelector = L.Control.extend({
        options: {
            position: "bottomcenter",
            id: "eraselector",
            title: "",
            classes: "leaflet-control-eraselector",
        },
        _container: null,

        onAdd: function (map) {
            this._map = map;


            let range = L.DomUtil.create("input", "leaflet-control-era-range");
            L.DomEvent.disableClickPropagation(range);
            range.setAttribute('type', 'range');
            range.setAttribute('name', 'Era');

            fetch("data/era_structure.json").then (res => res.json()).then(era_structure => {
                range.setAttribute('min', 0);
                range.setAttribute('max', era_structure.length - 1);
                range.addEventListener('change', (e)=> {
                    let index = e.target.valueAsNumber;
                    let newEra = era_structure[index].key;
                    this._map.setEra(newEra);
                });
            
            });

            this._messageContainer = L.DomUtil.create('div', 'leaflet-control-era-container');
            L.DomEvent.disableClickPropagation(this._messageContainer);
            L.DomEvent.disableScrollPropagation(this._messageContainer);
            
            this._messageContainer.appendChild(range);
            return this._messageContainer
        },

        onRemove: function (map) {
            //remove
        },
    });

    L.Map.addInitHook(function () {
        if (this.options.era_structure) {
            this.eraSelectorControl = new L.control.eraSelector(this.options.eraSelectorControl);
            this.addControl(this.eraSelectorControl);
        }
    });

    L.control.eraSelector = function (options) {
        return new L.Control.EraSelector(options);
    };
});
