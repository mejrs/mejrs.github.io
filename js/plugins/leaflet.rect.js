import "../leaflet.js";
import "./leaflet.displays.js"

export default void function (factory) {
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
}
(function (L) {

    let VertexIcon = L.DivIcon.extend({
            options: {
                iconSize: new L.Point(8, 8)
            }

        });

    let Vertex = L.Marker.extend({
            initialize: function (latlng, owner) {
                L.Util.setOptions(this, {
                    draggable: true,
                    icon: new VertexIcon,
                    owner: owner
                });
                this._latlng = L.latLng(latlng);
                this.trunc();
            },

            onAdd: function (map) {
                this.on("drag", this.onDragEnd.bind(this));
                return L.Marker.prototype.onAdd.call(this, map);
            },

            onDragEnd: function () {
                this.trunc();
                this.options.owner.update(this);
            },

            trunc: function () {
                let latlng = this.getLatLng();
                let newLat = Math.trunc(latlng.lat);
                let newLng = Math.trunc(latlng.lng);
                let newLatLng = L.latLng(newLat, newLng);
                this.setLatLng(newLatLng);
                return this
            },
        });

    L.DraggableSquare = L.Rectangle.extend({
            initialize: function (latLngBounds, options) {
                let bounds = L.latLngBounds(latLngBounds);
                // do not change order, important
                this.vertices = [bounds.getSouthWest(), bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthEast()].map(this.createVertex.bind(this));
                return L.Rectangle.prototype.initialize.call(this, bounds, options);
            },

            onAdd: function (map) {


                this.vertices.forEach(v => v.trunc().addTo(map));

                L.Rectangle.prototype.onAdd.call(this, map);
                this.options.owner.update(this.getBounds());

            },

            createVertex: function (latlng) {
                return new Vertex(latlng, this);
            },

            update: function (changedVertex) {
                let i = (this.vertices.indexOf(changedVertex) + 2) & 0x3;
                let oppositeVertex = this.vertices[i];
                let otherVertices = this.vertices.filter(vertex => vertex !== oppositeVertex && vertex !== changedVertex);

                let corner1 = oppositeVertex.getLatLng();
                let corner2 = changedVertex.getLatLng();
                let newBounds = L.latLngBounds([corner1, corner2]);
                this.setRectBounds(newBounds);

                let newLatLng1 = L.latLng(corner1.lat, corner2.lng);
                otherVertices[0].setLatLng(newLatLng1);

                let newLatLng2 = L.latLng(corner2.lat, corner1.lng);
                otherVertices[1].setLatLng(newLatLng2);

                this.options.owner.update(newBounds);

            },

            setRectBounds: function (bounds) {
                return L.Rectangle.prototype.setBounds.call(this, bounds);
            },

            setBounds: function (bounds) {
                let positions = [bounds.getSouthWest(), bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthEast()]
                this.vertices.forEach((v, i) => v.setLatLng(positions[i]).trunc());
                bounds = L.latLngBounds(this.vertices.map(v => v.getLatLng()));
                this.setRectBounds(bounds);
            },

            remove: function () {
                this.vertices.forEach(v => v.remove());
                return L.Rectangle.prototype.remove.call(this);
            }
        });

    L.draggableSquare = function (bounds, options) {
        return new L.DraggableSquare(bounds, options);
    };

    L.Control.Display.Rect = L.Control.Display.extend({
            onAdd: function (map) {
                this.rect = L.draggableSquare([[3232, 3200], [3200, 3232]], {
                        owner: this
                    });
					

                return L.Control.Display.prototype.onAdd.call(this, map);
            },

            options: {
                position: 'bottomleft',
                title: 'Dimensions:',
				icon: 'images/Blue_square_(Prisoner_of_Glouphrie).png'
            },

            createInterface: function () {

                let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');
                let rectForm = L.DomUtil.create('form', 'leaflet-control-display-form', container);

                let widthLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				widthLabel.innerHTML = "Width";
                this.width = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.width.setAttribute('type', 'number');
				this.width.setAttribute('name', 'width');

                let heightLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				heightLabel.innerHTML = "Height";
                this.height = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.height.setAttribute('type', 'number');
				this.height.setAttribute('name', 'height');

                let areaLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				areaLabel.innerHTML = "Area";
                this.area = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.area.setAttribute('type', 'number');
				this.area.setAttribute('name', 'area');
				this.area.setAttribute('readonly', true);

                let westLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				westLabel.innerHTML = "West";
                this.west = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.west.setAttribute('type', 'number');
				this.west.setAttribute('name', 'west');

                let eastLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				eastLabel.innerHTML = "East";
                this.east = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.east.setAttribute('type', 'number');
				this.east.setAttribute('name', 'east');

                let northLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				northLabel.innerHTML = "North";
                this.north = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.north.setAttribute('type', 'number');
				this.north.setAttribute('name', 'north');

                let southLabel = L.DomUtil.create('label', 'leaflet-control-display-label', rectForm);
				southLabel.innerHTML = "South";
                this.south = L.DomUtil.create('input', 'leaflet-control-display-input-number', rectForm);
				this.south.setAttribute('type', 'number');
				this.south.setAttribute('name', 'south');
				
				rectForm.addEventListener("change", this.changeRect.bind(this));

				
                return container;
            },
			
			changeRect: function(e){
				let [width, height, _, west, east, north, south] = Array.from(e.srcElement.parentElement.children).filter(elem => elem.nodeName == "INPUT").map(elem => elem.value);
				if (["width", "height"].includes(e.srcElement.name)){
					east = Number(west) + Number(width);
					north = Number(south) + Number(height);
				}
				let bounds = L.latLngBounds([[south,west],[north, east]]);
				this.rect.setBounds(bounds);
				this.update(bounds);
				
			},

            update: function (bounds) {
                // update control content
                let west = bounds.getWest();
                let east = bounds.getEast();
                let north = bounds.getNorth();
                let south = bounds.getSouth();
                let width = east - west;
                let height = north - south;

                this.width.value = width;
                this.height.value = height;
                this.area.value = height * width;
                this.west.value = west;
                this.east.value = east;
                this.north.value = north;
                this.south.value = south;

            },

            expand: function () {
                let bounds = this._map.getBounds().pad(-0.3);
                this.rect.setBounds(bounds);
                this.rect.addTo(this._map);
                return L.Control.Display.prototype.expand.call(this);
            },

            collapse: function () {
                this.rect.remove();
                return L.Control.Display.prototype.collapse.call(this);
            },

        });

    L.control.display.rect = function (options) {
        return new L.Control.Display.Rect(options);
    }

    L.Map.addInitHook(function () {
        if (this.options.rect) {
            this.rect = L.control.display.rect();
            this.addControl(this.rect);
        }

    });
});
