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
            range.setAttribute("type", "range");
            range.setAttribute("name", "Era");

            fetch(map.options.era_structure)
                .then((res) => res.json())

                .then((era_structure) => {
                    range.setAttribute("min", 0);
                    range.setAttribute("max", era_structure.length - 1);

                    let initial_era = map._era;
                    let initialSliderPos = era_structure.findIndex((elem) => elem.key === initial_era);

                    if (initialSliderPos !== -1) {
                        range.setAttribute("value", initialSliderPos);
                        let attr = map.attributionControl;
                        let sources = era_structure[initialSliderPos].sources;
                        if (attr && sources){
                           
                            for (const source of sources) {
                                attr.addAttribution(source);
                            }
                        }
                    } else {
                        console.error(`Initial era "${initial_era}" not found in "${structure_url}"`);
                    }

                    //map.era_structure = era_structure;

                    range.addEventListener("change", (e) => {
                        let index = e.target.valueAsNumber;
                        this._map.setEra(era_structure[index]);
                    });

                    range.addEventListener("mouseover", (e) => {
                        e.target.focus();
                    });
                })                .catch(console.error);

            this._messageContainer = L.DomUtil.create("div", "leaflet-control-era-container");
            L.DomEvent.disableClickPropagation(this._messageContainer);
            L.DomEvent.disableScrollPropagation(this._messageContainer);

            this._messageContainer.appendChild(range);
            return this._messageContainer;
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
