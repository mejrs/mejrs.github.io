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
    L.Control.MapTemplate = L.Control.extend({
            options: {
                position: 'topleft',
                id: 'maptemplate',
                title: '',
                description: "Press CTRL-C to copy map template syntax using any combination of the variables {x},{y},{plane},{zoom},{mapId}",
                default_value: '{{NPC map|x={x}|y={y}|plane={plane}|mapId={mapId}}}',
                classes: 'leaflet-control-maptemplate',
                content: ['<input type="text" class="inputelement" id="mapsyntax" value="', '">'],
                style: {},
                datas: {},
                events: {},

            },

            initialize: function (options) {
                L.setOptions(this, options);
            },

            container: null,
            onAdd: function (map) {
                this._map = map;
                let parsedUrl = new URL(window.location.href);
                this.options.default_value = parsedUrl.searchParams.get('syntax') || this.options.default_value;

                this.container = L.DomUtil.create('div');
                this.container.id = this.options.id;
                this.container.title = this.options.title;
                this.container.className = this.options.classes;
                this.container.innerHTML = this.options.description + '<br>' + this.options.content[0] + this.options.default_value + this.options.content[1];

                /* Prevent click events propagation to map */
                L.DomEvent.disableClickPropagation(this.container);

                /* Prevent right click event propagation to map */
                L.DomEvent.on(this.container, 'contextmenu', function (ev) {
                    L.DomEvent.stopPropagation(ev);
                });

                /* Prevent scroll events propagation to map when cursor on the div */
                L.DomEvent.disableScrollPropagation(this.container);

                for (var event in this.options.events) {
                    L.DomEvent.on(this.container, event, this.options.events[event], this.container);
                }

                map.on('mousemove', this._onMouseMove, this);
                map.addEventListener('keydown', this._trigger, this);

                return this.container;
            },
            globalX: undefined,
            globalY: undefined,

            _trigger: function (e) {

                var key = e.originalEvent.which || e.originalEvent.keyCode; // keyCode detection

                var ctrl = e.originalEvent.ctrlKey ? e.originalEvent.ctrlKey : ((key === 17) ? true : false); // ctrl detection

                if (key == 67 && ctrl) {
                    let mapsyntax = document.getElementById('mapsyntax').value;
                    this._getMapTemplate({
                        mapId: this._map._mapId,
                        plane: this._map._plane || 0,
                        zoom: this._map.getZoom(),
                        syntax: mapsyntax

                    })
                }

            },

            _onMouseMove: function (e) {
                this.globalX = parseInt(e.latlng.lng);
                this.globalY = parseInt(e.latlng.lat);

            },

            _getMapTemplate: function (e) {
                var output = L.Util.template(e.syntax, {
                        x: this.globalX,
                        y: this.globalY,
                        plane: e.plane,
                        mapId: e.mapId,
                        zoom: e.zoom
                    });
                navigator.clipboard.writeText(output).then(function () {
                    console.log("successfully copied " + output);
                }, function () {
                    console.log("copy failed");
                });
            },

            onRemove: function (map) {
                for (var event in this.options.events) {
                    L.DomEvent.off(this.container, event, this.options.events[event], this.container);
                }
            },
        });
    L.Map.addInitHook(function () {
        if (this.options.templateControl) {
            this.templateControl = new L.Control.MapTemplate(this.options.templateControl);
            this.addControl(this.templateControl)
        }

    });

    L.control.mapTemplate = function (options) {
        return new L.Control.MapTemplate(options);
    };

});
