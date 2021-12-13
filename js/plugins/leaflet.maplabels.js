import "../leaflet.js";

export default void (function (factory) {
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
    let MaplabelGroup = L.LayerGroup.extend({
        initialize: function (options) {
            L.LayerGroup.prototype.initialize.call(this, {}, options);
        },

        onAdd: function (map) {
            let url = `https://sheets.googleapis.com/v4/spreadsheets/${this.options.SHEET_ID}/values/A:Z?key=${this.options.API_KEY}`;
            fetch(url)
                .then((res) => res.json())
                .then((sheet) => {
                    let markers = this.parse_sheet(sheet);
                    let marker_iter = markers[Symbol.iterator]();
                    for (const marker of marker_iter) {
                        this.addLayer(marker);
                    }
                });
            L.LayerGroup.prototype.eachLayer.call(this, map.addLayer, map);
        },

        onRemove: function (map) {
            L.LayerGroup.prototype.eachLayer.call(this, map.removeLayer, map);
        },

        parse_sheet: function (sheet) {
            return sheet.values.map((row) => this.create_textlabel(...row));
        },

        create_textlabel: function (x, y, plane, description) {
            let text = document.createTextNode(description);
            let html = document.createElement("div");
            html.appendChild(text);

            let divicon = L.divIcon({
                html: html,
                iconSize: null, // I love gross hacks! necessary to not make the text 12x12px
                className: "map-label",
            });

            let marker = L.marker([Number(y), Number(x)], {
                icon: divicon,
                className: "map-label-container",
            });

            return marker;
        },
    });

    L.maplabelGroup = function (options) {
        return new MaplabelGroup(options);
    };
});
