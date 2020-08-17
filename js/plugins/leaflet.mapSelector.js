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
    L.Control.MapSelector = L.Control.extend({
        options: {

            position: 'topleft',
            id: 'mapselector',
            title: '',
            classes: 'leaflet-control-mapselector',
            description: {
                innerHTML: 'Enter mapId from -1 to 719'
            },

            input: {
                type: "number",
                min: -1,
                placeholder: -1,
                value: -1,
            }

        },
        _container: null,

        setMapId: function (e) {
			let mapId = parseInt(e.target.value)
			this._map.setMapId(mapId);
			
			
        },

        createElement: function (tag, attributes, className, container, eventfnpairs) {
            let htmlElement = L.DomUtil.create(tag, className, container);

            for (const[property, value]of Object.entries(attributes)) {
                htmlElement[property] = value;
            }

            if (eventfnpairs !== undefined) {
                for (const[event, fn]of Object.entries(eventfnpairs)) {
                    L.DomEvent
                    .disableClickPropagation(htmlElement)
                    .on(htmlElement, event, fn, this)
                    .on(htmlElement, event, this._refocusOnMap, this)
                }
            }
            return htmlElement;
        },

        onAdd: function (map) {
            this._map = map;

            

            this._container = L.DomUtil.create('div', this.options.classes);
            this._container.id = this.options.id;

            this._description = this.createElement('label', this.options.description, '', this._container);
            this._br = this.createElement('br', {}, '', this._container);
            this._input = this.createElement('input', this.options.input, '', this._container, {
                    input: this.setMapId
                });

            /* Prevent click events propagation to map */
            L.DomEvent.disableClickPropagation(this._container);

            /* Prevent right click event propagation to map */
            L.DomEvent.on(this._container, 'contextmenu', function (ev) {
                L.DomEvent.stopPropagation(ev);
            });

            /* Prevent scroll events propagation to map when cursor on the div */
            L.DomEvent.disableScrollPropagation(this._container);

            return this._container;
        },

        onRemove: function (map) {
            //remove
        },
    });
	
	 L.Map.addInitHook(function() {
        if (this.options.mapSelectorControl) {
            this.mapSelectorControl = new L.Control.MapSelector(this.options.mapSelectorControl);
            this.addControl(this.mapSelectorControl)
        }
       
    });

    L.control.mapSelector = function (options) {
    return new L.Control.MapSelector(options);
};

});
