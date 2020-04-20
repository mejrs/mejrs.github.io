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
    L.Control.Position = L.Control.extend({
        options: {
            position: 'topleft',
            separator: '_',
            emptyString: 'Unavailable',
            prefix: "",
			flyDuration: 3, //seconds
			

        },

        initialize: function (options) {
            L.setOptions(this, options);
            this._map = null;

        },
		
					
		onAdd: function (map) {
            this._map = map;
           

            this.rect = L.rectangle([[0, 0], [1, 1]], {
                    color: "#ff7800",
                    weight: 1,
					zIndexOffset: -1000
                }).addTo(map);
            this._container = L.DomUtil.create('div', 'leaflet-control-mouseposition');
            L.DomEvent.disableClickPropagation(this._container);
            L.DomEvent.on(this._container, 'click', this._onSelect, this);
            L.DomUtil.disableTextSelection();

            this._map.on('mousemove', this._updateContainerPointCache, this);
			this._map.on('move moveend zoom zoomend resize', this.redrawRect, this);

            this._container.innerHTML = this.options.emptyString;
            
            return this._container;
        },
		
		

        onRemove: function (map) {
            map.off('mousemove', this._update);
            this.rect.remove();
           
        },

        convert: function (_plane, _globalX, _globalY) {
            return {
                plane: _plane,
                i: _globalX >> 6,
                j: _globalY >> 6,
                x: _globalX & 0x3F,
                y: _globalY & 0x3F,
            }
        },

        deConvert: function (_plane, _i, _j, _x, _y) {
            return {
                plane: _plane,
                globalX: _i << 6 | _x,
                globalY: _j << 6 | _y
            }
        },

        interpret: function (input) {
            let numbers = input.match(/\d+/g).map(Number);
            if (numbers.length >= 2) {
                numbers.push(0, 0, 0);
                if (!(numbers[0]in[0, 1, 2, 3])) {
                    numbers.unshift(this._map.getPlane());
                }
                if (numbers[1] > 100 || numbers[2] > 200) {
                    return {
                        plane: numbers[0],
                        globalX: numbers[1],
                        globalY: numbers[2]
                    }
                } else {
                    return {
                        plane: numbers[0],
                        globalX: numbers[1] << 6 | numbers[3],
                        globalY: numbers[2] << 6 | numbers[4]
                    }

                }

            }
            return undefined;
        },

        _onSelect: function (e) {
            var str = prompt("Go to:");
            if (str !== null) {
                this._panMap(e, str);
            }
        },
        _panMap: function (e, input) {
            let destination = this.interpret(input);
            if (this.validateCoordinate(destination)) {
                this._map.setPlane(destination.plane);
                this._map.flyTo([destination.globalY, destination.globalX], 3, {
                    duration: this.options.flyDuration,
					animate: false,
                });
                this._map.once('moveend', function () {
                    this.fire("panend");
                });
            } else {
                console.error(input, "was parsed as", this.createString(destination), "which is not a valid coordinate.");
            }

        },
		
		validateCoordinate: function (destination){
			return destination && destination.plane < 4 && this._map.options.maxBounds.contains(L.latLng(destination.globalY,destination.globalX)) ;
		},

        createString: function (...args) {
            if (typeof args[0] === "number") {
                return args.join(this.options.separator);
            }
            if (typeof args[0] === "object") {
                let coord = args[0];
                return [coord.plane, coord.i, coord.j, coord.x, coord.y, coord.globalX, coord.globalY].filter(item => item !== undefined).join(this.options.separator);
            }
        },
		_containerPointCache: {x:0,y:0},

        _updateContainerPointCache: function (e) {
			this._containerPointCache = e.containerPoint;
			this.redrawRect();

        },
		redrawRect: function(){
			let position = this._map.containerPointToLatLng(this._containerPointCache);
			this.globalX = parseInt(position.lng);
            this.globalY = parseInt(position.lat);
            let jCoord = this.createString(this.convert(this._map._plane, this.globalX, this.globalY));
            let pxyCoord = this.createString(this._map._plane, this.globalX, this.globalY);
            this._container.innerHTML = jCoord + "<br>" + pxyCoord;
            this.rect.setBounds([[this.globalY, this.globalX], [this.globalY + 1, this.globalX + 1]])
			
		}

    });


    L.Map.addInitHook(function () {
        if (this.options.positionControl) {
            this.positionControl = new L.Control.Position(this.options.positionControl);
            this.addControl(this.positionControl)
        }

    });

   L.control.position = function (options) {
    return new L.Control.Position(options);
};
});
