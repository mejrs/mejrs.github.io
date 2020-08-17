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
            },
            onAdd: function (map) {
                this.on("drag", this.onDragEnd.bind(this));
                return L.Marker.prototype.onAdd.call(this, map);
            },
            onDragEnd: function (e) {
                this.centerOnTile();
                this.options.owner.update(this);
            },

            centerOnTile: function () {
                let latlng = this.getLatLng();
                let newLat = Math.trunc(latlng.lat) + 0.5;
                let newLng = Math.trunc(latlng.lng) + 0.5;
                let newLatLng = L.latLng(newLat, newLng);
                this.setLatLng(newLatLng);

            },

        });

    L.DraggableSquare = L.Rectangle.extend({
            onAdd: function (map) {
                let bounds = this._bounds;
                // do not change order, important
                this.vertices = [bounds.getSouthWest(), bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthEast()].map(this.createVertex.bind(this));
                this.vertices.forEach(vertex => vertex.addTo(map));

                return L.Rectangle.prototype.onAdd.call(this, map);
            },
            vertices: undefined,

            createVertex: function (latlng) {
                return new Vertex(latlng, this)
            },

            update: function (changedVertex) {
                let i = (this.vertices.indexOf(changedVertex) + 2) & 0x3;
                let oppositeVertex = this.vertices[i];
                let otherVertices = this.vertices.filter(vertex => vertex !== oppositeVertex && vertex !== changedVertex);

                let corner1 = oppositeVertex.getLatLng();
                let corner2 = changedVertex.getLatLng();
                let sgnLat = Math.sign(corner2.lat - corner1.lat);
                let sgnLng = Math.sign(corner2.lng - corner1.lng);

                let diameter = Math.min(Math.abs(corner2.lat - corner1.lat), Math.abs(corner2.lng - corner1.lng));
                let newCorner2 = L.latLng(corner1.lat + sgnLat * diameter, corner1.lng + sgnLng * diameter);

                let newBounds = L.latLngBounds([corner1, newCorner2]);
                this.setBounds(newBounds);

                changedVertex.setLatLng(newCorner2);
                let newLatLng1 = L.latLng(corner1.lat, newCorner2.lng);
                otherVertices[0].setLatLng(newLatLng1);

                let newLatLng2 = L.latLng(newCorner2.lat, corner1.lng);
                otherVertices[1].setLatLng(newLatLng2);

            },
        });

    L.draggableSquare = function (bounds, options) {
        return new L.DraggableSquare(bounds, options);
    }

    let DraggableMarker = L.Marker.extend({
            initialize: function (latlng) {
                L.Util.setOptions(this, {
                    draggable: true
                });
                this._latlng = L.latLng(latlng);
            },
            onAdd: function (map) {
                return L.Marker.prototype.onAdd.call(this, map);
            },
        });

    L.Control.Display.Template = L.Control.Display.extend({
            options: {
                position: 'bottomleft',
                title: 'Template',
                icon: '../mejrs.github.io/images/favicon_skavid_map.png',
            },
            createInterface: function () {
                let parsedUrl = new URL(window.location.href);
                let objectName = parsedUrl.searchParams.get('object') || '';
                let objectId = parsedUrl.searchParams.get('objectid');

                let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');

                let objectForm = L.DomUtil.create('form', 'leaflet-control-display-form', container);

                let mapDescription = L.DomUtil.create('label', 'leaflet-control-display-label', objectForm);
                mapDescription.innerHTML = "Load map type";
                let nameInput = L.DomUtil.create('select', 'leaflet-control-display-input', objectForm);

                let resultLabel = L.DomUtil.create('label', 'leaflet-control-display-label', objectForm);
                resultLabel.innerHTML = "Result";
                let result = L.DomUtil.create('textarea', 'leaflet-control-display-input', objectForm);
                result.setAttribute('name', 'id');

                for (const key of Object.keys(this.maptypes)) {
                    nameInput.options[nameInput.options.length] = new Option(key, key);
                }

                let mapchange = e => void this.maptypechange.bind(this)(e, this.maptypes, result)
                    nameInput.addEventListener("change", mapchange);

                return container;
            },

            maptypes: {
                "None": "",
                "NPC Map": "{{NPC map|npcname=undefined|npcid=undefined|mapId={m}|plane={p}|x={x}|y={x}|caption=undefined}}",
                "Monster Map": "{{Monster map|npcname=undefined|npcid=undefined|mapId={m}|plane={p}|x={x}|y={x}|caption=undefined}}",

            },

            mapItems: {
                "None": [],
                "NPC Map": [{
                        name: "marker",
                        constructor: L.Marker,
                        args: {},
                        ownMethods: {
                            x: m => m.getLatLng().lat,
                            y: m => m.getLatLng().lng
                        }
                    }
                ],
                "Monster Map": [{
                        name: "rectangle",
                        constructor: L.DraggableRectangle,
                        args: {
                            draggable: true
                        },
                        ownMethods: {
                            x: rect => rect.getCenter().lat,
                            y: rect => rect.getCenter().lng,
                            r: rect => {
                                let bounds = rect.getBounds();
                                return bounds.getWest() - bounds.getCenter;
                            }
                        }
                    }
                ],

            },

            activeMapItems: [],

            maptypechange: function (event, maptypes, resultElement) {
                this.activeMapItems.forEach(item => item.remove());

                let opt = maptypes[event.srcElement.value];
                console.log(opt);
                resultElement.innerHTML = opt;

            },

            updateResult: function () {},

            updateMapItems: function () {},

            dataFactory: function (map, items) {

                let methods = {
                    m: map.getMapId,
                    p: map.getPlane
                };

                let handler = {
                    get: function (target, key, receiver) {
                        if (key in methods) {
                            return methods[key]()
                        } else {

                            return undefined
                        }
                    }
                }
                return new Proxy({}, handler)
            },

        });

    L.control.display.template = function (options) {
        return new L.Control.Display.Template(options);
    }

    L.Map.addInitHook(function () {
        if (this.options.template) {
            this.template = L.control.display.template();
            this.addControl(this.template)
        }

    });
});
